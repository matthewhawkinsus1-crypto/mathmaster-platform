// H-116: GOOGLE CLASSROOM USES THE STUDENT'S OWN CUTOFF.
//
// The checkpoint schedulers wake the whole roster at the CLASS's due time and
// final cutoff. Before this change both Classroom triggers turned that into a
// returned "final-deadline" (or "due-checkpoint") grade for every student —
// including one whose own deadline is later (an attendance extension, or an
// extra-time accommodation's individualized due date), who then saw a
// returned, possibly incomplete grade while MathMaster was still accepting
// their work. Now:
//   * a class-wide wake-up speaks for a student only once their own time has
//     arrived (lib/classroomGradeRuntime.js; the same rule in functions/index.js);
//   * the trigger records the student's own time (deferredClassCheckpoint →
//     recordDeferredStudentCheckpoint) and the scheduler wakes them then
//     (wakeArrivedStudentCheckpoints);
//   * a student with no individual deadline gets exactly the stage they got
//     before (the frozen copy below).
// The emulator suite (tests/integration/studentAssignmentOverrides.test.mjs)
// runs the real whole-assignment trigger and scheduler end to end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { arrivedStudentCheckpoints, studentClassroomDeadlines } from '../../functions/shared/classroomStudentDeadlines.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../functions/lib/classroomGradeRuntime.js');
const checkpoints = require('../../functions/lib/classroomStudentCheckpoints.js');

const HOUR = 3_600_000;
const assignment = Object.freeze({
  id: 'A1',
  dueAt: '2026-10-01T23:00:00.000Z',
  lateDueAt: '2026-10-03T23:00:00.000Z',
  studentOverrides: {},
});
const CLASS_DUE = Date.parse(assignment.dueAt);
const CLASS_FINAL = Date.parse(assignment.lateDueAt);
const extraTimeProfile = (dueDateExtension = { mode: 'hours', value: 72 }) => buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null,
    inclusionStatus: false, accommodations: [{ id: 'extra-time', params: { dueDateExtension }, appliesTo: [] }], modifications: [],
  }],
  todayKey: '2026-09-30',
});
const progress = Object.freeze({ complete: false, attempted: 2, total: 4, meaningfulProgress: true });

// The whole-assignment stage function exactly as it was before H-116
// (functions/index.js, commit a7dddc7), for a student with no individual
// deadline — the reference the new code must reproduce.
const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const stageBefore = ({ assignment: a, progress: p, releaseSignal, nowValue }) => {
  const reason = runtime.releaseSignalReason(releaseSignal);
  if (reason === 'final-deadline') return 'final-deadline';
  if (reason === 'due-checkpoint') return 'due-checkpoint';
  if (reason === 'assessment-release') return p.complete ? 'final-complete' : 'assessment-release';
  const now = Number(nowValue) || Date.now();
  const dueAt = toDate(a?.dueAt || a?.dueDate);
  const lateDueAt = toDate(a?.lateDueAt || a?.lateDueDate || a?.dueAt || a?.dueDate);
  if (p.complete) return 'final-complete';
  if (lateDueAt && now >= lateDueAt.getTime()) return 'final-deadline';
  if (reason === 'initial-reconcile') {
    if (dueAt && now >= dueAt.getTime()) return 'due-checkpoint';
    return runtime.progressCheckpointStage(p);
  }
  if (reason === 'manual-retry' || reason === 'section-grade-reconcile') {
    return p.attempted > 0 || (dueAt && now >= dueAt.getTime()) ? 'manual-retry' : null;
  }
  if (dueAt && now >= dueAt.getTime()) return runtime.progressCheckpointStage(p, { late: true });
  return runtime.progressCheckpointStage(p);
};

