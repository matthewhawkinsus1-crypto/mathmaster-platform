import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildIntervalNumberLineReview,
  implemented,
} from '../../src/tools/shared/reviews/intervalNumberLineReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  normalizeIntervals,
  parseInequalityText,
  resolveIntervalAsk,
  sameIntervals,
} from '../../functions/shared/toolMath/intervalNumberLine/intervalMath.mjs';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';

/*
 * THE NUMBER-LINE REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once an intervalNumberLine question is closed, its review names the graph
 * to build, the interval notation and the inequality — one item per stage the
 * question asks for. Every review here is read back as the work a student
 * following it would submit: the circles and shading it describes become the
 * pieces the tool builds, the notation and inequality it states are typed
 * into the boxes as written. That work is graded by the shared grader the
 * server records with (gradeToolWork) and must come back correct — and the
 * same work with every endpoint flipped open/closed must not.
 *
 * The check the review gives ("why") is verified independently: every test
 * number it says is or is not shaded, and every endpoint it says gets a
 * closed or open circle, is checked against the question's key directly.
 */

const TOOL_ID = 'intervalNumberLine';
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });
const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;
const q = (fields) => ({ type: TOOL_ID, prompt: 'Graph the solution on the number line.', min: -10, max: 10, ...fields });

/* ------------------------------------------------------------------ */
/* realistic questions                                                 */
/* ------------------------------------------------------------------ */

const catalog = QUESTION_TYPE_CATALOG.intervalNumberLine;

const fixtureQuestions = JSON.parse(fs.readFileSync(
  new URL('../platform/fixtures/attributesAndRelationsOfFunctions.json', import.meta.url),
  'utf8',
));
const fromFixture = [];
(function walk(node) {
  if (Array.isArray(node)) node.forEach(walk);
  else if (node && typeof node === 'object') {
    if (node.type === TOOL_ID) fromFixture.push(node);
    Object.values(node).forEach(walk);
  }
}(fixtureQuestions));

const compiled = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Inequalities on the number line', courseId: 'algebra2' },
  sections: [{
    role: 'practice',
    questions: [
      {
        prompt: 'Solve 3x + 2 > 14, then graph the solution and write it in interval notation.',
        studentActions: ['constructInterval', 'writeInterval'],
        inequalityText: 'x > 4',
        intervals: [{ min: 4, max: null, minClosed: false, maxClosed: false }],
        min: -10,
        max: 10,
      },
      {
        prompt: 'Write -2 < x ≤ 6 in interval notation.',
        studentActions: ['writeInterval'],
        intervals: [{ min: -2, max: 6, minClosed: false, maxClosed: true }],
      },
      {
        prompt: 'Graph x ≤ -1 or x ≥ 3 on the number line.',
        studentActions: ['constructInterval'],
        intervals: [{ min: null, max: -1, maxClosed: true }, { min: 3, max: null, minClosed: true }],
      },
    ],
  }],
}).package.sections[0].questions;

