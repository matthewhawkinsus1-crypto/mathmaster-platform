/*
 * FOLLOW-THROUGH PARTS (SP-3; docs/platform/SHOWING_THE_PROCESS.md section 4,
 * docs/assignments/AUTHORING_LEARNING_SUPPORTS.md section 6).
 *
 * A part of a multi-part answer can build on an earlier part:
 *
 *   { "id": "slope", "label": "Slope of the boundary line", "answer": "-2" },
 *   { "id": "inequality", "label": "Using your slope of {slope}, write the inequality",
 *     "answer": "y > -2x + 3",
 *     "followThrough": { "from": ["slope"], "answer": "y > {slope}x + 3" } }
 *
 * Two things read it, both from here, so every screen and every server grader
 * agrees:
 *
 *   followThroughLabel   the part's label with the student's own earlier value
 *                        in place of {slope}, or, before there is one, a
 *                        neutral phrase ("your slope of the boundary line").
 *                        Never a raw {slope}, never the key.
 *   followThroughKeys    the later part's key for THIS student: the
 *                        followThrough answer with each {name} replaced by the
 *                        student's earlier value. The graders mark the part
 *                        right when it matches that key under the part's own
 *                        comparison, so an early slip is marked wrong once,
 *                        not twice. The part's own answer still counts: a
 *                        right answer is never marked wrong.
 *
 * THE VALUE IS STUDENT INPUT. It only ever becomes the TEXT of a key, which
 * the field's ordinary comparison reads exactly as it reads a typed answer;
 * nothing is evaluated or built from it. It is used only when it is a short,
 * finished piece of mathematics the comparison can read (a number, a
 * fraction, a root, a polynomial such as a+b), written only with the
 * characters and commands such an answer is written with, and it goes into
 * the key in brackets unless it is a plain unsigned number: y > (-2)x + 3,
 * (\frac{1}{2}), (a+b). Anything else (a blank, a choice, words, a relation,
 * an unfinished or over-long entry, a {name} of its own) is no value: the
 * label keeps its neutral phrase and the part is graded against its own
 * answer, exactly as without followThrough. A key that would come out longer
 * than a typed answer may be is not built either.
 *
 * A part with no followThrough is untouched by everything here.
 *
 * Pure: no React, no Firestore. Shared by the screens (MultiAnswerGrader,
 * RichQuestionRuntime's field item, PathResponseFields, the released secure
 * review), Read aloud (questionReading.js), ordinaryResponseGrading.mjs (the
 * browser and the server's assignment grading, the deadline finalizer
 * included), functions/lib/mathPath.js (secure Tests, Corrections and Path)
 * and the teacher's Path simulation (teacherPathRuntime.js). The private
 * grading stores a field's followThrough as legacyFieldGrading.mjs and
 * mathPath.js write it; only the parts it names reach a public copy.
 */
import { parsePolynomial } from './algebraicForm.mjs';
import { asNumber, normalizeAnswer } from './answerEquivalence.mjs';
import { exactConstantValue } from './exactConstantValue.mjs';
import { MAX_TYPED_ANSWER_LENGTH, hasDanglingOperator } from './typedEntryGuard.mjs';

/*
 * A follow-through placeholder is {name}: a part id in single braces, written
 * as words write it ("Using your slope of {slope}, …"). Braces that belong to
 * mathematics or to a Question Family template are not placeholders: a brace
 * group right after a letter, digit, backslash, ^, _, $ or another brace
 * (\sqrt{x}, \frac{a}{b}, x^{2}, {{k}}). The validator
 * (src/platform/contract/lessonSupportsV5.js) reads names with this same
 * pattern, so what it checks is what is replaced here.
 */
const PLACEHOLDER = /(?<![A-Za-z0-9\\^_{}$])\{([A-Za-z][A-Za-z0-9_-]*)\}(?!\})/g;
export const followThroughPlaceholders = (text) => (
  typeof text === 'string' ? [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))] : []
);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const list = (value) => (Array.isArray(value) ? value : []);
const fieldId = (field, index) => text(field?.id).trim() || `part-${index + 1}`;

/** A part's followThrough as `{ from, answer }` (answer '' where a public copy carries none), or null. */
export const followThroughOf = (field) => {
  const value = isObject(field) ? field.followThrough : null;
  if (!isObject(value)) return null;
  const from = list(value.from).map((id) => text(id).trim()).filter(Boolean);
  if (!from.length) return null;
  return { from, answer: typeof value.answer === 'string' ? value.answer : '' };
};