test('a student with no individual deadline gets exactly the stage and release they got before', () => {
  const signals = [null, { reason: 'final-deadline' }, { reason: 'due-checkpoint' }, { reason: 'initial-reconcile' }, { reason: 'manual-retry' }, { reason: 'assessment-release' }, { reason: 'section-grade-reconcile' }, 'legacy-string'];
  const times = [CLASS_DUE - HOUR, CLASS_DUE, CLASS_DUE + HOUR, CLASS_FINAL - HOUR, CLASS_FINAL, CLASS_FINAL + HOUR];
  // The schedulers send "final-deadline" / "due-checkpoint" only once the
  // class's own time has passed (lateDueAt <= now, dueAt <= now), so those
  // are the only moments they can reach a trigger.
  const reachable = (releaseSignal, nowValue) => {
    const reason = runtime.releaseSignalReason(releaseSignal);
    if (reason === 'final-deadline') return nowValue >= CLASS_FINAL;
    if (reason === 'due-checkpoint') return nowValue >= CLASS_DUE;
    return true;
  };
  for (const releaseSignal of signals) {
    for (const nowValue of times.filter((time) => reachable(releaseSignal, time))) {
      for (const p of [progress, { ...progress, complete: true }, { ...progress, attempted: 0, meaningfulProgress: false }]) {
        const expected = stageBefore({ assignment, progress: p, releaseSignal, nowValue });
        const actual = runtime.resolveClassroomGradeStage({ assignment, progress: p, releaseSignal, nowValue, studentFinalCutoff: null, studentDueAt: null });
        assert.equal(actual, expected, `${JSON.stringify(releaseSignal)} at ${new Date(nowValue).toISOString()}`);
        assert.equal(runtime.deferredClassCheckpoint({ assignment, releaseSignal, nowValue }), null);
      }
    }
  }
  // The one deliberate difference: a teacher moved the class's final cutoff
  // later after its wake-up was queued. The grade is no longer called final
  // before the cutoff now in force (the scheduler wakes the class again at it).
  assert.equal(stageBefore({ assignment, progress, releaseSignal: { reason: 'final-deadline' }, nowValue: CLASS_FINAL - HOUR }), 'final-deadline');
  assert.equal(runtime.resolveClassroomGradeStage({ assignment, progress, releaseSignal: { reason: 'final-deadline' }, nowValue: CLASS_FINAL - HOUR }), 'late-progress-50');
  for (const stage of ['manual-retry', 'progress-50', 'late-progress-50', 'final-deadline']) {
    for (const nowValue of times) {
      assert.deepEqual(runtime.classroomGradeReleasePolicy({ stage, assignment, nowValue, studentDueAt: null }), runtime.classroomGradeReleasePolicy({ stage, assignment, nowValue }));
    }
  }
});

test('the student\'s own dates: their extension and their extra-time dates; the legacy box alone moves nothing', () => {
  const extended = studentClassroomDeadlines({
    assignment, studentId: 'S1', privateOverride: { lateDueAt: '2026-10-08T23:00:00.000Z' },
  });
  assert.deepEqual(extended, { dueAtMs: null, finalAtMs: Date.parse('2026-10-08T23:00:00.000Z') });
  const extraTime = studentClassroomDeadlines({ assignment, studentId: 'S2', studentProfile: extraTimeProfile(), privateOverride: null });
  assert.equal(extraTime.dueAtMs, CLASS_DUE + 72 * HOUR);
  assert.equal(extraTime.finalAtMs, CLASS_DUE + 72 * HOUR, 'max(class final, their due)');
  // Both: the later wins.
  const both = studentClassroomDeadlines({ assignment, studentId: 'S3', studentProfile: extraTimeProfile(), privateOverride: { lateDueAt: '2026-10-20T23:00:00.000Z' } });
  assert.equal(both.finalAtMs, Date.parse('2026-10-20T23:00:00.000Z'));
  // H-120 as implemented: a legacy "extra-time" flag moves no due date.
  assert.deepEqual(studentClassroomDeadlines({ assignment, studentId: 'S4', studentProfile: { accommodations: ['extra-time'] }, privateOverride: null }), { dueAtMs: null, finalAtMs: null });
  assert.deepEqual(studentClassroomDeadlines({ assignment, studentId: 'S5', privateOverride: null }), { dueAtMs: null, finalAtMs: null });
});

