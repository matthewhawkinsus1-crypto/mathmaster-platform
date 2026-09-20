import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const source = componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx');
const executable = executableSource(source);
const adapterSource = componentSource('src/tools/systemsWorkspace/inequalityBuilderAdapter.js');
const schemaSource = componentSource('src/tools/toolSchemas.js');
const persistenceSource = componentSource('src/tools/toolStatePersistence.js');

test('student-build inequality mode is opt-in and does not disturb the existing construct/analyze paths', () => {
  const inequalityMode = region(executable, 'function InequalityMode(', 'function LinearQuadraticMode(', 'InequalityMode');
  assert.match(
    inequalityMode,
    /studentBuildEnabled[\s\S]*?Object\.values\(inequalityConfig\.reasoning\)[\s\S]*?<StudentBuildInequalityMode/,
    'InequalityMode must route to the new mode only when a question explicitly opts in, before any of the existing hooks run.',
  );
  // The pre-existing "type four numbers, pick two selects" construction path
  // (the old `interaction: 'construct'` questions) must still be reachable and
  // intact for any question that does not set `studentBuild`.
  assert.match(inequalityMode, /requiresConstruction/, 'the legacy construction path must still exist for backward compatibility.');
  assert.match(inequalityMode, /Check inequality graph/, 'the legacy construct-mode submit button must be unchanged.');
});

test('every boundary type the task requires has its own construction method', () => {
  const methods = region(executable, 'const CONSTRUCTION_METHODS', 'const emptyBuildEntry', 'CONSTRUCTION_METHODS');
  assert.match(methods, /Two points/);
  assert.match(methods, /Slope/);
  assert.match(methods, /Vertical line/);
  assert.match(methods, /Horizontal line/);
});

test('the graph is click/tap driven through the shared touch-hardened CoordinatePlane', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /<CoordinatePlane[\s\S]*?onPlot=\{handlePlot\}/, 'boundary points, shading, vertices and test points must all route through the one interactive plane.');
});

test('solid/dashed and shading feedback stays neutral on the first miss, per the platform feedback philosophy', () => {
  assert.match(executable, /Check whether the points you used satisfy the boundary equation\./);
  assert.match(executable, /Check whether points on the boundary are included\./);
  assert.match(executable, /Use a test point or compare the inequality to its boundary\./);
});

test('the combined region is locked until every constraint is individually correct, and never renders early', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /disabled=\{!allConstraintsComplete\}/, 'Find overlap / Combine regions must be disabled until every constraint checks out.');
  assert.match(mode, /combined\s*&&\s*studentPolygon\.length\s*>=\s*3/, 'the combined polygon must only render after the student explicitly combines, never before.');
  assert.match(mode, /allConstraintsComplete\s*=\s*constraintCount\s*>\s*0\s*&&/);
});

test('the test-point tool reasons per inequality, overall, and about boundary inclusion specifically', () => {
  assert.match(executable, /Does the point satisfy inequality/);
  assert.match(executable, /Is the point a solution to the entire system\?/);
  assert.match(executable, /Does this point lie exactly on one of the boundary lines\?/);
  assert.match(executable, /is it included in the solution region\?/);
});

test('region classification supports bounded, unbounded, AND no solution as a legitimate completion path', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /<option value="bounded">/);
  assert.match(mode, /<option value="unbounded">/);
  assert.match(mode, /<option value="empty">No solution<\/option>/);
});

test('vertex mode distinguishes a geometric intersection from an included solution point', () => {
  assert.match(executable, /vertexIncludedExpected/);
  assert.match(executable, /Is this vertex included in the solution set\?/);
  assert.match(executable, /excluded even though the lines still cross/);
});

test('the final check reports concept-level diagnostics, not just an overall right/wrong', () => {
  const finalCheck = region(executable, 'const finalCheck = ()', 'const graphPoints', 'finalCheck');
  ['perConstraint', 'overlapClassificationCorrect', 'noSolutionCorrectlyRecognized', 'testPointMembershipCorrect',
    'boundaryPointInclusionCorrect', 'vertexResults', 'fullSystemCorrect'].forEach((key) => {
    assert.match(finalCheck, new RegExp(key), `expected the evidence payload to name ${key} as its own diagnostic.`);
  });
  assert.match(finalCheck, /submit\(/);
});

test('hint usage in the new mode is still reported the same way as every other tool', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /onHintUsed=\{\(\) => onAction\?\.\('HINT_USED'\)\}/);
});

