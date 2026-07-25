// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCard,
  schedule,
  DEFAULTS,
  MINUTE_MS,
  DAY_MS,
} from '../js/srs/scheduler.mjs';

const T0 = 1_700_000_000_000; // fixed epoch ms — deterministic, no Date.now()

test('createCard produces a new card due immediately', () => {
  const c = createCard('e_merhaba', T0);
  assert.equal(c.state, 'new');
  assert.equal(c.entryId, 'e_merhaba');
  assert.equal(c.ease, DEFAULTS.startingEase);
  assert.equal(c.reps, 0);
  assert.equal(c.lapses, 0);
  assert.equal(c.due, T0);
});

test('schedule never mutates its input', () => {
  const c = createCard('e', T0);
  const snapshot = JSON.stringify(c);
  schedule(c, 'good', T0);
  assert.equal(JSON.stringify(c), snapshot);
});

test('new + good walks the learning ladder then graduates', () => {
  const c0 = createCard('e', T0);

  // First Good -> second learning step (10 min).
  const c1 = schedule(c0, 'good', T0);
  assert.equal(c1.state, 'learning');
  assert.equal(c1.learningStepIndex, 1);
  assert.equal(c1.due, T0 + 10 * MINUTE_MS);

  // Second Good -> graduates to review at 1 day.
  const c2 = schedule(c1, 'good', c1.due);
  assert.equal(c2.state, 'review');
  assert.equal(c2.intervalDays, DEFAULTS.graduatingIntervalDays);
  assert.equal(c2.reps, 1);
  assert.equal(c2.due, c1.due + DAY_MS);
});

test('new + again keeps card on first learning step', () => {
  const c1 = schedule(createCard('e', T0), 'good', T0); // step 1
  const c2 = schedule(c1, 'again', c1.due);
  assert.equal(c2.state, 'learning');
  assert.equal(c2.learningStepIndex, 0);
  assert.equal(c2.due, c1.due + DEFAULTS.learningStepsMin[0] * MINUTE_MS);
});

test('new + easy graduates immediately at the easy interval', () => {
  const c = schedule(createCard('e', T0), 'easy', T0);
  assert.equal(c.state, 'review');
  assert.equal(c.intervalDays, DEFAULTS.easyGraduatingIntervalDays);
  assert.equal(c.reps, 1);
});

test('review + good multiplies interval by ease', () => {
  // Build a review card with a known 10-day interval.
  let c = schedule(createCard('e', T0), 'easy', T0); // review, 4 days
  c = { ...c, intervalDays: 10, due: T0 };
  const g = schedule(c, 'good', c.due);
  assert.equal(g.state, 'review');
  assert.equal(g.intervalDays, Math.round(10 * c.ease)); // 25 at ease 2.5
  assert.equal(g.due, c.due + g.intervalDays * DAY_MS);
});

test('review + hard grows slowly and lowers ease', () => {
  let c = schedule(createCard('e', T0), 'easy', T0);
  c = { ...c, intervalDays: 10, ease: 2.5, due: T0 };
  const h = schedule(c, 'hard', c.due);
  assert.equal(h.intervalDays, Math.round(10 * DEFAULTS.hardIntervalFactor)); // 12
  assert.ok(h.ease < 2.5);
  assert.ok(h.ease >= DEFAULTS.minEase);
});

test('review + again lapses into relearning and reduces ease', () => {
  let c = schedule(createCard('e', T0), 'easy', T0);
  c = { ...c, intervalDays: 20, ease: 2.5, due: T0 };
  const l = schedule(c, 'again', c.due);
  assert.equal(l.state, 'relearning');
  assert.equal(l.lapses, 1);
  assert.ok(l.ease < 2.5);
  assert.equal(l.learningStepIndex, 0);
  assert.equal(l.due, c.due + DEFAULTS.relearningStepsMin[0] * MINUTE_MS);
  // With lapseNewIntervalFactor 0, the restored interval floors at 1 day.
  assert.equal(l.intervalDays, DEFAULTS.minReviewIntervalDays);
});

test('relearning + good graduates back to review', () => {
  let c = schedule(createCard('e', T0), 'easy', T0);
  c = { ...c, intervalDays: 20, ease: 2.4, due: T0 };
  const lapsed = schedule(c, 'again', c.due); // relearning
  const back = schedule(lapsed, 'good', lapsed.due);
  assert.equal(back.state, 'review');
  assert.equal(back.intervalDays, lapsed.intervalDays); // restores reduced interval
  assert.equal(back.reps, lapsed.reps + 1);
});

test('ease never drops below the floor', () => {
  let c = schedule(createCard('e', T0), 'easy', T0);
  c = { ...c, intervalDays: 5, ease: DEFAULTS.minEase, due: T0 };
  for (let i = 0; i < 5; i++) {
    c = schedule(c, 'hard', c.due);
  }
  assert.equal(c.ease, DEFAULTS.minEase);
});

test('intervals are capped and whole days', () => {
  let c = schedule(createCard('e', T0), 'easy', T0);
  c = { ...c, intervalDays: DEFAULTS.maxIntervalDays, ease: 2.5, due: T0 };
  const g = schedule(c, 'easy', c.due);
  assert.equal(g.intervalDays, DEFAULTS.maxIntervalDays);
  assert.equal(Number.isInteger(g.intervalDays), true);
});

test('overrides customise the ladder', () => {
  const c = schedule(createCard('e', T0), 'good', T0, { learningStepsMin: [5] });
  // Single-step ladder: one Good graduates straight to review.
  assert.equal(c.state, 'review');
});
