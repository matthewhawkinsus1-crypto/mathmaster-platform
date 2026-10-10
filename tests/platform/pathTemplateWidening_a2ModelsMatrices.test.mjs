/*
 * WIDENED A2 MODELLING AND MATRIX TEMPLATES (student push J, "Content that
 * teaches").
 *
 * Five Algebra II My Math Path templates drew fewer than 8 distinct questions
 * in the 30 recap-probe draws, so their recap had to withhold the answer
 * (functions/shared/pathRecapWithheld.mjs). The numbers already varied, but the
 * words a student reads did not: the matrix, the data table and the
 * prediction target lived outside the prompt, or a single value carried all
 * the variety. The drafts now state the system / observations in the prompt,
 * vary the prediction target among values of the same kind, and draw from more
 * reference intensities.
 *
 * This file reads the DRAFT source of truth (drafts/fidelity-v2/algebra2) and
 * proves, for every template:
 *   - at least 12 distinct questions in the 30 recap-probe draws (the recap's
 *     floor is 8);
 *   - every expected answer, recomputed independently with mathjs from the
 *     numbers the student can see (a least-squares refit for the regression
 *     families), matches what the template states and grades;
 *   - every point and prediction target sits inside the window the Data
 *     Modeling Lab draws;
 *   - the identity, alignment, complexity, tool and response contract equals
 *     the pre-widening values, pinned below as literals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { generatePathInstance, placeholdersUsed } from '../../functions/shared/pathQuestionGeneration.mjs';
import { RECAP_INSTANCE_DRAWS, RECAP_MIN_DISTINCT_INSTANCES } from '../../functions/shared/pathRecapWithheld.mjs';
import { fitDataBounds } from '../../src/platform/graph/graphScaleService.js';

const require = createRequire(import.meta.url);
const math = require('mathjs');
const mathPath = require('../../functions/lib/mathPath.js');

const draftPath = (standard) => `drafts/fidelity-v2/algebra2/${standard}.json`;
const draftDocuments = (standard) => JSON.parse(readFileSync(new URL(`../../${draftPath(standard)}`, import.meta.url), 'utf8')).documents;

const TEMPLATES = [
  ['A2.3B', 'mm_A2_3B_v2_matrix-technology-rref'],
  ['A2.4E', 'mm_A2_4E_v2_quadratic-context-interpolation'],
  ['A2.4E', 'mm_A2_4E_v2_quadratic-regression-table'],
  ['A2.4E', 'mm_A2_4E_v2_square-root-context-interpolation'],
  ['A2.5B', 'mm_A2_5B_v2_logarithmic-ratio-scale-model'],
];
const TARGET_DISTINCT = 12;
const ORACLE_DRAWS = 120;

const draft = (standard, id) => {
  const found = draftDocuments(standard).find((doc) => doc.id === id);
  assert.ok(found, `${id} is missing from ${draftPath(standard)}`);
  return found;
};

// The recap's content key (tests/platform/pathRecapWithheld.test.mjs): what a
// student reads — words, stimulus, options and field labels.
const contentKey = (question) => JSON.stringify({
  p: question.prompt,
  s: question.stimulus,
  sc: question.scenario,
  c: (Array.isArray(question.choices) ? question.choices : [])
    .map((choice) => (choice && typeof choice === 'object') ? (choice.text ?? choice.label ?? choice.latex ?? choice.value ?? '') : choice),
  f: (Array.isArray(question.responseFields) ? question.responseFields : [])
    .map((field) => (field && typeof field === 'object') ? (field.label ?? field.prompt ?? '') : field),
});

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const close = (left, right, eps = 1e-9) => Math.abs(Number(left) - Number(right)) <= eps;
const pairsIn = (text) => [...String(text).matchAll(new RegExp(String.raw`\((${NUM}),(${NUM})\)`, 'g'))]
  .map((match) => [Number(match[1]), Number(match[2])]);

// Independent least squares: solve the normal equations with mathjs.
const leastSquares = (points, basis) => {
  const X = points.map(([x]) => basis(x));
  const Xt = math.transpose(X);
  return math.lusolve(math.multiply(Xt, X), math.multiply(Xt, points.map(([, y]) => [y]))).map((row) => row[0]);
};

const labWindow = (points) => fitDataBounds(points.map(([x]) => Number(x)), { include: [0] });

/*
 * Each oracle reads ONLY the generated question (never the draw's parameters),
 * recomputes the answer, checks the text the student and the review show, and
 * returns the answer the production grader must accept.
 */