// [label, question]
const QUESTIONS = [
  ['catalog example −3 ≤ x < 5', catalog.example],
  ['catalog compound x ≤ −4 or x > 2', catalog.unboundedExample],
  ...fromFixture.map((question, index) => [`unit fixture ${index + 1}: ${question.inequalityText}`, question]),
  ['V5 solve 3x + 2 > 14 (graph + interval)', compiled[0]],
  ['V5 interval only −2 < x ≤ 6', compiled[1]],
  ['V5 graph only x ≤ −1 or x ≥ 3', compiled[2]],
  // The Path families' shapes (grade 6 / grade 7 / Algebra 2 seeds), authored
  // as registry-tool questions.
  ['grade 6 x > −3, graph only', q({ prompt: 'Graph the solution $x>-3$ on the number line.', step: 1, variable: 'x', ask: ['graph'], inequalityText: 'x > -3', intervals: [{ min: -3, max: null, minClosed: false, maxClosed: false }] })],
  ['grade 7 x ≥ 2 after solving', q({ prompt: 'A requirement is modeled by $4x-3>=5$. Solve it, then represent all qualifying values on the number line.', ask: ['graph', 'interval'], inequalityText: 'x>=2', intervals: [{ min: '2', max: null, minClosed: true, maxClosed: false }] })],
  ['Algebra 2 exterior (x + 2)(x − 5) ≥ 0', q({ prompt: 'Solve $(x-(-2))(x-(5))\\ge0$. Graph the COMPLETE solution on the number line and give the matching interval notation.', ask: ['graph', 'interval'], intervals: [{ min: null, max: -2, minClosed: false, maxClosed: true }, { min: 5, max: null, minClosed: true, maxClosed: false }] })],
  // The shared grader's own fixtures (tests/tools/intervalNumberLineSharedGrading.test.mjs).
  ['rays authored with null / "inf"', q({ min: -8, max: 8, intervals: [{ min: null, max: -3, minClosed: false, maxClosed: true }, { min: 2, max: 'inf', minClosed: false, maxClosed: false }], ask: ['graph', 'interval'] })],
  ['fraction endpoints −13/8 ≤ x < 13/8', q({ intervals: [{ min: -1.625, max: 1.625, minClosed: true, maxClosed: false }], ask: ['graph', 'interval'] })],
  ['root endpoint x ≥ √5, interval only', q({ intervals: [{ min: Math.sqrt(5), max: null, minClosed: true, maxClosed: false }], ask: ['interval'] })],
  ['inequality stage in t', q({ intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }], ask: ['graph', 'inequality'], variable: 't' })],
  ['all three stages', q({ intervals: [{ min: null, max: -3, maxClosed: true }, { min: 2, max: null }], ask: ['graph', 'interval', 'inequality'] })],
  ['graph only x ≥ 4', q({ intervals: [{ min: 4, max: null, minClosed: true }], ask: ['graph'] })],
  ['no ask: graph + interval', q({ intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }] })],
  // More shapes.
  ['both ends open, all three stages', q({ inequalityText: '-6 < x < -1', intervals: [{ min: -6, max: -1 }], ask: ['graph', 'interval', 'inequality'] })],
  ['both ends closed, decimals', q({ intervals: [{ min: 0.5, max: 2.75, minClosed: true, maxClosed: true }], ask: ['graph', 'interval', 'inequality'] })],
  ['x ≠ 3: two open rays meeting', q({ intervals: [{ min: null, max: 3 }, { min: 3, max: null }], ask: ['graph', 'interval', 'inequality'] })],
  ['three pieces', q({ intervals: [{ min: null, max: -5, maxClosed: true }, { min: -1, max: 1, minClosed: true }, { min: 4, max: null }], ask: ['graph', 'interval'] })],
  ['a third: 1/3 ≤ x < 2', q({ intervals: [{ min: 1 / 3, max: 2, minClosed: true }], ask: ['graph', 'interval'] })],
  ['±√2 endpoints, graph + interval', q({ intervals: [{ min: -Math.SQRT2, max: Math.SQRT2 }], ask: ['graph', 'interval'] })],
  ['from / to keys, text endpoints, unsorted pieces', q({ intervals: [{ from: '7', to: null, minClosed: true }, { from: '-2', to: '1', minClosed: false, maxClosed: true }], ask: ['graph', 'interval', 'inequality'] })],
  ['LaTeX inequalityText is left unread', q({ inequalityText: 'x \\ge 1', intervals: [{ min: 1, max: null, minClosed: true }], ask: ['interval', 'inequality'] })],
];

/* ------------------------------------------------------------------ */
/* reading the review back as work                                     */
/* ------------------------------------------------------------------ */

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.ok(typeof model.title === 'string' && model.title, `${label}: title`);
  assert.ok(model.items.length >= 2, `${label}: items`);
  model.items.forEach((item) => {
    assert.ok(typeof item.label === 'string' && item.label, `${label}: item label`);
    assert.ok(typeof item.value === 'string' && item.value, `${label}: item value`);
  });
  assert.ok(model.steps.length >= 2 && model.steps.length <= 12, `${label}: steps (textOnlyReview keeps 12)`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.length > 20, `${label}: each step is a sentence`));
  assert.ok(typeof model.why === 'string' && model.why.length > 20, `${label}: why`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note`);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${label}: plain text, nothing else`);
  assert.doesNotMatch(JSON.stringify({ ...model, note: model.note ?? '' }), /NaN|undefined|Infinity|\[object|null/, `${label}: no broken value`);
};

