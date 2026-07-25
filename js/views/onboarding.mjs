// @ts-check
/**
 * First-run onboarding. Captures the three things that tune pacing and (later)
 * the AI tutor's difficulty: current level, primary goal, and a daily new-card
 * target. Everything is a reasonable default so it's one tap to finish.
 *
 * @typedef {import('../app.mjs').AppContext} AppContext
 */
import { el, render } from '../lib/reactive.mjs';
import { update } from '../store/settings.mjs';

/** @type {[string, string][]} */
const LEVELS = [
  ['beginner', 'Absolute beginner'],
  ['a1', 'A1 — a few words'],
  ['a2', 'A2 — basic phrases'],
  ['b1', 'B1 — simple conversations'],
];

/** @type {[string, string][]} */
const GOALS = [
  ['daily', 'Daily life'],
  ['travel', 'Travel'],
  ['family', 'Family & friends'],
  ['work', 'Work'],
];

/** @type {[number, string][]} */
const PACES = [
  [5, 'Relaxed — 5 new/day'],
  [10, 'Steady — 10 new/day'],
  [20, 'Intense — 20 new/day'],
];

/**
 * @param {AppContext} ctx
 * @returns {HTMLElement}
 */
export function OnboardingView(ctx) {
  const s = ctx.settings.peek();
  const root = el('section.view.onboarding');

  const levelSel = selectField('Your Turkish right now', LEVELS, s.level);
  const goalSel = selectField('What do you want it for?', GOALS, s.goal);
  const paceSel = selectField('Daily pace', PACES, s.dailyNewLimit);

  const form = el(
    'form.card.stack',
    {
      onsubmit: (/** @type {Event} */ e) => {
        e.preventDefault();
        const next = update({
          onboarded: true,
          level: /** @type {any} */ (levelSel.value),
          goal: /** @type {any} */ (goalSel.value),
          dailyNewLimit: Number(paceSel.value),
        });
        ctx.settings.set(next);
        ctx.navigate('#/');
      },
    },
    el('h1', null, 'Hoş geldin! 👋'),
    el('p.muted', null, 'Let’s learn to actually speak Turkish. Three quick choices:'),
    levelSel.field,
    goalSel.field,
    paceSel.field,
    el('button.primary', { type: 'submit' }, 'Start learning'),
  );

  render(root, form);
  return root;
}

/**
 * @param {string} label
 * @param {Array<[string | number, string]>} options
 * @param {string | number} value
 * @returns {{ field: HTMLElement, value: string }}
 */
function selectField(label, options, value) {
  const select = el(
    'select',
    null,
    ...options.map(([v, text]) =>
      el('option', { value: String(v), selected: String(v) === String(value) }, text),
    ),
  );
  const field = el('label.field', null, el('span', null, label), select);
  return {
    field,
    get value() {
      return /** @type {HTMLSelectElement} */ (select).value;
    },
  };
}
