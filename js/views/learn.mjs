// @ts-check
/**
 * Learn view — the *presentation* step before testing. The whole batch of new
 * words stays on screen the entire time as a "word wall" (so they keep getting
 * reinforced visually), with the current one enlarged as a focus card above.
 * Advance through the words, then their short example sentences; the batch then
 * enters spaced-repetition review.
 *
 * Built imperatively so the wall stays put while the focus card and highlight
 * move.
 *
 * @typedef {import('../app.mjs').AppContext} AppContext
 * @typedef {'words' | 'sentences' | 'done'} Phase
 * @typedef {import('../deck/schema.mjs').Entry} Entry
 */
import { el, render } from '../lib/reactive.mjs';
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
  const root = el('section.view.learn-view');
  const canSpeak = hasTurkishVoice();

  const limit = Math.min(BATCH_SIZE, newRemaining(ctx.settings.peek(), dayKey(Date.now())));
  const batchCards = newBatch(ctx.cards.peek(), ctx.index, limit);
  const words = batchCards
    .map((c) => ctx.index.get(c.entryId))
    .filter(/** @returns {e is Entry} */ (e) => Boolean(e));
  // One "sentence card" per word, aligned 1:1 (fall back to the word if it has
  // no example) so the wall highlight maps directly in both phases.
  const sentences = words.map((w) => (w.examples[0] ? { tr: w.examples[0].tr, en: w.examples[0].en } : { tr: w.tr, en: w.en }));

  if (!words.length) {
    root.append(emptyState(ctx));
    return root;
  }

  /** @type {Phase} */
  let phase = 'words';
  let idx = 0;
  let maxSeen = 0;
  let lastSpoken = '';
  const introduced = new Set();

  const headerEl = el('header.topbar');
  const mainEl = el('div.learn-main');
  const wallEl = el('div.word-wall');
  const footerEl = el('div.learn-footer');
  root.append(headerEl, mainEl, wallEl, footerEl);

  // The word wall is built once and reused throughout the session.
  const chips = words.map((w, i) =>
    el('button.wordchip', { onclick: () => select(i) }, el('span.chip-tr', null, w.tr), el('span.chip-en', null, w.en)),
  );
  wallEl.append(...chips);

  function total() {
    return phase === 'words' ? words.length : sentences.length;
  }

  function maybeSpeak() {
    const key = `${phase}:${idx}`;
    if (!canSpeak || phase === 'done' || key === lastSpoken) return;
    lastSpoken = key;
    const it = phase === 'words' ? words[idx] : sentences[idx];
    if (it) speak(it.tr);
  }

  function introduceCurrent() {
    if (phase !== 'words' || introduced.has(idx)) return;
    introduced.add(idx);
    ctx.introduce(batchCards[idx]); // idempotent; counts the word as learned
  }

  function paintWall() {
    if (phase === 'words') maxSeen = Math.max(maxSeen, idx);
    const allSeen = phase !== 'words';
    chips.forEach((chip, i) => {
      const active = i === idx && phase !== 'done';
      chip.classList.toggle('active', active);
      chip.classList.toggle('seen', !active && (allSeen || i <= maxSeen || phase === 'done'));
    });
  }

  function renderMain() {
    if (phase === 'done') {
      render(mainEl, doneState(ctx, words.length));
      return;
    }
    render(mainEl, phase === 'words' ? wordCard(words[idx], canSpeak) : sentenceCard(words[idx], sentences[idx], canSpeak));
  }

  function renderChrome() {
    const t = total();
    const pct = phase === 'done' ? 100 : Math.round(((idx + 1) / t) * 100);
    render(
      headerEl,
      el('button.icon', { onclick: () => ctx.navigate('#/'), 'aria-label': 'Quit', title: 'Quit (Esc)' }, '✕'),
      el('div.bar.grow', null, el('div.bar-fill', { style: `width:${pct}%` })),
      el('span.muted', null, phase === 'done' ? '' : `${idx + 1}/${t}`),
    );
    render(
      footerEl,
      phase === 'done'
        ? null
        : el('button.primary.big', { onclick: onNext }, idx + 1 < t ? 'Next' : phase === 'words' ? 'See sentences →' : 'Done ✓'),
    );
  }

  function refresh() {
    introduceCurrent();
    renderMain();
    paintWall();
    renderChrome();
    maybeSpeak();
  }

  /** @param {number} i */
  function select(i) {
    if (phase === 'done' || i < 0 || i >= total()) return;
    idx = i;
    refresh();
  }

  function onNext() {
    if (idx + 1 < total()) select(idx + 1);
    else advancePhase();
  }

  function prev() {
    if (idx > 0) select(idx - 1);
  }

  function advancePhase() {
    if (phase === 'words') {
      phase = 'sentences';
      idx = 0;
      lastSpoken = '';
      refresh();
    } else {
      finish();
    }
  }

  function finish() {
    phase = 'done';
    // Ensure the whole batch is introduced (e.g. if they jumped around).
    batchCards.forEach((c, i) => {
      if (!introduced.has(i)) {
        introduced.add(i);
        ctx.introduce(c);
      }
    });
    renderMain();
    paintWall();
    renderChrome();
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') {
      ctx.navigate('#/');
      return;
    }
    if (phase === 'done') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onNext();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      prev();
    }
  }
  window.addEventListener('keydown', onKey);

  refresh();
  /** @type {any} */ (root).__dispose = () => window.removeEventListener('keydown', onKey);
  return root;
}

