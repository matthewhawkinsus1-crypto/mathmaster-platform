// HELP-19 (QA pass 3, 03-help-and-self-correction.md): Recovery practice
// showed "3 of 3 tries left" and closed the item on the first graded answer.
// Every practice question is now shown ONE answer, and says so. A step item
// too: no step spends a try (decision D1), so its only try is that answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERY_PRACTICE_ANSWERS,
  RECOVERY_PRACTICE_ONE_ANSWER,
} from '../../src/platform/recovery/recoveryPracticeAttempts.js';
import { recordQuestionStep, resolveQuestionMaximumAttempts } from '../../src/attemptPolicy.js';
import { ACTIVITY_POLICIES } from '../../src/platform/policies/activityPolicies.js';
import { STEP_ACTIONS, stepActionCountsAttempt } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import { componentSource, region } from './helpers/sourceContract.mjs';

const PRACTICE = { ...ACTIVITY_POLICIES.practice, allowReplacement: false };

test('a Recovery practice question has one answer, whatever the Practice policy allows', () => {
  assert.equal(RECOVERY_PRACTICE_ANSWERS, 1);
  for (const question of [
    { type: 'multiAnswer', answerFields: [{ id: 'slope', answer: '2' }] },
    { type: 'stepAlgebra2', equation: '2x+3=7' },
  ]) {
    assert.ok(resolveQuestionMaximumAttempts({ question, activityPolicy: PRACTICE }) > 1, `the premise: Practice itself allows ${question.type} more than one try`);
  }
  assert.equal(RECOVERY_PRACTICE_ONE_ANSWER, 'One answer per practice question.');
});

test('a step item has one answer too: no step spends a try, so the answer is its only one', () => {
  for (const action of Object.values(STEP_ACTIONS)) {
    assert.equal(stepActionCountsAttempt(action), false, action);
  }
  // Rejected moves and rewrites, recorded the way the runner records them
  // with the Practice policy's count: the item never runs out on its own.
  const maximumAttempts = resolveQuestionMaximumAttempts({ question: { type: 'stepAlgebra2' }, activityPolicy: PRACTICE });
  let record = null;
  for (const action of [STEP_ACTIONS.REJECTED_MOVE, STEP_ACTIONS.REJECTED_MOVE, STEP_ACTIONS.REWRITE, STEP_ACTIONS.REJECTED_MOVE, STEP_ACTIONS.BALANCED_MOVE]) {
    ({ record } = recordQuestionStep({
      record,
      stepGrade: { kind: 'algebra-step', accepted: action !== STEP_ACTIONS.REJECTED_MOVE, earned: 0, possible: 1 },
      countsAttempt: stepActionCountsAttempt(action),
      maximumAttempts,
    }));
  }
  assert.equal(record.attemptCount, 0);
  assert.notEqual(record.status, 'expired');
});

test('the practice runner hands the engine the one answer, keeps the policy for steps, and says it', () => {
  const runner = componentSource('src/components/student/SectionRecoveryRunner.jsx');
  assert.match(runner, /^import \{ RECOVERY_PRACTICE_ANSWERS, RECOVERY_PRACTICE_ONE_ANSWER \} from '\.\.\/\.\.\/platform\/recovery\/recoveryPracticeAttempts\.js';$/m);
  const practice = region(runner, 'function PracticeRunner(', 'function AssessmentRunner(', 'practice runner');
  assert.match(practice, /\n\s*const maximumAttempts = RECOVERY_PRACTICE_ANSWERS;/);
  // The engine and the closed record both read that count.
  const engine = region(practice, '<PinnedQuestion', '/>', 'practice question');
  assert.match(engine, /maximumAttempts=\{maximumAttempts\}/);
  assert.match(practice, /status: outcome\.isCorrect \? 'correct' : 'expired', attemptCount: maximumAttempts \}/);
  assert.match(practice, /<RecoveryHeader label=\{`\$\{entry\.label\} practice`\} subtitle=\{`[^`]*\$\{RECOVERY_PRACTICE_ONE_ANSWER\}[^`]*`\}/);
});