test('the class\'s final wake-up is progress — not returned — until the student\'s own cutoff, then final', () => {
  const own = studentClassroomDeadlines({ assignment, studentId: 'S2', studentProfile: extraTimeProfile(), privateOverride: null });
  const atClassFinal = CLASS_FINAL + 5 * 60_000;
  const stage = runtime.resolveClassroomGradeStage({
    assignment, progress, releaseSignal: { reason: 'final-deadline' }, nowValue: atClassFinal,
    studentFinalCutoff: own.finalAtMs, studentDueAt: own.dueAtMs,
  });
  assert.equal(stage, 'progress-50', 'before their own due: ordinary progress');
  assert.equal(runtime.classroomGradeReleasePolicy({ stage, assignment, nowValue: atClassFinal, studentDueAt: own.dueAtMs }).shouldReturn, false, 'not returned to the student');
  assert.deepEqual(
    runtime.deferredClassCheckpoint({ assignment, releaseSignal: { reason: 'final-deadline' }, nowValue: atClassFinal, studentFinalCutoff: own.finalAtMs, studentDueAt: own.dueAtMs }),
    { kind: 'final', atMs: own.finalAtMs },
    'recorded for the scheduler',
  );
  // Their own wake-up arrives.
  const theirs = own.finalAtMs + 60_000;
  assert.equal(runtime.resolveClassroomGradeStage({ assignment, progress, releaseSignal: { reason: 'final-deadline' }, nowValue: theirs, studentFinalCutoff: own.finalAtMs, studentDueAt: own.dueAtMs }), 'final-deadline');
  assert.equal(runtime.deferredClassCheckpoint({ assignment, releaseSignal: { reason: 'final-deadline' }, nowValue: theirs, studentFinalCutoff: own.finalAtMs }), null);
  // Finishing early is still final at once.
  assert.equal(runtime.resolveClassroomGradeStage({ assignment, progress: { ...progress, complete: true }, releaseSignal: { reason: 'final-deadline' }, nowValue: atClassFinal, studentFinalCutoff: own.finalAtMs }), 'final-complete');
});

test('the class\'s due wake-up waits for an individualized due date; an attendance extension keeps the class due', () => {
  const own = studentClassroomDeadlines({ assignment, studentId: 'S2', studentProfile: extraTimeProfile(), privateOverride: null });
  const atClassDue = CLASS_DUE + 60_000;
  const stage = runtime.resolveClassroomGradeStage({ assignment, progress, releaseSignal: { reason: 'due-checkpoint' }, nowValue: atClassDue, studentFinalCutoff: own.finalAtMs, studentDueAt: own.dueAtMs });
  assert.equal(stage, 'progress-50');
  assert.deepEqual(runtime.deferredClassCheckpoint({ assignment, releaseSignal: { reason: 'due-checkpoint' }, nowValue: atClassDue, studentDueAt: own.dueAtMs }), { kind: 'due', atMs: own.dueAtMs });
  // A manual retry before their own due is not returned either.
  assert.equal(runtime.classroomGradeReleasePolicy({ stage: 'manual-retry', assignment, nowValue: atClassDue, studentDueAt: own.dueAtMs }).shouldReturn, false);
  assert.equal(runtime.classroomGradeReleasePolicy({ stage: 'manual-retry', assignment, nowValue: atClassDue }).shouldReturn, true, 'a classmate\'s is');
  // Attendance extension: on time ends with the class; only the final moves.
  const extension = studentClassroomDeadlines({ assignment, studentId: 'S1', privateOverride: { lateDueAt: '2026-10-08T23:00:00.000Z' } });
  assert.equal(runtime.resolveClassroomGradeStage({ assignment, progress, releaseSignal: { reason: 'due-checkpoint' }, nowValue: atClassDue, studentFinalCutoff: extension.finalAtMs, studentDueAt: extension.dueAtMs }), 'due-checkpoint');
});

