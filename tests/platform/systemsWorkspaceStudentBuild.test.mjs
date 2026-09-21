import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { parseNumericAnswer } from '../../src/tools/shared/toolMath.js';

const source = componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx');
const executable = executableSource(source);
const adapterSource = componentSource('src/tools/systemsWorkspace/inequalityBuilderAdapter.js');
const schemaSource = componentSource('src/tools/toolSchemas.js');
const persistenceSource = componentSource('src/tools/toolStatePersistence.js');
const rewriteSource = executableSource(componentSource('src/tools/systemsWorkspace/EmbeddedInequalityRewrite.jsx'));

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
  assert.match(mode, /<CoordinatePlane[\s\S]*?onPlot=\{handlePlot\}/, 'the shared graph stays interactive after any individual constraint unlocks.');
  const plot = region(mode, 'const handlePlot = (point)', 'const boundaryMessage', 'handlePlot');
  assert.match(plot, /armed\.type === 'boundaryPoint'.*rewriteVerified\(armed\.index\)/s, 'only the armed constraint’s own rewrite may gate its graph action.');
});

test('solid/dashed and shading feedback stays neutral on the first miss, per the platform feedback philosophy', () => {
  assert.match(executable, /Check whether the points you used satisfy the boundary equation\./);
  assert.match(executable, /Check whether points on the boundary are included\./);
  assert.match(executable, /Use a test point or compare the inequality to its boundary\./);
});

test('progress checkmarks and Combine remain locked until the student explicitly checks each enabled construction step', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /const boundaryVerified = .*boundaryAttempts > 0/);
  assert.match(mode, /const styleVerified = .*styleAttempts > 0/);
  assert.match(mode, /const shadeVerified = .*shadeAttempts > 0/);
  assert.match(mode, /const rewriteVerified = .*verifiedConstraint/);
  assert.match(mode, /every\(constraintVerified\)/);
  assert.match(mode, /Boundary \{buildConfig\.boundary \? \(boundaryVerified/);
});

test('the combined region is locked until every constraint is individually correct, and never renders early', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /disabled=\{!allConstraintsComplete\}/, 'Find overlap / Combine regions must be disabled until every constraint checks out.');
  assert.match(mode, /combined\s*&&\s*studentPolygon\.length\s*>=\s*3/, 'the combined polygon must only render after the student explicitly combines, never before.');
  assert.match(mode, /allConstraintsComplete\s*=\s*constraintCount\s*>\s*0\s*&&/);
});

