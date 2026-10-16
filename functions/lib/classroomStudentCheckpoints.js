"use strict";

/*
 * ONE STUDENT'S OWN CLASSROOM DUE AND FINAL TIME, FOR BOTH PASSBACK PATHS (H-116).
 *
 * The whole-assignment trigger (functions/index.js syncGradeToClassroom) and
 * the split-section trigger (functions/classroomSectionEntry.js) both turn a
 * class-wide "due-checkpoint" / "final-deadline" wake-up into a returned
 * grade. Both now ask this module for the student's own due time and final
 * cutoff — their private extension and their extra-time dates — so a student
 * whose own deadline is later is not returned a "final" grade while MathMaster
 * is still accepting their work. The rules themselves are pure, in
 * functions/shared/classroomStudentDeadlines.mjs.
 *
 * Both schedulers wake the whole roster at the class's time (unchanged). A
 * trigger that sets that wake-up aside for a student whose own time is later
 * records it on the scheduler's state document for the assignment
 * (`pendingStudentDueAt` / `pendingStudentFinalAt`, `{ studentId: ISO }`) —
 * the trigger holds the full assignment and grade document, so exactly the
 * students it deferred are recorded — and the scheduler wakes each one at
 * their own time on a later run.
 */

const { FieldPath, FieldValue } = require("firebase-admin/firestore");

const PENDING_FIELD = Object.freeze({ due: "pendingStudentDueAt", final: "pendingStudentFinalAt" });

let deadlinesModule = null;
async function deadlines() {
  if (!deadlinesModule) deadlinesModule = await import("../shared/classroomStudentDeadlines.mjs");
  return deadlinesModule;
}
let overridesModule = null;
async function overrides() {
  if (!overridesModule) overridesModule = await import("../shared/studentAssignmentOverrides.mjs");
  return overridesModule;
}

const privateOverrideOf = (snapshot) => (snapshot?.exists ? snapshot.data() || null : null);

async function overrideRefFor(db, studentId, assignmentId) {
  const module = await overrides();
  const id = module.studentAssignmentOverrideId(studentId, assignmentId);
  return id ? db.collection(module.STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).doc(id) : null;
}

/**
 * One student's individual due time and final cutoff (ms), each null when it
 * is not individual. `studentProfile` is the pinned profile from the grade
 * document the trigger already holds.
 */
async function studentClassroomDeadlinesFor({ db, assignmentId, assignment, studentId, studentProfile = null }) {
  if (!studentId) return { studentDueAt: null, studentFinalCutoff: null };
  const ref = await overrideRefFor(db, studentId, assignmentId);
  const snapshot = ref ? await ref.get() : null;
  const own = (await deadlines()).studentClassroomDeadlines({
    assignment,
    studentId,
    studentProfile,
    privateOverride: privateOverrideOf(snapshot),
  });
  return { studentDueAt: own.dueAtMs, studentFinalCutoff: own.finalAtMs };
}

/**
 * Record that a class-wide wake-up was set aside for this student until their
 * own time (deferredClassCheckpoint), on the scheduler's state document for
 * the assignment. Idempotent; a later deferral (their deadline moved again)
 * replaces the time.
 */
async function recordDeferredStudentCheckpoint({ stateRef, assignmentId, studentId, deferred }) {
  const field = deferred ? PENDING_FIELD[deferred.kind] : null;
  if (!stateRef || !field || !studentId || !Number.isFinite(deferred.atMs)) return false;
  await stateRef.set({
    assignmentId,
    [field]: { [String(studentId)]: new Date(deferred.atMs).toISOString() },
  }, { merge: true });
  return true;
}

/**
 * Wake the students whose own recorded time has arrived, and retire their
 * entries. `enqueue({ studentIds, reason })` is the scheduler's own queueing
 * (classroomPushQueue); returns how many it queued.
 */
async function wakeArrivedStudentCheckpoints({ stateRef, state = {}, now = Date.now(), enqueue }) {
  const { arrivedStudentCheckpoints } = await deadlines();
  const arrived = arrivedStudentCheckpoints({
    pendingDue: state?.[PENDING_FIELD.due],
    pendingFinal: state?.[PENDING_FIELD.final],
    nowMs: now,
  });
  if (!arrived.final.length && !arrived.due.length) return 0;
  let queued = 0;
  if (arrived.final.length) queued += Number(await enqueue({ studentIds: arrived.final, reason: "final-deadline" })) || 0;
  if (arrived.due.length) queued += Number(await enqueue({ studentIds: arrived.due, reason: "due-checkpoint" })) || 0;
  const removals = [
    ...arrived.final.map((studentId) => [new FieldPath(PENDING_FIELD.final, studentId), FieldValue.delete()]),
    ...arrived.retiredDue.map((studentId) => [new FieldPath(PENDING_FIELD.due, studentId), FieldValue.delete()]),
  ].flat();
  await stateRef.update(...removals);
  return queued;
}

module.exports = {
  PENDING_FIELD,
  recordDeferredStudentCheckpoint,
  studentClassroomDeadlinesFor,
  wakeArrivedStudentCheckpoints,
};
