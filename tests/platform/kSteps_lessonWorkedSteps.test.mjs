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
 *   DOL #1    The Algebra I DOL #1 technology review's three sorts of graphs and
 *             relations, its vertex choice and its three sequences: each figure
 *             read off the graph or points drawn, each term from the one before;
 *             and its three relationship models that ask only discrete or
 *             continuous, the domain and the range: each read from the scenario.
 *   Matrices  Algebra II Honors Module 1, Topic 2 Lesson 3 (solving systems with
 *             matrices): the Getting Started arrays (l3m-wu-1), multiplicative
 *             inverses (l3m-wu-3), the sort of products by size (l3m-cw-4) and
 *             the entry and sizes of AB, CD and DC (l3m-pr-12-ccmr). Each count
 *             is read from the arrays shown, each size from its card or prompt.
 *   Polynomials  Algebra II Honors Module 2, Operations on Polynomials: its two
 *             sorts, by number of terms (opp-cw-1) and always, sometimes or
 *             never (opp-pr-15). Each card is read from its own expression, and
 *             each example's result is checked for what the step says it is.
 *             Its DOL (opp-dol-3; dp-dol-1 in Dividing Polynomials) is an exit
 *             ticket its lessons give no worked solution, and is left as it is.
 *   Models    The seven-step relationship models (input and output, function,
 *             table, discrete or continuous, graph, domain, range) of Algebra II
 *             Honors Module 1 Lesson 1 Day 2 (chocolate bars, a shower head) and
 *             the Algebra I DOL #3 review's popcorn item, Regular and Honors (the
 *             Honors file rebuilt by scripts/content/build-algebra1-dol3-honors.mjs),
 *             which keeps the common error it had. Every step, the graph
 *             included, is marked by the composed grader as the server marks a
 *             student's work: the table as its rows, the graph as its points
 *             placed and, where continuous, one line drawn along the function.
 *   |x|       Algebra II Honors Module 1: the parent function |x| in the ALEKS
 *             bridge (vertex, domain, range) and in the Lesson 2 Day 2 warm-up
 *             (family, vertex), which the functionFeatures family leaves (it
 *             claims no vertex item), written in that family's voice: each
 *             attribute read from |x| itself, then "So:" and every answer.
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
 *     (FB04 says a common error's mistake half on a miss), or, in Operations on
 *     Polynomials, whose every review names one, a common error with no ";"
 *     that FB04 never says, whatever the student sends; and the hints and the
 *     back-up step are the same with or without the review;
 *   - every line is shown as words: a dollar sign is money ("$25 grocery
 *     cards"), never the start of mathematics (MathText's own split).
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
 *     table cell changed, an unchecked "=" added → each the matching check;
 *   - Matrices: a total's sum changed ("= 322" to "= 323"), a fewest-cards
 *     group read from the wrong month, a card sent to the wrong size, the
 *     inner sizes misread, "$20 cards, 230" written "$20 is 230" (which the
 *     screen reads as mathematics) → each the matching check;
 *   - Polynomials: a card under the wrong count, a radical called a
 *     denominator, a card misquoted, a verdict changed, an example's product
 *     changed, a term count or a degree misread, a "sometimes" with one
 *     example, a common error written with ";", one removed, one with an "=" →
 *     each the matching check;
 *   - |x|: an absolute value worked wrong ("|−3| = 3" to "|−3| = −3"), a step
 *     naming another choice, a part's step not led by its label, the "So:"
 *     line disagreeing with a part → each the matching check;
 *   - the DOL #1 models: a domain's end changed, a model called the other
 *     continuity, a step naming it, a weight worked wrong, the claim left
 *     unanswered → each the matching check;
 *   - the seven-step models: the roles swapped, a table row worked wrong, a
 *     graph point off its row, a discrete graph connected, a domain naming
 *     another choice, the kept common error changed, the Honors copy not
 *     rebuilt → each the matching check.
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
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';
import { commonErrorMiss } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { resolveComposedWorkflow } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { resolveWorkflowGraphStages, workflowTableArtifact } from '../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';
import { GRAPH_WORKSPACE_VIEWBOX, graphWorkspaceModelFor } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';

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
const VARIABLES = ['x', 'y', 'm', 'n', 'b', 't'];
const SAMPLES = Object.freeze({ x: ['-3', '0', '1/2', '2', '7'], y: ['-2', '1/3', '4'], m: ['-2', '1/3', '3'], n: ['-1', '2', '5/2'], b: ['-4', '0', '3/5'], t: ['0', '1/2', '5/2', '4'] });
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
const MATRICES = 'teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json';
// A matrix's rows as numbers. (A stored copy holds each row as { cells }: Firestore holds no array of arrays.)
const matrixRows = (matrix) => matrix.rows.map((row) => (Array.isArray(row) ? row : row.cells));
const POLY_OPS = 'teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json';
// An expression's terms as printed: the parts joined by " + " or " − " outside parentheses.
const termsOf = (expression) => {
  let depth = 0;
  return [...expression].reduce((terms, character, index) => {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    return terms + (depth === 0 && /[+−]/.test(character) && expression[index - 1] === ' ' && expression[index + 1] === ' ' ? 1 : 0);
  }, 1);
};
const L1_DAY2 = 'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json';
const DOL3 = 'teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json';
const DOL3_HONORS = 'teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review_Honors.json';
const lowerFirst = (value) => (value ? `${value[0].toLowerCase()}${value.slice(1)}` : value);
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const numeric = create(all);
// A stated function rule, "V(t) = 1.8t", as a function of its variable.
const ruleOf = (equation) => {
  const [, variable, rhs] = /^[A-Za-z]\(([a-z])\) = (.+)$/.exec(equation);
  return (value) => numeric.evaluate(rhs, { [variable]: value });
};
// A freehand stroke along y = rule(x), from x0 to the window's right edge, in the workspace's viewBox units.
const sketchAlong = (view, rule, x0, samples = 60) => Array.from({ length: samples + 1 }, (_, i) => x0 + ((view.xMax - x0) * i) / samples)
  .map((x) => [x, rule(x)])
  .filter(([, y]) => y >= view.yMin && y <= view.yMax)
  .map(([x, y]) => [
    GRAPH_WORKSPACE_VIEWBOX.padding + ((x - view.xMin) / (view.xMax - view.xMin)) * (GRAPH_WORKSPACE_VIEWBOX.width - 2 * GRAPH_WORKSPACE_VIEWBOX.padding),
    GRAPH_WORKSPACE_VIEWBOX.padding + ((view.yMax - y) / (view.yMax - view.yMin)) * (GRAPH_WORKSPACE_VIEWBOX.height - 2 * GRAPH_WORKSPACE_VIEWBOX.padding),
  ]);
// A model's numbers are the scenario's: the rate its function multiplies by,
// each table row worked at the stage's own inputs, and the graph plots exactly the table.
const checkModel = (rate) => ({ item, question }) => {
  assert.ok(question.scenario.includes(rate), `"${rate}" is the scenario's`);
  const coefficient = /(\d+(?:\.\d+)?)/.exec(rate)[1];
  assert.match(item.parts.equation[1], new RegExp(`= ${escapeRegExp(coefficient)}[a-z]$`), `the function multiplies by ${coefficient}`);
  const tableStage = readComposedQuestion(question).workflow.find((stage) => stage.kind === 'tableInput');
  const rule = ruleOf(item.parts.equation[1]);
  assert.deepEqual(item.parts.table[1].map(Number), tableStage.xValues.map((x) => Number(numeric.format(rule(x), { precision: 12 }))), 'each row is the function at its input');
  assert.deepEqual(item.parts.graph[1], tableStage.xValues.map((x, row) => [x, Number(item.parts.table[1][row])]), 'the graph plots the table');
};
const ALEKS = 'teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json';
const L2_DAY2 = 'teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json';
// As the functionFeatures family writes an attribute review: each part's step
// led by its label, then "So:" and every answer. The function is the parent
// |x| the prompt names, unshifted.
const checkAttributeReview = ({ question, review }) => {
  const fields = question.answerFields;
  fields.forEach((field, index) => assert.ok(review.reasoning[index].startsWith(`${field.label}: `), review.reasoning[index]));
  assert.equal(review.reasoning.at(-1), `So: ${fields.map((field) => `${field.label}: ${field.answer}`).join('; ')}.`);
  assert.equal(review.reasoning.length, fields.length + 1);
  assert.match(question.prompt, /f\(x\)=\|x\|/, 'the parent function, unshifted');
};
// A polynomial's degree as printed: the greatest total exponent of a term.
const degreeOf = (expression) => Math.max(...expression.split(/ [+−] /)
  .map((term) => [...term.matchAll(/[a-z]([⁰¹²³⁴⁵⁶⁷⁸⁹]*)/g)].reduce((sum, [, power]) => sum + (power ? Number(powerOf(power)) : 1), 0)));

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
  {
    files: [DOL1],
    questionId: 'q_section-2_2_2',
    raw: { sectionId: 'section-2', prompt: 'A school bus can carry at most 48 students. Let x be the number of students riding the bus.' },
    kind: 'model',
    parts: { continuity: [0, 'discrete'], domainDiscrete: [1, '{0, 1, 2, ..., 48}'] },
    summary: [['is discrete', ['continuity']], ['domain {0, 1, 2, ..., 48}', ['domainDiscrete']]],
    // The bound is the scenario's: from none up to at most 48 students.
    check: ({ question, review }) => {
      assert.match(question.scenario, /at most 48 students/);
      assert.ok(review.reasoning[1].includes('from 0 students up to at most 48'), review.reasoning[1]);
    },
  },
  {
    files: [DOL1],
    questionId: 'q_section-2_2_13',
    raw: { sectionId: 'section-2', prompt: 'Honors extension: a delivery van holds at most 30 boxes and each box weighs 4 pounds. A student claims the reasonable domain is every real number from 0 to 30. Decide whether the claim is correct and give the reasonable domain and range.' },
    kind: 'model',
    parts: { continuity: [0, 'discrete'], domainDiscrete: [1, '{0, 1, 2, ..., 30}'], rangeDiscrete: [2, '{0, 4, 8, ..., 120}'] },
    claims: [[2, '4 · 0 = 0'], [2, '4 · 1 = 4'], [2, '4 · 2 = 8'], [2, '4 · 30 = 120']],
    summary: [['The claim is not correct', []], ['is discrete', ['continuity']], ['domain {0, 1, 2, ..., 30}', ['domainDiscrete']], ['range {0, 4, 8, ..., 120}', ['rangeDiscrete']]],
    // The claim the step answers is the prompt's, and each weight in the range
    // is 4 pounds times a count in the domain, up to the van's 30 boxes.
    check: ({ item, question, review }) => {
      assert.ok(question.prompt.includes('every real number from 0 to 30') && review.reasoning[0].includes('The student’s claim, every real number from 0 to 30,'), review.reasoning[0]);
      assert.match(question.prompt, /at most 30 boxes and each box weighs 4 pounds/);
      const listed = (set) => set.replace(/[{}]/g, '').split(', ').filter((entry) => entry !== '...').map(Number);
      const [domain, range] = [listed(item.parts.domainDiscrete[1]), listed(item.parts.rangeDiscrete[1])];
      assert.deepEqual(range, domain.map((boxes) => 4 * boxes), 'each weight is 4 pounds a box');
      assert.equal(domain.at(-1), 30, 'up to the van\'s 30 boxes');
    },
  },
  {
    files: [DOL1],
    questionId: 'q_section-3_3_10',
    raw: { sectionId: 'section-3', prompt: 'A tank fills steadily for 10 minutes, going from 0 gallons to 60 gallons.' },
    kind: 'model',
    parts: { continuity: [0, 'continuous'], domainContinuous: [1, '0 ≤ x ≤ 10'], rangeContinuous: [2, '0 ≤ y ≤ 60'] },
    summary: [['is continuous', ['continuity']], ['domain 0 ≤ x ≤ 10', ['domainContinuous']], ['range 0 ≤ y ≤ 60', ['rangeContinuous']]],
    // The ends are the scenario's: 10 minutes, from 0 gallons to 60.
    check: ({ question, review }) => {
      assert.match(question.scenario, /for 10 minutes, going from 0 gallons to 60 gallons/);
      assert.ok(review.reasoning[1].includes('from minute 0 to minute 10'), review.reasoning[1]);
      assert.ok(review.reasoning[2].includes('from 0 gallons to 60 gallons'), review.reasoning[2]);
    },
  },
  {
    files: [MATRICES],
    questionId: 'l3m-wu-1',
    parts: { same: [0, 'Yes — the same numbers, organized in rows and columns'], grocery25: [1, '8050'], gas50: [2, '44900'], least: [3, '$20 grocery cards'] },
    claims: [
      [1, '89 + 233 = 322'], [1, '322 × 25 = 8050'], [2, '550 + 348 = 898'], [2, '898 × 50 = 44900'],
      [3, '230 + 496 = 726'], [3, '110 + 850 = 960'], [3, '550 + 348 = 898'], [3, '112 + 129 = 241'], [3, '89 + 233 = 322'], [3, '95 + 308 = 403'],
    ],
    summary: [
      ['Yes — the same numbers, organized in rows and columns', ['same']], ['the $25 grocery cards brought in 8050 dollars', ['grocery25']],
      ['the $50 gas cards 44900 dollars', ['gas50']], ['the $20 grocery cards sold the fewest', ['least']],
    ],
    // Every count is the arrays': a card's row is its value and its column its
    // type, his sentence is November's Gas column, and a total adds the two months.
    check: ({ item, question, review }) => {
      const { Nov, Dec } = question.matrices;
      assert.deepEqual([Dec.rowLabels, Dec.colLabels], [Nov.rowLabels, Nov.colLabels], 'the two arrays have the same rows and columns');
      const values = Nov.rowLabels.map((label) => Number(/^\$(\d+) cards$/.exec(label)[1]));
      const types = Nov.colLabels.map(lower);
      const [nov, dec] = [matrixRows(Nov), matrixRows(Dec)];
      const gas = types.indexOf('gas');
      const sentence = values.map((value, row) => `${nov[row][gas]} gas cards for $${value}`);
      assert.ok(question.answerFields.find((field) => field.id === 'same').label.includes(`${sentence[0]}, ${sentence[1]}, and ${sentence[2]}`), 'his sentence is November\'s Gas column');
      assert.ok(review.reasoning[0].includes(`his ${sentence[0]} are the November array’s $${values[0]} row, Gas column, and his ${nov[1][gas]} and ${nov[2][gas]} sit below it in the $${values[1]} and $${values[2]} rows`), review.reasoning[0]);
      const total = (row, col) => `${nov[row][col]} + ${dec[row][col]} = ${nov[row][col] + dec[row][col]}`;
      ['grocery25', 'gas50'].forEach((id) => {
        const [, value, type] = /selling \$(\d+) (\w+) cards/.exec(question.answerFields.find((field) => field.id === id).label);
        const [row, col] = [values.indexOf(Number(value)), types.indexOf(type)];
        const cards = nov[row][col] + dec[row][col];
        const step = review.reasoning[item.parts[id][0]];
        assert.equal(step, `$${value} ${type} cards: ${nov[row][col]} in November and ${dec[row][col]} in December, so ${total(row, col)} cards, and ${cards} × ${value} = ${cards * value} dollars.`);
      });
      // The fewest: every type's two months added, under its own column, and the smallest of the six.
      const fewestStep = review.reasoning[item.parts.least[0]];
      Nov.colLabels.forEach((label, col) => {
        assert.equal(new RegExp(`${label}: (.+?)\\.`).exec(fewestStep)?.[1], values.map((value, row) => `$${value} cards, ${total(row, col)}`).join('; '), `${label}: ${fewestStep}`);
      });
      const sums = values.flatMap((value, row) => types.map((type, col) => ({ value, type, sum: nov[row][col] + dec[row][col] })));
      const fewest = sums.reduce((low, entry) => (entry.sum < low.sum ? entry : low));
      assert.equal(sums.filter((entry) => entry.sum === fewest.sum).length, 1, 'one type sold the fewest');
      assert.ok(fewestStep.endsWith(`The fewest, ${fewest.sum}, are the $${fewest.value} ${fewest.type} cards.`), fewestStep);
    },
  },
  {
    files: [MATRICES],
    questionId: 'l3m-wu-3',
    parts: { inv5: [0, '1/5'], invFrac: [1, '−3/2'], product: [2, '1'], none: [3, '0'] },
    claims: [[0, '5 · (1/5) = 1'], [2, '(−2/3) · (−3/2) = 1'], ['summary', '(−2/3) · (−3/2) = 1']],
    summary: [['inverse of 5 is 1/5', ['inv5']], ['inverse of −2/3 is −3/2', ['invFrac']], ['(−2/3) · (−3/2) = 1', ['product']], ['0 has no multiplicative inverse', ['none']]],
    // Each inverse is of the number its own label names, and its step leads with that label.
    check: ({ item, question, review }) => {
      ['inv5', 'invFrac'].forEach((id) => {
        const { label } = question.answerFields.find((field) => field.id === id);
        const step = review.reasoning[item.parts[id][0]];
        assert.ok(step.startsWith(`${label}: `), step);
        assert.ok(math.equal(math.multiply(F(/inverse of (\S+)$/.exec(label)[1]), F(item.parts[id][1])), 1), `${label}: ${item.parts[id][1]}`);
      });
      assert.match(question.prompt, /n · \(1\/n\) = 1/, 'the prompt gives the rule the first step uses');
    },
  },
  {
    files: [MATRICES],
    questionId: 'l3m-cw-4',
    kind: 'figureMatch',
    quote: 'comma',
    parts: {
      p1: [0, 'Defined — the product is 2 × 4'], p2: [1, 'Defined — the product is 2 × 4'], p3: [2, 'Not defined'], p4: [3, 'Not defined'],
      p5: [4, 'Not defined'], p6: [5, 'Defined — the product is 4 × 4'], p7: [6, 'Defined — the product is 4 × 4'], p8: [7, 'Defined — the product is 2 × 4'],
    },
    // Each card is read from its own sizes, not from the key: the inner numbers
    // match or not, and a defined product has the outer ones.
    check: ({ question, review }) => {
      figureStage(question).items.forEach((card, index) => {
        const [, m, n, p, q] = /^\((\d+) × (\d+)\) · \((\d+) × (\d+)\)$/.exec(card.text);
        const reading = n === p
          ? `the inner ${n} and ${p} match, and the outer numbers are ${m} and ${q}: Defined — the product is ${m} × ${q}.`
          : `the inner ${n} and ${p} do not match: Not defined.`;
        assert.ok(review.reasoning[index].endsWith(reading), `${card.text}: ${review.reasoning[index]}`);
      });
    },
  },
  {
    files: [MATRICES],
    questionId: 'l3m-pr-12-ccmr',
    parts: { entry21: [0, '−6'], dimsCD: [1, '3 × 4'], dimsDC: [2, 'DC is not defined'] },
    claims: [[0, '0 · 4 + 3 · (−2) = −6']],
    summary: [['The entry is −6', ['entry21']], ['CD is 3 × 4', ['dimsCD']], ['DC is not defined', ['dimsDC']]],
    // Row 2 of A and column 1 of B are the matrices shown; C and D are the sizes the prompt gives.
    check: ({ question, review }) => {
      const row = matrixRows(question.matrices.A)[1];
      const column = matrixRows(question.matrices.B).map((cells) => cells[0]);
      const term = (value) => (value < 0 ? `(${shownNumber(value)})` : shownNumber(value));
      assert.ok(review.reasoning[0].includes(`row 2 of A is (${row.map(shownNumber).join(', ')}) and column 1 of B is (${column.map(shownNumber).join(', ')}), so it is ${row.map((value, index) => `${term(value)} · ${term(column[index])}`).join(' + ')} = `), review.reasoning[0]);
      const [, cRows, cCols, dRows, dCols] = /C has dimensions (\d+) × (\d+) and matrix D has dimensions (\d+) × (\d+)/.exec(question.prompt);
      assert.ok(cCols === dRows && dCols !== cRows, 'CD is defined and DC is not');
      assert.ok(review.reasoning[1].endsWith(`C is ${cRows} × ${cCols} and D is ${dRows} × ${dCols}. The inner numbers, ${cCols} and ${dRows}, match, and the outer ones are ${cRows} and ${dCols}: ${cRows} × ${dCols}.`), review.reasoning[1]);
      assert.ok(review.reasoning[2].endsWith(`D is ${dRows} × ${dCols} and C is ${cRows} × ${cCols}. The inner numbers, ${dCols} and ${cRows}, do not match, so DC is not defined.`), review.reasoning[2]);
    },
  },
  {
    files: [POLY_OPS],
    questionId: 'opp-cw-1',
    kind: 'figureMatch',
    quote: 'parens',
    // Every review of this lesson names the usual mistake (algebra2OperationsOnPolynomialsLesson).
    commonError: true,
    parts: {
      e1: [0, 'Monomial'], e2: [0, 'Monomial'], e3: [0, 'Monomial'], e4: [1, 'Binomial'], e5: [1, 'Binomial'], e6: [1, 'Binomial'],
      e7: [2, 'Trinomial'], e8: [2, 'Trinomial'], e9: [3, 'Not a polynomial'], e10: [3, 'Not a polynomial'], e11: [3, 'Not a polynomial'],
    },
    // Each card is read from its own expression, not from the key: a variable
    // under a radical or in a denominator, or else its terms counted.
    check: ({ item, question, review }) => {
      const COUNTS = ['Monomial', 'Binomial', 'Trinomial'];
      figureStage(question).items.forEach((card, index) => {
        const step = review.reasoning[item.parts[card.id][0]];
        const radical = /√\(?[^)]*[a-z]/.test(card.text);
        if (radical || /\/\(?[^)]*[a-z]/.test(card.text)) {
          assert.ok(step.startsWith('Not a polynomial: '), `${card.text}: ${step}`);
          const at = step.indexOf(`Card ${index + 1} (`);
          const reasons = ['under a radical', 'in a denominator'].map((reason) => [reason, step.indexOf(reason, at)]).filter(([, place]) => place > at);
          assert.equal(reasons.sort((a, b) => a[1] - b[1])[0]?.[0], radical ? 'under a radical' : 'in a denominator', `${card.text}: ${step}`);
        } else {
          assert.ok(step.startsWith(`${COUNTS[termsOf(card.text) - 1]}: `), `${card.text} has ${termsOf(card.text)} terms: ${step}`);
        }
      });
    },
  },
  {
    files: [POLY_OPS],
    questionId: 'opp-pr-15',
    kind: 'figureMatch',
    commonError: true,
    parts: {
      s1: [0, 'Always true'], s2: [1, 'Always true'], s3: [2, 'Always true'], s4: [3, 'Sometimes true'],
      s5: [4, 'Sometimes true'], s6: [5, 'Sometimes true'], s7: [6, 'Never true'], s8: [7, 'Never true'],
    },
    claims: [
      [0, '(3x²)(4x³) = 12x⁵'], [1, '(x² + 1) − (3x − 4) = x² − 3x + 5'], [2, '(x² + 2x) − (x² + 2x) = 0'],
      [3, '(x + 1) + (x + 2) = 2x + 3'], [3, '(x + 1) + (y + 2) = x + y + 3'],
      [4, '(x + y)(x² + y² + 1) = x³ + xy² + x + x²y + y³ + y'], [4, '(x + 1)(x² − x + 1) = x³ + 1'],
      [5, '(x³ + x) + (x³ − 1) = 2x³ + x − 1'], [5, 'x³ + (−x³ + x) = x'],
      [7, 'x · x = x²'], [7, '1 + 1 = 2'], [7, '(x + 1)(x + 2) = x² + 3x + 2'],
    ],
    // What a step says an example's result is, read from the result itself;
    // and a "sometimes" is shown both ways, an example that holds and one that fails.
    check: ({ item, review }) => {
      const said = [
        [0, '12x⁵.', (result) => termsOf(result) === 1 && review.reasoning[0].includes('leaves one term')],
        [3, '2x + 3 is a binomial', (result) => termsOf(result) === 2],
        [3, 'x + y + 3 has three terms', (result) => termsOf(result) === 3],
        [4, 'x³ + xy² + x + x²y + y³ + y has 6 terms', (result) => termsOf(result) === 6],
        [4, 'x³ + 1 has only 2 once like terms are combined', (result) => termsOf(result) === 2],
        [5, '2x³ + x − 1 has degree 3', (result) => degreeOf(result) === 3],
        [5, 'x has degree 1', (result) => degreeOf(result) === 1],
        [7, 'x² + 3x + 2.', (result) => degreeOf(result) === 2 && review.reasoning[7].includes('its degree is 1 + 1 = 2')],
      ];
      said.forEach(([at, words, holds]) => {
        assert.ok(review.reasoning[at].includes(`= ${words}`), `${review.reasoning[at]} says "= ${words}"`);
        assert.ok(holds(words.replace(/ (is|has) .*$|\.$/, '')), `${words}`);
      });
      review.reasoning.forEach((step, index) => {
        if (!step.includes(': Sometimes true. ')) return;
        assert.match(step, /, but /, step);
        assert.ok(item.claims.filter(([at]) => at === index).length >= 2, `${step}: an example each way`);
      });
    },
  },
  {
    files: [ALEKS],
    questionId: 'q_practice-absolute-value-focus_3_3',
    raw: { sectionId: 'practice-absolute-value-focus', prompt: 'For the absolute value parent function f(x)=|x|, identify its vertex, domain, and range.' },
    parts: { vertex: [0, '(0, 0)'], domain: [1, '(−∞, ∞)'], range: [2, '[0, ∞)'] },
    claims: [[0, '|0| = 0'], [1, '|−3| = 3'], [2, '|0| = 0'], [2, '|5| = 5']],
    summary: [['Vertex: (0, 0)', ['vertex']], ['Domain: (−∞, ∞)', ['domain']], ['Range: [0, ∞)', ['range']]],
    check: checkAttributeReview,
  },
  {
    files: [L2_DAY2],
    questionId: 'q_warmup-1_1_1',
    raw: { sectionId: 'warmup-1', prompt: 'Review the parent function f(x)=|x|.' },
    parts: { family: [0, 'absolute value'], vertex: [1, '(0, 0)'] },
    claims: [[1, '|0| = 0']],
    summary: [['Family: absolute value', ['family']], ['Vertex: (0, 0)', ['vertex']]],
    check: checkAttributeReview,
  },
  {
    files: [L1_DAY2],
    questionId: 'q_classwork-2_2_6',
    raw: { sectionId: 'classwork-2', prompt: 'Build a model for the money collected from selling chocolate bars.' },
    kind: 'model',
    parts: {
      quantities: [0, { independent: 'bars', dependent: 'money' }], equation: [1, 'M(x) = 2x'], table: [2, ['0', '2', '4', '6']],
      continuity: [3, 'discrete'], graph: [4, [[0, 0], [1, 2], [2, 4], [3, 6]]], domainDiscrete: [5, '{0, 1, 2, 3, ...}'], rangeDiscrete: [6, '{0, 2, 4, 6, ...}'],
    },
    define: ['M(x) = 2x'],
    claims: [[1, 'M(x) = 2x'], [2, 'M(0) = 2 · 0 = 0'], [2, 'M(1) = 2 · 1 = 2'], [2, 'M(2) = 2 · 2 = 4'], [2, 'M(3) = 2 · 3 = 6'], ['summary', 'M(x) = 2x']],
    summary: [['M(x) = 2x', ['equation']], ['is discrete', ['continuity']], ['domain {0, 1, 2, 3, ...}', ['domainDiscrete']], ['range {0, 2, 4, 6, ...}', ['rangeDiscrete']]],
    check: checkModel('$2 each'),
  },
  {
    files: [L1_DAY2],
    questionId: 'q_classwork-2_2_7',
    raw: { sectionId: 'classwork-2', prompt: 'Build a model for the water released by the shower head.' },
    kind: 'model',
    parts: {
      quantities: [0, { independent: 'time', dependent: 'volume' }], equation: [1, 'V(t) = 1.8t'], table: [2, ['0', '0.9', '4.5', '9']],
      continuity: [3, 'continuous'], graph: [4, [[0, 0], [0.5, 0.9], [2.5, 4.5], [5, 9]]], domainContinuous: [5, '[0, ∞)'], rangeContinuous: [6, '[0, ∞)'],
    },
    define: ['V(t) = 1.8t'],
    claims: [[1, 'V(t) = 1.8t'], [2, 'V(0) = 1.8 · 0 = 0'], [2, 'V(0.5) = 1.8 · 0.5 = 0.9'], [2, 'V(2.5) = 1.8 · 2.5 = 4.5'], [2, 'V(5) = 1.8 · 5 = 9'], ['summary', 'V(t) = 1.8t']],
    summary: [['V(t) = 1.8t', ['equation']], ['is continuous', ['continuity']], ['domain [0, ∞)', ['domainContinuous']], ['range [0, ∞)', ['rangeContinuous']]],
    check: checkModel('1.8 gallons of water per minute'),
  },
  {
    files: [DOL3, DOL3_HONORS],
    questionId: 'dol3-review-q02',
    kind: 'model',
    // The review as it was: its common error only, which it keeps.
    before: { commonError: 'Leaving 0 out of the domain or connecting the points; the friends may buy no buckets, and they can buy only whole buckets, so the domain is {0, 1, 2, 3, 4, 5} and the graph is separate points.' },
    parts: {
      quantities: [0, { independent: 'buckets', dependent: 'cost' }], equation: [1, 'f(x) = 6x'], table: [2, ['0', '6', '12', '18', '24', '30']],
      continuity: [3, 'discrete'], graph: [4, [[0, 0], [1, 6], [2, 12], [3, 18], [4, 24], [5, 30]]],
      domainDiscrete: [5, '{0, 1, 2, 3, 4, 5}'], rangeDiscrete: [6, '{0, 6, 12, 18, 24, 30}'],
    },
    define: ['f(x) = 6x'],
    claims: [
      [1, 'f(x) = 6x'], [2, 'f(0) = 6 · 0 = 0'], [2, 'f(1) = 6 · 1 = 6'], [2, 'f(2) = 6 · 2 = 12'], [2, 'f(3) = 6 · 3 = 18'],
      [2, 'f(4) = 6 · 4 = 24'], [2, 'f(5) = 6 · 5 = 30'], [5, '30 ÷ 6 = 5'], ['summary', 'f(x) = 6x'],
    ],
    summary: [['f(x) = 6x', ['equation']], ['is discrete', ['continuity']], ['domain {0, 1, 2, 3, 4, 5}', ['domainDiscrete']], ['range {0, 6, 12, 18, 24, 30}', ['rangeDiscrete']]],
    // And the most buckets is what $30 buys at $6 each.
    check: (entry) => {
      checkModel('$6 each')(entry);
      assert.match(entry.question.scenario, /has \$30 to spend/);
      assert.equal(Math.max(...entry.item.parts.domainDiscrete[1].replace(/[{}]/g, '').split(', ').map(Number)), Math.floor(30 / 6));
    },
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
  assert.equal(ITEMS.filter((item) => item.files.includes(DOL1)).length, 10, 'ten of the DOL #1 review');
  assert.equal(ITEMS.filter((item) => item.files.includes(MATRICES)).length, 4, 'four of the matrices lesson');
  assert.equal(ITEMS.filter((item) => item.files.includes(POLY_OPS)).length, 2, 'the two sorts of Operations on Polynomials');
  assert.equal(ITEMS.filter((item) => item.files.includes(ALEKS) || item.files.includes(L2_DAY2)).length, 2, 'the two |x| items');
  assert.equal(ITEMS.filter((item) => item.kind === 'model').length, 6, 'six relationship models: three of DOL #1, two of L1 Day 2, DOL #3\'s in both files');
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
      headline: authored.headline, reasoning: authored.reasoning, commonError: authored.commonError ?? null, connection: null, answerSummary: authored.answerSummary,
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
  // A relationship model: each step its key marks (the domain and range shown
  // for the right continuity), labelled as the screen labels it; the input and
  // output by their quantities, a table by its inputs, a graph by its continuity.
  if (item.kind === 'model') {
    const { workflow, grading } = readComposedQuestion(question);
    return Object.keys(grading).map((id) => workflow.find((stage) => stage.id === id)).map((stage) => ({
      id: stage.id,
      label: text(stage.stepLabel || stage.prompt),
      options: (stage.choices || []).map(text),
      ...(stage.kind === 'quantityRoles' ? { roles: stage.quantities } : {}),
      ...(stage.kind === 'tableInput' ? { rows: stage.xValues } : {}),
      ...(stage.kind === 'functionGraph' ? { connected: grading[stage.continuityStageId] === 'continuous' } : {}),
    }));
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
  // A model's steps, each answered as stated: the roles, the function and a
  // domain or range as typed, the continuity by its word; the table as its
  // rows, and the graph as its points placed (and, where it is continuous, one
  // line drawn along the stated function from the first point), each marked by
  // the composed grader as the server marks a student's work.
  if (item.kind === 'model') {
    const { composed } = resolveComposedWorkflow(question);
    const kindOf = new Map(composed.workflow.map((stage) => [stage.id, stage.kind]));
    const responses = Object.fromEntries(Object.entries(stated).filter(([id]) => !['tableInput', 'functionGraph'].includes(kindOf.get(id))));
    const equationId = composed.workflow.find((stage) => stage.kind === 'equationInput')?.id;
    composed.workflow.filter((stage) => stage.kind === 'tableInput' && stated[stage.id]).forEach((stage) => {
      const cells = Object.fromEntries(stated[stage.id].map((value, row) => [`${row}:y`, value]));
      responses[stage.id] = workflowTableArtifact({ stage, cells, isComplete: true, sourceModel: responses[equationId], content: composed.content });
    });
    resolveWorkflowGraphStages({ workflow: composed.workflow, content: composed.content, grading: composed.grading, responses }).forEach((resolution, stageId) => {
      const points = stated[stageId];
      if (!points || resolution.status !== 'ready') return;
      const model = graphWorkspaceModelFor(resolution.question, {});
      const at = new Map(points.map(([x, y]) => [x, y]));
      const construction = { placements: Object.fromEntries(model.tasks.map((task) => [task.id, [Number(task.x), at.get(Number(task.x))]])), pointsLocked: true };
      if (!resolution.question.pointOnly) {
        Object.assign(construction, { strokes: [sketchAlong(model.viewWindow, ruleOf(responses[equationId]), points[0][0])], sketchView: { ...model.viewWindow }, sketchLocked: true });
      }
      responses[stageId] = { __mathmasterWorkflowArtifact: 'graph', isComplete: true, analysis: {}, construction };
    });
    return gradeComposedWorkflowWork(question, { responses });
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
      if (part.roles) {
        // The input and the output, by the names the screen gives the quantities.
        const name = (id) => lowerFirst(text(part.roles.find((quantity) => quantity.id === id)?.label));
        assert.ok(step.includes(`the input is the ${name(words.independent)} and the output is the ${name(words.dependent)}`), `${source}: step ${stepIndex + 1} names the input and the output`);
      } else if (part.rows) {
        // Each row worked at its own input, ending in the value stated for it: "M(2) = 2 · 2 = 4".
        part.rows.forEach((x, row) => assert.match(step, new RegExp(`\\b[A-Za-z]\\(${escapeRegExp(x)}\\) = [^,]*?= ${escapeRegExp(words[row])}(,| and|\\.)`), `${source}: row ${row + 1} of the table`));
      } else if ('connected' in part) {
        // Every point it plots, then separate points or one connected line, as the continuity says.
        words.forEach(([x, y]) => assert.ok(step.includes(`(${x}, ${y})`), `${source}: (${x}, ${y}) is plotted`));
        assert.ok(step.includes(part.connected ? 'then draw one connected line through them' : 'as separate points, without connecting them'), `${source}: ${step}`);
      } else if (part.options.length) {
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
    // The summary states the same answers: a number as a number, anything else in its own words.
    for (const [phrase, ids] of item.summary || []) {
      assert.ok(review.answerSummary.includes(phrase), `${source}: the summary says "${phrase}"`);
      ids.forEach((id) => {
        const number = /(−?\d+\/\d+|−?\d+)$/.exec(phrase);
        if (number && /^−?\d+(\/\d+)?$/.test(stated[id])) assert.ok(math.equal(F(number[1]), F(stated[id])), `${source}: "${phrase}" is ${id}'s ${stated[id]}`);
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
    assert.equal(count(text(review.commonError), '='), 0, `${source}: a common error writes no equation`);
    item.check?.({ ...entry, review });
  }
  assert.ok(checked >= 150, `${checked} claims checked`);
});

test('the words are plain and short, and nothing changes while the item is open', () => {
  for (const { item, path, source, question } of everyCopy) {
    const authored = authoredIn(path, item).solutionReview;
    for (const line of [authored.headline, ...authored.reasoning, authored.answerSummary, ...(authored.commonError ? [authored.commonError] : [])]) {
      assert.doesNotMatch(line, /NaN|undefined|\bnull\b|Infinity|\[object|\{\{/, `${source}: ${line}`);
      // A dollar sign is money ("$25 grocery cards"), never the start of
      // mathematics: the screen shows the whole line as words.
      assert.ok(!splitMathSegments(line).some(isMathSegment), `${source}: shown as words: ${line}`);
    }
    // A common error's mistake half, the part before a ";", is said on a miss
    // (FB04, attemptFeedbackPlan.js). Most of these reviews name none; the
    // Operations on Polynomials sorts name one, as every review of that lesson
    // does, with no ";", so FB04 says nothing whatever the student sends: each
    // card, each category; and the DOL #3 model keeps the one it had. An open
    // item's feedback is what it was.
    if (item.commonError) {
      assert.ok(text(authored.commonError) && !authored.commonError.includes(';'), `${source}: a common error FB04 never says`);
      const stage = figureStage(question);
      [...stage.items.map((card) => card.text), ...stage.categories.flatMap((category) => [category.id, category.label])].forEach((response) => {
        assert.equal(commonErrorMiss({ question, parts: [{ id: stage.id, isCorrect: false, response }] }), null, `${source}: nothing said for ${response}`);
      });
    } else if (item.before) {
      // A review written around a common error the item already had keeps it, word for word.
      assert.equal(authored.commonError, item.before.commonError, `${source}: its own common error, unchanged`);
    } else {
      assert.equal(authored.commonError, undefined, `${source}: no common error`);
    }
    // Against the item as it was: no review, or the one it had.
    const without = { ...question };
    if (item.before) without.solutionReview = item.before;
    else delete without.solutionReview;
    assert.deepEqual(buildQuestionHints(question), buildQuestionHints(without), `${source}: the same hints`);
    assert.deepEqual(backUpStepFor(question), backUpStepFor(without), `${source}: the same back-up step`);
  }
});
