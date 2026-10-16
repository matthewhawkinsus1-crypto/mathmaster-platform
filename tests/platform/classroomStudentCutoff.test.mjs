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
  // The release policy reads the student's own due (a manual retry before it is not returned).
  assert.match(sync, /classroomGradeReleasePolicy\(\{\s*stage,\s*assignment,\s*nowValue: stageNow,\s*studentDueAt,\s*\}\)/);
  // index.js's own stage helper defers BOTH class-wide wake-ups, and its
  // release policy reads the student's own due — the same rules as the lib.
  const stageHelper = region(index, 'function resolveClassroomGradeStage(', 'if (progress.complete)', 'index.js stage helper');
  assert.match(stageHelper, /const dueAt = studentDueDate\(assignment, studentDueAt\);/);
  assert.match(stageHelper, /if \(reason === "due-checkpoint" && !\(dueAt && now < dueAt\.getTime\(\)\)\) return "due-checkpoint";/);
  const releaseHelper = region(index, 'function classroomGradeReleasePolicy(', 'const explicitlyStudentVisible', 'index.js release policy');
  assert.match(releaseHelper, /const dueAt = studentDueDate\(assignment, studentDueAt\);/);
  assert.match(sync, /recordDeferredStudentCheckpoint\(\{\s*stateRef: db\.collection\(CLASSROOM_GRADE_CHECKPOINT_COLLECTION\)\.doc\(assignmentId\),/);
  assert.match(index, /const \{ deferredClassCheckpoint \} = require\("\.\/lib\/classroomGradeRuntime"\);/);
  const scheduler = region(index, 'exports.queueClassroomGradeCheckpoints = onSchedule', 'let liveChallengeModule = null;', 'queueClassroomGradeCheckpoints');
  assert.match(scheduler, /classroomStudentCheckpoints\.wakeArrivedStudentCheckpoints\(\{\s*stateRef,\s*state,\s*now,/);

  const sectionSync = region(section, 'const syncSectionGradeToClassroom = onDocumentWritten(', 'const queueClassroomSectionGradeCheckpoints', 'syncSectionGradeToClassroom');
  assert.match(sectionSync, /studentClassroomDeadlinesFor\(\{\s*db, assignmentId, assignment, studentId: event\.params\.studentId, studentProfile: afterData\.profile \|\| null,/);
  assert.match(sectionSync, /resolveClassroomGradeStage\(\{[^}]*studentFinalCutoff: ownDeadlines\.studentFinalCutoff,\s*studentDueAt: ownDeadlines\.studentDueAt,\s*\}\)/);
  assert.match(sectionSync, /classroomGradeReleasePolicy\(\{ stage, assignment, nowValue: stageNow, studentDueAt: ownDeadlines\.studentDueAt \}\)/);
  assert.match(sectionSync, /recordDeferredStudentCheckpoint\(\{\s*stateRef: db\.collection\(SECTION_CHECKPOINT_COLLECTION\)\.doc\(assignmentId\),/);
  const sectionScheduler = region(section, 'const queueClassroomSectionGradeCheckpoints', 'const drainClassroomPushQueue', 'section scheduler');
  assert.match(sectionScheduler, /classroomStudentCheckpoints\.wakeArrivedStudentCheckpoints\(\{\s*stateRef,\s*state,\s*now,/);
  assert.match(section, /const classroomStudentCheckpoints = require\("\.\/lib\/classroomStudentCheckpoints"\);/);
});
