/*
 * ISSUE #359, PART A — V5 COMPILER / PREFLIGHT CONTRACT.
 *
 * Outside authors write mathematical intent, not renderer plumbing. These
 * are regression tests for the exact plain V5 shapes named in the issue:
 *
 *   - studentActions:["solveSystem"] + equations[] must compile to
 *     systemsWorkspace, defaulting to mode "algebraic" when no mode is
 *     authored — never the older symbolic `system` answer box.
 *   - a structured spatial model (studentActions:["connectRepresentations"],
 *     equations, variables, spatialModel:{kind:"threePlanes"}) must compile
 *     to a real Systems Workspace 3D-plane mode, never
 *     representationMatch/multiAnswer/text-only.
 *   - answerFields survive on a plane-exploration question that also asks
 *     for a written interpretation.
 *   - none of this requires the author to spell out type/toolId/renderer
 *     plumbing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { resolveSystemsWorkspaceMode } from '../../src/tools/systemsWorkspace/systemsWorkspaceMode.js';

const DAY1_SYSTEM = ['2x - y + 2z = 15', '-x + y + z = 3', '3x - y + 2z = 18'];

const compileOne = (question) => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: '#359 compiler contract', courseId: 'algebra2', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    sections: [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions: [{ standard: 'A2.3B', prompt: 'Solve.', ...question }] }],
  });
  return compiled.package.sections[0].questions[0];
};

test('plain solveSystem + equations[] compiles to systemsWorkspace, mode algebraic, no renderer plumbing authored', () => {
  const question = compileOne({
    studentActions: ['solveSystem'],
    equations: ['x + y = 2', 'x - y = 0'],
  });
  assert.equal(question.type, 'systemsWorkspace');
  assert.equal(question.mode, 'algebraic');
  assert.equal(validateToolQuestion(question).isValid, true);
});

test('plain solveSystem + equations[] + variables compiles to systemsWorkspace for a 3×3 system too', () => {
  const question = compileOne({
    studentActions: ['solveSystem'],
    equations: DAY1_SYSTEM,
    variables: ['x', 'y', 'z'],
  });
  assert.equal(question.type, 'systemsWorkspace');
  assert.equal(question.mode, 'algebraic');
  assert.deepEqual(question.equations, DAY1_SYSTEM);
  const result = validateToolQuestion(question);
  assert.equal(result.isValid, true, result.errors?.join(' | '));
});

test('an authored method (elimination or studentChoice) on a 3×3 system compiles through unchanged and validates', () => {
  for (const method of ['substitution', 'elimination', 'studentChoice']) {
    const question = compileOne({
      studentActions: ['solveSystem'],
      method,
      equations: DAY1_SYSTEM,
      variables: ['x', 'y', 'z'],
    });
    assert.equal(question.type, 'systemsWorkspace');
    assert.equal(question.method, method);
    const result = validateToolQuestion(question);
    assert.equal(result.isValid, true, `${method}: ${result.errors?.join(' | ')}`);
  }
});

test('graphSystem intent is untouched and still routes to the graph-only linear mode', () => {
  const question = compileOne({
    studentActions: ['graphSystem'],
    system: { m1: 1, b1: 0, m2: -1, b2: 2 },
  });
  assert.equal(question.type, 'systemsWorkspace');
  assert.equal(question.mode, 'linear');
});

test('the structured three-plane spatial model compiles to a real systemsWorkspace 3D-plane mode, not representationMatch/multiAnswer/text-only', () => {
  const question = compileOne({
    studentActions: ['connectRepresentations'],
    equations: DAY1_SYSTEM,
    variables: ['x', 'y', 'z'],
    spatialModel: { kind: 'threePlanes' },
  });
  assert.equal(question.type, 'systemsWorkspace', `expected systemsWorkspace, got ${question.type}`);
  assert.notEqual(question.type, 'representationMatch');
  assert.notEqual(question.type, 'multiAnswer');
  assert.equal(question.mode, 'spatial');
  assert.deepEqual(question.spatialModel, { kind: 'threePlanes' });
  const result = validateToolQuestion(question);
  assert.equal(result.isValid, true, result.errors?.join(' | '));
});

test('a plane-exploration question that also asks for a written interpretation preserves answerFields', () => {
  const question = compileOne({
    studentActions: ['connectRepresentations'],
    equations: DAY1_SYSTEM,
    variables: ['x', 'y', 'z'],
    spatialModel: { kind: 'threePlanes' },
    answerFields: [{ id: 'classification', label: 'What does the intersection of the three planes represent?', answer: 'a single point' }],
  });
  assert.equal(question.type, 'systemsWorkspace');
  assert.ok(Array.isArray(question.answerFields) && question.answerFields.length === 1, JSON.stringify(question.answerFields));
  assert.equal(question.answerFields[0].id, 'classification');
});

test('an ordinary connectRepresentations card sort (no spatial model) is unaffected and still routes to representationMatch', () => {
  const question = compileOne({
    studentActions: ['connectRepresentations'],
    representations: {
      sets: [
        { id: 'a', equation: 'y=x', table: '(0,0)', context: 'One-to-one.', graphSpec: { type: 'linear', a: 1, h: 0, k: 0 } },
        { id: 'b', equation: 'y=x^2', table: '(0,0)', context: 'Quadratic.', graphSpec: { type: 'quadratic', a: 1, h: 0, k: 0 } },
      ],
      targetId: 'a',
    },
  });
  assert.equal(question.type, 'representationMatch');
});

test('a raw (uncompiled) spatial question with both a variables list and no explicit mode still resolves to spatial, not algebraic', () => {
  // Regression: the plain-shape algebraic fallback (equations + variables,
  // no method) from #341 was checked BEFORE the spatial check and matched
  // first whenever a spatial question also authored a `variables` array,
  // silently routing a three-plane exploration to the method-choice screen
  // instead of the visualizer. Caught via manual browser verification of an
  // uncompiled dev fixture — compiled V5 content never hits this path
  // because the compiler always stamps an explicit mode, but legacy/raw
  // content (and any other caller that skips the compiler) must still work.
  const question = {
    studentActions: ['connectRepresentations'],
    equations: DAY1_SYSTEM,
    variables: ['x', 'y', 'z'],
    spatialModel: { kind: 'threePlanes' },
  };
  assert.equal(resolveSystemsWorkspaceMode(question), 'spatial');
});

test('reveal is opt-in: a Day 1 spatialModel with no revealSolution flag does not expose the solution point', () => {
  const question = compileOne({
    studentActions: ['connectRepresentations'],
    equations: DAY1_SYSTEM,
    variables: ['x', 'y', 'z'],
    spatialModel: { kind: 'threePlanes' },
  });
  assert.equal(question.spatialModel.revealSolution, undefined);
});
