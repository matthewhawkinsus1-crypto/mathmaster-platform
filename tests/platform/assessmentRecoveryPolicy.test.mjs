import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ASSESSMENT_RECOVERY_ACTIONS,
  RECOVERY_AUDIT_LIMIT,
  buildDolAttemptGrant,
  buildDolWindowOpening,
  recoveryHistory,
  summarizeStudentRecovery,
} from '../../src/platform/assessment/assessmentRecovery.js';
import {
  getAttemptsRemaining,
  normalizeQuestionRecord,
  resolveQuestionMaximumAttempts,
  resolveTeacherGrantedExtraAttempts,
} from '../../functions/shared/attemptPolicy.mjs';
import { dolTeacherRecoveryActiveAt, resolveDolWindow } from '../../functions/shared/sectionDeadline.mjs';
import { region } from './helpers/sourceContract.mjs';

// ASSESSMENT RECOVERY — REOPEN, EXTRA ATTEMPTS, AND THE RECORD OF BOTH (Job 6).
//
// Recovery changes what the policy allows NEXT. It never edits evidence: prior
// attempts, scores and responses stay exactly as they were, every action is
// appended to an audit, and the browser and the server read the same grant.

const NOW = Date.parse('2026-09-24T15:00:00Z');
const assignment = (dol = {}) => ({ id: 'a1', title: 'Lesson 5', dol: { enabled: true, minutesBeforeEnd: 10, ...dol } });
const dolQuestion = { type: 'stepAlgebra', equation: '4x + 7 = 23' };
const maxFor = (a, { classId = 'c1', studentId = null } = {}) => resolveQuestionMaximumAttempts({
  question: dolQuestion,
  maximumAttempts: 1,
  teacherGrantedExtraAttempts: resolveTeacherGrantedExtraAttempts({ assignment: a, activityRole: 'dol', classId, studentId }),
});

test('a class grant raises every student\'s DOL maximum and is audited with before and after', () => {
  const { dol, audit } = buildDolAttemptGrant({ assignment: assignment(), scope: { type: 'class', classId: 'c1' }, teacherId: 't1', reason: 'fire drill', now: NOW });
  const granted = assignment(dol);
  assert.equal(maxFor(granted), 2);
  assert.equal(maxFor(granted, { classId: 'c2' }), 1, 'another class is untouched');
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0].previous, { extraAttempts: 0 });
  assert.deepEqual(audit[0].next, { extraAttempts: 1 });
  assert.equal(audit[0].teacherId, 't1');
  assert.equal(audit[0].reason, 'fire drill');
  assert.equal(audit[0].action, ASSESSMENT_RECOVERY_ACTIONS.GRANT_ATTEMPTS);
  assert.equal(audit[0].at, new Date(NOW).toISOString());
});

test('a per-student grant adds to the class grant for that student only, in browser and server alike', () => {
  const classGranted = assignment(buildDolAttemptGrant({ assignment: assignment(), scope: { type: 'class', classId: 'c1' }, now: NOW }).dol);
  const both = assignment(buildDolAttemptGrant({ assignment: classGranted, scope: { type: 'students', studentIds: ['s-absent'], classId: 'c1' }, now: NOW + 1000 }).dol);
  assert.equal(maxFor(both, { studentId: 's-absent' }), 3, '1 base + 1 class + 1 student');
  assert.equal(maxFor(both, { studentId: 's-other' }), 2, 'classmates get the class grant only');
  assert.equal(resolveTeacherGrantedExtraAttempts({ assignment: both, activityRole: 'practice', classId: 'c1', studentId: 's-absent' }), 0, 'only the DOL is affected');
  assert.equal(maxFor(both, { classId: null, studentId: 's-absent' }), 2, 'a student grant applies even without class context');
});

