/*
 * JOB K (CT02, slice 4) — WORKED STEPS WRITTEN INTO THE LESSON FILES.
 *
 * A closed question that no support family can work carries its own
 * solutionReview in its lesson file. Once the question closes the review panel
 * shows it as the item's steps (closedQuestionReview.js: authored steps win,
 * and no family or builder is asked). The items:
 *
 *   l3-wu-2   Algebra I M2 T2 Lesson 3, Regular and Honors: the slopes of AB and
 *             its three rotations about the origin, whose points are only in the
 *             warm-up item before it (l3-wu-1: A(0, 0) and B(8, 5)). The steps
 *             name those points and the images the warm-up's turn rules give.
 *             The Honors file is rebuilt from the Regular one by
 *             scripts/content/build-algebra1-l3-honors.mjs
 *             (algebra1L3HonorsFile.test.mjs checks the bytes).
 *   Lesson 2  Algebra I M2 T2 Lesson 2 (vertical and horizontal transformations
 *             of linear functions): its 12 multi-answer items, its table
 *             (l2-cw-9) and its sort of graphs (l2-pr-8). Each asks why a move
 *             or a stretch is written where it is, in words no family reads; the
 *             steps work each part from the functions and points the student
 *             was shown, or plotted in the item before.
 *
 * Checked here with this file's own reading (mathjs fractions), never a
 * family's helpers:
 *   - the review is the item's own, as the inventory resolves the item and as a
 *     student's device gets it after import (Pre-Flight, the stored record,
 *     QuestionEngine), and nothing in it is cut short by the support bundle's
 *     limits (8 steps of at most 400 characters, a 160-character headline, a
 *     240-character summary: pathSolutionSupport.buildPrivateSupport);
 *   - each part's answer is stated in its own step, a choice in its own words
 *     and naming no other choice, and the part's own grader marks every stated
 *     answer right (gradeMultiAnswerResponse; gradeTableResponse for a table;
 *     the composed-workflow grader for a sort); the summary states the same;
 *   - every "=" the headline, a step or the summary writes is either a claim
 *     checked here — exact arithmetic, an identity in x (and m, n, b) at many
 *     values with the item's own functions, or an equation at its solution — or
 *     a given quoted from what the item shows (its prompt, labels and choices);
 *     and the numbers are the student's: the points they plotted or were shown;
 *   - nothing changes while the item is open: the review names no common error
 *     (FB04 says a common error's mistake half on a miss), and the hints and the
 *     back-up step are the same with or without it.
 *
 * Mutation-checked (each made in the lesson files, seen red, undone):
 *   - a slope's arithmetic changed ("= 5/8" to "= 8/5" in A″B″'s step) → the part and arithmetic checks;
 *   - the 90° rule printed as (y, −x), or B′ printed as (5, 8) → the turn check;
 *   - the pattern step stating "the reciprocal only" → the part check;
 *   - a common error added → the whole-review and open-item checks;
 *   - the review removed from the Regular file only → algebra1L3HonorsFile and every check here;
 *     from both files → the inventory's floors and afterLastMiss's Pre-Flight count;
 *   - Lesson 2: a simplification's last line changed ("2x + 7" to "2x + 8"), a
 *     solved equation's value changed ("x = 15/2" to "x = 15/4"), a step naming
 *     a second choice, a sort step sending a graph to the wrong equation, a
 *     table cell changed, an unchecked "=" added → each the matching check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { gradeMultiAnswerResponse, gradeTableResponse, tableEditableKeys } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { buildFigureMatchResponse, figureLabel, figureNoun } from '../../functions/shared/toolMath/workflow/figureMatch.mjs';
import { readComposedQuestion } from '../../functions/shared/toolMath/workflow/questionWorkflow.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const math = create(all, { number: 'Fraction' });
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');
const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const F = (value) => math.fraction(ascii(value).replace(/[()\s]/g, ''));
const count = (haystack, needle) => haystack.split(needle).length - 1;

/* ------------------------------------------------------------ reading a claim */

/*
 * A claim as a step writes it ("j(x + 4) = 2(x + 4) − 1 = 2x + 7", "0 = 3x − 8",
 * "(5/8) × (−8/5) = −1"), read by mathjs with the item's own functions. A
 * single-letter variable before "(" is a product (m(x − n) is m·(x − n)), and
 * letters written together are a product (mn, mx).
 */
