/*
 * WHY WAS THIS MARKED WRONG? THE THREE REASONS THAT NEED THE ANSWER KEY (#249).
 *
 * The Response Inspector already says when there is no history, when replay
 * disagrees, when a box was blank, when work was not saved before the close and
 * when the saved workspace differs from what was graded. Three causes a teacher
 * asked for were missing; each is decided here from evidence the inspector
 * already holds — the stored submitted snapshot, the recorded automatic result,
 * the replay against the current question, and the question itself:
 *
 *   answer key changed   what the attempt was graded against is not the key the
 *                        question has now: a fingerprint of the key stored with
 *                        the grading evidence, the question's version, or (for
 *                        evidence stored before the fingerprint) a box added,
 *                        removed or compared another way.
 *   parser changed the   the grader read the typed text as something the
 *   input                student did not write — a dash that is not read as a
 *                        minus sign, digits or a fraction character it does not
 *                        read, a percent sign it drops, a comma it does not read
 *                        as a decimal point — AND read the way it was written,
 *                        the answer is right. Both are shown.
 *   equivalent answer    the answer has the key's value by the platform's own
 *   rejected             comparison with its form rules switched off, yet the
 *                        grader refused it. The rule that refused it is named:
 *                        the box setting or the platform default that asks for
 *                        a form. The grader records no rule of its own, so the
 *                        rule is found by re-reading with each one switched off
 *                        in turn, through the same matcher.
 *
 * PRECISION BEFORE COVERAGE. Each is stated only when it is true, so a teacher
 * can trust it: the equivalence and parser reasons are given only for a typed
 * answer that BOTH the recorded grade and today's replay mark wrong (so the
 * explanation is about the refusal the teacher is looking at, by the grader and
 * key that exist now), never when the key has changed since, and never with a
 * tolerance looser than the grader's own (a literal or table answer is read to
 * 1e-9, as gradeLiteralResponse and gradeTableResponse read it). A key change
 * is claimed only for what the evidence can show; a graph or a tool's key is
 * spread across its configuration, so for those only a stated version counts.
 *
 * Pure: no Firestore, no clock, no React. Every value read here is student
 * text or authored data and is read defensively; nothing here throws on it.
 */
import {
  answerCandidatesForField,
  compareMathAnswer,
  isChoiceAnswerField,
  matchesAnyNumberWithThousandsSeparators,
  matchesFieldAnswer,
  normalizeMathAnswer,
  orderedPairKey,
  parseNumericAnswer,
} from './answerUtils.mjs';
// The factoredForm / simplestRadicalForm comparators (answerUtils.mjs).
import './formSpecificFieldGrading.mjs';
import { fieldIsNumberBox, sameMixedNumber, samePolynomialEquationRelation } from './answerEquivalence.mjs';
import { sameEquivalentExpression } from './equivalentExpression.mjs';
import { generateStableUUID, stableStringify } from './idUtils.mjs';
import { LINE_FORM_ANY } from './linearEquationForm.mjs';
import { withLineFormPolicy } from './lineFormPolicy.mjs';
import {
  gradeOrderedPairResponse,
  gradeSystemResponse,
  multiAnswerFields,
  systemSolutionKey,
} from './ordinaryResponseGrading.mjs';
import { resolveGradingSurfaceId } from './serverGrading/gradingManifest.mjs';
import { fieldRequiresSimplifiedPolynomial } from './simplifiedPolynomialForm.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (value === null || value === undefined ? '' : String(value));
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const MAX_SHOWN = 160;
/** A value as it is shown in a reason: as written, bounded. */
export const shownValue = (value) => {
  const written = typeof value === 'string' ? value : (() => {
    try { return JSON.stringify(value) ?? ''; } catch { return ''; }
  })();
  return written.length > MAX_SHOWN ? `${written.slice(0, MAX_SHOWN)}…` : written;
};
// A table looked up by its own keys only: stored or typed text such as
// "__proto__" is never a key of it.
const own = (table, key) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined);
const safely = (read, fallback) => {
  try { return read(); } catch { return fallback; }
};

/* ---------------------------------------------------------------------------
 * THE ANSWER KEY, AS A FINGERPRINT.
 *
 * Stored with the grading evidence (never the key itself: the evidence keeps
 * no answer key) and compared with the current question's. Only what decides
 * whether an answer is right is in it, so editing a prompt, a hint or a label,
 * or how a box is answered, never reads as a key change. One fingerprint per
 * part, so the reason can say WHICH box changed.
 *
 * VERSIONED, because it is stored. Version 1 (evidence stored before the
 * version existed carries none) hashed every property of a box but a short
 * presentation list, so a choice's options and their order, each option's
 * rationale and the box's input and tool profiles counted as its key: a Safe
 * Live Repair (a typed box turned into choices, the key unchanged) read as a
 * key change. Version 2 hashes a box's accepted answers and the rules the
 * grader compares them by. Only a box's projection changed; every other
 * surface's key hashes the same in both. A stored fingerprint is compared with
 * the current question's under its own version (findAnswerKeyChange).
 * ------------------------------------------------------------------------- */