test('constraint modeling reuses the same graphing/checking machinery instead of a second engine', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /Send constraints to Systems Workspace/);
  assert.match(mode, /modelingEntryCorrect/);
  // The modeling ground truth feeds the SAME boundary/style/shade grading and
  // the SAME feasibleRegionPolygon/classifyFeasibleRegion calls the
  // non-modeling path uses — proven by there being exactly one definition of
  // `expectedConstraints` that both branches read from.
  assert.equal((mode.match(/const expectedConstraints = useMemo/g) || []).length, 1);
});

test('all new answer-bearing state is draft-backed, and the registry names every new transient UI field', () => {
  ['modelingEntries', 'modelingSent', 'build', 'combined', 'regionClassification', 'teacherPointResponse',
    'studentTestPoint', 'studentPointResponse', 'vertices'].forEach((key) => {
    assert.match(executable, new RegExp(`usePersistentToolState\\('${key}'`), `${key} must be usePersistentToolState-backed so Work View close/reopen and question navigation cannot erase it.`);
  });
  const registryEntry = region(persistenceSource, 'systemsWorkspace: entry(', ')),', 'systemsWorkspace persistence entry');
  ['activeIndex', 'armed', 'teacherPointFeedback', 'studentPointFeedback', 'vertexFeedback'].forEach((key) => {
    assert.match(registryEntry, new RegExp(key), `${key} is a new raw useState in SystemsWorkspace.jsx and must be named in the persistence contract.`);
  });
});

test('the student-build workspace is wired into Work View with undo, point editing, and a primary check action', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /<EnlargeableFigure[\s\S]*?capabilities=\{\{/);
  assert.match(mode, /undo:\s*undoHistory\.capability/);
  assert.match(mode, /pointEditing:\s*\{/);
  assert.match(mode, /primaryActions:\s*\[\{\s*id:\s*'check-student-build'/);
});

test('authored questions can express vertical and horizontal boundaries, which the old {m, b} shape could not', () => {
  assert.match(adapterSource, /orientation === 'vertical'/);
  assert.match(adapterSource, /orientation === 'horizontal'/);
  assert.match(schemaSource, /orientation/);
  assert.match(schemaSource, /systemsWorkspace studentBuild requires at least one inequality/);
});

test('canonical studentBuild and reasoning flags are honored independently instead of forcing every construction step on', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /const buildConfig = inequalityConfig\.studentBuild/);
  assert.match(mode, /buildConfig\.boundary \? \(/);
  assert.match(mode, /buildConfig\.lineStyle \? \(/);
  assert.match(mode, /buildConfig\.shading \? \(/);
  assert.match(mode, /reasoningConfig\.testPoint/);
  assert.match(mode, /boundaryProbeEnabled/);
});

test('contextual modeling graphs and reasons from the student-authored canonical constraints while still grading them against the authored model', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(executable, /const modelingEntryToCanonical/);
  assert.match(mode, /const workingConstraints = useMemo/);
  assert.match(mode, /modeledConstraints\.every\(Boolean\)/);
  assert.match(mode, /modelingEntries\.map\(\(entry, index\) => modelingEntryCorrect\(entry, expectedConstraints\[index\]\)\)/);
  assert.match(mode, /classifyFeasibleRegion\(workingConstraints\)/);
});

test('disabled reasoning/build capabilities do not create hidden required answers or false mastery evidence', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /!boundaryProbeEnabled \|\| boundaryIndex < 0/);
  assert.match(mode, /boundaryCorrect: buildConfig\.boundary \? boundaryCorrect\(index\) : null/);
  assert.match(mode, /styleCorrect: buildConfig\.lineStyle \? styleCorrect\(index\) : null/);
  assert.match(mode, /shadeCorrect: buildConfig\.shading \? shadeCorrect\(index\) : null/);
});

test('context modeling accepts mathematically equivalent scaled inequalities and lets students return to revise their model', () => {
  assert.match(executable, /const equivalentLinearInequality/);
  assert.match(executable, /flipInequalityRelation/);
  assert.match(executable, /const modelingEntriesReady/);
  assert.match(executable, /Edit constraints/);
  assert.match(executable, /reopenModeling/);
});

test('the boundary adapter delegates math to the canonical PR #293 engine instead of maintaining a duplicate engine', () => {
  assert.match(adapterSource, /linearInequalityEngine/);
  assert.match(adapterSource, /classifyCanonicalFeasibleRegion/);
  assert.match(adapterSource, /boundaryIntersections/);
  assert.doesNotMatch(adapterSource, /TEMPORARY ADAPTER/);
});
