// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffDays, advanceStreak } from '../js/lib/day.mjs';

test('diffDays is timezone-independent whole-day math', () => {
  assert.equal(diffDays('2026-07-24', '2026-07-25'), 1);
  assert.equal(diffDays('2026-07-25', '2026-07-24'), -1);
  assert.equal(diffDays('2026-07-31', '2026-08-01'), 1); // month boundary
  assert.equal(diffDays('2026-02-28', '2026-03-01'), 1); // non-leap year
});

test('advanceStreak starts a streak on first study', () => {
  const r = advanceStreak({ lastStudyDay: null, streak: 0 }, '2026-07-24');
  assert.deepEqual(r, { lastStudyDay: '2026-07-24', streak: 1, counted: true });
});

test('advanceStreak is idempotent within the same day', () => {
  const r = advanceStreak({ lastStudyDay: '2026-07-24', streak: 3 }, '2026-07-24');
  assert.deepEqual(r, { lastStudyDay: '2026-07-24', streak: 3, counted: false });
});

test('advanceStreak increments on consecutive days', () => {
  const r = advanceStreak({ lastStudyDay: '2026-07-24', streak: 3 }, '2026-07-25');
  assert.deepEqual(r, { lastStudyDay: '2026-07-25', streak: 4, counted: true });
});

test('advanceStreak resets after a gap', () => {
  const r = advanceStreak({ lastStudyDay: '2026-07-24', streak: 9 }, '2026-07-27');
  assert.deepEqual(r, { lastStudyDay: '2026-07-27', streak: 1, counted: true });
});