export const ANSWER_KEY_FINGERPRINT_VERSION = 2;
const FINGERPRINT_VERSIONS = new Set([1, 2]);

/*
 * A box's key: the answers it accepts and the rules its author set for
 * comparing them, which is everything gradeMultiAnswerResponse and
 * matchesFieldAnswer (answerUtils.mjs) decide a verdict or a part's credit
 * from, apart from how the answer is entered and what the question's words
 * imply. The entry (a typed box or choices, the options and their order, its
 * input mode, input and tool profiles, answer format and notation) also
 * steers how a typed answer is read (a choice is the option picked; a number
 * box refuses a calculation), and a prompt that names no form lets a line box
 * take any form (lineFormPolicy.mjs); when either changes a verdict, the
 * replay of the stored answer shows it. The box's weight, label, hints and
 * each choice's rationale decide no verdict.
 */
const FIELD_VERDICT_RULES = Object.freeze([
  'gradingMode', 'equivalence', 'lineForm', 'answerForm', 'numericTolerance', 'numberRules',
  'allowArithmetic', 'partialCredit',
]);
// Version 1: a box's own keys that only present it (the rest was hashed).
const V1_FIELD_PRESENTATION_KEYS = new Set([
  'label', 'prompt', 'placeholder', 'instructions', 'responseHint', 'hint', 'hints', 'helpText', 'help',
  'description', 'ariaLabel', 'prefix', 'suffix', 'unit', 'width', 'size', 'feedback', 'explanation',
  'rationale', 'misconception', 'misconceptions', 'example', 'keypad', 'keyboard', 'order', 'display', 'tooltip',
]);
// What Step Algebra (and a literal on the balance) grades against: the
// equation it opens with, the objective, the answers and each prompt's key.
const STEP_ALGEBRA_KEY_FIELDS = Object.freeze([
  'equation', 'equationAscii', 'equationText', 'initialEquation', 'formula', 'equationLatex', 'formulaLatex',
  'leftExpression', 'rightExpression', 'relation', 'comparator', 'inequalitySymbol', 'expressions', 'relations',
  'standard', 'solveFor', 'variable', 'objective', 'mode', 'answer', 'acceptedAnswers', 'generatedAnswer',
]);
const STEP_ALGEBRA_SURFACES = new Set(['stepAlgebra', 'algebra', 'literalWorkspace']);

const pick = (source, keys) => Object.fromEntries(keys
  .filter((key) => source?.[key] !== undefined)
  .map((key) => [key, source[key]]));
const fieldKeyProjection = (field) => {
  const box = isObject(field) ? field : {};
  return {
    // The same answers in any order are the same key.
    accepts: answerCandidatesForField(box).map((value) => stableStringify(value)).sort(),
    ...pick(box, FIELD_VERDICT_RULES),
  };
};
const v1FieldKeyProjection = (field) => Object.fromEntries(Object.entries(isObject(field) ? field : {})
  .filter(([key, value]) => !V1_FIELD_PRESENTATION_KEYS.has(key) && value !== undefined));
const promptKeyProjection = (prompt) => pick(isObject(prompt) ? prompt : {}, ['acceptedExpressions', 'acceptedAnswers', 'acceptedExpression']);

const keyParts = (question, surface, version) => {
  if (surface === 'multiAnswer') {
    const project = version === 1 ? v1FieldKeyProjection : fieldKeyProjection;
    return Object.fromEntries(multiAnswerFields(question).map((field) => [String(field.id), project(field)]));
  }
  if (surface === 'literal') return { literal: list(question.acceptedAnswers) };
  if (surface === 'table') {
    const answers = isObject(question?.table?.answers) ? question.table.answers : {};
    return {
      ...Object.fromEntries(Object.entries(answers).map(([key, value]) => [String(key), value])),
      '__blanks': list(question?.table?.blanks).map(String),
    };
  }
  if (surface === 'orderedPair') return { response: orderedPairKey(question.answer || question.solution) ?? [question.answer ?? null, question.solution ?? null] };
  if (surface === 'system') return { response: systemSolutionKey(question) ?? [question.solution ?? null, question.answer ?? null] };
  if (STEP_ALGEBRA_SURFACES.has(surface)) {
    return {
      equation: pick(question, STEP_ALGEBRA_KEY_FIELDS),
      ...Object.fromEntries(list(question.algebraPrompts).map((prompt, index) => [
        String(prompt?.id || `algebra-prompt-${index + 1}`),
        promptKeyProjection(prompt),
      ])),
    };
  }
  return null;
};

