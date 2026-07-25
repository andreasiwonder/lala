// @ts-check
/**
 * Spaced-repetition scheduler — SM-2 with Anki-style learning steps.
 *
 * This module is PURE: `schedule(card, rating, now)` takes a card and a rating
 * and returns a brand-new card. No I/O, no Date.now(), no randomness. That
 * purity makes it the primary unit-test target and a stable seam for a future
 * FSRS swap (keep the `schedule` signature and swap the body).
 *
 * @typedef {'new' | 'learning' | 'review' | 'relearning'} CardState
 * @typedef {'again' | 'hard' | 'good' | 'easy'} Rating
 *
 * @typedef {object} Card
 * @property {string} entryId          Stable deck entry id this card tracks.
 * @property {CardState} state
 * @property {number} ease             Ease factor (>= MIN_EASE). Default 2.5.
 * @property {number} intervalDays     Current review interval in days (0 while learning).
 * @property {number} reps             Successful review reps.
 * @property {number} lapses           Times this card lapsed from review.
 * @property {number} learningStepIndex Index into the active step ladder.
 * @property {number} due              Epoch ms when the card is next due.
 * @property {number} updatedAt        Epoch ms of last mutation (sync seam).
 * @property {number} schemaVersion    Record schema version (sync seam).
 */

export const CARD_SCHEMA_VERSION = 1;

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

/** Tunable scheduler parameters. Kept in one object so a settings screen or an
 *  A/B test can override them without touching the algorithm. */
export const DEFAULTS = Object.freeze({
  startingEase: 2.5,
  minEase: 1.3,
  /** Minutes between learning steps for new/learning cards. */
  learningStepsMin: [1, 10],
  /** Minutes between steps when a lapsed card is relearning. */
  relearningStepsMin: [10],
  /** Interval (days) a card graduates to when answered Good on its last learning step. */
  graduatingIntervalDays: 1,
  /** Interval (days) a card graduates to when answered Easy from learning. */
  easyGraduatingIntervalDays: 4,
  /** Ease deltas. */
  hardEaseDelta: -0.15,
  againEaseDelta: -0.2,
  easyEaseDelta: 0.15,
  /** Multipliers for review-state answers. */
  hardIntervalFactor: 1.2,
  easyBonus: 1.3,
  /** Fraction of the old interval kept when a review card lapses (0 = reset to minimum). */
  lapseNewIntervalFactor: 0,
  minReviewIntervalDays: 1,
  maxIntervalDays: 365 * 20,
});

/**
 * Create a fresh card for a deck entry, in the `new` state and due immediately.
 * @param {string} entryId
 * @param {number} now epoch ms
 * @returns {Card}
 */
export function createCard(entryId, now) {
  return {
    entryId,
    state: 'new',
    ease: DEFAULTS.startingEase,
    intervalDays: 0,
    reps: 0,
    lapses: 0,
    learningStepIndex: 0,
    due: now,
    updatedAt: now,
    schemaVersion: CARD_SCHEMA_VERSION,
  };
}

/** @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * @param {number} intervalDays
 * @param {typeof DEFAULTS} cfg
 * @returns {number} capped, whole-day interval (>= 1)
 */
function capInterval(intervalDays, cfg) {
  return clamp(Math.round(intervalDays), 1, cfg.maxIntervalDays);
}

/**
 * Advance a card by one rating and return the next card. Never mutates input.
 * @param {Card} card
 * @param {Rating} rating
 * @param {number} now epoch ms
 * @param {Partial<typeof DEFAULTS>} [overrides]
 * @returns {Card}
 */
export function schedule(card, rating, now, overrides) {
  const cfg = /** @type {typeof DEFAULTS} */ ({ ...DEFAULTS, ...overrides });
  const next = { ...card, updatedAt: now, schemaVersion: CARD_SCHEMA_VERSION };

  if (card.state === 'new' || card.state === 'learning') {
    applyLearning(next, rating, now, cfg, cfg.learningStepsMin);
  } else if (card.state === 'relearning') {
    applyRelearning(next, rating, now, cfg);
  } else {
    applyReview(next, rating, now, cfg);
  }
  return next;
}

/**
 * Learning ladder for new/learning cards.
 * @param {Card} c @param {Rating} rating @param {number} now
 * @param {typeof DEFAULTS} cfg @param {number[]} steps
 */
