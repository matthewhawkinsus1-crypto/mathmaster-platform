// The case review's server-only evidence: who may read it, what a request may
// ask for, and what leaves the server (no responses, no drafts, no other
// students, nothing from other kinds of evidence).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CASE_EVIDENCE_LIMITS, authorizeCaseEvidenceCaller, buildCaseEvidenceResponse, projectAttemptEvent, summarizePracticeDraft,
  summarizeReceipts, validateCaseEvidenceRequest,
} from '../../functions/shared/caseReviewEvidence.mjs';

const DAY = 86400000;
const student = { classId: 'class-a', assignedTeacherEmail: 'teacher.a@example.test' };

test('only this student\'s teacher (class or roster) or the root admin may read it; never a student', () => {
  const allowed = (overrides) => authorizeCaseEvidenceCaller({ callerRole: 'teacher', student, classRecord: { teacherOfRecord: 'Teacher.A@example.test' }, ...overrides }).allowed;
  assert.equal(allowed({ callerEmail: 'teacher.a@example.test' }), true);
  assert.equal(allowed({ callerEmail: 'teacher.b@example.test' }), false);
  assert.equal(allowed({ callerEmail: 'teacher.b@example.test', isRootAdmin: true }), true);
  assert.equal(authorizeCaseEvidenceCaller({ callerRole: 'teacher', callerEmail: 'teacher.a@example.test', student, classRecord: null }).reason, 'roster-teacher');
  assert.equal(authorizeCaseEvidenceCaller({ callerRole: 'student', callerEmail: 'teacher.a@example.test', student, classRecord: { teacherOfRecord: 'teacher.a@example.test' } }).allowed, false);
  assert.equal(authorizeCaseEvidenceCaller({ callerRole: 'teacher', callerEmail: '', student }).allowed, false);
  assert.equal(authorizeCaseEvidenceCaller({ callerRole: 'teacher', callerEmail: 'teacher.a@example.test', student: null }).allowed, false);
});