const hashOf = (value) => generateStableUUID(stableStringify(value));

/**
 * The key a question grades against, fingerprinted: `{ version, surface,
 * whole, parts }`, or null for a surface whose key is not a named set of
 * fields (a graph, a tool, a generated instance not delivered here).
 * `version` 1 is only ever asked for to read evidence stored with it.
 *
 * `parts` is a list of `{ id, hash }`, never a record keyed by box id: an
 * author names the boxes, and Firestore refuses some names as field names
 * (`__x__` is reserved), which would refuse the whole evidence document.
 */
export const answerKeyFingerprint = (question, { version = ANSWER_KEY_FINGERPRINT_VERSION } = {}) => safely(() => {
  if (!isObject(question) || !FINGERPRINT_VERSIONS.has(version)) return null;
  const surface = resolveGradingSurfaceId(question);
  const parts = surface ? keyParts(question, surface, version) : null;
  if (!parts) return null;
  return {
    version,
    surface,
    whole: hashOf({ surface, parts }),
    parts: Object.entries(parts).map(([id, value]) => ({ id, hash: hashOf(value) })),
  };
}, null);

// The version a stored fingerprint was made with: none written is version 1;
// anything else this code does not know is null, and is not compared.
const fingerprintVersion = (fingerprint) => {
  const version = fingerprint?.version;
  if (version === undefined || version === null) return 1;
  return FINGERPRINT_VERSIONS.has(version) ? version : null;
};

// A fingerprint's part hashes by id (a list; tolerant of anything else).
const partHashes = (fingerprint) => new Map(list(fingerprint?.parts)
  .filter((part) => isObject(part) && typeof part.id === 'string')
  .map((part) => [part.id, part.hash]));

/* ---------------------------------------------------------------------------
 * EACH TYPED ANSWER, WITH THE COMPARISON ITS GRADER USES.
 *
 * A unit is one thing the student typed and the grader compared: a multi-answer
 * box, a literal answer, a table cell, a whole ordered pair. `accepts(text,
 * config)` is the grader's comparison under `config`; `config` starts as the
 * grader's own, and each rule says how to switch one form rule off.
 * ------------------------------------------------------------------------- */

const without = (record, keys) => Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
const FORM_MODE_RULES = Object.freeze({ factoredForm: 'factored-form', simplestRadicalForm: 'simplest-radical-form', sidesAsKeyed: 'sides-as-keyed' });
const KEY_FIELDS = ['expected', 'answer', 'accepted', 'acceptedAnswers'];

// The written-form rule: the box compares the answer in the key's form unless
// it opts into expression or relation equivalence (answerUtils.mjs: "Expression
// equivalence is deliberately opt-in at the field level"). Switched off, the
// box is read every way the platform reads a value. A box that names a form
// of its own (factored form, simplest radical form, sides as keyed) keeps it:
// that is its own rule, switched off by that rule, never by this one.
const writtenFormVariants = (field) => {
  if (own(FORM_MODE_RULES, field.gradingMode)) return [];
  const plain = without(field, ['gradingMode', ...(field.equivalence === 'polynomialRelation' ? ['equivalence'] : [])]);
  return [
    plain,
    { ...plain, gradingMode: 'equivalentExpression' },
    { ...plain, equivalence: 'polynomialRelation' },
  ].filter((variant) => stableStringify(variant) !== stableStringify(field));
};

// A box's form rules, in the order matchesFieldAnswer applies them.
const fieldRules = (field) => {
  const rules = [];
  if (isChoiceAnswerField(field)) rules.push({ rule: 'choice-option', relax: (f) => [without(f, ['inputProfile', 'inputMode', 'type'])] });
  if (fieldRequiresSimplifiedPolynomial(field)) rules.push({ rule: 'simplified-polynomial', relax: (f) => [without(f, ['answerForm'])] });
  if (own(FORM_MODE_RULES, field.gradingMode)) rules.push({ rule: own(FORM_MODE_RULES, field.gradingMode), relax: (f) => [without(f, ['gradingMode'])] });
  if (fieldIsNumberBox(field) && field.allowArithmetic !== true) rules.push({ rule: 'calculation', relax: (f) => [{ ...f, allowArithmetic: true }] });
  if (field.lineForm !== LINE_FORM_ANY) rules.push({ rule: 'line-form', relax: (f) => [{ ...f, lineForm: LINE_FORM_ANY }] });
  rules.push({ rule: 'written-form', relax: writtenFormVariants });
  return rules;
};

const fieldUnit = (question, authored, value) => {
  const field = withLineFormPolicy(question, authored);
  return {
    id: String(authored.id),
    label: text(authored.label || authored.id),
    text: text(value),
    keys: answerCandidatesForField(authored),
    config: field,
    // gradeMultiAnswerResponse: a blank box is never correct.
    accepts: (typed, config) => typed.trim() !== '' && matchesFieldAnswer(typed, config) === true,
    // The one key the answer equals, read with `config`.
    keyMatching: (typed, config) => answerCandidatesForField(config).find((key) => (
      matchesFieldAnswer(typed, { ...without(config, KEY_FIELDS), answer: key }) === true
    )),
    rules: fieldRules(field),
  };
};

