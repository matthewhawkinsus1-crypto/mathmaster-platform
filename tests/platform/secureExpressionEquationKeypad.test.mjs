/*
 * THE KEYPAD A SECURE EXPRESSION OR EQUATION FIELD GETS (TS05; the owner's
 * decision).
 *
 * A secure field's math editor opens no phone keyboard: its keypad is the
 * keyboard. A phone's expression keypad had no letter, set-notation or ln key,
 * and its equation keypad typed no letter but x, y and f. Following the
 * inequality pattern (TS04), each now offers:
 *
 *   the letters the student reads: the single letters of the prompt's
 *   mathematics and the field's own label, beside x and y on every one;
 *   set notation, { } | ≠ < > ≤ ≥ ∅, and ln, the same on every item.
 *
 * THE KEYPAD SAYS NOTHING ABOUT THE ANSWER: nothing in it comes from the key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildMobileMathTools } from '../../src/platform/interaction/mobileKeypadPolicy.js';
import { normalizeInteractionInputProfile } from '../../src/platform/interaction/interactionContract.js';
import {
  EVERY_INEQUALITY_LETTER, SECURE_ANSWER_EDITORS, SECURE_LETTER_PROFILES, SECURE_PROFILE_KEYS,
  secureAnswerEntryFor, secureFieldLetters, secureKeypadKeys,
} from '../../src/platform/assessment/secureAnswerEntry.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

const grades = async (response, expected, { profile = 'expression', equivalence = null } = {}) => {
  const grading = mathPath.privateGradingDefinition({
    responseFields: [{ id: 'answer', inputProfile: profile, expected, ...(equivalence ? { equivalence } : {}) }],
  });
  return (await secureItems.gradeItem(grading, { responses: { answer: response } })).isCorrect === true;
};

const labels = (keys) => keys.map((key) => key.label);
const SET_NOTATION_AND_LN = ['{', '}', '|', '≠', '<', '>', '≤', '≥', '∅', 'ln'];

test('an expression\'s and an equation\'s keypad: set notation and ln, then the letters the student reads, beside x and y', () => {
  for (const profile of ['expression', 'equation']) {
    assert.deepEqual(labels(secureKeypadKeys({ inputProfile: profile })), [...SET_NOTATION_AND_LN, 'x', 'y'], profile);
    // The prompt's mathematics, as for an inequality (TS04).
    assert.deepEqual(
      labels(secureKeypadKeys({ inputProfile: profile }, { prompt: 'Let $h$ be the height and $t$ the time.' })),
      [...SET_NOTATION_AND_LN, 'h', 't', 'x', 'y'],
      profile,
    );
    // The field's own label, in mathematics or in words.
    assert.deepEqual(labels(secureKeypadKeys({ inputProfile: profile, label: 'Explicit model $P(t)$' })), [...SET_NOTATION_AND_LN, 'P', 't', 'x', 'y'], profile);
    assert.deepEqual(labels(secureKeypadKeys({ inputProfile: profile, label: 'Range of C' })), [...SET_NOTATION_AND_LN, 'C', 'x', 'y'], profile);
  }
  assert.deepEqual([...SECURE_LETTER_PROFILES].sort(), ['equation', 'expression', 'inequality']);
  assert.deepEqual(secureFieldLetters({ prompt: '', label: '' }), [...EVERY_INEQUALITY_LETTER]);
  // A capital letter says so to a screen reader.
  assert.equal(secureKeypadKeys({ inputProfile: 'expression', label: 'Range of C' }).find((key) => key.label === 'C').ariaLabel, 'Insert capital C');
});

test('the keypad says nothing about the answer: the same keys whatever the key, and only these profiles get set notation and ln', () => {
  const prompt = 'A pool is filled to a height of $h$ feet.';
  for (const profile of ['expression', 'equation']) {
    const field = { inputProfile: profile, label: 'Answer' };
    assert.deepEqual(
      secureKeypadKeys({ ...field, expected: 'Q=ln(R)/W', accepted: ['{z|z!=9}'], answer: 'k', correctAnswer: 'm' }, { prompt }),
      secureKeypadKeys(field, { prompt }),
      `${profile}: nothing in the keypad comes from an answer`,
    );
  }
  // The other profiles keep their keys.
  assert.deepEqual(labels(secureKeypadKeys({ inputProfile: 'number' })), ['√', 'π']);
  assert.deepEqual(labels(secureKeypadKeys({ inputProfile: 'orderedPair' })), ['√', 'π']);
  assert.deepEqual(labels(secureKeypadKeys({ inputProfile: 'inequality' })), ['a⁄b', '|x|', 'xⁿ', '√', 'π', 'and', 'or', 'x', 'y']);
  for (const profile of ['set', 'interval', 'text']) assert.deepEqual(labels(secureKeypadKeys({ inputProfile: profile })), [], profile);
  // The same keys on an inequality's editor as before (TS04).
  assert.deepEqual(
    labels(secureAnswerEntryFor({ inputProfile: 'inequality', expected: 'n>=4' }, { prompt: 'Let $h$ be the height and $t$ the time.' }).keys),
    ['a⁄b', '|x|', 'xⁿ', '√', 'π', 'and', 'or', 'h', 't', 'x', 'y'],
  );
  assert.deepEqual(SECURE_PROFILE_KEYS.expression, SECURE_PROFILE_KEYS.equation);
});

test('what the new keys build in the real editor is what the grader reads', async () => {
  // What MathLive held when these keys were pressed (MathInput's keypad
  // inserts each key's command): the bar is a plain |, the relations one
  // character each (the editor writes \ne, \le, \ge), ln its bracket.
  const key = (label) => SECURE_PROFILE_KEYS.expression.find((entry) => entry.label === label).command;
  assert.equal(key('|'), '|');
  assert.equal(key('≠'), '≠');
  assert.equal(key('ln'), '\\ln\\left(#0\\right)');
  for (const [built, expected, options] of [
    ['\\lbrace x|x\\ne2\\rbrace', '{x|x!=2}', { equivalence: 'setBuilder' }],
    ['\\lbrace x|x\\ne2\\rbrace', '{x|x!=2}', {}],
    // A phone has no "and" key here: a comma joins the conditions, as the set-builder reader takes it.
    ['\\lbrace x|x\\ne2,x\\ne7\\rbrace', '{x|x!=2 and x!=7}', { equivalence: 'setBuilder' }],
    ['\\lbrace y|y>6\\rbrace', '{y|y>6}', { equivalence: 'setBuilder' }],
    ['\\lbrace x|x\\ge-2\\rbrace', '{x|x>=-2}', { equivalence: 'setBuilder' }],
    ['\\lbrace-117,133\\rbrace', '{ -117, 133 }', {}],
    ['\\varnothing', '∅', {}],
    ['\\frac{\\ln\\left(6\\right)}{\\ln\\left(2\\right)}', 'ln(6)/ln(2)', {}],
    ['\\ln\\left(4\\right)=t', 'ln(4)=t', { profile: 'equation' }],
    ['8x+3y\\le94', '8x+3y<=94', { profile: 'equation' }],
    ['y\\ge3x-5', 'y>=3x- 5', { profile: 'equation' }],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await grades(built, expected, options), true, `${built} for ${expected}`);
  }
  // Why the bar is not \mid: outside a set-builder field the grader does not read it.
  assert.equal(await grades('\\lbrace x\\mid x\\ne2\\rbrace', '{x|x!=2}'), false);
});

test('an expression and an equation are still typed text: the keypad is ready for the editor, which they do not have yet', () => {
  for (const profile of ['expression', 'equation']) {
    const entry = secureAnswerEntryFor({ inputProfile: profile }, { prompt: 'Let $h$ be the height.' });
    assert.equal(entry.editor, SECURE_ANSWER_EDITORS.TEXT, profile);
    assert.equal(entry.keys, undefined, `${profile}: a text box has no keypad`);
  }
});

/*
 * CAN A PHONE TYPE EVERY SECURE EXPRESSION AND EQUATION KEY? (TS05)
 *
 * The bar for moving these profiles from the text box to the math editor on a
 * secure Test: every key a secure Test can issue is typeable on the keypad a
 * phone student has. This draws every family the secure runtime can issue
 * (the built-in Path seeds a course Test falls back to and the
 * secure-assessment seed, three draws each, as TS04's bank test does) and
 * reads what each typed expression and equation key needs against that
 * field's phone keypad: MathInput's pad for the profile, with the secure keys
 * (secureKeypadKeys). MathInput's phone pads have digits, . , − + = ( ), π, e,
 * logₐ, √, ⁿ√, x², xⁿ, |x| and a⁄b; the equation pad also x, y, f(x) and
 * f⁻¹(x), and drops ⁿ√ (mobileKeypadPolicy, read below). No pad has a
 * subscript or a multiplication key, and these have no "and" or "or".
 *
 * The decided keys (TS05) close the set-notation and ln gaps and most
 * letters; what is left is pinned below, family by family, so the test fails
 * and says what changed when a key is added or a bank changes. Until it is
 * empty for a profile, that profile stays typed text
 * (SECURE_TEXT_PROFILE_REASONS).
 */