const ORACLES = {
  'mm_A2_3B_v2_matrix-technology-rref': (q) => {
    const rows = q.matrix.rows.map((row) => row.map(Number));
    const A = rows.map((row) => row.slice(0, 3));
    const constants = rows.map((row) => row[3]);
    assert.notEqual(math.det(A), 0, 'the coefficient matrix is invertible');
    const solution = math.lusolve(A, constants.map((value) => [value])).map((row) => row[0]);
    solution.forEach((value) => assert.ok(close(value, Math.round(value)), `integer solution, got ${value}`));
    const summary = new RegExp(String.raw`\(x,y,z\)=\((${NUM}),(${NUM}),(${NUM})\)`).exec(q.solutionReview.answerSummary);
    assert.ok(summary, q.solutionReview.answerSummary);
    solution.forEach((value, index) => assert.ok(close(value, summary[index + 1]), `${q.solutionReview.answerSummary} vs ${solution}`));
    // The system in the prompt IS the augmented matrix.
    const equations = [...q.prompt.matchAll(new RegExp(String.raw`\$([^$]*?)=(${NUM})\$`, 'g'))];
    assert.equal(equations.length, 3, q.prompt);
    equations.forEach((equation, index) => {
      const lhs = math.parse(equation[1]);
      const coefficients = ['x', 'y', 'z'].map((name) => lhs.evaluate({ x: 0, y: 0, z: 0, [name]: 1 }));
      assert.deepEqual(coefficients, A[index], `${equation[0]} vs row ${rows[index]}`);
      assert.equal(Number(equation[2]), constants[index], `${equation[0]} vs row ${rows[index]}`);
    });
    assert.ok(!q.prompt.includes(q.solutionReview.answerSummary), 'the prompt does not carry the answer');
    return { raw: { classification: 'one', technologyUsed: true, x: solution[0], y: solution[1], z: solution[2] } };
  },

  quadratic: (q, { interpolation }) => {
    const points = q.points.map(([x, y]) => [Number(x), Number(y)]);
    assert.deepEqual(pairsIn(q.prompt), points, 'the prompt lists exactly the table');
    const [a, b, c] = leastSquares(points, (x) => [x * x, x, 1]);
    const sse = points.reduce((sum, [x, y]) => sum + (y - (a * x * x + b * x + c)) ** 2, 0);
    assert.ok(sse < 1e-9, 'the five rows lie on one quadratic');
    assert.ok(close(a, Math.round(a), 1e-7) && Math.round(a) !== 0, `a is a nonzero integer, got ${a}`);
    const coefficients = new RegExp(String.raw`a=(${NUM}),? b=(${NUM}),? (?:and )?c=(${NUM})`).exec(q.solutionReview.reasoning[0]);
    assert.ok(coefficients, q.solutionReview.reasoning[0]);
    [a, b, c].forEach((value, index) => assert.ok(close(value, coefficients[index + 1], 1e-7), `${q.solutionReview.reasoning[0]} vs ${a},${b},${c}`));
    const summary = new RegExp(String.raw`y=(${NUM})x\^2\+\((${NUM})\)x\+\((${NUM})\)`).exec(q.solutionReview.answerSummary);
    assert.ok(summary, q.solutionReview.answerSummary);
    [a, b, c].forEach((value, index) => assert.ok(close(value, summary[index + 1], 1e-7), q.solutionReview.answerSummary));

    const target = Number(q.predictionX);
    assert.ok(q.prompt.includes(`$x=${target}$`), `the prompt names the target ${target}`);
    const prediction = math.evaluate('a*x^2+b*x+c', { a, b, c, x: target });
    const stated = new RegExp(String.raw`(?:gives|predicts) (${NUM})`).exec(q.solutionReview.reasoning[2]);
    assert.ok(stated && close(stated[1], prediction, 1e-7), `${q.solutionReview.reasoning[2]} vs ${prediction}`);
    // Every "x=<n>" outside the prompt's table names THIS draw's target.
    const prose = JSON.stringify([q.solutionReview, q.attemptFeedback, q.supportHints, q.context])
      .replace('symmetric about x=0', '');
    for (const match of prose.matchAll(new RegExp(String.raw`x=(${NUM})`, 'g'))) {
      assert.equal(Number(match[1]), target, `stale target in "${match[0]}"`);
    }
    const xs = points.map(([x]) => x);
    const inside = target >= Math.min(...xs) && target <= Math.max(...xs);
    assert.equal(inside, interpolation, `target ${target} is ${interpolation ? 'inside' : 'outside'} the data`);
    if (interpolation) assert.ok(!xs.includes(target), 'an interpolation target is not a measured row');
    else assert.equal(Math.abs(target), Math.max(...xs.map(Math.abs)) + 1, 'extrapolation is one step past the table');
    const window = labWindow(points);
    [...xs, target].forEach((x) => assert.ok(x >= window.min && x <= window.max, `x=${x} inside [${window.min}, ${window.max}]`));
    return {
      raw: {
        a, b, c, predictionX: target, predictionY: prediction,
        predictionType: inside ? 'interpolation' : 'extrapolation',
      },
    };
  },

  'mm_A2_4E_v2_square-root-context-interpolation': (q) => {
    const points = q.points.map(([x, y]) => [Number(x), Number(y)]).sort((left, right) => left[0] - right[0]);
    const [h, k] = points[0];
    const [a] = leastSquares(points.slice(1).map(([x, y]) => [x, y - k]), (x) => [Math.sqrt(x - h)]);
    const sse = points.reduce((sum, [x, y]) => sum + (y - (a * Math.sqrt(x - h) + k)) ** 2, 0);
    assert.ok(sse < 1e-9, 'the five rows lie on one square-root curve');
    const fitted = new RegExp(String.raw`h=(${NUM}), k=(${NUM}), and fits a=(${NUM})`).exec(q.solutionReview.reasoning[0]);
    assert.ok(fitted && close(fitted[1], h) && close(fitted[2], k) && close(fitted[3], a), q.solutionReview.reasoning[0]);
    const summary = new RegExp(String.raw`y=(${NUM})\\sqrt\{x-\((${NUM})\)\}\+\((${NUM})\)`).exec(q.solutionReview.answerSummary);
    assert.ok(summary && close(summary[1], a) && close(summary[2], h) && close(summary[3], k), q.solutionReview.answerSummary);

    const target = Number(q.predictionX);
    assert.ok(q.prompt.includes(`$x=${target}$`), `the prompt names the target ${target}`);
    assert.match(String(target), /^-?\d+(\.\d{1,2})?$/, 'the target is a clean decimal');
    const radicand = math.evaluate('x-h', { x: target, h });
    const root = math.sqrt(radicand);
    const radicandText = new RegExp(String.raw`At x=(${NUM}), the radicand is (${NUM}) and its square root is (${NUM})`).exec(q.solutionReview.reasoning[1]);
    assert.ok(radicandText, q.solutionReview.reasoning[1]);
    assert.ok(close(radicandText[1], target) && close(radicandText[2], radicand, 1e-12) && close(radicandText[3], root, 1e-12), q.solutionReview.reasoning[1]);
    const prediction = a * root + k;
    assert.ok(close(prediction, Math.round(prediction)), `integer prediction, got ${prediction}`);
    const stated = new RegExp(String.raw`predicts (${NUM})`).exec(q.solutionReview.reasoning[2]);
    assert.ok(stated && close(stated[1], prediction), `${q.solutionReview.reasoning[2]} vs ${prediction}`);
    const xs = points.map(([x]) => x);
    assert.ok(target > Math.min(...xs) && target < Math.max(...xs) && !xs.includes(target), 'strict interpolation');
    const window = labWindow(points);
    [...xs, target].forEach((x) => assert.ok(x >= window.min && x <= window.max, `x=${x} inside [${window.min}, ${window.max}]`));
    return { raw: { a, h, k, predictionX: target, predictionY: prediction, predictionType: 'interpolation' } };
  },

  'mm_A2_5B_v2_logarithmic-ratio-scale-model': (q) => {
    const reference = Number(/reference intensity (\d+)\./.exec(q.prompt)?.[1]);
    assert.ok(reference > 0, q.prompt);
    assert.equal(Number(q.stimulus.table.rows[1][0]), reference, 'the stimulus names the same reference');
    const field = (id) => q.responseFields.find((entry) => entry.id === id).expected;
    for (const I of [0.5, 1, 7, 250, 10000]) {
      assert.ok(close(math.evaluate(field('ratio'), { I }), I / reference, 1e-12), field('ratio'));
      const rhs = field('model').replace(/^L=/, '').replace('10log_10(', '10*log10(');
      assert.ok(close(math.evaluate(rhs, { I }), 10 * (Math.log10(I) - Math.log10(reference)), 1e-9), field('model'));
    }
    assert.equal(field('domain'), 'positive');
    assert.equal(q.solutionReview.answerSummary, `$L=10\\log_{10}(I/${reference})$ with $I>0$.`);
    assert.ok(q.solutionReview.reasoning[0].endsWith(`giving I/${reference}.`));
    return { responses: { ratio: `I/${reference}`, model: `L=10log_10(I/${reference})`, domainLabel: /positive/ }, reference };
  },
};
ORACLES['mm_A2_4E_v2_quadratic-context-interpolation'] = (q) => ORACLES.quadratic(q, { interpolation: true });
ORACLES['mm_A2_4E_v2_quadratic-regression-table'] = (q) => ORACLES.quadratic(q, { interpolation: false });

