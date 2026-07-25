// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, summarize } from '../js/srs/queue.mjs';
import { createCard } from '../js/srs/scheduler.mjs';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

/** @param {Partial<import('../js/srs/scheduler.mjs').Card>} patch */
function card(patch) {
  return { ...createCard(patch.entryId ?? 'x', NOW), ...patch };
}

/**
 * @param {[string, number][]} pairs
 * @returns {Map<string, any>} only freqRank is read by the queue
 */
function entryMap(pairs) {
  return new Map(pairs.map(([id, freqRank]) => [id, { freqRank }]));
}

test('orders learning-due, then review-due, then new by frequency', () => {
  const cards = [
    card({ entryId: 'new-rare', state: 'new' }),
    card({ entryId: 'new-common', state: 'new' }),
    card({ entryId: 'rev', state: 'review', due: NOW - DAY }),
    card({ entryId: 'lrn', state: 'learning', due: NOW - 60_000 }),
  ];
  const entryById = entryMap([
    ['new-rare', 900],
    ['new-common', 3],
    ['rev', 50],
    ['lrn', 20],
  ]);

  const { queue, counts } = buildQueue({ cards, entryById, now: NOW, newRemaining: 10 });
  assert.deepEqual(
    queue.map((c) => c.entryId),
    ['lrn', 'rev', 'new-common', 'new-rare'],
  );
  assert.deepEqual(counts, { learning: 1, review: 1, new: 2, total: 4 });
});

test('excludes cards not yet due', () => {
  const cards = [
    card({ entryId: 'future-rev', state: 'review', due: NOW + DAY }),
    card({ entryId: 'due-rev', state: 'review', due: NOW }),
  ];
  const { queue } = buildQueue({ cards, entryById: entryMap([]), now: NOW, newRemaining: 0 });
  assert.deepEqual(queue.map((c) => c.entryId), ['due-rev']);
});

test('caps new cards at the daily remaining count', () => {
  const cards = [
    card({ entryId: 'a', state: 'new' }),
    card({ entryId: 'b', state: 'new' }),
    card({ entryId: 'c', state: 'new' }),
  ];
  const entryById = entryMap([['a', 1], ['b', 2], ['c', 3]]);
  const { counts } = buildQueue({ cards, entryById, now: NOW, newRemaining: 2 });
  assert.equal(counts.new, 2);
});

test('newRemaining of 0 yields no new cards', () => {
  const cards = [card({ entryId: 'a', state: 'new' })];
  const { queue } = buildQueue({
    cards,
    entryById: entryMap([['a', 1]]),
    now: NOW,
    newRemaining: 0,
  });
  assert.equal(queue.length, 0);
});

test('summarize partitions by state and due-ness', () => {
  const cards = [
    card({ entryId: 'n', state: 'new' }),
    card({ entryId: 'r1', state: 'review', due: NOW - DAY }),
    card({ entryId: 'r2', state: 'review', due: NOW + DAY }),
    card({ entryId: 'l', state: 'relearning', due: NOW - 60_000 }),
  ];
  const s = summarize(cards, NOW);
  assert.equal(s.total, 4);
  assert.equal(s.new, 1);
  assert.equal(s.review, 2);
  assert.equal(s.learning, 1);
  assert.equal(s.learned, 3);
  assert.equal(s.dueNow, 2); // r1 + l
});
