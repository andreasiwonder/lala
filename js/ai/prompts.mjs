// @ts-check
/**
 * Builds the tutor system prompt and helper prompts. Pure string assembly so
 * it can be unit-tested deterministically.
 *
 * Pedagogy encoded here: reply in short Turkish, stay within the learner's
 * known words plus a tiny budget of new ones (comprehensible input), keep them
 * talking, and — only when there's a real mistake — append a correction block
 * after a machine-parseable marker so the UI can render it collapsibly.
 *
 * @typedef {import('../deck/schema.mjs').Entry} Entry
 * @typedef {import('../store/settings.mjs').Level} Level
 * @typedef {import('../store/settings.mjs').Goal} Goal
 * @typedef {{ id: string, title: string, system: string, opener: string }} Scenario
 */

/** The correction section is delimited by this exact marker on its own line. */
export const CORRECTION_MARKER = '---DÜZELTME---';

/** @type {Scenario[]} */
export const SCENARIOS = [
  {
    id: 'free',
    title: 'Free chat',
    system: 'Have a relaxed, friendly conversation about everyday topics.',
    opener: 'Merhaba! Bugün nasılsın?',
  },
  {
    id: 'meeting',
    title: 'Meeting someone',
    system: 'Role-play: you have just met the learner. Make small talk — name, where they are from, why they are learning Turkish.',
    opener: 'Merhaba! Ben Deniz. Adın ne?',
  },
  {
    id: 'cafe',
    title: 'At a café',
    system: 'Role-play: you are a warm café waiter in Istanbul. Help the learner order a drink or food, and chat a little.',
    opener: 'Hoş geldiniz! Ne almak istersiniz?',
  },
  {
    id: 'directions',
    title: 'Asking directions',
    system: 'Role-play: you are a friendly local. The learner is lost and asking for directions to places like a hotel, toilet, or bus stop.',
    opener: 'Buyurun, nasıl yardımcı olabilirim?',
  },
  {
    id: 'hotel',
    title: 'At the hotel',
    system: 'Role-play: you are a hotel receptionist checking the learner in and answering simple questions.',
    opener: 'Hoş geldiniz! Rezervasyonunuz var mı?',
  },
];

const LEVEL_HINT = {
  beginner: 'They are an absolute beginner — use only the simplest words and very short sentences.',
  a1: 'They are around A1 — very simple present-tense sentences.',
  a2: 'They are around A2 — simple everyday sentences; a little more variety is fine.',
  b1: 'They are around B1 — natural but still clear, everyday language.',
};

const GOAL_HINT = {
  daily: 'They are learning for daily life. Favour everyday practical topics.',
  travel: 'They are learning for travel. Favour travel, directions, food, and hotel situations.',
  family: 'They are learning to talk with family and friends. Favour warm, personal topics.',
  work: 'They are learning for work. Keep it practical and polite.',
};

/**
 * @param {object} args
 * @param {Level} args.level
 * @param {Goal} args.goal
 * @param {Entry[]} args.vocab   Known entries (most common first).
 * @param {Scenario} args.scenario
 * @returns {string}
 */
export function buildSystemPrompt({ level, goal, vocab, scenario }) {
  const known = vocab.map((e) => e.tr).join(', ') || '(none yet — assume only the most basic greetings)';
  return [
    'You are Konuş, a warm and patient Turkish conversation partner for an English-speaking learner. Your one goal is to help them SPEAK Turkish. You are encouraging and never condescending.',
    LEVEL_HINT[level] ?? LEVEL_HINT.beginner,
    GOAL_HINT[goal] ?? GOAL_HINT.daily,
    `Scenario: ${scenario.system}`,
    [
      'RULES:',
      '1. Reply ONLY in Turkish. Never write your main reply in English.',
      '2. Keep replies to 1–2 short, simple sentences, then ask one easy follow-up question to keep the learner talking.',
      '3. Use mostly words the learner already knows (listed below). You may introduce at most 1–2 new useful words per reply, and only if their meaning is obvious from context.',
      `4. AFTER your Turkish reply, ONLY IF the learner's last message had a real mistake (grammar, wrong word, or a clearly more natural phrasing), add a correction block: put the exact marker ${CORRECTION_MARKER} on its own line, then 1–3 short bullet points IN ENGLISH, each like "you wrote X → better: Y (short reason)".`,
      '5. If there was no real mistake, do NOT write the marker or any correction at all. Do not nitpick missing capitalisation or Turkish accents.',
      '6. Never explain grammar unprompted and never break character.',
    ].join('\n'),
    `Words the learner knows so far: ${known}`,
  ].join('\n\n');
}

/**
 * Split an assistant reply into the Turkish reply and an optional English
 * correction block. Safe to call on partial (streaming) text.
 * @param {string} text
 * @returns {{ reply: string, correction: string }}
 */
export function splitCorrection(text) {
  const idx = text.indexOf(CORRECTION_MARKER);
  if (idx === -1) return { reply: text, correction: '' };
  return {
    reply: text.slice(0, idx).trimEnd(),
    correction: text.slice(idx + CORRECTION_MARKER.length).trim(),
  };
}

/**
 * Prompt for translating a Turkish message to English (Haiku helper).
 * @param {string} turkish
 * @returns {{ system: string, user: string }}
 */
export function translatePrompt(turkish) {
  return {
    system: 'You are a precise Turkish→English translator. Reply with ONLY the natural English translation — no quotes, no notes, no preamble.',
    user: `Translate to natural English:\n\n${turkish}`,
  };
}

/**
 * Prompt for glossing a single Turkish word/phrase (Haiku helper).
 * @param {string} word
 * @returns {{ system: string, user: string }}
 */
export function glossPrompt(word) {
  return {
    system:
      'You explain one Turkish word or phrase to an English-speaking beginner. Reply in ONE short line: the English meaning only. No examples, no preamble, no quotes.',
    user: `What does this Turkish word mean: ${word}`,
  };
}
