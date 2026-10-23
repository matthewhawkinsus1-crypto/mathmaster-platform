import {
  asNumber,
  fieldAcceptsThousandsSeparators,
  fieldValueOptions,
  looksLikeFiniteSetNotation,
  normalizeAnswer,
  parseFiniteSetNotation,
  sameDigitalSatStudentProducedResponse,
  sameFiniteSetNotation,
  sameMixedNumber,
  sameNumberWithThousandsSeparators,
  normalizeStructuralMathLive,
  sameFormPreservingExpression,
  sameNumericPair,
  samePolynomialEquationRelation,
  sameValue,
  splitTopLevelCommaList,
} from './answerEquivalence.mjs';
import { sameEquivalentExpression } from './equivalentExpression.mjs';
import { exactConstantValue } from './exactConstantValue.mjs';
import { fieldRequiresSimplifiedPolynomial, isSimplifiedPolynomial } from './simplifiedPolynomialForm.mjs';

export const normalizeMathAnswer = normalizeAnswer;
export const parseNumericAnswer = asNumber;
export { fieldAcceptsThousandsSeparators, looksLikeFiniteSetNotation, parseFiniteSetNotation, sameFiniteSetNotation };

const ELLIPSIS_TOKEN = '__mathmaster_ellipsis__';
const ELLIPSIS_PATTERN = /(?:\.\.\.|…|\\ldots|\\cdots)/g;

const normalizeSequenceToken = (value) => String(value ?? '')
  .replace(ELLIPSIS_PATTERN, ELLIPSIS_TOKEN);
const PLUS_MINUS = /^(?:\\pm(?![A-Za-z])|±)\s*/;

const parseNumericRoster = (value, { allowUnenclosed = false } = {}) => {
  const prepared = normalizeSequenceToken(value);
  const authoredSet = parseFiniteSetNotation(prepared);
  let parts = authoredSet;

  if (parts === null && allowUnenclosed) {
    const normalized = normalizeMathAnswer(prepared);
    // An unenclosed comma list is accepted only when it is plainly a roster,
    // never when it could be an ordered pair or interval. Three or more entries
    // (or an ellipsis) is enough to distinguish the finite-domain use case.
    if (/^[\[\(]/.test(normalized) || /[\]\)]$/.test(normalized)) return null;
    // An unenclosed list is accepted ONLY when it carries an ellipsis.
    //
    // A bare comma list is not set notation, and setAnswerEquivalence has
    // asserted since before this feature that `-4,-3,-2,-1,0,1,2` must not
    // satisfy an authored `{-4,...,2}` — writing a set as a set is part of what
    // the question is assessing. An ellipsis is different: `0, 1, 2, ..., 48`
    // is unambiguous sequence notation that cannot be mistaken for anything
    // else, and it is the form a student reaches for when the roster is too
    // long to write out.
    //
    // The singleton case this feature was really about — `3` matching `{3}` —
    // does not come through here at all; sameSingletonSetAndScalar handles it.
    const split = normalized.split(',').filter((part) => part !== '');
    if (!normalized.includes(ELLIPSIS_TOKEN)) return null;
    parts = split;
  }

  if (!Array.isArray(parts)) return null;
  if (!parts.length) return [];

  const normalizedParts = parts.map((part) => normalizeMathAnswer(normalizeSequenceToken(part)));
  const ellipsisIndexes = normalizedParts
    .map((part, index) => (part === ELLIPSIS_TOKEN ? index : -1))
    .filter((index) => index >= 0);

  if (!ellipsisIndexes.length) {
    // "±a" is the two numbers a and −a: the Rational Zero Theorem lists its
    // candidates that way ({±1, ±2, ±1/3}), and a key written so was never
    // matched — not even by itself.
    const numbers = normalizedParts.flatMap((part) => {
      if (!PLUS_MINUS.test(part)) return [asNumber(part)];
      const magnitude = asNumber(part.replace(PLUS_MINUS, ''));
      return magnitude === null ? [null] : [magnitude, -magnitude];
    });
    return numbers.every((number) => number !== null) ? numbers : null;
  }

  if (ellipsisIndexes.length !== 1) return null;
  const ellipsisIndex = ellipsisIndexes[0];
  // Require at least two visible terms before the ellipsis and one final term.
  // That gives us an unambiguous arithmetic step without guessing student intent.
  if (ellipsisIndex < 2 || ellipsisIndex !== normalizedParts.length - 2) return null;

  const prefix = normalizedParts.slice(0, ellipsisIndex).map((part) => asNumber(part));
  const finalValue = asNumber(normalizedParts[ellipsisIndex + 1]);
  if (prefix.some((number) => number === null) || finalValue === null) return null;

  const step = prefix[1] - prefix[0];
  if (!Number.isFinite(step) || Math.abs(step) < 1e-12) return null;
  for (let index = 2; index < prefix.length; index += 1) {
    if (Math.abs((prefix[index] - prefix[index - 1]) - step) > 1e-9) return null;
  }

  const directionMatches = step > 0
    ? finalValue >= prefix[prefix.length - 1]
    : finalValue <= prefix[prefix.length - 1];
  if (!directionMatches) return null;

  const expanded = [...prefix];
  let current = prefix[prefix.length - 1] + step;
  // A malformed response must never create an unbounded loop in a grader.
  const MAX_SEQUENCE_TERMS = 10000;
  while (expanded.length < MAX_SEQUENCE_TERMS) {
    if ((step > 0 && current > finalValue + 1e-9) || (step < 0 && current < finalValue - 1e-9)) break;
    expanded.push(current);
    if (Math.abs(current - finalValue) <= 1e-9) break;
    current += step;
  }

  if (expanded.length >= MAX_SEQUENCE_TERMS) return null;
  if (Math.abs(expanded[expanded.length - 1] - finalValue) > 1e-9) return null;
  return expanded;
};

