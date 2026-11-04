/*
 * A TEST POINT IS WORKED OUT BEFORE IT IS JUDGED (F-SW-TEST-POINT-YESNO,
 * PR #537 walkthrough).
 *
 * "Does the point satisfy inequality 1?" was a Yes / No click: a guess passed
 * it half the time. The Systems Workspace now asks for the value first, as the
 * warm-ups do — "2(6) + 3(4) = [ ]", then Yes / No — for the marked point and
 * for a point of the student's own (testPointSubstitution.js). Where outcomes
 * are shown a missing or wrong value is named before any judgement; where they
 * are withheld the value is part of "finished", never judged. The shared
 * grader reads no value: grading is unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pointSubstitution, substitutedText, valueEntered, valueWorkedOut } from '../../src/tools/systemsWorkspace/testPointSubstitution.js';
import { formatInequality, formatModelingConstraint } from '../../src/tools/systemsWorkspace/inequalityFormat.js';
import { formatSlopeInterceptInequality } from '../../src/tools/systemsWorkspace/linearInequalityEngine.js';
import { pointMembership, studentBuildInequalityTask } from '../../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';
import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const at = (label, point, satisfied = null) => pointSubstitution(label, point, { satisfied });

test('the side with the arithmetic is the one worked out, written as the student reads it', () => {
  // Standard form (the modeled items): the left side.
  assert.deepEqual(at('2x + 3y ≥ 20', [6, 4]), { side: '2x + 3y', text: '2(6) + 3(4)', value: 24 });
  assert.deepEqual(at('0.2x + 0.5y ≤ 50', [100, 80]), { side: '0.2x + 0.5y', text: '0.2(100) + 0.5(80)', value: 60 });
  assert.deepEqual(at('x + y ≤ 45', [10, 30]), { side: 'x + y', text: '10 + 30', value: 40 });
  assert.deepEqual(at('6 − x < y', [3, 4]), { side: '6 − x', text: '6 − 3', value: 3 });
  // y alone on the left: the right side has the work.
  assert.deepEqual(at('y > 4x − 6', [0, 0]), { side: '4x − 6', text: '4(0) − 6', value: -6 });
  assert.deepEqual(at('y ≥ (1/2)x − 3', [4, 1]), { side: '(1/2)x − 3', text: '(1/2)(4) − 3', value: -1 });
  assert.deepEqual(at('y ≤ −(1/3)x + 4', [6, 1]), { side: '−(1/3)x + 4', text: '−(1/3)(6) + 4', value: 2 });
  // A negative coordinate is bracketed; a bare fraction is grouped.
  assert.deepEqual(at('y > −x + 6', [-8, 2]), { side: '−x + 6', text: '−(−8) + 6', value: 14 });
  assert.deepEqual(at('y > 3/5x + 3', [-4, 10]), { side: '3/5x + 3', text: '(3/5)(−4) + 3', value: 0.6 });
  // A lone variable against a number asks for that coordinate.
  assert.deepEqual(at('x ≥ −5', [2, 3]), { side: 'x', text: 'x', value: 2 });
  assert.deepEqual(at('y < 3', [2, -1]), { side: 'y', text: 'y', value: -1 });
});

test('every label the workspace can show is read: authored, rewritten, modeled', () => {
  const point = [2, 5];
  const labels = [
    formatInequality('6.9x + 10.4y >= 400'),
    formatInequality({ m: -0.5, b: 6, relation: '<' }),
    formatInequality({ orientation: 'vertical', x: -2, relation: '>=' }),
    formatInequality({ A: 2, B: 3, C: -20, relation: '>=' }),
    formatSlopeInterceptInequality({ A: -0.6, B: 1, C: -3, relation: '>' }),
    formatSlopeInterceptInequality({ A: 1 / 3, B: 1, C: -4, relation: '<=' }),
    formatModelingConstraint({ coeffA: '-2', coeffB: '-3', relation: '<=', constant: '-20' }),
  ];
  const constraints = [
    { A: 6.9, B: 10.4, C: -400, relation: '>=' }, { A: 0.5, B: 1, C: -6, relation: '<' }, { A: 1, B: 0, C: 2, relation: '>=' },
    { A: 2, B: 3, C: -20, relation: '>=' }, { A: -0.6, B: 1, C: -3, relation: '>' }, { A: 1 / 3, B: 1, C: -4, relation: '<=' }, { A: -2, B: -3, C: 20, relation: '<=' },
  ];
  const satisfied = pointMembership(constraints, point);
  labels.forEach((label, index) => {
    const substitution = at(label, point, satisfied[index]);
    assert.ok(substitution, `"${label}" is read and agrees with the workspace's own membership`);
    // Every variable is replaced by its coordinate, except a lone one, which is asked for by name.
    if (substitution.text !== substitution.side) assert.doesNotMatch(substitution.text, /[xy]/, `"${substitution.text}" has every variable replaced`);
  });
});

test('a label that cannot be read, or that disagrees with the workspace, asks for nothing', () => {
  assert.equal(at('2x + 3y ≥ 20', [6, 4], false), null, 'a reading that disagrees with the membership is never enforced');
  assert.notEqual(at('2x + 3y ≥ 20', [6, 4], true), null);
  assert.equal(at('Linear inequality', [1, 1]), null);
  assert.equal(at('2x + 3y ≥ 20', [Number.NaN, 4]), null);
  assert.equal(at('x² + y ≥ 1', [1, 1]), null, 'not linear');
  assert.equal(at('a + b ≥ 1', [1, 1]), null, 'variables the point does not name');
  assert.equal(pointSubstitution('p + 2q ≥ 7', [1, 3], { symbols: ['p', 'q'] }).text, '1 + 2(3)', 'a model in other letters');
  assert.equal(substitutedText('x', [4, 1]), 'x');
});

test('grading is unchanged: the shared grader reads no value', () => {
  const question = {
    type: 'systemsWorkspace', mode: 'inequalities', modeling: { variables: [{ symbol: 'x' }, { symbol: 'y' }], expectedConstraints: [{ A: 2, B: 3, C: -20, relation: '>=' }] },
    studentBuild: { boundary: true, lineStyle: true, shading: true }, reasoning: { testPoint: true }, testPoint: { x: 6, y: 4 },
  };
  const build = [{ method: 'points', x1: 10, y1: 0, x2: 4, y2: 4, point1Plotted: true, point2Plotted: true, boundaryAttempts: 1, style: 'solid', styleAttempts: 1, shadePoint: [8, 8], shadeAttempts: 1 }];
  const work = (values) => ({ build, modelingEntries: [{ coeffA: '2', coeffB: '3', relation: '>=', constant: '20' }], modelingSent: true, vertices: [], teacherPointResponse: { overall: 'yes', perInequality: ['yes'], onBoundary: '', boundaryIncluded: '', ...(values ? { values } : {}) } });
  const without = systemsWorkspaceGrader.grade(question, work(null));
  for (const values of [['24'], ['25'], [''], ['not a number']]) {
    assert.deepEqual(systemsWorkspaceGrader.grade(question, work(values)), without, `values ${JSON.stringify(values)}`);
  }
  assert.equal(without.isCorrect, true);
  assert.equal(studentBuildInequalityTask(question).testPointReasoningEnabled, true);
});

// ------------------------------------------------------- the screen is held to it
const mode = executableSource(componentSource('src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx'));
const panels = executableSource(componentSource('src/tools/systemsWorkspace/InequalityBuildPanels.jsx'));
const controls = executableSource(componentSource('src/tools/systemsWorkspace/InequalityControls.jsx'));

test('each inequality asks for its value, then Yes / No — for the marked point and the student’s own', () => {
  const questions = region(panels, 'export function TestPointQuestions(', 'export function VertexList(', 'TestPointQuestions');
  assert.match(questions, /\{substitutions\[index\] \? \(\s*<label className="mm-ineq-substitution"/, 'the value line, where there is something to work out');
  assert.match(questions, /\{substitutions\[index\]\.text\} =/);
  // Inside the inequality's own question, before its answers.
  const yesNo = region(controls, 'export function YesNoQuestion(', '\n}\n', 'YesNoQuestion');
  assert.match(yesNo, /<legend>\{legend\}<\/legend>\s*\{children \? <span className="mm-ineq-question-work">\{children\}\{answers\}<\/span> : answers\}/, 'between the question and its answers');
  assert.equal((mode.match(/substitutions=\{substitutionsFor\(/g) || []).length, 2, 'both points ask for values');
});

test('where outcomes are shown a missing or wrong value is named first; where withheld it is only part of "finished"', () => {
  const report = region(mode, 'const pointReport = (point, response, probeIndex = onBoundaryIndex(point)) => {', 'const vertexIncludedExpected', 'test point report');
  const withheld = report.indexOf('if (!buildGate.verdictsShown) {');
  const valueCheck = report.indexOf('const worked = substitutions.map(');
  assert.ok(withheld > -1 && valueCheck > withheld, 'no value is judged before the withheld return');
  assert.ok(valueCheck < report.indexOf('const expectedMembership = membership(point);'), 'the value is checked before the point is judged');
  // A value that is missing or off ends the report there: the step is not done.
  assert.match(report, /const worked = substitutions\.map\(\(substitution, index\) => \(substitution \? valueWorkedOut\(response\.values\?\.\[index\], substitution\) : 'right'\)\);\s*const valueMiss = worked\.findIndex\(\(state\) => state !== 'right'\);\s*if \(valueMiss >= 0\) \{\s*const \{ text \} = substitutions\[valueMiss\];\s*return \{ done: false, tone: 'revise',/);
  assert.match(report, /worked\[valueMiss\] === 'off' \? `Recheck the value of \$\{text\}\.` : `Work out \$\{text\} first\.`/);
  const recorded = region(report, 'if (!buildGate.verdictsShown) {', 'return { done: complete', 'withheld completion');
  assert.match(recorded, /substitutions\.every\(\(substitution, index\) => !substitution \|\| valueEntered\(response\.values\?\.\[index\]\)\)/, 'finished means each value typed — never compared');
  assert.doesNotMatch(recorded, /valueWorkedOut|matchesNumericAnswer|substitution\.value/, 'nothing about the value is judged where outcomes are withheld');
});

test('a value is right within the tolerance every typed tool answer has, in any form a student types', () => {
  const kai = at('2x + 3y ≥ 20', [6, 4]);
  assert.equal(valueWorkedOut('24', kai), 'right');
  assert.equal(valueWorkedOut(' 24.0 ', kai), 'right');
  assert.equal(valueWorkedOut('25', kai), 'off');
  for (const blank of ['', '   ', 'twenty-four', undefined]) assert.equal(valueWorkedOut(blank, kai), 'missing', JSON.stringify(blank));
  const third = at('y ≤ −(1/3)x + 4', [4, 1]);
  for (const value of ['8/3', '2.67', '2.666']) assert.equal(valueWorkedOut(value, third), 'right', value);
  assert.equal(valueWorkedOut('2.6', third), 'off');
  assert.equal(valueWorkedOut('−6', at('y > 4x − 6', [0, 0])), 'right', 'the platform minus');
  assert.equal(valueEntered('−6'), true);
  assert.equal(valueEntered(''), false);
});
