/* ==========================================================================
   format.js — WMO weather codes, compass points, dates, and inline icons.
   ========================================================================== */

const WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm',
};

export const describeCode = (code) => WMO[code] ?? 'Unknown';

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Meteorological degrees → 16-point compass abbreviation. */
export const compassPoint = (deg) =>
  POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

export const round = (n, d = 0) =>
  n === null || n === undefined || Number.isNaN(n) ? '–' : n.toFixed(d);

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/Berlin' });
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' });
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Berlin' });
const STAMP_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Berlin',
});

export const dayName = (d, today = new Date()) => {
  const a = new Date(d), b = new Date(today);
  const days = Math.round((a.setHours(12, 0, 0, 0) - b.setHours(12, 0, 0, 0)) / 864e5);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return DAY_FMT.format(new Date(d));
};

export const dateLabel = (d) => DATE_FMT.format(new Date(d));
export const timeLabel = (d) => TIME_FMT.format(new Date(d));
export const stampLabel = (d) => STAMP_FMT.format(new Date(d));

/* --- Icons: currentColor, sized by the CSS that mounts them --------------- */

const svg = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;

const SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/>';
const CLOUD = '<path d="M7.2 18.5h9.6a3.8 3.8 0 0 0 .5-7.6 5.6 5.6 0 0 0-10.8-1.2 3.9 3.9 0 0 0 .7 8.8Z"/>';
const PARTLY = '<circle cx="8" cy="8" r="3"/><path d="M8 2.8v1.6M2.8 8h1.6M4.4 4.4l1.1 1.1M11.6 4.4l-1.1 1.1"/><path d="M10.5 19.5h7.2a3.3 3.3 0 0 0 .3-6.6 4.8 4.8 0 0 0-9.2-1 3.4 3.4 0 0 0 1.7 7.6Z"/>';
const RAIN = CLOUD + '<path d="M9 20.5l-.8 2M13 20.5l-.8 2M17 20.5l-.8 2"/>';
const SNOW = CLOUD + '<path d="M9 21h.01M13 21h.01M17 21h.01"/>';
const FOG = '<path d="M4 9h16M4 13h16M6 17h12M7 5h10"/>';
const STORM = CLOUD + '<path d="M13 19.5l-3 3.5h3.6L11 26" stroke-width="1.6"/><path d="M13.4 19.6l-2.6 3h3.2l-1.6 2.6"/>';

export function weatherIcon(code, isDay = true) {
  if ([95, 96, 99].includes(code)) return svg(STORM);
  if ([71, 73, 75, 77, 85, 86].includes(code)) return svg(SNOW);
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return svg(RAIN);
  if ([45, 48].includes(code)) return svg(FOG);
  if (code === 3) return svg(CLOUD);
  if (code === 1 || code === 2) return svg(PARTLY);
  return isDay ? svg(SUN) : svg('<path d="M20 14.5A8.2 8.2 0 0 1 9.6 4 8.4 8.4 0 1 0 20 14.5Z"/>');
}

export const iconWarning = svg('<path d="M12 3.6 2.6 20h18.8L12 3.6Z"/><path d="M12 10v4.2M12 17.2h.01"/>');
export const iconCheck = svg('<path d="M20 6.5 9.5 17.5 4 12"/>');
export const iconInfo = svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>');
export const iconPlay = svg('<path d="M7 4.5v15l13-7.5Z" fill="currentColor"/>');
export const iconPause = svg('<path d="M8.5 5v14M15.5 5v14" stroke-width="2.2"/>');
