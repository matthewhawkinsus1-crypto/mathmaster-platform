/*
 * "WATCH OUT" ON EVERY QUESTION OF THE FIVE REGULAR ALGEBRA II LESSONS (FB02).
 *
 * The five regular Polynomials and Radicals lessons had 46 of their 142
 * questions with a worked solution that named no common mistake (Pre-Flight
 * listed them as advice; the Honors versions had none missing). The 46 lines
 * are written. After the last try, a student who missed one reads "Watch out:"
 * and the mistake that is usual for THAT question, so this file pins what the
 * lines promise:
 *
 *   1. every question has its line, by Pre-Flight's own reading;
 *   2. the 46 are all there, each its own sentence, short enough to be kept
 *      whole (400 characters), and none has a ";" — the platform reads what
 *      comes before a ";" as a mistake it may say right after a miss
 *      (attemptFeedbackPlan.js commonErrorMiss, FB04), and these lines teach
 *      once the question is over — nor a "$…$": Pre-Flight warns about raw
 *      LaTeX outside a question prompt, so the lines are plain Unicode text;
 *   3. a template's line fills in at each of its first 32 versions, with the
 *      numbers of THAT version (not the template's words, not another
 *      version's);
 *   4. every number a line states is re-derived from its own question with
 *      plain arithmetic (never a grader's reader): the wrong box, the wrong
 *      remainder, the candidate that fails the check. A line cannot go on
 *      saying "293" after the question's numbers change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { buildFamilyQuestion, cachedFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import { buildTemplateFamily } from '../../functions/shared/questionFamilyTemplate.mjs';
import { auditAssignmentSolutionReviews, hasAuthoredCommonError } from '../../src/platform/preflight/solutionReviewPreflight.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../../teacher-import-jsons/algebra2-polynomials-radicals');
const FILES = [
  '1_Factoring_Polynomials.json',
  '2_Remainder_and_Factor_Theorems.json',
  '3_Radical_Expressions.json',
  '4_Rational_Exponents.json',
  '5_Solving_Radical_Equations.json',
];
const LESSONS = FILES.map((name) => {
  const text = fs.readFileSync(path.join(DIR, name), 'utf8');
  return { name, raw: JSON.parse(text), ...compileTeacherImport(text) };
});
const RAW = LESSONS.flatMap((lesson) => lesson.raw.sections.flatMap((section) => section.questions.map((question) => ({ file: lesson.name, question }))));
const item = (id) => {
  const found = LESSONS.flatMap((lesson) => lesson.questions).find((question) => question.questionId === id);
  assert.ok(found, `${id} is in the lessons`);
  return found;
};
const lineOf = (id) => RAW.find((entry) => entry.question.questionId === id)?.question.solutionReview?.commonError;

// The 46 questions that had no line.
const FB02 = {
  '1_Factoring_Polynomials.json': ['fp-wu-2', 'fp-wu-3', 'fp-cw-4', 'fp-cw-5', 'fp-cw-7', 'fp-cw-9', 'fp-p-5', 'fp-p-10'],
  '2_Remainder_and_Factor_Theorems.json': ['rf-wu-2', 'rf-cw-1', 'rf-cw-2', 'rf-cw-3', 'rf-cw-5', 'rf-cw-8', 'rf-cw-9', 'rf-cw-10', 'rf-p-1', 'rf-p-2', 'rf-p-3', 'rf-p-4', 'rf-p-12', 'rf-dol-1'],
  '3_Radical_Expressions.json': ['rx-cw-3', 'rx-cw-4', 'rx-cw-9'],
  '4_Rational_Exponents.json': ['re-cw-5'],
  '5_Solving_Radical_Equations.json': ['sr-cw-1', 'sr-cw-2', 'sr-cw-4', 'sr-cw-5', 'sr-cw-6', 'sr-cw-7', 'sr-cw-8', 'sr-p-1', 'sr-p-2', 'sr-p-3', 'sr-p-5', 'sr-p-6', 'sr-p-7', 'sr-p-8', 'sr-p-9', 'sr-p-10', 'sr-p-11', 'sr-p-13', 'sr-dol-1', 'sr-dol-2'],
};
const FB02_IDS = Object.values(FB02).flat();

/* ------------------------------------------------ 1 and 2: there, and kept whole */

