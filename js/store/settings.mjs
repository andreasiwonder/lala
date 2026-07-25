// @ts-check
/**
 * localStorage-backed app settings and small counters. Everything here is
 * synchronous, string-sized, and per-device. The Anthropic API key lives here
 * too (plaintext, origin-scoped) — see the plan's security note: this is only
 * acceptable because the app loads no third-party scripts.
 *
 * @typedef {'system' | 'light' | 'dark'} Theme
 * @typedef {'travel' | 'family' | 'daily' | 'work'} Goal
 * @typedef {'beginner' | 'a1' | 'a2' | 'b1'} Level
 *
 * @typedef {object} Settings
 * @property {boolean} onboarded
 * @property {Level} level
 * @property {Goal} goal
 * @property {number} dailyNewLimit    New cards to introduce per day.
 * @property {Theme} theme
 * @property {string | null} voiceURI  Preferred tr-TR SpeechSynthesis voice.
 * @property {string} apiKey           Anthropic API key (Phase 2). '' = unset.
 * @property {string} chatModel
 * @property {string} helperModel
 * @property {boolean} voiceMode      Hands-free voice conversation (vs typing).
 * @property {string | null} installedDeckVersion
 * @property {string | null} lastStudyDay
 * @property {number} streak
 * @property {{ day: string, count: number }} newToday
 */

const KEY = 'konus.settings.v1';

/** @type {Settings} */
const DEFAULTS = {
  onboarded: false,
  level: 'beginner',
  goal: 'daily',
  dailyNewLimit: 10,
  theme: 'system',
  voiceURI: null,
  apiKey: '',
  chatModel: 'claude-sonnet-5',
  helperModel: 'claude-haiku-4-5',
  voiceMode: true,
  installedDeckVersion: null,
  lastStudyDay: null,
  streak: 0,
  newToday: { day: '', count: 0 },
};

/** @returns {Settings} */
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

/** @param {Settings} settings */
export function save(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

/**
 * Merge a patch into stored settings and persist. Returns the new settings.
 * @param {Partial<Settings>} patch
 * @returns {Settings}
 */
export function update(patch) {
  const next = { ...load(), ...patch };
  save(next);
  return next;
}

/**
 * How many new cards remain for `day` under the daily limit.
 * @param {Settings} settings
 * @param {string} day today's `YYYY-MM-DD`
 * @returns {number}
 */
export function newRemaining(settings, day) {
  const done = settings.newToday.day === day ? settings.newToday.count : 0;
  return Math.max(0, settings.dailyNewLimit - done);
}

/**
 * Record that one new card was introduced today. Persists and returns settings.
 * @param {string} day
 * @returns {Settings}
 */
export function bumpNewToday(day) {
  const s = load();
  const count = s.newToday.day === day ? s.newToday.count + 1 : 1;
  return update({ newToday: { day, count } });
}
