import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCapability, componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { parseNumericAnswer } from '../../src/tools/shared/toolMath.js';
import { resolveInequalityBuildGate } from '../../src/tools/systemsWorkspace/inequalityBuildPolicy.js';
import {
  NO_CURSOR,
  buildFlowPlan,
  cursorForConstraint,
  graphTapAction,
  resolveBuildFlow,
  stepPosition,
} from '../../src/tools/systemsWorkspace/inequalityBuildFlow.js';
import { formatInequality } from '../../src/tools/systemsWorkspace/inequalityFormat.js';
import {
  explicitBooleanAnswerMatches,
  modelingEntryCorrect,
  studentBoundaryLineFromEntry,
  studentBuildConstraintStatus,
  studentBuildInequalityEnabled,
  studentBuildInequalityTask,
  studentBuildWorkingConstraints,
} from '../../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';
import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';

const source = componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx');
const executable = executableSource(source);
// The student-build mode is its own file now: StudentBuildInequalityMode.jsx
// keeps its state, its checks and its work; InequalityBuildPanels.jsx is what
// its steps look like; inequalityBuildFlow.js decides which step is open and
// what a tap on the graph means. SystemsWorkspace.jsx only routes to it.
const modeSource = componentSource('src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx');
const mode = executableSource(modeSource);
const panels = executableSource(componentSource('src/tools/systemsWorkspace/InequalityBuildPanels.jsx'));
const adapterSource = componentSource('functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs');
// The student-build task, its step rule and the helpers below moved out of
// SystemsWorkspace.jsx into the shared adapter, and the final check into the
// workspace's shared grader, so the screen and the server read one definition
// (server-authoritative grading). Assertions about that logic read those files,
// and check the behaviour directly where it can be run.
const adapterExecutable = executableSource(adapterSource);
const graderSource = executableSource(componentSource('functions/shared/serverGrading/tools/systemsWorkspace/graphical.mjs'));
// The student-build grader and the state function it is built on (the task,
// rows, working constraints and per-step status the misconception classifier
// reads too): one region, so the shared-task assertions bind to what grades.
const studentBuildGrader = region(graderSource, 'export const studentBuildInequalityState = (question, work) => {', 'const inequalities = (question, work)', 'student-build grader');
const sw = (fields) => ({ type: 'systemsWorkspace', mode: 'inequalities', ...fields });
const builtLine = (x1, y1, x2, y2, extra = {}) => ({
  method: 'points', x1, y1, x2, y2, slope: '', intercept: '', constant: '', point1Plotted: true, point2Plotted: true,
  boundaryAttempts: 1, style: '', styleAttempts: 0, shadePoint: null, shadeAttempts: 0, visible: true, ...extra,
});
const schemaSource = componentSource('src/tools/toolSchemas.js');
const persistenceSource = componentSource('src/tools/toolStatePersistence.js');
const rewriteSource = executableSource(componentSource('src/tools/systemsWorkspace/EmbeddedInequalityRewrite.jsx'));

