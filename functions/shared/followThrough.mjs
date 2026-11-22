/*
 * FOLLOW-THROUGH PARTS: THE RULES (SP-3; docs/platform/SHOWING_THE_PROCESS.md
 * section 4, docs/assignments/AUTHORING_LEARNING_SUPPORTS.md section 6).
 *
 *   { "id": "slope", "label": "Slope of the boundary line", "answer": "-2" },
 *   { "id": "inequality", "label": "Using your slope of {slope}, write the inequality",
 *     "answer": "y > -2x + 3",
 *     "followThrough": { "from": ["slope"], "answer": "y > {slope}x + 3" } }
 *
 * followThroughKeys builds the later part's keys for THIS student: the
 * followThrough answer with each {name} replaced by their earlier value. The
 * graders mark the part right when it matches one of those keys, or its own
 * answer, under the part's own comparison, so an early slip is marked wrong
 * once.
 *
 * THE VALUE IS STUDENT INPUT. It only ever becomes the text of a key, read as
 * a typed answer is read; nothing is evaluated or built from it. It is used
 * only when it is a short, finished piece of mathematics the comparison can
 * read, written with the characters and commands such an answer uses.
 * Anything else (a blank, a choice, words, a relation, an unfinished or
 * over-long entry, a {name}) is no value, and the part is graded against its
 * own answer. A key longer than a typed answer may be is not built.
 *
 * THE KEYS. The first always has the value in brackets, unless it is a plain
 * unsigned number: y > (-2)x + 3, (1/2), (a+b). The comparison does not
 * always see through brackets round a root (y > (-\sqrt{2})x + 3 is not
 * y > -\sqrt{2}x + 3 to it), so a value that is one term (a monomial: an
 * optional sign, then numbers, \sqrt{..} and \frac{..}{..} with no sign
 * inside) also gets the key written the ordinary way, where that reads the
 * same as the bracketed key:
 *   - bare, where nothing before it binds to it: at the start, after a
 *     relation, an opening bracket or a comma, and (unsigned only) after
 *     + or -: y > -\sqrt{2}x + 3, 3 - 2\sqrt{2}x;
 *   - a signed one after + or -, with the two signs folded:
 *     3 - {slope}x with -\sqrt{2} is 3 + \sqrt{2}x, never 3 - -\sqrt{2}x;
 *   - and in neither form when what follows binds to it (a power, a
 *     subscript, a digit, a point, a command, a division): then only the
 *     bracketed key is built.
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
import { numericSetCredit } from './numericSetCredit.mjs';
import {
  PLACEHOLDER, fieldId, followThroughLabel as labelWith, followThroughOf, followThroughPlaceholders, partsById,
  withFollowThroughLabels as labelsWith,
} from './followThroughNames.mjs';

export { followThroughOf, followThroughPlaceholders, hasFollowThrough, publicFollowThrough } from './followThroughNames.mjs';

export const MAX_FOLLOW_THROUGH_VALUE_LENGTH = 40;
const CHARACTERS = /^[0-9A-Za-z\s.+\-−–*/^()[\]{}\\·⋅×√]*$/;
const COMMAND = /\\([A-Za-z]+|.)/g;
const COMMANDS = new Set(['frac', 'dfrac', 'tfrac', 'sqrt', 'cdot', 'times', 'left', 'right']);
const PLAIN_NUMBER = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
// A monomial: an optional sign, then numbers, roots and fractions with no sign inside.
const FACTOR = String.raw`(?:\d+(?:\.\d+)?|\.\d+|\\sqrt\{[^{}+\-−]*\}|\\[dt]?frac\{[^{}+\-−]*\}\{[^{}+\-−]*\})`;
const MONOMIAL = new RegExp(String.raw`^([-−–]?)\s*(${FACTOR}(?:\s*(?:\\cdot|\\times|\*|·)?\s*${FACTOR})*)$`);
// What may stand before a bare value (the text before it, spaces dropped):
// the start, a relation, an opening bracket or a comma; and, for an unsigned
// one, a sign. What may follow it: the end, a sign, a relation, a closing
// bracket, a comma, a letter or an opening bracket (a product, which binds
// tighter than the sign). Anything else binds to it: only brackets then.
const OPENS = /(?:^|[=<>≤≥≠([{,]|\\(?:le|ge|leq|geq|lt|gt|ne|neq))$/;
const SIGN_BEFORE = /[+\-−–]$/;
const FOLLOWS = /^(?:$|[+\-−–=<>≤≥≠)\]},A-Za-z(])/;
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
  const monomial = MONOMIAL.exec(value);
  return {
    shown: value,
    keyed: PLAIN_NUMBER.test(value) ? value : `(${value})`,
    ...(monomial ? { sign: monomial[1], term: monomial[2] } : {}),
  };
};

