// @ts-check
/**
 * Settings. Phase 1: theme, daily pace, level, goal, and Turkish voice. The
 * Anthropic API-key field is present but flagged for the upcoming AI chat
 * (Phase 2) — stored locally, per-device, never sent anywhere yet.
 *
 * @typedef {import('../app.mjs').AppContext} AppContext
 */
import { el, render, signal, effect } from '../lib/reactive.mjs';
import { update } from '../store/settings.mjs';
import { turkishVoices, hasTurkishVoice } from '../audio/tts.mjs';
import { testKey } from '../ai/helpers.mjs';
import { APP_VERSION, BUILD } from '../version.mjs';

/**
 * @param {AppContext} ctx
 * @returns {HTMLElement}
 */
export function SettingsView(ctx) {
  const root = el('section.view');

  /** @param {Partial<import('../store/settings.mjs').Settings>} patch */
  const set = (patch) => ctx.settings.set(update(patch));
  const s = ctx.settings.peek();

  const voices = turkishVoices();

  render(
    root,
    el(
      'header.topbar',
      null,
      el('button.icon', { onclick: () => ctx.navigate('#/'), 'aria-label': 'Back', title: 'Back' }, '←'),
      el('h1', null, 'Settings'),
    ),
    el(
      'div.card.stack',
      null,
      choice('Theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], s.theme, (v) =>
        set({ theme: /** @type {any} */ (v) }),
      ),
      choice(
        'Daily pace',
        [[5, 'Relaxed (5)'], [10, 'Steady (10)'], [20, 'Intense (20)'], [40, 'Cram (40)'], [50, 'Max (50)']],
        s.dailyNewLimit,
        (v) => set({ dailyNewLimit: Number(v) }),
      ),
      choice(
        'Level',
        [['beginner', 'Beginner'], ['a1', 'A1'], ['a2', 'A2'], ['b1', 'B1']],
        s.level,
        (v) => set({ level: /** @type {any} */ (v) }),
      ),
      choice(
        'Goal',
        [['daily', 'Daily life'], ['travel', 'Travel'], ['family', 'Family'], ['work', 'Work']],
        s.goal,
        (v) => set({ goal: /** @type {any} */ (v) }),
      ),
      hasTurkishVoice()
        ? choice(
            'Turkish voice',
            voices.map((v) => [v.voiceURI, v.name]),
            s.voiceURI ?? voices[0]?.voiceURI ?? '',
            (v) => set({ voiceURI: v }),
          )
        : el('p.muted', null, 'No Turkish (tr-TR) voice found on this device — audio is hidden. On desktop Chrome you may need to install a Turkish voice.'),
    ),
    aiSection(ctx, set, s),
    el('p.build-tag.muted', null, `Konuş v${APP_VERSION} · build ${BUILD}`),
  );

  return root;
}

/**
 * @param {AppContext} ctx
 * @param {(patch: Partial<import('../store/settings.mjs').Settings>) => void} set
 * @param {import('../store/settings.mjs').Settings} s
 */
function aiSection(ctx, set, s) {
  /** @type {import('../lib/reactive.mjs').Signal<{ state: 'idle' | 'testing' | 'ok' | 'err', message?: string }>} */
  const status = signal({ state: 'idle' });

  async function runTest() {
    const key = ctx.settings.peek().apiKey;
    if (!key) {
      status.set({ state: 'err', message: 'Enter a key first.' });
      return;
    }
    status.set({ state: 'testing' });
    try {
      await testKey({ apiKey: key, model: ctx.settings.peek().helperModel });
      status.set({ state: 'ok', message: 'Key works ✓' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      status.set({ state: 'err', message });
    }
  }

  const statusLine = el('span.status');
  effect(() => {
    const st = status();
    statusLine.className = `status ${st.state}`;
    statusLine.textContent =
      st.state === 'testing' ? 'Testing…' : st.state === 'idle' ? '' : st.message ?? '';
  });

  const keyPresent = signal(Boolean(s.apiKey));
  const savedLine = el('span.status');
  effect(() => {
    const on = keyPresent();
    savedLine.className = `status ${on ? 'ok' : ''}`;
    savedLine.textContent = on ? 'Key saved on this device ✓' : 'No key saved yet';
  });

  return el(
    'div.card.stack',
    null,
    el('h2', null, 'AI conversation'),
    el('p.muted', null, 'Chat with a patient Turkish tutor that sticks to the words you know. Your Anthropic API key stays on this device and is sent only to api.anthropic.com.'),
    apiKeyField(s.apiKey, (v) => {
      set({ apiKey: v });
      keyPresent.set(Boolean(v));
      status.set({ state: 'idle' });
    }),
    savedLine,
    el('div.row', null, el('button.secondary', { onclick: runTest }, 'Test key'), statusLine),
    choice(
      'Conversation model',
      [['claude-sonnet-5', 'Sonnet 5 (recommended)'], ['claude-haiku-4-5', 'Haiku 4.5 (cheaper)']],
      s.chatModel,
      (v) => set({ chatModel: v }),
    ),
    choice(
      'Helper model (translate / gloss)',
      [['claude-haiku-4-5', 'Haiku 4.5 (recommended)'], ['claude-sonnet-5', 'Sonnet 5']],
      s.helperModel,
      (v) => set({ helperModel: v }),
    ),
  );
}

/**
 * @param {string} label
 * @param {Array<[string | number, string]>} options
 * @param {string | number} value
 * @param {(v: string) => void} onchange
 */
function choice(label, options, value, onchange) {
  const select = el(
    'select',
    { onchange: (/** @type {Event} */ e) => onchange(/** @type {HTMLSelectElement} */ (e.target).value) },
    ...options.map(([v, text]) =>
      el('option', { value: String(v), selected: String(v) === String(value) }, text),
    ),
  );
  return el('label.field', null, el('span', null, label), select);
}

/**
 * @param {string} value
 * @param {(v: string) => void} onchange
 */
function apiKeyField(value, onchange) {
  const input = el('input', {
    type: 'password',
    value,
    placeholder: 'sk-ant-…',
    autocomplete: 'off',
    onchange: (/** @type {Event} */ e) => onchange(/** @type {HTMLInputElement} */ (e.target).value.trim()),
  });
  return el('label.field', null, el('span', null, 'Anthropic API key (optional, for now)'), input);
}