/* ------------------------------------------------------------------------- */

/**
 * @param {Entry} entry
 * @param {boolean} canSpeak
 */
function wordCard(entry, canSpeak) {
  return el(
    'div.card.flashcard.learn-card',
    null,
    el('div.kicker', null, entry.type === 'chunk' ? 'phrase' : entry.pos),
    el(
      'div.answer-row',
      null,
      el('div.answer', null, entry.tr),
      canSpeak ? el('button.icon.speak', { onclick: () => speak(entry.tr), 'aria-label': 'Play', title: 'Play' }, '🔊') : null,
    ),
    el('div.learn-en', null, entry.en),
  );
}

/**
 * @param {Entry} word
 * @param {{ tr: string, en: string }} s
 * @param {boolean} canSpeak
 */
function sentenceCard(word, s, canSpeak) {
  return el(
    'div.card.flashcard.learn-card',
    null,
    el('div.kicker', null, word.tr),
    el(
      'div.answer-row',
      null,
      el('div.answer.sentence', null, s.tr),
      canSpeak ? el('button.icon.speak', { onclick: () => speak(s.tr), 'aria-label': 'Play', title: 'Play' }, '🔊') : null,
    ),
    el('div.learn-en', null, s.en),
  );
}

/** @param {AppContext} ctx */
function emptyState(ctx) {
  return el(
    'div.card.center',
    null,
    el('div.big-emoji', null, '✅'),
    el('h2', null, 'No new words right now'),
    el('p.muted', null, 'You’ve hit today’s new-word target (raise it in Settings), or you’ve seen the whole deck. Time to review!'),
    el('button.primary', { onclick: () => ctx.navigate('#/review') }, 'Go to review'),
    el('button.link', { onclick: () => ctx.navigate('#/') }, 'Back to Today'),
  );
}

/** @param {AppContext} ctx @param {number} count */
function doneState(ctx, count) {
  return el(
    'div.card.center.learn-card',
    null,
    el('div.big-emoji', null, '🌱'),
    el('h2', null, `Learned ${count} word${count === 1 ? '' : 's'}`),
    el('p.muted', null, 'They’re now in your reviews. Lock them in with a quick review.'),
    el('button.primary', { onclick: () => ctx.navigate('#/review') }, 'Review now'),
    el('button.link', { onclick: () => ctx.navigate('#/') }, 'Back to Today'),
  );
}
