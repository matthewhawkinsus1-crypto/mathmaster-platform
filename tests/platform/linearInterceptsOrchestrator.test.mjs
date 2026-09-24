import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildSubstitutionState,
  expectedInterceptPoint,
  resolveStandardCoefficients,
} from '../../src/tools/stepAlgebra2/linearInterceptsMath.js';
import { compareOrderedPair, parseOrderedPair } from '../../src/answerUtils.js';
import { ALGEBRA_WORKSPACE_ROUTES, resolveAlgebraWorkspaceRoute } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { region } from './helpers/sourceContract.mjs';

const orchestratorSource = fs.readFileSync(
  new URL('../../src/LinearInterceptsOrchestrator.jsx', import.meta.url),
  'utf8',
);
const questionEngineSource = fs.readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');

test('QuestionEngine routes type:"stepAlgebra" + mode:"linearIntercepts" to the orchestrator instead of the plain balance workspace', () => {
  // Behaviour: an intercept question opens the orchestrator, and an inequality
  // never reaches the orchestrator by accident — the relation check wins.
  // The decision lives in the React-free resolver QuestionEngine consults, so
  // it is asserted by calling it, not by reading a regex out of the switch.
  assert.equal(
    resolveAlgebraWorkspaceRoute({ type: 'stepAlgebra', mode: 'linearIntercepts', equation: '2x + 3y = 12' }).route,
    ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS,
  );
  assert.equal(
    resolveAlgebraWorkspaceRoute({ type: 'stepAlgebra', mode: 'linearIntercepts', equation: '2x + 3y > 12' }).route,
    ALGEBRA_WORKSPACE_ROUTES.RELATION,
  );
  assert.equal(
    resolveAlgebraWorkspaceRoute({ type: 'stepAlgebra', equation: '2x + 3 = 12' }).route,
    ALGEBRA_WORKSPACE_ROUTES.STEP_ALGEBRA,
  );

  // Wiring: the stepAlgebra case renders the orchestrator for that route, and
  // tests the relation route before it.
  const stepAlgebraCase = region(questionEngineSource, "case 'stepAlgebra':", "case 'algebra':", 'the stepAlgebra case');
  const linearBranch = region(stepAlgebraCase, 'ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS', '/>', 'the linear intercepts branch');
  assert.match(linearBranch, /<LinearInterceptsOrchestrator/);
  assert.ok(
    stepAlgebraCase.indexOf('ALGEBRA_WORKSPACE_ROUTES.RELATION') > -1
      && stepAlgebraCase.indexOf('ALGEBRA_WORKSPACE_ROUTES.RELATION') < stepAlgebraCase.indexOf('ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS'),
    'the relation route must be checked before the intercept route',
  );
  assert.match(
    questionEngineSource,
    /const algebraWorkspaceRoute = useMemo\(\s*\(\) => resolveAlgebraWorkspaceRoute\(processedQuestion\)/,
    'QuestionEngine must route the question it actually renders',
  );
});

test('the orchestrator mounts the mature StepByStepAlgebraCore for the actual solve, not a second solver', () => {
  assert.match(orchestratorSource, /import StepByStepAlgebraCore from '\.\/StepByStepAlgebraCore'/);
  assert.match(orchestratorSource, /<StepByStepAlgebraCore/);
  assert.doesNotMatch(orchestratorSource, /applyInterceptOperation/); // the retired numeric mini-solver
});

test('the orchestrator forwards grading, undo, record and attempt policy into the mature solver', () => {
  const committedRegion = orchestratorSource.slice(
    orchestratorSource.indexOf('<StepByStepAlgebraCore'),
    orchestratorSource.indexOf('/>', orchestratorSource.indexOf('<StepByStepAlgebraCore')),
  );
  assert.match(committedRegion, /onStepGrade=\{onStepGrade\}/);
  assert.match(committedRegion, /onUndoStateChange=\{onUndoStateChange\}/);
  assert.match(committedRegion, /questionRecord=\{solverQuestionRecord\}/);
  assert.match(committedRegion, /maximumAttempts=\{maximumAttempts\}/);
  assert.match(committedRegion, /attemptsDoNotExpire=\{attemptsDoNotExpire\}/);
});

test('QuestionEngine forwards the normal Step Algebra record and attempt policy into the intercept orchestrator', () => {
  const start = questionEngineSource.indexOf('<LinearInterceptsOrchestrator');
  const end = questionEngineSource.indexOf('/>', start);
  const region = questionEngineSource.slice(start, end);
  assert.match(region, /questionRecord=\{record\}/);
  assert.match(region, /maximumAttempts=\{resolvedMaximumAttempts\}/);
  assert.match(region, /attemptsDoNotExpire=\{attemptsDoNotExpire\}/);
});

test('QuestionEngine remounts the intercept orchestrator for each question draft identity', () => {
  const start = questionEngineSource.indexOf('<LinearInterceptsOrchestrator');
  const end = questionEngineSource.indexOf('/>', start);
  const region = questionEngineSource.slice(start, end);
  assert.match(
    region,
    /key=\{draftKey \|\| processedQuestion\?\.questionId \|\| processedQuestion\?\.id \|\| generationKey\}/,
  );
});

test('intercept conceptual and ordered-pair work is write-through persisted and restored by draft identity', () => {
  const start = orchestratorSource.indexOf('const workDraftKey =');
  const end = orchestratorSource.indexOf('const kind =', start);
  const region = orchestratorSource.slice(start, end);

  // Preserve the legacy/current key so already-saved student work is still
  // visible to both local restoration and the workspace-draft server sync.
  assert.match(region, /draftKey \? `\$\{draftKey\}:linear-intercepts` : null/);
  assert.match(region, /const workDraftKeyRef = useRef\(workDraftKey\)/);
  assert.match(region, /writeQuestionDraft\(workDraftKeyRef\.current, resolved\)/);
  assert.match(region, /setWorkState\(readQuestionDraft\(workDraftKey, null\) \|\| initialWork\(\)\)/);

  // The old passive save was the race: a navigation/key swap could happen
  // before the effect ran, or make the old in-memory work land under the new key.
  assert.doesNotMatch(region, /writeQuestionDraft\(workDraftKey, work\)/);
});

test('the embedded Step Algebra solver is keyed by the parent draft identity', () => {
  const start = orchestratorSource.indexOf('<StepByStepAlgebraCore');
  const end = orchestratorSource.indexOf('/>', start);
  const region = orchestratorSource.slice(start, end);
  assert.match(region, /key=\{`\$\{draftKey \|\| 'local'\}:\$\{kind\}-\$\{stage\.placedZeroVariable\}`\}/);
});

test('conceptual undo history is scoped to the active intercept so x history cannot leak into y', () => {
  assert.match(orchestratorSource, /current\.kind === kind \? current\.entries : \[\]/);
  assert.match(orchestratorSource, /stageHistory\.kind === kind \? stageHistory\.entries : \[\]/);
});

test('the embedded solver keeps parent attempt history but never seeds from the parent algebraState equation', () => {
  assert.match(orchestratorSource, /questionRecord \? \{ \.\.\.questionRecord, algebraState: null \} : null/);
  assert.match(orchestratorSource, /questionRecord=\{solverQuestionRecord\}/);
});

test('committing the substitution keeps a meaningful wrong-path outcome available (mismatch + conceptual redirect)', () => {
  assert.match(orchestratorSource, /conceptualRedirect/);
  assert.match(orchestratorSource, /mismatch/);
});

test('intercept coefficient resolution accepts the V5 equationText field used by imported/compiled questions', () => {
  assert.deepEqual(
    resolveStandardCoefficients({ equationText: '3x + 4y = 24' }),
    { A: 3, B: 4, C: 24 },
  );
  assert.deepEqual(
    resolveStandardCoefficients({ equationAscii: '2x + 3y = 12' }),
    { A: 2, B: 3, C: 12 },
  );
});

test('an invalid equation field falls through to a valid equationText instead of blocking the solver', () => {
  assert.deepEqual(
    resolveStandardCoefficients({ equation: 'not an equation', equationText: '4x + 3y = 24' }),
    { A: 4, B: 3, C: 24 },
  );
});

test('the intercept math itself: substitution state and expected point for a standard-form line', () => {
  const standard = resolveStandardCoefficients({ standard: { A: 3, B: 4, C: 24 } });
  assert.deepEqual(standard, { A: 3, B: 4, C: 24 });

  // x-intercept: set y = 0 (place zero on y) -> solve 3x = 24 -> x = 8
  const xSub = buildSubstitutionState(standard, 'y');
  assert.deepEqual(xSub, { zeroVariable: 'y', variable: 'x', coefficient: 3, constant: 0, right: 24 });
  assert.deepEqual(expectedInterceptPoint(standard, 'x'), [8, 0]);

  // y-intercept: set x = 0 (place zero on x) -> solve 4y = 24 -> y = 6
  const ySub = buildSubstitutionState(standard, 'x');
  assert.deepEqual(ySub, { zeroVariable: 'x', variable: 'y', coefficient: 4, constant: 0, right: 24 });
  assert.deepEqual(expectedInterceptPoint(standard, 'y'), [0, 6]);
});

test('both intercepts complete correctly as ordered pairs, graded semantically (matches the D fix)', () => {
  const expected = [8, 0];
  assert.equal(compareOrderedPair('(8, 0)', expected), true);
  assert.equal(compareOrderedPair('(8,0)', expected), true);
  assert.equal(compareOrderedPair('\\left(8,0\\right)', expected), true);
  assert.deepEqual(parseOrderedPair('(8, 0)'), [8, 0]);
});

// Mutation guard: prove the "not a second solver" assertion can fail.
test('mutation guard: a component that reimplemented applyInterceptOperation would fail the no-second-solver assertion', () => {
  const fakeSource = 'const next = applyInterceptOperation(state, op, value);';
  assert.match(fakeSource, /applyInterceptOperation/);
});
