// @ts-check
/**
 * The AI conversation partner — voice-first. In voice mode it's a hands-free
 * loop: you speak (mic → Turkish speech recognition), the tutor replies in
 * Turkish and speaks it aloud, then the mic re-opens for your next turn. The
 * tutor stays within words you've started learning and adds a collapsible
 * correction only when you make a real mistake. Typing is available as a
 * fallback (and when the browser can't do speech recognition).
 *
 * @typedef {import('../app.mjs').AppContext} AppContext
 * @typedef {{ id: string, role: 'user' | 'assistant', text: string, translation?: string, streaming?: boolean, error?: boolean }} ChatMessage
 * @typedef {'idle' | 'listening' | 'thinking' | 'speaking'} Phase
 */
import { el, render, signal, effect } from '../lib/reactive.mjs';
import { SCENARIOS, buildSystemPrompt, splitCorrection } from '../ai/prompts.mjs';
import { knownVocab } from '../ai/vocab.mjs';
import { chatBody, translate as translateHelper, gloss as glossHelper } from '../ai/helpers.mjs';
import { streamMessage } from '../ai/client.mjs';
import { estimateCost } from '../ai/pricing.mjs';
import { speak, stop as ttsStop, hasTurkishVoice } from '../audio/tts.mjs';
import { asrSupported, createRecognizer } from '../audio/asr.mjs';
import { update } from '../store/settings.mjs';
import * as db from '../store/db.mjs';

const SESSION_ID = 'default';
const MAX_HISTORY = 12;
let msgSeq = 0;
const nextId = () => `m${++msgSeq}`;

/**
 * @param {AppContext} ctx
 * @returns {HTMLElement}
 */