// literal and table cells: compareMathAnswer at its own 1e-9, then thousands
// separators (gradeLiteralResponse, gradeTableResponse). Their form rules are
// the default ones: the line keeps its keyed form, and an expression the form
// it is keyed in.
const valueAccepts = (typed, key, config) => (
  compareMathAnswer(typed, key, undefined, config.anyLineForm ? { anyLineForm: true } : {})
  || matchesAnyNumberWithThousandsSeparators(typed, [key])
  || (config.writtenForm === true && (
    (sameMixedNumber(typed, key, 1e-9) ?? sameEquivalentExpression(typed, key, 1e-9))
    || samePolynomialEquationRelation(typed, key, 1e-9)))
);
const VALUE_RULES = Object.freeze([
  { rule: 'line-form', relax: (config) => [{ ...config, anyLineForm: true }] },
  { rule: 'written-form', relax: (config) => [{ ...config, writtenForm: true }] },
]);
const valueUnit = ({ id, label, value, keys }) => ({
  id,
  label,
  text: text(value),
  keys,
  config: { anyLineForm: false, writtenForm: false },
  accepts: (typed, config) => typed.trim() !== '' && keys.some((key) => valueAccepts(typed, key, config)),
  keyMatching: (typed, config) => keys.find((key) => valueAccepts(typed, key, config)),
  rules: VALUE_RULES,
});

// A pair is compared coordinate by coordinate; it has no form rule to name.
const pairUnit = ({ value, key, accepts }) => ({
  id: 'response',
  label: 'Ordered pair',
  text: text(value),
  keys: key === null || key === undefined ? [] : [key],
  config: {},
  accepts: (typed) => typed.trim() !== '' && accepts(typed),
  keyMatching: () => key,
  rules: [],
  whole: true,
});

const submittedFieldValues = (response) => new Map(list(response?.fields)
  .filter((field) => field && field.id !== undefined && field.id !== null)
  .map((field) => [String(field.id), text(field.value)]));

/** The typed answers of a question, each with its grader's comparison. Empty for any other surface. */
export const typedResponseUnits = ({ question, response } = {}) => safely(() => {
  if (!isObject(question) || !isObject(response)) return [];
  const surface = resolveGradingSurfaceId(question);
  if (surface === 'multiAnswer' && response.kind === 'fields') {
    const values = submittedFieldValues(response);
    return multiAnswerFields(question).map((field) => fieldUnit(question, field, values.get(String(field.id)) ?? ''));
  }
  if (surface === 'table' && response.kind === 'fields') {
    const values = submittedFieldValues(response);
    const answers = isObject(question?.table?.answers) ? question.table.answers : {};
    return Object.keys(answers).map((key) => valueUnit({ id: key, label: `Table blank ${key}`, value: values.get(key) ?? '', keys: [answers[key]] }));
  }
  if (surface === 'literal' && response.kind !== 'fields') {
    return [valueUnit({
      id: 'literal',
      label: text(question.solveFor).trim() ? `Expression for ${text(question.solveFor).trim()}` : 'Your answer',
      value: response.value,
      keys: list(question.acceptedAnswers),
    })];
  }
  if (surface === 'orderedPair' && response.kind !== 'fields') {
    const key = orderedPairKey(question.answer || question.solution) || question.answer || question.solution;
    return [pairUnit({ value: response.value, key, accepts: (typed) => gradeOrderedPairResponse(question, typed).isCorrect === true })];
  }
  if (surface === 'system' && response.kind !== 'fields') {
    return [pairUnit({ value: response.value, key: systemSolutionKey(question), accepts: (typed) => gradeSystemResponse(question, typed).isCorrect === true })];
  }
  return [];
}, []);

// Was this unit marked wrong in a grading result? A part the grader does not
// grade is never "wrong"; a whole pair is wrong when the result is.
const markedWrong = (result, unit) => {
  if (!isObject(result)) return false;
  if (unit.whole) return result.isCorrect === false;
  const part = list(result.parts).find((entry) => String(entry?.id) === unit.id);
  return Boolean(part) && part.graded !== false && part.isCorrect !== true;
};

/* ---------------------------------------------------------------------------
 * AN ANSWER EQUAL TO THE KEY THAT WAS NOT ACCEPTED.
 * ------------------------------------------------------------------------- */

const acceptsAny = (unit, typed, configs) => configs.some((config) => safely(() => unit.accepts(typed, config), false));

