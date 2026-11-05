// THE MATH-ENTRY CONTRACT, TYPED ON A REAL KEYBOARD INTO REAL MATHLIVE.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/mathEntryContract.mjs
//
// Characters typed into a math field build the expression the same characters
// mean as written text — the reading every MathMaster grader applies
// (src/platform/math/typedFractionEntry.js, typedRootEntry.js). PQ-040:
// `y=-2/3x+4` used to become −2/(3x + 4); F-RADICAL-TYPING: `y^4sqrt(x)/x^4`
// became y⁴√(x/x⁴). The unit tests drive the state machines with what MathLive
// reports; this proves the real MathLive 0.110 agrees, through the real
// MathInput and the real calculator, and grades typed radicals with the shared
// grader. Exits non-zero on any mismatch.

import { readFileSync } from 'node:fs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import '../../functions/shared/formSpecificFieldGrading.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

// [typed, latex MathInput must hold]
const ANSWER_CASES = [
  // PQ-040 and its family: a term after a numeric denominator starts after it.
  ['y=-2/3x+4', 'y=-\\frac23x+4'],
  ['3/4x+2', '\\frac34x+2'],
  ['y<2/3x-1', 'y<\\frac23x-1'],
  ['(1/2,3)', '\\left(\\frac12,3\\right)'],
  ['12/0.5x', '\\frac{12}{0.5}x'],
  ['1/-2x', '\\frac{1}{-2}x'],
  ['y=-2/3x+4/5', 'y=-\\frac23x+\\frac45'],
  // R-11: an opening bracket after a number denominator is a factor —
  // point-slope with a fractional slope, not −1/(2(x − 6)).
  ['y-2=-1/2(x-6)', 'y-2=-\\frac12\\left(x-6\\right)'],
  ['3/4(x+8)', '\\frac34\\left(x+8\\right)'],
  // A denominator the student is building on purpose is untouched.
  ['1/x-2', '\\frac{1}{x-2}'],
  ['1/(2x)', '\\frac{1}{\\left(2x\\right)}'],
  ['1/(x-6)', '\\frac{1}{\\left(x-6\\right)}'],
  ['1/2^3', '\\frac{1}{2^3}'],
  ['a/b+c', '\\frac{a}{b+c}'],
  // Nothing before the slash: the caret is in the numerator, never rewritten.
  ['/2x', '\\frac{2x}{\\placeholder{}}'],
  // A second slash nests rather than leaving an empty fraction.
  ['2/3/4', '\\frac{2}{\\frac34}'],
  // GR33: a space after a whole number, then digits and a slash, is a mixed
  // number: 3 1/2 is 3½, not 31/2. Anything else after the space joins as
  // before, so 12 345 and 3 x are unchanged.
  ['3 1/2', '3\\frac12'],
  ['y=2 3/4', 'y=2\\frac34'],
  ['12 34/5', '12\\frac{34}{5}'],
  ['-3 1/2', '-3\\frac12'],
  ['3 1/2x', '3\\frac12x'],
  ['12 345', '12345'],
  ['3 x', '3x'],
  ['3.5 1/2', '\\frac{3.51}{2}'],
  // F-RADICAL-TYPING (typedRootEntry.js): the walkthrough's three spellings.
  // A space straight after `sqrt` keeps the root open; the `)` that matches
  // the bracket typed after it closes the root, so `/` comes after the root.
  ['x^3 sqrt x', 'x^3\\sqrt{x}'],
  ['y^4sqrt(x)/x^4', '\\frac{y^4\\sqrt{\\left(x\\right)}}{x^4}'],
  ['(y^4 sqrt(x))/(x^4)', '\\frac{\\left(y^4\\sqrt{\\left(x\\right)}\\right)}{\\left(x^4\\right)}'],
  ['sqrt(x)sqrt(y)', '\\sqrt{\\left(x\\right)}\\sqrt{\\left(y\\right)}'],
  ['y=sqrt(x)+1', 'y=\\sqrt{\\left(x\\right)}+1'],
  ['sqrt (x)', '\\sqrt{\\left(x\\right)}'],
  ['cbrt 8', '\\sqrt[3]{8}'],
  // A space inside the root's bracket stays there; brackets inside are
  // counted; a `)` typed in a power first climbs back to the bracket.
  ['sqrt(x +1)/2', '\\frac{\\sqrt{\\left(x+1\\right)}}{2}'],
  ['sqrt((x+1)/2)', '\\sqrt{\\left(\\frac{\\left(x+1\\right)}{2}\\right)}'],
  ['sqrt(x^n)/2', '\\frac{\\sqrt{\\left(x^{n}\\right)}}{2}'],
  ['1/sqrt(2) + 1', '\\frac{1}{\\sqrt{\\left(2\\right)}}+1'],
  ['cbrt(6x^2)/(3x)', '\\frac{\\sqrt[3]{\\left(6x^2\\right)}}{\\left(3x\\right)}'],
  // A key the rule does not follow (Backspace) leaves the field exactly as
  // MathLive builds it: the old behaviour, and never a stray bracket.
  ['sqrt(x+2{Backspace}1)/2', '\\sqrt{\\frac{\\left(x+1\\right)}{2}}'],
];