/*
 * NV02 (the owner, 2026-10-23): HOLD THE CLASSROOM RETURN UNTIL THE STUDENT'S
 * OWN CLOSE. A student on an attendance extension was returned a partial
 * "late-progress" grade in the class's late window — and at the class's
 * cutoff — while MathMaster still accepted their work. Now a partial grade
 * goes to Classroom as a draft while their own extended time runs, and their
 * grade is returned at their own close.
 */
test('NV02: a partial grade is a draft, not returned, while the student is still on their own extended time', () => {
  const extension = studentClassroomDeadlines({ assignment, studentId: 'S1', privateOverride: { lateDueAt: '2026-10-08T23:00:00.000Z' } });
  const OWN = extension.finalAtMs;
  const stageAt = (nowValue, releaseSignal = null, cutoff = OWN) => runtime.resolveClassroomGradeStage({
    assignment, progress, releaseSignal, nowValue, studentFinalCutoff: cutoff, studentDueAt: extension.dueAtMs,
  });
  const policyAt = (stage, nowValue, cutoff = OWN) => runtime.classroomGradeReleasePolicy({
    stage, assignment, nowValue, studentDueAt: extension.dueAtMs, studentFinalCutoff: cutoff,
  });
  const held = { studentVisible: false, assignToStudent: false, shouldReturn: false, heldUntilMs: OWN };
  // The class's late window, the class's own final wake-up, and up to the
  // last moment before their own close: a draft, held until their own close.
  for (const [nowValue, signal] of [[CLASS_DUE + HOUR, null], [CLASS_FINAL - HOUR, null], [CLASS_FINAL + 5 * 60_000, { reason: 'final-deadline' }], [CLASS_FINAL + HOUR, null], [OWN - 1, null]]) {
    const stage = stageAt(nowValue, signal);
    assert.equal(stage, 'late-progress-50', new Date(nowValue).toISOString());
    assert.deepEqual(policyAt(stage, nowValue), held, new Date(nowValue).toISOString());
  }
  // A classmate in the class's late window is returned their late progress, as before.
  assert.deepEqual(runtime.classroomGradeReleasePolicy({ stage: 'late-progress-50', assignment, nowValue: CLASS_DUE + HOUR }), { studentVisible: true, assignToStudent: true, shouldReturn: true });
  // A teacher's retry after the due date is held the same way.
  assert.deepEqual(policyAt('manual-retry', CLASS_FINAL + HOUR), held);
  // Exactly at their own close the hold is over: their grade is final and returned.
  assert.equal(stageAt(OWN, { reason: 'final-deadline' }), 'final-deadline');
  assert.equal(policyAt('final-deadline', OWN).shouldReturn, true);
  assert.deepEqual(policyAt('late-progress-50', OWN), { studentVisible: true, assignToStudent: true, shouldReturn: true });
  // Never held: the due checkpoint (an attendance extension keeps the class's
  // due), a finished grade, an assessment the teacher released, a final.
  for (const stage of ['due-checkpoint', 'final-complete', 'assessment-release', 'final-deadline']) {
    assert.deepEqual(policyAt(stage, CLASS_FINAL + HOUR), { studentVisible: true, assignToStudent: true, shouldReturn: true }, stage);
  }
  // Before the due date nothing partial is returned anyway, and nothing is held.
  assert.deepEqual(policyAt('progress-50', CLASS_DUE - HOUR), { studentVisible: false, assignToStudent: false, shouldReturn: false });
});

