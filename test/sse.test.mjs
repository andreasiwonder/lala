// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrame, extractFrames, createSSEParser } from '../js/ai/sse.mjs';

const STREAM = [
  'event: message_start',
  'data: {"type":"message_start","message":{"usage":{"input_tokens":50,"cache_read_input_tokens":10}}}',
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
  '',
].join('\n');

test('parseFrame extracts event name and data', () => {
  const frame = parseFrame('event: ping\ndata: {"type":"ping"}');
  assert.equal(frame.event, 'ping');
  assert.equal(frame.data, '{"type":"ping"}');
});

test('parseFrame joins multi-line data and ignores comments', () => {
  const frame = parseFrame(': keep-alive\ndata: line1\ndata: line2');
  assert.equal(frame.data, 'line1\nline2');
});

test('extractFrames returns complete frames and keeps the incomplete tail', () => {
  const { frames, rest } = extractFrames(
    'event: a\ndata: 1\n\nevent: b\ndata: 2\n\nevent: c\ndata: 3',
  );
  assert.equal(frames.length, 2);
  assert.equal(frames[0].data, '1');
  assert.equal(frames[1].data, '2');
  assert.match(rest, /event: c/);
});

test('extractFrames normalises CRLF', () => {
  const { frames } = extractFrames('event: a\r\ndata: 1\r\n\r\n');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].data, '1');
});

test('createSSEParser reassembles frames across arbitrary chunk boundaries', () => {
  const parser = createSSEParser();
  /** @type {import('../js/ai/sse.mjs').RawEvent[]} */
  const all = [];
  // Feed the stream 5 bytes at a time.
  for (let i = 0; i < STREAM.length; i += 5) {
    all.push(...parser.push(STREAM.slice(i, i + 5)));
  }
  all.push(...parser.flush());

  const types = all.map((f) => JSON.parse(f.data).type);
  assert.deepEqual(types, [
    'message_start',
    'content_block_delta',
    'content_block_delta',
    'message_delta',
    'message_stop',
  ]);
});
