// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  browserHeaders,
  createMessage,
  streamMessage,
  AnthropicError,
  DEFAULT_BASE_URL,
} from '../js/ai/client.mjs';

const STREAM = [
  'event: message_start',
  'data: {"type":"message_start","message":{"usage":{"input_tokens":50}}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Merhaba"}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}}',
  '',
  'event: message_delta',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":8}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
].join('\n');

/** @param {string} text @param {number} chunk */
function streamOf(text, chunk = 7) {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(i, i + chunk));
      i += chunk;
    },
  });
}

test('browserHeaders sets the dangerous direct-access + auth headers', () => {
  const h = browserHeaders('sk-test');
  assert.equal(h['x-api-key'], 'sk-test');
  assert.equal(h['anthropic-version'], '2023-06-01');
  assert.equal(h['anthropic-dangerous-direct-browser-access'], 'true');
});

test('createMessage POSTs to /v1/messages with stream:false and the key', async () => {
  /** @type {any} */
  let captured;
  const fetchImpl = async (/** @type {string} */ url, /** @type {any} */ init) => {
    captured = { url, init };
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) };
  };
  const res = await createMessage({
    apiKey: 'sk-x',
    body: { model: 'claude-haiku-4-5', max_tokens: 1, messages: [] },
    fetchImpl: /** @type {any} */ (fetchImpl),
  });
  assert.equal(captured.url, `${DEFAULT_BASE_URL}/v1/messages`);
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers['x-api-key'], 'sk-x');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.stream, false);
  assert.equal(body.model, 'claude-haiku-4-5');
  assert.equal(res.content[0].text, 'ok');
});

test('createMessage honours a custom baseUrl (proxy seam)', async () => {
  /** @type {any} */
  let url;
  const fetchImpl = async (/** @type {string} */ u) => {
    url = u;
    return { ok: true, json: async () => ({}) };
  };
  await createMessage({ apiKey: 'k', baseUrl: 'https://proxy.example', body: {}, fetchImpl: /** @type {any} */ (fetchImpl) });
  assert.equal(url, 'https://proxy.example/v1/messages');
});

test('createMessage throws AnthropicError with the API message on failure', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
  });
  await assert.rejects(
    () => createMessage({ apiKey: 'bad', body: {}, fetchImpl: /** @type {any} */ (fetchImpl) }),
    (err) => {
      assert.ok(err instanceof AnthropicError);
      assert.equal(err.status, 401);
      assert.equal(err.message, 'invalid x-api-key');
      assert.equal(err.type, 'authentication_error');
      return true;
    },
  );
});

test('streamMessage reconstructs text deltas and usage across chunks', async () => {
  const fetchImpl = async () => ({ ok: true, body: streamOf(STREAM, 7) });
  let text = '';
  let output = 0;
  let input = 0;
  for await (const ev of streamMessage({ apiKey: 'k', body: { model: 'm' }, fetchImpl: /** @type {any} */ (fetchImpl) })) {
    if (ev.type === 'message_start') input = ev.message.usage.input_tokens;
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') text += ev.delta.text;
    if (ev.type === 'message_delta') output = ev.usage.output_tokens;
  }
  assert.equal(text, 'Merhaba!');
  assert.equal(input, 50);
  assert.equal(output, 8);
});

test('streamMessage surfaces an error frame as a throw', async () => {
  const errStream = 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}\n\n';
  const fetchImpl = async () => ({ ok: true, body: streamOf(errStream, 5) });
  await assert.rejects(
    async () => {
      for await (const _ of streamMessage({ apiKey: 'k', body: {}, fetchImpl: /** @type {any} */ (fetchImpl) })) {
        void _;
      }
    },
    /overloaded/,
  );
});