// An ordered pair types its brackets as characters (no smart fences): the
// root still ends at its own `)`.
const PAIR_CASES = [
  ['(sqrt(2),3)', '(\\sqrt{(2)},3)'],
  ['(cbrt(x^n),1)', '(\\sqrt[3]{(x^{n})},1)'],
];

// What the grader receives (F-RADICAL-TYPING): a radicals answer typed as a
// student types it, read from the real box, graded by the shared grader on the
// radicals lessons' own keys as the teacher import compiles them.
// [lesson file, question, field, typed]
const RADICALS = 'teacher-import-jsons/algebra2-honors-radicals';
const L1 = 'L1_nth_Roots.json';
const L2 = 'L2_Operations_with_Radical_Expressions.json';
const L3 = 'L3_Rational_Exponents.json';
const RADICAL_ANSWERS = [
  [L1, 'a2r1-cw-9', 'root63', '3sqrt(7)'],
  [L1, 'a2r1-cw-12', 'quotient', 'sqrt(3)'],
  [L1, 'a2r1-cw-12', 'product', '24x^3y^4sqrt(6)'],
  [L2, 'a2r2-cw-2', 'first', '5a^2b^4sqrt(b)'],
  // The Check Your Progress after Examples A and B (L2 pacing); its
  // √(16x⁴y¹¹) was a2r2-cw-3's before that item became an extension.
  [L2, 'a2r2-cw-12', 'first', '4x^2y^5 sqrt y'],
  [L2, 'a2r2-cw-12', 'second', '3x^3y^4cbrt(y^2)'],
  [L2, 'a2r2-cw-4', 'denominator', 'x^3 sqrt x'],
  [L2, 'a2r2-cw-4', 'denominator', 'x^3sqrt(x)'],
  [L2, 'a2r2-cw-4', 'multiplier', 'sqrt(x)'],
  [L2, 'a2r2-cw-4', 'simplified', 'y^4sqrt(x)/x^4'],
  [L2, 'a2r2-cw-4', 'simplified', '(y^4 sqrt(x))/(x^4)'],
  [L2, 'a2r2-cw-5', 'simplified', 'cbrt(6x^2)/(3x)'],
  [L2, 'a2r2-cw-6', 'second', '2cbrt(9y)/(3y)'],
  [L2, 'a2r2-cw-7', 'fix', 'cbrt(x)'],
  [L2, 'a2r2-cw-10', 'sum', '6sqrt(3)-6+9sqrt(5)-3sqrt(15)'],
  [L2, 'a2r2-cw-11', 'first', 'sqrt(2)+1'],
  [L2, 'a2r2-cw-11', 'second', '(sqrt(3)-1)/2'],
  [L2, 'a2r2-p-8', 'simplified', '2-sqrt(2)'],
  [L2, 'a2r2-p-12', 'first', '3cbrt(2)'],
  [L3, 'a2r3-cw-8', 'index', 'cbrt(2x^2)'],
  [L3, 'a2r3-p-7', 'radical', 'cbrt(V^2)'],
  [L3, 'a2r3-p-10', 'reduced', 'sqrt(2xy^3)'],
  [L3, 'a2r3-p-10', 'simplified', 'ysqrt(2xy)'],
];
const lessonQuestions = new Map();
const radicalQuestion = (file, questionId) => {
  if (!lessonQuestions.has(file)) {
    const text = readFileSync(new URL(`../../${RADICALS}/${file}`, import.meta.url), 'utf8');
    lessonQuestions.set(file, new Map(compileTeacherImport(text).questions.map((question) => [question.questionId, question])));
  }
  return lessonQuestions.get(file).get(questionId);
};

