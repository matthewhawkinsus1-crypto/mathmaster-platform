"use strict";

/*
 * WHAT ONE "RECONCILE SECTION GRADES" DID (issue #545, R1).
 *
 * A reconcile only queues: each student's push goes out later, a minute's
 * worth at a time (lib/classroomPushQueue.js), so the callable cannot say what
 * the run repaired. Each run now has an id. The id rides on the queue entry,
 * on the release signal the drain writes, and on the entry a push refused for
 * Google's limit is queued again with. When the section trigger answers a
 * signal that carries one, it writes that student's column counts to the run's
 * document: one write a student a pass. The teacher's monitor reads the
 * document (one read) and adds the students up.
 *
 * One document per assignment and teacher, replaced by that teacher's next
 * run. A student's counts are SET under the run's id, never added: a pass that
 * runs twice (Firestore delivers a trigger at least once), or again after a
 * quota requeue, writes the same student's whole picture again, so nothing is
 * counted twice, and a late write from a run that has been replaced lands
 * under its own id, which nobody reads. A column this run sent is stamped with
 * the run's id on its classroomGradeSyncs row, which is how a later pass still
 * knows it as repaired, not as already up to date.
 *
 * The counts are grade columns (one student in one Classroom column):
 *   repaired  - sent to Classroom by this run (returned or not);
 *   upToDate  - Classroom already held this grade, so nothing was sent;
 *   notSent   - nothing to send, on purpose: no work yet, a held Recovery, a
 *               post not released yet, a student not linked to the course;
 *   failed    - Google refused it, or the post cannot be graded;
 *   waiting   - refused for Google's per-minute limit and queued again.
 */

const crypto = require("crypto");
const { FieldPath, FieldValue } = require("firebase-admin/firestore");

const CLASSROOM_RECONCILE_RUNS = "classroomReconcileRuns";
const RECONCILE_REASON = "section-grade-reconcile";
const OUTCOMES = Object.freeze(["repaired", "upToDate", "notSent", "failed", "waiting"]);

const clean = (value) => String(value ?? "").trim();

function reconcileRunDocumentId(assignmentId, teacherUid) {
  return [assignmentId, teacherUid].map((part) => encodeURIComponent(clean(part))).join("__");
}

// A student's entry is keyed by a digest of the run and their id: the report
// needs one entry a student, not who they are, so the document names no
// student and student erasure has nothing to find in it.
function reconcileStudentKey(runId, studentId) {
  return crypto.createHash("sha256").update(`${clean(runId)}/${clean(studentId)}`).digest("hex").slice(0, 20);
}

function newReconcileRunId() {
  return crypto.randomUUID();
}

/**
 * The run a release signal belongs to and whose posts it may touch, or null
 * for every signal that is not a teacher's reconcile. `teacherUid` is the
 * caller: the run acts on that teacher's posts only.
 */
function reconcileScopeOfSignal(signal) {
  if (!signal || typeof signal !== "object" || clean(signal.reason) !== RECONCILE_REASON) return null;
  const teacherUid = clean(signal.scopeTeacherUid);
  if (!teacherUid) return null;
  return { teacherUid, runId: clean(signal.runId) || null };
}

/** Is this post one the scoped signal may act on? Unscoped: every post. */
function publicationInReconcileScope(scope, publication) {
  return !scope || clean(publication?.teacherUid) === scope.teacherUid;
}

function emptyOutcomeCounts() {
  return Object.fromEntries(OUTCOMES.map((name) => [name, 0]));
}

/** Counts one student's columns for one pass of the trigger. */
function reconcileTally() {
  const counts = emptyOutcomeCounts();
  return {
    counts,
    count(outcome) {
      if (!Object.hasOwn(counts, outcome)) throw new TypeError(`Unknown reconcile outcome: ${outcome}`);
      counts[outcome] += 1;
    },
  };
}

/** Starts the caller's run for this assignment, replacing their last one. */
async function startReconcileRun(db, { assignmentId, teacherUid, runId, queuedStudents, publications, requestedAt }) {
  await db.collection(CLASSROOM_RECONCILE_RUNS).doc(reconcileRunDocumentId(assignmentId, teacherUid)).set({
    schemaVersion: 1,
    runId,
    assignmentId: clean(assignmentId),
    teacherUid: clean(teacherUid),
    requestedAt,
    queuedStudents: Number(queuedStudents) || 0,
    publications: Number(publications) || 0,
    results: {},
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * One student's column counts for the run, replacing what an earlier pass
 * wrote for them. Never throws: the report must not fail a grade push. A run
 * whose document is gone (the assignment's posts were removed) is not written.
 */
async function recordReconcileStudent(db, { assignmentId, scope, studentId, counts, onError = () => {} }) {
  if (!scope?.runId) return false;
  try {
    await db.collection(CLASSROOM_RECONCILE_RUNS).doc(reconcileRunDocumentId(assignmentId, scope.teacherUid)).update(
      new FieldPath("results", scope.runId, reconcileStudentKey(scope.runId, studentId)),
      Object.fromEntries(OUTCOMES.map((name) => [name, Math.max(0, Number(counts?.[name]) || 0)])),
      "updatedAt",
      FieldValue.serverTimestamp()
    );
    return true;
  } catch (error) {
    if (error?.code !== 5 && !/no document to update|not[ _-]?found/i.test(String(error?.message || ""))) onError(error);
    return false;
  }
}

/** A run document as the monitor shows it: the students added up. */
function summarizeReconcileRun(run = {}) {
  const runId = clean(run.runId);
  const byStudent = (run.results && typeof run.results === "object" ? run.results[runId] : null) || {};
  const totals = emptyOutcomeCounts();
  Object.values(byStudent).forEach((counts) => {
    OUTCOMES.forEach((name) => { totals[name] += Math.max(0, Number(counts?.[name]) || 0); });
  });
  const queuedStudents = Math.max(0, Number(run.queuedStudents) || 0);
  const reportedStudents = Object.keys(byStudent).length;
  return {
    assignmentId: clean(run.assignmentId),
    runId,
    requestedAt: clean(run.requestedAt) || null,
    publications: Math.max(0, Number(run.publications) || 0),
    queuedStudents,
    reportedStudents,
    // Students whose push has not run yet (still in the paced queue).
    pendingStudents: Math.max(0, queuedStudents - reportedStudents),
    ...totals,
  };
}

/** The caller's runs, for the monitor. One read a run. */
async function readTeacherReconcileRuns(db, teacherUid, { limit = 200 } = {}) {
  const snapshot = await db.collection(CLASSROOM_RECONCILE_RUNS)
    .where("teacherUid", "==", clean(teacherUid))
    .limit(limit)
    .get();
  return {
    runs: snapshot.docs.map((doc) => summarizeReconcileRun(doc.data() || {})),
    complete: snapshot.size < limit,
  };
}

module.exports = {
  CLASSROOM_RECONCILE_RUNS,
  OUTCOMES,
  RECONCILE_REASON,
  newReconcileRunId,
  publicationInReconcileScope,
  readTeacherReconcileRuns,
  reconcileRunDocumentId,
  reconcileScopeOfSignal,
  reconcileStudentKey,
  reconcileTally,
  recordReconcileStudent,
  startReconcileRun,
  summarizeReconcileRun,
};
