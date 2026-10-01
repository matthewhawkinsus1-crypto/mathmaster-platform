/*
 * THE RAW WORK OF THE SCENARIO QUESTION TYPES, AND HOW A GRADER READS IT.
 *
 * graphing, graphScenarioMatch, graphComparison, graphStory,
 * contextInterpretation and relationshipModel are rendered by QuestionEngine
 * and graded by shared graders in functions/shared/serverGrading/tools/. The
 * component builds its work with the builders below, grades it through
 * gradeToolCheck, and the server reads the same bytes back.
 *
 * Three rules shape everything here:
 *
 *   - A grader reads every field through `workText` (free text through
 *     `freeText`, which also joins the chunks below), so a tampered response
 *     (a number, an object, an array where a string belongs) is read as the
 *     text a student could have typed, or as blank — never as something the
 *     browser could not have produced. For the strings the inputs actually
 *     hold, `workText` is the identity, so the verdict is unchanged.
 *   - Maps keyed by AUTHORED ids (scenario ids, field ids) travel as arrays of
 *     entries, never as objects keyed by those ids. The response contract drops
 *     keys such as `correct`, `feedback` or `score` at every depth, and caps key
 *     length and count; an author who names a field `feedback` must not have
 *     that student's answer silently disappear.
 *   - FREE TEXT TRAVELS WHOLE (see freeTextWork). The response contract cuts
 *     every string at TOOL_RESPONSE_LIMITS.maxStringLength, but the screens
 *     grade the whole text: a required concept in the 1,200th character of a
 *     comparison, or a graph story minimum above 1,000 characters, would
 *     otherwise grade differently from the screen the student used.
 *
 * Pure: no React, no DOM.
 */
import { EMPTY_POINT_MEANING } from './contextInterpretationUtils.mjs';
import { TOOL_RESPONSE_LIMITS } from '../../serverGrading/toolResponseContract.mjs';

/** A student-typed value: a string as-is, a finite number as its text, anything else blank. */
export const workText = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/*
 * LONG FREE TEXT: WHOLE, UP TO A CAP, IN CHUNKS THE CONTRACT DOES NOT CUT.
 *
 * A textarea answer (a graph comparison, a graph story's scenario and
 * explanation, an open interpretation) is graded by what it CONTAINS or how
 * LONG it is, over the whole text. A single string would be cut at the
 * contract's per-string limit before the grader ever saw it, so text longer
 * than one chunk travels as an array of chunks, each at most that limit, and
 * is joined back by `freeText`. Text up to `maxLength` (about 500 words) is
 * therefore graded exactly as typed, on the device and on the server; only
 * text beyond it is cut. The cap keeps a response inside the contract's
 * total size (24,000 serialized characters) — a response over it can be
 * neither graded nor submitted — even for a graph story whose two textareas
 * are full of characters JSON must escape, beside the largest sketch.
 */
export const FREE_TEXT_LIMITS = Object.freeze({
  chunkLength: TOOL_RESPONSE_LIMITS.maxStringLength,
  maxLength: 3 * TOOL_RESPONSE_LIMITS.maxStringLength,
});

/** Read free text back: a string, or the chunks `freeTextWork` wrote; anything else as workText. */
export const freeText = (value) => (
  Array.isArray(value) && value.length > 0 && value.every((chunk) => typeof chunk === 'string')
    ? value.join('')
    : workText(value)
);

/** Free text as the work carries it: a string up to one chunk, else its chunks (capped at maxLength). */
export const freeTextWork = (value) => {
  const text = freeText(value).slice(0, FREE_TEXT_LIMITS.maxLength);
  if (text.length <= FREE_TEXT_LIMITS.chunkLength) return text;
  const chunks = [];
  for (let start = 0; start < text.length; start += FREE_TEXT_LIMITS.chunkLength) {
    chunks.push(text.slice(start, start + FREE_TEXT_LIMITS.chunkLength));
  }
  return chunks;
};

/** Named fields of `source`: short text through workText, free text through freeText. */
export const readWorkFields = (source, textKeys, freeTextKeys = []) => {
  const object = isPlainObject(source) ? source : {};
  const free = new Set(freeTextKeys);
  return Object.fromEntries(textKeys.map((key) => [key, free.has(key) ? freeText(object[key]) : workText(object[key])]));
};

/** The same fields as work: short text as workText, free text as freeTextWork. */
export const writeWorkFields = (source, textKeys, freeTextKeys = []) => {
  const object = isPlainObject(source) ? source : {};
  const free = new Set(freeTextKeys);
  return Object.fromEntries(textKeys.map((key) => [key, free.has(key) ? freeTextWork(object[key]) : workText(object[key])]));
};

/** An own property — never one inherited from Object.prototype. */
export const ownValue = (object, key) => (
  object !== null
  && (typeof object === 'object' || typeof object === 'function')
  && Object.prototype.hasOwnProperty.call(object, key)
    ? object[key]
    : undefined
);

/** A graph or scenario id as a map key: a non-empty string or a finite number. */
const isIdValue = (value) => (typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value));

