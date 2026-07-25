// @ts-check
/**
 * Derive the learner's "known vocabulary" from SRS state so the AI tutor can be
 * constrained to words they've actually started learning (comprehensible input).
 * Pure and testable.
 *
 * @typedef {import('../srs/scheduler.mjs').Card} Card
 * @typedef {import('../deck/schema.mjs').Entry} Entry
 */

/**
 * Entries the learner has started (any state except `new`), most-common first.
 * @param {Card[]} cards
 * @param {Map<string, Entry>} index
 * @param {{ limit?: number }} [opts]
 * @returns {Entry[]}
 */
export function knownVocab(cards, index, opts = {}) {
  const limit = opts.limit ?? 300;
  return cards
    .filter((c) => c.state !== 'new')
    .map((c) => index.get(c.entryId))
    .filter(/** @returns {e is Entry} */ (e) => Boolean(e))
    .sort((a, b) => a.freqRank - b.freqRank)
    .slice(0, limit);
}

/**
 * A compact comma-separated Turkish word list for the system prompt.
 * @param {Entry[]} vocab
 * @returns {string}
 */
export function vocabList(vocab) {
  return vocab.map((e) => e.tr).join(', ');
}
