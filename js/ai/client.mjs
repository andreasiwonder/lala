// @ts-check
/**
 * The single choke-point for every Anthropic API call. Browser-direct with the
 * user's own key (BYO key). ALL calls flow through here and through the
 * configurable `baseUrl`, so switching to a serverless proxy later (when going
 * public) is a one-line change — point `baseUrl` at the proxy and drop the
 * key/dangerous headers.
 *
 * Security: the `anthropic-dangerous-direct-browser-access` header is what makes
 * the CORS call work; it is safe here only because this origin loads no
 * third-party scripts (see the CSP in index.html).
 *
 * @typedef {import('./sse.mjs').RawEvent} RawEvent
 */
import { createSSEParser } from './sse.mjs';

export const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

export class AnthropicError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {string} [type]
   */
  constructor(status, message, type) {
    super(message);
    this.name = 'AnthropicError';
    this.status = status;
    this.type = type;
  }
}

/**
 * Build the request headers for a browser-direct call.
 * @param {string} apiKey
 * @returns {Record<string, string>}
 */
export function browserHeaders(apiKey) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

/**
 * Turn a non-OK response into a typed error with the API's message if present.
 * @param {Response} res
 * @returns {Promise<AnthropicError>}
 */
async function toError(res) {
  let message = `HTTP ${res.status}`;
  let type;
  try {
    const body = await res.json();
    if (body?.error?.message) message = body.error.message;
    type = body?.error?.type;
  } catch {
    /* non-JSON error body */
  }
  return new AnthropicError(res.status, message, type);
}

/**
 * Non-streaming request. Returns the full parsed message JSON.
 * @param {object} args
 * @param {string} args.apiKey
 * @param {object} args.body   Messages API request body (without `stream`).
 * @param {string} [args.baseUrl]
 * @param {AbortSignal} [args.signal]
 * @param {typeof fetch} [args.fetchImpl]
 * @returns {Promise<any>}
 */
export async function createMessage({ apiKey, body, baseUrl, signal, fetchImpl = fetch }) {
  const res = await fetchImpl(`${baseUrl ?? DEFAULT_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: browserHeaders(apiKey),
    body: JSON.stringify({ ...body, stream: false }),
    signal,
  });
  if (!res.ok) throw await toError(res);
  return res.json();
}

/**
 * Streaming request. Yields the parsed `data` object of every SSE frame
 * (each has a `.type` like "content_block_delta", "message_delta", …). Throws
 * AnthropicError on a non-OK response or an `error` frame.
 * @param {object} args
 * @param {string} args.apiKey
 * @param {object} args.body
 * @param {string} [args.baseUrl]
 * @param {AbortSignal} [args.signal]
 * @param {typeof fetch} [args.fetchImpl]
 * @returns {AsyncGenerator<any>}
 */
export async function* streamMessage({ apiKey, body, baseUrl, signal, fetchImpl = fetch }) {
  const res = await fetchImpl(`${baseUrl ?? DEFAULT_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: browserHeaders(apiKey),
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!res.ok) throw await toError(res);
  if (!res.body) throw new AnthropicError(0, 'No response body to stream');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEParser();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const frames = parser.push(decoder.decode(value, { stream: true }));
    for (const frame of frames) {
      const parsed = decodeFrame(frame);
      if (parsed) yield parsed;
    }
  }
  for (const frame of parser.flush()) {
    const parsed = decodeFrame(frame);
    if (parsed) yield parsed;
  }
}

/**
 * Decode one SSE frame's JSON data, surfacing `error` frames as throws.
 * @param {RawEvent} frame
 * @returns {any | null}
 */
function decodeFrame(frame) {
  if (!frame.data || frame.data === '[DONE]') return null;
  let data;
  try {
    data = JSON.parse(frame.data);
  } catch {
    return null; // ignore keep-alive/ping noise
  }
  if (data?.type === 'error') {
    throw new AnthropicError(0, data.error?.message ?? 'stream error', data.error?.type);
  }
  return data;
}
