import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTEMPT_DECISION,
  ATTEMPT_REJECTION,
  COMPLETION_RULE,
  MAX_QUESTIONS_PER_ROUND,
  MAX_TARGETS_PER_QUESTION,
  RECEIPT_KIND,
  isAttemptReceipt,
  normalizeQuestionSpec,
  normalizeRoundQuestionSpecs,
  planAttempt,
  questionAttempts,
  questionProgress,
  receiptKindOf,
  roundOutcome,
  roundPointsFromReceipts,
  summarizeRoundProgress,
} from '../../functions/shared/liveChallengeResponses.mjs';

/*
 * A round is not "one question, one answer". These tests hold the separation
 * the engine depends on: an attempt is a recorded interaction, completion is
 * derived from attempts by the question's rule, and score-only receipts are
 * never mistaken for attempts.
 */

let sequence = 0;
const attempt = (id, overrides = {}) => {
  sequence += 1;
  return [id, { serverConfirmed: true, roundIndex: 0, questionIndex: 0, sequence, isCorrect: false, elapsedMs: sequence * 1_000, ...overrides }];
};
const receipts = (...entries) => Object.fromEntries(entries);

const ZEROS = { completionRule: COMPLETION_RULE.ALL_TARGETS, targetCount: 3 };

test('a classic round is one question completed by its first graded response', () => {
  const log = receipts(attempt('a1', { isCorrect: false, scorePercent: 40 }));
  const progress = questionProgress({ receipts: log, roundIndex: 0 });
  assert.equal(progress.completed, true, 'one answer per round, right or wrong');
  assert.equal(progress.completedCorrectly, false);
  assert.equal(progress.scoreFraction, 0.4);
  // Which is exactly "you already answered this round".
  const next = planAttempt({ receipts: log, roundIndex: 0, attemptId: 'a2' });
  assert.equal(next.decision, ATTEMPT_DECISION.REJECT);
  assert.equal(next.reason, ATTEMPT_REJECTION.QUESTION_COMPLETED);
});

test('a retried attempt is a replay of its receipt, never a second attempt', () => {
  const log = receipts(attempt('same-id', { isCorrect: true }));
  const replay = planAttempt({ receipts: log, roundIndex: 0, attemptId: 'same-id' });
  assert.equal(replay.decision, ATTEMPT_DECISION.REPLAY);
  assert.equal(replay.receipt, log['same-id']);
});

test('find-all-the-zeros: four attempts, three targets, one completed question', () => {
  const log = receipts(
    attempt('c1', { isCorrect: true, targetId: 'x=-2' }),
    attempt('c2', { isCorrect: false, targetId: 'x=7' }),
    attempt('c3', { isCorrect: true, targetId: 'x=0' }),
  );
  const partial = questionProgress({ receipts: log, roundIndex: 0, spec: ZEROS });
  assert.equal(partial.completed, false);
  assert.equal(partial.attempts, 3);
  assert.equal(partial.incorrectAttempts, 1);
  assert.deepEqual(partial.targetsFound, ['x=-2', 'x=0']);
  assert.equal(partial.scoreFraction, 2 / 3);

  // Clicking a found zero again is neither credit nor a penalty.
  const duplicate = planAttempt({ receipts: log, roundIndex: 0, spec: ZEROS, attemptId: 'c4', targetId: 'x=0' });
  assert.equal(duplicate.reason, ATTEMPT_REJECTION.DUPLICATE_TARGET);
  assert.equal(planAttempt({ receipts: log, roundIndex: 0, spec: ZEROS, attemptId: 'c4' }).reason, ATTEMPT_REJECTION.TARGET_REQUIRED);
  assert.equal(planAttempt({ receipts: log, roundIndex: 0, spec: ZEROS, attemptId: 'c4', targetId: 'x=5' }).decision, ATTEMPT_DECISION.ACCEPT);

  const done = questionProgress({ receipts: { ...log, ...receipts(attempt('c4', { isCorrect: true, targetId: 'x=5', elapsedMs: 21_000 })) }, roundIndex: 0, spec: ZEROS });
  assert.equal(done.completed, true);
  assert.equal(done.completedCorrectly, true);
  assert.equal(done.attempts, 4);
  assert.equal(done.completedAtElapsedMs, 21_000);
  assert.equal(done.completingAttemptId, 'c4');
});

test('keep-answering-until-correct completes on the first correct response', () => {
  const spec = { completionRule: COMPLETION_RULE.CORRECT_RESPONSE };
  const log = receipts(
    attempt('k1', { isCorrect: false, scorePercent: 50 }),
    attempt('k2', { isCorrect: false, scorePercent: 20 }),
  );
  const trying = questionProgress({ receipts: log, roundIndex: 0, spec });
  assert.equal(trying.completed, false);
  assert.equal(trying.scoreFraction, 0.5, 'the best partial credit so far');
  assert.equal(planAttempt({ receipts: log, roundIndex: 0, spec, attemptId: 'k3' }).decision, ATTEMPT_DECISION.ACCEPT);
  const solved = questionProgress({ receipts: { ...log, ...receipts(attempt('k3', { isCorrect: true })) }, roundIndex: 0, spec });
  assert.equal(solved.completed, true);
  assert.equal(solved.scoreFraction, 1);
});