// The value written the ordinary way at this place in the answer, with the
// text before it (whose last sign may be folded), or null where only the
// bracketed key reads the same (see the header).
const ordinaryAt = (found, before, after) => {
  if (found.term === undefined || !FOLLOWS.test(after.trimStart()) || /^[\s]*[\^_.\d\\/!]/.test(after)) return null;
  const head = before.trimEnd();
  if (OPENS.test(head)) return { before, text: `${found.sign}${found.term}` };
  if (!SIGN_BEFORE.test(head)) return null;
  if (!found.sign) return { before, text: found.term };
  // A signed value after a sign: the two signs folded into one.
  return { before: `${head.slice(0, -1)}${head.endsWith('+') ? '-' : '+'} `, text: found.term };
};

// The answer with each {name} written in: bracketed, or the ordinary way.
const writeIn = (answer, values, ordinary) => {
  let out = '';
  let last = 0;
  for (const match of answer.matchAll(PLACEHOLDER)) {
    const found = values.get(match[1]);
    let before = out + answer.slice(last, match.index);
    let text = found.keyed;
    if (ordinary) {
      const plain = ordinaryAt(found, before, answer.slice(match.index + match[0].length));
      if (plain) ({ before, text } = plain);
    }
    out = before + text;
    last = match.index + match[0].length;
  }
  return out + answer.slice(last);
};

/**
 * Each follow-through part's keys for this student, by part id: the bracketed
 * key, then the same written the ordinary way where that differs (see the
 * header). A part is left out (graded against its own answer) when a part it
 * names, before it and in its `from`, has no value, or a key would be too long.
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
      if (found) values.set(name, found);
      return Boolean(found);
    });
    if (!usable) return;
    const written = [...new Set([writeIn(rule.answer, values, false), writeIn(rule.answer, values, true)])];
    if (written.every((key) => key.length <= MAX_TYPED_ANSWER_LENGTH)) keys.set(fieldId(field, index), written);
  });
  return keys;
};

/**
 * The fields as an assignment's grader reads them (ordinaryResponseGrading.mjs
 * gradeMultiAnswerResponse): a follow-through part with the label the student
 * read and, when its key is built, that key among its accepted answers, so it
 * takes the keyed answer or its own (the part's first key, which decides its
 * line form, is still its own). A numeric set marked element by element
 * earns the better of its credit against its own set and against the keyed
 * one: whichever is better for this response is the set it is marked
 * against, and the other is still accepted whole. Any other field is the
 * field itself.
 */
export const withFollowThroughKeys = (fields = [], responsesById = {}) => {
  const keys = followThroughKeys(fields, responsesById);
  return fields.map((field, index) => {
    if (!followThroughOf(field)) return field;
    const out = { ...field, label: followThroughLabel(field, fields, responsesById) || field.label };
    const keyed = keys.get(fieldId(field, index));
    if (!keyed) return out;
    const accepted = Array.isArray(field.acceptedAnswers) ? field.acceptedAnswers : [];
    if (field.equivalence !== 'numericSet' || field.partialCredit !== 'matchedElements') return { ...out, acceptedAnswers: [...accepted, ...keyed] };
    // The authored set first, so a tie keeps it, as on a question with no followThrough.
    const sets = [field.answer, ...keyed].filter((entry) => entry !== undefined);
    const credit = (set) => numericSetCredit(responsesById?.[field.id], set, field.numericTolerance);
    const best = sets.reduce((top, set) => (credit(set) > credit(top) ? set : top));
    return { ...out, answer: best, acceptedAnswers: [...sets.filter((set) => set !== best), ...accepted] };
  });
};

/** The label with the student's values (followThroughNames.mjs), as the rules read them. */
export const followThroughLabel = (field, fields, responsesById, options = {}) => labelWith(field, fields, responsesById, { ...options, value: followThroughValue });
export const withFollowThroughLabels = (fields, responsesById, options = {}) => labelsWith(fields, responsesById, { ...options, value: followThroughValue });
