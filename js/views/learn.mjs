// @ts-check
/**
 * Learn view — the *presentation* step that precedes testing. Shows the next
 * batch of new words (≤10, capped by the daily new limit) as word + translation
 * with audio, then their super-short example sentences, then moves them into the
 * spaced-repetition review pipeline. Short and efficient: hear it, read it,
 * next. The Review screen then handles the repetition.
 *
 * @typedef {import('../app.mjs').AppContext} AppContext
 * @typedef {'words' | 'sentences' | 'done'} Phase
 */
import { el, render, signal, effect } from '../lib/reactive.mjs';
import { newBatch } from '../srs/queue.mjs';
import { newRemaining } from '../store/settings.mjs';
import { dayKey } from '../lib/day.mjs';
import { speak, hasTurkishVoice } from '../audio/tts.mjs';

const BATCH_SIZE = 10;

/**
 * @param {AppContext} ctx
 * @returns {HTMLElement}
 */
export function LearnView(ctx) {
  const root = el('section.view');
  const canSpeak = hasTurkishVoice();

  const limit = Math.min(BATCH_SIZE, newRemaining(ctx.settings.peek(), dayKey(Date.now())));
  const batchCards = newBatch(ctx.cards.peek(), ctx.index, limit);
  const words = batchCards.map((c) => ctx.index.get(c.entryId)).filter(/** @returns {e is import('../deck/schema.mjs').Entry} */ (e) => Boolean(e));
  const sentences = words
    .filter((w) => w.examples[0])
    .map((w) => ({ tr: w.examples[0].tr, en: w.examples[0].en, word: w.tr }));

  /** @type {import('../lib/reactive.mjs').Signal<Phase>} */
  const phase = signal('words');
  const pos = signal(0);
  let lastSpoken = '';

  function finish() {
    phase.set('done');
    Promise.all(batchCards.map((c) => ctx.introduce(c)));
  }

  function advance() {
    const p = phase.peek();
    const i = pos.peek();
    if (p === 'words') {
      if (i + 1 < words.length) pos.set(i + 1);
      else if (sentences.length) {
        phase.set('sentences');
        pos.set(0);
      } else finish();
    } else if (p === 'sentences') {
      if (i + 1 < sentences.length) pos.set(i + 1);
      else finish();
    }
  }

  if (!words.length) {
    render(root, emptyState(ctx));
    return root;
  }

  const dispose = effect(() => {
    const p = phase();
    const i = pos();

    if (p === 'done') {
      render(root, doneState(ctx, words.length));
      return;
    }

    const isWords = p === 'words';
    const list = isWords ? words : sentences;
    const total = list.length;
    const current = list[i];

    // Auto-play the Turkish audio once per card.
    const key = `${p}:${i}`;
    if (canSpeak && current && key !== lastSpoken) {
      lastSpoken = key;
      speak(isWords ? /** @type {any} */ (current).tr : /** @type {any} */ (current).tr);
    }

    render(
      root,
      learnBar(ctx, isWords ? 'Learn' : 'Sentences', i + 1, total),
      isWords
        ? wordCard(/** @type {any} */ (current), canSpeak)
        : sentenceCard(/** @type {any} */ (current), canSpeak),
      el('button.primary.big', { onclick: advance }, i + 1 < total ? 'Next' : isWords && sentences.length ? 'See sentences' : 'Done'),
    );
  });

  /** @type {any} */ (root).__dispose = dispose;
  return root;
}

/**
 * @param {AppContext} ctx
 * @param {string} label
 * @param {number} n
 * @param {number} total
 */
function learnBar(ctx, label, n, total) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return el(
    'header.topbar',
    null,
    el('button.icon', { onclick: () => ctx.navigate('#/'), 'aria-label': 'Quit', title: 'Quit' }, '✕'),
    el('div.bar.grow', null, el('div.bar-fill', { style: `width:${pct}%` })),
    el('span.muted', null, `${n}/${total}`),
  );
}

/**
 * @param {import('../deck/schema.mjs').Entry} entry
 * @param {boolean} canSpeak
 */
function wordCard(entry, canSpeak) {
  return el(
    'div.card.flashcard',
    null,
    el('div.kicker', null, entry.type === 'chunk' ? 'phrase' : entry.pos),
    el(
      'div.answer-row',
      null,
      el('div.answer', null, entry.tr),
      canSpeak ? el('button.icon.speak', { onclick: () => speak(entry.tr), 'aria-label': 'Play', title: 'Play' }, '🔊') : null,
    ),
    el('div.prompt.learn-en', null, entry.en),
    entry.notes ? el('p.notes.muted', null, entry.notes) : null,
  );
}

/**
 * @param {{ tr: string, en: string, word: string }} s
 * @param {boolean} canSpeak
 */
function sentenceCard(s, canSpeak) {
  return el(
    'div.card.flashcard',
    null,
    el('div.kicker', null, s.word),
    el(
      'div.answer-row',
      null,
      el('div.answer.sentence', null, s.tr),
      canSpeak ? el('button.icon.speak', { onclick: () => speak(s.tr), 'aria-label': 'Play', title: 'Play' }, '🔊') : null,
    ),
    el('div.prompt.learn-en', null, s.en),
  );
}

/** @param {AppContext} ctx */
function emptyState(ctx) {
  return el(
    'section.view',
    null,
    el(
      'div.card.center',
      null,
      el('div.big-emoji', null, '✅'),
      el('h2', null, 'No new words right now'),
      el('p.muted', null, 'You’ve hit today’s new-word target (raise it in Settings), or you’ve seen the whole deck. Time to review!'),
      el('button.primary', { onclick: () => ctx.navigate('#/review') }, 'Go to review'),
      el('button.link', { onclick: () => ctx.navigate('#/') }, 'Back to Today'),
    ),
  );
}

/** @param {AppContext} ctx @param {number} count */
function doneState(ctx, count) {
  return el(
    'div.card.center',
    null,
    el('div.big-emoji', null, '🌱'),
    el('h2', null, `Learned ${count} new word${count === 1 ? '' : 's'}`),
    el('p.muted', null, 'They’re now in your reviews. Lock them in with a quick review.'),
    el('button.primary', { onclick: () => ctx.navigate('#/review') }, 'Review now'),
    el('button.link', { onclick: () => ctx.navigate('#/') }, 'Back to Today'),
  );
}