const VARIABLES = ['x', 'y', 'm', 'n', 'b'];
const SAMPLES = Object.freeze({ x: ['-3', '0', '1/2', '2', '7'], y: ['-2', '1/3', '4'], m: ['-2', '1/3', '3'], n: ['-1', '2', '5/2'], b: ['-4', '0', '3/5'] });
// x² is x^2: a run of superscript digits is a power.
const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const powerOf = (run) => [...run].map((digit) => SUPERSCRIPTS.indexOf(digit)).join('');
/** A stated answer as a student types it into the math editor: x² is x^2, − is -. */
const typed = (value) => ascii(value).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^${powerOf(run)}`);
const prepare = (expression, functions) => {
  let out = ascii(expression).replace(/÷/g, '/').replace(/[×·]/g, '*').replace(/\|([^|]+)\|/g, 'abs($1)');
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^(${powerOf(run)})`).replace(/\^\((\d+)\)(?=[a-z(])/g, '^($1)*');
  out = out.replace(/\b([a-z]{2,})\b/g, (word) => ([...word].every((letter) => VARIABLES.includes(letter)) ? [...word].join('*') : word));
  out = out.replace(/\b([a-z])\s*\(/g, (match, letter) => (functions.includes(letter) ? match : `${letter}*(`));
  return out;
};
const scopesFor = (variables) => variables.reduce((scopes, name) => scopes.flatMap((scope) => SAMPLES[name].map((value) => ({ ...scope, [name]: value }))), [{}]);
/** Every side of the claim is the same value at every scope: given ones, or every sampled value of its letters. */
const claimHolds = (claim, { define = [], at = null } = {}) => {
  const functions = define.map((definition) => /^([A-Za-z])\(/.exec(definition)[1]);
  const sides = claim.split('=').map((side) => prepare(side, functions));
  const used = VARIABLES.filter((name) => sides.some((side) => new RegExp(`(^|[^a-z])${name}([^a-z(]|$)`).test(side)));
  return (at || scopesFor(used)).every((values) => {
    const scope = new Map();
    define.forEach((definition) => math.evaluate(definition, scope));
    Object.entries(values).forEach(([name, value]) => scope.set(name, F(value)));
    const results = sides.map((side) => math.evaluate(side, scope));
    return results.every((value) => math.equal(value, results[0]));
  });
};

/* ------------------------------------------------------------ the items, as a student meets them */

const L3 = 'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json';
const L3_HONORS = 'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines_Honors.json';
const L2 = 'teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json';
const DOL1 = 'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json';

/*
 * What a figure's step reads off its graph, held to the graph drawn: every
 * point it names is on it, "rising 2 for each 1 across" is its slope, "its
 * height doubles" its ratio over one step, and "a straight line" is said of a
 * line only.
 */
const RATIO_WORDS = Object.freeze({ doubles: '2', triples: '3', halves: '1/2', 'is divided by 4': '1/4' });
const checkGraphFigure = (step, model, label) => {
  const at = (x) => math.evaluate(model, { x: F(x) });
  for (const [, x, y] of step.matchAll(/\((−?[\d.]+), (−?[\d.]+)\)/g)) assert.ok(math.equal(at(x), F(y)), `${label}: (${x}, ${y}) is on the graph`);
  const straight = math.equal(math.subtract(at(2), at(1)), math.subtract(at(1), at(0)));
  assert.equal(/straight line/.test(step), straight, `${label}: "a straight line" only of a line`);
  const move = /(rising|falling) (\d+) for each 1 across/.exec(step);
  if (move) assert.ok(math.equal(math.subtract(at(1), at(0)), F(move[1] === 'rising' ? move[2] : `-${move[2]}`)), `${label}: ${move[0]}`);
  const ratio = Object.keys(RATIO_WORDS).find((word) => step.includes(`height ${word}`));
  if (ratio) assert.ok(math.equal(math.divide(at(1), at(0)), F(RATIO_WORDS[ratio])), `${label}: its height ${ratio}`);
  assert.ok(move || ratio || straight === false, `${label}: the step reads the graph`);
};
// A relation's reading, held to its points: the inputs it lists, an input it
// says comes twice with the outputs it names, two inputs sharing an output.
// (A stored copy holds each point as { x, y }: Pre-Flight's Firestore-safe repair.)
const checkPointsFigure = (step, stored, label) => {
  const points = stored.map((point) => (Array.isArray(point) ? point : [point.x, point.y]));
  const number = (value) => Number(ascii(value));
  const inputs = /the inputs ([−\d, and]+?), all different/.exec(step);
  if (inputs) {
    const listed = inputs[1].split(/, | and /).map(number);
    assert.deepEqual(listed, points.map(([x]) => x), `${label}: its inputs`);
    assert.equal(new Set(listed).size, listed.length, `${label}: all different`);
  }
  const twice = /the input (−?\d+) twice, with the outputs (−?\d+) and (−?\d+)/.exec(step);
  if (twice) {
    const outputs = points.filter(([x]) => x === number(twice[1])).map(([, y]) => y);
    assert.deepEqual(outputs, [number(twice[2]), number(twice[3])], `${label}: the input ${twice[1]}`);
  }
  const shared = /(−?\d+) and (−?\d+) share the output (−?\d+)/.exec(step);
  if (shared) [shared[1], shared[2]].forEach((x) => assert.ok(points.some((point) => point[0] === number(x) && point[1] === number(shared[3])), `${label}: (${x}, ${shared[3]})`));
  assert.ok(inputs || twice, `${label}: the step reads the relation's inputs`);
};
const figureStage = (question) => readComposedQuestion(question).workflow[0];

// As the inventory resolves them: the import compiler's questions.
const asInventory = (path) => parseAssignmentBlueprintText(read(path)).questions;
// As a student's device gets them: imported through Pre-Flight, stored, then generated by QuestionEngine.
const asDevice = (path) => {
  const parsed = parseAssignmentBlueprintText(read(path));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  return getStoredAssignmentQuestions({ id: 'k-steps-lesson', ...canonicalV5PersistencePatch(model.assignmentV5) })
    .map((stored) => normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null)));
};
// The item as the lesson file holds it: by its id, or, in a file whose items
// carry none (the compiler names them by place), by its section and prompt.
const authoredIn = (path, item) => JSON.parse(read(path)).sections
  .filter((section) => !item.raw || section.id === item.raw.sectionId)
  .flatMap((section) => section.questions)
  .find((question) => (item.raw ? question.prompt === item.raw.prompt : question.questionId === item.questionId));

const TURNS = Object.freeze({
  '90° counterclockwise': { rule: '(−y, x)', turn: ([x, y]) => [-y, x], key: 'b90' },
  '180°': { rule: '(−x, −y)', turn: ([x, y]) => [-x, -y], key: 'b180' },
  '270° counterclockwise': { rule: '(y, −x)', turn: ([x, y]) => [y, -x], key: 'b270' },
});
const shownNumber = (value) => {
  const fraction = math.fraction(value);
  return math.format(fraction, { fraction: 'ratio' }).replace(/\/1$/, '').replace('-', '−');
};
const pointText = ([x, y]) => `(${shownNumber(x)}, ${shownNumber(y)})`;
const stepOf = (review, at) => (at === 'headline' ? review.headline : at === 'summary' ? review.answerSummary : review.reasoning[at]);

/*
 * Each item: the step that states each part's answer, and the words it states
 * it in (a sort: each figure's category; a table: each cell); its own
 * functions, as its prompt defines them; every "=" its review writes, as a
 * claim checked here (at given values, or at every sampled value) or as a
 * given it quotes; what its summary states; and anything else to check that
 * only this item says.
 */
