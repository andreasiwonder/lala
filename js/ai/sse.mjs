// @ts-check
/**
 * A minimal, pure Server-Sent Events parser for the Anthropic streaming
 * response. Kept separate from the network client so it can be unit-tested
 * against fixtures without ever hitting the live API.
 *
 * SSE frames are separated by a blank line; within a frame, `event:` names it
 * and one or more `data:` lines carry the payload (joined with newlines).
 * Anthropic sends `\n\n`-separated frames; we normalise `\r\n` defensively.
 *
 * @typedef {{ event: string, data: string }} RawEvent
 */

/**
 * Parse one complete frame (its lines, no trailing blank line).
 * @param {string} block
 * @returns {RawEvent}
 */
export function parseFrame(block) {
  let event = 'message';
  /** @type {string[]} */
  const dataLines = [];
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue; // blank or comment
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  return { event, data: dataLines.join('\n') };
}

/**
 * Pull all *complete* frames out of a buffer, returning the parsed frames and
 * the leftover (incomplete) tail to carry into the next chunk.
 * @param {string} buffer
 * @returns {{ frames: RawEvent[], rest: string }}
 */
export function extractFrames(buffer) {
  const normalised = buffer.replace(/\r\n/g, '\n');
  const parts = normalised.split('\n\n');
  const rest = parts.pop() ?? '';
  const frames = parts
    .filter((p) => p.trim() !== '')
    .map(parseFrame);
  return { frames, rest };
}

/**
 * Stateful incremental parser. Feed it decoded text chunks; get back complete
 * frames each time. `flush()` emits any trailing frame with no blank line.
 * @returns {{ push(chunk: string): RawEvent[], flush(): RawEvent[] }}
 */
export function createSSEParser() {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      const { frames, rest } = extractFrames(buffer);
      buffer = rest;
      return frames;
    },
    flush() {
      const tail = buffer.trim();
      buffer = '';
      return tail ? [parseFrame(tail)] : [];
    },
  };
}