// A number as the review writes it: −3, 1.625, 1/3, √5, −√2.
const readNumber = (text) => {
  const source = text.replace(/−/g, '-');
  const root = source.match(/^(-?)√(\d+)$/);
  if (root) return (root[1] ? -1 : 1) * Math.sqrt(Number(root[2]));
  const fraction = source.match(/^(-?\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const number = Number(source);
  assert.ok(Number.isFinite(number), `a number the review states: ${text}`);
  return number;
};

// The pieces a student builds from the "Number-line graph" item.
const graphFromReview = (model) => {
  const value = itemValue(model, 'Number-line graph');
  assert.ok(value, 'the review describes the graph');
  return value.split('; ').map((part) => {
    const ray = part.match(/^(closed|open) circle at (\S+), shaded (left|right)$/);
    if (ray) {
      const at = readNumber(ray[2]);
      const closed = ray[1] === 'closed';
      return ray[3] === 'left'
        ? { min: -Infinity, max: at, minClosed: false, maxClosed: closed }
        : { min: at, max: Infinity, minClosed: closed, maxClosed: false };
    }
    const segment = part.match(/^(closed|open) circle at (\S+), (closed|open) circle at (\S+), shaded between$/);
    assert.ok(segment, `a graph piece the tool can build: ${part}`);
    return { min: readNumber(segment[2]), max: readNumber(segment[4]), minClosed: segment[1] === 'closed', maxClosed: segment[3] === 'closed' };
  });
};

// What the notation box receives for the stated notation: as written, with a
// root typed the way the tool's endpoint reader takes it (sqrt(5)).
const typedNotation = (text) => text.replace(/√(\d+)/g, 'sqrt($1)');

const workFromReview = (model, question) => {
  const ask = resolveIntervalAsk(question.ask);
  return {
    intervals: ask.includes('graph') ? graphFromReview(model) : [],
    notation: ask.includes('interval') ? typedNotation(itemValue(model, 'Interval notation')) : '',
    inequality: ask.includes('inequality') ? itemValue(model, 'Inequality') : '',
  };
};

// The same work with every finite endpoint flipped open ↔ closed.
const flipped = (work) => ({
  intervals: work.intervals.map((piece) => ({
    ...piece,
    minClosed: Number.isFinite(piece.min) ? !piece.minClosed : false,
    maxClosed: Number.isFinite(piece.max) ? !piece.maxClosed : false,
  })),
  notation: work.notation.replace(/[[\]()]/g, (bracket) => ({ '[': '(', '(': '[', ']': ')', ')': ']' })[bracket]),
  inequality: work.inequality.replace(/[≤<≥>]/g, (symbol) => ({ '≤': '<', '<': '≤', '≥': '>', '>': '≥' })[symbol]),
});

const keyOf = (question) => normalizeIntervals(question.intervals);
const inKey = (question, value) => keyOf(question).some((piece) => (piece.minClosed ? value >= piece.min : value > piece.min)
  && (piece.maxClosed ? value <= piece.max : value < piece.max));

/* ------------------------------------------------------------------ */
/* the tests                                                           */
/* ------------------------------------------------------------------ */

test('the number-line review is implemented and the review index picks it up', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS.intervalNumberLine, buildIntervalNumberLineReview);
  QUESTIONS.forEach(([label, question]) => {
    const model = buildIntervalNumberLineReview(question);
    assert.ok(model, `${label}: a review`);
    assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the index returns this model`);
  });
});

test('every realistic question gets a text-only review with one item per asked stage', () => {
  assert.ok(fromFixture.length >= 2, 'the unit fixture still carries number-line questions');
  QUESTIONS.forEach(([label, question]) => {
    const model = buildIntervalNumberLineReview(question);
    assertTextOnly(model, label);
    const ask = resolveIntervalAsk(question.ask);
    assert.equal(Boolean(itemValue(model, 'Number-line graph')), ask.includes('graph'), `${label}: graph item`);
    assert.equal(Boolean(itemValue(model, 'Interval notation')), ask.includes('interval'), `${label}: notation item`);
    assert.equal(Boolean(itemValue(model, 'Inequality')), ask.includes('inequality'), `${label}: inequality item`);
  });
});

test('the work the review describes is what the shared grader marks correct — and flipping its endpoints is not', () => {
  QUESTIONS.forEach(([label, question]) => {
    const model = buildIntervalNumberLineReview(question);
    const work = workFromReview(model, question);
    const verdict = grade(question, work);
    assert.equal(verdict.graded, true, `${label}: graded (${verdict.reason})`);
    assert.equal(verdict.isCorrect, true, `${label}: the stated answer is correct ${JSON.stringify(verdict.parts)}`);
    assert.equal(verdict.isComplete, true, `${label}: complete`);
    assert.equal(verdict.parts.length, resolveIntervalAsk(question.ask).length, `${label}: every asked stage graded`);
    const wrong = grade(question, flipped(work));
    assert.equal(wrong.graded, true, `${label}: the flipped work is graded`);
    verdict.parts.forEach((part, index) => {
      assert.equal(wrong.parts[index].isCorrect, false, `${label}: the flipped ${part.id} stage is wrong`);
    });
  });
});

test('the stated graph is the key itself, and the stated solution set reads as the key', () => {
  QUESTIONS.forEach(([label, question]) => {
    const model = buildIntervalNumberLineReview(question);
    if (resolveIntervalAsk(question.ask).includes('graph')) {
      assert.ok(sameIntervals(graphFromReview(model), keyOf(question)), `${label}: the graph item is the key`);
    }
    const sentence = itemValue(model, 'Solution set') || itemValue(model, 'Inequality');
    const parsed = parseInequalityText(sentence.replace(/−/g, '-'), question.variable || 'x');
    // Fractions and roots are beyond the plain-number reader; those are
    // covered by the graded graph and notation above.
    if (!/[√/]/.test(sentence)) {
      assert.ok(parsed && sameIntervals(parsed, keyOf(question)), `${label}: "${sentence}" is the key`);
    }
  });
});

test('the check is true: every test number and every endpoint it names is placed as the key says', () => {
  QUESTIONS.forEach(([label, question]) => {
    const model = buildIntervalNumberLineReview(question);
    const [regionsPart, endpointsPart] = model.why.split(' Then check each endpoint: ');
    const regions = regionsPart.replace(/^[^:]+: /, '').replace(/\.$/, '').split('; ');
    const endpoints = new Set(keyOf(question).flatMap((piece) => [piece.min, piece.max]).filter(Number.isFinite));
    assert.equal(regions.length, endpoints.size + 1, `${label}: one test number per region`);
    regions.forEach((check) => {
      const match = check.match(/^at \w+ = (\S+), .+ (true|false), so (\S+) is (not )?shaded$/);
      assert.ok(match, `${label}: a region check: ${check}`);
      const value = readNumber(match[1]);
      assert.equal(match[3], match[1], `${label}: the same number throughout`);
      assert.ok(![...endpoints].some((endpoint) => Math.abs(endpoint - value) < 1e-9), `${label}: ${match[1]} is not an endpoint`);
      assert.equal(!match[4], inKey(question, value), `${label}: ${match[1]} is ${match[4] ? 'not ' : ''}a solution`);
      assert.equal(match[2] === 'true', inKey(question, value), `${label}: the substitution's verdict for ${match[1]}`);
    });
    const circles = endpointsPart.replace(/\. The shading.*$/, '').split('; ');
    assert.equal(circles.length, endpoints.size, `${label}: every endpoint checked`);
    circles.forEach((check) => {
      const match = check.match(/so (\S+) gets an? (closed|open) circle/);
      assert.ok(match, `${label}: an endpoint check: ${check}`);
      assert.equal(match[2] === 'closed', inKey(question, readNumber(match[1])), `${label}: ${match[1]} gets the right circle`);
    });
  });
});