const ITEMS = Object.freeze([
  {
    files: [L3, L3_HONORS],
    questionId: 'l3-wu-2',
    parts: { ab: [0, '5/8'], ab90: [1, '−8/5'], ab180: [2, '5/8'], ab270: [3, '−8/5'], pattern90: [4, 'the negative reciprocal'], pattern180: [5, 'the same'] },
    claims: [
      [0, '(5 − 0) ÷ (8 − 0) = 5/8'],
      [1, '(8 − 0) ÷ (−5 − 0) = −8/5'],
      [2, '(−5 − 0) ÷ (−8 − 0) = 5/8'],
      [3, '(−8 − 0) ÷ (5 − 0) = −8/5'],
      [4, '(5/8) × (−8/5) = −1'],
    ],
    summary: [
      ['AB and A″B″ have slope 5/8', ['ab', 'ab180']],
      ['A′B′ and A‴B‴ have slope −8/5', ['ab90', 'ab270']],
      ['gives the negative reciprocal', ['pattern90']],
      ['keeps the same slope', ['pattern180']],
    ],
    /*
     * The points are the warm-up's: A(0, 0) and B(8, 5) as its prompt states
     * them, and each image the turn's own rule gives, which is the warm-up's key
     * for that turn. Each slope is rise over run from A to that point.
     */
    check: ({ path, review }) => {
      const warmUp = asInventory(path).find((question) => question.questionId === 'l3-wu-1');
      assert.match(warmUp.prompt, /A\(0, 0\) and B\(8, 5\)/, 'the warm-up before it shows A and B');
      const B = [8, 5];
      assert.ok(review.reasoning[0].includes(`A(0, 0) to B${pointText(B)}`), 'AB is the warm-up\'s segment');
      const slopeFrom = ([x, y]) => `(${shownNumber(y)} − 0) ÷ (${shownNumber(x)} − 0)`;
      assert.ok(review.reasoning[0].includes(slopeFrom(B)), 'AB\'s slope is rise over run to B');
      Object.entries(TURNS).forEach(([name, { rule, turn, key }], index) => {
        const step = review.reasoning[index + 1];
        const image = turn(B);
        assert.ok(step.includes(`a ${name} turn about the origin sends (x, y) to ${rule}`), `${name}: the turn's rule (${step})`);
        assert.match(step, new RegExp(`so B\\(8, 5\\) goes to B[′″‴]${pointText(image).replace(/[()]/g, '\\$&')}\\.`), `${name}: B goes to ${pointText(image)}`);
        const warmUpKey = warmUp.answerFields.find((field) => field.id === key).answer;
        assert.deepEqual(warmUpKey.replace(/[()\s]/g, '').split(',').map(Number), image, `${name}: the warm-up's own key is that image`);
        assert.ok(step.includes(slopeFrom(image)), `${name}: the slope is rise over run to ${pointText(image)}`);
      });
      // The pattern: 5/8 flipped and its sign changed is the 90° and 270° slope.
      const flip = /flip (\S+) to (\S+) and change its sign, and you get (\S+), the slope of A′B′ and of A‴B‴/.exec(review.reasoning[4]);
      assert.ok(flip, review.reasoning[4]);
      assert.ok(math.equal(F(flip[2]), math.divide(1, F(flip[1]))), 'a flip');
      assert.ok(math.equal(F(flip[3].replace(/,$/, '')), math.unaryMinus(F(flip[2]))), 'a sign change');
      assert.ok(math.equal(F(flip[1]), F('5/8')) && math.equal(F(flip[3].replace(/,$/, '')), F('-8/5')), 'from AB\'s slope to A′B′\'s');
    },
  },
  {
    files: [L2],
    questionId: 'l2-wu-2',
    parts: { domain: [0, 'All real numbers'], range: [1, 'All real numbers'], xint: [2, '(8/3, 0)'], yint: [3, '(0, −8)'], slope: [4, '3'], behavior: [5, 'Increasing'] },
    define: ['g(x) = 3x - 8'],
    givens: [['headline', 'g(x) = 3x − 8'], [0, 'g(x) = 3x − 8'], [4, 'g(x) = 3x − 8']],
    claims: [[2, '0 = 3x − 8', [{ x: '8/3' }]], [2, '3x = 8', [{ x: '8/3' }]], [2, 'x = 8/3', [{ x: '8/3' }]], [3, 'g(0) = 3(0) − 8 = −8']],
    summary: [['x-intercept (8/3, 0)', ['xint']], ['y-intercept (0, −8)', ['yint']], ['slope 3', ['slope']]],
  },
  {
    files: [L2],
    questionId: 'l2-wu-3',
    parts: { domain: [0, 'All real numbers'], range: [1, 'All real numbers'], xint: [2, '(15/2, 0)'], yint: [3, '(0, 5)'], slope: [4, '−2/3'], behavior: [5, 'Decreasing'] },
    define: ['h(x) = -(2/3)x + 5'],
    givens: [['headline', 'h(x) = −(2/3)x + 5'], [0, 'h(x) = −(2/3)x + 5'], [4, 'h(x) = −(2/3)x + 5']],
    claims: [
      [2, '0 = −(2/3)x + 5', [{ x: '15/2' }]], [2, '0 = −2x + 15', [{ x: '15/2' }]], [2, '2x = 15', [{ x: '15/2' }]], [2, 'x = 15/2', [{ x: '15/2' }]],
      [3, 'h(0) = −(2/3)(0) + 5 = 5'],
    ],
    summary: [['x-intercept (15/2, 0)', ['xint']], ['y-intercept (0, 5)', ['yint']], ['slope −2/3', ['slope']]],
  },
  {
    files: [L2],
    questionId: 'l2-cw-3',
    parts: { hInputs: [0, 'Input values (x)'], vOutputs: [1, 'Output values (y)'], tTerms: [2, 'f(x + 3)'], wTerms: [3, 'f(x) + 3'], tSimplified: [4, 'x + 3'], compare: [5, 'They are the same line.'] },
    define: ['f(x) = x', 't(x) = f(x + 3)', 'w(x) = f(x) + 3'],
    givens: [[4, 'f(x) = x'], ['summary', 'f(x) = x']],
    claims: [[4, 'f(x + 3) = x + 3'], [4, 't(x) = x + 3'], [5, 'w(x) = f(x) + 3 = x + 3']],
    // The point the student plotted from (0, 0) in each of the two graphs before (l2-cw-1, l2-cw-2).
    check: ({ path, review }) => {
      const questions = asInventory(path);
      const plotted = (id) => questions.find((question) => question.questionId === id);
      // A translation by h and k sends (0, 0) to (h, k).
      const imageOfOrigin = (id) => { const { h = 0, k = 0 } = plotted(id).function; return [h, k]; };
      assert.ok(plotted('l2-cw-1').sourcePoints.some((point) => point.x === 0 && point.y === 0), '(0, 0) is one of the points the student moved');
      assert.match(plotted('l2-cw-1').prompt, /LEFT 3 units/);
      assert.ok(review.reasoning[0].includes(`the point (0, 0) to ${pointText(imageOfOrigin('l2-cw-1'))}`), review.reasoning[0]);
      assert.match(plotted('l2-cw-2').prompt, /UP 3 units/);
      assert.ok(review.reasoning[1].includes(`(0, 0) to ${pointText(imageOfOrigin('l2-cw-2'))}`), review.reasoning[1]);
    },
  },
  {
    files: [L2],
    questionId: 'l2-cw-5',
    parts: { qTerms: [0, 'j(x) + 4'], rTerms: [1, 'j(x + 4)'], qSimplified: [2, '2x + 3'], rSimplified: [3, '2x + 7'], same: [4, 'No, they are parallel lines.'], upEquivalent: [5, '8'] },
    define: ['j(x) = 2x - 1', 'q(x) = j(x) + 4', 'r(x) = j(x + 4)'],
    givens: [['headline', 'j(x) = 2x − 1']],
    claims: [
      [2, 'j(x) + 4 = (2x − 1) + 4 = 2x + 3'], [3, 'j(x + 4) = 2(x + 4) − 1 = 2x + 8 − 1 = 2x + 7'],
      [4, 'q(x) = 2x + 3'], [4, 'r(x) = 2x + 7'], [5, 'r(x) = 2x + 7 = (2x − 1) + 8 = j(x) + 8'],
      ['summary', 'q(x) = j(x) + 4 = 2x + 3'], ['summary', 'r(x) = j(x + 4) = 2x + 7'],
    ],
  },
  {
    files: [L2],
    questionId: 'l2-cw-6',
    parts: { uSimplified: [0, '2x − 5'], vSimplified: [1, '2x − 3'], same: [2, 'No — they are parallel lines 2 units apart.'], rule: [3, 'Only when the slope is 1'] },
    define: ['j(x) = 2x - 1', 'u(x) = j(x - 2)', 'v(x) = j(x) - 2'],
    claims: [
      [0, 'j(x − 2) = 2(x − 2) − 1 = 2x − 4 − 1 = 2x − 5'], [1, 'j(x) − 2 = (2x − 1) − 2 = 2x − 3'], [2, '−3 − (−5) = 2'],
      [3, 'm(x − n) + b = mx + b − mn'], ['summary', 'u(x) = 2x − 5'], ['summary', 'v(x) = 2x − 3'],
    ],
    // The intercepts the comparison reads are u(0) and v(0).
    check: ({ review }) => {
      assert.ok(review.reasoning[2].includes('u(x) crosses the y-axis at −5 and v(x) at −3'), review.reasoning[2]);
      assert.ok(claimHolds('u(0) = −5', { define: ['j(x) = 2x - 1', 'u(x) = j(x - 2)'] }) && claimHolds('v(0) = −3', { define: ['j(x) = 2x - 1', 'v(x) = j(x) - 2'] }));
    },
  },
  {
    files: [L2],
    questionId: 'l2-cw-9',
    kind: 'table',
    parts: {
      '0:cx': [0, '−8/5'], '1:cx': [1, '−4/5'], '2:cx': [1, '0'], '3:cx': [1, '4/5'], '4:cx': [1, '8/5'],
      '0:dx': [2, '−5/2'], '1:dx': [3, '−5/4'], '2:dx': [3, '0'], '3:dx': [3, '5/4'], '4:dx': [3, '5/2'],
    },
    claims: [
      [0, '(4/5)(−2) = −8/5'], [1, '(4/5)(−1) = −4/5'], [1, '(4/5)(0) = 0'], [1, '(4/5)(1) = 4/5'], [1, '(4/5)(2) = 8/5'],
      [2, '(5/4)(−2) = −5/2'], [3, '(5/4)(−1) = −5/4'], [3, '(5/4)(0) = 0'], [3, '(5/4)(1) = 5/4'], [3, '(5/4)(2) = 5/2'],
    ],
    // Each cell's work starts from its own row of the table, by the factor the prompt gives.
    check: ({ question, review }) => {
      assert.match(question.prompt, /OUTPUT values of f\(x\) = x by a factor of 4\/5\. d\(x\) changes the INPUT values of f\(x\) = x by a factor of 5\/4\./);
      question.table.rows.forEach((row, index) => {
        const where = (column) => review.reasoning[ITEMS.find((item) => item.questionId === 'l2-cw-9').parts[`${index}:${column}`][0]];
        assert.ok(where('cx').includes(`(4/5)(${shownNumber(row.fx)}) = `), `row ${index}: c from f(x) = ${row.fx}`);
        assert.ok(where('dx').includes(`(5/4)(${shownNumber(row.x)}) = `), `row ${index}: d from x = ${row.x}`);
        assert.equal(row.dy, row.fx, `row ${index}: d(x) keeps the output`);
      });
    },
  },
  {
    files: [L2],
    questionId: 'l2-cw-10',
    parts: {
      abSame: [0, 'They are the same line, y = 2x.'], cdSame: [1, 'They are the same line, y = (4/5)x.'], factor: [2, '1/n'],
      twoJ: [3, '4x − 2'], jTwoX: [4, '4x − 1'], holds: [5, 'linear functions whose graphs pass through the origin'],
    },
    define: ['f(x) = x', 'a(x) = 2f(x)', 'c(x) = (4/5)f(x)', 'j(x) = 2x - 1'],
    givens: [['headline', 'f(x) = x'], ['headline', 'j(x) = 2x − 1'], [0, 'y = 2x'], [1, 'y = (4/5)x'], ['summary', 'y = 2x'], ['summary', 'y = (4/5)x']],
    claims: [
      [0, 'a(x) = 2f(x) = 2x'], [0, '2 ÷ 1 = 2'], [1, 'c(x) = (4/5)f(x) = (4/5)x'], [1, '2 ÷ (5/2) = 4/5'], [2, 'n·f(x) = nx'],
      [3, '2·j(x) = 2(2x − 1) = 4x − 2'], [4, 'j(2x) = 2(2x) − 1 = 4x − 1'], [5, '2 × (−1) = −2'],
      ['summary', '2·j(x) = 4x − 2'], ['summary', 'j(2x) = 4x − 1'],
    ],
    // b(x) and d(x) are the graphs the student made: inputs × 1/2 (l2-cw-8) and the table's last row (l2-cw-9).
    check: ({ path, review }) => {
      const questions = asInventory(path);
      const b = questions.find((question) => question.questionId === 'l2-cw-8');
      assert.match(b.prompt, /INPUT values of f\(x\) = x by a factor of 1\/2 to create b\(x\)/);
      assert.equal(b.function.b, 2, 'b(x) = f(2x): (x, y) lands at (x/2, y)');
      assert.ok(review.reasoning[0].includes('(2, 2) lands at (1, 2)'), review.reasoning[0]);
      const table = questions.find((question) => question.questionId === 'l2-cw-9').table;
      assert.equal(table.answers['4:dx'], '5/2');
      assert.equal(table.rows[4].dy, 2);
      assert.ok(review.reasoning[1].includes('d moved (2, 2) to (5/2, 2)'), review.reasoning[1]);
    },
  },
  {
    files: [L2],
    questionId: 'l2-pr-7',
    parts: {
      p1kind: [0, 'Right'], p1amt: [0, '7'], p2kind: [1, 'Vertical stretch'], p2amt: [1, '3'],
      p4kind: [2, 'Horizontal stretch'], p4amt: [2, '2'], p6kind: [3, 'Left'], p6amt: [3, '5'],
    },
    givens: [[0, 'g(x) = f(x − 7)'], [1, 'g(x) = 3f(x)'], [2, 'g(x) = f((1/2)x)'], [3, 'g(x) = f(x + 5)']],
    claims: [
      [0, 'x − 7 = 0', [{ x: '7' }]], [0, 'x = 7', [{ x: '7' }]], [2, '(1/2)x = 1', [{ x: '2' }]], [2, 'x = 2', [{ x: '2' }]],
      [3, 'x + 5 = 0', [{ x: '-5' }]], [3, 'x = −5', [{ x: '-5' }]],
    ],
    // Where each move takes a point of f(x) = x, by the function the student graphed before.
    check: ({ path, review }) => {
      const graphed = (expression) => asInventory(path).find((question) => question.prompt?.includes(`Graph g(x) = ${expression} by plotting`)).function;
      const image = (fn, [x, y]) => [x / (fn.b ?? 1) + (fn.h ?? 0), (fn.a ?? 1) * y + (fn.k ?? 0)];
      assert.ok(review.reasoning[0].includes(`moves to ${pointText(image(graphed('f(x − 7)'), [0, 0]))}`));
      assert.ok(review.reasoning[2].includes(`the point (1, 1) moves to ${pointText(image(graphed('f((1/2)x)'), [1, 1]))}`));
      assert.ok(review.reasoning[3].includes(`moves to ${pointText(image(graphed('f(x + 5)'), [0, 0]))}`));
      assert.equal(graphed('3f(x)').a, 3, 'the vertical factor is 3');
    },
  },
  {
    files: [L2],
    questionId: 'l2-pr-8',
    kind: 'figureMatch',
    parts: { k: [0, 'f(x) + 8'], h: [1, '2f(x)'], g: [2, '(1/2)f(x)'], j: [3, 'f(x − 7)'] },
    givens: [['headline', 'f(x) = x']],
    // Each figure's step reads its slope and an intercept off the graph drawn, and the line it names is that graph.
    check: ({ question, review }) => {
      const [stage] = readComposedQuestion(question).workflow;
      stage.items.forEach((item, index) => {
        const step = review.reasoning[index];
        const name = figureLabel(index, figureNoun(stage));
        assert.ok(step.startsWith(`${name} `), `${name}: ${step}`);
        const line = (x) => math.evaluate(item.graph.model.replace(/\*x/g, '*x'), { x: F(x) });
        const slope = math.subtract(line(1), line(0));
        const intercept = line(0);
        const said = /slope (\S+?)(?: and|:)/.exec(step);
        assert.ok(said && math.equal(F(said[1]), slope), `${name}: slope ${shownNumber(slope)}`);
        if (math.equal(intercept, 0)) assert.match(step, /passes through the origin/, name);
        else if (step.includes('crosses the y-axis at')) assert.ok(math.equal(F(/crosses the y-axis at (\S+?):/.exec(step)[1]), intercept), name);
        else assert.ok(math.equal(F(/crosses the x-axis at (\S+?):/.exec(step)[1]), math.divide(math.unaryMinus(intercept), slope)), name);
        const named = /it is (.+?), /.exec(step)[1];
        assert.ok(['-3', '0', '2', '5'].every((x) => math.equal(math.evaluate(prepare(named, []), { x: F(x) }), line(x))), `${name} is ${named}`);
      });
    },
  },
  {
    files: [L2],
    questionId: 'l2-pr-11',
    parts: { correct: [0, 'No — +3 inside the parentheses moves the line left 3.'], vertical: [1, 'Up 3'], simplified: [2, 'x + 3'] },
    define: ['f(x) = x', 'g(x) = f(x + 3)'],
    givens: [['summary', 'f(x) = x']],
    claims: [
      [0, 'x + 3 = 0', [{ x: '-3' }]], [0, 'x = −3', [{ x: '-3' }]], [1, 'f(x + 3) = x + 3 = f(x) + 3'],
      [2, 'g(x) = f(x + 3) = x + 3'], ['summary', 'g(x) = x + 3'],
    ],
  },
  {
    files: [L2],
    questionId: 'l2-pr-12',
    parts: { gTerms: [0, 'f(x − 4) + 1'], gSimplified: [1, 'x − 3'], hTerms: [2, '3f(x) − 2'], hSimplified: [3, '3x − 2'] },
    define: ['f(x) = x', 'g(x) = f(x - 4) + 1', 'h(x) = 3f(x) - 2'],
    claims: [
      [1, 'g(x) = f(x − 4) + 1 = (x − 4) + 1 = x − 3'], [3, 'h(x) = 3f(x) − 2 = 3x − 2'],
      ['summary', 'g(x) = f(x − 4) + 1 = x − 3'], ['summary', 'h(x) = 3f(x) − 2 = 3x − 2'],
    ],
  },
  {
    files: [L2],
    questionId: 'l2-pr-13',
    parts: { pSimplified: [0, '−x + 4'], sSimplified: [1, '−x + 4'], same: [2, 'They are the same line.'], general: [3, 'A vertical shift of m·n units (up if m·n > 0, down if m·n < 0)'] },
    define: ['j(x) = -x + 6', 'p(x) = j(x + 2)', 's(x) = j(x) - 2'],
    givens: [['headline', 'j(x) = −x + 6']],
    claims: [
      [0, 'p(x) = j(x + 2) = −(x + 2) + 6 = −x − 2 + 6 = −x + 4'], [1, 's(x) = j(x) − 2 = (−x + 6) − 2 = −x + 4'],
      [3, 'm(x + n) + b = mx + b + mn'],
    ],
  },
  {
    files: [L2],
    questionId: 'l2-dol-2',
    parts: { describe: [0, 'Right 2'], simplified: [1, '3x − 5'], vertical: [2, 'Down 6'] },
    define: ['j(x) = 3x + 1', 'r(x) = j(x - 2)'],
    givens: [['headline', 'j(x) = 3x + 1']],
    claims: [
      [0, 'x − 2 = 0', [{ x: '2' }]], [0, 'x = 2', [{ x: '2' }]], [1, 'r(x) = j(x − 2) = 3(x − 2) + 1 = 3x − 6 + 1 = 3x − 5'],
      [2, '3x − 5 = (3x + 1) − 6 = j(x) − 6'], ['summary', 'r(x) = 3x − 5'],
    ],
  },
  {
    files: [L2],
    questionId: 'l2-dol-3',
    parts: { changes: [0, 'input values (x-coordinates)'], sameAs4f: [1, 'f(4x)'], leftN: [2, 'moving it up n units'] },
    define: ['f(x) = x'],
    givens: [['headline', 'f(x) = x'], [1, 'f(x) = x']],
    claims: [[1, '4f(x) = 4x'], [1, 'f(4x) = 4x'], [2, 'f(x + n) = x + n = f(x) + n']],
  },
  // Algebra I District DOL #1 review: its items carry no ids, so each is found by section and prompt.
  {
    files: [DOL1],
    questionId: 'q_section-1_1_2',
    raw: { sectionId: 'section-1', prompt: 'Sort each graph into the function family it belongs to.' },
    kind: 'figureMatch',
    parts: { w2a: [0, 'Linear'], w2b: [1, 'Exponential'], w2c: [2, 'Quadratic'], w2d: [3, 'Linear'] },
    check: ({ question, review, source }) => {
      figureStage(question).items.forEach((figure, index) => checkGraphFigure(review.reasoning[index], figure.graph.model, `${source} figure ${index + 1}`));
      assert.match(review.reasoning[2], /U-shaped curve that turns at its lowest point, \(0, −4\)/);
    },
  },
  {
    files: [DOL1],
    questionId: 'q_section-1_1_3',
    raw: { sectionId: 'section-1', prompt: 'Which ordered pair is the vertex of the graph shown?' },
    kind: 'choice',
    parts: { choice: [2, '(2, -4)'] },
    claims: [[1, '(0 + 4) ÷ 2 = 2']],
    // The parabola drawn: it crosses the x-axis where the step says, and turns 4 below it, halfway between.
    check: ({ question, review }) => {
      const y = (x) => math.evaluate(figureStage(question).previewOnGraph.graph.model, { x: F(x) });
      assert.ok(review.reasoning[1].includes('crosses the x-axis at (0, 0) and (4, 0)'), review.reasoning[1]);
      assert.ok(math.equal(y(0), 0) && math.equal(y(4), 0), 'the graph crosses the x-axis at 0 and 4');
      assert.ok(math.larger(y(1), y(2)) && math.larger(y(3), y(2)) && review.reasoning[0].includes('opens upward'), 'it opens upward and is lowest at x = 2');
      assert.ok(review.reasoning[1].includes(`where it is ${shownNumber(math.unaryMinus(y(2)))} units below the x-axis`), 'its lowest point is 4 below the x-axis');
    },
  },
  {
    files: [DOL1],
    questionId: 'q_section-1_1_4',
    raw: { sectionId: 'section-1', prompt: 'Sort each exponential graph by whether it shows growth or decay.' },
    kind: 'figureMatch',
    parts: {
      w4a: [0, 'Exponential growth'], w4b: [1, 'Exponential decay'], w4c: [2, 'Exponential growth'],
      w4d: [3, 'Exponential decay'], w4e: [4, 'Exponential growth'], w4f: [5, 'Exponential decay'],
    },
    check: ({ question, review, source }) => {
      figureStage(question).items.forEach((figure, index) => {
        const step = review.reasoning[index];
        checkGraphFigure(step, figure.graph.model, `${source} figure ${index + 1}`);
        assert.ok(/so it rises\. Exponential growth\.$|so it falls\. Exponential decay\.$/.test(step), step);
      });
    },
  },
  {
    files: [DOL1],
    questionId: 'q_section-2_2_12',
    raw: { sectionId: 'section-2', prompt: 'An arithmetic sequence starts at 7 and each term is 4 more than the term before it. Find the second, third and fifth terms.' },
    parts: { a2: [0, '11'], a3: [1, '15'], a5: [2, '23'] },
    define: ['a(n) = 7 + 4(n - 1)'],
    claims: [
      [0, '7 + 4 = 11'], [1, '11 + 4 = 15'], [2, 'a(4) = 15 + 4 = 19'], [2, 'a(5) = 19 + 4 = 23'],
      ['summary', 'a(2) = 11'], ['summary', 'a(3) = 15'], ['summary', 'a(5) = 23'],
    ],
    // The sequence is the one the prompt states, as the item stores it.
    check: ({ question }) => assert.deepEqual(question.sequence, { kind: 'arithmetic', first: 7, commonDifference: 4 }),
  },
  {
    files: [DOL1],
    questionId: 'q_section-3_3_7',
    raw: { sectionId: 'section-3', prompt: 'Sort each relation by whether it is a function.' },
    kind: 'figureMatch',
    parts: { p7a: [0, 'Is a function'], p7b: [1, 'Not a function'], p7c: [2, 'Is a function'], p7d: [3, 'Not a function'] },
    check: ({ question, review, source }) => {
      figureStage(question).items.forEach((figure, index) => checkPointsFigure(review.reasoning[index], figure.graph.points, `${source} figure ${index + 1}`));
    },
  },
  {
    files: [DOL1],
    questionId: 'q_section-3_3_8',
    raw: { sectionId: 'section-3', prompt: 'A geometric sequence starts at 3 and each term is twice the term before it. Find the second, third and fifth terms.' },
    parts: { g2: [0, '6'], g3: [1, '12'], g5: [2, '48'] },
    define: ['g(n) = 3 * 2^(n - 1)'],
    claims: [
      [0, '3 × 2 = 6'], [1, '6 × 2 = 12'], [2, 'g(4) = 12 × 2 = 24'], [2, 'g(5) = 24 × 2 = 48'],
      ['summary', 'g(2) = 6'], ['summary', 'g(3) = 12'], ['summary', 'g(5) = 48'],
    ],
    check: ({ question }) => assert.deepEqual(question.sequence, { kind: 'geometric', first: 3, commonRatio: 2 }),
  },
  {
    files: [DOL1],
    questionId: 'q_section-4_4_8',
    raw: { sectionId: 'section-4', prompt: 'A sequence starts at 20 and each term is 3 less than the term before it. Find the fourth term.' },
    parts: { a4: [0, '11'] },
    define: ['a(n) = 20 - 3(n - 1)'],
    claims: [[0, 'a(2) = 20 − 3 = 17'], [0, 'a(3) = 17 − 3 = 14'], [0, 'a(4) = 14 − 3 = 11'], ['summary', 'a(4) = 11']],
    check: ({ question }) => assert.deepEqual(question.sequence, { kind: 'arithmetic', first: 20, commonDifference: -3 }),
  },
]);