const sameNumericRoster = (left, right, tolerance = 1e-9) => {
  const leftIsSet = looksLikeFiniteSetNotation(normalizeSequenceToken(left));
  const rightIsSet = looksLikeFiniteSetNotation(normalizeSequenceToken(right));
  const leftHasEllipsis = ELLIPSIS_PATTERN.test(String(left ?? ''));
  ELLIPSIS_PATTERN.lastIndex = 0;
  const rightHasEllipsis = ELLIPSIS_PATTERN.test(String(right ?? ''));
  ELLIPSIS_PATTERN.lastIndex = 0;

  // Only broaden comma-list parsing when the comparison is actually about a
  // finite set/sequence. This keeps ordered-pair and interval grading strict.
  if (!leftIsSet && !rightIsSet && !leftHasEllipsis && !rightHasEllipsis) return false;

  const a = parseNumericRoster(left, { allowUnenclosed: rightIsSet || rightHasEllipsis });
  const b = parseNumericRoster(right, { allowUnenclosed: leftIsSet || leftHasEllipsis });
  if (!a || !b) return false;

  const uniqueSorted = (values) => [...values]
    .sort((x, y) => x - y)
    .filter((value, index, all) => index === 0 || Math.abs(value - all[index - 1]) > tolerance);
  const aa = uniqueSorted(a);
  const bb = uniqueSorted(b);
  return aa.length === bb.length && aa.every((value, index) => Math.abs(value - bb[index]) <= tolerance);
};

const sameSingletonSetAndScalar = (left, right, tolerance = 1e-9) => {
  const leftSet = parseNumericRoster(left);
  const rightSet = parseNumericRoster(right);
  const leftNumber = asNumber(left);
  const rightNumber = asNumber(right);

  if (leftSet?.length === 1 && rightNumber !== null) {
    return Math.abs(leftSet[0] - rightNumber) <= tolerance;
  }
  if (rightSet?.length === 1 && leftNumber !== null) {
    return Math.abs(rightSet[0] - leftNumber) <= tolerance;
  }
  return false;
};

