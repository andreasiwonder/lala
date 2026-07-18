/* ==========================================================================
   api.js — all remote data access.
   Every source here is keyless and sends `access-control-allow-origin: *`,
   which is what lets this site run with no backend at all.
   ========================================================================== */

export const ALSTER = { lat: 53.5675, lon: 10.0, name: 'Außenalster' };
const TZ = 'Europe/Berlin';

/* Session cache. Weather models update hourly at best, so a 10-minute TTL is
   generous to the free tier without ever showing meaningfully stale data. */
const TTL_MS = 10 * 60 * 1000;

function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    return Date.now() - t < TTL_MS ? v : null;
  } catch { return null; }
}

function cacheSet(key, v) {
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); }
  catch { /* private mode / quota — caching is an optimisation, not a requirement */ }
}

async function getJSON(url, { cache = true } = {}) {
  if (cache) {
    const hit = cacheGet(url);
    if (hit) return hit;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${new URL(url).host}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.reason || 'API error');
  if (cache) cacheSet(url, json);
  return json;
}

const qs = (params) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v)}`)
    .join('&');

/* ==========================================================================
   Forecast — current, hourly, and 3-day daily
   --------------------------------------------------------------------------
   NOTE: do NOT pin `models=icon_d2`. ICON-D2 is the high-resolution German
   model but only runs ~48h — a 3-day request comes back with null for day 3
   and null for precipitation_probability at every hour. The default
   `best_match` already picks ICON-D2 for the near term and falls back to
   ICON-EU/global beyond it. Verified 2026-07-18.
   ========================================================================== */

export async function fetchForecast() {
  const url = 'https://api.open-meteo.com/v1/forecast?' + qs({
    latitude: ALSTER.lat,
    longitude: ALSTER.lon,
    current: [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
      'is_day', 'precipitation', 'weather_code', 'cloud_cover',
      'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    ],
    hourly: [
      'temperature_2m', 'precipitation_probability', 'precipitation',
      'weather_code', 'cloud_cover', 'visibility',
      'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    ],
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'sunrise', 'sunset', 'precipitation_sum', 'precipitation_probability_max',
      'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
    ],
    wind_speed_unit: 'kn',
    timezone: TZ,
    forecast_days: 3,
  });

  const d = await getJSON(url);

  /* Guard the exact failure that pinning ICON-D2 produced, so a silently
     model-swapped response surfaces as an error rather than empty tiles. */
  if (!d.daily?.time?.length) throw new Error('Forecast returned no daily data');
  if (d.daily.wind_speed_10m_max.some((v) => v === null || v === undefined)) {
    throw new Error('Forecast has gaps in daily wind — check the model parameter');
  }
  return d;
}

/* ==========================================================================
   Forecast accuracy — the Previous-Runs API
   --------------------------------------------------------------------------
   Returns, in ONE request, the current analysis ("truth") alongside what the
   forecast said 1/2/3 days earlier, already aligned on identical timestamps.
   This is why the site needs no cron job, no database, and no accumulation
   period — accuracy is computed client-side and works from day one.

   Caveat surfaced in the UI: "truth" is the model analysis, not a measurement.
   ========================================================================== */

const ACCURACY_VARS = ['wind_speed_10m', 'wind_speed_10m_previous_day1',
  'wind_speed_10m_previous_day2', 'wind_speed_10m_previous_day3'];

export async function fetchAccuracy(pastDays = 30) {
  const build = (days) => 'https://previous-runs-api.open-meteo.com/v1/forecast?' + qs({
    latitude: ALSTER.lat,
    longitude: ALSTER.lon,
    hourly: ACCURACY_VARS,
    wind_speed_unit: 'kn',
    timezone: TZ,
    past_days: days,
    forecast_days: 1,
  });

  try {
    return await getJSON(build(pastDays));
  } catch (err) {
    /* The past_days ceiling is undocumented; fall back to a window the API
       definitely accepts rather than dropping the whole panel. */
    if (pastDays > 7) return getJSON(build(7));
    throw err;
  }
}

/* ==========================================================================
   Station observations — Bright Sky (DWD)
   Nearest station is Hamburg-Fuhlsbüttel, ~7.4 km north. That is an airport in
   open terrain, not a sheltered lake, so this is a cross-check and never the
   headline number. Wind fields are 10/30/60-minute means, in km/h.
   ========================================================================== */

const KMH_TO_KN = 0.539957;

export async function fetchStation() {
  const url = 'https://api.brightsky.dev/current_weather?' + qs({
    lat: ALSTER.lat, lon: ALSTER.lon, tz: TZ,
  });
  const d = await getJSON(url);
  const w = d.weather || {};
  const src = d.sources?.[0] || {};
  return {
    station: src.station_name || 'DWD station',
    distanceKm: src.distance != null ? src.distance / 1000 : null,
    observedAt: w.timestamp || null,
    windKn: w.wind_speed_10 != null ? w.wind_speed_10 * KMH_TO_KN : null,
    gustKn: w.wind_gust_speed_10 != null ? w.wind_gust_speed_10 * KMH_TO_KN : null,
    directionDeg: w.wind_direction_10 ?? null,
    temperature: w.temperature ?? null,
    pressure: w.pressure_msl ?? null,
  };
}

/* ==========================================================================
   Rain radar — RainViewer (keyless, CORS-open)
   ========================================================================== */

export async function fetchRadarFrames() {
  const d = await getJSON('https://api.rainviewer.com/public/weather-maps.json', { cache: false });
  const past = d.radar?.past || [];
  const nowcast = d.radar?.nowcast || [];
  return {
    host: d.host,
    frames: [
      ...past.map((f) => ({ ...f, forecast: false })),
      ...nowcast.map((f) => ({ ...f, forecast: true })),
    ],
  };
}

/** RainViewer tile template. colorScheme 4 = "Universal Blue"; 1 = smooth+snow. */
export function radarTileUrl(host, framePath) {
  return `${host}${framePath}/256/{z}/{x}/{y}/4/1_1.png`;
}

/* ==========================================================================
   Wind field for the map overlay
   --------------------------------------------------------------------------
   Open-Meteo accepts comma-separated coordinate lists and returns an array of
   results, so a whole grid costs ONE request instead of gridW × gridH.
   ========================================================================== */

export async function fetchWindGrid({ west, south, east, north, cols = 8, rows = 8 }) {
  const lats = [];
  const lons = [];
  const latStep = (north - south) / (rows - 1);
  const lonStep = (east - west) / (cols - 1);

  /* Row-major, north→south — the order leaflet-velocity expects. */
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      lats.push(+(north - r * latStep).toFixed(4));
      lons.push(+(west + c * lonStep).toFixed(4));
    }
  }

  const url = 'https://api.open-meteo.com/v1/forecast?' + qs({
    latitude: lats,
    longitude: lons,
    current: ['wind_speed_10m', 'wind_direction_10m'],
    wind_speed_unit: 'ms',
    timezone: TZ,
  });

  const res = await getJSON(url);
  const points = Array.isArray(res) ? res : [res];

  /* Meteorological direction is where wind comes FROM; u/v components point
     where it goes, hence the negation. */
  const u = [], v = [];
  for (const p of points) {
    const speed = p.current?.wind_speed_10m ?? 0;
    const deg = p.current?.wind_direction_10m ?? 0;
    const rad = (deg * Math.PI) / 180;
    u.push(-speed * Math.sin(rad));
    v.push(-speed * Math.cos(rad));
  }

  const header = {
    parameterCategory: 2, parameterNumberName: 'wind',
    nx: cols, ny: rows,
    lo1: west, la1: north, lo2: east, la2: south,
    dx: lonStep, dy: latStep,
    refTime: points[0]?.current?.time || '',
  };

  return [
    { header: { ...header, parameterNumber: 2 }, data: u },
    { header: { ...header, parameterNumber: 3 }, data: v },
  ];
}

/* ==========================================================================
   Climatology — precomputed by scripts/build-climatology.mjs from the ERA5
   archive and committed, so the page costs zero API calls to render history.
   ========================================================================== */

export async function fetchClimatology() {
  return getJSON(new URL('./data/climatology.json', document.baseURI).href);
}