const everyCopy = ITEMS.flatMap((item) => item.files.flatMap((path) => [['inventory', asInventory(path)], ['device', asDevice(path)]]
  .map(([how, questions]) => ({ item, path, how, source: `${path.split('/').pop()}#${item.questionId} (${how})`, question: questions.find((question) => question.questionId === item.questionId) }))));

const reviewOf = (question) => buildClosedQuestionReview({ question, isToolQuestion: false, wasCorrect: false, legacyContent: () => ({ hasContent: true }) });

/** Everything the item shows: its prompt, every label, every choice, every category. */
const visibleText = (question) => {
  const composed = readComposedQuestion(question);
  return [
    question.prompt,
    ...(question.answerFields || []).flatMap((field) => [field.label, ...(field.options || [])]),
    ...(composed?.workflow || []).flatMap((stage) => [stage.prompt, ...(stage.categories || []).map((category) => category.label)]),
  ].map(text).join('\n');
};

/* ------------------------------------------------------------ the tests */

test('the closed review shows each item\'s own worked steps, in every copy, whole', () => {
  assert.equal(everyCopy.length, ITEMS.reduce((sum, item) => sum + item.files.length * 2, 0));
  assert.equal(ITEMS.filter((item) => item.files.includes(L2)).length, 14, 'the 14 Lesson 2 items');
  assert.equal(ITEMS.filter((item) => item.files.includes(DOL1)).length, 7, 'seven of the DOL #1 review');
  for (const { item, path, source, question } of everyCopy) {
    assert.ok(question, `${source}: found`);
    const authored = authoredIn(path, item).solutionReview;
    assert.ok(authored, `${source}: the lesson file carries the review`);
    const review = reviewOf(question);
    assert.equal(review.hasSteps, true, source);
    assert.equal(review.fromFamily, false, `${source}: the item's own steps, not a family's`);
    assert.equal(review.fromBuilder, false, source);
    assert.deepEqual(review.authored.reasoning, authored.reasoning, source);
    assert.equal(review.authored.headline, authored.headline, source);
    assert.equal(review.authored.answerSummary, authored.answerSummary, source);
    // Nothing is cut short: the support bundle keeps every word.
    assert.deepEqual(buildPrivateSupport(question).solutionReview, {
      headline: authored.headline, reasoning: authored.reasoning, commonError: null, connection: null, answerSummary: authored.answerSummary,
    }, `${source}: within the support bundle's limits`);
  }
});