test('blank yes/no answers cannot earn accidental credit and requested vertex work requires full vertex coverage', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(executable, /const explicitBooleanAnswerMatches/);
  assert.match(mode, /explicitBooleanAnswerMatches\(response\.overall/);
  assert.match(mode, /explicitBooleanAnswerMatches\(vertex\.includedAnswer/);
  assert.match(mode, /const allExpectedVerticesFound/);
  assert.match(mode, /vertices\.length === workingVertices\.length/);
  assert.match(mode, /vertexCoverageCorrect/);
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
  ['modelingEntries', 'modelingSent', 'rewriteEntries', 'activeIndex', 'build', 'combined', 'regionClassification', 'teacherPointResponse',
    'studentTestPoint', 'studentPointResponse', 'vertices'].forEach((key) => {
    assert.match(executable, new RegExp(`usePersistentToolState\\('${key}'`), `${key} must be usePersistentToolState-backed so Work View close/reopen and question navigation cannot erase it.`);
  });
  const registryEntry = region(persistenceSource, 'systemsWorkspace: entry(', ')),', 'systemsWorkspace persistence entry');
  ['armed', 'teacherPointFeedback', 'studentPointFeedback', 'vertexFeedback'].forEach((key) => {
    assert.match(registryEntry, new RegExp(key), `${key} is a new raw useState in SystemsWorkspace.jsx and must be named in the persistence contract.`);
  });
});

test('slope-intercept construction requires two student points and never manufactures the slope movement', () => {
  const builder = region(executable, 'const studentBoundaryLineFromEntry', 'const boundaryLinesMatch', 'studentBoundaryLineFromEntry');
  assert.match(builder, /\[m, b, x1, y1, x2, y2\]\.some/);
  assert.match(builder, /boundaryFromTwoPoints\(\[x1, y1\], \[x2, y2\]\)/);
  assert.match(builder, /Math\.abs\(x1\).*Math\.abs\(y1 - b\)/s);
  assert.doesNotMatch(builder, /\[0,\s*b\].*\[1,\s*m\s*\+\s*b\]/s);
  assert.match(builder, /!entry\.point1Plotted \|\| !entry\.point2Plotted/);
  const fields = region(executable, 'function ConstructionMethodFields', 'function TestPointReasoning', 'ConstructionMethodFields');
  assert.match(fields, /<output/);
  assert.doesNotMatch(fields, /onChange\(('[xy][12]')/);
  const slopeField = fields.match(/<Field label="Slope \(m\)">([\s\S]*?)<\/Field>/)?.[1] || '';
  assert.match(slopeField, /type="text"/);
  assert.match(slopeField, /placeholder="e\.g\. -2\/3"/);
  assert.equal(parseNumericAnswer('-2/3'), -2 / 3, 'the slope field accepts the canonical numeric parser\'s rise/run form');
});

test('constraint cards are accessible accordions that allow none open without discarding progress', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /aria-expanded=\{activeIndex === index\}/);
  assert.match(mode, /current === index \? null : index/);
  assert.match(mode, /Boundary \{buildConfig\.boundary/);
  assert.match(mode, /<strong>Combined solution<\/strong>/);
});

test('rewrite is embedded, persistent, and gates graph construction while canonical answers stay separate', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /const sourceConstraints = questionData\.sourceConstraints/);
  assert.match(mode, /const rawExpectedConstraints = questionData\.expectedConstraints/);
  assert.match(mode, /rewriteVerified/);
  assert.match(mode, /Graph construction unlocks after your rewrite is verified/);
  assert.match(mode, /<EmbeddedInequalityRewrite/);
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
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
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

test('rewrite-only work requires verified rewrite evidence and shows it in collapsed progress', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /constraintVerified = \(index\) => rewriteVerified\(index\)/);
  assert.match(mode, /rewriteVerified: buildConfig\.rewrite \? rewriteVerified\(index\) : null/);
  assert.match(mode, /Rewrite \{buildConfig\.rewrite \? \(rewriteVerified\(index\) \? '✓' : '…'\) : 'provided'\}/);
});

test('the student-build workspace is wired into Work View with undo, point editing, and a primary check action', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /<EnlargeableFigure[\s\S]*?capabilities=\{\{/);
  assert.match(mode, /undo:\s*undoHistory\.capability/);
  assert.match(mode, /pointEditing:\s*\{/);
  assert.match(mode, /primaryActions:\s*\[\{\s*id:\s*'check-student-build'/);
});

test('student-facing inequality labels support legacy slope-intercept, vertical/horizontal, and canonical standard form', () => {
  assert.match(executable, /const displayRelation/);
  assert.match(executable, /ineq\.orientation === 'vertical'/);
  assert.match(executable, /ineq\.orientation === 'horizontal'/);
  assert.match(executable, /\[ineq\.A, ineq\.B, ineq\.C\]/);
  assert.match(executable, /formatLinearTerm/);
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
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(mode, /const buildConfig = inequalityConfig\.studentBuild/);
  assert.match(mode, /buildConfig\.boundary \? \(/);
  assert.match(mode, /buildConfig\.lineStyle \? \(/);
  assert.match(mode, /buildConfig\.shading \? \(/);
  assert.match(mode, /reasoningConfig\.testPoint/);
  assert.match(mode, /boundaryProbeEnabled/);
});

test('contextual modeling graphs and reasons from the student-authored canonical constraints while grading the model as an unordered set', () => {
  const mode = region(executable, 'function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'StudentBuildInequalityMode');
  assert.match(executable, /const modelingEntryToCanonical/);
  assert.match(mode, /const workingConstraints = useMemo/);
  assert.match(mode, /modeledConstraints\.every\(Boolean\)/);
  assert.match(mode, /const unmatchedExpected = new Set\(expectedConstraints\.map/);
  assert.match(mode, /unmatchedExpected\.has\(index\) && modelingEntryCorrect\(entry, expected\)/);
  assert.match(mode, /unmatchedExpected\.delete\(matchedIndex\)/,
    'one expected constraint may only satisfy one student row, so duplicates cannot earn double credit');
  assert.doesNotMatch(mode, /modelingEntryCorrect\(entry, expectedConstraints\[index\]\)/,
    'a correct system of constraints must not be marked wrong merely because the student entered them in a different order');
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