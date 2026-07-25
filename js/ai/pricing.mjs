// @ts-check
/**
 * Rough per-session cost estimation so two people sharing a hobby app can see
 * roughly what they're spending. USD per million tokens. Sonnet 5 shows its
 * introductory rate (in effect through 2026-08-31); update if that lapses.
 */

/** @type {Record<string, { in: number, out: number }>} */
export const PRICING = {
  'claude-sonnet-5': { in: 2.0, out: 10.0 },
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
};

/**
 * @typedef {object} Usage
 * @property {number} [input_tokens]
 * @property {number} [output_tokens]
 * @property {number} [cache_read_input_tokens]
 * @property {number} [cache_creation_input_tokens]
 */

/**
 * Estimate the USD cost of one message's usage. Cache reads bill ~0.1×, cache
 * writes ~1.25× the input rate.
 * @param {string} model
 * @param {Usage} usage
 * @returns {number} dollars
 */
export function estimateCost(model, usage) {
  const p = PRICING[model] ?? PRICING['claude-sonnet-5'];
  const input = usage.input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return (
    (input * p.in + cacheRead * p.in * 0.1 + cacheCreate * p.in * 1.25 + output * p.out) / 1e6
  );
}