test('the steps show this question\'s numbers', () => {
  const bounded = buildIntervalNumberLineReview(catalog.example);
  assert.equal(bounded.steps[0], 'The solution set is −3 ≤ x < 5: every number between −3 and 5 (−3 included, 5 not).');
  assert.match(bounded.steps[1], /closed circle \(●\) at −3 because ≤ includes it, and an open circle \(○\) at 5 because < leaves it out/);
  assert.match(bounded.steps[2], /−3 ≤ x < 5 is \[−3, 5\)/);
  assert.equal(itemValue(bounded, 'Interval notation'), '[−3, 5)');

  const compound = buildIntervalNumberLineReview(QUESTIONS.find(([label]) => label === 'all three stages')[1]);
  assert.match(compound.steps.join(' '), /← Shade left/);
  assert.match(compound.steps.join(' '), /Shade right →/);
  assert.match(compound.steps.join(' '), /union symbol ∪, from left to right: \(−∞, −3\] ∪ \(2, ∞\)/);
  assert.equal(itemValue(compound, 'Inequality'), 'x ≤ −3 or x > 2');
  assert.match(compound.note, /pieces from left to right/);

  const root = buildIntervalNumberLineReview(QUESTIONS.find(([label]) => label.startsWith('root endpoint'))[1]);
  assert.equal(itemValue(root, 'Interval notation'), '[√5, ∞)');
  const third = buildIntervalNumberLineReview(QUESTIONS.find(([label]) => label.startsWith('a third'))[1]);
  assert.equal(itemValue(third, 'Interval notation'), '[1/3, 2)');
});

