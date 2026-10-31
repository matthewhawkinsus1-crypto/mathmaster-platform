/*
 * THE GRADER READS WHAT THE MATH EDITOR WRITES FOR EVERY EXPRESSION AND
 * EQUATION KEY A SECURE TEST CAN ISSUE (TS05).
 *
 * A secure Test kept expression and equation answers in a plain text box: the
 * math editor submits MathLive's LaTeX, not the characters typed, and a right
 * answer the grader could not read would be marked wrong in silence, with no
 * verdict until the results are released. My Math Path already collects these
 * answers in the editor, so every such refusal was a wrong verdict there.
 *
 * tests/browser/editorKeyRoundTrip.mjs typed every expression and equation key
 * the secure runtime can issue into the real editor, the way a student builds
 * it (typed, and built with the keypad), and recorded what the editor held
 * (fixtures/editorKeyRoundTrip.json). On the base the secure grader refused
 * the editor's own spelling of 63 of the 425 expression keys and 32 of the 580
 * equation keys (103 of the 665 recorded spellings):
 *
 *   a set-builder bar      \left\lbrace x\,\middle{\vert}\,x\ne0\right\rbrace
 *   a typed log base       \log_{_{}2}\left(16\right)=4, \log_{10} for log_10
 *   brackets kept inside   \frac{(-(-2)+\sqrt{(12)})}{2}, \sqrt{(t-(18))},
 *                          \sqrt[3]{(3x+2)}
 *   ln over ln             \frac{\ln(3)}{\ln(2)}, whose key ln(3)/ln(2) read as
 *                          ln·(3/l)·n(2)
 *
 * and the sweep (scripts/sweep-equivalence-verdicts.mjs) found three more where
 * typed text is right and the editor's spelling of it was not: a bracketed
 * equation with its sides swapped (`\left(` read as the relation \le), a
 * generator bracket before a power (5\left(3\right)^{n-1}, read as 53^{n-1}),
 * and a braced subscript (P_{n-1} for P_(n-1)). Each now reads as the typed
 * text does; each wrong answer beside it stays wrong.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { editorTypedSpelling } from '../../scripts/lib/editorTypedSpelling.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

const RECORDED = JSON.parse(readFileSync(new URL('./fixtures/editorKeyRoundTrip.json', import.meta.url), 'utf8'));

// What every recorded field's private grading has; an entry records the rest
// (tests/browser/editorKeyRoundTrip.mjs writes it so).
const GRADING_DEFAULTS = Object.freeze({ id: 'answer', weight: 1, partialCredit: null, accepted: [], numericTolerance: 0.000001, caseSensitive: false, equivalence: null });
const gradingOf = (entry) => ({ ...GRADING_DEFAULTS, expected: entry.key, inputProfile: entry.profile, ...entry.grading });

/** The secure grader's verdict on one recorded field, by its own private grading. */
const gradesRecorded = async (entry, response) => (
  await secureItems.gradeItem({ fields: [gradingOf(entry)] }, { responses: { answer: response } })
).isCorrect === true;

/** The secure grader's verdict for a key typed into a field of this profile. */
const grades = async (response, expected, { profile = 'expression', equivalence = null, accepted = [] } = {}) => {
  const grading = mathPath.privateGradingDefinition({
    responseFields: [{ id: 'answer', inputProfile: profile, expected, accepted, ...(equivalence ? { equivalence } : {}) }],
  });
  return (await secureItems.gradeItem(grading, { responses: { answer: response } })).isCorrect === true;
};

test('every editor spelling recorded from the real editor grades right against its own key', async () => {
  assert.ok(RECORDED.entries.length >= 300, `the real editor's spellings are recorded (node tests/browser/editorKeyRoundTrip.mjs --write); found ${RECORDED.entries.length}`);
  const refused = [];
  for (const entry of RECORDED.entries) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await gradesRecorded(entry, entry.serialized))) refused.push(`${entry.profile} ${entry.variant}: ${entry.serialized} for ${entry.key}`);
  }
  assert.deepEqual(refused, [], 'the editor\'s own spelling of a key a secure Test can issue is refused');
});

