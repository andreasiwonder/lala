// @ts-check
/**
 * The review session — spaced repetition of words you've already seen in Learn.
 * Production-oriented: the English meaning is shown first (try to *say* the
 * Turkish), then the Turkish is revealed with audio + an example, then you rate
 * recall. Each rating button shows exactly WHEN the card will come back, so the
 * Again/Hard/Good/Easy choice is self-explanatory.
 *
 * Desktop keyboard: Space/Enter/↑/↓ reveal; 1–4 rate Again/Hard/Good/Easy;
 * ← undoes the last answer; Esc quits.
 *
 * @typedef {import('../app.mjs').AppContext} AppContext
 * @typedef {import('../srs/scheduler.mjs').Rating} Rating
 * @typedef {import('../srs/scheduler.mjs').Card} Card
 */
import { el, render, signal, effect } from '../lib/reactive.mjs';
import { buildQueue } from '../srs/queue.mjs';
import { schedule } from '../srs/scheduler.mjs';
import { speak, hasTurkishVoice } from '../audio/tts.mjs';

/** @type {Array<[Rating, string, string]>} rating, label, css class */
const RATINGS = [
  ['again', 'Again', 'rate-again'],
  ['hard', 'Hard', 'rate-hard'],
  ['good', 'Good', 'rate-good'],
  ['easy', 'Easy', 'rate-easy'],
];

/**
 * @param {AppContext} ctx
 * @returns {HTMLElement}
 */
export function ReviewView(ctx) {
  const root = el('section.view.review');
  const canSpeak = hasTurkishVoice();
  const now0 = Date.now();
  const { queue } = buildQueue({ cards: ctx.cards.peek(), entryById: ctx.index, now: now0, newRemaining: 0 });

  /** @type {import('../lib/reactive.mjs').Signal<{ order: string[], pos: number, answered: number, history: { snapshot: Card, wasAgain: boolean }[] }>} */
  const session = signal({ order: queue.map((c) => c.entryId), pos: 0, answered: 0, history: [] });
  const revealed = signal(false);

  const currentCard = () => {
    const { order, pos } = session.peek();
    return ctx.cards.peek().find((c) => c.entryId === order[pos]);
  };
  const currentEntry = () => {
    const { order, pos } = session.peek();
    return ctx.index.get(order[pos]);
  };

  function doReveal() {
    if (revealed.peek()) return;
    revealed.set(true);
    const entry = currentEntry();
    if (canSpeak && entry) speak(entry.tr);
  }

  /**
   * @param {Card} card
   * @param {Rating} rating
   */
  async function rate(card, rating) {
    const snapshot = { ...card };
    await ctx.rate(card, rating);
    session.update((s) => ({
      order: rating === 'again' ? [...s.order, card.entryId] : s.order,
      pos: s.pos + 1,
      answered: s.answered + 1,
      history: [...s.history, { snapshot, wasAgain: rating === 'again' }],
    }));
    revealed.set(false);
  }

  /** Undo the last answer (restore its pre-rating state) and step back. */
  function back() {
    const s = session.peek();
    if (!s.history.length) {
      ctx.navigate('#/');
      return;
    }
    const last = s.history[s.history.length - 1];
    ctx.setCard(last.snapshot);
    session.update((cur) => ({
      order: last.wasAgain ? cur.order.slice(0, -1) : cur.order,
      pos: Math.max(0, cur.pos - 1),
      answered: Math.max(0, cur.answered - 1),
      history: cur.history.slice(0, -1),
    }));
    revealed.set(false);
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') {
      ctx.navigate('#/');
      return;
    }
    const s = session.peek();
    if (s.pos >= s.order.length) return; // done / empty screen

    if (!revealed.peek()) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        doReveal();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
      return;
    }
    /** @type {Record<string, Rating>} */
    const map = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
    const card = currentCard();
    if (map[e.key] && card) {
      e.preventDefault();
      rate(card, map[e.key]);
    } else if ((e.key === ' ' || e.key === 'Enter') && card) {
      e.preventDefault();
      rate(card, 'good');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      back();
    }
  }
  window.addEventListener('keydown', onKey);

  const dispose = effect(() => {
    const { order, pos, answered, history } = session();
    const isRevealed = revealed();

    if (order.length === 0) {
      render(root, emptyState(ctx));
      return;
    }
    if (pos >= order.length) {
      render(root, doneState(ctx, answered));
      return;
    }

    const entryId = order[pos];
    const entry = ctx.index.get(entryId);
    const card = ctx.cards().find((c) => c.entryId === entryId);
    if (!entry || !card) {
      session.update((s) => ({ ...s, pos: s.pos + 1 }));
      return;
    }

    render(
      root,
      sessionBar(ctx, answered, order.length, history.length > 0, back),
      isRevealed ? backCard(entry, card, canSpeak, rate) : frontCard(entry, doReveal),
    );
  });

  /** @type {any} */ (root).__dispose = () => {
    dispose();
    window.removeEventListener('keydown', onKey);
  };
  return root;
}