test('attempt order comes from the server sequence, not map key order', () => {
  // Firestore does not preserve map key order; a log read back may list the
  // later attempt first.
  const log = {
    later: { serverConfirmed: true, roundIndex: 0, sequence: 2, isCorrect: true },
    earlier: { serverConfirmed: true, roundIndex: 0, sequence: 1, isCorrect: false },
  };
  assert.deepEqual(questionAttempts({ receipts: log, roundIndex: 0 }).map((row) => row.attemptId), ['earlier', 'later']);
  assert.equal(questionProgress({ receipts: log, roundIndex: 0 }).completedCorrectly, false, 'the first response decided the classic round');
  // Without sequences, arrival time, then id.
  const legacy = {
    b: { serverConfirmed: true, roundIndex: 0, arrivedAtMs: 10 },
    a: { serverConfirmed: true, roundIndex: 0, arrivedAtMs: 10 },
    c: { serverConfirmed: true, roundIndex: 0, arrivedAtMs: 5 },
  };
  assert.deepEqual(questionAttempts({ receipts: legacy, roundIndex: 0 }).map((row) => row.attemptId), ['c', 'a', 'b']);
});

test('score-only milestone receipts carry points but are never attempts', () => {
  // The bug: milestone receipts were written before the final answer and were
  // read as that round's response, so Solver Race undercounted accuracy.
  const log = receipts(
    ['milestone:7:1', { serverConfirmed: true, receiptKind: RECEIPT_KIND.MILESTONE, roundIndex: 0, pointsAwarded: 40 }],
    ['milestone:7:2', { serverConfirmed: true, receiptKind: RECEIPT_KIND.MILESTONE, roundIndex: 0, pointsAwarded: 25 }],
    attempt('final', { isCorrect: true, pointsAwarded: 1_100 }),
  );
  assert.equal(questionAttempts({ receipts: log, roundIndex: 0 }).length, 1);
  assert.deepEqual(roundOutcome({ receipts: log, roundIndex: 0 }), { roundIndex: 0, isCorrect: true, scorePercent: 100, secondChance: false, elapsedMs: log.final.elapsedMs });
  assert.equal(roundPointsFromReceipts(log, 0), 1_165, 'points include the milestones');
  assert.equal(receiptKindOf({}), RECEIPT_KIND.RESPONSE, 'receipts written before the field were responses');
  assert.equal(isAttemptReceipt({ serverConfirmed: false }), false, 'an unconfirmed receipt is not an attempt');
});

test('a round summary is the input round ranking reads', () => {
  const specs = [
    { completionRule: COMPLETION_RULE.SINGLE_RESPONSE },
    { completionRule: COMPLETION_RULE.ALL_TARGETS, targetCount: 2 },
  ];
  const log = receipts(
    attempt('q0', { questionIndex: 0, isCorrect: true, elapsedMs: 4_000, pointsAwarded: 1_050 }),
    attempt('q1a', { questionIndex: 1, isCorrect: true, targetId: 't1', elapsedMs: 9_000 }),
    attempt('q1b', { questionIndex: 1, isCorrect: false, targetId: 't9', elapsedMs: 11_000 }),
    attempt('other-round', { roundIndex: 1, isCorrect: true }),
  );
  const summary = summarizeRoundProgress({ receipts: log, roundIndex: 0, questionSpecs: specs });
  assert.equal(summary.questionCount, 2);
  assert.equal(summary.questionsCompleted, 1);
  assert.equal(summary.questionsCorrect, 1);
  assert.equal(summary.attempts, 3);
  assert.equal(summary.incorrectAttempts, 1);
  assert.equal(summary.scoreTotal, 1.5);
  assert.equal(summary.accuracy, 2 / 3);
  assert.equal(summary.lastCorrectCompletionElapsedMs, 4_000);
  assert.equal(summary.participated, true);
  assert.equal(summary.finished, false, 'one target is still missing');
  assert.equal(summary.points, 1_050);
  const absent = summarizeRoundProgress({ receipts: {}, roundIndex: 0 });
  assert.equal(absent.participated, false);
  assert.equal(absent.accuracy, null, 'no attempts is no accuracy, not 0%');
  assert.equal(absent.finished, false);
});

test('question specs are bounded and normalized', () => {
  assert.deepEqual(normalizeQuestionSpec({}), { questionIndex: 0, targetCount: 1, completionRule: 'singleResponse' });
  assert.equal(normalizeQuestionSpec({ completionRule: 'singleResponse', targetCount: 5 }).targetCount, 1, 'a single response has one target');
  assert.equal(normalizeQuestionSpec({ completionRule: 'allTargets', targetCount: 999 }).targetCount, MAX_TARGETS_PER_QUESTION);
  assert.equal(normalizeQuestionSpec({ completionRule: 'allTargets', targetCount: 0 }).targetCount, 1);
  assert.equal(normalizeQuestionSpec({ completionRule: 'whatever' }).completionRule, 'singleResponse');
  assert.equal(normalizeRoundQuestionSpecs(undefined).length, 1, 'a classic round is one default question');
  assert.equal(normalizeRoundQuestionSpecs(Array.from({ length: 80 }, () => ({}))).length, MAX_QUESTIONS_PER_ROUND);
  assert.deepEqual(normalizeRoundQuestionSpecs([{}, {}]).map((spec) => spec.questionIndex), [0, 1]);
});
