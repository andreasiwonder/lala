#!/usr/bin/env node
/* ==========================================================================
   build-climatology.mjs
   --------------------------------------------------------------------------
   Precomputes the "what's normal here" panel from the Open-Meteo ERA5 archive
   and writes data/climatology.json, which is committed. The page therefore
   renders its history section with zero API calls.

   Run:  node scripts/build-climatology.mjs
   CI:   .github/workflows/climatology.yml (monthly)

   Fetched one year at a time — a decade of hourly data in a single request is
   large enough to be flaky, and per-year requests retry cheaply.
   ========================================================================== */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LAT = 53.5675;
const LON = 10.0;
const TZ = 'Europe/Berlin';

const END_YEAR = new Date().getFullYear() - 1;   // last complete year
const START_YEAR = END_YEAR - 9;                 // ten full years

/* Bins deliberately match the sailing verdict bands in js/verdict.js. */
const SPEED_EDGES = [4, 8, 16, 22, Infinity];
const SAILABLE_MIN = 4;
const SAILABLE_MAX = 22;

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/climatology.json');

const dirBin = (deg) => Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
const speedBin = (kn) => SPEED_EDGES.findIndex((e) => kn < e);

const zeros = () => Array.from({ length: 16 }, () => new Array(5).fill(0));

async function fetchYear(year) {
  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    hourly: 'wind_speed_10m,wind_direction_10m,is_day',
    wind_speed_unit: 'kn',
    timezone: TZ,
  });
  const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      if (json.error) throw new Error(json.reason);
      return json.hourly;
    } catch (err) {
      if (attempt === 3) throw new Error(`${year}: ${err.message}`);
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
}

async function main() {
  console.log(`Building climatology for ${START_YEAR}–${END_YEAR}…`);

  const roseAll = zeros();
  const roseByMonth = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [i + 1, zeros()])
  );

  /* Per-month tallies for the "sailable share of daylight hours" bars. */
  const monthStats = Array.from({ length: 12 }, () => ({
    daylight: 0, sailable: 0, prime: 0, sum: 0, n: 0, calm: 0, strong: 0,
  }));

  let total = 0;

  for (let y = START_YEAR; y <= END_YEAR; y++) {
    const h = await fetchYear(y);
    const n = h.time.length;
    for (let i = 0; i < n; i++) {
      const spd = h.wind_speed_10m[i];
      const dir = h.wind_direction_10m[i];
      if (spd === null || dir === null) continue;

      const month = Number(h.time[i].slice(5, 7));
      const db = dirBin(dir);
      const sb = speedBin(spd);

      roseAll[db][sb]++;
      roseByMonth[month][db][sb]++;
      total++;

      const st = monthStats[month - 1];
      st.sum += spd;
      st.n++;
      if (spd < SAILABLE_MIN) st.calm++;
      if (spd > SAILABLE_MAX) st.strong++;

      /* is_day is 1/0; fall back to a daylight window if the field is absent. */
      const isDay = h.is_day ? h.is_day[i] === 1 : (() => {
        const hr = Number(h.time[i].slice(11, 13));
        return hr >= 8 && hr < 20;
      })();
      if (isDay) {
        st.daylight++;
        if (spd >= SAILABLE_MIN && spd <= SAILABLE_MAX) st.sailable++;
        /* The prime band is what actually discriminates between months:
           "sailable" is 80–90% year-round and says nothing, while prime
           swings from ~26% in August to ~45% in January. */
        if (spd >= 8 && spd < 16) st.prime++;
      }
    }
    console.log(`  ${y}: ${n.toLocaleString('en-GB')} hours`);
  }

  const pct = (m) => m.map((sector) => sector.map((v) => +((v / total) * 100).toFixed(3)));
  const pctMonth = (m) => {
    const t = m.flat().reduce((a, b) => a + b, 0) || 1;
    return m.map((sector) => sector.map((v) => +((v / t) * 100).toFixed(3)));
  };

  const out = {
    meta: {
      location: { lat: LAT, lon: LON, name: 'Außenalster, Hamburg' },
      years: [START_YEAR, END_YEAR],
      hours: total,
      generated: new Date().toISOString().slice(0, 10),
      source: 'Open-Meteo ERA5 reanalysis archive (CC BY 4.0)',
      speedBins: ['0–4 kn', '4–8 kn', '8–16 kn', '16–22 kn', '22+ kn'],
      note: 'Rose values are percent of hours. Sailable = 4–22 kn during daylight.',
    },
    rose: {
      all: pct(roseAll),
      byMonth: Object.fromEntries(
        Object.entries(roseByMonth).map(([m, matrix]) => [m, pctMonth(matrix)])
      ),
    },
    months: monthStats.map((st, i) => ({
      month: i + 1,
      meanWindKn: +(st.sum / st.n).toFixed(1),
      sailablePct: +((st.sailable / st.daylight) * 100).toFixed(1),
      primePct: +((st.prime / st.daylight) * 100).toFixed(1),
      calmPct: +((st.calm / st.n) * 100).toFixed(1),
      strongPct: +((st.strong / st.n) * 100).toFixed(1),
    })),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`\nWrote ${OUT}`);
  console.log(`  ${total.toLocaleString('en-GB')} hours across ${END_YEAR - START_YEAR + 1} years`);
  console.log('  prime-band share of daylight, by month:',
    out.months.map((m) => `${m.month}:${m.primePct}%`).join(' '));
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
