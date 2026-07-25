// @ts-check
/**
 * The review session — the heart of Phase 1. Production-oriented flashcards:
 * the English meaning is shown first (try to *say* it in Turkish), then the
 * Turkish is revealed with audio and an example sentence, then you rate recall.
 *
 * The session queue is snapshotted once at start (so it doesn't reshuffle
 * mid-session as due times change); an "Again" rating re-queues the card to the
 * end so it comes back before you finish.
 *
 * @typedef {import('../app.mjs').AppContext} AppContext
 * @typedef {import('../srs/scheduler.mjs').Rating} Rating
 */
import { el, render, signal, effect } from '../lib/reactive.mjs';
import { buildQueue } from '../srs/queue.mjs';
import { speak, hasTurkishVoice } from '../audio/tts.mjs';

/** @type {Array<[Rating, string, string]>} label + key hint */
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
  const now0 = Date.now();
  // Review tests only cards you've already been shown in Learn — new words are
  // introduced there, not here — so no new cards enter the review queue.
  const { queue } = buildQueue({
    cards: ctx.cards.peek(),
    entryById: ctx.index,
    now: now0,
    newRemaining: 0,
  });

  const session = signal({ order: queue.map((c) => c.entryId), pos: 0, answered: 0 });
  const revealed = signal(false);
  const canSpeak = hasTurkishVoice();

  /**
   * @param {import('../srs/scheduler.mjs').Card} card
   * @param {Rating} rating
   */
  async function rate(card, rating) {
    await ctx.rate(card, rating);
    session.update((s) => ({
      order: rating === 'again' ? [...s.order, card.entryId] : s.order,
      pos: s.pos + 1,
      answered: s.answered + 1,
    }));
    revealed.set(false);
  }

  const dispose = effect(() => {
    const { order, pos, answered } = session();
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
      // Orphaned card with no deck entry — skip it.
      session.update((s) => ({ ...s, pos: s.pos + 1 }));
      return;
    }

    render(
      root,
      sessionBar(ctx, answered, order.length),
      isRevealed
        ? backCard(entry, card, canSpeak, rate)
        : frontCard(entry, () => {
            revealed.set(true);
            if (canSpeak) speak(entry.tr);
          }),
    );
  });

  /** @type {any} */ (root).__dispose = dispose;
  return root;
}

/**
 * @param {AppContext} ctx
 * @param {number} answered
 * @param {number} total
 */
function sessionBar(ctx, answered, total) {
  const pct = total ? Math.min(100, Math.round((answered / total) * 100)) : 0;
  return el(
    'header.topbar',
    null,
    el('button.icon', { onclick: () => ctx.navigate('#/'), 'aria-label': 'Quit session', title: 'Quit' }, '✕'),
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
  );
}

/**
 * @param {import('../deck/schema.mjs').Entry} entry
 * @param {import('../srs/scheduler.mjs').Card} card
 * @param {boolean} canSpeak
 * @param {(card: import('../srs/scheduler.mjs').Card, rating: import('../srs/scheduler.mjs').Rating) => void} rate
 */
function backCard(entry, card, canSpeak, rate) {
  const example = entry.examples[0];
  return el(
    'div.card.flashcard',
    null,
    el('div.kicker', null, entry.en),
    el(
      'div.answer-row',
      null,
      el('div.answer', null, entry.tr),
      canSpeak
        ? el('button.icon.speak', { onclick: () => speak(entry.tr), 'aria-label': 'Play pronunciation', title: 'Play' }, '🔊')
        : null,
    ),
    example
      ? el(
          'div.example',
          null,
          el(
            'p.tr',
            null,
            example.tr,
            canSpeak
              ? el('button.icon.speak.small', { onclick: () => speak(example.tr), 'aria-label': 'Play example', title: 'Play' }, '🔊')
              : null,
          ),
          el('p.en.muted', null, example.en),
        )
      : null,
    entry.notes ? el('p.notes.muted', null, entry.notes) : null,
    el(
      'div.ratings',
      null,
      ...RATINGS.map(([rating, label, cls]) =>
        el(`button.${cls}`, { onclick: () => rate(card, rating) }, label),
      ),
    ),
  );
}

/** @param {AppContext} ctx */
function emptyState(ctx) {
  return el(
    'div.card.center',
    null,
    el('div.big-emoji', null, '🎉'),
    el('h2', null, 'Nothing due right now'),
    el('p.muted', null, 'Come back later, or raise your daily pace in Settings.'),
    el('button.primary', { onclick: () => ctx.navigate('#/') }, 'Back to Today'),
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
