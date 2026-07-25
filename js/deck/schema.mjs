// @ts-check
/**
 * The deck data contract, shared by the build script, the runtime loader, and
 * the CI schema test. Entries are content-immutable and referenced by SRS
 * state via their stable `id` — never reuse an id (that is the reconcile
 * contract).
 *
 * @typedef {'word' | 'phrase' | 'chunk'} EntryType
 *
 * @typedef {object} Example
 * @property {string} tr
 * @property {string} en
 * @property {string | null} audio
 *
 * @typedef {object} Entry
 * @property {string} id            Stable, globally unique, never reused.
 * @property {string} tr            Turkish headword / phrase.
 * @property {string} en            English gloss.
 * @property {string} pos           Part of speech.
 * @property {EntryType} type       word | phrase | chunk.
 * @property {number} freqRank      Lower = more common; drives new-card order.
 * @property {number} difficulty    1..5.
 * @property {string[]} tags
 * @property {string} unitId
 * @property {Example[]} examples
 * @property {string | null} audio  Optional pre-generated pronunciation clip.
 * @property {string} notes
 *
 * @typedef {object} Unit
 * @property {string} id
 * @property {string} title
 * @property {number} order
 * @property {string[]} entryIds
 *
 * @typedef {object} Deck
 * @property {number} schemaVersion
 * @property {string} version
 * @property {{ code: string, name: string }} language
 * @property {Unit[]} units
 * @property {Entry[]} entries
 */

export const DECK_SCHEMA_VERSION = 1;

/** @type {ReadonlySet<EntryType>} */
const ENTRY_TYPES = new Set(['word', 'phrase', 'chunk']);

/**
 * Validate a deck object. Returns a list of human-readable errors — empty means
 * valid. Deliberately dependency-free so it runs in Node, the browser, and CI.
 * @param {unknown} deck
 * @returns {string[]}
 */
export function validateDeck(deck) {
  /** @type {string[]} */
  const errors = [];
  if (typeof deck !== 'object' || deck === null) {
    return ['deck is not an object'];
  }
  const d = /** @type {Record<string, any>} */ (deck);

  if (d.schemaVersion !== DECK_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DECK_SCHEMA_VERSION}, got ${d.schemaVersion}`);
  }
  if (typeof d.version !== 'string' || !d.version) {
    errors.push('version must be a non-empty string');
  }
  if (!d.language || typeof d.language.code !== 'string' || typeof d.language.name !== 'string') {
    errors.push('language must have code and name');
  }
  if (!Array.isArray(d.units)) errors.push('units must be an array');
  if (!Array.isArray(d.entries)) errors.push('entries must be an array');
  if (errors.length) return errors;

  /** @type {Set<string>} */
  const unitIds = new Set();
  for (const u of d.units) {
    if (typeof u.id !== 'string' || !u.id) errors.push('unit missing id');
    else if (unitIds.has(u.id)) errors.push(`duplicate unit id: ${u.id}`);
    else unitIds.add(u.id);
    if (typeof u.title !== 'string') errors.push(`unit ${u.id} missing title`);
    if (typeof u.order !== 'number') errors.push(`unit ${u.id} missing order`);
    if (!Array.isArray(u.entryIds)) errors.push(`unit ${u.id} missing entryIds`);
  }

  /** @type {Set<string>} */
  const entryIds = new Set();
  for (const e of d.entries) {
    const label = e && e.id ? e.id : '<unknown>';
    if (typeof e.id !== 'string' || !e.id) errors.push('entry missing id');
    else if (entryIds.has(e.id)) errors.push(`duplicate entry id: ${e.id}`);
    else entryIds.add(e.id);
    if (typeof e.tr !== 'string' || !e.tr) errors.push(`entry ${label} missing tr`);
    if (typeof e.en !== 'string' || !e.en) errors.push(`entry ${label} missing en`);
    if (!ENTRY_TYPES.has(e.type)) errors.push(`entry ${label} has invalid type: ${e.type}`);
    if (typeof e.freqRank !== 'number') errors.push(`entry ${label} missing freqRank`);
    if (!unitIds.has(e.unitId)) errors.push(`entry ${label} references unknown unit: ${e.unitId}`);
    if (!Array.isArray(e.examples)) errors.push(`entry ${label} missing examples array`);
  }

  // Cross-check: every unit.entryIds points at a real entry.
  for (const u of d.units) {
    for (const id of u.entryIds ?? []) {
      if (!entryIds.has(id)) errors.push(`unit ${u.id} lists missing entry: ${id}`);
    }
  }

  return errors;
}