const gradeOwnAnswer = async (question, expected) => {
  const plan = await mathPath.buildIssuePlan(question);
  assert.ok(plan.issuable, `issuable: ${plan.reason}`);
  if (expected.raw) {
    const right = await mathPath.gradePathToolResponse(plan.privateGrading, { raw: expected.raw });
    const wrongRaw = { ...expected.raw };
    if ('x' in wrongRaw) wrongRaw.x += 1;
    else wrongRaw.predictionY += 1;
    const wrong = await mathPath.gradePathToolResponse(plan.privateGrading, { raw: wrongRaw });
    return { right, wrong };
  }
  // A choice is answered by its runtime id, found by its LABEL in the public question.
  const publicQuestion = mathPath.buildSanitizedQuestion(question, { toolPayload: plan.toolPayload });
  const domain = publicQuestion.responseFields.find((entry) => entry.id === 'domain')
    .choices.find((choice) => expected.responses.domainLabel.test(choice.label));
  const responses = { ratio: expected.responses.ratio, model: expected.responses.model, domain: domain.id };
  const right = await mathPath.gradeResponse(plan.privateGrading, { responses });
  const wrong = await mathPath.gradeResponse(plan.privateGrading, {
    responses: { ...responses, ratio: `I*${expected.reference}`, model: `L=10log_10(I/${expected.reference + 1})` },
  });
  return { right, wrong };
};

