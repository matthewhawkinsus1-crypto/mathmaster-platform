"use strict";

/*
 * GOOGLE CLASSROOM GRADE PUSHES, PACED.
 *
 * Google allows each teacher 600 Classroom API requests a minute (the project
 * 3,000). One grade push to one Classroom column is up to three of them: find
 * the student's submission, set the grade, return it. Anything that flagged a
 * whole class at once (a reconcile, a due or final checkpoint, "Retry all")
 * woke the two grade triggers for every student together. On Oct 14, 2026, 208
 * retries became about 2,000 requests in 70 seconds: 410 pushes were refused
 * for the limit and marked failed, and 8 grades reached Classroom.
 *
 * Bulk senders now write one entry per assignment, student and reason to
 * classroomPushQueue. Every minute drainClassroomPushQueue releases the oldest
 * entries that fit in two thirds of each teacher's minute (the rest is left for
 * students working right now) by writing the same classroomReleaseSignals the
 * triggers already answer, so nothing about what a push sends changes. A push
 * Google still refuses for the limit is queued again with a growing delay
 * instead of being marked failed.
 */

const { FieldPath, FieldValue, Timestamp } = require("firebase-admin/firestore");

const CLASSROOM_PUSH_QUEUE = "classroomPushQueue";
const CLASSROOM_PUSH_DRAIN_LEASE = "classroomPushQueueState/drain";

// Google: 600 requests a minute per teacher, 3,000 per project.
const TEACHER_REQUESTS_PER_DRAIN = 400;
const PROJECT_REQUESTS_PER_DRAIN = 2000;
// Find the submission, set the grade, return it.
const REQUESTS_PER_COLUMN = 3;
const MAX_ENTRIES_PER_DRAIN = 500;
const QUEUE_READ_LIMIT = 1000;
// 1, 2, 4, 8, 16, 30, 30, 30 minutes: about two hours before a push that is
// still refused for the limit is marked failed for the teacher to see.
const MAX_QUOTA_RETRIES = 8;
const LEGACY_TEACHER = "__legacy__";

const clean = (value) => String(value ?? "").trim();

function queueEntryId(assignmentId, studentId, reason) {
  return [assignmentId, studentId, reason].map((part) => encodeURIComponent(clean(part))).join("__");
}

function quotaBackoffMs(quotaRetry) {
  return Math.min(60_000 * 2 ** Math.max(0, Number(quotaRetry) || 0), 30 * 60_000);
}

/**
 * Queues one push per student. A later request for the same assignment,
 * student and reason replaces the waiting one, so a class flagged twice is
 * sent once.
 */