test('NV02: only an own close later than the class\'s holds anything', () => {
  const policyAt = (stage, nowValue, cutoff) => runtime.classroomGradeReleasePolicy({ stage, assignment, nowValue, studentFinalCutoff: cutoff });
  const returned = { studentVisible: true, assignToStudent: true, shouldReturn: true };
  // An extension shorter than the class's close, or equal to it, moves nothing.
  const shorter = studentClassroomDeadlines({ assignment, studentId: 'S1', privateOverride: { lateDueAt: '2026-10-02T23:00:00.000Z' } }).finalAtMs;
  assert.deepEqual(policyAt('late-progress-50', CLASS_DUE + HOUR, shorter), returned);
  assert.deepEqual(policyAt('late-progress-50', CLASS_DUE + HOUR, CLASS_FINAL), returned);
  // No individual cutoff: exactly as before.
  assert.deepEqual(policyAt('late-progress-50', CLASS_DUE + HOUR, null), returned);
  assert.equal(runtime.extendedTimeReturnHeldUntil({ assignment, nowValue: CLASS_DUE + HOUR, studentFinalCutoff: null }), null);
  // Extra time alone: their final is never later than max(class final, their
  // own due), so there is no late window of their own to hold.
  const extraTime = studentClassroomDeadlines({ assignment, studentId: 'S2', studentProfile: extraTimeProfile(), privateOverride: null });
  assert.equal(extraTime.finalAtMs, extraTime.dueAtMs);
  assert.equal(runtime.resolveClassroomGradeStage({ assignment, progress, nowValue: extraTime.dueAtMs - 1, studentFinalCutoff: extraTime.finalAtMs, studentDueAt: extraTime.dueAtMs }), 'progress-50');
  // Extra time AND an attendance extension: after their own due, late progress
  // waits for the later of the two closes.
  const both = studentClassroomDeadlines({ assignment, studentId: 'S3', studentProfile: extraTimeProfile({ mode: 'hours', value: 24 }), privateOverride: { lateDueAt: '2026-10-08T23:00:00.000Z' } });
  assert.equal(both.dueAtMs, CLASS_DUE + 24 * HOUR);
  const afterOwnDue = both.dueAtMs + HOUR;
  const stage = runtime.resolveClassroomGradeStage({ assignment, progress, nowValue: afterOwnDue, studentFinalCutoff: both.finalAtMs, studentDueAt: both.dueAtMs });
  assert.equal(stage, 'late-progress-50');
  assert.equal(runtime.classroomGradeReleasePolicy({ stage, assignment, nowValue: afterOwnDue, studentDueAt: both.dueAtMs, studentFinalCutoff: both.finalAtMs }).heldUntilMs, Date.parse('2026-10-08T23:00:00.000Z'));
});

