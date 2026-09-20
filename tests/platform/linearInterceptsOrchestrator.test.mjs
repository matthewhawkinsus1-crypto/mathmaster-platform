import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildSubstitutionState,
  expectedInterceptPoint,
  resolveStandardCoefficients,
} from '../../src/tools/stepAlgebra2/linearInterceptsMath.js';
import { compareOrderedPair, parseOrderedPair } from '../../src/answerUtils.js';

const orchestratorSource = fs.readFileSync(
  new URL('../../src/LinearInterceptsOrchestrator.jsx', import.meta.url),
  'utf8',
);
const questionEngineSource = fs.readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');

test('QuestionEngine routes type:"stepAlgebra" + mode:"linearIntercepts" to the orchestrator instead of the plain balance workspace', () => {
  const stepAlgebraCase = questionEngineSource.slice(
    questionEngineSource.indexOf("case 'stepAlgebra':"),
    questionEngineSource.indexOf("case 'algebra':"),
  );
  assert.match(stepAlgebraCase, /processedQuestion\.mode === 'linearIntercepts'/);
  assert.match(stepAlgebraCase, /<LinearInterceptsOrchestrator/);
  // The relation check must still run first — an inequality never reaches
  // the intercept orchestrator by accident.
  assert.ok(
    stepAlgebraCase.indexOf('needsMultiRelationWorkspace') < stepAlgebraCase.indexOf('linearIntercepts'),
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
