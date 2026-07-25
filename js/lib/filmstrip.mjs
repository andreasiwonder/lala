// @ts-check
/**
 * A horizontal "coverflow" filmstrip: the centered card is large and full
 * opacity, neighbours peek at reduced scale/opacity on both sides. Driven by
 * native scroll-snap (so touch swipe works for free) plus `goTo(i)` for
 * button-driven navigation. Purely imperative DOM — built once and reused, so
 * scrolling isn't reset by re-renders.
 *
 * @typedef {object} Filmstrip
 * @property {HTMLElement} el
 * @property {(i: number, smooth?: boolean) => void} goTo
 * @property {() => number} current
 * @property {() => void} destroy
 */
import { el } from './reactive.mjs';

/**
 * @param {object} args
 * @param {any[]} args.items
 * @param {(item: any, i: number) => HTMLElement} args.renderCard
 * @param {(index: number) => void} [args.onSettle]  called when scrolling settles on a card
 * @returns {Filmstrip}
 */
export function createFilmstrip({ items, renderCard, onSettle }) {
  const container = el('div.filmstrip');
  const cards = items.map((item, i) => {
    const wrap = el('div.strip-card', null, renderCard(item, i));
    wrap.dataset.index = String(i);
    // Tapping a peeking card brings it to centre.
    wrap.addEventListener('click', () => goTo(i));
    return wrap;
  });
  container.append(...cards);

  /** @type {ReturnType<typeof setTimeout> | null} */
  let settleTimer = null;
  let rafPending = false;

  function nearestIndex() {
    const box = container.getBoundingClientRect();
    const center = box.left + box.width / 2;
    let best = 0;
    let bestDist = Infinity;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function paintActive() {
    rafPending = false;
    const idx = nearestIndex();
    cards.forEach((c, i) => c.classList.toggle('is-active', i === idx));
  }

  function onScroll() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(paintActive);
    }
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => onSettle?.(nearestIndex()), 130);
  }
  container.addEventListener('scroll', onScroll, { passive: true });

  /** @param {number} i @param {boolean} [smooth] */
  function goTo(i, smooth = true) {
    const card = cards[i];
    if (!card) return;
    card.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', inline: 'center', block: 'nearest' });
    requestAnimationFrame(paintActive);
  }

  requestAnimationFrame(paintActive);

  return {
    el: container,
    goTo,
    current: nearestIndex,
    destroy() {
      container.removeEventListener('scroll', onScroll);
      if (settleTimer) clearTimeout(settleTimer);
    },
  };
}