function applyLearning(c, rating, now, cfg, steps) {
  c.state = 'learning';
  switch (rating) {
    case 'again':
      c.learningStepIndex = 0;
      c.due = now + steps[0] * MINUTE_MS;
      break;
    case 'hard':
      // Repeat the current step.
      c.due = now + steps[Math.min(c.learningStepIndex, steps.length - 1)] * MINUTE_MS;
      break;
    case 'good': {
      const nextIndex = c.learningStepIndex + 1;
      if (nextIndex < steps.length) {
        c.learningStepIndex = nextIndex;
        c.due = now + steps[nextIndex] * MINUTE_MS;
      } else {
        graduate(c, cfg.graduatingIntervalDays, now, cfg);
      }
      break;
    }
    case 'easy':
      graduate(c, cfg.easyGraduatingIntervalDays, now, cfg);
      break;
  }
}

/**
 * Relearning ladder for lapsed cards. `intervalDays` already holds the reduced
 * interval to restore on graduation (set when the card lapsed).
 * @param {Card} c @param {Rating} rating @param {number} now @param {typeof DEFAULTS} cfg
 */
function applyRelearning(c, rating, now, cfg) {
  const steps = cfg.relearningStepsMin;
  switch (rating) {
    case 'again':
      c.learningStepIndex = 0;
      c.due = now + steps[0] * MINUTE_MS;
      break;
    case 'hard':
      c.due = now + steps[Math.min(c.learningStepIndex, steps.length - 1)] * MINUTE_MS;
      break;
    case 'good': {
      const nextIndex = c.learningStepIndex + 1;
      if (nextIndex < steps.length) {
        c.learningStepIndex = nextIndex;
        c.due = now + steps[nextIndex] * MINUTE_MS;
      } else {
        c.reps += 1;
        graduateToReview(c, c.intervalDays, now, cfg);
      }
      break;
    }
    case 'easy':
      c.reps += 1;
      graduateToReview(c, c.intervalDays + 1, now, cfg);
      break;
  }
}

/**
 * SM-2 review scheduling for graduated cards.
 * @param {Card} c @param {Rating} rating @param {number} now @param {typeof DEFAULTS} cfg
 */
function applyReview(c, rating, now, cfg) {
  if (rating === 'again') {
    // Lapse: reduce ease, drop into relearning, remember a reduced interval.
    c.lapses += 1;
    c.ease = clamp(c.ease + cfg.againEaseDelta, cfg.minEase, Infinity);
    c.intervalDays = capInterval(
      Math.max(cfg.minReviewIntervalDays, c.intervalDays * cfg.lapseNewIntervalFactor),
      cfg,
    );
    c.state = 'relearning';
    c.learningStepIndex = 0;
    c.due = now + cfg.relearningStepsMin[0] * MINUTE_MS;
    return;
  }

  let interval = c.intervalDays;
  switch (rating) {
    case 'hard':
      c.ease = clamp(c.ease + cfg.hardEaseDelta, cfg.minEase, Infinity);
      interval = Math.max(c.intervalDays + 1, c.intervalDays * cfg.hardIntervalFactor);
      break;
    case 'good':
      interval = Math.max(c.intervalDays + 1, c.intervalDays * c.ease);
      break;
    case 'easy':
      c.ease = clamp(c.ease + cfg.easyEaseDelta, cfg.minEase, Infinity);
      interval = Math.max(c.intervalDays + 1, c.intervalDays * c.ease * cfg.easyBonus);
      break;
  }
  c.reps += 1;
  c.intervalDays = capInterval(interval, cfg);
  c.due = now + c.intervalDays * DAY_MS;
}

/**
 * Graduate a learning card straight into review at a fixed interval.
 * @param {Card} c @param {number} intervalDays @param {number} now @param {typeof DEFAULTS} cfg
 */
function graduate(c, intervalDays, now, cfg) {
  c.reps += 1;
  graduateToReview(c, intervalDays, now, cfg);
}

/**
 * Move a card into the review state at a given interval.
 * @param {Card} c @param {number} intervalDays @param {number} now @param {typeof DEFAULTS} cfg
 */
function graduateToReview(c, intervalDays, now, cfg) {
  c.state = 'review';
  c.learningStepIndex = 0;
  c.intervalDays = capInterval(intervalDays, cfg);
  c.due = now + c.intervalDays * DAY_MS;
}
