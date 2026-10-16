// HELP-19 (QA pass 3, 03-help-and-self-correction.md): Recovery practice
// showed "3 of 3 tries left" and closed the item on the first graded answer.
// A question with no step work is now shown ONE answer, and says so; step
// work keeps the Practice policy's tries for rejected moves.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERY_PRACTICE_ONE_ANSWER,
  recoveryPracticeMaximumAttempts,
  recoveryPracticeOpensStepWorkspace,
} from '../../src/platform/recovery/recoveryPracticeAttempts.js';
import { resolveQuestionMaximumAttempts } from '../../src/attemptPolicy.js';
import { ACTIVITY_POLICIES } from '../../src/platform/policies/activityPolicies.js';
import { componentSource, region } from './helpers/sourceContract.mjs';

const PRACTICE = { ...ACTIVITY_POLICIES.practice, allowReplacement: false };
const policyFor = (question) => resolveQuestionMaximumAttempts({ question, activityPolicy: PRACTICE });

test('a Recovery practice question with no step work has one answer, whatever the Practice policy allows', () => {
  const question = { type: 'multiAnswer', answerFields: [{ id: 'slope', answer: '2' }] };
  assert.ok(policyFor(question) > 1, 'the premise: Practice itself allows more than one try here');
  assert.equal(recoveryPracticeMaximumAttempts({ question, policyMaximum: policyFor(question) }), 1);
  assert.equal(recoveryPracticeMaximumAttempts({ question: { type: 'functionGraph' }, policyMaximum: 3 }), 1);
  assert.equal(recoveryPracticeMaximumAttempts({ question: { type: 'literal' }, policyMaximum: 3 }), 1, 'a typed literal answer is one answer');
});

test('step work keeps the policy tries: the step workspace types, a workspace literal, and any item that recorded a step', () => {
  ['stepAlgebra', 'stepAlgebra2', 'algebra'].forEach((type) => {
    assert.equal(recoveryPracticeOpensStepWorkspace({ type }), true, type);
    assert.equal(recoveryPracticeMaximumAttempts({ question: { type }, policyMaximum: 3 }), 3, type);
  });
  assert.equal(recoveryPracticeMaximumAttempts({ question: { type: 'literal', workspace: true }, policyMaximum: 3 }), 3);
  // A registry tool's algebra mode shows its steps only once used.
  assert.equal(recoveryPracticeMaximumAttempts({ question: { type: 'systemsWorkspace' }, policyMaximum: 3, stepRecord: { attemptCount: 1 } }), 3);
  assert.equal(recoveryPracticeMaximumAttempts({ question: { type: 'systemsWorkspace' }, policyMaximum: 3, stepRecord: null }), 1);
});

test('the practice runner hands the engine the one-answer count, keeps the policy for steps, and says it', () => {
  const runner = componentSource('src/components/student/SectionRecoveryRunner.jsx');
  assert.match(runner, /^import \{ RECOVERY_PRACTICE_ONE_ANSWER, recoveryPracticeMaximumAttempts \} from '\.\.\/\.\.\/platform\/recovery\/recoveryPracticeAttempts\.js';$/m);
  const practice = region(runner, 'function PracticeRunner(', 'function AssessmentRunner(', 'practice runner');
  assert.match(practice, /\n\s*const maximumAttempts = recoveryPracticeMaximumAttempts\(\{ question, policyMaximum: stepMaximumAttempts, stepRecord \}\);/);
  // The engine and the closed record both read that count.
  const engine = region(practice, '<PinnedQuestion', '/>', 'practice question');
  assert.match(engine, /maximumAttempts=\{maximumAttempts\}/);
  assert.match(practice, /<RecoveryHeader label=\{`\$\{entry\.label\} practice`\} subtitle=\{`[^`]*\$\{RECOVERY_PRACTICE_ONE_ANSWER\}[^`]*`\}/);
  assert.equal(RECOVERY_PRACTICE_ONE_ANSWER, 'One answer per practice question.');
});
