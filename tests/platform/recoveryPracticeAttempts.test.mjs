// HELP-19 (QA pass 3, 03-help-and-self-correction.md): Recovery practice
// showed "3 of 3 tries left" and closed the item on the first graded answer.
// Every practice question is now shown ONE answer, and says so. A step item
// too: no step spends a try (decision D1), so its only try is that answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERY_PRACTICE_ANSWERS,
  RECOVERY_PRACTICE_ONE_ANSWER,
  recoveryAttemptLimit,
} from '../../src/platform/recovery/recoveryPracticeAttempts.js';
import { isChoiceOnlyQuestion, recordQuestionStep, resolveQuestionMaximumAttempts } from '../../src/attemptPolicy.js';
import { ACTIVITY_POLICIES } from '../../src/platform/policies/activityPolicies.js';
import { STEP_ACTIONS, stepActionCountsAttempt } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import { resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

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
  const attemptsImport = runner.match(/^import \{([^}]*)\} from '\.\.\/\.\.\/platform\/recovery\/recoveryPracticeAttempts\.js';$/m);
  assert.ok(attemptsImport, 'the runner reads its counts from recoveryPracticeAttempts.js');
  for (const name of ['RECOVERY_PRACTICE_ANSWERS', 'RECOVERY_PRACTICE_ONE_ANSWER']) assert.match(attemptsImport[1], new RegExp(`\\b${name}\\b`), name);
  const practice = region(runner, 'function PracticeRunner(', 'function AssessmentRunner(', 'practice runner');
  assert.match(practice, /\n\s*const maximumAttempts = RECOVERY_PRACTICE_ANSWERS;/);
  // The engine and the closed record both read that count.
  const engine = region(practice, '<PinnedQuestion', '/>', 'practice question');
  assert.match(engine, /maximumAttempts=\{maximumAttempts\}/);
  assert.match(practice, /status: outcome\.isCorrect \? 'correct' : 'expired', attemptCount: maximumAttempts \}/);
  assert.match(practice, /<RecoveryHeader label=\{`\$\{entry\.label\} practice`\} subtitle=\{`[^`]*\$\{RECOVERY_PRACTICE_ONE_ANSWER\}[^`]*`\}/);
});

/*
 * P-7: A RECOVERY ITEM'S TRIES ARE COUNTED ON THE QUESTION ITS PIN DEALT.
 *
 * Every Recovery question is an instance of a Question Family slot, and the
 * stored slot has no answer fields, so counted there a four-choice instance had
 * a constructed answer's three tries. The runner now counts on what
 * QuestionEngine reports it dealt, as the assignment counts a family slot.
 * Nothing a student sees changes: no step spends a try (D1), and an exit
 * ticket's one try is one on any question. These hold that.
 */
const WARM_UP_2 = { questionId: 'm3l3-wu-2', prompt: 'Words to symbols.', questionFamily: { id: 'inequalities.translatePhrase' } };

test('P-7: a Recovery item is counted on the question its pin dealt, the stored slot only until it renders', () => {
  const dealt = resolveFamilyPreviewInstance(WARM_UP_2).question;
  assert.equal(isChoiceOnlyQuestion(dealt), true, 'dealt as four choices');
  assert.equal(isChoiceOnlyQuestion(WARM_UP_2), false, 'stored with no answer fields');
  // Counted on the stored slot, the four choices had Practice's three tries.
  assert.equal(resolveQuestionMaximumAttempts({ question: WARM_UP_2, activityPolicy: PRACTICE }), 3);
  assert.equal(recoveryAttemptLimit({ dealt, stored: WARM_UP_2, activityPolicy: PRACTICE }), 1);
  // Before it renders, nothing can be graded: the stored slot stands in.
  assert.equal(recoveryAttemptLimit({ dealt: null, stored: WARM_UP_2, activityPolicy: PRACTICE }), 3);
  // An exit ticket's one try is one either way.
  const exitTicket = { ...ACTIVITY_POLICIES.dol, allowReplacement: false };
  assert.equal(recoveryAttemptLimit({ dealt, stored: WARM_UP_2, activityPolicy: exitTicket }), 1);
  assert.equal(recoveryAttemptLimit({ dealt: null, stored: WARM_UP_2, activityPolicy: exitTicket }), 1);
  // A step tool keeps its section's tries; no item at all reads as the policy's.
  assert.equal(recoveryAttemptLimit({ dealt: { type: 'stepAlgebra2', equation: '2x+3=7' }, stored: WARM_UP_2, activityPolicy: PRACTICE }), 3);
  assert.equal(recoveryAttemptLimit({ activityPolicy: PRACTICE }), 3);
});

test('P-7: no step ends differently for it: no step spends a try under either count', () => {
  for (const maximumAttempts of [1, 3]) {
    let record = null;
    for (const action of Object.values(STEP_ACTIONS)) {
      ({ record } = recordQuestionStep({
        record,
        stepGrade: { kind: 'algebra-step', accepted: action !== STEP_ACTIONS.REJECTED_MOVE, earned: 0, possible: 1 },
        countsAttempt: stepActionCountsAttempt(action),
        maximumAttempts,
      }));
    }
    assert.equal(record.attemptCount, 0, `${maximumAttempts} tries`);
    assert.notEqual(record.status, 'expired');
  }
});

test('P-7: both Recovery runners count on what the engine reported dealing for the item', () => {
  const runner = componentSource('src/components/student/SectionRecoveryRunner.jsx');
  const code = executableSource(runner);
  // What QuestionEngine reports, kept by pin: for Submit (the ref) and for the count (the state).
  const hook = region(code, 'const useDealtQuestions = () => {', '\n};', 'useDealtQuestions');
  assert.match(hook, /renderedRef\.current\[delivery\.fingerprint\] = rendered;/);
  assert.match(hook, /setDealt\(\(current\) => \(current\[delivery\.fingerprint\] === rendered \? current : \{ \.\.\.current, \[delivery\.fingerprint\]: rendered \}\)\);/);
  assert.match(region(code, 'function PinnedQuestion(', '\n}\n', 'PinnedQuestion'), /onFamilyDelivery=\{\(delivery, rendered\) => onRendered\(delivery, rendered\)\}/);
  const practice = region(code, 'function PracticeRunner(', 'function AssessmentRunner(', 'practice runner');
  assert.match(practice, /const \{ renderedRef, dealt: dealtByPin, noteDealt \} = useDealtQuestions\(\);/);
  assert.match(practice, /const stepMaximumAttempts = recoveryAttemptLimit\(\{ dealt: dealtByPin\[fingerprint\], stored: question, activityPolicy: PRACTICE_POLICY \}\);/);
  assert.match(region(practice, '<PinnedQuestion', '/>', 'practice question'), /onRendered=\{noteDealt\}/);
  const assessment = region(code, 'function AssessmentRunner(', 'export default function SectionRecoveryRunner', 'assessment runner');
  assert.match(assessment, /const \{ renderedRef, dealt: dealtByPin, noteDealt \} = useDealtQuestions\(\);/);
  assert.match(assessment, /const maximumAttempts = recoveryAttemptLimit\(\{ dealt: dealtByPin\[current\?\.pin\?\.fingerprint\], stored: currentQuestion, activityPolicy: policy \}\);/);
  assert.match(region(assessment, '<PinnedQuestion', '/>', 'assessment question'), /onRendered=\{\(delivery, rendered\) => \{\s*noteDealt\(delivery, rendered\);\s*markShown\(current\.itemId\);/);
  // Nothing in the runner counts on a stored slot alone any more.
  assert.doesNotMatch(code, /resolveQuestionMaximumAttempts\(/);
});
