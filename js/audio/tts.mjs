// @ts-check
/**
 * Turkish text-to-speech via the browser SpeechSynthesis API. Free and
 * on-device, but Turkish (`tr-TR`) voice availability is inconsistent — good on
 * macOS/iOS and most Android, sometimes absent on desktop Chrome/Windows. So we
 * feature-detect: `hasTurkishVoice()` lets the UI hide the audio button when no
 * voice exists rather than failing silently.
 *
 * Phase 3 upgrade path: pre-generated MP3/Opus clips per entry (`entry.audio`),
 * played back with an <audio> element for consistent quality and full offline.
 */

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;

/** @type {SpeechSynthesisVoice[]} */
let voices = [];

function refreshVoices() {
  if (!synth) return;
  voices = synth.getVoices();
}

if (synth) {
  refreshVoices();
  // Voices often load asynchronously; re-read when they arrive.
  synth.addEventListener?.('voiceschanged', refreshVoices);
}

/** @returns {SpeechSynthesisVoice[]} All Turkish voices, best-effort. */
export function turkishVoices() {
  if (!voices.length) refreshVoices();
  return voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('tr'));
}

/** @returns {boolean} Whether any Turkish voice is available on this device. */
export function hasTurkishVoice() {
  return turkishVoices().length > 0;
}

/**
 * Pick the voice to speak with: the user's saved preference if still present,
 * otherwise the first Turkish voice.
 * @param {string | null} [preferredURI]
 * @returns {SpeechSynthesisVoice | null}
 */
function pickVoice(preferredURI) {
  const tr = turkishVoices();
  if (!tr.length) return null;
  if (preferredURI) {
    const match = tr.find((v) => v.voiceURI === preferredURI);
    if (match) return match;
  }
  return tr[0];
}

/**
 * Speak Turkish text. No-ops gracefully when speech or a Turkish voice is
 * unavailable. Cancels any in-flight utterance first. `onend` fires when the
 * utterance finishes (or immediately, if speech can't start) — used to chain
 * back into listening in hands-free mode.
 * @param {string} text
 * @param {{ voiceURI?: string | null, rate?: number, onend?: () => void }} [opts]
 * @returns {boolean} true if speech started
 */
export function speak(text, opts = {}) {
  if (!synth || !text) {
    opts.onend?.();
    return false;
  }
  const voice = pickVoice(opts.voiceURI ?? null);
  if (!voice) {
    opts.onend?.();
    return false;
  }
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.voice = voice;
  utter.lang = voice.lang || 'tr-TR';
  utter.rate = opts.rate ?? 0.95; // slightly slowed for learners
  if (opts.onend) {
    utter.addEventListener('end', () => opts.onend?.());
    utter.addEventListener('error', () => opts.onend?.());
  }
  synth.speak(utter);
  return true;
}

/** Stop any current speech. */
export function stop() {
  synth?.cancel();
}