for (const [standard, id] of TEMPLATES) {
  test(`${id}: at least ${TARGET_DISTINCT} distinct questions in the ${RECAP_INSTANCE_DRAWS} recap-probe draws`, (t) => {
    const template = draft(standard, id);
    const seen = new Set();
    for (let draw = 0; draw < RECAP_INSTANCE_DRAWS; draw += 1) {
      const generated = generatePathInstance(template, `recap-probe-${draw}`);
      assert.ok(generated.question, `probe ${draw}: ${generated.reason}`);
      seen.add(contentKey(generated.question));
    }
    t.diagnostic(`${id}: ${seen.size} distinct of ${RECAP_INSTANCE_DRAWS}`);
    assert.ok(seen.size >= RECAP_MIN_DISTINCT_INSTANCES, `${seen.size} is below the recap floor`);
    assert.ok(seen.size >= TARGET_DISTINCT, `${id} draws only ${seen.size} distinct questions`);
  });

  test(`${id}: ${ORACLE_DRAWS} draws are correct against an independent mathjs oracle and graded right by production`, async () => {
    const template = draft(standard, id);
    const certification = await mathPath.buildTemplateIssuePlan(template, { samples: 12 });
    assert.equal(certification.issuable, true, `release certification: ${certification.reason}`);
    for (let draw = 0; draw < ORACLE_DRAWS; draw += 1) {
      const generated = generatePathInstance(template, `widening-oracle-${draw}`);
      assert.ok(generated.question, `draw ${draw}: ${generated.reason}`);
      const question = generated.question;
      assert.equal(placeholdersUsed(question).size, 0, `draw ${draw} left a placeholder`);
      assert.doesNotMatch(JSON.stringify(question), /NaN|undefined|Infinity|--\d/, `draw ${draw} rendered a bad token`);
      const expected = ORACLES[id](question);
      // eslint-disable-next-line no-await-in-loop
      const { right, wrong } = await gradeOwnAnswer(question, expected);
      assert.equal(right.isCorrect, true, `draw ${draw}: the oracle's answer is marked wrong ${JSON.stringify(right).slice(0, 400)}`);
      assert.equal(wrong.isCorrect, false, `draw ${draw}: a wrong answer is marked right`);
    }
  });
}