export function ChatView(ctx) {
  const root = el('section.view.chat');
  const canSpeak = hasTurkishVoice();
  const asrOk = asrSupported();

  /** @type {import('../lib/reactive.mjs').Signal<ChatMessage[]>} */
  const messages = signal([]);
  /** @type {import('../lib/reactive.mjs').Signal<import('../ai/prompts.mjs').Scenario | null>} */
  const scenario = signal(null);
  /** @type {import('../lib/reactive.mjs').Signal<Phase>} */
  const phase = signal('idle');
  const interim = signal('');
  const totals = signal({ input: 0, output: 0, cost: 0 });
  /** @type {import('../lib/reactive.mjs').Signal<{ word: string, text: string, loading: boolean } | null>} */
  const glossPop = signal(null);
  const typing = signal(false); // reveal the text fallback

  let startedAt = Date.now();
  /** @type {AbortController | null} */
  let controller = null;
  /** @type {import('../audio/asr.mjs').Recognizer | null} */
  let recognizer = null;

  const voiceOn = () => ctx.settings.peek().voiceMode && asrOk;

  db.getChat(SESSION_ID).then((saved) => {
    if (saved && Array.isArray(saved.messages) && saved.messages.length) {
      messages.set(saved.messages);
      scenario.set(SCENARIOS.find((s) => s.id === saved.scenarioId) ?? SCENARIOS[0]);
      if (saved.totals) totals.set(saved.totals);
      startedAt = saved.startedAt ?? startedAt;
    }
  });

  function persist() {
    db.saveChat({
      sessionId: SESSION_ID,
      scenarioId: scenario.peek()?.id ?? 'free',
      startedAt,
      messages: messages.peek(),
      totals: totals.peek(),
      updatedAt: Date.now(),
    });
  }

  /* --- speech recognition (voice input) --------------------------------- */

  function ensureRecognizer() {
    if (recognizer || !asrOk) return recognizer;
    recognizer = createRecognizer({
      lang: 'tr-TR',
      onInterim: (t) => interim.set(t),
      onFinal: (t) => {
        interim.set('');
        if (t) send(t);
      },
      onEnd: () => {
        // Fired when listening stops (silence, tap, or timeout). If onFinal
        // already fired, phase is 'thinking' — do nothing. Otherwise SALVAGE:
        // many browsers end without promoting the interim transcript to a
        // final result, so send whatever we heard rather than dropping it.
        if (phase.peek() !== 'listening') return;
        const pending = interim.peek().trim();
        interim.set('');
        if (pending) send(pending);
        else phase.set('idle');
      },
      onError: (err) => {
        interim.set('');
        if (phase.peek() === 'listening') phase.set('idle');
        /** @type {Record<string, string>} */
        const messages = {
          'no-speech': 'Didn’t catch that — tap the mic and speak again.',
          'audio-capture': 'No microphone found on this device.',
          'not-allowed': 'Microphone blocked — allow mic access in your browser.',
          'service-not-allowed': 'Microphone blocked — allow mic access in your browser.',
          network: 'Speech service unreachable — check your connection.',
        };
        if (err !== 'aborted') {
          glossPop.set({ word: 'Mic', text: messages[err] ?? `Recognition error: ${err}`, loading: false });
        }
      },
    });
    return recognizer;
  }

  function startListening() {
    if (!voiceOn() || !ctx.settings.peek().apiKey || phase.peek() !== 'idle') return;
    const rec = ensureRecognizer();
    if (!rec) return;
    interim.set('');
    glossPop.set(null); // clear any previous mic notice
    phase.set('listening');
    rec.start();
  }

  function stopSpeaking() {
    ttsStop();
  }

  /** The single mic control — behaviour depends on the current phase. */
  function onMic() {
    const p = phase.peek();
    if (p === 'listening') recognizer?.stop();
    else if (p === 'speaking') {
      stopSpeaking();
      phase.set('idle');
      startListening();
    } else if (p === 'thinking') {
      controller?.abort();
      phase.set('idle');
    } else {
      startListening();
    }
  }

  /* --- sending / streaming ---------------------------------------------- */

  /** @param {import('../ai/pricing.mjs').Usage} usage @param {string} model */
  function addUsage(usage, model) {
    totals.update((t) => ({
      input: t.input + (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
      output: t.output + (usage.output_tokens ?? 0),
      cost: t.cost + estimateCost(model, usage),
    }));
  }

  /**
   * Speak the tutor reply, then re-open the mic in hands-free mode.
   * @param {string} reply
   */
  function speakAndContinue(reply) {
    if (!voiceOn()) return;
    phase.set('speaking');
    speak(reply, {
      voiceURI: ctx.settings.peek().voiceURI,
      onend: () => {
        if (phase.peek() === 'speaking') phase.set('idle');
        startListening();
      },
    });
  }

  /** @param {string} text */
  async function send(text) {
    const trimmed = text.trim();
    const settings = ctx.settings.peek();
    if (!trimmed || phase.peek() === 'thinking' || !settings.apiKey) return;

    const userId = nextId();
    messages.update((m) => [...m, { id: userId, role: 'user', text: trimmed }]);
    translateMine(userId, trimmed); // show the English of what you said, under your bubble

    const history = buildApiMessages(messages.peek()).slice(-MAX_HISTORY);
    const vocab = knownVocab(ctx.cards.peek(), ctx.index);
    const sc = scenario.peek() ?? SCENARIOS[0];
    const systemPrompt = buildSystemPrompt({ level: settings.level, goal: settings.goal, vocab, scenario: sc });

    const placeholderId = nextId();
    messages.update((m) => [...m, { id: placeholderId, role: 'assistant', text: '', streaming: true }]);
    phase.set('thinking');
    controller = new AbortController();

    /** @param {(msg: ChatMessage) => ChatMessage} fn */
    const updatePlaceholder = (fn) =>
      messages.update((m) => m.map((msg) => (msg.id === placeholderId ? fn(msg) : msg)));

    /** @type {import('../ai/pricing.mjs').Usage} */
    let usage = {};
    try {
      const body = chatBody({ model: settings.chatModel, systemPrompt, messages: history });
      for await (const ev of streamMessage({ apiKey: settings.apiKey, body, signal: controller.signal })) {
        if (ev.type === 'message_start') {
          usage = { ...usage, ...(ev.message?.usage ?? {}) };
        } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          updatePlaceholder((msg) => ({ ...msg, text: msg.text + ev.delta.text }));
        } else if (ev.type === 'message_delta' && ev.usage) {
          usage = { ...usage, output_tokens: ev.usage.output_tokens };
        }
      }
      updatePlaceholder((msg) => ({ ...msg, streaming: false }));
      addUsage(usage, settings.chatModel);

      const finalMsg = messages.peek().find((m) => m.id === placeholderId);
      const reply = finalMsg ? splitCorrection(finalMsg.text).reply : '';
      if (voiceOn() && reply) speakAndContinue(reply);
      else phase.set('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/aborted/i.test(message)) {
        updatePlaceholder((msg) => ({ ...msg, streaming: false, error: true, text: message }));
      }
      phase.set('idle');
    } finally {
      controller = null;
      persist();
    }
  }

  /* --- scenario / reset -------------------------------------------------- */

  /** @param {import('../ai/prompts.mjs').Scenario} sc */
  function start(sc) {
    startedAt = Date.now();
    scenario.set(sc);
    messages.set([{ id: nextId(), role: 'assistant', text: sc.opener }]);
    totals.set({ input: 0, output: 0, cost: 0 });
    persist();
    // Speak the opener, but DON'T auto-open the mic — the first listen must be
    // a user tap so the browser ties the mic-permission prompt to a gesture.
    // After that, replies chain into hands-free listening automatically.
    if (voiceOn()) {
      phase.set('speaking');
      speak(sc.opener, {
        voiceURI: ctx.settings.peek().voiceURI,
        onend: () => {
          if (phase.peek() === 'speaking') phase.set('idle');
        },
      });
    }
  }

  function reset() {
    controller?.abort();
    recognizer?.abort();
    stopSpeaking();
    phase.set('idle');
    scenario.set(null);
    messages.set([]);
    totals.set({ input: 0, output: 0, cost: 0 });
    glossPop.set(null);
    db.saveChat({ sessionId: SESSION_ID, scenarioId: 'free', startedAt: Date.now(), messages: [], totals: { input: 0, output: 0, cost: 0 }, updatedAt: Date.now() });
  }

  function toggleVoice() {
    const next = !ctx.settings.peek().voiceMode;
    ctx.settings.set(update({ voiceMode: next }));
    if (!next) {
      recognizer?.abort();
      stopSpeaking();
      if (phase.peek() !== 'thinking') phase.set('idle');
    }
  }

  /* --- helpers (translate / gloss) -------------------------------------- */

  /**
   * Auto-translate the learner's own message to English (so they can check the
   * mic heard them right). Fire-and-forget; doesn't block the tutor's reply.
   * @param {string} id @param {string} turkish
   */
  async function translateMine(id, turkish) {
    const settings = ctx.settings.peek();
    if (!settings.apiKey) return;
    try {
      const { text, usage } = await translateHelper({ apiKey: settings.apiKey, model: settings.helperModel, text: turkish });
      messages.update((m) => m.map((msg) => (msg.id === id ? { ...msg, translation: text } : msg)));
      addUsage(usage, settings.helperModel);
      persist();
    } catch {
      /* translation is a nicety — ignore failures */
    }
  }

  /** @param {string} msgId @param {string} reply */
  async function doTranslate(msgId, reply) {
    const settings = ctx.settings.peek();
    if (!settings.apiKey) return;
    try {
      const { text, usage } = await translateHelper({ apiKey: settings.apiKey, model: settings.helperModel, text: reply });
      messages.update((m) => m.map((msg) => (msg.id === msgId ? { ...msg, translation: text } : msg)));
      addUsage(usage, settings.helperModel);
      persist();
    } catch {
      messages.update((m) => m.map((msg) => (msg.id === msgId ? { ...msg, translation: '(translation failed)' } : msg)));
    }
  }

  /** @param {string} word */
  async function doGloss(word) {
    const settings = ctx.settings.peek();
    if (!settings.apiKey) return;
    glossPop.set({ word, text: '', loading: true });
    try {
      const { text, usage } = await glossHelper({ apiKey: settings.apiKey, model: settings.helperModel, word });
      glossPop.set({ word, text, loading: false });
      addUsage(usage, settings.helperModel);
    } catch {
      glossPop.set({ word, text: '(couldn’t look that up)', loading: false });
    }
  }

  /* --- render ------------------------------------------------------------ */

  const dispose = effect(() => {
    const sc = scenario();
    const settings = ctx.settings();
    const hasKey = Boolean(settings.apiKey);
    const useVoice = settings.voiceMode && asrOk;

    if (!sc) {
      render(root, header(ctx, null, totals.peek(), reset, useVoice, asrOk, toggleVoice), scenarioPicker(start), keyBanner(ctx, hasKey));
      return;
    }

    render(
      root,
      header(ctx, sc, totals(), reset, useVoice, asrOk, toggleVoice),
      keyBanner(ctx, hasKey),
      !asrOk && settings.voiceMode ? el('div.banner', null, el('span', null, 'Voice input needs Chrome or Edge. You can type below for now.')) : null,
      messageList(messages(), canSpeak, doTranslate, doGloss),
      glossBar(glossPop(), () => glossPop.set(null)),
      useVoice && !typing()
        ? voiceBar(phase(), interim(), hasKey, onMic, () => typing.set(true))
        : textBar(phase() === 'thinking', hasKey, send, useVoice ? () => typing.set(false) : null),
    );
    scrollToBottom(root);
  });

  /** @type {any} */ (root).__dispose = () => {
    dispose();
    controller?.abort();
    recognizer?.abort();
    stopSpeaking();
  };
  return root;
}