const byKey = (key) => (left, right) => (String(left[key]) < String(right[key]) ? -1 : String(left[key]) > String(right[key]) ? 1 : 0);

/*
 * A PART EARNS ITS VERDICT ONLY WHEN IT IS COMPLETE.
 *
 * The screens' checks were written for work that is submitted only once every
 * part is complete, and some of them hold for a blank entry: `Number('')` is 0,
 * so an empty value box "matches" an expected 0 (the origin of nearly every
 * relationship model), and an empty unit "matches" a quantity with no unit.
 * The server grades whatever work it is sent, so a blank part must never be
 * correct, or an empty response would earn credit. For any work the screen can
 * submit (every part complete) this changes nothing.
 */
export const creditCompleteParts = (parts) => (Array.isArray(parts) ? parts : []).map((part) => ({
  ...part,
  isCorrect: part?.isComplete === true && part?.isCorrect === true,
}));

// ---------------------------------------------------------------------------
// contextInterpretation and relationshipModel's origin builder
// ---------------------------------------------------------------------------

export const POINT_MEANING_FIELDS = Object.freeze(Object.keys(EMPTY_POINT_MEANING));
// The open interpretation is a textarea, graded by the concepts it contains.
const POINT_MEANING_FREE_TEXT = Object.freeze(['openText']);

/** The seven point-meaning entries PointMeaningBuilder edits, as work. */
export const pointMeaningWork = (values) => writeWorkFields(values, POINT_MEANING_FIELDS, POINT_MEANING_FREE_TEXT);

/** The seven entries read back from work (free text joined). */
export const readPointMeaningWork = (work) => readWorkFields(work, POINT_MEANING_FIELDS, POINT_MEANING_FREE_TEXT);

// ---------------------------------------------------------------------------
// relationshipModel
// ---------------------------------------------------------------------------

export const RELATIONSHIP_MODEL_TEXT_FIELDS = Object.freeze([
  'independentId', 'dependentId', 'relationshipType',
  'xLabel', 'xUnit', 'yLabel', 'yUnit', 'xStep', 'yStep',
  'originMeaning',
]);

// The open origin interpretation is a textarea, graded by the concepts it contains.
const RELATIONSHIP_MODEL_FREE_TEXT = Object.freeze(['originMeaning']);

/** The model's entries as work. */
export const relationshipModelWork = (values) => ({
  ...writeWorkFields(values, RELATIONSHIP_MODEL_TEXT_FIELDS, RELATIONSHIP_MODEL_FREE_TEXT),
  pointMeaning: pointMeaningWork(isPlainObject(values) ? values.pointMeaning : null),
});

/** The model's entries read back from work (free text joined). */
export const readRelationshipModelWork = (work) => ({
  ...readWorkFields(work, RELATIONSHIP_MODEL_TEXT_FIELDS, RELATIONSHIP_MODEL_FREE_TEXT),
  pointMeaning: readPointMeaningWork(isPlainObject(work) ? work.pointMeaning : null),
});

// ---------------------------------------------------------------------------
// graphScenarioMatch: { matches: [{ scenarioId, graphId }] }
// ---------------------------------------------------------------------------

/** The board's { scenarioId: graphId } state as sorted entries. */
export const scenarioMatchWork = (matches) => ({
  matches: Object.entries(isPlainObject(matches) ? matches : {})
    .filter(([, graphId]) => isIdValue(graphId))
    .map(([scenarioId, graphId]) => ({ scenarioId, graphId }))
    .sort(byKey('scenarioId')),
});

/** Read the entries back into a Map (first entry for a scenario wins). */
export const readScenarioMatches = (work) => {
  const map = new Map();
  (Array.isArray(work?.matches) ? work.matches : []).forEach((entry) => {
    if (!isPlainObject(entry) || !isIdValue(entry.scenarioId) || !isIdValue(entry.graphId)) return;
    const scenarioId = String(entry.scenarioId);
    if (!map.has(scenarioId)) map.set(scenarioId, entry.graphId);
  });
  return map;
};

// ---------------------------------------------------------------------------
// graphComparison: { responses: [{ fieldId, text }] }
// ---------------------------------------------------------------------------

/** The comparison's { fieldId: text } state as sorted entries (each text whole, see freeTextWork). */
export const fieldResponsesWork = (responses) => ({
  responses: Object.entries(isPlainObject(responses) ? responses : {})
    .map(([fieldId, text]) => ({ fieldId, text: freeTextWork(text) }))
    .sort(byKey('fieldId')),
});

/** Read the entries back into a Map (first entry for a field wins). */
export const readFieldResponses = (work) => {
  const map = new Map();
  (Array.isArray(work?.responses) ? work.responses : []).forEach((entry) => {
    if (!isPlainObject(entry) || !isIdValue(entry.fieldId)) return;
    const fieldId = String(entry.fieldId);
    if (!map.has(fieldId)) map.set(fieldId, freeText(entry.text));
  });
  return map;
};