// The model field also accepts the common spellings of the same equation
// (brace subscript, \log, log10, and bare log, which is base 10 by
// convention). The alternates are graded on the server and never leave it.
test('mm_A2_5B_v2_logarithmic-ratio-scale-model: equivalent spellings of the model are graded right, and they stay private', async () => {
  const template = draft('A2.5B', 'mm_A2_5B_v2_logarithmic-ratio-scale-model');
  const references = new Set();
  for (let draw = 0; draw < 60; draw += 1) {
    const question = generatePathInstance(template, `widening-log-forms-${draw}`).question;
    const reference = Number(/reference intensity (\d+)\./.exec(question.prompt)[1]);
    references.add(reference);
    // eslint-disable-next-line no-await-in-loop
    const plan = await mathPath.buildIssuePlan(question);
    const publicQuestion = mathPath.buildSanitizedQuestion(question, { toolPayload: plan.toolPayload });
    const publicText = JSON.stringify(publicQuestion.responseFields);
    assert.doesNotMatch(publicText, /accepted|expected|log/, 'no key or alternate reaches the browser');
    const domain = publicQuestion.responseFields.find((entry) => entry.id === 'domain')
      .choices.find((choice) => /positive/.test(choice.label)).id;
    const grade = (model) => mathPath.gradeResponse(plan.privateGrading, { responses: { ratio: `I/${reference}`, model, domain } });
    for (const model of [
      `L=10log_10(I/${reference})`,
      `L=10log_{10}(I/${reference})`,
      `L=10\\log_{10}(I/${reference})`,
      `L = 10 \\log_{10}\\left(\\frac{I}{${reference}}\\right)`,
      `L=10log10(I/${reference})`,
      `L=10log(I/${reference})`,
      `L=10\\log(I/${reference})`,
    ]) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await grade(model)).isCorrect, true, `ref ${reference}: ${model} is the right model`);
    }
    for (const model of [
      `L=10log_{10}(I/${reference + 1})`,
      `L=10log_{10}(I*${reference})`,
      `L=log_{10}(I/${reference})`,
      `L=20log_{10}(I/${reference})`,
      `L=10ln(I/${reference})`,
      `L=10log_{10}(${reference}/I)`,
    ]) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await grade(model)).isCorrect, false, `ref ${reference}: ${model} is not the model`);
    }
  }
  assert.ok(references.size >= 8, `only ${references.size} references drawn`);
});