test('every question of the five regular lessons has a Watch out line, by Pre-Flight\'s own reading', () => {
  for (const lesson of LESSONS) {
    assert.deepEqual(lesson.model.errors, [], `${lesson.name} compiles`);
    assert.ok(lesson.questions.length > 0, `${lesson.name} has its questions`);
    assert.deepEqual(lesson.questions.filter((question) => !hasAuthoredCommonError(question)).map((question) => question.questionId), [], lesson.name);
    assert.deepEqual(auditAssignmentSolutionReviews(lesson.questions).noCommonError, [], lesson.name);
    assert.deepEqual(lesson.model.solutionReviews.warnings, [], lesson.name);
  }
});

test('the 46 lines written for FB02 are each in its own lesson, distinct from every other line, kept whole, and without a ";"', () => {
  assert.equal(FB02_IDS.length, 46);
  assert.equal(new Set(FB02_IDS).size, 46);
  const all = RAW.map(({ question }) => ({ id: question.questionId, line: question.solutionReview?.commonError }));
  for (const [file, ids] of Object.entries(FB02)) {
    for (const id of ids) {
      const entry = RAW.find((candidate) => candidate.question.questionId === id);
      assert.equal(entry?.file, file, `${id} belongs to ${file}`);
      const line = lineOf(id);
      assert.equal(typeof line, 'string', `${id} has a line`);
      assert.ok(line.length >= 40 && line.length <= 400, `${id}: ${line.length} characters`);
      assert.equal(line.includes(';'), false, `${id}: a ";" would make the words before it a mistake said right after a miss (commonErrorMiss)`);
      // Pre-Flight warns about "$…$" outside a question prompt: Unicode for ordinary text (x², √, −).
      assert.equal(/[$\\]/.test(line), false, `${id}: no raw LaTeX in a worked solution's line`);
      assert.deepEqual(all.filter((other) => other.line === line).map((other) => other.id), [id], `${id}: this sentence is its own`);
    }
  }
});

/* ------------------------------------------------ 3: a template's line fills in */

const isTemplate = (question) => Boolean(question.generator && question.questionFamily);
const versionsOf = (question, count = 32) => {
  const family = buildTemplateFamily(question, { slotKey: question.questionId });
  const sequence = cachedFamilyInstanceSequence(family, {}, `lessons|${question.questionId}`);
  const versions = [];
  for (let index = 0; index < count; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    versions.push(buildFamilyQuestion({ family, instance, constraintValues: {}, authored: question, tool: family.defaultTool }));
  }
  return versions;
};
const templates = () => FB02_IDS.map(item).filter(isTemplate);