export const compareMathAnswer = (studentAnswer, acceptedAnswer, tolerance = 1e-9, options = {}) => (
  sameValue(studentAnswer, acceptedAnswer, tolerance, options)
  || sameSingletonSetAndScalar(studentAnswer, acceptedAnswer, tolerance)
  || sameNumericRoster(studentAnswer, acceptedAnswer, tolerance)
);

export const matchesAnyAnswer = (studentAnswer, acceptedAnswers = [], options = {}) =>
  acceptedAnswers.some((acceptedAnswer) => compareMathAnswer(studentAnswer, acceptedAnswer, undefined, options));

/**
 * All authored correct forms for one response field.
 *
 * Path V2 uses `expected` + `accepted`; older assignments use
 * `answer` + `acceptedAnswers`. Treat those as vocabulary aliases and,
 * critically, KEEP the primary expected answer when alternatives exist.
 */
export const answerCandidatesForField = (field = {}) => {
  const values = [
    field?.expected,
    field?.answer,
    ...(Array.isArray(field?.accepted) ? field.accepted : []),
    ...(Array.isArray(field?.acceptedAnswers) ? field.acceptedAnswers : []),
  ].filter((value) => value !== undefined && value !== null);

  const seen = new Set();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// A field whose semantic contract says "ordered pair" must be graded
// coordinate-by-coordinate, not as generic normalized text. A multiAnswer
// ordered-pair field (e.g. an encoded point or an intercept's answer) used
// to fall through to `matchesAnyAnswer` here, which happened to catch most
// delimiter-serialization mismatches by coincidence (both sides normalize to
// the same text) but never compared coordinates numerically — so
// mathematically-equal-but-differently-written pairs like (1/2, 3) and
// (0.5, 3) were graded wrong.
const isOrderedPairField = (field) => (
  field?.answerFormat === 'orderedPair' || field?.inputContract?.format === 'orderedPair'
);

/** A single-number answer written with (or keyed with) thousands separators. */
export const matchesAnyNumberWithThousandsSeparators = (studentAnswer, acceptedAnswers = []) =>
  acceptedAnswers.some((acceptedAnswer) => sameNumberWithThousandsSeparators(studentAnswer, acceptedAnswer));

/*
 * FORM-SPECIFIC FIELD GRADING, LOADED WITH THE SURFACES THAT GRADE.
 *
 * `gradingMode: 'factoredForm'` and `'simplestRadicalForm'` compare
 * mathematics in a required form (factoredPolynomialExpressionEquivalence.mjs,
 * simplestRadicalFormEquivalence.mjs). This module rides in every student's
 * first load (scripts/check-first-load-budget.mjs) and their readers do not
 * need to, so they register themselves here from formSpecificFieldGrading.mjs,
 * which the multi-answer screen, the server's grading dispatch and Pre-Flight
 * import (tests/platform/formSpecificFieldGrading.test.mjs pins each import).
 */
export const FORM_SPECIFIC_GRADING_MODES = Object.freeze(['factoredForm', 'simplestRadicalForm']);
const FORM_SPECIFIC_COMPARATORS = new Map();
export const registerFormSpecificComparator = (mode, comparator) => {
  if (!FORM_SPECIFIC_GRADING_MODES.includes(mode) || typeof comparator !== 'function') {
    throw new Error(`Unknown form-specific grading mode "${mode}".`);
  }
  FORM_SPECIFIC_COMPARATORS.set(mode, comparator);
};
export const formSpecificComparatorLoaded = (mode) => FORM_SPECIFIC_COMPARATORS.has(mode);

// The key exactly as written, up to spelling (MathLive braces, `\\cdot`):
// what a form-specific mode falls back to, never a looser reading — the
// ordinary grader would accept 5·10a for 50a, which no "simplify" key means.
const sameWrittenForm = (studentAnswer, acceptedAnswer) => (
  sameFormPreservingExpression(studentAnswer, acceptedAnswer)
  || (normalizeMathAnswer(studentAnswer) !== '' && normalizeMathAnswer(studentAnswer) === normalizeMathAnswer(acceptedAnswer))
);

/*
 * A CHOICE IS THE OPTION PICKED, NOT ITS VALUE (GR06). Read as a value, an
 * option that equals the key — the unsimplified (2a²b)(4a³b) for 8a⁵b², or
 * "f(3x) − 2", which the value reader takes for "3f(x) − 2" — was marked
 * right. A choice answer names an option: it is right only when that option
 * is the key's. A key names its option by its text, or, spelled another way
 * (1/2 for \frac{1}{2}), by being the value of exactly one option. When the
 * answer or the key cannot be placed among the options, the value reading
 * stands, as before.
 */
const CHOICE_PROFILES = Object.freeze(['choice', 'multiplechoice', 'multiple-choice', 'select']);
export const isChoiceAnswerField = (field = {}) => CHOICE_PROFILES.includes(
  String(field?.inputProfile ?? field?.inputMode ?? field?.type ?? '').trim().toLowerCase(),
);
/** A choice field's options as the values an answer names: an id, a value or the option's own text. */
export const choiceFieldOptions = (field = {}) => [
  ...(Array.isArray(field?.options) && field.options.length ? field.options : Array.isArray(field?.choices) ? field.choices : []),
].map((option) => (option && typeof option === 'object' ? (option.id ?? option.value ?? option.label ?? option.text) : option))
  .filter((value) => value !== undefined && value !== null)
  .map(String);
const spelledOption = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const pickedChoiceVerdict = (studentAnswer, field, acceptedAnswers, options) => {
  if (!isChoiceAnswerField(field)) return null;
  const values = choiceFieldOptions(field);
  if (values.length < 2) return null;
  const picked = values.findIndex((value) => spelledOption(value) === spelledOption(studentAnswer));
  if (picked < 0 || spelledOption(studentAnswer) === '') return null;
  const keyed = new Set();
  acceptedAnswers.forEach((accepted) => {
    if (typeof accepted !== 'string' && typeof accepted !== 'number') return;
    const exact = values.findIndex((value) => spelledOption(value) === spelledOption(accepted));
    if (exact >= 0) { keyed.add(exact); return; }
    const byValue = values.flatMap((value, index) => (matchesAnyAnswer(value, [accepted], options) ? [index] : []));
    if (byValue.length === 1) keyed.add(byValue[0]);
  });
  return keyed.size ? keyed.has(picked) : null;
};

export const matchesFieldAnswer = (studentAnswer, field = {}) => {
  const acceptedAnswers = answerCandidatesForField(field);

  const choice = pickedChoiceVerdict(studentAnswer, field, acceptedAnswers, fieldValueOptions(field));
  if (choice !== null) return choice;

  // A field that asks for a polynomial in simplest form (answerForm:
  // 'simplifiedPolynomial') takes only an answer with nothing left to do:
  // 2a^3+5a-7-a^3+3a-2 has a^3+8a-9's value, and is still not simplified.
  // The value is then compared as for any other field.
  if (fieldRequiresSimplifiedPolynomial(field) && !isSimplifiedPolynomial(studentAnswer)) return false;

  // Job P: a Digital SAT number box (set from the item by the CCMR
  // hydration) also takes the decimal the SAT accepts.
  if (field?.numberRules === 'digitalSAT'
    && acceptedAnswers.some((acceptedAnswer) => sameDigitalSatStudentProducedResponse(studentAnswer, acceptedAnswer))) {
    return true;
  }

  if (isOrderedPairField(field)) {
    return acceptedAnswers.some((acceptedAnswer) => {
      const expectedPair = Array.isArray(acceptedAnswer) ? acceptedAnswer : parseOrderedPair(acceptedAnswer);
      if (expectedPair) return compareOrderedPair(studentAnswer, expectedPair);
      // A key with a root in a coordinate is not a pair of plain numbers:
      // compared by exact value (sameNumericPair, student pass 3), or, for a
      // pair key that is not two constants (`(\pi,\sqrt{2})`,
      // `(x+\sqrt{2},1)`), as the same text. A key that is not written as a
      // pair at all ("none") is still not one this box can take.
      if (typeof acceptedAnswer !== 'string') return false;
      const key = normalizeAnswer(acceptedAnswer);
      return sameNumericPair(studentAnswer, acceptedAnswer)
        || (/^\(.*,.*\)$/.test(key) && normalizeAnswer(studentAnswer) === key);
    });
  }

  const options = fieldValueOptions(field);
  if (options.thousandsSeparators && matchesAnyNumberWithThousandsSeparators(studentAnswer, acceptedAnswers)) {
    return true;
  }

  // An equation the question asks a student to WRITE, in whatever form they
  // write it: "y = 449 − x" or "2x + 2y = 898" for "x + y = 449" (a nonzero
  // multiple of the same relation). Opt-in, with the Path field's name for it
  // (teacherPathRuntime): by default an equation keeps the form it is keyed
  // in, because "write it in slope-intercept form" is often the question.
  if (field?.equivalence === 'polynomialRelation') {
    return acceptedAnswers.some((acceptedAnswer) => samePolynomialEquationRelation(studentAnswer, acceptedAnswer));
  }

  if (field?.gradingMode === 'equivalentExpression') {
    // A mixed number against a number key is read as one here too, never as
    // a product (answerEquivalence.sameMixedNumber).
    return acceptedAnswers.some((acceptedAnswer) => (
      sameMixedNumber(studentAnswer, acceptedAnswer) ?? sameEquivalentExpression(studentAnswer, acceptedAnswer)));
  }

  // factoredForm: a factoring answer in any factor order, with a sign moved
  // between factors, is the same factorization; an expanded or less complete
  // one is not. simplestRadicalForm: any arrangement of the key's value that
  // is fully simplified, in the key's notation — never the question retyped
  // or a decimal. The key exactly as written is always right, so a surface
  // that has not loaded the comparator (below) only ever errs toward "not
  // yet", never toward credit.
  if (FORM_SPECIFIC_GRADING_MODES.includes(field?.gradingMode)) {
    const comparator = FORM_SPECIFIC_COMPARATORS.get(field.gradingMode);
    return acceptedAnswers.some((acceptedAnswer) => (
      (typeof comparator === 'function' && comparator(studentAnswer, acceptedAnswer) === true)
      || sameWrittenForm(studentAnswer, acceptedAnswer)));
  }

  return matchesAnyAnswer(studentAnswer, acceptedAnswers, options);
};

export const parseOrderedPair = (value) => {
  const normalized = normalizeMathAnswer(value)
    .replace(/^\\?\(/, '')
    .replace(/\\?\)$/, '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\\langle|\\rangle/g, '');

  const parts = normalized.split(',');
  if (parts.length !== 2) return null;
  const x = asNumber(parts[0]);
  const y = asNumber(parts[1]);
  if (x === null || y === null) return null;
  return [x, y];
};

/*
 * THE KEY OF AN `orderedPair` (OR `system`) QUESTION, AS [x, y].
 *
 * The catalog's shape is an array, `answer: [2, 5]`, and every reader of the
 * key (the grader, Solution Review, Pre-Flight, the miss checks) read only
 * that. Imported or AI-written JSON can key the same point as text,
 * `answer: '(2,3)'`, and that question could never be marked right
 * (student pass 3, wave 7). This reads either shape:
 *
 *   - an array of two coordinates;
 *   - text written as a pair: `(2, 3)`, `\left(2,3\right)`, `[2, 3]` or a
 *     bare `2, 3`.
 *
 * A coordinate is a plain number (kept as a number), or text the graders read
 * as one exact value — `1/2`, `\frac{1}{2}`, `1-\sqrt{2}` — kept as written,
 * so a fraction is not turned into a decimal. Anything else (a letter, a third
 * coordinate, words) is not a pair: null. The V5 compile and the JSON import
 * store this array (src/platform/contract/authoringIntentV5Core.js,
 * src/assignmentBlueprint.js) and Pre-Flight refuses a key it returns null
 * for (questionTypeCatalog orderedPair).
 */
const PLAIN_NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const readableCoordinate = (entry) => {
  if (typeof entry === 'number') return Number.isFinite(entry) ? entry : null;
  if (typeof entry !== 'string') return null;
  const text = entry.trim().replace(/[−–—]/g, '-');
  if (!text) return null;
  if (PLAIN_NUMBER.test(text)) return Number(text);
  return asNumber(text) !== null || exactConstantValue(normalizeMathAnswer(text)) ? text : null;
};

// `(x, y)`, `[x, y]` or a bare `x, y`, as two coordinate texts.
const splitPairText = (value) => {
  let text = normalizeStructuralMathLive(value).trim();
  if (/^[([].*[)\]]$/s.test(text)) text = text.slice(1, -1);
  const parts = splitTopLevelCommaList(text);
  return parts.length === 2 ? parts : null;
};

export const orderedPairKey = (value) => {
  const parts = Array.isArray(value) ? value : (typeof value === 'string' ? splitPairText(value) : null);
  if (!parts || parts.length !== 2) return null;
  const coordinates = parts.map(readableCoordinate);
  return coordinates.every((coordinate) => coordinate !== null) ? coordinates : null;
};

/** Is a student's response written as two coordinates in brackets? (Not whether they are right.) */
export const looksLikeOrderedPair = (value) => {
  const text = normalizeMathAnswer(value);
  return /^[([].*[)\]]$/.test(text) && Boolean(splitPairText(text)?.every(Boolean));
};

/**
 * One coordinate of the student's pair against the key's (index 0 or 1), for
 * the per-part marks. A plain key coordinate is compared by value; an exact
 * one with a root by its exact value (sameNumericPair's rules).
 */
export const sameOrderedPairCoordinate = (studentAnswer, expectedPair, index, tolerance = 1e-9) => {
  const key = orderedPairKey(expectedPair);
  const student = splitPairText(normalizeMathAnswer(studentAnswer));
  if (!key || !student) return false;
  const keyNumber = asNumber(key[index]);
  if (keyNumber !== null) {
    const value = asNumber(student[index]);
    return value !== null && Math.abs(value - keyNumber) <= tolerance;
  }
  const other = key[1 - index];
  const pairOf = (coordinate) => (index === 0 ? `(${coordinate},${other})` : `(${other},${coordinate})`);
  return sameNumericPair(pairOf(student[index]), pairOf(key[index]));
};

export const compareOrderedPair = (studentAnswer, expectedPair, tolerance = 1e-9) => {
  const key = orderedPairKey(expectedPair);
  if (!key) return false;
  // A coordinate as a number, or null when it is exact text with a root.
  const values = key.map(asNumber);
  if (values.every((value) => value !== null)) {
    const pair = parseOrderedPair(studentAnswer);
    return Boolean(pair)
      && Math.abs(pair[0] - values[0]) <= tolerance
      && Math.abs(pair[1] - values[1]) <= tolerance;
  }
  // A coordinate with a root: by exact value, as a pair field compares it. The
  // student's pair is read with the brackets a plain key takes, `(x, y)` or
  // `[x, y]`: sameNumericPair alone reads only round ones.
  const student = splitPairText(normalizeMathAnswer(studentAnswer));
  return Boolean(student) && sameNumericPair(`(${student[0]},${student[1]})`, `(${key[0]},${key[1]})`);
};
