/*
 * FOLLOW-THROUGH PARTS: THE RULES (SP-3; docs/platform/SHOWING_THE_PROCESS.md
 * section 4, docs/assignments/AUTHORING_LEARNING_SUPPORTS.md section 6).
 *
 *   { "id": "slope", "label": "Slope of the boundary line", "answer": "-2" },
 *   { "id": "inequality", "label": "Using your slope of {slope}, write the inequality",
 *     "answer": "y > -2x + 3",
 *     "followThrough": { "from": ["slope"], "answer": "y > {slope}x + 3" } }
 *
 * followThroughKeys builds the later part's key for THIS student: the
 * followThrough answer with each {name} replaced by their earlier value. The
 * graders mark the part right when it matches that key, or its own answer,
 * under the part's own comparison, so an early slip is marked wrong once.
 *
 * THE VALUE IS STUDENT INPUT. It only ever becomes the text of a key, read as
 * a typed answer is read; nothing is evaluated or built from it. It is used
 * only when it is a short, finished piece of mathematics the comparison can
 * read, written with the characters and commands such an answer uses, and it
 * goes into the key in brackets unless it is one term already: a plain
 * unsigned number, or one unsigned \frac{..}{..} or \sqrt{..}
 * (y > (-2)x + 3, (1/2), (a+b); y > \sqrt{2}x + 3). Anything else (a blank,
 * a choice, words, a relation, an unfinished or over-long entry, a {name})
 * is no value, and the part is graded against its own answer. A key longer
 * than a typed answer may be is not built.
 *
 * Imported directly by the server's graders (questionResponseGrading.mjs,
 * functions/lib/mathPath.js) and the teacher's Path simulation; a screen
 * loads it only for a question that has a followThrough part
 * (followThroughNames.mjs loadFollowThrough) and hands it to the grader.
 */
import { parsePolynomial } from './algebraicForm.mjs';
import { asNumber, normalizeAnswer } from './answerEquivalence.mjs';
import { exactConstantValue } from './exactConstantValue.mjs';
import { MAX_TYPED_ANSWER_LENGTH, hasDanglingOperator } from './typedEntryGuard.mjs';
import {
  PLACEHOLDER, fieldId, followThroughLabel as labelWith, followThroughOf, followThroughPlaceholders, partsById,
  withFollowThroughLabels as labelsWith,
} from './followThroughNames.mjs';

export { followThroughOf, followThroughPlaceholders, hasFollowThrough, publicFollowThrough } from './followThroughNames.mjs';

export const MAX_FOLLOW_THROUGH_VALUE_LENGTH = 40;
const CHARACTERS = /^[0-9A-Za-z\s.+\-−–*/^()[\]{}\\·⋅×√]*$/;
const COMMAND = /\\([A-Za-z]+|.)/g;
const COMMANDS = new Set(['frac', 'dfrac', 'tfrac', 'sqrt', 'cdot', 'times', 'left', 'right']);
// One term already: no brackets needed around it.
const ONE_TERM = /^(?:\d+(?:\.\d+)?|\.\d+|\\[dt]?frac\{[^{}]*\}\{[^{}]*\}|\\sqrt\{[^{}]*\})$/;
const CHOICE = /^(?:choice|multiple-?choice|select)$/;

const isChoicePart = (field = {}) => Boolean(field.options?.length || field.choices?.length)
  || [field.inputProfile, field.inputMode, field.type].some((kind) => CHOICE.test(String(kind ?? '').trim().toLowerCase()));

const balanced = (value) => {
  const open = [];
  for (const character of value) {
    if ('([{'.includes(character)) open.push(character);
    else if (')]}'.includes(character) && open.pop() !== '([{'[')]}'.indexOf(character)]) return false;
  }
  return !open.length;
};

// A number, an exact constant with roots, or a polynomial: what the comparison reads.
const readsAsMath = (value) => {
  try {
    return asNumber(value) !== null || exactConstantValue(normalizeAnswer(value)) !== null || parsePolynomial(value) !== null;
  } catch {
    return false;
  }
};

/**
 * The student's earlier answer as a value, or null: `{ shown, keyed }`, as
 * written (for a label) and as it goes into a key. Three letters in a row
 * outside a command is a word, though the polynomial reader would take it.
 */
export const followThroughValue = (raw, sourceField = {}) => {
  if (isChoicePart(sourceField)) return null;
  const value = (typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '').trim();
  if (!value || value.length > MAX_FOLLOW_THROUGH_VALUE_LENGTH || !CHARACTERS.test(value) || !balanced(value)) return null;
  if ([...value.matchAll(COMMAND)].some((match) => !COMMANDS.has(match[1]))) return null;
  if (/[A-Za-z]\s*[A-Za-z]\s*[A-Za-z]/.test(value.replace(COMMAND, ' '))) return null;
  if (followThroughPlaceholders(value).length || hasDanglingOperator(value) || !readsAsMath(value)) return null;
  return { shown: value, keyed: ONE_TERM.test(value) ? value : `(${value})` };
};

/**
 * Each follow-through part's key for this student, by part id. A part is left
 * out (graded against its own answer) when a part it names, before it and in
 * its `from`, has no value, or the key would be too long.
 */
export const followThroughKeys = (fields = [], responsesById = {}) => {
  const keys = new Map();
  const byId = partsById(fields);
  (Array.isArray(fields) ? fields : []).forEach((field, index) => {
    const rule = followThroughOf(field);
    if (!rule?.answer.trim()) return;
    const values = new Map();
    const usable = followThroughPlaceholders(rule.answer).every((name) => {
      const source = byId.get(name);
      const found = rule.from.includes(name) && source && source.index < index
        ? followThroughValue(responsesById?.[name], source.field) : null;
      if (found) values.set(name, found.keyed);
      return Boolean(found);
    });
    const keyed = usable ? rule.answer.replace(PLACEHOLDER, (match, name) => values.get(name) ?? match) : '';
    if (keyed && keyed.length <= MAX_TYPED_ANSWER_LENGTH) keys.set(fieldId(field, index), keyed);
  });
  return keys;
};

/**
 * The fields as an assignment's grader reads them (ordinaryResponseGrading.mjs
 * gradeMultiAnswerResponse): a follow-through part with the label the student
 * read and, when its key is built, that key among its accepted answers, so it
 * takes the keyed answer or its own (the part's first key, which decides its
 * line form, is still its own). A numeric set marked element by element is
 * marked against the keyed set, its own answer still accepted whole. Any other
 * field is the field itself.
 */
export const withFollowThroughKeys = (fields = [], responsesById = {}) => {
  const keys = followThroughKeys(fields, responsesById);
  return fields.map((field, index) => {
    if (!followThroughOf(field)) return field;
    const out = { ...field, label: followThroughLabel(field, fields, responsesById) || field.label };
    const key = keys.get(fieldId(field, index));
    if (key === undefined) return out;
    const accepted = Array.isArray(field.acceptedAnswers) ? field.acceptedAnswers : [];
    return field.equivalence === 'numericSet' && field.partialCredit === 'matchedElements'
      ? { ...out, answer: key, acceptedAnswers: [field.answer, ...accepted].filter((entry) => entry !== undefined) }
      : { ...out, acceptedAnswers: [...accepted, key] };
  });
};

/** The label with the student's values (followThroughNames.mjs), as the rules read them. */
export const followThroughLabel = (field, fields, responsesById, options = {}) => labelWith(field, fields, responsesById, { ...options, value: followThroughValue });
export const withFollowThroughLabels = (fields, responsesById, options = {}) => labelsWith(fields, responsesById, { ...options, value: followThroughValue });