test('the recording covers both profiles, both ways of building, and every spelling TS05 taught the grader', () => {
  const has = (predicate) => RECORDED.entries.some(predicate);
  const missing = [];
  for (const profile of ['expression', 'equation']) {
    for (const variant of ['literal', 'natural']) {
      if (!has((entry) => entry.profile === profile && entry.variant === variant)) missing.push(`a ${variant} ${profile} spelling`);
    }
  }
  for (const [what, pattern] of [
    ['a set-builder bar', /\\middle\{\\vert\}/],
    ['a typed log base', /\\log_\{_\{\}\d+\}/],
    ['a cube root holding brackets', /\\sqrt\[3\]\{\\left\(/],
    ['a radicand with brackets inside its brackets', /\\sqrt\{\\left\([^}]*\\left\(/],
    ['a numerator with brackets inside its brackets', /\\frac\{\\left\([^}]*\\left\(/],
    ['ln over ln', /\\frac\{\\ln\\left\(/],
    ['a subscript holding an expression', /_\{(?:n-1|\\left\(n-1\\right\))\}/],
  ]) if (!has((entry) => pattern.test(entry.serialized))) missing.push(what);
  assert.deepEqual(missing, [], 'the recording no longer holds these (re-record: node tests/browser/editorKeyRoundTrip.mjs --write)');
});

test('the sweep\'s editor model writes exactly what the real editor held, for every recorded key', () => {
  // scripts/lib/editorTypedSpelling.mjs gives the sweep the editor's spelling
  // of every key in every bank (and the live bank, --extra-bank): it is only
  // as good as its agreement with the real editor — for every key, and for
  // what the driver typed straight through beyond the keys: a power left
  // after one digit (x^11), a function name kept out of a slash's numerator
  // (ln3/ln2), a mixed number (GR33), sqrt without brackets.
  assert.ok((RECORDED.probes || []).length >= 8, 'the driver\'s probes are recorded');
  const differs = [
    ...RECORDED.entries.map(({ key, variant, serialized }) => ({ typed: key, variant, serialized })),
    ...RECORDED.probes.map(({ typed, serialized }) => ({ typed, variant: 'literal', serialized })),
  ]
    .map(({ typed, variant, serialized }) => ({ typed, variant, serialized, model: editorTypedSpelling(typed, { variant }) }))
    .filter(({ serialized, model }) => model !== serialized)
    .map(({ typed, variant, serialized, model }) => `${variant} ${typed}: editor ${serialized}, model ${model}`);
  assert.deepEqual(differs, []);
});

test('each spelling the editor writes now reads as the typed key, and the wrong answer beside it stays wrong', async () => {
  const wrongVerdicts = [];
  for (const [sent, key, misses, options = {}] of [
    // The bar typed inside set braces, typed `!=` or the ≠ key, and a compound.
    ['\\left\\lbrace x\\,\\middle{\\vert}\\,x\\ne0\\right\\rbrace', '{x|x!=0}', ['\\left\\lbrace x\\,\\middle{\\vert}\\,x\\ne1\\right\\rbrace', '\\left\\lbrace y\\,\\middle{\\vert}\\,y\\ne0\\right\\rbrace'], { equivalence: 'setBuilder' }],
    ['\\left\\lbrace x\\,\\middle{\\vert}\\,x!=0\\right\\rbrace', '{x|x!=0}', ['\\left\\lbrace x\\,\\middle{\\vert}\\,x>0\\right\\rbrace'], { equivalence: 'setBuilder' }],
    ['\\left\\lbrace x\\,\\middle{\\vert}\\,x\\ne-2\\land x\\ne4\\right\\rbrace', '{x|x!=-2 and x!=4}', ['\\left\\lbrace x\\,\\middle{\\vert}\\,x\\ne-2\\land x\\ne5\\right\\rbrace', '\\left\\lbrace x\\,\\middle{\\vert}\\,x\\ne-2\\right\\rbrace'], { equivalence: 'setBuilder' }],
    ['\\left\\lbrace y\\,\\middle{\\vert}\\,y>=-5\\right\\rbrace', '{y|y>=-5}', ['\\left\\lbrace y\\,\\middle{\\vert}\\,y>-5\\right\\rbrace'], { equivalence: 'setBuilder' }],
    // A log base typed after \log, and a base of two digits.
    ['\\log_{_{}2}\\left(16\\right)=4', 'log_2(16)=4', ['\\log_{_{}2}\\left(16\\right)=5', '\\log_{_{}4}\\left(16\\right)=4'], { profile: 'equation' }],
    ['L=10\\log_{_{}10}\\left(\\frac{I}{3}\\right)', 'L=10log_10(I/3)', ['L=10\\log_{_{}10}\\left(\\frac{I}{4}\\right)', 'L=\\log_{_{}10}\\left(\\frac{I}{3}\\right)'], { profile: 'equation' }],
    ['L=10\\log_{10}\\left(\\frac{I}{3}\\right)', 'L=10log_10(I/3)', ['L=10\\log_{100}\\left(\\frac{I}{3}\\right)'], { profile: 'equation' }],
    // Brackets kept inside a root or a numerator.
    ['\\sqrt[3]{\\left(3x+2\\right)}=2', 'cbrt(3x+ 2)=2', ['\\sqrt{\\left(3x+2\\right)}=2', '\\sqrt[3]{\\left(3x+3\\right)}=2'], { profile: 'equation' }],
    ['\\sqrt{\\left(t-\\left(18\\right)\\right)}=2', 'sqrt(t-(18))=2', ['\\sqrt{\\left(t-\\left(19\\right)\\right)}=2', '\\sqrt{\\left(t\\right)}-\\left(18\\right)=2'], { profile: 'equation' }],
    ['\\frac{\\left(-\\left(-2\\right)+\\sqrt{\\left(12\\right)}\\right)}{2}', '(-(-2)+sqrt(12))/2', ['\\frac{\\left(-\\left(-2\\right)-\\sqrt{\\left(12\\right)}\\right)}{2}', '\\frac{\\left(-\\left(-2\\right)+\\sqrt{\\left(12\\right)}\\right)}{4}']],
    // ln over ln — not ln of a quotient, which is what a typed ln3/ln2 builds.
    ['\\frac{\\ln\\left(3\\right)}{\\ln\\left(2\\right)}', 'ln(3)/ln(2)', ['\\frac{\\ln\\left(2\\right)}{\\ln\\left(3\\right)}', '\\ln\\frac{3}{\\ln2}', '\\ln\\left(\\frac{3}{2}\\right)']],
    // A subscript that is an expression.
    ['P_{n}=1.25P_{n-1}', 'P_n=1.25P_(n-1)', ['P_{n}=1.25P_{n+1}', 'P_{n}=1.25P_{n}-1'], { profile: 'equation' }],
    // A generator bracket before a power: 5(3)^(n-1), never 53^(n-1).
    ['5\\left(3\\right)^{n-1}', '5*(3)^(n-1)', ['5\\left(4\\right)^{n-1}', '53^{n-1}']],
    // An equation's sides swapped, as typed text may be (Job P), with the
    // editor's brackets.
    ['3=\\sqrt{\\left(x+4\\right)}', 'sqrt(x+ 4)=3', ['3=\\sqrt{\\left(x+5\\right)}', '4=\\sqrt{\\left(x+4\\right)}'], { profile: 'equation' }],
    ['80\\left(1.5\\right)^{t}=y', 'y=80(1.5)^t', ['80\\left(1.6\\right)^{t}=y', '801.5^{t}=y'], { profile: 'equation' }],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await grades(sent, key, options))) wrongVerdicts.push(`refused: ${sent} for ${key}`);
    for (const miss of misses) {
      // eslint-disable-next-line no-await-in-loop
      if (await grades(miss, key, options)) wrongVerdicts.push(`accepted: ${miss} for ${key}`);
    }
  }
  assert.deepEqual(wrongVerdicts, []);
});

test('the other graders read the same spellings the same way (assignment matcher, sameValue)', () => {
  const refused = [];
  for (const [sent, key, inputProfile] of [
    ['\\frac{\\ln\\left(3\\right)}{\\ln\\left(2\\right)}', 'ln(3)/ln(2)', 'expression'],
    ['\\sqrt[3]{\\left(3x+2\\right)}=2', 'cbrt(3x+ 2)=2', 'equation'],
    ['\\log_{_{}2}\\left(16\\right)=4', 'log_2(16)=4', 'equation'],
    ['3=\\sqrt{\\left(x+4\\right)}', 'sqrt(x+ 4)=3', 'equation'],
    ['P_{n}=1.25P_{n-1}', 'P_n=1.25P_(n-1)', 'equation'],
  ]) {
    if (sameValue(sent, key) !== true) refused.push(`sameValue: ${sent} for ${key}`);
    if (matchesFieldAnswer(sent, { answer: key, inputProfile }) !== true) refused.push(`assignment matcher: ${sent} for ${key}`);
  }
  assert.deepEqual(refused, []);
});

test('a product over a letter inside a sum is still read apart from the same characters typed (the reason left, GR35a)', async () => {
  // The editor puts the whole product before a typed slash over the bar
  // (\frac{2A}{h}); typed text puts the one factor before it (2·A/h). No key a
  // secure Test can issue has this shape. A product alone is no trouble: the
  // editor's \frac{3b^2}{a^3} for a typed 3b^2/a^3 is the same monomial
  // quotient factor for factor (GR35a). Reading every stacked product as
  // typed would read a stacked key's \frac{3b^2}{a^3} as 3\frac{b^2}{a^3},
  // which GR35a keeps wrong (a coefficient moved across the bar).
  assert.deepEqual({
    'the editor\'s \\frac{2A}{h}-b_2 for a typed 2A/h-b_2': await grades('\\frac{2A}{h}-b_2', '2A/h-b_2'),
    'the editor\'s \\frac{3b^2}{a^3} for a typed 3b^2/a^3': await grades('\\frac{3b^2}{a^3}', '3b^2/a^3'),
    '3\\frac{b^2}{a^3} for a stacked \\frac{3b^2}{a^3}': await grades('3\\frac{b^2}{a^3}', '\\frac{3b^2}{a^3}'),
  }, {
    'the editor\'s \\frac{2A}{h}-b_2 for a typed 2A/h-b_2': false,
    'the editor\'s \\frac{3b^2}{a^3} for a typed 3b^2/a^3': true,
    '3\\frac{b^2}{a^3} for a stacked \\frac{3b^2}{a^3}': false,
  });
});
