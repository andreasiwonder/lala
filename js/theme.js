/* ==========================================================================
   theme.js — pick the conditions-reactive theme state.
   The page mood follows the real weather and time of day; each state also
   declares which of the TWO validated card surfaces it sits on (light/dark),
   because chart marks are only colour-safe against those two.
   ========================================================================== */

export const STATES = ['dawn', 'clear', 'overcast', 'rain', 'storm', 'night'];

/* Storm and night are the dark-substrate states. */
const DARK_STATES = new Set(['storm', 'night']);

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const THUNDER_CODES = new Set([95, 96, 99]);

const TWILIGHT_MS = 60 * 60 * 1000;   // treat ±1h around sunrise/sunset as "dawn"

/**
 * @param {{weatherCode:number, isDay:boolean, cloudCover:number,
 *          now:Date, sunrise?:string, sunset?:string}} c
 */
export function pickState({ weatherCode, isDay, cloudCover = 0, now, sunrise, sunset }) {
  if (THUNDER_CODES.has(weatherCode)) return 'storm';

  const near = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Math.abs(now.getTime() - t) <= TWILIGHT_MS;
  };
  if (near(sunrise) || near(sunset)) return 'dawn';

  if (!isDay) return 'night';
  if (RAIN_CODES.has(weatherCode) || SNOW_CODES.has(weatherCode)) return 'rain';
  if (weatherCode === 3 || cloudCover > 65) return 'overcast';
  return 'clear';
}

export const modeFor = (state) => (DARK_STATES.has(state) ? 'dark' : 'light');

const CONDITION_FOR_TONE = {
  good: 'green',
  neutral: 'yellow',
  warning: 'yellow',
  serious: 'red',
  critical: 'red',
};

export const conditionForTone = (tone) => CONDITION_FOR_TONE[tone] || 'yellow';

/** Apply the verdict's pastel traffic-light background. Pastel palettes always
 * use the validated light card substrate so text and charts stay legible. */
export function applyConditionTone(tone) {
  const condition = conditionForTone(tone);
  const root = document.documentElement;
  root.dataset.condition = condition;
  root.dataset.mode = 'light';
  return condition;
}

/**
 * Apply a state to the document. `?theme=<state>` forces one, which is how the
 * six states get screenshot-tested without waiting for the weather to cooperate.
 */
export function applyState(state) {
  const forced = new URLSearchParams(location.search).get('theme');
  const final = STATES.includes(forced) ? forced : state;
  const root = document.documentElement;
  root.dataset.theme = final;
  root.dataset.mode = modeFor(final);
  return final;
}
