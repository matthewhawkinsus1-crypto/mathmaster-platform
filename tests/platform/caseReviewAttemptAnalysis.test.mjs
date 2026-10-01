// Question-level attempt evidence: what happened on each question, attempt by
// attempt, from the records MathMaster keeps — and where the record is silent,
// saying so instead of guessing.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUESTION_OUTCOME, analyzeAssignmentQuestions, attemptEventsForAssignment, describeAttemptSummary, summarizeQuestionOutcomes,
} from '../../src/platform/caseReview/attemptAnalysis.js';

const T0 = Date.parse('2026-09-15T14:00:00Z');
const MIN = 60000;

const q = (id, role, extra = {}) => ({ questionId: id, activityRole: role, type: 'algebra', prompt: `Prompt ${id}`, standards: { primary: ['A.5A'] }, ...extra });
const assignment = {
  id: 'les-1',
  title: 'Lesson 1 (synthetic)',
  schemaVersion: 5,
  assignedClassIds: ['class-a'],
  sections: [
    { id: 'wu', role: 'warmup', questions: [q('w1', 'warmup'), q('w2', 'warmup')] },
    { id: 'cw', role: 'classwork', questions: [q('c1', 'classwork'), q('c2', 'classwork'), q('c3', 'classwork', { standards: { primary: ['A.3B'] } })] },
    { id: 'pr', role: 'practice', questions: [q('p1', 'practice'), q('p2', 'practice')] },
    { id: 'dl', role: 'dol', questions: [q('d1', 'dol', { type: 'multipleChoice', choices: ['1', '2', '3'] }), q('d2', 'dol')] },
  ],
};
// Storage indices: w1 0, w2 1, c1 2, c2 3, c3 4, p1 5, p2 6, d1 7, d2 8.
const record = (status, attemptCount, totalAttempts = attemptCount, extra = {}) => ({
  status, attemptCount, totalAttempts, variantIndex: 0, partialCredit: status === 'correct' ? 100 : 0, lastAttemptAt: new Date(T0).toISOString(), ...extra,
});
const student = {
  id: 'S910101',
  classId: 'class-a',
  gradesByAssignment: {
    'les-1': {
      0: record('correct', 1),
      1: record('correct', 3),
      2: record('expired', 3, 3, { partialCredit: 40, bestPartialCredit: 40 }),
      // 3 (c2) unattempted, but c3 after it was attempted: skipped.
      4: record('attempted', 1, 1),
      5: record('correct', 1, 4, { variantIndex: 1 }),
      // 6 (p2) unattempted and nothing after it in Practice.
      7: record('expired', 1, 1),
      8: record('correct', 1),
    },
  },
  teacherGradeOverridesByAssignment: {
    'les-1': { 2: { active: true, score: 100, totalAttempts: 3, variantIndex: 0, lastAttemptAt: new Date(T0).toISOString() } },
  },
};

const analyze = (overrides = {}) => analyzeAssignmentQuestions({
  assignment, student, attemptEvents: [], supportEvidence: [], closedForStudent: false, ...overrides,
});
const byId = (result, id) => result.questions.find((row) => row.questionId === id);

test('outcomes come from the attempt record, attempt by attempt, with nothing invented', () => {
  const result = analyze();
  assert.equal(byId(result, 'w1').outcome, QUESTION_OUTCOME.CORRECT_FIRST);
  assert.deepEqual(byId(result, 'w1').attempts.map((attempt) => attempt.result), ['correct']);
  // Correct on the third attempt means the first two were not fully correct:
  // the record stops at the first correct answer. Whether they earned partial
  // credit is not recorded per attempt, so they read "not correct", not "wrong".
  assert.equal(byId(result, 'w2').outcome, QUESTION_OUTCOME.CORRECTED_AFTER_RETRY);
  assert.deepEqual(byId(result, 'w2').attempts.map((attempt) => attempt.result), ['not-correct', 'not-correct', 'correct']);
  assert.equal(byId(result, 'w2').improved, true);
  assert.equal(byId(result, 'w2').attemptsSource, 'derived-from-record');
  assert.equal(byId(result, 'c1').outcome, QUESTION_OUTCOME.EXHAUSTED);
  assert.equal(byId(result, 'c1').finalResult, 'partial');
  assert.equal(byId(result, 'c1').finalCredit, 40);
  // Its attempts are not individually known: only the best credit is.
  assert.deepEqual(byId(result, 'c1').attempts.map((attempt) => attempt.result), ['not-correct', 'not-correct', 'not-correct']);
});

