// @ts-check
/**
 * Learn view — the *presentation* step that precedes testing. Shows the next
 * batch of new words (≤10, capped by the daily new limit) as a coverflow
 * filmstrip: the current word is big in the centre, the ones you've just seen
 * peek beside it so the whole batch prints into memory. Then their short
 * example sentences, then the batch moves into spaced-repetition review.
 *
 * Built imperatively (not via a re-rendering effect) so the filmstrip's scroll
 * position survives navigation.
 *
 * @typedef {import('../app.mjs').AppContext} AppContext
 * @typedef {'words' | 'sentences' | 'done'} Phase
 * @typedef {import('../deck/schema.mjs').Entry} Entry
 */
import { el, render } from '../lib/reactive.mjs';
import { createFilmstrip } from '../lib/filmstrip.mjs';
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
  const sentences = words
    .filter((w) => w.examples[0])
    .map((w) => ({ tr: w.examples[0].tr, en: w.examples[0].en, word: w.tr }));

  if (!words.length) {
    root.append(emptyState(ctx));
    return root;
  }

  /** @type {Phase} */
  let phase = 'words';
  let pos = 0;
  let lastSpoken = -1;
  /** @type {import('../lib/filmstrip.mjs').Filmstrip | null} */
  let strip = null;

  const headerEl = el('header.topbar');
  const bodyEl = el('div.learn-body');
  const footerEl = el('div.learn-footer');
  root.append(headerEl, bodyEl, footerEl);

  const items = () => (phase === 'words' ? words : sentences);

  function maybeSpeak() {
    if (!canSpeak || pos === lastSpoken) return;
    lastSpoken = pos;
    const it = items()[pos];
    if (it) speak(it.tr);
  }

  function updateChrome() {
    const total = items().length || 1;
    const pct = phase === 'done' ? 100 : Math.round(((pos + 1) / total) * 100);
    render(
      headerEl,
      el('button.icon', { onclick: () => ctx.navigate('#/'), 'aria-label': 'Quit', title: 'Quit' }, '✕'),
      el('div.bar.grow', null, el('div.bar-fill', { style: `width:${pct}%` })),
      el('span.muted', null, phase === 'done' ? '' : `${pos + 1}/${total}`),
    );
    render(
      footerEl,
      phase === 'done'
        ? null
        : el(
            'button.primary.big',
            { onclick: onNext },
            pos + 1 < total ? 'Next' : phase === 'words' && sentences.length ? 'See sentences →' : 'Done ✓',
          ),
    );
  }

  function mountPhase() {
    if (strip) {
      strip.destroy();
      strip = null;
    }
    bodyEl.replaceChildren();
    pos = 0;
    lastSpoken = -1;

    if (phase === 'done') {
      bodyEl.append(doneState(ctx, words.length));
      updateChrome();
      return;
    }

    const list = items();
    strip = createFilmstrip({
      items: list,
      renderCard: phase === 'words' ? (w) => wordCard(w, canSpeak) : (s) => sentenceCard(s, canSpeak),
      onSettle: (i) => {
        pos = i;
        updateChrome();
        maybeSpeak();
      },
    });
    bodyEl.append(strip.el);
    updateChrome();
    maybeSpeak();
    requestAnimationFrame(() => strip?.goTo(0, false));
  }

  function onNext() {
    const list = items();
    if (pos + 1 < list.length) strip?.goTo(pos + 1);
    else advancePhase();
  }

  function prev() {
    if (strip && pos > 0) strip.goTo(pos - 1);
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

  function advancePhase() {
    if (phase === 'words' && sentences.length) {
      phase = 'sentences';
      mountPhase();
    } else {
      finish();
    }
  }

  function finish() {
    phase = 'done';
    mountPhase();
    Promise.all(batchCards.map((c) => ctx.introduce(c)));
  }

  mountPhase();
  /** @type {any} */ (root).__dispose = () => {
    window.removeEventListener('keydown', onKey);
    strip?.destroy();
  };
  return root;
}

/* ------------------------------------------------------------------------- */

/**
 * @param {Entry} entry
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
    el('div.learn-en', null, entry.en),
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
    'div.card.center',
    null,
    el('div.big-emoji', null, '🌱'),
    el('h2', null, `Learned ${count} new word${count === 1 ? '' : 's'}`),
    el('p.muted', null, 'They’re now in your reviews. Lock them in with a quick review.'),
    el('button.primary', { onclick: () => ctx.navigate('#/review') }, 'Review now'),
    el('button.link', { onclick: () => ctx.navigate('#/') }, 'Back to Today'),
  );
}
