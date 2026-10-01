/*
 * ON A DOL, QUIZ OR TEST, THE STUDENT-BUILD INEQUALITY CHECKS SAY ONLY
 * WHETHER THE WORK IS FINISHED.
 *
 * The student-build systems-of-inequalities mode has a Check for every step of
 * every constraint (boundary, solid or dashed, which side to shade) and for
 * each piece of reasoning about the combined region (its classification, a
 * test point, a vertex). In practice they are verdicts — "Correct boundary.",
 * "Correct line style.", "Correct — every part of your reasoning…" — the step
 * chips tick green only when a step is right, the overlap stays "Locked until
 * every constraint above is correct", and a tapped vertex snaps onto the TRUE
 * corner. On an exit ticket each of those is an answer key: solid or dashed is
 * a two-way guess the Check settles.
 *
 * The policy lives in resolveInequalityBuildGate (inequalityBuildPolicy.js),
 * tested here as behaviour; the screen is held to it by the source contracts
 * at the bottom and by tests/browser/assessmentLeakGates.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INEQUALITY_BUILD_STEPS,
  INEQUALITY_STEP_COMPLETION_TEXT,
  REASONING_COMPLETION_TEXT,
  resolveInequalityBuildGate,
} from '../../src/tools/systemsWorkspace/inequalityBuildPolicy.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const allSteps = { boundary: true, lineStyle: true, shading: true };
const checkedEntry = { boundaryAttempts: 1, styleAttempts: 1, shadeAttempts: 1 };

// Two constraints, every step finished and checked once. `rightness` says
// whether each step's work is right; finishing is the same either way.
const gateFor = ({ showImmediateFeedback, right, build = [checkedEntry, checkedEntry], finished = true, rewriteVerified = () => true }) => resolveInequalityBuildGate({
  showImmediateFeedback,
  buildConfig: allSteps,
  build,
  constraintCount: 2,
  rewriteVerified,
  stepCorrect: () => right,
  stepFinished: () => finished,
});

const observable = (gate) => ({
  done: [0, 1].map((index) => INEQUALITY_BUILD_STEPS.map((step) => gate.stepDone(index, step))),
  reports: [0, 1].map((index) => INEQUALITY_BUILD_STEPS.map((step) => gate.stepReport(index, step))),
  constraintDone: [0, 1].map((index) => gate.constraintDone(index)),
  combineOpen: gate.allConstraintsDone,
  reasoning: gate.reasoningReport({ pressed: true, complete: true, correct: true }).kind,
  snap: gate.snapToExpectedVertices,
});

test('where outcomes are withheld, nothing a check, chip or lock shows depends on whether the work is right', () => {
  assert.deepEqual(
    observable(gateFor({ showImmediateFeedback: false, right: false })),
    observable(gateFor({ showImmediateFeedback: false, right: true })),
  );
  const gate = gateFor({ showImmediateFeedback: false, right: false });
  assert.deepEqual(gate.stepReport(0, 'boundary'), { kind: 'completion', complete: true });
  assert.equal(gate.allConstraintsDone, true, 'finished-but-wrong constraints open the overlap');
  assert.equal(gate.snapToExpectedVertices, false, 'no magnet onto the true corners');
  assert.deepEqual(gate.reasoningReport({ pressed: true, complete: true, correct: false }), { kind: 'completion', complete: true });
  assert.deepEqual(gate.reasoningReport({ pressed: true, complete: false, correct: false }), { kind: 'completion', complete: false });
  assert.equal(gate.reasoningReport({ pressed: false, complete: true }), null, 'nothing before the Check is pressed');
  assert.equal(gate.probeFromOwnLines, true, "the student's own test point is probed against the student's own lines");
});

test('where outcomes are withheld, a step is done once it is finished — no Check needed, none sufficient', () => {
  const unchecked = gateFor({ showImmediateFeedback: false, right: true, build: [{}, {}] });
  assert.equal(unchecked.allConstraintsDone, true, 'finished work opens the overlap without a press');
  const unfinished = gateFor({ showImmediateFeedback: false, right: true, finished: false });
  assert.equal(unfinished.allConstraintsDone, false, 'unfinished work keeps it closed');
  assert.deepEqual(unfinished.stepReport(1, 'shading'), { kind: 'completion', complete: false });
  const noRewrite = gateFor({ showImmediateFeedback: false, right: true, rewriteVerified: (index) => index === 0 });
  assert.equal(noRewrite.constraintDone(1), false, 'an unfinished rewrite still holds its constraint');
});

test('where outcomes are withheld, each constraint is graded from the work as it stands', () => {
  assert.equal(gateFor({ showImmediateFeedback: false, right: true, build: [{}, {}] }).constraintCorrect(0), true, 'right work is right without a press');
  assert.equal(gateFor({ showImmediateFeedback: false, right: false }).constraintCorrect(0), false);
  const oneWrong = resolveInequalityBuildGate({
    showImmediateFeedback: false,
    buildConfig: allSteps,
    build: [{}, {}],
    constraintCount: 2,
    stepCorrect: (index, step) => !(index === 1 && step === 'lineStyle'),
    stepFinished: () => true,
  });
  assert.deepEqual([oneWrong.constraintCorrect(0), oneWrong.constraintCorrect(1)], [true, false]);
  // A step the question does not ask the student to build is never held against them.
  const provided = resolveInequalityBuildGate({
    showImmediateFeedback: false,
    buildConfig: { boundary: false, lineStyle: false, shading: true },
    build: [{}],
    constraintCount: 1,
    stepCorrect: (index, step) => step === 'shading',
    stepFinished: () => true,
  });
  assert.equal(provided.constraintCorrect(0), true);
});

test('where outcomes are shown, the checks, chips and lock are the verdicts practice always had', () => {
  const wrong = gateFor({ showImmediateFeedback: true, right: false });
  assert.deepEqual(wrong.stepReport(0, 'boundary'), { kind: 'verdict', passed: false });
  assert.equal(wrong.stepDone(0, 'boundary'), false);
  assert.equal(wrong.allConstraintsDone, false, 'locked until every constraint is right');
  assert.equal(wrong.snapToExpectedVertices, true);
  assert.equal(wrong.probeFromOwnLines, false, 'practice probes against the true boundaries, as it always did');
  assert.deepEqual(wrong.reasoningReport({ pressed: true, complete: true, correct: false }), { kind: 'verdict', passed: false });

  const right = gateFor({ showImmediateFeedback: true, right: true });
  assert.equal(right.allConstraintsDone, true);
  assert.deepEqual(right.stepReport(1, 'shading'), { kind: 'verdict', passed: true });

  // Right but never checked is not done — and is not graded right either.
  const unchecked = gateFor({ showImmediateFeedback: true, right: true, build: [{}, {}] });
  assert.equal(unchecked.allConstraintsDone, false);
  assert.equal(unchecked.stepReport(0, 'boundary'), null);
  assert.equal(unchecked.constraintCorrect(0), false, 'practice grading still needs each step checked');
  assert.equal(right.constraintCorrect(0), true);
});

test('the default is outcomes shown, and a question with no constraints never opens the overlap', () => {
  const gate = resolveInequalityBuildGate({ buildConfig: allSteps, build: [{}], constraintCount: 1, stepCorrect: () => true, stepFinished: () => true });
  assert.equal(gate.verdictsShown, true);
  assert.equal(gate.allConstraintsDone, false);
  assert.equal(resolveInequalityBuildGate({ showImmediateFeedback: false, constraintCount: 0 }).allConstraintsDone, false);
});

test('the completion lines carry no verdict word', () => {
  const lines = [
    ...Object.values(INEQUALITY_STEP_COMPLETION_TEXT).flatMap((text) => [text.complete, text.incomplete]),
    REASONING_COMPLETION_TEXT.complete,
    REASONING_COMPLETION_TEXT.incomplete,
  ];
  lines.forEach((line) => assert.doesNotMatch(line, /correct|right|wrong|not quite|recheck|misjudged/i, line));
});

// ---------------------------------------------------------------- the screen is held to the gate
const source = executableSource(componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));
const mode = region(source, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');

test('the student-build screen feeds the gate the runtime policy and the work as it stands', () => {
  assert.match(source, /import \{ useRevealAnswers, useToolRuntimeContext \} from '\.\.\/shared\/ToolRuntimeContext';/);
  assert.match(mode, /\n\s*const \{ showImmediateFeedback \} = useToolRuntimeContext\(\);/);
  const gate = region(mode, 'const buildGate = resolveInequalityBuildGate({', '});', 'build gate');
  for (const field of ['showImmediateFeedback', 'buildConfig', 'build', 'constraintCount', 'rewriteVerified', 'stepCorrect', 'stepFinished']) {
    assert.match(gate, new RegExp(`\\n\\s*${field},`), field);
  }
  // '\n  };' — the body's own `|| {};` must not end the region early.
  const finished = region(mode, 'const stepFinished = (index, step) => {', '\n  };', 'step completion');
  assert.match(finished, /if \(step === 'boundary'\) return Boolean\(studentLines\[index\]\);/, 'the boundary step is finished once a line is drawn');
  assert.doesNotMatch(finished, /Correct\(|workingConstraints|expected/, 'completion never consults the answer');
});

test('every chip, the overlap lock, each step line and the grade come from the gate', () => {
  assert.match(mode, /const boundaryVerified = \(index\) => buildGate\.stepDone\(index, 'boundary'\);/);
  assert.match(mode, /const styleVerified = \(index\) => buildGate\.stepDone\(index, 'lineStyle'\);/);
  assert.match(mode, /const shadeVerified = \(index\) => buildGate\.stepDone\(index, 'shading'\);/);
  assert.match(mode, /const allConstraintsComplete = buildGate\.allConstraintsDone;/);
  assert.match(mode, /disabled=\{!allConstraintsComplete\}/);
  for (const step of ['boundary', 'lineStyle', 'shading']) {
    assert.match(mode, new RegExp(`data-build-chip="${step}" style=\\{\\{ color: stepChip\\(\\w+Verified\\(index\\)\\)\\.color \\}\\}`), `${step} chip`);
  }
  const chip = region(mode, 'const stepChip = (done) =>', 'const completionLine', 'step chip');
  assert.match(chip, /buildGate\.verdictsShown\s*\?\s*\{ color: done \? '#137333'[^}]*mark: done \? '✓'/);
  assert.match(chip, /:\s*\{ color: done \? '#174ea6'[^}]*mark: done \? 'done'/);
  for (const [name, step, verdict] of [['boundaryMessage', 'boundary', 'Correct boundary.'], ['styleMessage', 'lineStyle', 'Correct line style.'], ['shadeMessage', 'shading', 'Correct shading.']]) {
    const message = region(mode, `const ${name} = (index) => {`, '\n  };', name);
    const withheld = message.indexOf(`if (!buildGate.verdictsShown) return completionLine(buildGate.stepReport(index, '${step}')`);
    assert.ok(withheld > -1, `${name} answers from the gate where outcomes are withheld`);
    assert.ok(message.indexOf(verdict) > withheld, `${name}: the verdict comes only after the withheld return`);
  }
  assert.match(mode, /constraintCorrect: hasBuildSteps \? buildGate\.constraintCorrect\(index\) : null,/);
});

test('the reasoning checks and the vertex magnet ask the gate before judging anything', () => {
  const point = region(mode, 'const checkPointResponse = (point, response, setFeedbackText, probeIndex = onBoundaryIndex(point)) => {', 'const vertexIncludedExpected', 'test point check');
  const withheld = point.indexOf('if (!buildGate.verdictsShown) {');
  assert.ok(withheld > -1 && withheld < point.indexOf('const expectedMembership = membership(point);'), 'no membership is computed before the withheld return');
  assert.ok(point.indexOf("'Correct — every part of your reasoning") > withheld);
  const vertex = region(mode, 'const checkVertex = (index) => {', 'const finalCheck', 'vertex check');
  const vertexWithheld = vertex.indexOf('if (!buildGate.verdictsShown) {');
  assert.ok(vertexWithheld > -1 && vertexWithheld < vertex.indexOf('vertexIncludedExpected(vertex)'), 'not even whether the tap is a true corner');
  assert.match(mode, /\[\.\.\.\(buildGate\.snapToExpectedVertices \? workingVertices : \[\]\), \.\.\.feasibleRegionVertices\(studentBoundaries\.filter\(Boolean\)\)\]/);
  const classification = region(mode, '{!buildGate.verdictsShown ? (', "'Correct classification.'", 'region classification line');
  assert.match(classification, /buildGate\.reasoningReport\(\{ pressed: true, complete: Boolean\(regionClassification\) \}\)/);
  const combine = region(mode, '<strong>Combined solution</strong>', 'Find overlap / Combine regions', 'combine block');
  assert.match(combine, /buildGate\.verdictsShown\s*\?\s*\(allConstraintsComplete \? 'Every constraint checks out\./);
  assert.match(combine, /'Finish every constraint above first\.'/);
});

// The questions "Does this point lie exactly on one of the boundary lines?"
// appear only when the point is on a boundary. For the student's OWN test
// point, measured against the true boundaries, that appearance is an oracle:
// tap along the line you built and see whether they show up.
test("the boundary questions under the student's own point follow the student's own lines where outcomes are withheld", () => {
  const own = region(mode, 'const ownBoundaryIndex = (point) =>', ';\n', 'own boundary index');
  assert.match(own, /effectiveLines\.findIndex\(/, "measured against the lines the student built");
  assert.doesNotMatch(own, /workingConstraints|expected/, 'never against the answer');
  assert.match(mode, /const studentProbeIndex = \(point\) => \(buildGate\.probeFromOwnLines \? ownBoundaryIndex\(point\) : onBoundaryIndex\(point\)\);/);
  const card = region(mode, 'title="Your point"', '/>', 'student point card');
  assert.match(card, /onBoundaryIndex=\{studentTestPoint \? studentProbeIndex\(studentTestPoint\) : -1\}/, 'shown for the same boundary...');
  assert.match(card, /checkPointResponse\(studentTestPoint, studentPointResponse, setStudentPointFeedback, studentProbeIndex\(studentTestPoint\)\)/, '...that the check expects answered');
  const point = region(mode, 'const checkPointResponse = (point, response, setFeedbackText, probeIndex = onBoundaryIndex(point)) => {', 'const expectedMembership', 'test point check');
  assert.match(point, /!boundaryProbeEnabled \|\| probeIndex < 0 \|\|/, 'completion asks for the boundary answers exactly when they were on screen');
  // A teacher's point is the question's own content, probed and graded against the truth.
  const teacher = region(mode, 'title="Teacher point"', '/>', 'teacher point card');
  assert.match(teacher, /onBoundaryIndex=\{onBoundaryIndex\(\[teacherTestPoint\.x, teacherTestPoint\.y\]\)\}/);
});