test('a teacher override changes the grade shown, never the student\'s own attempt history', () => {
  const c1 = byId(analyze(), 'c1');
  assert.equal(c1.outcome, QUESTION_OUTCOME.EXHAUSTED);
  assert.equal(c1.teacherOverride, true);
  assert.equal(c1.gradedCredit, 100);
});

test('unanswered questions: skipped only when a later question in the same section was attempted', () => {
  const result = analyze();
  assert.equal(byId(result, 'c2').outcome, QUESTION_OUTCOME.SKIPPED);
  assert.equal(byId(result, 'p2').outcome, QUESTION_OUTCOME.NOT_ATTEMPTED);
  assert.equal(byId(result, 'c2').attempts.length, 0);
});

test('attempts remaining: still open while the assignment is open, "left with attempts remaining" once it closed', () => {
  assert.equal(byId(analyze(), 'c3').outcome, QUESTION_OUTCOME.OPEN_INCORRECT);
  assert.equal(byId(analyze({ closedForStudent: true }), 'c3').outcome, QUESTION_OUTCOME.LEFT_WITH_ATTEMPTS);
  assert.equal(byId(analyze(), 'c3').attemptsRemaining, 2);
});

test('a DOL multiple-choice item has one attempt, so one wrong answer exhausts it', () => {
  const d1 = byId(analyze(), 'd1');
  assert.equal(d1.maxAttempts, 1);
  assert.equal(d1.outcome, QUESTION_OUTCOME.EXHAUSTED);
});

test('a replacement question: the original was exhausted, so the first attempt was not correct', () => {
  const p1 = byId(analyze(), 'p1');
  assert.equal(p1.replacements, 1);
  assert.equal(p1.firstAttemptCorrect, false);
  assert.equal(p1.outcome, QUESTION_OUTCOME.CORRECTED_AFTER_RETRY);
});

test('per-attempt server events, when present, give each attempt its own result and time', () => {
  const event = (questionIndex, attemptNumber, isCorrect, atMs, extra = {}) => ({
    eventKey: `ev-${questionIndex}-${attemptNumber}`,
    occurredAt: atMs,
    alignmentKeys: ['texas:A.5A'],
    questionSnapshot: { questionId: 'x', variantIndex: 0, questionType: 'algebra' },
    source: { kind: 'assignment', assignmentId: 'les-1', activityRole: 'warmup', questionIndex },
    performance: { attemptNumber, isCorrect, partialCredit: isCorrect ? 100 : 0, status: isCorrect ? 'correct' : 'attempted' },
    supportUsage: { calculatorUsed: attemptNumber === 2 },
    ...extra,
  });
  const events = [
    event(1, 1, false, T0),
    event(1, 2, false, T0 + 2 * MIN),
    event(1, 3, true, T0 + 2 * 1440 * MIN), // two days later: a separate work session
    event(1, 0, false, T0 + 3 * 1440 * MIN, { performance: { attemptNumber: 1, isCorrect: false, status: 'unattempted' }, questionSnapshot: { variantIndex: 1 } }),
    { ...event(1, 1, false, T0), source: { kind: 'assignment', assignmentId: 'other', questionIndex: 1 } },
  ];
  assert.equal(attemptEventsForAssignment(events, 'les-1').length, 4);
  const w2 = byId(analyze({ attemptEvents: events }), 'w2');
  assert.equal(w2.attemptsSource, 'evidence-events');
  assert.deepEqual(w2.attempts.map((attempt) => [attempt.number, attempt.result, attempt.provenance]), [
    [1, 'incorrect', 'direct-record'], [2, 'incorrect', 'direct-record'], [3, 'correct', 'direct-record'],
  ]);
  assert.equal(w2.attempts[1].calculatorUsed, true);
  assert.equal(w2.repeatedReturn, true, 'attempts in two separate work sessions');
  assert.equal(w2.replacementEvents, 1, 'a replacement marker is not an attempt');
  // A question with no events cannot say whether the student came back to it.
  assert.equal(byId(analyze({ attemptEvents: events }), 'c1').repeatedReturn, null);
});