const STILL_UNTYPEABLE = Object.freeze({
  // Letters the item names only in the prompt's words ("Let v be…",
  // "intensity I"), which the keypad does not read. (The two 7G families
  // whose keys the grader read only with their multiplication sign,
  // `x^1*\sqrt[3]{x^1}` and `3*|x|*y^2`, are read without it since the
  // grader spellings batch, 2026-11: a power of one is no power.)
  expression: {
    'mm_A2_5B_v2_logarithmic-ratio-scale-model': ['letter I'],
    'mm_A2_6H_v2_round-trip-current-equation': ['letter v'],
  },
  // …and letters the field's prompt and label never name (a, b, c of
  // y = ax² + bx + c; P₀ beside "Explicit model P(t)"), a subscript, and a
  // cube root, whose ⁿ√ key the phone equation pad drops.
  equation: {
    'mm_A2_4A_v2_error-repair-coefficient-system': ['letter a', 'letter b', 'letter c'],
    'mm_A2_5B_v2_decay-explicit-and-recursive': ['letter V', 'letter n', 'subscript'],
    'mm_A2_5B_v2_growth-explicit-and-recursive': ['letter P', 'letter n', 'subscript'],
    'mm_A2_5B_v2_growth-factor-error-repair': ['subscript'],
    'mm_A2_5B_v2_logarithmic-ratio-scale-model': ['letter I', 'letter L'],
    'mm_A2_5B_v2_table-infer-ratio-models': ['letter a', 'letter n', 'subscript'],
    'mm_A2_6B_v2_context-modeled-cube-root': ['nth root'],
    'mm_A2_6B_v2_noninteger-real-cube-root': ['nth root'],
    'mm_A2_6B_v2_scaled-linear-radicand': ['nth root'],
    'mm_A2_6H_v2_average-speed-equation': ['letter v'],
    'mm_A2_6H_v2_combined-work-equation': ['letter t'],
    'mm_A2_6H_v2_round-trip-current-equation': ['letter v'],
    'mm_A2_6L_v2_fixed-area-rectangle-context': ['letter l', 'letter w'],
    'mm_A2_6L_v2_fixed-distance-time-context': ['letter t', 'letter v'],
  },
});

