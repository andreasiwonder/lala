// @ts-check
/**
 * Higher-level helpers over the raw client: request-body builders and the cheap
 * one-shot Haiku calls (translate, gloss, test-key). The chat view builds on
 * `chatBody` + `client.streamMessage` directly.
 *
 * @typedef {import('./pricing.mjs').Usage} Usage
 */
import { createMessage, AnthropicError } from './client.mjs';
import { translatePrompt, glossPrompt } from './prompts.mjs';

/**
 * Streaming chat request body — thinking disabled for snappy, cheap replies;
 * system prompt cached; no sampling params (Sonnet 5 rejects them).
 * @param {object} args
 * @param {string} args.model
 * @param {string} args.systemPrompt
 * @param {{ role: string, content: string }[]} args.messages
 * @param {number} [args.maxTokens]
 * @returns {object}
 */
export function chatBody({ model, systemPrompt, messages, maxTokens = 512 }) {
  return {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    thinking: { type: 'disabled' },
    messages,
  };
}

/**
 * @param {object} args
 * @param {string} args.model
 * @param {string} args.system
 * @param {string} args.user
 * @param {number} [args.maxTokens]
 * @returns {object}
 */
function singleShotBody({ model, system, user, maxTokens = 256 }) {
  return {
    model,
    max_tokens: maxTokens,
    system,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: user }],
  };
}

/**
 * Extract the first text block from a Messages API response.
 * @param {any} res
 * @returns {string}
 */
function firstText(res) {
  const block = res?.content?.find((/** @type {any} */ b) => b.type === 'text');
  return block?.text?.trim() ?? '';
}

/**
 * @param {object} args
 * @param {string} args.apiKey
 * @param {string} args.model
 * @param {string} args.text
 * @param {string} [args.baseUrl]
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{ text: string, usage: Usage, model: string }>}
 */
export async function translate({ apiKey, model, text, baseUrl, signal }) {
  const { system, user } = translatePrompt(text);
  const res = await createMessage({ apiKey, baseUrl, signal, body: singleShotBody({ model, system, user }) });
  return { text: firstText(res), usage: res.usage ?? {}, model };
}

/**
 * @param {object} args
 * @param {string} args.apiKey
 * @param {string} args.model
 * @param {string} args.word
 * @param {string} [args.baseUrl]
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{ text: string, usage: Usage, model: string }>}
 */
export async function gloss({ apiKey, model, word, baseUrl, signal }) {
  const { system, user } = glossPrompt(word);
  const res = await createMessage({ apiKey, baseUrl, signal, body: singleShotBody({ model, system, user, maxTokens: 60 }) });
  return { text: firstText(res), usage: res.usage ?? {}, model };
}

/**
 * Validate an API key with the cheapest possible call. Resolves on success,
 * throws AnthropicError on failure (401 = invalid key).
 * @param {object} args
 * @param {string} args.apiKey
 * @param {string} args.model
 * @param {string} [args.baseUrl]
 * @returns {Promise<true>}
 */
export async function testKey({ apiKey, model, baseUrl }) {
  if (!apiKey) throw new AnthropicError(0, 'No API key set');
  await createMessage({
    apiKey,
    baseUrl,
    body: { model, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] },
  });
  return true;
}
