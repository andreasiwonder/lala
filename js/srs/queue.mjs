// @ts-check
/**
 * Builds today's study queue from card state — pure and deterministic so it can
 * be unit-tested without a browser.
 *
 * Ordering: due learning/relearning first (soonest due first), then due
 * reviews, then new cards in frequency order (most common words first),
 * capped by how many new cards remain for today.
 *
 * @typedef {import('../srs/scheduler.mjs').Card} Card
 * @typedef {import('../deck/loader.mjs').Entry} Entry
 */

/**
 * @param {object} args
 * @param {Card[]} args.cards
 * @param {Map<string, Entry>} args.entryById  freqRank lookup for new-card order.
 * @param {number} args.now                      epoch ms
 * @param {number} args.newRemaining             new cards still allowed today
 * @returns {{ queue: Card[], counts: { learning: number, review: number, new: number, total: number } }}
 */
export function buildQueue({ cards, entryById, now, newRemaining }) {
  const learningDue = cards
    .filter((c) => (c.state === 'learning' || c.state === 'relearning') && c.due <= now)
    .sort((a, b) => a.due - b.due);

  const reviewDue = cards
    .filter((c) => c.state === 'review' && c.due <= now)
    .sort((a, b) => a.due - b.due);

  const newCards = cards
    .filter((c) => c.state === 'new')
    .sort((a, b) => freqRank(entryById, a) - freqRank(entryById, b))
    .slice(0, Math.max(0, newRemaining));

  const queue = [...learningDue, ...reviewDue, ...newCards];
  return {
    queue,
    counts: {
      learning: learningDue.length,
      review: reviewDue.length,
      new: newCards.length,
      total: queue.length,
    },
  };
}

/**
 * The next batch of not-yet-seen words, most-common first — used by the Learn
 * view to present new vocabulary before it enters review.
 * @param {Card[]} cards
 * @param {Map<string, Entry>} entryById
 * @param {number} limit
 * @returns {Card[]}
 */
export function newBatch(cards, entryById, limit) {
  return cards
    .filter((c) => c.state === 'new')
    .sort((a, b) => freqRank(entryById, a) - freqRank(entryById, b))
    .slice(0, Math.max(0, limit));
}

/**
 * Snapshot counts for the progress screen.
 * @param {Card[]} cards
 * @param {number} now epoch ms
 * @returns {{ total: number, new: number, learning: number, review: number, dueNow: number, learned: number }}
 */
export function summarize(cards, now) {
  let n = 0;
  let learning = 0;
  let review = 0;
  let dueNow = 0;
  let learned = 0;
  for (const c of cards) {
    if (c.state === 'new') {
      n += 1;
      continue;
    }
    learned += 1;
    if (c.state === 'review') review += 1;
    else learning += 1; // learning | relearning
    if (c.due <= now) dueNow += 1;
  }
  return { total: cards.length, new: n, learning, review, dueNow, learned };
}

/**
 * @param {Map<string, Entry>} entryById
 * @param {Card} card
 * @returns {number}
 */
function freqRank(entryById, card) {
  const entry = entryById.get(card.entryId);
  return entry ? entry.freqRank : Number.POSITIVE_INFINITY;
}
