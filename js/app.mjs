// @ts-check
/**
 * App bootstrap and shared context. Loads settings, deck, and cards; exposes a
 * single `rate()` action that every view calls (schedule → persist → log →
 * update in-memory state → advance streak + daily counter). Keeping the write
 * path in one place keeps the views thin and the side effects auditable.
 *
 * @typedef {import('./srs/scheduler.mjs').Card} Card
 * @typedef {import('./srs/scheduler.mjs').Rating} Rating
 * @typedef {import('./deck/schema.mjs').Deck} Deck
 * @typedef {import('./deck/schema.mjs').Entry} Entry
 * @typedef {import('./store/settings.mjs').Settings} Settings
 *
 * @typedef {object} AppContext
 * @property {import('./lib/reactive.mjs').Signal<Settings>} settings
 * @property {import('./lib/reactive.mjs').Signal<Card[]>} cards
 * @property {Deck} deck
 * @property {Map<string, Entry>} index
 * @property {(card: Card, rating: Rating) => Promise<Card>} rate
 * @property {(card: Card) => Promise<Card>} introduce
 * @property {(hash: string) => void} navigate
 */
import { signal, effect } from './lib/reactive.mjs';
import * as db from './store/db.mjs';
import { load, update } from './store/settings.mjs';
import { loadDeckAndSeed } from './deck/loader.mjs';
import { schedule } from './srs/scheduler.mjs';
import { dayKey, advanceStreak } from './lib/day.mjs';

/**
 * @returns {Promise<{ ctx: AppContext, seeded: number }>}
 */
export async function createApp() {
  const settings = signal(load());
  applyTheme(settings.peek().theme);
  effect(() => applyTheme(settings().theme));

  const now = Date.now();
  const { deck, index, seeded } = await loadDeckAndSeed({ now });
  if (settings.peek().installedDeckVersion !== deck.version) {
    settings.set(update({ installedDeckVersion: deck.version }));
  }

  const cards = signal(await db.allCards());

  /**
   * @param {Card} card
   * @param {Rating} rating
   * @returns {Promise<Card>}
   */
  async function rate(card, rating) {
    const t = Date.now();
    const wasNew = card.state === 'new';
    const next = schedule(card, rating, t);

    await db.saveCard(next);
    await db.logReview({
      entryId: card.entryId,
      rating,
      ts: t,
      prevState: card.state,
      newState: next.state,
    });
    cards.update((list) => list.map((c) => (c.entryId === next.entryId ? next : c)));

    const today = dayKey(t);
    const cur = load();
    const streak = advanceStreak({ lastStudyDay: cur.lastStudyDay, streak: cur.streak }, today);
    /** @type {Partial<Settings>} */
    const patch = { lastStudyDay: streak.lastStudyDay, streak: streak.streak };
    if (wasNew) {
      const count = cur.newToday.day === today ? cur.newToday.count + 1 : 1;
      patch.newToday = { day: today, count };
    }
    settings.set(update(patch));
    return next;
  }

  /**
   * Introduce a new word: move it new → learning (due now) so it enters the
   * spaced-repetition review pipeline. Called by the Learn view after the word
   * has been *shown* to the learner. Idempotent.
   * @param {Card} card
   * @returns {Promise<Card>}
   */
  async function introduce(card) {
    if (card.state !== 'new') return card;
    const t = Date.now();
    const next = { ...card, state: /** @type {const} */ ('learning'), learningStepIndex: 0, intervalDays: 0, due: t, updatedAt: t };
    await db.saveCard(next);
    await db.logReview({ entryId: card.entryId, rating: 'introduce', ts: t, prevState: 'new', newState: 'learning' });
    cards.update((list) => list.map((c) => (c.entryId === next.entryId ? next : c)));

    const today = dayKey(t);
    const cur = load();
    const streak = advanceStreak({ lastStudyDay: cur.lastStudyDay, streak: cur.streak }, today);
    const count = cur.newToday.day === today ? cur.newToday.count + 1 : 1;
    settings.set(update({ lastStudyDay: streak.lastStudyDay, streak: streak.streak, newToday: { day: today, count } }));
    return next;
  }

  /** @type {AppContext} */
  const ctx = {
    settings,
    cards,
    deck,
    index,
    rate,
    introduce,
    navigate: (hash) => {
      location.hash = hash;
    },
  };
  return { ctx, seeded };
}

/** @param {Settings['theme']} theme */
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