test('grants accumulate, are capped, and the audit only ever grows', () => {
  let current = assignment();
  for (let index = 0; index < 25; index += 1) {
    current = assignment(buildDolAttemptGrant({ assignment: current, scope: { type: 'students', studentIds: ['s1'] }, teacherId: 't1', now: NOW + index }).dol);
  }
  assert.equal(resolveTeacherGrantedExtraAttempts({ assignment: current, activityRole: 'dol', studentId: 's1' }), 20);
  assert.equal(current.dol.recoveryAudit.length, 25);
  assert.deepEqual(current.dol.recoveryAudit[0].next, { extraAttemptsByStudent: { s1: 1 } }, 'the first entry is unchanged by later ones');
  assert.equal(recoveryHistory(current, { studentId: 's1' })[0].at, new Date(NOW + 24).toISOString(), 'newest first');
  assert.ok(RECOVERY_AUDIT_LIMIT >= 500);
});

test('a recovery never touches evidence and never writes a teacher email to a student-readable document', () => {
  const { dol } = buildDolAttemptGrant({ assignment: assignment(), scope: { type: 'class', classId: 'c1' }, teacherId: 'teacher-uid', now: NOW });
  assert.doesNotMatch(JSON.stringify(dol), /@/);
  const patchKeys = Object.keys(dol);
  for (const forbidden of ['grades', 'gradesByAssignment', 'records', 'attempts', 'classroomSync']) {
    assert.ok(!patchKeys.includes(forbidden), `${forbidden} is evidence, not policy`);
  }
});

test('students in every situation: active, submitted, auto-submitted, absent', () => {
  const granted = assignment(buildDolAttemptGrant({ assignment: assignment(), scope: { type: 'class', classId: 'c1' }, now: NOW }).dol);
  const max = maxFor(granted);
  const active = normalizeQuestionRecord({ status: 'attempted', attemptCount: 0 });
  const submitted = normalizeQuestionRecord({ status: 'expired', attemptCount: 1, totalAttempts: 1, score: 0 });
  const autoSubmitted = normalizeQuestionRecord({ status: 'expired', attemptCount: 1, totalAttempts: 1, finalizedBy: 'deadline' });
  const absent = normalizeQuestionRecord(null);
  assert.equal(getAttemptsRemaining(active, max), 2);
  assert.equal(getAttemptsRemaining(submitted, max), 1, 'a submitted student gets a real new attempt');
  assert.equal(getAttemptsRemaining(autoSubmitted, max), 1, 'an auto-submitted student too');
  assert.equal(getAttemptsRemaining(absent, max), 2, 'an absent student has the full allowance');
  assert.equal(submitted.attemptCount, 1, 'the earlier attempt is still counted, not erased');
});

test('a reopened window is recognised by the browser window and by server grading, and honours a chosen close', () => {
  const window = { startMs: Date.parse('2026-09-24T14:00:00Z'), endMs: Date.parse('2026-09-24T14:50:00Z') };
  const { dol, entry } = buildDolWindowOpening({ assignment: assignment(), classId: 'c1', recovery: true, dateKey: '2026-09-24', teacherId: 't1', now: NOW });
  const reopened = assignment(dol);
  assert.equal(entry.closesAt, new Date(NOW + 10 * 60_000).toISOString(), 'default: the DOL\'s own duration');
  const browser = resolveDolWindow({ assignment: reopened, window, classId: 'c1', todayKey: '2026-09-24' });
  assert.equal(browser.teacherRecovery, true);
  assert.equal(browser.endsAtMs, NOW + 10 * 60_000);
  assert.equal(dolTeacherRecoveryActiveAt({ assignment: reopened, classId: 'c1', at: NOW + 60_000, timeZone: 'UTC' }), true, 'server accepts work inside the window');
  assert.equal(dolTeacherRecoveryActiveAt({ assignment: reopened, classId: 'c1', at: NOW + 11 * 60_000, timeZone: 'UTC' }), false, 'and refuses it after');
  assert.equal(dolTeacherRecoveryActiveAt({ assignment: reopened, classId: 'c2', at: NOW + 60_000, timeZone: 'UTC' }), false, 'only for that class');

  const custom = buildDolWindowOpening({ assignment: assignment(), classId: 'c1', recovery: true, dateKey: '2026-09-24', closesAt: '2026-09-24T16:30:00Z', now: NOW });
  assert.equal(custom.entry.closesAt, '2026-09-24T16:30:00.000Z');
  assert.throws(() => buildDolWindowOpening({ assignment: assignment(), classId: 'c1', recovery: true, dateKey: '2026-09-24', closesAt: '2026-09-24T14:00:00Z', now: NOW }), /future/);
  assert.equal(custom.dol.recoveryAudit.at(-1).action, ASSESSMENT_RECOVERY_ACTIONS.REOPEN_WINDOW);
});

