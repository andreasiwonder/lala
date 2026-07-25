// @ts-check
/**
 * App entry point: bootstrap the context, register the service worker, and run
 * a tiny hash router. Onboarding gates everything until it's completed.
 */
import { createApp } from './app.mjs';
import { render } from './lib/reactive.mjs';
import { OnboardingView } from './views/onboarding.mjs';
import { DashboardView } from './views/dashboard.mjs';
import { LearnView } from './views/learn.mjs';
import { ReviewView } from './views/review.mjs';
import { SettingsView } from './views/settings.mjs';
import { ChatView } from './views/chat.mjs';
import { APP_VERSION, BUILD } from './version.mjs';

console.log(`Konuş v${APP_VERSION} · build ${BUILD}`);

const appRoot = /** @type {HTMLElement} */ (document.getElementById('app'));

/** @type {Record<string, (ctx: import('./app.mjs').AppContext) => HTMLElement>} */
const ROUTES = {
  '#/': DashboardView,
  '#/learn': LearnView,
  '#/review': ReviewView,
  '#/settings': SettingsView,
  '#/chat': ChatView,
};

async function main() {
  registerServiceWorker();

  /** @type {import('./app.mjs').AppContext} */
  let ctx;
  try {
    ({ ctx } = await createApp());
  } catch (err) {
    render(appRoot, fatal(err));
    return;
  }

  /** @type {HTMLElement | null} */
  let current = null;

  function route() {
    // Dispose the previous view's reactive effects, if any.
    if (current) /** @type {any} */ (current).__dispose?.();

    const view = !ctx.settings.peek().onboarded
      ? OnboardingView(ctx)
      : (ROUTES[location.hash] ?? DashboardView)(ctx);

    render(appRoot, view);
    current = view;
  }

  window.addEventListener('hashchange', route);
  route();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline support is best-effort */
      });
    });
  }
}

/** @param {unknown} err */
function fatal(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const div = document.createElement('div');
  div.className = 'view';
  div.innerHTML = `<div class="card center"><div class="big-emoji">😕</div><h2>Couldn’t start</h2><p class="muted"></p></div>`;
  const p = div.querySelector('p');
  if (p) p.textContent = msg;
  return div;
}

main();