test('student-build inequality mode is opt-in and does not disturb the existing construct/analyze paths', () => {
  const inequalityMode = region(executable, 'function InequalityMode(', 'function LinearQuadraticMode(', 'InequalityMode');
  // InequalityMode must route to the new mode only when a question explicitly
  // opts in, before any of the existing hooks run. The opt-in test is the
  // shared one the grader routes by, so the screen and the verdict agree.
  const route = inequalityMode.search(/const studentBuildEnabled = studentBuildInequalityEnabled\(questionData\);\s*if \(studentBuildEnabled\) return <StudentBuildInequalityMode /);
  assert.ok(route >= 0, 'InequalityMode routes opted-in questions to StudentBuildInequalityMode');
  const firstHook = inequalityMode.search(/\buse[A-Z]\w*\(/);
  assert.ok(firstHook > route, 'the routing happens before any of the legacy mode\'s hooks run');
  assert.equal(studentBuildInequalityEnabled(sw({})), false, 'an existing analyze question stays legacy');
  assert.equal(studentBuildInequalityEnabled(sw({ interaction: 'construct' })), false, 'an existing construct question stays legacy');
  assert.equal(studentBuildInequalityEnabled(sw({ studentBuild: {} })), false, 'an empty opt-in object opts into nothing');
  assert.equal(studentBuildInequalityEnabled(sw({ studentBuild: true })), true);
  assert.equal(studentBuildInequalityEnabled(sw({ studentBuild: { shading: true } })), true);
  assert.equal(studentBuildInequalityEnabled(sw({ reasoning: { vertices: true } })), true, 'reasoning alone opts in');
  assert.equal(studentBuildInequalityEnabled(sw({ modeling: { expectedConstraints: [] } })), true, 'modeling alone opts in');
  // The pre-existing "type four numbers, pick two selects" construction path
  // (the old `interaction: 'construct'` questions) must still be reachable and
  // intact for any question that does not set `studentBuild`.
  assert.match(inequalityMode, /requiresConstruction/, 'the legacy construction path must still exist for backward compatibility.');
  assert.match(inequalityMode, /Check inequality graph/, 'the legacy construct-mode submit button must be unchanged.');
});

test('every boundary type the task requires has its own construction method', () => {
  const methods = region(panels, 'export const CONSTRUCTION_METHODS', 'export const CLASSIFICATION_OPTIONS', 'CONSTRUCTION_METHODS');
  for (const [id, label] of [['points', /Two points/], ['slopeIntercept', /Slope/], ['vertical', /Vertical line/], ['horizontal', /Horizontal line/]]) {
    assert.match(methods, new RegExp(`id: '${id}'`), `${id} is offered`);
    assert.match(methods, label);
  }
  // And each one builds a boundary from the student's own work.
  const plotted = { point1Plotted: true, point2Plotted: true };
  assert.ok(studentBoundaryLineFromEntry({ method: 'points', x1: 0, y1: 1, x2: 2, y2: 3, ...plotted }));
  assert.ok(studentBoundaryLineFromEntry({ method: 'slopeIntercept', slope: '1', intercept: '1', x1: 0, y1: 1, x2: 1, y2: 2, ...plotted }));
  assert.ok(studentBoundaryLineFromEntry({ method: 'vertical', constant: '1' }));
  assert.ok(studentBoundaryLineFromEntry({ method: 'horizontal', constant: '3' }));
});

test('the graph is click/tap driven through the shared touch-hardened CoordinatePlane', () => {
  // A tap does whatever the open step needs (inequalityBuildFlow.test.mjs has
  // every case); the plane listens whenever that is something.
  assert.match(mode, /const tapAction = graphTapAction\(\{ cursor, build, plan, rewriteVerified \}\);/, 'what a tap means comes from the open step, gated by its own rewrite');
  assert.match(mode, /const graphInteractive = tapAction\.kind !== 'none';/);
  assert.match(mode, /<CoordinatePlane[\s\S]*?onPlot=\{graphInteractive \? handlePlot : null\}/, 'the shared graph is interactive whenever the step has something to place');
  const plot = region(mode, 'const handlePlot = (point) => {', 'const removeBoundaryPoint', 'handlePlot');
  assert.match(plot, /tapAction\.kind === 'boundaryPoint'[\s\S]*?if \(!rewriteVerified\(index\)\) return;/s, 'only the open constraint’s own rewrite may gate its graph action.');
  const flowPlan = buildFlowPlan(studentBuildInequalityTask(sw({ studentBuild: { rewrite: true, boundary: true }, sourceConstraints: ['y - x >= 1', 'y <= 4'], expectedConstraints: [{ A: -1, B: 1, C: -1, relation: '>=' }, { A: 0, B: 1, C: -4, relation: '<=' }] })));
  const tap = (cursor) => graphTapAction({ cursor, build: [{}, {}], plan: flowPlan, rewriteVerified: (index) => index === 1 });
  assert.equal(tap('c0:boundary').kind, 'none', 'constraint 1 is not rewritten yet');
  assert.equal(tap('c1:boundary').kind, 'boundaryPoint', 'constraint 2 is, and does not wait for constraint 1');
});

test('solid/dashed and shading feedback stays neutral on the first miss, per the platform feedback philosophy', () => {
  // `staged(attempts, first, later)`: the first argument is what a first miss says.
  assert.match(region(mode, 'const boundaryMessage = (index) => {', '\n  };', 'boundaryMessage'), /staged\(entry\.boundaryAttempts,\s*'Check whether the points you used satisfy the boundary equation\.'/);
  assert.match(region(mode, 'const styleMessage = (index) => {', '\n  };', 'styleMessage'), /staged\(entry\.styleAttempts,\s*'Check whether points on the boundary are included\.'/);
  assert.match(region(mode, 'const shadeMessage = (index) => {', '\n  };', 'shadeMessage'), /staged\(entry\.shadeAttempts,\s*'Use a test point or compare the inequality to its boundary\.'/);
  assert.match(mode, /const staged = \(attempts, first, later\) => \(attempts <= 1 \? first : later\);/);
});

// The decisions below live in resolveInequalityBuildGate (inequalityBuildPolicy.js)
// since the DOL / quiz / test fix: there a step counts once it is FINISHED and
// nothing is a verdict (inequalityBuildOutcomePolicy.test.mjs). Where outcomes
// are shown — practice, warm-up, classwork — they are exactly what these tests
// always protected.
const practiceGate = (overrides = {}) => resolveInequalityBuildGate({
  showImmediateFeedback: true,
  buildConfig: { boundary: true, lineStyle: true, shading: true },
  build: [{ boundaryAttempts: 1, styleAttempts: 1, shadeAttempts: 1 }],
  constraintCount: 1,
  rewriteVerified: () => true,
  stepCorrect: () => true,
  stepFinished: () => true,
  ...overrides,
});

test('progress checkmarks and Combine remain locked until the student explicitly checks each enabled construction step', () => {
  // Right but unchecked work ticks nothing and opens nothing.
  const unchecked = practiceGate({ build: [{ boundaryAttempts: 1, styleAttempts: 0, shadeAttempts: 1 }] });
  assert.equal(unchecked.stepDone(0, 'boundary'), true);
  assert.equal(unchecked.stepDone(0, 'lineStyle'), false, 'the line style was never checked');
  assert.equal(unchecked.allConstraintsDone, false);
  assert.equal(practiceGate().allConstraintsDone, true);
  // A step's mark, its constraint's progress and the order the steps open in
  // all come from the flow, which is handed the gate's stepDone and nothing else.
  assert.match(region(mode, 'const flowContext = {', '\n  };', 'flowContext'),
    /stepDone: \(index, step\) => \(step === 'rewrite' \? rewriteVerified\(index\) : buildGate\.stepDone\(index, step\)\),/);
  // Whether a step is RIGHT is the shared step rule (the one the grader marks
  // with), which the screen hands the gate as stepCorrect.
  assert.match(mode, /const constraintStatus = Array\.from\(\{ length: constraintCount \}, \(_, index\) => studentBuildConstraintStatus\(/);
  for (const step of ['boundaryCorrect', 'styleCorrect', 'shadeCorrect']) {
    assert.match(mode, new RegExp(`const ${step} = \\(index\\) => stepStatus\\(index, '${step}'\\);`));
  }
  assert.match(region(mode, 'const stepCorrect = (index, step) => (', '\n  );', 'step correctness'),
    /step === 'boundary' \? boundaryCorrect\(index\) : step === 'lineStyle' \? styleCorrect\(index\) : shadeCorrect\(index\)/);
  const allSteps = { rewrite: false, boundary: true, lineStyle: true, shading: true };
  const constraint = { A: -1, B: 1, C: -1, relation: '>=' }; // y >= x + 1
  const right = builtLine(0, 1, 2, 3, { style: 'solid', shadePoint: [0, 5] });
  const status = (entry) => studentBuildConstraintStatus({ buildConfig: allSteps, entry, workingConstraint: constraint, bounds: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 } });
  const uncheckedStatus = status({ ...right, boundaryAttempts: 0 });
  assert.equal(uncheckedStatus.boundaryCorrect, true, 'the boundary itself is right');
  assert.equal(uncheckedStatus.boundaryVerified, false, 'but it is not verified until the student checks it');
  assert.equal(uncheckedStatus.styleVerified, false);
  assert.equal(uncheckedStatus.shadeVerified, false);
  assert.equal(uncheckedStatus.constraintVerified, false);
  const checked = status({ ...right, styleAttempts: 1, shadeAttempts: 1 });
  assert.deepEqual([checked.boundaryVerified, checked.styleVerified, checked.shadeVerified, checked.constraintVerified], [true, true, true, true]);
  // So where outcomes are shown a ✓ on screen is exactly the shared
  // "verified": the gate, fed the shared rule the way the screen feeds it,
  // agrees on every checked or unchecked, right or wrong step.
  const STEP_KEYS = { boundary: ['boundaryCorrect', 'boundaryVerified'], lineStyle: ['styleCorrect', 'styleVerified'], shading: ['shadeCorrect', 'shadeVerified'] };
  for (const entry of [
    right,
    { ...right, styleAttempts: 1, shadeAttempts: 1 },
    { ...right, boundaryAttempts: 0, styleAttempts: 1, shadeAttempts: 1 },
    { ...right, style: 'dashed', styleAttempts: 1, shadeAttempts: 1 },
    { ...right, shadePoint: [0, -5], styleAttempts: 1, shadeAttempts: 1 },
  ]) {
    const shared = status(entry);
    const gate = resolveInequalityBuildGate({
      showImmediateFeedback: true,
      buildConfig: allSteps,
      build: [entry],
      constraintCount: 1,
      stepCorrect: (index, step) => shared[STEP_KEYS[step][0]] === true,
      stepFinished: () => true,
    });
    for (const [step, [, verified]] of Object.entries(STEP_KEYS)) assert.equal(gate.stepDone(0, step), shared[verified], `${step}: ${JSON.stringify(entry)}`);
    assert.equal(gate.constraintDone(0), shared.constraintVerified, JSON.stringify(entry));
  }
  assert.match(mode, /const rewriteVerified = .*verifiedConstraint/);
  assert.match(mode, /const allConstraintsComplete = buildGate\.allConstraintsDone;/);
  // Where outcomes are shown a done step is a ✓; where they are withheld a ●
  // that says only "recorded".
  assert.match(mode, /const doneMark = buildGate\.verdictsShown \? '✓' : '●';/);
  const flowPlan = buildFlowPlan(studentBuildInequalityTask(sw({ studentBuild: { boundary: true, lineStyle: true, shading: true }, inequalities: [{ m: 1, b: 1, relation: '>=' }] })));
  const flowFor = (gateOverrides) => {
    const gate = practiceGate(gateOverrides);
    return resolveBuildFlow({ plan: flowPlan, stepDone: gate.stepDone, combined: false, reasoningDone: () => false, cursor: null });
  };
  const uncheckedFlow = flowFor({ build: [{ boundaryAttempts: 1, styleAttempts: 0, shadeAttempts: 1 }] });
  assert.equal(uncheckedFlow.positionState('c0:boundary'), 'done');
  assert.equal(uncheckedFlow.cursor, 'c0:lineStyle', 'the unchecked step is the one still open');
  assert.equal(uncheckedFlow.positionState('combine'), 'locked');
  assert.equal(flowFor({}).positionState('combine'), 'current');
});

test('the combined region is locked until every constraint is individually correct, and never renders early', () => {
  assert.equal(practiceGate({ stepCorrect: (index, step) => step !== 'shading' }).allConstraintsDone, false, 'one wrong step keeps the overlap locked');
  assert.equal(practiceGate({ constraintCount: 0, build: [] }).allConstraintsDone, false, 'no constraints, no overlap');
  assert.match(mode, /disabled=\{!allConstraintsComplete\}/, 'Find overlap / Combine regions must be disabled until every constraint checks out.');
  assert.match(mode, /const studentPolygon = combined && studentBoundaries\.every\(Boolean\) \?/, 'the overlap is computed only after the student explicitly combines');
  const layers = region(panels, 'export function InequalityGraphLayers(', '\n}\n', 'InequalityGraphLayers');
  assert.match(layers, /combined\s*&&\s*studentPolygon\.length\s*>=\s*3/, 'the combined polygon must only render after the student explicitly combines, never before.');
});

test('blank yes/no answers cannot earn accidental credit and requested vertex work requires full vertex coverage', () => {
  assert.match(adapterExecutable, /export const explicitBooleanAnswerMatches/);
  assert.equal(explicitBooleanAnswerMatches('', false), false, 'a blank answer never matches, even a "no"');
  assert.equal(explicitBooleanAnswerMatches('no', false), true);
  assert.match(mode, /explicitBooleanAnswerMatches\(response\.overall/);
  assert.match(mode, /explicitBooleanAnswerMatches\(vertex\.includedAnswer/);
  // Full vertex coverage is the shared grader's rule now.
  assert.match(studentBuildGrader, /const allExpectedVerticesFound/);
  assert.match(studentBuildGrader, /vertices\.length === workingVertices\.length/);
  assert.match(studentBuildGrader, /vertexCoverageCorrect/);
  const triangle = sw({ reasoning: { vertices: true }, inequalities: [{ m: 0, b: 0, relation: '>=' }, { orientation: 'vertical', x: 0, relation: '>=' }, { m: -1, b: 4, relation: '<=' }] });
  const build = [{}, {}, {}];
  const allCorners = [{ x: 0, y: 0, includedAnswer: 'yes' }, { x: 4, y: 0, includedAnswer: 'yes' }, { x: 0, y: 4, includedAnswer: 'yes' }];
  assert.equal(systemsWorkspaceGrader.grade(triangle, { build, vertices: allCorners }).isCorrect, true);
  assert.equal(systemsWorkspaceGrader.grade(triangle, { build, vertices: allCorners.slice(0, 2) }).isCorrect, false, 'a missed corner fails the vertex work');
  assert.equal(systemsWorkspaceGrader.grade(triangle, { build, vertices: allCorners.map((v) => ({ ...v, includedAnswer: '' })) }).isCorrect, false, 'unanswered inclusion earns nothing');
});

test('the test-point tool reasons per inequality, overall, and about boundary inclusion specifically', () => {
  const questions = region(panels, 'export function TestPointQuestions(', 'export function VertexList(', 'TestPointQuestions');
  assert.match(questions, /Does the point satisfy inequality/);
  assert.match(questions, /Is the point a solution to the entire system\?/);
  assert.match(questions, /Does this point lie exactly on one of the boundary lines\?/);
  assert.match(questions, /is it included in the solution region\?/);
  assert.match(questions, /\{showBoundaryProbe \? \(/, 'the boundary questions appear only for a point on a boundary');
  // Both the teacher's point and the student's own point ask them.
  assert.equal((mode.match(/<TestPointQuestions\b/g) || []).length, 2);
  assert.match(mode, /showBoundaryProbe=\{boundaryProbeEnabled && onBoundaryIndex\(\[teacherTestPoint\.x, teacherTestPoint\.y\]\) >= 0\}/);
  assert.match(mode, /showBoundaryProbe=\{boundaryProbeEnabled && studentProbeIndex\(studentTestPoint\) >= 0\}/);
});

test('region classification supports bounded, unbounded, AND no solution as a legitimate completion path', () => {
  const options = region(panels, 'export const CLASSIFICATION_OPTIONS', 'export const LINE_STYLE_OPTIONS', 'CLASSIFICATION_OPTIONS');
  assert.match(options, /value: 'bounded'/);
  assert.match(options, /value: 'unbounded'/);
  assert.match(options, /value: 'empty', label: 'No solution'/);
  assert.match(mode, /<ChoiceGroup[\s\S]*?options=\{CLASSIFICATION_OPTIONS\}[\s\S]*?onChange=\{setRegionClassification\}/);
  // "No solution" is a right answer when the constraints never overlap.
  const disjoint = sw({ studentBuild: { shading: true }, askClassification: true, inequalities: [{ m: 0, b: 4, relation: '>=' }, { m: 0, b: 1, relation: '<=' }] });
  const part = (classification) => systemsWorkspaceGrader.grade(disjoint, { build: [{}, {}], regionClassification: classification, vertices: [] })
    .parts.find((entry) => entry.id === 'region-classification');
  assert.equal(part('empty').isCorrect, true);
  assert.equal(part('bounded').isCorrect, false);
});

test('vertex mode distinguishes a geometric intersection from an included solution point', () => {
  assert.match(mode, /vertexIncludedExpected/);
  assert.match(region(panels, 'export function VertexList(', 'export function ModelingFields(', 'VertexList'), /Is this vertex included in the solution set\?/);
  assert.match(mode, /excluded even though the lines still cross/);
});

test('the final check reports concept-level diagnostics, not just an overall right/wrong', () => {
  // The final check submits the shared grader's verdict, and that verdict is
  // a part per concept — each constraint, the model, the region, the test
  // point (each inequality, the system, boundary inclusion) and the vertices —
  // which the attempt records as its part grades.
  const finalCheck = region(mode, 'const finalCheck = () => {', '\n  };', 'finalCheck');
  assert.match(finalCheck, /const result = gradeToolCheck\(systemsWorkspaceGrader, questionData, work\);/);
  assert.match(finalCheck, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode: 'inequalities-studentBuild', parts: result\.parts \}\);/);
  const question = sw({ studentBuild: true, reasoning: { vertices: true }, inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }], testPoint: { x: 0, y: 1 } });
  const ids = systemsWorkspaceGrader.grade(question, { build: [{}, {}], vertices: [] }).parts.map((part) => part.id);
  assert.deepEqual(ids, ['constraint-1', 'constraint-2', 'region-classification', 'teacher-point-inequalities', 'teacher-point-system', 'teacher-point-boundary', 'vertices']);
  const modeled = sw({ modeling: { variables: [{ symbol: 'x' }, { symbol: 'y' }], expectedConstraints: [{ A: 1, B: 1, C: -4, relation: '<=' }] } });
  assert.deepEqual(systemsWorkspaceGrader.grade(modeled, { build: [{}], modelingEntries: [{}] }).parts.map((part) => part.id), ['model-1']);
});

test('hint usage in the new mode is still reported the same way as every other tool', () => {
  assert.match(mode, /onHintUsed=\{\(\) => onAction\?\.\('HINT_USED'\)\}/);
});

test('constraint modeling reuses the same graphing/checking machinery instead of a second engine', () => {
  // The model is sent by the student, and only then graphed.
  assert.match(region(mode, 'const sendModel = () => {', '\n  };', 'sendModel'), /setModelingSent\(true\);/);
  assert.match(mode, /onClick=\{sendModel\} disabled=\{!modelingEntriesReady\}/);
  assert.match(studentBuildGrader, /modelingEntryCorrect\(row, expected\)/);
  // The modeling ground truth feeds the SAME boundary/style/shade grading and
  // the SAME feasibleRegionPolygon/classifyFeasibleRegion calls the
  // non-modeling path uses — proven by there being exactly one definition of
  // `expectedConstraints` that both branches read from (the shared task), which
  // the workspace and the grader both take.
  assert.equal((adapterExecutable.match(/const expectedConstraints = modeling/g) || []).length, 1);
  assert.doesNotMatch(mode, /const expectedConstraints\s*=/, 'the workspace does not define its own expected constraints');
  assert.match(mode, /const task = useMemo\(\(\) => studentBuildInequalityTask\(questionData\), \[questionData\]\);/);
  assert.match(mode, /\{[^}]*\bexpectedConstraints\b[^}]*\} = task;/);
  assert.match(studentBuildGrader, /const task = studentBuildInequalityTask\(question\);/);
  assert.match(studentBuildGrader, /const studentBuildInequalities = \(question, work\) => \{\s*const \{[^}]*\} = studentBuildInequalityState\(question, work\);/, 'the grader grades the shared state');
  const modeled = studentBuildInequalityTask(sw({ modeling: { expectedConstraints: [{ A: 2, B: 3, C: -12, relation: '<=' }] }, inequalities: [{ m: 9, b: 9, relation: '>' }] }));
  assert.deepEqual(modeled.expectedConstraints, [{ A: 2, B: 3, C: -12, relation: '<=' }], 'a modeling question is graded against its model, never its display inequalities');
  const plain = studentBuildInequalityTask(sw({ studentBuild: true, inequalities: [{ m: 2, b: 1, relation: '<' }] }));
  assert.deepEqual({ ...plain.expectedConstraints[0] }, { A: -2, B: 1, C: -1, relation: '<' });
});

test('all new answer-bearing state is draft-backed, and the registry names every new transient UI field', () => {
  // The open step and the answer each reasoning Check was about are kept too,
  // so a reload or a reopened Work View lands on the same step with the same
  // lines under it.
  ['modelingEntries', 'modelingSent', 'rewriteEntries', 'activeStep', 'build', 'combined', 'regionClassification', 'regionClassificationAttempts',
    'teacherPointResponse', 'studentTestPoint', 'studentPointResponse', 'vertices', 'reasoningChecks'].forEach((key) => {
    assert.match(mode, new RegExp(`usePersistentToolState\\('${key}'`), `${key} must be usePersistentToolState-backed so Work View close/reopen and question navigation cannot erase it.`);
  });
  const registryEntry = region(persistenceSource, 'systemsWorkspace: entry(', 'parabolaGeometryLab: entry(', 'systemsWorkspace persistence entry');
  assert.match(registryEntry, /'systemsWorkspace\/StudentBuildInequalityMode\.jsx'/, 'the mode\'s own file is read by the persistence gate');
  ['tapNotice', 'plotNotice'].forEach((key) => {
    // Named as a key of the entry, not merely mentioned in a reason.
    assert.match(registryEntry, new RegExp(`\\b${key}:`), `${key} is a raw useState in the inequality modes and must be named in the persistence contract.`);
  });
  assert.deepEqual([...mode.matchAll(/const \[(\w+), set\w*\] = useState\(/g)].map((match) => match[1]), ['tapNotice'], 'nothing a student answers with is in useState');
});

test('slope-intercept construction requires two student points and never manufactures the slope movement', () => {
  // studentBoundaryLineFromEntry moved, unchanged, into the shared adapter.
  const builder = region(adapterExecutable, 'export const studentBoundaryLineFromEntry', 'export const boundaryLinesMatch', 'studentBoundaryLineFromEntry');
  assert.match(builder, /\[m, b, x1, y1, x2, y2\]\.some/);
  assert.match(builder, /boundaryFromTwoPoints\(\[x1, y1\], \[x2, y2\]\)/);
  assert.match(builder, /Math\.abs\(x1\).*Math\.abs\(y1 - b\)/s);
  assert.doesNotMatch(builder, /\[0,\s*b\].*\[1,\s*m\s*\+\s*b\]/s);
  assert.match(builder, /!entry\.point1Plotted \|\| !entry\.point2Plotted/);
  // Plotted coordinates exist only where the student tapped: they are shown
  // (as chips), never typed.
  const fields = region(panels, 'export function BoundaryStepFields(', 'export function ConstraintCard(', 'BoundaryStepFields');
  assert.match(fields, /<BoundaryPointChips\b/);
  assert.doesNotMatch(fields, /onPatch\(\{\s*[xy][12]\s*:/, 'no box edits a plotted coordinate');
  assert.doesNotMatch(region(panels, 'export function BoundaryPointChips(', 'export function BoundaryStepFields(', 'BoundaryPointChips'), /<input/);
  const slopeField = fields.match(/Slope \(m\)(<input[^>]*>)/)?.[1] || '';
  assert.match(slopeField, /type="text"/);
  assert.match(slopeField, /placeholder="e\.g\. -2\/3"/);
  assert.equal(parseNumericAnswer('-2/3'), -2 / 3, 'the slope field accepts the canonical numeric parser\'s rise/run form');
});

test('constraint cards are accessible accordions that allow none open without discarding progress', () => {
  const card = region(panels, 'export function ConstraintCard(', 'export function StepRow(', 'ConstraintCard');
  assert.match(card, /<button type="button" className="mm-ineq-card-header" aria-expanded=\{expanded\}/);
  assert.match(mode, /expanded=\{expanded\}/);
  assert.match(mode, /const expanded = flow\.activeIndex === index;/);
  assert.match(mode, /onToggle=\{\(\) => moveCursor\(cursorForConstraint\(flowContext, index\)\)\}/);
  // Pressing the open constraint closes it; what was done stays done.
  const flowPlan = buildFlowPlan(studentBuildInequalityTask(sw({ studentBuild: { boundary: true, lineStyle: true }, inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: 0, b: 4, relation: '<=' }] })));
  const context = { plan: flowPlan, stepDone: (index, step) => index === 0 && step === 'boundary', combined: false, reasoningDone: () => false, cursor: 'c0:lineStyle' };
  const next = cursorForConstraint(context, 0);
  assert.equal(next, NO_CURSOR);
  const closed = resolveBuildFlow({ ...context, cursor: next });
  assert.equal(closed.activeIndex, null, 'none open');
  assert.equal(closed.positionState(stepPosition(0, 'boundary')), 'done', 'progress kept');
  assert.equal(cursorForConstraint({ ...context, cursor: next }, 0), 'c0:lineStyle', 'reopening lands on the step still to do');
});

test('rewrite is embedded, persistent, and gates graph construction while canonical answers stay separate', () => {
  // Source (shown) and expected (graded) constraints stay separate in the
  // shared task the workspace and the grader both read.
  const taskSource = region(adapterExecutable, 'export const studentBuildInequalityTask', 'export const studentBuildWorkingConstraints', 'studentBuildInequalityTask');
  assert.match(taskSource, /sourceConstraints: question\.sourceConstraints/);
  assert.match(taskSource, /const rawExpectedConstraints = question\.expectedConstraints/);
  const separate = studentBuildInequalityTask(sw({ studentBuild: { rewrite: true }, sourceConstraints: ['2x + y >= 4'], expectedConstraints: [{ A: 2, B: 1, C: -4, relation: '>=' }] }));
  assert.deepEqual(separate.sourceConstraints, ['2x + y >= 4']);
  assert.deepEqual({ ...separate.expectedConstraints[0] }, { A: 2, B: 1, C: -4, relation: '>=' });
  assert.match(mode, /<EmbeddedInequalityRewrite/);
  // The boundary step of a constraint opens only once its rewrite is verified.
  const flowPlan = buildFlowPlan(separate);
  assert.deepEqual(flowPlan.constraintSteps, ['rewrite']);
  const withBoundary = buildFlowPlan(studentBuildInequalityTask(sw({ studentBuild: { rewrite: true, boundary: true }, sourceConstraints: ['2x + y >= 4'], expectedConstraints: [{ A: 2, B: 1, C: -4, relation: '>=' }] })));
  const flowFor = (verified) => resolveBuildFlow({ plan: withBoundary, stepDone: (index, step) => (step === 'rewrite' ? verified : false), combined: false, reasoningDone: () => false, cursor: null });
  assert.equal(flowFor(false).positionState('c0:boundary'), 'locked', 'graph construction waits for the rewrite');
  assert.equal(flowFor(false).cursor, 'c0:rewrite');
  assert.equal(flowFor(true).cursor, 'c0:boundary');
  assertCapability(rewriteSource, [/boundary step opens when y is isolated/, /unlocks after your rewrite is verified/], 'the rewrite says what finishing it opens');
});

test('rewrite phase reuses the mature relation solver instead of maintaining a second mini-solver', () => {
  assert.match(rewriteSource, /import MultiRelationAlgebraCore from '..\/..\/MultiRelationAlgebraCore\.jsx'/);
  assert.match(rewriteSource, /<MultiRelationAlgebraCore/);
  assert.match(rewriteSource, /solveFor:\s*'y'/);
  assert.match(rewriteSource, /denseWorkspace/);
  assert.doesNotMatch(rewriteSource, /const applyOperation = \(\) =>/,
    'Systems Workspace must not own a separate balanced-operation implementation anymore');
  assert.doesNotMatch(rewriteSource, /<select aria-label="Balanced operation"/,
    'the old dropdown mini-solver must not return');
});

test('the embedded relation solver keeps the absolute-value solver interaction contract and persistent draft identity', () => {
  assert.match(mode, /draftKey=\{draftKey \? `\$\{draftKey\}:systems-rewrite:\$\{index\}` : null\}/);
  assert.match(rewriteSource, /Place every operation on both sides/);
  assert.match(rewriteSource, /value\?\.committedText/);
  assert.match(rewriteSource, /!value\?\.pendingFlip && value\?\.committedText/,
    'safe in-progress work from the old widget should seed the mature solver after deployment');
});

test('rewrite completion only unlocks graphing after an equivalent y-on-the-left graphing form is reached', () => {
  assert.match(rewriteSource, /graphableConstraintFromRelation\(relation\)/);
  assert.match(rewriteSource, /candidate && sameConstraint\(candidate, expectedConstraint\)/);
  assert.match(rewriteSource, /verifiedText:\s*verified \? relation : ''/);
  assert.match(rewriteSource, /verifiedConstraint:\s*verified/);
  assert.match(rewriteSource, /Math\.abs\(left\.b - 1\)/);
  assert.match(rewriteSource, /Math\.abs\(right\.b\)/);
  assert.match(rewriteSource, /return null/);
});

test('completed rewrites display a clean slope-intercept inequality instead of the solver\'s unsimplified intermediate text', () => {
  assert.match(modeSource, /import \{ formatSlopeInterceptInequality \} from '.\/linearInequalityEngine\.js'/);
  assert.match(mode, /if \(buildConfig\.rewrite && rewriteEntries\[index\]\?\.verifiedConstraint\)/);
  assert.match(mode, /return formatSlopeInterceptInequality\(rewriteEntries\[index\]\.verifiedConstraint\)/);
  assert.doesNotMatch(
    region(mode, 'const inequalityLabel = (index) =>', 'const updateBuildEntry', 'inequalityLabel'),
    /verifiedText/,
    'student algebra history may persist internally, but the completed graphing card must not expose the unsimplified terminal solver expression',
  );
  // The finished rewrite step's one-line summary is the same clean form.
  assert.match(region(mode, 'const stepSummary = (index, step) => {', '\n  };', 'stepSummary'),
    /if \(step === 'rewrite'\) return rewriteEntries\[index\]\?\.verifiedConstraint \? formatSlopeInterceptInequality\(rewriteEntries\[index\]\.verifiedConstraint\) : '';/);
});

test('rewrite-only work requires verified rewrite evidence and shows it in collapsed progress', () => {
  // A constraint whose rewrite is not verified is neither done nor graded
  // right, whatever else is built — under either policy (graded: the shared
  // grader, below).
  for (const showImmediateFeedback of [true, false]) {
    const gate = practiceGate({ showImmediateFeedback, rewriteVerified: () => false });
    assert.equal(gate.constraintDone(0), false, `${showImmediateFeedback}`);
  }
  const gate = region(mode, 'const buildGate = resolveInequalityBuildGate({', '});', 'build gate');
  assert.match(gate, /\n\s*rewriteVerified,/);
  // The step rule (shared with the grader) requires a verified rewrite first,
  // checked-and-right or as it stands.
  assert.match(mode, /rewriteVerified: rewriteVerified\(index\),/);
  assert.match(adapterExecutable, /constraintVerified: rewriteDone && boundaryVerified && styleVerified && shadeVerified/);
  assert.match(adapterExecutable, /constraintCorrect: rewriteDone && boundaryCorrect && styleCorrect && shadeCorrect/);
  const rewriteOnly = sw({ studentBuild: { rewrite: true }, sourceConstraints: ['2x + y >= 4'], expectedConstraints: [{ A: 2, B: 1, C: -4, relation: '>=' }] });
  const verified = { relation: 'y >= -2 x + 4', graphingForm: { A: 2, B: 1, C: -4, relation: '>=' } };
  for (const policy of [{}, { outcomesWithheld: true }]) {
    const label = JSON.stringify(policy);
    assert.equal(systemsWorkspaceGrader.grade(rewriteOnly, { build: [{}], rewrite: [verified], ...policy }).isCorrect, true, label);
    assert.equal(systemsWorkspaceGrader.grade(rewriteOnly, { build: [{}], rewrite: [{ relation: '2x + y >= 4', graphingForm: null }], ...policy }).isCorrect, false, `no verified rewrite, no credit ${label}`);
    assert.equal(systemsWorkspaceGrader.grade(rewriteOnly, { build: [{}], ...policy }).isCorrect, false, `missing rewrite evidence earns nothing ${label}`);
  }
  // Collapsed, the rewrite step is done exactly when it is verified.
  assert.match(region(mode, 'const flowContext = {', '\n  };', 'flowContext'), /step === 'rewrite' \? rewriteVerified\(index\)/);
});

test('the student-build workspace is wired into Work View with undo, point editing, and a primary check action', () => {
  assert.match(mode, /<EnlargeableFigure[\s\S]*?capabilities=\{\{/);
  assert.match(mode, /undo:\s*undoHistory\.capability/);
  assert.match(mode, /pointEditing:\s*\{/);
  assert.match(mode, /primaryActions:\s*\[\{\s*id:\s*'check-student-build'/);
});

test('student-facing inequality labels support legacy slope-intercept, vertical/horizontal, and canonical standard form', () => {
  // One formatter for every inequality mode (systemsWorkspaceFormat.test.mjs
  // has the cases).
  assert.equal(formatInequality({ m: 1, b: 1, relation: '>=' }), 'y ≥ x + 1');
  assert.equal(formatInequality({ orientation: 'vertical', x: 1, relation: '>=' }), 'x ≥ 1');
  assert.equal(formatInequality({ orientation: 'horizontal', y: 3, relation: '<' }), 'y < 3');
  assert.equal(formatInequality({ A: 2, B: 1, C: -4, relation: '>=' }), '2x + y ≥ 4');
  for (const [path, text] of [['SystemsWorkspace.jsx', source], ['StudentBuildInequalityMode.jsx', modeSource]]) {
    assert.match(text, /import \{[^}]*\bformatInequality\b[^}]*\} from '\.\/inequalityFormat\.js'/, `${path} writes labels with the shared formatter`);
  }
  assert.doesNotMatch(executable, /const (displayRelation|formatLinearTerm|formatInequality) =/, 'no second formatter to drift');
});

test('authored questions can express vertical and horizontal boundaries, which the old {m, b} shape could not', () => {
  assert.match(adapterSource, /orientation === 'vertical'/);
  assert.match(adapterSource, /orientation === 'horizontal'/);
  assert.match(schemaSource, /orientation/);
  assert.match(schemaSource, /systemsWorkspace studentBuild requires at least one inequality/);
});

test('authoring schema keeps legacy systems at two inequalities while allowing one-inequality student construction and requires a point for boundary probes', () => {
  assert.match(schemaSource, /minimumInequalities = question\.studentBuild \|\| question\.reasoning \|\| question\.modeling \? 1 : 2/);
  assert.match(schemaSource, /reasoning\.boundaryProbe requires a finite teacher testPoint/);
  assert.match(schemaSource, /if \(mode === 'inequalities'\) \{[\s\S]*?\['studentBuild', 'reasoning'\]/);
});

test('canonical studentBuild and reasoning flags are honored independently instead of forcing every construction step on', () => {
  assert.match(adapterExecutable, /const buildConfig = inequalityConfig\.studentBuild;/);
  assert.match(mode, /\{[^}]*\bbuildConfig\b[^}]*\} = task;/);
  // The steps on screen are the enabled ones, from the same task.
  assert.match(mode, /const plan = useMemo\(\(\) => buildFlowPlan\(task\), \[task\]\);/);
  assert.match(mode, /plan\.constraintSteps\.map\(\(step\) => \{/);
  assert.match(adapterExecutable, /reasoningConfig\.testPoint/);
  assert.match(mode, /boundaryProbeEnabled/);
  const styleOnly = studentBuildInequalityTask(sw({ studentBuild: { lineStyle: true }, reasoning: { boundaryProbe: true }, testPoint: { x: 0, y: 0 } }));
  assert.deepEqual(styleOnly.buildConfig, { rewrite: false, boundary: false, lineStyle: true, shading: false });
  assert.equal(styleOnly.boundaryProbeEnabled, true);
  assert.equal(styleOnly.askClassification, false, 'classification is not forced on');
  assert.deepEqual(buildFlowPlan(styleOnly).constraintSteps, ['lineStyle'], 'only the asked step is shown');
});

test('contextual modeling graphs and reasons from the student-authored canonical constraints while grading the model as an unordered set', () => {
  assert.match(adapterExecutable, /export const modelingEntryToCanonical/);
  assert.match(mode, /const workingConstraints = useMemo\(\(\) => studentBuildWorkingConstraints\(\{\s*task,\s*modelingEntries,\s*modelingSent,/);
  assert.match(adapterExecutable, /if \(task\.modeling && modelingSent && modeledConstraints\.every\(Boolean\)\) return modeledConstraints;/);
  const modelTask = studentBuildInequalityTask(sw({ modeling: { expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }] } }));
  const studentRow = { coeffA: '1', coeffB: '1', relation: '<=', constant: '12' };
  assert.deepEqual(studentBuildWorkingConstraints({ task: modelTask, modelingEntries: [studentRow], modelingSent: true }), [{ A: 1, B: 1, C: -12, relation: '<=' }], 'a sent, valid model is graphed and reasoned from');
  assert.equal(studentBuildWorkingConstraints({ task: modelTask, modelingEntries: [studentRow], modelingSent: false }), modelTask.expectedConstraints);
  assert.equal(studentBuildWorkingConstraints({ task: modelTask, modelingEntries: [{ ...studentRow, constant: '' }], modelingSent: true }), modelTask.expectedConstraints);
  assert.match(studentBuildGrader, /const unmatchedExpected = new Set\(expectedConstraints\.map/);
  assert.match(studentBuildGrader, /unmatchedExpected\.has\(index\) && modelingEntryCorrect\(row, expected\)/);
  assert.match(studentBuildGrader, /unmatchedExpected\.delete\(matchedIndex\)/,
    'one expected constraint may only satisfy one student row, so duplicates cannot earn double credit');
  assert.doesNotMatch(studentBuildGrader, /modelingEntryCorrect\(\w+, expectedConstraints\[index\]\)/,
    'a correct system of constraints must not be marked wrong merely because the student entered them in a different order');
  const twoConstraints = sw({ modeling: { variables: [{ symbol: 'x' }, { symbol: 'y' }], expectedConstraints: [{ A: 1, B: 0, C: 0, relation: '>=' }, { A: 1, B: 1, C: -10, relation: '<=' }] } });
  const reordered = [{ coeffA: '1', coeffB: '1', relation: '<=', constant: '10' }, { coeffA: '1', coeffB: '0', relation: '>=', constant: '0' }];
  assert.equal(systemsWorkspaceGrader.grade(twoConstraints, { build: [{}, {}], modelingEntries: reordered, modelingSent: true }).isCorrect, true);
  assert.equal(systemsWorkspaceGrader.grade(twoConstraints, { build: [{}, {}], modelingEntries: [reordered[0], reordered[0]], modelingSent: true }).isCorrect, false);
  assert.match(mode, /classifyFeasibleRegion\(workingConstraints\)/);
});

test('disabled reasoning/build capabilities do not create hidden required answers or false mastery evidence', () => {
  assert.match(mode, /!boundaryProbeEnabled \|\| boundaryIndex < 0/);
  // A step the question does not ask for is provided, never a hidden answer.
  assert.match(adapterExecutable, /const boundaryCorrect = !buildConfig\.boundary \|\|/);
  assert.match(adapterExecutable, /const styleCorrect = !buildConfig\.lineStyle\s*\|\|/);
  assert.match(adapterExecutable, /const shadeCorrect = !buildConfig\.shading \|\|/);
  const styleOnly = sw({ studentBuild: { lineStyle: true }, inequalities: [{ m: 1, b: 1, relation: '<' }] });
  const onlyStyle = { method: '', style: 'dashed', styleAttempts: 1, boundaryAttempts: 0, shadeAttempts: 0, shadePoint: null };
  assert.equal(systemsWorkspaceGrader.grade(styleOnly, { build: [onlyStyle] }).isCorrect, true, 'an unasked boundary or shading cannot cost credit');
  assert.equal(systemsWorkspaceGrader.grade(styleOnly, { build: [{ ...onlyStyle, style: 'solid' }] }).isCorrect, false);
});

test('context modeling accepts mathematically equivalent scaled inequalities and lets students return to revise their model', () => {
  assert.match(adapterExecutable, /export const equivalentLinearInequality/);
  assert.match(adapterExecutable, /flipInequalityRelation/);
  const expected = { A: 1, B: 1, C: -10, relation: '<=' };
  assert.equal(modelingEntryCorrect({ coeffA: '2', coeffB: '2', relation: '<=', constant: '20' }, expected), true, 'a positive multiple');
  assert.equal(modelingEntryCorrect({ coeffA: '-1', coeffB: '-1', relation: '>=', constant: '-10' }, expected), true, 'a negative multiple flips the relation');
  assert.equal(modelingEntryCorrect({ coeffA: '-1', coeffB: '-1', relation: '<=', constant: '-10' }, expected), false);
  assert.match(mode, /const modelingEntriesReady/);
  assert.match(mode, /onClick=\{reopenModeling\}>Edit constraints</);
  assert.match(region(mode, 'const reopenModeling = () => {', '\n  };', 'reopenModeling'), /setModelingSent\(false\);/);
});

test('the boundary adapter delegates math to the canonical PR #293 engine instead of maintaining a duplicate engine', () => {
  assert.match(adapterSource, /linearInequalityEngine/);
  assert.match(adapterSource, /classifyCanonicalFeasibleRegion/);
  assert.match(adapterSource, /boundaryIntersections/);
  assert.doesNotMatch(adapterSource, /TEMPORARY ADAPTER/);
});