test('an expired assignment is not reopened by an attempt grant alone', () => {
  const window = { startMs: Date.parse('2026-09-24T14:00:00Z'), endMs: Date.parse('2026-09-24T14:50:00Z') };
  const granted = assignment(buildDolAttemptGrant({ assignment: assignment(), scope: { type: 'class', classId: 'c1' }, now: NOW }).dol);
  const state = resolveDolWindow({ assignment: granted, window, classId: 'c1', todayKey: '2026-09-24' });
  assert.equal(state.teacherRecovery, false);
  assert.ok(state.endsAtMs < NOW, 'more attempts do not move the close; reopening is its own, audited action');
});

test('the student is told what changed', () => {
  const reopened = assignment(buildDolWindowOpening({ assignment: assignment(), classId: 'c1', recovery: true, dateKey: '2026-09-24', now: NOW }).dol);
  const withGrant = assignment(buildDolAttemptGrant({ assignment: reopened, scope: { type: 'students', studentIds: ['s1'] }, now: NOW }).dol);
  const summary = summarizeStudentRecovery({ assignment: withGrant, classId: 'c1', studentId: 's1', now: NOW + 60_000 });
  assert.equal(summary.reopened.closesAt, new Date(NOW + 10 * 60_000).toISOString());
  assert.equal(summary.extraAttempts, 1);
  assert.equal(summarizeStudentRecovery({ assignment: withGrant, classId: 'c1', studentId: 's1', now: NOW + 20 * 60_000 }).reopened, null, 'a closed window is not announced');
});

test('the teacher controls and the server are wired to the one model', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(app, /import \{ buildDolAttemptGrant, buildDolWindowOpening, summarizeStudentRecovery \} from '\.\/platform\/assessment\/assessmentRecovery\.js'/);
  assert.match(region(app, 'const handleUnlockDOLForClass = async', 'const handleGrantDOLAttemptForClass'), /buildDolWindowOpening\(\{/);
  assert.match(region(app, 'const handleGrantDOLAttemptForClass = async', 'const handleGrantDOLAttemptForStudents'), /buildDolAttemptGrant\(\{[\s\S]*?scope: \{ type: 'class', classId \}/);
  assert.match(region(app, 'const handleGrantDOLAttemptForStudents = async', 'const handleToggleWarmupForClass'), /scope: \{ type: 'students', studentIds:/);
  assert.match(app, /onClick=\{\(\) => handleGrantDOLAttemptForStudents\(selectedAssignment, \[student\]\)\}/);
  assert.match(region(app, 'A REOPENED DOL OR AN EXTRA ATTEMPT MUST REACH THE STUDENT', '// Warm-Up reminders'), /summarizeStudentRecovery\(\{ assignment, classId: user\.classId \|\| null, studentId: user\.id/);
  // Every student-side maximum includes this student's own grant.
  assert.equal((app.match(/studentId: user\?\.role === 'student' \? user\.id : null,/g) || []).length, 4);

  const ingestion = fs.readFileSync('functions/shared/submissionIngestion.mjs', 'utf8');
  assert.match(region(ingestion, 'const teacherGrantedExtraAttempts = resolveTeacherGrantedExtraAttempts({', '});'), /studentId: envelope\?\.studentId/);
  const finalizer = fs.readFileSync('functions/shared/responseCheckpointFinalizer.mjs', 'utf8');
  assert.match(region(finalizer, 'teacherGrantedExtraAttempts: resolveTeacherGrantedExtraAttempts({', '}),'), /studentId: text\(checkpoint\.studentId\)/);
});