// Rules that name a form of their own; the written-form default adds nothing
// to a sentence that already names one.
const NAMED_FORM_RULES = new Set(['simplified-polynomial', 'factored-form', 'simplest-radical-form', 'sides-as-keyed']);

// The configurations left when `chosen` rules are switched off, in order. A
// rule with nothing to switch off (written-form on a box with a named form)
// leaves them as they were.
const relaxedBy = (unit, chosen) => chosen.reduce((configs, { relax }) => configs.flatMap((config) => {
  const relaxed = relax(config);
  return relaxed.length ? relaxed : [config];
}), [unit.config]);

/*
 * The rule that refused it: the first rule that ALONE lets the answer through;
 * failing that, the rules switched off one after another, in the matcher's
 * order, until it is let through — and then only those of them it needs.
 * Null when no rule does: then the platform's own comparison says the answer
 * is not equal to the key, and nothing is said.
 */
export const refusingRules = (unit, typed = unit.text) => {
  if (acceptsAny(unit, typed, [unit.config])) return null;
  for (const rule of unit.rules) {
    const configs = rule.relax(unit.config);
    if (configs.length && acceptsAny(unit, typed, configs)) return { rules: [rule.rule], configs };
  }
  for (let count = 2; count <= unit.rules.length; count += 1) {
    const applied = unit.rules.slice(0, count);
    if (!acceptsAny(unit, typed, relaxedBy(unit, applied))) continue;
    // Keep only the rules it needs: one whose removal still lets it through is dropped.
    const needed = applied.filter((rule) => !acceptsAny(unit, typed, relaxedBy(unit, applied.filter((other) => other !== rule))));
    const kept = needed.length ? needed : applied;
    const names = kept.map((rule) => rule.rule);
    return {
      rules: names.some((name) => NAMED_FORM_RULES.has(name)) ? names.filter((name) => name !== 'written-form') : names,
      configs: relaxedBy(unit, kept),
    };
  }
  return null;
};

const firstKeyMatching = (unit, typed, configs) => {
  for (const config of configs) {
    const key = safely(() => unit.keyMatching(typed, config), undefined);
    if (key !== undefined) return key;
  }
  return unit.keys[0];
};

/**
 * The typed answers both the recorded grade and today's replay marked wrong
 * whose value is the key's: `[{ id, label, typed, key, rules }]`.
 */
export const findEquivalentRejections = ({ question, response, original, current } = {}) => typedResponseUnits({ question, response })
  .filter((unit) => unit.text.trim() !== '' && markedWrong(original, unit) && markedWrong(current, unit))
  .flatMap((unit) => {
    const refused = refusingRules(unit);
    if (!refused) return [];
    return [{
      id: unit.id,
      label: unit.label,
      typed: unit.text,
      key: firstKeyMatching(unit, unit.text, refused.configs),
      rules: refused.rules,
    }];
  });

/* ---------------------------------------------------------------------------
 * A READING THE STUDENT DID NOT WRITE.
 *
 * Each reading is the typed text as a person reads it, built only when its
 * trigger is in the text. It is reported only when the grader's own
 * comparison accepts that reading: then the way the text was read is why the
 * answer was marked wrong.
 * ------------------------------------------------------------------------- */

// Dashes a keyboard or a paste can give for a minus sign. Only those the
// normalizer does not already read as one count, checked against the
// normalizer itself so this follows it.
const DASH_CANDIDATES = ['‐', '‑', '‒', '⁃', '˗', '➖', '﹘', '﹣', '－', '⁻', '₋'];
let unreadDashes = null;
const unreadDashSet = () => {
  unreadDashes ||= new Set(DASH_CANDIDATES.filter((dash) => safely(() => normalizeMathAnswer(`${dash}5`), '') !== '-5'));
  return unreadDashes;
};
const DIGIT_BLOCKS = Object.freeze([[0xFF10, 0xFF19], [0x0660, 0x0669], [0x06F0, 0x06F9], [0x0966, 0x096F], [0x09E6, 0x09EF]]);
const digitOf = (codePoint) => {
  for (const [zero, nine] of DIGIT_BLOCKS) if (codePoint >= zero && codePoint <= nine) return String(codePoint - zero);
  // Mathematical bold, double-struck, sans-serif, sans-serif bold and monospace digits.
  if (codePoint >= 0x1D7CE && codePoint <= 0x1D7FF) return String((codePoint - 0x1D7CE) % 10);
  return null;
};
const VULGAR_FRACTIONS = Object.freeze({
  '¼': '1/4', '½': '1/2', '¾': '3/4', '⅐': '1/7', '⅑': '1/9', '⅒': '1/10', '⅓': '1/3', '⅔': '2/3', '⅕': '1/5',
  '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
});