/** Does any part of this list build on an earlier one? */
export const hasFollowThrough = (fields) => list(fields).some((field) => followThroughOf(field) !== null);

/**
 * What a public copy of a part may say about its followThrough: which parts it
 * names, so a screen can write the student's values into its label. Never
 * the answer, which is a key.
 */
export const publicFollowThrough = (field) => {
  const value = followThroughOf(field);
  return value ? { from: [...value.from] } : null;
};

/*
 * THE VALUE. What an earlier answer may be to stand in a label and a key.
 */
// Longer than any slope, intercept or coefficient a student writes; short
// enough that a key with a few of them stays inside a typed answer's limit.
export const MAX_FOLLOW_THROUGH_VALUE_LENGTH = 40;
const ALLOWED_CHARACTERS = /^[0-9A-Za-z\s.+\-−–*/^()[\]{}\\·⋅×√]*$/;
const ALLOWED_COMMANDS = new Set(['frac', 'dfrac', 'tfrac', 'sqrt', 'cdot', 'times', 'left', 'right']);
const PLAIN_UNSIGNED_NUMBER = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const CHOICE_KINDS = new Set(['choice', 'multiplechoice', 'multiple-choice', 'select']);

const isChoicePart = (field = {}) => list(field.options).length > 0
  || list(field.choices).length > 0
  || [field.inputProfile, field.inputMode, field.type].some((kind) => CHOICE_KINDS.has(text(kind).trim().toLowerCase()));

const balanced = (value) => {
  const closing = { ')': '(', ']': '[', '}': '{' };
  const open = [];
  for (const character of value) {
    if ('([{'.includes(character)) open.push(character);
    else if (closing[character]) {
      if (open.pop() !== closing[character]) return false;
    }
  }
  return open.length === 0;
};

const COMMAND = /\\([A-Za-z]+|.)/g;
const onlyAllowedCommands = (value) => [...value.matchAll(COMMAND)]
  .every((match) => ALLOWED_COMMANDS.has(match[1]));
// A word is not a value, though the polynomial reader would take `hello` for
// a product of five letters: three letters in a row, outside a command, is a
// word (the same test labelFormat.js labelHasDelimitedMath applies).
const hasWord = (value) => /[A-Za-z]\s*[A-Za-z]\s*[A-Za-z]/.test(value.replace(COMMAND, ' '));

// Mathematics the ordinary comparison can read: a number (asNumber), an exact
// constant with roots (exactConstantValue) or a polynomial (parsePolynomial).
const readsAsMath = (value) => {
  try {
    return asNumber(value) !== null
      || exactConstantValue(normalizeAnswer(value)) !== null
      || parsePolynomial(value) !== null;
  } catch {
    return false;
  }
};

/**
 * The student's earlier answer as a follow-through value, or null when it is
 * not one (see the header): `{ shown, keyed }`, the value as the student wrote
 * it (for a label) and as it goes into a key (bracketed unless a plain
 * unsigned number).
 */
export const followThroughValue = (raw, sourceField = {}) => {
  if (isChoicePart(sourceField)) return null;
  const value = text(raw).trim();
  if (!value || value.length > MAX_FOLLOW_THROUGH_VALUE_LENGTH) return null;
  if (!ALLOWED_CHARACTERS.test(value) || !onlyAllowedCommands(value) || !balanced(value) || hasWord(value)) return null;
  if (followThroughPlaceholders(value).length || hasDanglingOperator(value)) return null;
  if (!readsAsMath(value)) return null;
  return { shown: value, keyed: PLAIN_UNSIGNED_NUMBER.test(value) ? value : `(${value})` };
};

const partsById = (fields) => new Map(list(fields).map((field, index) => [fieldId(field, index), { field, index }]));

/**
 * Each follow-through part's key for this student, by part id: the
 * followThrough answer with every {name} replaced by the student's value for
 * that part. A part is left out (and is graded against its own answer, as
 * without followThrough) when any part it names has no value, or the key
 * would be longer than a typed answer may be. Only parts before it are read,
 * as the validator requires.
 */
