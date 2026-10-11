import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import buildDefault, {
  buildSystemsWorkspaceReview,
  implemented,
} from '../../src/tools/shared/reviews/systemsWorkspaceReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { parseNumericAnswer } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import { linearEquationForm } from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { STATEMENT_KINDS, SYSTEM_MEANINGS } from '../../functions/shared/toolMath/systemsWorkspace/algebraicOutcomeModel.mjs';
import { PLANE_RELATIONSHIP_OPTIONS } from '../../functions/shared/toolMath/systemsWorkspace/spatialFeedback.mjs';

/*
 * THE SYSTEMS WORKSPACE REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once a Systems Workspace question is closed, its review gives the results
 * (items), the worked steps and a check. Every review here is read back the
 * way a student would follow it — the classification it names, the point it
 * gives (as the decimals a type="number" box takes, and exactly), the boundary
 * points, line styles and shading, the statement and its readings, the plane
 * relationships — turned into the work the workspace sends, and graded by the
 * shared grader the server records with (gradeToolWork). It must come back
 * correct, for several realistic questions of every graded mode: linear,
 * matrix, matrix3, linearQuadratic, inequalities (legacy construct / analyze
 * and the staged student build), algebraic (2×2 and 3×3, every method and
 * the dependent / inconsistent outcomes) and spatial.
 *
 * Each case also nudges one stated answer and checks the grader then refuses
 * it, so a test that passes is about the stated answer, not a grader that
 * accepts anything.
 */

const TOOL_ID = 'systemsWorkspace';
const sw = (fields) => ({ type: TOOL_ID, prompt: 'Systems Workspace question', ...fields });

const SEEDS = ['algebra1', 'algebra2', 'grade8'].flatMap((course) => JSON.parse(
  readFileSync(new URL(`../../seed/pathQuestionBank/${course}_pathQuestionBank_seed.json`, import.meta.url), 'utf8'),
).documents);
const DAY1 = (() => {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === TOOL_ID) { found.push(node); return; }
    Object.values(node).forEach(walk);
  };
  walk(JSON.parse(readFileSync(new URL('../browser/day1SystemsJourneyQuestions.json', import.meta.url), 'utf8')));
  return Object.fromEntries(found.map((question) => [question.questionId, question]));
})();

// A Question Family template with its parameters filled in, the way an instance holds them.
const seed = (id, params) => {
  const template = SEEDS.find((doc) => doc.id === id);
  assert.ok(template, `seed ${id} exists`);
  // Only the parameters given are filled; text elsewhere (variants, reviews) keeps its own.
  return JSON.parse(JSON.stringify(template)
    .replace(/"\{\{(\w+)\}\}"/g, (match, name) => (name in params ? JSON.stringify(params[name]) : match))
    .replace(/\{\{(\w+)(?:\|[^}]*)?\}\}/g, (match, name) => (name in params ? String(params[name]) : match)));
};

/* ------------------------------------------------------------- reading */

const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

const assertAccepted = (question, work, label) => {
  const result = grade(question, work);
  assert.equal(result.graded, true, `${label}: graded (${result.reason})`);
  assert.equal(result.isCorrect, true, `${label}: the grader accepts the stated answer — ${JSON.stringify(result.parts)}`);
  assert.equal(result.score, 1, `${label}: full credit`);
  return result;
};
const assertRefused = (question, work, label) => {
  const result = grade(question, work);
  assert.equal(result.isCorrect, false, `${label}: the grader refuses a changed answer`);
};

