// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDeck } from '../js/deck/schema.mjs';
import { reconcile, entryIndex, fetchDeck } from '../js/deck/loader.mjs';
import { createCard } from '../js/srs/scheduler.mjs';

const deck = JSON.parse(
  readFileSync(new URL('../data/deck.json', import.meta.url), 'utf8'),
);
const NOW = 1_700_000_000_000;

test('committed data/deck.json is valid', () => {
  assert.deepEqual(validateDeck(deck), []);
});

test('deck ids are globally unique and freqRank is strictly increasing', () => {
  const ids = new Set();
  let prev = 0;
  for (const e of deck.entries) {
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.freqRank > prev, `freqRank not increasing at ${e.id}`);
    prev = e.freqRank;
  }
});

test('deck contains chunk entries (methodology requirement)', () => {
  const chunks = deck.entries.filter((/** @type {any} */ e) => e.type === 'chunk');
  assert.ok(chunks.length >= 20, `expected many chunks, got ${chunks.length}`);
});

test('reconcile seeds a card for every entry on first load', () => {
  const { newCards, orphanIds } = reconcile({
    entries: deck.entries,
    existingCards: [],
    now: NOW,
  });
  assert.equal(newCards.length, deck.entries.length);
  assert.equal(orphanIds.length, 0);
  assert.ok(newCards.every((c) => c.state === 'new'));
});

test('reconcile only seeds genuinely new entries and preserves existing state', () => {
  const first = deck.entries[0];
  /** @type {import('../js/srs/scheduler.mjs').Card[]} */
  const existing = [{ ...createCard(first.id, NOW), state: 'review', reps: 5 }];
  const { newCards } = reconcile({ entries: deck.entries, existingCards: existing, now: NOW });
  assert.equal(newCards.length, deck.entries.length - 1);
  assert.ok(!newCards.some((c) => c.entryId === first.id));
});

test('reconcile reports orphaned cards without deleting them', () => {
  const existing = [createCard('e_removed_word', NOW)];
  const { newCards, orphanIds } = reconcile({
    entries: deck.entries,
    existingCards: existing,
    now: NOW,
  });
  assert.deepEqual(orphanIds, ['e_removed_word']);
  assert.equal(newCards.length, deck.entries.length);
});

test('entryIndex maps ids to entries', () => {
  const index = entryIndex(deck);
  assert.equal(index.size, deck.entries.length);
  assert.equal(index.get(deck.entries[0].id)?.tr, deck.entries[0].tr);
});

test('fetchDeck validates and rejects a bad deck via injected fetch', async () => {
  const okFetch = async () => ({ ok: true, json: async () => deck });
  const loaded = await fetchDeck('x', /** @type {any} */ (okFetch));
  assert.equal(loaded.entries.length, deck.entries.length);

  const badFetch = async () => ({ ok: true, json: async () => ({ schemaVersion: 1 }) });
  await assert.rejects(
    () => fetchDeck('x', /** @type {any} */ (badFetch)),
    /invalid deck/,
  );

  const notFound = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(
    () => fetchDeck('x', /** @type {any} */ (notFound)),
    /HTTP 404/,
  );
});