/** Each part, its stated words, and the choices it must not also name. */
const partsOf = (item, question) => {
  if (item.kind === 'table') return tableEditableKeys(question).map((id) => ({ id, options: [] }));
  if (item.kind === 'figureMatch') {
    const [stage] = readComposedQuestion(question).workflow;
    return stage.items.map((figure) => ({ id: figure.id, options: stage.categories.map((category) => category.label) }));
  }
  if (item.kind === 'choice') {
    const [stage] = readComposedQuestion(question).workflow;
    return [{ id: stage.id, options: stage.choices.map((choice) => text(choice.label)) }];
  }
  return question.answerFields.map((field) => ({ id: field.id, label: text(field.label), options: (field.options || []).map(text) }));
};
const gradeStated = (item, question, stated) => {
  if (item.kind === 'table') return gradeTableResponse(question, stated);
  if (item.kind === 'figureMatch') {
    const [stage] = readComposedQuestion(question).workflow;
    const placements = Object.fromEntries(Object.entries(stated).map(([id, label]) => [id, stage.categories.find((category) => category.label === label)?.id]));
    return gradeComposedWorkflowWork(question, { responses: { [stage.id]: buildFigureMatchResponse(stage, placements) } });
  }
  if (item.kind === 'choice') {
    const [stage] = readComposedQuestion(question).workflow;
    return gradeComposedWorkflowWork(question, { responses: { [stage.id]: stage.choices.find((choice) => text(choice.label) === stated[stage.id])?.id } });
  }
  // A typed part as the student types it (x² is x^2); a choice by its own words.
  const choices = new Set(question.answerFields.filter((field) => (field.options || []).length).map((field) => field.id));
  return gradeMultiAnswerResponse(question, Object.fromEntries(Object.entries(stated).map(([id, words]) => [id, choices.has(id) ? words : typed(words)])));
};