/* ------------------------------------------------------------------------- */

/**
 * @param {ChatMessage[]} msgs
 * @returns {{ role: string, content: string }[]}
 */
function buildApiMessages(msgs) {
  const mapped = msgs
    .filter((m) => !m.streaming && !m.error && m.text)
    .map((m) => ({ role: m.role, content: m.text }));
  let i = 0;
  while (i < mapped.length && mapped[i].role !== 'user') i++;
  return mapped.slice(i);
}

/**
 * @param {AppContext} ctx
 * @param {import('../ai/prompts.mjs').Scenario | null} sc
 * @param {{ cost: number }} totals
 * @param {() => void} reset
 * @param {boolean} useVoice
 * @param {boolean} asrOk
 * @param {() => void} toggleVoice
 */
function header(ctx, sc, totals, reset, useVoice, asrOk, toggleVoice) {
  return el(
    'header.topbar',
    null,
    el('button.icon', { onclick: () => ctx.navigate('#/'), 'aria-label': 'Back', title: 'Back' }, '←'),
    el('h1', null, sc ? sc.title : 'Practice speaking'),
    el('div.spacer'),
    asrOk
      ? el('button.icon', { onclick: toggleVoice, 'aria-label': 'Toggle voice mode', title: useVoice ? 'Voice mode on — tap for typing' : 'Typing mode — tap for voice', class: useVoice ? 'active' : '' }, useVoice ? '🎙️' : '⌨️')
      : null,
    sc ? el('div.chip', { title: 'Estimated cost this session' }, `~$${totals.cost.toFixed(4)}`) : null,
    sc ? el('button.icon', { onclick: reset, 'aria-label': 'New conversation', title: 'New conversation' }, '↺') : null,
  );
}