const NTH_ROOT_KEY = Object.freeze({ label: 'ⁿ√', command: '\\sqrt[#?]{#0}', ariaLabel: 'Insert nth root' });
const PAD_LETTERS = Object.freeze({ expression: ['e'], equation: ['e', 'x', 'y', 'f'] });
const NOT_LETTERS = new Set(['and', 'or', 'pi', 'inf', 'abs', 'sqrt', 'cbrt', 'root', 'log', 'ln', 'sin', 'cos', 'tan']);

/** The letters a key is written in: single letters, never a word or a function name. */
const keyLetters = (key) => {
  const body = String(key ?? '').replace(/\\[A-Za-z]+/g, ' ');
  const letters = [];
  for (const run of body.match(/[A-Za-z]+/g) || []) {
    if (NOT_LETTERS.has(run.toLowerCase())) continue;
    assert.ok(run.length <= 3, `a key holds the word "${run}": read it here before counting its letters`);
    for (const letter of run) if (!letters.includes(letter)) letters.push(letter);
  }
  return letters;
};

// Every character a key may hold that one of the pads types (letters and
// words are read apart); anything else is a symbol this test does not know.
const PAD_CHARACTERS = /[0-9.,+\-=()^/\s{}|<>!∅]/;

const seedFiles = () => {
  const bank = new URL('../../functions/seeds/pathQuestionBank/', import.meta.url);
  const secure = new URL('../../functions/seeds/secureAssessments/', import.meta.url);
  return [
    ...readdirSync(bank).filter((name) => name.endsWith('_pathQuestionBank_seed.json')).map((name) => new URL(name, bank)),
    ...readdirSync(secure).filter((name) => name.endsWith('.json')).map((name) => new URL(name, secure)),
  ];
};

