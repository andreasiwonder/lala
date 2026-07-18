/* ==========================================================================
   score.js — "how good is this hour for sailing?", 0–100.
   --------------------------------------------------------------------------
   Pure functions, no DOM. Unit-tested in test/score.test.mjs.

   The score starts from a wind curve (wind is what you actually came for),
   then subtracts penalties for the things that spoil an otherwise good breeze:
   gustiness, rain, cold, fog. Thunderstorms hard-cap it.

   Everything is deliberately transparent rather than a tuned black box — the
   reasons array is surfaced in the UI so a reading can always be explained.
   ========================================================================== */

/* Wind → base score. Control points are interpolated linearly. The plateau is
   8–16 kn, matching the "prime" band in verdict.js. */
const WIND_CURVE = [
  [0, 0], [2, 12], [4, 45], [6, 72], [8, 100],
  [16, 100], [18, 84], [20, 70], [22, 52], [26, 24], [30, 8], [40, 0],
];

export function windScore(kn) {
  if (!(kn >= 0)) return 0;
  const pts = WIND_CURVE;
  if (kn <= pts[0][0]) return pts[0][1];
  if (kn >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (kn >= x0 && kn <= x1) {
      const t = x1 === x0 ? 0 : (kn - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 0;
}

export const BANDS = [
  { min: 75, key: 'excellent', label: 'Excellent', tone: 'good' },
  { min: 50, key: 'fair',      label: 'Fair',      tone: 'warning' },
  { min: 25, key: 'poor',      label: 'Poor',      tone: 'serious' },
  { min: -1, key: 'bad',       label: 'Bad',       tone: 'critical' },
];

export const bandFor = (score) => BANDS.find((b) => score >= b.min);

const THUNDER = [95, 96, 99];
const FOG = [45, 48];

/**
 * @param {{windKn:number, gustKn?:number, pop?:number, tempC?:number,
 *          weatherCode?:number, isDay?:boolean}} h
 * @returns {{score:number, band:object, reasons:string[], isDay:boolean}}
 */
export function scoreHour({
  windKn, gustKn = null, pop = 0, tempC = null, weatherCode = null, isDay = true,
}) {
  let score = windScore(windKn);
  const reasons = [];

  if (score >= 90) reasons.push('ideal breeze');
  else if (windKn < 4) reasons.push('too little wind');
  else if (windKn > 22) reasons.push('overpowered');

  /* Gustiness — the Alster's signature problem, ringed by buildings. */
  if (gustKn !== null && windKn >= 3) {
    const gf = gustKn / windKn;
    if (gf >= 1.6) {
      const penalty = Math.min(20, (gf - 1.6) * 40);
      score -= penalty;
      if (penalty > 6) reasons.push('gusty and shifty');
    }
    if (gustKn >= 28) {
      score -= 15;
      reasons.push('dangerous gusts');
    }
  }

  /* Rain — a 40% chance is not half as bad as an 80% chance to a sailor
     already dressed for it, so this is sub-linear. */
  if (pop > 10) {
    const penalty = Math.pow(pop / 100, 1.3) * 28;
    score -= penalty;
    if (pop >= 60) reasons.push('likely wet');
  }

  if (tempC !== null) {
    if (tempC < 8) {
      score -= Math.min(14, (8 - tempC) * 1.6);
      if (tempC < 4) reasons.push('cold');
    }
    if (tempC > 30) score -= 4;
  }

  if (FOG.includes(weatherCode)) {
    score -= 18;
    reasons.push('fog');
  }

  /* Thunderstorms are disqualifying, not a deduction. */
  if (THUNDER.includes(weatherCode)) {
    score = Math.min(score, 5);
    reasons.length = 0;
    reasons.push('thunderstorms');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, band: bandFor(score), reasons, isDay };
}

/** Score a whole hourly series from an Open-Meteo response. */
export function scoreSeries(hourly) {
  return hourly.time.map((t, i) => ({
    time: new Date(t),
    ...scoreHour({
      windKn: hourly.wind_speed_10m[i],
      gustKn: hourly.wind_gusts_10m?.[i] ?? null,
      pop: hourly.precipitation_probability?.[i] ?? 0,
      tempC: hourly.temperature_2m?.[i] ?? null,
      weatherCode: hourly.weather_code?.[i] ?? null,
      isDay: hourly.is_day ? hourly.is_day[i] === 1 : true,
    }),
  }));
}

/**
 * Best FIXED-LENGTH daylight window in a day's scored hours.
 *
 * A "longest run above a threshold" sounds better but is useless in practice:
 * on a typical Alster day almost every hour clears the bar, so it reports
 * something like "best 06–22h", which is not advice. A fixed short window
 * answers the question people actually ask — when should I go out?
 *
 * Returns null if there aren't `length` contiguous daylight hours clearing
 * `minScore`.
 */
export function bestWindow(hours, { length = 3, minScore = 45, minHour = 35 } = {}) {
  const day = hours.filter((h) => h.isDay);
  if (day.length < length) return null;

  let best = null;
  for (let i = 0; i + length <= day.length; i++) {
    const win = day.slice(i, i + length);

    /* Reject windows straddling a gap (e.g. across sunset into the next
       morning) — they must be consecutive clock hours. */
    const contiguous = win.every((h, k) =>
      k === 0 || h.time - win[k - 1].time === 3600_000);
    if (!contiguous) continue;

    const sum = win.reduce((a, h) => a + h.score, 0);
    const avg = sum / length;
    if (avg < minScore) continue;

    /* Every hour must also clear a floor. Averaging alone would happily
       recommend 90 / 10 / 90 — a dead hour sandwiched between two good ones
       is not a window you'd actually sail. */
    if (Math.min(...win.map((h) => h.score)) < minHour) continue;

    if (!best || avg > best.avg) {
      best = {
        start: win[0].time,
        end: win[length - 1].time,
        avg,
        peak: Math.max(...win.map((h) => h.score)),
        hours: length,
      };
    }
  }
  return best;
}

/** Peak daylight score for a day — what the day-level headline shows. */
export function dayPeak(hours) {
  const day = hours.filter((h) => h.isDay);
  const pool = day.length ? day : hours;
  return pool.reduce((a, b) => (b.score > a.score ? b : a), pool[0] ?? { score: 0 });
}