// Fields that define WHAT is assessed and HOW it is answered, pinned as the
// committed (pre-widening) values. Widening may change numbers and words; it
// may not change any of these. The model field's private `accepted`
// alternates are grading leniency, not contract, so they are compared apart.
const COMMITTED = {
  "mm_A2_3B_v2_matrix-technology-rref": {
    fields: {
      id: "mm_A2_3B_v2_matrix-technology-rref",
      familyId: "mathmaster:A2.3B:v2-matrix-technology-rref",
      familyVersion: 3,
      courseId: "algebra2",
      alignmentKeys: ["texas:A2.3B"],
      assessedConstruct: "A2.3B",
      type: "systemsWorkspace",
      mode: "matrix3",
      questionType: "response",
      representation: "table",
      taskType: "procedural",
      difficultyBand: 3,
      dok: 2,
      activityRole: "practice",
      calculatorPolicy: "graphing",
      solutionMethod: "matrixTechnology",
      requireTechnology: true,
    },
    variants: [],
    coefficients: [[1,1,1],[2,-1,1],[1,2,-1]],
  },
  "mm_A2_4E_v2_quadratic-context-interpolation": {
    fields: {
      id: "mm_A2_4E_v2_quadratic-context-interpolation",
      familyId: "mathmaster:A2.4E:v2-quadratic-context-interpolation",
      familyVersion: 3,
      courseId: "algebra2",
      alignmentKeys: ["texas:A2.4E"],
      assessedConstruct: "A2.4E",
      type: "dataModelingLab",
      mode: "quadraticFitPrediction",
      questionType: "response",
      representation: "context",
      taskType: "modeling",
      difficultyBand: 4,
      dok: 3,
      activityRole: "practice",
      calculatorPolicy: "graphing",
      quadraticATolerance: 0.015,
      quadraticBTolerance: 0.03,
      quadraticCTolerance: 0.05,
      predictionTolerance: 0.08,
    },
    variants: [],
    rows: 5,
  },
  "mm_A2_4E_v2_quadratic-regression-table": {
    fields: {
      id: "mm_A2_4E_v2_quadratic-regression-table",
      familyId: "mathmaster:A2.4E:v2-quadratic-regression-table",
      familyVersion: 3,
      courseId: "algebra2",
      alignmentKeys: ["texas:A2.4E"],
      assessedConstruct: "A2.4E",
      type: "dataModelingLab",
      mode: "quadraticFitPrediction",
      questionType: "response",
      representation: "table",
      taskType: "procedural",
      difficultyBand: 3,
      dok: 2,
      activityRole: "practice",
      calculatorPolicy: "graphing",
      quadraticATolerance: 0.015,
      quadraticBTolerance: 0.03,
      quadraticCTolerance: 0.05,
      predictionTolerance: 0.08,
    },
    variants: [{"coverageKey":"core-d2b3","dok":2,"difficultyBand":3},{"coverageKey":"adaptive-d2b2-symmetric-quadratic-regression","dok":2,"difficultyBand":2,"taskType":"procedural","representation":"table"}],
    rows: 5,
  },
  "mm_A2_4E_v2_square-root-context-interpolation": {
    fields: {
      id: "mm_A2_4E_v2_square-root-context-interpolation",
      familyId: "mathmaster:A2.4E:v2-square-root-context-interpolation",
      familyVersion: 3,
      courseId: "algebra2",
      alignmentKeys: ["texas:A2.4E"],
      assessedConstruct: "A2.4E",
      type: "dataModelingLab",
      mode: "squareRootFitPrediction",
      questionType: "response",
      representation: "context",
      taskType: "modeling",
      difficultyBand: 4,
      dok: 3,
      activityRole: "practice",
      calculatorPolicy: "graphing",
      squareRootATolerance: 0.02,
      squareRootHTolerance: 0.02,
      squareRootKTolerance: 0.03,
      predictionTolerance: 0.08,
    },
    variants: [],
    rows: 5,
  },
  "mm_A2_5B_v2_logarithmic-ratio-scale-model": {
    fields: {
      id: "mm_A2_5B_v2_logarithmic-ratio-scale-model",
      familyId: "mathmaster:A2.5B:v2-logarithmic-ratio-scale-model",
      familyVersion: 3,
      courseId: "algebra2",
      alignmentKeys: ["texas:A2.5B"],
      assessedConstruct: "A2.5B",
      questionType: "response",
      representation: "multipleRepresentation",
      taskType: "modeling",
      difficultyBand: 4,
      dok: 3,
      activityRole: "practice",
      calculatorPolicy: "inherit",
      responseFields: [{"id":"ratio","label":"Dimensionless intensity ratio","inputProfile":"expression","expected":"I/{{ref}}"},{"id":"model","label":"Logarithmic model","inputProfile":"equation","expected":"L=10log_10(I/{{ref}})"},{"id":"domain","label":"Physical input restriction","inputProfile":"choice","choices":[{"id":"positive","label":"I must be positive"},{"id":"all","label":"Any real I is allowed"},{"id":"negative","label":"I must be negative"}],"expected":"positive"}],
    },
    variants: [],
  },
};
const PINNED_FIELDS = [
  'id', 'familyId', 'familyVersion', 'courseId', 'alignmentKeys', 'assessedConstruct', 'type', 'mode',
  'questionType', 'representation', 'taskType', 'difficultyBand', 'dok', 'activityRole', 'calculatorPolicy',
  'solutionMethod', 'requireTechnology', 'responseFields',
  'quadraticATolerance', 'quadraticBTolerance', 'quadraticCTolerance',
  'squareRootATolerance', 'squareRootHTolerance', 'squareRootKTolerance', 'predictionTolerance',
];
const VARIANT_PINNED = ['coverageKey', 'dok', 'difficultyBand', 'taskType', 'representation'];
const pick = (doc, keys) => Object.fromEntries(keys.filter((key) => key in doc).map((key) => [key, doc[key]]));
const withoutAccepted = (fields) => fields.map(({ accepted, ...rest }) => rest); // eslint-disable-line no-unused-vars