test('partial event coverage: recorded attempts are direct, the rest are derived and labelled so', () => {
  const events = [{
    eventKey: 'only-third',
    occurredAt: T0,
    source: { kind: 'assignment', assignmentId: 'les-1', questionIndex: 1 },
    questionSnapshot: { variantIndex: 0 },
    performance: { attemptNumber: 3, isCorrect: true, partialCredit: 100, status: 'correct' },
  }];
  const w2 = byId(analyze({ attemptEvents: events }), 'w2');
  assert.equal(w2.attemptsSource, 'mixed');
  assert.deepEqual(w2.attempts.map((attempt) => attempt.provenance), ['derived', 'derived', 'direct-record']);
});

test('the summary reads like the brief: first-attempt, corrected, still incorrect, never a motive', () => {
  const result = analyze({ closedForStudent: true });
  const summary = summarizeQuestionOutcomes(result.questions);
  assert.equal(summary.scored, 7);
  assert.equal(summary.firstAttemptCorrect, 2); // w1, d2
  assert.equal(summary.correctedAfterRetry, 2); // w2, p1
  assert.equal(summary.exhausted, 2); // c1, d1
  assert.equal(summary.leftWithAttempts, 1); // c3
  assert.equal(summary.notAttempted + summary.skipped, 2);
  assert.equal(summary.firstAttemptAccuracy, 29); // 2 of 7
  const text = describeAttemptSummary(summary);
  assert.match(text, /^2 of 7 scored questions were correct on the first attempt\. 2 additional questions were corrected on a later attempt\. 2 remained incorrect after all available attempts\./);
  assert.doesNotMatch(text, /effort|motivat|persever|gave up|lazy/i);
});

test('an assignment with no recorded work has no scored questions and no rates', () => {
  const summary = summarizeQuestionOutcomes(analyzeAssignmentQuestions({ assignment, student: { id: 'S910102', gradesByAssignment: {} } }).questions);
  assert.equal(summary.scored, 0);
  assert.equal(summary.firstAttemptAccuracy, null);
  assert.equal(summary.averageAttemptsPerFinishedQuestion, null);
});

test('standards come from the question\'s own metadata, never from the title', () => {
  const result = analyze();
  assert.deepEqual(byId(result, 'c3').standards.primary, ['A.3B']);
  const untagged = analyzeAssignmentQuestions({
    assignment: { ...assignment, title: 'A.5A Solving equations', sections: [{ id: 's', role: 'classwork', questions: [{ questionId: 'u1', type: 'algebra' }] }] },
    student: { id: 'S1', gradesByAssignment: { 'les-1': { 0: record('correct', 1) } } },
  });
  assert.deepEqual(untagged.questions[0].standards.primary, []);
});

test('a MathMaster-generated Honors extension is marked platform-inferred, not authored', () => {
  const honors = {
    id: 'hon-1',
    title: 'Honors lesson (synthetic)',
    schemaVersion: 5,
    sections: [{ id: 's', role: 'classwork', questions: [{ questionId: 'h1', type: 'graphStory', teks: ['A.5A'], honorsEnrichment: { generatedBy: 'MathMaster' } }] }],
  };
  const result = analyzeAssignmentQuestions({ assignment: honors, student: { id: 'S1', gradesByAssignment: { 'hon-1': { 0: record('correct', 1) } } } });
  assert.equal(result.questions[0].standardsSource, 'platform-inferred');
});
