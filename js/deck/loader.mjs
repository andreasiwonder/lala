// @ts-check
/**
 * Loads the static deck, validates it, and reconciles it against stored SRS
 * cards: new entries get seeded as `new` cards, existing cards keep their state
 * (matched by stable `id`), removed ids are reported (but left in place —
 * harmless). This content↔progress seam is what lets us ship deck updates
 * without touching the learner's progress.
 *
 * `fetchDeck`, `reconcile`, and `entryIndex` are pure/injectable so they can be
 * unit-tested in Node; `loadDeckAndSeed` wires them to IndexedDB for the app.
 *
 * @typedef {import('./schema.mjs').Entry} Entry
 * @typedef {import('./schema.mjs').Deck} Deck
 * @typedef {import('../srs/scheduler.mjs').Card} Card
 */
import { validateDeck } from './schema.mjs';
import { createCard } from '../srs/scheduler.mjs';
import * as db from '../store/db.mjs';

/**
 * Fetch + validate the deck. `fetchImpl` is injectable for tests.
 * @param {string} [url]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Deck>}
 */
export async function fetchDeck(url = 'data/deck.json', fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`deck fetch failed: HTTP ${res.status}`);
  const deck = await res.json();
  const errors = validateDeck(deck);
  if (errors.length) throw new Error(`invalid deck: ${errors[0]}`);
  return /** @type {Deck} */ (deck);
}

/**
 * Pure reconcile: which entries need a fresh card, and which stored cards no
 * longer have a deck entry.
 * @param {object} args
 * @param {Entry[]} args.entries
 * @param {Card[]} args.existingCards
 * @param {number} args.now epoch ms
 * @returns {{ newCards: Card[], orphanIds: string[] }}
 */
export function reconcile({ entries, existingCards, now }) {
  const existing = new Set(existingCards.map((c) => c.entryId));
  const deckIds = new Set(entries.map((e) => e.id));
  const newCards = entries
    .filter((e) => !existing.has(e.id))
    .map((e) => createCard(e.id, now));
  const orphanIds = existingCards
    .filter((c) => !deckIds.has(c.entryId))
    .map((c) => c.entryId);
  return { newCards, orphanIds };
}

/**
 * @param {Deck} deck
 * @returns {Map<string, Entry>}
 */
export function entryIndex(deck) {
  return new Map(deck.entries.map((e) => [e.id, e]));
}

/**
 * App entry point: fetch, validate, seed new cards, return the deck + index.
 * @param {object} [opts]
 * @param {number} [opts.now]
 * @param {string} [opts.url]
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {Promise<{ deck: Deck, index: Map<string, Entry>, seeded: number, orphanIds: string[] }>}
 */
export async function loadDeckAndSeed(opts = {}) {
  const now = opts.now ?? Date.now();
  const deck = await fetchDeck(opts.url, opts.fetchImpl);
  const existingCards = await db.allCards();
  const { newCards, orphanIds } = reconcile({ entries: deck.entries, existingCards, now });
  if (newCards.length) await db.saveCards(newCards);
  return { deck, index: entryIndex(deck), seeded: newCards.length, orphanIds };
}