test('the assessed construct, complexity, tool and response contract equal the committed values', () => {
  for (const [standard, id] of TEMPLATES) {
    const now = draft(standard, id);
    const before = COMMITTED[id];
    const fields = pick(now, PINNED_FIELDS);
    if (fields.responseFields) fields.responseFields = withoutAccepted(fields.responseFields);
    assert.deepEqual(fields, before.fields, `${id} pinned fields`);
    assert.deepEqual((now.variants || []).map((variant) => pick(variant, VARIANT_PINNED)), before.variants, `${id} variants`);
    // The answer format: the table keeps its five rows, the matrix stays 3 x 4
    // with the same coefficients.
    if (before.rows !== undefined) assert.equal(now.points.length, before.rows, `${id} keeps its row count`);
    if (before.coefficients) {
      assert.deepEqual(now.matrix.rows.map((row) => row.length), [4, 4, 4]);
      assert.deepEqual(now.matrix.rows.map((row) => row.slice(0, 3)), before.coefficients, 'same coefficients');
    }
  }
  const model = draft('A2.5B', 'mm_A2_5B_v2_logarithmic-ratio-scale-model').responseFields.find((field) => field.id === 'model');
  assert.deepEqual(model.accepted, [
    'L=10log_{10}(I/{{ref}})', 'L=10\\log_{10}(I/{{ref}})', 'L=10log10(I/{{ref}})', 'L=10log(I/{{ref}})', 'L=10\\log(I/{{ref}})',
  ]);
});