test('null, empty and malformed input give null without throwing', () => {
  const hostile = {};
  Object.defineProperty(hostile, 'intervals', { get() { throw new Error('boom'); }, enumerable: true });
  [null, undefined, {}, [], 'intervalNumberLine', 42, true, hostile, { intervals: null }, { intervals: [] }, { intervals: [null] }, { intervals: [[1, 2]] }, { intervals: 'x > 2' }]
    .forEach((input, index) => {
      assert.doesNotThrow(() => buildIntervalNumberLineReview(input), `input ${index}`);
      assert.equal(buildIntervalNumberLineReview(input), null, `null for input ${index}`);
    });
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID, intervals: [] }), null);
});

test('shapes the review cannot explain correctly give null', () => {
  const CASES = [
    ['text that is not a number (Number() would make it −∞)', { intervals: [{ min: 'abc', max: 3 }] }],
    ['an unbounded marker on the wrong side', { intervals: [{ min: 'inf', max: 3 }] }],
    ['a boolean endpoint', { intervals: [{ min: true, max: 3 }] }],
    ['a reversed piece the grader drops', { intervals: [{ min: 5, max: 1 }, { min: 7, max: null }] }],
    ['a single point', { intervals: [{ min: 2, max: 2, minClosed: true, maxClosed: true }] }],
    ['unbounded at both ends (the tool cannot build it)', { intervals: [{ min: null, max: null }] }],
    ['overlapping pieces', { intervals: [{ min: null, max: 5 }, { min: 3, max: null }] }],
    ['pieces touching at an included endpoint', { intervals: [{ min: 1, max: 3, maxClosed: true }, { min: 3, max: 6 }] }],
    ['more than four pieces', { intervals: [0, 2, 4, 6, 8].map((min) => ({ min, max: min + 1 })) }],
    ['a closed flag that is not a boolean', { intervals: [{ min: 2, max: null, minClosed: 'true' }] }],
    ['an endpoint with no exact short form (π)', { intervals: [{ min: Math.PI, max: null, minClosed: true }] }],
    ['the inequality stage with a non-terminating endpoint', { intervals: [{ min: 1 / 3, max: 2, minClosed: true }], ask: ['inequality'] }],
    ['the inequality stage with a root endpoint', { intervals: [{ min: Math.sqrt(5), max: null, minClosed: true }], ask: ['graph', 'inequality'] }],
    ['a variable that is not a plain name', { variable: { name: 'x' }, intervals: [{ min: 2, max: null }] }],
    ['inequalityText that disagrees with the key', { inequalityText: 'x ≤ -4 or x > 2', intervals: [{ min: -8, max: -4, maxClosed: true }, { min: 2, max: 8 }] }],
    ['endpoints too close to work by hand', { intervals: [{ min: 1, max: 1.0001 }] }],
  ];
  CASES.forEach(([label, fields]) => {
    const question = q(fields);
    assert.doesNotThrow(() => buildIntervalNumberLineReview(question), label);
    assert.equal(buildIntervalNumberLineReview(question), null, label);
    assert.equal(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), null, `${label}: no review through the index`);
  });
});