const characterReadings = (typed) => {
  const dashes = unreadDashSet();
  const found = { dash: [], digit: [], fraction: [] };
  let rewritten = '';
  for (const character of typed) {
    const codePoint = character.codePointAt(0);
    if (dashes.has(character)) {
      found.dash.push(character);
      rewritten += '-';
    } else if (digitOf(codePoint) !== null) {
      found.digit.push(character);
      rewritten += digitOf(codePoint);
    } else if (own(VULGAR_FRACTIONS, character)) {
      found.fraction.push(character);
      // 2½ is two and a half: written as the mixed number the platform reads.
      rewritten += `${/\d$/.test(rewritten) ? ' ' : ''}${own(VULGAR_FRACTIONS, character)}`;
    } else {
      rewritten += character;
    }
  }
  const rules = [
    found.dash.length ? { rule: 'minus-sign', characters: [...new Set(found.dash)] } : null,
    found.digit.length ? { rule: 'digits', characters: [...new Set(found.digit)] } : null,
    found.fraction.length ? { rule: 'fraction-character', characters: [...new Set(found.fraction)] } : null,
  ].filter(Boolean);
  return rules.length ? [{ rules, reading: rewritten }] : [];
};

const PERCENT = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\\?%$/;
const DECIMAL_COMMA = /^([+-]?)(\d+),(\d+)$/;
const THOUSANDS_GROUPING = /^[+-]?\d{1,3}(?:,\d{3})+$/;
const tidyNumber = (value) => String(Number(value.toPrecision(12)));

const valueReadings = (typed) => {
  const normalized = safely(() => normalizeMathAnswer(typed), '');
  const readings = [];
  const percent = PERCENT.exec(normalized);
  const read = safely(() => parseNumericAnswer(typed), null);
  if (percent && read !== null && Number.isFinite(read)) {
    readings.push({ rules: [{ rule: 'percent' }], reading: tidyNumber(read / 100) });
  }
  const comma = DECIMAL_COMMA.exec(normalized);
  if (comma && !THOUSANDS_GROUPING.test(normalized)) {
    readings.push({ rules: [{ rule: 'decimal-comma' }], reading: `${comma[1]}${comma[2]}.${comma[3]}` });
  }
  return readings;
};

/** How the grader read some typed text: the number it read, else the text it compared. */
export const graderReading = (typed) => {
  const number = safely(() => parseNumericAnswer(typed), null);
  if (number !== null && Number.isFinite(number)) return { kind: 'number', value: tidyNumber(number) };
  return { kind: 'text', value: safely(() => normalizeMathAnswer(typed), text(typed)) };
};

/**
 * The typed answers both grades marked wrong that would be right read as
 * written: `[{ id, label, typed, read, reading, rules: [{ rule, characters? }] }]`.
 */
export const findParserChanges = ({ question, response, original, current } = {}) => typedResponseUnits({ question, response })
  .filter((unit) => unit.text.trim() !== '' && markedWrong(original, unit) && markedWrong(current, unit))
  .flatMap((unit) => {
    const candidates = [...characterReadings(unit.text), ...valueReadings(unit.text)];
    const accepted = candidates.find((candidate) => candidate.reading !== unit.text
      && acceptsAny(unit, candidate.reading, [unit.config]));
    if (!accepted) return [];
    return [{
      id: unit.id,
      label: unit.label,
      typed: unit.text,
      read: graderReading(unit.text),
      reading: accepted.reading,
      rules: accepted.rules,
    }];
  });

/* ---------------------------------------------------------------------------
 * THE KEY CHANGED SINCE GRADING.
 * ------------------------------------------------------------------------- */

const versionOf = (question) => question?.answerKeyVersion ?? question?.version ?? null;
const COMPARATOR_LABELS = Object.freeze({
  'numeric-or-math-equivalence': 'as a number',
  'canonical-math-or-text-equivalence': 'as written math or text',
  'equivalent-expression': 'as an equivalent expression',
  'factored-form': 'in factored form',
  'simplest-radical-form': 'in simplest radical form',
});

// A part's name for a sentence, or null for the one part of a one-part key
// (a literal, a pair, Step Algebra's equation), which is "the answer key".
const WHOLE_KEY_PARTS = new Set(['literal', 'response', 'equation']);
const labelFor = (question, id) => {
  const field = multiAnswerFields(question).find((entry) => String(entry.id) === String(id));
  if (field) return text(field.label || field.id);
  const prompt = list(question?.algebraPrompts).find((entry, index) => String(entry?.id || `algebra-prompt-${index + 1}`) === String(id));
  if (prompt) return text(prompt.label || prompt.prompt || id);
  if (WHOLE_KEY_PARTS.has(String(id))) return null;
  return resolveGradingSurfaceId(question) === 'table' ? `Table blank ${id}` : text(id);
};

