import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';

/*
 * Authoring the staged function-analysis question from intent.
 *
 * The contract an author (or an authoring AI) writes is what the student must
 * DO — plot this table, name the family, find the intercepts — and the type,
 * the steps and the answer keys all follow from that. What is tested here is
 * that the following actually happens, and that the authoring mistakes which
 * make the question UNFAIR are caught before a student meets them.
 */

const TABLE = [[-1, 0], [0, 5], [2, 9], [4, 5], [5, 0]];

const compile = (question) => {
  const document = {
    schemaVersion: 5,
    assignment: { title: 'Function characteristics', courseId: 'algebra1' },
    sections: [{ id: 's1', role: 'classwork', questions: [question] }],
  };
  return compileAuthoringIntentV5(document).package.sections[0].questions[0];
};

const intent = (actions, extra = {}) => ({
  prompt: 'The table shows a function. Graph it, then describe what it does.',
  studentActions: actions,
  pairs: TABLE,
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 12 },
  functionFamily: 'Quadratic',
  correctEquation: '-(x - 2)^2 + 9',
  extreme: { kind: 'maximum' },
  correctDomain: 'all real numbers',
  correctRange: 'y <= 9',
  ...extra,
});

const FULL = ['plotRelation', 'classifyFunction', 'findXIntercepts', 'findYIntercept', 'findMaximum', 'analyzeDomain', 'analyzeRange'];

test('plotting a table and then hunting features is its own type', () => {
  // Either half alone is a different task: relationMapping builds a relation
  // and asks whether it is a function; graphAnalysis reads a graph somebody
  // else drew. Before this rule existed the plotRelation in it was claimed by
  // relationMapping and the feature steps silently vanished.
  assert.equal(compile(intent(FULL)).type, 'functionCharacteristics');
  assert.equal(compile(intent(['plotRelation', 'classifyFunction'])).type, 'relationMapping');
});

test('the steps follow from the actions, in the order the mathematics needs', () => {
  const composed = readComposedQuestion(compile(intent(FULL)));
  assert.ok(composed.composed);
  assert.deepEqual(composed.workflow.map((stage) => stage.id), [
    'plot', 'model',
    'xIntercept', 'yIntercept', 'extremeKind', 'extremePoint',
    'xInterceptValue', 'yInterceptValue', 'extremeValue',
    'domain', 'range',
  ]);
});

test('a trimmed action list produces a trimmed question, still in order', () => {
  // A warm-up that only wants part of the arc says so by listing fewer actions.
  const composed = readComposedQuestion(compile(intent(['plotRelation', 'classifyFunction', 'findYIntercept', 'analyzeRange'])));
  assert.deepEqual(composed.workflow.map((stage) => stage.id), ['plot', 'model', 'yIntercept', 'yInterceptValue', 'range']);
});

test('marking a feature is never asked before the graph exists', () => {
  // Listing the actions out of order must not put "find the x-intercepts"
  // ahead of "plot the points".
  const composed = readComposedQuestion(compile(intent(['findXIntercepts', 'analyzeRange', 'plotRelation', 'classifyFunction'])));
  const ids = composed.workflow.map((stage) => stage.id);
  assert.ok(ids.indexOf('plot') < ids.indexOf('xIntercept'), `plot must come first, got ${ids.join(' ')}`);
  assert.ok(ids.indexOf('xIntercept') < ids.indexOf('range'));
});

test('an explicit ask still wins over the actions', () => {
  const composed = readComposedQuestion(compile(intent(FULL, { ask: ['plot', 'domain'] })));
  assert.deepEqual(composed.workflow.map((stage) => stage.id), ['plot', 'domain']);
});

test('every step the author asked for is actually marked', () => {
  const composed = readComposedQuestion(compile(intent(FULL)));
  const unkeyed = composed.workflow.filter((stage) => !(stage.id in (composed.grading || {})));
  assert.deepEqual(unkeyed.map((stage) => stage.id), [], 'these steps would report as "reviewed by your teacher"');
});

// --- the authoring mistakes that make the question unfair -------------------

const validate = (question) => QUESTION_TYPE_CATALOG.functionCharacteristics.validate(question);
const base = QUESTION_TYPE_CATALOG.functionCharacteristics.example;

test('the catalogue example is itself valid', () => {
  assert.deepEqual(validate(base), []);
});

test('an extreme value that is only the largest sample is rejected', () => {
  // On this table the biggest y is the LAST row — a sample, not a turning
  // point. Asking a student to click "the maximum" here asks for a point that
  // is not on the graph.
  const errors = validate({ ...base, pairs: [[0, 0], [1, 1], [2, 4], [3, 9]], extreme: { kind: 'maximum' } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /turning point/);
});

test('a vertex off the table is fine when the author states it', () => {
  assert.deepEqual(
    validate({ ...base, pairs: [[0, 7], [1, 4], [3, 4], [4, 7]], extreme: { kind: 'minimum', point: [2, 3] } }),
    [],
  );
});

test('a table point outside the graph window is rejected', () => {
  // Plotting clamps to the authored window, so such a point can never be
  // placed and the first step is unwinnable through no fault of the student.
  const errors = validate({ ...base, graph: { xMin: -2, xMax: 3, yMin: -4, yMax: 12 } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /cannot be plotted/);
});

test('an intercept off the gridlines is rejected', () => {
  // "Click the x-intercept" has no honest tolerance at x = 0.37, and the
  // student is then asked to write a coordinate they cannot read off the axes.
  const errors = validate({ ...base, xIntercepts: [[0.37, 0]] });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /gridline/);
});

test('interval notation is rejected for Algebra I', () => {
  const errors = validate({ ...base, notation: 'interval' });
  assert.match(errors[0], /not used in Algebra I/);
});

test('a table too short to show a shape is rejected', () => {
  assert.match(validate({ ...base, pairs: [[0, 1], [1, 2]] })[0], /at least three points/);
});

test('a nonsense extreme kind is rejected', () => {
  assert.match(validate({ ...base, extreme: { kind: 'wobble' } })[0], /maximum.*minimum.*neither/);
});

test('validation and grading agree about what can be established', () => {
  // Validation asks the RECIPE whether a key would derive rather than keeping
  // its own copy of the rules. This is the check that they have not drifted: a
  // question that validates must not then arrive with an unkeyed feature step.
  const question = { ...base, studentActions: FULL, prompt: 'p' };
  assert.deepEqual(validate(question), []);
  const composed = readComposedQuestion(compile(intent(FULL)));
  ['xIntercept', 'yIntercept', 'extremePoint'].forEach((id) => {
    assert.ok(composed.grading[id], `${id} validated but has no answer key`);
  });
});