test('a request is bounded: one student, a real range of at most 400 days, at most 200 assignments', () => {
  const ok = validateCaseEvidenceRequest({ studentId: 'S1', fromMs: 0, toMs: 30 * DAY, assignmentIds: ['a1', 'a1', 'a2'] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.request.assignmentIds, ['a1', 'a2']);
  assert.equal(validateCaseEvidenceRequest({ studentId: '', fromMs: 0, toMs: 1, assignmentIds: ['a'] }).ok, false);
  assert.equal(validateCaseEvidenceRequest({ studentId: 'S1', fromMs: 0, toMs: 401 * DAY, assignmentIds: ['a'] }).ok, false);
  assert.equal(validateCaseEvidenceRequest({ studentId: 'S1', fromMs: 5, toMs: 1, assignmentIds: ['a'] }).ok, false);
  assert.equal(validateCaseEvidenceRequest({ studentId: 'S1', fromMs: 0, toMs: 1, assignmentIds: Array.from({ length: 201 }, (_, i) => `a${i}`) }).ok, false);
  assert.equal(validateCaseEvidenceRequest({ studentId: 'grades/S1', fromMs: 0, toMs: 1, assignmentIds: ['a'] }).ok, false);
});

test('an attempt event keeps scores, numbers, times and standards — and drops responses and adaptation text', () => {
  const projected = projectAttemptEvent({
    eventKey: 'ev1',
    occurredAt: 1700000000000,
    alignmentKeys: ['texas:A.5A'],
    questionSnapshot: { questionId: 'q1', questionType: 'algebra', variantIndex: 0, dok: 2, instanceFingerprint: 'linear(2,3,7)' },
    adaptation: { reason: 'free text' },
    source: { kind: 'assignment', assignmentId: 'a1', assignmentTitle: 'Lesson', activityRole: 'classwork', questionIndex: 3 },
    performance: { attemptNumber: 2, isCorrect: false, partialCredit: 40, status: 'attempted', score: 0.4 },
    supportUsage: { calculatorUsed: true, accommodations: ['text-to-speech'] },
    response: 'x = 7',
  });
  assert.equal(projected.performance.attemptNumber, 2);
  assert.equal(projected.supportUsage.calculatorUsed, true);
  assert.equal(projected.questionSnapshot.hasFamilyInstance, true);
  const text = JSON.stringify(projected);
  assert.doesNotMatch(text, /x = 7|free text|linear\(2,3,7\)|text-to-speech|assignmentTitle/);
  // Other kinds of evidence never leave through this callable.
  assert.equal(projectAttemptEvent({ source: { kind: 'myMathPath' }, performance: {} }), null);
});

test('receipts become counts per assignment, including answers refused after the assignment closed', () => {
  const at = (iso) => ({ toMillis: () => Date.parse(iso) });
  const summary = summarizeReceipts([
    { assignmentId: 'a1', disposition: 'accepted', academicOccurredAt: at('2026-09-10T15:00:00Z') },
    { assignmentId: 'a1', disposition: 'permanently-invalid', reason: 'assignment-closed-at-capture', issuedAt: at('2026-09-20T15:00:00Z') },
    { assignmentId: 'a1', disposition: 'permanently-invalid', reason: 'practice-pass-redeemed' },
    { assignmentId: 'a2', disposition: 'duplicate', reason: 'already-canonical' },
    { assignmentId: 'other', disposition: 'accepted' },
  ], { assignmentIds: ['a1', 'a2'] });
  assert.equal(summary.a1.accepted, 1);
  assert.equal(summary.a1.notCountedAfterClose, 1);
  assert.equal(summary.a1.lastNotCountedAtMs, Date.parse('2026-09-20T15:00:00Z'));
  assert.equal(summary.a1.practicePassExcused, 1);
  assert.equal(summary.a2.other, 1);
  assert.equal(summary.other, undefined);
});

test('Practice Mode drafts become counts and a time; the saved work itself never leaves', () => {
  const summary = summarizePracticeDraft({
    entries: [{ key: 'mathmaster:draft:v2::S1:a1:0:0:practice', valueJson: '{"answer":"x=7"}' }],
    practice: {
      0: { status: 'correct', totalAttempts: 2, lastAttemptAt: '2026-09-21T18:00:00Z' },
      2: { status: 'attempted', totalAttempts: 1, lastAttemptAt: '2026-09-21T18:05:00Z' },
      4: { status: 'unattempted', totalAttempts: 0 },
    },
    practiceUpdatedAt: '2026-09-21T18:06:00Z',
  });
  assert.deepEqual([summary.questionsPracticed, summary.attempts, summary.correct], [2, 3, 1]);
  assert.equal(summary.lastPracticeAtMs, Date.parse('2026-09-21T18:05:00Z'));
  assert.equal(summary.clock, 'student-device');
  assert.doesNotMatch(JSON.stringify(summary), /x=7|valueJson|entries/);
  assert.equal(summarizePracticeDraft({ entries: [] }), null);
});

test('the response holds only the requested assignments and flags truncation', () => {
  const event = (assignmentId) => ({ id: `e-${assignmentId}`, data: { source: { kind: 'assignment', assignmentId, questionIndex: 0 }, performance: { attemptNumber: 1 }, occurredAt: 1 } });
  const response = buildCaseEvidenceResponse({
    request: { studentId: 'S1', fromMs: 0, toMs: 10, assignmentIds: ['a1'] },
    events: [event('a1'), event('a9')],
    drafts: { a1: { practice: { 0: { status: 'correct', totalAttempts: 1 } } }, a9: { practice: { 0: { status: 'correct', totalAttempts: 1 } } } },
    audits: [{ assignmentId: 'a1', questionIndex: 0, at: '2026-09-20T15:00:00Z', previousScore: 0, newScore: 100, reason: 'Equivalent answer accepted by teacher', actor: { email: 'Teacher.A@example.test', uid: 'u1' } }, { assignmentId: 'a9' }],
  });
  assert.deepEqual(response.attemptEvents.map((entry) => entry.source.assignmentId), ['a1']);
  assert.deepEqual(Object.keys(response.practice), ['a1']);
  assert.deepEqual(response.overrideAudits.map((audit) => [audit.assignmentId, audit.newScore, audit.actorEmail]), [['a1', 100, 'teacher.a@example.test']]);
  assert.doesNotMatch(JSON.stringify(response.overrideAudits), /u1/, 'no uid leaves');
  assert.equal(response.truncated.events, false);
  assert.ok(CASE_EVIDENCE_LIMITS.maxEvents >= 1000);
});