/*
 * Where a sort's summary puts each figure: "Figure 1: f(x) + 8" pairs, or
 * groups, "Monomial: cards 1, 2 and 3". Returns the category label it gives
 * each figure, by position.
 */
const summaryPlacements = (summary, stage) => {
  const noun = figureNoun(stage);
  const placed = {};
  stage.categories.forEach(({ label }) => {
    stage.items.forEach((_, index) => {
      if (summary.includes(`${figureLabel(index, noun)}: ${label}`)) placed[index] = label;
    });
    for (const match of summary.matchAll(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (?:cards?|figures?) ([\\d, and]+)`, 'gi'))) {
      match[1].split(/, | and /).map((number) => Number(number.trim())).filter(Boolean).forEach((number) => { placed[number - 1] = label; });
    }
  });
  return placed;
};

test('each part\'s answer is stated in its own step, naming no other choice, and the part\'s own grader marks every one right', () => {
  for (const { item, source, question } of everyCopy) {
    const review = reviewOf(question).authored;
    const parts = partsOf(item, question);
    assert.deepEqual(Object.keys(item.parts).sort(), parts.map((part) => part.id).sort(), `${source}: every part, and only those`);
    const stated = {};
    for (const part of parts) {
      const [stepIndex, words] = item.parts[part.id];
      const step = review.reasoning[stepIndex];
      if (part.options.length) {
        assert.ok(part.options.includes(words), `${source}: "${words}" is one of ${part.id}'s choices`);
        assert.ok(lower(step).includes(lower(words)), `${source}: step ${stepIndex + 1} states "${words}" for ${part.id}`);
        // A short choice ("Up", "n") is part of too many words to look for, and
        // a step's lead that is its part's own label ("Increasing or decreasing:") names none.
        const lead = step.split(': ')[0];
        const body = part.label && lower(part.label).replace(/[?…\s]+$/, '').startsWith(lower(lead)) ? step.slice(lead.length) : step;
        part.options.filter((option) => option !== words && option.length > 3 && !lower(words).includes(lower(option)))
          .forEach((option) => assert.ok(!lower(body).includes(lower(option)), `${source}: step ${stepIndex + 1} also names "${option}"`));
      } else {
        assert.ok(step.includes(words), `${source}: step ${stepIndex + 1} states "${words}" for ${part.id}`);
      }
      stated[part.id] = words;
    }
    const grade = gradeStated(item, question, stated);
    assert.equal(grade.isCorrect, true, `${source}: ${JSON.stringify(grade.parts?.filter((part) => !part.isCorrect) ?? grade)}`);
    // The summary states the same answers.
    for (const [phrase, ids] of item.summary || []) {
      assert.ok(review.answerSummary.includes(phrase), `${source}: the summary says "${phrase}"`);
      ids.forEach((id) => {
        const number = /(−?\d+\/\d+|−?\d+)$/.exec(phrase);
        if (number && !/[a-z]\)?$/i.test(stated[id])) assert.ok(math.equal(F(number[1]), F(stated[id])), `${source}: "${phrase}" is ${id}'s ${stated[id]}`);
        else assert.ok(phrase.includes(stated[id]), `${source}: "${phrase}" is ${id}'s "${stated[id]}"`);
      });
    }
    // A sort's summary puts each figure in its own category, and each figure's
    // step names it as the screen does ("Figure 2", "Card 10"), quoting a card's
    // words exactly where it quotes them ("Card 1 (5)", "Card 1, (2 × 3) · (3 × 4):").
    if (item.kind === 'figureMatch') {
      const [stage] = readComposedQuestion(question).workflow;
      const placed = summaryPlacements(review.answerSummary, stage);
      stage.items.forEach((figure, index) => {
        assert.equal(placed[index], stated[figure.id], `${source}: the summary places ${figure.id}`);
        const name = figureLabel(index, figureNoun(stage));
        const step = review.reasoning[item.parts[figure.id][0]];
        assert.match(step, new RegExp(`\\b${name}\\b(?!\\d)`), `${source}: ${figure.id}'s step names ${name}`);
        if (item.quote === 'parens') assert.ok(step.includes(`${name} (${figure.text})`), `${source}: ${name} is "${figure.text}"`);
        if (item.quote === 'comma') assert.ok(step.includes(`${name}, ${figure.text}: `), `${source}: ${name} is "${figure.text}"`);
      });
    }
  }
});