/** @param {(sc: import('../ai/prompts.mjs').Scenario) => void} onPick */
function scenarioPicker(onPick) {
  return el(
    'div.card.stack',
    null,
    el('h2', null, 'Choose a scenario'),
    el('p.muted', null, 'Speak with a patient Turkish tutor. It sticks to words you’ve started learning and corrects you gently. Tap a scenario to begin — it will greet you out loud, then it’s your turn to talk.'),
    el(
      'div.scenario-grid',
      null,
      ...SCENARIOS.map((sc) => el('button.scenario', { onclick: () => onPick(sc) }, el('span.scenario-title', null, sc.title))),
    ),
  );
}

/** @param {AppContext} ctx @param {boolean} hasKey */
function keyBanner(ctx, hasKey) {
  if (hasKey) return null;
  return el(
    'div.banner',
    null,
    el('span', null, 'Add your Anthropic API key to start.'),
    el('button.link', { onclick: () => ctx.navigate('#/settings') }, 'Open Settings'),
  );
}

/**
 * @param {ChatMessage[]} msgs
 * @param {boolean} canSpeak
 * @param {(id: string, reply: string) => void} onTranslate
 * @param {(word: string) => void} onWord
 */
function messageList(msgs, canSpeak, onTranslate, onWord) {
  return el('div.messages', null, ...msgs.map((m) => messageBubble(m, canSpeak, onTranslate, onWord)));
}

/**
 * @param {ChatMessage} m
 * @param {boolean} canSpeak
 * @param {(id: string, reply: string) => void} onTranslate
 * @param {(word: string) => void} onWord
 */
