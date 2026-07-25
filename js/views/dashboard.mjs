// @ts-check
/**
 * The "Today" home screen: streak, what's due, overall progress, and the
 * primary call to action — start a review session. Re-renders reactively when
 * cards or settings change (e.g. right after a session).
 *
 * @typedef {import('../app.mjs').AppContext} AppContext
 */
import { el, render, effect } from '../lib/reactive.mjs';
import { buildQueue, summarize, newBatch } from '../srs/queue.mjs';
import { newRemaining } from '../store/settings.mjs';
import { dayKey } from '../lib/day.mjs';

/**
 * @param {AppContext} ctx
 * @returns {HTMLElement}
 */
export function DashboardView(ctx) {
  const root = el('section.view');

  const dispose = effect(() => {
    const cards = ctx.cards();
    const settings = ctx.settings();
    const now = Date.now();
    const today = dayKey(now);
    const remaining = newRemaining(settings, today);
    // Review counts exclude new words — those are introduced in Learn.
    const { counts } = buildQueue({ cards, entryById: ctx.index, now, newRemaining: 0 });
    const summary = summarize(cards, now);
    const toLearn = newBatch(cards, ctx.index, remaining).length;
    const dueTotal = counts.review + counts.learning;

    render(
      root,
      el(
        'header.topbar',
        null,
        el('h1', null, 'Konuş'),
        el('div.spacer'),
        streakChip(settings.streak),
        iconButton('⚙️', 'Settings', () => ctx.navigate('#/settings')),
      ),
      el(
        'div.card.today',
        null,
        el('h2', null, 'Today'),
        el(
          'div.counts',
          null,
          countPill(toLearn, 'to learn'),
          countPill(dueTotal, 'to review'),
          countPill(summary.learned, 'learned'),
        ),
        toLearn > 0
          ? el('button.primary.big', { onclick: () => ctx.navigate('#/learn') }, `🌱 Learn ${toLearn} new word${toLearn === 1 ? '' : 's'}`)
          : null,
        el(
          `button.big.${dueTotal > 0 ? 'primary' : 'secondary'}`,
          { disabled: dueTotal === 0, onclick: () => ctx.navigate('#/review') },
          dueTotal > 0 ? `🔁 Review ${dueTotal} card${dueTotal === 1 ? '' : 's'}` : '🔁 Nothing to review yet',
        ),
        el('button.secondary.big', { onclick: () => ctx.navigate('#/chat') }, '💬 Practice speaking'),
        toLearn === 0 && dueTotal === 0
          ? el('p.muted', null, 'All caught up 🎉 Raise your daily pace in Settings to learn more today.')
          : null,
      ),
      progressCard(ctx),
    );
  });

  /** @type {any} */ (root).__dispose = dispose;
  return root;
}

/**
 * @param {AppContext} ctx
 * @returns {HTMLElement}
 */
function progressCard(ctx) {
  const cards = ctx.cards.peek();
  const learnedByEntry = new Map(cards.map((c) => [c.entryId, c.state !== 'new']));
  const rows = ctx.deck.units.map((unit) => {
    const total = unit.entryIds.length;
    const learned = unit.entryIds.filter((id) => learnedByEntry.get(id)).length;
    const pct = total ? Math.round((learned / total) * 100) : 0;
    return el(
      'div.unit-row',
      null,
      el('div.unit-head', null, el('span', null, unit.title), el('span.muted', null, `${learned}/${total}`)),
      el('div.bar', null, el('div.bar-fill', { style: `width:${pct}%` })),
    );
  });
  return el('div.card', null, el('h2', null, 'Progress'), ...rows);
}

/** @param {number} streak */
function streakChip(streak) {
  return el('div.chip', { title: 'Day streak' }, `🔥 ${streak}`);
}

/** @param {number} n @param {string} label */
function countPill(n, label) {
  return el('div.pill', null, el('span.pill-n', null, String(n)), el('span.pill-l', null, label));
}

/** @param {string} glyph @param {string} label @param {() => void} onclick */
function iconButton(glyph, label, onclick) {
  return el('button.icon', { onclick, 'aria-label': label, title: label }, glyph);
}