export const followThroughKeys = (fields = [], responsesById = {}) => {
  const keys = new Map();
  const byId = partsById(fields);
  list(fields).forEach((field, index) => {
    const value = followThroughOf(field);
    if (!value || !value.answer.trim()) return;
    const names = followThroughPlaceholders(value.answer);
    const values = new Map();
    const usable = names.every((name) => {
      const source = byId.get(name);
      if (!value.from.includes(name) || !source || source.index >= index) return false;
      const found = followThroughValue(responsesById?.[name], source.field);
      if (found) values.set(name, found.keyed);
      return Boolean(found);
    });
    if (!usable) return;
    const keyed = value.answer.replace(PLACEHOLDER, (match, name) => values.get(name) ?? match);
    if (keyed.length > MAX_TYPED_ANSWER_LENGTH) return;
    keys.set(fieldId(field, index), keyed);
  });
  return keys;
};

/** A field graded against its follow-through key alone: the key in place of every authored answer. */
export const withFollowThroughKey = (field, key) => {
  const keyed = { ...field, answer: key };
  ['expected', 'accepted', 'acceptedAnswers', 'value'].forEach((name) => { delete keyed[name]; });
  return keyed;
};

/*
 * THE LABEL.
 */
const lowerFirst = (value) => (/^[A-Z][a-z]/.test(value) ? `${value[0].toLowerCase()}${value.slice(1)}` : value);
// "your " and the part's own label, lower-cased, without a leading article:
// "The y-intercept" is "your y-intercept".
const neutralPhrase = (label) => {
  const words = lowerFirst(label.trim().replace(/[\s:?.=]+$/, '').replace(/^(?:the|a|an)\s+(?=\S)/i, ''));
  return /^your\b/i.test(words) ? words : `your ${words}`;
};

/**
 * A part's label as the student reads it: for a follow-through part, each
 * {name} it names is the student's value for that part (as mathematics,
 * `$-2$`, or bare in a label that is all LaTeX) or, while that part has none,
 * "your " and the part's own label ("your slope of the boundary line"). Any
 * other label comes back as it is.
 *
 *   latex  the label is drawn as LaTeX (labelLatex, labelFormat 'latex'): the
 *          value goes in bare and the phrase as \text{…}.
 */
export const followThroughLabel = (field, fields = [], responsesById = {}, { latex = false } = {}) => {
  const own = text(field?.label);
  if (!followThroughOf(field)) return own;
  const byId = partsById(fields);
  const asPhrase = (phrase) => (latex ? `\\text{${phrase.replace(/[{}\\$]/g, '')}}` : phrase);
  const position = (part) => {
    const index = list(fields).indexOf(part);
    return index >= 0 ? index : list(fields).findIndex((entry) => text(entry?.id) === text(part?.id));
  };
  // A part's label with each name it may use written in: an earlier part it
  // lists in `from`, each read once (`seen` stops a loop).
  const resolve = (part, seen) => {
    const label = text(part?.label);
    const value = followThroughOf(part);
    if (!value || !label) return label;
    const at = position(part);
    return label.replace(PLACEHOLDER, (match, name) => {
      const source = byId.get(name);
      if (!value.from.includes(name) || !source || seen.has(name) || (at >= 0 && source.index >= at)) return match;
      const found = followThroughValue(responsesById?.[name], source.field);
      if (found) return latex ? found.shown : `$${found.shown}$`;
      // The earlier part's own label, its names resolved the same way.
      return asPhrase(neutralPhrase(resolve(source.field, new Set([...seen, name])) || name));
    });
  };
  // A {name} the validator would refuse (not in `from`, not an earlier part)
  // is never left for the student to read as braces, and no value is read for it.
  return resolve(field, new Set([text(field?.id)])).replace(PLACEHOLDER, (match, name) => asPhrase(neutralPhrase(name)));
};

/**
 * Every part, each with its label as the student reads it (above). The same
 * array back when no part builds on another, so a screen with no
 * followThrough draws exactly what it drew.
 */
export const withFollowThroughLabels = (fields = [], responsesById = {}, { latexOf = () => false } = {}) => {
  if (!hasFollowThrough(fields)) return fields;
  return list(fields).map((field) => (followThroughOf(field)
    ? { ...field, label: followThroughLabel(field, fields, responsesById, { latex: latexOf(field) === true }) }
    : field));
};