/**
 * Has the question's key changed since the attempt was graded?
 *
 *   { known, changed, unsettled, details: [{ kind, ... }] }
 *
 * `known` is false when nothing comparable was stored (and nothing is claimed).
 * `unsettled` is true when a stored version-1 fingerprint shows that a box
 * changed but cannot say whether its key did: nothing is claimed for it, and
 * the reasons that read today's key are not given (diagnoseResponse).
 * `currentTrace` is today's trace of the same snapshot (multi-answer only).
 */
export const findAnswerKeyChange = ({ evidence = null, question = null, currentFingerprint = null, currentTrace = null } = {}) => {
  const details = [];
  let known = false;
  let unsettled = false;
  if (!isObject(evidence) || !isObject(question)) return { known, changed: false, unsettled, details };

  const gradedId = text(evidence.questionId).trim();
  const currentId = text(question.questionId).trim();
  if (gradedId && currentId) {
    known = true;
    if (gradedId !== currentId) details.push({ kind: 'question-replaced', graded: gradedId, current: currentId });
  }

  // Like with like: today's question is fingerprinted as the stored key was.
  const stored = isObject(evidence.answerKeyFingerprint) ? evidence.answerKeyFingerprint : null;
  const version = stored ? fingerprintVersion(stored) : null;
  const graded = version === null ? null : stored;
  const current = !graded ? null
    : fingerprintVersion(currentFingerprint) === version ? currentFingerprint
      : answerKeyFingerprint(question, { version });
  if (graded?.whole && current?.whole && graded.surface === current.surface) {
    known = true;
    if (graded.whole !== current.whole) {
      const before = partHashes(graded);
      const now = partHashes(current);
      const ids = [...new Set([...before.keys(), ...now.keys()])]
        .filter((id) => id !== '__blanks' && before.get(id) !== now.get(id));
      // A box version 1 hashed differently may have changed only how it is
      // answered or what its choices say. Only a box added or removed is
      // certain; for the others nothing is claimed.
      const uncertain = version === 1 && graded.surface === 'multiAnswer';
      const certain = uncertain ? ids.filter((id) => !before.has(id) || !now.has(id)) : ids;
      unsettled = certain.length < ids.length;
      if (!unsettled || certain.length) {
        details.push({
          kind: 'key',
          parts: certain.map((id) => ({
            id,
            label: labelFor(question, id),
            change: !before.has(id) ? 'added' : !now.has(id) ? 'removed' : 'changed',
          })),
        });
      }
    }
  }

  const gradedVersion = evidence.answerKeyVersion ?? null;
  const currentVersion = versionOf(question);
  if (gradedVersion !== null && currentVersion !== null) {
    known = true;
    if (String(gradedVersion) !== String(currentVersion)) details.push({ kind: 'version', graded: String(gradedVersion), current: String(currentVersion) });
  }

  // Evidence stored before the fingerprint: a box added or removed since, or
  // one now compared another way, still shows the key is not the one graded.
  // A box a version-1 fingerprint cannot settle is still compared that way.
  const surface = resolveGradingSurfaceId(question);
  if ((!graded || unsettled) && surface === 'multiAnswer') {
    const gradedIds = list(evidence.automaticResult?.parts).filter((part) => part?.graded !== false).map((part) => String(part?.id ?? ''));
    const currentIds = multiAnswerFields(question).map((field) => String(field.id));
    if (!graded && gradedIds.length && currentIds.length) {
      known = true;
      const added = currentIds.filter((id) => !gradedIds.includes(id));
      const removed = gradedIds.filter((id) => !currentIds.includes(id));
      if (added.length || removed.length) {
        details.push({ kind: 'boxes', added: added.map((id) => labelFor(question, id)), removed });
      }
    }
    const gradedTrace = new Map(list(evidence.gradingTrace?.fields).map((field) => [String(field?.id), field]));
    list(currentTrace?.fields).forEach((field) => {
      const before = gradedTrace.get(String(field.id));
      if (!before?.comparator || !field.comparator || before.raw !== field.raw) return;
      known = true;
      if (before.comparator !== field.comparator) {
        details.push({
          kind: 'comparison',
          id: String(field.id),
          label: labelFor(question, field.id),
          graded: own(COMPARATOR_LABELS, before.comparator) || String(before.comparator),
          current: own(COMPARATOR_LABELS, field.comparator) || String(field.comparator),
        });
      }
    });
  }
  // A change found another way settles it.
  return { known, changed: details.length > 0, unsettled: unsettled && details.length === 0, details };
};

/* ---------------------------------------------------------------------------
 * THE TEACHER'S WORDS.
 *
 * Plain and short: what happened, then what the teacher can do. A reason is a
 * title and lines; a line is text and values, and a value is shown exactly as
 * written (the screen draws it as text, so nothing typed is ever read as
 * markup). Every sentence here is listed in the inspector's report for review.
 * ------------------------------------------------------------------------- */

const t = (value) => ({ text: value });
const v = (value) => ({ value: shownValue(value) });

