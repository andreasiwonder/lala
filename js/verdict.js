/* ==========================================================================
   verdict.js — "can I sail?" for a dinghy / small keelboat on the Außenalster.
   Pure functions, no DOM: unit-tested in test/verdict.test.mjs.
   ========================================================================== */

/* Mean-wind bands, in knots. Tuned for a dinghy or small keelboat: the sweet
   spot is 8–16 kn, under 4 is drifting, over 22 is more than the lake is fun in. */
export const BANDS = [
  { max: 4,        key: 'drifting',  tone: 'neutral',  label: 'Drifting',           detail: 'Barely enough to fill a sail' },
  { max: 8,        key: 'light',     tone: 'good',     label: 'Light but sailable', detail: 'Gentle — good for a relaxed sail' },
  { max: 16,       key: 'prime',     tone: 'good',     label: 'Prime',              detail: 'The sweet spot' },
  { max: 22,       key: 'demanding', tone: 'warning',  label: 'Demanding',          detail: 'Powered up — reef and hike' },
  { max: Infinity, key: 'toomuch',   tone: 'critical', label: 'Too much',           detail: 'Beyond comfortable dinghy sailing' },
];

/* Above this ratio the breeze is puffy and shifty rather than steady. On a lake
   ringed by buildings and trees this matters more than the mean, which is why
   it can override an otherwise perfect band. */
export const GUST_FACTOR_LIMIT = 1.6;
export const GUST_ABSOLUTE_LIMIT = 28;      // kn — a gust that overpowers regardless of mean
const THUNDER_CODES = [95, 96, 99];

export function bandFor(windKn) {
  return BANDS.find((b) => windKn < b.max) ?? BANDS[BANDS.length - 1];
}

export const isThunder = (code) => THUNDER_CODES.includes(code);

const TONE_RANK = { neutral: 0, good: 1, warning: 2, serious: 3, critical: 4 };
const worst = (a, b) => (TONE_RANK[b] > TONE_RANK[a] ? b : a);

/**
 * @param {{windKn:number, gustKn?:number, weatherCode?:number}} c
 * @returns {{key:string, tone:string, label:string, detail:string,
 *            gustFactor:number|null, warnings:Array<{key:string,tone:string,text:string}>}}
 */
export function evaluate({ windKn, gustKn = null, weatherCode = null }) {
  const band = bandFor(windKn);
  const gustFactor = gustKn && windKn > 0.5 ? gustKn / windKn : null;

  let tone = band.tone;
  let label = band.label;
  let detail = band.detail;
  const warnings = [];

  /* Override 1 — gustiness. Flagged even when the mean sits in the sweet spot. */
  const gusty = gustFactor !== null && gustFactor >= GUST_FACTOR_LIMIT && windKn >= 3;
  if (gusty) {
    tone = worst(tone, 'warning');
    warnings.push({
      key: 'gusty',
      tone: 'warning',
      text: `Shifty: gusts are ${gustFactor.toFixed(1)}× the mean wind. Expect sudden puffs and big header/lift swings.`,
    });
    if (band.key === 'prime' || band.key === 'light') detail = 'Good average, but puffy';
  }

  if (gustKn !== null && gustKn >= GUST_ABSOLUTE_LIMIT) {
    tone = worst(tone, 'critical');
    warnings.push({
      key: 'gust-absolute',
      tone: 'critical',
      text: `Gusts to ${Math.round(gustKn)} kn — enough to overpower a dinghy even if the average looks manageable.`,
    });
  }

  /* Override 2 — thunderstorms trump the wind reading entirely. */
  if (isThunder(weatherCode)) {
    tone = 'critical';
    label = 'Thunderstorms';
    detail = 'Stay off the water';
    warnings.unshift({
      key: 'thunder',
      tone: 'critical',
      text: 'Thunderstorms forecast. Lightning over open water is the hazard here, not the wind — postpone.',
    });
  }

  return { key: band.key, tone, label, detail, gustFactor, warnings };
}

/* --- Presentation helpers ------------------------------------------------- */

export const TONE_VAR = {
  neutral: 'var(--ink-muted)',
  good: 'var(--good)',
  warning: 'var(--warning)',
  serious: 'var(--serious)',
  critical: 'var(--critical)',
};

/** Verdict for a whole day, from the daily maxima. */
export function evaluateDay(day) {
  return evaluate({
    windKn: day.windMax,
    gustKn: day.gustMax,
    weatherCode: day.weatherCode,
  });
}