// [typed then Enter, displayed result]
const CALCULATOR_CASES = [
  ['6/3+1', '3'],
  ['1/2+1/4', '0.75'],
  ['8/(2+2)', '2'],
  // The bracket ends the typed fraction, so the screen shows (6/2)(1 + 2), and
  // the calculator computes what it shows (groupBuiltFractions), not 6/(2·3).
  ['6/2(1+2)', '9'],
  ['3/4(8)', '6'],
];

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.goto(`${ORIGIN}/tests/browser/mathEntryContract.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('math-field').length >= 2 && customElements.get('math-field'));

const failures = [];

// `{Backspace}` in a case is that key pressed; everything else is typed.
const typeInto = async (selector, text) => {
  await page.evaluate((sel) => { document.querySelector(sel).value = ''; }, selector);
  await page.click(selector);
  await page.waitForTimeout(120);
  for (const part of text.split(/(\{[A-Za-z]+\})/).filter(Boolean)) {
    if (/^\{[A-Za-z]+\}$/.test(part)) await page.keyboard.press(part.slice(1, -1));
    else await page.keyboard.type(part, { delay: 15 });
  }
  await page.waitForTimeout(80);
};

for (const [typed, expected] of ANSWER_CASES) {
  await typeInto('[data-entry="answer"] math-field', typed);
  const actual = await page.evaluate(() => document.querySelector('[data-entry="answer"] math-field').value);
  const verdict = actual === expected ? 'ok  ' : 'FAIL';
  if (verdict === 'FAIL') failures.push(`answer "${typed}": expected ${expected}, got ${actual}`);
  console.log(`${verdict} answer      ${typed.padEnd(14)} -> ${actual}`);
}

for (const [typed, expected] of PAIR_CASES) {
  await typeInto('[data-entry="pair"] math-field', typed);
  const actual = await page.evaluate(() => document.querySelector('[data-entry="pair"] math-field').value);
  const verdict = actual === expected ? 'ok  ' : 'FAIL';
  if (verdict === 'FAIL') failures.push(`ordered pair "${typed}": expected ${expected}, got ${actual}`);
  console.log(`${verdict} pair        ${typed.padEnd(14)} -> ${actual}`);
}

for (const [file, questionId, fieldId, typed] of RADICAL_ANSWERS) {
  await typeInto('[data-entry="answer"] math-field', typed);
  const held = await page.evaluate(() => document.querySelector('[data-entry="answer"] math-field').value);
  const question = radicalQuestion(file, questionId);
  const field = question?.answerFields?.find((candidate) => candidate.id === fieldId);
  if (!field) {
    failures.push(`radicals ${questionId} ${fieldId}: no such field in ${file}`);
    continue;
  }
  const key = Object.fromEntries(question.answerFields.map((candidate) => [candidate.id, String(candidate.answer)]));
  const right = gradeMultiAnswerResponse(question, { ...key, [fieldId]: held }).parts.find((part) => part.id === fieldId)?.isCorrect === true;
  if (!right) failures.push(`radicals ${questionId} ${fieldId}: "${typed}" for the key ${field.answer} is held as ${held} and graded wrong`);
  console.log(`${right ? 'ok  ' : 'FAIL'} graded      ${typed.padEnd(14)} -> ${held}  (key ${field.answer})`);
}

// The parent receives what the field holds (the value a grader reads).
await typeInto('[data-entry="answer"] math-field', 'y=-2/3x+4');
await page.waitForTimeout(200);
const reported = await page.textContent('[data-entry="reported"]');
if (reported !== 'y=-\\frac23x+4') failures.push(`reported value: expected y=-\\frac23x+4, got ${reported}`);
console.log(`${reported === 'y=-\\frac23x+4' ? 'ok  ' : 'FAIL'} reported    ${reported}`);

for (const [typed, expected] of CALCULATOR_CASES) {
  await typeInto('[data-entry="calculator"] math-field', typed);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const actual = await page.evaluate(() => document.querySelector('[data-entry="calculator"] math-field').value);
  const verdict = actual === expected ? 'ok  ' : 'FAIL';
  if (verdict === 'FAIL') failures.push(`calculator "${typed}": expected ${expected}, got ${actual}`);
  console.log(`${verdict} calculator  ${typed.padEnd(14)} = ${actual}`);
}

pageErrors.forEach((message) => failures.push(`page error: ${message}`));
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} math-entry contract failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nmath-entry contract: every case holds.');