const BAD_TEXT = /undefined|NaN|Infinity|\[object|null/;
const textOf = (model) => [model.title, model.why, model.note, ...model.steps, ...model.items.flatMap((item) => [item.label, item.value])].filter(Boolean);

const reviewOf = (question, label) => {
  const model = buildSystemsWorkspaceReview(question);
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.items.length >= 1, `${label}: items`);
  model.items.forEach((item) => {
    assert.deepEqual(Object.keys(item).sort(), ['label', 'value'], `${label}: item shape`);
    assert.ok(typeof item.label === 'string' && item.label.trim(), `${label}: item label is text`);
    assert.ok(typeof item.value === 'string' && item.value.trim(), `${label}: item value is text`);
  });
  assert.ok(model.steps.length >= 1 && model.steps.length <= 12, `${label}: 1–12 steps (textOnlyReview keeps twelve)`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.trim(), `${label}: a step is text`));
  assert.ok(typeof model.why === 'string' && model.why.trim(), `${label}: why is text`);
  assert.ok(model.note === null || (typeof model.note === 'string' && model.note.trim()), `${label}: note is text or null`);
  textOf(model).forEach((text) => assert.doesNotMatch(text, BAD_TEXT, `${label}: no leaked non-text in "${text}"`));
  // The index picks the implemented builder up, and textOnlyReview keeps it intact.
  assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the platform's review is this builder's`);
  return model;
};

const itemValue = (model, label) => {
  const found = model.items.find((item) => item.label === label);
  assert.ok(found, `an item "${label}" in ${JSON.stringify(model.items.map((item) => item.label))}`);
  return found.value;
};
const hasItem = (model, label) => model.items.some((item) => item.label === label);
const numberOf = (text) => {
  const value = parseNumericAnswer(String(text).replace('≈', '').trim());
  assert.ok(Number.isFinite(value), `a number in "${text}"`);
  return value;
};
const pointsIn = (text) => [...String(text).matchAll(/\(([^()]+)\)/g)].map(([, inner]) => inner.split(',').map(numberOf));
// What a student types into a box: ASCII minus.
const typedText = (value) => String(value).replace(/−/g, '-');
const yes = (text) => (text === 'Yes' ? 'yes' : text === 'No' ? 'no' : assert.fail(`Yes/No, not "${text}"`));

const CLASSIFICATIONS = { 'Exactly one solution': 'one', 'No solution': 'none', 'Infinitely many solutions': 'infinite' };

/* =============================================================== linear */

const LINEAR = {
  'integer crossing': sw({ mode: 'linear', system: { m1: 2, b1: 1, m2: -1, b2: 7 } }),
  'fraction crossing': sw({ mode: 'linear', system: { m1: 2, b1: 1, m2: -5, b2: 14 } }),
  'decimal strings': sw({ mode: 'linear', system: { m1: '0.5', b1: '-1', m2: '-1.5', b2: '3' } }),
  'seed A.3F workspace-solve': seed('mm_A_3F_v2_workspace-solve', { m1: 3, m2: -2, x: 4, b1: -5, y: 7, b2: 15 }),
  'seed 8.8.9 intersection': seed('mm_gen_8_8_9_workspace-intersection', { x: -3, y: 4, m1: 2, m2: -4, b1: 10, b2: -8 }),
  'parallel lines': sw({ mode: 'linear', system: { m1: 2, b1: 1, m2: 2, b2: 5 } }),
  'seed A.5C identical lines': seed('mm_A_5C_v2_classify-identical', { m: 3, b: -2 }),
};

test('linear: the classification and the crossing point the review states are what the grader accepts', () => {
  Object.entries(LINEAR).forEach(([label, question]) => {
    const model = reviewOf(question, label);
    const classification = CLASSIFICATIONS[itemValue(model, 'Number of solutions')];
    assert.ok(classification, `${label}: a classification the screen offers`);
    if (classification !== 'one') {
      assert.equal(hasItem(model, 'Intersection point'), false, `${label}: no point for ${classification}`);
      assertAccepted(question, { classification, x: '', y: '' }, label);
      assertRefused(question, { classification: classification === 'none' ? 'infinite' : 'none', x: '', y: '' }, `${label} (other classification)`);
      return;
    }
    const points = pointsIn(itemValue(model, 'Intersection point'));
    // The decimals the student types (the last point stated), and the exact point.
    points.forEach((point) => assertAccepted(question, { classification, x: typedText(point[0]), y: typedText(point[1]) }, `${label} ${JSON.stringify(point)}`));
    const [x, y] = points[points.length - 1];
    assertRefused(question, { classification, x: String(x), y: String(y + 1) }, `${label} (y off by one)`);
  });
  assert.match(itemValue(reviewOf(LINEAR['fraction crossing'], 'fraction'), 'Intersection point'), /^\(13\/7, 33\/7\) ≈ \(1\.86, 4\.71\)$/);
});

/* =============================================================== matrix */

const MATRIX = {
  'one solution': sw({ mode: 'matrix', matrix: { a11: 2, a12: 1, b1: 7, a21: 1, a22: -1, b2: 2 } }),
  'first column starts with 0': sw({ mode: 'matrix', matrix: { a11: 0, a12: 2, b1: 4, a21: 3, a22: 1, b2: 5 } }),
  'fraction solution': sw({ mode: 'matrix', matrix: { a11: 2, a12: 3, b1: 1, a21: 4, a22: -1, b2: 3 } }),
  'no solution': sw({ mode: 'matrix', matrix: { a11: 1, a12: 2, b1: 3, a21: 2, a22: 4, b2: 7 } }),
  'infinitely many': sw({ mode: 'matrix', matrix: { a11: 1, a12: 2, b1: 3, a21: 2, a22: 4, b2: 6 } }),
};

const MATRIX3 = {
  'seed A2.3B RREF technology': seed('mm_A2_3B_v2_matrix-technology-rref', { x: 2, y: -1, z: 3, c1: 4, c2: 8, c3: -3 }),
  'fraction solution': sw({ mode: 'matrix3', matrix: { rows: [[1, 1, 1, 2], [1, -1, 1, 1], [2, 1, -1, 0]] } }),
  'Firestore rows': sw({ mode: 'matrix3', matrix: { rows: [{ cells: [1, 2, 0, 5] }, { cells: [0, 1, 1, 4] }, { cells: [1, 0, 1, 2] }] } }),
  'no solution': sw({ mode: 'matrix3', matrix: { rows: [[1, 1, 1, 4], [2, 2, 2, 9], [1, 2, -1, -3]] } }),
  'infinitely many': sw({ mode: 'matrix3', matrix: { rows: [[1, 1, 1, 4], [2, 2, 2, 8], [1, 2, -1, -3]] } }),
};

test('matrix (2×2): the row-reduced classification and solution are what the grader accepts', () => {
  Object.entries(MATRIX).forEach(([label, question]) => {
    const model = reviewOf(question, label);
    const classification = CLASSIFICATIONS[itemValue(model, 'Number of solutions')];
    if (classification !== 'one') {
      assertAccepted(question, { classification, x: '', y: '' }, label);
      assertRefused(question, { classification: 'one', x: '0', y: '0' }, `${label} (called one)`);
      return;
    }
    const points = pointsIn(itemValue(model, 'Solution'));
    points.forEach((point) => assertAccepted(question, { classification, x: typedText(point[0]), y: typedText(point[1]) }, `${label} ${JSON.stringify(point)}`));
    const [x, y] = points[0];
    assertRefused(question, { classification, x: String(x + 1), y: String(y) }, `${label} (x off by one)`);
  });
});

test('matrix3: the RREF read-off (with the technology used) is what the grader accepts', () => {
  Object.entries(MATRIX3).forEach(([label, question]) => {
    const model = reviewOf(question, label);
    assert.ok(hasItem(model, 'RREF (matrix technology)'), `${label}: the RREF the technology shows`);
    assert.ok(model.steps.some((step) => /Compute RREF/.test(step)), `${label}: the step names the technology`);
    const classification = CLASSIFICATIONS[itemValue(model, 'Number of solutions')];
    if (classification !== 'one') {
      assertAccepted(question, { classification, x: '', y: '', z: '', technologyUsed: true }, label);
      assertRefused(question, { classification: classification === 'none' ? 'infinite' : 'none', x: '', y: '', z: '', technologyUsed: true }, `${label} (other classification)`);
      return;
    }
    const points = pointsIn(itemValue(model, 'Solution'));
    points.forEach((point) => assertAccepted(question, {
      classification, x: typedText(point[0]), y: typedText(point[1]), z: typedText(point[2]), technologyUsed: true,
    }, `${label} ${JSON.stringify(point)}`));
    const [x, y, z] = points[0];
    assertRefused(question, { classification, x: String(x), y: String(y), z: String(z + 1), technologyUsed: true }, `${label} (z off by one)`);
  });
  assert.equal(itemValue(reviewOf(MATRIX3['seed A2.3B RREF technology'], 'seed'), 'Solution'), '(2, −1, 3)');
});

/* ======================================================= linearQuadratic */

const LINEAR_QUADRATIC = {
  'two integer points': sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 1, b: 2 }, quadratic: { a: 1, b: 0, c: -4 } } }),
  'tangent': sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 2, b: -1 }, quadratic: { a: 1, b: 0, c: 0 } } }),
  'irrational points': sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 1, b: 1 }, quadratic: { a: 1, b: 0, c: 0 } } }),
  'fraction point': sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 0, b: 0 }, quadratic: { a: 3, b: -1, c: 0 } } }),
  'no intersection': sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 1, b: 0 }, quadratic: { a: 1, b: 0, c: 1 } } }),
};

test('linearQuadratic: the count and the intersection points are what the grader accepts', () => {
  Object.entries(LINEAR_QUADRATIC).forEach(([label, question]) => {
    const model = reviewOf(question, label);
    const count = numberOf(itemValue(model, 'Number of intersections'));
    if (!count) {
      assertAccepted(question, { count: 0, points: [] }, label);
      assertRefused(question, { count: 1, points: [{ x: 0, y: 0 }] }, `${label} (one point claimed)`);
      return;
    }
    const value = itemValue(model, count === 1 ? 'Intersection point' : 'Intersection points');
    // Each point is stated once exactly (or rounded) and, when a box cannot hold
    // it, once more as the decimals to type: keep the last form of each.
    const stated = value.split(' and ').map((text) => pointsIn(text).at(-1));
    assert.equal(stated.length, count, `${label}: one point per intersection`);
    const points = stated.map(([x, y]) => ({ x, y }));
    assertAccepted(question, { count, points }, label);
    assertAccepted(question, { count, points: [...points].reverse() }, `${label} (any order)`);
    assertRefused(question, { count, points: points.map((point, index) => (index ? point : { ...point, y: point.y + 1 })) }, `${label} (a point moved)`);
  });
});

/* =============================================== inequalities: legacy */

const LEGACY = {
  'seed A.3D solid above': seed('mm_A_3D_v2_graph-solid-above', { m: 2, b: -3 }),
  'seed A.3D dashed below': seed('mm_A_3D_v2_graph-dashed-below', { m: -3, b: 4 }),
  'fractional slope': sw({ mode: 'inequalities', interaction: 'construct', inequalities: [{ m: 0.5, b: 1, relation: '≤' }, { m: -2, b: 3, relation: '>' }] }),
  'seed A2.3F three constraints': seed('mm_A2_3F_v2_three-constraint-region', { m1: 2, b1: -3, m2: -1, b2: 6, c: -2 }),
  'seed A2.3G inclusive feasible': seed('mm_A2_3G_v2_two-inclusive-feasible', { m1: 2, m2: -1, b1: -2, gap: 6, b2: 4, testY: -1 }),
  'seed A2.3G strict boundary': seed('mm_A2_3G_v2_strict-boundary-rejection', { m1: 1, m2: -2, b1: -1, gap: 5, b2: 4 }),
  'seed A2.3G infeasible marked': seed('mm_A2_3G_v2_context-infeasible-marked', { shift: 3, capExtra: 6, testX: 5, requiredY: 2, cap: 16 }),
  'default analyze, no ask': sw({ mode: 'inequalities', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }] }),
};

const legacyWork = (question, model) => {
  const count = question.inequalities.length;
  const work = {};
  if (hasItem(model, 'Inequality 1: two boundary points')) {
    work.construction = Array.from({ length: count }, (_, index) => {
      const k = index + 1;
      const [first, second] = pointsIn(itemValue(model, `Inequality ${k}: two boundary points`));
      return {
        points: [{ x: first[0], y: first[1] }, { x: second[0], y: second[1] }],
        boundaryStyle: itemValue(model, `Inequality ${k}: boundary style`).toLowerCase(),
        shade: itemValue(model, `Inequality ${k}: shade`).startsWith('Above') ? 'above' : 'below',
      };
    });
  }
  const testItem = model.items.find((item) => item.label.startsWith('Is the marked point'));
  if (testItem) work.testChoice = yes(testItem.value);
  if (hasItem(model, 'A point in the feasible region')) {
    const [x, y] = pointsIn(itemValue(model, 'A point in the feasible region')).at(-1);
    work.candidate = { x, y };
  }
  return work;
};

test('inequalities (legacy construct / analyze): boundaries, styles, shading, the marked point and an own point are accepted', () => {
  Object.entries(LEGACY).forEach(([label, question]) => {
    const model = reviewOf(question, label);
    const work = legacyWork(question, model);
    assertAccepted(question, work, label);
    if (work.construction) {
      const flipped = { ...work, construction: work.construction.map((row, index) => (index ? row : { ...row, shade: row.shade === 'above' ? 'below' : 'above' })) };
      assertRefused(question, flipped, `${label} (shading flipped)`);
      const restyled = { ...work, construction: work.construction.map((row, index) => (index ? row : { ...row, boundaryStyle: row.boundaryStyle === 'solid' ? 'dashed' : 'solid' })) };
      assertRefused(question, restyled, `${label} (style flipped)`);
    }
    if (work.testChoice) assertRefused(question, { ...work, testChoice: work.testChoice === 'yes' ? 'no' : 'yes' }, `${label} (marked point misjudged)`);
  });
  // The strict boundary rejects a point on it; the review says so.
  assert.equal(itemValue(reviewOf(LEGACY['seed A2.3G strict boundary'], 'strict'), 'Is the marked point (0, −1) in the feasible region?'), 'No');
  // The own point is open: the review states the criterion with its example.
  assert.match(itemValue(reviewOf(LEGACY['default analyze, no ask'], 'own'), 'A point in the feasible region'), /^Any point that satisfies every inequality, for example \(/);
});

/* ========================================= inequalities: student build */

const STUDENT_BUILD = {
  'all steps with a marked point': sw({
    mode: 'inequalities', studentBuild: true,
    inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }],
    testPoint: { x: 2, y: 4 },
  }),
  'marked point on a boundary (probe)': sw({
    mode: 'inequalities', studentBuild: true,
    inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }],
    testPoint: { x: 4, y: 4 },
  }),
  'reasoning only: region and vertices': sw({
    mode: 'inequalities', reasoning: { classifyRegion: true, vertices: true },
    inequalities: [{ m: 0, b: 0, relation: '>=' }, { orientation: 'vertical', x: 0, relation: '>=' }, { m: -1, b: 4, relation: '<' }],
  }),
  'modeling': sw({
    mode: 'inequalities', studentBuild: { boundary: true }, reasoning: { classifyRegion: true },
    graph: { xMin: -2, xMax: 14, yMin: -2, yMax: 14 },
    modeling: {
      variables: [{ symbol: 'a', label: 'adults' }, { symbol: 'c', label: 'children' }],
      expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }, { A: 12, B: 8, C: -96, relation: '<=' }],
    },
  }),
  'rewrite': sw({
    mode: 'inequalities', studentBuild: { rewrite: true, boundary: true, lineStyle: true, shading: true },
    sourceConstraints: ['2x + y >= 4', 'x - y <= 1'],
    expectedConstraints: [{ A: 2, B: 1, C: -4, relation: '>=' }, { A: 1, B: -1, C: -1, relation: '<=' }],
  }),
  'vertical and horizontal boundaries': sw({
    mode: 'inequalities', studentBuild: { boundary: true, lineStyle: true, shading: true },
    inequalities: [{ orientation: 'vertical', x: 2, relation: '<' }, { orientation: 'horizontal', y: -1, relation: '>=' }],
  }),
  'own test point': sw({
    mode: 'inequalities', reasoning: { testPoint: true, classifyRegion: true },
    inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }],
  }),
  'no overlap': sw({
    mode: 'inequalities', studentBuild: { boundary: true, shading: true }, reasoning: { classifyRegion: true, vertices: true },
    inequalities: [{ m: 1, b: 4, relation: '>=' }, { m: 1, b: -2, relation: '<=' }],
  }),
};

const relationOf = (symbol) => ({ '≥': '>=', '≤': '<=', '>': '>', '<': '<' }[symbol]);
// "12a + 8c ≤ 96" -> its coefficients, symbol and constant, read back from the text.
const parseInequality = (text, names) => {
  const match = text.replace(/−/g, '-').match(/^(.*?)\s*(≥|≤|>|<)\s*(.*)$/);
  assert.ok(match, `an inequality in "${text}"`);
  const form = linearEquationForm(`${match[1]} = ${match[3]}`, names);
  assert.ok(form, `a linear inequality in "${text}"`);
  return { coefficients: form.coefficients, constant: form.constant, relation: relationOf(match[2]) };
};

const studentBuildWork = (question, model) => {
  const names = question.modeling ? question.modeling.variables.map((variable) => variable.symbol) : ['x', 'y'];
  const count = (question.modeling?.expectedConstraints || question.expectedConstraints || question.inequalities).length;
  const work = { build: [], regionClassification: '', vertices: [] };
  if (question.modeling) {
    work.modelingEntries = Array.from({ length: count }, (_, index) => {
      const parsed = parseInequality(itemValue(model, `Constraint ${index + 1} (model)`), names);
      return { coeffA: String(parsed.coefficients[names[0]]), coeffB: String(parsed.coefficients[names[1]]), relation: parsed.relation, constant: String(parsed.constant) };
    });
    work.modelingSent = true;
  }
  if (hasItem(model, 'Constraint 1 rewritten')) {
    work.rewrite = Array.from({ length: count }, (_, index) => {
      const text = itemValue(model, `Constraint ${index + 1} rewritten`);
      const parsed = parseInequality(text, ['x', 'y']);
      // y alone: A·x + 1·y + C (rel) 0, as EmbeddedInequalityRewrite sends it.
      assert.equal(parsed.coefficients.y, 1, `${text}: y is alone`);
      return { relation: text, graphingForm: { A: parsed.coefficients.x, B: 1, C: -parsed.constant, relation: parsed.relation } };
    });
  }
  work.build = Array.from({ length: count }, (_, index) => {
    const k = index + 1;
    const entry = {
      method: '', x1: '', y1: '', x2: '', y2: '', slope: '', intercept: '', constant: '',
      point1Plotted: false, point2Plotted: false, boundaryAttempts: 0, style: '', styleAttempts: 0, shadePoint: null, shadeAttempts: 0, visible: true,
    };
    if (hasItem(model, `Constraint ${k}: boundary`)) {
      const text = itemValue(model, `Constraint ${k}: boundary`);
      const line = text.match(/^(Vertical|Horizontal) line \w+ = (\S+)$/);
      if (line) Object.assign(entry, { method: line[1].toLowerCase(), constant: typedText(line[2]) });
      else {
        // The two points after "through" (the line itself may hold a bracketed fraction).
        const [[x1, y1], [x2, y2]] = pointsIn(text.split(' through ')[1]);
        Object.assign(entry, { method: 'points', x1, y1, x2, y2, point1Plotted: true, point2Plotted: true });
      }
      entry.boundaryAttempts = 1;
    }
    if (hasItem(model, `Constraint ${k}: line`)) Object.assign(entry, { style: itemValue(model, `Constraint ${k}: line`).toLowerCase(), styleAttempts: 1 });
    if (hasItem(model, `Constraint ${k}: shading`)) Object.assign(entry, { shadePoint: pointsIn(itemValue(model, `Constraint ${k}: shading`).split('containing ')[1])[0], shadeAttempts: 1 });
    return entry;
  });
  if (hasItem(model, 'Solution region')) {
    work.regionClassification = { 'Bounded region': 'bounded', 'Unbounded region': 'unbounded', 'No solution': 'empty' }[itemValue(model, 'Solution region')];
  }
  const marked = model.items.find((item) => /^Marked point .*: each inequality$/.test(item.label));
  if (marked) {
    const prefix = marked.label.replace(/: each inequality$/, '');
    const probe = hasItem(model, `${prefix}: on a boundary line?`);
    work.teacherPointResponse = {
      perInequality: marked.value.split(', ').map(yes),
      overall: yes(itemValue(model, `${prefix}: the whole system`)),
      onBoundary: probe ? yes(itemValue(model, `${prefix}: on a boundary line?`)) : '',
      boundaryIncluded: probe ? yes(itemValue(model, `${prefix}: included in the region?`)) : '',
    };
  }
  if (hasItem(model, 'Your own test point (example)')) {
    work.studentTestPoint = pointsIn(itemValue(model, 'Your own test point (example)'))[0];
    work.studentPointResponse = {
      perInequality: itemValue(model, 'Your point: each inequality').split(', ').map(yes),
      overall: yes(itemValue(model, 'Your point: the whole system')),
      onBoundary: '', boundaryIncluded: '',
    };
  }
  if (hasItem(model, 'Vertices')) {
    const text = itemValue(model, 'Vertices');
    work.vertices = text === 'none' ? [] : text.split('; ').map((part) => {
      const [[x, y]] = pointsIn(part);
      return { x, y, includedAnswer: part.endsWith(' not included') ? 'no' : 'yes' };
    });
  }
  return work;
};

test('inequalities (student build): every step the review states is what the grader accepts', () => {
  Object.entries(STUDENT_BUILD).forEach(([label, question]) => {
    const model = reviewOf(question, label);
    const work = studentBuildWork(question, model);
    const result = assertAccepted(question, work, label);
    assert.equal(result.isComplete, true, `${label}: complete`);
    // Each graded piece can fail: misjudge the first piece the review states.
    if (work.build.some((entry) => entry.shadePoint)) {
      const index = work.build.findIndex((entry) => entry.shadePoint);
      const [x, y] = work.build[index].shadePoint;
      const across = [[x, y + 20], [x, y - 20], [x + 20, y], [x - 20, y]].find(([px, py]) => {
        const moved = { ...work, build: work.build.map((entry, position) => (position === index ? { ...entry, shadePoint: [px, py] } : entry)) };
        return grade(question, moved).isCorrect === false;
      });
      assert.ok(across, `${label}: a shade point on the other side is refused`);
    }
    if (work.regionClassification) {
      assertRefused(question, { ...work, regionClassification: work.regionClassification === 'bounded' ? 'unbounded' : 'bounded' }, `${label} (region misclassified)`);
    }
    if (work.teacherPointResponse) {
      assertRefused(question, { ...work, teacherPointResponse: { ...work.teacherPointResponse, overall: work.teacherPointResponse.overall === 'yes' ? 'no' : 'yes' } }, `${label} (marked point misjudged)`);
    }
    if (work.vertices.length) {
      assertRefused(question, { ...work, vertices: work.vertices.map((vertex) => ({ ...vertex, includedAnswer: vertex.includedAnswer === 'yes' ? 'no' : 'yes' })) }, `${label} (inclusion flipped)`);
    }
    if (work.modelingEntries) {
      assertRefused(question, { ...work, modelingEntries: work.modelingEntries.map((entry, index) => (index ? entry : { ...entry, constant: String(Number(entry.constant) + 1) })) }, `${label} (model constant changed)`);
    }
  });
  const probe = reviewOf(STUDENT_BUILD['marked point on a boundary (probe)'], 'probe');
  assert.equal(itemValue(probe, 'Marked point (4, 4): included in the region?'), 'No', 'on a dashed boundary: not included');
  assert.equal(itemValue(reviewOf(STUDENT_BUILD['reasoning only: region and vertices'], 'vertices'), 'Vertices'), '(0, 0) included; (4, 0) not included; (0, 4) not included');
  assert.equal(itemValue(reviewOf(STUDENT_BUILD['no overlap'], 'empty'), 'Solution region'), 'No solution');
});

/* =========================================================== algebraic 2×2 */

const PAIRS = {
  'day1 warm-up 1 (elimination)': DAY1['3x3-d1-wu-1'],
  'day1 warm-up 2 (student choice)': DAY1['3x3-d1-wu-2'],
  'day1 CCMR bridge (elimination)': DAY1['3x3-d1-pr-6-ccmr-bridge'],
  'substitution, y already alone': sw({ mode: 'algebraic', method: 'substitution', equations: ['y = 2x + 1', 'x + y = 7'], variables: ['x', 'y'] }),
  'exact fractional solution': sw({ mode: 'algebraic', method: 'elimination', exactSolution: true, equations: ['2x + 3y = 5', '5x - y = 4'] }),
  'one-variable equation': sw({ mode: 'algebraic', method: 'substitution', equations: ['2x = 6', 'x + 3y = 9'] }),
  'own variable names, no verification': sw({ mode: 'algebraic', method: 'studentChoice', requireVerification: false, equations: ['4a + 6b = 2', '6a - 4b = 16'], variables: ['a', 'b'] }),
  // Old V5 content stored with mode "linear": the workspace (and the grader) still solve it algebraically.
  'old V5 content stored as linear': sw({ mode: 'linear', studentActions: ['solveSystem'], method: 'elimination', equations: ['x + y = 11', '2x - y = 4'], requireVerification: true }),
};

const PAIR_SPECIAL = {
  'dependent (elimination)': sw({ mode: 'algebraic', method: 'elimination', equations: ['x + y = 2', '2x + 2y = 4'] }),
  'inconsistent (substitution)': sw({ mode: 'algebraic', method: 'substitution', equations: ['x + y = 2', '2x + 2y = 5'] }),
  'inconsistent (student choice)': sw({ mode: 'algebraic', method: 'studentChoice', equations: ['3x - 6y = 9', '-2x + 4y = 4'] }),
};

const variablesOf = (question, count) => (Array.isArray(question.variables) && question.variables.length === count ? question.variables : ['x', 'y', 'z'].slice(0, count));

// The sides typed in each original-equation check, read from "left side …, right side …".
const verificationFrom = (model, count) => Object.fromEntries(Array.from({ length: count }, (_, index) => {
  const label = `Check Equation ${index + 1}`;
  if (!hasItem(model, label)) return null;
  const match = itemValue(model, label).match(/^left side (\S+)(?: \(given\))?, right side (\S+)(?: \(given\))?$/);
  assert.ok(match, `${label}: both sides stated`);
  return [`E${index + 1}`, { left: typedText(match[1]), right: typedText(match[2]) }];
}).filter(Boolean));

const valuesFrom = (model, vars) => {
  const [point] = pointsIn(itemValue(model, `Solution (${vars.join(', ')})`));
  assert.equal(point.length, vars.length, 'one value per variable');
  return Object.fromEntries(vars.map((name, index) => [name, point[index]]));
};

test('algebraic 2×2: the solved pair and the original-equation check are what the grader accepts', () => {
  Object.entries(PAIRS).forEach(([label, question]) => {
    assert.ok(question, `${label}: fixture`);
    const model = reviewOf(question, label);
    const vars = variablesOf(question, 2);
    const values = valuesFrom(model, vars);
    const verification = verificationFrom(model, 2);
    assert.equal(Object.keys(verification).length, question.requireVerification === false ? 0 : 2, `${label}: a check per equation when verification is on`);
    const work = { dimension: 2, method: question.method === 'studentChoice' ? '' : question.method, values, verification, reducedStatement: null, specialCase: { statementTruth: '', solutionCount: '', classification: '' } };
    assertAccepted(question, work, label);
    assertRefused(question, { ...work, values: { ...values, [vars[0]]: values[vars[0]] + 1 } }, `${label} (a value off by one)`);
    if (Object.keys(verification).length) {
      assertRefused(question, { ...work, verification: { ...verification, E1: { ...verification.E1, left: String(Number(verification.E1.left) + 1) } } }, `${label} (a side mistyped)`);
    }
  });
  assert.equal(itemValue(reviewOf(PAIRS['exact fractional solution'], 'exact'), 'Solution (x, y)'), '(1, 1)');
  assert.equal(itemValue(reviewOf(PAIRS['day1 warm-up 1 (elimination)'], 'wu-1'), 'Solution (x, y)'), '(−3, −4)');
});

test('algebraic 2×2 dependent / inconsistent: the statement and its three readings are what the grader accepts', () => {
  Object.entries(PAIR_SPECIAL).forEach(([label, question]) => {
    const model = reviewOf(question, label);
    const work = {
      dimension: 2, method: '', values: {}, verification: {},
      reducedStatement: itemValue(model, 'Statement with no variable'),
      specialCase: {
        statementTruth: itemValue(model, 'Is the statement true or false?').toLowerCase(),
        solutionCount: { 'No solution': 'none', 'Infinitely many solutions': 'infinite' }[itemValue(model, 'What does that mean for the system?')],
        classification: { Inconsistent: 'inconsistent', 'Consistent and dependent': 'consistent-dependent' }[itemValue(model, 'Classification')],
      },
    };
    assertAccepted(question, work, label);
    assertRefused(question, { ...work, specialCase: { ...work.specialCase, statementTruth: work.specialCase.statementTruth === 'true' ? 'false' : 'true' } }, `${label} (truth flipped)`);
    assertRefused(question, { ...work, reducedStatement: work.reducedStatement === '0 = 0' ? '0 = 3' : '0 = 0' }, `${label} (the other statement)`);
  });
});

/* =========================================================== algebraic 3×3 */

const TRIPLES = {
  'day1 classwork (elimination)': DAY1['3x3-d1-cw-2'],
  'day1 practice 1 (elimination)': DAY1['3x3-d1-pr-1'],
  'day1 practice 2 (student choice)': DAY1['3x3-d1-pr-2'],
  'day1 practice 3 (elimination, scaling)': DAY1['3x3-d1-pr-3'],
  'day1 practice 5 (elimination)': DAY1['3x3-d1-pr-5'],
  'day1 DOL (elimination)': DAY1['3x3-d1-dol-1'],
  'substitution': sw({ mode: 'algebraic', method: 'substitution', equations: ['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'] }),
  'fractional solution (elimination)': sw({ mode: 'algebraic', method: 'elimination', equations: ['x + y + z = 2', 'x - y + z = 1', '2x + y - z = 0'] }),
  'a missing variable (substitution)': sw({ mode: 'algebraic', method: 'substitution', equations: ['x + y = 3', 'y + z = 5', 'x + z = 4'], variables: ['x', 'y', 'z'] }),
};

const TRIPLE_SPECIAL = {
  'dependent': sw({ mode: 'algebraic', method: 'elimination', equations: ['2x + y - 3z = 5', 'x + 2y - 4z = 7', '6x + 3y - 9z = 15'] }),
  'inconsistent, parallel planes': sw({ mode: 'algebraic', method: 'elimination', equations: ['3x - y - 2z = 4', '6x - 2y - 4z = 11', '9x - 3y - 6z = 12'] }),
  'dependent, every pair a line': sw({ mode: 'algebraic', method: 'elimination', equations: ['x + y + z = 3', 'x - y + 2z = 4', '2x + 3z = 7'] }),
  'inconsistent, every pair a line': sw({ mode: 'algebraic', method: 'elimination', equations: ['x + y + z = 3', 'x - y + 2z = 4', '2x + 3z = 8'] }),
};

test('algebraic 3×3: the solved triple and the check in all three equations are what the grader accepts', () => {
  Object.entries(TRIPLES).forEach(([label, question]) => {
    assert.ok(question, `${label}: fixture`);
    const model = reviewOf(question, label);
    const vars = variablesOf(question, 3);
    const values = valuesFrom(model, vars);
    const method = question.method === 'studentChoice' ? itemValue(model, 'Method').toLowerCase() : question.method;
    const work = { dimension: 3, method, values, verification: verificationFrom(model, 3) };
    assertAccepted(question, work, label);
    assertRefused(question, { ...work, values: { ...values, [vars[2]]: values[vars[2]] + 1 } }, `${label} (a value off by one)`);
  });
  assert.equal(itemValue(reviewOf(TRIPLES['fractional solution (elimination)'], 'fraction'), 'Solution (x, y, z)'), '(1/3, 1/2, 7/6)');
  assert.equal(itemValue(reviewOf(TRIPLES['day1 classwork (elimination)'], 'cw-2'), 'Solution (x, y, z)'), '(3, 1, 5)');
});

test('algebraic 3×3 dependent / inconsistent: the statement, its reading and every plane pair are what the grader accepts', () => {
  const meaning = Object.fromEntries(SYSTEM_MEANINGS.map((option) => [option.label, option.value]));
  const kind = Object.fromEntries(STATEMENT_KINDS.map((option) => [option.label, option.value]));
  const plane = Object.fromEntries(PLANE_RELATIONSHIP_OPTIONS.map((option) => [option.label, option.value]));
  Object.entries(TRIPLE_SPECIAL).forEach(([label, question]) => {
    const model = reviewOf(question, label);
    const work = {
      dimension: 3, method: 'elimination', values: {}, verification: {},
      outcome: {
        statement: itemValue(model, 'Statement with no variable'),
        classificationChoice: meaning[itemValue(model, 'What it means for the system')],
        classificationKind: kind[itemValue(model, 'What kind of statement is it?')],
        planes: {
          '1-2': plane[itemValue(model, 'Planes 1 and 2')],
          '1-3': plane[itemValue(model, 'Planes 1 and 3')],
          '2-3': plane[itemValue(model, 'Planes 2 and 3')],
        },
      },
    };
    assertAccepted(question, work, label);
    assertRefused(question, { ...work, outcome: { ...work.outcome, classificationChoice: 'unique' } }, `${label} (called unique)`);
    const wrongPlanes = { ...work.outcome.planes, '1-2': work.outcome.planes['1-2'] === 'line' ? 'parallel' : 'line' };
    assertRefused(question, { ...work, outcome: { ...work.outcome, planes: wrongPlanes } }, `${label} (a plane pair misread)`);
  });
});

/* ================================================================ spatial */

test('spatial: each answer field\'s stated answer is what the grader accepts', () => {
  ['3x3-d1-cw-1', '3x3-d1-cw-3', '3x3-d1-pr-4', '3x3-d1-dol-2'].forEach((id) => {
    const question = DAY1[id];
    assert.ok(question, `${id}: fixture`);
    const model = reviewOf(question, id);
    assert.equal(model.items.length, question.answerFields.length, `${id}: one item per answer field`);
    const responses = question.answerFields.map((field, index) => ({ id: field.id, value: model.items[index].value }));
    assertAccepted(question, { responses }, id);
    const other = question.answerFields[0].options.find((option) => option !== responses[0].value);
    assertRefused(question, { responses: [{ ...responses[0], value: other }, ...responses.slice(1)] }, `${id} (another option)`);
  });
  // A typed (numeric) answer field is stated as authored.
  const numeric = sw({
    mode: 'spatial', spatialModel: { kind: 'threePlanes' }, studentActions: ['connectRepresentations'],
    equations: DAY1['3x3-d1-cw-1'].equations, variables: ['x', 'y', 'z'],
    answerFields: [{ id: 'z', label: 'What is the z-coordinate of the common point?', type: 'number', answer: 5 }],
  });
  const numericModel = reviewOf(numeric, 'numeric field');
  assert.equal(itemValue(numericModel, 'What is the z-coordinate of the common point?'), '5');
  assertAccepted(numeric, { responses: [{ id: 'z', value: '5' }] }, 'numeric field');
  assertRefused(numeric, { responses: [{ id: 'z', value: '3' }] }, 'numeric field (another value)');
  // The geometry it states is the system's own.
  assert.match(reviewOf(DAY1['3x3-d1-dol-2'], 'dol-2').why, /^\(1, −2, 4\) lies on all three planes/);
  // The point is reached by the worked steps (K: the three-plane model shows
  // its derivation), so it is named in the step that concludes it.
  assert.match(numericModel.steps.find((step) => /single point/.test(step)) || '', /single point \(3, 1, 5\)/);
});

/* ======================================================= wiring and nulls */

test('the index serves this builder, and empty or malformed questions get no review (never a throw)', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS.systemsWorkspace, buildSystemsWorkspaceReview);
  assert.equal(buildDefault, buildSystemsWorkspaceReview);
  const cases = [
    null, undefined, {}, [], 'linear', 42,
    sw({}),
    sw({ mode: 'linear' }),
    sw({ mode: 'linear', system: { m1: 'a', b1: 1, m2: 2, b2: 3 } }),
    sw({ mode: 'linear', system: { m1: '{{m1}}', b1: '{{b1}}', m2: '{{m2}}', b2: '{{b2}}' } }),
    sw({ mode: 'matrix', matrix: { a11: 1 } }),
    sw({ mode: 'matrix3', matrix: { rows: [[1, 2], [3]] } }),
    sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 1 }, quadratic: { a: 0 } } }),
    sw({ mode: 'inequalities', inequalities: [] }),
    sw({ mode: 'inequalities', inequalities: [{ m: 1, b: 2, relation: '=' }] }),
    sw({ mode: 'inequalities', inequalities: [{ m: '{{m}}', b: '{{b}}', relation: '>=' }] }),
    sw({ mode: 'algebraic', equations: ['x +', 'y'] }),
    sw({ mode: 'algebraic', equations: ['x^2 + y = 3', 'x - y = 1'] }),
    sw({ mode: 'algebraic', equations: [1, 2] }),
    // A nonunique 3×3 outside the elimination workflow is not graded.
    sw({ mode: 'algebraic', method: 'substitution', equations: TRIPLE_SPECIAL.dependent.equations }),
    sw({ mode: 'spatial', answerFields: [] }),
    sw({ mode: 'spatial', spatialModel: { kind: 'threePlanes' }, equations: ['x + y + z = 1', 'x = 0', 'y = 0'] }),
    sw({ mode: 'spatial', answerFields: [{ id: 'a', label: 'Which?' }] }),
  ];
  cases.forEach((question) => {
    assert.doesNotThrow(() => buildSystemsWorkspaceReview(question));
    assert.equal(buildSystemsWorkspaceReview(question), null, `no review for ${JSON.stringify(question)}`);
  });
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
  assert.equal(buildToolSolutionReviewModel(null), null);
});