async function enqueueClassroomPushes(db, {
  assignmentId,
  studentIds,
  reason,
  requestedAt = new Date().toISOString(),
  source = null,
  nowMs = Date.now(),
}) {
  const assignment = clean(assignmentId);
  const why = clean(reason);
  const students = [...new Set((studentIds || []).map(clean).filter(Boolean))];
  if (!assignment || !why || !students.length) return 0;
  for (let start = 0; start < students.length; start += 400) {
    const batch = db.batch();
    students.slice(start, start + 400).forEach((studentId) => {
      batch.set(db.collection(CLASSROOM_PUSH_QUEUE).doc(queueEntryId(assignment, studentId, why)), {
        assignmentId: assignment,
        studentId,
        reason: why,
        requestedAt,
        source,
        quotaRetry: 0,
        notBefore: Timestamp.fromMillis(nowMs),
        queuedAt: FieldValue.serverTimestamp(),
      });
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return students.length;
}

/**
 * After Google refused a push for the per-minute limit. Keeps the reason, so
 * the push resolves the same Classroom stage, and counts the retry, which
 * stops a forced retry from re-sending columns that already went through.
 * An entry already waiting for the same push is left alone: it sends every
 * column this one could not.
 */
async function requeueClassroomPushAfterQuota(db, {
  assignmentId,
  studentId,
  reason,
  quotaRetry = 0,
  nowMs = Date.now(),
}) {
  const attempt = Math.max(0, Number(quotaRetry) || 0);
  if (attempt >= MAX_QUOTA_RETRIES) return { requeued: false };
  const why = clean(reason) || "quota-retry";
  const retryAtMs = nowMs + quotaBackoffMs(attempt);
  try {
    await db.collection(CLASSROOM_PUSH_QUEUE).doc(queueEntryId(assignmentId, studentId, why)).create({
      assignmentId: clean(assignmentId),
      studentId: clean(studentId),
      reason: why,
      requestedAt: new Date(nowMs).toISOString(),
      source: "classroom-quota",
      quotaRetry: attempt + 1,
      notBefore: Timestamp.fromMillis(retryAtMs),
      queuedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (error?.code !== 6 && !/already exists/i.test(String(error?.message || ""))) throw error;
  }
  return { requeued: true, retryAt: new Date(retryAtMs).toISOString() };
}

/**
 * Classroom requests one student's push for this assignment can cost each
 * teacher: every column either grade trigger sends to, times three.
 */
function classroomRequestsPerStudent(publications = []) {
  const byTeacher = new Map();
  for (const publication of publications) {
    if (publication?.status !== "published" || !publication.courseworkId) continue;
    let columns = 0;
    // syncGradeToClassroom
    if (publication.gradePassbackEnabled !== false) columns += 1;
    // syncSectionGradeToClassroom
    if (publication.publicationKind === "section" && publication.sectionGradePassbackEnabled !== false) columns += 1;
    if (!columns) continue;
    const teacher = clean(publication.teacherUid) || LEGACY_TEACHER;
    byTeacher.set(teacher, (byTeacher.get(teacher) || 0) + columns * REQUESTS_PER_COLUMN);
  }
  return byTeacher;
}

/**
 * Which of the due entries (oldest first) go out this minute. A teacher's
 * first entry always goes, however many columns it has, so one wide
 * assignment cannot wait forever; one entry per assignment and student a run,
 * so two reasons for the same student are never collapsed into one write.
 */
function planClassroomPushDrain(entries, costByAssignment, {
  teacherBudget = TEACHER_REQUESTS_PER_DRAIN,
  projectBudget = PROJECT_REQUESTS_PER_DRAIN,
  maxEntries = MAX_ENTRIES_PER_DRAIN,
} = {}) {
  const used = new Map();
  let projectUsed = 0;
  const release = [];
  const releasedPushes = new Set();
  for (const entry of entries) {
    if (release.length >= maxEntries) break;
    const push = `${entry.assignmentId}/${entry.studentId}`;
    if (releasedPushes.has(push)) continue;
    const costs = costByAssignment.get(entry.assignmentId) || new Map();
    let total = 0;
    let fits = true;
    costs.forEach((cost, teacher) => {
      total += cost;
      const spent = used.get(teacher) || 0;
      if (spent > 0 && spent + cost > teacherBudget) fits = false;
    });
    if (projectUsed > 0 && projectUsed + total > projectBudget) fits = false;
    if (!fits) continue;
    costs.forEach((cost, teacher) => used.set(teacher, (used.get(teacher) || 0) + cost));
    projectUsed += total;
    releasedPushes.add(push);
    release.push(entry);
  }
  return { release, held: entries.length - release.length, requestsByTeacher: used, projectRequests: projectUsed };
}

function releaseSignalFor(entry, releasedAt) {
  // requestedAt is the release time, so the signal always differs from the
  // last one and the triggers run. Only `reason` decides what they send.
  const signal = {
    requestedAt: releasedAt,
    reason: entry.reason,
    source: "classroom-push-queue",
    firstRequestedAt: entry.requestedAt || null,
  };
  if (Number(entry.quotaRetry) > 0) signal.quotaRetry = Number(entry.quotaRetry);
  return signal;
}

// Scheduler runs can overlap if one is slow; the second one then does nothing.
async function acquireDrainLease(db, nowMs, leaseMs = 55_000) {
  const ref = db.doc(CLASSROOM_PUSH_DRAIN_LEASE);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const leaseUntil = snapshot.exists ? snapshot.data()?.leaseUntil?.toMillis?.() || 0 : 0;
    if (leaseUntil > nowMs) return false;
    transaction.set(ref, { leaseUntil: Timestamp.fromMillis(nowMs + leaseMs) }, { merge: true });
    return true;
  });
}

async function drainClassroomPushQueue(db, { nowMs = Date.now() } = {}) {
  const empty = { due: 0, released: 0, held: 0, missingGradeRecords: 0, requestsByTeacher: {} };
  const snapshot = await db.collection(CLASSROOM_PUSH_QUEUE)
    .where("notBefore", "<=", Timestamp.fromMillis(nowMs))
    .orderBy("notBefore")
    .limit(QUEUE_READ_LIMIT)
    .get();
  if (snapshot.empty) return empty;
  if (!(await acquireDrainLease(db, nowMs))) return { ...empty, due: snapshot.size, skipped: "another run holds the lease" };

  const entries = snapshot.docs.map((doc) => ({ ref: doc.ref, ...doc.data() }));
  const costByAssignment = new Map();
  for (const assignmentId of new Set(entries.map((entry) => entry.assignmentId))) {
    // eslint-disable-next-line no-await-in-loop
    const publications = await db.collection("classroomLinks")
      .where("assignmentId", "==", assignmentId)
      .select("status", "courseworkId", "publicationKind", "gradePassbackEnabled", "sectionGradePassbackEnabled", "teacherUid")
      .get();
    costByAssignment.set(assignmentId, classroomRequestsPerStudent(publications.docs.map((doc) => doc.data() || {})));
  }
  const plan = planClassroomPushDrain(entries, costByAssignment);

  const gradeSnapshots = plan.release.length
    ? await db.getAll(...plan.release.map((entry) => db.doc(`grades/${entry.studentId}`)), { fieldMask: [] })
    : [];
  const releasedAt = new Date(nowMs).toISOString();
  let missingGradeRecords = 0;
  // An update and a delete per entry stays under the 500-write batch limit.
  for (let start = 0; start < plan.release.length; start += 200) {
    const batch = db.batch();
    plan.release.slice(start, start + 200).forEach((entry, offset) => {
      const gradeSnapshot = gradeSnapshots[start + offset];
      if (gradeSnapshot?.exists) {
        batch.update(gradeSnapshot.ref, new FieldPath("classroomReleaseSignals", entry.assignmentId), releaseSignalFor(entry, releasedAt));
      } else {
        missingGradeRecords += 1;
      }
      batch.delete(entry.ref);
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return {
    due: entries.length,
    released: plan.release.length - missingGradeRecords,
    held: plan.held,
    missingGradeRecords,
    requestsByTeacher: Object.fromEntries(plan.requestsByTeacher),
  };
}

/** Waiting entries per assignment, for the teacher's grade passback monitor. */
async function waitingClassroomPushes(db, { limit = QUEUE_READ_LIMIT } = {}) {
  const snapshot = await db.collection(CLASSROOM_PUSH_QUEUE)
    .select("assignmentId", "studentId", "notBefore", "quotaRetry")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      assignmentId: clean(data.assignmentId),
      studentId: clean(data.studentId),
      notBefore: data.notBefore?.toDate?.()?.toISOString?.() || null,
      quotaRetry: Number(data.quotaRetry) || 0,
    };
  });
}

module.exports = {
  CLASSROOM_PUSH_QUEUE,
  MAX_QUOTA_RETRIES,
  PROJECT_REQUESTS_PER_DRAIN,
  REQUESTS_PER_COLUMN,
  TEACHER_REQUESTS_PER_DRAIN,
  classroomRequestsPerStudent,
  drainClassroomPushQueue,
  enqueueClassroomPushes,
  planClassroomPushDrain,
  queueEntryId,
  quotaBackoffMs,
  releaseSignalFor,
  requeueClassroomPushAfterQuota,
  waitingClassroomPushes,
};