const EQUIVALENT_RULE_TEXT = Object.freeze({
  'choice-option': 'it is a choice, and a choice is marked by the option picked.',
  'simplified-polynomial': 'this box asks for a simplified polynomial.',
  'factored-form': 'this box asks for factored form.',
  'simplest-radical-form': 'this box asks for simplest radical form.',
  'sides-as-keyed': 'this box asks for the equation with its sides as the key has them.',
  calculation: 'this box asks for one number, not a calculation.',
  'line-form': 'this box asks for the line in the form the key uses.',
  'written-form': 'this box accepts only the form the key is written in.',
});

const PARSER_RULE_TEXT = Object.freeze({
  'minus-sign': (entry) => [t('The grader does not read '), v(entry.characters.join(' ')), t(' as a minus sign.')],
  digits: (entry) => [t('The grader does not read the digits '), v(entry.characters.join(' ')), t('.')],
  'fraction-character': (entry) => [t('The grader does not read the fraction '), v(entry.characters.join(' ')), t('.')],
  percent: () => [t('The grader dropped the percent sign.')],
  'decimal-comma': () => [t('The grader does not read a comma as a decimal point.')],
});
const spaced = (segments) => segments.flatMap((segment, index) => (index ? [t(' '), segment] : [segment]));

// What the teacher can do: the override controls, by the names they carry.
const creditAction = (parts, totalParts) => {
  if (totalParts <= 1) return 'To accept it, use Grant Full Credit under Grading Actions.';
  return parts.length === 1
    ? `To accept it, use Grant Credit for ${parts[0].label} under Grading Actions.`
    : 'To accept them, use Grant Credit for each of those parts under Grading Actions.';
};

export const equivalentRejectionReason = (findings, { totalParts = 1 } = {}) => ({
  code: 'equivalent-answer-rejected',
  title: 'Same value as the key, but not accepted',
  explanation: 'The answer has the same value as the key, but a form rule did not accept it.',
  lines: findings.map((finding) => [
    t(`${finding.label}: `), v(finding.typed), t(' has the same value as the key '), v(finding.key),
    t(`, but ${finding.rules.map((rule) => EQUIVALENT_RULE_TEXT[rule]).join(' Also, ')}`),
  ]),
  action: creditAction(findings, totalParts),
  parts: findings,
});

export const parserChangeReason = (findings, { totalParts = 1 } = {}) => ({
  code: 'parser-changed-input',
  title: 'Read differently from how it was typed',
  explanation: 'The grader read the answer differently from how it was typed; read as written, it matches the key.',
  lines: findings.flatMap((finding) => [
    finding.read?.kind === 'number'
      ? [t(`${finding.label}: typed `), v(finding.typed), t(', read by the grader as '), v(finding.read.value), t('.')]
      : [t(`${finding.label}: typed `), v(finding.typed), t('.')],
    [...spaced(finding.rules.map((entry) => PARSER_RULE_TEXT[entry.rule](entry))).flat(), t(' Read as '), v(finding.reading), t(', it matches the key.')],
  ]),
  action: creditAction(findings, totalParts),
  parts: findings,
});

const KEY_CHANGE_VERB = Object.freeze({ added: 'was added', removed: 'was removed', changed: 'changed' });
const KEY_CHANGE_LINES = Object.freeze({
  'question-replaced': () => [[t('A different question is now in this place.')]],
  key: (detail) => {
    const named = detail.parts.filter((part) => part.label);
    return named.length
      ? named.map((part) => [t(`The key for ${part.label} ${KEY_CHANGE_VERB[part.change]}.`)])
      : [[t('The answer key is not the one this attempt was graded against.')]];
  },
  version: (detail) => [[t('The question was version '), v(detail.graded), t(' when graded and is version '), v(detail.current), t(' now.')]],
  boxes: (detail) => [[
    t('Answer boxes changed since grading:'),
    ...(detail.added.length ? [t(' added '), v(detail.added.join(', '))] : []),
    ...(detail.removed.length ? [t(`${detail.added.length ? ';' : ''} removed `), v(detail.removed.join(', '))] : []),
    t('.'),
  ]],
  comparison: (detail) => [[t(`${detail.label} was compared ${detail.graded} when graded and is compared ${detail.current} now.`)]],
});

export const answerKeyChangeReason = (change, { replayAvailable = false } = {}) => ({
  code: 'answer-key-changed',
  title: 'The answer key changed after grading',
  explanation: 'The answer key changed after this attempt was graded.',
  lines: change.details.flatMap((detail) => KEY_CHANGE_LINES[detail.kind]?.(detail) || []),
  action: replayAvailable
    ? 'Replay Grading below marks the same answer with the current key. Use Apply Corrected Grade to use that result.'
    : 'To change the grade, use the Grading Actions below.',
  details: change.details,
});
