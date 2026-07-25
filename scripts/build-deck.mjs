// @ts-check
/**
 * Build `data/deck.json` from `content/deck.source.mjs`.
 *
 * Responsibilities:
 *   - Assign stable, globally-unique ids (`e_<unit>_<slug>`).
 *   - Assign `freqRank` sequentially across the whole deck in authored order
 *     (so authoring order = frequency priority).
 *   - Fill defaults (difficulty, audio) and derive each unit's `entryIds`.
 *   - Validate against the shared schema and refuse to write if invalid.
 *
 * Dependency-free (node:fs only) so it runs on node 22 with no install. Later
 * this is where an offline Claude (Haiku) pass could draft/validate example
 * sentences before human review — see the plan.
 *
 * Usage: `node scripts/build-deck.mjs` (or `npm run build:deck`).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { meta, units as sourceUnits } from '../content/deck.source.mjs';
import { validateDeck, DECK_SCHEMA_VERSION } from '../js/deck/schema.mjs';

/** @param {any} example */
function normExample(example) {
  return { tr: example.tr, en: example.en, audio: example.audio ?? null };
}

let freqRank = 0;
/** @type {any[]} */
const entries = [];
/** @type {any[]} */
const units = [];

sourceUnits.forEach((unit, unitIndex) => {
  /** @type {string[]} */
  const entryIds = [];
  for (const src of unit.entries) {
    const id = `e_${unit.id}_${src.id}`;
    freqRank += 1;
    entries.push({
      id,
      tr: src.tr,
      en: src.en,
      pos: src.pos ?? 'other',
      type: src.type ?? 'word',
      freqRank,
      difficulty: src.difficulty ?? 1,
      tags: src.tags ?? [],
      unitId: unit.id,
      examples: (src.examples ?? []).map(normExample),
      audio: src.audio ?? null,
      notes: src.notes ?? '',
    });
    entryIds.push(id);
  }
  units.push({ id: unit.id, title: unit.title, order: unitIndex + 1, entryIds });
});

const deck = {
  schemaVersion: DECK_SCHEMA_VERSION,
  version: meta.version,
  language: meta.language,
  units,
  entries,
};

const errors = validateDeck(deck);
if (errors.length) {
  console.error(`✗ Deck is invalid (${errors.length} error(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
const outPath = new URL('../data/deck.json', import.meta.url);
writeFileSync(outPath, JSON.stringify(deck, null, 2) + '\n', 'utf8');

const chunks = entries.filter((e) => e.type === 'chunk').length;
console.log(
  `✓ Wrote data/deck.json — ${entries.length} entries (${chunks} chunks) across ${units.length} units, version ${deck.version}.`,
);
