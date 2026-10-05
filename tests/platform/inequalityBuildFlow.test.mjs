/*
 * THE STUDENT-BUILD INEQUALITY WORKSPACE, ONE STEP AT A TIME.
 *
 * inequalityBuildFlow.js decides which step is open, which steps are locked,
 * where a passing Check moves the student and what a tap on the graph means.
 * It never decides whether work is right: "done" is handed to it by the gate
 * (resolveInequalityBuildGate). These tests run it in node, against the real
 * task the shared grader builds, so the steps on screen are the graded steps.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import {
  NO_CURSOR,
  buildFlowPlan,
  constraintPosition,
  cursorAfterCheck,
  cursorForConstraint,
  flowPositions,
  graphTapAction,
  reasoningSignature,
  resolveBuildFlow,
  stepCheckPatch,
  stepCheckedAsItStands,
  stepPosition,
  stepWorkSignature,
} from '../../src/tools/systemsWorkspace/inequalityBuildFlow.js';
import { resolveInequalityBuildGate } from '../../src/tools/systemsWorkspace/inequalityBuildPolicy.js';
import { studentBuildInequalityTask } from '../../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';

const sw = (fields) => ({ type: 'systemsWorkspace', mode: 'inequalities', ...fields });
// The Classwork build question: two constraints, every build step, classify.
const BUILD = sw({ studentBuild: { boundary: true, lineStyle: true, shading: true }, reasoning: { classifyRegion: true }, inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }] });
const plan = buildFlowPlan(studentBuildInequalityTask(BUILD));

// `done` is a set of positions; everything else in the context follows from it.
const contextFor = ({ done = [], cursor = null, combined = false, modelingSent = true, flowPlan = plan } = {}) => ({
  plan: flowPlan,
  modelingSent,
  combined,
  cursor,
  stepDone: (index, step) => done.includes(stepPosition(index, step)),
  reasoningDone: (phase) => done.includes(phase),
});
const ALL_STEPS = [0, 1].flatMap((index) => ['boundary', 'lineStyle', 'shading'].map((step) => stepPosition(index, step)));

test('the plan is the steps the shared task asks for, in the order the work is done', () => {
  assert.deepEqual(plan.constraintSteps, ['boundary', 'lineStyle', 'shading'], 'no rewrite step unless the question asks for one');
  assert.deepEqual(plan.reasoningSteps, ['classify']);
  assert.deepEqual(flowPositions(plan), ['c0:boundary', 'c0:lineStyle', 'c0:shading', 'c1:boundary', 'c1:lineStyle', 'c1:shading', 'combine', 'classify']);

  const rewrite = buildFlowPlan(studentBuildInequalityTask(sw({
    studentBuild: { rewrite: true, boundary: true }, reasoning: { testPoint: true, vertices: true, classifyRegion: true },
    sourceConstraints: ['2x + y >= 4'], expectedConstraints: [{ A: 2, B: 1, C: -4, relation: '>=' }], testPoint: { x: 0, y: 0 }, allowStudentTestPoint: true,
  })));
  assert.deepEqual(rewrite.constraintSteps, ['rewrite', 'boundary'], 'only the enabled steps, rewrite first');
  assert.deepEqual(rewrite.reasoningSteps, ['classify', 'teacherPoint', 'studentPoint', 'vertices']);

  const modeling = buildFlowPlan(studentBuildInequalityTask(sw({ modeling: { expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }] } })));
  assert.equal(flowPositions(modeling)[0], 'model', 'a modeling question starts by writing the constraints');
  assert.deepEqual(modeling.constraintSteps, [], 'modeling alone builds nothing');

  const reasoningOnly = buildFlowPlan(studentBuildInequalityTask(sw({ reasoning: { vertices: true }, inequalities: [{ m: 0, b: 0, relation: '>=' }] })));
  assert.deepEqual(flowPositions(reasoningOnly), ['combine', 'vertices'], 'given constraints go straight to combining');
});

test('a fresh question opens on the first step, and only that step is current', () => {
  const flow = resolveBuildFlow(contextFor());
  assert.equal(flow.cursor, 'c0:boundary');
  assert.equal(flow.activeIndex, 0);
  assert.equal(flow.positionState('c0:boundary'), 'current');
  assert.equal(flow.positionState('c0:lineStyle'), 'locked', 'a line is styled after it exists');
  assert.equal(flow.positionState('c0:shading'), 'locked');
  assert.equal(flow.positionState('c1:boundary'), 'open', 'constraints are independent: a student stuck on one can work on the next');
  assert.equal(flow.positionState('combine'), 'locked');
  assert.equal(flow.positionState('classify'), 'locked');
  assert.equal(flow.complete, false);
  assert.deepEqual(flow.constraintProgress(0), { done: 0, total: 3 });

  const modeling = buildFlowPlan(studentBuildInequalityTask(sw({ modeling: { expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }] }, studentBuild: { boundary: true } })));
  const unsent = resolveBuildFlow(contextFor({ flowPlan: modeling, modelingSent: false }));
  assert.equal(unsent.cursor, 'model');
  assert.equal(unsent.positionState('c0:boundary'), 'locked', 'nothing is built before the model is sent');
});

test('steps open in order, combine opens on finished constraints and the reasoning once combined', () => {
  const partway = resolveBuildFlow(contextFor({ done: ['c0:boundary'] }));
  assert.equal(partway.cursor, 'c0:lineStyle', 'with no step chosen, the screen shows the first one not done');
  assert.equal(partway.positionState('c0:boundary'), 'done');
  assert.equal(partway.positionState('c0:shading'), 'locked');
  assert.deepEqual(partway.constraintProgress(0), { done: 1, total: 3 });

  const oneConstraintLeft = resolveBuildFlow(contextFor({ done: ALL_STEPS.slice(0, 5) }));
  assert.equal(oneConstraintLeft.positionState('combine'), 'locked', 'one unfinished step keeps the overlap locked');
  assert.equal(oneConstraintLeft.allConstraintsDone, false);

  const built = resolveBuildFlow(contextFor({ done: ALL_STEPS }));
  assert.equal(built.cursor, 'combine');
  assert.equal(built.allConstraintsDone, true);
  assert.equal(built.positionState('classify'), 'locked', 'reasoning waits for the student to combine');

  const combined = resolveBuildFlow(contextFor({ done: ALL_STEPS, combined: true }));
  assert.equal(combined.cursor, 'classify');
  assert.equal(combined.positionState('combine'), 'done');
  assert.equal(combined.complete, false);
  assert.equal(resolveBuildFlow(contextFor({ done: [...ALL_STEPS, 'classify'], combined: true })).complete, true);
});

test('the persisted step is kept while it is open, and replaced when it is not', () => {
  assert.equal(resolveBuildFlow(contextFor({ done: ALL_STEPS, cursor: 'c0:boundary' })).cursor, 'c0:boundary', 'a done step reopened to change it stays open');
  assert.equal(resolveBuildFlow(contextFor({ cursor: 'c1:boundary' })).cursor, 'c1:boundary');
  assert.equal(resolveBuildFlow(contextFor({ cursor: 'c0:shading' })).cursor, 'c0:boundary', 'a locked step is never shown as current');
  assert.equal(resolveBuildFlow(contextFor({ cursor: 'classify' })).cursor, 'c0:boundary');
  assert.equal(resolveBuildFlow(contextFor({ cursor: 'c7:boundary' })).cursor, 'c0:boundary', 'a constraint the question does not have');
  assert.equal(resolveBuildFlow(contextFor({ cursor: 'nonsense' })).cursor, 'c0:boundary');
  const collapsed = resolveBuildFlow(contextFor({ cursor: NO_CURSOR }));
  assert.equal(collapsed.cursor, NO_CURSOR, 'the student closed the open constraint');
  assert.equal(collapsed.activeIndex, null);
  assert.equal(collapsed.positionState('c0:boundary'), 'open');
});

test('a Check moves on only when it completes the step, to the next step still to do', () => {
  const fresh = contextFor({ cursor: 'c0:boundary' });
  assert.equal(cursorAfterCheck(fresh, 'c0:boundary', false), 'c0:boundary', 'a Check that did not complete the step stays on it');
  assert.equal(cursorAfterCheck(fresh, 'c0:boundary', true), 'c0:lineStyle');
  assert.equal(cursorAfterCheck(contextFor({ done: ['c0:boundary', 'c0:lineStyle'] }), 'c0:shading', true), 'c1:boundary', 'the last step of a constraint opens the next constraint');
  // Constraint 2 finished first: the search wraps back to what is left.
  assert.equal(cursorAfterCheck(contextFor({ done: ['c0:boundary', 'c1:boundary', 'c1:lineStyle'] }), 'c1:shading', true), 'c0:lineStyle');
  assert.equal(cursorAfterCheck(contextFor({ done: ALL_STEPS.slice(0, 5) }), 'c1:shading', true), 'combine');
  assert.equal(cursorAfterCheck(contextFor({ done: ALL_STEPS }), 'combine', true), 'classify');
  assert.equal(cursorAfterCheck(contextFor({ done: ALL_STEPS, combined: true }), 'classify', true), NO_CURSOR, 'nothing left to open: the student checks their work');
  const modeling = buildFlowPlan(studentBuildInequalityTask(sw({ modeling: { expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }] }, studentBuild: { boundary: true } })));
  assert.equal(cursorAfterCheck(contextFor({ flowPlan: modeling, modelingSent: false }), 'model', true), 'c0:boundary');
  // A step that was done but was changed and checked wrong stays put.
  assert.equal(cursorAfterCheck(contextFor({ done: ALL_STEPS, cursor: 'c0:boundary' }), 'c0:boundary', false), 'c0:boundary');
});

test('a constraint header opens its next step, shows a finished constraint without arming the graph, and closes when open', () => {
  assert.equal(cursorForConstraint(contextFor({ cursor: 'c0:boundary' }), 1), 'c1:boundary');
  assert.equal(cursorForConstraint(contextFor({ done: ['c1:boundary'], cursor: 'c0:boundary' }), 1), 'c1:lineStyle');
  assert.equal(cursorForConstraint(contextFor({ cursor: 'c0:boundary' }), 0), NO_CURSOR, 'pressing the open constraint closes it');
  const finished = contextFor({ done: ['c0:boundary', 'c0:lineStyle', 'c0:shading'], cursor: 'c1:boundary' });
  assert.equal(cursorForConstraint(finished, 0), constraintPosition(0), 'a finished constraint opens as its summary');
  assert.deepEqual(graphTapAction({ cursor: constraintPosition(0), build: [{}, {}], plan }), { kind: 'none' }, 'so a stray tap cannot change finished work');
});

test('a tap on the graph does what the open step needs, and nothing else', () => {
  const tap = (cursor, entry = {}, rewriteVerified = () => true) => graphTapAction({ cursor, build: [entry, {}], plan, rewriteVerified });
  assert.deepEqual(tap('c0:boundary'), { kind: 'boundaryPoint', index: 0, which: 1, method: 'points' }, 'no button arms the first point');
  assert.deepEqual(tap('c0:boundary', { point1Plotted: true }), { kind: 'boundaryPoint', index: 0, which: 2, method: 'points' });
  assert.deepEqual(tap('c0:boundary', { point1Plotted: true, point2Plotted: true }), { kind: 'boundaryFull', index: 0, method: 'points' }, 'a third tap never silently replaces a point');
  assert.deepEqual(tap('c0:boundary', { method: 'slopeIntercept' }), { kind: 'boundaryPoint', index: 0, which: 1, method: 'slopeIntercept' });
  assert.deepEqual(tap('c0:boundary', { method: 'vertical' }), { kind: 'none' }, 'x = c is typed, not plotted');
  assert.deepEqual(tap('c0:boundary', { method: 'horizontal' }), { kind: 'none' });
  assert.deepEqual(tap('c0:lineStyle'), { kind: 'none' }, 'solid or dashed is a choice, not a tap');
  assert.deepEqual(tap('c0:shading'), { kind: 'shade', index: 0 });
  assert.deepEqual(tap('combine'), { kind: 'none' });
  assert.deepEqual(tap('classify'), { kind: 'none' });
  assert.deepEqual(tap('teacherPoint'), { kind: 'none' }, "the teacher's point is the question's, never moved by a tap");
  assert.deepEqual(tap('studentPoint'), { kind: 'testPoint' });
  assert.deepEqual(tap('vertices'), { kind: 'vertex' });
  assert.deepEqual(tap(NO_CURSOR), { kind: 'none' });
  // The rewrite gates the graph: nothing is plotted for a constraint whose
  // rewrite the solver has not verified.
  assert.deepEqual(tap('c0:boundary', {}, () => false), { kind: 'none' });
  assert.deepEqual(tap('c0:shading', {}, () => false), { kind: 'none' });
  // A step the question does not ask for has nothing to place.
  const shadingOnly = buildFlowPlan(studentBuildInequalityTask(sw({ studentBuild: { shading: true }, inequalities: [{ m: 1, b: 1, relation: '>=' }] })));
  assert.deepEqual(graphTapAction({ cursor: 'c0:boundary', build: [{}], plan: shadingOnly }), { kind: 'none' });
});

test('a Check is about the work on screen when it was pressed', () => {
  const entry = { method: 'points', x1: 0, y1: 1, x2: 2, y2: 3, point1Plotted: true, point2Plotted: true, style: 'solid', shadePoint: [0, 5] };
  const checked = { ...entry, ...stepCheckPatch(entry, 'boundary') };
  assert.equal(checked.boundaryAttempts, 1);
  assert.equal(stepCheckedAsItStands(checked, 'boundary'), true);
  assert.equal(stepCheckedAsItStands({ ...checked, x2: 3, y2: 4 }, 'boundary'), false, 'dragging a point after the Check makes the Check stale');
  assert.equal(stepCheckedAsItStands({ ...checked, x2: '2', y2: '3.0' }, 'boundary'), true, 'the same point written differently is the same work');
  assert.equal(stepCheckedAsItStands({ ...checked, style: 'dashed' }, 'boundary'), true, 'another step\'s work does not touch this one');
  assert.equal(stepCheckPatch(checked, 'boundary').boundaryAttempts, 2, 'every press counts as an attempt');

  const styled = { ...entry, ...stepCheckPatch(entry, 'lineStyle') };
  assert.equal(stepCheckedAsItStands({ ...styled, style: 'dashed' }, 'lineStyle'), false);
  const shaded = { ...entry, ...stepCheckPatch(entry, 'shading') };
  assert.equal(stepCheckedAsItStands({ ...shaded, shadePoint: [0, -3] }, 'shading'), false);

  assert.notEqual(stepWorkSignature({ method: 'vertical', constant: '1' }, 'boundary'), stepWorkSignature({ method: 'vertical', constant: '2' }, 'boundary'));
  assert.notEqual(
    stepWorkSignature({ ...entry, method: 'slopeIntercept', slope: '1', intercept: '1' }, 'boundary'),
    stepWorkSignature({ ...entry, method: 'slopeIntercept', slope: '2', intercept: '1' }, 'boundary'),
    'the planned slope is part of the slope-intercept work',
  );
  // A step checked before signatures existed keeps counting as checked.
  assert.equal(stepCheckedAsItStands({ ...entry, boundaryAttempts: 1 }, 'boundary'), true);
  assert.equal(reasoningSignature({ overall: 'yes' }) === reasoningSignature({ overall: 'no' }), false);
});

test('a stale Check is neither a tick nor a feedback line, where outcomes are shown or withheld', () => {
  const entry = { method: 'points', x1: 0, y1: 1, x2: 2, y2: 3, point1Plotted: true, point2Plotted: true };
  const checked = { ...entry, ...stepCheckPatch(entry, 'boundary') };
  const gate = (build, showImmediateFeedback) => resolveInequalityBuildGate({
    showImmediateFeedback,
    buildConfig: { boundary: true },
    build,
    constraintCount: 1,
    stepCorrect: () => true,
    stepFinished: () => true,
    stepCheckedAsItStands: (index, step) => stepCheckedAsItStands(build[index], step),
  });
  const moved = { ...checked, x2: 4, y2: 5 };
  assert.equal(gate([checked], true).stepDone(0, 'boundary'), true);
  assert.deepEqual(gate([checked], true).stepReport(0, 'boundary'), { kind: 'verdict', passed: true });
  assert.equal(gate([moved], true).stepDone(0, 'boundary'), false, 'the tick goes when the checked work changes');
  assert.equal(gate([moved], true).stepReport(0, 'boundary'), null, 'and so does the line under the Check');
  const rechecked = { ...moved, ...stepCheckPatch(moved, 'boundary') };
  assert.equal(gate([rechecked], true).stepDone(0, 'boundary'), true, 'until the student checks again');
  // Withheld: done stays "finished" (no Check needed); the line still belongs
  // to the work it was about.
  assert.equal(gate([moved], false).stepDone(0, 'boundary'), true);
  assert.equal(gate([moved], false).stepReport(0, 'boundary'), null);
  assert.deepEqual(gate([checked], false).stepReport(0, 'boundary'), { kind: 'completion', complete: true });
});

test('the flow is navigation only: it imports nothing, so it cannot consult the answer', () => {
  const flowSource = executableSource(readFileSync(new URL('../../src/tools/systemsWorkspace/inequalityBuildFlow.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(flowSource, /^\s*import\b/m, 'whether work is right comes from the gate, handed in as stepDone');
  assert.doesNotMatch(flowSource, /expectedConstraints|workingConstraints|Correct\(/);
});