test('every typed expression and equation key a secure Test can issue, against the keypad a phone has: what is left untypeable', async () => {
  // MathInput's phone layout keeps ⁿ√ on the expression pad and drops it from the equation pad.
  const padHasNthRoot = (profile) => buildMobileMathTools({ toolProfile: profile, profileKeys: [NTH_ROOT_KEY] }).some((key) => key.command === NTH_ROOT_KEY.command);
  const nthRoot = { expression: padHasNthRoot('expression'), equation: padHasNthRoot('equation') };
  assert.deepEqual(nthRoot, { expression: true, equation: false });
  let fields = 0;
  const untypeable = { expression: {}, equation: {} };
  const note = (profile, family, reason) => {
    const reasons = untypeable[profile][family] || (untypeable[profile][family] = []);
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  for (const file of seedFiles()) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const documents = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
    for (const item of documents) {
      if (item?.active === false) continue;
      for (let draw = 0; draw < 3; draw += 1) {
        // eslint-disable-next-line no-await-in-loop
        const question = (await mathPath.instantiateQuestion(item, `ts05-keypad-${draw}`))?.question;
        if (!question || question.pathToolId) continue;
        const issued = mathPath.buildSanitizedQuestion(question, { questionInstanceId: 'q' });
        const grading = mathPath.privateGradingDefinition(question);
        for (const field of issued.responseFields || []) {
          const profile = normalizeInteractionInputProfile(field.inputProfile);
          if (!['expression', 'equation'].includes(profile)) continue;
          // A field answered by choosing is not typed.
          if (field.choices?.length || (issued.responseFields.length === 1 && issued.choices?.length)) continue;
          const graded = grading.fields.find((entry) => entry.id === field.id);
          const key = String(graded?.expected ?? '');
          if (!key) continue;
          fields += 1;
          const keys = secureKeypadKeys(field, { prompt: issued.prompt });
          const has = (label) => keys.some((entry) => entry.label === label);
          // The field's own grading decides whether another spelling is the key.
          const right = async (response) => (await secureItems.gradeItem({ fields: [{ ...graded, id: 'answer' }] }, { responses: { answer: response } })).isCorrect === true;
          for (const letter of keyLetters(key)) {
            if (!has(letter) && !PAD_LETTERS[profile].includes(letter)) note(profile, item.id, `letter ${letter}`);
          }
          // A set's braces are the ones no command, power or subscript opens.
          const setBraces = /(?:^|[^\\A-Za-z\]}^_])\{/.test(key);
          for (const [symbol, used] of [
            ['{', setBraces], ['}', setBraces], ['|', setBraces && /\|/.test(key)], ['≠', /!=|≠/.test(key)],
            ['<', /<(?!=)/.test(key)], ['>', />(?!=)/.test(key)], ['≤', /<=|≤/.test(key)], ['≥', />=|≥/.test(key)],
            ['∅', /∅/.test(key)], ['ln', /(?<![A-Za-z])ln/.test(key)],
          ]) if (used && !has(symbol)) note(profile, item.id, `${symbol} key`);
          // A log's base has the logₐ key; any other subscript has none.
          if (/(?<!log)_/.test(key)) note(profile, item.id, 'subscript');
          if (/cbrt\(|\\sqrt\[|root\(/.test(key) && !nthRoot[profile]) note(profile, item.id, 'nth root');
          if (/\*/.test(key)) {
            // eslint-disable-next-line no-await-in-loop
            const typed = await right(key.replace(/\s*\*\s*/g, '')) || await right(key.replace(/(\d+)\s*\*\s*(\d+)/g, '$1($2)').replace(/\s*\*\s*/g, ''));
            if (!typed) note(profile, item.id, 'multiplication sign');
          }
          // eslint-disable-next-line no-await-in-loop
          if (/\sand\s/.test(key) && !(await right(key.replace(/\s+and\s+/g, ',')))) note(profile, item.id, '"and"');
          if (/\sor\s/.test(key)) note(profile, item.id, '"or"');
          const unknown = [...key.replace(/\\[A-Za-z]+|[A-Za-z]+|\*|_|\[[^\]]*\]/g, '')].filter((character) => !PAD_CHARACTERS.test(character));
          unknown.forEach((character) => note(profile, item.id, `symbol ${character}`));
        }
      }
    }
  }
  assert.ok(fields > 500, `the banks hold typed expression and equation fields to check (found ${fields})`);
  const sorted = (byFamily) => Object.fromEntries(Object.entries(byFamily).sort(([a], [b]) => a.localeCompare(b)).map(([family, reasons]) => [family, [...reasons].sort()]));
  assert.deepEqual(sorted(untypeable.expression), STILL_UNTYPEABLE.expression, 'expression: what a phone cannot type changed (update STILL_UNTYPEABLE and the reason)');
  assert.deepEqual(sorted(untypeable.equation), STILL_UNTYPEABLE.equation, 'equation: what a phone cannot type changed (update STILL_UNTYPEABLE and the reason)');
});