test('NV02: both triggers hold the return and record the student\'s own close for the scheduler', () => {
  const index = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const section = executableSource(readFileSync(new URL('../../functions/classroomSectionEntry.js', import.meta.url), 'utf8'));
  // index.js's own release policy holds by the lib's one rule.
  assert.match(index, /const \{ deferredClassCheckpoint, extendedTimeReturnHeldUntil \} = require\("\.\/lib\/classroomGradeRuntime"\);/);
  const releaseHelper = region(index, 'function classroomGradeReleasePolicy(', '\n}\n', 'index.js release policy');
  assert.match(releaseHelper, /extendedTimeReturnHeldUntil\(\{ assignment, nowValue: now, studentFinalCutoff \}\)/);
  assert.match(releaseHelper, /const studentVisible = explicitlyStudentVisible \|\| \(partialAfterDue && heldUntilMs === null\);/);
  // A held return is recorded as the student's own final wake-up, in both triggers.
  const sync = region(index, 'exports.syncGradeToClassroom = onDocumentWritten(', 'exports.queueReleasedAssessmentGrades', 'syncGradeToClassroom');
  assert.match(sync, /if \(releasePolicy\.heldUntilMs\) \{\s*await classroomStudentCheckpoints\.recordDeferredStudentCheckpoint\(\{\s*stateRef: db\.collection\(CLASSROOM_GRADE_CHECKPOINT_COLLECTION\)\.doc\(assignmentId\),\s*assignmentId,\s*studentId: event\.params\.studentId,\s*deferred: \{ kind: "final", atMs: releasePolicy\.heldUntilMs \},/);
  const sectionSync = region(section, 'const syncSectionGradeToClassroom = onDocumentWritten(', 'const queueClassroomSectionGradeCheckpoints', 'syncSectionGradeToClassroom');
  assert.match(sectionSync, /if \(releasePolicy\.heldUntilMs && !heldReturnRecorded\) \{\s*heldReturnRecorded = true;\s*await classroomStudentCheckpoints\.recordDeferredStudentCheckpoint\(\{\s*stateRef: db\.collection\(SECTION_CHECKPOINT_COLLECTION\)\.doc\(assignmentId\),\s*assignmentId,\s*studentId: event\.params\.studentId,\s*deferred: \{ kind: "final", atMs: releasePolicy\.heldUntilMs \},/);
  // The recorded close is woken like any other: the scheduler sends their final then.
  assert.deepEqual(arrivedStudentCheckpoints({ pendingFinal: { S1: '2026-10-08T23:00:00.000Z' }, nowMs: Date.parse('2026-10-08T23:00:00.000Z') }).final, ['S1']);
});

test('the scheduler wakes each recorded student at their own time; a final retires their pending due', () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z');
  const arrived = arrivedStudentCheckpoints({
    pendingDue: { S1: '2026-10-04T00:00:00.000Z', S2: '2026-10-09T00:00:00.000Z', S3: '2026-10-04T00:00:00.000Z' },
    pendingFinal: { S3: '2026-10-05T00:00:00.000Z', S4: '2026-10-09T00:00:00.000Z' },
    nowMs: now,
  });
  assert.deepEqual(arrived, { final: ['S3'], due: ['S1'], retiredDue: ['S1', 'S3'] });
  assert.deepEqual(arrivedStudentCheckpoints({ nowMs: now }), { final: [], due: [], retiredDue: [] });
});

test('recording and waking, against a fake state document', async () => {
  const writes = [];
  const stateRef = {
    set: async (data, options) => { writes.push(['set', data, options]); },
    update: async (...args) => { writes.push(['update', args]); },
  };
  assert.equal(await checkpoints.recordDeferredStudentCheckpoint({ stateRef, assignmentId: 'A1', studentId: 'S2', deferred: { kind: 'final', atMs: Date.parse('2026-10-04T23:00:00.000Z') } }), true);
  assert.deepEqual(writes.shift(), ['set', { assignmentId: 'A1', pendingStudentFinalAt: { S2: '2026-10-04T23:00:00.000Z' } }, { merge: true }]);
  assert.equal(await checkpoints.recordDeferredStudentCheckpoint({ stateRef, assignmentId: 'A1', studentId: 'S2', deferred: null }), false);
  assert.equal(writes.length, 0);

  const queued = [];
  const count = await checkpoints.wakeArrivedStudentCheckpoints({
    stateRef,
    state: { pendingStudentFinalAt: { S2: '2026-10-04T23:00:00.000Z', S9: '2026-12-01T00:00:00.000Z' }, pendingStudentDueAt: { S2: '2026-10-02T00:00:00.000Z' } },
    now: Date.parse('2026-10-05T00:00:00.000Z'),
    enqueue: async ({ studentIds, reason }) => { queued.push([reason, studentIds]); return studentIds.length; },
  });
  assert.equal(count, 1);
  assert.deepEqual(queued, [['final-deadline', ['S2']]], 'S2 gets their final; their stale due is not sent after it; S9 waits');
  const [kind, args] = writes.shift();
  assert.equal(kind, 'update');
  const removed = args.filter((_, index) => index % 2 === 0).map((fieldPath) => fieldPath.segments ?? fieldPath._segments ?? String(fieldPath));
  assert.deepEqual(removed.map((segments) => (Array.isArray(segments) ? segments.join('.') : segments)), ['pendingStudentFinalAt.S2', 'pendingStudentDueAt.S2']);
  // Nothing arrived: no queue, no write.
  assert.equal(await checkpoints.wakeArrivedStudentCheckpoints({ stateRef, state: {}, now: Date.now(), enqueue: async () => { throw new Error('must not queue'); } }), 0);
  assert.equal(writes.length, 0);
});

test('both Classroom paths record a deferred student and both schedulers wake them', () => {
  const index = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const section = executableSource(readFileSync(new URL('../../functions/classroomSectionEntry.js', import.meta.url), 'utf8'));

  const sync = region(index, 'exports.syncGradeToClassroom = onDocumentWritten(', 'exports.queueReleasedAssessmentGrades', 'syncGradeToClassroom');
  assert.match(sync, /const stageNow = Date\.now\(\);/);
  assert.match(sync, /resolveClassroomGradeStage\(\{[^}]*nowValue: stageNow,\s*studentFinalCutoff,\s*studentDueAt,\s*\}\)/);
  assert.match(sync, /deferredClassCheckpoint\(\{ assignment, releaseSignal, nowValue: stageNow, studentFinalCutoff, studentDueAt \}\)/);
  // The release policy reads the student's own due (a manual retry before it
  // is not returned) and their own final cutoff (NV02: nothing partial is
  // returned while their extended time runs).
  assert.match(sync, /classroomGradeReleasePolicy\(\{\s*stage,\s*assignment,\s*nowValue: stageNow,\s*studentDueAt,\s*studentFinalCutoff,\s*\}\)/);
  // index.js's own stage helper defers BOTH class-wide wake-ups, and its
  // release policy reads the student's own due — the same rules as the lib.
  const stageHelper = region(index, 'function resolveClassroomGradeStage(', 'if (progress.complete)', 'index.js stage helper');
  assert.match(stageHelper, /const dueAt = studentDueDate\(assignment, studentDueAt\);/);
  assert.match(stageHelper, /if \(reason === "due-checkpoint" && !\(dueAt && now < dueAt\.getTime\(\)\)\) return "due-checkpoint";/);
  const releaseHelper = region(index, 'function classroomGradeReleasePolicy(', 'const explicitlyStudentVisible', 'index.js release policy');
  assert.match(releaseHelper, /const dueAt = studentDueDate\(assignment, studentDueAt\);/);
  assert.match(sync, /recordDeferredStudentCheckpoint\(\{\s*stateRef: db\.collection\(CLASSROOM_GRADE_CHECKPOINT_COLLECTION\)\.doc\(assignmentId\),/);
  // index.js takes the deferral rule from the lib (beside NV02's hold rule).
  assert.match(index, /const \{[^}]*\bdeferredClassCheckpoint\b[^}]*\} = require\("\.\/lib\/classroomGradeRuntime"\);/);
  const scheduler = region(index, 'exports.queueClassroomGradeCheckpoints = onSchedule', 'let liveChallengeModule = null;', 'queueClassroomGradeCheckpoints');
  assert.match(scheduler, /classroomStudentCheckpoints\.wakeArrivedStudentCheckpoints\(\{\s*stateRef,\s*state,\s*now,/);

  const sectionSync = region(section, 'const syncSectionGradeToClassroom = onDocumentWritten(', 'const queueClassroomSectionGradeCheckpoints', 'syncSectionGradeToClassroom');
  assert.match(sectionSync, /studentClassroomDeadlinesFor\(\{\s*db, assignmentId, assignment, studentId: event\.params\.studentId, studentProfile: afterData\.profile \|\| null,/);
  assert.match(sectionSync, /resolveClassroomGradeStage\(\{[^}]*studentFinalCutoff: ownDeadlines\.studentFinalCutoff,\s*studentDueAt: ownDeadlines\.studentDueAt,\s*\}\)/);
  assert.match(sectionSync, /classroomGradeReleasePolicy\(\{\s*stage, assignment, nowValue: stageNow, studentDueAt: ownDeadlines\.studentDueAt, studentFinalCutoff: ownDeadlines\.studentFinalCutoff,\s*\}\)/);
  assert.match(sectionSync, /recordDeferredStudentCheckpoint\(\{\s*stateRef: db\.collection\(SECTION_CHECKPOINT_COLLECTION\)\.doc\(assignmentId\),/);
  const sectionScheduler = region(section, 'const queueClassroomSectionGradeCheckpoints', 'const drainClassroomPushQueue', 'section scheduler');
  assert.match(sectionScheduler, /classroomStudentCheckpoints\.wakeArrivedStudentCheckpoints\(\{\s*stateRef,\s*state,\s*now,/);
  assert.match(section, /const classroomStudentCheckpoints = require\("\.\/lib\/classroomStudentCheckpoints"\);/);
});