test('a template\'s line is filled in at each of its first 32 versions, with no placeholder left and no doubled sign', () => {
  assert.equal(templates().length, 14, 'the Warm-Up, Practice and DOL templates among the 46');
  for (const template of templates()) {
    const versions = versionsOf(template);
    assert.equal(versions.length, 32, `${template.questionId}: 32 versions`);
    const resolved = versions.map((version) => version.solutionReview?.commonError);
    for (const line of resolved) {
      assert.equal(typeof line, 'string', template.questionId);
      assert.doesNotMatch(line, /\{\{|\}\}|undefined|NaN|null|\[object/, `${template.questionId}: ${line}`);
      assert.doesNotMatch(line, /[+\-−]\s*[+\-−]\s*\d/, `${template.questionId}: a doubled sign in ${line}`);
    }
    // A line that names numbers names the version's own: it is not one sentence for all.
    if (lineOf(template.questionId).includes('{{')) {
      assert.ok(new Set(resolved).size >= 3, `${template.questionId}: the numbers change with the version`);
    }
  }
});

/* ------------------------------------------------ 4: the numbers a line states */

const plain = (text) => String(text).replace(/−/g, '-');
const fmt = (value) => (value < 0 ? `−${-value}` : String(value));
const fmtList = (values) => values.map(fmt).join(', ');
const mentions = (line, needle) => assert.ok(plain(line).includes(plain(needle)), `"${needle}" is in: ${line}`);
const standalone = (line, number) => assert.match(plain(line), new RegExp(`(?<![\\d.])${String(number).replace('-', '\\-')}(?![\\d.]*\\d)`), `${number} is stated in: ${line}`);

// Plain arithmetic, written here and nowhere else.
const horner = (coefficients, root) => {
  const bottom = [coefficients[0]];
  for (let index = 1; index < coefficients.length; index += 1) bottom.push(coefficients[index] + root * bottom[index - 1]);
  return bottom;
};
const direct = (coefficients, x) => coefficients.reduce((sum, coefficient, index) => sum + coefficient * x ** (coefficients.length - 1 - index), 0);
const rootOf = (question) => (question.candidateRoot !== undefined ? Number(question.candidateRoot) : -question.divisor[1]);
const multiply = (left, right) => {
  const product = Array.from({ length: left.length + right.length - 1 }, () => 0);
  left.forEach((a, i) => right.forEach((b, j) => { product[i + j] += a * b; }));
  return product;
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('synthetic division: each number a line states is what the question\'s own top row gives', () => {
  // The Remainder Theorem item: the last number is the remainder, not part of the quotient.
  {
    const q = item('rf-cw-1');
    const bottom = horner(q.dividend, rootOf(q));
    assert.equal(direct(q.dividend, rootOf(q)), bottom.at(-1));
    mentions(lineOf(q.questionId), `Reading ${bottom.at(-1)} as part of the quotient`);
    mentions(lineOf(q.questionId), `the quotient is x + ${bottom[1]} and`);
    mentions(lineOf(q.questionId), `x² + 6x + 2 = (x − ${rootOf(q)})(x + ${bottom[1]}) + ${bottom.at(-1)}`);
    assert.deepEqual(q.dividend, [1, 6, 2]);
  }
  // A missing power: leaving out its 0 gives a different last number, and the right one is f(r).
  for (const [id, power] of [['rf-cw-2', 'x³ term'], ['rf-cw-10', 'x² term'], ['rf-p-2', 'x term']]) {
    const q = item(id);
    const line = lineOf(id);
    const root = rootOf(q);
    const without = q.dividend.filter((coefficient) => coefficient !== 0);
    assert.equal(q.dividend.length - without.length, 1, `${id}: one missing power`);
    const wrong = horner(without, root).at(-1);
    const right = horner(q.dividend, root).at(-1);
    assert.notEqual(wrong, right, `${id}: leaving the 0 out changes the answer`);
    assert.equal(direct(q.dividend, root), right);
    mentions(line, `missing ${power}`);
    mentions(line, `${fmtList(without)} in the top row`);
    standalone(line, wrong);
    if (id !== 'rf-cw-10') mentions(line, `f(${root}) = ${right}`);
    // rf-cw-10 asks whether x − 3 is a factor: it is, and the wrong row says it is not.
    if (id === 'rf-cw-10') { assert.equal(right, 0); mentions(line, 'wrongly looks like a non-factor'); }
  }
  // The wrong sign in the box: the other number gives a different remainder, and the right box gives 0.
  for (const [id, boxText, divisorText] of [['rf-cw-3', 'Putting −3 in the box for x − 3', 'x − 3'], ['rf-cw-5', 'Putting 2 in the box for x + 2', 'x + 2']]) {
    const q = item(id);
    const line = lineOf(id);
    const root = rootOf(q);
    assert.equal(horner(q.dividend, root).at(-1), 0, `${id}: ${divisorText} is a factor`);
    const wrong = horner(q.dividend, -root).at(-1);
    assert.equal(direct(q.dividend, -root), wrong);
    assert.notEqual(wrong, 0);
    mentions(line, boxText);
    standalone(line, wrong);
    if (id === 'rf-cw-5') mentions(line, `the box takes ${fmt(root)}`);
  }
  // The quartic's first division: a middle 0 stays in the quotient.
  {
    const q = item('rf-cw-9');
    const bottom = horner(q.dividend, rootOf(q));
    assert.equal(bottom.at(-1), 0);
    assert.equal(bottom[1], 0, 'a 0 in the quotient\'s x² place');
    mentions(lineOf(q.questionId), `the row ${fmtList(bottom.slice(0, -1))} has four numbers`);
    mentions(lineOf(q.questionId), 'x³ − 7x − 6');
  }
  // x⁴ − 16: three missing powers, a remainder of 0, and a quotient with four terms.
  {
    const q = item('rf-p-12');
    const bottom = horner(q.dividend, rootOf(q));
    assert.equal(q.dividend.filter((coefficient) => coefficient === 0).length, 3);
    assert.equal(bottom.at(-1), 0);
    assert.deepEqual(bottom.slice(0, -1), [1, 2, 4, 8]);
    mentions(lineOf(q.questionId), `the top row is ${fmtList(q.dividend)}`);
    mentions(lineOf(q.questionId), 'the quotient x³ + 2x² + 4x + 8 has four terms');
  }
});

test('factoring and rewriting: each product, square and identity a line states multiplies out', () => {
  // x² − x − 20: the factors with the signs swapped multiply to x² + x − 20, not the trinomial.
  {
    const q = item('fp-cw-4');
    assert.deepEqual(q.coefficients, [1, -1, -20]);
    assert.deepEqual(multiply([1, 4], [1, -5]), q.coefficients, 'the right factors');
    assert.deepEqual(multiply([1, -4], [1, 5]), [1, 1, -20], 'the wrong factors');
    mentions(lineOf(q.questionId), 'Writing (x − 4)(x + 5): it multiplies out to x² + x − 20');
    mentions(lineOf(q.questionId), 'the larger number, 5,');
    mentions(lineOf(q.questionId), 'the sum −1');
  }
  // The ac method: the product is a · c, the sum is still b.
  {
    const q = item('fp-cw-5');
    const [, a, signB, b, signC, c] = plain(q.prompt).match(/\$(\d+)x\^2 ([+-]) (\d+)x ([+-]) (\d+)\$/).map((part, index) => (index === 1 || index === 3 || index === 5 ? Number(part) : part));
    const [A, B, C] = [a, signB === '-' ? -b : b, signC === '-' ? -c : c];
    assert.deepEqual([A, B, C], [24, -22, 3]);
    mentions(lineOf(q.questionId), `product is c = ${C}`);
    mentions(lineOf(q.questionId), `a · c = ${A * C}`);
    mentions(lineOf(q.questionId), `b = ${fmt(B)}`);
  }
  // 9x² − 12x + 16: the squares are there, the middle term would have to be ±24x.
  {
    const q = item('fp-cw-7');
    assert.match(plain(q.prompt), /\$9x\^2 - 12x \+ 16\$/);
    assert.equal(2 * Math.sqrt(9) * Math.sqrt(16), 24);
    assert.notEqual(24, 12);
    mentions(lineOf(q.questionId), '9x² − 12x + 16');
    mentions(lineOf(q.questionId), '±2(3x)(4) = ±24x');
    mentions(lineOf(q.questionId), 'it is −12x');
  }
  // 64x⁶ − y⁶ stops at a sum and a difference of cubes; 54x⁵ + 128x²y³ needs 2x² out first.
  for (const [x, y] of [[1.3, 0.7], [-2, 3], [0.5, -1.5]]) {
    assert.ok(near((8 * x ** 3 + y ** 3) * (8 * x ** 3 - y ** 3), 64 * x ** 6 - y ** 6), 'the squares step');
    assert.ok(near(54 * x ** 5 + 128 * x ** 2 * y ** 3, 2 * x ** 2 * (27 * x ** 3 + 64 * y ** 3)), 'the GCF');
    assert.ok(near((3 * x + 4 * y) * (9 * x ** 2 - 12 * x * y + 16 * y ** 2), 27 * x ** 3 + 64 * y ** 3), 'the sum of cubes');
  }
  mentions(lineOf('fp-cw-9'), 'Stopping at (8x³ + y³)(8x³ − y³)');
  mentions(lineOf('fp-p-10'), '54x⁵ + 128x²y³ is a sum of cubes only after 2x² comes out, leaving 27x³ + 64y³ = (3x + 4y)(9x² − 12xy + 16y²)');
  // The cubic's quadratic quotient still factors.
  {
    assert.match(plain(item('rf-cw-8').prompt), /\$x\^3 - 2x\^2 - 5x \+ 6\$/);
    assert.deepEqual(multiply([1, -1], [1, -1, -6]), [1, -2, -5, 6]);
    assert.deepEqual(multiply([1, -3], [1, 2]), [1, -1, -6]);
    mentions(lineOf('rf-cw-8'), 'Stopping at (x − 1)(x² − x − 6): the quadratic still factors, as (x − 3)(x + 2)');
  }
  // a/(a√2 − a) is 1/(√2 − 1), not 1/(√2 − a).
  for (const a of [2, 3, 5]) {
    assert.ok(near(a / (a * Math.SQRT2 - a), 1 / (Math.SQRT2 - 1)));
    assert.ok(!near(a / (a * Math.SQRT2 - a), 1 / (Math.SQRT2 - a)));
  }
  mentions(lineOf('rx-cw-9'), 'a/(a√2 − a) is not 1/(√2 − a)');
  // The calculator reading of 168^-8/5.
  {
    const q = item('re-cw-5');
    assert.match(plain(q.prompt), /168 kg/);
    assert.match(plain(q.prompt), /512 - 146\{,\}230B\^\{-\\frac\{8\}\{5\}\}/);
    const right = 512 - 146230 * 168 ** (-8 / 5);
    const typed = 512 - 146230 * (168 ** -8 / 5);
    assert.equal(Math.round(right), 472);
    assert.equal(Math.round(typed), 512);
    mentions(lineOf(q.questionId), 'M comes out as 512, not 472');
    mentions(lineOf(q.questionId), '168^(-8/5)');
  }
});

// A radical equation of an item, read with plain arithmetic: coefficient · index-th root of (m·x + b) + outside = m·x + b.
const nthRoot = (value, index) => (index % 2 === 1 ? Math.sign(value) * Math.abs(value) ** (1 / index) : value < 0 ? NaN : value ** (1 / index));
const left = (spec, x) => (spec.coefficient ?? 1) * nthRoot(spec.radicand.m * x + spec.radicand.b, spec.index ?? 2) + (spec.outside ?? 0);
const right = (spec, x) => spec.rhs.m * x + spec.rhs.b;
const holds = (spec, x) => near(left(spec, x), right(spec, x));
// What the radical alone equals once the outside term and the coefficient are undone.
const alone = (spec) => (spec.rhs.b - (spec.outside ?? 0)) / (spec.coefficient ?? 1);
// The x that makes (m·x + b) equal v.
const xFor = (spec, v) => (v - spec.radicand.b) / spec.radicand.m;

test('radical equations: each candidate a line names holds or fails exactly as the line says', () => {
  const spec = (id) => item(id).radicalEquation;
  const say = (id, ...needles) => needles.forEach((needle) => mentions(lineOf(id), needle));
  // Squaring before the radical is alone: y − 2 − 1 = 25 gives 28, which fails; the right radical is 6 and y is 38.
  {
    const s = spec('sr-cw-1');
    const wrongX = xFor({ radicand: { m: 1, b: s.radicand.b + s.outside } }, s.rhs.b ** 2);
    assert.equal(wrongX, 28);
    assert.equal(holds(s, wrongX), false);
    assert.equal(alone(s), 6);
    assert.equal(holds(s, xFor(s, alone(s) ** 2)), true);
    say('sr-cw-1', 'y − 2 − 1 = 25', `y = ${wrongX}`, 'fails the check');
  }
  // Subtracting 2 instead of adding it: the radical would be 4 (x = 19), but it is 8.
  {
    const s = spec('sr-cw-2');
    const wrongRadical = s.rhs.b + s.outside;
    assert.deepEqual([wrongRadical, alone(s)], [4, 8]);
    assert.equal(holds(s, xFor(s, wrongRadical ** 2)), false);
    assert.equal(xFor(s, wrongRadical ** 2), 19);
    assert.equal(holds(s, xFor(s, alone(s) ** 2)), true);
    say('sr-cw-2', 'the radical equals 8, not 4', 'x = 19 fails the check');
  }
  // A cube root equal to −5 is fine: 3y + 1 = −125.
  {
    const s = spec('sr-cw-4');
    assert.equal(alone(s), -5);
    assert.equal(holds(s, xFor(s, alone(s) ** 3)), true);
    say('sr-cw-4', 'the cube root equals −5', `3y + 1 = ${fmt(alone(s) ** 3)}`);
  }
  // A 1/3 power is undone by cubing: 27, not 9.
  {
    const s = spec('sr-cw-5');
    assert.equal(alone(s), 3);
    assert.equal(holds(s, xFor(s, 3 ** 3)), true);
    assert.equal(holds(s, xFor(s, 3 ** 2)), false);
    say('sr-cw-5', 'Squaring instead of cubing', `2y + 1 = 3³ = ${3 ** 3}, not 3² = ${3 ** 2}`);
  }
  // Raising 14 to the sixth power without dividing by 7: the sixth root alone is 2, and 2⁶ = 64.
  {
    const s = spec('sr-cw-6');
    assert.equal(s.rhs.b - s.outside, 14);
    assert.equal(alone(s), 2);
    assert.equal(holds(s, xFor(s, 2 ** 6)), true);
    say('sr-cw-6', 'Raising 14 to the sixth power without dividing by 7 first', 'the sixth root alone equals 2', `5m + 4 = 2⁶ = ${2 ** 6}`);
  }
  // Add 4 first (77 + 4 = 81), then divide by 9: the cube root is 9.
  {
    const s = spec('sr-cw-7');
    assert.equal(s.rhs.b - s.outside, 81);
    assert.equal(alone(s), 9);
    assert.equal(holds(s, xFor(s, 9 ** 3)), true);
    say('sr-cw-7', 'Dividing by 9 before adding 4', '77 + 4 = 81', 'the cube root equals 9');
  }
  // √(−3x − 5) = x + 3: x = −2 checks, x = −7 makes the right side −4.
  {
    const s = spec('sr-cw-8');
    assert.equal(holds(s, -2), true);
    assert.equal(holds(s, -7), false);
    assert.equal(right(s, -7), -4);
    say('sr-cw-8', 'Keeping x = −7', 'x + 3 equal to −4', 'only x = −2 checks');
  }
  // √(x + 6) = x: x = 3 checks; x = −2 has √4 = 2 against −2.
  {
    const s = spec('sr-p-5');
    assert.equal(holds(s, 3), true);
    assert.equal(holds(s, -2), false);
    assert.deepEqual([left(s, -2), right(s, -2)], [2, -2]);
    say('sr-p-5', 'Keeping x = −2', 'the right side is −2, but √4 = 2', 'only x = 3 checks');
  }
  // √(2x + 7) = x + 2: x = 1 checks; x = −3 does not; (x + 2)² dropped to x² + 4 gives candidates 3 and −1 that both fail.
  {
    const s = spec('sr-p-6');
    assert.equal(holds(s, 1), true);
    assert.equal(holds(s, -3), false);
    // 2x + 7 = x² + 4  →  x² − 2x − 3 = 0  →  3 and −1
    const wrongRoots = [3, -1];
    wrongRoots.forEach((x) => { assert.ok(near(s.radicand.m * x + s.radicand.b, x ** 2 + 4)); assert.equal(holds(s, x), false); });
    say('sr-p-6', 'Squaring x + 2 as x² + 4: (x + 2)² = x² + 4x + 4', 'dropping the 4x');
  }
  // The squared equation x² − 3x − 4 = 0 has roots 4 and −1; only 4 solves √(3x + 4) = x.
  {
    const q = item('sr-p-7');
    assert.match(plain(q.prompt), /\\sqrt\{3x \+ 4\} = x\$ gives \$x\^2 - 3x - 4 = 0\$, with candidates \$4\$ and \$-1\$/);
    const solves = (x) => near(Math.sqrt(3 * x + 4), x);
    assert.deepEqual([4, -1].map((x) => near(x ** 2 - 3 * x - 4, 0)), [true, true]);
    assert.deepEqual([4, -1].map(solves), [true, false]);
    assert.equal(Math.sqrt(3 * -1 + 4), 1);
    say('sr-p-7', 'x² − 3x − 4 = 0', 'at x = −1 the original equation says √1 = −1', 'only 4 is a solution');
  }
  // A fourth root alone equals 3: 3⁴ = 81 gives x = 84; squaring once (3² = 9) gives x = 12, which fails.
  {
    const s = spec('sr-p-8');
    assert.equal(alone(s), 3);
    assert.equal(holds(s, xFor(s, 3 ** 4)), true);
    assert.equal(xFor(s, 3 ** 4), 84);
    assert.equal(holds(s, xFor(s, 3 ** 2)), false);
    say('sr-p-8', 'the fourth root alone equals 3', `x − 3 = 3⁴ = ${3 ** 4}, not 3² = ${3 ** 2}`);
  }
  // (x − 2)^(1/2) + 4 = 1: the root alone would be −3, no x works, and the squared candidate 11 gives 7.
  {
    const s = spec('sr-p-9');
    assert.equal(alone(s), -3);
    const candidate = xFor(s, alone(s) ** 2);
    assert.equal(candidate, 11);
    assert.deepEqual([left(s, candidate), right(s, candidate)], [7, 1]);
    assert.ok(s.outside > s.rhs.b, 'the left side never gets down to the right side');
    say('sr-p-9', 'x = 11', 'the isolated square root equals −3', 'there is no solution', 'x = 11 gives 3 + 4 = 7, not 1');
  }
  // 45 = √(22.5d): both sides squared, 22.5d = 2025, d = 90.
  {
    const s = spec('sr-p-11');
    assert.equal(s.rhs.b ** 2, 2025);
    assert.equal(xFor(s, s.rhs.b ** 2), 90);
    assert.equal(holds(s, 90), true);
    assert.equal(holds(s, xFor(s, s.rhs.b)), false, 'leaving the 45 unsquared gives d = 2');
    say('sr-p-11', 'Leaving the 45 unsquared', `22.5d = 45² = ${s.rhs.b ** 2}`, 'the skid marks are 90 feet long');
  }
  // (x + 3)^(1/3) = −2: x = −11; cubing −2 as 8 gives x = 5, which fails.
  {
    const s = spec('sr-p-13');
    assert.equal(alone(s), -2);
    assert.equal((-2) ** 3, -8);
    assert.equal(holds(s, xFor(s, -8)), true);
    assert.equal(xFor(s, -8), -11);
    assert.equal(holds(s, xFor(s, 8)), false);
    say('sr-p-13', 'Cubing −2 as 8', '(−2)³ = −8', 'x + 3 = −8 and x = −11');
  }
});

/*
 * A template's line states the numbers of the version it is shown on. Each
 * regex reads the line the way a student does; the numbers it captures are
 * checked against that version's own equation or polynomial.
 */
const num = (text) => Number(plain(text.replace(/[()]/g, '')));
const signed = (sign, digits) => (sign === '-' ? -Number(digits) : Number(digits));
const parse = (line, pattern) => {
  const match = plain(line).match(pattern);
  assert.ok(match, `the line reads as expected: ${line}`);
  return match.slice(1);
};

const TEMPLATE_CLAIMS = {
  'fp-wu-2': (line, v) => {
    const [m1, n1, m2, n2] = parse(line, /SUM of the two numbers, (\(?-?\d+\)?) \+ (\(?-?\d+\)?), and the constant term is their PRODUCT, (\(?-?\d+\)?) · (\(?-?\d+\)?)\.$/).map(num);
    assert.deepEqual([m1, n1, m2, n2], [v.leftBinomial[1], v.rightBinomial[1], v.leftBinomial[1], v.rightBinomial[1]]);
  },
  'fp-wu-3': (line, v) => {
    const [p, s] = parse(line, /multiply to (-?\d+) must also add to (-?\d+), so check/).map(num);
    assert.deepEqual([v.coefficients[1], v.coefficients[2]], [s, p]);
  },
  'rf-wu-2': (line, v) => {
    const [s, p] = parse(line, /add to (-?\d+) without checking their product: they must also multiply to (-?\d+)\.$/).map(num);
    assert.deepEqual([v.coefficients[1], v.coefficients[2]], [s, p]);
  },
  'fp-p-5': (line, v) => {
    const [p, s] = parse(line, /the product, (-?\d+), says whether the two numbers match, and the sign of the sum, (-?\d+), is/).map(num);
    assert.deepEqual([v.coefficients[1], v.coefficients[2]], [s, p]);
  },
  'rf-p-1': (line, v) => {
    const [r] = parse(line, /is not P\((-?\d+)\)\.$/).map(num);
    assert.equal(r, v.candidateRoot);
  },
  'rf-p-3': (line, v) => {
    const [tested, sign, digits, zero, again] = parse(line, /^Testing P\((-?\d+)\) for the factor x ([+-]) (\d+): that factor is zero at x = (-?\d+), so it is P\((-?\d+)\) that must be 0\.$/);
    const factorConstant = signed(sign, digits);
    assert.equal(factorConstant, -v.candidateRoot, 'the factor is x − r');
    assert.deepEqual([num(tested), num(zero), num(again)], [factorConstant, v.candidateRoot, v.candidateRoot]);
    // The factor really is zero where the line says, and not where it warns against.
    assert.equal(v.candidateRoot + factorConstant, 0);
    assert.notEqual(num(tested) + factorConstant, 0);
  },
  'rf-p-4': (line, v) => {
    assert.match(line, /remainder, 0,/);
    // The remainder it names is the version's own: x − r really is a factor.
    assert.equal(horner(v.dividend, v.candidateRoot).at(-1), 0);
  },
  'rf-dol-1': (line, v) => {
    const [boxed, sign, digits, zero] = parse(line, /^Putting (-?\d+) in the box because the divisor reads x ([+-]) (\d+): the box takes the number that makes the divisor zero, (-?\d+)\.$/);
    const factorConstant = signed(sign, digits);
    assert.equal(num(boxed), factorConstant, 'the wrong box is the number printed in the divisor');
    assert.equal(num(zero), v.candidateRoot);
    assert.equal(v.candidateRoot + factorConstant, 0);
  },
  'sr-p-1': (line, v) => {
    const s = v.radicalEquation;
    const [k, instead, cSign, cDigits, radical, bSign, bDigits, squared] = parse(line, /^Squaring (-?\d+) instead of (-?\d+): undo the ([+-]) (\d+) first, so the radical equals (-?\d+) and x ([+-]) (\d+) = (-?\d+)²\.$/);
    assert.deepEqual([num(k), signed(cSign, cDigits), signed(bSign, bDigits)], [s.rhs.b, s.outside, s.radicand.b]);
    assert.equal(num(instead), alone(s));
    assert.deepEqual([num(radical), num(squared)], [alone(s), alone(s)]);
    assert.notEqual(num(k), alone(s));
    assert.equal(holds(s, xFor(s, alone(s) ** 2)), true);
  },
  'sr-p-2': (line, v) => {
    const s = v.radicalEquation;
    const [a1, a2, cSign, cDigits, a3, radical] = parse(line, /^Squaring before dividing by (\d+): the (\d+) gets squared too, so undo the ([+-]) (\d+) and divide by (\d+) first, and the radical then equals (-?\d+)\.$/);
    assert.deepEqual([num(a1), num(a2), num(a3), signed(cSign, cDigits)], [s.coefficient, s.coefficient, s.coefficient, s.outside]);
    assert.equal(num(radical), alone(s));
    assert.equal(holds(s, xFor(s, alone(s) ** 2)), true);
  },
  'sr-p-3': (line, v) => {
    const s = v.radicalEquation;
    const [k, cSign, cDigits, radical, cubed] = parse(line, /^Cubing (-?\d+) before the cube root is alone: undo the ([+-]) (\d+) and divide out any coefficient first, so the cube root equals (-?\d+) \(a cube root can be negative\) and the radicand equals (\(?-?\d+\)?)³\.$/);
    assert.deepEqual([num(k), signed(cSign, cDigits)], [s.rhs.b, s.outside]);
    assert.deepEqual([num(radical), num(cubed)], [alone(s), alone(s)]);
    assert.equal(holds(s, xFor(s, alone(s) ** 3)), true);
  },
  'sr-p-10': (line, v) => { checkQuadraticRadical(line, v, /^Keeping x = (-?\d+): it makes the right side negative, and a square root is never negative, so only x = (-?\d+) checks\.$/, 'extraneous first'); },
  'sr-dol-1': (line, v) => {
    const s = v.radicalEquation;
    const [k, a, cSign, cDigits, radical] = parse(line, /^Dividing (-?\d+) by (\d+) before undoing the ([+-]) (\d+): undo it first, then divide, so the radical equals (-?\d+)\.$/);
    assert.deepEqual([num(k), num(a), signed(cSign, cDigits)], [s.rhs.b, s.coefficient, s.outside]);
    assert.equal(num(radical), alone(s));
    assert.equal(holds(s, xFor(s, alone(s) ** 2)), true);
  },
  'sr-dol-2': (line, v) => { checkQuadraticRadical(line, v, /^Stopping at the quadratic's two roots, (-?\d+) and (-?\d+): check each in the original equation, because at (-?\d+) the right side is negative, which a square root never is\.$/, 'both roots'); },
};

// √(m·x + b) = x + c with two candidates: the genuine one checks, the other makes the right side negative.
function checkQuadraticRadical(line, version, pattern, shape) {
  const s = version.radicalEquation;
  const groups = parse(line, pattern);
  let extraneous; let genuine;
  if (shape === 'extraneous first') [extraneous, genuine] = groups;
  else { let named; [genuine, extraneous, named] = groups; assert.equal(named, extraneous, 'the root named in the reason is the one that fails'); }
  assert.equal(holds(s, num(genuine)), true, 'the one it keeps checks');
  assert.equal(holds(s, num(extraneous)), false, 'the one it warns about does not');
  assert.ok(right(s, num(extraneous)) < 0, 'its right side is negative, as the line says');
  assert.ok(right(s, num(genuine)) >= 0);
}

test('a template\'s line names the numbers of the version it is shown on, and what it says about them is true', () => {
  const claimed = Object.keys(TEMPLATE_CLAIMS).sort();
  assert.deepEqual(claimed, templates().map((template) => template.questionId).sort(), 'every template among the 46 is checked');
  for (const template of templates()) {
    for (const version of versionsOf(template)) {
      TEMPLATE_CLAIMS[template.questionId](version.solutionReview.commonError, version);
    }
  }
});