test('every "=" the review writes is a checked claim or a given the item shows, and the numbers are the student\'s', () => {
  let checked = 0;
  for (const entry of everyCopy) {
    const { item, source, question } = entry;
    const review = reviewOf(question).authored;
    const shown = visibleText(question);
    const locations = ['headline', ...review.reasoning.map((_, index) => index), 'summary'];
    for (const at of locations) {
      const line = stepOf(review, at);
      const claims = (item.claims || []).filter(([where]) => where === at);
      const givens = (item.givens || []).filter(([where]) => where === at);
      claims.forEach(([, claim, values]) => {
        assert.ok(line.includes(claim), `${source}: ${at} writes ${claim}`);
        assert.ok(claimHolds(claim, { define: item.define || [], at: values || null }), `${source}: ${claim}`);
        checked += 1;
      });
      givens.forEach(([, given]) => {
        assert.ok(line.includes(given), `${source}: ${at} quotes ${given}`);
        assert.ok(shown.includes(given), `${source}: "${given}" is what the item shows`);
      });
      const written = count(line, '=');
      const accounted = [...claims, ...givens].reduce((sum, [, piece]) => sum + count(piece, '='), 0);
      assert.equal(written, accounted, `${source}: every "=" in ${at} is checked: ${line}`);
    }
    item.check?.({ ...entry, review });
  }
  assert.ok(checked >= 150, `${checked} claims checked`);
});

test('the words are plain and short, and nothing changes while the item is open', () => {
  for (const { item, path, source, question } of everyCopy) {
    const authored = authoredIn(path, item).solutionReview;
    for (const line of [authored.headline, ...authored.reasoning, authored.answerSummary]) {
      assert.doesNotMatch(line, /NaN|undefined|\bnull\b|Infinity|\[object|\{\{|\$/, `${source}: ${line}`);
    }
    // A common error's mistake half is said on a miss (FB04, attemptFeedbackPlan.js):
    // these reviews name none, so an open item's feedback is what it was.
    assert.equal(authored.commonError, undefined, `${source}: no common error`);
    const without = { ...question };
    delete without.solutionReview;
    assert.deepEqual(buildQuestionHints(question), buildQuestionHints(without), `${source}: the same hints`);
    assert.deepEqual(backUpStepFor(question), backUpStepFor(without), `${source}: the same back-up step`);
  }
});