/* ------------------------------------------------------------------------- */

/**
 * @param {AppContext} ctx
 * @param {number} answered
 * @param {number} total
 * @param {boolean} canBack
 * @param {() => void} back
 */
function sessionBar(ctx, answered, total, canBack, back) {
  const pct = total ? Math.min(100, Math.round((answered / total) * 100)) : 0;
  return el(
    'header.topbar',
    null,
    el('button.icon', { onclick: () => ctx.navigate('#/'), 'aria-label': 'Quit session', title: 'Quit (Esc)' }, '✕'),
    el('button.icon', { onclick: back, disabled: !canBack, 'aria-label': 'Undo last answer', title: 'Back / undo (←)' }, '↩'),
    el('div.bar.grow', null, el('div.bar-fill', { style: `width:${pct}%` })),
    el('span.muted', null, `${answered}`),
  );
}

/**
 * @param {import('../deck/schema.mjs').Entry} entry
 * @param {() => void} onReveal
 */
function frontCard(entry, onReveal) {
  return el(
    'div.card.flashcard',
    null,
    el('div.kicker', null, entry.type === 'chunk' ? 'phrase' : entry.pos),
    el('div.prompt', null, entry.en),
    el('p.muted', null, 'Say it in Turkish, then check.'),
    el('button.primary.big', { onclick: onReveal }, 'Show answer'),
    el('p.hint.muted', null, 'Space to reveal'),
  );
}

/**
 * @param {import('../deck/schema.mjs').Entry} entry
 * @param {Card} card
 * @param {boolean} canSpeak
 * @param {(card: Card, rating: Rating) => void} rate
 */
function backCard(entry, card, canSpeak, rate) {
  const example = entry.examples[0];
  const now = Date.now();
  return el(
    'div.card.flashcard',
    null,
    el('div.kicker', null, entry.en),
    el(
      'div.answer-row',
      null,
      el('div.answer', null, entry.tr),
      canSpeak ? el('button.icon.speak', { onclick: () => speak(entry.tr), 'aria-label': 'Play pronunciation', title: 'Play' }, '🔊') : null,
    ),
    example
      ? el(
          'div.example',
          null,
          el('p.tr', null, example.tr, canSpeak ? el('button.icon.speak.small', { onclick: () => speak(example.tr), 'aria-label': 'Play example', title: 'Play' }, '🔊') : null),
          el('p.en.muted', null, example.en),
        )
      : null,
    el('p.rate-caption.muted', null, 'How well did you recall it? Your choice sets when it comes back:'),
    el(
      'div.ratings',
      null,
      ...RATINGS.map(([rating, label, cls], i) => {
        const preview = schedule(card, rating, now);
        return el(
          `button.${cls}`,
          { onclick: () => rate(card, rating), title: `Key ${i + 1}` },
          el('span.rate-label', null, label),
          el('span.rate-int', null, formatInterval(preview.due - now)),
        );
      }),
    ),
  );
}

/**
 * Human-friendly "next due in" from a millisecond gap.
 * @param {number} ms
 * @returns {string}
 */
function formatInterval(ms) {
  if (ms < 60_000) return '<1 min';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo`;
  return `${Math.round(days / 365)} yr`;
}

/** @param {AppContext} ctx */
function emptyState(ctx) {
  return el(
    'div.card.center',
    null,
    el('div.big-emoji', null, '🎉'),
    el('h2', null, 'Nothing due right now'),
    el('p.muted', null, 'Learn some new words, or come back later as cards become due.'),
    el('button.primary', { onclick: () => ctx.navigate('#/learn') }, 'Learn new words'),
    el('button.link', { onclick: () => ctx.navigate('#/') }, 'Back to Today'),
  );
}

/** @param {AppContext} ctx @param {number} answered */
function doneState(ctx, answered) {
  return el(
    'div.card.center',
    null,
    el('div.big-emoji', null, '👏'),
    el('h2', null, 'Session complete'),
    el('p.muted', null, `You reviewed ${answered} card${answered === 1 ? '' : 's'}. Harika!`),
    el('button.primary', { onclick: () => ctx.navigate('#/') }, 'Back to Today'),
  );
}
