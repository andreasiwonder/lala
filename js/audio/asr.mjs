// @ts-check
/**
 * Speech recognition (voice input) via the Web Speech API, for the hands-free
 * conversation mode. Turkish (`tr-TR`).
 *
 * Caveats (why everything is feature-detected and gated behind a user tap):
 *   - Support is effectively Chrome/Edge only; Safari is partial, Firefox none.
 *   - It is server-based (audio goes to the browser vendor) — not offline.
 *   - Needs microphone permission, so it must be started from a user gesture.
 *
 * The API is vendor-prefixed and not in the TS DOM lib, so we reach it through
 * a cast.
 */

const SpeechRecognitionImpl =
  typeof window !== 'undefined'
    ? /** @type {any} */ (window).SpeechRecognition || /** @type {any} */ (window).webkitSpeechRecognition
    : undefined;

/** @returns {boolean} */
export function asrSupported() {
  return Boolean(SpeechRecognitionImpl);
}

/**
 * @typedef {object} Recognizer
 * @property {() => void} start
 * @property {() => void} stop   graceful stop (still fires a final result if any)
 * @property {() => void} abort  immediate stop (no result)
 */

/**
 * Create a one-utterance recognizer. Each `start()` listens until the speaker
 * pauses, then fires `onFinal` with the transcript and `onEnd`.
 * @param {object} handlers
 * @param {string} [handlers.lang]
 * @param {(text: string) => void} [handlers.onInterim]
 * @param {(text: string) => void} [handlers.onFinal]
 * @param {(error: string) => void} [handlers.onError]
 * @param {() => void} [handlers.onEnd]
 * @returns {Recognizer | null}
 */
export function createRecognizer({ lang = 'tr-TR', onInterim, onFinal, onError, onEnd } = {}) {
  if (!SpeechRecognitionImpl) return null;
  const rec = new SpeechRecognitionImpl();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (/** @type {any} */ event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }
    if (interim && onInterim) onInterim(interim);
    if (final && onFinal) onFinal(final.trim());
  };
  rec.onerror = (/** @type {any} */ event) => onError?.(event.error);
  rec.onend = () => onEnd?.();

  return {
    start() {
      try {
        rec.start();
      } catch {
        /* start() throws if already started — ignore */
      }
    },
    stop() {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
    abort() {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    },
  };
}