function messageBubble(m, canSpeak, onTranslate, onWord) {
  if (m.role === 'user') {
    return el(
      'div.msg.user',
      null,
      el('div.bubble', null, m.text),
      m.translation ? el('div.translation.muted', null, m.translation) : null,
    );
  }
  if (m.error) {
    return el('div.msg.assistant', null, el('div.bubble.err', null, `⚠ ${m.text}`));
  }

  const { reply, correction } = splitCorrection(m.text);
  const showTyping = m.streaming && !reply;

  return el(
    'div.msg.assistant',
    null,
    el(
      'div.bubble',
      null,
      showTyping ? el('span.typing', null, '•••') : el('span.reply', null, ...renderReply(reply, onWord)),
    ),
    !m.streaming && reply
      ? el(
          'div.msg-actions',
          null,
          canSpeak ? el('button.link', { onclick: () => speak(reply) }, '🔊 Listen') : null,
          el('button.link', { onclick: () => onTranslate(m.id, reply) }, '🌐 Translate'),
        )
      : null,
    m.translation ? el('div.translation.muted', null, m.translation) : null,
    correction ? el('details.correction', null, el('summary', null, '✎ Correction'), el('div.correction-body', null, correction)) : null,
  );
}

/**
 * @param {string} reply
 * @param {(word: string) => void} onWord
 * @returns {(HTMLElement | string)[]}
 */
function renderReply(reply, onWord) {
  return reply.split(/(\s+)/).map((part) => {
    if (part === '' || /^\s+$/.test(part)) return part;
    const clean = part.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (!clean) return part;
    return el('button.word', { onclick: () => onWord(clean) }, part);
  });
}

/**
 * @param {{ word: string, text: string, loading: boolean } | null} pop
 * @param {() => void} onClose
 */
function glossBar(pop, onClose) {
  if (!pop) return null;
  return el(
    'div.gloss-bar',
    null,
    el('strong', null, pop.word),
    el('span.gloss-text', null, pop.loading ? '…' : pop.text),
    el('button.icon.small', { onclick: onClose, 'aria-label': 'Close', title: 'Close' }, '✕'),
  );
}

/**
 * Voice input: a big mic whose state reflects the conversation phase.
 * @param {Phase} phase
 * @param {string} interim
 * @param {boolean} hasKey
 * @param {() => void} onMic
 * @param {() => void} onType
 */
function voiceBar(phase, interim, hasKey, onMic, onType) {
  const label =
    phase === 'listening' ? 'Listening… tap to send'
    : phase === 'thinking' ? 'Thinking…'
    : phase === 'speaking' ? 'Tutor is speaking… tap to jump in'
    : hasKey ? 'Tap and speak Turkish' : 'Add your API key in Settings';

  return el(
    'div.voice-bar',
    null,
    phase === 'listening' && interim ? el('div.interim', null, interim) : null,
    el(
      `button.mic.${phase}`,
      { onclick: onMic, disabled: !hasKey, 'aria-label': 'Microphone' },
      phase === 'thinking' ? '…' : '🎙️',
    ),
    el('div.voice-label.muted', null, label),
    el('button.link', { onclick: onType }, 'or type'),
  );
}

/**
 * Text input fallback.
 * @param {boolean} sending
 * @param {boolean} hasKey
 * @param {(text: string) => void} onSend
 * @param {(() => void) | null} onVoice
 */
function textBar(sending, hasKey, onSend, onVoice) {
  const textarea = /** @type {HTMLTextAreaElement} */ (
    el('textarea.chat-input', {
      rows: 1,
      placeholder: hasKey ? 'Yaz…' : 'Add your API key in Settings',
      disabled: sending || !hasKey,
      onkeydown: (/** @type {KeyboardEvent} */ e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const v = textarea.value;
          textarea.value = '';
          onSend(v);
        }
      },
    })
  );
  return el(
    'div.input-wrap',
    null,
    el(
      'div.input-bar',
      null,
      onVoice ? el('button.icon.mic-mini', { onclick: onVoice, 'aria-label': 'Voice mode', title: 'Voice mode' }, '🎙️') : null,
      textarea,
      el(
        'button.primary.send',
        {
          disabled: sending || !hasKey,
          onclick: () => {
            const v = textarea.value;
            textarea.value = '';
            onSend(v);
          },
        },
        sending ? '…' : 'Send',
      ),
    ),
  );
}

/** @param {HTMLElement} root */
function scrollToBottom(root) {
  requestAnimationFrame(() => {
    const list = root.querySelector('.messages');
    if (list) list.scrollTop = list.scrollHeight;
  });
}
