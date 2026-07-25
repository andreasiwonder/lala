// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSystemPrompt,
  splitCorrection,
  translatePrompt,
  glossPrompt,
  CORRECTION_MARKER,
  SCENARIOS,
} from '../js/ai/prompts.mjs';
import { knownVocab, vocabList } from '../js/ai/vocab.mjs';
import { createCard } from '../js/srs/scheduler.mjs';

/** @param {Partial<import('../js/deck/schema.mjs').Entry>} e */
function entry(e) {
  return {
    id: e.id ?? 'x',
    tr: e.tr ?? 'x',
    en: e.en ?? 'x',
    pos: 'noun',
    type: e.type ?? 'word',
    freqRank: e.freqRank ?? 1,
    difficulty: 1,
    tags: [],
    unitId: 'u',
    examples: [],
    audio: null,
    notes: '',
  };
}

const SCENARIO = SCENARIOS[0];

test('buildSystemPrompt injects known words, level, goal, scenario, and the marker', () => {
  const vocab = [entry({ tr: 'merhaba' }), entry({ tr: 'evet' })];
  const prompt = buildSystemPrompt({ level: 'beginner', goal: 'travel', vocab, scenario: SCENARIO });
  assert.match(prompt, /merhaba, evet/);
  assert.match(prompt, /absolute beginner/i);
  assert.match(prompt, /travel/i);
  assert.ok(prompt.includes(CORRECTION_MARKER));
  assert.ok(prompt.includes(SCENARIO.system));
});

test('buildSystemPrompt tolerates an empty vocabulary', () => {
  const prompt = buildSystemPrompt({ level: 'a1', goal: 'daily', vocab: [], scenario: SCENARIO });
  assert.match(prompt, /none yet/i);
});

test('splitCorrection returns the whole text as reply when no marker', () => {
  const { reply, correction } = splitCorrection('Merhaba! Nasılsın?');
  assert.equal(reply, 'Merhaba! Nasılsın?');
  assert.equal(correction, '');
});

test('splitCorrection separates reply from correction block', () => {
  const text = `İyiyim, sen nasılsın?\n${CORRECTION_MARKER}\n- you wrote "ben iyi" → better: "ben iyiyim"`;
  const { reply, correction } = splitCorrection(text);
  assert.equal(reply, 'İyiyim, sen nasılsın?');
  assert.match(correction, /ben iyiyim/);
});

test('splitCorrection is safe on partial streaming text mid-marker', () => {
  // The marker is only partially streamed; nothing should split yet.
  const { reply, correction } = splitCorrection('Tamam.\n---DÜZE');
  assert.equal(reply, 'Tamam.\n---DÜZE');
  assert.equal(correction, '');
});

test('translatePrompt and glossPrompt produce instruction + user parts', () => {
  const t = translatePrompt('Merhaba');
  assert.match(t.system, /translator/i);
  assert.match(t.user, /Merhaba/);
  const g = glossPrompt('merhaba');
  assert.match(g.system, /one Turkish word/i);
  assert.match(g.user, /merhaba/);
});

test('knownVocab filters new cards, sorts by frequency, and respects the limit', () => {
  const index = new Map([
    ['a', entry({ id: 'a', tr: 'aa', freqRank: 30 })],
    ['b', entry({ id: 'b', tr: 'bb', freqRank: 5 })],
    ['c', entry({ id: 'c', tr: 'cc', freqRank: 10 })],
  ]);
  const cards = [
    { ...createCard('a', 0), state: /** @type {const} */ ('review') },
    { ...createCard('b', 0), state: /** @type {const} */ ('learning') },
    { ...createCard('c', 0) }, // still new → excluded
  ];
  const vocab = knownVocab(cards, /** @type {any} */ (index));
  assert.deepEqual(vocab.map((e) => e.tr), ['bb', 'aa']); // c excluded, sorted by freqRank
  assert.equal(vocabList(vocab), 'bb, aa');

  const limited = knownVocab(cards, /** @type {any} */ (index), { limit: 1 });
  assert.deepEqual(limited.map((e) => e.tr), ['bb']);
});
