import test from 'node:test';
import assert from 'node:assert/strict';

import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';

const fieldQuestion = ({ id, expected, equivalence }) => ({
  id,
  active: true,
  alignmentKeys: ['texas:A.2A'],
  courseId: 'algebra1',
  familyId: 'mathmaster:A.2A:sim-parity:' + id,
  familyVersion: 1,
  questionType: 'response',
  activityRole: 'practice',
  calculatorPolicy: 'inherit',
  assessedConstruct: 'A.2A',
  representation: 'symbolic',
  difficultyBand: 3,
  dok: 2,
  taskType: 'procedural',
  prompt: 'Simulator grading parity check',
  responseFields: [{
    id: 'answer',
    label: 'Answer',
    inputProfile: 'expression',
    equivalence,
    expected,
  }],
});

const runOne = async (question, answer) => {
  const runtime = createTeacherPathRuntime({
    pathBankQuestions: [question],
    courseId: 'algebra1',
    requiredQuestions: 1,
  });
  const started = await runtime.startOrResumePathSession({
    targetAlignmentKey: 'texas:A.2A',
    requiredQuestions: 1,
  });
  const issued = await runtime.fetchNextSanitizedQuestion({
    sessionId: started.session.sessionId,
  });
  assert.equal(JSON.stringify(issued.questionInstance).includes('expected'), false);
  return runtime.submitStudentResponse({
    sessionId: started.session.sessionId,
    questionInstanceId: issued.questionInstance.questionInstanceId,
    submissionId: 'submission-1',
    responsePayload: { responses: { answer } },
  });
};

test('Teacher Simulator accepts semantic set-builder equivalence like production', async () => {
  const result = await runOne(
    fieldQuestion({
      id: 'set-builder',
      expected: '{x|x!=3}',
      equivalence: 'setBuilder',
    }),
    '{x ∈ R : x ≠ 3}',
  );
  assert.equal(result.grading.isCorrect, true);
  assert.equal(result.grading.questionFinalized, true);
});

test('Teacher Simulator accepts reduced rational-expression equivalence like production', async () => {
  const result = await runOne(
    fieldQuestion({
      id: 'rational-expression',
      expected: '(x+1)/(x+2)',
      equivalence: 'rationalExpression',
    }),
    '(2*x+2)/(2*x+4)',
  );
  assert.equal(result.grading.isCorrect, true);
  assert.equal(result.grading.questionFinalized, true);
});

test('Teacher Simulator keeps primary expected answer when accepted alternatives exist', async () => {
  const question = fieldQuestion({
    id: 'accepted-supplements',
    expected: 'x+1',
    equivalence: null,
  });
  question.responseFields[0].accepted = ['1+x'];
  const result = await runOne(question, 'x+1');
  assert.equal(result.grading.isCorrect, true);
});
