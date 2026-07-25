// @ts-check
/**
 * Local-day helpers for streaks and the daily new-card counter. The string
 * date-math is pure and timezone-independent (so it can be unit-tested);
 * only `dayKey` reads the local calendar day.
 */

/**
 * Local calendar day as `YYYY-MM-DD`.
 * @param {number} epochMs
 * @returns {string}
 */
export function dayKey(epochMs) {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Whole-day difference between two `YYYY-MM-DD` keys (b - a), computed at UTC
 * midnight so it never depends on the running timezone.
 * @param {string} aKey
 * @param {string} bKey
 * @returns {number}
 */
export function diffDays(aKey, bKey) {
  const a = Date.parse(`${aKey}T00:00:00Z`);
  const b = Date.parse(`${bKey}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * @typedef {{ lastStudyDay: string | null, streak: number }} StreakState
 */

/**
 * Fold a day of study into a streak. Same day → unchanged; consecutive day →
 * +1; any gap → reset to 1.
 * @param {StreakState} state
 * @param {string} todayKey
 * @returns {{ lastStudyDay: string, streak: number, counted: boolean }}
 */
export function advanceStreak(state, todayKey) {
  if (!state.lastStudyDay) {
    return { lastStudyDay: todayKey, streak: 1, counted: true };
  }
  if (state.lastStudyDay === todayKey) {
    return { lastStudyDay: state.lastStudyDay, streak: state.streak, counted: false };
  }
  const gap = diffDays(state.lastStudyDay, todayKey);
  return { lastStudyDay: todayKey, streak: gap === 1 ? state.streak + 1 : 1, counted: true };
}
