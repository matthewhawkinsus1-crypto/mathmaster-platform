let liveChallengeClassPointsModule = null;
async function liveChallengeClassPoints() {
  if (!liveChallengeClassPointsModule) {
    liveChallengeClassPointsModule = await import("./shared/liveChallengeClassPoints.mjs");
  }
  return liveChallengeClassPointsModule;
}

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");

let classroomLibModule = null;
function classroomLib() {
  if (!classroomLibModule) classroomLibModule = require("./lib/classroom");
  return classroomLibModule;
}

let driveResourcesModule = null;
function driveResources() {
  if (!driveResourcesModule) driveResourcesModule = require("./lib/driveResources");
  return driveResourcesModule;
}

const { runtimeIncludedQuestionIndices, runtimeIncludedQuestionIndicesForSection, runtimeQuestionsFromAssignment } = require("./lib/assignmentRuntime");
const { weightedQuestionTotals } = require("./lib/questionWeights");
const challengeSampling = require("./lib/challengeSampling");
const { encryptLaunchPayload, decryptLaunchToken } = require("./lib/linkToken");
const {
  GOOGLE_API_SECRETS,
  GOOGLE_AND_LINK_SECRETS,
  LINK_ENCRYPTION_KEY,
  ASSIGNMENT_AI_SECRETS,
  readOpenAiApiKey,
  readPublicEnv,
  readStudentAppBaseUrl,
  CANONICAL_STUDENT_APP_BASE_URL,
  readGoogleClientId,
  readGoogleClientSecret,
  readLinkEncryptionKey,
} = require("./lib/config");
const {
  publicationDocumentId,
  rosterLinkDocumentId,
  gradeSyncDocumentId,
  publicationMarker,
} = require("./lib/publication");
const authLib = require("./lib/auth");
const liveSpotlight = require("./lib/liveSpotlight");
const {
  assignmentUsesTeacherReleasePolicy,
  assignmentFeedbackWasReleased,
  assignmentFeedbackIsHeld,
} = require("./lib/activityFeedback");
const mathPath = require("./lib/mathPath");
const { compilePathRecordForStorage } = require("./lib/pathFirestoreShape");
const labEvaluation = require("./lib/labEvaluation");
const secureExam = require("./lib/secureExam");
// The Test Cycle rules are shared ESM; this is the CommonJS bridge to them.
const testCycleLib = require("./lib/testCycle");
const adminPolicy = require("./lib/admin");
const rigorPolicy = require("./lib/rigorPolicy");
// Adaptive routing for live sessions. The DECISIONS come from the one shared
// engine in functions/shared/pathSessionRouting.mjs; this seam supplies the
// server-side facts (mastery documents, coverage indexes) it reasons over.
const pathRouting = require("./lib/pathRouting");
const pathContentRelease = require("./lib/pathContentRelease");
const assignmentAi = require("./lib/assignmentAi");
const weeklyPathSync = require("./lib/weeklyPathSync");
const ccmrAssignmentBank = require("./lib/ccmrAssignmentBank");
const studentSessionSummary = require("./lib/studentSessionSummary");
const fullAssignmentRepair = require("./lib/fullAssignmentRepair");
const assignmentContentVersion = require("./lib/assignmentContentVersion");
const assignmentContentTrackerMigration = require("./lib/assignmentContentTrackerMigration");
const teacherQuestionRepair = require("./lib/teacherQuestionRepair");

// HTTPS/callable transport must be reachable by the Firebase client SDK.
// MathMaster authorization still happens INSIDE each callable through
// requireStudent/requireTeacher/requireRootAdmin. Source-controlling this
// prevents a redeploy from silently returning a Cloud Run service to
// "Require authentication" before Firebase Auth can be inspected.
setGlobalOptions({ invoker: "public" });

initializeApp();

const MAX_CLASSROOM_COURSES_PER_BATCH = 20;
const PUBLISH_LEASE_MS = 5 * 60 * 1000;

function requirePublicEnv(name) {
  const value = readPublicEnv(name);
  if (!value) throw new HttpsError("failed-precondition", `${name} is not configured.`);
  return value;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializableDate(value) {
  const date = toDate(value);
  return date ? date.toISOString() : value || null;
}

function cleanMaterials(materials) {
  if (!Array.isArray(materials)) return [];
  const cleaned = [];
  for (const item of materials) {
    if (!item) continue;
    const title = String(item.title || "Resource").trim().slice(0, 500);
    const driveFileId = String(item.driveFileId || "").trim();
    if (driveFileId) {
      cleaned.push({
        title: title || "Google Drive resource",
        driveFileId,
        shareMode: "VIEW",
      });
      continue;
    }
    const url = String(item.url || "").trim();
    if (title && /^https?:\/\//i.test(url)) {
      cleaned.push({ title, url });
    }
  }
  return cleaned.slice(0, 20);
}

function preferDriveNotesMaterial(materials, assignment) {
  const cleaned = cleanMaterials(materials);
  const notes = assignment?.lessonResources?.notesPdf || {};
  const driveAsset = notes.driveAsset;
  const driveReady = notes.driveStatus?.status === "ready";
  if (!driveReady || !driveAsset?.driveFileId) return cleaned;

  const storageUrl = String(notes.asset?.url || "");
  const withoutStorageDuplicate = cleaned.filter((item) => (
    item.driveFileId || !storageUrl || item.url !== storageUrl
  ));
  const driveMaterial = {
    title: String(driveAsset.title || notes.title || "Student Notes").trim(),
    driveFileId: String(driveAsset.driveFileId),
    shareMode: "VIEW",
  };
  return cleanMaterials([driveMaterial, ...withoutStorageDuplicate]);
}

function safePdfFileName(value, fallback = "MathMaster_Student_Notes.pdf") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  const base = cleaned || fallback;
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

const assignmentAudience = (assignment = {}) => ({
  classIds: [...new Set((Array.isArray(assignment.assignedClassIds) ? assignment.assignedClassIds : [])
    .map(String).map((value) => value.trim()).filter(Boolean))],
});

/*
 * DEADLINE AUTO-SUBMIT.
 *
 * A response the student finished before the deadline is submitted when that
 * deadline closes, whether or not the assignment page is still open. The
 * checkpoint the browser wrote is a DRAFT: it carries the student's raw work
 * and nothing that decides a grade. Everything authoritative is re-derived
 * here from the assignment, the roster and the class schedule, and the
 * response is GRADED ON THE SERVER through the same contract a manual Submit
 * uses.
 *
 * Checkpoints leave the active query the moment they are decided, so retries
 * stay bounded and history is never re-scanned. Nothing here writes to a
 * Classroom API: only the canonical grades document changes, and the existing
 * grades trigger remains the single Classroom passback wake-up path.
 */
let responseCheckpointFinalizerModule = null;
async function responseCheckpointFinalizer() {
  if (!responseCheckpointFinalizerModule) {
    responseCheckpointFinalizerModule = await import("./shared/responseCheckpointFinalizer.mjs");
  }
  return responseCheckpointFinalizerModule;
}

const CHECKPOINT_COLLECTION = "studentResponseCheckpoints";
const RESPONSE_INSPECTION_EVIDENCE_COLLECTION = "responseInspectionEvidence";
// The one status in the finalizer's working set. Named here so the recovery
// sweep and the scheduler cannot drift apart on what "outstanding" means.
const CHECKPOINT_STATUS_ACTIVE = "active";
const CHECKPOINT_BATCH_LIMIT = 200;
// How long a checkpoint with no provable close waits before being re-examined.
const CHECKPOINT_HOLD_BACKOFF_MS = 60 * 60 * 1000;

const secureAssignmentMode = (assignment = {}) => (
  String(assignment?.assessmentPolicy?.mode || "") === "testCycle"
);

/**
 * The class period is schedule metadata, and the Warm-Up/DOL windows are
 * defined against it. Read it from the authoritative class record, falling
 * back to the roster row.
 */
async function resolveCheckpointClassPeriod(db, classId, gradeData, cache) {
  const key = String(classId || "");
  if (!key) return String(gradeData?.classPeriod || "") || null;
  if (cache.has(key)) return cache.get(key) || String(gradeData?.classPeriod || "") || null;
  let period = null;
  try {
    const classSnapshot = await db.collection("classes").doc(key).get();
    period = classSnapshot.exists ? String(classSnapshot.data()?.period || "") || null : null;
  } catch (error) {
    logger.warn("Could not read class record for checkpoint finalization", { classId: key, message: error.message });
  }
  cache.set(key, period);
  return period || String(gradeData?.classPeriod || "") || null;
}

async function finalizeOneResponseCheckpoint({ db, ref, schedule, classPeriodCache, now }) {
  const {
    decideCheckpointFinalization,
    buildCheckpointFinalization,
  } = await responseCheckpointFinalizer();

  // The student's class is needed to resolve the class period the Warm-Up/DOL
  // window is defined against. Read it before the transaction so the
  // transaction body performs only transactional reads.
  const preread = await ref.get();
  if (!preread.exists) return "missing";
  const studentId = String(preread.data()?.studentId || "");
  if (!studentId) return "invalid";
  const gradePreread = await db.collection("grades").doc(studentId).get();
  const classPeriod = await resolveCheckpointClassPeriod(
    db,
    gradePreread.exists ? gradePreread.data()?.classId : null,
    gradePreread.exists ? gradePreread.data() : null,
    classPeriodCache,
  );

  return db.runTransaction(async (transaction) => {
    const checkpointSnapshot = await transaction.get(ref);
    if (!checkpointSnapshot.exists) return "missing";
    const checkpoint = { ...checkpointSnapshot.data(), documentId: checkpointSnapshot.id };
    const gradeRef = db.collection("grades").doc(String(checkpoint.studentId || studentId));
    const assignmentRef = db.collection("assignments").doc(String(checkpoint.assignmentId || "missing"));
    const [assignmentSnapshot, gradeSnapshot] = await Promise.all([
      transaction.get(assignmentRef),
      transaction.get(gradeRef),
    ]);

    const retire = (status, reason, extra = {}) => {
      transaction.update(ref, {
        status,
        candidateFinalizeAt: null,
        finalizationReceipt: {
          checkpointRevision: Number(checkpoint.revision) || 0,
          finalizedAt: FieldValue.serverTimestamp(),
          origin: "deadline-auto-submit",
          reason: reason || null,
          status,
          ...extra,
        },
      });
      return status;
    };

    if (!assignmentSnapshot.exists || !gradeSnapshot.exists) {
      return retire("invalid-context", assignmentSnapshot.exists ? "missing-grade-record" : "missing-assignment");
    }

    const assignment = { id: assignmentSnapshot.id, ...assignmentSnapshot.data() };
    const gradeData = gradeSnapshot.data() || {};
    const question = runtimeQuestionsFromAssignment(assignment)?.[Number(checkpoint.questionIndex)] || null;

    const decision = decideCheckpointFinalization({
      checkpoint,
      assignment,
      gradeDocument: gradeData,
      gradeDocumentId: gradeSnapshot.id,
      question,
      schedule,
      classPeriod,
      isSecureAssignment: secureAssignmentMode(assignment),
      now,
    });

    if (decision.action === "skip") return "skipped";
    if (decision.action === "hold") {
      // MathMaster cannot currently prove a close — a teacher cleared the due
      // date, say. Holding is right, but a held checkpoint whose query time is
      // already past would be re-examined every minute forever, so it is
      // pushed out of the due window and looked at again later.
      transaction.update(ref, {
        candidateFinalizeAt: new Date(now + CHECKPOINT_HOLD_BACKOFF_MS),
        heldReason: decision.reason || null,
        heldAt: FieldValue.serverTimestamp(),
      });
      return "held";
    }
    if (decision.action === "reschedule") {
      // A teacher extension or reopen moved the real close later. The client's
      // hint is replaced by the server-derived time; it never shortens it.
      transaction.update(ref, {
        candidateFinalizeAt: new Date(decision.finalizeAt),
        rescheduledAt: FieldValue.serverTimestamp(),
        rescheduleReason: decision.reason || null,
      });
      return "rescheduled";
    }
    if (decision.action === "close") {
      return retire(decision.status, decision.reason, {
        cutoff: decision.cutoff ? new Date(decision.cutoff) : null,
        resultingSubmissionId: decision.submissionId || null,
      });
    }

    // The projections an attempt updates besides its own record. The runtime
    // question list is this side's projection of which questions are classwork
    // and which are DOL; the RULE that turns them into a completion score is
    // shared with the browser.
    const { dolSectionProjection } = await responseCheckpointFinalizer();
    const classworkIndices = runtimeIncludedQuestionIndicesForSection(assignment, "classwork");
    const dolIndices = runtimeIncludedQuestionIndicesForSection(assignment, "dol");
    const assignmentId = String(checkpoint.assignmentId);
    const authoritativeOverrides =
      gradeData?.teacherGradeOverridesByAssignment?.[assignmentId] || {};
    const finalization = buildCheckpointFinalization({
      checkpoint, assignment, question, decision,
      gradeDocument: gradeData, classworkIndices, dolIndices,
      // `now` is the scheduler's clock, not the academic time. The academic
      // time is derived from the server-trusted acknowledgement and the
      // authoritative close, so a Friday deadline finalized on Monday is still
      // recorded as Friday's work.
      runAt: now,
    });
    if (decision.activityRole === "dol" && dolIndices.length) {
      // Scored from the tracker that already carries this attempt, through the
      // same weighting the rest of the platform uses.
      const totals = weightedQuestionTotals({
        tracker: finalization.assignmentTracker,
        questions: runtimeQuestionsFromAssignment(assignment),
        indices: dolIndices,
        creditForRecord: (candidate, index) => getQuestionCredit(
          candidate,
          authoritativeOverrides?.[String(index)] ?? authoritativeOverrides?.[index] ?? null,
        ),
      });
      finalization.dolGrade = dolSectionProjection({
        existing: gradeData?.dolGradesByAssignment?.[assignmentId] || null,
        dateKey: finalization.dolDateKey,
        score: totals.score ?? 0,
        questionIndices: dolIndices,
        recordedAt: new Date(finalization.academicAt).toISOString(),
        // The authoritative DOL window is already over. This transaction owns
        // the final projection even when no browser is mounted, and it may
        // correct a browser-finalized score that omitted this valid pre-cutoff
        // checkpoint without reopening the DOL.
        finalize: true,
        correctionReason: "deadline-auto-submit",
      });
    }

    const gradeUpdates = [
      new FieldPath("gradesByAssignment", assignmentId, String(checkpoint.questionIndex)),
      finalization.record,
      new FieldPath("supportUsageByAssignment", assignmentId),
      finalization.supportUsage,
    ];
    if (finalization.classworkGrade) {
      // Without this a student's final classwork response could be recorded and
      // still leave them locked out of the dependent assignment.
      gradeUpdates.push(new FieldPath("classworkGradesByAssignment", assignmentId), finalization.classworkGrade);
    }
    if (finalization.dolGrade) {
      gradeUpdates.push(
        new FieldPath("dolGradesByAssignment", assignmentId, finalization.dolDateKey),
        finalization.dolGrade,
      );
    }
    transaction.update(gradeRef, ...gradeUpdates);
    if (finalization.gradingEvidence && finalization.gradingEvidenceDocumentId) {
      transaction.set(
        gradeRef.collection(RESPONSE_INSPECTION_EVIDENCE_COLLECTION)
          .doc(String(finalization.gradingEvidenceDocumentId)),
        {
          schemaVersion: Number(finalization.gradingEvidence.schemaVersion) || 1,
          assignmentId,
          questionIndex: Number(checkpoint.questionIndex),
          questionId: question?.questionId || question?.id || null,
          submissionId: String(finalization.record.lastSubmissionId || ""),
          variantIndex: Number(finalization.record.variantIndex ?? 0),
          totalAttempts: Number(
            finalization.record.totalAttempts ?? finalization.record.attemptCount ?? 0
          ),
          evidence: finalization.gradingEvidence,
          academicOccurredAt: new Date(finalization.academicAt),
          writtenAt: FieldValue.serverTimestamp(),
          source: "deadline-auto-submit",
        },
      );
    }
    if (finalization.evidenceEvent?.eventKey) {
      // The event key is deterministic for this exact attempt, so a retry after
      // a partial failure repeats the same write rather than appending a second
      // evidence record.
      transaction.set(
        gradeRef.collection("evidenceEvents").doc(String(finalization.evidenceEvent.eventKey)),
        finalization.evidenceEvent,
      );
    }
    retire(decision.status, decision.reason, {
      cutoff: decision.cutoff ? new Date(decision.cutoff) : null,
      resultingSubmissionId: decision.submissionId,
      isCorrect: Boolean(finalization.result.isCorrect),
      gradedBy: "server",
      // `finalizedAt` in the receipt is the server's own time; this is the
      // academic moment the attempt was recorded at.
      academicOccurredAt: new Date(finalization.academicAt),
    });
    return "finalized";
  });
}

exports.finalizeStudentResponseCheckpoints = onSchedule(
  { schedule: "every 1 minutes", timeZone: "America/Chicago" },
  async () => {
    const db = getFirestore();
    const now = Date.now();
    const due = await db.collection(CHECKPOINT_COLLECTION)
      .where("status", "==", CHECKPOINT_STATUS_ACTIVE)
      .where("candidateFinalizeAt", "<=", new Date(now))
      .orderBy("candidateFinalizeAt")
      .limit(CHECKPOINT_BATCH_LIMIT)
      .get();

    /*
     * A NULL QUERY HINT IS NOT A CHECKPOINT THAT NEVER MATTERS.
     *
     * The rules deliberately allow `candidateFinalizeAt: null` so a deadline a
     * teacher has not set yet keeps the student's work instead of failing their
     * write. But a null never satisfies `<= now`, so those checkpoints left the
     * scheduler's sight entirely: a complete, gradeable, pre-cutoff response
     * that should have produced a canonical attempt silently never did. They
     * are examined here under exactly the same decision — if no close can be
     * proven the finalizer holds them, which also stamps a real hint and moves
     * them into the query above.
     */
    const unhinted = await db.collection(CHECKPOINT_COLLECTION)
      .where("status", "==", CHECKPOINT_STATUS_ACTIVE)
      .where("candidateFinalizeAt", "==", null)
      .limit(CHECKPOINT_BATCH_LIMIT)
      .get();
    if (due.empty && unhinted.empty) return;

    const scheduleSnapshot = await db.collection("settings").doc("classSchedule").get();
    const schedule = scheduleSnapshot.exists ? scheduleSnapshot.data() : null;
    const classPeriodCache = new Map();
    const outcomes = {};

    for (const snapshot of [...due.docs, ...unhinted.docs]) {
      try {
        const outcome = await finalizeOneResponseCheckpoint({
          db, ref: snapshot.ref, schedule, classPeriodCache, now,
        });
        outcomes[outcome] = (outcomes[outcome] || 0) + 1;
      } catch (error) {
        // One unfinalizable checkpoint must not stop the batch. It stays active
        // and is retried on the next run.
        outcomes.failed = (outcomes.failed || 0) + 1;
        logger.error("Could not finalize a response checkpoint", { checkpointId: snapshot.id, message: error.message });
      }
    }
    logger.info("Deadline response checkpoint batch complete", { examined: due.size + unhinted.size, unhinted: unhinted.size, ...outcomes });
  },
);

/*
 * MANUAL SECTION CLOSE MAKES OUTSTANDING WORK DUE NOW.
 *
 * A Classwork checkpoint ordinarily carries the assignment's final deadline as
 * its query hint, which can be tomorrow. When a teacher closes the section at
 * 10:15 the outstanding responses for THAT assignment, class and section are
 * due immediately — so this trigger pulls their query time forward instead of
 * waiting for a hint that has nothing to do with the close.
 *
 * Bounded by construction: the query names the assignment, the class and the
 * role, so a close touches only the students it closed for. Nothing scans the
 * collection.
 */
const closedSectionKeys = (assignment = {}) => {
  const keys = new Map();
  const warmupClosed = assignment?.warmup?.closedByClassId;
  if (warmupClosed && typeof warmupClosed === "object") {
    Object.entries(warmupClosed).forEach(([classId, entry]) => {
      keys.set(`warmup:${classId}`, { activityRole: "warmup", classId, closedAt: entry?.closedAt || entry || null });
    });
  }
  ["classwork", "practice"].forEach((role) => {
    const overrides = assignment?.sectionAccess?.[role]?.overridesByClassId;
    if (!overrides || typeof overrides !== "object") return;
    Object.entries(overrides).forEach(([classId, entry]) => {
      if (String(entry?.state || "").toLowerCase() !== "closed") return;
      keys.set(`${role}:${classId}`, { activityRole: role, classId, closedAt: entry?.changedAt || null });
    });
  });
  return keys;
};

exports.expediteCheckpointsOnSectionClose = onDocumentWritten(
  "assignments/{assignmentId}",
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after) return;
    const previous = closedSectionKeys(before || {});
    const current = closedSectionKeys(after);
    // Only sections that became closed, or were closed again at a new time.
    const newlyClosed = [...current.entries()].filter(([key, entry]) => (
      !previous.has(key) || String(previous.get(key)?.closedAt || "") !== String(entry.closedAt || "")
    )).map(([, entry]) => entry);
    if (!newlyClosed.length) return;

    const db = getFirestore();
    const assignmentId = event.params.assignmentId;
    const dueAt = new Date();
    for (const entry of newlyClosed) {
      const outstanding = await db.collection(CHECKPOINT_COLLECTION)
        .where("status", "==", CHECKPOINT_STATUS_ACTIVE)
        .where("assignmentId", "==", assignmentId)
        .where("classId", "==", entry.classId)
        .where("activityRole", "==", entry.activityRole)
        .limit(CHECKPOINT_BATCH_LIMIT)
        .get();
      if (outstanding.empty) continue;
      // Only the query time moves. Whether the work counts is still decided by
      // the finalizer re-reading this same assignment.
      const writer = db.batch();
      outstanding.docs.forEach((snapshot) => writer.update(snapshot.ref, {
        candidateFinalizeAt: dueAt,
        expeditedBy: "manual-section-close",
        expeditedAt: FieldValue.serverTimestamp(),
      }));
      await writer.commit();
      logger.info("Manual section close expedited outstanding checkpoints", {
        assignmentId, classId: entry.classId, activityRole: entry.activityRole, count: outstanding.size,
      });
    }
  },
);

/* =========================================================================
 * SERVER INGESTION OF ORDINARY STUDENT SUBMISSIONS.
 *
 * The September 14 incident: students worked, the browser acknowledged, and
 * `grades/{studentId}.gradesByAssignment` stayed empty. Canonical persistence
 * had become a client Firestore TRANSACTION running in a background drain, and
 * a transaction is the one Firestore write that does not queue offline — it
 * waits for the network. One stalled transaction owned the drain chain, one
 * undifferentiated `rejected` deleted the evidence, and the teacher's gradebook
 * never heard about work the student had plainly done.
 *
 * This callable is the durable path. The browser keeps its instant local
 * acknowledgement and its IndexedDB envelope; delivery happens here, where the
 * authoritative assignment, roster and attempt history are re-read, the
 * response is re-graded wherever the server can mark it, and the answer is a
 * RECEIPT the client can retire its queue row against.
 *
 * Idempotency key: the durable action id, carried into the canonical record as
 * `lastSubmissionId`. A retry of a submission that already landed reports
 * `duplicate` and writes nothing.
 * ========================================================================= */
let submissionIngestionModule = null;
async function submissionIngestion() {
  if (!submissionIngestionModule) {
    submissionIngestionModule = await import("./shared/submissionIngestion.mjs");
  }
  return submissionIngestionModule;
}

let submissionDispositionModule = null;
async function submissionDisposition() {
  if (!submissionDispositionModule) {
    submissionDispositionModule = await import("./shared/studentSubmissionDisposition.mjs");
  }
  return submissionDispositionModule;
}

const SUBMISSION_RECEIPT_COLLECTION = "studentSubmissionReceipts";

/** The student's class, read from the authoritative roster row, never claimed. */
function authoritativeStudentClassId(gradeData) {
  return String(gradeData?.classId || "").trim() || null;
}

/**
 * Ingest ONE envelope inside a transaction and return its receipt.
 *
 * Every read happens before every write, and the canonical attempt, its
 * projections, the evidence event and the checkpoint retirement all commit
 * together — so a teacher never sees a grade without its evidence, and a
 * deadline can never turn one response into two attempts.
 */
async function ingestOneSubmission({ db, studentId, envelope, now }) {
  const ingestion = await submissionIngestion();
  const dispositions = await submissionDisposition();
  const { assignmentFinalCloseAt } = await import("./shared/sectionDeadline.mjs");

  const gradeRef = db.collection("grades").doc(studentId);
  const assignmentRef = db.collection("assignments").doc(envelope.assignmentId);
  const receiptRef = db.collection(SUBMISSION_RECEIPT_COLLECTION).doc(
    `${encodeURIComponent(studentId)}__${encodeURIComponent(envelope.actionId)}`.slice(0, 1400),
  );
  const checkpointRef = envelope.checkpointDocumentId
    ? db.collection(CHECKPOINT_COLLECTION).doc(envelope.checkpointDocumentId)
    : null;

  return db.runTransaction(async (transaction) => {
    const [assignmentSnapshot, gradeSnapshot, receiptSnapshot, checkpointSnapshot] = await Promise.all([
      transaction.get(assignmentRef),
      transaction.get(gradeRef),
      transaction.get(receiptRef),
      checkpointRef ? transaction.get(checkpointRef) : Promise.resolve(null),
    ]);

    /*
     * A receipt already written for this action id is the whole idempotency
     * story for a retry that arrives after the grade write committed.
     *
     * The answer is DUPLICATE, not the original disposition. A device asking
     * again needs one thing: may this queue row be retired? Echoing back
     * `accepted` would say "this was just accepted", which is how a replay
     * gets counted as a second attempt by anything downstream. The original
     * outcome is carried alongside, for the recovery report rather than for
     * the queue.
     */
    if (receiptSnapshot.exists) {
      const previous = receiptSnapshot.data() || {};
      return {
        actionId: envelope.actionId,
        disposition: dispositions.SUBMISSION_DISPOSITION.DUPLICATE,
        reason: "receipt-already-issued",
        originalDisposition: previous.disposition || null,
        receiptId: receiptSnapshot.id,
      };
    }

    const assignment = assignmentSnapshot.exists
      ? { id: assignmentSnapshot.id, ...assignmentSnapshot.data() }
      : null;
    const gradeData = gradeSnapshot.exists ? gradeSnapshot.data() || {} : null;
    const classId = authoritativeStudentClassId(gradeData);

    // Secure Test Cycle work keeps its own server-authoritative state machine
    // and never becomes an ordinary attempt, whatever an envelope claims.
    if (assignment && (secureAssignmentMode(assignment) || assignment.secure === true)) {
      return {
        actionId: envelope.actionId,
        disposition: dispositions.SUBMISSION_DISPOSITION.PERMANENTLY_INVALID,
        reason: "secure-assignment-excluded",
      };
    }

    const question = assignment ? runtimeQuestionsFromAssignment(assignment)?.[envelope.questionIndex] || null : null;
    const canonicalRecord = gradeData?.gradesByAssignment?.[envelope.assignmentId]?.[String(envelope.questionIndex)]
      ?? gradeData?.gradesByAssignment?.[envelope.assignmentId]?.[envelope.questionIndex]
      ?? null;

    // A per-student attendance extension (assignment.studentOverrides
    // [studentId].lateDueAt) is the same authoritative final cutoff the
    // client and the checkpoint finalizer both read — ingestion must not be
    // the one path that ignores it.
    const finalCloseAtMs = assignment ? assignmentFinalCloseAt(assignment, null, studentId) : null;
    const decision = ingestion.decideSubmissionIngestion({
      envelope,
      assignmentExists: assignmentSnapshot.exists,
      gradeRecordExists: gradeSnapshot.exists,
      authorizedForClass: assignment ? studentMatchesAssignmentAudience({ assignment, classId }) : null,
      // Judged at the moment the student pressed Submit, not at the moment the
      // background queue happened to reach this function.
      assignmentClosedAtCapture: finalCloseAtMs === null
        ? null
        : Number(envelope.capturedAt || now) > Number(finalCloseAtMs),
      liveSectionAccess: assignment
        ? ingestion.resolveLiveSectionAccess({ assignment, activityRole: envelope.activityRole, classId })
        : null,
      question,
      canonicalRecord,
      deliveryAttempts: envelope.deliveryAttempts || 0,
      now,
    });

    if (decision.disposition !== dispositions.SUBMISSION_DISPOSITION.ACCEPTED) {
      // Nothing is written for a non-acceptance except, for a PROVEN one, the
      // receipt that lets the device stop retrying. An unprovable outcome
      // writes nothing at all, so the device keeps the work and tries again.
      if (!dispositions.RETIRING_DISPOSITIONS.includes(decision.disposition)) {
        return { actionId: envelope.actionId, disposition: decision.disposition, reason: decision.reason };
      }
      transaction.set(receiptRef, {
        studentId,
        actionId: envelope.actionId,
        assignmentId: envelope.assignmentId,
        questionIndex: envelope.questionIndex,
        disposition: decision.disposition,
        reason: decision.reason || null,
        capturedAt: envelope.capturedAt ? new Date(envelope.capturedAt) : null,
        issuedAt: FieldValue.serverTimestamp(),
      });
      return {
        actionId: envelope.actionId,
        disposition: decision.disposition,
        reason: decision.reason,
        receiptId: receiptRef.id,
      };
    }

    const assignmentId = envelope.assignmentId;

    /*
     * A REDEEMED PRACTICE PASS RETIRES A CREDIT-BEARING PRACTICE RESPONSE.
     *
     * The stale-tab/offline race: a student has a Practice response open or
     * queued locally, redeems a Practice Pass before that response becomes a
     * canonical attempt, and the queued response arrives after the waiver
     * already exists. `decideSubmissionIngestion` above has no way to know
     * about a reward redemption -- it is a Class Points concern, not a
     * submission-lifecycle one -- so this checks it directly, AFTER the
     * ordinary decision already says ACCEPTED and BEFORE any canonical write.
     * Only Practice is affected: Warm-Up/Classwork/DOL responses are never
     * touched by a Practice Pass and never reach this branch.
     */
    if (question?.activityRole === "practice" && classId) {
      const rewards = await classPointRewards();
      const redemptionSnap = await transaction.get(
        db.collection(CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION).doc(rewards.practicePassRedemptionId({
          studentId, classId, assignmentId, rewardCode: rewards.PRACTICE_PASS_REWARD_CODE,
        })),
      );
      if (redemptionSnap.exists) {
        // A proven, permanent fact -- Practice is excused for this assignment
        // -- so the outbox may retire this action instead of retrying it
        // forever. No grade, no evidence, no attempt is ever written for it.
        transaction.set(receiptRef, {
          studentId,
          actionId: envelope.actionId,
          assignmentId,
          questionIndex: envelope.questionIndex,
          disposition: dispositions.SUBMISSION_DISPOSITION.PERMANENTLY_INVALID,
          reason: "practice-pass-redeemed",
          capturedAt: envelope.capturedAt ? new Date(envelope.capturedAt) : null,
          issuedAt: FieldValue.serverTimestamp(),
        });
        return {
          actionId: envelope.actionId,
          disposition: dispositions.SUBMISSION_DISPOSITION.PERMANENTLY_INVALID,
          reason: "practice-pass-redeemed",
          receiptId: receiptRef.id,
        };
      }
    }

    const classworkIndices = runtimeIncludedQuestionIndicesForSection(assignment, "classwork");
    const dolIndices = runtimeIncludedQuestionIndicesForSection(assignment, "dol");
    const built = ingestion.buildIngestedAttempt({
      envelope,
      assignment,
      question,
      canonicalRecord,
      gradeDocument: gradeData,
      classworkIndices,
      dolIndices,
      // `now` is when the SERVER heard about this, which is the receipt's
      // business. The academic time is resolved from the capture, bounded by
      // the assignment's release and by this moment.
      ingestedAt: now,
    });
    if (built.blocked) {
      // The server could not mark a response it was supposed to be able to
      // mark. Keeping the work beats guessing at it.
      return {
        actionId: envelope.actionId,
        disposition: dispositions.SUBMISSION_DISPOSITION.NEEDS_REVIEW,
        reason: built.reason,
      };
    }

    if (envelope.activityRole === "dol" && dolIndices.length) {
      const { dolSectionProjection } = ingestion;
      const authoritativeOverrides =
        gradeData?.teacherGradeOverridesByAssignment?.[assignmentId] || {};
      const totals = weightedQuestionTotals({
        tracker: built.assignmentTracker,
        questions: runtimeQuestionsFromAssignment(assignment),
        indices: dolIndices,
        creditForRecord: (candidate, index) => getQuestionCredit(
          candidate,
          authoritativeOverrides?.[String(index)] ?? authoritativeOverrides?.[index] ?? null,
        ),
      });
      built.dolGrade = dolSectionProjection({
        existing: gradeData?.dolGradesByAssignment?.[assignmentId] || null,
        // The day the student answered, not the day the queue drained.
        dateKey: built.dolDateKey,
        score: totals.score ?? 0,
        questionIndices: dolIndices,
        recordedAt: new Date(built.academicAt).toISOString(),
        finalize: false,
        correctionReason: "server-ingestion",
      });
    }

    const updates = [
      new FieldPath("gradesByAssignment", assignmentId, String(envelope.questionIndex)),
      built.record,
      new FieldPath("supportUsageByAssignment", assignmentId),
      built.supportUsage,
    ];
    if (built.classworkGrade) {
      // Without this a student's final classwork response could be recorded and
      // still leave them locked out of the dependent assignment.
      updates.push(new FieldPath("classworkGradesByAssignment", assignmentId), built.classworkGrade);
    }
    if (built.dolGrade) {
      updates.push(new FieldPath("dolGradesByAssignment", assignmentId, built.dolDateKey), built.dolGrade);
    }
    transaction.update(gradeRef, ...updates);

    if (built.gradingEvidence && built.gradingEvidenceDocumentId) {
      transaction.set(
        gradeRef.collection(RESPONSE_INSPECTION_EVIDENCE_COLLECTION)
          .doc(String(built.gradingEvidenceDocumentId)),
        {
          schemaVersion: Number(built.gradingEvidence.schemaVersion) || 1,
          assignmentId,
          questionIndex: Number(envelope.questionIndex),
          questionId: question?.questionId || question?.id || null,
          submissionId: String(built.record.lastSubmissionId || ""),
          variantIndex: Number(built.record.variantIndex ?? 0),
          totalAttempts: Number(built.record.totalAttempts ?? built.record.attemptCount ?? 0),
          evidence: built.gradingEvidence,
          academicOccurredAt: new Date(built.academicAt),
          writtenAt: FieldValue.serverTimestamp(),
          source: "server-ingestion",
        },
      );
    }

    if (built.evidenceEvent?.eventKey) {
      // Deterministic for this exact attempt, so a retry after a partial
      // failure repeats the same write rather than appending a second record.
      transaction.set(
        gradeRef.collection("evidenceEvents").doc(String(built.evidenceEvent.eventKey)),
        built.evidenceEvent,
      );
    }

    // THE EXPLICIT SUBMISSION IS NEWER AUTHORITY THAN ITS OWN CHECKPOINT.
    // Retiring it in the same transaction makes "Submit, close the tab, the
    // deadline arrives" produce exactly one attempt.
    if (checkpointRef && checkpointSnapshot?.exists && checkpointSnapshot.data()?.studentId === studentId) {
      transaction.update(checkpointRef, {
        status: "explicitly-submitted",
        candidateFinalizeAt: null,
        supersededAt: FieldValue.serverTimestamp(),
        supersededBySubmissionId: envelope.actionId,
      });
    }

    transaction.set(receiptRef, {
      studentId,
      actionId: envelope.actionId,
      assignmentId,
      questionIndex: envelope.questionIndex,
      disposition: dispositions.SUBMISSION_DISPOSITION.ACCEPTED,
      reason: null,
      gradedBy: built.gradedBy,
      totalAttempts: Number(built.record.totalAttempts) || 0,
      capturedAt: envelope.capturedAt ? new Date(envelope.capturedAt) : null,
      // The academic time the attempt was recorded at, and separately the real
      // server time this receipt was issued. A delayed recovery is visible as
      // the gap between them rather than by moving the grade.
      academicOccurredAt: new Date(built.academicAt),
      issuedAt: FieldValue.serverTimestamp(),
    });

    return {
      actionId: envelope.actionId,
      disposition: dispositions.SUBMISSION_DISPOSITION.ACCEPTED,
      reason: null,
      gradedBy: built.gradedBy,
      receiptId: receiptRef.id,
      totalAttempts: Number(built.record.totalAttempts) || 0,
      academicOccurredAt: built.academicAt,
      ingestedAt: now,
    };
  });
}

exports.ingestStudentSubmissions = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const ingestion = await submissionIngestion();
  const dispositions = await submissionDisposition();

  const incoming = Array.isArray(request.data?.submissions) ? request.data.submissions : [];
  if (!incoming.length) throw new HttpsError("invalid-argument", "No submissions were supplied.");
  if (incoming.length > ingestion.MAX_ENVELOPES_PER_CALL) {
    throw new HttpsError("invalid-argument", `At most ${ingestion.MAX_ENVELOPES_PER_CALL} submissions may be ingested per call.`);
  }

  const db = getFirestore();
  const now = Date.now();
  const receipts = [];
  for (const raw of incoming) {
    const envelope = ingestion.normalizeSubmissionEnvelope(raw);
    if (!envelope) {
      // Unreadable is not "discard": the device keeps its copy and the teacher
      // recovery report can see that something arrived that could not be read.
      receipts.push({
        actionId: String(raw?.actionId || "").slice(0, 200) || null,
        disposition: dispositions.SUBMISSION_DISPOSITION.NEEDS_REVIEW,
        reason: "unreadable-envelope",
      });
      continue;
    }
    // The envelope never gets to say whose work it is.
    envelope.studentId = studentId;
    try {
      receipts.push(await ingestOneSubmission({ db, studentId, envelope, now }));
    } catch (error) {
      logger.error("Could not ingest a student submission", {
        studentId, actionId: envelope.actionId, message: error.message,
      });
      // A failed write is a retry, never a retirement.
      receipts.push({
        actionId: envelope.actionId,
        disposition: dispositions.SUBMISSION_DISPOSITION.RETRYABLE,
        reason: `ingestion-error:${String(error.message || "unknown").slice(0, 120)}`,
      });
    }
  }
  return { receipts, ingestedAt: now };
});

const studentMatchesAssignmentAudience = ({ assignment = {}, classId = null } = {}) => {
  const audience = assignmentAudience(assignment);
  return Boolean(classId && audience.classIds.includes(String(classId)));
};

async function assertTeacherMayManageAssignment(request, assignmentSnap) {
  const teacherUid = await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) {
    throw new HttpsError("permission-denied", "A verified teacher email is required.");
  }
  if (authLib.isRootAdminEmail(teacherEmail)) return { teacherUid, teacherEmail };

  const assignment = assignmentSnap.data() || {};
  const audience = assignmentAudience(assignment);
  if (!audience.classIds.length) {
    throw new HttpsError(
      "failed-precondition",
      "Assign this lesson to a MathMaster class before publishing its Classroom resource package."
    );
  }

  const db = getFirestore();
  const snapshots = await Promise.all(audience.classIds.map((classId) => db.collection("classes").doc(classId).get()));
  const ownsEveryClass = snapshots.every((snapshot) => snapshot.exists
    && String(snapshot.data()?.teacherOfRecord || "").trim().toLowerCase() === teacherEmail);
  if (!ownsEveryClass) {
    throw new HttpsError(
      "permission-denied",
      "Only the teacher of record for every assigned class may publish this lesson's generated resources."
    );
  }
  return { teacherUid, teacherEmail };
}

const clampPercent = (value) =>
  Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

function storedAlgebraStepPartialCredit(record) {
  const steps = Array.isArray(record?.stepGrades) ? record.stepGrades : [];
  const variantIndex = Number(record?.variantIndex || 0);
  const currentSteps = steps.filter((step) => Number(step?.variantIndex) === variantIndex);
  if (!currentSteps.length) return 0;

  const stateKey = (value) => String(value || "").replace(/\s+/g, "").replace(/[−–—]/g, "-");
  const expectedTotal = currentSteps.reduce(
    (maximum, step) => Math.max(maximum, Math.max(0, Number(step?.expectedTotalPoints) || 0)),
    0
  );
  const visitedStates = new Set();
  const firstBefore = stateKey(currentSteps[0]?.equationBefore);
  if (firstBefore) visitedStates.add(firstBefore);

  let earned = 0;
  let fallbackPossible = 0;
  currentSteps.forEach((step) => {
    const afterKey = stateKey(step?.equationAfter);
    const acceptedProductive = step?.accepted !== false && step?.productive !== false;
    const newState = !afterKey || !visitedStates.has(afterKey);
    if (acceptedProductive && newState) {
      earned += Math.max(0, Number(step?.earned) || 0);
      fallbackPossible += Math.max(0, Number(step?.possible) || 0);
    }
    if (afterKey) visitedStates.add(afterKey);
  });

  const possible = expectedTotal > 0 ? expectedTotal : fallbackPossible;
  return possible > 0 ? Math.min(90, clampPercent(Math.round((earned / possible) * 100))) : 0;
}

function teacherOverrideAppliesToRecord(record, authoritativeOverride = null) {
  if (
    !record
    || authoritativeOverride?.active !== true
    || !Number.isFinite(Number(authoritativeOverride.score))
  ) return false;

  if (
    authoritativeOverride.persistent === true
    && authoritativeOverride.source === "teacher-section-zero"
  ) return true;

  const recordAttempts = Number(record.totalAttempts ?? record.attemptCount ?? 0);
  const overrideAttempts = Number(authoritativeOverride.totalAttempts);
  if (!Number.isFinite(overrideAttempts) || overrideAttempts !== recordAttempts) return false;

  const recordVariant = Number(record.variantIndex ?? 0);
  const overrideVariant = Number(authoritativeOverride.variantIndex);
  if (!Number.isFinite(overrideVariant) || overrideVariant !== recordVariant) return false;

  const overrideSubmissionId = String(authoritativeOverride.submissionId || "");
  if (overrideSubmissionId) {
    return overrideSubmissionId === String(record.lastSubmissionId || "");
  }
  const overrideLastAttemptAt = String(authoritativeOverride.lastAttemptAt || "");
  return Boolean(overrideLastAttemptAt)
    && overrideLastAttemptAt === String(record.lastAttemptAt || record.academicOccurredAt || "");
}

const ASSIGNMENT_GRADE_OVERRIDE_KEY = "__assignment";
const ASSIGNMENT_ZERO_REASONS = Object.freeze({
  cellPhoneUse: "Prohibited cellphone use",
  academicDishonesty: "Unauthorized assistance / cheating",
  accountSwitching: "Account or laptop switching",
});
const INTEGRITY_PARTICIPANT_ROLES = new Set(["individual", "received", "supplied"]);
const SECTION_INTEGRITY_KEY_PREFIX = "__sectionIntegrity_";

function activeAssignmentGradeOverride(authoritativeOverrides = {}) {
  const override = authoritativeOverrides?.[ASSIGNMENT_GRADE_OVERRIDE_KEY] || null;
  if (override?.active !== true || !Number.isFinite(Number(override.score))) return null;
  return {
    ...override,
    score: Math.max(0, Math.min(100, Number(override.score))),
  };
}

function getQuestionCredit(record, authoritativeOverride = null) {
  if (!record) return 0;
  // IMPORTANT: never trust record.gradeOverride here. gradesByAssignment is
  // client-writable for legacy workflows. Only the separately rule-protected
  // teacherGradeOverridesByAssignment projection may affect an authoritative
  // server grade, and that override is valid only for the exact attempt it was
  // issued against.
  if (teacherOverrideAppliesToRecord(record, authoritativeOverride)) {
    return clampPercent(authoritativeOverride.score) / 100;
  }
  if (record.status === "correct") return 1;
  const stored = clampPercent(record.bestPartialCredit ?? record.partialCredit ?? 0);
  const derived = storedAlgebraStepPartialCredit(record);
  return Math.max(stored, derived) / 100;
}

function isQuestionTerminal(record) {
  const status = record?.status;
  return status === "correct" || status === "expired";
}

function questionWasAttempted(record) {
  if (!record || typeof record !== "object") return false;
  if (Number(record.totalAttempts || record.attemptCount || 0) > 0) return true;
  if (isQuestionTerminal(record)) return true;
  return clampPercent(record.bestPartialCredit ?? record.partialCredit ?? 0) > 0;
}

function calculateAssignmentGrade(
  assignmentTracker,
  questionIndices,
  questions = [],
  authoritativeOverrides = {},
) {
  const indices = Array.isArray(questionIndices) ? questionIndices : [];
  if (!indices.length) return 0;
  const weighted = weightedQuestionTotals({
    tracker: assignmentTracker,
    questions,
    indices,
    creditForRecord: (record, index) => getQuestionCredit(
      record,
      authoritativeOverrides?.[String(index)] ?? authoritativeOverrides?.[index] ?? null,
    ),
  });
  return weighted.score ?? 0;
}

function assignmentGradeProgress(
  assignmentTracker,
  questionIndices,
  questions = [],
  authoritativeOverrides = {},
) {
  const indices = Array.isArray(questionIndices) ? questionIndices : [];
  const attempted = indices.filter((index) => questionWasAttempted(assignmentTracker?.[index])).length;
  const terminal = indices.filter((index) => isQuestionTerminal(assignmentTracker?.[index])).length;
  const weighted = weightedQuestionTotals({
    tracker: assignmentTracker,
    questions,
    indices,
    creditForRecord: (record, index) => getQuestionCredit(
      record,
      authoritativeOverrides?.[String(index)] ?? authoritativeOverrides?.[index] ?? null,
    ),
    attemptedForRecord: questionWasAttempted,
  });
  const minimumProgressQuestions = indices.length
    ? Math.max(1, Math.ceil(indices.length * 0.25))
    : 0;
  return {
    total: indices.length,
    attempted,
    terminal,
    grade: weighted.score ?? 0,
    creditOnAttempted: weighted.creditOnAttempted,
    complete: indices.length > 0 && terminal === indices.length,
    meaningfulProgress: attempted >= minimumProgressQuestions,
    minimumProgressQuestions,
  };
}

/**
 * Teacher-only response inspection. This reads the canonical attempt, the
 * server-backed graded workspace from Universal Persistence, and the
 * rule-protected teacher override projection. Expected answers are returned
 * only when the exact delivered question is authoritative.
 */
exports.inspectStudentResponse = onCall(async (request) => {
  await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  const studentId = String(request.data?.studentId || "").trim();
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const questionIndex = Number(request.data?.questionIndex);
  if (!studentId || !assignmentId || !Number.isInteger(questionIndex) || questionIndex < 0) {
    throw new HttpsError("invalid-argument", "Student, assignment, and question are required.");
  }

  const db = getFirestore();
  const gradeRef = db.collection("grades").doc(studentId);
  const assignmentRef = db.collection("assignments").doc(assignmentId);
  const [studentSnap, assignmentSnap] = await Promise.all([
    gradeRef.get(),
    assignmentRef.get(),
  ]);
  if (!studentSnap.exists || !assignmentSnap.exists) {
    throw new HttpsError("not-found", "The student or assignment was not found.");
  }

  const student = studentSnap.data() || {};
  const classSnap = student.classId
    ? await db.collection("classes").doc(String(student.classId)).get()
    : null;
  const ownsClass = classSnap?.exists
    && String(classSnap.data()?.teacherOfRecord || "").trim().toLowerCase() === teacherEmail;
  if (!authLib.isRootAdminEmail(teacherEmail) && !ownsClass) {
    throw new HttpsError(
      "permission-denied",
      "Only this student's teacher of record may inspect responses.",
    );
  }

  const assignment = { id: assignmentSnap.id, ...assignmentSnap.data() };
  if (String(assignment?.assessmentPolicy?.mode || "") === "testCycle") {
    throw new HttpsError(
      "failed-precondition",
      "Secure Test Cycle results use the dedicated assessment correction workflow.",
    );
  }
  if (
    !authLib.isRootAdminEmail(teacherEmail)
    && !studentMatchesAssignmentAudience({ assignment, classId: student.classId || null })
  ) {
    throw new HttpsError(
      "permission-denied",
      "This assignment is not assigned to the student's current class.",
    );
  }

  const questions = runtimeQuestionsFromAssignment(assignment);
  const question = questions[questionIndex];
  if (!question) throw new HttpsError("not-found", "The question was not found.");

  const tracker = student.gradesByAssignment?.[assignmentId] || {};
  const record = tracker[String(questionIndex)] || tracker[questionIndex] || null;
  if (!record || !questionWasAttempted(record)) {
    throw new HttpsError(
      "failed-precondition",
      "There is no submitted attempt to inspect.",
    );
  }
  const override = student.teacherGradeOverridesByAssignment?.[assignmentId]?.[String(questionIndex)]
    ?? student.teacherGradeOverridesByAssignment?.[assignmentId]?.[questionIndex]
    ?? null;
  const section = (Array.isArray(assignment.sections) ? assignment.sections : []).find((candidate) => (
    Array.isArray(candidate?.questions)
    && candidate.questions.some((entry) => entry?.questionId === question.questionId)
  )) || null;

  const inspector = await import("./shared/responseInspector.mjs");
  const { workspaceDraftDocumentId } = await import("./shared/workspaceDraftSchema.mjs");
  const inspectionEvidenceRef = gradeRef
    .collection(RESPONSE_INSPECTION_EVIDENCE_COLLECTION)
    .doc(inspector.responseInspectionEvidenceDocumentId({ assignmentId, questionIndex }));
  const [workspaceSnapshot, auditSnapshot, inspectionEvidenceSnapshot] = await Promise.all([
    db.collection(WORKSPACE_DRAFT_COLLECTION)
      .doc(workspaceDraftDocumentId({ studentId, assignmentId }))
      .get(),
    gradeRef.collection("gradeOverrideAudits")
      .where("assignmentId", "==", assignmentId)
      .limit(100)
      .get(),
    inspectionEvidenceRef.get(),
  ]);
  const gradingEvidence = trustedResponseInspectionEvidence(
    inspectionEvidenceSnapshot,
    { assignmentId, questionIndex, record },
  );
  const workspace = inspector.resolveGradedWorkspace({
    document: workspaceSnapshot.exists ? workspaceSnapshot.data() : null,
    questionIndex,
    variantIndex: record?.variantIndex || 0,
    submittedAt: gradingEvidence?.submittedAt || record?.lastAttemptAt || null,
  });
  const auditHistory = auditSnapshot.docs
    .map((snapshot) => snapshot.data() || {})
    .filter((entry) => Number(entry.questionIndex) === questionIndex)
    .sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")))
    .slice(-50);

  return inspector.buildInspectorModel({
    assignment,
    question,
    section,
    student: {
      id: studentId,
      displayName: student.displayName || student.name || studentId,
    },
    record,
    workspace,
    override,
    gradingEvidence,
    auditHistory,
  });
});

/**
 * Teacher grade correction. The active override lives in the rule-protected
 * top-level teacherGradeOverridesByAssignment map, never in the client-writable
 * question record. The original automatic attempt stays untouched.
 */
exports.overrideStudentResponseGrade = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  const studentId = String(request.data?.studentId || "").trim();
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const questionIndex = Number(request.data?.questionIndex);
  const action = String(request.data?.action || "");
  const reason = String(request.data?.reason || "");

  if (!studentId || !assignmentId || !Number.isInteger(questionIndex) || questionIndex < 0) {
    throw new HttpsError("invalid-argument", "Student, assignment, and question are required.");
  }

  const db = getFirestore();
  const gradeRef = db.collection("grades").doc(studentId);
  const assignmentRef = db.collection("assignments").doc(assignmentId);
  const inspector = await import("./shared/responseInspector.mjs");
  const projections = await import("./shared/assignmentProjections.mjs");
  const calendar = await import("./shared/instructionalCalendar.mjs");
  const deadline = await import("./shared/sectionDeadline.mjs");
  const nowIso = new Date().toISOString();

  const inspectionEvidenceRef = gradeRef
    .collection(RESPONSE_INSPECTION_EVIDENCE_COLLECTION)
    .doc(inspector.responseInspectionEvidenceDocumentId({ assignmentId, questionIndex }));

  const result = await db.runTransaction(async (transaction) => {
    const [gradeSnap, assignmentSnap, inspectionEvidenceSnapshot] = await Promise.all([
      transaction.get(gradeRef),
      transaction.get(assignmentRef),
      transaction.get(inspectionEvidenceRef),
    ]);
    if (!gradeSnap.exists || !assignmentSnap.exists) {
      throw new HttpsError("not-found", "The student or assignment was not found.");
    }

    const gradeData = gradeSnap.data() || {};
    const classSnap = gradeData.classId
      ? await transaction.get(db.collection("classes").doc(String(gradeData.classId)))
      : null;
    const ownsClass = classSnap?.exists
      && String(classSnap.data()?.teacherOfRecord || "").trim().toLowerCase() === teacherEmail;
    if (!authLib.isRootAdminEmail(teacherEmail) && !ownsClass) {
      throw new HttpsError(
        "permission-denied",
        "Only this student's teacher of record may change this grade.",
      );
    }

    const assignment = { id: assignmentSnap.id, ...assignmentSnap.data() };
    if (String(assignment?.assessmentPolicy?.mode || "") === "testCycle") {
      throw new HttpsError(
        "failed-precondition",
        "Secure Test Cycle results use the dedicated assessment correction workflow.",
      );
    }
    if (
      !authLib.isRootAdminEmail(teacherEmail)
      && !studentMatchesAssignmentAudience({ assignment, classId: gradeData.classId || null })
    ) {
      throw new HttpsError(
        "permission-denied",
        "This assignment is not assigned to the student's current class.",
      );
    }

    const questions = runtimeQuestionsFromAssignment(assignment);
    const question = questions[questionIndex];
    if (!question) throw new HttpsError("not-found", "The question was not found.");

    const tracker = { ...(gradeData.gradesByAssignment?.[assignmentId] || {}) };
    const record = tracker[String(questionIndex)] || tracker[questionIndex];
    if (!record || !questionWasAttempted(record)) {
      throw new HttpsError(
        "failed-precondition",
        "There is no submitted attempt to correct.",
      );
    }
    const gradingEvidence = trustedResponseInspectionEvidence(
      inspectionEvidenceSnapshot,
      { assignmentId, questionIndex, record },
    );

    const assignmentOverrides = {
      ...(gradeData.teacherGradeOverridesByAssignment?.[assignmentId] || {}),
    };
    const previousOverride = assignmentOverrides[String(questionIndex)]
      ?? assignmentOverrides[questionIndex]
      ?? null;
    const actor = {
      uid: teacherUid,
      email: teacherEmail,
      name: request.auth?.token?.name || null,
    };

    let correction;
    try {
      if (action === "restoreAutomatic") {
        correction = inspector.restoreAutomaticScore({
          record,
          previousOverride,
          actor,
          reason,
          note: request.data?.note,
          at: nowIso,
        });
      } else {
        let score = request.data?.score;
        if (action === "grantFullCredit") score = 100;
        if (action === "applyReplay") {
          const replay = inspector.replayStoredResponse({
            question,
            record,
            gradingEvidence,
          });
          if (!replay.available) throw new Error(replay.reason);
          score = replay.currentScore;
        }
        correction = inspector.buildGradeOverride({
          record,
          previousOverride,
          score,
          fieldId: action === "grantPartCredit"
            ? String(request.data?.fieldId || "")
            : null,
          reason,
          note: request.data?.note,
          actor,
          at: nowIso,
          source: action || "teacher-override",
        });
      }
    } catch (error) {
      throw new HttpsError("invalid-argument", error.message);
    }

    if (correction.override) {
      assignmentOverrides[String(questionIndex)] = correction.override;
    } else {
      delete assignmentOverrides[String(questionIndex)];
      delete assignmentOverrides[questionIndex];
    }

    const updates = [
      new FieldPath(
        "teacherGradeOverridesByAssignment",
        assignmentId,
        String(questionIndex),
      ),
      correction.override || FieldValue.delete(),
      new FieldPath("classroomReleaseSignals", assignmentId),
      {
        requestedAt: nowIso,
        reason: "manual-retry",
        source: "teacher-grade-override",
      },
    ];

    const classworkIndices = runtimeIncludedQuestionIndicesForSection(assignment, "classwork");
    if (classworkIndices.includes(questionIndex)) {
      const completion = projections.evaluateClassworkCompletionRule({
        classworkIndices,
        assignmentTracker: tracker,
        totalTimeSeconds: Number(
          gradeData.assignmentActivity?.[assignmentId]?.totalTimeSeconds,
        ) || 0,
        completionRule: assignment.completionRule || {},
      });
      const classworkGrade = projections.classworkGradeProjection({
        completion,
        existingGrade: gradeData.classworkGradesByAssignment?.[assignmentId] || null,
        recordedAt: nowIso,
      });
      if (classworkGrade) {
        updates.push(
          new FieldPath("classworkGradesByAssignment", assignmentId),
          classworkGrade,
        );
      }
    }

    const dolIndices = runtimeIncludedQuestionIndicesForSection(assignment, "dol");
    if (dolIndices.includes(questionIndex)) {
      const totals = weightedQuestionTotals({
        tracker,
        questions,
        indices: dolIndices,
        creditForRecord: (candidate, index) => getQuestionCredit(
          candidate,
          assignmentOverrides?.[String(index)] ?? assignmentOverrides?.[index] ?? null,
        ),
      });
      const existingDol = gradeData.dolGradesByAssignment?.[assignmentId] || {};
      const occurrence = Date.parse(String(
        record.academicOccurredAt || record.lastAttemptAt || "",
      ));
      const occurrenceDateKey = Number.isFinite(occurrence)
        ? calendar.zonedDateKey(occurrence, deadline.SCHOOL_TIME_ZONE)
        : null;
      const dateKey = (
        occurrenceDateKey && existingDol[occurrenceDateKey]
          ? occurrenceDateKey
          : null
      ) || Object.keys(existingDol).sort().at(-1)
        || calendar.zonedDateKey(Date.now(), deadline.SCHOOL_TIME_ZONE);
      const corrected = inspector.correctedDolProjection({
        existingByDate: existingDol,
        dateKey,
        score: totals.score ?? 0,
        questionIndices: dolIndices,
        correctedAt: nowIso,
      });
      updates.push(
        new FieldPath("dolGradesByAssignment", assignmentId, dateKey),
        corrected,
      );
    }

    transaction.update(gradeRef, ...updates);

    const auditRef = gradeRef.collection("gradeOverrideAudits").doc();
    transaction.set(auditRef, {
      ...correction.audit,
      assignmentId,
      questionIndex,
      questionId: question.questionId || question.id || null,
      automaticStatus: record.status || null,
      automaticScore: inspector.automaticQuestionScore(record),
      overrideActiveAfter: Boolean(correction.override),
    });

    return {
      authoritativeScore: inspector.effectiveQuestionScore(record, correction.override),
      automaticScore: inspector.automaticQuestionScore(record),
      override: correction.override,
    };
  });

  return result;
});

/**
 * Teacher assignment-level grade action. This deliberately reuses the same
 * rule-protected teacherGradeOverridesByAssignment map as question corrections.
 * Browsers cannot forge this value; only this Admin SDK callable writes it.
 */
exports.overrideStudentAssignmentGrade = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  const studentId = String(request.data?.studentId || "").trim();
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const action = String(request.data?.action || "").trim();
  const reasonCode = String(request.data?.reasonCode || "").trim();
  const note = String(request.data?.note || "").trim().slice(0, 500);
  const consequence = request.data?.academicIntegrityConsequence || null;
  const scope = String(consequence?.scope || "assignment").trim();
  const sectionRole = String(consequence?.sectionRole || "").trim().toLowerCase();
  const participantRole = String(consequence?.participantRole || "").trim();
  const teacherConfirmed = consequence?.teacherConfirmed === true;
  const supportedActions = ["issueZero", "restoreAutomatic", "restoreSectionZero"];

  if (!studentId || !assignmentId || !supportedActions.includes(action)) {
    throw new HttpsError("invalid-argument", "Student, assignment, and a supported grade action are required.");
  }
  // Automated INTEGRITY_REVIEW/SYSTEM_SIGNAL evidence may prompt review, but
  // can never become a grade consequence without a deliberate teacher action.
  if (consequence?.isSystemSignal === true || consequence?.triggerType === "SYSTEM_SIGNAL") {
    throw new HttpsError("failed-precondition", "System signals cannot issue academic-integrity consequences.");
  }
  if (!consequence || !teacherConfirmed) {
    throw new HttpsError("failed-precondition", "The teacher must explicitly confirm the incident.");
  }
  if (!["assignment", "section"].includes(scope) || !ASSIGNMENT_ZERO_REASONS[reasonCode]
      || consequence.incidentReason !== reasonCode || !INTEGRITY_PARTICIPANT_ROLES.has(participantRole)) {
    throw new HttpsError("invalid-argument", "Choose a supported scope, reason, and participant role.");
  }
  const actionMatchesScope = scope === "section"
    ? ["issueZero", "restoreSectionZero"].includes(action)
    : ["issueZero", "restoreAutomatic"].includes(action);
  if (!actionMatchesScope) {
    throw new HttpsError("invalid-argument", "The action does not match the integrity consequence scope.");
  }

  const db = getFirestore();
  const gradeRef = db.collection("grades").doc(studentId);
  const assignmentRef = db.collection("assignments").doc(assignmentId);
  const nowIso = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const [gradeSnap, assignmentSnap] = await Promise.all([transaction.get(gradeRef), transaction.get(assignmentRef)]);
    if (!gradeSnap.exists || !assignmentSnap.exists) throw new HttpsError("not-found", "The student or assignment was not found.");
    const gradeData = gradeSnap.data() || {};
    const classSnap = gradeData.classId ? await transaction.get(db.collection("classes").doc(String(gradeData.classId))) : null;
    const ownsClass = classSnap?.exists && String(classSnap.data()?.teacherOfRecord || "").trim().toLowerCase() === teacherEmail;
    if (!authLib.isRootAdminEmail(teacherEmail) && !ownsClass) {
      throw new HttpsError("permission-denied", "Only this student's teacher of record may change this assignment grade.");
    }
    const assignment = { id: assignmentSnap.id, ...assignmentSnap.data() };
    if (!authLib.isRootAdminEmail(teacherEmail) && !studentMatchesAssignmentAudience({ assignment, classId: gradeData.classId || null })) {
      throw new HttpsError("permission-denied", "This assignment is not assigned to the student's current class.");
    }

    const assignmentOverrides = { ...(gradeData.teacherGradeOverridesByAssignment?.[assignmentId] || {}) };
    const previousOverride = activeAssignmentGradeOverride(assignmentOverrides);
    const actor = { uid: teacherUid, email: teacherEmail, name: request.auth?.token?.name || null };
    const incidentRef = db.collection("studentSupportEvents").doc();
    const parentFollowUpRef = db.collection("studentSupportEvents").doc();
    let nextOverride = null;

    if (scope === "section") {
      const included = runtimeIncludedQuestionIndicesForSection(assignment, sectionRole);
      if (!included.length) throw new HttpsError("invalid-argument", "Choose a section that contains graded questions.");
      const stateKey = `${SECTION_INTEGRITY_KEY_PREFIX}${sectionRole}`;
      if (action === "issueZero") {
        if (assignmentOverrides[stateKey]?.active === true) throw new HttpsError("already-exists", "This section already has an integrity consequence.");
        const previousOverridesByQuestion = Object.fromEntries(included.map((index) => [String(index), assignmentOverrides[String(index)] || null]));
        assignmentOverrides[stateKey] = { active: true, incidentId: incidentRef.id, sectionRole, previousOverridesByQuestion };
        included.forEach((index) => { assignmentOverrides[String(index)] = {
          active: true, score: 0, persistent: true, source: "teacher-section-zero", incidentId: incidentRef.id,
          sectionRole, reasonCode, reason: ASSIGNMENT_ZERO_REASONS[reasonCode], participantRole, note: note || null, actor, at: nowIso,
        }; });
      } else {
        const saved = assignmentOverrides[stateKey];
        if (saved?.active !== true) throw new HttpsError("failed-precondition", "No section integrity consequence is active.");
        Object.entries(saved.previousOverridesByQuestion || {}).forEach(([index, prior]) => {
          if (prior) assignmentOverrides[index] = prior;
          else delete assignmentOverrides[index];
        });
        delete assignmentOverrides[stateKey];
      }
    } else {
      nextOverride = action === "issueZero" ? {
        active: true, score: 0, reasonCode, reason: ASSIGNMENT_ZERO_REASONS[reasonCode], note: note || null,
        source: "teacher-assignment-zero", participantRole, incidentId: incidentRef.id, actor, at: nowIso,
      } : null;
      if (nextOverride) assignmentOverrides[ASSIGNMENT_GRADE_OVERRIDE_KEY] = nextOverride;
      else delete assignmentOverrides[ASSIGNMENT_GRADE_OVERRIDE_KEY];
    }

    transaction.update(gradeRef,
      new FieldPath("teacherGradeOverridesByAssignment", assignmentId), assignmentOverrides,
      new FieldPath("classroomReleaseSignals", assignmentId), { requestedAt: nowIso, reason: "manual-retry", source: "teacher-assignment-grade-override" });
    const auditRef = gradeRef.collection("gradeOverrideAudits").doc();
    transaction.set(auditRef, { scope, sectionRole: scope === "section" ? sectionRole : null, assignmentId, questionIndex: null,
      action, reasonCode, reason: action === "issueZero" ? ASSIGNMENT_ZERO_REASONS[reasonCode] : "Restore integrity consequence",
      participantRole, teacherConfirmed: true, note: note || null, actor, at: nowIso, previousOverride: previousOverride || null,
      newOverride: nextOverride, overrideActiveAfter: action === "issueZero" });

    if (action === "issueZero") {
      const commonEvent = { schemaVersion: 1, studentId, studentName: gradeData.displayName || studentId,
        classId: gradeData.classId || null, assignmentId, assignmentTitle: assignment.title || null,
        originClassId: gradeData.classId || null, originTeacherEmail: teacherEmail,
        createdByEmail: teacherEmail, authorizedTeacherEmails: [teacherEmail], createdAt: nowIso, createdAtServer: FieldValue.serverTimestamp(),
        source: "teacher", confidence: "confirmed", relatedEventId: incidentRef.id };
      transaction.set(incidentRef, { ...commonEvent, kind: "academicIntegrityIncident", stage: "teacherConfirmed",
        signalKey: `academicIntegrityIncident:${incidentRef.id}`, summary: ASSIGNMENT_ZERO_REASONS[reasonCode], note: note || "",
        evidence: { scope, sectionRole: scope === "section" ? sectionRole : null, incidentReason: reasonCode, participantRole } });
      transaction.set(parentFollowUpRef, { ...commonEvent, kind: "parentFollowUp", stage: "teacherConfirmed",
        signalKey: `parentFollowUp:${parentFollowUpRef.id}`, summary: "Parent follow-up for confirmed academic-integrity incident", note: "",
        evidence: { incidentId: incidentRef.id, scope, sectionRole: scope === "section" ? sectionRole : null } });
    }
    return { override: nextOverride, incidentId: action === "issueZero" ? incidentRef.id : null };
  });
});

// ---------------------------------------------------------------------------
// Class Points: a classroom participation reward currency, scoped to
// studentId + classId. See functions/shared/classPoints.mjs for the domain
// model. Both callables below are the ONLY writers of the ledger, the account
// projection, and the public class announcement -- a client Firestore write
// can never touch any of the three (see firestore.rules).
//
// AUTHORIZATION ALWAYS RUNS BEFORE ANY DATA-RETURNING BRANCH, including an
// idempotent replay. Both callables use the Admin SDK, so firestore.rules
// does not protect their response -- the only thing standing between "a
// caller who is not this student's teacher" and a transaction/account payload
// is `authorizeClassPointsActor`, checked here before every `return`.
// ---------------------------------------------------------------------------

let classPointsModule = null;
async function classPoints() {
  if (!classPointsModule) classPointsModule = await import("./shared/classPoints.mjs");
  return classPointsModule;
}

const CLASS_POINT_ACCOUNTS_COLLECTION = "classPointAccounts";
const CLASS_POINT_TRANSACTIONS_COLLECTION = "classPointTransactions";
const CLASS_POINT_IDEMPOTENCY_COLLECTION = "classPointIdempotencyKeys";
const CLASS_POINT_ANNOUNCEMENTS_COLLECTION = "classPointAnnouncements";
const CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION = "classPointRewardRedemptions";

let classPointRewardsModule = null;
async function classPointRewards() {
  if (!classPointRewardsModule) classPointRewardsModule = await import("./shared/classPointRewards.mjs");
  return classPointRewardsModule;
}

function translateClassPointsError(error) {
  if (error?.name === "ClassPointsInputError") {
    return new HttpsError("invalid-argument", error.message);
  }
  return error;
}

/** `classRecord`/`studentRecord` shaped exactly as `authorizeClassPointsActor` expects. */
async function loadClassPointsActors(transaction, db, { classId, studentId }) {
  const classRef = db.collection("classes").doc(classId);
  const gradeRef = db.collection("grades").doc(studentId);
  const [classSnap, gradeSnap] = await Promise.all([
    transaction.get(classRef),
    transaction.get(gradeRef),
  ]);
  return {
    classRef,
    gradeRef,
    classRecord: classSnap.exists ? { classId: classSnap.id, ...classSnap.data() } : null,
    studentRecord: gradeSnap.exists ? gradeSnap.data() : null,
  };
}

/**
 * Award Class Points to one student in one class. A teacher can never award
 * themselves through a client write (see firestore.rules), the ledger this
 * creates is append-only, and replaying the same requestId with the same
 * payload returns the original transaction instead of creating a second one.
 * Reusing a requestId for a materially different award is rejected outright
 * rather than silently satisfied from the first call's result.
 */
exports.awardClassPoints = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) {
    throw new HttpsError(
      "permission-denied",
      "Sign in with a verified school email to award Class Points.",
    );
  }

  const points = await classPoints();
  let input;
  try {
    input = points.validateAwardInput(request.data);
  } catch (error) {
    throw translateClassPointsError(error);
  }
  const {
    studentId, classId, amount, reasonCode, reasonLabel, requestId, announce,
  } = input;

  const db = getFirestore();
  const accountRef = db
    .collection(CLASS_POINT_ACCOUNTS_COLLECTION)
    .doc(points.accountId(studentId, classId));
  const idempotencyRef = db
    .collection(CLASS_POINT_IDEMPOTENCY_COLLECTION)
    .doc(points.classPointIdempotencyKey({ classId, studentId, requestId }));
  const nowIso = new Date().toISOString();
  const isRootAdmin = authLib.isRootAdminEmail(teacherEmail);
  const payloadFingerprint = points.awardPayloadFingerprint(input);

  return db.runTransaction(async (transaction) => {
    const { classRef, classRecord, studentRecord } = await loadClassPointsActors(
      transaction, db, { classId, studentId },
    );
    const [accountSnap, idempotencySnap] = await Promise.all([
      transaction.get(accountRef),
      transaction.get(idempotencyRef),
    ]);

    // Authorization is checked BEFORE any branch that could return data --
    // including the idempotent-replay branch just below -- so a caller who is
    // not this student's currently-authoritative teacher of record can never
    // obtain a transaction or account payload, whether or not they also
    // happen to know (or reuse) a valid requestId.
    const decision = points.authorizeClassPointsActor({
      isRootAdmin, teacherEmail, classRecord, studentRecord, requestedClassId: classId,
    });
    if (!decision.authorized) throw new HttpsError(decision.reason, decision.message);

    // Idempotent replay: a network retry of the same award must return the
    // original result rather than create a second transaction. A requestId
    // reused for a DIFFERENT award (different amount/reason/announce) is not
    // "the same request retried" and must never be silently satisfied from
    // the first call's cached result.
    if (idempotencySnap.exists) {
      const existing = idempotencySnap.data() || {};
      if (existing.payloadFingerprint !== payloadFingerprint) {
        throw new HttpsError(
          "failed-precondition",
          "This requestId was already used for a different Class Points award.",
        );
      }
      const existingTransactionRef = db
        .collection(CLASS_POINT_TRANSACTIONS_COLLECTION)
        .doc(String(existing.transactionId));
      const existingTransactionSnap = await transaction.get(existingTransactionRef);
      return {
        transactionId: existingTransactionRef.id,
        account: accountSnap.exists ? accountSnap.data() : null,
        transaction: existingTransactionSnap.exists ? existingTransactionSnap.data() : null,
        replay: true,
      };
    }

    const existingAccount = accountSnap.exists ? accountSnap.data() : null;
    const authorization = points.classPointsAuthorizationContext({
      classRecord, existingRecord: existingAccount,
    });

    const transactionRef = db.collection(CLASS_POINT_TRANSACTIONS_COLLECTION).doc();
    const transactionData = points.buildAwardTransaction({
      studentId,
      classId,
      amount,
      reasonCode,
      reasonLabel,
      requestId,
      issuedByUid: teacherUid,
      issuedByEmail: teacherEmail,
      originTeacherEmail: authorization.originTeacherEmail,
      authorizedTeacherEmails: authorization.authorizedTeacherEmails,
      at: nowIso,
    });

    const baseAccount = existingAccount || points.emptyAccount({ studentId, classId });
    let nextAccount;
    try {
      nextAccount = points.applyTransaction(baseAccount, transactionData);
    } catch (error) {
      throw translateClassPointsError(error);
    }
    nextAccount = {
      ...nextAccount,
      originTeacherEmail: authorization.originTeacherEmail,
      authorizedTeacherEmails: authorization.authorizedTeacherEmails,
    };

    transaction.set(transactionRef, transactionData);
    transaction.set(accountRef, nextAccount);
    transaction.set(idempotencyRef, {
      transactionId: transactionRef.id,
      payloadFingerprint,
      createdAt: nowIso,
    });

    let announcementId = null;
    if (announce) {
      const announcementRef = classRef.collection(CLASS_POINT_ANNOUNCEMENTS_COLLECTION).doc();
      const announcement = points.buildAnnouncement({
        classId,
        publicStudentLabel: points.publicStudentLabel(studentRecord),
        amount,
        reasonLabel,
        awardTransactionId: transactionRef.id,
        at: nowIso,
      });
      transaction.set(announcementRef, announcement);
      announcementId = announcementRef.id;
    }

    return {
      transactionId: transactionRef.id,
      account: nextAccount,
      transaction: transactionData,
      announcementId,
      replay: false,
    };
  });
});

/**
 * Reverse a previously-issued Class Points award with a compensating,
 * immutable transaction. The reversal lives at a deterministic id derived
 * from the original transaction id, so a second reversal attempt collides
 * with the first rather than needing a query to discover it -- the same award
 * can never be reversed twice. Only a live, un-reversed `teacherAward` may be
 * targeted; see `isReversibleAward`.
 */
exports.reverseClassPointAward = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) {
    throw new HttpsError(
      "permission-denied",
      "Sign in with a verified school email to reverse a Class Points award.",
    );
  }

  const points = await classPoints();
  let input;
  try {
    input = points.validateReversalInput(request.data);
  } catch (error) {
    throw translateClassPointsError(error);
  }
  const { transactionId, reason, requestId } = input;

  const db = getFirestore();
  const originalRef = db.collection(CLASS_POINT_TRANSACTIONS_COLLECTION).doc(transactionId);
  const reversalRef = db
    .collection(CLASS_POINT_TRANSACTIONS_COLLECTION)
    .doc(points.reversalTransactionId(transactionId));
  const nowIso = new Date().toISOString();
  const isRootAdmin = authLib.isRootAdminEmail(teacherEmail);

  return db.runTransaction(async (transaction) => {
    const originalSnap = await transaction.get(originalRef);
    if (!originalSnap.exists) throw new HttpsError("not-found", "That Class Points award was not found.");
    const originalData = { id: originalSnap.id, ...originalSnap.data() };

    const { classRecord, studentRecord } = await loadClassPointsActors(
      transaction,
      db,
      { classId: String(originalData.classId || ""), studentId: String(originalData.studentId || "") },
    );
    const accountRef = db
      .collection(CLASS_POINT_ACCOUNTS_COLLECTION)
      .doc(points.accountId(originalData.studentId, originalData.classId));
    const [reversalSnap, accountSnap] = await Promise.all([
      transaction.get(reversalRef),
      transaction.get(accountRef),
    ]);

    // Authorization is checked BEFORE any branch that could return data --
    // including the idempotent-replay branch below -- for the same reason as
    // in awardClassPoints: this callable runs on the Admin SDK, so nothing
    // else stands between an unauthorized caller and this transaction's
    // account/history payload.
    const decision = points.authorizeClassPointsActor({
      isRootAdmin, teacherEmail, classRecord, studentRecord, requestedClassId: originalData.classId,
    });
    if (!decision.authorized) throw new HttpsError(decision.reason, decision.message);

    // A reversal may only target a live, un-reversed teacher award -- never a
    // reversal, and never a future rewardRedemption/liveChallengeAchievement
    // transaction, which must not inherit teacher-award reversal semantics by
    // accident.
    if (!points.isReversibleAward(originalData)) {
      throw new HttpsError("failed-precondition", "Only a teacher award can be reversed.");
    }

    if (reversalSnap.exists) {
      const existing = reversalSnap.data();
      if (existing.requestId === requestId) {
        return {
          transactionId: reversalRef.id,
          account: accountSnap.exists ? accountSnap.data() : null,
          transaction: existing,
          replay: true,
        };
      }
      throw new HttpsError("failed-precondition", "This award has already been reversed.");
    }

    if (!accountSnap.exists) {
      throw new HttpsError("failed-precondition", "There is no Class Points account to reverse against.");
    }

    const authorization = points.classPointsAuthorizationContext({
      classRecord, existingRecord: accountSnap.data(),
    });
    const reversalData = points.buildReversalTransaction({
      original: originalData,
      reason,
      requestId,
      issuedByUid: teacherUid,
      issuedByEmail: teacherEmail,
      originTeacherEmail: authorization.originTeacherEmail,
      authorizedTeacherEmails: authorization.authorizedTeacherEmails,
      at: nowIso,
    });

    let nextAccount;
    try {
      nextAccount = points.applyTransaction(accountSnap.data(), reversalData);
    } catch (error) {
      throw translateClassPointsError(error);
    }
    nextAccount = {
      ...nextAccount,
      originTeacherEmail: authorization.originTeacherEmail,
      authorizedTeacherEmails: authorization.authorizedTeacherEmails,
    };

    transaction.set(reversalRef, reversalData);
    transaction.set(accountRef, nextAccount);

    return {
      transactionId: reversalRef.id,
      account: nextAccount,
      transaction: reversalData,
      replay: false,
    };
  });
});

/**
 * Redeem a Practice Pass: spend 100 Class Points to excuse the Practice
 * section of one eligible assignment for the calling student. This is a
 * waiver, never academic credit -- see functions/shared/classPointRewards.mjs
 * for the full eligibility algorithm and the ledger/redemption shapes this
 * writes.
 *
 * IDEMPOTENCY IS THE DOCUMENT ID, NOT A CLIENT REQUESTID. The redemption id is
 * a deterministic function of (studentId, classId, assignmentId, rewardCode),
 * so a double click, a callable timeout, or a browser retry after an
 * uncertain response all resolve to the SAME document: this transaction reads
 * it first and, if it already exists, returns that original result instead of
 * spending another 100 points. That is also the entire "one Practice Pass per
 * assignment" rule -- a second real attempt is not a new document, it is a
 * write to one that is already there.
 *
 * Every fact this callable trusts is re-read here, from the verified token and
 * from Firestore, never from the browser: studentId and classId come from the
 * caller's custom claims and their own grade record, the assignment is read
 * fresh, and Practice's current-content indices come from
 * runtimeIncludedQuestionIndicesForSection -- the SAME projection the
 * classwork/DOL denominators already use server-side.
 */
exports.redeemPracticePass = onCall(async (request) => {
  const { studentId } = requireStudent(request);

  const rewards = await classPointRewards();
  let input;
  try {
    input = rewards.validateRedeemPracticePassInput(request.data);
  } catch (error) {
    if (error?.name === "PracticePassInputError") {
      throw new HttpsError("invalid-argument", error.message);
    }
    throw error;
  }
  const { assignmentId } = input;

  const db = getFirestore();
  const gradeRef = db.collection("grades").doc(studentId);
  const assignmentRef = db.collection("assignments").doc(assignmentId);

  return db.runTransaction(async (transaction) => {
    const [gradeSnap, assignmentSnap] = await Promise.all([
      transaction.get(gradeRef),
      transaction.get(assignmentRef),
    ]);
    if (!gradeSnap.exists) {
      throw new HttpsError("not-found", "Your student record was not found.");
    }
    const gradeData = gradeSnap.data() || {};
    const classId = authoritativeStudentClassId(gradeData);
    if (!classId) {
      throw new HttpsError("failed-precondition", "You are not currently placed in a class.");
    }
    if (!assignmentSnap.exists) {
      throw new HttpsError("not-found", "That assignment was not found.");
    }
    const assignment = { id: assignmentSnap.id, ...assignmentSnap.data() };

    const redemptionId = rewards.practicePassRedemptionId({
      studentId, classId, assignmentId, rewardCode: rewards.PRACTICE_PASS_REWARD_CODE,
    });
    const redemptionRef = db.collection(CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION).doc(redemptionId);
    const points = await classPoints();
    const accountRef = db.collection(CLASS_POINT_ACCOUNTS_COLLECTION).doc(points.accountId(studentId, classId));
    const classRef = db.collection("classes").doc(classId);
    const [redemptionSnap, accountSnap, classSnap] = await Promise.all([
      transaction.get(redemptionRef),
      transaction.get(accountRef),
      transaction.get(classRef),
    ]);

    // Idempotent replay: the deterministic redemption id IS the retry key.
    if (redemptionSnap.exists) {
      const existing = redemptionSnap.data();
      const existingTransactionSnap = await transaction.get(
        db.collection(CLASS_POINT_TRANSACTIONS_COLLECTION).doc(String(existing.transactionId)),
      );
      return {
        redemptionId,
        redemption: existing,
        account: accountSnap.exists ? accountSnap.data() : null,
        transaction: existingTransactionSnap.exists ? existingTransactionSnap.data() : null,
        replay: true,
      };
    }

    const classRecord = classSnap.exists ? { classId: classSnap.id, ...classSnap.data() } : null;

    /*
     * THE CLASS/ROSTER MUST BE INTERNALLY CONSISTENT BEFORE A NEW REDEMPTION.
     *
     * This reuses `authorizeClassPointsActor` -- the exact same consistency
     * rule `awardClassPoints`/`reverseClassPointAward` already enforce -- but
     * for a different purpose: there is no teacher actor here, so the class's
     * OWN `teacherOfRecord` is passed as the "actor", which makes the
     * teacher-identity check in that function a no-op (it always agrees with
     * itself) while still requiring: the class exists, is not archived, the
     * student's own grade record currently names this same class, the class
     * has a `teacherOfRecord` at all, and the roster's `assignedTeacherEmail`
     * agrees with it. Any of those failing means the roster is not in a state
     * a redemption should spend real points against.
     */
    const consistency = points.authorizeClassPointsActor({
      isRootAdmin: false,
      teacherEmail: classRecord?.teacherOfRecord,
      classRecord,
      studentRecord: gradeData,
      requestedClassId: classId,
    });
    if (!consistency.authorized) throw new HttpsError(consistency.reason, consistency.message);

    const assignedToClass = studentMatchesAssignmentAudience({ assignment, classId });
    const isTestCycleAssignment = secureAssignmentMode(assignment) || assignment.secure === true;
    const practiceIndices = runtimeIncludedQuestionIndicesForSection(assignment, "practice");

    const { normalizeQuestionRecord } = await import("./shared/attemptPolicy.mjs");
    const tracker = gradeData?.gradesByAssignment?.[assignmentId] || {};
    // Authoritative evidence only -- never the existence of a local draft. A
    // student who never submitted a Practice response may still redeem even
    // if a browser has an unfinished draft sitting in studentWorkspaceDrafts.
    const hasCreditBearingAttempt = practiceIndices.some((index) => {
      const record = normalizeQuestionRecord(tracker?.[String(index)] ?? tracker?.[index]);
      return Number(record.totalAttempts) > 0;
    });

    const account = accountSnap.exists ? accountSnap.data() : points.emptyAccount({ studentId, classId });

    const decision = rewards.evaluatePracticePassEligibility({
      assignment,
      assignedToClass,
      isTestCycleAssignment,
      practiceIndices,
      hasCreditBearingAttempt,
      alreadyRedeemed: false,
      balance: account.balance,
      nowValue: Date.now(),
      studentId,
    });
    if (!decision.eligible) {
      throw new HttpsError("failed-precondition", decision.message);
    }

    const authorization = points.classPointsAuthorizationContext({
      classRecord, existingRecord: accountSnap.exists ? account : null,
    });

    const nowIso = new Date().toISOString();
    const assignmentTitle = rewards.safeAssignmentTitle(assignment);
    const transactionRef = db.collection(CLASS_POINT_TRANSACTIONS_COLLECTION).doc();
    const ledgerTransaction = rewards.buildPracticePassLedgerTransaction({
      studentId,
      classId,
      assignmentId,
      assignmentTitle,
      redemptionId,
      issuedByUid: request.auth.uid,
      issuedByEmail: callerEmail(request),
      originTeacherEmail: authorization.originTeacherEmail,
      authorizedTeacherEmails: authorization.authorizedTeacherEmails,
      at: nowIso,
    });

    let nextAccount;
    try {
      nextAccount = points.applyTransaction(account, ledgerTransaction);
    } catch (error) {
      throw translateClassPointsError(error);
    }
    nextAccount = {
      ...nextAccount,
      originTeacherEmail: authorization.originTeacherEmail,
      authorizedTeacherEmails: authorization.authorizedTeacherEmails,
    };

    const redemption = rewards.buildPracticePassRedemption({
      redemptionId, studentId, classId, assignmentId, assignmentTitle, transactionId: transactionRef.id, at: nowIso,
    });

    transaction.set(transactionRef, ledgerTransaction);
    transaction.set(accountRef, nextAccount);
    transaction.set(redemptionRef, redemption);

    return {
      redemptionId,
      redemption,
      account: nextAccount,
      transaction: ledgerTransaction,
      replay: false,
    };
  });
});

/*
 * THE ONLY WAY A PER-STUDENT ATTENDANCE EXTENSION IS WRITTEN.
 *
 * `firestore.rules` blocks any client write that touches
 * `assignments/{id}.studentOverrides` (see that rule's own comment) exactly
 * so this callable — running with Admin SDK credentials, not the caller's —
 * is the one path that can grant one. The teacher's browser still computes
 * WHICH extension is earned (src/platform/attendance/
 * extensionReconciliation.js already re-derives that from attendance history
 * every time, so nothing here needs to trust a client-supplied "how many
 * meetings" number) and sends the resulting proposed cutoff and its display
 * metadata; this callable independently re-verifies, inside one transaction:
 *
 *   WHO   — the caller is this class's teacher of record (or root admin),
 *           this student currently belongs to that class, and this
 *           assignment is actually assigned to it
 *           (attendanceExtensionAuthorization.mjs, mirroring
 *           classPoints.mjs's authorizeClassPointsActor).
 *   WHAT  — the proposed final cutoff is never earlier than whatever is
 *           already authoritative for this student
 *           (validateProposedFinalCutoff, independent of whatever the
 *           client believes it already checked).
 *
 * The write itself is a narrow, dotted-path `transaction.update`, never a
 * whole-document read-modify-write of `studentOverrides` — see
 * `storeLessonNotesPdf` above for the same pattern against a different
 * nested assignment field.
 */
exports.applyStudentAttendanceExtension = onCall(async (request) => {
  await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) throw new HttpsError("permission-denied", "A verified teacher email is required.");
  const isRootAdmin = authLib.isRootAdminEmail(teacherEmail);

  const data = request.data || {};
  const classId = String(data.classId || "").trim();
  const studentId = String(data.studentId || "").trim();
  const assignmentId = String(data.assignmentId || "").trim();
  const proposedLateDueAtMs = Number(data.proposedLateDueAtMs);
  const extension = data.extension && typeof data.extension === "object" && !Array.isArray(data.extension)
    ? data.extension
    : {};
  // ONLY set by the Attendance History "Apply Shorter Extension" review
  // action — see the never-shorten re-check below, which independently
  // verifies a matching teacher-authored review resolution actually exists
  // rather than trusting this flag on its own.
  const allowShorten = data.allowShorten === true;
  const existingDateKey = String(data.existingDateKey || "").trim();
  const proposedDateKey = String(data.proposedDateKey || "").trim();
  if (!classId || !studentId || !assignmentId) {
    throw new HttpsError("invalid-argument", "classId, studentId and assignmentId are required.");
  }

  const db = getFirestore();
  const gradeRef = db.collection("grades").doc(studentId);
  const classRef = db.collection(CLASS_COLLECTION).doc(classId);
  const assignmentRef = db.collection("assignments").doc(assignmentId);

  /*
   * THE ONE ESCAPE HATCH FROM "NEVER SHORTEN", AND WHY IT IS STILL SAFE.
   *
   * A correction can genuinely mean a student is no longer owed as much
   * relief as they were first granted. `extensionReconciliation.js` refuses
   * to write that automatically — it surfaces an open
   * `attendanceCorrectionReview` instead (see
   * `openAttendanceCorrectionReviewsForStudent`) — so the ONLY way a
   * shortened cutoff reaches this callable is a teacher explicitly choosing
   * "Apply Shorter Extension" in Attendance History, which records a
   * `studentSupportEvents` doc (`kind: attendanceCorrectionReview, evidence.
   * resolution: 'shortened'`) BEFORE calling here. That doc's own create
   * rule already requires the writer to be this student's authorized
   * teacher — so finding one with the exact existing/proposed cutoff pair
   * is proof a real teacher action already happened, independent of
   * whatever this request claims about itself.
   */
  if (allowShorten) {
    if (!existingDateKey || !proposedDateKey) {
      throw new HttpsError("invalid-argument", "A shortened extension requires the existing and proposed cutoff dates.");
    }
    const reviewKey = `${studentId}|${assignmentId}|${existingDateKey}`;
    const reviewSnap = await db.collection("studentSupportEvents")
      .where("kind", "==", "attendanceCorrectionReview")
      .where("evidence.reviewKey", "==", reviewKey)
      .where("evidence.resolution", "==", "shortened")
      .where("evidence.proposedDateKey", "==", proposedDateKey)
      .limit(20)
      .get();
    const matchingReview = reviewSnap.docs.find((entry) => {
      const review = entry.data() || {};
      return String(review.studentId || "") === studentId
        && String(review.classId || "") === classId
        && String(review.createdByEmail || "").trim().toLowerCase() === teacherEmail;
    });
    if (!matchingReview) {
      throw new HttpsError(
        "failed-precondition",
        "A recorded teacher review choosing to shorten this exact extension is required first.",
      );
    }
  }

  return db.runTransaction(async (transaction) => {
    const [gradeSnap, classSnap, assignmentSnap] = await Promise.all([
      transaction.get(gradeRef),
      transaction.get(classRef),
      transaction.get(assignmentRef),
    ]);
    const studentRecord = gradeSnap.exists ? gradeSnap.data() : null;
    const classRecord = classSnap.exists ? { classId: classSnap.id, ...classSnap.data() } : null;
    const assignment = assignmentSnap.exists ? { id: assignmentSnap.id, ...assignmentSnap.data() } : null;

    const { authorizeAttendanceExtensionActor, validateProposedFinalCutoff } =
      await import("./shared/attendanceExtensionAuthorization.mjs");
    const authorization = authorizeAttendanceExtensionActor({
      isRootAdmin, teacherEmail, classRecord, studentRecord, assignment, requestedClassId: classId,
    });
    if (!authorization.authorized) throw new HttpsError(authorization.reason, authorization.message);

    // Read fresh, inside this transaction — never trust a snapshot the
    // caller's browser might have held onto while another change landed.
    const { assignmentFinalCloseAt } = await import("./shared/sectionDeadline.mjs");
    const currentEffectiveCutoffMs = assignmentFinalCloseAt(assignment, null, studentId);
    const validity = validateProposedFinalCutoff({ proposedLateDueAtMs, currentEffectiveCutoffMs });
    // `allowShorten` bypasses only the expected monotonicity precondition.
    // It can never turn NaN, infinity, or another malformed cutoff into a
    // valid Date (which would otherwise throw after authorization).
    const reviewedShortening = allowShorten && validity.reason === "failed-precondition";
    if (!validity.valid && !reviewedShortening) throw new HttpsError(validity.reason, validity.message);

    const lateDueAtIso = new Date(proposedLateDueAtMs).toISOString();
    transaction.update(
      assignmentRef,
      new FieldPath("studentOverrides", studentId, "lateDueAt"), lateDueAtIso,
      new FieldPath("studentOverrides", studentId, "extension"), {
        ...extension,
        grantedByEmail: teacherEmail,
        grantedAt: Date.now(),
      },
    );

    return { assignmentId, studentId, lateDueAt: lateDueAtIso };
  });
});

function trustedResponseInspectionEvidence(snapshot, {
  assignmentId,
  questionIndex,
  record,
} = {}) {
  if (!snapshot?.exists || !record || typeof record !== "object") return null;
  const data = snapshot.data() || {};
  if (String(data.assignmentId || "") !== String(assignmentId || "")) return null;
  if (Number(data.questionIndex) !== Number(questionIndex)) return null;

  const submissionId = String(record.lastSubmissionId || "");
  if (!submissionId || String(data.submissionId || "") !== submissionId) return null;
  if (Number(data.variantIndex ?? 0) !== Number(record.variantIndex ?? 0)) return null;
  if (
    Number(data.totalAttempts ?? 0)
    !== Number(record.totalAttempts ?? record.attemptCount ?? 0)
  ) return null;

  return data.evidence && typeof data.evidence === "object" ? data.evidence : null;
}

function releaseSignalReason(signal) {
  if (!signal) return null;
  if (typeof signal === "string") return "manual-retry";
  if (typeof signal === "object") return String(signal.reason || "manual-retry");
  return "manual-retry";
}

function progressCheckpointStage(progress, { late = false } = {}) {
  if (!progress?.meaningfulProgress || !progress.total) return null;
  const percentAttempted = Math.round((progress.attempted / progress.total) * 100);
  // Quarter checkpoints keep Classroom useful without turning every answer
  // into an external grade write + student notification. A 100%-attempted
  // checkpoint is still non-final when some questions remain retryable;
  // terminal completion is handled separately as final-complete.
  const checkpoint = Math.max(
    25,
    Math.min(100, Math.floor(percentAttempted / 25) * 25)
  );
  return `${late ? "late-progress" : "progress"}-${checkpoint}`;
}

// The per-student final cutoff, MIRRORING src/assignmentLifecycle.js's
// getAssignmentDate(assignment, 'late', studentId) and functions/shared/
// sectionDeadline.mjs's assignmentFinalCloseAt exactly (same fallback order,
// same field names). Classroom grade passback must never call a student
// "final" earlier than the deadline the student's own dashboard and the
// server's own submission finalizer already honor for them — see
// assignment.studentOverrides[studentId].lateDueAt, written by an
// attendance-driven extension (src/platform/attendance/
// extensionReconciliation.js) and never earlier than the class's own cutoff.
function studentLateDueAt(assignment, studentId) {
  const override = studentId ? assignment?.studentOverrides?.[studentId] : null;
  const classFinal = toDate(
    assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate
  );
  const studentFinal = toDate(override?.lateDueAt || override?.dueAt);
  if (!classFinal) return studentFinal;
  if (!studentFinal) return classFinal;
  return studentFinal.getTime() > classFinal.getTime() ? studentFinal : classFinal;
}

function resolveClassroomGradeStage({ assignment, progress, releaseSignal, nowValue = Date.now(), studentId = null }) {
  const reason = releaseSignalReason(releaseSignal);
  if (reason === "final-deadline") return "final-deadline";
  if (reason === "due-checkpoint") return "due-checkpoint";
  if (reason === "assessment-release") return progress.complete ? "final-complete" : "assessment-release";

  const now = Number(nowValue) || Date.now();
  const dueAt = toDate(assignment?.dueAt || assignment?.dueDate);
  const lateDueAt = studentLateDueAt(assignment, studentId);

  if (progress.complete) return "final-complete";
  if (lateDueAt && now >= lateDueAt.getTime()) return "final-deadline";
  if (reason === "initial-reconcile") {
    if (dueAt && now >= dueAt.getTime()) return "due-checkpoint";
    return progressCheckpointStage(progress);
  }
  if (reason === "manual-retry") {
    return progress.attempted > 0 || (dueAt && now >= dueAt.getTime())
      ? "manual-retry"
      : null;
  }
  if (dueAt && now >= dueAt.getTime()) {
    return progressCheckpointStage(progress, { late: true });
  }
  return progressCheckpointStage(progress);
}

function classroomGradeReleasePolicy({ stage, assignment, nowValue = Date.now() }) {
  const now = Number(nowValue) || Date.now();
  const dueAt = toDate(assignment?.dueAt || assignment?.dueDate);
  const explicitlyStudentVisible = [
    "due-checkpoint",
    "final-complete",
    "final-deadline",
    "assessment-release",
  ].includes(stage);
  const studentVisible = explicitlyStudentVisible
    || String(stage || "").startsWith("late-progress")
    || (stage === "manual-retry" && Boolean(dueAt && now >= dueAt.getTime()));

  return {
    studentVisible,
    assignToStudent: studentVisible,
    shouldReturn: studentVisible,
  };
}

// --- Authentication ---------------------------------------------------------
//
// Two populations sign in to MathMaster and they need different doors.
//
//   Teachers  authenticate with Google (the same account the Classroom
//             integration already uses) or with an email/password account
//             created in the Firebase console. Either way, authorization comes
//             from `teacherDirectory`, never from the client.
//   Students  authenticate with a school Google account when they have one, or
//             with their student ID plus a PIN exchanged here for a Firebase
//             custom token. A student with neither claims their account once
//             using the join code for their class period.
//
// Every function below is the only writer of the `role` and `studentId` custom
// claims that `firestore.rules` reads. Clients can ask for a role; they can
// never assert one.

function translateAuthError(error) {
  if (error instanceof authLib.AuthInputError) {
    return new HttpsError(error.code, error.message, error.details);
  }
  return error;
}

function callerEmail(request) {
  const token = request.auth?.token || {};
  // An unverified email is an identity anyone can claim by signing up with it,
  // so it is never enough to match a teacher or student directory entry.
  if (!token.email || token.email_verified === false) return null;
  try {
    return authLib.normalizeEmail(token.email);
  } catch {
    return null;
  }
}

async function requireTeacher(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before making this change.");
  }
  if (request.auth.token?.role !== "teacher") {
    throw new HttpsError("permission-denied", "Only a teacher can make this change.");
  }
  return request.auth.uid;
}

// The role predicates are pure and shared so the negative cases — a teacher
// carrying forged admin claims, a student asserting a role — are tested
// directly rather than inferred. See tests/platform/rolePolicy.test.mjs.
let rolePolicyModule = null;
async function rolePolicy() {
  if (!rolePolicyModule) rolePolicyModule = await import("./shared/rolePolicy.mjs");
  return rolePolicyModule;
}

async function requireRootAdmin(request) {
  const email = callerEmail(request);
  // `callerEmail` reads the verified token; the predicate re-reads it from the
  // same place rather than trusting a value threaded through, so there is one
  // decision point and one definition of who the administrator is.
  const auth = request.auth ? { ...request.auth, token: { ...(request.auth.token || {}), email } } : null;
  const decision = (await rolePolicy()).authorizeRootAdmin(auth, {
    rootAdminEmail: authLib.ROOT_ADMIN_EMAIL,
  });
  if (!decision.allowed) {
    if (decision.reason === "unauthenticated") {
      throw new HttpsError("unauthenticated", "Sign in before making this administrative change.");
    }
    // Name both addresses. The gate itself is unchanged — this is refused for
    // exactly the same reasons it always was — but "restricted to the root
    // administrator" gave someone on a second account no way to tell whether
    // they were on the wrong account or holding a stale token, so the honest
    // remedy (sign in as the administrator) was indistinguishable from the
    // useless one (sign out and back in on the same account, forever).
    const signedInAs = email ? `You are signed in as ${email}.` : "You are signed in without a verified email address.";
    throw new HttpsError(
      "permission-denied",
      `This action is restricted to the MathMaster root administrator (${authLib.ROOT_ADMIN_EMAIL}). ${signedInAs}`,
    );
  }
  return { uid: request.auth.uid, email };
}

function requireStudent(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before starting My Math Path.");
  }
  const token = request.auth.token || {};
  if (token.role !== "student" || !token.studentId) {
    throw new HttpsError("permission-denied", "My Math Path practice is available to signed-in students.");
  }
  return { uid: request.auth.uid, studentId: String(token.studentId) };
}

/** True when this email may hold the teacher role right now. */
async function isAuthorizedTeacher(db, email) {
  if (!email) return false;
  if (authLib.isRootAdminEmail(email)) return true;
  const snapshot = await db.collection(authLib.TEACHER_COLLECTION).doc(email).get();
  if (snapshot.exists) return snapshot.data()?.active !== false;
  return authLib.bootstrapTeacherEmails().includes(email);
}

async function assignClaims(uid, claims) {
  await getAuth().setCustomUserClaims(uid, claims);
}

// The class model is ESM and shared with the browser, so there is exactly one
// definition of what a class is. Loaded lazily, like the path tool contracts.
let classModelModule = null;
async function classModel() {
  if (!classModelModule) classModelModule = await import("./shared/classModel.mjs");
  return classModelModule;
}

let authorizationModule = null;
async function authorizationContext() {
  if (!authorizationModule) authorizationModule = await import("./shared/authorizationContext.mjs");
  return authorizationModule;
}

const CLASS_COLLECTION = "classes";

// The teacher-readable child records. Each one carries its own authorization
// context, because a rule that joined to the classes collection would need a
// get() per document and Firestore caps that at ten per query.
const AUTHORIZED_CHILD_COLLECTIONS = Object.freeze([
  { path: (studentId) => `grades/${studentId}/evidenceEvents`, label: "evidenceEvents" },
  { path: (studentId) => `grades/${studentId}/scratchpads`, label: "scratchpads" },
]);

/** The class a student is in right now, or null. */
async function loadStudentClass(db, studentData) {
  if (!studentData?.classId) return null;
  const snapshot = await db.collection(CLASS_COLLECTION).doc(studentData.classId).get();
  return snapshot.exists ? { classId: snapshot.id, ...snapshot.data() } : null;
}

/**
 * Move a student's existing records onto their new teacher.
 *
 * Bounded by one student's history and batched, and it runs on a rare
 * administrative action rather than on a read. See the policy note at the top
 * of shared/authorizationContext.mjs: the access list moves, the origin fields
 * never do.
 */
async function reauthorizeStudentRecords(db, studentId, classRecord) {
  const auth = await authorizationContext();
  const points = await classPoints();
  const counts = {};

  const apply = async (docs, computeChange) => {
    let updated = 0;
    for (let index = 0; index < docs.length; index += 400) {
      const chunk = docs.slice(index, index + 400);
      const batch = db.batch();
      let queued = 0;
      chunk.forEach((entry) => {
        const change = computeChange(entry);
        if (!change) return;
        batch.set(entry.ref, change, { merge: true });
        queued += 1;
      });
      if (queued) {
        // eslint-disable-next-line no-await-in-loop
        await batch.commit();
        updated += queued;
      }
    }
    return updated;
  };
  const reauthorizeChange = (entry) => auth.reauthorizeContext(entry.data() || {}, { classRecord });
  const classPointsChange = (entry) => points.reauthorizeClassPointsRecord(entry.data() || {}, { classRecord });

  for (const collectionSpec of AUTHORIZED_CHILD_COLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(collectionSpec.path(studentId)).get();
    // eslint-disable-next-line no-await-in-loop
    counts[collectionSpec.label] = await apply(snapshot.docs, reauthorizeChange);
  }

  // Support/intervention history and archived live-session summaries are
  // top-level collections keyed by event/session, so reauthorization queries by
  // studentId. The historical origin stays frozen; only the access list moves.
  for (const collectionName of ["studentSupportEvents", "studentSessionSummaries", "parentContactLogs"]) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(collectionName).where("studentId", "==", studentId).get();
    // eslint-disable-next-line no-await-in-loop
    counts[collectionName] = await apply(snapshot.docs, (entry) => {
      if (collectionName !== "parentContactLogs") return reauthorizeChange(entry);
      const existing = entry.data() || {};
      // Contacts created before this policy carried createdByEmail/classId;
      // promote those immutable facts to origin metadata during reassignment.
      const withOrigin = {
        ...existing,
        originTeacherEmail: existing.originTeacherEmail || existing.createdByEmail || null,
        originClassId: existing.originClassId ?? existing.classId ?? null,
      };
      const change = auth.reauthorizeContext(withOrigin, { classRecord });
      return change ? {
        ...change,
        originTeacherEmail: withOrigin.originTeacherEmail,
        originClassId: withOrigin.originClassId,
      } : null;
    });
  }

  // Class Points accounts and transactions are scoped to studentId + classId
  // and must never migrate between classes -- a wallet the student earned in
  // a class they have since left stays exactly where it is, readable only by
  // whoever taught them there. Only records for THIS class (whether the call
  // is "the same class got a new teacher of record" or "the student moved
  // here") are ever touched, and `reauthorizeClassPointsRecord` re-checks that
  // itself as a second guard against ever rewriting a record's classId. See
  // functions/shared/classPoints.mjs.
  if (classRecord?.classId) {
    // The account lives at a deterministic id, so it is a direct get() rather
    // than a query -- no composite index needed for the common case.
    const accountRef = db.collection("classPointAccounts").doc(points.accountId(studentId, classRecord.classId));
    const accountSnapshot = await accountRef.get();
    if (accountSnapshot.exists) {
      const change = classPointsChange(accountSnapshot);
      if (change) await accountRef.set(change, { merge: true });
      counts.classPointAccounts = change ? 1 : 0;
    } else {
      counts.classPointAccounts = 0;
    }

    // A student can accumulate many transactions for one class over a school
    // year, so this is a real query -- covered by the existing
    // studentId+classId+createdAt composite index (this is a valid prefix of
    // it) without needing an index of its own.
    const transactionsSnapshot = await db.collection("classPointTransactions")
      .where("studentId", "==", studentId)
      .where("classId", "==", classRecord.classId)
      .get();
    counts.classPointTransactions = await apply(transactionsSnapshot.docs, classPointsChange);
  } else {
    counts.classPointAccounts = 0;
    counts.classPointTransactions = 0;
  }

  // A temporary personal Path recommendation belongs to the current teacher /
  // class context. Clear it on a roster/teacher move instead of silently
  // carrying the old teacher's live intervention into a new class.
  const personalPathRef = db.collection("studentPathInterventions").doc(studentId);
  const personalPathSnapshot = await personalPathRef.get();
  if (personalPathSnapshot.exists) {
    await personalPathRef.delete();
    counts.studentPathInterventions = 1;
  } else {
    counts.studentPathInterventions = 0;
  }

  // The derived per-student documents are single records, not collections.
  for (const collectionName of ["studentMasteryProfiles", "studentRetentionSchedules"]) {
    const ref = db.collection(collectionName).doc(studentId);
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await ref.get();
    if (!snapshot.exists) { counts[collectionName] = 0; continue; }
    const change = auth.reauthorizeContext(snapshot.data() || {}, { classRecord });
    if (change) {
      // eslint-disable-next-line no-await-in-loop
      await ref.set(change, { merge: true });
    }
    counts[collectionName] = change ? 1 : 0;
  }

  return counts;
}

/** Every class, as plain objects. Small collection, read whole. */
async function loadClasses(db) {
  const snapshot = await db.collection(CLASS_COLLECTION).get();
  return snapshot.docs.map((classDoc) => ({ classId: classDoc.id, ...classDoc.data() }));
}

function translateClassError(error) {
  if (error?.name === "ClassInputError") return new HttpsError("invalid-argument", error.message);
  return error;
}

async function writeAdminAudit(db, actor, action, target, details = {}) {
  await db.collection(authLib.ADMIN_AUDIT_COLLECTION).add({
    actorUid: actor.uid,
    actorEmail: actor.email,
    action,
    target,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Creates the `grades` document a student's whole dashboard hangs off of. */
async function ensureStudentRecord(db, studentId, { classId = null, classPeriod = null, assignedTeacherEmail = null } = {}) {
  const ref = db.collection("grades").doc(studentId);
  const snapshot = await ref.get();
  if (snapshot.exists) return snapshot.data() || {};

  const seed = {
    ...(classId ? { classId } : {}),
    classPeriod: classPeriod || "Unassigned",
    ...(assignedTeacherEmail ? { assignedTeacherEmail } : {}),
    profile: {},
    gradesByAssignment: {},
    assignmentActivity: {},
    dolGradesByAssignment: {},
    classworkGradesByAssignment: {},
    supportUsageByAssignment: {},
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set(seed);
  return seed;
}

async function resolveJoinCodeMembership(db, joinCode = {}) {
  const classId = String(joinCode.classId || "").trim();
  const legacyPeriod = String(joinCode.classPeriod || "").trim() || "Unassigned";
  if (!classId) return { classId: null, classPeriod: legacyPeriod, assignedTeacherEmail: null, legacy: true };

  const classSnapshot = await db.collection("classes").doc(classId).get();
  if (!classSnapshot.exists || classSnapshot.data()?.status === "archived") {
    throw new HttpsError("permission-denied", "That class code is no longer active. Ask your teacher for the current one.");
  }
  const classRecord = { classId, ...classSnapshot.data() };
  const model = await classModel();
  return { ...model.membershipFieldsFor(classRecord), legacy: false };
}

function joinCodeMatchesRoster(existing = {}, membership = {}) {
  const existingClassId = String(existing.classId || "").trim();
  if (existingClassId) {
    // A period-only code cannot safely claim a modern class because another
    // class may share the same bell period. Rotate to a class-ID code instead.
    return Boolean(membership.classId && existingClassId === String(membership.classId));
  }
  const period = String(existing.classPeriod || "").trim();
  if (!period || period === "Unassigned") return true;
  return period === String(membership.classPeriod || "");
}

/**
 * Maps the case-insensitive sign-in key to the `grades` document ID that
 * actually holds this student's work.
 *
 * Roster entries predate case-insensitive sign-in, so the first time a key is
 * seen we scan the roster for a case-insensitive match and adopt that document
 * rather than stranding the student's history in a near-duplicate record. The
 * result is cached as an alias, so the scan happens at most once per student.
 */
async function resolveCanonicalStudentId(db, key, typedId) {
  const aliasRef = db.collection(authLib.ALIAS_COLLECTION).doc(key);
  const alias = await aliasRef.get();
  const cached = alias.exists ? alias.data()?.studentId : null;
  if (cached) return cached;

  const roster = await db.collection("grades").select().get();
  const match = roster.docs.find((rosterDoc) => rosterDoc.id.trim().toUpperCase() === key);
  const studentId = match ? match.id : typedId;

  await aliasRef.set({ key, studentId, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  return studentId;
}

async function lookupJoinCode(db, code) {
  const snapshot = await db.collection(authLib.JOIN_CODE_COLLECTION).doc(code).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  if (data.active === false) return null;
  if (data.expiresAt && Number(data.expiresAt) < Date.now()) return null;
  return data;
}

/**
 * Resolves the role of an already-signed-in Firebase user and writes it into
 * custom claims. The client calls this after every Google or password sign-in
 * and then force-refreshes its ID token.
 */
exports.resolveSignedInRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }

  const db = getFirestore();
  const { uid, token } = request.auth;

  // Students who signed in with a custom token already carry their claims.
  if (token.role === "student" && token.studentId) {
    const record = await ensureStudentRecord(db, token.studentId);
    return { role: "student", studentId: token.studentId, classPeriod: record.classPeriod || "Unassigned" };
  }

  const email = callerEmail(request);

  if (await isAuthorizedTeacher(db, email)) {
    const isRootAdmin = authLib.isRootAdminEmail(email);
    const teacherDirectory = isRootAdmin
      ? null
      : await db.collection(authLib.TEACHER_COLLECTION).doc(email).get();
    const assignmentRepairer = teacherDirectory?.data()?.assignmentRepairer === true;
    const nextClaims = isRootAdmin
      ? { role: "teacher", admin: true, rootAdmin: true }
      : { role: "teacher", assignmentRepairer };
    if (
      token.role !== "teacher"
      || Boolean(token.admin) !== isRootAdmin
      || Boolean(token.rootAdmin) !== isRootAdmin
      || Boolean(token.assignmentRepairer) !== assignmentRepairer
    ) {
      await assignClaims(uid, nextClaims);
    }
    await db.collection(authLib.TEACHER_COLLECTION).doc(email).set(
      {
        email,
        active: true,
        accessLevel: isRootAdmin ? "rootAdmin" : "teacher",
        lastSignInAt: FieldValue.serverTimestamp(),
        uid,
      },
      { merge: true },
    );
    return { role: "teacher", email, accessLevel: isRootAdmin ? "rootAdmin" : "teacher", rootAdmin: isRootAdmin, assignmentRepairer };
  }

  if (email) {
    const directory = await db.collection(authLib.DIRECTORY_COLLECTION).doc(email).get();
    const studentId = directory.exists ? directory.data()?.studentId : null;
    if (studentId) {
      const record = await ensureStudentRecord(db, studentId);
      if (token.role !== "student" || token.studentId !== studentId) {
        await assignClaims(uid, { role: "student", studentId });
      }
      return { role: "student", studentId, classPeriod: record.classPeriod || "Unassigned" };
    }
  }

  // Signed in with Google, but we do not yet know who this is on the roster.
  return { role: null, needsLink: true, email };
});

/**
 * One-time link between a Google account and a roster entry. The class join
 * code is what proves the person holding the Google account belongs in that
 * class period.
 */
exports.linkGoogleAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }

  const email = callerEmail(request);
  if (!email) {
    throw new HttpsError(
      "failed-precondition",
      "This account has no verified email address, so it cannot be linked. Sign in with your student ID and PIN instead.",
    );
  }

  const db = getFirestore();
  let typedId;
  let key;
  let code;
  try {
    typedId = authLib.normalizeStudentId(request.data?.studentId);
    key = authLib.studentIdKey(typedId);
    code = authLib.normalizeJoinCode(request.data?.classCode);
  } catch (error) {
    throw translateAuthError(error);
  }

  const joinCode = await lookupJoinCode(db, code);
  if (!joinCode) {
    throw new HttpsError("permission-denied", "That class code is not valid. Ask your teacher for the current one.");
  }

  // Linking may attach Google identity to an EXISTING roster row, but it may
  // never create the row. Resolve against the actual roster before writing an
  // alias so a mistyped/made-up ID leaves no durable identity artifacts.
  const roster = await db.collection("grades").select().get();
  const rosterMatch = roster.docs.find((entry) => entry.id.trim().toUpperCase() === key);
  if (!rosterMatch) {
    throw new HttpsError(
      "failed-precondition",
      "That student ID is not on the MathMaster roster yet. Ask your teacher to add your district student ID before linking Google.",
    );
  }
  const studentId = rosterMatch.id;
  await db.collection(authLib.ALIAS_COLLECTION).doc(key).set(
    { key, studentId, createdAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  const directoryRef = db.collection(authLib.DIRECTORY_COLLECTION).doc(email);
  const existingForStudent = await db
    .collection(authLib.DIRECTORY_COLLECTION)
    .where("studentId", "==", studentId)
    .limit(1)
    .get();

  if (!existingForStudent.empty && existingForStudent.docs[0].id !== email) {
    throw new HttpsError(
      "already-exists",
      "That student ID is already linked to a different Google account. Ask your teacher to unlink it.",
    );
  }

  const joinMembership = await resolveJoinCodeMembership(db, joinCode);
  const rosterSnapshot = await db.collection("grades").doc(studentId).get();
  if (!rosterSnapshot.exists) {
    throw new HttpsError(
      "failed-precondition",
      "That student ID is not on the MathMaster roster yet. Ask your teacher to add your district student ID before linking Google.",
    );
  }
  if (!joinCodeMatchesRoster(rosterSnapshot.data() || {}, joinMembership)) {
    throw new HttpsError("permission-denied", "That class code does not match the class assigned to this student ID.");
  }
  const record = rosterSnapshot.data() || {};
  await directoryRef.set(
    { email, studentId, linkedAt: FieldValue.serverTimestamp(), uid: request.auth.uid },
    { merge: true },
  );
  await db.collection("grades").doc(studentId).set({ linkedEmail: email }, { merge: true });
  await assignClaims(request.auth.uid, { role: "student", studentId });

  return { role: "student", studentId, classPeriod: record.classPeriod || joinCode.classPeriod || "Unassigned" };
});

/**
 * Student ID + PIN sign-in. Returns a Firebase custom token so the rest of the
 * app — and `firestore.rules` — sees an ordinary authenticated user.
 *
 * A student whose account has no PIN yet supplies their class join code and
 * chooses one in the same call, which keeps first-time setup to a single form.
 */
exports.studentSignIn = onCall(async (request) => {
  const db = getFirestore();

  let typedId;
  let key;
  try {
    typedId = authLib.normalizeStudentId(request.data?.studentId);
    key = authLib.studentIdKey(typedId);
  } catch (error) {
    throw translateAuthError(error);
  }

  const passcode = String(request.data?.passcode ?? "").trim();
  const throttleKey = `student_${key}`;
  const throttle = await authLib.checkThrottle(db, throttleKey);
  if (throttle.locked) {
    throw new HttpsError("resource-exhausted", authLib.describeLockout(throttle.retryAfterMs));
  }

  const credentialRef = db.collection(authLib.CREDENTIALS_COLLECTION).doc(key);
  const credentialSnapshot = await credentialRef.get();
  const credential = credentialSnapshot.exists ? credentialSnapshot.data() : null;
  const needsSetup = !credential || credential.resetRequired === true;

  let classPeriod = null;
  let joinMembership = null;

  if (needsSetup) {
    const rawCode = request.data?.classCode;
    if (!rawCode) {
      // Not an error the student caused — the UI reveals the setup fields.
      throw new HttpsError(
        "failed-precondition",
        credential
          ? "Your teacher reset your PIN. Enter your class code and choose a new one."
          : "First time here? Enter your class code and choose a PIN.",
        { reason: "needs-setup" },
      );
    }

    let code;
    let chosenPasscode;
    try {
      code = authLib.normalizeJoinCode(rawCode);
      chosenPasscode = authLib.assertPasscodeShape(passcode);
    } catch (error) {
      throw translateAuthError(error);
    }

    const joinCode = await lookupJoinCode(db, code);
    if (!joinCode) {
      await authLib.recordFailedAttempt(db, throttleKey);
      throw new HttpsError("permission-denied", "That class code is not valid. Ask your teacher for the current one.");
    }

    joinMembership = await resolveJoinCodeMembership(db, joinCode);
    classPeriod = joinMembership.classPeriod || null;
    // If an administrator/teacher already placed this ID on a roster, first-
    // time setup must use that exact class code. A period match is only a
    // compatibility path for roster rows that do not have a classId yet.
    const rosterSnapshot = await db.collection("grades").select("classPeriod", "classId").get();
    const existingRoster = rosterSnapshot.docs.find((entry) => entry.id.trim().toUpperCase() === key);
    if (!existingRoster) {
      throw new HttpsError(
        "failed-precondition",
        "That student ID is not on the MathMaster roster yet. Ask your teacher to add your district student ID before first sign-in.",
      );
    }
    if (!joinCodeMatchesRoster(existingRoster.data() || {}, joinMembership)) {
      await authLib.recordFailedAttempt(db, throttleKey);
      throw new HttpsError("permission-denied", "That class code does not match the class assigned to this student ID.");
    }
    await credentialRef.set({
      studentIdKey: key,
      ...authLib.hashPasscode(chosenPasscode),
      resetRequired: false,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: credential?.createdAt || FieldValue.serverTimestamp(),
    });
  } else if (!authLib.verifyPasscode(passcode, credential)) {
    const result = await authLib.recordFailedAttempt(db, throttleKey);
    if (result.locked) {
      throw new HttpsError("resource-exhausted", authLib.describeLockout(result.retryAfterMs));
    }
    throw new HttpsError(
      "permission-denied",
      `That student ID and PIN do not match. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? "" : "s"} left before a short lockout.`,
    );
  }

  await authLib.clearThrottle(db, throttleKey);
  const studentId = await resolveCanonicalStudentId(db, key, typedId);

  // A deactivated account stops working here, at the point instructional access
  // is granted. Checking it only in the UI would leave the account usable to
  // anyone who kept a session or called the API directly.
  const model = await classModel();
  const existingRecord = await db.collection("grades").doc(studentId).get();
  if (!existingRecord.exists) {
    throw new HttpsError(
      "failed-precondition",
      "That student ID is not on the MathMaster roster. Ask your teacher to add the official district student ID before signing in.",
    );
  }
  if (existingRecord.data()?.status === model.ACCOUNT_STATUS.DISABLED) {
    throw new HttpsError("permission-denied", "This MathMaster account is deactivated. Ask your teacher or campus administrator to reactivate it.");
  }

  const record = existingRecord.data() || {};

  // One Firebase user per student ID, so grades survive across devices.
  const uid = `student:${key}`;
  const claims = { role: "student", studentId };
  try {
    await getAuth().getUser(uid);
    await assignClaims(uid, claims);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    await getAuth().createUser({ uid, displayName: studentId });
    await assignClaims(uid, claims);
  }

  const customToken = await getAuth().createCustomToken(uid, claims);
  return {
    token: customToken,
    studentId,
    classPeriod: record.classPeriod || classPeriod || "Unassigned",
    firstTimeSetup: needsSetup,
  };
});

/** Teacher action: force a student to choose a new PIN at their next sign-in. */
exports.resetStudentPasscode = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();

  let key;
  try {
    key = authLib.studentIdKey(request.data?.studentId);
  } catch (error) {
    throw translateAuthError(error);
  }

  await db.collection(authLib.CREDENTIALS_COLLECTION).doc(key).set(
    {
      studentIdKey: key,
      resetRequired: true,
      hash: FieldValue.delete(),
      salt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  // Clearing the lockout matters: a reset is usually the fix for a student who
  // just locked themselves out, and they should be able to retry immediately.
  await authLib.clearThrottle(db, `student_${key}`);
  return { studentIdKey: key, resetRequired: true };
});

/** Teacher action: unlink a Google account so a student can re-link a new one. */
exports.unlinkStudentAccount = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();

  let studentId;
  try {
    studentId = authLib.normalizeStudentId(request.data?.studentId);
  } catch (error) {
    throw translateAuthError(error);
  }

  const links = await db
    .collection(authLib.DIRECTORY_COLLECTION)
    .where("studentId", "==", studentId)
    .get();

  await Promise.all(
    links.docs.map(async (linkDoc) => {
      const uid = linkDoc.data()?.uid;
      await linkDoc.ref.delete();
      // Drop the claim too, otherwise the old ID token keeps working until it expires.
      if (uid) await assignClaims(uid, {}).catch(() => {});
    }),
  );
  await db.collection("grades").doc(studentId).set({ linkedEmail: FieldValue.delete() }, { merge: true });

  return { studentId, unlinked: links.size };
});

/** Teacher action: rotate the join code for one real class. */
exports.issueClassJoinCode = onCall(async (request) => {
  const uid = await requireTeacher(request);
  const db = getFirestore();
  const teacherEmail = callerEmail(request);
  const isRoot = authLib.isRootAdminEmail(teacherEmail);
  let classId = String(request.data?.classId || "").trim();
  const requestedPeriod = String(request.data?.classPeriod || "").trim();
  let classRecord = null;

  if (classId) {
    const snapshot = await db.collection("classes").doc(classId).get();
    if (!snapshot.exists) throw new HttpsError("not-found", "That MathMaster class no longer exists.");
    classRecord = { classId, ...snapshot.data() };
  } else if (requestedPeriod) {
    // Backward compatibility for an older client is safe only when the period
    // resolves to exactly one class the caller owns. Ambiguous periods must be
    // selected by classId.
    const snapshot = await db.collection("classes").where("period", "==", requestedPeriod).get();
    const matches = snapshot.docs
      .map((doc) => ({ classId: doc.id, ...doc.data() }))
      .filter((entry) => isRoot || String(entry.teacherOfRecord || "").trim().toLowerCase() === teacherEmail);
    if (matches.length === 1) {
      [classRecord] = matches;
      classId = classRecord.classId;
    } else if (matches.length > 1) {
      throw new HttpsError("failed-precondition", "More than one of your classes uses that period. Choose the class by name.");
    }
  }

  if (!classRecord) throw new HttpsError("invalid-argument", "Choose a MathMaster class for this code.");
  if (classRecord.status === "archived") throw new HttpsError("failed-precondition", "Archived classes cannot issue join codes.");
  if (!isRoot && String(classRecord.teacherOfRecord || "").trim().toLowerCase() !== teacherEmail) {
    throw new HttpsError("permission-denied", "You can only issue a join code for a class you teach.");
  }

  const classPeriod = String(classRecord.period || "Unassigned");
  const existing = await db
    .collection(authLib.JOIN_CODE_COLLECTION)
    .where("classId", "==", classId)
    .get();

  let code = authLib.generateJoinCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const collision = await db.collection(authLib.JOIN_CODE_COLLECTION).doc(code).get();
    if (!collision.exists) break;
    code = authLib.generateJoinCode();
  }

  const batch = db.batch();
  existing.docs.forEach((codeDoc) => batch.set(codeDoc.ref, { active: false }, { merge: true }));
  batch.set(db.collection(authLib.JOIN_CODE_COLLECTION).doc(code), {
    code,
    classId,
    className: classRecord.name || null,
    classPeriod,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
  });
  await batch.commit();

  return { code, classId, className: classRecord.name || null, classPeriod };
});

/** Teacher view of the active join code per real class. */
exports.listClassJoinCodes = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const teacherEmail = callerEmail(request);
  const isRoot = authLib.isRootAdminEmail(teacherEmail);
  const [snapshot, classes] = await Promise.all([
    db.collection(authLib.JOIN_CODE_COLLECTION).where("active", "==", true).get(),
    loadClasses(db),
  ]);
  const visibleClassIds = new Set(classes
    .filter((entry) => isRoot || String(entry.teacherOfRecord || "").trim().toLowerCase() === teacherEmail)
    .map((entry) => String(entry.classId)));
  return {
    codes: snapshot.docs
      .map((codeDoc) => ({ code: codeDoc.id, ...(codeDoc.data() || {}) }))
      .filter((entry) => entry.classId ? visibleClassIds.has(String(entry.classId)) : isRoot)
      .map((entry) => ({
        code: entry.code,
        classId: entry.classId || null,
        className: entry.className || null,
        classPeriod: entry.classPeriod || "Unassigned",
      })),
  };
});

/**
 * Teacher view of who can sign in, and how. Roster-centric on purpose: the
 * teacher's question is "can this student on my list get in?", so every student
 * appears whether or not they have set a PIN yet.
 */
exports.listSignInAccess = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const isRootAdmin = request.auth?.token?.rootAdmin === true
    && authLib.isRootAdminEmail(callerEmail(request));
  const [roster, credentials, directory, aliases, teachers, classes] = await Promise.all([
    // Only these fields — the rest of a grades document is the student's
    // entire attempt history and has no business in this payload.
    db.collection("grades").select(
      "classPeriod", "classId", "status", "linkedEmail", "assignedTeacherEmail",
      "displayName", "firstName", "lastName",
    ).get(),
    db.collection(authLib.CREDENTIALS_COLLECTION).get(),
    db.collection(authLib.DIRECTORY_COLLECTION).get(),
    db.collection(authLib.ALIAS_COLLECTION).get(),
    db.collection(authLib.TEACHER_COLLECTION).get(),
    loadClasses(db),
  ]);
  const model = await classModel();
  const canonicalByKey = {};
  aliases.docs.forEach((aliasDoc) => {
    canonicalByKey[aliasDoc.id] = aliasDoc.data()?.studentId || aliasDoc.id;
  });
  const emailByStudent = {};
  directory.docs.forEach((linkDoc) => {
    const studentId = linkDoc.data()?.studentId;
    if (studentId) emailByStudent[studentId] = linkDoc.id;
  });
  const credentialByStudent = {};
  credentials.docs.forEach((credentialDoc) => {
    const studentId = canonicalByKey[credentialDoc.id] || credentialDoc.id;
    credentialByStudent[studentId] = credentialDoc.data() || {};
  });

  // MathMaster structured student names / class-centric account creation v1
  // Structured names are preferred. Old roster rows that only have
  // displayName remain sortable by treating the last word as the surname.
  const sortParts = (student) => {
    const firstName = String(student.firstName || "").trim();
    const lastName = String(student.lastName || "").trim();
    if (firstName || lastName) return { firstName, lastName };
    const parts = String(student.displayName || "").trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] || ""),
      lastName: parts.length > 1 ? parts.at(-1) : "",
    };
  };

  const caller = callerEmail(request);
  const students = roster.docs
    .filter((rosterDoc) => rosterDoc.id !== "test_connection")
    .filter((rosterDoc) => isRootAdmin || String(rosterDoc.data()?.assignedTeacherEmail || "").trim().toLowerCase() === caller)
    .map((rosterDoc) => {
      const credential = credentialByStudent[rosterDoc.id];
      const data = rosterDoc.data() || {};
      return {
        studentId: rosterDoc.id,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        displayName: data.displayName || null,
        classId: data.classId || null,
        classPeriod: data.classPeriod || "Unassigned",
        status: data.status === model.ACCOUNT_STATUS.DISABLED ? model.ACCOUNT_STATUS.DISABLED : model.ACCOUNT_STATUS.ACTIVE,
        assignedTeacherEmail: data.assignedTeacherEmail || null,
        hasPasscode: Boolean(credential?.hash) && credential?.resetRequired !== true,
        resetRequired: credential?.resetRequired === true,
        linkedEmail: emailByStudent[rosterDoc.id] || data.linkedEmail || null,
      };
    })
    .sort((a, b) => {
      const aName = sortParts(a);
      const bName = sortParts(b);
      const options = { sensitivity: "base", numeric: true };
      return aName.lastName.localeCompare(bName.lastName, undefined, options)
        || aName.firstName.localeCompare(bName.firstName, undefined, options)
        || a.studentId.localeCompare(b.studentId, undefined, options);
    });

  return {
    students,
    // The classes every roster row refers to, so no screen has to guess what a
    // classId means or fetch them separately.
    classes: classes
      .filter((entry) => isRootAdmin || String(entry.teacherOfRecord || "").trim().toLowerCase() === caller)
      .sort((a, b) => String(a.period || "").localeCompare(String(b.period || ""), undefined, { numeric: true })
        || String(a.name || "").localeCompare(String(b.name || ""))),
    authority: {
      accessLevel: isRootAdmin ? "rootAdmin" : "teacher",
      isRootAdmin,
      email: callerEmail(request),
    },
    teachers: isRootAdmin ? teachers.docs.map((teacherDoc) => {
      const data = teacherDoc.data() || {};
      return {
        email: teacherDoc.id,
        active: data.active !== false,
        assignmentRepairer: data.assignmentRepairer === true,
        accessLevel: authLib.isRootAdminEmail(teacherDoc.id) ? "rootAdmin" : "teacher",
        hasSignedIn: Boolean(data.uid),
        lastSignInAt: serializableDate(data.lastSignInAt),
      };
    }).sort((a, b) => {
      if (a.accessLevel === "rootAdmin") return -1;
      if (b.accessLevel === "rootAdmin") return 1;
      return a.email.localeCompare(b.email);
    }) : [],
    bootstrapTeachers: isRootAdmin ? authLib.bootstrapTeacherEmails() : [],
  };
});

/** Root-admin action: create a roster/sign-in account shell for a new student. */
exports.createStudentAccount = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  let studentId;
  let studentKey;
  try {
    studentId = authLib.normalizeStudentId(request.data?.studentId);
    studentKey = authLib.studentIdKey(studentId);
  } catch (error) {
    throw translateAuthError(error);
  }
  if (studentId === "test_connection") {
    throw new HttpsError("failed-precondition", "The connection-test ID is reserved.");
  }
  if (!/^\d{1,20}$/.test(studentId)) {
    throw new HttpsError(
      "invalid-argument",
      "New student accounts must use the district SIS student ID (digits only).",
    );
  }

  // MathMaster structured student names / class-centric account creation v1
  // New clients send structured names. Legacy callers that only send
  // displayName are still accepted so old records and old deployments do not
  // become unusable during rollout.
  const cleanName = (value, limit = 80) => String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
  const legacyDisplayName = cleanName(request.data?.displayName, 120);
  let firstName = cleanName(request.data?.firstName);
  let lastName = cleanName(request.data?.lastName);
  if ((!firstName || !lastName) && legacyDisplayName) {
    const parts = legacyDisplayName.split(/\s+/).filter(Boolean);
    if (!firstName) firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] || "");
    if (!lastName && parts.length > 1) lastName = parts.at(-1);
  }
  if ((request.data?.firstName || request.data?.lastName) && (!firstName || !lastName)) {
    throw new HttpsError("invalid-argument", "Enter both the student's first name and last name.");
  }
  const displayName = cleanName([firstName, lastName].filter(Boolean).join(" ") || legacyDisplayName, 120);

  const model = await classModel();
  // A new student is placed by CLASS. The class carries the period and the
  // teacher, so an administrator picks one thing and the three stay consistent.
  let classRecord = null;
  const requestedClassId = String(request.data?.classId || "").trim();
  if (requestedClassId) {
    const classSnapshot = await db.collection(CLASS_COLLECTION).doc(requestedClassId).get();
    if (!classSnapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
    classRecord = { classId: requestedClassId, ...classSnapshot.data() };
    if (classRecord.status === model.CLASS_STATUS.ARCHIVED) {
      throw new HttpsError("failed-precondition", "That class is archived. Choose an active class for a new student.");
    }
    if (!classRecord.teacherOfRecord) {
      throw new HttpsError("failed-precondition", "That class has no teacher of record. Assign a teacher to the class first.");
    }
    if (!(await isAuthorizedTeacher(db, classRecord.teacherOfRecord))) {
      throw new HttpsError("failed-precondition", "That class's teacher of record is not an active MathMaster teacher.");
    }
  }

  const membership = model.membershipFieldsFor(classRecord);
  // Legacy callers may still pass a bare period; honoured only with no class.
  const classPeriod = classRecord
    ? membership.classPeriod
    : String(request.data?.classPeriod || model.UNASSIGNED_PERIOD).trim().slice(0, 80) || model.UNASSIGNED_PERIOD;
  let assignedTeacherEmail = membership.assignedTeacherEmail || null;
  if (!classRecord && request.data?.teacherEmail) {
    try {
      assignedTeacherEmail = authLib.normalizeEmail(request.data.teacherEmail);
    } catch (error) {
      throw translateAuthError(error);
    }
    if (!(await isAuthorizedTeacher(db, assignedTeacherEmail))) {
      throw new HttpsError("failed-precondition", "Assign the student to an active MathMaster teacher.");
    }
  }

  const [aliasSnapshot, rosterSnapshot] = await Promise.all([
    db.collection(authLib.ALIAS_COLLECTION).doc(studentKey).get(),
    db.collection("grades").select().get(),
  ]);
  const caseInsensitiveExisting = rosterSnapshot.docs.find((entry) => entry.id.trim().toUpperCase() === studentKey);
  if (aliasSnapshot.exists || caseInsensitiveExisting) {
    throw new HttpsError("already-exists", "That student ID already exists in MathMaster. Refresh the account list before creating it again.");
  }

  // Creation is one atomic batch. A network or audit failure can no longer
  // leave a roster document behind while the UI reports an INTERNAL error.
  const rosterRef = db.collection("grades").doc(studentId);
  const aliasRef = db.collection(authLib.ALIAS_COLLECTION).doc(studentKey);
  const auditRef = db.collection(authLib.ADMIN_AUDIT_COLLECTION).doc();
  const batch = db.batch();
  batch.set(rosterRef, {
    firstName: firstName || null,
    lastName: lastName || null,
    displayName: displayName || null,
    sisStudentId: studentId,
    sisStudentIdVerifiedAt: FieldValue.serverTimestamp(),
    sisStudentIdVerifiedBy: actor.email,
    classId: membership.classId,
    classPeriod,
    status: model.ACCOUNT_STATUS.ACTIVE,
    assignedTeacherEmail,
    profile: {},
    gradesByAssignment: {},
    assignmentActivity: {},
    dolGradesByAssignment: {},
    classworkGradesByAssignment: {},
    supportUsageByAssignment: {},
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.uid,
  });
  batch.set(aliasRef, {
    key: studentKey,
    studentId,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(auditRef, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: "student_account_created",
    target: studentId,
    details: {
      classId: membership.classId,
      classPeriod,
      assignedTeacherEmail,
      firstName: firstName || null,
      lastName: lastName || null,
      displayName: displayName || null,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    logger.error("createStudentAccount atomic write failed", {
      studentId,
      classId: membership.classId,
      code: error?.code || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    throw new HttpsError(
      "internal",
      "The student account could not be created. The server logged the exact cause so it can be diagnosed without guessing.",
    );
  }

  return {
    studentId,
    firstName: firstName || null,
    lastName: lastName || null,
    displayName: displayName || null,
    classId: membership.classId,
    classPeriod,
    assignedTeacherEmail,
    signInSetupRequired: true,
  };
});

/** Root-admin action: assign/reassign a student to a teacher and class period. */
exports.assignStudentToTeacher = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  let studentId;
  try {
    studentId = authLib.normalizeStudentId(request.data?.studentId);
  } catch (error) {
    throw translateAuthError(error);
  }
  const studentRef = db.collection("grades").doc(studentId);
  const studentSnapshot = await studentRef.get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "That student account is not present in MathMaster.");

  let assignedTeacherEmail = null;
  if (request.data?.teacherEmail) {
    try {
      assignedTeacherEmail = authLib.normalizeEmail(request.data.teacherEmail);
    } catch (error) {
      throw translateAuthError(error);
    }
    if (!(await isAuthorizedTeacher(db, assignedTeacherEmail))) {
      throw new HttpsError("failed-precondition", "The selected teacher is not active in MathMaster.");
    }
  }
  const classPeriod = String(request.data?.classPeriod || studentSnapshot.data()?.classPeriod || "Unassigned").trim().slice(0, 80) || "Unassigned";
  await studentRef.set({ assignedTeacherEmail, classPeriod, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await writeAdminAudit(db, actor, "student_teacher_assignment_changed", studentId, { assignedTeacherEmail, classPeriod });
  return { studentId, assignedTeacherEmail, classPeriod };
});

// --- Classes ------------------------------------------------------------------
//
// A class is the authoritative source for who teaches it, what course it is,
// and which students are in it. Everything below enforces that; no client may
// write the collection directly (see firestore.rules).

/** Every class. Teachers need this to know their own; admins to manage all. */
exports.listClasses = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const classes = await loadClasses(db);
  return {
    classes: classes.sort((a, b) => String(a.period || "").localeCompare(String(b.period || ""))
      || String(a.name || "").localeCompare(String(b.name || ""))),
  };
});

/** Root-admin action: create a class, or edit one. */
exports.saveClass = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const model = await classModel();
  const classId = String(request.data?.classId || "").trim().slice(0, 120);

  const ref = classId ? db.collection(CLASS_COLLECTION).doc(classId) : db.collection(CLASS_COLLECTION).doc();
  const existingSnapshot = classId ? await ref.get() : null;
  if (classId && !existingSnapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
  const existing = existingSnapshot?.data() || null;

  let record;
  try {
    record = model.normalizeClassInput(request.data || {}, { existing });
  } catch (error) {
    throw translateClassError(error);
  }

  // A class may only be handed to a teacher who can actually sign in, or the
  // roster it owns becomes invisible to everyone.
  if (record.teacherOfRecord && !(await isAuthorizedTeacher(db, record.teacherOfRecord))) {
    throw new HttpsError("failed-precondition", `${record.teacherOfRecord} is not an active MathMaster teacher. Add them under Teachers first.`);
  }

  const isNew = !existingSnapshot?.exists;
  await ref.set({
    ...record,
    ...(isNew ? { createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid } : {}),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  }, { merge: true });

  // A class stamps its period and its teacher onto every student in it. Those
  // copies are what the roster query and the security rule read, so a change
  // here has to reach them in the same operation or the two disagree — which is
  // exactly the "admin says one thing, teacher sees another" failure.
  let rostersUpdated = 0;
  const periodChanged = !isNew && existing?.period !== record.period;
  const teacherChanged = !isNew && (existing?.teacherOfRecord || null) !== record.teacherOfRecord;
  if (periodChanged || teacherChanged) {
    const members = await db.collection("grades").where("classId", "==", ref.id).get();
    const batch = db.batch();
    members.docs.forEach((member) => {
      batch.set(member.ref, {
        classPeriod: record.period,
        assignedTeacherEmail: record.teacherOfRecord,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    if (members.size) await batch.commit();
    rostersUpdated = members.size;

    // Handing a class to a different teacher moves every student's records in
    // it, for the same reason moving one student does.
    if (teacherChanged) {
      const moved = { ...record, classId: ref.id };
      for (const member of members.docs) {
        // eslint-disable-next-line no-await-in-loop
        await reauthorizeStudentRecords(db, member.id, moved);
      }
    }
  }

  await writeAdminAudit(db, actor, isNew ? "class_created" : "class_updated", ref.id, { ...record, rostersUpdated });
  return { classId: ref.id, ...record, rostersUpdated };
});

/**
 * Root-admin action: archive a class, or delete an empty one.
 *
 * Deleting a class that still has students would orphan their membership
 * silently, so it is refused with the count and the archive alternative.
 * Archiving keeps the record and every relationship it explains.
 */
exports.setClassStatus = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const model = await classModel();
  const classId = String(request.data?.classId || "").trim();
  const action = String(request.data?.action || "archive").trim();
  if (!classId) throw new HttpsError("invalid-argument", "classId is required.");

  const ref = db.collection(CLASS_COLLECTION).doc(classId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");

  const members = await db.collection("grades").where("classId", "==", classId).select("displayName").get();

  if (action === "delete") {
    if (members.size) {
      throw new HttpsError(
        "failed-precondition",
        `${members.size} student${members.size === 1 ? " is" : "s are"} still in this class. Move them to another class first, or archive this one instead — archiving keeps the record and the history.`,
      );
    }
    await ref.delete();
    await writeAdminAudit(db, actor, "class_deleted", classId, { name: snapshot.data()?.name || null });
    return { classId, deleted: true, memberCount: 0 };
  }

  const status = action === "restore" ? model.CLASS_STATUS.ACTIVE : model.CLASS_STATUS.ARCHIVED;
  await ref.set({ status, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
  await writeAdminAudit(db, actor, status === model.CLASS_STATUS.ARCHIVED ? "class_archived" : "class_restored", classId, { memberCount: members.size });
  return { classId, status, memberCount: members.size };
});

/**
 * Root-admin action: one-time creation of a class per existing period.
 *
 * Every student already carries `classPeriod`, so this is what turns the old
 * eight-string world into real memberships without anyone retyping a roster.
 * Safe to run twice: a period that already has a class is left alone.
 */
exports.migrateClassesFromPeriods = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const model = await classModel();

  // `dryRun` plans and reports without writing, so the same call that gates the
  // deployment can be made safely before making it.
  const dryRun = request.data?.dryRun === true;

  const [existingClasses, profileSnapshot, roster] = await Promise.all([
    loadClasses(db),
    db.collection("settings").doc("courseProfiles").get(),
    db.collection("grades").select("classPeriod", "classId", "assignedTeacherEmail", "status").get(),
  ]);

  const students = roster.docs
    .filter((studentDoc) => studentDoc.id !== "test_connection")
    .map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data() }));

  const plan = model.planPeriodMigration({
    students,
    classes: existingClasses,
    courseProfiles: profileSnapshot.data()?.profiles || {},
  });

  if (!dryRun) {
    if (plan.classesToCreate.length) {
      const batch = db.batch();
      plan.classesToCreate.forEach((record) => {
        batch.set(db.collection(CLASS_COLLECTION).doc(record.classId), {
          ...record,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: actor.uid,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
    }

    // Batched in chunks: a Firestore batch takes 500 writes, and a district
    // roster is bigger than that.
    for (let index = 0; index < plan.studentUpdates.length; index += 400) {
      const chunk = plan.studentUpdates.slice(index, index + 400);
      const batch = db.batch();
      chunk.forEach((update) => {
        batch.set(db.collection("grades").doc(update.studentId), {
          ...update.fields,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }

    await writeAdminAudit(db, actor, "classes_migrated_from_periods", "classes", plan.report);
  }

  return { dryRun, ...plan.report };
});

// --- My Math Path content coverage ---------------------------------------------
//
// A student may only be routed to a standard the secure bank can actually issue
// and grade. This is what makes that knowable before they click, rather than
// discovered as a server error afterwards.

let coverageModule = null;
async function pathCoverage() {
  if (!coverageModule) coverageModule = await import("./shared/pathCoverage.mjs");
  return coverageModule;
}

const COVERAGE_COLLECTION = "pathCoverage";

const PATH_RUNTIME_RELEASE = "path-bank-2026-08-30-r13-asvab-challenge";
const PATH_COURSE_IDS = Object.freeze(["grade6", "grade7", "grade8", "algebra1", "algebra2"]);
const CONTENT_RELEASE_MANIFEST_COLLECTION = "pathContentReleases";
const CONTENT_RELEASE_MANIFEST_DOC = "current";
const COORDINATED_CCMR_RELEASE_SEED_FILES = Object.freeze([
  "digitalSAT_pathQuestionBank_seed.json",
  "act_pathQuestionBank_seed.json",
  "tsia2_pathQuestionBank_seed.json",
]);
const COORDINATED_CCMR_RELEASE_FRAMEWORKS = Object.freeze(["act", "digitalSAT", "tsia2"]);
const RELEASE_MANAGED_ASSESSMENT_FRAMEWORKS = Object.freeze([...COORDINATED_CCMR_RELEASE_FRAMEWORKS, "asvab"]);
const ASVAB_CONTENT_RELEASE = PATH_RUNTIME_RELEASE;

async function loadAssessmentContentReleaseState(db, framework, records = []) {
  const manifestSnapshot = await db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC).get();
  const manifest = manifestSnapshot.exists ? manifestSnapshot.data() : null;
  return pathContentRelease.resolveAssessmentContentReleaseAuthority(records, framework, manifest);
}

function pathQuestionMatchesSessionContentRelease(question, session = {}) {
  const sessionFramework = String(session?.assessmentFramework || "").trim();
  const sessionRelease = String(session?.assessmentContentRelease || "").trim();
  const questionFramework = String(question?.assessmentContext?.framework || "").trim();
  if (!sessionFramework || !sessionRelease || questionFramework !== sessionFramework) return true;
  return String(question?.ccmrContentRelease || "").trim() === sessionRelease;
}

function assessmentReleaseUpdateError(framework) {
  return new HttpsError(
    "unavailable",
    String(framework) + " practice is being updated. Reopen this practice after the release switch completes.",
    { reason: pathContentRelease.RELEASE_UPDATE_REASON, assessmentFramework: framework },
  );
}

let texasStandardsModule = null;
async function texasStandardsRegistry() {
  if (!texasStandardsModule) texasStandardsModule = await import("./shared/texasStandards.mjs");
  return texasStandardsModule;
}

/** Which canonical course owns a Texas standard. */
function coverageCourseIdFor(alignmentKey) {
  const code = String(alignmentKey || "").trim().replace(/^texas:/i, "").toUpperCase();
  if (/^6\./.test(code)) return "grade6";
  if (/^7\./.test(code)) return "grade7";
  if (/^8\./.test(code)) return "grade8";
  if (/^A2\./.test(code)) return "algebra2";
  return "algebra1";
}

function pathDiagnosticId(operation = "path") {
  const safe = String(operation || "path").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "path";
  return `${safe}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function isHttpsCallableError(error) {
  return error instanceof HttpsError || [
    "cancelled", "unknown", "invalid-argument", "deadline-exceeded", "not-found",
    "already-exists", "permission-denied", "resource-exhausted", "failed-precondition",
    "aborted", "out-of-range", "unimplemented", "internal", "unavailable",
    "data-loss", "unauthenticated",
  ].includes(String(error?.code || "").replace(/^functions\//, ""));
}

async function withPathCallableDiagnostics(operation, handler) {
  try {
    return await handler();
  } catch (error) {
    if (isHttpsCallableError(error)) throw error;
    const diagnosticId = pathDiagnosticId(operation);
    logger.error("Unexpected My Math Path callable failure", {
      operation, diagnosticId,
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    throw new HttpsError(
      "internal",
      "My Math Path could not complete this server operation.",
      { reason: "path-runtime-internal", operation, diagnosticId },
    );
  }
}

async function safeBuildTemplateIssuePlan(question, { operation = "path-validation" } = {}) {
  try {
    return await mathPath.buildTemplateIssuePlan(question);
  } catch (error) {
    const diagnosticId = pathDiagnosticId(operation);
    logger.error("Path-bank template validator threw instead of returning a plan", {
      operation, diagnosticId,
      questionId: question?.id || null,
      familyId: question?.familyId || null,
      questionType: question?.questionType || null,
      pathToolId: question?.pathToolId || question?.toolId || question?.tool?.id || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    return {
      issuable: false,
      reason: "validator_exception",
      detail: error?.message || "The production issuer threw while validating this document.",
      diagnosticId,
      samples: 0,
    };
  }
}

function summarizePathRejections(entries = []) {
  const group = (field, fallback = "unknown") => entries.reduce((acc, entry) => {
    const key = String(entry?.[field] || fallback);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    total: entries.length,
    byReason: group("reason"),
    byQuestionType: group("questionType"),
    byTool: group("pathToolId", "field-graded / none"),
    byCourse: group("courseId"),
    byFramework: group("assessmentFramework", "course"),
  };
}

let selectionModule = null;
async function pathSelection() {
  if (!selectionModule) selectionModule = await import("./shared/pathQuestionSelection.mjs");
  return selectionModule;
}

/**
 * Root-admin deployment diagnostic for My Math Path.
 *
 * Firebase Hosting and Cloud Functions are one production release. This
 * handshake reports the server release, secure-bank count, and canonical
 * coverage documents only; no question or answer payload is returned.
 */
exports.getPathRuntimeStatus = onCall(async (request) => {
  await requireRootAdmin(request);
  const db = getFirestore();

  const [bankCountSnapshot, ...coverageSnapshots] = await Promise.all([
    db.collection("pathQuestionBank").count().get(),
    ...PATH_COURSE_IDS.map((courseId) => db.collection(COVERAGE_COLLECTION).doc(courseId).get()),
  ]);

  let starterAvailable = false;
  let starterCount = 0;
  let starterError = null;
  try {
    const items = loadBuiltInStarterPathSeed();
    starterAvailable = items.length > 0;
    starterCount = items.length;
  } catch (error) {
    starterError = error?.message || String(error);
    logger.error("Path runtime status could not read the built-in starter bank", error);
  }

  const coverage = {};
  PATH_COURSE_IDS.forEach((courseId, index) => {
    const snapshot = coverageSnapshots[index];
    coverage[courseId] = snapshot.exists ? {
      summary: snapshot.data()?.summary || null,
      generatedAt: snapshot.data()?.generatedAt || null,
      schemaVersion: snapshot.data()?.schemaVersion || null,
    } : null;
  });

  return {
    release: PATH_RUNTIME_RELEASE,
    sourceOfTruth: "secure-path-bank + canonical-texas-standards + production-issuer",
    teacherAssignmentsAffectCoverage: false,
    bankCount: bankCountSnapshot.data().count || 0,
    starterAvailable,
    starterCount,
    starterError,
    courseIds: PATH_COURSE_IDS,
    coverage,
  };
});

/**
 * Legacy compatibility endpoint.
 *
 * Teacher assignments are no longer a Path coverage source. Keeping the
 * endpoint as an explicit retirement message is safer than deleting it while
 * an older browser may still have the action cached.
 */
exports.promoteQuestionToPathBank = onCall(async (request) => {
  await requireTeacher(request);
  throw new HttpsError(
    "failed-precondition",
    "Assignment-to-Path promotion has been retired. My Math Path coverage is built only from the secure Path bank and canonical standards. Use Administration → My Math Path content coverage to manage bank content.",
    { reason: "assignment-path-promotion-retired" },
  );
});

/**
 * Validate and optionally write one complete Path-bank seed package.
 *
 * Kept as an internal helper so both the manual root-admin importer and the
 * built-in starter-bank initializer pass through the exact same production
 * issuability gate. The caller must already be authorized.
 */
async function processPathSeedImport({ db, actor, items, dryRun = false }) {
  const accepted = [];
  const rejected = [];
  for (const item of items) {
    const id = String(item?.id || "").trim();
    const standards = (Array.isArray(item?.alignmentKeys) ? item.alignmentKeys : [])
      .map((key) => String(key).replace(/^texas:/i, "").toUpperCase());
    const describe = (reason, plan = {}) => ({
      id: id || null,
      familyId: item?.familyId || null,
      standards,
      courseId: item?.courseId || coverageCourseIdFor(standards[0] || ""),
      assessmentFramework: item?.assessmentContext?.framework || item?.assessmentFramework || null,
      questionType: item?.questionType || "response",
      pathToolId: item?.pathToolId || item?.toolId || item?.tool?.id || null,
      reason: reason || "not_issuable",
      detail: plan?.detail || null,
      diagnosticId: plan?.diagnosticId || null,
    });
    if (!id) { rejected.push(describe("missing_id")); continue; }
    if (!standards.length) { rejected.push(describe("no_alignment_keys")); continue; }

    // Compile the record into the EXACT object that will be stored, and refuse
    // it here if that object is not legal Firestore data. This used to be a
    // best-effort sanitizer whose output nothing checked, so a document that
    // still nested an array reached the write pass and failed the whole batch
    // with "Property array contains an invalid nested entity" — naming no
    // document, no property and no course. The compiler names all three.
    const compiled = compilePathRecordForStorage({ ...item, id, active: item.active !== false });
    if (!compiled.ok) {
      const first = compiled.errors[0];
      rejected.push({
        ...describe("firestore_shape", { detail: first?.message || null }),
        propertyPath: first?.path || null,
        compilerCode: first?.code || null,
      });
      continue;
    }

    // Validate the thing a student will actually receive — and validate the
    // COMPILED document, because that is what production stores and reads back.
    // A bad template is a rejected document, not an exception that aborts
    // diagnosis of the other 5,000 documents.
    // eslint-disable-next-line no-await-in-loop
    const plan = await safeBuildTemplateIssuePlan(compiled.document, { operation: "seed-import-validation" });
    if (!plan.issuable) { rejected.push(describe(plan.reason, plan)); continue; }
    accepted.push(compiled.document);
  }

  const rejectionSummary = summarizePathRejections(rejected);

  // ALL OR NOTHING. The validation pass returns every actionable rejection and
  // writes nothing until the complete package is clean.
  if (rejected.length) {
    return {
      dryRun,
      imported: false,
      phase: "validation",
      received: items.length,
      accepted: 0,
      wouldAccept: accepted.length,
      rejected,
      rejectionSummary,
      standards: [],
    };
  }

  if (!dryRun && accepted.length) {
    for (let index = 0; index < accepted.length; index += 400) {
      const chunk = accepted.slice(index, index + 400);
      const batch = db.batch();
      chunk.forEach((record) => {
        const { id: recordId, ...fields } = record;
        // The bank package is authoritative. `merge:true` used to leave fields
        // from an older question shape behind when a question changed type, so
        // a refresh could report success while Firestore still contained stale
        // tool/grading metadata. Replace the document instead.
        batch.set(db.collection("pathQuestionBank").doc(recordId), {
          ...fields,
          seededAt: FieldValue.serverTimestamp(),
          seededBy: actor.uid,
        });
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
    await writeAdminAudit(db, actor, "path_bank_seeded", "pathQuestionBank", {
      accepted: accepted.length,
      rejected: 0,
      replacementWrites: true,
    });
  }

  return {
    dryRun,
    imported: !dryRun,
    phase: dryRun ? "validation" : "write",
    received: items.length,
    accepted: accepted.length,
    wouldAccept: accepted.length,
    rejected,
    rejectionSummary,
    standards: [...new Set(accepted.flatMap((record) => record.alignmentKeys.map((key) => String(key).replace(/^texas:/i, "").toUpperCase())))].sort(),
  };
}

/**
 * Root-admin action: bootstrap the secure Path bank from a seed package chosen
 * by the administrator.
 *
 * The browser may send a custom package here, but every document is validated
 * before any write. `dryRun` supports the client's package-wide two-pass check
 * when a custom package is larger than one callable chunk.
 */
exports.seedPathQuestionBank = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const dryRun = request.data?.dryRun === true;
  const items = Array.isArray(request.data?.items) ? request.data.items : [];
  if (!items.length) throw new HttpsError("invalid-argument", "Supply the seed items to import.");
  if (items.length > 600) throw new HttpsError("invalid-argument", "Import at most 600 items per call.");

  // Dry-run stays available for package authoring, but released SAT/ACT/TSIA2
  // content may only be written by the atomic coordinated refresh. Allowing a
  // generic write here could change the bank without moving the release
  // manifest and would make active sessions observe an impossible mixed state.
  if (!dryRun) {
    const attemptedProtectedFrameworks = [...new Set(items
      .map((item) => String(item?.assessmentContext?.framework || "").trim())
      .filter((framework) => RELEASE_MANAGED_ASSESSMENT_FRAMEWORKS.includes(framework)))].sort();
    if (attemptedProtectedFrameworks.length) {
      throw new HttpsError(
        "failed-precondition",
        "Release-managed assessment content (" + attemptedProtectedFrameworks.join(", ") + ") cannot be written by the generic Path seed importer. Use the dedicated course/ASVAB/CCMR release refresh controls.",
      );
    }
  }
  return processPathSeedImport({ db, actor, items, dryRun });
});

const BUILT_IN_COURSE_PATH_SEED_FILES = Object.freeze([
  "algebra1_pathQuestionBank_seed.json",
  "algebra2_pathQuestionBank_seed.json",
  // Reachable middle-school prerequisite packages.
  "grade6_pathQuestionBank_seed.json",
  "grade7_pathQuestionBank_seed.json",
  "grade8_pathQuestionBank_seed.json",
]);
const ASVAB_PATH_SEED_FILE = "asvab_pathQuestionBank_seed.json";
const BUILT_IN_PATH_SEED_FILES = Object.freeze([
  ...BUILT_IN_COURSE_PATH_SEED_FILES,
  "digitalSAT_pathQuestionBank_seed.json",
  "act_pathQuestionBank_seed.json",
  "tsia2_pathQuestionBank_seed.json",
  ASVAB_PATH_SEED_FILE,
]);

const BUILT_IN_PATH_SEED_MARKER = "mathmaster-built-in-path-bank";
const LEGACY_BUILT_IN_PATH_SEED_SOURCE = "MathMaster curated starter coverage";

let builtInStarterPathSeedCache = null;
function loadBuiltInStarterPathSeed() {
  if (builtInStarterPathSeedCache) return builtInStarterPathSeedCache;
  const seedDirectory = path.join(__dirname, "seeds", "pathQuestionBank");
  const items = BUILT_IN_PATH_SEED_FILES.flatMap((fileName) => {
    const filePath = path.join(seedDirectory, fileName);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  });
  if (!items.length) throw new Error("The built-in Path starter bank is empty.");
  const ids = new Set(items.map((item) => String(item?.id || "").trim()));
  if (ids.size !== items.length || ids.has("")) throw new Error("The built-in Path starter bank contains missing or duplicate IDs.");
  builtInStarterPathSeedCache = items;
  return builtInStarterPathSeedCache;
}

let builtInCoursePathSeedCache = null;
function loadBuiltInCoursePathSeed() {
  if (builtInCoursePathSeedCache) return builtInCoursePathSeedCache;
  const seedDirectory = path.join(__dirname, "seeds", "pathQuestionBank");
  const items = BUILT_IN_COURSE_PATH_SEED_FILES.flatMap((fileName) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(seedDirectory, fileName), "utf8"));
    return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  });
  if (!items.length) throw new Error("The built-in course Path bank is empty.");
  const ids = new Set(items.map((item) => String(item?.id || "").trim()));
  if (ids.size !== items.length || ids.has("")) throw new Error("The built-in course Path bank contains missing or duplicate IDs.");
  builtInCoursePathSeedCache = items;
  return builtInCoursePathSeedCache;
}

let builtInAsvabPathSeedCache = null;
function loadBuiltInAsvabPathSeed() {
  if (builtInAsvabPathSeedCache) return builtInAsvabPathSeedCache;
  const filePath = path.join(__dirname, "seeds", "pathQuestionBank", ASVAB_PATH_SEED_FILE);
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const items = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  if (!items.length) throw new Error("The built-in ASVAB Path bank is empty.");
  const ids = new Set(items.map((item) => String(item?.id || "").trim()));
  if (ids.size !== items.length || ids.has("")) throw new Error("The built-in ASVAB Path bank contains missing or duplicate IDs.");
  builtInAsvabPathSeedCache = items;
  return builtInAsvabPathSeedCache;
}

function loadCoordinatedCcmrReleaseSeed() {
  const seedDirectory = path.join(__dirname, "seeds", "pathQuestionBank");
  const items = COORDINATED_CCMR_RELEASE_SEED_FILES.flatMap((fileName) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(seedDirectory, fileName), "utf8"));
    return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  });
  if (!items.length) throw new Error("The coordinated CCMR release package is empty.");
  const ids = new Set(items.map((item) => String(item?.id || "").trim()));
  if (ids.size !== items.length || ids.has("")) throw new Error("The coordinated CCMR release package contains missing or duplicate IDs.");
  return items;
}

async function removeSupersededBuiltInPathSeedRecords(db, currentItems) {
  const currentIds = new Set(currentItems.map((item) => String(item?.id || "").trim()).filter(Boolean));
  const snapshot = await db.collection("pathQuestionBank").get();
  const obsolete = snapshot.docs.filter((doc) => {
    if (currentIds.has(doc.id)) return false;
    const data = doc.data() || {};
    return data.builtInPathSeed === BUILT_IN_PATH_SEED_MARKER
      || data?.seedMetadata?.source === LEGACY_BUILT_IN_PATH_SEED_SOURCE;
  });

  for (let index = 0; index < obsolete.length; index += 400) {
    const batch = db.batch();
    obsolete.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return obsolete.length;
}

async function removeSupersededBuiltInCourseSeedRecords(db, currentItems) {
  const currentIds = new Set(currentItems.map((item) => String(item?.id || "").trim()).filter(Boolean));
  const snapshot = await db.collection("pathQuestionBank").get();
  const obsolete = snapshot.docs.filter((doc) => {
    if (currentIds.has(doc.id)) return false;
    const data = doc.data() || {};
    const framework = String(data?.assessmentContext?.framework || "course");
    if (framework !== "course") return false;
    return data.builtInPathSeed === BUILT_IN_PATH_SEED_MARKER
      || data?.seedMetadata?.source === LEGACY_BUILT_IN_PATH_SEED_SOURCE;
  });

  for (let index = 0; index < obsolete.length; index += 400) {
    const batch = db.batch();
    obsolete.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return obsolete.length;
}

async function removeSupersededBuiltInAssessmentSeedRecords(db, currentItems, frameworks) {
  const currentIds = new Set(currentItems.map((item) => String(item?.id || "").trim()).filter(Boolean));
  const frameworkSet = new Set((Array.isArray(frameworks) ? frameworks : []).map(String));
  const snapshot = await db.collection("pathQuestionBank").get();
  const obsolete = snapshot.docs.filter((doc) => {
    if (currentIds.has(doc.id)) return false;
    const data = doc.data() || {};
    const framework = String(data?.assessmentContext?.framework || "");
    if (!frameworkSet.has(framework)) return false;
    return data.builtInPathSeed === BUILT_IN_PATH_SEED_MARKER
      || data?.seedMetadata?.source === LEGACY_BUILT_IN_PATH_SEED_SOURCE;
  });

  for (let index = 0; index < obsolete.length; index += 400) {
    const batch = db.batch();
    obsolete.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return obsolete.length;
}

/**
 * Rebuild stored coverage from the actual secure bank.
 */
async function canonicalPathStandardsForCourse(courseId) {
  const registry = await texasStandardsRegistry();
  return registry.getTexasStandardsForCourse(courseId)
    .filter((standard) => standard.classification !== "process")
    .map((standard) => standard.code);
}

/** Rebuild stored coverage from the secure bank and the canonical Texas registry. */
async function rebuildStoredPathCoverage(db, { courses = PATH_COURSE_IDS } = {}) {
  const coverage = await pathCoverage();
  const validCourses = [...new Set(courses.map(String))].filter((courseId) => PATH_COURSE_IDS.includes(courseId));
  if (!validCourses.length) throw new HttpsError("invalid-argument", "Choose at least one supported Math Path course.");

  const snapshot = await db.collection("pathQuestionBank").get();
  const bankItems = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => pathQuestionMatchesFramework(item, null));
  const plans = {};
  for (const item of bankItems) {
    // eslint-disable-next-line no-await-in-loop
    plans[item.id] = await safeBuildTemplateIssuePlan(item, { operation: "coverage-rebuild" });
  }

  const indexes = {};
  for (const courseId of validCourses) {
    // THE COURSE MAP IS SERVER-AUTHORITATIVE. Teacher assignments and browser
    // wheel configuration do not choose which standards count as coverage.
    // eslint-disable-next-line no-await-in-loop
    const wheelTeks = await canonicalPathStandardsForCourse(courseId);
    if (!wheelTeks.length) throw new HttpsError("failed-precondition", `No canonical Texas standards are registered for ${courseId}.`);
    const index = coverage.buildCoverageIndex({
      courseId,
      wheelTeks,
      bankItems,
      plans,
      generatedAt: Date.now(),
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COVERAGE_COLLECTION).doc(courseId).set(index);
    indexes[courseId] = index;
  }
  return {
    courses: validCourses,
    sourceOfTruth: "canonical-texas-standards + secure-path-bank + production-issuer",
    indexes,
  };
}

async function livePathSkillIsLaunchable(db, targetAlignmentKey) {
  const coverage = await pathCoverage();
  const snapshot = await db.collection("pathQuestionBank")
    .where("alignmentKeys", "array-contains", targetAlignmentKey)
    .get();
  const bankItems = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => pathQuestionMatchesFramework(item, null));
  const plans = {};
  for (const item of bankItems) {
    // eslint-disable-next-line no-await-in-loop
    plans[item.id] = await safeBuildTemplateIssuePlan(item, { operation: "live-coverage-check" });
  }
  const index = coverage.buildCoverageIndex({
    courseId: coverageCourseIdFor(targetAlignmentKey),
    wheelTeks: [coverage.coverageKey(targetAlignmentKey)],
    bankItems,
    plans,
    generatedAt: Date.now(),
  });
  return coverage.isSkillLaunchable(index, targetAlignmentKey);
}

/**
 * Root-admin one-click initializer for a fresh MathMaster installation.
 *
 * SECURITY: the answer-bearing starter JSON files live inside the Cloud
 * Functions bundle, never `public/` and never the browser JavaScript bundle.
 * A student therefore cannot download the seed answer key from Hosting. Only
 * the root-admin callable can ask the server to install it, and the client gets
 * counts/status back rather than the seed contents.
 */
exports.initializeStarterPathQuestionBank = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();

  // This callable installs the complete built-in starter package, including
  // legacy ASVAB content. It must never double as a live-bank refresh because
  // SAT, ACT, and TSIA2 now have their own atomic release protocol. The only
  // non-empty-bank exception is a retry of this exact initializer after a
  // failed fresh installation left the release manifest intentionally held.
  const manifestRef = db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC);
  const [existingBank, existingManifestSnapshot] = await Promise.all([
    db.collection("pathQuestionBank").limit(1).get(),
    manifestRef.get(),
  ]);
  const existingManifest = existingManifestSnapshot.exists ? existingManifestSnapshot.data() : {};
  const retryingFailedStarterInitialization = !existingBank.empty
    && existingManifest?.status === "updating"
    && existingManifest?.updateOperation === "starter-initialization";
  if (!existingBank.empty && !retryingFailedStarterInitialization) {
    throw new HttpsError(
      "failed-precondition",
      "Starter Path-bank initialization is fresh-install-only. Use the dedicated bank refresh controls on an existing installation.",
    );
  }

  let items;
  try {
    items = loadBuiltInStarterPathSeed();
  } catch (error) {
    logger.error("Could not load built-in My Math Path starter bank", error);
    throw new HttpsError("failed-precondition", "The built-in My Math Path starter bank is unavailable in this deployment.");
  }
  // The built-in package is loaded on the server, so it is not constrained by
  // the browser callable payload limit used by custom imports. Firestore writes
  // are already chunked inside processPathSeedImport. Tag the current built-in
  // package so a later refresh can retire superseded bundled questions without
  // touching teacher-promoted or custom Path-bank content.
  const taggedItems = items.map((item) => ({
    ...item,
    builtInPathSeed: BUILT_IN_PATH_SEED_MARKER,
    builtInPathSeedRelease: PATH_RUNTIME_RELEASE,
  }));

  // Validate the whole starter package before closing tracked assessment
  // issuance. ASVAB intentionally remains outside this release manifest.
  const validation = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: true });
  if (validation.rejected?.length || validation.wouldAccept !== taggedItems.length) {
    return { ...validation, phase: "validation" };
  }
  const discoveredReleases = pathContentRelease.collectAssessmentContentReleases(taggedItems);
  const expectedFrameworks = [...COORDINATED_CCMR_RELEASE_FRAMEWORKS].sort();
  const pendingReleases = Object.fromEntries(expectedFrameworks
    .map((framework) => [framework, discoveredReleases[framework]])
    .filter(([, release]) => Boolean(release)));
  if (Object.keys(pendingReleases).length !== expectedFrameworks.length) {
    throw new HttpsError(
      "failed-precondition",
      "The starter package must contain release metadata for ACT, Digital SAT, and TSIA2 before installation.",
    );
  }

  const updatingManifest = pathContentRelease.beginAssessmentContentReleaseUpdate(
    retryingFailedStarterInitialization ? existingManifest : {},
    pendingReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...updatingManifest,
    updateOperation: "starter-initialization",
    updatedBy: actor.uid,
  });

  // If any write or cleanup fails after this point, the manifest stays in
  // updating state and this same callable may safely resume the failed starter
  // installation. New SAT/ACT/TSIA2 issuance remains held in the meantime.
  const seed = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: false });
  if (!seed.imported) {
    throw new HttpsError("failed-precondition", "The starter Path bank failed its write-time validation; tracked assessment issuance remains held.");
  }
  const removedSuperseded = await removeSupersededBuiltInPathSeedRecords(db, taggedItems);
  const coverage = await rebuildStoredPathCoverage(db);
  const { retireStaleTsia2PathStateForRelease } = await import("./shared/pathBankRelease.mjs");
  const tsia2PathBankRelease = await retireStaleTsia2PathStateForRelease(db);

  const activeManifest = pathContentRelease.completeAssessmentContentReleaseUpdate(
    updatingManifest,
    pendingReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...activeManifest,
    updateOperation: "starter-initialization",
    updatedBy: actor.uid,
  });
  return { ...seed, phase: "complete", removedSuperseded, coverage, tsia2PathBankRelease, assessmentContentReleases: pendingReleases };
});

/**
 * Root-admin refresh for built-in COURSE Path content on an existing installation.
 *
 * Only Grade 6/7/8 + Algebra I/II bundled records are replaced. Assessment
 * frameworks are deliberately excluded so this operation cannot disturb
 * Digital SAT, ACT, TSIA2, or ASVAB releases.
 */
exports.refreshBuiltInCoursePathBank = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  let items;
  try {
    items = loadBuiltInCoursePathSeed();
  } catch (error) {
    logger.error("Could not load built-in course Path bank", error);
    throw new HttpsError("failed-precondition", "The built-in course Path bank is unavailable in this deployment.");
  }

  const taggedItems = items.map((item) => ({
    ...item,
    builtInPathSeed: BUILT_IN_PATH_SEED_MARKER,
    builtInPathSeedRelease: PATH_RUNTIME_RELEASE,
  }));
  const validation = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: true });
  if (validation.rejected?.length || validation.wouldAccept !== taggedItems.length) {
    return { ...validation, phase: "validation" };
  }
  const seed = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: false });
  if (!seed.imported) {
    throw new HttpsError("failed-precondition", "The built-in course Path bank failed its write-time validation.");
  }
  const removedSuperseded = await removeSupersededBuiltInCourseSeedRecords(db, taggedItems);
  const coverage = await rebuildStoredPathCoverage(db);
  await writeAdminAudit(db, actor, "course_path_bank_refreshed", "pathQuestionBank", {
    accepted: seed.accepted,
    removedSuperseded,
    release: PATH_RUNTIME_RELEASE,
  });
  return { ...seed, phase: "complete", removedSuperseded, coverage, release: PATH_RUNTIME_RELEASE };
});

/**
 * Root-admin ASVAB release refresh.
 *
 * ASVAB stays independent from the coordinated SAT/ACT/TSIA2 package, but is
 * tracked in the same release manifest so stale sessions cannot mix releases.
 */
exports.refreshReleasedAsvabPathBank = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  let items;
  try {
    items = loadBuiltInAsvabPathSeed();
  } catch (error) {
    logger.error("Could not load built-in ASVAB Path bank", error);
    throw new HttpsError("failed-precondition", "The built-in ASVAB Path bank is unavailable in this deployment.");
  }

  const taggedItems = items.map((item) => ({
    ...item,
    builtInPathSeed: BUILT_IN_PATH_SEED_MARKER,
    builtInPathSeedRelease: PATH_RUNTIME_RELEASE,
    ccmrContentRelease: ASVAB_CONTENT_RELEASE,
  }));
  const validation = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: true });
  if (validation.rejected?.length || validation.wouldAccept !== taggedItems.length) {
    return { ...validation, phase: "validation", release: ASVAB_CONTENT_RELEASE };
  }

  const manifestRef = db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC);
  const manifestSnapshot = await manifestRef.get();
  const currentManifest = manifestSnapshot.exists ? manifestSnapshot.data() : {};
  const retryingAsvabRefresh = currentManifest?.status === "updating"
    && currentManifest?.updateOperation === "asvab-refresh";
  if (currentManifest?.status === "updating" && !retryingAsvabRefresh) {
    throw new HttpsError(
      "failed-precondition",
      "Another assessment-bank update is already in progress. Finish or recover that operation before refreshing ASVAB.",
    );
  }
  if (retryingAsvabRefresh
      && String(currentManifest?.pendingReleases?.asvab || "") !== ASVAB_CONTENT_RELEASE) {
    throw new HttpsError(
      "failed-precondition",
      "The held ASVAB refresh targets a different release. Redeploy the matching release before retrying.",
    );
  }

  const pendingReleases = { asvab: ASVAB_CONTENT_RELEASE };
  const updatingManifest = pathContentRelease.beginAssessmentContentReleaseUpdate(
    currentManifest,
    pendingReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...updatingManifest,
    updateOperation: "asvab-refresh",
    updatedBy: actor.uid,
  });

  const seed = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: false });
  if (!seed.imported) {
    throw new HttpsError("failed-precondition", "The ASVAB Path bank failed its write-time validation; assessment issuance remains held.");
  }
  const removedSuperseded = await removeSupersededBuiltInAssessmentSeedRecords(db, taggedItems, ["asvab"]);
  const activatedReleases = {
    ...(currentManifest?.activeReleases || {}),
    asvab: ASVAB_CONTENT_RELEASE,
  };
  const activeManifest = pathContentRelease.completeAssessmentContentReleaseUpdate(
    updatingManifest,
    activatedReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...activeManifest,
    updateOperation: "asvab-refresh",
    updatedBy: actor.uid,
  });
  await writeAdminAudit(db, actor, "asvab_path_bank_refreshed", CONTENT_RELEASE_MANIFEST_COLLECTION, {
    release: ASVAB_CONTENT_RELEASE,
    accepted: seed.accepted,
    removedSuperseded,
  });
  return {
    ...seed,
    phase: "complete",
    release: ASVAB_CONTENT_RELEASE,
    manifestStatus: activeManifest.status,
    removedSuperseded,
  };
});

/**
 * Root-admin coordinated assessment-bank refresh.
 *
 * This deliberately loads only Digital SAT, ACT, and TSIA2. ASVAB remains on
 * its existing release until it is separately authored and promoted. The
 * manifest enters "updating" before the first Firestore bank mutation and is
 * activated only after all writes and selective cleanup finish. A failure in
 * between therefore leaves assessment issuance held rather than mixed.
 */
exports.refreshReleasedCcmrPathBanks = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  let items;
  try {
    items = loadCoordinatedCcmrReleaseSeed();
  } catch (error) {
    logger.error("Could not load coordinated CCMR release package", error);
    throw new HttpsError("failed-precondition", "The coordinated CCMR release package is unavailable in this deployment.");
  }

  const taggedItems = items.map((item) => ({
    ...item,
    builtInPathSeed: BUILT_IN_PATH_SEED_MARKER,
    builtInPathSeedRelease: PATH_RUNTIME_RELEASE,
  }));
  const pendingReleases = pathContentRelease.collectAssessmentContentReleases(taggedItems);
  const expectedFrameworks = [...COORDINATED_CCMR_RELEASE_FRAMEWORKS].sort();
  const actualFrameworks = Object.keys(pendingReleases).sort();
  if (JSON.stringify(actualFrameworks) !== JSON.stringify(expectedFrameworks)) {
    throw new HttpsError(
      "failed-precondition",
      "The coordinated CCMR package must contain exactly " + expectedFrameworks.join(", ") + "; found " + (actualFrameworks.join(", ") || "none") + ".",
    );
  }

  // First pass is intentionally read-only. The manifest does not close student
  // issuance unless all 1,000 assessment documents pass the production issuer.
  const validation = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: true });
  if (validation.rejected?.length || validation.wouldAccept !== taggedItems.length) {
    return { ...validation, phase: "validation", pendingReleases };
  }

  const manifestRef = db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC);
  const manifestSnapshot = await manifestRef.get();
  const currentManifest = manifestSnapshot.exists ? manifestSnapshot.data() : {};
  const retryingCoordinatedRefresh = currentManifest?.status === "updating"
    && currentManifest?.updateOperation === "coordinated-refresh";
  if (currentManifest?.status === "updating" && !retryingCoordinatedRefresh) {
    throw new HttpsError(
      "failed-precondition",
      "Another assessment-bank update is already in progress. Finish or recover that operation before starting the coordinated CCMR refresh.",
    );
  }

  const normalizeReleaseEntries = (value) => Object.entries(value || {})
    .map(([framework, release]) => [String(framework).trim(), String(release || "").trim()])
    .filter(([framework, release]) => framework && release)
    .sort(([left], [right]) => left.localeCompare(right));
  const samePendingRelease = JSON.stringify(normalizeReleaseEntries(currentManifest?.pendingReleases))
    === JSON.stringify(normalizeReleaseEntries(pendingReleases));
  if (retryingCoordinatedRefresh && !samePendingRelease) {
    throw new HttpsError(
      "failed-precondition",
      "The held CCMR refresh targets a different pending content release. Redeploy the matching release package or recover the held update before retrying.",
    );
  }

  const updatingManifest = pathContentRelease.beginAssessmentContentReleaseUpdate(
    currentManifest,
    pendingReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...updatingManifest,
    updateOperation: "coordinated-refresh",
    updatedBy: actor.uid,
  });

  // A second validation inside processPathSeedImport protects the write itself.
  // If anything fails from this point onward, the manifest intentionally stays
  // in "updating" so no new assessment question is issued from a partial bank.
  const seed = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: false });
  if (!seed.imported) {
    throw new HttpsError("failed-precondition", "The coordinated CCMR bank failed its write-time validation; assessment issuance remains held.");
  }

  const removedSuperseded = await removeSupersededBuiltInAssessmentSeedRecords(
    db,
    taggedItems,
    expectedFrameworks,
  );
  const { retireStaleTsia2PathStateForRelease } = await import("./shared/pathBankRelease.mjs");
  const tsia2PathBankRelease = await retireStaleTsia2PathStateForRelease(db);

  const activatedReleases = {
    ...(currentManifest?.activeReleases || {}),
    ...pendingReleases,
  };
  const activeManifest = pathContentRelease.completeAssessmentContentReleaseUpdate(
    updatingManifest,
    activatedReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...activeManifest,
    updateOperation: "coordinated-refresh",
    updatedBy: actor.uid,
  });
  await writeAdminAudit(db, actor, "ccmr_path_banks_refreshed", CONTENT_RELEASE_MANIFEST_COLLECTION, {
    frameworks: expectedFrameworks,
    releases: pendingReleases,
    accepted: seed.accepted,
    removedSuperseded,
  });

  return {
    ...seed,
    phase: "complete",
    releases: pendingReleases,
    manifestStatus: activeManifest.status,
    removedSuperseded,
    tsia2PathBankRelease,
  };
});

/** Remove a promoted question from the Path bank without touching the assignment. */
exports.withdrawQuestionFromPathBank = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const bankId = String(request.data?.bankId || "").trim();
  if (!bankId) throw new HttpsError("invalid-argument", "bankId is required.");

  const existingQuestion = await db.collection("pathQuestionBank").doc(bankId).get();
  if (!existingQuestion.exists) {
    throw new HttpsError("not-found", "The Path-bank question no longer exists.");
  }
  const framework = String(existingQuestion.data()?.assessmentContext?.framework || "").trim();
  if (RELEASE_MANAGED_ASSESSMENT_FRAMEWORKS.includes(framework)) {
    throw new HttpsError(
      "failed-precondition",
      "Released assessment questions cannot be withdrawn one at a time. Use the dedicated ASVAB or coordinated SAT/ACT/TSIA2 refresh so the audited release and manifest change together.",
    );
  }

  // Deactivated rather than deleted: an evidence event already recorded against
  // it should still be able to name the question a student answered.
  await db.collection("pathQuestionBank").doc(bankId).set({ active: false, withdrawnAt: Date.now() }, { merge: true });
  await rebuildStoredPathCoverage(db);
  return { bankId, active: false };
});

/**
 * Recompute the coverage index from the secure Path bank.
 *
 * This is a global administrative operation, not a teacher-assignment mapping.
 * The server owns the course-standard list through the canonical Texas registry.
 */
exports.rebuildPathCoverage = onCall({ timeoutSeconds: 540, memory: "1GiB", invoker: "public" }, async (request) => {
  await requireRootAdmin(request);
  const db = getFirestore();
  const requestedCourses = Array.isArray(request.data?.courses) ? request.data.courses : [];
  const courses = requestedCourses.length ? requestedCourses : PATH_COURSE_IDS;
  return rebuildStoredPathCoverage(db, { courses });
});

/**
 * Root-admin targeted diagnostic for a standard that will not launch.
 * Returns counts and validation reasons only — never prompts, expected answers,
 * generator parameters, or private grading definitions.
 */
exports.diagnosePathSkill = onCall({ timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  await requireRootAdmin(request);
  const db = getFirestore();
  const targetAlignmentKey = mathPath.canonicalAlignmentKey(request.data?.targetAlignmentKey);
  if (!targetAlignmentKey) throw new HttpsError("invalid-argument", "targetAlignmentKey is required.");
  const assessmentFramework = normalizePathAssessmentFramework(request.data?.assessmentFramework);
  const courseId = coverageCourseIdFor(targetAlignmentKey);

  const [snapshot, storedCoverage] = await Promise.all([
    db.collection("pathQuestionBank").where("alignmentKeys", "array-contains", targetAlignmentKey).limit(200).get(),
    db.collection(COVERAGE_COLLECTION).doc(courseId).get(),
  ]);
  const allRecords = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const activeRecords = allRecords.filter((question) => question.active !== false);
  const records = activeRecords.filter((question) => pathQuestionMatchesFramework(question, assessmentFramework));
  const evaluations = [];
  for (const question of records) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await safeBuildTemplateIssuePlan(question, { operation: "skill-diagnostic" });
    evaluations.push({ question, plan });
  }

  const rejected = evaluations.filter((entry) => !entry.plan?.issuable).map(({ question, plan }) => ({
    id: question.id,
    familyId: question.familyId || null,
    questionType: question.questionType || "response",
    pathToolId: question.pathToolId || question.toolId || question.tool?.id || null,
    courseId: question.courseId || courseId,
    assessmentFramework: question.assessmentContext?.framework || null,
    reason: plan?.reason || "not_issuable",
    detail: plan?.detail || null,
    diagnosticId: plan?.diagnosticId || null,
  }));
  const issuableFamilies = new Set(evaluations
    .filter((entry) => entry.plan?.issuable)
    .map((entry) => String(entry.question?.familyId || entry.question?.id || ""))
    .filter(Boolean));

  const coverage = await pathCoverage();
  const diagnosticIndex = coverage.buildCoverageIndex({
    courseId,
    wheelTeks: [coverage.coverageKey(targetAlignmentKey)],
    bankItems: records,
    plans: Object.fromEntries(evaluations.map((entry) => [entry.question.id, entry.plan])),
    generatedAt: Date.now(),
  });
  const key = coverage.coverageKey(targetAlignmentKey);
  const storedEntry = storedCoverage.exists
    ? (storedCoverage.data()?.skills?.[key] || storedCoverage.data()?.offWheel?.[key] || null)
    : null;

  return {
    targetAlignmentKey,
    displayCode: mathPath.displayAlignmentKey(targetAlignmentKey),
    courseId,
    assessmentFramework,
    totalBankMatches: allRecords.length,
    activeMatches: activeRecords.length,
    frameworkMatches: records.length,
    issuableDocuments: evaluations.filter((entry) => entry.plan?.issuable).length,
    issuableFamilies: issuableFamilies.size,
    launchable: assessmentFramework ? issuableFamilies.size >= 5 : coverage.isSkillLaunchable(diagnosticIndex, targetAlignmentKey),
    liveCoverage: diagnosticIndex.skills?.[key] || diagnosticIndex.offWheel?.[key] || null,
    storedCoverage: storedEntry,
    rejectionSummary: summarizePathRejections(rejected),
    rejected: rejected.slice(0, 80),
  };
});

/**
 * Root-admin action: give existing evidence, mastery and scratchpad records the
 * authorization context the scoped rules read.
 *
 * The second half of the deployment gate. Records written before this existed
 * carry no `authorizedTeacherEmails`, so under the scoped rule no teacher could
 * open them — a student's whole history would go dark. This must report zero
 * remaining before those rules are deployed.
 *
 * `dryRun` reports without writing. Idempotent: a record that already has the
 * fields is skipped, so a second run changes nothing.
 */
exports.backfillRecordAuthorization = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const auth = await authorizationContext();
  const dryRun = request.data?.dryRun === true;

  const roster = await db.collection("grades").select("classId", "assignedTeacherEmail", "status").get();
  const classes = new Map((await loadClasses(db)).map((entry) => [entry.classId, entry]));

  const totals = { studentsScanned: 0, recordsScanned: 0, recordsUpdated: 0, studentsWithNoTeacher: [] };

  for (const studentDoc of roster.docs) {
    if (studentDoc.id === "test_connection") continue;
    const student = studentDoc.data() || {};
    const classRecord = student.classId ? classes.get(student.classId) || null : null;
    totals.studentsScanned += 1;
    if (!classRecord?.teacherOfRecord && student.status !== "disabled") {
      totals.studentsWithNoTeacher.push(studentDoc.id);
    }

    for (const spec of AUTHORIZED_CHILD_COLLECTIONS) {
      // eslint-disable-next-line no-await-in-loop
      const snapshot = await db.collection(spec.path(studentDoc.id)).get();
      const plan = auth.planAuthorizationBackfill({
        records: snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
        studentId: studentDoc.id,
        classRecord,
        student,
      });
      totals.recordsScanned += plan.report.scanned;
      totals.recordsUpdated += plan.report.toUpdate;
      if (!dryRun && plan.updates.length) {
        for (let index = 0; index < plan.updates.length; index += 400) {
          const chunk = plan.updates.slice(index, index + 400);
          const batch = db.batch();
          chunk.forEach((update) => {
            const { authorizationBackfilledAt, ...fields } = update.fields;
            batch.set(db.collection(spec.path(studentDoc.id)).doc(update.id), {
              ...fields,
              authorizationBackfilledAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          });
          // eslint-disable-next-line no-await-in-loop
          await batch.commit();
        }
      }
    }

    for (const collectionName of ["studentMasteryProfiles", "studentRetentionSchedules"]) {
      const ref = db.collection(collectionName).doc(studentDoc.id);
      // eslint-disable-next-line no-await-in-loop
      const snapshot = await ref.get();
      if (!snapshot.exists) continue;
      const plan = auth.planAuthorizationBackfill({
        records: [{ id: studentDoc.id, ...snapshot.data() }],
        studentId: studentDoc.id,
        classRecord,
        student,
      });
      totals.recordsScanned += plan.report.scanned;
      totals.recordsUpdated += plan.report.toUpdate;
      if (!dryRun && plan.updates.length) {
        const { authorizationBackfilledAt, ...fields } = plan.updates[0].fields;
        // eslint-disable-next-line no-await-in-loop
        await ref.set({ ...fields, authorizationBackfilledAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }

  const report = {
    dryRun,
    ...totals,
    // The gate: after this runs, no record may still be unreadable.
    readyForScopedChildRules: dryRun ? totals.recordsUpdated === 0 && totals.studentsWithNoTeacher.length === 0 : totals.studentsWithNoTeacher.length === 0,
  };
  if (!dryRun) await writeAdminAudit(db, actor, "record_authorization_backfilled", "children", report);
  return report;
});

/**
 * Root-admin action: put a student in a class, move them, or take them out.
 *
 * This is the roster operation. It never touches the account and never touches
 * a grade — `classId: null` means "not in a class right now", which is a
 * schedule fact, not a disciplinary one.
 */
exports.setStudentClass = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const model = await classModel();
  let studentId;
  try {
    studentId = authLib.normalizeStudentId(request.data?.studentId);
  } catch (error) {
    throw translateAuthError(error);
  }

  const studentRef = db.collection("grades").doc(studentId);
  const studentSnapshot = await studentRef.get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "That student account is not present in MathMaster.");

  const classId = String(request.data?.classId || "").trim();
  let classRecord = null;
  if (classId) {
    const classSnapshot = await db.collection(CLASS_COLLECTION).doc(classId).get();
    if (!classSnapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
    classRecord = { classId, ...classSnapshot.data() };
    if (classRecord.status === model.CLASS_STATUS.ARCHIVED) {
      throw new HttpsError("failed-precondition", "That class is archived. Restore it first, or choose an active class.");
    }
  }

  const previous = studentSnapshot.data() || {};
  await studentRef.set({
    // membershipFieldsFor carries assignedTeacherEmail, so the roster record
    // and the security rule it feeds can never disagree with the class.
    ...model.membershipFieldsFor(classRecord),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // The student's existing evidence, mastery and scratchpads move with them.
  // Without this the new teacher would hold a roster row for a child whose
  // work they cannot open.
  const reauthorized = await reauthorizeStudentRecords(db, studentId, classRecord);

  await writeAdminAudit(db, actor, classRecord ? "student_class_assigned" : "student_removed_from_class", studentId, {
    fromClassId: previous.classId || null,
    toClassId: classRecord?.classId || null,
    classPeriod: classRecord?.period || model.UNASSIGNED_PERIOD,
    teacherOfRecord: classRecord?.teacherOfRecord || null,
    reauthorized,
  });
  return {
    studentId,
    classId: classRecord?.classId || null,
    classPeriod: classRecord?.period || model.UNASSIGNED_PERIOD,
    assignedTeacherEmail: classRecord?.teacherOfRecord || null,
    reauthorized,
  };
});

/**
 * Root-admin action: deactivate a student account, or bring it back.
 *
 * Deliberately NOT deletion and NOT a roster change. The account stops working;
 * the roster entry, the grades and the evidence are all left exactly as they
 * are, and the same call reverses it.
 */
exports.setStudentAccountStatus = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const model = await classModel();
  let studentId;
  try {
    studentId = authLib.normalizeStudentId(request.data?.studentId);
  } catch (error) {
    throw translateAuthError(error);
  }
  const active = request.data?.active !== false;

  const studentRef = db.collection("grades").doc(studentId);
  const studentSnapshot = await studentRef.get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "That student account is not present in MathMaster.");

  // A disabled account must stop working NOW, not when its token happens to
  // expire, so the linked Firebase user is disabled and its sessions revoked.
  const directory = await db.collection(authLib.DIRECTORY_COLLECTION).where("studentId", "==", studentId).limit(5).get();
  const uids = [
    ...new Set(directory.docs.map((entry) => entry.data()?.uid).filter(Boolean)),
  ];
  for (const uid of uids) {
    // eslint-disable-next-line no-await-in-loop
    await getAuth().updateUser(uid, { disabled: !active }).catch(() => {});
    if (!active) {
      // eslint-disable-next-line no-await-in-loop
      await getAuth().revokeRefreshTokens(uid).catch(() => {});
    }
  }

  await studentRef.set({
    status: active ? model.ACCOUNT_STATUS.ACTIVE : model.ACCOUNT_STATUS.DISABLED,
    deactivatedAt: active ? null : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAdminAudit(db, actor, active ? "student_account_reactivated" : "student_account_deactivated", studentId, {
    sessionsRevoked: active ? 0 : uids.length,
  });
  return { studentId, status: active ? model.ACCOUNT_STATUS.ACTIVE : model.ACCOUNT_STATUS.DISABLED, sessionsRevoked: active ? 0 : uids.length };
});

/** Root-admin action: grant or revoke an ordinary teacher's access. */
exports.setTeacherAccess = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();

  let email;
  try {
    email = authLib.normalizeEmail(request.data?.email);
  } catch (error) {
    throw translateAuthError(error);
  }
  const active = request.data?.active !== false;

  if (authLib.isRootAdminEmail(email)) {
    throw new HttpsError("failed-precondition", "The root administrator cannot be revoked or changed from the teacher access list.");
  }

  const ref = db.collection(authLib.TEACHER_COLLECTION).doc(email);
  const existing = await ref.get();
  const uid = existing.data()?.uid || null;

  if (uid) {
    if (active) {
      await getAuth().updateUser(uid, { disabled: false });
      const userRecord = await getAuth().getUser(uid);
      await assignClaims(uid, { ...userRecord.customClaims, role: "teacher" });
    } else {
      // Disabling the Firebase user closes the gap in which an already-issued
      // teacher token could otherwise retain access until its normal expiry.
      await getAuth().updateUser(uid, { disabled: true });
      await assignClaims(uid, {}).catch(() => {});
      await getAuth().revokeRefreshTokens(uid).catch(() => {});
    }
  }

  await ref.set({
    email,
    active,
    accessLevel: "teacher",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  }, { merge: true });
  await writeAdminAudit(db, actor, active ? "teacher_access_granted" : "teacher_access_revoked", email, {
    existingAccount: existing.exists,
    hasSignedIn: Boolean(uid),
  });

  return { email, active };
});

/** Root-admin action: grant/revoke the narrow shared-library repair capability. */
exports.setAssignmentRepairerAccess = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  let email;
  try { email = authLib.normalizeEmail(request.data?.email); } catch (error) { throw translateAuthError(error); }
  if (authLib.isRootAdminEmail(email)) throw new HttpsError("failed-precondition", "Administrators already have Full Assignment Audit authority.");
  const ref = db.collection(authLib.TEACHER_COLLECTION).doc(email);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.active === false) throw new HttpsError("failed-precondition", "Assignment Repairer access can only be changed for an active teacher.");
  const enabled = request.data?.enabled === true;
  const uid = snapshot.data()?.uid || null;
  if (uid) {
    const userRecord = await getAuth().getUser(uid);
    await assignClaims(uid, { ...userRecord.customClaims, role: "teacher", assignmentRepairer: enabled });
    await getAuth().revokeRefreshTokens(uid);
  }
  await ref.set({ assignmentRepairer: enabled, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
  await writeAdminAudit(db, actor, enabled ? "assignment_repairer_granted" : "assignment_repairer_revoked", email, { hasSignedIn: Boolean(uid) });
  return { email, assignmentRepairer: enabled, tokenRefreshRequired: Boolean(uid) };
});

async function recursiveDeleteDocument(db, ref, deleted, label) {
  const snapshot = await ref.get();
  if (!snapshot.exists) return 0;
  await db.recursiveDelete(ref);
  deleted[label] = Number(deleted[label] || 0) + 1;
  return 1;
}

async function recursiveDeleteQuery(db, query, deleted, label) {
  const snapshot = await query.get();
  for (const documentSnapshot of snapshot.docs) {
    // Sequential recursive deletion avoids turning one large student history
    // into an unbounded burst of writes. Student deletion is rare and explicit.
    // eslint-disable-next-line no-await-in-loop
    await db.recursiveDelete(documentSnapshot.ref);
  }
  if (snapshot.size) deleted[label] = Number(deleted[label] || 0) + snapshot.size;
  return snapshot.docs;
}


async function preproductionStudentAuthUsers(db) {
  const teacherSnapshot = await db.collection(authLib.TEACHER_COLLECTION).get();
  const protectedEmails = new Set([
    authLib.ROOT_ADMIN_EMAIL,
    ...authLib.bootstrapTeacherEmails(),
    ...teacherSnapshot.docs.map((entry) => entry.id),
  ].filter(Boolean).map((email) => String(email).trim().toLowerCase()));
  const protectedUids = new Set(
    teacherSnapshot.docs.map((entry) => entry.data()?.uid).filter(Boolean).map(String),
  );

  const students = [];
  let pageToken;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await getAuth().listUsers(1000, pageToken);
    for (const userRecord of page.users) {
      const email = String(userRecord.email || "").trim().toLowerCase();
      const uid = String(userRecord.uid || "");
      const protectedTeacher = protectedUids.has(uid)
        || (email && protectedEmails.has(email))
        || (email && authLib.isRootAdminEmail(email));
      if (protectedTeacher) continue;
      const role = String(userRecord.customClaims?.role || "").trim().toLowerCase();
      if (role === "student" || uid.startsWith("student:")) {
        students.push({ uid, email: email || null });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return students;
}

async function preproductionResetControl(db) {
  const snapshot = await db.doc(adminPolicy.PREPRODUCTION_CONTROL_DOCUMENT).get();
  const data = snapshot.exists ? snapshot.data() || {} : {};
  return {
    locked: data.locked === true,
    lockedAt: serializableDate(data.lockedAt),
  };
}

/**
 * `classPointAnnouncements` lives nested under the preserved `classes/{classId}`
 * documents, so it is never a flat entry in PREPRODUCTION_RESET_COLLECTIONS --
 * a collection-group read/delete is what reaches every class's subcollection
 * without touching the class documents themselves.
 */
function classPointAnnouncementsGroup(db) {
  return db.collectionGroup(CLASS_POINT_ANNOUNCEMENTS_COLLECTION);
}

async function preproductionResetPreview(db) {
  const [gradesSnapshot, authStudents, classPointAnnouncementsSnapshot, ...collectionSnapshots] = await Promise.all([
    db.collection("grades").get(),
    preproductionStudentAuthUsers(db),
    classPointAnnouncementsGroup(db).get(),
    ...adminPolicy.PREPRODUCTION_RESET_COLLECTIONS.map((collectionName) => (
      db.collection(collectionName).get()
    )),
  ]);
  const collections = {};
  adminPolicy.PREPRODUCTION_RESET_COLLECTIONS.forEach((collectionName, index) => {
    collections[collectionName] = collectionSnapshots[index].size;
  });
  collections[CLASS_POINT_ANNOUNCEMENTS_COLLECTION] = classPointAnnouncementsSnapshot.size;
  const control = await preproductionResetControl(db);
  return {
    studentRosterRecords: gradesSnapshot.docs.filter((entry) => entry.id !== "test_connection").length,
    studentAuthUsers: authStudents.length,
    assignments: collections.assignments || 0,
    collections,
    preservedCollections: [...adminPolicy.PREPRODUCTION_PRESERVED_COLLECTIONS],
    resetLocked: control.locked,
    resetLockedAt: control.lockedAt,
    lockConfirmationRequired: adminPolicy.preproductionLockConfirmation(),
  };
}

async function clearPreproductionCollection(db, collectionName, deleted) {
  const ref = db.collection(collectionName);
  const snapshot = await ref.get();
  if (snapshot.empty) return 0;
  await db.recursiveDelete(ref);
  deleted[collectionName] = snapshot.size;
  return snapshot.size;
}

/** Root-admin view of recent privileged account-management actions. */
exports.listAdminAuditLog = onCall(async (request) => {
  await requireRootAdmin(request);
  const limit = Math.max(1, Math.min(100, Number(request.data?.limit) || 40));
  const snapshot = await getFirestore()
    .collection(authLib.ADMIN_AUDIT_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return {
    events: snapshot.docs.map((eventDoc) => {
      const data = eventDoc.data() || {};
      return {
        id: eventDoc.id,
        actorEmail: data.actorEmail || null,
        action: data.action || "administrative_action",
        target: data.target || null,
        details: data.details || {},
        createdAt: serializableDate(data.createdAt),
      };
    }),
  };
});

/**
 * Root-admin-only pre-production reset.
 *
 * This deliberately preserves platform configuration and curriculum while
 * removing every test learner, assignment, response/evidence/session, and
 * assignment-publication record. Preview mode is read-only. The destructive
 * mode requires an exact typed phrase even though only the root administrator
 * can call it.
 */
exports.resetPreproductionTestData = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const dryRun = request.data?.dryRun === true;

  const preview = await preproductionResetPreview(db);
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      confirmationRequired: adminPolicy.preproductionResetConfirmation(),
      ...preview,
    };
  }

  if (preview.resetLocked) {
    throw new HttpsError(
      "failed-precondition",
      "Pre-production reset has been permanently locked for live-student production use.",
    );
  }

  if (!adminPolicy.isPreproductionResetConfirmed(request.data?.confirmation)) {
    throw new HttpsError(
      "failed-precondition",
      `Pre-production reset requires the exact confirmation ${adminPolicy.preproductionResetConfirmation()}.`,
    );
  }

  // Delete student Firebase Auth identities first. Teacher/root identities are
  // protected independently by both UID and email.
  const authStudents = await preproductionStudentAuthUsers(db);
  let deletedAuthUsers = 0;
  for (const account of authStudents) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await getAuth().revokeRefreshTokens(account.uid).catch(() => {});
      // eslint-disable-next-line no-await-in-loop
      await getAuth().deleteUser(account.uid);
      deletedAuthUsers += 1;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }

  const deleted = {};

  // grades is both the student roster and the parent of scratchpads/evidence.
  // Preserve only the deliberate connection-test sentinel.
  const gradesSnapshot = await db.collection("grades").get();
  for (const gradeDoc of gradesSnapshot.docs) {
    if (gradeDoc.id === "test_connection") continue;
    // eslint-disable-next-line no-await-in-loop
    await db.recursiveDelete(gradeDoc.ref);
    deleted.gradesWithSubcollections = Number(deleted.gradesWithSubcollections || 0) + 1;
  }

  // Clear each whole runtime/test collection recursively so orphaned test
  // documents are removed even when they no longer have a matching roster row.
  for (const collectionName of adminPolicy.PREPRODUCTION_RESET_COLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    await clearPreproductionCollection(db, collectionName, deleted);
  }

  // classPointAnnouncements is nested under classes/{classId}, and classes is
  // preserved configuration -- never reset -- so this reaches every class's
  // subcollection with a collection-group delete instead of putting `classes`
  // in PREPRODUCTION_RESET_COLLECTIONS. Each announcement is a leaf document,
  // so deleting it directly (not the class it lives under) is exactly what
  // recursiveDeleteQuery already does.
  await recursiveDeleteQuery(db, classPointAnnouncementsGroup(db), deleted, CLASS_POINT_ANNOUNCEMENTS_COLLECTION);

  // The audit survives intentionally. It contains aggregate counts only, never
  // the deleted student IDs/emails.
  await writeAdminAudit(db, actor, "preproduction_test_data_reset", "preproduction-test-data", {
    deletedAuthUsers,
    deletedRecords: deleted,
    preservedCollections: [...adminPolicy.PREPRODUCTION_PRESERVED_COLLECTIONS],
  });

  return {
    success: true,
    dryRun: false,
    deletedAuthUsers,
    deletedRecords: deleted,
    preservedCollections: [...adminPolicy.PREPRODUCTION_PRESERVED_COLLECTIONS],
  };
});

/**
 * One-way root-admin production lock for the bulk test reset.
 *
 * There is deliberately no unlock callable. Re-enabling the reset after this
 * point requires an explicit backend change outside the application.
 */
exports.lockPreproductionResetForProduction = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();

  if (!adminPolicy.isPreproductionLockConfirmed(request.data?.confirmation)) {
    throw new HttpsError(
      "failed-precondition",
      `Production lock requires the exact confirmation ${adminPolicy.preproductionLockConfirmation()}.`,
    );
  }

  const ref = db.doc(adminPolicy.PREPRODUCTION_CONTROL_DOCUMENT);
  const existing = await ref.get();
  if (existing.data()?.locked === true) {
    return {
      success: true,
      alreadyLocked: true,
      locked: true,
      lockedAt: serializableDate(existing.data()?.lockedAt),
    };
  }

  await ref.set({
    locked: true,
    lockedAt: FieldValue.serverTimestamp(),
    lockedByUid: actor.uid,
    lockedByEmail: actor.email || null,
  });

  await writeAdminAudit(db, actor, "preproduction_reset_locked_for_production", "preproduction-test-data", {
    irreversibleInApp: true,
  });

  return { success: true, alreadyLocked: false, locked: true };
});

/**
 * Erase the complete Class Points footprint for a permanently-deleted
 * student: every account, every transaction across every class they were
 * ever in, every idempotency record those awards produced, every public
 * announcement those awards triggered, and every reward redemption (Practice
 * Pass and any future reward) they hold.
 *
 * This is the one Class Points lifecycle event that does NOT preserve
 * history. Removing a student from a class, disabling their account, and
 * moving them to a different class all go through `reauthorizeStudentRecords`
 * instead, which never deletes a wallet or a transaction -- see
 * `reauthorizeClassPointsRecord` in functions/shared/classPoints.mjs. Only
 * permanent erasure reaches this function.
 *
 * ORDER MATTERS FOR RETRY SAFETY. Every relationship this needs -- which
 * classes, which transaction ids, which idempotency keys, which announcements
 * reference them -- is gathered from the student's account/transaction
 * records BEFORE any of those records are deleted. Transactions and accounts
 * are deleted LAST. If this function is interrupted partway through and
 * called again, the still-surviving transactions let it recompute the exact
 * same plan and finish the remainder; nothing here errors on a record that
 * turns out to already be gone.
 *
 * Announcements deliberately carry no studentId (see `buildAnnouncement` --
 * classmates must never learn a real identity from one), so they cannot be
 * found by querying for the student directly. They ARE found by
 * `awardTransactionId`, which is why the transaction ids are gathered first
 * and used to look the announcements up.
 */
async function deleteStudentClassPointsFootprint(db, studentId, deleted) {
  const points = await classPoints();

  const [accountsSnapshot, transactionsSnapshot] = await Promise.all([
    db.collection(CLASS_POINT_ACCOUNTS_COLLECTION).where("studentId", "==", studentId).get(),
    db.collection(CLASS_POINT_TRANSACTIONS_COLLECTION).where("studentId", "==", studentId).get(),
  ]);

  const plan = points.planStudentClassPointsDeletion({
    accounts: accountsSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    transactions: transactionsSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
  });

  let announcementsDeleted = 0;
  for (const { classId, transactionIds } of plan.transactionIdsByClass) {
    const announcementsRef = db.collection("classes").doc(classId).collection(CLASS_POINT_ANNOUNCEMENTS_COLLECTION);
    for (const idChunk of points.chunkList(transactionIds, points.FIRESTORE_IN_QUERY_LIMIT)) {
      // eslint-disable-next-line no-await-in-loop
      const matches = await announcementsRef.where("awardTransactionId", "in", idChunk).get();
      for (const match of matches.docs) {
        // eslint-disable-next-line no-await-in-loop
        await match.ref.delete();
        announcementsDeleted += 1;
      }
    }
  }
  if (announcementsDeleted) deleted.classPointAnnouncements = announcementsDeleted;

  let idempotencyDeleted = 0;
  for (const key of plan.idempotencyKeys) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection(CLASS_POINT_IDEMPOTENCY_COLLECTION).doc(key).delete();
    idempotencyDeleted += 1;
  }
  if (idempotencyDeleted) deleted.classPointIdempotencyKeys = idempotencyDeleted;

  let transactionsDeleted = 0;
  for (const id of plan.transactionIds) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection(CLASS_POINT_TRANSACTIONS_COLLECTION).doc(id).delete();
    transactionsDeleted += 1;
  }
  if (transactionsDeleted) deleted.classPointTransactions = transactionsDeleted;

  let accountsDeleted = 0;
  for (const id of plan.accountIds) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection(CLASS_POINT_ACCOUNTS_COLLECTION).doc(id).delete();
    accountsDeleted += 1;
  }
  if (accountsDeleted) deleted.classPointAccounts = accountsDeleted;

  // Reward redemptions (Practice Pass and any future reward) are queryable
  // directly by studentId -- they need no transaction-derived id list the way
  // the announcement/idempotency cleanup above does.
  const redemptionsSnapshot = await db
    .collection(CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION)
    .where("studentId", "==", studentId)
    .get();
  let redemptionsDeleted = 0;
  for (const redemptionDoc of redemptionsSnapshot.docs) {
    // eslint-disable-next-line no-await-in-loop
    await redemptionDoc.ref.delete();
    redemptionsDeleted += 1;
  }
  if (redemptionsDeleted) deleted.classPointRewardRedemptions = redemptionsDeleted;
}

/**
 * Root-admin-only permanent student erasure.
 *
 * This intentionally lives behind a callable instead of Firestore delete
 * rules. The browser never receives authority to recursively erase records;
 * the server resolves every MathMaster collection that can contain student
 * identity, assessment, practice, evidence, or Classroom-link data.
 */
exports.permanentlyDeleteStudent = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();

  let studentId;
  let studentKey;
  try {
    studentId = authLib.normalizeStudentId(request.data?.studentId);
    studentKey = authLib.studentIdKey(studentId);
  } catch (error) {
    throw translateAuthError(error);
  }
  if (studentId === "test_connection") {
    throw new HttpsError("failed-precondition", "The connection-test record is not a student account.");
  }
  if (!adminPolicy.isPermanentDeleteConfirmed(studentId, request.data?.confirmation)) {
    throw new HttpsError(
      "failed-precondition",
      `Permanent deletion requires the exact confirmation ${adminPolicy.permanentDeleteConfirmation(studentId)}.`,
    );
  }

  const rosterRef = db.collection("grades").doc(studentId);
  const [rosterSnapshot, directorySnapshot, aliasSnapshot] = await Promise.all([
    rosterRef.get(),
    db.collection(authLib.DIRECTORY_COLLECTION).where("studentId", "==", studentId).get(),
    db.collection(authLib.ALIAS_COLLECTION).where("studentId", "==", studentId).get(),
  ]);
  if (!rosterSnapshot.exists && directorySnapshot.empty && aliasSnapshot.empty) {
    throw new HttpsError("not-found", "That student account is not present in MathMaster.");
  }

  // Class Points must be erased while the student's ordinary identity records
  // still exist. If this cleanup fails midway, the roster/directory/alias
  // records remain available so the administrator can safely retry the same
  // permanent-delete request. Once this succeeds, later deletion stages may
  // continue without any Class Points data being stranded behind a now-missing
  // student identity.
  const deleted = {};
  await deleteStudentClassPointsFootprint(db, studentId, deleted);
  const challengeRewards = await liveChallengeClassPoints();
  const challengeCleanup = await challengeRewards.cleanupStudentLiveChallengeAchievements(db, studentId);
  if (Number(challengeCleanup?.jobsUpdated) > 0) {
    deleted.liveChallengeAchievementJobsUpdated = Number(challengeCleanup.jobsUpdated);
  }
  if (Number(challengeCleanup?.jobsDeleted) > 0) {
    deleted.liveChallengeAchievementJobsDeleted = Number(challengeCleanup.jobsDeleted);
  }

  // Resolve every Firebase Auth identity attached to this MathMaster student.
  // A teacher/root identity is never deleted even if bad legacy data linked it
  // to a student record.
  const authUids = new Set([`student:${studentKey}`]);
  const linkedEmails = new Set(
    [rosterSnapshot.data()?.linkedEmail, ...directorySnapshot.docs.map((entry) => entry.id)]
      .filter(Boolean)
      .map((email) => String(email).trim().toLowerCase()),
  );
  directorySnapshot.docs.forEach((entry) => {
    if (entry.data()?.uid) authUids.add(entry.data().uid);
  });

  for (const email of linkedEmails) {
    // eslint-disable-next-line no-await-in-loop
    const teacherDirectory = await db.collection(authLib.TEACHER_COLLECTION).doc(email).get();
    const protectedTeacher = teacherDirectory.exists
      || authLib.isRootAdminEmail(email)
      || authLib.bootstrapTeacherEmails().includes(email);
    if (protectedTeacher) {
      directorySnapshot.docs
        .filter((entry) => entry.id === email && entry.data()?.uid)
        .forEach((entry) => authUids.delete(entry.data().uid));
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const authUser = await getAuth().getUserByEmail(email);
      authUids.add(authUser.uid);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }

  let deletedAuthUsers = 0;
  for (const uid of authUids) {
    try {
      // Revoke before delete so a partially failed operation never leaves a
      // valid refresh token for an account that is being erased.
      // eslint-disable-next-line no-await-in-loop
      await getAuth().revokeRefreshTokens(uid).catch(() => {});
      // eslint-disable-next-line no-await-in-loop
      await getAuth().deleteUser(uid);
      deletedAuthUsers += 1;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }

  // Parent deletion is recursive: scratchpads and immutable evidence events
  // disappear with the grade/roster document.
  await recursiveDeleteDocument(db, rosterRef, deleted, "gradesWithSubcollections");

  await Promise.all([
    recursiveDeleteDocument(db, db.collection(authLib.CREDENTIALS_COLLECTION).doc(studentKey), deleted, "studentCredentials"),
    recursiveDeleteDocument(db, db.collection(authLib.ALIAS_COLLECTION).doc(studentKey), deleted, "studentAliases"),
    recursiveDeleteDocument(db, db.collection(authLib.THROTTLE_COLLECTION).doc(`student_${studentKey}`), deleted, "authThrottle"),
  ]);

  await recursiveDeleteQuery(
    db,
    db.collection(authLib.DIRECTORY_COLLECTION).where("studentId", "==", studentId),
    deleted,
    "studentDirectory",
  );
  await recursiveDeleteQuery(
    db,
    db.collection(authLib.ALIAS_COLLECTION).where("studentId", "==", studentId),
    deleted,
    "studentAliases",
  );

  for (const collectionName of adminPolicy.STUDENT_DIRECT_COLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    await recursiveDeleteDocument(db, db.collection(collectionName).doc(studentId), deleted, collectionName);
  }
  for (const collectionName of adminPolicy.STUDENT_QUERY_COLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    await recursiveDeleteQuery(
      db,
      db.collection(collectionName).where("studentId", "==", studentId),
      deleted,
      collectionName,
    );
  }

  // Preserve accountability without retaining the deleted student's ID in the
  // audit collection. The short irreversible digest is only a deletion receipt.
  const receipt = crypto.createHash("sha256").update(studentKey).digest("hex").slice(0, 16);
  await writeAdminAudit(db, actor, "student_permanently_deleted", `deleted-student:${receipt}`, {
    deletedAuthUsers,
    deletedRecords: deleted,
  });

  return {
    success: true,
    studentId,
    deletedAuthUsers,
    deletedRecords: deleted,
    receipt,
  };
});

// --- OAuth connect flow -----------------------------------------------------

exports.getGoogleAuthUrl = onCall({ secrets: GOOGLE_API_SECRETS }, async (request) => {
  const teacherUid = await requireTeacher(request);
  const db = getFirestore();
  const state = crypto.randomBytes(16).toString("hex");
  await db.doc(`oauthStates/${state}`).set({
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Date.now() + 10 * 60 * 1000,
    createdBy: teacherUid,
  });
  return { url: classroomLib().buildAuthUrl(state) };
});

exports.oauthCallback = onRequest({ secrets: GOOGLE_API_SECRETS }, async (req, res) => {
  const { code, state, error } = req.query;
  const appBaseUrl = readStudentAppBaseUrl();

  if (error) {
    res.redirect(302, `${appBaseUrl}?classroomError=${encodeURIComponent(String(error))}`);
    return;
  }
  if (!code || !state) {
    res.status(400).send("Missing code or state.");
    return;
  }

  const db = getFirestore();
  const stateRef = db.doc(`oauthStates/${state}`);
  const stateSnap = await stateRef.get();
  const stateData = stateSnap.exists ? stateSnap.data() : null;
  if (!stateData || stateData.expiresAt < Date.now()) {
    res.status(400).send("Invalid or expired OAuth state.");
    return;
  }
  await stateRef.delete();

  try {
    const tokens = await classroomLib().exchangeCodeForTokens(String(code));
    await classroomLib().saveTeacherTokens(tokens, stateData.createdBy);
    res.redirect(302, `${appBaseUrl}?classroomConnected=1`);
  } catch (err) {
    logger.error("OAuth token exchange failed", err);
    res.redirect(302, `${appBaseUrl}?classroomError=token_exchange_failed`);
  }
});

exports.getClassroomConnectionStatus = onCall(
  { secrets: GOOGLE_API_SECRETS },
  async (request) => {
    const teacherUid = await requireTeacher(request);
    return classroomLib().getConnectionHealth(teacherUid);
  }
);

exports.getGoogleClassroomDiagnostics = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  async (request) => {
    const teacherUid = await requireTeacher(request);
    const problems = [];
    const checks = {};

    const checkSecret = (readFn, name, setCommand) => {
      try {
        return Boolean(readFn());
      } catch {
        problems.push(
          `${name} is not configured. Set it with: firebase functions:secrets:set ${setCommand}`
        );
        return false;
      }
    };

    checks.clientIdConfigured = checkSecret(
      readGoogleClientId,
      "GOOGLE_OAUTH_CLIENT_ID",
      "GOOGLE_OAUTH_CLIENT_ID"
    );
    checks.clientSecretConfigured = checkSecret(
      readGoogleClientSecret,
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "GOOGLE_OAUTH_CLIENT_SECRET"
    );
    // LINK_ENCRYPTION_KEY does not block the OAuth connect flow itself, but
    // launch links and grade passback will fail without it, so it is still
    // checked and reported as a problem when missing.
    checkSecret(readLinkEncryptionKey, "LINK_ENCRYPTION_KEY", "LINK_ENCRYPTION_KEY");

    checks.redirectUri = readPublicEnv("GOOGLE_OAUTH_REDIRECT_URI");
    if (!checks.redirectUri) {
      problems.push(
        "GOOGLE_OAUTH_REDIRECT_URI is not configured. Add it to functions/.env.mathmaster-aleks (see functions/.env.example) and redeploy."
      );
    }

    checks.functionsBaseUrl = readPublicEnv("FUNCTIONS_BASE_URL");
    if (!checks.functionsBaseUrl) {
      problems.push(
        "FUNCTIONS_BASE_URL is not configured. Add it to functions/.env.mathmaster-aleks (see functions/.env.example) and redeploy."
      );
    }

    checks.configuredAppBaseUrl = readPublicEnv("APP_BASE_URL");
    checks.appBaseUrl = readStudentAppBaseUrl();
    checks.canonicalAppBaseUrl = CANONICAL_STUDENT_APP_BASE_URL;
    checks.appBaseUrlPinnedToFirebase = checks.appBaseUrl === CANONICAL_STUDENT_APP_BASE_URL;
    if (!checks.configuredAppBaseUrl) {
      problems.push(
        "APP_BASE_URL is not configured. Production student launches are protected by the Firebase Hosting fallback, but functions/.env.mathmaster-aleks should still set APP_BASE_URL=https://mathmaster-aleks.web.app."
      );
    } else if (String(checks.configuredAppBaseUrl).replace(/\/$/, "") !== CANONICAL_STUDENT_APP_BASE_URL) {
      problems.push(
        `APP_BASE_URL is configured as ${checks.configuredAppBaseUrl}. Student launches are being forced to ${CANONICAL_STUDENT_APP_BASE_URL}; update functions/.env.mathmaster-aleks and redeploy so diagnostics are clean.`
      );
    }

    try {
      await getFirestore().doc(`teacherIntegrations/${teacherUid}`).get();
      checks.firestoreAvailable = true;
    } catch (err) {
      checks.firestoreAvailable = false;
      problems.push(`Firestore is unreachable: ${err.message}`);
    }

    checks.authUrlBuilds = false;
    if (checks.clientIdConfigured && checks.clientSecretConfigured && checks.redirectUri) {
      try {
        classroomLib().buildAuthUrl("diagnostics");
        checks.authUrlBuilds = true;
      } catch (err) {
        problems.push(`OAuth URL generation failed: ${err.message}`);
      }
    }

    return { ok: problems.length === 0, problems, checks };
  }
);

// --- Courses and course-specific roster links -------------------------------

exports.listGoogleCourses = onCall({ secrets: GOOGLE_API_SECRETS }, async (request) => {
  const teacherUid = await requireTeacher(request);
  const classroom = await classroomLib().getClassroomClient(teacherUid);
  return { courses: await classroomLib().listCourses(classroom) };
});

exports.listClassroomStudents = onCall({ secrets: GOOGLE_API_SECRETS }, async (request) => {
  const teacherUid = await requireTeacher(request);
  const { courseId } = request.data || {};
  if (!courseId) throw new HttpsError("invalid-argument", "courseId is required.");
  const classroom = await classroomLib().getClassroomClient(teacherUid);
  return { students: await classroomLib().listStudents(classroom, String(courseId)) };
});

function classroomMappingDocumentId(teacherUid, courseId) {
  return crypto
    .createHash("sha256")
    .update(`${teacherUid}|${courseId}`)
    .digest("hex")
    .slice(0, 32);
}

function classroomMaterialDocumentId(teacherUid, courseId, materialKey) {
  return crypto
    .createHash("sha256")
    .update(`${teacherUid}|${courseId}|${materialKey}`)
    .digest("hex")
    .slice(0, 32);
}

async function getTeacherClassroomMapping(db, teacherUid, courseId) {
  const mappingId = classroomMappingDocumentId(teacherUid, String(courseId));
  const snap = await db.doc(`classroomCourseMappings/${mappingId}`).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

function studentBelongsToMappedClass(student, classRecord, classId) {
  if (!student || !classRecord) return false;
  if (student.classId) return String(student.classId) === String(classId);
  return String(student.classPeriod || "") === String(classRecord.period || "");
}

async function assertMappedStudent(db, teacherUid, courseId, classId, studentId) {
  const mapping = await getTeacherClassroomMapping(db, teacherUid, courseId);
  if (!mapping || String(mapping.classId) !== String(classId)) {
    throw new HttpsError(
      "failed-precondition",
      "Map this Google Classroom course to the MathMaster class before linking students."
    );
  }

  const [classSnap, studentSnap] = await Promise.all([
    db.doc(`classes/${String(classId)}`).get(),
    db.doc(`grades/${String(studentId)}`).get(),
  ]);
  if (!classSnap.exists) throw new HttpsError("not-found", "The mapped MathMaster class no longer exists.");
  if (!studentSnap.exists) throw new HttpsError("not-found", `MathMaster student ${studentId} does not exist.`);
  if (!studentBelongsToMappedClass(studentSnap.data(), classSnap.data(), classId)) {
    throw new HttpsError(
      "failed-precondition",
      `MathMaster student ${studentId} is not enrolled in the mapped class.`
    );
  }
  return { mapping, classRecord: classSnap.data(), student: studentSnap.data() };
}

function classroomMappingResponse(doc) {
  const data = doc.data() || {};
  const updatedAt = data.updatedAt;
  const updatedAtMillis = typeof updatedAt?.toMillis === "function"
    ? updatedAt.toMillis()
    : Number.isFinite(Number(updatedAt))
      ? Number(updatedAt)
      : null;

  // Return the small public mapping contract only. Do not send arbitrary raw
  // Firestore values through the callable encoder; older mapping documents may
  // contain legacy fields or Firestore Timestamp/reference objects that the
  // browser does not need.
  return {
    id: doc.id,
    mappingId: String(data.mappingId || doc.id),
    courseId: data.courseId == null ? null : String(data.courseId),
    courseName: data.courseName == null ? null : String(data.courseName),
    courseSection: data.courseSection == null ? "" : String(data.courseSection),
    classId: data.classId == null ? null : String(data.classId),
    className: data.className == null ? null : String(data.className),
    classPeriod: data.classPeriod == null ? null : String(data.classPeriod),
    updatedAtMillis,
  };
}

exports.listClassroomCourseMappings = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  try {
    const snap = await getFirestore()
      .collection("classroomCourseMappings")
      .where("teacherUid", "==", teacherUid)
      .limit(100)
      .get();
    return { mappings: snap.docs.map(classroomMappingResponse) };
  } catch (error) {
    logger.error("listClassroomCourseMappings failed", {
      teacherUid,
      code: error?.code || null,
      name: error?.name || null,
      message: error?.message || String(error),
    });
    throw new HttpsError(
      "internal",
      "MathMaster could not load your saved Google Classroom mappings.",
      {
        stage: "load-course-mappings",
        errorCode: String(error?.code || error?.name || "unknown").slice(0, 80),
      },
    );
  }
});

exports.saveClassroomCourseMapping = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  const { courseId, courseName, courseSection, classId } = request.data || {};
  if (!courseId || !classId) {
    throw new HttpsError("invalid-argument", "courseId and classId are required.");
  }

  const db = getFirestore();
  const classRef = db.doc(`classes/${String(classId)}`);
  const classSnap = await classRef.get();
  if (!classSnap.exists) throw new HttpsError("not-found", "That MathMaster class does not exist.");
  const classRecord = classSnap.data() || {};
  const teacherOfRecord = String(classRecord.teacherOfRecord || "").trim().toLowerCase();
  const rootAdmin = teacherEmail ? authLib.isRootAdminEmail(teacherEmail) : false;
  if (!rootAdmin && (!teacherEmail || teacherOfRecord !== teacherEmail.toLowerCase())) {
    throw new HttpsError(
      "permission-denied",
      "Only the class's teacher of record or the root administrator can map this class to Google Classroom."
    );
  }

  const id = classroomMappingDocumentId(teacherUid, String(courseId));
  await db.doc(`classroomCourseMappings/${id}`).set(
    {
      mappingId: id,
      teacherUid,
      teacherEmail: teacherEmail || null,
      courseId: String(courseId),
      courseName: courseName || String(courseId),
      courseSection: courseSection || "",
      classId: String(classId),
      className: classRecord.name || null,
      classPeriod: classRecord.period || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { saved: true, mappingId: id };
});

exports.listClassroomRosterLinks = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const courseId = String(request.data?.courseId || "").trim();
  if (!courseId) throw new HttpsError("invalid-argument", "courseId is required.");

  // Query by teacher only so this does not require a fragile composite index.
  // A teacher has a small bounded set of roster links; course scoping happens
  // in memory and the client receives only the selected course.
  const snapshot = await getFirestore()
    .collection("classroomRosterLinks")
    .where("teacherUid", "==", teacherUid)
    .limit(1000)
    .get();

  return {
    links: snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((entry) => String(entry.courseId || "") === courseId)
      .map((entry) => ({
        rosterLinkId: entry.rosterLinkId || entry.id,
        courseId,
        classId: entry.classId || null,
        studentId: entry.studentId || null,
        googleUserId: entry.googleUserId || null,
        email: entry.email || null,
        name: entry.name || null,
      })),
  };
});

exports.linkStudentToClassroom = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const { courseId, studentId, googleUserId, email, name, classId } = request.data || {};
  if (!courseId || !studentId || !googleUserId) {
    throw new HttpsError(
      "invalid-argument",
      "courseId, studentId, and googleUserId are required."
    );
  }

  const db = getFirestore();
  const mapping = await getTeacherClassroomMapping(db, teacherUid, String(courseId));
  const effectiveClassId = String(classId || mapping?.classId || "");
  if (!effectiveClassId) {
    throw new HttpsError(
      "failed-precondition",
      "Map this Google Classroom course to a MathMaster class before linking students."
    );
  }
  const cleanStudentId = String(studentId).trim();
  await assertMappedStudent(db, teacherUid, String(courseId), effectiveClassId, cleanStudentId);

  const rosterLinkId = rosterLinkDocumentId(String(courseId), cleanStudentId);
  await db.doc(`classroomRosterLinks/${rosterLinkId}`).set(
    {
      rosterLinkId,
      teacherUid,
      classId: effectiveClassId,
      courseId: String(courseId),
      studentId: cleanStudentId,
      googleUserId: String(googleUserId),
      email: email || null,
      name: name || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await db.doc(`grades/${cleanStudentId}`).set(
    {
      googleUserId: String(googleUserId),
      googleEmail: email || null,
      googleName: name || null,
      classroomCourseIds: FieldValue.arrayUnion(String(courseId)),
    },
    { merge: true }
  );
  return {
    linked: true,
    rosterLinkId,
    courseId: String(courseId),
    classId: effectiveClassId,
    studentId: cleanStudentId,
  };
});

exports.linkClassroomRosterBatch = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const { courseId, classId, links } = request.data || {};
  const cleanCourseId = String(courseId || "");
  const cleanClassId = String(classId || "");
  if (!cleanCourseId || !cleanClassId || !Array.isArray(links) || !links.length) {
    throw new HttpsError(
      "invalid-argument",
      "courseId, classId and at least one roster link are required."
    );
  }
  if (links.length > 200) {
    throw new HttpsError("invalid-argument", "Link at most 200 students at a time.");
  }

  const db = getFirestore();
  const mapping = await getTeacherClassroomMapping(db, teacherUid, cleanCourseId);
  if (!mapping || String(mapping.classId) !== cleanClassId) {
    throw new HttpsError(
      "failed-precondition",
      "This Google Classroom course is not mapped to that MathMaster class."
    );
  }

  const classSnap = await db.doc(`classes/${cleanClassId}`).get();
  if (!classSnap.exists) throw new HttpsError("not-found", "The mapped MathMaster class no longer exists.");
  const classRecord = classSnap.data();

  const prepared = [];
  for (const item of links) {
    const studentId = String(item?.studentId || "").trim();
    const googleUserId = String(item?.googleUserId || "").trim();
    if (!studentId || !googleUserId) continue;
    // eslint-disable-next-line no-await-in-loop
    const studentSnap = await db.doc(`grades/${studentId}`).get();
    if (!studentSnap.exists) {
      throw new HttpsError("not-found", `MathMaster student ${studentId} does not exist.`);
    }
    if (!studentBelongsToMappedClass(studentSnap.data(), classRecord, cleanClassId)) {
      throw new HttpsError(
        "failed-precondition",
        `MathMaster student ${studentId} is not enrolled in the mapped class.`
      );
    }
    prepared.push({
      studentId,
      googleUserId,
      email: item.email || null,
      name: item.name || null,
    });
  }

  // One Google student can own only one MathMaster ID inside one Classroom
  // course. Read the teacher's existing links once so a teacher correction can
  // atomically replace a mistaken link instead of creating two grade-passback
  // routes for the same child.
  const existingSnapshot = await db
    .collection("classroomRosterLinks")
    .where("teacherUid", "==", teacherUid)
    .limit(1000)
    .get();
  const existingLinks = existingSnapshot.docs.map((doc) => ({
    ref: doc.ref,
    id: doc.id,
    ...(doc.data() || {}),
  }));

  const linksBeingReplaced = new Map();
  prepared.forEach((item) => {
    existingLinks
      .filter((entry) => (
        String(entry.courseId || "") === cleanCourseId
        && String(entry.googleUserId || "") === item.googleUserId
        && String(entry.studentId || "") !== item.studentId
      ))
      .forEach((entry) => linksBeingReplaced.set(entry.id, entry));
  });

  const batch = db.batch();
  const targetRosterLinkIds = new Set(
    prepared.map((item) => rosterLinkDocumentId(cleanCourseId, item.studentId))
  );
  for (const replaced of linksBeingReplaced.values()) {
    // If this same document is also one of the new targets (for example two
    // links being corrected/swapped in one teacher action), the later set()
    // replaces it. Avoid a delete+set pair on one document in the same batch.
    if (!targetRosterLinkIds.has(replaced.id)) batch.delete(replaced.ref);
  }

  // Remove the course from any old MathMaster owner. If that old ID has no
  // other Classroom link after this replacement, also clear the copied Google
  // identity so the wrong student's name can never remain on the account.
  const oldStudentIds = [...new Set(
    [...linksBeingReplaced.values()].map((entry) => String(entry.studentId || "")).filter(Boolean)
  )];
  const targetStudentIds = new Set(prepared.map((item) => item.studentId));
  for (const oldStudentId of oldStudentIds) {
    // A student who is also a target in this same batch remains linked to the
    // course; the target write below will replace the copied Google identity.
    if (targetStudentIds.has(oldStudentId)) continue;
    const hasRemainingLink = existingLinks.some((entry) => (
      String(entry.studentId || "") === oldStudentId
      && !linksBeingReplaced.has(entry.id)
    ));
    batch.set(
      db.doc(`grades/${oldStudentId}`),
      {
        classroomCourseIds: FieldValue.arrayRemove(cleanCourseId),
        ...(hasRemainingLink ? {} : {
          googleUserId: FieldValue.delete(),
          googleEmail: FieldValue.delete(),
          googleName: FieldValue.delete(),
        }),
      },
      { merge: true }
    );
  }

  for (const item of prepared) {
    const rosterLinkId = rosterLinkDocumentId(cleanCourseId, item.studentId);
    batch.set(
      db.doc(`classroomRosterLinks/${rosterLinkId}`),
      {
        rosterLinkId,
        teacherUid,
        classId: cleanClassId,
        courseId: cleanCourseId,
        studentId: item.studentId,
        googleUserId: item.googleUserId,
        email: item.email,
        name: item.name,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(
      db.doc(`grades/${item.studentId}`),
      {
        googleUserId: item.googleUserId,
        googleEmail: item.email,
        googleName: item.name,
        classroomCourseIds: FieldValue.arrayUnion(cleanCourseId),
      },
      { merge: true }
    );
  }
  if (prepared.length || linksBeingReplaced.size) await batch.commit();
  return { linked: prepared.length, replaced: linksBeingReplaced.size };
});

exports.ensureClassroomTopics = onCall(
  { secrets: GOOGLE_API_SECRETS },
  async (request) => {
    const teacherUid = await requireTeacher(request);
    const courseIds = [...new Set((request.data?.courseIds || []).map(String).filter(Boolean))];
    const topicNames = [...new Set(
      (request.data?.topicNames || []).map((value) => String(value).trim()).filter(Boolean)
    )];
    if (!courseIds.length || !topicNames.length) {
      throw new HttpsError("invalid-argument", "Select at least one course and one topic.");
    }

    const db = getFirestore();
    const classroom = await classroomLib().getClassroomClient(teacherUid);
    const results = [];
    for (const courseId of courseIds) {
      // eslint-disable-next-line no-await-in-loop
      const mapping = await getTeacherClassroomMapping(db, teacherUid, courseId);
      if (!mapping) {
        results.push({
          courseId,
          topicName: null,
          status: "failed",
          error: "Map this Google Classroom course to a MathMaster class first.",
        });
        continue;
      }
      for (const topicName of topicNames) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const topic = await classroomLib().ensureTopic(classroom, courseId, topicName);
          results.push({
            courseId,
            topicName,
            topicId: topic?.topicId || null,
            status: "ready",
          });
        } catch (error) {
          results.push({
            courseId,
            topicName,
            status: "failed",
            error: String(error.message || error),
          });
        }
      }
    }
    return { results };
  }
);

exports.storeLessonNotesPdf = onCall({ secrets: GOOGLE_API_SECRETS }, async (request) => {
  const { assignmentId, fileName, title, pageCount, base64 } = request.data || {};
  const cleanAssignmentId = String(assignmentId || "").trim();
  if (!cleanAssignmentId) throw new HttpsError("invalid-argument", "assignmentId is required.");
  if (typeof base64 !== "string" || !base64.trim()) {
    throw new HttpsError("invalid-argument", "The generated PDF content is missing.");
  }
  // Callable payloads are not a file-transfer API. One or two student-note
  // pages should be comfortably below this guard; reject accidental huge data.
  if (base64.length > 12_000_000) {
    throw new HttpsError("invalid-argument", "The generated notes PDF is too large. Keep it to one or two pages.");
  }

  const db = getFirestore();
  const assignmentRef = db.doc(`assignments/${cleanAssignmentId}`);
  const assignmentSnap = await assignmentRef.get();
  if (!assignmentSnap.exists) throw new HttpsError("not-found", "Assignment not found.");
  const { teacherUid } = await assertTeacherMayManageAssignment(request, assignmentSnap);

  let bytes;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    throw new HttpsError("invalid-argument", "The generated PDF could not be decoded.");
  }
  if (bytes.length < 8 || bytes.length > 8 * 1024 * 1024 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new HttpsError("invalid-argument", "The generated notes attachment is not a valid small PDF.");
  }

  const safeName = safePdfFileName(fileName || `${title || "MathMaster Student Notes"}.pdf`);
  const storagePath = `classroomResources/${teacherUid}/${cleanAssignmentId}/${safeName}`;
  const downloadToken = crypto.randomUUID();
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  await file.save(bytes, {
    resumable: false,
    validation: "md5",
    metadata: {
      contentType: "application/pdf",
      contentDisposition: `inline; filename="${safeName.replace(/"/g, "")}"`,
      cacheControl: "private, max-age=0, no-transform",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        mathMasterAssignmentId: cleanAssignmentId,
        mathMasterTeacherUid: teacherUid,
      },
    },
  });

  const encodedPath = encodeURIComponent(storagePath);
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodedPath}?alt=media&token=${encodeURIComponent(downloadToken)}`;
  const asset = {
    provider: "firebaseStorage",
    path: storagePath,
    url,
    fileName: safeName,
    title: String(title || "Student Notes").trim(),
    pageCount: Number(pageCount) === 1 ? 1 : 2,
    byteLength: bytes.length,
    generatedAt: new Date().toISOString(),
  };
  const assignment = assignmentSnap.data() || {};
  const driveScope = "https://www.googleapis.com/auth/drive.file";
  let driveAsset = null;
  let driveStatus = {
    status: "not-connected",
    message: "Reconnect the teacher Google account to place generated notes in Google Drive.",
    checkedAt: new Date().toISOString(),
  };

  try {
    const health = await classroomLib().getConnectionHealth(teacherUid);
    if (health.connected && !(health.missingScopes || []).includes(driveScope)) {
      const drive = await classroomLib().getDriveClient(teacherUid);
      driveAsset = await driveResources().upsertLessonNotesPdf({
        drive,
        bytes,
        assignmentId: cleanAssignmentId,
        fileName: safeName,
        title: asset.title,
        topicName: assignment?.classroomPackage?.topic?.name || "General Resources",
      });
      driveStatus = {
        status: "ready",
        driveFileId: driveAsset.driveFileId,
        folderName: driveAsset.folderName,
        checkedAt: new Date().toISOString(),
      };
    } else if (health.connected) {
      driveStatus = {
        status: "reconnect-required",
        message: "Reconnect Google once to grant MathMaster permission to create its lesson files in Drive.",
        missingScopes: health.missingScopes || [driveScope],
        checkedAt: new Date().toISOString(),
      };
    }
  } catch (driveError) {
    logger.error(
      `Generated notes were saved in MathMaster but could not be copied to Google Drive for assignment ${cleanAssignmentId}`,
      driveError
    );
    driveStatus = {
      status: "failed",
      message: String(driveError.message || driveError),
      checkedAt: new Date().toISOString(),
    };
  }

  const updateArgs = [
    new FieldPath("lessonResources", "notesPdf", "asset"),
    asset,
    new FieldPath("lessonResources", "notesPdf", "driveStatus"),
    driveStatus,
  ];
  if (driveAsset) {
    updateArgs.push(
      new FieldPath("lessonResources", "notesPdf", "driveAsset"),
      driveAsset
    );
  }
  await assignmentRef.update(...updateArgs);
  return { ...asset, driveAsset, driveStatus };
});

exports.publishClassroomMaterial = onCall(
  { secrets: GOOGLE_API_SECRETS },
  async (request) => {
    const teacherUid = await requireTeacher(request);
    const { title, description, topicName, materialKey } = request.data || {};
    const courseIds = [...new Set((request.data?.courseIds || []).map(String).filter(Boolean))];
    let materials = cleanMaterials(request.data?.materials);
    if (!title || !courseIds.length || !materials.length) {
      throw new HttpsError(
        "invalid-argument",
        "title, courseIds and at least one material link are required."
      );
    }

    const db = getFirestore();
    const classroom = await classroomLib().getClassroomClient(teacherUid);
    const results = [];
    const stableKey = String(materialKey || title);
    const assignmentResourceMatch = stableKey.match(/^assignment:(.+):resources$/);
    if (assignmentResourceMatch) {
      const resourceAssignment = await db.doc(`assignments/${assignmentResourceMatch[1]}`).get();
      if (resourceAssignment.exists) {
        materials = preferDriveNotesMaterial(materials, resourceAssignment.data());
      }
    }

    for (const courseId of courseIds) {
      const mapping = await getTeacherClassroomMapping(db, teacherUid, courseId);
      if (!mapping) {
        results.push({
          courseId,
          status: "failed",
          error: "Map this Google Classroom course to a MathMaster class first.",
        });
        continue;
      }

      const id = classroomMaterialDocumentId(teacherUid, courseId, stableKey);
      const ref = db.doc(`classroomMaterialLinks/${id}`);
      // eslint-disable-next-line no-await-in-loop
      const existing = await ref.get();
      if (existing.exists && existing.data().googleMaterialId) {
        results.push({
          courseId,
          status: "already-published",
          googleMaterialId: existing.data().googleMaterialId,
        });
        continue;
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        const topic = topicName
          ? await classroomLib().ensureTopic(classroom, courseId, topicName)
          : null;
        // eslint-disable-next-line no-await-in-loop
        const item = await classroomLib().createCourseWorkMaterial(classroom, {
          courseId,
          title: String(title).trim(),
          description: String(description || "").trim(),
          materials,
          topicId: topic?.topicId || null,
        });
        // eslint-disable-next-line no-await-in-loop
        await ref.set(
          {
            materialPublicationId: id,
            teacherUid,
            courseId,
            classId: mapping.classId,
            title: String(title).trim(),
            topicName: topicName || null,
            topicId: topic?.topicId || null,
            googleMaterialId: item.id,
            alternateLink: item.alternateLink || null,
            status: "published",
            publishedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        results.push({
          courseId,
          status: "published",
          googleMaterialId: item.id,
          classroomUrl: item.alternateLink || null,
        });
      } catch (error) {
        results.push({
          courseId,
          status: "failed",
          error: String(error.message || error),
        });
      }
    }
    return { results };
  }
);

// --- Multi-course publication ----------------------------------------------

async function resolvePublicationRef(db, assignmentId, courseId) {
  const modernRef = db.doc(
    `classroomLinks/${publicationDocumentId(assignmentId, courseId)}`
  );
  const modernSnap = await modernRef.get();
  if (modernSnap.exists) return { ref: modernRef, snap: modernSnap };

  // Backward compatibility: the original bundle stored one publication at
  // classroomLinks/{assignmentId}. Reuse it only when it already belongs to
  // this exact course; additional courses receive independent modern docs.
  const legacyRef = db.doc(`classroomLinks/${assignmentId}`);
  const legacySnap = await legacyRef.get();
  if (
    legacySnap.exists &&
    String(legacySnap.data().courseId || "") === String(courseId)
  ) {
    return { ref: legacyRef, snap: legacySnap };
  }

  return { ref: modernRef, snap: modernSnap };
}

async function claimPublication(ref, baseRecord) {
  const db = getFirestore();
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists ? snap.data() : {};

    if (current.status === "published" && current.courseworkId) {
      return { action: "already-published", current };
    }

    if (
      current.status === "publishing" &&
      Number(current.publishLeaseExpiresAt || 0) > Date.now()
    ) {
      return { action: "in-progress", current };
    }

    const attemptId = crypto.randomUUID();
    const patch = {
      ...baseRecord,
      status: "publishing",
      attemptId,
      publishLeaseExpiresAt: Date.now() + PUBLISH_LEASE_MS,
      updatedAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete(),
    };
    if (!snap.exists) patch.createdAt = FieldValue.serverTimestamp();
    transaction.set(ref, patch, { merge: true });
    return { action: "publish", attemptId, current };
  });
}

async function finishPublication(ref, attemptId, patch) {
  const db = getFirestore();
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().attemptId !== attemptId) return false;
    transaction.set(
      ref,
      {
        ...patch,
        updatedAt: FieldValue.serverTimestamp(),
        publishLeaseExpiresAt: FieldValue.delete(),
      },
      { merge: true }
    );
    return true;
  });
}

function publicationInstanceMarker(forceRequestId, courseId) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(String(forceRequestId || "") + "|" + String(courseId || ""))
    .digest("hex")
    .slice(0, 24);
  return `[MathMaster publication-instance:${fingerprint}]`;
}

function courseWorkMatchesPublication(courseWork, publicationId, requiredInstanceMarker = null) {
  if (!courseWork || !publicationId) return false;
  const description = String(courseWork.description || "");
  if (!description.includes(publicationMarker(publicationId))) return false;
  return !requiredInstanceMarker || description.includes(String(requiredInstanceMarker));
}

async function publishOneCourse({
  classroom,
  teacherUid,
  assignmentId,
  assignment,
  course,
  mapping,
  materials,
  topicName,
  instructions,
  classroomTitle,
  maxPoints,
  gradePassbackEnabled,
}) {
  const db = getFirestore();
  const courseId = String(course.id);
  const { ref: linkRef } = await resolvePublicationRef(db, assignmentId, courseId);
  const publicationId = linkRef.id;
  const dueAtValue = assignment.dueAt || assignment.dueDate || null;
  const baseRecord = {
    schemaVersion: 3,
    publicationId,
    teacherUid,
    assignmentId,
    classId: mapping.classId,
    classPeriod: mapping.classPeriod || null,
    courseId,
    courseName: course.name || courseId,
    courseSection: course.section || "",
    title: classroomTitle || assignment.title,
    dueAt: serializableDate(dueAtValue),
    maxPoints: Number.isFinite(Number(maxPoints)) ? Math.max(1, Math.min(1000, Number(maxPoints))) : 100,
    gradePassbackEnabled: gradePassbackEnabled !== false,
    materials,
    topicName: topicName || null,
  };

  const claim = await claimPublication(linkRef, baseRecord);
  if (claim.action === "already-published") {
    return {
      courseId,
      courseName: baseRecord.courseName,
      publicationId,
      status: "already-published",
      courseworkId: claim.current.courseworkId,
      classroomUrl: claim.current.classroomUrl || null,
    };
  }
  if (claim.action === "in-progress") {
    return {
      courseId,
      courseName: baseRecord.courseName,
      publicationId,
      status: "in-progress",
    };
  }

  const attemptId = claim.attemptId;
  const marker = publicationMarker(publicationId);
  const requiredInstanceMarker = String(claim.current.publicationInstanceMarker || "").trim() || null;
  const functionsBaseUrl = requirePublicEnv("FUNCTIONS_BASE_URL").replace(/\/$/, "");
  const launchToken = encryptLaunchPayload({
    assignmentId,
    courseId,
    publicationId,
  });
  const launchUrl = `${functionsBaseUrl}/resolveLaunchToken?token=${encodeURIComponent(
    launchToken
  )}`;

  try {
    let courseWork = null;
    const priorCourseworkId = claim.current.courseworkId;
    if (priorCourseworkId) {
      try {
        const candidate = await classroomLib().getCourseWork(
          classroom,
          courseId,
          priorCourseworkId
        );
        if (courseWorkMatchesPublication(candidate, publicationId, requiredInstanceMarker)) {
          courseWork = candidate;
        } else {
          logger.warn(
            `Ignoring stale Classroom coursework id ${priorCourseworkId} for publication ${publicationId}; marker does not match.`
          );
        }
      } catch {
        courseWork = null;
      }
    }
    if (!courseWork) {
      courseWork = await classroomLib().findCourseWorkByPublicationMarker(
        classroom,
        courseId,
        marker,
        requiredInstanceMarker ? [requiredInstanceMarker] : []
      );
    }

    const topic = topicName
      ? await classroomLib().ensureTopic(classroom, courseId, topicName)
      : null;

    if (!courseWork) {
      const resolvedTitle = String(classroomTitle || assignment.title || 'MathMaster Assignment').trim();
      const defaultInstructions = `Complete "${resolvedTitle}" in MathMaster.`;
      courseWork = await classroomLib().createCourseWork(classroom, {
        courseId,
        title: resolvedTitle,
        description: [
          String(instructions || defaultInstructions).trim(),
          marker,
          requiredInstanceMarker,
        ].filter(Boolean).join("\n\n"),
        dueDate: toDate(dueAtValue) || undefined,
        materials,
        launchUrl,
        maxPoints: Number.isFinite(Number(maxPoints)) ? Math.max(1, Math.min(1000, Number(maxPoints))) : 100,
        topicId: topic?.topicId || null,
      });
    }

    await finishPublication(linkRef, attemptId, {
      status: "published",
      teacherUid,
      classId: mapping.classId,
      classPeriod: mapping.classPeriod || null,
      courseworkId: courseWork.id,
      classroomUrl: courseWork.alternateLink || null,
      launchUrl,
      topicId: topic?.topicId || null,
      topicName: topic?.name || topicName || null,
      publishedAt: FieldValue.serverTimestamp(),
      syncedDueAt: serializableDate(dueAtValue),
      lastSyncedAt: FieldValue.serverTimestamp(),
      syncStatus: "in-sync",
      error: FieldValue.delete(),
    });

    return {
      courseId,
      courseName: baseRecord.courseName,
      publicationId,
      status: "published",
      courseworkId: courseWork.id,
      classroomUrl: courseWork.alternateLink || null,
      launchUrl,
      topicId: topic?.topicId || null,
    };
  } catch (err) {
    logger.error(
      `Failed to publish assignment ${assignmentId} to Classroom course ${courseId}`,
      err
    );
    await finishPublication(linkRef, attemptId, {
      status: "failed",
      error: String(err.message || err),
      failedAt: FieldValue.serverTimestamp(),
    });
    return {
      courseId,
      courseName: baseRecord.courseName,
      publicationId,
      status: "failed",
      error: String(err.message || err),
    };
  }
}

async function publishAssignmentBatch(request) {
  const teacherUid = await requireTeacher(request);
  const {
    assignmentId,
    materials,
    topicName,
    instructions,
    classroomTitle,
    maxPoints,
    gradePassbackEnabled,
  } = request.data || {};
  const rawCourseIds = request.data?.courseIds ||
    (request.data?.courseId ? [request.data.courseId] : []);
  const courseIds = [...new Set(rawCourseIds.map((value) => String(value)).filter(Boolean))];

  if (!assignmentId) {
    throw new HttpsError("invalid-argument", "assignmentId is required.");
  }
  if (courseIds.length === 0) {
    throw new HttpsError("invalid-argument", "Select at least one course.");
  }
  if (courseIds.length > MAX_CLASSROOM_COURSES_PER_BATCH) {
    throw new HttpsError(
      "invalid-argument",
      `A maximum of ${MAX_CLASSROOM_COURSES_PER_BATCH} courses may be published at once.`
    );
  }

  const db = getFirestore();
  const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnap.exists) {
    throw new HttpsError("not-found", "Assignment not found.");
  }
  const assignment = assignmentSnap.data();
  if ((await testCycleLib.shared()).policy.declaresTestCycle(assignment)) {
    const loaded = await loadTestCycleAssignment(db, assignmentId, { allowInvalid: true });
    const { result: cyclePreflight } = await runTestCyclePreflight(db, loaded);
    if (cyclePreflight.blocked) {
      throw new HttpsError(
        "failed-precondition",
        `This Test Cycle cannot be published: ${cyclePreflight.errors[0]}`,
        { preflight: cyclePreflight },
      );
    }
  }
  const audience = assignmentAudience(assignment);
  if (!audience.classIds.length) {
    throw new HttpsError(
      "failed-precondition",
      "This MathMaster assignment is still in the library. Assign it to a class before publishing it to Google Classroom."
    );
  }

  const classroom = await classroomLib().getClassroomClient(teacherUid);
  const activeCourses = await classroomLib().listCourses(classroom);
  const courseMap = new Map(activeCourses.map((course) => [String(course.id), course]));
  const safeMaterials = preferDriveNotesMaterial(cleanMaterials(materials), assignment);
  const cleanTopic = String(topicName || "").trim().slice(0, 200);
  const cleanInstructions = String(instructions || "").trim().slice(0, 20000);
  const results = [];

  for (const courseId of courseIds) {
    const course = courseMap.get(courseId);
    if (!course) {
      results.push({
        courseId,
        courseName: courseId,
        status: "failed",
        error: "The connected teacher is not an active teacher in this Google Classroom course.",
      });
      continue;
    }

    // The MathMaster class mapping is the audience boundary. A teacher can
    // never accidentally publish Period 2 work into a mapped Period 5 course.
    // eslint-disable-next-line no-await-in-loop
    const mapping = await getTeacherClassroomMapping(db, teacherUid, courseId);
    if (!mapping) {
      results.push({
        courseId,
        courseName: course.name || courseId,
        status: "failed",
        error: "Map this Google Classroom course to a MathMaster class first.",
      });
      continue;
    }
    const mappedClassId = String(mapping.classId || "").trim();
    const mappingMatchesAudience = Boolean(mappedClassId && audience.classIds.includes(mappedClassId));
    if (!mappingMatchesAudience) {
      results.push({
        courseId,
        courseName: course.name || courseId,
        status: "failed",
        error: `This assignment is not assigned to ${mapping.className || mapping.classPeriod || "the mapped MathMaster class"}.`,
      });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    results.push(
      await publishOneCourse({
        classroom,
        teacherUid,
        assignmentId: String(assignmentId),
        assignment,
        course,
        mapping,
        materials: safeMaterials,
        topicName: cleanTopic,
        instructions: cleanInstructions,
        classroomTitle: String(classroomTitle || assignment.title || '').trim().slice(0, 300),
        maxPoints,
        gradePassbackEnabled,
      })
    );
  }

  return {
    assignmentId: String(assignmentId),
    results,
    summary: {
      selected: results.length,
      published: results.filter((item) => item.status === "published").length,
      alreadyPublished: results.filter(
        (item) => item.status === "already-published"
      ).length,
      inProgress: results.filter((item) => item.status === "in-progress").length,
      failed: results.filter((item) => item.status === "failed").length,
    },
  };
}

exports.publishAssignmentToClassrooms = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  publishAssignmentBatch
);

// --- Updating already-published posts ---------------------------------------
//
// Publishing and updating are different operations and must stay different
// callables. `publishOneCourse` returns "already-published" the moment a link
// carries a courseworkId, which is correct for publishing and useless for a
// teacher who has moved the due date: the post students see would never change.
//
// This path patches the existing CourseWork in place, one course at a time, and
// records what was actually sent so staleness stays a comparison rather than a
// flag. A failure on one course leaves the others updated and retryable.

async function updateAssignmentClassroomPublications(request) {
  const teacherUid = await requireTeacher(request);

  const { assignmentId, courseIds } = request.data || {};
  if (!assignmentId) {
    throw new HttpsError("invalid-argument", "assignmentId is required.");
  }

  const db = getFirestore();
  const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnap.exists) {
    throw new HttpsError("not-found", "That assignment no longer exists.");
  }
  const assignment = assignmentSnap.data();

  const dueAtValue = assignment.dueAt || assignment.dueDate || null;
  const dueDate = toDate(dueAtValue);
  if (!dueDate) {
    // Nothing coherent to send. An unassigned library item has no due date at
    // all, and Classroom cannot represent "whenever".
    throw new HttpsError(
      "failed-precondition",
      "This assignment has no due date. Set one in MathMaster before updating Google Classroom."
    );
  }

  const linkSnap = await db
    .collection("classroomLinks")
    .where("assignmentId", "==", String(assignmentId))
    .get();

  const requested = Array.isArray(courseIds) && courseIds.length
    ? new Set(courseIds.map(String))
    : null;

  const publications = linkSnap.docs
    .map((doc) => ({ ref: doc.ref, data: doc.data() }))
    .filter((entry) => entry.data.status === "published" && entry.data.courseworkId)
    .filter((entry) => !entry.data.teacherUid || entry.data.teacherUid === teacherUid)
    .filter((entry) => !requested || requested.has(String(entry.data.courseId)));

  if (!publications.length) {
    return { assignmentId: String(assignmentId), results: [], summary: { updated: 0, failed: 0, skipped: 0 } };
  }

  const classroom = await classroomLib().getClassroomClient(teacherUid);
  const results = [];

  for (const { ref, data } of publications) {
    const courseId = String(data.courseId);
    try {
      // Read the live item first so an association we must preserve — a grading
      // period, in particular — is carried into the patch rather than cleared
      // by omission.
      let existing = null;
      try {
        existing = await classroomLib().getCourseWork(classroom, courseId, data.courseworkId);
      } catch {
        existing = null;
      }
      if (!existing) {
        throw new Error(
          "That Classroom post no longer exists. Publish the assignment again to recreate it."
        );
      }

      const updated = await classroomLib().patchCourseWork(classroom, {
        courseId,
        courseWorkId: data.courseworkId,
        dueDate,
        gradingPeriodId: existing.gradingPeriodId || null,
      });

      // Written only after Google confirmed, so a failed patch leaves the
      // record honestly stale rather than claiming a sync that never happened.
      await ref.set(
        {
          syncedDueAt: serializableDate(dueAtValue),
          lastSyncedAt: FieldValue.serverTimestamp(),
          syncStatus: "in-sync",
          syncError: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      results.push({
        courseId,
        courseName: data.courseName || courseId,
        status: "updated",
        courseworkId: updated.id || data.courseworkId,
        classroomUrl: updated.alternateLink || data.classroomUrl || null,
      });
    } catch (err) {
      logger.error(
        `Failed to update Classroom due date for assignment ${assignmentId} course ${courseId}`,
        err
      );
      await ref.set(
        {
          syncStatus: "stale",
          syncError: String(err.message || err),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      results.push({
        courseId,
        courseName: data.courseName || courseId,
        status: "failed",
        error: String(err.message || err),
      });
    }
  }

  return {
    assignmentId: String(assignmentId),
    results,
    summary: {
      updated: results.filter((item) => item.status === "updated").length,
      failed: results.filter((item) => item.status === "failed").length,
      skipped: 0,
    },
  };
}

exports.updateAssignmentClassroomPublications = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  updateAssignmentClassroomPublications
);



// Backward-compatible one-course callable used by older frontends.
exports.publishAssignmentToClassroom = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  async (request) => {
    const batch = await publishAssignmentBatch(request);
    const result = batch.results[0];
    if (!result || result.status === "failed") {
      throw new HttpsError(
        "internal",
        result?.error || "Failed to publish assignment to Google Classroom."
      );
    }
    return {
      assignmentId: batch.assignmentId,
      ...result,
    };
  }
);

function classroomDeleteAlreadyGone(error) {
  const status = Number(error?.response?.status || error?.code || 0);
  const message = String(
    error?.response?.data?.error?.message || error?.message || error || ""
  );
  return status === 404
    || /already deleted|already been deleted|not found|failed[_ -]?precondition/i.test(message);
}

async function queueRepostedAssignmentGrades({
  db,
  teacherUid,
  courseId,
  assignmentId,
}) {
  // Reposting a deleted Classroom item gives the assignment a new courseWork
  // id. Existing MathMaster grades do not naturally change at that moment, so
  // the grade trigger would otherwise have nothing to react to. Re-use the
  // same release-signal field the explicit Retry action uses. Only students
  // already linked to this exact Classroom course are queued, and the existing
  // grade trigger still checks assignment completion / feedback-release policy.
  const rosterSnapshot = await db
    .collection("classroomRosterLinks")
    .where("teacherUid", "==", teacherUid)
    .limit(1000)
    .get();
  const studentIds = [...new Set(
    rosterSnapshot.docs
      .map((doc) => doc.data() || {})
      .filter((entry) => String(entry.courseId || "") === String(courseId))
      .map((entry) => String(entry.studentId || "").trim())
      .filter(Boolean)
  )];
  if (!studentIds.length) {
    return { linkedStudents: 0, queuedStudents: 0 };
  }

  const gradeRefs = studentIds.map((studentId) => db.doc(`grades/${studentId}`));
  const gradeSnapshots = await db.getAll(...gradeRefs);
  const existingGrades = gradeSnapshots.filter((snapshot) => snapshot.exists);
  const queuedAt = new Date().toISOString();

  for (let start = 0; start < existingGrades.length; start += 400) {
    const batch = db.batch();
    existingGrades.slice(start, start + 400).forEach((snapshot) => {
      batch.update(
        snapshot.ref,
        new FieldPath("classroomReleaseSignals", String(assignmentId)),
        queuedAt
      );
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }

  return {
    linkedStudents: studentIds.length,
    queuedStudents: existingGrades.length,
  };
}

// Repair only the downstream Google Classroom copy. The MathMaster assignment,
// student trackers, grades, and publication identity remain authoritative and
// unchanged. If the remembered courseWork still exists this callable is a
// no-op; if Google reports it was deleted, the same publication record is
// repointed to a freshly created courseWork item and existing completed grades
// are queued for passback to the new submissions.
exports.repairClassroomAssignmentPublications = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  async (request) => {
    const teacherUid = await requireTeacher(request);
    const assignmentId = String(request.data?.assignmentId || "").trim();
    const requestedCourseIds = Array.isArray(request.data?.courseIds)
      ? new Set(request.data.courseIds.map((value) => String(value)).filter(Boolean))
      : null;
    if (!assignmentId) {
      throw new HttpsError("invalid-argument", "assignmentId is required.");
    }

    const db = getFirestore();
    const assignmentSnap = await db.doc("assignments/" + assignmentId).get();
    if (!assignmentSnap.exists) {
      throw new HttpsError("not-found", "Assignment not found.");
    }
    const assignment = assignmentSnap.data();
    const audience = assignmentAudience(assignment);
    if (!audience.classIds.length) {
      throw new HttpsError(
        "failed-precondition",
        "This MathMaster assignment is not currently assigned to a class."
      );
    }

    // Reconcile against the assignment's CURRENT destinations, not every
    // historic publication that happens to share the assignment id. This is
    // critical when one lesson is reused across periods: a healthy post in
    // Period 2 must never make a missing Period 6 post look healthy.
    const [publicationSnapshot, mappingSnapshot] = await Promise.all([
      db.collection("classroomLinks")
        .where("assignmentId", "==", assignmentId)
        .get(),
      db.collection("classroomCourseMappings")
        .where("teacherUid", "==", teacherUid)
        .limit(100)
        .get(),
    ]);

    const existingPublications = publicationSnapshot.docs
      .map((doc) => ({ ref: doc.ref, id: doc.id, data: doc.data() || {} }))
      .filter(({ data }) => !data.teacherUid || data.teacherUid === teacherUid)
      .filter(({ data }) => data.courseId);

    const publicationByCourseId = new Map();
    for (const publication of existingPublications) {
      const courseId = String(publication.data.courseId || "");
      const modernId = publicationDocumentId(assignmentId, courseId);
      const current = publicationByCourseId.get(courseId);
      if (!current || publication.id === modernId) {
        publicationByCourseId.set(courseId, publication);
      }
    }

    const mappings = mappingSnapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((mapping) => mapping.courseId && mapping.classId);

    const targetMappings = mappings
      .filter((mapping) => audience.classIds.includes(String(mapping.classId)))
      .filter((mapping) => !requestedCourseIds || requestedCourseIds.has(String(mapping.courseId)));

    const targetCourseIds = new Set(targetMappings.map((mapping) => String(mapping.courseId)));
    const mappedClassIds = new Set(targetMappings.map((mapping) => String(mapping.classId)));
    const ignoredPriorDestinations = existingPublications.filter(
      (publication) => !targetCourseIds.has(String(publication.data.courseId || ""))
    ).length;

    const results = [];

    // If the teacher asked MathMaster to check all currently assigned classes,
    // surface missing Google Classroom mappings as failures instead of
    // returning a misleading "healthy" result from another period.
    if (!requestedCourseIds) {
      const unmappedClassIds = audience.classIds.filter((classId) => !mappedClassIds.has(String(classId)));
      for (const classId of unmappedClassIds) {
        // eslint-disable-next-line no-await-in-loop
        const classSnap = await db.doc("classes/" + String(classId)).get();
        const classRecord = classSnap.exists ? classSnap.data() || {} : {};
        results.push({
          courseId: null,
          classId: String(classId),
          courseName: classRecord.name || classRecord.period || ("MathMaster class " + classId),
          status: "failed",
          error: "No Google Classroom course is currently mapped to this assigned MathMaster class.",
        });
      }
    }

    if (!targetMappings.length) {
      return {
        assignmentId,
        results,
        summary: {
          checked: results.length,
          healthy: 0,
          reposted: 0,
          failed: results.filter((item) => item.status === "failed").length,
          queuedGrades: 0,
          targetDestinations: 0,
          ignoredPriorDestinations,
        },
      };
    }

    const classroom = await classroomLib().getClassroomClient(teacherUid);
    const activeCourses = await classroomLib().listCourses(classroom);
    const courseMap = new Map(activeCourses.map((course) => [String(course.id), course]));

    // A sibling publication is a safe template for the same MathMaster
    // assignment's materials/settings when one current destination never got
    // its own publication record.
    const publicationTemplate = (
      existingPublications.find(({ data }) => Array.isArray(data.materials) && data.materials.length)
      || existingPublications[0]
      || { data: {} }
    ).data || {};
    const classroomPackage = assignment.classroomPackage || {};
    const assignmentPost = classroomPackage.assignmentPost || {};

    for (const mapping of targetMappings) {
      const courseId = String(mapping.courseId || "");
      const course = courseMap.get(courseId);
      if (!course) {
        results.push({
          courseId,
          courseName: mapping.courseName || courseId,
          status: "failed",
          error: "The connected teacher is not an active teacher in this Google Classroom course.",
        });
        continue;
      }

      const publication = publicationByCourseId.get(courseId) || null;
      const data = publication?.data || publicationTemplate;
      const priorCourseworkId = String(publication?.data?.courseworkId || "").trim();
      let existingCourseWork = null;

      if (publication && priorCourseworkId) {
        try {
          // A healthy post must be THIS MathMaster publication in THIS current
          // Google Classroom course. Posts for sibling periods are ignored.
          // eslint-disable-next-line no-await-in-loop
          existingCourseWork = await classroomLib().getCourseWork(
            classroom,
            courseId,
            priorCourseworkId
          );
          if (courseWorkMatchesPublication(
            existingCourseWork,
            publication.id,
            String(data.publicationInstanceMarker || "").trim() || null
          )) {
            results.push({
              courseId,
              courseName: course.name || data.courseName || courseId,
              publicationId: publication.id,
              courseworkId: priorCourseworkId,
              classroomUrl: existingCourseWork.alternateLink || data.classroomUrl || null,
              status: "healthy",
            });
            continue;
          }
          logger.warn(
            "Classroom coursework id " + priorCourseworkId
              + " exists but does not match publication " + publication.id
              + "; repairing the stale link."
          );
        } catch (error) {
          if (!classroomDeleteAlreadyGone(error)) {
            results.push({
              courseId,
              courseName: course.name || data.courseName || courseId,
              publicationId: publication.id,
              courseworkId: priorCourseworkId,
              status: "failed",
              error: "Could not verify the existing Classroom assignment: " + String(error.message || error),
            });
            continue;
          }
        }

        // Change only the publication state needed to let publishOneCourse
        // claim a repair lease. Keep the missing id until the replacement
        // succeeds so failures remain diagnosable and retryable.
        // eslint-disable-next-line no-await-in-loop
        const claimedForRepair = await db.runTransaction(async (transaction) => {
          const currentSnap = await transaction.get(publication.ref);
          if (!currentSnap.exists) return false;
          const current = currentSnap.data() || {};
          if (current.teacherUid && current.teacherUid !== teacherUid) return false;
          if (String(current.courseworkId || "") !== priorCourseworkId) return false;
          transaction.set(
            publication.ref,
            {
              status: "missing",
              missingCourseworkId: priorCourseworkId,
              missingReason: existingCourseWork
                ? "stored-coursework-id-does-not-match-publication"
                : "stored-coursework-id-not-found",
              missingDetectedAt: FieldValue.serverTimestamp(),
              error: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return true;
        });
        if (!claimedForRepair) {
          results.push({
            courseId,
            courseName: course.name || data.courseName || courseId,
            publicationId: publication.id,
            courseworkId: priorCourseworkId,
            status: "changed",
            error: "The Classroom publication changed while MathMaster was checking it. Refresh and try again.",
          });
          continue;
        }
      }

      const safeMaterials = preferDriveNotesMaterial(
        cleanMaterials(Array.isArray(data.materials) ? data.materials : publicationTemplate.materials),
        assignment
      );

      // No publication for this current course is also a repair case. This is
      // the gap that used to let a healthy sibling-period post hide a missing
      // destination. publishOneCourse creates the per-course publication id.
      // eslint-disable-next-line no-await-in-loop
      const republished = await publishOneCourse({
        classroom,
        teacherUid,
        assignmentId,
        assignment,
        course,
        mapping,
        materials: safeMaterials,
        topicName: data.topicName || classroomPackage?.topic?.name || "",
        instructions: assignmentPost.instructions
          || ("Complete \"" + (assignment.title || data.title || "MathMaster Assignment") + "\" in MathMaster."),
        classroomTitle: assignmentPost.title || data.title || assignment.title,
        maxPoints: Number(data.maxPoints || assignmentPost.maxPoints) || 100,
        gradePassbackEnabled: data.gradePassbackEnabled !== false,
      });

      if (!["published", "already-published"].includes(republished.status)) {
        results.push({
          courseId,
          courseName: course.name || data.courseName || courseId,
          publicationId: publication?.id || republished.publicationId || null,
          courseworkId: priorCourseworkId || null,
          status: "failed",
          error: republished.error || "Google Classroom could not recreate the assignment.",
        });
        continue;
      }

      const resolvedPublicationId = publication?.id || republished.publicationId || publicationDocumentId(assignmentId, courseId);
      if (publication && priorCourseworkId) {
        // eslint-disable-next-line no-await-in-loop
        await publication.ref.set(
          {
            repostedAt: FieldValue.serverTimestamp(),
            repostedBy: teacherUid,
            repostedFromCourseworkId: priorCourseworkId,
            missingCourseworkId: FieldValue.delete(),
            missingReason: FieldValue.delete(),
            missingDetectedAt: FieldValue.delete(),
          },
          { merge: true }
        );
      } else {
        const resolved = await resolvePublicationRef(db, assignmentId, courseId);
        // eslint-disable-next-line no-await-in-loop
        await resolved.ref.set(
          {
            repostedAt: FieldValue.serverTimestamp(),
            repostedBy: teacherUid,
            repostedFromCourseworkId: null,
            repostReason: publication ? "publication-had-no-coursework-id" : "missing-publication-record",
          },
          { merge: true }
        );
      }

      let gradeQueue = { linkedStudents: 0, queuedStudents: 0 };
      try {
        // eslint-disable-next-line no-await-in-loop
        gradeQueue = await queueRepostedAssignmentGrades({
          db,
          teacherUid,
          courseId,
          assignmentId,
        });
      } catch (error) {
        logger.error(
          "Reposted Classroom assignment " + assignmentId
            + " to course " + courseId
            + ", but could not queue existing grades",
          error
        );
        gradeQueue = {
          linkedStudents: 0,
          queuedStudents: 0,
          error: String(error.message || error),
        };
      }

      results.push({
        courseId,
        courseName: course.name || data.courseName || courseId,
        publicationId: resolvedPublicationId,
        status: "reposted",
        oldCourseworkId: priorCourseworkId || null,
        courseworkId: republished.courseworkId,
        classroomUrl: republished.classroomUrl || null,
        linkedStudents: gradeQueue.linkedStudents,
        queuedGrades: gradeQueue.queuedStudents,
        gradeQueueError: gradeQueue.error || null,
        repostReason: publication
          ? (priorCourseworkId ? "missing-or-mismatched-coursework" : "publication-had-no-coursework-id")
          : "missing-publication-record",
      });
    }

    return {
      assignmentId,
      results,
      summary: {
        checked: results.length,
        healthy: results.filter((item) => item.status === "healthy").length,
        reposted: results.filter((item) => item.status === "reposted").length,
        failed: results.filter((item) => ["failed", "changed"].includes(item.status)).length,
        queuedGrades: results.reduce((total, item) => total + Number(item.queuedGrades || 0), 0),
        targetDestinations: targetMappings.length,
        ignoredPriorDestinations,
      },
    };
  }
);

// Explicit teacher override: create a NEW Google Classroom assignment post in
// selected mapped courses even when MathMaster can still verify an older post.
// This is deliberately separate from repair/publish so a duplicate can never be
// created by accident. The MathMaster assignment and student work remain
// unchanged; grade passback is repointed to the new CourseWork id.
exports.forceRepublishAssignmentToClassrooms = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  async (request) => {
    const teacherUid = await requireTeacher(request);
    const assignmentId = String(request.data?.assignmentId || "").trim();
    const forceRequestId = String(request.data?.forceRequestId || crypto.randomUUID()).trim();
    const rawCourseIds = Array.isArray(request.data?.courseIds) ? request.data.courseIds : [];
    const courseIds = [...new Set(rawCourseIds.map((value) => String(value)).filter(Boolean))];

    if (!assignmentId) {
      throw new HttpsError("invalid-argument", "assignmentId is required.");
    }
    if (!courseIds.length) {
      throw new HttpsError("invalid-argument", "Select at least one Google Classroom course.");
    }
    if (courseIds.length > MAX_CLASSROOM_COURSES_PER_BATCH) {
      throw new HttpsError(
        "invalid-argument",
        `A maximum of ${MAX_CLASSROOM_COURSES_PER_BATCH} courses may be force-reposted at once.`
      );
    }

    const db = getFirestore();
    const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
    if (!assignmentSnap.exists) {
      throw new HttpsError("not-found", "Assignment not found.");
    }
    const assignment = assignmentSnap.data() || {};
    const audience = assignmentAudience(assignment);
    if (!audience.classIds.length) {
      throw new HttpsError(
        "failed-precondition",
        "Assign this MathMaster assignment to a class before force-reposting it."
      );
    }

    const classroom = await classroomLib().getClassroomClient(teacherUid);
    const activeCourses = await classroomLib().listCourses(classroom);
    const courseMap = new Map(activeCourses.map((course) => [String(course.id), course]));
    const classroomPackage = assignment.classroomPackage || {};
    const assignmentPost = classroomPackage.assignmentPost || {};
    const requestedMaterials = preferDriveNotesMaterial(
      cleanMaterials(request.data?.materials),
      assignment
    );
    const requestedTopicName = String(
      request.data?.topicName || classroomPackage?.topic?.name || ""
    ).trim().slice(0, 200);
    const requestedInstructions = String(
      request.data?.instructions
      || assignmentPost.instructions
      || `Complete "${assignment.title || "MathMaster Assignment"}" in MathMaster.`
    ).trim().slice(0, 20000);
    const requestedTitle = String(
      request.data?.classroomTitle || assignmentPost.title || assignment.title || "MathMaster Assignment"
    ).trim().slice(0, 300);
    const requestedMaxPoints = Number.isFinite(Number(request.data?.maxPoints))
      ? Math.max(1, Math.min(1000, Number(request.data.maxPoints)))
      : Number.isFinite(Number(assignmentPost.maxPoints))
        ? Math.max(1, Math.min(1000, Number(assignmentPost.maxPoints)))
        : 100;
    const gradePassbackEnabled = request.data?.gradePassbackEnabled !== false
      && classroomPackage?.gradePassback?.enabled !== false;
    const dueAtValue = assignment.dueAt || assignment.dueDate || null;
    const functionsBaseUrl = requirePublicEnv("FUNCTIONS_BASE_URL").replace(/\/$/, "");
    const results = [];

    for (const courseId of courseIds) {
      const course = courseMap.get(courseId);
      if (!course) {
        results.push({
          courseId,
          courseName: courseId,
          status: "failed",
          error: "The connected teacher is not an active teacher in this Google Classroom course.",
        });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const mapping = await getTeacherClassroomMapping(db, teacherUid, courseId);
      const mappedClassId = String(mapping?.classId || "").trim();
      if (!mapping || !mappedClassId) {
        results.push({
          courseId,
          courseName: course.name || courseId,
          status: "failed",
          error: "Map this Google Classroom course to a MathMaster class first.",
        });
        continue;
      }
      if (!audience.classIds.includes(mappedClassId)) {
        results.push({
          courseId,
          courseName: course.name || courseId,
          status: "failed",
          error: `This assignment is not assigned to ${mapping.className || mapping.classPeriod || "the mapped MathMaster class"}.`,
        });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const { ref: publicationRef, snap: publicationSnap } = await resolvePublicationRef(
        db,
        assignmentId,
        courseId
      );
      const publicationId = publicationRef.id;
      const prior = publicationSnap.exists ? publicationSnap.data() || {} : {};
      const priorCourseworkId = String(prior.courseworkId || "").trim() || null;

      // A client retry of the SAME button click returns the already-created new
      // post rather than creating another duplicate.
      if (
        prior.lastForceRequestId === forceRequestId
        && prior.courseworkId
        && prior.status === "published"
      ) {
        results.push({
          courseId,
          courseName: course.name || prior.courseName || courseId,
          publicationId,
          courseworkId: String(prior.courseworkId),
          classroomUrl: prior.classroomUrl || null,
          status: "already-forced",
          queuedGrades: 0,
        });
        continue;
      }

      const baseMarker = publicationMarker(publicationId);
      const instanceMarker = publicationInstanceMarker(forceRequestId, courseId);
      const launchToken = encryptLaunchPayload({ assignmentId, courseId, publicationId });
      const launchUrl = `${functionsBaseUrl}/resolveLaunchToken?token=${encodeURIComponent(launchToken)}`;

      let materials = requestedMaterials;
      if (!materials.length && Array.isArray(prior.materials)) {
        materials = preferDriveNotesMaterial(cleanMaterials(prior.materials), assignment);
      }

      try {
        // Idempotency across a transport retry where Google succeeded but the
        // Firestore update did not: find the deterministic force-request marker
        // before creating another CourseWork item.
        // eslint-disable-next-line no-await-in-loop
        let courseWork = await classroomLib().findCourseWorkByPublicationMarker(
          classroom,
          courseId,
          baseMarker,
          [instanceMarker]
        );

        // eslint-disable-next-line no-await-in-loop
        const topic = requestedTopicName
          ? await classroomLib().ensureTopic(classroom, courseId, requestedTopicName)
          : null;

        if (!courseWork) {
          // eslint-disable-next-line no-await-in-loop
          courseWork = await classroomLib().createCourseWork(classroom, {
            courseId,
            title: requestedTitle,
            description: [requestedInstructions, baseMarker, instanceMarker].join("\n\n"),
            dueDate: toDate(dueAtValue) || undefined,
            materials,
            launchUrl,
            maxPoints: requestedMaxPoints,
            topicId: topic?.topicId || null,
          });
        }

        const update = {
          schemaVersion: 4,
          publicationId,
          teacherUid,
          assignmentId,
          classId: mapping.classId,
          classPeriod: mapping.classPeriod || null,
          courseId,
          courseName: course.name || courseId,
          courseSection: course.section || "",
          title: requestedTitle,
          dueAt: serializableDate(dueAtValue),
          maxPoints: requestedMaxPoints,
          gradePassbackEnabled,
          materials,
          topicName: topic?.name || requestedTopicName || null,
          topicId: topic?.topicId || null,
          status: "published",
          courseworkId: courseWork.id,
          classroomUrl: courseWork.alternateLink || null,
          launchUrl,
          publicationInstanceMarker: instanceMarker,
          lastForceRequestId: forceRequestId,
          forcedRepostCount: FieldValue.increment(1),
          forcedRepostedAt: FieldValue.serverTimestamp(),
          forcedRepostedBy: teacherUid,
          publishedAt: FieldValue.serverTimestamp(),
          syncedDueAt: serializableDate(dueAtValue),
          lastSyncedAt: FieldValue.serverTimestamp(),
          syncStatus: "in-sync",
          error: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (priorCourseworkId && priorCourseworkId !== String(courseWork.id)) {
          update.supersededCourseworkIds = FieldValue.arrayUnion(priorCourseworkId);
          update.forcedRepostedFromCourseworkId = priorCourseworkId;
        }

        // eslint-disable-next-line no-await-in-loop
        await publicationRef.set(update, { merge: true });

        let gradeQueue = { linkedStudents: 0, queuedStudents: 0 };
        try {
          // eslint-disable-next-line no-await-in-loop
          gradeQueue = await queueRepostedAssignmentGrades({
            db,
            teacherUid,
            courseId,
            assignmentId,
          });
        } catch (gradeError) {
          logger.error(
            `Forced Classroom repost for assignment ${assignmentId} course ${courseId} could not queue existing grades`,
            gradeError
          );
          gradeQueue = {
            linkedStudents: 0,
            queuedStudents: 0,
            error: String(gradeError.message || gradeError),
          };
        }

        results.push({
          courseId,
          courseName: course.name || courseId,
          publicationId,
          oldCourseworkId: priorCourseworkId,
          courseworkId: String(courseWork.id),
          classroomUrl: courseWork.alternateLink || null,
          status: "forced-reposted",
          linkedStudents: gradeQueue.linkedStudents,
          queuedGrades: gradeQueue.queuedStudents,
          gradeQueueError: gradeQueue.error || null,
        });
      } catch (error) {
        logger.error(
          `Failed forced Classroom repost for assignment ${assignmentId} course ${courseId}`,
          error
        );
        results.push({
          courseId,
          courseName: course.name || courseId,
          publicationId,
          oldCourseworkId: priorCourseworkId,
          status: "failed",
          error: String(error.message || error),
        });
      }
    }

    return {
      assignmentId,
      forceRequestId,
      results,
      summary: {
        selected: results.length,
        forcedReposted: results.filter((item) => item.status === "forced-reposted").length,
        alreadyForced: results.filter((item) => item.status === "already-forced").length,
        failed: results.filter((item) => item.status === "failed").length,
        queuedGrades: results.reduce((total, item) => total + Number(item.queuedGrades || 0), 0),
      },
    };
  }
);

// Read the live Google Classroom roster and the live coursework audience.
// Setting repairAudience=true also resets MathMaster-created coursework to
// ALL_STUDENTS through Classroom's modifyAssignees endpoint.
exports.inspectClassroomPublication = onCall(
  { secrets: GOOGLE_API_SECRETS },
  async (request) => {
    const teacherUid = await requireTeacher(request);
    const assignmentId = String(request.data?.assignmentId || "").trim();
    const repairAudience = request.data?.repairAudience === true;
    if (!assignmentId) {
      throw new HttpsError("invalid-argument", "assignmentId is required.");
    }

    const db = getFirestore();
    const snap = await db
      .collection("classroomLinks")
      .where("assignmentId", "==", assignmentId)
      .get();

    const publications = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((item) => !item.teacherUid || item.teacherUid === teacherUid)
      .filter((item) => item.courseId && item.courseworkId && item.status === "published");

    if (!publications.length) {
      return { assignmentId, results: [], summary: { courses: 0, rosterStudents: 0, failed: 0 } };
    }

    const classroom = await classroomLib().getClassroomClient(teacherUid);
    const results = [];

    for (const publication of publications) {
      const courseId = String(publication.courseId);
      try {
        let courseWork = await classroomLib().getCourseWork(
          classroom,
          courseId,
          String(publication.courseworkId)
        );

        if (!courseWorkMatchesPublication(
          courseWork,
          publication.id,
          String(publication.publicationInstanceMarker || "").trim() || null
        )) {
          results.push({
            courseId,
            courseName: publication.courseName || courseId,
            courseworkId: String(publication.courseworkId),
            status: "mismatched",
            error: "The stored Google Classroom coursework id points to a different Classroom item. Use Check / Repost Classroom to repair the publication link.",
          });
          continue;
        }

        if (repairAudience && courseWork.assigneeMode !== "ALL_STUDENTS") {
          courseWork = await classroomLib().modifyCourseWorkAssignees(classroom, {
            courseId,
            courseWorkId: String(publication.courseworkId),
            assigneeMode: "ALL_STUDENTS",
          });
        }

        const students = await classroomLib().listStudents(classroom, courseId);

        results.push({
          courseId,
          courseName: publication.courseName || courseId,
          courseworkId: String(publication.courseworkId),
          classroomUrl: courseWork.alternateLink || publication.classroomUrl || null,
          state: courseWork.state || null,
          assigneeMode: courseWork.assigneeMode || "ALL_STUDENTS",
          individualStudentCount: Array.isArray(courseWork.individualStudentsOptions?.studentIds)
            ? courseWork.individualStudentsOptions.studentIds.length
            : 0,
          rosterStudentCount: students.length,
          status: "ok",
        });
      } catch (error) {
        results.push({
          courseId,
          courseName: publication.courseName || courseId,
          status: "failed",
          error: String(error.message || error),
        });
      }
    }

    return {
      assignmentId,
      results,
      summary: {
        courses: results.length,
        rosterStudents: results
          .filter((item) => item.status === "ok")
          .reduce((sum, item) => sum + Number(item.rosterStudentCount || 0), 0),
        mismatched: results.filter((item) => item.status === "mismatched").length,
        failed: results.filter((item) => ["failed", "mismatched"].includes(item.status)).length,
      },
    };
  }
);

exports.removeAssignmentClassroomPackage = onCall(
  { secrets: GOOGLE_API_SECRETS },
  async (request) => {
    const teacherUid = await requireTeacher(request);
    const assignmentId = String(request.data?.assignmentId || "").trim();
    if (!assignmentId) {
      throw new HttpsError("invalid-argument", "assignmentId is required.");
    }

    const db = getFirestore();
    const classroom = await classroomLib().getClassroomClient(teacherUid);
    const snap = await db
      .collection("classroomLinks")
      .where("assignmentId", "==", assignmentId)
      .get();

    const publications = snap.docs
      .map((doc) => ({ ref: doc.ref, data: doc.data() }))
      .filter((entry) => !entry.data.teacherUid || entry.data.teacherUid === teacherUid)
      .filter((entry) => entry.data.courseId);

    const results = [];

    for (const { ref, data } of publications) {
      const courseId = String(data.courseId);
      const result = {
        courseId,
        courseName: data.courseName || courseId,
        assignment: "not-published",
        material: "not-published",
      };

      if (data.courseworkId) {
        try {
          await classroomLib().deleteCourseWork(
            classroom,
            courseId,
            String(data.courseworkId)
          );
          result.assignment = "removed";
        } catch (error) {
          if (classroomDeleteAlreadyGone(error)) {
            result.assignment = "already-removed";
          } else {
            result.assignment = "failed";
            result.assignmentError = String(error.message || error);
          }
        }
      }

      const materialKey = `assignment:${assignmentId}:resources`;
      const materialId = classroomMaterialDocumentId(teacherUid, courseId, materialKey);
      const materialRef = db.doc(`classroomMaterialLinks/${materialId}`);
      const materialSnap = await materialRef.get();

      if (
        materialSnap.exists
        && materialSnap.data().teacherUid === teacherUid
        && materialSnap.data().googleMaterialId
      ) {
        try {
          await classroomLib().deleteCourseWorkMaterial(
            classroom,
            courseId,
            String(materialSnap.data().googleMaterialId)
          );
          result.material = "removed";
        } catch (error) {
          if (classroomDeleteAlreadyGone(error)) {
            result.material = "already-removed";
          } else {
            result.material = "failed";
            result.materialError = String(error.message || error);
          }
        }

        await materialRef.set(
          {
            status: result.material === "failed" ? "remove-failed" : "removed",
            googleMaterialId: result.material === "failed"
              ? materialSnap.data().googleMaterialId
              : FieldValue.delete(),
            alternateLink: result.material === "failed"
              ? materialSnap.data().alternateLink || null
              : FieldValue.delete(),
            removedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      const assignmentFailed = result.assignment === "failed";
      const failed = assignmentFailed || result.material === "failed";

      await ref.set(
        {
          status: failed ? "remove-failed" : "removed",
          courseworkId: assignmentFailed ? data.courseworkId : FieldValue.delete(),
          classroomUrl: assignmentFailed ? data.classroomUrl || null : FieldValue.delete(),
          launchUrl: assignmentFailed ? data.launchUrl || null : FieldValue.delete(),
          removedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      results.push(result);
    }

    return {
      assignmentId,
      results,
      summary: {
        destinations: results.length,
        removed: results.filter(
          (item) => item.assignment === "removed" || item.assignment === "already-removed"
        ).length,
        failed: results.filter(
          (item) => item.assignment === "failed" || item.material === "failed"
        ).length,
      },
    };
  }
);

exports.listPublishedAssignments = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const db = getFirestore();
  const snap = await db.collection("classroomLinks").limit(500).get();
  const links = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => !item.teacherUid || item.teacherUid === teacherUid)
    .sort((a, b) => {
      const aDate = toDate(a.publishedAt || a.updatedAt || a.createdAt)?.getTime() || 0;
      const bDate = toDate(b.publishedAt || b.updatedAt || b.createdAt)?.getTime() || 0;
      return bDate - aDate;
    });
  return { links };
});

// --- Student launch link resolution ----------------------------------------

exports.resolveLaunchToken = onRequest(
  { secrets: [LINK_ENCRYPTION_KEY] },
  (req, res) => {
    const appBaseUrl = readStudentAppBaseUrl();
    try {
      const { assignmentId, courseId, publicationId } = decryptLaunchToken(
        req.query.token
      );
      const params = new URLSearchParams({ launch: String(assignmentId) });
      if (courseId) params.set("classroomCourse", String(courseId));
      if (publicationId) params.set("classroomPublication", String(publicationId));
      res.redirect(302, `${appBaseUrl}?${params.toString()}`);
    } catch (err) {
      logger.warn("Rejected invalid launch token", err);
      res.redirect(302, `${appBaseUrl}?launchError=invalid_token`);
    }
  }
);

exports.getAssignmentByLaunchId = onCall(async (request) => {
  const { assignmentId } = request.data || {};
  if (!assignmentId) {
    throw new HttpsError("invalid-argument", "assignmentId is required.");
  }
  const db = getFirestore();
  const snap = await db.doc(`assignments/${assignmentId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Assignment not found.");
  const { title, dueAt, dueDate } = snap.data();
  return {
    assignmentId,
    title,
    dueAt: serializableDate(dueAt || dueDate || null),
  };
});

// --- Grade passback to every published course -------------------------------

async function writeGradeSyncAudit(db, publicationId, studentId, patch) {
  const syncId = gradeSyncDocumentId(publicationId, studentId);
  await db.doc(`classroomGradeSyncs/${syncId}`).set(
    {
      syncId,
      publicationId,
      studentId,
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

exports.listClassroomGradeSyncs = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const db = getFirestore();
  const publicationSnap = await db.collection("classroomLinks").limit(500).get();
  const publicationIds = new Set(
    publicationSnap.docs
      .filter((doc) => !doc.data().teacherUid || doc.data().teacherUid === teacherUid)
      .map((doc) => doc.id)
  );
  if (!publicationIds.size) return { syncs: [] };

  const syncSnap = await db.collection("classroomGradeSyncs").limit(500).get();
  const syncs = syncSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => publicationIds.has(String(item.publicationId)))
    .map((item) => ({
      ...item,
      updatedAt: serializableDate(item.updatedAt),
      syncedAt: serializableDate(item.syncedAt),
    }))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return { syncs };
});

exports.retryClassroomGradeSync = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const { publicationId, studentId, assignmentId } = request.data || {};
  if (!publicationId || !studentId || !assignmentId) {
    throw new HttpsError(
      "invalid-argument",
      "publicationId, studentId and assignmentId are required."
    );
  }

  const db = getFirestore();
  const publication = await db.doc(`classroomLinks/${String(publicationId)}`).get();
  if (!publication.exists) {
    throw new HttpsError("not-found", "Classroom publication not found.");
  }
  if (
    publication.data().teacherUid &&
    publication.data().teacherUid !== teacherUid
  ) {
    throw new HttpsError(
      "permission-denied",
      "That Classroom publication belongs to another teacher."
    );
  }
  if (String(publication.data().assignmentId || "") !== String(assignmentId)) {
    throw new HttpsError(
      "invalid-argument",
      "That Classroom publication does not belong to the requested assignment."
    );
  }

  const gradeRef = db.doc(`grades/${String(studentId)}`);
  const gradeSnap = await gradeRef.get();
  if (!gradeSnap.exists) {
    throw new HttpsError("not-found", "Student grade record not found.");
  }
  await gradeRef.update(
    new FieldPath("classroomReleaseSignals", String(assignmentId)),
    {
      requestedAt: new Date().toISOString(),
      reason: "manual-retry",
    }
  );
  return { queued: true };
});

exports.syncGradeToClassroom = onDocumentWritten(
  {
    document: "grades/{studentId}",
    secrets: GOOGLE_API_SECRETS,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after || !after.exists) return;

    const afterData = after.data() || {};
    const beforeData = event.data?.before?.exists ? event.data.before.data() || {} : {};
    const afterByAssignment = afterData.gradesByAssignment || {};
    const beforeByAssignment = beforeData.gradesByAssignment || {};
    const gradeChangedAssignmentIds = Object.keys(afterByAssignment).filter(
      (assignmentId) =>
        JSON.stringify(afterByAssignment[assignmentId]) !==
        JSON.stringify(beforeByAssignment[assignmentId])
    );
    const afterTeacherOverrides = afterData.teacherGradeOverridesByAssignment || {};
    const beforeTeacherOverrides = beforeData.teacherGradeOverridesByAssignment || {};
    const overrideChangedAssignmentIds = [...new Set([
      ...Object.keys(afterTeacherOverrides),
      ...Object.keys(beforeTeacherOverrides),
    ])].filter(
      (assignmentId) =>
        JSON.stringify(afterTeacherOverrides[assignmentId] || {}) !==
        JSON.stringify(beforeTeacherOverrides[assignmentId] || {})
    );
    // A Test Cycle's recorded grade is not a tracker; it is the canonical
    // record's projection, written by the secure release path. It has to wake
    // this trigger on its own or a released Test would never reach Classroom.
    const afterTestCycle = afterData.testCycleGrades || {};
    const beforeTestCycle = beforeData.testCycleGrades || {};
    const testCycleChangedAssignmentIds = Object.keys(afterTestCycle).filter(
      (assignmentId) =>
        JSON.stringify(afterTestCycle[assignmentId]) !==
        JSON.stringify(beforeTestCycle[assignmentId])
    );
    const afterReleaseSignals = afterData.classroomReleaseSignals || {};
    const beforeReleaseSignals = beforeData.classroomReleaseSignals || {};
    const releaseSignaledAssignmentIds = Object.keys(afterReleaseSignals).filter(
      (assignmentId) =>
        JSON.stringify(afterReleaseSignals[assignmentId]) !==
        JSON.stringify(beforeReleaseSignals[assignmentId])
    );
    const releaseSignalSet = new Set(releaseSignaledAssignmentIds);
    const changedAssignmentIds = [...new Set([
      ...gradeChangedAssignmentIds,
      ...overrideChangedAssignmentIds,
      ...testCycleChangedAssignmentIds,
      ...releaseSignaledAssignmentIds,
    ])];
    if (changedAssignmentIds.length === 0) return;

    const db = getFirestore();
    const classroomByTeacher = new Map();

    for (const assignmentId of changedAssignmentIds) {
      // eslint-disable-next-line no-await-in-loop
      const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
      if (!assignmentSnap.exists) continue;
      const assignment = assignmentSnap.data() || {};
      if (assignmentFeedbackIsHeld(assignment)) continue;

      /*
       * A TEST CYCLE IS ONE CLASSROOM GRADE ITEM.
       *
       * The tracker path below would compute a grade from the Review and
       * Corrections work, which is instruction and carries no assessment
       * points — and it would do it on an assignment whose real grade lives in
       * the canonical Test Cycle record. So a Test Cycle takes the recorded
       * grade from that record instead, and takes nothing from the tracker.
       *
       * A retest UPDATES this same item. There is no second publication and no
       * second grade column: `recordedGrade` is one number that moves up.
       */
      const testCycleProjection = afterData.testCycleGrades?.[assignmentId] || null;
      const isTestCycleAssignment = String(assignment?.assessmentPolicy?.mode || "") === "testCycle";
      const authoritativeOverrides = afterTeacherOverrides[assignmentId] || {};
      const assignmentGradeOverride = activeAssignmentGradeOverride(authoritativeOverrides);
      if (isTestCycleAssignment && !testCycleProjection && !assignmentGradeOverride) continue;
      if (isTestCycleAssignment && testCycleProjection?.recordedGrade == null && !assignmentGradeOverride) continue;

      let questionIndices = runtimeIncludedQuestionIndices(assignment);
      /*
       * A REDEEMED PRACTICE PASS REMOVES PRACTICE FROM THIS SAME DENOMINATOR.
       *
       * Google Classroom must receive the legitimate MathMaster grade with
       * Practice excluded, never a fabricated 100 for it and never the
       * assignment marked complete on Practice's account. The redemption
       * document (functions/shared/classPointRewards.mjs) is the
       * authoritative waiver: its deterministic id is checked directly, the
       * same way the redemption callable itself checks it for idempotency.
       */
      if (!isTestCycleAssignment) {
        const practiceIndices = runtimeIncludedQuestionIndicesForSection(assignment, "practice");
        if (practiceIndices.length) {
          const rewards = await classPointRewards();
          const redemptionClassId = authoritativeStudentClassId(afterData);
          if (redemptionClassId) {
            const redemptionId = rewards.practicePassRedemptionId({
              studentId: event.params.studentId,
              classId: redemptionClassId,
              assignmentId,
              rewardCode: rewards.PRACTICE_PASS_REWARD_CODE,
            });
            // eslint-disable-next-line no-await-in-loop
            const redemptionSnap = await db
              .collection(CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION)
              .doc(redemptionId)
              .get();
            if (redemptionSnap.exists) {
              questionIndices = rewards.excludeWaivedIndices(
                questionIndices,
                rewards.waivedPracticeIndices({ hasRedemption: true, practiceIndices }),
              );
            }
          }
        }
      }
      if (!isTestCycleAssignment && !questionIndices.length) continue;

      const assignmentTracker = afterByAssignment[assignmentId] || {};
      const questions = runtimeQuestionsFromAssignment(assignment);
      const releaseSignal = releaseSignalSet.has(assignmentId)
        ? afterReleaseSignals[assignmentId]
        : null;
      let progress = isTestCycleAssignment
        ? {
          total: 1,
          attempted: testCycleProjection?.recordedGrade == null ? 0 : 1,
          terminal: testCycleProjection?.recordedGrade == null ? 0 : 1,
          grade: Number(testCycleProjection?.recordedGrade ?? 0),
          creditOnAttempted: null,
          // A recorded Test Cycle grade only exists after a teacher released
          // a secure result, so it is finished evidence by construction.
          complete: testCycleProjection?.recordedGrade != null,
          meaningfulProgress: testCycleProjection?.recordedGrade != null,
          minimumProgressQuestions: 1,
        }
        : assignmentGradeProgress(
          assignmentTracker,
          questionIndices,
          questions,
          authoritativeOverrides,
        );
      if (assignmentGradeOverride) {
        progress = {
          ...progress,
          total: Math.max(1, Number(progress.total) || 0),
          attempted: Math.max(1, Number(progress.attempted) || 0),
          terminal: Math.max(1, Number(progress.terminal) || 0),
          grade: assignmentGradeOverride.score,
          complete: true,
          meaningfulProgress: true,
          minimumProgressQuestions: 1,
        };
      }
      const stage = isTestCycleAssignment
        ? (testCycleProjection?.recordedGradeSource === "retest" ? "testcycle-retest" : "testcycle-test")
        : resolveClassroomGradeStage({
          assignment,
          progress,
          releaseSignal,
          nowValue: Date.now(),
          studentId: event.params.studentId,
        });
      if (!stage) continue;

      const grade = progress.grade;
      const isFinal = ["final-complete", "final-deadline"].includes(stage);
      // A final-looking partial grade is more dangerous than a delayed grade.
      // Ordinary assignments consult known queue/checkpoint/session evidence;
      // Secure Test Cycle retains its separate release authority unchanged.
      const persistenceState = (!isTestCycleAssignment && isFinal)
        // eslint-disable-next-line no-await-in-loop
        ? await readPersistencePending({
          db,
          studentId: event.params.studentId,
          assignmentId,
          canonicalAttempted: progress.attempted,
          secureTestCycle: false,
          // The workspace-draft signal is assessed against the real assignment
          // and the real canonical tracker, exactly as the recovery report
          // assesses it, so the two can never disagree about what is still
          // recoverable.
          assignment: { id: assignmentId, ...assignment },
          gradeData: afterData,
        })
        : { persistencePending: false, reasons: [], resolvedReasons: [] };
      const releasePolicy = classroomGradeReleasePolicy({
        stage,
        assignment,
        nowValue: Date.now(),
      });
      const forceRetry = releaseSignalReason(releaseSignal) === "manual-retry";

      // eslint-disable-next-line no-await-in-loop
      const publicationsSnap = await db
        .collection("classroomLinks")
        .where("assignmentId", "==", assignmentId)
        .get();
      const publications = publicationsSnap.docs.filter(
        (doc) => doc.data().status === "published" && doc.data().courseworkId
      );
      if (publications.length === 0) continue;

      if (persistenceState.persistencePending) {
        for (const publicationDoc of publications) {
          const publication = publicationDoc.data() || {};
          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId: String(publication.courseId || ""),
            courseworkId: publication.courseworkId || null,
            status: "sync-pending",
            stage: "sync-pending",
            grade,
            attempted: progress.attempted,
            total: progress.total,
            creditOnAttempted: progress.creditOnAttempted,
            isFinal: false,
            persistencePending: true,
            persistencePendingReasons: persistenceState.reasons,
            // A reason a teacher of record has already acknowledged is carried
            // in the audit alongside the ones still blocking, so the record
            // says what was resolved as well as what is outstanding.
            persistenceResolvedReasons: persistenceState.resolvedReasons || [],
            studentVisible: false,
            returnedToStudent: false,
            message: "Known persistence evidence is still unresolved; final Classroom passback is withheld.",
          });
        }
        continue;
      }

      const successfulCourses = [];

      for (const publicationDoc of publications) {
        const publication = publicationDoc.data() || {};
        if (publication.gradePassbackEnabled === false) continue;
        // Belt and braces on the single-item rule. Split section publications
        // already set gradePassbackEnabled:false; a Test Cycle additionally
        // refuses any publication that is not the whole-assignment item, so a
        // Retest can never land in a second Classroom column.
        if (isTestCycleAssignment && String(publication.sectionKey || "whole") !== "whole") continue;
        const courseId = String(publication.courseId || "");
        if (!courseId) continue;
        const maxPoints = Number.isFinite(Number(publication.maxPoints))
          ? Math.max(1, Number(publication.maxPoints))
          : 100;
        const classroomGrade = Math.round((grade / 100) * maxPoints * 100) / 100;

        // Do not send the same grade/stage repeatedly just because a student
        // spent more time on the same saved answer. A same-stage numeric grade
        // change is NOT a duplicate: this happens when a teacher reopens a
        // Warm-Up or otherwise gives additional credit after an earlier
        // checkpoint was already posted. Manual retry deliberately bypasses
        // this so a teacher can repair an external Classroom issue.
        const syncId = gradeSyncDocumentId(publicationDoc.id, event.params.studentId);
        // eslint-disable-next-line no-await-in-loop
        const priorAuditSnap = await db.doc(`classroomGradeSyncs/${syncId}`).get();
        const priorAudit = priorAuditSnap.exists ? priorAuditSnap.data() || {} : {};
        const priorReturnConfirmed = priorAudit.returnedToStudent === true
          || String(priorAudit.submissionState || "").toUpperCase() === "RETURNED";
        if (
          !forceRetry
          && priorAudit.status === "synced"
          && String(priorAudit.stage || "") === stage
          && Number(priorAudit.maxPoints || 100) === maxPoints
          && Boolean(priorAudit.studentVisible) === releasePolicy.studentVisible
          // Stage identity alone cannot answer "has anything changed?".
          // Ordinary assignments can improve inside the same checkpoint stage
          // after a teacher reopens/extends a timed section, so compare the
          // actual MathMaster percentage for every assignment type.
          && Number(priorAudit.grade) === Number(grade)
          && (!releasePolicy.shouldReturn || priorReturnConfirmed)
        ) {
          continue;
        }

        /*
         * NEVER LOWER A GRADE THAT IS ALREADY IN CLASSROOM.
         *
         * The canonical rule — max(originalTest, min(retest, cap)) — already
         * makes the recorded grade monotonic, so this should never fire. That
         * is the reason it is here: if the rule ever regresses, the thing that
         * pays for it is a real student's posted grade, and a refusal that
         * writes an audit row is recoverable where an overwrite is not.
         */
        if (isTestCycleAssignment && priorAudit.status === "synced" && !assignmentGradeOverride) {
          // eslint-disable-next-line no-await-in-loop
          const passback = (await testCycleLib.shared()).grade.testCycleClassroomPassback({
            recordedGrade: grade,
            previouslyPostedGrade: priorAudit.grade,
          });
          if (passback.refusedLowering) {
            // eslint-disable-next-line no-await-in-loop
            await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
              assignmentId,
              courseId,
              courseworkId: publication.courseworkId,
              status: "skipped-would-lower",
              stage,
              grade: Number(priorAudit.grade),
              classroomGrade: Number(priorAudit.classroomGrade ?? priorAudit.grade),
              maxPoints,
              attempted: progress.attempted,
              total: progress.total,
              creditOnAttempted: progress.creditOnAttempted,
              isFinal,
              studentVisible: releasePolicy.studentVisible,
              returnedToStudent: priorReturnConfirmed,
              message: passback.reason,
            });
            continue;
          }
        }

        const publicationTeacherUid = publication.teacherUid || null;
        const classroomKey = publicationTeacherUid || "__legacy__";
        let classroom = classroomByTeacher.get(classroomKey);
        if (!classroom) {
          try {
            // eslint-disable-next-line no-await-in-loop
            classroom = await classroomLib().getClassroomClient(publicationTeacherUid);
            classroomByTeacher.set(classroomKey, classroom);
          } catch (err) {
            // eslint-disable-next-line no-await-in-loop
            await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
              assignmentId,
              courseId,
              courseworkId: publication.courseworkId,
              status: "auth-error",
              stage,
              grade,
              classroomGrade,
              maxPoints,
              attempted: progress.attempted,
              total: progress.total,
              creditOnAttempted: progress.creditOnAttempted,
              isFinal,
              studentVisible: releasePolicy.studentVisible,
              returnedToStudent: false,
              message: String(err.message || err),
            });
            continue;
          }
        }

        const rosterLinkId = rosterLinkDocumentId(
          courseId,
          event.params.studentId
        );
        // eslint-disable-next-line no-await-in-loop
        const rosterLinkSnap = await db
          .doc(`classroomRosterLinks/${rosterLinkId}`)
          .get();
        const isLegacyPublication =
          publication.schemaVersion == null ||
          Number(publication.schemaVersion) < 2 ||
          publicationDoc.id === assignmentId;
        const googleUserId = rosterLinkSnap.exists
          ? rosterLinkSnap.data().googleUserId
          : isLegacyPublication
            ? afterData.googleUserId
            : null;

        if (!googleUserId) {
          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
            status: "skipped-unlinked",
            stage,
            grade,
            classroomGrade,
            maxPoints,
            attempted: progress.attempted,
            total: progress.total,
            creditOnAttempted: progress.creditOnAttempted,
            isFinal,
            message: "Student is not linked to this Classroom course.",
          });
          continue;
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          const submission = await classroomLib().findSubmissionForStudent(classroom, {
            courseId,
            courseWorkId: publication.courseworkId,
            googleUserId,
          });
          if (!submission) {
            // eslint-disable-next-line no-await-in-loop
            await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
              assignmentId,
              courseId,
              courseworkId: publication.courseworkId,
              status: "submission-not-found",
              stage,
              grade,
              classroomGrade,
              maxPoints,
              attempted: progress.attempted,
              total: progress.total,
              creditOnAttempted: progress.creditOnAttempted,
              isFinal,
              studentVisible: releasePolicy.studentVisible,
              returnedToStudent: false,
            });
            continue;
          }

          // eslint-disable-next-line no-await-in-loop
          const patched = await classroomLib().patchGrade(classroom, {
            courseId,
            courseWorkId: publication.courseworkId,
            submissionId: submission.id,
            grade: classroomGrade,
            assignToStudent: releasePolicy.assignToStudent,
          });

          let submissionState = patched.state || submission.state || null;
          let returnedToStudent = String(submissionState || "").toUpperCase() === "RETURNED";
          if (releasePolicy.shouldReturn && !returnedToStudent) {
            // Patching assignedGrade alone can still leave Classroom showing a
            // teacher-only Draft. Returning the submission is the explicit
            // Google action that releases the assigned grade to the student.
            // eslint-disable-next-line no-await-in-loop
            await classroomLib().returnSubmission(classroom, {
              courseId,
              courseWorkId: publication.courseworkId,
              submissionId: submission.id,
            });
            submissionState = "RETURNED";
            returnedToStudent = true;
          }

          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
            submissionId: submission.id,
            submissionState,
            status: "synced",
            stage,
            grade,
            classroomGrade,
            maxPoints,
            attempted: progress.attempted,
            total: progress.total,
            creditOnAttempted: progress.creditOnAttempted,
            isFinal,
            studentVisible: releasePolicy.studentVisible,
            returnedToStudent,
            syncedAt: FieldValue.serverTimestamp(),
          });
          successfulCourses.push(publication.courseName || courseId);
          logger.info(
            `Synced ${stage} grade ${grade} for student ${event.params.studentId} to course ${courseId}, courseWork ${publication.courseworkId}`
          );
        } catch (err) {
          logger.error(
            `Grade passback failed for student ${event.params.studentId}, assignment ${assignmentId}, course ${courseId}`,
            err
          );
          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
            status: "failed",
            stage,
            grade,
            classroomGrade,
            maxPoints,
            attempted: progress.attempted,
            total: progress.total,
            creditOnAttempted: progress.creditOnAttempted,
            isFinal,
            studentVisible: releasePolicy.studentVisible,
            returnedToStudent: false,
            error: String(err.message || err),
          });
        }
      }

      if (successfulCourses.length) {
        const syncedAt = new Date().toISOString();
        const status = {
          assignmentId,
          grade,
          stage,
          attempted: progress.attempted,
          total: progress.total,
          creditOnAttempted: progress.creditOnAttempted,
          isFinal,
          studentVisible: releasePolicy.studentVisible,
          returnedToStudent: releasePolicy.shouldReturn,
          courseNames: [...new Set(successfulCourses)].slice(0, 5),
          syncedAt,
          notificationId: `${assignmentId}:${stage}:${grade}:${syncedAt}`,
        };
        // This small student-visible record is the receipt. Updating it causes
        // this trigger to run once more, but no grade/release field changed, so
        // that second invocation exits immediately.
        // eslint-disable-next-line no-await-in-loop
        await after.ref.update(
          new FieldPath("classroomSyncStatusByAssignment", assignmentId),
          status
        );
      }
    }
  }
);

// Quiz/Test grade writes happen as students work, but the central activity
// policy keeps correctness and grades private until the teacher releases them.
// When release flips on, signal the existing grade trigger for every student
// who has this assignment so Classroom passback happens exactly then.
exports.queueReleasedAssessmentGrades = onDocumentWritten(
  { document: "assignments/{assignmentId}" },
  async (event) => {
    const after = event.data?.after;
    if (!after || !after.exists) return;
    const assignment = after.data() || {};
    const before = event.data?.before?.exists ? event.data.before.data() : {};
    if (!assignmentUsesTeacherReleasePolicy(assignment)) return;
    if (!assignmentFeedbackWasReleased(assignment) || assignmentFeedbackWasReleased(before)) return;

    const assignmentId = event.params.assignmentId;
    const db = getFirestore();
    const gradesSnap = await db.collection("grades").get();
    const targets = gradesSnap.docs.filter((gradeDoc) => (
      gradeDoc.data()?.gradesByAssignment?.[assignmentId] != null
    ));

    for (let offset = 0; offset < targets.length; offset += 400) {
      const batch = db.batch();
      targets.slice(offset, offset + 400).forEach((gradeDoc) => {
        batch.update(
          gradeDoc.ref,
          new FieldPath("classroomReleaseSignals", assignmentId),
          {
            requestedAt: new Date().toISOString(),
            reason: "assessment-release",
          }
        );
      });
      await batch.commit();
    }
    logger.info(`Queued released assessment grade passback for ${targets.length} student record(s) on assignment ${assignmentId}.`);
  }
);

const CLASSROOM_GRADE_CHECKPOINT_COLLECTION = "classroomGradeCheckpointState";
const CLASSROOM_GRADE_CHECKPOINT_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

async function queueClassroomGradeSignalForAudience({
  db,
  assignmentId,
  assignment,
  reason,
  requestedAt,
}) {
  const classIds = assignmentAudience(assignment).classIds;
  if (!classIds.length) return 0;

  const gradeDocsByPath = new Map();
  for (const classId of classIds) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection("grades").where("classId", "==", classId).get();
    snapshot.docs.forEach((gradeDoc) => gradeDocsByPath.set(gradeDoc.ref.path, gradeDoc));
  }

  const gradeDocs = [...gradeDocsByPath.values()];
  for (let start = 0; start < gradeDocs.length; start += 400) {
    const batch = db.batch();
    gradeDocs.slice(start, start + 400).forEach((gradeDoc) => {
      batch.update(
        gradeDoc.ref,
        new FieldPath("classroomReleaseSignals", assignmentId),
        { requestedAt, reason }
      );
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return gradeDocs.length;
}

// Classroom itself marks an unsubmitted item Missing at the due time and may
// insert its own draft 0. MathMaster therefore writes an authoritative grade
// checkpoint at the regular due time and again at the final late cutoff. This
// scheduler does not grade anything: it only wakes the existing grade trigger,
// which still checks assignment policy, roster links, and Classroom identity.
exports.queueClassroomGradeCheckpoints = onSchedule({
  schedule: "every 5 minutes",
  invoker: "private",
}, async () => {
  const db = getFirestore();
  const now = Date.now();
  const requestedAt = new Date(now).toISOString();
  const cutoff = now - CLASSROOM_GRADE_CHECKPOINT_LOOKBACK_MS;
  // Version 2 deliberately requeues recent published assignments after the
  // algebra step-credit correction. The server derives credit from stored
  // stepGrades, so already-closed student work can receive the fairer score
  // without asking the student to reopen or change an answer.
  const RECONCILE_VERSION = 2;

  const publicationsSnap = await db
    .collection("classroomLinks")
    .where("status", "==", "published")
    .limit(1000)
    .get();

  const classroomAssignmentIds = [...new Set(
    publicationsSnap.docs
      .map((doc) => doc.data() || {})
      .filter((publication) => (
        publication.courseworkId
        && publication.gradePassbackEnabled !== false
      ))
      .map((publication) => String(publication.assignmentId || "").trim())
      .filter(Boolean)
  )];

  // Read only assignments that actually have a current Classroom publication.
  // This avoids an arbitrary 500-assignment collection cap silently skipping a
  // live course when the library grows.
  const assignmentSnapshots = classroomAssignmentIds.length
    ? await db.getAll(...classroomAssignmentIds.map((assignmentId) => db.doc(`assignments/${assignmentId}`)))
    : [];

  let dueAssignments = 0;
  let finalAssignments = 0;
  let reconcileAssignments = 0;
  let queuedStudents = 0;

  for (const assignmentDoc of assignmentSnapshots) {
    if (!assignmentDoc.exists) continue;
    const assignmentId = assignmentDoc.id;
    const assignment = assignmentDoc.data() || {};
    if (!assignmentAudience(assignment).classIds.length) continue;
    const dueAt = toDate(assignment.dueAt || assignment.dueDate);
    const lateDueAt = toDate(
      assignment.lateDueAt || assignment.lateDueDate || assignment.dueAt || assignment.dueDate
    );
    if (!dueAt && !lateDueAt) continue;

    const stateRef = db.collection(CLASSROOM_GRADE_CHECKPOINT_COLLECTION).doc(assignmentId);
    // eslint-disable-next-line no-await-in-loop
    const stateSnap = await stateRef.get();
    const state = stateSnap.exists ? stateSnap.data() || {} : {};

    // Final cutoff has precedence. On first deploy, do not emit both an old due
    // checkpoint and a final checkpoint for the same assignment.
    if (
      lateDueAt
      && lateDueAt.getTime() <= now
      && lateDueAt.getTime() >= cutoff
      && (!state.finalQueuedAt || state.finalDueAt !== lateDueAt.toISOString())
    ) {
      // eslint-disable-next-line no-await-in-loop
      const count = await queueClassroomGradeSignalForAudience({
        db,
        assignmentId,
        assignment,
        reason: "final-deadline",
        requestedAt,
      });
      // eslint-disable-next-line no-await-in-loop
      await stateRef.set({
        assignmentId,
        reconcileVersion: RECONCILE_VERSION,
        finalQueuedAt: requestedAt,
        finalDueAt: lateDueAt.toISOString(),
        finalQueuedStudents: count,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      finalAssignments += 1;
      queuedStudents += count;
      continue;
    }

    if (
      dueAt
      && dueAt.getTime() <= now
      && dueAt.getTime() >= cutoff
      && (!state.dueQueuedAt || state.dueAt !== dueAt.toISOString())
    ) {
      // eslint-disable-next-line no-await-in-loop
      const count = await queueClassroomGradeSignalForAudience({
        db,
        assignmentId,
        assignment,
        reason: "due-checkpoint",
        requestedAt,
      });
      // eslint-disable-next-line no-await-in-loop
      await stateRef.set({
        assignmentId,
        reconcileVersion: RECONCILE_VERSION,
        dueQueuedAt: requestedAt,
        dueAt: dueAt.toISOString(),
        dueQueuedStudents: count,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      dueAssignments += 1;
      queuedStudents += count;
      continue;
    }

    // First rollout reconciliation: wake each still-relevant published
    // assignment exactly once. Students with no meaningful work before the due
    // date are ignored by the grade-stage resolver, while students who already
    // worked/completed receive the accurate MathMaster checkpoint immediately
    // instead of waiting for another answer to change.
    const stillRelevant = !lateDueAt || lateDueAt.getTime() >= cutoff;
    if (stillRelevant && Number(state.reconcileVersion || 0) < RECONCILE_VERSION) {
      // eslint-disable-next-line no-await-in-loop
      const count = await queueClassroomGradeSignalForAudience({
        db,
        assignmentId,
        assignment,
        reason: "initial-reconcile",
        requestedAt,
      });
      // eslint-disable-next-line no-await-in-loop
      await stateRef.set({
        assignmentId,
        reconcileVersion: RECONCILE_VERSION,
        reconciledAt: requestedAt,
        reconciledStudents: count,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      reconcileAssignments += 1;
      queuedStudents += count;
    }
  }

  if (dueAssignments || finalAssignments || reconcileAssignments) {
    logger.info("Queued Classroom grade checkpoints", {
      dueAssignments,
      finalAssignments,
      reconcileAssignments,
      queuedStudents,
    });
  }
});

// ---------------------------------------------------------------------------
// --- Live Challenge ----------------------------------------------------------
//
// Live Challenge is a competitive presentation layer over the secure Path
// bank, not a second question/answer system. The browser receives the same
// sanitized question payload My Math Path uses and every verdict comes from the
// same server grader. A student cannot submit a client-computed score, cannot
// read the private round list, and cannot write the room document directly.

let liveChallengeModule = null;
async function liveChallengeRules() {
  if (!liveChallengeModule) liveChallengeModule = await import("./shared/liveChallenge.mjs");
  return liveChallengeModule;
}
let solverRaceModule = null;
async function solverRaceRules() {
  if (!solverRaceModule) solverRaceModule = await import("./shared/solverRace.mjs");
  return solverRaceModule;
}

let liveChallengeReportModule = null;
async function liveChallengeReportRules() {
  if (!liveChallengeReportModule) liveChallengeReportModule = await import("./shared/liveChallengeReport.mjs");
  return liveChallengeReportModule;
}

let warmupChallengeModule = null;
async function warmupChallengeRules() {
  if (!warmupChallengeModule) warmupChallengeModule = await import("./shared/warmupChallenge.mjs");
  return warmupChallengeModule;
}

let liveChallengeEvidenceModule = null;
async function liveChallengeEvidenceRules() {
  if (!liveChallengeEvidenceModule) liveChallengeEvidenceModule = await import("./shared/liveChallengeEvidence.mjs");
  return liveChallengeEvidenceModule;
}

// How many questions are pulled before the issuability gate runs. Every one of
// these is instantiated and planned, so the page size is a cost, not a free
// upper bound — the fix for narrow variety was where the window starts, not
// making it bigger.
const MIXED_CANDIDATE_PAGE = 300;
const STANDARD_CANDIDATE_PAGE = 100;

const LIVE_CHALLENGE_DRY_RUNS = "liveChallengeDryRuns";
const LIVE_CHALLENGE_ROOMS = "liveChallengeRooms";
const LIVE_CHALLENGE_REPORTS = "liveChallengeReports";
const LIVE_CHALLENGE_PRIVATE = "liveChallengePrivate";
const LIVE_CHALLENGE_INVITES = "liveChallengeInvites";
const LIVE_CHALLENGE_TEACHER_ACTIVE = "liveChallengeTeacherActive";

function challengeCourseId(value) {
  const token = String(value || "").trim().toLowerCase();
  if (token === "algebra2") return "algebra2";
  return "algebra1";
}

function shuffleChallengeItems(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

async function loadChallengeRoster(db, teacherEmail, { classId = null, classPeriod = null } = {}) {
  const snapshot = await db.collection("grades").where("assignedTeacherEmail", "==", teacherEmail).get();
  return snapshot.docs
    .filter((studentDoc) => {
      const data = studentDoc.data() || {};
      if (classId) return String(data.classId || "") === String(classId);
      return Boolean(classPeriod) && !data.classId && String(data.classPeriod || "") === String(classPeriod);
    })
    .map((studentDoc) => ({ studentId: studentDoc.id, ...studentDoc.data() }));
}

const questionStyleLabel = (style) => (
  style === "tools" ? " that use an interactive tool"
    : style === "noTools" ? " without an interactive tool"
      : ""
);

async function loadChallengeCandidates(db, { courseId, standardCode, questionStyle = "any" }) {
  const challenge = await liveChallengeRules();
  const normalized = challenge.canonicalChallengeStandard(standardCode);
  const style = challenge.canonicalQuestionStyle(questionStyle);
  // A RANDOM WINDOW, NOT THE FIRST PAGE. Without ordering, Firestore returns
  // document-ID order, so a mixed Algebra I game saw the same first 300 of 837
  // questions every time and the rest of the bank was unreachable. See
  // lib/challengeSampling.js.
  const bank = db.collection("pathQuestionBank");
  const baseQuery = normalized === "mixed"
    ? bank.where("courseId", "==", courseId)
    : bank.where("alignmentKeys", "array-contains", mathPath.canonicalAlignmentKey(normalized));
  const pageSize = normalized === "mixed" ? MIXED_CANDIDATE_PAGE : STANDARD_CANDIDATE_PAGE;
  const sampledDocs = await challengeSampling.sampleBankWindow({ baseQuery, pageSize });

  const candidates = sampledDocs
    .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))
    .filter((question) => question.active !== false)
    .filter((question) => normalized !== "mixed" || String(question.courseId || courseId) === courseId)
    // TWO SEPARATE GATES, ON PURPOSE.
    //
    // Eligibility is "a live round can draw and grade this response at all" —
    // a choose-one prompt with no options is gradeable by the Path server and
    // unanswerable under a countdown, so Live Challenge fails closed on it.
    // Style is "the teacher asked for tool questions". Folding the two into one
    // predicate made matchesQuestionStyle(q, "any") able to return false, and
    // told a teacher who picked Any that their style had emptied the game.
    .filter((question) => challenge.liveChallengeEligible(question))
    .filter((question) => challenge.matchesQuestionStyle(question, style));

  const planned = await Promise.all(candidates.map(async (question) => ({
    question,
    plan: await safeBuildTemplateIssuePlan(question, { operation: "path-runtime-framework-check" }),
  })));
  return planned.filter((entry) => entry.plan.issuable);
}

async function securelyPlanSolverRace(questions) {
  const planned = await Promise.all(questions.map(async (question, roundIndex) => ({
    question,
    roundIndex,
    plan: await mathPath.buildIssuePlan(question),
  })));
  const failed = planned.find((entry) => !entry.plan.issuable);
  if (failed) {
    const family = String(failed.question.challengeFamily || 'unknown family');
    const stage = String(failed.question.difficultyBand || failed.question.solverRaceStage || 'unknown stage');
    throw new HttpsError(
      "failed-precondition",
      `Solver Race round ${failed.roundIndex + 1} cannot be securely issued: ${family} · ${stage} (${failed.plan.reason || "secure grader unavailable"}).`,
    );
  }
  return planned;
}

function selectChallengeQuestions(entries, requestedCount) {
  // Prefer one question from each family before a second question from the same
  // family. This keeps a ten-round mixed game from feeling like ten cosmetic
  // copies of one problem even when the bank is uneven.
  const shuffled = shuffleChallengeItems(entries);
  const firstByFamily = [];
  const repeats = [];
  const seen = new Set();
  shuffled.forEach((entry) => {
    const family = String(entry.question.familyId || entry.question.id);
    if (seen.has(family)) repeats.push(entry);
    else {
      seen.add(family);
      firstByFamily.push(entry);
    }
  });
  return [...firstByFamily, ...repeats].slice(0, requestedCount);
}

async function buildLiveChallengePublicQuestion(db, { roomId, roundIndex, questionId, authoredQuestion = null }) {
  const snapshot = authoredQuestion ? null : await db.collection("pathQuestionBank").doc(questionId).get();
  if (!authoredQuestion && !snapshot.exists) throw new HttpsError("failed-precondition", "A Live Challenge question is no longer in the secure bank.");
  const authored = authoredQuestion || snapshot.data() || {};
  // A bank record may be a generator template. Live Challenge must instantiate
  // it on the server exactly as My Math Path does; grading reconstructs the
  // same draw from this deterministic seed, so the browser never chooses the
  // numbers or receives the answer-bearing generator parameters.
  const seedKey = `challenge|${roomId}|${roundIndex}|${questionId}`;
  const instantiated = await mathPath.instantiateQuestion(authored, seedKey);
  if (!instantiated.question) throw new HttpsError("failed-precondition", "A Live Challenge question could not be generated.");
  const issued = { ...instantiated.question, activityRole: "practice" };
  const plan = await mathPath.buildIssuePlan(issued);
  if (!plan.issuable) throw new HttpsError("failed-precondition", "A Live Challenge question can no longer be securely graded.");
  const displayStandard = (Array.isArray(issued.alignmentKeys) ? issued.alignmentKeys[0] : "")
    ? mathPath.displayAlignmentKey(issued.alignmentKeys[0])
    : null;
  return {
    ...mathPath.buildSanitizedQuestion(
      issued,
      {
        questionInstanceId: `challenge_${roomId}_r${roundIndex + 1}`,
        attemptsAllowed: 1,
        attemptsUsed: 0,
        toolPayload: plan.toolPayload,
      },
    ),
    teksCode: displayStandard,
    challengeRound: roundIndex,
  };
}

async function updateLiveChallengeInvites(db, playerIds, fields) {
  if (!playerIds.length) return;
  for (let start = 0; start < playerIds.length; start += 450) {
    const batch = db.batch();
    playerIds.slice(start, start + 450).forEach((studentId) => {
      batch.set(db.collection(LIVE_CHALLENGE_INVITES).doc(studentId), fields, { merge: true });
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

async function updateLiveChallengeInvitesByRoom(db, { roomId, teacherEmail, fields }) {
  const snapshot = await db.collection(LIVE_CHALLENGE_INVITES).where("roomId", "==", roomId).get();
  const ownedInvites = snapshot.docs.filter((invite) => invite.data()?.teacherEmail === teacherEmail);
  for (let start = 0; start < ownedInvites.length; start += 450) {
    const batch = db.batch();
    ownedInvites.slice(start, start + 450).forEach((invite) => batch.set(invite.ref, fields, { merge: true }));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

const liveChallengePrivateStateIsRecoverable = (privateSnapshot, { roomId, teacherEmail }) => {
  if (!privateSnapshot.exists) return false;
  const privateState = privateSnapshot.data() || {};
  return privateState.roomId === roomId
    && privateState.teacherEmail === teacherEmail
    && Array.isArray(privateState.questionIds)
    && privateState.questionIds.length > 0;
};

async function recoverTeacherActiveChallenge(db, { teacherEmail, challenge }) {
  const activePointerRef = db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(teacherEmail);
  const recovery = await db.runTransaction(async (transaction) => {
    const activePointer = await transaction.get(activePointerRef);
    const roomId = String(activePointer.data()?.roomId || "").trim();
    if (!activePointer.exists || !roomId) {
      if (activePointer.exists) transaction.delete(activePointerRef);
      return { action: "clear" };
    }

    const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
    const activeRoom = await transaction.get(roomRef);
    if (!activeRoom.exists) {
      transaction.delete(activePointerRef);
      return { action: "clear", roomId };
    }

    const room = activeRoom.data() || {};
    const isActive = [challenge.LIVE_CHALLENGE_STATUS.LOBBY, challenge.LIVE_CHALLENGE_STATUS.RUNNING].includes(room.status);
    if (!isActive || room.teacherEmail !== teacherEmail) {
      // A bad pointer must not grant authority over another teacher's room.
      transaction.delete(activePointerRef);
      return { action: "clear", roomId };
    }

    const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
    const privateSnapshot = await transaction.get(privateRef);
    if (liveChallengePrivateStateIsRecoverable(privateSnapshot, { roomId, teacherEmail })) {
      return { action: "resume", roomId };
    }

    // The transaction observes the room, pointer and private document together.
    // If any is repaired or replaced concurrently Firestore retries instead of
    // allowing stale cleanup to cancel the repaired/current session.
    transaction.set(roomRef, {
      status: challenge.LIVE_CHALLENGE_STATUS.CANCELLED,
      phase: "finished",
      staleSession: true,
      currentQuestion: null,
      startsAt: null,
      endsAt: null,
      roundStartedAt: null,
      roundEndsAt: null,
      roundToken: null,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.delete(activePointerRef);
    return { action: "retire", roomId };
  });

  if (recovery.action === "retire") {
    await updateLiveChallengeInvitesByRoom(db, {
      roomId: recovery.roomId,
      teacherEmail,
      fields: { status: challenge.LIVE_CHALLENGE_STATUS.CANCELLED, staleSession: true, updatedAt: FieldValue.serverTimestamp() },
    }).catch((error) => logger.error("liveChallenge.staleInvites.failed", { roomId: recovery.roomId, message: error?.message }));
  }
  return recovery;
}

async function requireOwnedChallenge(db, request, roomId) {
  await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) throw new HttpsError("permission-denied", "A verified teacher email is required for Live Challenge.");
  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const roomSnapshot = await roomRef.get();
  if (!roomSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge no longer exists.");
  const room = roomSnapshot.data() || {};
  if (room.teacherEmail !== teacherEmail && !authLib.isRootAdminEmail(teacherEmail)) {
    throw new HttpsError("permission-denied", "Only the teacher who launched this challenge can control it.");
  }
  return { teacherEmail, roomRef, room };
}

exports.createLiveChallenge = onCall({ memory: "512MiB" }, async (request) => {
  await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) throw new HttpsError("permission-denied", "A verified teacher email is required for Live Challenge.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();

  const requestedClassId = String(request.data?.classId || "").trim().slice(0, 160);
  let classId = requestedClassId || null;
  let classPeriod = String(request.data?.classPeriod || "").trim().slice(0, 80) || null;
  let className = classPeriod;
  let courseId = challengeCourseId(request.data?.courseId);
  if (classId) {
    const classSnapshot = await db.collection("classes").doc(classId).get();
    if (!classSnapshot.exists) throw new HttpsError("not-found", "That MathMaster class no longer exists.");
    const classRecord = classSnapshot.data() || {};
    const ownsClass = authLib.isRootAdminEmail(teacherEmail)
      || String(classRecord.teacherOfRecord || "").trim().toLowerCase() === teacherEmail;
    if (!ownsClass) throw new HttpsError("permission-denied", "You can only launch a Live Challenge for a class you teach.");
    if (classRecord.status === "archived") throw new HttpsError("failed-precondition", "Choose an active class before launching a challenge.");
    if (!["algebra1", "algebra2"].includes(String(classRecord.course || ""))) {
      throw new HttpsError("failed-precondition", "Live Challenge currently supports Algebra I and Algebra II classes.");
    }
    classPeriod = String(classRecord.period || "").trim().slice(0, 80) || null;
    className = String(classRecord.name || classPeriod || classId).trim().slice(0, 120);
    courseId = challengeCourseId(classRecord.course);
  } else if (!classPeriod) {
    throw new HttpsError("invalid-argument", "Choose a class before launching a challenge.");
  }
  // OPTIONAL ASSIGNMENT LINK. When present this room is the Warm-Up of that
  // assignment, and every student who opens it is handed straight into the
  // game. That is a takeover of the lesson, so it is only allowed when the
  // teacher explicitly switched the challenge on for that assignment — a link
  // to an assignment that never enabled it is refused rather than ignored, so
  // a mistake surfaces at launch instead of surprising a class.
  let assignmentId = String(request.data?.assignmentId || "").trim().slice(0, 200) || null;
  let warmupChallengeConfig = null;
  if (assignmentId) {
    const assignmentSnapshot = await db.collection("assignments").doc(assignmentId).get();
    if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment no longer exists.");
    const warmup = await warmupChallengeRules();
    warmupChallengeConfig = warmup.normalizeWarmupChallengeConfig({
      ...(assignmentSnapshot.data() || {}),
      id: assignmentId,
    });
    if (!warmupChallengeConfig.enabled) {
      throw new HttpsError(
        "failed-precondition",
        "Turn on the Warm-Up Live Challenge for this assignment before launching it from the Warm-Up.",
      );
    }
  }

  const standardCode = challenge.canonicalChallengeStandard(
    request.data?.standardCode || warmupChallengeConfig?.standardCode || "mixed",
  );
  const requestedRoundCount = challenge.normalizeRoundCount(
    request.data?.roundCount || warmupChallengeConfig?.roundCount,
  );
  const roundSeconds = challenge.normalizeRoundSeconds(
    request.data?.roundSeconds || warmupChallengeConfig?.roundSeconds,
  );
  const timingMode = challenge.normalizeChallengeTimingMode(request.data?.timingMode);
  const roundClosingThreshold = challenge.normalizeRoundClosingThreshold(request.data?.roundClosingThreshold);
  const secondChanceMode = request.data?.secondChanceMode === "automatic" ? "automatic" : "off";
  const defaultTitle = `${className || classPeriod || "Class"} Live Challenge`;
  const title = String(request.data?.title || defaultTitle).trim().slice(0, 120) || defaultTitle;

  // One active room per teacher. A tiny pointer keeps refresh recovery O(1) and
  // avoids reading completed challenge history every time the teacher opens
  // the dashboard.
  const activePointerRef = db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(teacherEmail);
  const activeRecovery = await recoverTeacherActiveChallenge(db, { teacherEmail, challenge });
  if (activeRecovery.action === "resume") {
    throw new HttpsError(
      "failed-precondition",
      "Finish or cancel your current Live Challenge before creating another one.",
      { roomId: activeRecovery.roomId },
    );
  }

  const roster = await loadChallengeRoster(db, teacherEmail, { classId, classPeriod });
  if (!roster.length) throw new HttpsError("failed-precondition", `No students assigned to you were found in ${className || classPeriod}.`);

  const solverRace = await solverRaceRules();
  const challengeMode = solverRace.canonicalChallengeMode(request.data?.challengeMode);
  const solverRaceFocus = solverRace.canonicalSolverRaceFocus(request.data?.solverRaceFocus);
  const solverRaceDifficulty = solverRace.canonicalSolverRaceDifficulty(request.data?.solverRaceDifficulty);
  const questionStyle = challengeMode === "solverRace" ? "tools" : challenge.canonicalQuestionStyle(request.data?.questionStyle);
  // Never derive answer-bearing draws in the browser. This nonce is retained
  // only in the private room record alongside the instantiated questions.
  const solverRaceSeed = challengeMode === "solverRace" ? crypto.randomUUID() : null;
  const solverQuestions = challengeMode === "solverRace"
    ? solverRace.planSolverRace({ roundCount: requestedRoundCount, focus: solverRaceFocus, difficulty: solverRaceDifficulty, seed: solverRaceSeed })
    : null;
  const candidates = solverQuestions
    ? await securelyPlanSolverRace(solverQuestions)
    : await loadChallengeCandidates(db, { courseId, standardCode, questionStyle });
  if (candidates.length < challenge.MIN_ROUND_COUNT) {
    throw new HttpsError(
      "failed-precondition",
      standardCode === "mixed"
        ? `The secure ${courseId === "algebra2" ? "Algebra II" : "Algebra I"} bank needs at least ${challenge.MIN_ROUND_COUNT} usable questions before a Live Challenge can start.`
        : `${standardCode} has only ${candidates.length} securely gradeable challenge question${candidates.length === 1 ? "" : "s"}${questionStyleLabel(questionStyle)}. At least ${challenge.MIN_ROUND_COUNT} are required.`,
    );
  }
  const selected = solverQuestions ? candidates : selectChallengeQuestions(candidates, requestedRoundCount);
  const actualRoundCount = selected.length;

  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc();
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomRef.id);
  const aliasSeed = parseInt(crypto.createHash("sha256").update(roomRef.id).digest("hex").slice(0, 6), 16);
  const sortedRoster = [...roster].sort((a, b) => a.studentId.localeCompare(b.studentId));
  const playerRecords = sortedRoster.map((student, index) => ({
    studentId: student.studentId,
    playerKey: crypto.randomUUID(),
    alias: challenge.challengeAlias(index, aliasSeed),
    joined: false,
    score: 0,
    correctCount: 0,
    roundsAnswered: 0,
    streak: 0,
    answeredRound: -1,
  }));

  const rootBatch = db.batch();
  rootBatch.set(roomRef, {
    schemaVersion: 2,
    title,
    teacherEmail,
    // Null, never absent: a reader can tell "standalone challenge" from "field
    // added after this room was created" without guessing.
    assignmentId,
    classId,
    classPeriod,
    className: className || null,
    courseId,
    standardCode,
    questionStyle,
    challengeMode,
    solverRaceFocus: challengeMode === "solverRace" ? solverRaceFocus : null,
    solverRaceDifficulty: challengeMode === "solverRace" ? solverRaceDifficulty : null,
    status: challenge.LIVE_CHALLENGE_STATUS.LOBBY,
    roundCount: actualRoundCount,
    requestedRoundCount,
    roundSeconds,
    timingMode,
    roundClosingThreshold,
    secondChanceMode,
    currentRound: -1,
    roundVersion: 0,
    roundToken: null,
    phase: "lobby",
    currentQuestion: null,
    startsAt: null,
    endsAt: null,
    roundStartedAt: null,
    roundEndsAt: null,
    eligibleCount: sortedRoster.length,
    scoringMode: "accuracyFirst",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  rootBatch.set(privateRef, {
    schemaVersion: 2,
    roomId: roomRef.id,
    teacherEmail,
    solverRaceSeed,
    questionIds: selected.map((entry) => entry.question.id),
    // Generated solver definitions stay in the server-only challenge document.
    // Public room payloads are produced by the normal Path sanitizer below.
    roundQuestions: challengeMode === "solverRace" ? selected.map((entry) => entry.question) : null,
    // The standard each round is about, captured now. The report is assembled
    // after the room closes, and re-reading the bank then would give whatever
    // the question says today rather than what the class actually answered.
    roundStandards: Object.fromEntries(selected.map((entry, index) => [
      String(index),
      String(
        (Array.isArray(entry.question.alignmentKeys) && entry.question.alignmentKeys[0])
        || entry.question.alignmentKey
        || entry.question.teksCode
        || "",
      ),
    ])),
    // Frozen here so that appending second-chance rounds later cannot make the
    // game think its own replays were part of the original set.
    scheduledRoundCount: selected.length,
    // No roundMisses/roundAnswers here. Nothing writes them any more — the
    // per-round tallies are derived from the player documents when they are
    // read — and initialising a field no writer maintains is how a stale
    // counter later gets mistaken for the truth.
    secondChanceOf: {},
    secondChancePlanned: false,
    status: challenge.LIVE_CHALLENGE_STATUS.LOBBY,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await rootBatch.commit();

  // Keep identity-bearing player state in one private document per student.
  // Public player documents are created only after students join and contain
  // anonymous aliases/statistics only. This avoids every student contending on
  // one giant room/leaderboard document when a whole class answers together.
  for (let start = 0; start < playerRecords.length; start += 200) {
    const batch = db.batch();
    playerRecords.slice(start, start + 200).forEach((player) => {
      batch.set(privateRef.collection("players").doc(player.studentId), {
        playerKey: player.playerKey,
        alias: player.alias,
        joined: false,
        score: 0,
        correctCount: 0,
        roundsAnswered: 0,
        streak: 0,
        answeredRound: -1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(db.collection(LIVE_CHALLENGE_INVITES).doc(player.studentId), {
        roomId: roomRef.id,
        title,
        teacherEmail,
        // The Warm-Up link travels to the student on the invite, because the
        // invite is the only challenge document a student is allowed to read
        // before joining. Null for a standalone challenge, which is what stops
        // one taking over an unrelated assignment's Warm-Up.
        assignmentId,
        classId,
        classPeriod,
        className: className || null,
        courseId,
        alias: player.alias,
        playerKey: player.playerKey,
        status: "invited",
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }

  // The recover-after-refresh pointer is written only after the lobby roster
  // and invitations exist, so a partial setup failure cannot trap the teacher
  // behind a pointer to an unusable room.
  await activePointerRef.set({ roomId: roomRef.id, teacherEmail, classId, classPeriod, updatedAt: FieldValue.serverTimestamp() });

  return {
    roomId: roomRef.id,
    roundCount: actualRoundCount,
    requestedRoundCount,
    eligibleCount: sortedRoster.length,
    trimmed: actualRoundCount < requestedRoundCount,
  };
});

async function loadPrivateChallengePlayers(privateRef) {
  const snapshot = await privateRef.collection("players").get();
  return snapshot.docs.map((playerDoc) => ({ studentId: playerDoc.id, ...playerDoc.data() }));
}

async function deletePrivateChallengeState(db, privateRef, players = []) {
  try {
    for (let start = 0; start < players.length; start += 450) {
      const batch = db.batch();
      players.slice(start, start + 450).forEach((player) => batch.delete(privateRef.collection("players").doc(player.studentId)));
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
    await privateRef.delete();
  } catch (error) {
    // Finishing the live room and student invites is more important than
    // retention cleanup. Leave recoverable private state behind rather than
    // turning a completed challenge back into an error screen.
    logger.warn(`Live Challenge private cleanup failed for ${privateRef.id}.`, error);
  }
}

/*
 * A TEACHER PLAYING THEIR OWN CHALLENGE BEFORE A CLASS DOES.
 *
 * Launching a Live Challenge used to be blind: the first time anyone saw the
 * questions was when twenty-four students did, under a timer, with no way back.
 * The point of a dry run is not seeing the interface — it is QUESTION REVIEW.
 * Drawing from the whole bank makes what comes up genuinely less predictable,
 * and nothing yet stops a mixed game serving a DOK-3 modelling question as
 * round 1 under a 45-second clock. This is the cheapest place to catch that.
 *
 * It is deliberately not a room. No roster is loaded, no invite is written, no
 * player documents exist, no report is produced and no mastery evidence is
 * recorded. A dry run cannot be joined, cannot be seen by a student, and leaves
 * nothing attached to anybody's record. The only state is one teacher-scoped
 * document holding the question ids, which exists so that grading resolves on
 * the server rather than trusting whatever the browser sends back.
 *
 * The questions, the instantiation seed, the issuability gate and the grader are
 * all the same code the real game uses. A dry run that used a parallel path
 * would reassure a teacher about something students never see.
 */
async function requireOwnedDryRun(db, request, dryRunId) {
  await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) throw new HttpsError("permission-denied", "A verified teacher email is required.");
  const ref = db.collection(LIVE_CHALLENGE_DRY_RUNS).doc(String(dryRunId || "").trim());
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That dry run no longer exists.");
  const dryRun = snapshot.data() || {};
  if (dryRun.teacherEmail !== teacherEmail && !authLib.isRootAdminEmail(teacherEmail)) {
    throw new HttpsError("permission-denied", "You can only open your own dry run.");
  }
  return { teacherEmail, ref, dryRun };
}

exports.createChallengeDryRun = onCall(async (request) => {
  await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) throw new HttpsError("permission-denied", "A verified teacher email is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();

  const courseId = challengeCourseId(request.data?.courseId);
  const standardCode = challenge.canonicalChallengeStandard(request.data?.standardCode || "mixed");
  const requestedRoundCount = challenge.normalizeRoundCount(request.data?.roundCount);
  const roundSeconds = challenge.normalizeRoundSeconds(request.data?.roundSeconds);
  const timingMode = challenge.normalizeChallengeTimingMode(request.data?.timingMode);

  const solverRace = await solverRaceRules();
  const challengeMode = solverRace.canonicalChallengeMode(request.data?.challengeMode);
  const solverRaceFocus = solverRace.canonicalSolverRaceFocus(request.data?.solverRaceFocus);
  const solverRaceDifficulty = solverRace.canonicalSolverRaceDifficulty(request.data?.solverRaceDifficulty);
  const questionStyle = challengeMode === "solverRace" ? "tools" : challenge.canonicalQuestionStyle(request.data?.questionStyle);
  const solverRaceSeed = challengeMode === "solverRace" ? crypto.randomUUID() : null;
  const solverQuestions = challengeMode === "solverRace"
    ? solverRace.planSolverRace({ roundCount: requestedRoundCount, focus: solverRaceFocus, difficulty: solverRaceDifficulty, seed: solverRaceSeed })
    : null;
  const candidates = solverQuestions
    ? await securelyPlanSolverRace(solverQuestions)
    : await loadChallengeCandidates(db, { courseId, standardCode, questionStyle });
  if (candidates.length < challenge.MIN_ROUND_COUNT) {
    throw new HttpsError(
      "failed-precondition",
      // "Only 2 questions" is baffling on a bank of 800. "Only 2 that use an
      // interactive tool" is the actual situation the teacher has to act on.
      `That selection has only ${candidates.length} securely gradeable questions${questionStyleLabel(questionStyle)}. At least ${challenge.MIN_ROUND_COUNT} are required.`,
    );
  }
  const selected = solverQuestions ? candidates : selectChallengeQuestions(candidates, requestedRoundCount);
  const questionIds = selected.map((entry) => entry.question.id);

  const ref = db.collection(LIVE_CHALLENGE_DRY_RUNS).doc();
  await ref.set({
    schemaVersion: 1,
    teacherEmail,
    courseId,
    standardCode,
    questionStyle,
    challengeMode,
    solverRaceFocus: challengeMode === "solverRace" ? solverRaceFocus : null,
    solverRaceDifficulty: challengeMode === "solverRace" ? solverRaceDifficulty : null,
    solverRaceSeed,
    roundQuestions: challengeMode === "solverRace" ? selected.map((entry) => entry.question) : null,
    roundSeconds,
    timingMode,
    questionIds,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const rounds = await Promise.all(questionIds.map(async (questionId, roundIndex) => ({
    roundIndex,
    question: await buildLiveChallengePublicQuestion(db, {
      roomId: ref.id, roundIndex, questionId, authoredQuestion: solverQuestions?.[roundIndex] || null,
    }),
  })));

  return { dryRunId: ref.id, courseId, standardCode, questionStyle, challengeMode, solverRaceFocus, solverRaceDifficulty, roundSeconds, timingMode, roundCount: rounds.length, rounds };
});

exports.swapChallengeDryRunRound = onCall(async (request) => {
  const db = getFirestore();
  const roundIndex = Number(request.data?.roundIndex);
  if (!Number.isInteger(roundIndex) || roundIndex < 0) throw new HttpsError("invalid-argument", "roundIndex is required.");
  const { ref, dryRun } = await requireOwnedDryRun(db, request, request.data?.dryRunId);

  const questionIds = Array.isArray(dryRun.questionIds) ? [...dryRun.questionIds] : [];
  if (roundIndex >= questionIds.length) throw new HttpsError("invalid-argument", "That round is not part of this dry run.");

  if (dryRun.challengeMode === "solverRace") {
    const solverRace = await solverRaceRules();
    const roundQuestions = Array.isArray(dryRun.roundQuestions) ? [...dryRun.roundQuestions] : [];
    const current = roundQuestions[roundIndex];
    const stageStructures = solverRace.SOLVER_RACE_CATALOG.filter((entry) => (
      entry.challengeFamily === current?.challengeFamily
      && entry.difficultyBand === current?.difficultyBand
    ));
    const alternatives = stageStructures.filter((entry) => entry.id !== current?.familyId);
    const pool = alternatives.length ? alternatives : stageStructures;
    const alternate = pool[solverRace.seededSolverRaceIndex(
      `${dryRun.solverRaceSeed}|swap-structure|${roundIndex}|${current?.solverRaceSwap || 0}`,
      pool.length,
    )];
    if (!alternate) throw new HttpsError("failed-precondition", "There is no other Solver Race structure for this stage.");
    const swapNumber = Math.max(1, Number(current?.solverRaceSwap) + 1 || 1);
    const generated = solverRace.generateSolverRaceQuestion(
      alternate,
      `${dryRun.solverRaceSeed}|swap|${roundIndex}|${swapNumber}`,
    );
    const replacementQuestion = {
      ...generated,
      id: `${alternate.id}_r${roundIndex + 1}_swap${swapNumber}`,
      solverRaceRound: roundIndex,
      solverRaceStage: current?.solverRaceStage,
      solverRaceSwap: swapNumber,
    };
    questionIds[roundIndex] = replacementQuestion.id;
    roundQuestions[roundIndex] = replacementQuestion;
    await ref.set({ questionIds, roundQuestions, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return {
      roundIndex,
      question: await buildLiveChallengePublicQuestion(db, {
        roomId: ref.id, roundIndex, questionId: replacementQuestion.id, authoredQuestion: replacementQuestion,
      }),
    };
  }

  // A fresh draw, then the first candidate this dry run is not already using.
  // Swapping a question for one already in the set would look like the button
  // did nothing.
  const candidates = await loadChallengeCandidates(db, {
    courseId: dryRun.courseId,
    standardCode: dryRun.standardCode,
    // A swap that ignored the style would quietly hand back the kind of
    // question the teacher chose not to have.
    questionStyle: dryRun.questionStyle,
  });
  const inUse = new Set(questionIds);
  const replacement = selectChallengeQuestions(candidates, candidates.length)
    .map((entry) => entry.question.id)
    .find((id) => !inUse.has(id));
  if (!replacement) throw new HttpsError("failed-precondition", "There are no other questions available for this selection.");

  questionIds[roundIndex] = replacement;
  await ref.set({ questionIds, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  return {
    roundIndex,
    question: await buildLiveChallengePublicQuestion(db, { roomId: ref.id, roundIndex, questionId: replacement }),
  };
});

exports.gradeChallengeDryRunResponse = onCall(async (request) => {
  const db = getFirestore();
  const roundIndex = Number(request.data?.roundIndex);
  if (!Number.isInteger(roundIndex) || roundIndex < 0) throw new HttpsError("invalid-argument", "roundIndex is required.");
  const { dryRun, ref } = await requireOwnedDryRun(db, request, request.data?.dryRunId);

  const questionId = (dryRun.questionIds || [])[roundIndex];
  if (!questionId) throw new HttpsError("invalid-argument", "That round is not part of this dry run.");

  // The same seed the public question was built from, so the teacher is graded
  // against the draw they were actually shown.
  const authoredQuestion = dryRun.roundQuestions?.[roundIndex] || null;
  const snapshot = authoredQuestion ? null : await db.collection("pathQuestionBank").doc(questionId).get();
  if (!authoredQuestion && !snapshot.exists) throw new HttpsError("failed-precondition", "That question is no longer in the secure bank.");
  const instantiated = await mathPath.instantiateQuestion(authoredQuestion || snapshot.data() || {}, `challenge|${ref.id}|${roundIndex}|${questionId}`);
  if (!instantiated.question) throw new HttpsError("failed-precondition", "That question could not be regenerated.");
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  if (!plan.issuable) throw new HttpsError("failed-precondition", "That question can no longer be securely graded.");
  const grading = await mathPath.gradePathToolResponse(plan.privateGrading, request.data?.responsePayload || {});
  if (grading?.rejected) throw new HttpsError("failed-precondition", grading.reason || "The response could not be graded.");

  // Shaped like submitLiveChallengeResponse so the round renders identically,
  // and scored by the same function the real game scores with, so a
  // partial-credit tool shows a teacher the credit it will actually pay.
  // Speed and streak are deliberately zero: there is no server-timed round here
  // and no run of answers to build on, and inventing either would be a number a
  // teacher could not get in the real game. Nothing here is written anywhere.
  const challenge = await liveChallengeRules();
  const scored = challenge.scoreChallengeRound({
    gradeScore: Number(grading?.score) || 0,
    isCorrect: grading?.isCorrect === true,
    remainingMs: 0,
    previousStreak: 0,
  });
  return {
    isCorrect: grading?.isCorrect === true,
    scorePercent: Math.round(Math.max(0, Math.min(1, Number(grading?.score) || 0)) * 100),
    pointsAwarded: scored.basePoints,
    basePoints: scored.basePoints,
    speedBonus: 0,
    streakBonus: 0,
    comebackBonus: 0,
    recoveryPoints: 0,
    secondChance: false,
    totalScore: scored.basePoints,
    streak: 0,
    rank: null,
    dryRun: true,
  };
});

exports.discardChallengeDryRun = onCall(async (request) => {
  const db = getFirestore();
  const { ref } = await requireOwnedDryRun(db, request, request.data?.dryRunId);
  await ref.delete();
  return { discarded: true };
});

exports.joinLiveChallenge = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");

  const inviteRef = db.collection(LIVE_CHALLENGE_INVITES).doc(studentId);
  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privatePlayerRef = privateRef.collection("players").doc(studentId);

  await db.runTransaction(async (transaction) => {
    const [inviteSnapshot, roomSnapshot, playerSnapshot] = await Promise.all([
      transaction.get(inviteRef), transaction.get(roomRef), transaction.get(privatePlayerRef),
    ]);
    if (!inviteSnapshot.exists || inviteSnapshot.data()?.roomId !== roomId) throw new HttpsError("permission-denied", "This Live Challenge was not assigned to you.");
    if (!roomSnapshot.exists || !playerSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge is no longer available.");
    const room = roomSnapshot.data() || {};
    if (![challenge.LIVE_CHALLENGE_STATUS.LOBBY, challenge.LIVE_CHALLENGE_STATUS.RUNNING].includes(room.status)) {
      throw new HttpsError("failed-precondition", "That Live Challenge is no longer accepting players.");
    }
    const player = playerSnapshot.data() || {};
    if (!player.playerKey) throw new HttpsError("failed-precondition", "Your Live Challenge player record is incomplete.");
    // WHICH ROUND THEY WALKED IN ON. A student who arrives at round six is a
    // full participant in the four rounds they were present for, not a
    // 40% participant in ten. Without this the denominator is always the whole
    // game and every late arrival looks like a student who gave up.
    //
    // Preserved once set. Rejoining is not arriving — a Chromebook waking from
    // sleep re-enters this transaction, and recomputing would move the student's
    // join to the current round, shrinking the denominator and inflating the
    // participation of the one person whose device failed them.
    const existingJoinRound = Number.isInteger(Number(player.joinedAtRound)) ? Number(player.joinedAtRound) : null;
    const joinedAtRound = existingJoinRound !== null
      ? existingJoinRound
      : Math.max(0, Number.isInteger(Number(room.currentRound)) ? Number(room.currentRound) : 0);
    const joinedPlayer = { ...player, joined: true, joinedAtRound, updatedAt: FieldValue.serverTimestamp() };
    const publicPlayerRef = roomRef.collection("players").doc(player.playerKey);
    transaction.set(privatePlayerRef, joinedPlayer, { merge: true });
    transaction.set(publicPlayerRef, {
      playerKey: player.playerKey,
      alias: player.alias,
      joined: true,
      score: Math.max(0, Math.round(Number(player.score) || 0)),
      correctCount: Math.max(0, Math.round(Number(player.correctCount) || 0)),
      roundsAnswered: Math.max(0, Math.round(Number(player.roundsAnswered) || 0)),
      streak: Math.max(0, Math.round(Number(player.streak) || 0)),
      answeredRound: Number.isInteger(Number(player.answeredRound)) ? Number(player.answeredRound) : -1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(inviteRef, {
      status: room.status === challenge.LIVE_CHALLENGE_STATUS.RUNNING ? "running" : "joined",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { roomId, joined: true };
});

async function openLiveChallengeRound({ db, roomRef, privateRef, room, privateState, roundIndex }) {
  const challenge = await liveChallengeRules();
  const parity = await import("./shared/liveChallengeParity.mjs");
  const questionId = privateState.questionIds?.[roundIndex];
  if (!questionId) throw new HttpsError("failed-precondition", "That Live Challenge round has no question.");
  const currentQuestion = await buildLiveChallengePublicQuestion(db, {
    roomId: roomRef.id,
    roundIndex,
    questionId,
    authoredQuestion: privateState.roundQuestions?.[roundIndex] || null,
  });
  const nowMs = Date.now();
  const timingMode = challenge.normalizeChallengeTimingMode(room.timingMode);
  const roundSeconds = challenge.complexityAdjustedRoundSeconds({
    baselineSeconds: room.roundSeconds,
    question: privateState.roundQuestions?.[roundIndex] || currentQuestion,
  });
  const roundVersion = Math.max(Number(room.roundVersion) || 0, roundIndex) + 1;
  const roundToken = crypto.randomUUID();
  const startsAt = new Date(nowMs + parity.ROUND_SYNC_LEAD_MS);
  const endsAt = timingMode === "pace" ? null : new Date(startsAt.getTime() + roundSeconds * 1000);

  await Promise.all([
    privateRef.set({
      status: challenge.LIVE_CHALLENGE_STATUS.RUNNING,
      currentRound: roundIndex,
      roundVersion,
      roundToken,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    roomRef.set({
      status: challenge.LIVE_CHALLENGE_STATUS.RUNNING,
      currentRound: roundIndex,
      roundVersion,
      roundToken,
      phase: "countdown",
      currentQuestion,
      scheduledRoundCount: Number(privateState.scheduledRoundCount) || Number(room.roundCount) || 0,
      secondChanceOf: Object.prototype.hasOwnProperty.call(privateState.secondChanceOf || {}, String(roundIndex))
        ? Number(privateState.secondChanceOf[String(roundIndex)])
        : null,
      finalRoundNumber: Object.prototype.hasOwnProperty.call(privateState.secondChanceOf || {}, String(roundIndex))
        ? roundIndex - (Number(privateState.scheduledRoundCount) || Number(room.roundCount) || 0) + 1
        : null,
      hasAdditionalReplay: Object.prototype.hasOwnProperty.call(privateState.secondChanceOf || {}, String(roundIndex + 1)),
      startsAt,
      endsAt,
      roundStartedAt: startsAt,
      roundEndsAt: endsAt,
      activeRoundSeconds: roundSeconds,
      closingStartedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ]);

  return { currentQuestion, roundIndex, roundVersion, roundToken, phase: "countdown", startsAt: startsAt.toISOString(), endsAt: endsAt ? endsAt.toISOString() : null };
}

// A deliberately tiny calibration endpoint. Calling it several times lets the
// browser estimate offset/RTT without granting it any scoring authority.
exports.calibrateLiveChallengeClock = onCall(async (request) => {
  const isTeacher = request.auth?.token?.role === "teacher";
  const studentId = isTeacher ? null : requireStudent(request).studentId;
  if (isTeacher) await requireTeacher(request);
  const serverAt = Date.now();
  const roomId = String(request.data?.roomId || "").trim();
  if (studentId && roomId && request.data?.quality) {
    const db = getFirestore();
    const privatePlayer = await db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId).collection("players").doc(studentId).get();
    if (privatePlayer.exists && privatePlayer.data()?.playerKey) {
      const quality = ["synchronized", "delayed", "reconnecting", "degraded"].includes(request.data.quality) ? request.data.quality : "delayed";
      await db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId).collection("diagnostics").doc(privatePlayer.data().playerKey).set({
        connectionStatus: quality,
        connectionRttCategory: quality === "synchronized" ? "normal" : "elevated",
        connectionUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
  return { serverAt };
});

exports.startLiveChallenge = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  if (room.status !== challenge.LIVE_CHALLENGE_STATUS.LOBBY) throw new HttpsError("failed-precondition", "This challenge has already started.");
  const joinedSnapshot = await roomRef.collection("players").limit(1).get();
  if (joinedSnapshot.empty) throw new HttpsError("failed-precondition", "At least one student must join before the challenge starts.");
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privateSnapshot = await privateRef.get();
  if (!privateSnapshot.exists) throw new HttpsError("not-found", "The private challenge state is missing.");
  const result = await openLiveChallengeRound({ db, roomRef, privateRef, room, privateState: privateSnapshot.data() || {}, roundIndex: 0 });
  const players = await loadPrivateChallengePlayers(privateRef);
  await updateLiveChallengeInvites(db, players.map((player) => player.studentId), {
    status: "running",
    updatedAt: FieldValue.serverTimestamp(),
  });
  return result;
});

async function finishLiveChallengeRoom({ db, roomRef, privateRef, room, status }) {
  const players = await loadPrivateChallengePlayers(privateRef);

  // WRITTEN BEFORE THE STATE IT READS IS DELETED. Everything the report needs —
  // which rounds were missed, how many answered each one, what standard each
  // round was about — lives in private state, and deletePrivateChallengeState
  // below removes it. Assembling the report afterwards would produce an empty
  // one, which is how a report quietly becomes useless rather than obviously
  // broken.
  try {
    const privateSnapshot = await privateRef.get();
    const privateState = privateSnapshot.exists ? (privateSnapshot.data() || {}) : {};
    const reportRules = await liveChallengeReportRules();
    const challengeRules = await liveChallengeRules();
    // Counted from the player documents rather than read off a shared counter.
    // `players` is already loaded above, so this costs no extra read.
    const derivedTallies = challengeRules.deriveRoundTallies({
      players,
      secondChanceOf: privateState.secondChanceOf || {},
      storedRoundAnswers: privateState.roundAnswers || null,
      storedRoundMisses: privateState.roundMisses || null,
    });
    const report = reportRules.buildChallengeReport({
      room,
      scheduledRoundCount: Number(privateState.scheduledRoundCount) || Number(room.roundCount) || 0,
      roundMisses: derivedTallies.roundMisses,
      roundStandards: privateState.roundStandards || {},
      roundAnswers: derivedTallies.roundAnswers,
      answeredCounts: derivedTallies.roundAnswers,
      secondChanceOf: privateState.secondChanceOf || {},
      questionIds: Array.isArray(privateState.questionIds) ? privateState.questionIds : [],
      players,
    });
    await db.collection(LIVE_CHALLENGE_REPORTS).doc(roomRef.id).set({
      ...report,
      roomId: roomRef.id,
      teacherEmail: room.teacherEmail,
      classId: room.classId || null,
      status,
      finishedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // A report that cannot be written must never strand a room in a running
    // state that the teacher can no longer end.
    logger.error("liveChallenge.report.failed", { roomId: roomRef.id, message: error?.message });
  }

  await Promise.all([
    roomRef.set({
      status,
      phase: "finished",
      currentQuestion: null,
      endsAt: null,
      roundEndsAt: null,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    privateRef.set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
  ]);
  await db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(room.teacherEmail).delete().catch(() => {});
  await updateLiveChallengeInvites(db, players.map((player) => player.studentId), {
    status,
    updatedAt: FieldValue.serverTimestamp(),
  });
  // THE ASSIGNMENT'S SHARE OF THE GAME, WRITTEN BEFORE THE COUNTERS VANISH.
  // roundsAnswered and correctCount live on the private player documents that
  // deletePrivateChallengeState removes immediately below, so this cannot move
  // later without silently recording zeroes for a whole class.
  //
  // CHALLENGE POINTS ARE NOT WRITTEN. A round is scored out of roughly 1150
  // with speed and streak inside it. What reaches the assignment is what the
  // student did — how much they answered and how much of it was right — because
  // those are facts about the mathematics and the score is partly a fact about
  // their reaction time.
  if (room.assignmentId) {
    try {
      const warmup = await warmupChallengeRules();
      const totalRounds = Math.max(0, Number(room.roundCount) || 0);
      // Only students who actually joined. A student who never appeared is an
      // attendance question, which the teacher reconciles; writing them a 0%
      // here would make an absence indistinguishable from a student who sat
      // through the game and answered nothing.
      const joinedPlayers = players.filter((player) => player.joined === true);
      for (let start = 0; start < joinedPlayers.length; start += 450) {
        const batch = db.batch();
        joinedPlayers.slice(start, start + 450).forEach((player) => {
          const credit = warmup.warmupChallengeCredit({
            roundsAnswered: player.roundsAnswered,
            correctCount: player.correctCount,
            roundsAvailable: warmup.roundsAvailableToStudent({
              totalRounds,
              joinedAtRound: player.joinedAtRound,
            }),
          });
          batch.set(db.collection("grades").doc(player.studentId), {
            warmupChallengeByAssignment: {
              [room.assignmentId]: {
                ...credit,
                roomId: roomRef.id,
                status,
                roundCount: totalRounds,
                recordedAt: FieldValue.serverTimestamp(),
              },
            },
          }, { merge: true });
        });
        // eslint-disable-next-line no-await-in-loop
        await batch.commit();
      }
    } catch (error) {
      // Same rule as the report: a credit write that fails must never leave a
      // room the teacher cannot end.
      logger.error("warmupChallenge.credit.failed", { roomId: roomRef.id, message: error?.message });
    }
  }

  // MASTERY EVIDENCE. Aggregated per standard rather than per round, because a
  // single timed question is close to a coin flip and a proportion is what the
  // estimate can use. Replays are excluded so one question cannot enter a
  // student's record twice, the second time being the easier time.
  //
  // Above the delete for the same reason as everything else here: answeredRounds
  // and missedRounds live on the private player documents.
  try {
    const privateSnapshot = await privateRef.get();
    const privateState = privateSnapshot.exists ? (privateSnapshot.data() || {}) : {};
    const evidenceRules = await liveChallengeEvidenceRules();
    const events = evidenceRules.buildChallengeEvidenceEvents({
      roomId: roomRef.id,
      players,
      roundStandards: privateState.roundStandards || {},
      secondChanceOf: privateState.secondChanceOf || {},
      occurredAt: Date.now(),
    });
    for (let start = 0; start < events.length; start += 450) {
      const batch = db.batch();
      events.slice(start, start + 450).forEach((evidenceEvent) => {
        const ref = db.collection("grades").doc(evidenceEvent.studentId)
          .collection("evidenceEvents").doc(mathPath.opaqueId("challengeEvidence", evidenceEvent.eventKey));
        batch.set(ref, evidenceEvent);
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
  } catch (error) {
    logger.error("liveChallenge.evidence.failed", { roomId: roomRef.id, message: error?.message });
  }

  // CLASS POINTS ACHIEVEMENTS ARE DERIVED WHILE PRIVATE CHALLENGE STATE STILL EXISTS.
  // A durable job is staged before private cleanup. If staging itself fails,
  // preserve the private state and flag the finished room for automatic retry.
  let classPointsPlanDurable = true;
  try {
    const challengeRules = await liveChallengeRules();
    if (status === challengeRules.LIVE_CHALLENGE_STATUS.FINISHED) {
      const privateSnapshot = await privateRef.get();
      const privateState = privateSnapshot.exists ? (privateSnapshot.data() || {}) : {};
      const rewards = await liveChallengeClassPoints();
      await rewards.processLiveChallengeClassPoints(
        db,
        roomRef.id,
        room,
        players,
        privateState,
        status,
      );
      await roomRef.set({
        classPointsRecoveryPending: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  } catch (error) {
    classPointsPlanDurable = false;
    logger.error("liveChallenge.classPoints.stage.failed", {
      roomId: roomRef.id,
      message: error?.message || String(error),
    });
    await roomRef.set({
      classPointsRecoveryPending: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch((markError) => {
      logger.error("liveChallenge.classPoints.recoveryFlag.failed", {
        roomId: roomRef.id,
        message: markError?.message || String(markError),
      });
    });
  }

  if (classPointsPlanDurable) {
    await deletePrivateChallengeState(db, privateRef, players);
  } else {
    logger.warn("liveChallenge.classPoints.privateStatePreserved", {
      roomId: roomRef.id,
      reason: "achievement-plan-not-durable",
    });
  }
  return { roomId: roomRef.id, status, roundCount: room.roundCount || 0 };
}

exports.advanceLiveChallenge = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  if (room.status !== challenge.LIVE_CHALLENGE_STATUS.RUNNING) throw new HttpsError("failed-precondition", "The challenge is not running.");

  // Advancing is authoritative on the server. In Pace Race, a null deadline means
  // the round is still open; it must never be treated like an expired timestamp.
  const [joinedAggregate, answeredAggregate] = await Promise.all([
    roomRef.collection("players").where("joined", "==", true).count().get(),
    roomRef.collection("players").where("joined", "==", true)
      .where("answeredRound", "==", Number(room.currentRound)).count().get(),
  ]);
  const joinedCount = Number(joinedAggregate.data()?.count) || 0;
  const answeredCount = Number(answeredAggregate.data()?.count) || 0;
  const roundEndsAtMs = toDate(room.roundEndsAt || room.endsAt)?.getTime() || 0;
  if (!challenge.challengeCanAdvance({ joinedCount, answeredCount, roundEndsAtMs, nowMs: Date.now() })) {
    throw new HttpsError("failed-precondition", "This round is still in progress.");
  }

  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privateSnapshot = await privateRef.get();
  if (!privateSnapshot.exists) throw new HttpsError("not-found", "The private challenge state is missing.");
  const privateState = privateSnapshot.data() || {};
  const nextRound = Number(room.currentRound) + 1;
  if (nextRound >= (privateState.questionIds?.length || 0)) {
    // SECOND CHANCE. Before the game ends, the questions the room got wrong
    // most come back once. Getting one right now earns most of its points
    // back, which turns a miss from a loss into a target and makes the last
    // rounds the ones the class most needs to see again.
    //
    // Appended only once — `secondChancePlanned` stops a replay of a replay,
    // which would otherwise let a game run on as long as students kept missing.
    const scheduled = Number(privateState.scheduledRoundCount) || (privateState.questionIds?.length || 0);
    // Same derivation as the report, from the same player documents. This is
    // the one consumer that runs mid-game, and it runs exactly once — after the
    // last scheduled round — so reading the roster here is cheap and happens
    // when every player document is already final for the scheduled rounds.
    const planningPlayers = privateState.secondChancePlanned ? [] : await loadPrivateChallengePlayers(privateRef);
    const replays = privateState.secondChancePlanned || room.secondChanceMode === "off"
      ? []
      : challenge.planSecondChanceRounds({
        roundMisses: challenge.deriveRoundTallies({
          players: planningPlayers,
          secondChanceOf: privateState.secondChanceOf || {},
          storedRoundMisses: privateState.roundMisses || null,
        }).roundMisses,
        scheduledRoundCount: scheduled,
      });

    if (!replays.length) {
      return finishLiveChallengeRoom({ db, roomRef, privateRef, room, status: challenge.LIVE_CHALLENGE_STATUS.FINISHED });
    }

    const questionIds = [...(privateState.questionIds || [])];
    const roundQuestions = Array.isArray(privateState.roundQuestions) ? [...privateState.roundQuestions] : null;
    const secondChanceOf = { ...privateState.secondChanceOf };
    replays.forEach((originalRound) => {
      secondChanceOf[String(questionIds.length)] = originalRound;
      questionIds.push(privateState.questionIds[originalRound]);
      if (roundQuestions) roundQuestions.push(privateState.roundQuestions[originalRound]);
    });

    await privateRef.set({
      questionIds,
      ...(roundQuestions ? { roundQuestions } : {}),
      secondChanceOf,
      scheduledRoundCount: scheduled,
      secondChancePlanned: true,
    }, { merge: true });

    return openLiveChallengeRound({
      db,
      roomRef,
      privateRef,
      room,
      privateState: { ...privateState, questionIds, ...(roundQuestions ? { roundQuestions } : {}), secondChanceOf, scheduledRoundCount: scheduled, secondChancePlanned: true },
      roundIndex: nextRound,
    });
  }
  return openLiveChallengeRound({ db, roomRef, privateRef, room, privateState, roundIndex: nextRound });
});

exports.finishLiveChallenge = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privateSnapshot = await privateRef.get();
  if (!privateSnapshot.exists) throw new HttpsError("not-found", "The private challenge state is missing.");
  return finishLiveChallengeRoom({ db, roomRef, privateRef, room, status: challenge.LIVE_CHALLENGE_STATUS.FINISHED });
});

exports.cancelLiveChallenge = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privateSnapshot = await privateRef.get();
  if (!privateSnapshot.exists) {
    const activePointerRef = db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(room.teacherEmail);
    await db.runTransaction(async (transaction) => {
      const [currentRoom, activePointer] = await Promise.all([
        transaction.get(roomRef),
        transaction.get(activePointerRef),
      ]);
      if (!currentRoom.exists || currentRoom.data()?.teacherEmail !== room.teacherEmail) {
        throw new HttpsError("permission-denied", "Only the teacher who launched this challenge can control it.");
      }
      transaction.set(roomRef, {
        status: challenge.LIVE_CHALLENGE_STATUS.CANCELLED,
        phase: "finished",
        staleSession: true,
        currentQuestion: null,
        startsAt: null,
        endsAt: null,
        roundStartedAt: null,
        roundEndsAt: null,
        roundToken: null,
        finishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (activePointer.data()?.roomId === roomId) transaction.delete(activePointerRef);
    });
    await updateLiveChallengeInvitesByRoom(db, {
      roomId,
      teacherEmail: room.teacherEmail,
      fields: { status: challenge.LIVE_CHALLENGE_STATUS.CANCELLED, staleSession: true, updatedAt: FieldValue.serverTimestamp() },
    }).catch((error) => logger.error("liveChallenge.cancelInvites.failed", { roomId, message: error?.message }));
    return { roomId, status: challenge.LIVE_CHALLENGE_STATUS.CANCELLED };
  }
  return finishLiveChallengeRoom({ db, roomRef, privateRef, room, status: challenge.LIVE_CHALLENGE_STATUS.CANCELLED });
});

/*
 * A PLAYER SAYING HOW FAR THEY HAVE GOT, MID-ROUND.
 *
 * This exists so the board moves while people are still working. It writes ONE
 * field group on the player's OWN public document — not the room document. That
 * distinction is the whole reason this is safe to call every second: the hot
 * document removed two releases ago was a single shared doc taking a write per
 * student per round, and Firestore's sustained write limit is per document.
 * Twenty-four students each writing their own doc is twenty-four documents.
 *
 * The client-visible provisional number remains display-only. Solver Race may
 * additionally attach raw algebra work. That work is re-instantiated and
 * graded here from the server-held question before a productive milestone can
 * become an authoritative receipt; the browser never supplies depth or points.
 */
exports.reportLiveChallengeProgress = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const roomId = String(request.data?.roomId || "").trim();
  const roundIndex = Number(request.data?.roundIndex);
  if (!roomId || !Number.isInteger(roundIndex) || roundIndex < 0) {
    throw new HttpsError("invalid-argument", "roomId and roundIndex are required.");
  }

  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privatePlayerRef = privateRef.collection("players").doc(studentId);
  const inviteRef = db.collection(LIVE_CHALLENGE_INVITES).doc(studentId);
  const [roomSnapshot, privateSnapshot, playerSnapshot, inviteSnapshot] = await Promise.all([
    roomRef.get(), privateRef.get(), privatePlayerRef.get(), inviteRef.get(),
  ]);
  if (!roomSnapshot.exists || !privateSnapshot.exists || !playerSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge is no longer available.");
  if (!inviteSnapshot.exists || inviteSnapshot.data()?.roomId !== roomId) {
    throw new HttpsError("permission-denied", "This Live Challenge was not assigned to you.");
  }
  const room = roomSnapshot.data() || {};
  const privateState = privateSnapshot.data() || {};
  const player = playerSnapshot.data() || {};
  const requestedVersion = Number(request.data?.roundVersion);
  const requestedToken = String(request.data?.roundToken || "").trim();
  if (
    room.status !== challenge.LIVE_CHALLENGE_STATUS.RUNNING
    || Number(room.currentRound) !== roundIndex
    || !Number.isInteger(requestedVersion)
    || Number(room.roundVersion || 0) !== requestedVersion
    || String(room.roundToken || "") !== requestedToken
  ) {
    // Not an error worth surfacing: the student simply moved on, or the teacher
    // advanced while a debounced report was in flight. Report nothing, quietly.
    return { recorded: false };
  }
  if (!player.joined) throw new HttpsError("failed-precondition", "Join the Live Challenge before playing.");
  // Nothing to publish once the round is really answered — the banked score is
  // authoritative from then on.
  if (Number(player.answeredRound) === roundIndex) return { recorded: false };

  const provisionalPoints = Math.max(
    0,
    Math.min(challenge.LIVE_PROVISIONAL_MAX_POINTS, Math.round(Number(request.data?.provisionalPoints) || 0)),
  );
  const rawProgress = request.data?.responsePayload?.raw;
  let secureMilestone = null;
  const secondChance = Object.prototype.hasOwnProperty.call(privateState.secondChanceOf || {}, String(roundIndex));
  if (rawProgress && room.challengeMode === "solverRace" && !secondChance) {
    const questionId = privateState.questionIds?.[roundIndex];
    const privateAuthored = privateState.roundQuestions?.[roundIndex] || null;
    const questionSnapshot = !privateAuthored && questionId ? await db.collection("pathQuestionBank").doc(questionId).get() : null;
    if (privateAuthored || questionSnapshot?.exists) {
      const authored = privateAuthored || questionSnapshot.data() || {};
      const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
      const plan = instantiated.question ? await mathPath.buildIssuePlan(instantiated.question) : null;
      if (plan?.issuable && plan.privateGrading?.pathToolId === "stepAlgebra") {
        const grading = await mathPath.gradePathToolResponse(plan.privateGrading, { raw: rawProgress });
        if (!grading?.rejected) {
          const expectedDepth = Math.max(1, Number(authored.solutionDepth) || 1);
          const productiveDepth = Math.max(0, Math.min(expectedDepth,
            Number(grading?.productiveDepth) || challenge.productiveDepthFromSecureGrade({
              gradeScore: grading?.score,
              expectedDepth,
              isCorrect: grading?.isCorrect === true,
            })));
          const normalizedState = String(rawProgress.finalRelation || rawProgress.finalEquation || "")
            .trim().replace(/\s+/g, " ");
          const stateHash = normalizedState
            ? crypto.createHash("sha256").update(normalizedState).digest("hex")
            : "";
          const startsAtMs = toDate(room.startsAt || room.roundStartedAt)?.getTime() || Date.now();
          const totalMs = challenge.normalizeRoundSeconds(room.activeRoundSeconds || room.roundSeconds) * 1000;
          secureMilestone = {
            productiveDepth, expectedDepth, stateHash,
            elapsedMs: Math.min(totalMs, Math.max(0, Date.now() - startsAtMs)), totalMs,
            validated: productiveDepth > 0,
          };
        }
      }
    }
  }

  const publicPlayerRef = roomRef.collection("players").doc(String(player.playerKey));
  const outcome = await db.runTransaction(async (transaction) => {
    const [latestRoomSnapshot, latestPlayerSnapshot] = await Promise.all([
      transaction.get(roomRef), transaction.get(privatePlayerRef),
    ]);
    if (!latestRoomSnapshot.exists || !latestPlayerSnapshot.exists) return { recorded: false, milestoneSpeedPoints: 0 };
    const latestRoom = latestRoomSnapshot.data() || {};
    const latestPlayer = latestPlayerSnapshot.data() || {};
    if (
      latestRoom.status !== challenge.LIVE_CHALLENGE_STATUS.RUNNING
      || Number(latestRoom.currentRound) !== roundIndex
      || Number(latestRoom.roundVersion || 0) !== requestedVersion
      || String(latestRoom.roundToken || "") !== requestedToken
      || Number(latestPlayer.answeredRound) === roundIndex
    ) return { recorded: false, milestoneSpeedPoints: 0 };

    const milestone = challenge.applyProductiveMilestoneAward({
      player: latestPlayer,
      roundIndex,
      roundVersion: requestedVersion,
      secureMilestone,
      secondChance,
    });

    transaction.set(privatePlayerRef, {
      ...(milestone.accepted ? {
        challengeMilestoneProgress: milestone.challengeMilestoneProgress,
        submissionReceipts: milestone.submissionReceipts,
        score: milestone.totalScore,
      } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(publicPlayerRef, {
      provisionalPoints,
      provisionalRound: roundIndex,
      ...(milestone.accepted ? { score: milestone.totalScore } : {}),
      provisionalAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
      recorded: true,
      provisionalPoints,
      milestoneAccepted: milestone.accepted,
      milestoneSpeedPoints: milestone.speedPoints,
      productiveDepth: milestone.productiveDepth || 0,
      totalScore: milestone.accepted ? milestone.totalScore : Math.max(0, Number(latestPlayer.score) || 0),
      duplicate: milestone.duplicate,
    };
  });

  return outcome;
});

async function maybeCompressLiveChallengeRoundAfterThreshold(db, { roomRef, roundIndex, roundVersion }) {
  const challenge = await liveChallengeRules();
  // Aggregation queries avoid re-reading every player document and avoid the
  // shared per-answer counter hotspot that Live Challenge intentionally removed.
  const [joinedAggregate, answeredAggregate] = await Promise.all([
    roomRef.collection("players").where("joined", "==", true).count().get(),
    roomRef.collection("players").where("answeredRound", "==", Number(roundIndex)).count().get(),
  ]);
  const joinedCount = Number(joinedAggregate.data()?.count) || 0;
  const answeredCount = Number(answeredAggregate.data()?.count) || 0;
  if (!joinedCount) return { compressed: false };

  const roomSnapshot = await roomRef.get();
  const roomAtCount = roomSnapshot.exists ? (roomSnapshot.data() || {}) : {};
  const decision = challenge.roundClosingDecision({ joinedCount, answeredCount, threshold: roomAtCount.roundClosingThreshold });
  const { thresholdCount } = decision;
  if (!decision.shouldClose) return { compressed: false, ...decision };

  const targetEndsAtMs = Date.now() + 5000;
  let compressed = false;
  await db.runTransaction(async (transaction) => {
    const latestRoomSnapshot = await transaction.get(roomRef);
    if (!latestRoomSnapshot.exists) return;
    const latestRoom = latestRoomSnapshot.data() || {};
    if (
      latestRoom.status !== "running"
      || Number(latestRoom.currentRound) !== Number(roundIndex)
      || Number(latestRoom.roundVersion || 0) !== Number(roundVersion || 0)
    ) return;

    if (latestRoom.closingStartedAt) return;
    const currentEndsAtMs = toDate(latestRoom.endsAt || latestRoom.roundEndsAt)?.getTime() || 0;
    const paceMode = challenge.normalizeChallengeTimingMode(latestRoom.timingMode) === "pace";
    if (!paceMode && (!currentEndsAtMs || currentEndsAtMs <= targetEndsAtMs)) return;

    const shortenedEndsAt = new Date(targetEndsAtMs);
    transaction.set(roomRef, {
      endsAt: shortenedEndsAt,
      roundEndsAt: shortenedEndsAt,
      roundCompressionReason: `${decision.threshold}-percent-answered`,
      closingThreshold: decision.threshold,
      closingStartedAt: FieldValue.serverTimestamp(),
      roundCompressedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    compressed = true;
  });

  return { compressed, answeredCount, joinedCount, thresholdCount };
}

exports.updateLiveChallengePacing = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  const roundClosingThreshold = challenge.normalizeRoundClosingThreshold(request.data?.roundClosingThreshold);
  await roomRef.set({ roundClosingThreshold, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (room.status === challenge.LIVE_CHALLENGE_STATUS.RUNNING) {
    await maybeCompressLiveChallengeRoundAfterThreshold(db, {
      roomRef,
      roundIndex: Number(room.currentRound),
      roundVersion: Number(room.roundVersion),
    });
  }
  return { roomId, roundClosingThreshold };
});

exports.submitLiveChallengeResponse = onCall(async (request) => {
  const requestArrivedAt = Date.now();
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const parity = await import("./shared/liveChallengeParity.mjs");
  const roomId = String(request.data?.roomId || "").trim();
  const submittedRound = Number(request.data?.roundIndex);
  // Omission remains accepted during the rolling Hosting/Functions deploy;
  // current clients always send all three protocol fields.
  const submissionId = String(request.data?.submissionId || `legacy-${crypto.randomUUID()}`).trim();
  const requestedVersion = request.data?.roundVersion == null ? null : Number(request.data.roundVersion);
  const requestedToken = request.data?.roundToken == null ? null : String(request.data.roundToken).trim();
  if (!roomId || !Number.isInteger(submittedRound) || submittedRound < 0 || (requestedVersion != null && !Number.isInteger(requestedVersion)) || submissionId.length > 100) {
    throw new HttpsError("invalid-argument", "roomId, roundIndex, roundVersion, and submissionId are required.");
  }

  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privatePlayerRef = privateRef.collection("players").doc(studentId);
  const inviteRef = db.collection(LIVE_CHALLENGE_INVITES).doc(studentId);
  const [roomSnapshot, privateSnapshot, playerSnapshot, inviteSnapshot] = await Promise.all([
    roomRef.get(), privateRef.get(), privatePlayerRef.get(), inviteRef.get(),
  ]);
  if (!roomSnapshot.exists || !privateSnapshot.exists || !playerSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge is no longer available.");
  if (!inviteSnapshot.exists || inviteSnapshot.data()?.roomId !== roomId) throw new HttpsError("permission-denied", "This Live Challenge was not assigned to you.");
  const room = roomSnapshot.data() || {};
  const submittedVersion = requestedVersion ?? Number(room.roundVersion || 0);
  const submittedToken = requestedToken ?? String(room.roundToken || "");
  const privateState = privateSnapshot.data() || {};
  const currentPlayer = playerSnapshot.data() || {};
  const priorReceipt = currentPlayer.submissionReceipts?.[submissionId];
  if (priorReceipt) return { ...priorReceipt, duplicate: true };
  if (room.status !== challenge.LIVE_CHALLENGE_STATUS.RUNNING || Number(room.currentRound) !== submittedRound) {
    throw new HttpsError("failed-precondition", "That Live Challenge round is no longer active.");
  }
  if (Number(room.roundVersion || 0) !== submittedVersion || String(room.roundToken || "") !== submittedToken) {
    throw new HttpsError("failed-precondition", "That submission belongs to a stale round version.");
  }
  const endsAtMs = toDate(room.endsAt || room.roundEndsAt)?.getTime() || 0;
  const startsAtMs = toDate(room.startsAt || room.roundStartedAt)?.getTime() || 0;
  const initialArrival = challenge.normalizeChallengeTimingMode(room.timingMode) === "pace" && !endsAtMs
    ? { accepted: requestArrivedAt >= startsAtMs, inGrace: false }
    : parity.submissionArrivalDecision({ arrivedAtMs: requestArrivedAt, startsAtMs, endsAtMs });
  if (!initialArrival.accepted) throw new HttpsError("deadline-exceeded", "The bounded delivery window for this round has ended.");
  if (!currentPlayer.joined) throw new HttpsError("failed-precondition", "Join the Live Challenge before answering.");
  if (Number(currentPlayer.answeredRound) === submittedRound) throw new HttpsError("already-exists", "You already answered this round.");

  const questionId = privateState.questionIds?.[submittedRound];
  const privateAuthored = privateState.roundQuestions?.[submittedRound] || null;
  const questionSnapshot = !privateAuthored && questionId ? await db.collection("pathQuestionBank").doc(questionId).get() : null;
  if (!privateAuthored && !questionSnapshot?.exists) throw new HttpsError("failed-precondition", "This round's secure question is unavailable.");
  const authored = privateAuthored || questionSnapshot.data() || {};
  const seedKey = `challenge|${roomId}|${submittedRound}|${questionId}`;
  const instantiated = await mathPath.instantiateQuestion(authored, seedKey);
  if (!instantiated.question) throw new HttpsError("failed-precondition", "This round's question could not be regenerated securely.");
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  if (!plan.issuable) throw new HttpsError("failed-precondition", "This round can no longer be securely graded.");
  const grading = await mathPath.gradePathToolResponse(plan.privateGrading, request.data?.responsePayload || {});
  if (grading?.rejected) throw new HttpsError("failed-precondition", grading.reason || "The response could not be graded.");

  let finalPlayer = null;
  let finalScore = null;
  let duplicateReceipt = null;
  await db.runTransaction(async (transaction) => {
    const [latestRoomSnapshot, latestPlayerSnapshot] = await Promise.all([
      transaction.get(roomRef), transaction.get(privatePlayerRef),
    ]);
    if (!latestRoomSnapshot.exists || !latestPlayerSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge ended before the response could be saved.");
    const latestRoom = latestRoomSnapshot.data() || {};
    const player = latestPlayerSnapshot.data() || {};
    if (player.submissionReceipts?.[submissionId]) {
      duplicateReceipt = player.submissionReceipts[submissionId];
      return;
    }
    if (latestRoom.status !== challenge.LIVE_CHALLENGE_STATUS.RUNNING || Number(latestRoom.currentRound) !== submittedRound) {
      throw new HttpsError("failed-precondition", "That Live Challenge round is no longer active.");
    }
    if (Number(latestRoom.roundVersion || 0) !== submittedVersion || String(latestRoom.roundToken || "") !== submittedToken) {
      throw new HttpsError("failed-precondition", "That submission belongs to a stale round version.");
    }
    const latestEndsAtMs = toDate(latestRoom.endsAt || latestRoom.roundEndsAt)?.getTime() || 0;
    const latestStartsAtMs = toDate(latestRoom.startsAt || latestRoom.roundStartedAt)?.getTime() || 0;
    const nowMs = Date.now();
    const arrival = challenge.normalizeChallengeTimingMode(latestRoom.timingMode) === "pace" && !latestEndsAtMs
      ? { accepted: requestArrivedAt >= latestStartsAtMs, inGrace: false }
      : parity.submissionArrivalDecision({ arrivedAtMs: requestArrivedAt, startsAtMs: latestStartsAtMs, endsAtMs: latestEndsAtMs });
    if (!arrival.accepted) throw new HttpsError("deadline-exceeded", "The bounded delivery window for this round has ended.");
    if (!player.joined) throw new HttpsError("failed-precondition", "Join the Live Challenge before answering.");
    if (Number(player.answeredRound) === submittedRound) throw new HttpsError("already-exists", "You already answered this round.");
    if (!player.playerKey) throw new HttpsError("failed-precondition", "Your Live Challenge player record is incomplete.");

    // Which original round this one replays, if any. Held privately so the
    // round list a student can read never reveals which questions the class
    // struggled with before they have answered them.
    const secondChanceOf = privateState?.secondChanceOf?.[String(submittedRound)];
    const isSecondChance = Number.isInteger(Number(secondChanceOf));
    const missedRounds = Array.isArray(player.missedRounds) ? player.missedRounds.map(Number) : [];
    const missedOriginally = isSecondChance && missedRounds.includes(Number(secondChanceOf));

    const activeRoundMs = challenge.normalizeRoundSeconds(
      latestRoom.activeRoundSeconds || latestRoom.roundSeconds,
    ) * 1000;
    const officialElapsedMs = request.data?.autoFinalizedAtRoundEnd === true
      ? activeRoundMs
      : parity.authoritativeElapsed({
      humanElapsedMs: request.data?.timingDegraded ? null : request.data?.humanElapsedMs,
      arrivedAtMs: requestArrivedAt,
      startsAtMs: latestStartsAtMs,
      totalMs: activeRoundMs,
      });
    finalScore = challenge.scoreChallengeRound({
      gradeScore: grading?.score ?? (grading?.isCorrect ? 1 : 0),
      isCorrect: grading?.isCorrect === true,
      remainingMs: latestEndsAtMs ? Math.max(0, latestEndsAtMs - nowMs) : 0,
      totalMs: activeRoundMs,
      elapsedMs: officialElapsedMs,
      previousStreak: player.streak || 0,
      // Tracked explicitly rather than inferred from a zero streak, which is
      // also a player's very first round.
      previousRoundMissed: player.lastAnswerCorrect === false,
      secondChance: isSecondChance,
      missedOriginally,
    });
    const bankedMilestoneSpeed = isSecondChance ? 0 : challenge.milestoneSpeedTotalForRound(
      player.submissionReceipts || {}, submittedRound, submittedVersion,
    );
    if (!isSecondChance && bankedMilestoneSpeed > 0 && finalScore.speedBonus > 0) {
      const adjustedSpeedBonus = Math.max(0, finalScore.speedBonus - bankedMilestoneSpeed);
      finalScore = {
        ...finalScore,
        speedBonus: adjustedSpeedBonus,
        pointsAwarded: finalScore.pointsAwarded - (finalScore.speedBonus - adjustedSpeedBonus),
      };
    }
    const answeredCorrectly = grading?.isCorrect === true;
    const receipt = {
      isCorrect: grading?.isCorrect === true,
      scorePercent: Math.round(Math.max(0, Math.min(1, Number(grading?.score) || 0)) * 100),
      pointsAwarded: finalScore.pointsAwarded,
      basePoints: finalScore.basePoints,
      speedBonus: finalScore.speedBonus,
      speedTier: finalScore.speedTier,
      streakBonus: finalScore.streakBonus,
      comebackBonus: finalScore.comebackBonus,
      recoveryPoints: finalScore.recoveryPoints,
      secondChance: finalScore.secondChance,
      totalScore: 0,
      streak: finalScore.newStreak,
      submissionId,
      roundIndex: submittedRound,
      roundVersion: submittedVersion,
      serverConfirmed: true,
    };
    const submissionReceipts = { ...(player.submissionReceipts || {}), [submissionId]: receipt };
    const reconciledScore = challenge.authoritativeReceiptTotal(submissionReceipts);
    submissionReceipts[submissionId] = { ...receipt, totalScore: reconciledScore };
    finalPlayer = {
      ...player,
      joined: true,
      score: reconciledScore,
      correctCount: Math.max(0, Math.round(Number(player.correctCount) || 0)) + (answeredCorrectly ? 1 : 0),
      roundsAnswered: Math.max(0, Math.round(Number(player.roundsAnswered) || 0)) + 1,
      streak: finalScore.newStreak,
      answeredRound: submittedRound,
      lastAnswerCorrect: answeredCorrectly,
      comebackCount: Math.max(0, Math.round(Number(player.comebackCount) || 0)) + (finalScore.comebackBonus > 0 ? 1 : 0),
      recoveryCount: Math.max(0, Math.round(Number(player.recoveryCount) || 0)) + (finalScore.recoveryPoints > 0 ? 1 : 0),
      bestStreak: Math.max(
        Math.max(0, Math.round(Number(player.bestStreak) || 0)),
        finalScore.newStreak,
      ),
      // A scheduled round that was missed becomes a candidate for replay. A
      // replay itself is never added, so one question cannot be queued twice.
      missedRounds: !answeredCorrectly && !isSecondChance
        ? [...new Set([...missedRounds, submittedRound])].slice(0, 40)
        : missedRounds,
      // Which rounds this student actually answered. Mastery evidence needs
      // "did they answer it, and were they right", and correctCount alone
      // cannot say WHICH standard was right. Recorded in the write that was
      // happening anyway rather than as a second one, because every student in
      // the room writes here at the same moment.
      answeredRounds: [...new Set([
        ...(Array.isArray(player.answeredRounds) ? player.answeredRounds.map(Number) : []),
        submittedRound,
      ])].slice(0, 60),
      submissionReceipts,
      lastSubmissionAudit: {
        roomId, roundIndex: submittedRound, roundVersion: submittedVersion, submissionId,
        capturedElapsedMs: Math.max(0, Number(request.data?.humanElapsedMs) || 0),
        officialElapsedMs,
        timingDegraded: request.data?.timingDegraded === true,
        serverArrivalInGrace: arrival.inGrace,
        connectionQuality: String(request.data?.connectionQuality || "unknown").slice(0, 24),
        speedTier: finalScore.speedTier, pointsAwarded: finalScore.pointsAwarded,
        serverConfirmed: true, duplicate: false,
      },
      updatedAt: FieldValue.serverTimestamp(),
    };
    // NO ROOM-LEVEL TALLY IS WRITTEN HERE ANY MORE. This used to increment
    // roundAnswers and roundMisses on the private state document, which made one
    // document take a write per student per round — a hot spot with a whole
    // class answering at once, and a failure mode of telling a student their
    // correct answer did not count. Both numbers are derivable from the
    // answeredRounds and missedRounds written just above, so they are computed
    // where they are read instead. See deriveRoundTallies.

    const publicPlayerRef = roomRef.collection("players").doc(player.playerKey);
    transaction.set(privatePlayerRef, finalPlayer, { merge: true });
    transaction.set(publicPlayerRef, {
      playerKey: player.playerKey,
      alias: player.alias,
      joined: true,
      score: finalPlayer.score,
      correctCount: finalPlayer.correctCount,
      roundsAnswered: finalPlayer.roundsAnswered,
      streak: finalPlayer.streak,
      answeredRound: submittedRound,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  if (duplicateReceipt) return { ...duplicateReceipt, duplicate: true };

  // Classroom pacing: once 80% of the students who actually joined this round
  // have answered, any longer remaining timer is compressed to five seconds.
  // This happens after the authoritative score write, and failures here never
  // invalidate a student's accepted answer.
  await maybeCompressLiveChallengeRoundAfterThreshold(db, {
    roomRef,
    roundIndex: submittedRound,
    roundVersion: submittedVersion,
  }).catch((error) => logger.error("liveChallenge.roundCompression.failed", {
    roomId,
    roundIndex: submittedRound,
    message: error?.message || String(error),
  }));

  return {
    isCorrect: grading?.isCorrect === true,
    scorePercent: Math.round(Math.max(0, Math.min(1, Number(grading?.score) || 0)) * 100),
    pointsAwarded: finalScore?.pointsAwarded || 0,
    basePoints: finalScore?.basePoints || 0,
    speedBonus: finalScore?.speedBonus || 0,
    speedTier: finalScore?.speedTier || 'expired',
    streakBonus: finalScore?.streakBonus || 0,
    // A bonus a student cannot see is a bonus that changes nothing about
    // whether they try the next one.
    comebackBonus: finalScore?.comebackBonus || 0,
    recoveryPoints: finalScore?.recoveryPoints || 0,
    secondChance: finalScore?.secondChance === true,
    totalScore: finalPlayer?.score || 0,
    streak: finalPlayer?.streak || 0,
    rank: null,
    submissionId,
    serverConfirmed: true,
    duplicate: false,
  };
});

// Phase 5D: secure My Math Path production seam
// ---------------------------------------------------------------------------

function publicPathSession(session = {}) {
  const { currentQuestion, ...safe } = session;
  return {
    ...safe,
    hasOpenQuestion: Boolean(currentQuestion),
  };
}

function pathSessionRequiredQuestions(sessionKind, requested) {
  if (sessionKind === "retentionProbe") return 2;
  return Math.max(2, Math.min(10, Number(requested) || 5));
}

const PATH_ASSESSMENT_FRAMEWORKS = new Set(["digitalSAT", "act", "tsia2", "asvab"]);

function normalizePathAssessmentFramework(value) {
  const framework = String(value || "").trim();
  return PATH_ASSESSMENT_FRAMEWORKS.has(framework) ? framework : null;
}

function pathQuestionMatchesFramework(question = {}, assessmentFramework = null) {
  const authoredFramework = String(question?.assessmentContext?.framework || "course");
  if (assessmentFramework) {
    return authoredFramework === assessmentFramework && question?.assessmentContext?.examStyle !== false;
  }
  return authoredFramework === "course";
}

const CCMR_PROGRESS_SUBCOLLECTION = "ccmrProgress";

function ccmrProgressRef(db, studentId, alignmentKey, framework) {
  return db.collection("grades").doc(studentId).collection(CCMR_PROGRESS_SUBCOLLECTION)
    .doc(mathPath.opaqueId("ccmr-progress", alignmentKey, framework));
}

function resolveServerCcmrChallengeTier(progress = {}) {
  if (Number(progress.tier3SessionsPassed || 0) > 0) return 3;
  if (Number(progress.tier2SessionsPassed || 0) > 0) return 3;
  if (Number(progress.tier1SessionsPassed || 0) > 0) return 2;
  const attempts = Number(progress.directItemsAttempted || 0);
  const correct = Number(progress.directItemsCorrect || 0);
  if (attempts >= 5 && attempts > 0 && correct / attempts >= 0.8) return 2;
  return 1;
}

async function loadCcmrProgress(db, studentId, alignmentKey, framework) {
  const ref = ccmrProgressRef(db, studentId, alignmentKey, framework);
  const snapshot = await ref.get();
  if (snapshot.exists) return snapshot.data() || {};

  // CCMR Fidelity V2 shipped after students already had direct assessment
  // evidence. Bootstrap the private progression record from immutable evidence
  // so a student who already earned 5/5 SAT items does not get sent back to
  // beginner SAT practice just because the new progress document is absent.
  const evidenceSnapshot = await db.collection("grades").doc(studentId).collection("evidenceEvents")
    .where("masteryEvidenceKeys", "array-contains", alignmentKey)
    .limit(150)
    .get();
  let directItemsAttempted = 0;
  let directItemsCorrect = 0;
  const tierSessionsPassed = { 1: 0, 2: 0, 3: 0 };
  const tierSessionsCompleted = { 1: 0, 2: 0, 3: 0 };
  evidenceSnapshot.docs.forEach((doc) => {
    const event = doc.data() || {};
    if (event?.source?.kind !== "myMathPath") return;
    if (normalizePathAssessmentFramework(event?.source?.assessmentFramework) !== framework) return;
    if (event?.performance?.status && event.performance.status !== "finalized") return;
    directItemsAttempted += 1;
    if (event?.performance?.isCorrect === true || Number(event?.performance?.score || 0) >= 1) directItemsCorrect += 1;
    const tier = Math.max(1, Math.min(3, Number(event?.source?.ccmrChallengeTier || event?.questionSnapshot?.ccmrChallengeTier || 1)));
    if (event?.source?.ccmrSessionCompleted === true) tierSessionsCompleted[tier] += 1;
    if (event?.source?.ccmrSessionPassed === true) tierSessionsPassed[tier] += 1;
  });
  const progress = {
    schemaVersion: 2,
    studentId,
    alignmentKey,
    framework,
    directItemsAttempted,
    directItemsCorrect,
    tier1SessionsCompleted: tierSessionsCompleted[1],
    tier1SessionsPassed: tierSessionsPassed[1],
    tier2SessionsCompleted: tierSessionsCompleted[2],
    tier2SessionsPassed: tierSessionsPassed[2],
    tier3SessionsCompleted: tierSessionsCompleted[3],
    tier3SessionsPassed: tierSessionsPassed[3],
    bootstrappedFromEvidence: true,
    updatedAt: Date.now(),
  };
  if (directItemsAttempted > 0) await ref.set(progress, { merge: true });
  return progress;
}

function ccmrSessionPasses(summary = {}, requiredQuestions = 5) {
  const total = Math.max(1, Number(summary.completedQuestions || requiredQuestions || 1));
  const accuracy = Number(summary.correctQuestions || 0) / total;
  const independentRate = Number(summary.independentSuccesses || 0) / total;
  return accuracy >= 0.8 && independentRate >= 0.6;
}

function courseChallengeEarned(profile = {}) {
  const status = String(
    profile?.mastery?.status
    || profile?.performance?.key
    || profile?.status
    || "",
  ).trim().toLowerCase();
  const estimate = Number(profile?.mastery?.estimate ?? profile?.score ?? 0);
  return ["mastered", "masters"].includes(status)
    || (Number.isFinite(estimate) && estimate >= 90);
}

// Course Path progress is separate from mastery.
//
// "I finished this Path" means a student completed a full server-owned practice
// session. "Mastered" is a stronger evidence claim that also requires breadth,
// independent success and DOK 3+ evidence. The UI needs BOTH facts or a student
// can finish five questions and return to a card that looks untouched.
//
// This helper reads only session summaries/targets and never question payloads.
const COURSE_PATH_MAX_LEVEL = 3;

async function loadCoursePathPassProgress(db, studentId, { limit = 400 } = {}) {
  const snapshot = await db.collection("pathSessions")
    .where("studentId", "==", studentId)
    .limit(Math.max(20, Math.min(800, Number(limit) || 400)))
    .get();

  const byTeksCode = {};
  snapshot.docs.forEach((sessionDoc) => {
    const session = sessionDoc.data() || {};
    if (session.status !== "completed") return;
    if (session.sessionKind === "retentionProbe") return;
    if (session.assessmentFramework) return;
    if (session.coursePracticeIntent === "challenge") return;
    // Weekly Path is a separate commitment. Its sessions still contribute
    // mastery evidence and weekly completion, but they may be frozen at
    // Current learning, Retention, Challenge, or CCMR-transfer rigor. Counting
    // them as numbered Foundation/Deeper/Mastery passes would let low-rigor
    // weekly work advance the open-practice level by session count alone.
    if (session.weeklySlotKey) return;

    const alignmentKey = mathPath.canonicalAlignmentKey(session.target?.alignmentKey);
    const code = mathPath.displayAlignmentKey(alignmentKey);
    if (!alignmentKey || !code) return;

    const current = byTeksCode[code] || {
      teksCode: code,
      passesCompleted: 0,
      lastCompletedAt: 0,
      lastSummary: null,
      highestRecordedLevel: 0,
    };
    current.passesCompleted += 1;
    const completedAt = Number(session.completedAt || session.updatedAt || 0);
    if (completedAt >= Number(current.lastCompletedAt || 0)) {
      current.lastCompletedAt = completedAt;
      current.lastSummary = {
        completedQuestions: Number(session.summary?.completedQuestions || 0),
        correctQuestions: Number(session.summary?.correctQuestions || 0),
        independentSuccesses: Number(session.summary?.independentSuccesses || 0),
      };
    }
    current.highestRecordedLevel = Math.max(
      Number(current.highestRecordedLevel || 0),
      Number(session.coursePassLevel || 1),
    );
    byTeksCode[code] = current;
  });

  Object.values(byTeksCode).forEach((entry) => {
    entry.nextLevel = Math.min(COURSE_PATH_MAX_LEVEL, Number(entry.passesCompleted || 0) + 1);
    entry.advancedLoop = Number(entry.passesCompleted || 0) >= COURSE_PATH_MAX_LEVEL;
  });

  return {
    byTeksCode,
    skillsWithCompletedPasses: Object.keys(byTeksCode).length,
    totalCompletedPasses: Object.values(byTeksCode).reduce((sum, entry) => sum + Number(entry.passesCompleted || 0), 0),
  };
}

/** Student-safe completion/pass summary for the Path cards. */
exports.getMyMathPathSkillProgress = onCall((request) => withPathCallableDiagnostics("getMyMathPathSkillProgress", async () => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const progress = await loadCoursePathPassProgress(db, studentId);
  return { success: true, ...progress };
}));

const WEEKLY_PATH_GOAL_SNAPSHOTS = "weeklyPathGoalSnapshots";

function sanitizeWeeklyPathGoalProposal(goal = {}, { studentId, classRecord }) {
  const weekKey = String(goal?.weekKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey) || !Number.isFinite(Date.parse(`${weekKey}T00:00:00Z`))) {
    throw new HttpsError("invalid-argument", "A valid weekly Path weekKey is required.");
  }
  const classId = String(classRecord?.classId || "").trim();
  const courseId = String(classRecord?.course || "").trim();
  if (!classId || !courseId) throw new HttpsError("failed-precondition", "Your MathMaster class is not fully configured yet.");
  if (goal?.courseId && String(goal.courseId) !== courseId) {
    throw new HttpsError("failed-precondition", "This weekly Path proposal belongs to a different course.");
  }
  const requested = Math.max(3, Math.min(6, Number(goal?.goalSessions) || 4));
  const proposed = Array.isArray(goal?.sessions) ? goal.sessions.slice(0, requested) : [];
  if (!proposed.length) throw new HttpsError("failed-precondition", "MathMaster could not build any weekly Path sessions for this week.");

  const sessions = proposed.map((session, index) => {
    const slot = index + 1;
    const displayCode = mathPath.displayAlignmentKey(mathPath.canonicalAlignmentKey(session?.teksCode || session?.skillId));
    if (!displayCode) throw new HttpsError("invalid-argument", `Weekly Path slot ${slot} has no valid standard.`);
    const context = normalizePathAssessmentFramework(session?.context) || "course";
    const dok = Math.max(1, Math.min(4, Math.round(Number(session?.dok) || 2)));
    const difficultyBand = Math.max(1, Math.min(5, Math.round(Number(session?.difficultyBand) || 3)));
    const suppliedKey = String(session?.weeklySlotKey || "").trim();
    const weeklySlotKey = suppliedKey || [
      slot,
      String(session?.skillId || ""),
      displayCode,
      String(session?.purpose || "practice"),
      context,
      dok,
      difficultyBand,
    ].join("|");
    if (weeklySlotKey.length > 300) throw new HttpsError("invalid-argument", `Weekly Path slot ${slot} key is too long.`);
    return {
      slot,
      weeklySlotKey,
      skillId: String(session?.skillId || "").slice(0, 180) || null,
      teksCode: displayCode,
      purpose: String(session?.purpose || "practice").slice(0, 60),
      context,
      dok,
      difficultyBand,
      studentLabel: session?.studentLabel ? String(session.studentLabel).slice(0, 180) : null,
      purposeLabel: session?.purposeLabel ? String(session.purposeLabel).slice(0, 120) : null,
      studentExplanation: session?.studentExplanation ? String(session.studentExplanation).slice(0, 400) : null,
      targetReason: session?.targetReason ? String(session.targetReason).slice(0, 180) : null,
      status: "notStarted",
    };
  });

  return {
    schemaVersion: 1,
    studentId,
    classId,
    courseId,
    weekKey,
    dueAt: Number(goal?.dueAt) || null,
    goalSessions: requested,
    sessions,
    ccmr: goal?.ccmr && typeof goal.ccmr === "object" ? {
      expectation: String(goal.ccmr.expectation || "none").slice(0, 40),
      framework: String(goal.ccmr.framework || "auto").slice(0, 40),
      transferCount: Math.max(0, Number(goal.ccmr.transferCount) || 0),
      satisfied: goal.ccmr.satisfied !== false,
      shortfallReason: goal.ccmr.shortfallReason ? String(goal.ccmr.shortfallReason).slice(0, 160) : null,
    } : null,
  };
}

/** Freeze the student's proposed autonomous week exactly once. */
exports.resolveWeeklyPathGoalSnapshot = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const studentSnapshot = await db.collection("grades").doc(studentId).get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "Your MathMaster student record is unavailable.");
  const classRecord = await loadStudentClass(db, studentSnapshot.data());
  if (!classRecord) throw new HttpsError("failed-precondition", "Your MathMaster class has not been assigned yet.");
  const proposed = sanitizeWeeklyPathGoalProposal(request.data?.goal || {}, { studentId, classRecord });
  const ref = db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${proposed.weekKey}`);
  const assigned = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return existing.data();
    const createdAt = Date.now();
    const next = { ...proposed, createdAt, updatedAt: createdAt, assignmentState: "assigned" };
    transaction.set(ref, next);
    return next;
  });
  return { success: true, goal: assigned };
});

/**
 * Read this student's already-frozen weekly commitment without creating or
 * changing it. Home uses this to decide whether "caught up" is actually true.
 * Returning only the caller's own snapshot keeps the same student isolation as
 * the session runtime and exposes no answer payloads.
 */
exports.getStudentWeeklyPathGoalSnapshot = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const weekKey = String(request.data?.weekKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey) || !Number.isFinite(Date.parse(`${weekKey}T00:00:00Z`))) {
    throw new HttpsError("invalid-argument", "A valid weekly Path weekKey is required.");
  }
  const db = getFirestore();
  const snapshot = await db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${weekKey}`).get();
  return { success: true, goal: snapshot.exists ? snapshot.data() : null };
});

/**
 * Teacher-only weekly Path progress for one real class.
 *
 * `pathSessions` is intentionally server-only. The teacher UI needs completion
 * facts for weekly goals, but it must never receive answer keys or the private
 * current-question payload. This callable therefore returns only completed
 * session IDs, timestamps, target TEKS and aggregate accuracy.
 */
exports.getTeacherWeeklyPathCompletions = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const classId = String(request.data?.classId || "").trim();
  if (!classId) throw new HttpsError("invalid-argument", "classId is required.");

  const classRef = db.collection(CLASS_COLLECTION).doc(classId);
  const classSnapshot = await classRef.get();
  if (!classSnapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
  const classRecord = { classId, ...classSnapshot.data() };
  const email = callerEmail(request);
  const teacherOfRecord = String(classRecord.teacherOfRecord || "").trim().toLowerCase();
  const isRoot = Boolean(email && email === authLib.ROOT_ADMIN_EMAIL);
  if (!isRoot && (!email || teacherOfRecord !== email)) {
    throw new HttpsError("permission-denied", "Only the teacher of record for this class can view its Weekly Path progress.");
  }

  const weekKey = String(request.data?.weekKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new HttpsError("invalid-argument", "weekKey must be YYYY-MM-DD.");
  }
  const weekStart = Date.parse(`${weekKey}T00:00:00Z`);
  if (!Number.isFinite(weekStart)) throw new HttpsError("invalid-argument", "weekKey is not a valid date.");
  const weekEnd = weekStart + (7 * 24 * 60 * 60 * 1000);

  const roster = await db.collection("grades").where("classId", "==", classId).get();
  const studentIds = new Set(roster.docs
    .filter((studentDoc) => studentDoc.data()?.status !== "disabled")
    .map((studentDoc) => studentDoc.id));
  const byStudentId = Object.fromEntries([...studentIds].map((studentId) => [studentId, []]));
  const goalsByStudentId = {};
  if (!studentIds.size) return { classId, weekKey, byStudentId, goalsByStudentId };

  // Snapshot IDs are deterministic, so this needs no collection scan or new
  // composite index. The teacher sees the same frozen commitment the student
  // is graded against, not a plan recomputed from today's newer evidence.
  const goalSnapshots = await Promise.all([...studentIds].map(async (studentId) => {
    const snapshot = await db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${weekKey}`).get();
    return [studentId, snapshot.exists ? snapshot.data() : null];
  }));
  goalSnapshots.forEach(([studentId, goal]) => { if (goal) goalsByStudentId[studentId] = goal; });

  // One indexed time-range query for the week, then a membership filter. This
  // avoids one Firestore query per student and scales with weekly Path activity
  // rather than roster size.
  //
  // It is READ IN PAGES, and that is the point. A single `.limit(5000)` over a
  // district-wide week silently discards everything past the cap — and it
  // discards it BEFORE the class filter runs, so the students who lose their
  // completions are chosen by document order rather than by anything a teacher
  // could see. The failure mode is a weekly Path grade that is quietly too low,
  // which is exactly the kind of wrong number nobody reports as a bug.
  //
  // Cursoring on `completedAt` needs no composite index beyond the single-field
  // index this range filter already uses, so this stays deployable as-is.
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 40; // 40k completed sessions in one week; far past any real district.
  const sessionDocs = [];
  let cursor = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = db.collection("pathSessions")
      .where("completedAt", ">=", weekStart)
      .where("completedAt", "<", weekEnd)
      .orderBy("completedAt")
      .limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page$ = await query.get();
    if (page$.empty) break;
    sessionDocs.push(...page$.docs);
    cursor = page$.docs[page$.docs.length - 1];
    if (page$.size < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  sessionDocs.forEach((sessionDoc) => {
    const session = sessionDoc.data() || {};
    const studentId = String(session.studentId || "");
    if (!studentIds.has(studentId) || session.status !== "completed") return;
    const completedQuestions = Number(session.summary?.completedQuestions || 0);
    const correctQuestions = Number(session.summary?.correctQuestions || 0);
    const alignmentKey = String(session.target?.alignmentKey || "");
    byStudentId[studentId].push({
      status: "completed",
      sessionId: sessionDoc.id,
      completedAt: Number(session.completedAt || session.updatedAt || 0),
      teksCode: alignmentKey ? mathPath.displayAlignmentKey(alignmentKey) : null,
      accuracy: completedQuestions > 0 ? Math.max(0, Math.min(1, correctQuestions / completedQuestions)) : null,
      sessionKind: session.sessionKind || "practice",
      assessmentFramework: session.assessmentFramework || null,
      weekKey: session.weekKey || null,
      weeklySlotKey: session.weeklySlotKey || null,
      weeklySlot: session.weeklySlot || null,
    });
  });

  Object.values(byStudentId).forEach((rows) => rows.sort((a, b) => a.completedAt - b.completedAt));
  // `truncated` is returned rather than swallowed: if it is ever true the grades
  // on this screen are incomplete, and the screen has to be able to say so
  // instead of presenting a short count as fact.
  return { classId, weekKey, byStudentId, goalsByStudentId, truncated };
});

// --- Weekly Path in Google Classroom ---------------------------------------
//
// One coursework item per class per week, and an end-of-week job that grades it
// automatically. Automatic publishing removes the human who used to look at each
// number before it reached a parent, so two things carry that weight instead:
// the decision function in weeklyPathClassroom.js, and the per-class switch
// below, which DEFAULTS OFF. Deploying this must never retroactively push grades
// for a class nobody has reviewed.
const WEEKLY_PATH_CLASSROOM_CONFIG = "weeklyPathClassroomConfig";
const WEEKLY_PATH_CLASSROOM_SYNCS = "weeklyPathClassroomSyncs";
const WEEKLY_PATH_DEFAULT_MAX_POINTS = 100;

async function requireClassTeacher(request, classId) {
  await requireTeacher(request);
  const db = getFirestore();
  const snapshot = await db.collection(CLASS_COLLECTION).doc(String(classId)).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
  const record = { classId: String(classId), ...(snapshot.data() || {}) };
  const email = callerEmail(request);
  const teacherOfRecord = String(record.teacherOfRecord || "").trim().toLowerCase();
  if (!authLib.isRootAdminEmail(email) && (!email || teacherOfRecord !== String(email).toLowerCase())) {
    throw new HttpsError("permission-denied", "Only the teacher of record for this class can change this.");
  }
  return record;
}

exports.getWeeklyPathClassroomSync = onCall(async (request) => {
  const classId = String(request.data?.classId || "").trim();
  if (!classId) throw new HttpsError("invalid-argument", "classId is required.");
  await requireClassTeacher(request, classId);
  const snapshot = await getFirestore().collection(WEEKLY_PATH_CLASSROOM_CONFIG).doc(classId).get();
  const config = snapshot.exists ? snapshot.data() : null;
  return {
    classId,
    enabled: config?.enabled === true,
    maxPoints: Number(config?.maxPoints) || WEEKLY_PATH_DEFAULT_MAX_POINTS,
    updatedAt: serializableDate(config?.updatedAt),
    updatedByEmail: config?.updatedByEmail || null,
  };
});

exports.setWeeklyPathClassroomSync = onCall(async (request) => {
  const classId = String(request.data?.classId || "").trim();
  if (!classId) throw new HttpsError("invalid-argument", "classId is required.");
  await requireClassTeacher(request, classId);

  const enabled = request.data?.enabled === true;
  const requestedPoints = Number(request.data?.maxPoints);
  const maxPoints = Number.isFinite(requestedPoints)
    ? Math.max(1, Math.min(1000, Math.round(requestedPoints)))
    : WEEKLY_PATH_DEFAULT_MAX_POINTS;

  await getFirestore().collection(WEEKLY_PATH_CLASSROOM_CONFIG).doc(classId).set({
    classId,
    enabled,
    maxPoints,
    updatedByUid: request.auth?.uid || null,
    updatedByEmail: callerEmail(request) || null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info("Weekly Path Classroom publishing setting changed", { classId, enabled, maxPoints });
  return { classId, enabled, maxPoints };
});

/**
 * Everything one class-week needs, read once.
 *
 * `truncated` is carried out rather than swallowed: a partial read produces
 * grades that are quietly too low, and the sync refuses to publish on it.
 */
async function loadWeeklyPathClassWeek(db, { classId, weekKey }) {
  const weekStart = Date.parse(`${weekKey}T00:00:00Z`);
  if (!Number.isFinite(weekStart)) throw new HttpsError("invalid-argument", "weekKey must be YYYY-MM-DD.");
  // One extra day past the UTC week boundary. The week closes at midnight in
  // the school's own timezone, which is early Monday in UTC, so a window that
  // stopped at the UTC boundary would silently drop every session finished on
  // Sunday evening — the busiest hours of a Sunday-night deadline. Sessions
  // pulled in from the next week cannot be miscounted: matching is by frozen
  // slot key and weekKey, not by timestamp.
  const weekEnd = weekStart + (8 * 24 * 60 * 60 * 1000);

  const roster = await db.collection("grades").where("classId", "==", classId).get();
  const students = roster.docs
    .filter((doc) => doc.data()?.status !== "disabled")
    .map((doc) => ({ studentId: doc.id, googleUserId: String(doc.data()?.googleUserId || "").trim() || null }));
  if (!students.length) return { students: [], goalsByStudentId: {}, completionsByStudentId: {}, truncated: false };

  const goalsByStudentId = {};
  const goalDocs = await Promise.all(students.map(async ({ studentId }) => {
    const snapshot = await db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${weekKey}`).get();
    return [studentId, snapshot.exists ? snapshot.data() : null];
  }));
  goalDocs.forEach(([studentId, goal]) => { if (goal) goalsByStudentId[studentId] = goal; });

  const ids = new Set(students.map((entry) => entry.studentId));
  const completionsByStudentId = Object.fromEntries([...ids].map((id) => [id, []]));
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 40;
  let cursor = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = db.collection("pathSessions")
      .where("completedAt", ">=", weekStart)
      .where("completedAt", "<", weekEnd)
      .orderBy("completedAt")
      .limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    // eslint-disable-next-line no-await-in-loop
    const pageDocs = await query.get();
    if (pageDocs.empty) break;
    pageDocs.docs.forEach((sessionDoc) => {
      const session = sessionDoc.data() || {};
      const studentId = String(session.studentId || "");
      if (!ids.has(studentId) || session.status !== "completed") return;
      const completedQuestions = Number(session.summary?.completedQuestions || 0);
      const correctQuestions = Number(session.summary?.correctQuestions || 0);
      completionsByStudentId[studentId].push({
        status: "completed",
        completedAt: Number(session.completedAt || session.updatedAt || 0),
        teksCode: session.target?.alignmentKey
          ? mathPath.displayAlignmentKey(String(session.target.alignmentKey))
          : null,
        accuracy: completedQuestions > 0
          ? Math.max(0, Math.min(1, correctQuestions / completedQuestions))
          : null,
        assessmentFramework: session.assessmentFramework || null,
        weekKey: session.weekKey || null,
        weeklySlotKey: session.weeklySlotKey || null,
      });
    });
    cursor = pageDocs.docs[pageDocs.docs.length - 1];
    if (pageDocs.size < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  return { students, goalsByStudentId, completionsByStudentId, truncated };
}

/**
 * Run one class-week end to end.
 *
 * Shared by the scheduled job and the teacher's manual "run now", so the thing
 * a teacher previews is literally the thing the schedule will do.
 */
async function runWeeklyPathClassroomSync({ classId, weekKey, dryRun = false, now = Date.now() }) {
  const db = getFirestore();
  const configSnapshot = await db.collection(WEEKLY_PATH_CLASSROOM_CONFIG).doc(classId).get();
  const config = configSnapshot.exists ? configSnapshot.data() : null;
  const enabled = config?.enabled === true;
  const maxPoints = Number(config?.maxPoints) || WEEKLY_PATH_DEFAULT_MAX_POINTS;

  const mappings = await db.collection("classroomCourseMappings").where("classId", "==", classId).limit(1).get();
  const mapping = mappings.empty ? null : mappings.docs[0].data();
  const courseId = String(mapping?.courseId || "").trim();
  const teacherUid = String(mapping?.teacherUid || "").trim();
  if (!courseId || !teacherUid) {
    return { ok: false, classId, weekKey, reason: "class_is_not_linked_to_a_google_classroom_course", results: [] };
  }

  const syncId = `${classId}__${weekKey}`;
  const priorSnapshot = await db.collection(WEEKLY_PATH_CLASSROOM_SYNCS).doc(syncId).get();
  const publishedByStudentId = priorSnapshot.exists ? (priorSnapshot.data()?.publishedByStudentId || {}) : {};

  const data = await loadWeeklyPathClassWeek(db, { classId, weekKey });
  const classroom = await classroomLib.getClassroomClient(teacherUid);
  const { gradeWeeklyGoal } = await import("./shared/weeklyPathGrade.mjs");

  const report = await weeklyPathSync.syncWeeklyPathClassWeek({
    classId,
    weekKey,
    weekLabel: weekKey,
    courseId,
    enabled,
    maxPoints,
    launchUrl: readStudentAppBaseUrl(),
    students: data.students,
    goalsByStudentId: data.goalsByStudentId,
    completionsByStudentId: data.completionsByStudentId,
    publishedByStudentId,
    truncated: data.truncated,
    now,
    dryRun,
    gradeWeeklyGoal,
    logger,
    findCourseWork: (course, marker) => classroomLib.findCourseWorkByPublicationMarker(classroom, course, marker),
    createCourseWork: (course, work) => classroomLib.createCourseWork(classroom, {
      courseId: course,
      title: work.title,
      description: work.description,
      launchUrl: readStudentAppBaseUrl(),
      maxPoints: work.maxPoints,
      materials: [],
    }),
    findSubmission: (args) => classroomLib.findSubmissionForStudent(classroom, args),
    patchGrade: (args) => classroomLib.patchGrade(classroom, args),
    returnSubmission: (args) => classroomLib.returnSubmission(classroom, args),
  });

  if (!dryRun && report.ok) {
    const nextPublished = { ...publishedByStudentId };
    report.results.filter((entry) => entry.published).forEach((entry) => {
      nextPublished[entry.studentId] = { points: entry.points, score: entry.score, at: Date.now() };
    });
    await db.collection(WEEKLY_PATH_CLASSROOM_SYNCS).doc(syncId).set({
      classId,
      weekKey,
      courseId,
      courseWorkId: report.courseWorkId || null,
      publishedByStudentId: nextPublished,
      lastRunAt: FieldValue.serverTimestamp(),
      lastPublishedCount: report.published,
      lastSkippedCount: report.skipped,
    }, { merge: true });
  }

  return report;
}

exports.runWeeklyPathClassroomSyncNow = onCall({
  secrets: GOOGLE_API_SECRETS,
  timeoutSeconds: 300,
  memory: "512MiB",
}, async (request) => {
  const classId = String(request.data?.classId || "").trim();
  if (!classId) throw new HttpsError("invalid-argument", "classId is required.");
  await requireClassTeacher(request, classId);
  const weekKey = String(request.data?.weekKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new HttpsError("invalid-argument", "weekKey must be YYYY-MM-DD.");
  }
  return runWeeklyPathClassroomSync({
    classId,
    weekKey,
    dryRun: request.data?.dryRun === true,
  });
});

/**
 * Monday morning, after the week closes at midnight Sunday night.
 *
 * Deliberately not Sunday evening: a student finishing at 11pm on the due date
 * should have that count, and a job that runs before the week is really over
 * publishes a grade the student could still have changed. Monday morning also
 * means a teacher sees the week's grades before first period.
 */
exports.publishWeeklyPathGrades = onSchedule({
  schedule: "0 7 * * 1",
  timeZone: "America/Chicago",
  secrets: GOOGLE_API_SECRETS,
  timeoutSeconds: 540,
  memory: "512MiB",
  invoker: "private",
}, async () => {
  const db = getFirestore();
  const enabledClasses = await db.collection(WEEKLY_PATH_CLASSROOM_CONFIG).where("enabled", "==", true).get();
  if (enabledClasses.empty) {
    logger.info("Weekly Path grade publishing: no classes have it enabled");
    return;
  }

  // The week that just ended, not the one starting now. Derived with the same
  // weekKeyFor the student's week was built with — a second definition here
  // would let the job grade a week nobody was ever assigned.
  const now = Date.now();
  const { weekKeyFor } = await import("./shared/weeklyPathGrade.mjs");
  const weekKey = weekKeyFor(now - 3 * 24 * 60 * 60 * 1000);
  logger.info("Weekly Path grade publishing starting", { weekKey, classes: enabledClasses.size });

  for (const classDoc of enabledClasses.docs) {
    const classId = classDoc.id;
    try {
      // eslint-disable-next-line no-await-in-loop
      const report = await runWeeklyPathClassroomSync({ classId, weekKey, now });
      logger.info("Weekly Path grades published", {
        classId, weekKey, ok: report.ok, published: report.published || 0, skipped: report.skipped || 0,
        reason: report.reason || null,
      });
    } catch (error) {
      // One broken class must not stop the rest from being graded.
      logger.error("Weekly Path grade publishing failed for one class", {
        classId, weekKey, message: error?.message || String(error),
      });
    }
  }
});

/**
 * One teacher can temporarily lift ONE student's current TEKS into the front of
 * Recommended for You without changing the whole class.
 *
 * This is intentionally a recommendation, not a force-start and not a mastery
 * edit. The normal Path prerequisite/coverage gates still decide whether the
 * skill can actually be launched. Private concern notes stay in
 * studentSupportEvents; the student-readable intervention doc contains only the
 * instructional action.
 */
exports.setStudentPathIntervention = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  const studentId = String(request.data?.studentId || "").trim();
  if (!studentId) throw new HttpsError("invalid-argument", "studentId is required.");

  const db = getFirestore();
  const studentRef = db.collection("grades").doc(studentId);
  const studentSnapshot = await studentRef.get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "That student is not on the MathMaster roster.");
  const studentData = studentSnapshot.data() || {};
  const assignedTeacherEmail = String(studentData.assignedTeacherEmail || "").trim().toLowerCase();
  const isRoot = authLib.isRootAdminEmail(teacherEmail);
  if (!isRoot && (!teacherEmail || assignedTeacherEmail !== teacherEmail)) {
    throw new HttpsError("permission-denied", "Only the student's teacher of record can change this personal Path recommendation.");
  }

  const interventionRef = db.collection("studentPathInterventions").doc(studentId);
  const clear = request.data?.clear === true;
  if (clear) {
    await interventionRef.delete();
    await db.collection("studentPathInterventionAudit").add({
      teacherUid,
      teacherEmail,
      studentId,
      classId: studentData.classId || null,
      action: "clear",
      createdAt: FieldValue.serverTimestamp(),
    });
    return { success: true, cleared: true };
  }

  const displayCode = mathPath.displayAlignmentKey(request.data?.teksCode);
  const canonicalKey = mathPath.canonicalAlignmentKey(displayCode);
  if (!canonicalKey) throw new HttpsError("invalid-argument", "Choose a valid TEKS before recommending Path practice.");

  const graph = await pathRouting.skillGraph();
  const skillId = graph.teksSkillId(displayCode);
  const skill = graph.resolveSkillAnywhere(skillId);
  if (!skill) throw new HttpsError("invalid-argument", "That TEKS is not a loaded MathMaster Path skill.");

  const studentClass = await loadStudentClass(db, studentData);
  const studentCourseId = String(studentClass?.course || "").trim();
  if (studentCourseId && skill.courseId !== studentCourseId) {
    throw new HttpsError(
      "failed-precondition",
      "Live Path recommendations must stay on the student's current course TEKS. Use Weekly Path/Path controls for a broader prerequisite intervention.",
    );
  }

  const launchable = await livePathSkillIsLaunchable(db, canonicalKey);
  if (!launchable) {
    throw new HttpsError(
      "failed-precondition",
      `MathMaster does not have enough published secure Path content for ${displayCode} yet.`,
      { reason: "no-path-coverage" },
    );
  }

  const durationHours = Math.max(1, Math.min(168, Number(request.data?.durationHours) || 48));
  const now = Date.now();
  const intervention = {
    studentId,
    classId: studentClass?.classId || studentData.classId || null,
    classPeriod: studentClass?.period || studentData.classPeriod || null,
    skillId,
    teksCode: displayCode,
    action: "recommend",
    source: "teacher-live",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + durationHours * 60 * 60 * 1000,
  };

  await interventionRef.set(intervention);
  await db.collection("studentPathInterventionAudit").add({
    teacherUid,
    teacherEmail,
    studentId,
    classId: intervention.classId,
    skillId,
    teksCode: displayCode,
    action: "recommend",
    expiresAt: intervention.expiresAt,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { success: true, intervention };
});

/** Start or resume one server-owned learning-path session for a TEKS target. */
exports.startMyMathPathSession = onCall((request) => withPathCallableDiagnostics("startMyMathPathSession", async () => {
  const { studentId } = requireStudent(request);
  let targetAlignmentKey = mathPath.canonicalAlignmentKey(request.data?.targetAlignmentKey);
  if (!targetAlignmentKey) throw new HttpsError("invalid-argument", "targetAlignmentKey is required.");
  const sessionKind = request.data?.sessionKind === "retentionProbe" ? "retentionProbe" : "practice";
  let requiredQuestions = pathSessionRequiredQuestions(sessionKind, request.data?.requiredQuestions);
  let assessmentFramework = normalizePathAssessmentFramework(request.data?.assessmentFramework);
  const requestedCoursePracticeIntent = String(request.data?.coursePracticeIntent || "").trim() === "challenge"
    ? "challenge"
    : null;
  const db = getFirestore();

  const studentSnapshot = await db.collection("grades").doc(studentId).get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "Your MathMaster student record is unavailable.");
  const studentData = studentSnapshot.data() || {};
  const [studentClass, legacyCourseSettings] = await Promise.all([
    loadStudentClass(db, studentData),
    db.collection("settings").doc("courseProfiles").get(),
  ]);
  const legacyCourse = legacyCourseSettings.data()?.profiles?.[studentData.classPeriod] || {};
  const courseId = studentClass?.course || legacyCourse.course || coverageCourseIdFor(targetAlignmentKey);
  const courseLevel = studentClass?.courseLevel || legacyCourse.courseLevel || "standard";
  let ccmrChallengeTier = 1;
  let ccmrProgress = null;
  if (assessmentFramework) {
    ccmrProgress = await loadCcmrProgress(db, studentId, targetAlignmentKey, assessmentFramework);
    ccmrChallengeTier = resolveServerCcmrChallengeTier(ccmrProgress);
    // Once direct practice has been demonstrated, a repeat visit becomes a
    // short harder set instead of another five questions at the same level.
    if (ccmrChallengeTier >= 2 && sessionKind !== "retentionProbe") requiredQuestions = 3;
  }

  // Weekly launches are resolved against the frozen server commitment. The
  // browser may choose which assigned row the student clicks, but it cannot
  // turn that row into another TEKS, framework, DOK or difficulty.
  const requestedWeekKey = String(request.data?.weekKey || "").trim() || null;
  const requestedWeeklySlotKey = String(request.data?.weeklySlotKey || "").trim() || null;
  let weeklySlot = null;
  if (requestedWeeklySlotKey || requestedWeekKey) {
    if (!requestedWeeklySlotKey || !requestedWeekKey || !/^\d{4}-\d{2}-\d{2}$/.test(requestedWeekKey)) {
      throw new HttpsError("invalid-argument", "weekKey and weeklySlotKey are both required for an assigned weekly session.");
    }
    const snapshot = await db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${requestedWeekKey}`).get();
    if (!snapshot.exists) throw new HttpsError("failed-precondition", "This weekly commitment has not been assigned yet. Return to My Math Path and reload the week.");
    const weeklyGoal = snapshot.data() || {};
    if (studentClass?.classId && weeklyGoal.classId !== studentClass.classId) {
      throw new HttpsError("failed-precondition", "This weekly commitment belongs to a different class.");
    }
    weeklySlot = (Array.isArray(weeklyGoal.sessions) ? weeklyGoal.sessions : [])
      .find((slot) => String(slot?.weeklySlotKey || "") === requestedWeeklySlotKey) || null;
    if (!weeklySlot) throw new HttpsError("failed-precondition", "That weekly Path slot is no longer part of the assigned week.");
    const assignedTarget = mathPath.canonicalAlignmentKey(weeklySlot.teksCode);
    if (!assignedTarget || assignedTarget !== targetAlignmentKey) {
      throw new HttpsError("failed-precondition", "That launch does not match the assigned weekly standard.");
    }
    const assignedFramework = normalizePathAssessmentFramework(weeklySlot.context);
    if (assessmentFramework && assessmentFramework !== assignedFramework) {
      throw new HttpsError("failed-precondition", "That launch does not match the assigned weekly assessment context.");
    }
    assessmentFramework = assignedFramework;
  }

  // A weekly slot can supply the assessment framework after the initial request
  // was normalized, so resolve its progression after that authority check too.
  if (assessmentFramework && !ccmrProgress) {
    ccmrProgress = await loadCcmrProgress(db, studentId, targetAlignmentKey, assessmentFramework);
    ccmrChallengeTier = resolveServerCcmrChallengeTier(ccmrProgress);
    if (ccmrChallengeTier >= 2 && sessionKind !== "retentionProbe") requiredQuestions = 3;
  }

  const coursePracticeIntent = requestedCoursePracticeIntent
    && !assessmentFramework
    && sessionKind !== "retentionProbe"
    && !requestedWeeklySlotKey
    ? requestedCoursePracticeIntent
    : null;

  // Ordinary course practice has visible passes too. Pass 1 is the foundation
  // session; later passes deliberately ask the selector for more demanding
  // work. This is NOT mastery — mastery remains evidence-driven.
  let priorCoursePasses = 0;
  let coursePassLevel = null;
  if (!assessmentFramework && sessionKind !== "retentionProbe" && !requestedWeeklySlotKey && coursePracticeIntent !== "challenge") {
    const passProgress = await loadCoursePathPassProgress(db, studentId);
    const targetCode = mathPath.displayAlignmentKey(targetAlignmentKey);
    priorCoursePasses = Number(passProgress.byTeksCode?.[targetCode]?.passesCompleted || 0);
    coursePassLevel = Math.min(COURSE_PATH_MAX_LEVEL, priorCoursePasses + 1);
  }

  // Refuse a standard the secure bank cannot issue a question for, and refuse
  // it HERE — at the start, with an explanation — rather than letting the
  // student open a session that dies on its first question. The wheel already
  // hides these, but a launch link, a stale tab or a direct call must meet the
  // same rule, so the check is not left to the browser.
  //
  // Coverage that has never been computed does not block: this is an integrity
  // guard over published content, and failing closed on a missing index would
  // take down every course the moment the index was absent. The gap it leaves
  // is exactly the pre-existing behaviour — issueNextQuestion still refuses,
  // with its own message.
  const coverageForCourse = await db.collection(COVERAGE_COLLECTION).doc(coverageCourseIdFor(targetAlignmentKey)).get();
  if (coverageForCourse.exists) {
    const coverage = await pathCoverage();
    if (!coverage.isSkillLaunchable(coverageForCourse.data(), targetAlignmentKey)) {
      const liveReady = await livePathSkillIsLaunchable(db, targetAlignmentKey);
      if (liveReady) {
        logger.warn("Repairing stale Path coverage from the current secure bank", {
          targetAlignmentKey,
          courseId: coverageCourseIdFor(targetAlignmentKey),
        });
        await rebuildStoredPathCoverage(db);
      } else {
        throw new HttpsError(
          "failed-precondition",
          coverage.explainCoverage(coverageForCourse.data(), targetAlignmentKey),
          { reason: "no-path-coverage" },
        );
      }
    }
  }
  let assessmentReleaseState = {
    framework: assessmentFramework || null,
    tracked: false,
    release: null,
    matchingFamilies: 0,
  };

  // A CCMR launch is allowed to call itself SAT/ACT/TSIA2/ASVAB practice only
  // when that exact framework has a full secure session of directly-authored
  // exam-style families. The ordinary TEKS coverage index is intentionally not
  // enough: crosswalk overlap is not direct assessment evidence.
  if (assessmentFramework) {
    const frameworkSnapshot = await db.collection("pathQuestionBank")
      .where("alignmentKeys", "array-contains", targetAlignmentKey)
      .limit(40)
      .get();
    const frameworkRecords = frameworkSnapshot.docs
      .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))
      .filter((question) => question.active !== false)
      .filter((question) => pathQuestionMatchesFramework(question, assessmentFramework));
    assessmentReleaseState = await loadAssessmentContentReleaseState(db, assessmentFramework, frameworkRecords);
    const activeFrameworkRecords = assessmentReleaseState.tracked
      ? frameworkRecords.filter((question) => String(question?.ccmrContentRelease || "").trim() === String(assessmentReleaseState.release || "").trim())
      : frameworkRecords;
    const frameworkPlans = assessmentReleaseState.available === false ? [] : await Promise.all(activeFrameworkRecords.map(async (question) => ({
      question, plan: await safeBuildTemplateIssuePlan(question, { operation: "path-runtime-framework-check" }),
    })));
    const issuableFamilies = new Set(frameworkPlans
      .filter((entry) => entry.plan?.issuable)
      .map((entry) => String(entry.question?.familyId || entry.question?.id || ""))
      .filter(Boolean));
    if (assessmentReleaseState.available !== false && issuableFamilies.size < 5) {
      throw new HttpsError(
        "failed-precondition",
        `${assessmentFramework} practice for ${mathPath.displayAlignmentKey(targetAlignmentKey)} is not published yet.`,
        { reason: "no-assessment-path-coverage", assessmentFramework },
      );
    }
  }

  const lockId = mathPath.opaqueId("pathlock", studentId, targetAlignmentKey, assessmentFramework || "course", requestedWeeklySlotKey || "open-practice");
  const lockRef = db.collection("activePathLocks").doc(lockId);
  const proposedSessionRef = db.collection("pathSessions").doc();

  const session = await db.runTransaction(async (transaction) => {
    const now = Date.now();
    const lock = await transaction.get(lockRef);
    if (lock.exists && lock.data()?.sessionId) {
      const existingRef = db.collection("pathSessions").doc(lock.data().sessionId);
      const existing = await transaction.get(existingRef);
      if (existing.exists && existing.data()?.status === "active" && existing.data()?.studentId === studentId) {
        if (existing.data()?.sessionKind !== sessionKind) {
          throw new HttpsError("failed-precondition", "Finish the active session for this TEKS before starting a different check.");
        }
        if ((existing.data()?.assessmentFramework || null) !== assessmentFramework) {
          throw new HttpsError("failed-precondition", "Finish the active session before changing assessment format.");
        }
        if ((existing.data()?.coursePracticeIntent || null) !== coursePracticeIntent) {
          throw new HttpsError("failed-precondition", "Finish the active session before changing between regular practice and Challenge.");
        }
        const releaseAction = pathContentRelease.planSessionContentReleaseAction(existing.data(), assessmentReleaseState);
        if (releaseAction.action === "continue" || releaseAction.action === "finish-open-question") return existing.data();
        if (releaseAction.action === "hold-release-update") throw assessmentReleaseUpdateError(assessmentFramework);
        if (releaseAction.action !== "supersede") {
          throw new HttpsError("aborted", "The assessment content release changed while this session was being resumed.");
        }
        transaction.set(
          existingRef,
          pathContentRelease.supersedeSessionForContentRelease(existing.data(), assessmentReleaseState.release, now),
        );
      }
    }

    if (assessmentReleaseState.tracked && assessmentReleaseState.available === false) {
      throw assessmentReleaseUpdateError(assessmentFramework);
    }

    const targetDisplay = mathPath.displayAlignmentKey(targetAlignmentKey);
    const next = {
      sessionId: proposedSessionRef.id,
      studentId,
      status: "active",
      sessionKind,
      assessmentFramework,
      coursePracticeIntent,
      assessmentContentRelease: assessmentReleaseState.tracked ? assessmentReleaseState.release : null,
      ccmrChallengeTier: assessmentFramework ? ccmrChallengeTier : null,
      coursePassLevel: assessmentFramework || sessionKind === "retentionProbe" ? null : coursePassLevel,
      priorCoursePasses: assessmentFramework || sessionKind === "retentionProbe" ? null : priorCoursePasses,
      ccmrProgressAtStart: assessmentFramework ? {
        directItemsAttempted: Number(ccmrProgress?.directItemsAttempted || 0),
        directItemsCorrect: Number(ccmrProgress?.directItemsCorrect || 0),
        tier1SessionsPassed: Number(ccmrProgress?.tier1SessionsPassed || 0),
        tier2SessionsPassed: Number(ccmrProgress?.tier2SessionsPassed || 0),
        tier3SessionsPassed: Number(ccmrProgress?.tier3SessionsPassed || 0),
      } : null,
      courseId,
      courseLevel,
      classId: studentClass?.classId || null,
      classPeriod: studentClass?.period || studentData.classPeriod || null,
      weekKey: requestedWeekKey,
      weeklySlotKey: requestedWeeklySlotKey,
      weeklySlot: weeklySlot?.slot || null,
      intendedDok: weeklySlot?.dok || null,
      intendedDifficultyBand: weeklySlot?.difficultyBand || null,
      weeklyPurpose: weeklySlot?.purpose || null,
      requiredQuestions,
      target: { alignmentKey: targetAlignmentKey },
      summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
      pathState: { counters: { questionsThisSession: 0 } },
      // The routing state. `currentSkillCode` is where the NEXT question comes
      // from and may differ from the target once a repair excursion opens; the
      // target never moves, which is what makes coming back possible.
      currentSkillCode: targetDisplay,
      excursion: null,
      diagnosing: null,
      lastDecision: null,
      evidenceBySkill: {},
      route: [{
        at: "start",
        action: "start",
        skillCode: targetDisplay,
        reason: "session_target",
        explanation: `Session started on ${targetDisplay}.`,
        wasCorrect: null,
      }],
      currentQuestion: null,
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(proposedSessionRef, next);
    transaction.set(lockRef, { sessionId: proposedSessionRef.id, studentId, targetAlignmentKey, sessionKind, assessmentFramework, weekKey: requestedWeekKey, weeklySlotKey: requestedWeeklySlotKey, updatedAt: now });
    return next;
  });

  return { success: true, session: publicPathSession(session) };
}));

/** Issue only a sanitized question payload. Expected answers remain server-side. */
exports.issueNextQuestion = onCall((request) => withPathCallableDiagnostics("issueNextQuestion", async () => {
  const { studentId } = requireStudent(request);
  const sessionId = String(request.data?.sessionId || "").trim();
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId is required.");
  const db = getFirestore();
  const sessionRef = db.collection("pathSessions").doc(sessionId);
  const sessionSnapshot = await sessionRef.get();
  if (!sessionSnapshot.exists || sessionSnapshot.data()?.studentId !== studentId) throw new HttpsError("not-found", "That My Math Path session is not available.");
  const session = sessionSnapshot.data();
  if (session.status !== "active") throw new HttpsError("failed-precondition", "This My Math Path session is already complete.");
  if (session.currentQuestion) {
    return { questionInstance: mathPath.buildSanitizedQuestion(session.currentQuestion, { questionInstanceId: session.currentQuestion.questionInstanceId, attemptsAllowed: session.currentQuestion.attemptsAllowed, attemptsUsed: session.currentQuestion.attemptsUsed, toolPayload: mathPath.storedToolPayload(session.currentQuestion) }) };
  }

  if (session.assessmentFramework) {
    // Release compatibility is resolved from the TARGET assessment families,
    // not from a remediation excursion. A course bridge inside SAT/ACT/TSIA2
    // must not make the session look untracked. Read a broad bounded slice so
    // legacy and replacement families are both visible during a bank refresh.
    const targetReleaseSnapshot = await db.collection("pathQuestionBank")
      .where("alignmentKeys", "array-contains", session.target.alignmentKey)
      .limit(200)
      .get();
    const targetFrameworkRecords = targetReleaseSnapshot.docs
      .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))
      .filter((question) => question.active !== false)
      .filter((question) => pathQuestionMatchesFramework(question, session.assessmentFramework));
    const issueReleaseState = await loadAssessmentContentReleaseState(db, session.assessmentFramework, targetFrameworkRecords);
    const releaseAction = pathContentRelease.planSessionContentReleaseAction(session, issueReleaseState);
    if (releaseAction.action === "hold-release-update") {
      throw assessmentReleaseUpdateError(session.assessmentFramework);
    }

    if (releaseAction.action === "supersede") {
      const rollover = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(sessionRef);
        if (!fresh.exists || fresh.data()?.studentId !== studentId) {
          throw new HttpsError("not-found", "That My Math Path session is not available.");
        }
        const freshData = fresh.data();
        if (freshData.currentQuestion) {
          return {
            questionInstance: mathPath.buildSanitizedQuestion(freshData.currentQuestion, {
              questionInstanceId: freshData.currentQuestion.questionInstanceId,
              attemptsAllowed: freshData.currentQuestion.attemptsAllowed,
              attemptsUsed: freshData.currentQuestion.attemptsUsed,
              toolPayload: mathPath.storedToolPayload(freshData.currentQuestion),
            }),
          };
        }

        const rolloverPayload = {
          reason: pathContentRelease.RELEASE_CHANGE_REASON,
          assessmentFramework: session.assessmentFramework,
          targetAlignmentKey: session.target.alignmentKey,
          currentRelease: issueReleaseState.release,
        };
        if (freshData.status === "superseded" && freshData.supersededReason === pathContentRelease.RELEASE_CHANGE_REASON) {
          return { rollover: rolloverPayload };
        }
        if (freshData.status !== "active") {
          throw new HttpsError("failed-precondition", "This My Math Path session is already complete.");
        }

        const freshAction = pathContentRelease.planSessionContentReleaseAction(freshData, issueReleaseState);
        if (freshAction.action !== "supersede") {
          // The only supported race from a stale/no-question state is another
          // issuer creating the current question (handled above) or another
          // issuer superseding it (handled above). Refuse any unexpected state
          // instead of issuing across releases.
          throw new HttpsError(
            "aborted",
            "This assessment session changed while its content release was being checked. Start it again to continue.",
            { reason: pathContentRelease.RELEASE_CHANGE_REASON },
          );
        }
        const now = Date.now();
        transaction.set(
          sessionRef,
          pathContentRelease.supersedeSessionForContentRelease(freshData, issueReleaseState.release, now),
        );
        return { rollover: rolloverPayload };
      });
      return rollover;
    }
  }

  const targetDisplayCode = mathPath.displayAlignmentKey(session.target.alignmentKey);
  // WHERE THE NEXT QUESTION COMES FROM. Not the target — the skill routing last
  // chose. On an ordinary session those are the same; on a repair excursion the
  // student is working on a prerequisite, and issuing from the target anyway is
  // exactly the bug that made live sessions non-adaptive.
  const activeDisplayCode = mathPath.displayAlignmentKey(session.currentSkillCode || targetDisplayCode);
  const activeAlignmentKey = mathPath.canonicalAlignmentKey(activeDisplayCode);
  const [bankSnapshot, masterySnapshot, rosterSnapshot, courseSettingsSnapshot] = await Promise.all([
    db.collection("pathQuestionBank").where("alignmentKeys", "array-contains", activeAlignmentKey).limit(40).get(),
    db.collection("studentMasteryProfiles").doc(studentId).get(),
    db.collection("grades").doc(studentId).get(),
    db.collection("settings").doc("courseProfiles").get(),
  ]);
  // Every candidate is screened by the Path Tool Contract before it can be
  // chosen. A question whose tool has no server grader is skipped here rather
  // than issued in a weaker form.
  const bankRecords = bankSnapshot.docs
    .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))
    .filter((question) => question.active !== false);
  const buildFrameworkPlans = async (framework) => Promise.all(bankRecords
    .filter((question) => pathQuestionMatchesFramework(question, framework))
    .filter((question) => pathQuestionMatchesSessionContentRelease(question, session))
    .map(async (question) => ({ question, plan: await safeBuildTemplateIssuePlan(question, { operation: "path-question-selection" }) })));

  let plans = await buildFrameworkPlans(session.assessmentFramework || null);
  let issuable = plans.filter((entry) => entry.plan.issuable);
  let candidates = issuable.map((entry) => entry.question);
  let usingCourseBridge = false;

  // Fidelity V2 progression: the first assessment session uses direct/foundation
  // families. A repeat after strong direct evidence uses authored challenge
  // families and never silently cycles the same five introductory tasks.
  if (session.assessmentFramework) {
    const tier = Math.max(1, Math.min(3, Number(session.ccmrChallengeTier || 1)));
    const foundation = candidates.filter((question) => Number(question.ccmrChallengeTier || 1) <= 1);
    const challenge = candidates.filter((question) => Number(question.ccmrChallengeTier || 1) >= 2);
    if (tier === 1 && foundation.length) candidates = foundation;
    if (tier >= 2) {
      if (challenge.length >= 2) candidates = challenge;
      else {
        const highFoundation = foundation.filter((question) => Number(question.difficultyBand || 3) >= 4);
        candidates = [...challenge, ...highFoundation];
      }
    }
  }

  // A CCMR session may route down to a mathematical prerequisite that the exam
  // itself does not test. Stranding the student there with "start again" is a
  // bad learning experience. Use the ordinary course family as a clearly
  // labelled foundation bridge, then let routing return to direct exam-format
  // work. The bridge never counts as direct assessment evidence.
  if (!candidates.length && session.assessmentFramework && activeDisplayCode !== targetDisplayCode) {
    const coursePlans = await buildFrameworkPlans(null);
    const courseIssuable = coursePlans.filter((entry) => entry.plan.issuable);
    if (courseIssuable.length) {
      plans = coursePlans;
      issuable = courseIssuable;
      candidates = courseIssuable.map((entry) => entry.question);
      usingCourseBridge = true;
      logger.info("Using course foundation bridge inside assessment Path session", {
        sessionId,
        assessmentFramework: session.assessmentFramework,
        activeDisplayCode,
        targetDisplayCode,
      });
    }
  }

  if (!candidates.length) {
    // NEVER STRAND. If an ordinary excursion skill truly has no issuable
    // content, return the routing state to the target. Assessment sessions have
    // already tried the course bridge above before reaching this branch.
    if (activeDisplayCode !== targetDisplayCode) {
      logger.warn("Path excursion skill has no issuable content; returning to target", {
        sessionId, activeDisplayCode, targetDisplayCode,
      });
      await sessionRef.update({
        currentSkillCode: targetDisplayCode,
        excursion: null,
        diagnosing: null,
        updatedAt: Date.now(),
      });
      throw new HttpsError(
        "failed-precondition",
        `Practice for ${activeDisplayCode} is not published yet, so this session has returned to ${targetDisplayCode}. Start it again to continue.`,
        { reason: "excursion-content-missing" },
      );
    }
    const skipped = plans.length ? ` ${plans.length} question(s) were skipped: ${[...new Set(plans.map((entry) => entry.plan.reason))].join(", ")}.` : "";
    throw new HttpsError("failed-precondition", `No active secure question family is published for ${session.target.alignmentKey}.${skipped}`);
  }

  const classPeriod = rosterSnapshot.data()?.classPeriod || session.classPeriod || "Unassigned";
  const studentClass = await loadStudentClass(db, rosterSnapshot.data());
  // THE STUDENT'S ACTUAL ENTITLEMENTS.
  //
  // The roster document was already being read here, and its `.profile` field
  // was already being ignored — the Path server used the doc for one string
  // (the class period) and nothing else. That is why extra attempts, the
  // calculator accommodation and reduced choices could not be authoritative on
  // the Path however carefully a district authorized them: nothing on the
  // server had ever looked. The adapter accepts either stored profile shape.
  const entitlements = await mathPath.resolveEntitlements(rosterSnapshot.data()?.profile || null);
  const courseLevel = session.courseLevel
    || studentClass?.courseLevel
    || courseSettingsSnapshot.data()?.profiles?.[classPeriod]?.courseLevel
    || "standard";
  const masteryProfile = masterySnapshot.data()?.profiles?.[activeDisplayCode] || {};
  const adaptiveRigor = rigorPolicy.resolveAdaptiveRigor({ courseLevel, profile: masteryProfile });
  const onAssignedWeeklyTarget = Boolean(session.weeklySlotKey && activeDisplayCode === targetDisplayCode && !session.diagnosing);
  let preferredDifficultyBand = onAssignedWeeklyTarget && Number.isFinite(Number(session.intendedDifficultyBand))
    ? Number(session.intendedDifficultyBand)
    : adaptiveRigor.preferredDifficultyBand;
  let preferredDok = onAssignedWeeklyTarget && Number.isFinite(Number(session.intendedDok))
    ? Number(session.intendedDok)
    : adaptiveRigor.preferredDok;
  if (session.assessmentFramework && Number(session.ccmrChallengeTier || 1) >= 2) {
    preferredDifficultyBand = Number(session.ccmrChallengeTier) >= 3 ? 5 : Math.max(4, Number(preferredDifficultyBand || 3));
    preferredDok = Number(session.ccmrChallengeTier) >= 3 ? Math.max(3, Number(preferredDok || 2)) : Math.max(2, Number(preferredDok || 2));
  }
  // A frozen weekly slot is authoritative while we are on its assigned TEKS.
  // Do not let an unrelated open-practice pass level rewrite the week's DOK or
  // difficulty commitment after the snapshot has already been assigned.
  if (!session.assessmentFramework && session.sessionKind !== "retentionProbe" && !onAssignedWeeklyTarget) {
    const coursePassLevel = Math.max(1, Math.min(COURSE_PATH_MAX_LEVEL, Number(session.coursePassLevel || 1)));
    if (coursePassLevel >= 2) {
      preferredDifficultyBand = Math.max(4, Number(preferredDifficultyBand || 3));
      preferredDok = Math.max(2, Number(preferredDok || 2));
    }
    if (coursePassLevel >= 3) {
      // Course TEKS content is authored through Band 4. Pass 3 stretches by
      // depth (DOK 3), not by requesting a nonexistent Band 5 and relying on a
      // fallback that teachers cannot see.
      preferredDifficultyBand = Math.max(4, Number(preferredDifficultyBand || 4));
      preferredDok = Math.max(3, Number(preferredDok || 2));
    }
  }
  // A student may opt into an EARNED Challenge card, but the browser never
  // names a DOK or difficulty. The only accepted course intent is a one-way
  // escalation to the certified authored ceiling. It applies only on the
  // session target, never to a remediation/diagnostic excursion.
  if (
    session.coursePracticeIntent === "challenge"
    && !session.assessmentFramework
    && !session.weeklySlotKey
    && activeDisplayCode === targetDisplayCode
    && !session.diagnosing
  ) {
    if (!courseChallengeEarned(masteryProfile)) {
      throw new HttpsError(
        "failed-precondition",
        "Challenge is not unlocked for this skill yet.",
        { reason: "course-challenge-not-earned" },
      );
    }
    preferredDifficultyBand = 4;
    preferredDok = 3;
  }

  // Routing can recognize mastery from fresh in-session evidence before the
  // asynchronous mastery-profile trigger catches up. When it explicitly says
  // ENRICHMENT, honor that server-owned decision immediately so the student
  // actually receives Challenge work rather than a stale core-rigor question.
  if (
    !session.assessmentFramework
    && !onAssignedWeeklyTarget
    && session.lastDecision?.action === "enrichment"
    && activeDisplayCode === targetDisplayCode
    && !session.diagnosing
  ) {
    preferredDifficultyBand = 4;
    preferredDok = 3;
  }

  // Selection prefers an UNUSED family, widening to the closest adjacent band
  // before it repeats anything. Narrowing to the nearest band first and cycling
  // inside it — which is what this used to do — trapped a five-question session
  // in whichever one or two families happened to sit at the readiness band.
  const selection = await pathSelection();
  const familyUsage = session.familyUsage && typeof session.familyUsage === "object" ? session.familyUsage : {};
  // What this session has already asked, so the next question is not the same
  // idea in the same clothes. Five symbolic procedures in a row is five
  // questions about one thing.
  const usedRepresentations = Array.isArray(session.usedRepresentations) ? session.usedRepresentations : [];
  const usedTaskTypes = Array.isArray(session.usedTaskTypes) ? session.usedTaskTypes : [];
  const selectionOptions = {
    preferredBand: preferredDifficultyBand,
    // Cognitive demand, decided server-side from the same evidence the band is.
    preferredDok,
    usage: familyUsage,
    usedRepresentations,
    usedTaskTypes,
  };

  // Do not let one bad generated draw/family strand the whole skill. The bank
  // validator proves a TEMPLATE can issue, but a runtime draw or tool-support
  // builder can still encounter an edge case. Try the ranked alternatives
  // before showing the student an error.
  let remainingCandidates = [...candidates];
  let choice = null;
  let authored = null;
  let instantiated = null;
  let issued = null;
  let issuePlan = null;
  let preparedApplicableSupports = null;
  let preparedPrivateSupport = null;
  const preparationFailures = [];
  const questionInstanceId = mathPath.runtimeId("qi");

  while (remainingCandidates.length) {
    const tentative = selection.selectNextFamily(remainingCandidates, selectionOptions);
    if (!tentative?.question) break;
    const tentativeQuestion = tentative.question;

    try {
      const draw = await mathPath.instantiateQuestion(
        tentativeQuestion,
        `${sessionId}|${questionInstanceId}|${tentativeQuestion.id}`,
        {
          preferredDok,
          preferredDifficultyBand,
        },
      );
      if (!draw?.question) {
        preparationFailures.push({ questionId: tentativeQuestion.id, reason: draw?.reason || "generator_failed" });
        remainingCandidates = remainingCandidates.filter((candidate) => candidate.id !== tentativeQuestion.id);
        continue;
      }

      const planned = await mathPath.buildIssuePlan(draw.question);
      if (!planned?.issuable) {
        preparationFailures.push({ questionId: tentativeQuestion.id, reason: planned?.reason || "generated_not_issuable" });
        remainingCandidates = remainingCandidates.filter((candidate) => candidate.id !== tentativeQuestion.id);
        continue;
      }

      const [applicableSupports, privateSupport] = await Promise.all([
        mathPath.applicableSupportsFor(entitlements, draw.question, {}),
        mathPath.buildPrivateSupport(draw.question),
      ]);

      choice = tentative;
      authored = tentativeQuestion;
      instantiated = draw;
      issued = draw.question;
      issuePlan = planned;
      preparedApplicableSupports = applicableSupports;
      preparedPrivateSupport = privateSupport;
      break;
    } catch (error) {
      preparationFailures.push({
        questionId: tentativeQuestion.id,
        reason: "runtime_preparation_exception",
        detail: error?.message || String(error),
      });
      logger.warn("Skipping Path family after runtime preparation failure", {
        sessionId,
        activeDisplayCode,
        bankQuestionId: tentativeQuestion.id,
        message: error?.message || String(error),
      });
      remainingCandidates = remainingCandidates.filter((candidate) => candidate.id !== tentativeQuestion.id);
    }
  }

  if (!choice || !authored || !instantiated?.question || !issuePlan?.issuable) {
    logger.error("All Path candidates failed runtime preparation", {
      sessionId,
      activeDisplayCode,
      targetDisplayCode,
      failures: preparationFailures,
    });
    throw new HttpsError(
      "failed-precondition",
      `Published practice for ${activeDisplayCode} needs repair before another question can be prepared. Your completed work is safe; return to My Math Path and choose another open skill.`,
      {
        reason: "all-candidate-preparations-failed",
        failedFamilies: preparationFailures.slice(0, 12).map((entry) => ({ questionId: entry.questionId, reason: entry.reason })),
      },
    );
  }

  // A diagnostic is ONE question with ONE attempt: it is asked to find out
  // whether a prerequisite is the obstacle, and three tries at it would measure
  // persistence rather than answer the question.
  const pathRole = session.diagnosing ? "diagnose" : (session.lastDecision?.action || "continue");
  const baseAttempts = session.sessionKind === "retentionProbe" || pathRole === "diagnose" ? 1 : 3;
  // An authorized extra-attempts accommodation is normally ADDED to the
  // pedagogical figure. Two interactions deliberately stay one attempt:
  // diagnostics/retention probes, which measure what the student can do now,
  // and pure finite-choice items, where extra guesses would become elimination
  // rather than useful mathematical evidence. Resolved on the server so the
  // browser cannot grant itself another try.
  const attemptsAllowed = await mathPath.attemptsForQuestion(issued, baseAttempts, entitlements);
  const currentQuestion = {
    // The public half — the authentic tool, by allowlist — plus the private
    // grading definition, which lives only in this session document.
    ...mathPath.buildSanitizedQuestion(issued, { questionInstanceId, attemptsAllowed, attemptsUsed: 0, toolPayload: issuePlan.toolPayload }),
    bankQuestionId: authored.id,
    sourceBankQuestionId: authored.id,
    // The draw that produced this question. Teacher/QA metadata on the session
    // document only — `buildSanitizedQuestion` does not copy it, so a student
    // cannot read the parameters that generated their answer.
    generatorParameters: instantiated.parameters,
    skillCode: activeDisplayCode,
    pathRole,
    coursePassLevel: session.assessmentFramework || session.weeklySlotKey || session.coursePracticeIntent === "challenge"
      ? null
      : Math.max(1, Math.min(COURSE_PATH_MAX_LEVEL, Number(session.coursePassLevel || 1))),
    coursePracticeIntent: session.coursePracticeIntent || null,
    assessmentBridgeFramework: usingCourseBridge ? session.assessmentFramework : null,
    ccmrChallengeTier: session.assessmentFramework ? Math.max(1, Math.min(3, Number(session.ccmrChallengeTier || 1))) : null,
    ccmrFamilyRole: authored.ccmrFamilyRole || (Number(authored.ccmrChallengeTier || 1) >= 2 ? "challenge" : "direct"),
    // Teacher/QA metadata. `buildSanitizedQuestion` does not copy these onto the
    // student payload; the Path Simulator reads them from the session document.
    selectionReason: choice.reason,
    selectedCoverageKey: choice.effectiveCoverageKey || null,
    selectedVariantIndex: Number.isInteger(choice.effectiveVariantIndex) ? choice.effectiveVariantIndex : null,
    requestedDok: preferredDok,
    requestedDifficultyBand: preferredDifficultyBand,
    contentQuality: choice.quality,
    // Which authorized supports actually apply to THIS question. Authorized is
    // not the same as applicable: a calculator accommodation does not apply to
    // an item whose assessed construct is the computation, and reduced choices
    // do not apply where there is nothing to reduce.
    applicableSupports: preparedApplicableSupports,
    authorizedSupports: entitlements.authorized,
    supportEntitlements: {
      extraAttempts: entitlements.extraAttempts,
      extendedTimeMultiplier: entitlements.extendedTimeMultiplier,
      translationLanguage: entitlements.translationLanguage,
      isModifiedCurriculum: Boolean(entitlements.modification?.isModifiedCurriculum),
    },
    representation: choice.representation || null,
    taskType: choice.taskType || null,
    // Evidence is recorded against the skill the question actually came from.
    // Recording an excursion question against the target would credit a student
    // with mastery of a skill they were sent away from.
    alignmentKeys: [activeAlignmentKey],
    attemptsAllowed,
    attemptsUsed: 0,
    adaptiveRigor,
    privateGrading: issuePlan.privateGrading,
    // Feedback, hints and the solution review live HERE, on the session
    // document, and are released one piece at a time by submitPathResponse.
    // Nothing in this bundle is ever part of the sanitized question, so a
    // student cannot read the review out of the payload before answering.
    privateSupport: preparedPrivateSupport,
  };

  const issuedQuestion = await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(sessionRef);
    const freshData = fresh.data();
    if (!fresh.exists || freshData?.studentId !== studentId || freshData?.status !== "active") throw new HttpsError("failed-precondition", "This session changed before the question could be issued.");
    if (freshData.currentQuestion) return freshData.currentQuestion;
    // Remember which family was issued, so the next question in this session
    // reaches for one the student has not seen.
    transaction.update(sessionRef, {
      currentQuestion,
      familyUsage: selection.recordFamilyUse(freshData.familyUsage || {}, authored.id),
      usedRepresentations: [...new Set([...(freshData.usedRepresentations || []), choice.representation].filter(Boolean))],
      usedTaskTypes: [...new Set([...(freshData.usedTaskTypes || []), choice.taskType].filter(Boolean))],
      updatedAt: Date.now(),
    });
    return currentQuestion;
  });

  return { questionInstance: mathPath.buildSanitizedQuestion(issuedQuestion, { questionInstanceId: issuedQuestion.questionInstanceId, attemptsAllowed: issuedQuestion.attemptsAllowed, attemptsUsed: issuedQuestion.attemptsUsed, toolPayload: mathPath.storedToolPayload(issuedQuestion) }) };
}));

/**
 * Grade a path response on the server and append immutable evidence in the same
 * transaction. submissionId is a real idempotency key, so a network retry can
 * safely repeat the request without creating a second attempt.
 */
exports.submitPathResponse = onCall((request) => withPathCallableDiagnostics("submitPathResponse", async () => {
  const { studentId } = requireStudent(request);
  const sessionId = String(request.data?.sessionId || "").trim();
  const questionInstanceId = String(request.data?.questionInstanceId || "").trim();
  const submissionId = String(request.data?.submissionId || "").trim();
  if (!sessionId || !questionInstanceId || !submissionId) throw new HttpsError("invalid-argument", "sessionId, questionInstanceId, and submissionId are required.");
  if (submissionId.length > 180) throw new HttpsError("invalid-argument", "submissionId is too long.");

  const db = getFirestore();
  const sessionRef = db.collection("pathSessions").doc(sessionId);
  const submissionRef = db.collection("pathSubmissions").doc(mathPath.opaqueId("submission", sessionId, submissionId));
  // Load the tool contract and the routing engine before the transaction opens,
  // so a cold dynamic import is never paid for inside it — and never repeated
  // if the transaction retries.
  await Promise.all([
    mathPath.pathToolContracts(),
    pathRouting.routing(),
    pathRouting.skillGraph(),
  ]);

  // The authorization context this evidence will carry, resolved from the
  // student's class before the transaction so the read is not inside it.
  const auth = await authorizationContext();
  const studentRecord = await db.collection("grades").doc(studentId).get();
  const authorizationFields = auth.buildAuthorizationContext({
    studentId,
    student: studentRecord.data() || null,
    classRecord: await loadStudentClass(db, studentRecord.data()),
  });

  // Everything routing needs to reason with, read BEFORE the transaction opens.
  // The mastery profile is what the student knew coming in; the coverage
  // indexes are what the bank can actually teach. Both are read-only inputs, so
  // reading them outside keeps the transaction short.
  const [masterySnapshot, retentionSnapshotForRouting, ...coverageSnapshots] = await Promise.all([
    db.collection("studentMasteryProfiles").doc(studentId).get(),
    db.collection("studentRetentionSchedules").doc(studentId).get(),
    ...PATH_COURSE_IDS.map((courseId) => db.collection(COVERAGE_COLLECTION).doc(courseId).get()),
  ]);
  const masteryProfiles = masterySnapshot.data()?.profiles || {};
  const coverageIndexes = Object.fromEntries(PATH_COURSE_IDS.map((courseId, index) => [
    courseId, coverageSnapshots[index]?.exists ? coverageSnapshots[index].data() : null,
  ]));
  const retentionSchedules = retentionSnapshotForRouting.data()?.schedules || {};

  const transactionResult = await db.runTransaction(async (transaction) => {
    const [sessionSnapshot, submissionSnapshot] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(submissionRef),
    ]);
    if (submissionSnapshot.exists) return { duplicate: true, result: submissionSnapshot.data()?.result };
    if (!sessionSnapshot.exists || sessionSnapshot.data()?.studentId !== studentId) throw new HttpsError("not-found", "That My Math Path session is not available.");
    const session = sessionSnapshot.data();
    if (session.status !== "active" || !session.currentQuestion) throw new HttpsError("failed-precondition", "There is no open question to submit.");
    const currentQuestion = session.currentQuestion;
    if (currentQuestion.questionInstanceId !== questionInstanceId) throw new HttpsError("failed-precondition", "That question is no longer the active question.");

    // The grader is chosen from the question the SERVER stored, never from a
    // tool id the browser supplies, and nothing the browser claims about
    // correctness is read.
    const gradingResult = await mathPath.gradePathToolResponse(currentQuestion.privateGrading, request.data?.responsePayload || {});
    if (gradingResult.rejected) {
      // Not "wrong" — unusable. It does not consume an attempt and it does not
      // become evidence.
      if (gradingResult.reason === "no_server_grader_for_this_tool") {
        throw new HttpsError("failed-precondition", "This question cannot be graded on the server, so it cannot be scored.");
      }
      throw new HttpsError("invalid-argument", gradingResult.detail || "That response was not in the shape this question expects.");
    }
    const gradingCore = { isCorrect: gradingResult.isCorrect, score: gradingResult.score, parts: gradingResult.parts || [] };
    const attemptNumber = Number(currentQuestion.attemptsUsed || 0) + 1;
    const attemptsRemaining = Math.max(0, Number(currentQuestion.attemptsAllowed || 1) - attemptNumber);
    const questionFinalized = gradingCore.isCorrect || attemptsRemaining === 0;
    // What the student is told. The solution review inside this is null unless
    // the question just closed — that rule lives in one shared module rather
    // than in an `if` here, so the simulator cannot disagree with production.
    const attemptSupport = await mathPath.attemptSupport({
      support: currentQuestion.privateSupport || null,
      attemptNumber,
      attemptsAllowed: Number(currentQuestion.attemptsAllowed || 1),
      isCorrect: gradingCore.isCorrect,
      questionFinalized,
      responsePayload: request.data?.responsePayload || {},
    });
    // WHAT THE BROWSER IS ALLOWED TO SAY ABOUT SUPPORT.
    //
    // Correctness has never been the browser's to declare, and neither is
    // independence: a client that simply omits the support flags used to be
    // taken at its word, because `mathematicalIndependence({})` is true. That
    // is the same trust bug as a browser-supplied `isCorrect`, one axis over,
    // and it inflates mastery instead of grades.
    //
    // The server ISSUED the hint and RELEASED the review, so it already knows
    // the two facts that matter. Those are recorded from server state and are
    // not readable from the request at all. The browser keeps only the flags
    // that describe things the server genuinely cannot observe — a human
    // helping, a calculator on the desk, an accommodation in force — and even
    // those are coerced rather than spread.
    const claimed = request.data?.supportUsage && typeof request.data.supportUsage === "object"
      ? request.data.supportUsage
      : {};
    const priorSupport = currentQuestion.supportReleased || {};
    const hintReleased = Boolean(priorSupport.hintReleased) || Boolean(attemptSupport.support?.hint);
    const reviewReleased = Boolean(priorSupport.reviewReleased) || Boolean(attemptSupport.solutionReview);
    // ACCOMMODATION DELIVERY, reconciled.
    //
    // Three different facts, from three different places, deliberately kept
    // apart:
    //   AUTHORIZED  — the student's profile. Server fact, resolved at issue.
    //   APPLICABLE  — does it even apply to this question. Server fact.
    //   PRESENTED/USED — did the button actually render, did the student press
    //                    it. Only the browser can observe these, so they are
    //                    accepted from the client but INTERSECTED with the
    //                    authorized set: a client cannot report a support the
    //                    student was never granted, so it cannot manufacture a
    //                    compliance record or an excuse.
    //
    // Before this, the Path recorded no accommodations at all — the server's
    // supportUsage had no `accommodations` key, so `supportTelemetry()`
    // iterated an empty array and EVERY My Math Path evidence event carried
    // zero "presented" events, forever.
    const delivery = await mathPath.reconcileSupports({
      entitlements: {
        authorized: Array.isArray(currentQuestion.authorizedSupports) ? currentQuestion.authorizedSupports : [],
      },
      applicable: Array.isArray(currentQuestion.applicableSupports) ? currentQuestion.applicableSupports : [],
      clientPresented: Array.isArray(request.data?.supportsPresented) ? request.data.supportsPresented : [],
      clientUsed: Array.isArray(request.data?.supportsUsed) ? request.data.supportsUsed : [],
    });

    const supportUsage = {
      // Server-observed. Not accepted from the request.
      hintUsed: hintReleased,
      workedExampleUsed: reviewReleased,
      scaffoldUsed: hintReleased,
      // Client-reported, but about the room rather than about the mathematics.
      teacherAssisted: Boolean(claimed.teacherAssisted),
      calculatorUsed: Boolean(claimed.calculatorUsed),
      modified: Boolean(claimed.modified),
      // ACCESS accommodations. These are recorded so a compliance report can
      // answer "was it offered, was it used" — and they must NOT reduce
      // mathematical independence. A student who had the prompt read aloud, or
      // read it in Spanish, did the same mathematics as everyone else.
      accommodations: delivery.used,
      accommodationsPresented: delivery.presented,
      accommodationsApplicable: delivery.applicable,
      // Authorized, applicable, and nothing rendered it. This is the signal an
      // administrator needs: a tool could not honour a support the student is
      // entitled to.
      accommodationsNotDelivered: delivery.authorizedButNotPresented,
      ...(delivery.rejectedClaims.length ? { rejectedSupportClaims: delivery.rejectedClaims } : {}),
      ...(Array.isArray(claimed.modifications) && claimed.modifications.length
        ? { modifications: claimed.modifications.slice(0, 12).map((entry) => String(entry).slice(0, 80)) }
        : {}),
    };
    const independent = mathPath.mathematicalIndependence(supportUsage);
    const now = Date.now();
    const nextSummary = { ...(session.summary || {}) };
    let nextStatus = session.status;
    // Support is sticky across attempts on the same question: a hint the
    // student saw on attempt two is still a hint they saw on attempt three,
    // and forgetting that between attempts would let the discount evaporate
    // on the attempt that actually counts.
    let nextCurrentQuestion = {
      ...currentQuestion,
      attemptsUsed: attemptNumber,
      supportReleased: { hintReleased, reviewReleased },
    };

    // The routing decision. Only a FINALIZED question is evidence — attempts
    // within a question are for assistance — so this runs once per question,
    // never once per attempt.
    let routed = null;
    if (questionFinalized) {
      nextSummary.completedQuestions = Number(nextSummary.completedQuestions || 0) + 1;
      nextSummary.correctQuestions = Number(nextSummary.correctQuestions || 0) + (gradingCore.isCorrect ? 1 : 0);
      nextSummary.independentSuccesses = Number(nextSummary.independentSuccesses || 0) + (gradingCore.isCorrect && independent ? 1 : 0);
      nextCurrentQuestion = null;

      const activeSkillCode = currentQuestion.skillCode || mathPath.displayAlignmentKey(session.target.alignmentKey);
      const schedule = retentionSchedules[activeSkillCode] || null;
      // A retention PROBE is two questions and a verdict. Routing it into a
      // repair excursion would turn "a quick check that this stayed with you"
      // into a surprise unit of remediation, which is exactly what the
      // retention design is meant to avoid — so a probe counts its questions
      // and finishes, and any concern it raises is acted on next session.
      if (session.sessionKind === "retentionProbe") {
        if (nextSummary.completedQuestions >= Number(session.requiredQuestions || 2)) nextStatus = "completed";
      } else {
        routed = await pathRouting.routeAfterFinalizedQuestion({
          session: { ...session, summary: nextSummary },
          skillCode: activeSkillCode,
          isCorrect: gradingCore.isCorrect,
          profiles: masteryProfiles,
          coverageIndexes,
          // Previously strong, and overdue for a check. The engine turns this
          // into a short verification rather than assuming the skill held.
          retentionConcern: Boolean(
            (schedule && ["concern", "due", "overdue"].includes(String(schedule.status || "")))
            || (Number(schedule?.nextCheckDueAt) > 0 && Number(schedule.nextCheckDueAt) <= now),
          ),
        });
        nextStatus = routed.status;
      }
      // Belt and braces: whatever the engine decided, a session that has met
      // its question count and is not on an excursion is finished.
      if (routed
        && nextStatus === "active"
        && !routed.excursion
        && !routed.diagnosing
        && nextSummary.completedQuestions >= Number(session.requiredQuestions || 5)) {
        nextStatus = "completed";
      }
    }

    let retentionSnapshot = null;
    const retentionRef = db.collection("studentRetentionSchedules").doc(studentId);
    if (nextStatus === "completed" && session.sessionKind === "retentionProbe") retentionSnapshot = await transaction.get(retentionRef);

    const nextSession = {
      ...session,
      status: nextStatus,
      summary: nextSummary,
      pathState: { ...(session.pathState || {}), counters: { ...(session.pathState?.counters || {}), questionsThisSession: nextSummary.completedQuestions || 0 } },
      currentQuestion: nextCurrentQuestion,
      ...(routed ? {
        currentSkillCode: routed.currentSkillCode,
        excursion: routed.excursion,
        diagnosing: routed.diagnosing,
        lastDecision: routed.lastDecision,
        evidenceBySkill: routed.evidenceBySkill,
        teacherMessage: routed.teacherMessage,
        // The whole route so far, so "why am I on this skill?" is answerable
        // rather than assertable. Capped so a long session cannot grow the
        // document without bound.
        route: [...(session.route || []), routed.routeEntry].slice(-40),
      } : {}),
      updatedAt: now,
      completedAt: nextStatus === "completed" ? now : session.completedAt || null,
    };
    const evidenceKey = mathPath.opaqueId("ev", sessionId, questionInstanceId, attemptNumber);
    const evidenceRef = db.collection("grades").doc(studentId).collection("evidenceEvents").doc(evidenceKey);
    const event = {
      schemaVersion: 1,
      eventKey: evidenceKey,
      // Who may read this, answerable from the record itself. `origin*` records
      // the class and teacher this work actually happened under and is never
      // rewritten; `authorizedTeacherEmails` follows the student if they move.
      ...authorizationFields,
      occurredAt: now,
      alignmentKeys: currentQuestion.alignmentKeys || [session.target.alignmentKey],
      masteryEvidenceKeys: currentQuestion.alignmentKeys || [session.target.alignmentKey],
      questionSnapshot: {
        questionInstanceId,
        questionId: currentQuestion.bankQuestionId,
        familyId: currentQuestion.familyId,
        familyVersion: currentQuestion.familyVersion,
        questionType: currentQuestion.questionType,
        difficultyBand: currentQuestion.difficultyBand,
        dok: currentQuestion.dok,
        ccmrChallengeTier: currentQuestion.ccmrChallengeTier || null,
        ccmrFamilyRole: currentQuestion.ccmrFamilyRole || null,
      },
      // A retention probe is not ordinary practice, and recording it as such
      // made "has this stayed with you?" evidence indistinguishable from
      // "are you learning this?" evidence in every downstream report.
      source: {
        kind: "myMathPath",
        activityRole: session.sessionKind === "retentionProbe" ? "retention" : "practice",
        activitySessionId: sessionId,
        sessionKind: session.sessionKind,
        weekKey: session.weekKey || null,
        weeklySlotKey: session.weeklySlotKey || null,
        weeklySlot: session.weeklySlot || null,
        weeklyPurpose: session.weeklyPurpose || null,
        // Direct assessment evidence comes from the question actually issued,
        // not merely from the session the student started. A course foundation
        // bridge inside SAT/ACT/etc. remains course evidence.
        assessmentFramework: currentQuestion.assessmentContext?.examStyle === true
          ? normalizePathAssessmentFramework(currentQuestion.assessmentContext.framework)
          : null,
        assessmentBridgeFramework: currentQuestion.assessmentBridgeFramework || null,
        ccmrChallengeTier: currentQuestion.assessmentContext?.examStyle === true
          ? Math.max(1, Math.min(3, Number(session.ccmrChallengeTier || currentQuestion.ccmrChallengeTier || 1)))
          : null,
        ccmrSessionCompleted: Boolean(currentQuestion.assessmentContext?.examStyle === true && nextStatus === "completed"),
        ccmrSessionPassed: Boolean(currentQuestion.assessmentContext?.examStyle === true && nextStatus === "completed" && ccmrSessionPasses(nextSummary, session.requiredQuestions)),
      },
      performance: { score: gradingCore.score, isCorrect: gradingCore.isCorrect, attemptNumber, status: questionFinalized ? "finalized" : "attempted", isMathematicallyIndependent: independent },
      supportUsage: { ...supportUsage, isMathematicallyIndependent: independent },
      supportTelemetry: mathPath.supportTelemetry(supportUsage),
    };

    if (retentionSnapshot) {
      const displayCode = mathPath.displayAlignmentKey(session.target.alignmentKey);
      const schedules = retentionSnapshot.exists ? retentionSnapshot.data()?.schedules || {} : {};
      const currentSchedule = schedules[displayCode] || {};
      const passed = nextSummary.completedQuestions >= 2 && nextSummary.independentSuccesses >= 2;
      const successfulCheckCount = passed ? Number(currentSchedule.successfulCheckCount || 0) + 1 : Number(currentSchedule.successfulCheckCount || 0);
      const updatedSchedule = passed ? {
        ...currentSchedule,
        teksCode: displayCode,
        status: "scheduled",
        lastVerifiedAt: now,
        successfulCheckCount,
        nextCheckDueAt: mathPath.nextRetentionDue(now, successfulCheckCount),
        daysOverdue: 0,
      } : {
        ...currentSchedule,
        teksCode: displayCode,
        status: "concern",
        lastFailedCheckAt: now,
      };
      transaction.set(retentionRef, { schedules: { ...schedules, [displayCode]: updatedSchedule }, updatedAt: now }, { merge: true });
      nextSession.retentionOutcome = passed ? "passed" : "failed";
    }

    if (questionFinalized && currentQuestion.assessmentContext?.examStyle === true) {
      const directFramework = normalizePathAssessmentFramework(currentQuestion.assessmentContext.framework);
      if (directFramework) {
        const tier = Math.max(1, Math.min(3, Number(session.ccmrChallengeTier || currentQuestion.ccmrChallengeTier || 1)));
        const progressRef = ccmrProgressRef(db, studentId, mathPath.canonicalAlignmentKey(activeSkillCode), directFramework);
        const progressUpdate = {
          schemaVersion: 2,
          studentId,
          alignmentKey: mathPath.canonicalAlignmentKey(activeSkillCode),
          teksCode: activeSkillCode,
          framework: directFramework,
          directItemsAttempted: FieldValue.increment(1),
          directItemsCorrect: FieldValue.increment(gradingCore.isCorrect ? 1 : 0),
          [`tier${tier}ItemsAttempted`]: FieldValue.increment(1),
          [`tier${tier}ItemsCorrect`]: FieldValue.increment(gradingCore.isCorrect ? 1 : 0),
          lastChallengeTierSeen: tier,
          lastPracticedAt: now,
          updatedAt: now,
        };
        if (nextStatus === "completed") {
          progressUpdate[`tier${tier}SessionsCompleted`] = FieldValue.increment(1);
          if (ccmrSessionPasses(nextSummary, session.requiredQuestions)) {
            progressUpdate[`tier${tier}SessionsPassed`] = FieldValue.increment(1);
            progressUpdate.lastPassedTier = tier;
            progressUpdate.lastPassedAt = now;
          }
        }
        transaction.set(progressRef, progressUpdate, { merge: true });
      }
    }

    transaction.set(evidenceRef, event);
    transaction.set(sessionRef, nextSession);
    if (nextStatus === "completed") {
      const lockRef = db.collection("activePathLocks").doc(mathPath.opaqueId("pathlock", studentId, session.target.alignmentKey, session.assessmentFramework || "course", session.weeklySlotKey || "open-practice"));
      transaction.delete(lockRef);
    }

    const result = {
      success: true,
      submissionId,
      grading: { ...gradingCore, attemptNumber, attemptsRemaining, questionFinalized },
      feedback: attemptSupport.feedback,
      support: attemptSupport.support,
      // Present only on a finalized question, by construction.
      solutionReview: attemptSupport.solutionReview,
      decision: routed ? routed.lastDecision : null,
      session: publicPathSession(nextSession),
      needsNextQuestion: questionFinalized && nextStatus === "active",
    };
    transaction.set(submissionRef, { studentId, sessionId, submissionId, createdAt: now, result });
    return { duplicate: false, result };
  });

  return transactionResult.result;
}));

// Phase 6A: DOK 3/4 modeling labs are graded from a teacher-authored private
// definition. The browser submits only student telemetry; it never supplies the
// target criteria used to award the score.
exports.submitModelingLab = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const labId = String(request.data?.labId || "").trim();
  const submissionId = String(request.data?.submissionId || "").trim();
  const submission = request.data?.submission && typeof request.data.submission === "object" ? request.data.submission : {};
  if (!assignmentId || !labId || !submissionId) throw new HttpsError("invalid-argument", "assignmentId, labId, and submissionId are required.");
  if (submissionId.length > 180) throw new HttpsError("invalid-argument", "submissionId is too long.");
  if (String(submission.studentHypothesis || "").length > 2000 || String(submission.studentJustification || "").length > 8000) {
    throw new HttpsError("invalid-argument", "Modeling lab written responses exceed the supported length.");
  }
  if (!Array.isArray(submission.trialHistory) || submission.trialHistory.length > 50) throw new HttpsError("invalid-argument", "Modeling labs require at most 50 recorded trials.");
  const db = getFirestore();
  const assignmentRef = db.collection("assignments").doc(assignmentId);
  const labRef = db.collection("modelingLabDefinitions").doc(labId);
  const studentRef = db.collection("grades").doc(studentId);
  const markerRef = db.collection("modelingLabSubmissions").doc(mathPath.opaqueId("labsub", studentId, assignmentId, labId, submissionId));

  const result = await db.runTransaction(async (transaction) => {
    const [marker, assignmentSnapshot, labSnapshot, studentSnapshot] = await Promise.all([
      transaction.get(markerRef),
      transaction.get(assignmentRef),
      transaction.get(labRef),
      transaction.get(studentRef),
    ]);
    if (marker.exists) return marker.data()?.result;
    if (!assignmentSnapshot.exists || !labSnapshot.exists) throw new HttpsError("not-found", "That modeling lab is not available.");
    const assignment = assignmentSnapshot.data() || {};
    const labDefinition = labSnapshot.data() || {};
    if (String(labDefinition.assignmentId || "") !== assignmentId) throw new HttpsError("failed-precondition", "The modeling lab is not attached to this assignment.");
    const studentData = studentSnapshot.exists ? (studentSnapshot.data() || {}) : {};
    const classPeriod = String(studentData.classPeriod || "Unassigned");
    if (!studentMatchesAssignmentAudience({ assignment, classId: studentData.classId || null, classPeriod })) {
      throw new HttpsError("permission-denied", "This modeling lab is not assigned to your MathMaster class.");
    }

    let evaluation;
    try {
      evaluation = labEvaluation.evaluateLabSubmission({
        labDefinition,
        studentHypothesis: submission.studentHypothesis,
        trialHistory: submission.trialHistory,
        finalParameterValues: submission.finalParameterValues,
        studentJustification: submission.studentJustification,
      });
    } catch (error) {
      throw new HttpsError("invalid-argument", `Modeling lab submission could not be evaluated: ${error.message}`);
    }
    const supportSource = submission.supportUsage && typeof submission.supportUsage === "object" ? submission.supportUsage : {};
    const supportUsage = {
      modified: Boolean(supportSource.modified),
      accommodations: Array.isArray(supportSource.accommodations) ? supportSource.accommodations.map(String).slice(0, 20) : [],
      modifications: Array.isArray(supportSource.modifications) ? supportSource.modifications.map(String).slice(0, 20) : [],
      hintUsed: false,
      teacherAssisted: Boolean(supportSource.teacherAssisted),
      scaffoldUsed: false,
      contextScaffoldUsed: false,
      remediationUsed: false,
      workedExampleUsed: false,
      calculatorUsed: Boolean(supportSource.calculatorUsed),
    };
    supportUsage.isMathematicallyIndependent = mathPath.mathematicalIndependence(supportUsage);
    const now = Date.now();
    const eventKey = mathPath.opaqueId("evlab", studentId, assignmentId, labId, submissionId);
    const eventRef = db.collection("grades").doc(studentId).collection("evidenceEvents").doc(eventKey);
    const alignmentKeys = (labDefinition.teksAlignments || []).map(mathPath.canonicalAlignmentKey).filter(Boolean);
    const event = {
      schemaVersion: 1,
      eventKey,
      studentId,
      occurredAt: now,
      alignmentKeys,
      masteryEvidenceKeys: alignmentKeys,
      questionSnapshot: {
        questionInstanceId: `lab:${labId}`,
        questionId: labId,
        familyId: `modelingLab:${labDefinition.labType || "modeling"}`,
        familyVersion: 1,
        questionType: "modelingLab",
        difficultyBand: 5,
        dok: Number(labDefinition.dokLevel) || 3,
      },
      source: { kind: "modelingLab", assignmentId, activityRole: labDefinition.activityRole || "classwork", labId },
      performance: { score: evaluation.compositeScore, isCorrect: evaluation.isMastered, attemptNumber: 1, status: "finalized", isMathematicallyIndependent: supportUsage.isMathematicallyIndependent },
      supportUsage,
      supportTelemetry: mathPath.supportTelemetry(supportUsage),
      modeling: { rubricBreakdown: evaluation.rubricBreakdown, trialCount: evaluation.trialCount, uniqueTrialCount: evaluation.uniqueTrialCount, constraintViolationCount: evaluation.constraintViolations.length },
    };
    const response = { success: true, submissionId, evaluation, gradingAuthority: "server" };
    transaction.set(eventRef, event);
    transaction.set(markerRef, { studentId, assignmentId, labId, submissionId, createdAt: now, result: response });
    return response;
  });
  return result;
});

// --- Phase 6C secure assessment runtime ------------------------------------
// Exam answer keys, response grading, integrity state, and release controls
// remain on the server. A normal browser can monitor and restrict common
// actions, but it is intentionally not represented as an OS-level lockdown
// browser.

const SECURE_EXAM_INTEGRITY_TYPES = new Set([
  "tab_switch", "window_blur", "fullscreen_exit", "copy_paste_attempt", "context_menu", "shortcut_attempt",
]);

function secureExamSessionId(request) {
  const value = String(request.data?.examSessionId || "").trim();
  if (!value || value.length > 180) throw new HttpsError("invalid-argument", "A valid examSessionId is required.");
  return value;
}

function secureExamAlignmentKeys(question = {}) {
  const source = Array.isArray(question.alignmentKeys)
    ? question.alignmentKeys
    : Array.isArray(question.teksAlignments)
      ? question.teksAlignments
      : question.teks ? [question.teks] : [];
  return [...new Set(source.map(mathPath.canonicalAlignmentKey).filter(Boolean))];
}

function secureExamPublicQuestion(question = {}) {
  return secureExam.publicQuestion(
    mathPath.buildSanitizedQuestion(question, question),
    { examCalculatorMode: question.examCalculatorMode || question.calculatorMode || null },
  );
}

function assertStudentExamSession(snapshot, studentId) {
  if (!snapshot.exists || String(snapshot.data()?.studentId || "") !== studentId) {
    throw new HttpsError("not-found", "That secure exam session is not available.");
  }
  return snapshot.data();
}

function assertExamInProgress(session) {
  if (secureExam.TERMINAL_STATES.has(session.status)) throw new HttpsError("failed-precondition", "This exam has already been submitted.");
  if (secureExam.LOCKED_STATES.has(session.status)) throw new HttpsError("failed-precondition", "This exam is locked. Ask the proctor to review the session.");
  if (session.status !== "in_progress") throw new HttpsError("failed-precondition", "This exam is not currently in progress.");
  if (secureExam.isExpired(session)) throw new HttpsError("deadline-exceeded", "The exam time has expired.");
}

/** Teacher action: create a server-owned session for a rostered student. */
exports.createSecureExamSession = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const studentId = String(request.data?.studentId || "").trim();
  const examType = String(request.data?.examType || "").trim();
  const policy = secureExam.policyFor(examType);
  if (!studentId || studentId.length > 180) throw new HttpsError("invalid-argument", "studentId is required.");
  if (!policy) throw new HttpsError("invalid-argument", "Choose a supported exam type.");
  const db = getFirestore();
  const student = await db.collection("grades").doc(studentId).get();
  if (!student.exists || studentId === "test_connection") throw new HttpsError("not-found", "That student is not on the roster.");
  const requestedCount = Number(request.data?.questionCount);
  const requiredQuestions = Number.isInteger(requestedCount) && requestedCount > 0
    ? Math.min(policy.totalQuestions, requestedCount)
    : policy.totalQuestions;
  const ref = db.collection("examSessions").doc();
  const now = Date.now();
  const session = {
    examSessionId: ref.id,
    studentId,
    classPeriod: String(student.data()?.classPeriod || "Unassigned"),
    examType,
    title: String(request.data?.title || policy.title).trim().slice(0, 160) || policy.title,
    status: "not_started",
    requiredQuestions,
    timeLimitSeconds: policy.timeLimitSeconds,
    addedTimeSeconds: 0,
    calculatorMode: policy.calculatorMode,
    accommodationsConfirmed: request.data?.accommodationsConfirmed === true,
    feedbackReleased: false,
    violationCount: 0,
    summary: { completedQuestions: 0, correctQuestions: 0 },
    responses: {},
    usedQuestionIds: [],
    currentQuestion: null,
    createdBy: teacherUid,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(session);
  return { success: true, session: secureExam.publicSession(session, { teacher: true }) };
});

/** Student action: start or resume only their teacher-created session. */
exports.startSecureExamSession = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const db = getFirestore();
  const ref = db.collection("examSessions").doc(examSessionId);
  // Before anything is started or resumed: a course test is only enterable at
  // the stage the Test Cycle says the student is on. A simulation has no
  // `courseTest` block and this is a no-op for it.
  const entrySnapshot = await ref.get();
  await assertCourseTestEntryAllowed(db, assertStudentExamSession(entrySnapshot, studentId), studentId);
  const session = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = assertStudentExamSession(snapshot, studentId);
    if (secureExam.TERMINAL_STATES.has(current.status)) return current;
    if (secureExam.LOCKED_STATES.has(current.status)) return current;
    if (current.status !== "not_started" && current.status !== "in_progress") throw new HttpsError("failed-precondition", "This exam cannot be started.");
    if (current.status === "in_progress") return current;
    const next = { ...current, status: "in_progress", startedAt: Date.now(), updatedAt: Date.now() };
    transaction.set(ref, next);
    return next;
  });
  await syncTestCycleSessionState(db, session);
  return { success: true, session: secureExam.publicSession(session) };
});

/** Student dashboard: discover only the caller's assigned secure sessions. */
exports.listStudentSecureExamSessions = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const snapshot = await getFirestore().collection("examSessions").where("studentId", "==", studentId).limit(50).get();
  const sessions = snapshot.docs
    .map((docSnapshot) => secureExam.publicSession(docSnapshot.data()))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return { sessions };
});

/** Student review: released correctness plus the original sanitized item and standards. */
exports.getStudentSecureExamReview = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const snapshot = await getFirestore().collection("examSessions").doc(examSessionId).get();
  const session = assertStudentExamSession(snapshot, studentId);
  if (!secureExam.TERMINAL_STATES.has(session.status)) {
    throw new HttpsError("failed-precondition", "Finish the exam before opening review.");
  }
  if (session.feedbackReleased !== true) {
    throw new HttpsError("failed-precondition", "Your teacher has not released feedback for this exam yet.");
  }
  const review = secureExam.publicReview(session);
  return { success: true, review };
});

/** Issue one sanitized exam item; expected answers never leave Functions. */
exports.issueSecureExamQuestion = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const db = getFirestore();
  const sessionRef = db.collection("examSessions").doc(examSessionId);
  const snapshot = await sessionRef.get();
  const session = assertStudentExamSession(snapshot, studentId);
  assertExamInProgress(session);
  if (session.currentQuestion) {
    return { questionInstance: secureExamPublicQuestion(session.currentQuestion), draftResponse: session.currentQuestion.draftResponse || null, session: secureExam.publicSession(session) };
  }
  if (Number(session.summary?.completedQuestions || 0) >= Number(session.requiredQuestions || 1)) {
    throw new HttpsError("failed-precondition", "All required exam questions have been completed.");
  }
  // A teacher-created course Test/Retest reads its next item from the issuance
  // plan written before the student could start. The simulation path below is
  // untouched, which is what keeps SAT/ACT/TSIA2/ASVAB delivery identical.
  if (secureExam.isCourseTestSession(session)) {
    const issuedCourseTest = await issueCourseTestQuestion(db, { sessionRef, session, studentId });
    return {
      questionInstance: secureExamPublicQuestion(issuedCourseTest.currentQuestion),
      draftResponse: issuedCourseTest.currentQuestion?.draftResponse || null,
      session: secureExam.publicSession(issuedCourseTest),
    };
  }
  // Secure simulations use the same verified, generator-backed assessment
  // families as CCMR My Path. The old `examQuestionBank` had no bundled seed,
  // so a teacher could create an exam that had nothing reliable to issue.
  // Selecting from the trusted built-in Path package keeps exam format, answer
  // generation and grading on the same server-side contract students already
  // use for assessment-specific Path practice.
  const used = new Set(Array.isArray(session.usedQuestionIds) ? session.usedQuestionIds.map(String) : []);
  const targetDomainId = secureExam.nextDomainId(session);
  const assessmentItems = loadBuiltInStarterPathSeed().filter((question) => {
    const context = question?.assessmentContext || {};
    return question?.active !== false
      && context.examStyle === true
      && String(context.framework || "") === session.examType
      && !used.has(String(question.id || ""));
  });
  const domainFor = (question) => (Array.isArray(question?.alignments) ? question.alignments : [])
    .find((entry) => String(entry?.framework || "") === session.examType && String(entry?.evidenceMode || entry?.alignmentType || "") === "direct")?.domainId || null;
  const domainCandidates = targetDomainId ? assessmentItems.filter((question) => domainFor(question) === targetDomainId) : assessmentItems;
  const candidates = domainCandidates.length ? domainCandidates : assessmentItems;
  if (!candidates.length) throw new HttpsError("failed-precondition", `No unused secure ${session.examType} exam items are available.`);
  candidates.sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")));
  const authored = candidates[Number(session.summary?.completedQuestions || 0) % candidates.length];
  const questionInstanceId = mathPath.runtimeId("examq");
  const instantiated = await mathPath.instantiateQuestion(authored, `${examSessionId}|${questionInstanceId}`);
  if (!instantiated.question) throw new HttpsError("failed-precondition", "This secure exam item could not be generated.");
  const issuedQuestion = instantiated.question;
  const issuePlan = await mathPath.buildIssuePlan(issuedQuestion);
  if (!issuePlan.issuable) throw new HttpsError("failed-precondition", "This secure exam item could not be graded securely.");
  const assessmentDomainId = domainFor(authored);
  const currentQuestion = {
    ...issuedQuestion,
    bankQuestionId: authored.id,
    alignmentKeys: secureExamAlignmentKeys(issuedQuestion),
    questionInstanceId,
    attemptsAllowed: 1,
    attemptsUsed: 0,
    assessmentDomainId,
    generatorParameters: instantiated.parameters,
    privateGrading: issuePlan.privateGrading,
    ...(issuePlan.toolPayload || {}),
  };
  const issued = await db.runTransaction(async (transaction) => {
    const freshSnapshot = await transaction.get(sessionRef);
    const fresh = assertStudentExamSession(freshSnapshot, studentId);
    assertExamInProgress(fresh);
    if (fresh.currentQuestion) return fresh;
    const next = { ...fresh, currentQuestion, updatedAt: Date.now() };
    transaction.set(sessionRef, next);
    return next;
  });
  return { questionInstance: secureExamPublicQuestion(issued.currentQuestion), draftResponse: issued.currentQuestion?.draftResponse || null, session: secureExam.publicSession(issued) };
});

function sanitizeSecureExamDraft(responsePayload, supportUsage) {
  const source = responsePayload?.responses && typeof responsePayload.responses === "object" && !Array.isArray(responsePayload.responses) ? responsePayload.responses : {};
  const responses = {};
  Object.entries(source).slice(0, 20).forEach(([key, value]) => {
    const id = String(key).trim().slice(0, 120);
    if (id) responses[id] = String(value ?? "").slice(0, 2000);
  });
  if (JSON.stringify(responses).length > 10000) throw new HttpsError("invalid-argument", "Secure exam draft is too large.");
  const sourceSupport = supportUsage && typeof supportUsage === "object" ? supportUsage : {};
  return {
    responsePayload: { responses },
    supportUsage: {
      accommodations: Array.isArray(sourceSupport.accommodations) ? sourceSupport.accommodations.map(String).slice(0, 20) : [],
      modifications: Array.isArray(sourceSupport.modifications) ? sourceSupport.modifications.map(String).slice(0, 20) : [],
      calculatorUsed: Boolean(sourceSupport.calculatorUsed),
      teacherAssisted: Boolean(sourceSupport.teacherAssisted),
    },
  };
}

/** Transactional draft autosave. Draft values are student-authored and private. */
exports.saveSecureExamDraft = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const questionInstanceId = String(request.data?.questionInstanceId || "").trim();
  if (!questionInstanceId) throw new HttpsError("invalid-argument", "questionInstanceId is required.");
  const draft = sanitizeSecureExamDraft(request.data?.responsePayload, request.data?.supportUsage);
  const db = getFirestore();
  const ref = db.collection("examSessions").doc(examSessionId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const session = assertStudentExamSession(snapshot, studentId);
    assertExamInProgress(session);
    if (!session.currentQuestion || session.currentQuestion.questionInstanceId !== questionInstanceId) throw new HttpsError("failed-precondition", "That question is no longer active.");
    transaction.set(ref, { ...session, currentQuestion: { ...session.currentQuestion, draftResponse: draft }, updatedAt: Date.now() });
  });
  return { success: true, recorded: true };
});

/** Grade and autosave one secure response. Correctness stays server-only. */
exports.submitSecureExamResponse = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const questionInstanceId = String(request.data?.questionInstanceId || "").trim();
  const submissionId = String(request.data?.submissionId || "").trim();
  if (!questionInstanceId || !submissionId || submissionId.length > 180) throw new HttpsError("invalid-argument", "questionInstanceId and a valid submissionId are required.");
  const db = getFirestore();
  const sessionRef = db.collection("examSessions").doc(examSessionId);
  const markerRef = db.collection("examSubmissions").doc(mathPath.opaqueId("examsub", examSessionId, submissionId));
  const result = await db.runTransaction(async (transaction) => {
    const [sessionSnapshot, marker] = await Promise.all([transaction.get(sessionRef), transaction.get(markerRef)]);
    if (marker.exists) return marker.data()?.result;
    const session = assertStudentExamSession(sessionSnapshot, studentId);
    assertExamInProgress(session);
    const current = session.currentQuestion;
    if (!current || current.questionInstanceId !== questionInstanceId) throw new HttpsError("failed-precondition", "That question is no longer active.");
    // Awaited: `gradeResponse` became async when scalar equivalence moved into
    // the shared ESM module. Reading `.isCorrect` off the un-awaited promise
    // marked every secure-exam answer wrong and wrote an undefined score.
    const grading = await mathPath.gradeResponse(current.privateGrading, request.data?.responsePayload || {});
    const now = Date.now();
    const completedQuestions = Number(session.summary?.completedQuestions || 0) + 1;
    const correctQuestions = Number(session.summary?.correctQuestions || 0) + (grading.isCorrect ? 1 : 0);
    const safeSupport = request.data?.supportUsage && typeof request.data.supportUsage === "object" ? {
      accommodations: Array.isArray(request.data.supportUsage.accommodations) ? request.data.supportUsage.accommodations.map(String).slice(0, 20) : [],
      modifications: Array.isArray(request.data.supportUsage.modifications) ? request.data.supportUsage.modifications.map(String).slice(0, 20) : [],
      calculatorUsed: Boolean(request.data.supportUsage.calculatorUsed),
      teacherAssisted: Boolean(request.data.supportUsage.teacherAssisted),
    } : {};
    const safeResponsePayload = sanitizeSecureExamDraft(request.data?.responsePayload, safeSupport).responsePayload;
    const responseRecord = {
      questionInstanceId,
      bankQuestionId: current.bankQuestionId,
      alignmentKeys: current.alignmentKeys || [],
      questionType: current.questionType,
      familyId: current.familyId,
      assessmentDomainId: current.assessmentDomainId || null,
      dok: current.dok,
      // Blueprint provenance for a course Test. Null on a simulation, which is
      // why the corrections algorithm only ever runs on a Test Cycle session.
      slotId: current.slotId || null,
      targetId: current.targetId || null,
      planWeight: current.planWeight ?? null,
      grading: { score: grading.score, isCorrect: grading.isCorrect },
      supportUsage: safeSupport,
      // Stored server-side while feedback is held. `publicSession` strips the
      // whole responses map, and `publicReview` releases only this sanitized
      // question/response after an authenticated teacher releases feedback.
      questionSnapshot: mathPath.buildSanitizedQuestion(current, current),
      responsePayload: safeResponsePayload,
      submittedAt: now,
    };
    const finished = completedQuestions >= Number(session.requiredQuestions || 1);
    const next = {
      ...session,
      status: finished ? "submitted" : "in_progress",
      submittedAt: finished ? now : session.submittedAt || null,
      summary: { completedQuestions, correctQuestions },
      responses: { ...(session.responses || {}), [questionInstanceId]: responseRecord },
      usedQuestionIds: [...new Set([...(session.usedQuestionIds || []), current.bankQuestionId])],
      currentQuestion: null,
      updatedAt: now,
    };
    const publicResult = { success: true, submissionId, recorded: true, correctnessReleased: false, needsNextQuestion: !finished, session: secureExam.publicSession(next) };
    transaction.set(sessionRef, next);
    transaction.set(markerRef, { examSessionId, studentId, submittedSlotId: current.slotId || null, submissionId, createdAt: now, result: publicResult });
    return publicResult;
  });
  // A finished course Test moves the student's card from "Test" to "submitted"
  // without exposing a score, which is the whole point of teacher release.
  if (result?.needsNextQuestion === false) {
    const finishedSnapshot = await sessionRef.get();
    if (finishedSnapshot.exists) await syncTestCycleSessionState(db, finishedSnapshot.data());
  }
  return result;
});

/** Student-observed browser integrity events are idempotent and can only lock. */
exports.recordSecureExamIntegrityEvent = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const eventId = String(request.data?.eventId || "").trim();
  const type = String(request.data?.type || "").trim();
  if (!eventId || eventId.length > 180 || !SECURE_EXAM_INTEGRITY_TYPES.has(type)) throw new HttpsError("invalid-argument", "A valid integrity event is required.");
  const details = request.data?.details && typeof request.data.details === "object" ? request.data.details : {};
  if (JSON.stringify(details).length > 2000) throw new HttpsError("invalid-argument", "Integrity event details are too large.");
  const db = getFirestore();
  const sessionRef = db.collection("examSessions").doc(examSessionId);
  const eventRef = db.collection("examIntegrityEvents").doc(mathPath.opaqueId("integrity", examSessionId, eventId));
  return db.runTransaction(async (transaction) => {
    const [sessionSnapshot, existingEvent] = await Promise.all([transaction.get(sessionRef), transaction.get(eventRef)]);
    const session = assertStudentExamSession(sessionSnapshot, studentId);
    if (existingEvent.exists) return { success: true, duplicate: true, status: session.status, violationCount: Number(session.violationCount || 0) };
    if (secureExam.TERMINAL_STATES.has(session.status)) throw new HttpsError("failed-precondition", "This exam is already submitted.");
    const count = Number(session.violationCount || 0) + 1;
    const status = count >= 3 && session.status === "in_progress" ? "locked_integrity" : session.status;
    const now = Date.now();
    transaction.set(eventRef, { eventId, examSessionId, studentId, type, details, receivedAt: now });
    transaction.set(sessionRef, { ...session, violationCount: count, status, lockReason: status === "locked_integrity" ? "Integrity event threshold reached; proctor review required." : session.lockReason || null, lockedAt: status === "locked_integrity" ? now : session.lockedAt || null, updatedAt: now });
    return { success: true, status, violationCount: count };
  });
});

async function applyOpenSecureExamDraft(session, now) {
  const current = session.currentQuestion;
  const draft = current?.draftResponse;
  const responses = draft?.responsePayload?.responses && typeof draft.responsePayload.responses === "object" ? draft.responsePayload.responses : {};
  if (!current || !Object.values(responses).some((value) => String(value ?? "").trim())) return session;
  const grading = await mathPath.gradeResponse(current.privateGrading, draft.responsePayload);
  const responseRecord = {
    questionInstanceId: current.questionInstanceId,
    bankQuestionId: current.bankQuestionId,
    alignmentKeys: current.alignmentKeys || [],
    questionType: current.questionType,
    familyId: current.familyId,
    dok: current.dok,
    slotId: current.slotId || null,
    targetId: current.targetId || null,
    planWeight: current.planWeight ?? null,
    grading: { score: grading.score, isCorrect: grading.isCorrect },
    supportUsage: draft.supportUsage || {},
    questionSnapshot: mathPath.buildSanitizedQuestion(current, current),
    responsePayload: draft.responsePayload || { responses: {} },
    submittedAt: now,
    finalizedFromAutosave: true,
  };
  return {
    ...session,
    summary: {
      completedQuestions: Number(session.summary?.completedQuestions || 0) + 1,
      correctQuestions: Number(session.summary?.correctQuestions || 0) + (grading.isCorrect ? 1 : 0),
    },
    responses: { ...(session.responses || {}), [current.questionInstanceId]: responseRecord },
    usedQuestionIds: [...new Set([...(session.usedQuestionIds || []), current.bankQuestionId])],
  };
}

/** Student submit / verified timer autosubmit. */
exports.finalizeSecureExam = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const examSessionId = secureExamSessionId(request);
  const reason = request.data?.reason === "timeExpired" ? "timeExpired" : "studentSubmit";
  const db = getFirestore();
  const ref = db.collection("examSessions").doc(examSessionId);
  const next = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const session = assertStudentExamSession(snapshot, studentId);
    if (secureExam.TERMINAL_STATES.has(session.status)) return session;
    if (reason === "timeExpired" && !secureExam.isExpired(session)) throw new HttpsError("failed-precondition", "The server-side exam deadline has not been reached.");
    if (reason !== "timeExpired" && secureExam.LOCKED_STATES.has(session.status)) throw new HttpsError("failed-precondition", "A locked exam must be resolved by the proctor.");
    const now = Date.now();
    const withDraft = await applyOpenSecureExamDraft(session, now);
    const updated = { ...withDraft, status: reason === "timeExpired" ? "time_expired" : "submitted", submittedAt: now, currentQuestion: null, updatedAt: now };
    transaction.set(ref, updated);
    return updated;
  });
  await syncTestCycleSessionState(db, next);
  return { success: true, session: secureExam.publicSession(next) };
});

/** Teacher-only live monitor summaries. No answer payloads are returned. */
exports.listProctorExamSessions = onCall(async (request) => {
  await requireTeacher(request);
  const examType = String(request.data?.examType || "").trim();
  const db = getFirestore();
  let query = db.collection("examSessions");
  if (examType && secureExam.supportsExamType(examType)) query = query.where("examType", "==", examType);
  const snapshot = await query.limit(200).get();
  // Course-test sessions are scoped to the teacher of record for the student's
  // class. Simulation scope is unchanged: widening or narrowing it is existing
  // behaviour this change has no business touching.
  const ownedClassIds = await teacherOwnedClassIds(db, request);
  const sessions = snapshot.docs
    .map((docSnapshot) => docSnapshot.data())
    .filter((session) => !secureExam.isCourseTestSession(session)
      || ownedClassIds === null
      || ownedClassIds.has(String(session.classId || "")));
  return { sessions: sessions.map((session) => secureExam.publicSession(session, { teacher: true })) };
});

function releasedExamEvidence(session, response) {
  const alignmentKeys = (response.alignmentKeys || []).map(mathPath.canonicalAlignmentKey).filter(Boolean);
  const supportUsage = response.supportUsage || {};
  return {
    schemaVersion: 1,
    studentId: session.studentId,
    occurredAt: Number(response.submittedAt) || Date.now(),
    alignmentKeys,
    masteryEvidenceKeys: alignmentKeys,
    questionSnapshot: { questionInstanceId: response.questionInstanceId, questionId: response.bankQuestionId, familyId: response.familyId, questionType: response.questionType, dok: response.dok },
    source: { kind: "secureExam", examSessionId: session.examSessionId, examType: session.examType, activityRole: "test" },
    performance: { score: Number(response.grading?.score) || 0, isCorrect: Boolean(response.grading?.isCorrect), attemptNumber: 1, status: "finalized", isMathematicallyIndependent: mathPath.mathematicalIndependence(supportUsage) },
    supportUsage,
    supportTelemetry: mathPath.supportTelemetry(supportUsage),
  };
}

/** Authenticated proctor controls replace the insecure client-side PIN draft. */
exports.proctorExamAction = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const examSessionId = secureExamSessionId(request);
  const action = String(request.data?.action || "").trim();
  if (!["unlock", "lock", "extendTime", "forceSubmit", "releaseFeedback"].includes(action)) throw new HttpsError("invalid-argument", "Choose a supported proctor action.");
  const db = getFirestore();
  const ref = db.collection("examSessions").doc(examSessionId);
  // Releasing a COURSE test writes a recorded assessment grade and pushes it
  // to Google Classroom, so it needs more than "some teacher is signed in".
  const proctorSnapshot = await ref.get();
  if (!proctorSnapshot.exists) throw new HttpsError("not-found", "Exam session not found.");
  const proctorSession = proctorSnapshot.data() || {};
  await assertMayProctorCourseTest(db, request, proctorSession);
  if (
    action === "releaseFeedback"
    && secureExam.isCourseTestSession(proctorSession)
    && !(await courseTestSessionIsCurrent(db, proctorSession))
  ) {
    // A session a teacher reset is still sitting in the proctor monitor with a
    // Release button. Releasing it would write its old score over the
    // replacement attempt and rebuild corrections from stale evidence.
    throw new HttpsError(
      "failed-precondition",
      "This secure session was replaced by a reset. Release the student's current session instead.",
    );
  }
  const next = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "Exam session not found.");
    const session = snapshot.data();
    const now = Date.now();
    if (action === "releaseFeedback") {
      if (!secureExam.TERMINAL_STATES.has(session.status)) throw new HttpsError("failed-precondition", "Submit the exam before releasing feedback.");
      if (!session.feedbackReleased) {
        Object.values(session.responses || {}).forEach((response) => {
          const eventKey = mathPath.opaqueId("evexam", examSessionId, response.questionInstanceId);
          const eventRef = db.collection("grades").doc(session.studentId).collection("evidenceEvents").doc(eventKey);
          transaction.set(eventRef, { ...releasedExamEvidence(session, response), eventKey });
        });
      }
      const updated = { ...session, feedbackReleased: true, feedbackReleasedAt: now, feedbackReleasedBy: teacherUid, updatedAt: now };
      transaction.set(ref, updated);
      return updated;
    }
    if (secureExam.TERMINAL_STATES.has(session.status)) throw new HttpsError("failed-precondition", "This submitted exam cannot be changed except to release feedback.");
    let updated = { ...session, updatedAt: now, lastProctorActionBy: teacherUid };
    if (action === "unlock") updated = { ...updated, status: "in_progress", lockReason: null, unlockedAt: now };
    if (action === "lock") updated = { ...updated, status: "locked_proctor", lockReason: "Locked by proctor.", lockedAt: now };
    if (action === "extendTime") {
      const minutes = Math.max(1, Math.min(120, Math.round(Number(request.data?.minutes) || 5)));
      updated = { ...updated, addedTimeSeconds: Number(session.addedTimeSeconds || 0) + minutes * 60 };
    }
    if (action === "forceSubmit") updated = { ...(await applyOpenSecureExamDraft(updated, now)), status: "force_submitted", submittedAt: now, currentQuestion: null };
    transaction.set(ref, updated);
    return updated;
  });
  // A course Test releases exactly like a simulation and then, additionally,
  // records the assessment grade and builds this student's corrections. A
  // simulation session has no `courseTest` block and both helpers no-op.
  if (action === "releaseFeedback") await applyTestCycleFeedbackRelease(db, next);
  else await syncTestCycleSessionState(db, next);
  return { success: true, session: secureExam.publicSession(next, { teacher: true }) };
});

// --- Test Cycle: one assignment, four stages, one recorded grade ------------
//
// A Test Cycle is ONE teacher-authored package that a student meets as ONE
// card: Review -> secure Test -> Corrections (if needed) -> secure Retest.
//
// WHAT IS DELIBERATELY NOT HERE.
//
// There is no second testing engine. The Test and the Retest are ordinary
// `examSessions` documents with `examType: "courseTest"`, and they run through
// the same `startSecureExamSession`, `issueSecureExamQuestion`,
// `saveSecureExamDraft`, `submitSecureExamResponse`,
// `recordSecureExamIntegrityEvent`, `finalizeSecureExam` and
// `proctorExamAction` as the SAT, ACT, TSIA2 and ASVAB simulations. The only
// course-test-specific thing in the secure path is WHICH item comes next, and
// that was decided before the student sat down.
//
// There is also no grade math here. `recordedGrade = max(originalTestGrade,
// min(rawRetestGrade, cap))` lives in functions/shared/testCycleGrade.mjs and
// is the same function the browser reads.

const TEST_CYCLE_RECORDS = "testCycleRecords";
const TEST_CYCLE_CORRECTION_PLANS = "testCycleCorrectionPlans";
const TEST_CYCLE_RETEST_PLANS = "testCycleRetestPlans";
const TEST_CYCLE_MAX_BATCH_STUDENTS = 200;

function testCycleRecordKey(assignmentId, studentId) {
  return `${String(assignmentId || "").trim()}__${String(studentId || "").trim()}`;
}

async function resolveSecureTestBlueprint(db, assignment, shared) {
  const embedded = shared.blueprint.normalizeTestBlueprint(assignment?.testBlueprint);
  if (embedded.targets.length) {
    return { blueprint: embedded, blueprintSource: assignment.testBlueprint, secureReferencePresent: false, secureReferenceResolved: false, secureManifestId: null };
  }
  const secureManifestId = String(
    assignment?.secureTestReference?.manifestId
      || assignment?.secureTestReference?.blueprintId
      || assignment?.secureTestReference?.id
      || "",
  ).trim();
  if (!secureManifestId) {
    return { blueprint: embedded, blueprintSource: null, secureReferencePresent: false, secureReferenceResolved: false, secureManifestId: null };
  }
  const manifestSnapshot = await db.collection("secureTestManifests").doc(secureManifestId).get();
  const blueprintSource = manifestSnapshot.exists
    ? manifestSnapshot.data()?.testBlueprint || manifestSnapshot.data()?.blueprint
    : null;
  const blueprint = shared.blueprint.normalizeTestBlueprint(blueprintSource);
  return {
    blueprint,
    blueprintSource,
    secureReferencePresent: true,
    secureReferenceResolved: blueprint.targets.length > 0,
    secureManifestId,
  };
}

async function loadTestCycleAssignment(db, assignmentId, { allowInvalid = false } = {}) {
  const id = String(assignmentId || "").trim();
  if (!id || id.length > 180) throw new HttpsError("invalid-argument", "A valid assignmentId is required.");
  const snapshot = await db.collection("assignments").doc(id).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That assignment was not found.");
  const assignment = snapshot.data() || {};
  const shared = await testCycleLib.shared();
  if (!shared.policy.declaresTestCycle(assignment)) {
    throw new HttpsError("failed-precondition", "That assignment is not a MathMaster Test Cycle.");
  }
  const policy = shared.policy.normalizeTestCyclePolicy(assignment.assessmentPolicy);
  if (!policy) {
    console.error("test_cycle_contract_invalid", { assignmentId: id, reason: "TEST_CYCLE_POLICY_MISSING" });
    if (!allowInvalid) throw new HttpsError("failed-precondition", "This assessment is not available yet. Your teacher has been notified.", {
      diagnosticCode: "TEST_CYCLE_POLICY_MISSING",
    });
  }

  // A secure reference contains only an opaque manifest id in the assignment
  // students can read. The actual blueprint remains in a server-only
  // collection and is resolved here, never serialized by this callable.
  const resolution = await resolveSecureTestBlueprint(db, assignment, shared);
  const { blueprint, blueprintSource, secureManifestId } = resolution;
  if (!blueprint.targets.length) {
    console.error("test_cycle_contract_invalid", {
      assignmentId: id,
      reason: "TEST_CYCLE_TEST_PHASE_MISSING",
      secureManifestId: secureManifestId || null,
    });
    if (!allowInvalid) throw new HttpsError("failed-precondition", "This assessment is not available yet. Your teacher has been notified.", {
      diagnosticCode: "TEST_CYCLE_TEST_PHASE_MISSING",
    });
  }
  const resolvedAssignment = blueprintSource === assignment.testBlueprint
    ? assignment
    : { ...assignment, testBlueprint: blueprintSource };
  return {
    assignmentId: id,
    snapshot,
    assignment: resolvedAssignment,
    policy: policy || shared.policy.defaultTestCyclePolicy(),
    blueprint,
    secureReferenceResolved: resolution.secureReferenceResolved,
    shared,
  };
}

/**
 * The approved, validated families a blueprint is allowed to draw on.
 *
 * The Firestore Path bank is authoritative; the bundled starter/course seeds
 * fill in anything a fresh install has not imported yet, which is the same
 * fallback the secure simulations already use. A family that is in neither is
 * simply absent, and preflight is what refuses to publish a blueprint whose
 * families are absent — issuance must never silently substitute something else.
 */
async function resolveBlueprintFamilies(db, familyIds) {
  const ids = [...new Set((Array.isArray(familyIds) ? familyIds : []).map((value) => String(value || "").trim()).filter(Boolean))];
  if (!ids.length) return [];
  const found = new Map();
  for (let index = 0; index < ids.length; index += 100) {
    const refs = ids.slice(index, index + 100).map((id) => db.collection("pathQuestionBank").doc(id));
    // eslint-disable-next-line no-await-in-loop
    const snapshots = await db.getAll(...refs);
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) found.set(snapshot.id, { id: snapshot.id, ...snapshot.data() });
    });
  }
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const bundled = new Map();
    [...loadBuiltInStarterPathSeed(), ...loadBuiltInCoursePathSeed()].forEach((item) => {
      const id = String(item?.id || "").trim();
      if (id && !bundled.has(id)) bundled.set(id, item);
    });
    missing.forEach((id) => {
      if (bundled.has(id)) found.set(id, bundled.get(id));
    });
  }
  return ids.map((id) => found.get(id)).filter(Boolean);
}

/** Every family any target of this blueprint names. */
function blueprintFamilyIds(blueprint) {
  return [...new Set((blueprint?.targets || []).flatMap((target) => target.familyIds || []))];
}

/**
 * Can every declared family actually be issued and privately graded?
 *
 * Answered by generating from the template and running the real issue gate, not
 * by inspecting the record — the thing that reaches a student is an instance.
 */
async function testCycleFamilyIssuability(families) {
  const verdicts = {};
  for (const family of families) {
    const id = String(family?.id || family?.familyId || "").trim();
    if (!id) continue;
    // eslint-disable-next-line no-await-in-loop
    const plan = await mathPath.buildTemplateIssuePlan(family, { samples: 4 });
    verdicts[id] = { issuable: plan.issuable === true, reason: plan.reason || null };
  }
  return verdicts;
}

async function runTestCyclePreflight(db, { assignment, policy, blueprint, shared, secureReferenceResolved = false }) {
  const families = await resolveBlueprintFamilies(db, blueprintFamilyIds(blueprint));
  const familyIssuability = await testCycleFamilyIssuability(families);
  return {
    families,
    result: shared.preflight.preflightTestCycle({ assignment, policy, blueprint, families, familyIssuability, secureReferenceResolved }),
  };
}

/** The canonical recorded grade, projected onto the student's grade document. */
function testCycleGradeProjection(record, gradeState, stage) {
  return {
    recordedGrade: gradeState.recordedGrade,
    originalTestGrade: gradeState.originalTestGrade,
    rawRetestGrade: gradeState.rawRetestGrade,
    retestCappedContribution: gradeState.retestCappedContribution,
    maxRecordedGrade: gradeState.maxRecordedGrade,
    passingScore: gradeState.passingScore,
    recordedGradeSource: gradeState.recordedGradeSource,
    retestCapApplied: gradeState.retestCapApplied,
    reason: gradeState.reason,
    stage: stage || null,
    blueprintId: record.blueprintId || null,
    updatedAt: Date.now(),
  };
}

/**
 * Write the record and its grade projection together.
 *
 * The projection on `grades/{studentId}.testCycleGrades[assignmentId]` is what
 * the Classroom passback trigger watches. It is a PROJECTION: every reader
 * recomputes the grade from the record before showing it, so a stale projection
 * can move a Classroom grade late but can never invent a different number.
 */
async function persistTestCycleRecord(db, record, { shared, policy, stage = null }) {
  const normalized = shared.record.normalizeTestCycleRecord(record);
  const gradeState = shared.record.recordGradeState(normalized, policy);
  const resolvedStage = stage || shared.stages.resolveTestCycleStage({ policy, record: normalized })?.stage || null;
  const document = {
    ...normalized,
    recordedGrade: gradeState.recordedGrade,
    stage: resolvedStage,
    updatedAt: Date.now(),
  };
  await db.collection(TEST_CYCLE_RECORDS).doc(normalized.recordId).set(document);
  const gradeRef = db.collection("grades").doc(normalized.studentId);
  const gradeSnapshot = await gradeRef.get();
  if (gradeSnapshot.exists) {
    await gradeRef.update(
      new FieldPath("testCycleGrades", normalized.assignmentId),
      testCycleGradeProjection(document, gradeState, resolvedStage),
    );
  }
  return { record: document, gradeState, stage: resolvedStage };
}

async function readTestCycleRecord(db, assignmentId, studentId, shared) {
  const snapshot = await db.collection(TEST_CYCLE_RECORDS).doc(testCycleRecordKey(assignmentId, studentId)).get();
  return shared.record.normalizeTestCycleRecord(
    snapshot.exists ? snapshot.data() : { assignmentId, studentId },
  );
}

/**
 * Create one student's secure course-test session from a stored issuance plan.
 *
 * The plan is computed and written with the session, before the student can
 * start it. That ordering is the whole no-live-AI guarantee: by the time the
 * exam is enterable, every question it will ask is already decided.
 */
async function createCourseTestSession(db, {
  assignmentId,
  assignment,
  studentId,
  studentData,
  blueprint,
  plan,
  cycleStage,
  teacherUid,
  title,
}) {
  const ref = db.collection("examSessions").doc();
  const now = Date.now();
  const session = {
    examSessionId: ref.id,
    studentId,
    classId: String(studentData?.classId || "") || null,
    classPeriod: String(studentData?.classPeriod || "Unassigned"),
    examType: secureExam.COURSE_TEST_EXAM_TYPE,
    title: String(title || blueprint.title || assignment?.title || "Course Test").slice(0, 160),
    status: "not_started",
    requiredQuestions: plan.totalQuestions,
    timeLimitSeconds: blueprint.timeLimitSeconds,
    addedTimeSeconds: 0,
    calculatorMode: blueprint.calculatorMode,
    accommodationsConfirmed: false,
    feedbackReleased: false,
    violationCount: 0,
    summary: { completedQuestions: 0, correctQuestions: 0 },
    responses: {},
    usedQuestionIds: [],
    currentQuestion: null,
    courseTest: {
      assignmentId,
      cycleStage,
      blueprintId: plan.blueprintId,
      blueprintVersion: plan.blueprintVersion,
      planId: plan.planId,
      attempt: plan.attempt,
      recordId: testCycleRecordKey(assignmentId, studentId),
    },
    // Stored, never returned to a client: `publicSession` strips it.
    issuancePlan: plan,
    createdBy: teacherUid || null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(session);
  return session;
}

/**
 * Is this student allowed into THIS secure course-test session right now?
 *
 * THE HOLE THIS CLOSES. Course-test sessions are created for a whole class at
 * once, well before any student finishes Review — so a session exists, and
 * `startSecureExamSession` on its own only asks "is it yours, and is it
 * startable?". Any surface that lists exam sessions could therefore hand a
 * student a Start button for a Test they have not unlocked, or let them resume
 * a Retest a teacher has closed. The Tests & Exams dashboard is exactly such a
 * surface.
 *
 * The stage machine is the authority, so the gate is enforced HERE, on the
 * server, in the one call every entry path must make. A screen that forgets to
 * check now fails closed instead of leaking an exam.
 *
 * It also pins the session to the record's CURRENT session for that stage: a
 * session superseded by a teacher reset is not enterable, whatever its status.
 */
async function assertCourseTestEntryAllowed(db, session, studentId) {
  const courseTest = session?.courseTest;
  if (!courseTest?.assignmentId) return;
  const shared = await testCycleLib.shared();
  const assignmentSnapshot = await db.collection("assignments").doc(String(courseTest.assignmentId)).get();
  if (!assignmentSnapshot.exists) throw new HttpsError("failed-precondition", "This assessment is no longer available.");
  const assignment = assignmentSnapshot.data() || {};
  const policy = shared.policy.normalizeTestCyclePolicy(assignment.assessmentPolicy);
  if (!policy) throw new HttpsError("failed-precondition", "This assessment is no longer a Test Cycle.");

  const isRetest = String(courseTest.cycleStage) === shared.issuance.CYCLE_STAGE.RETEST;
  const [gradeSnapshot, record] = await Promise.all([
    db.collection("grades").doc(studentId).get(),
    readTestCycleRecord(db, courseTest.assignmentId, studentId, shared),
  ]);

  /*
   * SUPERSESSION IS CHECKED BEFORE ANYTHING ELSE, TERMINAL STATE INCLUDED.
   *
   * A reset force-submits the session it replaces, so a superseded session is
   * always terminal. Checking "is it finished?" first therefore let the
   * discarded session through and showed the student "Exam recorded" — which
   * is a lie about work the reset threw away.
   *
   * Exact match, for the same reason the release guard demands one: a reset
   * empties the stage, and an empty stage must not readmit what it discarded.
   */
  const currentSessionId = isRetest ? record.retest.examSessionId : record.test.examSessionId;
  if (String(currentSessionId || "") !== String(session.examSessionId || "")) {
    throw new HttpsError("failed-precondition", "This secure session was replaced by your teacher. Reopen the assessment from Assignments.");
  }

  // A session that is still the current one and has simply been finished keeps
  // the existing behaviour: `startSecureExamSession` hands it back and the
  // container shows "Exam recorded", rather than an error the student cannot
  // act on.
  if (secureExam.TERMINAL_STATES.has(session.status)) return;

  const tracker = gradeSnapshot.data()?.gradesByAssignment?.[courseTest.assignmentId] || {};
  const state = shared.stages.resolveTestCycleStage({
    policy,
    record,
    reviewProgress: testCycleLib.reviewProgress(assignment, tracker),
  });
  const expectedStage = isRetest
    ? shared.stages.TEST_CYCLE_STAGE.RETEST
    : shared.stages.TEST_CYCLE_STAGE.TEST;
  if (state?.stage !== expectedStage || state.canEnter !== true) {
    throw new HttpsError("failed-precondition", state?.detail || "This part of the assessment is not open to you yet.");
  }
}

/**
 * The classes this caller is teacher of record for, or null for "all of them".
 *
 * Null means the root administrator, who is deliberately not filtered. Every
 * other teacher gets a set, and a course-test session outside it is not theirs
 * to see or to act on.
 */
async function teacherOwnedClassIds(db, request) {
  const email = callerEmail(request);
  if (!email) throw new HttpsError("permission-denied", "A verified teacher email is required.");
  if (authLib.isRootAdminEmail(email)) return null;
  const snapshot = await db.collection("classes").where("teacherOfRecord", "==", email).get();
  return new Set(snapshot.docs.map((docSnapshot) => docSnapshot.id));
}

/**
 * May this teacher proctor this course-test session?
 *
 * `proctorExamAction` has always accepted any authenticated teacher, which was
 * a defensible scope while the only thing it could do was unlock a simulation.
 * Releasing a COURSE test now writes a student's recorded assessment grade and
 * pushes it to Google Classroom, so the same call in the same shape is a much
 * larger action and needs the teacher of record for that student's class.
 *
 * Scoped to course tests on purpose: the simulation proctor scope is existing
 * behaviour this change has no business widening.
 */
async function assertMayProctorCourseTest(db, request, session) {
  if (!secureExam.isCourseTestSession(session)) return;
  const ownedClassIds = await teacherOwnedClassIds(db, request);
  if (ownedClassIds === null) return;
  const classId = String(session.classId || "");
  if (!classId || !ownedClassIds.has(classId)) {
    throw new HttpsError("permission-denied", "Only the teacher of record for this student's class can proctor their course test.");
  }
}

/**
 * Is this course-test session still the record's current session for its stage?
 *
 * AN EMPTY STAGE IS NOT A WILDCARD. This used to read "no current session id"
 * as "anything is current", which is exactly backwards after a teacher reset:
 * resetting a stage CLEARS its session id, so the one session that would then
 * pass the check was the superseded one the reset had just thrown away. It
 * stayed releasable, and its stale score could land on the replacement attempt.
 *
 * So the match is exact. A session whose stage points somewhere else — or
 * nowhere — is not the session to act on.
 */
async function courseTestSessionIsCurrent(db, session) {
  const courseTest = session?.courseTest;
  if (!courseTest?.assignmentId) return true;
  const shared = await testCycleLib.shared();
  const record = await readTestCycleRecord(db, courseTest.assignmentId, String(session.studentId || ""), shared);
  const isRetest = String(courseTest.cycleStage) === shared.issuance.CYCLE_STAGE.RETEST;
  const currentSessionId = isRetest ? record.retest.examSessionId : record.test.examSessionId;
  return String(currentSessionId || "") === String(session.examSessionId || "");
}

/** Teacher action: open secure Test sessions for a whole class at once. */
exports.assignTestCycleSessions = onCall(async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await db.collection("assignments").doc(String(request.data?.assignmentId || "").trim()).get();
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment was not found.");
  const { teacherUid } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, policy, blueprint, secureReferenceResolved, shared } = await loadTestCycleAssignment(db, request.data?.assignmentId, { allowInvalid: true });

  /*
   * THE AUDIENCE IS THE ASSIGNMENT'S, NOT THE CALLER'S.
   *
   * The teacher screen passes whichever class is active in the class bar to
   * every Test Cycle it lists, so opening a cycle assigned to first period
   * while third period is selected would otherwise create secure sessions and
   * canonical records for third period — and the record is itself what grants a
   * student access. A requested classId therefore has to BE one of the
   * assignment's assigned classes, and named students have to be in one.
   */
  const audienceClassIds = assignmentAudience(assignment).classIds;
  const requestedClassId = String(request.data?.classId || "").trim();
  if (requestedClassId && !audienceClassIds.includes(requestedClassId)) {
    throw new HttpsError("invalid-argument", "That class is not assigned this Test Cycle.");
  }
  const requestedStudentIds = [...new Set((Array.isArray(request.data?.studentIds) ? request.data.studentIds : [])
    .map((value) => String(value || "").trim()).filter(Boolean))];
  const classIds = requestedStudentIds.length
    ? []
    : (requestedClassId ? [requestedClassId] : audienceClassIds);

  // Only once the caller is pointing at the right class is it worth generating
  // and grading sample instances for every declared family.
  const { families, result: preflight } = await runTestCyclePreflight(db, { assignment, policy, blueprint, shared, secureReferenceResolved });
  if (preflight.blocked) {
    // Refused before a single session exists. A Test Cycle that cannot issue
    // equivalent secure coverage for every student must not reach a classroom.
    throw new HttpsError("failed-precondition", `This Test Cycle cannot be assigned securely: ${preflight.errors[0]}`, { preflight });
  }

  const studentDocs = new Map();
  if (requestedStudentIds.length) {
    for (let index = 0; index < requestedStudentIds.length; index += 100) {
      const refs = requestedStudentIds.slice(index, index + 100).map((id) => db.collection("grades").doc(id));
      // eslint-disable-next-line no-await-in-loop
      const snapshots = await db.getAll(...refs);
      snapshots.forEach((snapshot) => {
        if (snapshot.exists) studentDocs.set(snapshot.id, snapshot.data() || {});
      });
    }
  } else {
    for (const classId of classIds) {
      // eslint-disable-next-line no-await-in-loop
      const snapshot = await db.collection("grades").where("classId", "==", classId).get();
      snapshot.docs.forEach((doc) => studentDocs.set(doc.id, doc.data() || {}));
    }
  }
  const eligible = [...studentDocs.entries()]
    .filter(([studentId, data]) => studentId !== "test_connection"
      && data?.status !== "inactive"
      // Named students are checked here rather than trusted: a grade document
      // id is not proof that this assignment was ever assigned to them.
      && studentMatchesAssignmentAudience({ assignment, classId: data?.classId || null }))
    .slice(0, TEST_CYCLE_MAX_BATCH_STUDENTS);
  if (!eligible.length) {
    throw new HttpsError("failed-precondition", "No eligible students were found for this Test Cycle.");
  }

  const created = [];
  const reused = [];
  for (const [studentId, studentData] of eligible) {
    // eslint-disable-next-line no-await-in-loop
    const record = await readTestCycleRecord(db, assignmentId, studentId, shared);
    if (record.test.examSessionId) {
      reused.push(studentId);
      continue;
    }
    const plan = shared.issuance.buildSecureIssuancePlan({
      blueprint,
      families,
      studentId,
      assignmentId,
      stage: shared.issuance.CYCLE_STAGE.TEST,
      attempt: 1,
    });
    if (shared.issuance.planRequiresLiveGeneration(plan)) {
      throw new HttpsError("failed-precondition", `The secure Test plan for ${studentId} could not be completed from approved families.`);
    }
    // eslint-disable-next-line no-await-in-loop
    const session = await createCourseTestSession(db, {
      assignmentId,
      assignment,
      studentId,
      studentData,
      blueprint,
      plan,
      cycleStage: shared.issuance.CYCLE_STAGE.TEST,
      teacherUid,
      title: assignment?.title,
    });
    // eslint-disable-next-line no-await-in-loop
    await persistTestCycleRecord(db, {
      ...record,
      assignmentId,
      studentId,
      classId: session.classId,
      blueprintId: blueprint.blueprintId,
      blueprintVersion: blueprint.version,
      review: { ...record.review, required: policy.review.required },
      test: {
        examSessionId: session.examSessionId,
        planId: plan.planId,
        blueprintId: plan.blueprintId,
        blueprintVersion: plan.blueprintVersion,
        attempt: plan.attempt,
        state: shared.record.SESSION_STATE.ASSIGNED,
        totalQuestions: plan.totalQuestions,
      },
    }, { shared, policy });
    created.push({ studentId, examSessionId: session.examSessionId });
  }

  return {
    success: true,
    assignmentId,
    createdSessions: created.length,
    reusedSessions: reused.length,
    students: created,
    preflight: { errors: preflight.errors, warnings: preflight.warnings, checks: preflight.checks },
  };
});

/** Teacher preflight, callable on its own so authoring can block publication. */
exports.preflightTestCycleAssignment = onCall(async (request) => {
  const db = getFirestore();
  await requireTeacher(request);
  const { assignment, policy, blueprint, secureReferenceResolved, shared } = await loadTestCycleAssignment(db, request.data?.assignmentId, { allowInvalid: true });
  const { result } = await runTestCyclePreflight(db, { assignment, policy, blueprint, shared, secureReferenceResolved });
  return { success: true, preflight: result };
});

/** Authoritative pre-save gate used only for Test Cycle candidates. */
exports.preflightTestCycleCandidate = onCall(async (request) => {
  await requireTeacher(request);
  const assignment = request.data?.assignment;
  if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
    throw new HttpsError("invalid-argument", "A Test Cycle assignment candidate is required.");
  }
  const db = getFirestore();
  const shared = await testCycleLib.shared();
  if (!shared.policy.declaresTestCycle(assignment)) {
    return { success: true, testCycle: false, preflight: null };
  }
  const policy = shared.policy.normalizeTestCyclePolicy(assignment.assessmentPolicy)
    || shared.policy.defaultTestCyclePolicy();
  const resolution = await resolveSecureTestBlueprint(db, assignment, shared);
  const { result } = await runTestCyclePreflight(db, {
    assignment,
    policy,
    blueprint: resolution.blueprint,
    shared,
    secureReferenceResolved: resolution.secureReferenceResolved,
  });
  return { success: true, testCycle: true, preflight: result };
});

/**
 * The student's single card.
 *
 * Returns ONE stage. Corrections detail is included only when the student is
 * actually in the Corrections stage, so a student who has submitted a test and
 * is waiting for release cannot infer their result from the payload.
 */
exports.getStudentTestCycle = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const { assignmentId, assignment, policy, blueprint, shared } = await loadTestCycleAssignment(db, request.data?.assignmentId);

  const [gradeSnapshot, recordSnapshot] = await Promise.all([
    db.collection("grades").doc(studentId).get(),
    db.collection(TEST_CYCLE_RECORDS).doc(testCycleRecordKey(assignmentId, studentId)).get(),
  ]);
  // Audience OR an existing record: a teacher may assign a Test Cycle to named
  // students rather than a whole class, and that student's own secure session
  // is as good an answer to "is this yours?" as a class id is.
  if (!recordSnapshot.exists
    && !studentMatchesAssignmentAudience({ assignment, classId: gradeSnapshot.data()?.classId || null })) {
    throw new HttpsError("permission-denied", "That assessment is not assigned to you.");
  }
  const record = shared.record.normalizeTestCycleRecord(
    recordSnapshot.exists ? recordSnapshot.data() : { assignmentId, studentId },
  );
  const tracker = gradeSnapshot.data()?.gradesByAssignment?.[assignmentId] || {};
  const state = shared.stages.resolveTestCycleStage({
    policy,
    record,
    reviewProgress: testCycleLib.reviewProgress(assignment, tracker),
  });

  let corrections = null;
  if (state.stage === shared.stages.TEST_CYCLE_STAGE.CORRECTIONS) {
    const planSnapshot = await db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(record.recordId).get();
    const plan = planSnapshot.exists ? planSnapshot.data()?.plan : null;
    corrections = plan ? studentVisibleCorrectionPlan(plan) : null;
  }

  return {
    success: true,
    assignmentId,
    title: blueprint.title || assignment?.title || "Test Cycle",
    stage: state.stage,
    secure: state.secure,
    hintsAllowed: state.hintsAllowed,
    canEnter: state.canEnter,
    actionLabel: state.actionLabel,
    statusLabel: state.statusLabel,
    detail: state.detail,
    phases: shared.stages.buildTestCyclePhaseStatus({ state, record }),
    examSessionId: shared.stages.stageIsSecure(state.stage)
      ? (state.stage === shared.stages.TEST_CYCLE_STAGE.RETEST ? record.retest.examSessionId : record.test.examSessionId)
      : null,
    // Which released secure session a "Review Test" / "Review Retest" action
    // opens. The retest when there is one, otherwise the original Test.
    reviewExamSessionId: record.retest.state === shared.record.SESSION_STATE.RELEASED
      ? record.retest.examSessionId
      : record.test.state === shared.record.SESSION_STATE.RELEASED
        ? record.test.examSessionId
        : null,
    grade: shared.record.testCycleGradeBreakdown(record, policy),
    corrections,
  };
});

/**
 * Corrections, as a student may see them.
 *
 * Families and the instances that produced them are stripped: a student asks
 * for a correction question by correctionId and the server decides what to
 * instantiate. What IS kept is the standard and the reason, because a student
 * doing corrections is entitled to know what they are working on.
 */
function studentVisibleCorrectionPlan(plan) {
  return {
    planId: plan.planId,
    secure: false,
    hintsAllowed: true,
    gradeImpact: "none",
    complete: plan.complete === true,
    targets: (plan.targets || []).map((target) => ({
      correctionId: target.correctionId,
      order: target.order,
      label: target.label,
      alignmentKey: target.alignmentKey,
      diagnosis: target.diagnosis,
      diagnosisDetail: target.diagnosisDetail,
      missed: target.missed,
      requiredCorrectResponses: target.requiredCorrectResponses,
      correctResponses: target.correctResponses,
      complete: target.complete === true,
    })),
  };
}

/**
 * Issue one CORRECTION question.
 *
 * Instructional delivery, deliberately unlike the secure path: three attempts,
 * hints and solution support allowed, immediate feedback. The one thing it
 * shares with the secure path is that the answer key stays on the server.
 *
 * The instance the student missed on the Test is explicitly forbidden, and a
 * parallel family is preferred, so a correction cannot become "here is the
 * question you got wrong, with the answer".
 */
exports.issueTestCycleCorrectionQuestion = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const correctionId = String(request.data?.correctionId || "").trim();
  if (!correctionId) throw new HttpsError("invalid-argument", "A correctionId is required.");
  const db = getFirestore();
  const { assignmentId, policy } = await loadTestCycleAssignment(db, request.data?.assignmentId);
  const recordId = testCycleRecordKey(assignmentId, studentId);
  const planRef = db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(recordId);
  const planSnapshot = await planRef.get();
  if (!planSnapshot.exists) throw new HttpsError("not-found", "You have no corrections for this assessment.");
  const stored = planSnapshot.data() || {};
  if (String(stored.studentId || "") !== studentId) throw new HttpsError("not-found", "You have no corrections for this assessment.");
  const target = (stored.plan?.targets || []).find((entry) => entry.correctionId === correctionId);
  if (!target) throw new HttpsError("not-found", "That correction is not part of your plan.");
  if (target.complete === true) throw new HttpsError("failed-precondition", "That correction is already complete.");

  const open = stored.activeQuestions?.[correctionId];
  if (open) {
    return {
      success: true,
      questionInstance: mathPath.buildSanitizedQuestion(open, open),
      attemptsAllowed: open.attemptsAllowed,
      hintsAllowed: true,
      secure: false,
    };
  }

  /*
   * A CORRECTION IS A PARALLEL ITEM, NOT THE SECURE ITEM WITH ITS ANSWER SHOWN.
   *
   * Two things keep it that way, and neither is a comparison of instance ids:
   * `practiceFamilyIds` already excludes the families this student met on the
   * Test wherever another family exists, and the SEED below is derived from the
   * correction and the attempt rather than from the exam slot — so even a
   * family that had to repeat generates different numbers. Instance ids are
   * minted fresh here and could never collide with the exam's, which is why
   * checking them would be a test that can only pass.
   */
  const families = await resolveBlueprintFamilies(db, target.practiceFamilyIds || []);
  const attemptIndex = Number(target.correctResponses || 0) + Number(stored.issuedCounts?.[correctionId] || 0);
  let issued = null;
  for (let offset = 0; offset < Math.max(1, families.length); offset += 1) {
    const family = families[(attemptIndex + offset) % Math.max(1, families.length)];
    if (!family) break;
    const questionInstanceId = mathPath.runtimeId("correction");
    // eslint-disable-next-line no-await-in-loop
    const instantiated = await mathPath.instantiateQuestion(
      family,
      `${stored.plan.planId}|${correctionId}|${attemptIndex + offset}`,
      { preferredDok: target.dok, preferredDifficultyBand: target.difficultyBand },
    );
    if (!instantiated.question) continue;
    // eslint-disable-next-line no-await-in-loop
    const issuePlan = await mathPath.buildIssuePlan(instantiated.question);
    if (!issuePlan.issuable) continue;
    issued = {
      ...instantiated.question,
      bankQuestionId: family.id,
      familyId: family.id,
      questionInstanceId,
      correctionId,
      // Instruction, not assessment. Three attempts and full support.
      attemptsAllowed: 3,
      attemptsUsed: 0,
      privateGrading: issuePlan.privateGrading,
      ...issuePlan.toolPayload,
    };
    break;
  }
  if (!issued) throw new HttpsError("failed-precondition", "No parallel practice item could be generated for this correction.");

  await planRef.set({
    ...stored,
    activeQuestions: { ...stored.activeQuestions, [correctionId]: issued },
    issuedCounts: { ...stored.issuedCounts, [correctionId]: Number(stored.issuedCounts?.[correctionId] || 0) + 1 },
    updatedAt: Date.now(),
  });

  return {
    success: true,
    questionInstance: mathPath.buildSanitizedQuestion(issued, issued),
    attemptsAllowed: 3,
    hintsAllowed: true,
    secure: false,
    passingScore: policy.passingScore,
  };
});

/**
 * Grade one correction response and, when the plan finishes, open the Retest.
 *
 * A correction NEVER touches the recorded grade. It advances a correction
 * target only on a correct response, and the only grade-adjacent thing it can
 * do at the end of the plan is unlock a secure retest the student then has to
 * actually take.
 */
exports.submitTestCycleCorrectionResponse = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const correctionId = String(request.data?.correctionId || "").trim();
  const questionInstanceId = String(request.data?.questionInstanceId || "").trim();
  if (!correctionId || !questionInstanceId) throw new HttpsError("invalid-argument", "correctionId and questionInstanceId are required.");
  const db = getFirestore();
  const { assignmentId, assignment, policy, blueprint, shared } = await loadTestCycleAssignment(db, request.data?.assignmentId);
  const recordId = testCycleRecordKey(assignmentId, studentId);
  const planRef = db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(recordId);
  const planSnapshot = await planRef.get();
  if (!planSnapshot.exists) throw new HttpsError("not-found", "You have no corrections for this assessment.");
  const stored = planSnapshot.data() || {};
  if (String(stored.studentId || "") !== studentId) throw new HttpsError("not-found", "You have no corrections for this assessment.");
  const open = stored.activeQuestions?.[correctionId];
  if (!open || open.questionInstanceId !== questionInstanceId) {
    throw new HttpsError("failed-precondition", "That correction question is no longer active.");
  }

  const grading = await mathPath.gradeResponse(open.privateGrading, request.data?.responsePayload || {});
  const now = Date.now();
  const nextPlan = grading.isCorrect
    ? shared.corrections.applyCorrectionEvidence(stored.plan, { correctionId, isCorrect: true, at: now })
    : stored.plan;
  const activeQuestions = { ...stored.activeQuestions };
  delete activeQuestions[correctionId];
  const progress = shared.corrections.correctionPlanProgress(nextPlan);

  await planRef.set({
    ...stored,
    plan: nextPlan,
    activeQuestions,
    updatedAt: now,
  });

  const record = await readTestCycleRecord(db, assignmentId, studentId, shared);
  const updated = {
    ...record,
    corrections: {
      ...record.corrections,
      planId: nextPlan.planId,
      total: progress.total,
      completedTargets: progress.complete,
      complete: progress.allComplete,
      completedAt: progress.allComplete ? now : record.corrections.completedAt,
    },
  };
  const persisted = await persistTestCycleRecord(db, updated, { shared, policy });

  // Corrections complete is the ordinary gate. Opening the retest here is what
  // makes it automatic — no teacher has to notice and no student has to ask.
  let retest = null;
  if (progress.allComplete && !persisted.record.teacherControls.retestDisabled) {
    retest = await ensureRetestSession(db, {
      assignmentId, assignment, policy, blueprint, shared, studentId, teacherUid: null,
    });
  }

  return {
    success: true,
    isCorrect: grading.isCorrect === true,
    score: grading.score,
    correctionsComplete: progress.allComplete,
    progress,
    retestOpened: Boolean(retest),
  };
});

/**
 * Build and open this student's secure Retest.
 *
 * Everything that decides WHAT the retest asks happens here and is stored
 * before the session becomes enterable: the performance profile from the
 * released Test, the ~70/30 retest blueprint, and the deterministic issuance
 * plan with the original families and instances passed in as things to avoid.
 */
async function ensureRetestSession(db, { assignmentId, assignment, policy, blueprint, shared, studentId, teacherUid }) {
  const record = await readTestCycleRecord(db, assignmentId, studentId, shared);
  if (record.retest.examSessionId) return null;
  if (record.test.state !== shared.record.SESSION_STATE.RELEASED) return null;
  if (record.teacherControls.retestDisabled) return null;

  const testSessionSnapshot = record.test.examSessionId
    ? await db.collection("examSessions").doc(record.test.examSessionId).get()
    : null;
  if (!testSessionSnapshot?.exists) return null;
  const testSession = testSessionSnapshot.data() || {};

  const profile = shared.corrections.buildPerformanceProfile({
    blueprint,
    responses: testCycleLib.responsesForProfile(testSession),
  });
  const generated = shared.retest.buildRetestBlueprint({ blueprint, profile, policy });
  if (!generated) return null;

  const families = await resolveBlueprintFamilies(db, blueprintFamilyIds(generated.blueprint));
  const plan = shared.issuance.buildSecureIssuancePlan({
    blueprint: generated.blueprint,
    families,
    studentId,
    assignmentId,
    stage: shared.issuance.CYCLE_STAGE.RETEST,
    attempt: Number(record.retest.attempt || 1),
    avoidFamilyIds: generated.audit.avoidFamilyIds,
    avoidInstanceIds: generated.audit.avoidInstanceIds,
  });
  if (shared.issuance.planRequiresLiveGeneration(plan)) return null;

  const studentSnapshot = await db.collection("grades").doc(studentId).get();
  const session = await createCourseTestSession(db, {
    assignmentId,
    assignment,
    studentId,
    studentData: studentSnapshot.data() || {},
    blueprint: generated.blueprint,
    plan,
    cycleStage: shared.issuance.CYCLE_STAGE.RETEST,
    teacherUid,
    title: `${assignment?.title || blueprint.title} — Retest`,
  });

  await db.collection(TEST_CYCLE_RETEST_PLANS).doc(record.recordId).set({
    recordId: record.recordId,
    assignmentId,
    studentId,
    blueprint: generated.blueprint,
    audit: generated.audit,
    plan,
    createdAt: Date.now(),
  });

  await persistTestCycleRecord(db, {
    ...record,
    retest: {
      ...record.retest,
      examSessionId: session.examSessionId,
      planId: plan.planId,
      blueprintId: plan.blueprintId,
      blueprintVersion: plan.blueprintVersion,
      state: shared.record.SESSION_STATE.ASSIGNED,
      totalQuestions: plan.totalQuestions,
    },
  }, { shared, policy });

  return { examSessionId: session.examSessionId, audit: generated.audit };
}

/** Teacher overrides. Each one is an explicit decision, recorded as such. */
exports.teacherTestCycleAction = onCall(async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await db.collection("assignments").doc(String(request.data?.assignmentId || "").trim()).get();
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment was not found.");
  const { teacherUid } = await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, assignment, policy, blueprint, shared } = await loadTestCycleAssignment(db, request.data?.assignmentId);
  const studentId = String(request.data?.studentId || "").trim();
  const action = String(request.data?.action || "").trim();
  if (!studentId) throw new HttpsError("invalid-argument", "A studentId is required.");
  if (!shared.policy.TEACHER_CONTROL_ACTIONS.includes(action)) {
    throw new HttpsError("invalid-argument", "Choose a supported Test Cycle teacher action.");
  }

  const record = await readTestCycleRecord(db, assignmentId, studentId, shared);
  const controls = shared.policy.applyTeacherControlAction(record.teacherControls, action);
  let next = { ...record, teacherControls: controls };

  if (action === "resetSecureSession") {
    const stage = String(request.data?.stage || "test").trim() === "retest" ? "retest" : "test";
    const current = stage === "retest" ? record.retest : record.test;

    /*
     * A reset must not un-prove the Review the student already passed.
     *
     * The replacement Test goes back to `assigned`, which is the same shape a
     * student who has never passed Review is in. Records written since the
     * entry path started stamping `review.complete` carry the answer already;
     * one written before it does not, and would silently revert to "Review" in
     * the gradebook. The outgoing session's own state is the proof, so it is
     * carried across here rather than lost with the session it belonged to.
     */
    if (record.review.complete !== true
      && current.state !== shared.record.SESSION_STATE.NONE
      && current.state !== shared.record.SESSION_STATE.ASSIGNED) {
      next = { ...next, review: { ...next.review, complete: true, completedAt: next.review.completedAt || Date.now() } };
    }

    if (current.examSessionId) {
      // The old session is closed, not deleted: the evidence a student produced
      // stays readable, and the new attempt draws a genuinely different plan
      // because `attempt` is part of the plan seed.
      await db.collection("examSessions").doc(current.examSessionId).set(
        { status: "force_submitted", resetByTeacher: teacherUid, resetAt: Date.now(), updatedAt: Date.now() },
        { merge: true },
      );
    }
    const attempt = Number(current.attempt || 1) + 1;
    if (stage === "test") {
      const families = await resolveBlueprintFamilies(db, blueprintFamilyIds(blueprint));
      const plan = shared.issuance.buildSecureIssuancePlan({
        blueprint, families, studentId, assignmentId, stage: shared.issuance.CYCLE_STAGE.TEST, attempt,
      });
      const studentSnapshot = await db.collection("grades").doc(studentId).get();
      const session = await createCourseTestSession(db, {
        assignmentId, assignment, studentId, studentData: studentSnapshot.data() || {},
        blueprint, plan, cycleStage: shared.issuance.CYCLE_STAGE.TEST, teacherUid, title: assignment?.title,
      });
      next = {
        ...next,
        test: {
          ...next.test,
          examSessionId: session.examSessionId,
          planId: plan.planId,
          attempt,
          state: shared.record.SESSION_STATE.ASSIGNED,
          rawScore: null,
          releasedAt: null,
          totalQuestions: plan.totalQuestions,
        },
      };
    } else {
      next = { ...next, retest: { ...next.retest, examSessionId: null, planId: null, attempt, state: shared.record.SESSION_STATE.NONE, rawScore: null, releasedAt: null } };
    }
    // A reset can clear an already-released score, so it belongs in the audit
    // trail beside the releases. Classroom is unaffected: a null recorded grade
    // is skipped by the passback trigger, so the posted grade simply stands.
    next = {
      ...next,
      history: shared.grade.appendTestCycleGradeHistory(next.history, {
        at: Date.now(),
        reason: shared.grade.GRADE_HISTORY_REASON.TEACHER_OVERRIDE,
        recordedGrade: shared.record.recordGradeState(next, policy).recordedGrade,
        detail: `Teacher reset the secure ${stage} session (attempt ${attempt}).`,
      }),
    };
  }

  const persisted = await persistTestCycleRecord(db, next, { shared, policy });

  /*
   * These controls all have to leave the student somewhere they can go.
   *
   * Waiving corrections or unlocking a retest opens one because that is what
   * those controls are FOR. Resetting the RETEST has to open one too: the reset
   * clears the stage's session, and without a replacement the student sat at
   * "retest pending" with nothing behind it — the same trap waiving used to be.
   * Resetting the TEST already mints its replacement inline above.
   */
  const resetRetest = action === "resetSecureSession"
    && String(request.data?.stage || "test").trim() === "retest";
  let retest = null;
  if (["waiveCorrections", "unlockRetest"].includes(action) || resetRetest) {
    retest = await ensureRetestSession(db, { assignmentId, assignment, policy, blueprint, shared, studentId, teacherUid });
  }

  return {
    success: true,
    action,
    studentId,
    teacherControls: persisted.record.teacherControls,
    stage: persisted.stage,
    retestOpened: Boolean(retest),
  };
});

/** Teacher gradebook: the canonical record for every student on this cycle. */
exports.listTeacherTestCycleRecords = onCall(async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await db.collection("assignments").doc(String(request.data?.assignmentId || "").trim()).get();
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment was not found.");
  await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, policy, shared } = await loadTestCycleAssignment(db, request.data?.assignmentId);

  const snapshot = await db.collection(TEST_CYCLE_RECORDS).where("assignmentId", "==", assignmentId).limit(300).get();
  const rows = snapshot.docs.map((doc) => {
    const record = shared.record.normalizeTestCycleRecord(doc.data());
    const grade = shared.record.recordGradeState(record, policy);
    const state = shared.stages.resolveTestCycleStage({ policy, record });
    return {
      studentId: record.studentId,
      stage: state?.stage || null,
      statusLabel: state?.statusLabel || null,
      originalTestGrade: grade.originalTestGrade,
      rawRetestGrade: grade.rawRetestGrade,
      retestCappedContribution: grade.retestCappedContribution,
      maxRecordedGrade: grade.maxRecordedGrade,
      recordedGrade: grade.recordedGrade,
      recordedGradeSource: grade.recordedGradeSource,
      corrections: record.corrections,
      teacherControls: record.teacherControls,
      history: record.history,
    };
  });
  return { success: true, assignmentId, rows };
});

/** Teacher inspection of a generated correction or retest plan. */
exports.getTeacherTestCyclePlans = onCall(async (request) => {
  const db = getFirestore();
  const assignmentSnapshot = await db.collection("assignments").doc(String(request.data?.assignmentId || "").trim()).get();
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment was not found.");
  await assertTeacherMayManageAssignment(request, assignmentSnapshot);
  const { assignmentId, shared } = await loadTestCycleAssignment(db, request.data?.assignmentId);
  const studentId = String(request.data?.studentId || "").trim();
  if (!studentId) throw new HttpsError("invalid-argument", "A studentId is required.");
  const recordId = testCycleRecordKey(assignmentId, studentId);

  const [correctionSnapshot, retestSnapshot, recordSnapshot] = await Promise.all([
    db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(recordId).get(),
    db.collection(TEST_CYCLE_RETEST_PLANS).doc(recordId).get(),
    db.collection(TEST_CYCLE_RECORDS).doc(recordId).get(),
  ]);
  const correctionPlan = correctionSnapshot.exists ? correctionSnapshot.data()?.plan || null : null;
  const retestPlan = retestSnapshot.exists ? retestSnapshot.data() : null;

  return {
    success: true,
    studentId,
    record: recordSnapshot.exists ? shared.record.normalizeTestCycleRecord(recordSnapshot.data()) : null,
    // The correction plan keeps its evidence mapping: a teacher opening this
    // sees exactly which failed Test items sent the student where.
    corrections: correctionPlan
      ? { ...correctionPlan, targets: (correctionPlan.targets || []).map(({ practiceFamilyIds: _practiceFamilyIds, ...target }) => target) }
      : null,
    retest: retestPlan
      ? { audit: retestPlan.audit, blueprint: retestPlan.blueprint, plan: testCycleLib.teacherVisiblePlan(retestPlan.plan) }
      : null,
  };
});

/**
 * The Test Cycle side of releasing secure feedback.
 *
 * Called from `proctorExamAction` after the shared release path has done its
 * ordinary work, so a course test releases exactly like a simulation does and
 * then, additionally, records the assessment grade and builds the corrections.
 */
async function applyTestCycleFeedbackRelease(db, session) {
  const courseTest = session?.courseTest;
  if (!courseTest?.assignmentId) return null;
  const shared = await testCycleLib.shared();
  const assignmentSnapshot = await db.collection("assignments").doc(String(courseTest.assignmentId)).get();
  if (!assignmentSnapshot.exists) return null;
  const assignment = assignmentSnapshot.data() || {};
  const policy = shared.policy.normalizeTestCyclePolicy(assignment.assessmentPolicy);
  if (!policy) return null;
  const blueprint = shared.blueprint.normalizeTestBlueprint(assignment.testBlueprint);

  const studentId = String(session.studentId || "");
  const rawScore = testCycleLib.weightedSessionScorePercent(session);
  const record = await readTestCycleRecord(db, courseTest.assignmentId, studentId, shared);
  const isRetest = String(courseTest.cycleStage) === shared.issuance.CYCLE_STAGE.RETEST;
  // Superseded by a teacher reset. The caller already refuses this, and so does
  // this helper: a stale score reaching the record is not recoverable by the
  // student, so it is worth refusing twice.
  const currentSessionId = isRetest ? record.retest.examSessionId : record.test.examSessionId;
  if (currentSessionId && currentSessionId !== session.examSessionId) return null;

  const updated = isRetest
    ? shared.record.applyRetestReleased(record, {
      rawScore,
      answeredQuestions: Object.keys(session.responses || {}).length,
      totalQuestions: Number(session.requiredQuestions || 0),
      policy,
    })
    : shared.record.applyTestReleased(record, {
      rawScore,
      answeredQuestions: Object.keys(session.responses || {}).length,
      totalQuestions: Number(session.requiredQuestions || 0),
      policy,
    });

  const persisted = await persistTestCycleRecord(db, updated, { shared, policy });

  // A failed Test builds this student's corrections automatically, from their
  // own evidence, at the moment the score becomes real to them.
  if (!isRetest) {
    const profile = shared.corrections.buildPerformanceProfile({
      blueprint,
      responses: testCycleLib.responsesForProfile(session),
    });
    const plan = shared.corrections.buildCorrectionPlan({
      blueprint,
      profile,
      policy,
      releasedTestGrade: rawScore,
      assignmentId: courseTest.assignmentId,
      studentId,
      examSessionId: session.examSessionId,
    });
    /*
     * IS THE CORRECTIONS GATE ACTUALLY CLOSED FOR THIS STUDENT?
     *
     * The plan is built for anyone who failed, because a teacher should be able
     * to see what this student needs even when they have waived the
     * requirement. Whether it GATES the retest is a separate question, and it
     * is the one that decides whether a retest has to be opened right now.
     *
     * Getting this wrong in the permissive direction is the expensive one: a
     * student whose corrections were waived would sit at "retest pending"
     * forever, because nothing else in the system would ever open the session.
     */
    const controls = persisted.record.teacherControls;
    const correctionsGate = Boolean(plan)
      && policy.corrections.requiredForRetest
      && controls.requireCorrections
      && !controls.correctionsWaived
      && !controls.retestUnlocked;

    if (plan) {
      await db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(persisted.record.recordId).set({
        recordId: persisted.record.recordId,
        assignmentId: courseTest.assignmentId,
        studentId,
        plan,
        activeQuestions: {},
        issuedCounts: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await persistTestCycleRecord(db, {
        ...persisted.record,
        corrections: {
          ...persisted.record.corrections,
          planId: plan.planId,
          required: correctionsGate,
          total: plan.targets.length,
          completedTargets: 0,
          complete: false,
        },
      }, { shared, policy });
    }

    if (plan && !correctionsGate && !controls.retestDisabled) {
      await ensureRetestSession(db, {
        assignmentId: courseTest.assignmentId, assignment, policy, blueprint, shared, studentId, teacherUid: null,
      });
    }
  }

  return { recordId: persisted.record.recordId, recordedGrade: persisted.gradeState.recordedGrade };
}

/**
 * Mirror a secure course-test session's status onto the Test Cycle record.
 *
 * The session remains the authority on what the student is doing; the record is
 * what every OTHER surface reads, and a card that still says "Start Test" after
 * a student submitted would be a lie told by the wrong document.
 *
 * Deliberately never sets RELEASED: releasing is a teacher action and arrives
 * through `applyTestCycleFeedbackRelease` with a score attached.
 */
async function syncTestCycleSessionState(db, session) {
  const courseTest = session?.courseTest;
  if (!courseTest?.assignmentId) return;
  const shared = await testCycleLib.shared();
  const assignmentSnapshot = await db.collection("assignments").doc(String(courseTest.assignmentId)).get();
  if (!assignmentSnapshot.exists) return;
  const policy = shared.policy.normalizeTestCyclePolicy(assignmentSnapshot.data()?.assessmentPolicy);
  if (!policy) return;

  const studentId = String(session.studentId || "");
  const record = await readTestCycleRecord(db, courseTest.assignmentId, studentId, shared);
  const isRetest = String(courseTest.cycleStage) === shared.issuance.CYCLE_STAGE.RETEST;
  const current = isRetest ? record.retest : record.test;
  if (current.examSessionId && current.examSessionId !== session.examSessionId) return;
  if (current.state === shared.record.SESSION_STATE.RELEASED) return;

  const state = secureExam.TERMINAL_STATES.has(session.status)
    ? shared.record.SESSION_STATE.SUBMITTED
    : session.status === "in_progress"
      ? shared.record.SESSION_STATE.IN_PROGRESS
      : shared.record.SESSION_STATE.ASSIGNED;
  if (state === current.state) return;

  const stageRecord = {
    ...current,
    state,
    answeredQuestions: Object.keys(session.responses || {}).length,
    submittedAt: secureExam.TERMINAL_STATES.has(session.status) ? Number(session.submittedAt) || Date.now() : current.submittedAt,
  };

  /*
   * PASSING THE REVIEW GATE IS RECORDED WHEN IT HAPPENS, NOT INFERRED FOREVER.
   *
   * Review completion lives in the assignment tracker, which only the student's
   * own card carries. The stage resolver can infer "past Review" from a Test
   * that has moved off `assigned` — but a teacher reset puts the Test BACK to
   * `assigned`, and then the inference goes false and the gradebook says
   * "Review" again for a student who has finished the cycle.
   *
   * So the fact is persisted at the only moment it is proven: the student has
   * just come through `assertCourseTestEntryAllowed`, which enforces the gate,
   * and their session is advancing off `assigned`. A reset replaces sessions,
   * never this flag, so the answer survives it. Either stage proves it — the
   * Retest sits behind the Test, which sits behind Review.
   */
  const passedReviewGate = state !== shared.record.SESSION_STATE.ASSIGNED;
  const review = passedReviewGate && record.review.complete !== true
    ? { ...record.review, complete: true, completedAt: record.review.completedAt || Date.now() }
    : record.review;

  await persistTestCycleRecord(db, {
    ...record,
    review,
    ...(isRetest ? { retest: stageRecord } : { test: stageRecord }),
  }, { shared, policy });
}

/**
 * The next secure course-test item, from the plan stored on the session.
 *
 * No selection happens here and no model is consulted: the plan already named
 * the approved family and the generator seed. This instantiates that family
 * with that seed and checks it can still be privately graded.
 *
 * The issued instance id is written back onto the plan entry, which is what
 * later lets the corrections algorithm join evidence to blueprint slots and
 * lets the retest audit prove it reused nothing.
 */
async function issueCourseTestQuestion(db, { sessionRef, session, studentId }) {
  const shared = await testCycleLib.shared();
  const plan = session.issuancePlan || {};
  const completedSlotIds = Object.values(session.responses || {})
    .map((response) => String(response?.slotId || ""))
    .filter(Boolean);
  const entry = shared.issuance.nextPlanEntry(plan, completedSlotIds);
  if (!entry) throw new HttpsError("failed-precondition", "All required exam questions have been completed.");

  const families = await resolveBlueprintFamilies(db, [entry.familyId]);
  const family = families[0];
  if (!family) throw new HttpsError("failed-precondition", "The approved family for this secure item is no longer available.");

  const questionInstanceId = mathPath.runtimeId("examq");
  const instantiated = await mathPath.instantiateQuestion(family, entry.seedKey, {
    preferredDok: entry.dok,
    preferredDifficultyBand: entry.difficultyBand,
  });
  if (!instantiated.question) throw new HttpsError("failed-precondition", "This secure exam item could not be generated.");
  const issuePlan = await mathPath.buildIssuePlan(instantiated.question);
  if (!issuePlan.issuable) throw new HttpsError("failed-precondition", "This secure exam item could not be graded securely.");

  const currentQuestion = {
    ...instantiated.question,
    bankQuestionId: family.id,
    familyId: entry.familyId,
    alignmentKeys: secureExamAlignmentKeys(instantiated.question),
    questionInstanceId,
    attemptsAllowed: 1,
    attemptsUsed: 0,
    assessmentDomainId: null,
    // Blueprint provenance, carried onto the stored response so released
    // evidence can be read back as "this student, this target, this slot".
    slotId: entry.slotId,
    targetId: entry.targetId,
    planWeight: entry.weight,
    planAnchor: entry.anchor === true,
    generatorParameters: instantiated.parameters,
    privateGrading: issuePlan.privateGrading,
    ...issuePlan.toolPayload,
  };

  const issued = await db.runTransaction(async (transaction) => {
    const freshSnapshot = await transaction.get(sessionRef);
    const fresh = assertStudentExamSession(freshSnapshot, studentId);
    assertExamInProgress(fresh);
    if (fresh.currentQuestion) return fresh;
    const entries = (fresh.issuancePlan?.entries || []).map((planEntry) => (
      planEntry.slotId === entry.slotId ? { ...planEntry, questionInstanceId } : planEntry
    ));
    const next = {
      ...fresh,
      currentQuestion,
      issuancePlan: { ...fresh.issuancePlan, entries },
      updatedAt: Date.now(),
    };
    transaction.set(sessionRef, next);
    return next;
  });
  return issued;
}

// Immutable evidence drives the Phase 5A mastery wheel. A separate idempotency
// marker prevents a retried Firestore trigger from counting the same event twice.
exports.updateMyMathPathMasteryFromEvidence = onDocumentCreated(
  { document: "grades/{studentId}/evidenceEvents/{eventId}" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot?.exists) return;
    const evidence = snapshot.data() || {};
    const studentId = event.params.studentId;
    if (evidence.studentId && String(evidence.studentId) !== String(studentId)) return;
    const eventKey = String(evidence.eventKey || event.params.eventId);
    const alignmentKeys = [...new Set((evidence.masteryEvidenceKeys?.length ? evidence.masteryEvidenceKeys : evidence.alignmentKeys || [])
      .map(mathPath.canonicalAlignmentKey)
      .filter((key) => key.startsWith("texas:")))];
    if (!alignmentKeys.length) return;

    const db = getFirestore();
    const profileRef = db.collection("studentMasteryProfiles").doc(studentId);
    const applicationRef = db.collection("masteryEvidenceApplications").doc(mathPath.opaqueId("mastery", studentId, eventKey));
    // liveChallenge sits below practice on purpose. The answer is real and the
    // grader is the same, but one attempt against a countdown with a
    // leaderboard in view is noisier evidence than the same question at a desk
    // — a wrong answer may mean "cannot do this" or may mean "ran out of
    // seconds", and the estimate should not treat those as equally informative.
    const roleWeight = { warmup: 0.8, classwork: 0.9, dol: 1.25, practice: 1, quiz: 1.35, test: 1.4, retention: 1.15, liveChallenge: 0.7 }[evidence.source?.activityRole] || 1;
    const modified = Boolean(evidence.supportUsage?.modified) || Boolean(evidence.supportUsage?.modifications?.length);
    const independent = mathPath.mathematicalIndependence(evidence.supportUsage || {});
    const score = Math.max(0, Math.min(1, Number(evidence.performance?.score) || 0));

    // THE BUG THIS REPLACED, and it was not a small one.
    //
    // The support discount used to be folded into `weight`:
    //
    //     weight = roleWeight * (independent ? 1 : 0.85)
    //     estimate = Σ(score × weight) / Σ(weight)
    //
    // The 0.85 appears in BOTH the numerator and the denominator, so for a
    // correct answer (score = 1) it divides straight back out. A student who
    // took a hint on every single question reached an estimate of 100 and was
    // labelled Mastered — exactly the "clicking through Path inflates mastery"
    // failure the design forbids.
    //
    // The fix separates two different questions that were being answered with
    // one number:
    //
    //   WEIGHT  — how much this event counts as evidence at all. Stays in the
    //             denominator. A hinted answer is still evidence.
    //   CREDIT  — what the student actually demonstrated. Discounted for
    //             support, so a supported success is worth less than an
    //             independent one no matter how many of them there are.
    const weight = modified ? 0 : roleWeight;
    // Deliberately below the Mastered threshold: a student whose every success
    // needed the platform to supply the mathematical idea has not shown mastery
    // of it, and no quantity of such successes should add up to that claim.
    const SUPPORTED_CREDIT = 0.75;
    const creditedScore = independent ? score : score * SUPPORTED_CREDIT;
    const dok = Number(evidence.questionSnapshot?.dok) || null;
    const familyId = evidence.questionSnapshot?.familyId || null;

    await db.runTransaction(async (transaction) => {
      const [application, profileSnapshot] = await Promise.all([
        transaction.get(applicationRef),
        transaction.get(profileRef),
      ]);
      if (application.exists) return;
      const profiles = profileSnapshot.exists ? { ...(profileSnapshot.data()?.profiles || {}) } : {};

      alignmentKeys.forEach((alignmentKey) => {
        const code = mathPath.displayAlignmentKey(alignmentKey);
        const previous = profiles[code] || {};
        const accumulator = previous.accumulator || {};
        const effectiveWeight = Number(accumulator.effectiveWeight || 0) + weight;
        const weightedScoreSum = Number(accumulator.weightedScoreSum || 0) + creditedScore * weight;
        const eligibleEvents = Number(accumulator.eligibleEvents || 0) + (weight > 0 ? 1 : 0);
        const modifiedEvents = Number(accumulator.modifiedEvents || 0) + (modified ? 1 : 0);
        // Independent successes are counted separately, because "can do this"
        // and "can do this when the platform supplies the idea" are different
        // claims and the mastery label is only allowed to make the first one.
        const independentSuccesses = Number(accumulator.independentSuccesses || 0)
          + (evidence.performance?.isCorrect && independent && weight > 0 ? 1 : 0);
        const dokRepresented = [...new Set([...(previous.dimensions?.dokRepresented || []), ...(dok ? [dok] : [])])].sort();
        const familiesRepresented = [...new Set([...(previous.dimensions?.familiesRepresented || []), ...(familyId ? [familyId] : [])])];
        const estimate = effectiveWeight > 0 ? Math.round((weightedScoreSum / effectiveWeight) * 100) : null;
        let status = "Not Enough Evidence";
        if (eligibleEvents >= 2 && effectiveWeight >= 1.1) {
          // Mastered additionally requires evidence the student did the
          // mathematics themselves. Without this, a high estimate assembled
          // entirely from supported successes would still read as mastery.
          if (estimate >= 85 && eligibleEvents >= 4 && independentSuccesses >= 2 && dokRepresented.some((value) => Number(value) >= 3)) status = "Mastered";
          else if (estimate >= 70) status = "Secure";
          else if (estimate >= 50) status = "Developing";
          else status = "Needs Attention";
        }
        const confidence = eligibleEvents >= 8 && effectiveWeight >= 5 && dokRepresented.length >= 2 ? "High" : eligibleEvents >= 4 && effectiveWeight >= 2.4 ? "Medium" : "Low";
        const lastIndependentSuccessAt = evidence.performance?.isCorrect && independent
          ? Math.max(Number(previous.dimensions?.lastIndependentSuccessAt || 0), Number(evidence.occurredAt || 0))
          : previous.dimensions?.lastIndependentSuccessAt || null;
        profiles[code] = {
          ...previous,
          teksCode: code,
          mastery: { estimate, observedPerformance: estimate, status, confidence },
          signals: { ...(previous.signals || {}), breadth: dokRepresented.length >= 2 ? "broad" : "developing", retention: previous.signals?.retention || "stable" },
          dimensions: { eligibleGradeLevelEvents: eligibleEvents, modifiedEvidenceEvents: modifiedEvents, independentSuccesses, dokRepresented, familiesRepresented, lastIndependentSuccessAt },
          accumulator: { effectiveWeight, weightedScoreSum, eligibleEvents, modifiedEvents, independentSuccesses },
          recommendation: { reason: status === "Needs Attention" ? "Rebuild this skill with targeted grade-level support." : "Continue building independent accuracy and breadth." },
          updatedAt: Date.now(),
        };
      });

      // The mastery profile inherits the evidence's authorization context, so
      // a derived record is never readable by anyone the source was not.
      transaction.set(profileRef, {
        profiles,
        studentId,
        classId: evidence.classId ?? null,
        originClassId: evidence.originClassId ?? evidence.classId ?? null,
        originTeacherEmail: evidence.originTeacherEmail ?? null,
        authorizedTeacherEmails: Array.isArray(evidence.authorizedTeacherEmails) ? evidence.authorizedTeacherEmails : [],
        updatedAt: Date.now(),
      }, { merge: true });
      transaction.set(applicationRef, { studentId, eventKey, appliedAt: Date.now() });
    });
  },
);


// --- Integrated assignment authoring AI -------------------------------------
//
// The browser sends the SAME complete MathMaster authoring request that the
// teacher can copy into an outside AI. The provider key never leaves Functions.
// Output still goes through the browser's canonical Assignment V5 compiler and
// Preflight before anything can be saved or published.
const ASSIGNMENT_AI_USAGE_COLLECTION = "assignmentAiUsage";
const ASSIGNMENT_AI_MIN_INTERVAL_MS = 12 * 1000;
const ASSIGNMENT_AI_DAILY_LIMIT = 50;

async function reserveAssignmentAiUsage(db, teacherUid) {
  const ref = db.collection(ASSIGNMENT_AI_USAGE_COLLECTION).doc(String(teacherUid));
  const now = Date.now();
  const dayKey = new Date(now).toISOString().slice(0, 10);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? (snapshot.data() || {}) : {};
    const previous = toDate(data.lastStartedAt)?.getTime() || 0;
    if (previous && now - previous < ASSIGNMENT_AI_MIN_INTERVAL_MS) {
      throw new HttpsError(
        "resource-exhausted",
        "An assignment is already being built. Wait a few seconds before starting another one.",
      );
    }

    const dayCount = data.dayKey === dayKey ? Math.max(0, Number(data.dayCount) || 0) : 0;
    if (dayCount >= ASSIGNMENT_AI_DAILY_LIMIT) {
      throw new HttpsError(
        "resource-exhausted",
        "This teacher account reached MathMaster's daily AI assignment-build limit. Use the copy/paste AI workflow or try again tomorrow.",
      );
    }

    transaction.set(ref, {
      dayKey,
      dayCount: dayCount + 1,
      lastStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { dayKey, dayCount: dayCount + 1 };
  });
}

// A build that never reached the model, or that the provider refused outright,
// did not consume a teacher's daily allowance. Without this a misconfigured key
// burned all fifty attempts in a couple of minutes and then reported the wrong
// problem ("daily limit reached") for the rest of the day.
const ASSIGNMENT_AI_REFUNDABLE_CODES = new Set([
  "failed-precondition",
  "unavailable",
  "deadline-exceeded",
  "resource-exhausted",
]);

async function refundAssignmentAiUsage(db, teacherUid, dayKey) {
  const ref = db.collection(ASSIGNMENT_AI_USAGE_COLLECTION).doc(String(teacherUid));
  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      const data = snapshot.data() || {};
      if (data.dayKey !== dayKey) return;
      const dayCount = Math.max(0, Number(data.dayCount) || 0);
      if (!dayCount) return;
      transaction.set(ref, {
        dayCount: dayCount - 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } catch (error) {
    // A failed refund must never replace the real provider error the teacher
    // is waiting on. Record it and let the original failure surface.
    logger.warn("Could not refund an Assignment AI usage reservation", {
      teacherUid,
      message: error?.message || String(error),
    });
  }
}

// Diagnostics only: provider status, codes and token counts. Never the prompt,
// never assignment content, never anything student-identifying.
async function recordAssignmentAiFailure(db, entry) {
  try {
    await db.collection("assignmentAiAudit").add({
      ...entry,
      outcome: "failure",
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.warn("Could not write an Assignment AI failure audit record", {
      message: error?.message || String(error),
    });
  }
}

// Every AI failure is logged here, including the ones MathMaster classified
// itself. The previous version returned early for AssignmentAiError and so never
// reached its own logger call: no provider failure was recorded anywhere, which
// is why "the AI does not work" could not be diagnosed from the server side.
function translateAssignmentAiError(error, context = {}) {
  if (error instanceof HttpsError) return error;
  if (error instanceof assignmentAi.AssignmentAiError) {
    logger.error("Integrated assignment AI failed", {
      ...context,
      classified: true,
      code: error.code || null,
      httpStatus: error.status || null,
      message: String(error.message || "").slice(0, 500),
      diagnostics: error.details || null,
    });
    return new HttpsError(
      error.code || "internal",
      error.message || "MathMaster could not build this assignment with AI.",
      error.details || undefined,
    );
  }
  const rawMessage = String(error?.message || error || "");
  logger.error("Integrated assignment AI failed", {
    ...context,
    classified: false,
    name: error?.name || null,
    message: rawMessage,
  });
  if (/OPENAI_API_KEY\s+is not configured/i.test(rawMessage)) {
    return new HttpsError(
      "failed-precondition",
      "MathMaster Assignment AI is not configured on this Firebase deployment. Set OPENAI_API_KEY in Firebase Secret Manager and redeploy authorAssignmentWithAI.",
    );
  }
  return new HttpsError(
    "internal",
    "MathMaster Assignment AI hit a server error. Use the outside-AI import option while the server configuration is checked.",
  );
}

// Archive the LAST known state of a live presence session. Presence itself is
// ephemeral; this durable record keeps only compact objective counts and the
// teacher authorization context.
const STUDENT_SESSION_SUMMARY_COLLECTION = "studentSessionSummaries";
const PRESENCE_STALE_AFTER_MS = 3 * 60 * 1000;

async function archiveStudentPresenceSnapshot({
  live = {},
  studentId: suppliedStudentId = null,
  observedAt = null,
} = {}) {
  const studentId = String(suppliedStudentId || live.studentId || "").trim();
  const assignmentId = String(live.assignmentId || "").trim();
  const startedAt = Number(live.startedAt) || 0;
  const summaryId = studentSessionSummary.sessionSummaryIdFor({ studentId, assignmentId, startedAt });
  if (!summaryId) return false;

  const db = getFirestore();
  const grade = await db.collection("grades").doc(studentId).get();
  const gradeData = grade.exists ? (grade.data() || {}) : {};
  const ref = db.collection(STUDENT_SESSION_SUMMARY_COLLECTION).doc(summaryId);
  const endedAt = Number(observedAt) || Number(live.updatedAt) || Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? (snapshot.data() || {}) : {};
    const summary = studentSessionSummary.buildMergedSessionSummary({
      live,
      gradeData,
      studentId,
      previous,
      observedAt: endedAt,
    });
    if (!summary) return;

    transaction.set(ref, {
      ...summary,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: previous.createdAt || FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return true;
}

// Normal clean exit. The stable session id means an accidental duplicate delete
// can only merge into the same compact record; it cannot manufacture another
// class session.
exports.archiveStudentPresenceSession = onDocumentDeleted("presence/{studentId}", async (event) => {
  const live = event.data?.data() || {};
  await archiveStudentPresenceSnapshot({
    live,
    studentId: event.params.studentId,
    observedAt: Number(live.updatedAt) || Date.now(),
  });
});

// Browsers cannot guarantee a Firestore delete when a Chromebook tab is killed,
// the device sleeps, or Wi-Fi disappears. Sweep only documents whose heartbeat
// has been stale for at least three minutes. The transaction re-checks the live
// document immediately before deleting it, so a student who just reconnected is
// never expired by an old query result. The deletion trigger above performs the
// archive.
exports.expireStaleStudentPresence = onSchedule({
  schedule: "every 5 minutes",
  // setGlobalOptions({ invoker: "public" }) exists for Firebase client callables.
  // A scheduler job is server infrastructure, so override that global HTTPS
  // setting here rather than exposing the cleanup endpoint publicly.
  invoker: "private",
}, async () => {
  const db = getFirestore();
  const cutoff = Date.now() - PRESENCE_STALE_AFTER_MS;
  const stale = await db.collection("presence")
    .where("updatedAt", "<", cutoff)
    .limit(500)
    .get();

  let expired = 0;
  for (const candidate of stale.docs) {
    // eslint-disable-next-line no-await-in-loop
    const didExpire = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      if (!current.exists) return false;
      const live = current.data() || {};
      if ((Number(live.updatedAt) || 0) >= cutoff) return false;
      transaction.delete(candidate.ref);
      return true;
    });
    if (didExpire) expired += 1;
  }

  if (expired) {
    logger.info("Expired stale student presence documents", {
      expired,
      scanned: stale.size,
      cutoff,
    });
  }
});

// Client stop paths erase frames immediately. This sweep is the backstop for
// killed tabs, closed Chromebooks and lost networks: expired response-bearing
// presentation content is physically removed rather than retained as history.
exports.deleteExpiredStudentSpotlightFrames = onSchedule({
  schedule: "every 5 minutes",
  invoker: "private",
}, async () => {
  const result = await liveSpotlight.deleteExpiredSpotlightFrames(getFirestore());
  if (result.deleted) logger.info("Deleted expired Student Spotlight frames", result);
});

exports.hydrateAssignmentCcmr = onCall({
  timeoutSeconds: 60,
  memory: "1GiB",
}, async (request) => {
  const teacherUid = await requireTeacher(request);
  const assignment = request.data?.assignment;
  if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
    throw new HttpsError("invalid-argument", "Provide one Assignment V5 object to prepare CCMR Practice.");
  }
  if (Number(assignment.schemaVersion) !== 5 || !Array.isArray(assignment.sections)) {
    throw new HttpsError("failed-precondition", "CCMR bank hydration requires Assignment V5 sections.");
  }

  try {
    const result = ccmrAssignmentBank.replaceDirectCcmrQuestionsWithAuditedBank(assignment, {
      ensurePracticeTarget: request.data?.ensurePracticeTarget === true,
    });
    await getFirestore().collection("assignmentCcmrHydrationAudit").add({
      teacherUid,
      teacherEmail: callerEmail(request),
      releaseTarget: result.audit?.releaseTarget || null,
      replaced: Number(result.audit?.replaced || 0),
      autoSourced: Number(result.audit?.autoSourced || 0),
      targetCount: Number(result.audit?.targetCount || 0),
      missCount: Array.isArray(result.audit?.misses) ? result.audit.misses.length : 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  } catch (error) {
    logger.error("Assignment CCMR bank hydration failed", {
      teacherUid,
      message: error?.message || String(error),
    });
    throw new HttpsError("internal", "MathMaster could not prepare audited CCMR Practice for this assignment.");
  }
});

function assignmentAiModel() {
  return String(readPublicEnv("OPENAI_ASSIGNMENT_MODEL", assignmentAi.DEFAULT_ASSIGNMENT_MODEL) || "").trim()
    || assignmentAi.DEFAULT_ASSIGNMENT_MODEL;
}

function assignmentAiReasoningEffort(fallback) {
  const configured = String(readPublicEnv("OPENAI_ASSIGNMENT_REASONING_EFFORT", "") || "").trim().toLowerCase();
  return ["low", "medium", "high"].includes(configured) ? configured : fallback;
}

// Shared body for every integrated AI call. One reservation, one provider round
// trip, one audit record whichever way it goes, and a refunded reservation when
// the failure was infrastructure rather than the teacher's request.
async function runAssignmentAiRequest(request, {
  prompt,
  mode,
  reasoningEffort,
  surface,
  ccmrEnrichment = false,
}) {
  const teacherUid = await requireTeacher(request);
  const db = getFirestore();
  const requestedModel = assignmentAiModel();
  const context = {
    surface,
    mode,
    teacherUid,
    requestedModel,
    promptCharacters: prompt.length,
  };

  let reservation = null;
  try {
    reservation = await reserveAssignmentAiUsage(db, teacherUid);
    const result = await assignmentAi.callOpenAiAssignmentAuthor({
      apiKey: readOpenAiApiKey(),
      prompt,
      model: requestedModel,
      mode,
      reasoningEffort: assignmentAiReasoningEffort(reasoningEffort),
      timeoutMs: assignmentAi.DEFAULT_PROVIDER_TIMEOUT_MS,
      ccmrEnrichment,
    });

    await db.collection("assignmentAiAudit").add({
      teacherUid,
      teacherEmail: callerEmail(request),
      provider: "openai",
      outcome: "success",
      surface,
      mode,
      model: result.model,
      responseId: result.responseId,
      usage: result.usage || null,
      diagnostics: result.diagnostics || null,
      ccmrBank: result.ccmrBank || null,
      promptCharacters: prompt.length,
      createdAt: FieldValue.serverTimestamp(),
    });

    return result;
  } catch (error) {
    const translated = translateAssignmentAiError(error, context);
    const code = String(translated?.code || "").replace(/^functions\//, "");
    if (reservation && ASSIGNMENT_AI_REFUNDABLE_CODES.has(code)) {
      await refundAssignmentAiUsage(db, teacherUid, reservation.dayKey);
    }
    if (reservation) {
      await recordAssignmentAiFailure(db, {
        teacherUid,
        teacherEmail: callerEmail(request),
        provider: "openai",
        surface,
        mode,
        model: requestedModel,
        code,
        diagnostics: error instanceof assignmentAi.AssignmentAiError ? (error.details || null) : null,
        message: String(translated?.message || "").slice(0, 500),
        promptCharacters: prompt.length,
        refunded: ASSIGNMENT_AI_REFUNDABLE_CODES.has(code),
      });
    }
    throw translated;
  }
}

exports.authorAssignmentWithAI = onCall({
  secrets: ASSIGNMENT_AI_SECRETS,
  timeoutSeconds: 300,
  memory: "1GiB",
}, async (request) => runAssignmentAiRequest(request, {
  prompt: String(request.data?.prompt || "").trim(),
  mode: "assignment",
  reasoningEffort: "medium",
  surface: "assignmentBuild",
  ccmrEnrichment: request.data?.ccmrEnrichment === true,
}));

// Preflight's per-question repair. It asks for one replacement question rather
// than a whole assignment, so it fits comfortably inside the output budget and
// cannot quietly rewrite the rest of the lesson.
exports.repairAssignmentQuestionWithAI = onCall({
  secrets: ASSIGNMENT_AI_SECRETS,
  timeoutSeconds: 120,
  memory: "512MiB",
}, async (request) => runAssignmentAiRequest(request, {
  prompt: String(request.data?.prompt || "").trim(),
  mode: "question",
  reasoningEffort: "low",
  surface: "questionRepair",
}));

/**
 * The only write path for elevated full-assignment repairs. Authorization and
 * revision are read from trusted server state again inside one transaction.
 */
exports.commitFullAssignmentRepair = onCall(async (request) => {
  let authorizationType;
  try { authorizationType = fullAssignmentRepair.requireRepairAuthority(request.auth); } catch (error) {
    throw new HttpsError(error.code || "permission-denied", error.message);
  }
  const db = getFirestore();
  const assignmentId = String(request.data?.assignmentId || "").trim();
  if (!assignmentId) throw new HttpsError("invalid-argument", "Choose a Library assignment to repair.");
  const assignmentRef = db.collection("assignments").doc(assignmentId);
  const auditRef = db.collection("assignmentRepairAudits").doc();
  const historyRef = db.collection("assignmentRepairHistory").doc();

  try {
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(assignmentRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "That Library assignment no longer exists.");
      const stored = { id: snapshot.id, ...snapshot.data() };
      const prepared = fullAssignmentRepair.prepareCommit({ assignment: stored, request: request.data });
      // Only authored question containers and the revision are written. This
      // allow-list excludes publication, grades, submissions and historical data.
      const update = { assignmentRevision: prepared.toRevision };
      if (Array.isArray(prepared.assignment.sections)) update.sections = prepared.assignment.sections;
      else update.questions = prepared.assignment.questions;
      transaction.update(assignmentRef, update);

      const auditResults = Array.isArray(request.data?.auditResults) ? request.data.auditResults : [];
      const count = (classification) => auditResults.filter((item) => item?.classification === classification).length;
      transaction.set(historyRef, {
        assignmentId, fromRevision: prepared.fromRevision, toRevision: prepared.toRevision,
        scope: fullAssignmentRepair.SCOPE, questionIds: prepared.changedQuestionIds,
        questions: prepared.changedQuestions,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(auditRef, {
        assignmentId, startingRevision: prepared.fromRevision, resultingRevision: prepared.toRevision,
        auditScope: fullAssignmentRepair.SCOPE, actorUid: request.auth.uid,
        actorEmail: callerEmail(request) || null, actorAuthorizationType: authorizationType,
        questionIdsChanged: prepared.changedQuestionIds, numberAudited: auditResults.length,
        numberPassed: count("passed"), numberAssignmentIssues: count("assignmentIssue"),
        numberPlatformIssues: count("platformIssue"), numberUnclear: count("unclear"),
        proposedRepairsAccepted: prepared.changedQuestionIds.length,
        proposedRepairsRejected: Math.max(0, (request.data?.replacements?.length || 0) - prepared.changedQuestionIds.length),
        commitOutcome: "committed", createdAt: FieldValue.serverTimestamp(),
      });
      const classifiedPlatformIssues = auditResults
        .filter((item) => item?.classification === "platformIssue")
        .map((item) => ({ ...item }));
      const globalPlatformIssues = (Array.isArray(request.data?.globalFindings) ? request.data.globalFindings : [])
        .filter((item) => item?.classification === "platformIssue")
        .map((item) => ({ ...item, questionId: null }));
      const platformIssues = [
        ...(Array.isArray(request.data?.platformIssues) ? request.data.platformIssues : []),
        ...classifiedPlatformIssues,
        ...globalPlatformIssues,
      ];
      for (const issue of platformIssues) {
        const issueRef = db.collection("assignmentPlatformIssues").doc();
        transaction.set(issueRef, {
          assignmentId, auditId: auditRef.id, classification: "platformIssue",
          questionId: String(issue?.questionId || "").trim() || null,
          reason: String(issue?.reason || "").trim().slice(0, 2000),
          suspectedComponent: String(issue?.suspectedComponent || "MathMaster platform").trim().slice(0, 500),
          status: "open", reportedAt: FieldValue.serverTimestamp(),
        });
      }
      return { assignmentId, revision: prepared.toRevision, changedQuestionIds: prepared.changedQuestionIds, auditId: auditRef.id };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("failed-precondition", error.message || "The full assignment repair was refused.");
  }
});

function contentUpgradeAudience(assignment = {}) {
  const classIds = [...new Set(
    (Array.isArray(assignment?.assignedClassIds) ? assignment.assignedClassIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
  const periods = [...new Set(
    (Array.isArray(assignment?.assignedClassPeriods) ? assignment.assignedClassPeriods : [])
      .map((value) => String(value || "").trim())
      .filter((value) => value && value !== "Unassigned")
  )];
  return { classIds, periods };
}

function assertLegacyPeriodOwnership(classes, periods, email) {
  for (const period of periods) {
    const matches = (Array.isArray(classes) ? classes : []).filter((record) => (
      record?.status !== "archived"
      && String(record?.period || "").trim() === period
    ));
    if (matches.length !== 1) {
      throw new HttpsError(
        "failed-precondition",
        `This older assignment targets ${period} by period name instead of a class ID, and MathMaster cannot identify exactly one active class for that period. Open Dates & Classes once to bind it to a specific class, then retry the Content V2 upgrade.`
      );
    }
    if (String(matches[0]?.teacherOfRecord || "").trim().toLowerCase() !== email) {
      throw new HttpsError(
        "permission-denied",
        `Only the teacher of record for ${period}, or the root administrator, can upgrade this live assignment.`
      );
    }
  }
}

async function requireContentUpgradeOwner(db, request, assignment) {
  await requireTeacher(request);
  const email = callerEmail(request);
  if (!email) {
    throw new HttpsError("permission-denied", "A verified teacher email is required for a live content upgrade.");
  }

  const { classIds, periods } = contentUpgradeAudience(assignment);
  if (!classIds.length && !periods.length) {
    throw new HttpsError("failed-precondition", "Choose an assigned copy to upgrade.");
  }

  // The verified root email is the authority used elsewhere in MathMaster.
  // Do not additionally depend on a possibly stale custom-token rootAdmin claim.
  if (authLib.isRootAdminEmail(email)) {
    return { uid: request.auth.uid, email, authorizationType: "administrator" };
  }

  if (classIds.length) {
    const classSnapshots = await Promise.all(
      classIds.map((classId) => db.collection("classes").doc(classId).get())
    );
    const ownsEveryClass = classSnapshots.every((snapshot) => (
      snapshot.exists
      && snapshot.data()?.status !== "archived"
      && String(snapshot.data()?.teacherOfRecord || "").trim().toLowerCase() === email
    ));
    if (!ownsEveryClass) {
      throw new HttpsError(
        "permission-denied",
        "Only the teacher of record for every assigned class, or the root administrator, can upgrade this live assignment."
      );
    }
    return { uid: request.auth.uid, email, authorizationType: "teacherOwner" };
  }

  const classes = await loadClasses(db);
  assertLegacyPeriodOwnership(classes, periods, email);
  return { uid: request.auth.uid, email, authorizationType: "teacherOwnerLegacyPeriod" };
}

function contentUpgradeGradeQueries(db, assignment = {}) {
  const { classIds, periods } = contentUpgradeAudience(assignment);
  const queries = [];
  classIds.forEach((classId) => {
    queries.push(db.collection("grades").where("classId", "==", classId).select("gradesByAssignment"));
  });
  periods.forEach((period) => {
    queries.push(db.collection("grades").where("classPeriod", "==", period).select("gradesByAssignment"));
  });
  return queries;
}

function contentUpgradeTrackerRows(snapshots, assignmentId) {
  const seen = new Set();
  const rows = [];
  (Array.isArray(snapshots) ? snapshots : []).forEach((snapshot) => {
    snapshot.docs.forEach((gradeDoc) => {
      if (seen.has(gradeDoc.id)) return;
      const tracker = gradeDoc.data()?.gradesByAssignment?.[assignmentId];
      if (tracker === undefined) return;
      seen.add(gradeDoc.id);
      rows.push({ studentId: gradeDoc.id, ref: gradeDoc.ref, tracker });
    });
  });
  return rows;
}

async function loadSavedAssignmentTrackers(db, assignmentId, assignment) {
  const queries = contentUpgradeGradeQueries(db, assignment);
  if (!queries.length) return [];
  const snapshots = await Promise.all(queries.map((queryRef) => queryRef.get()));
  return contentUpgradeTrackerRows(snapshots, assignmentId);
}

async function loadSavedAssignmentTrackersInTransaction(transaction, db, assignmentId, assignment) {
  const snapshots = [];
  for (const queryRef of contentUpgradeGradeQueries(db, assignment)) {
    // Keep all transaction reads before writes and avoid reading the entire school roster.
    // eslint-disable-next-line no-await-in-loop
    snapshots.push(await transaction.get(queryRef));
  }
  return contentUpgradeTrackerRows(snapshots, assignmentId);
}

function contentUpgradeAlreadyCurrent(liveAssignment = {}, targetAssignment = {}) {
  const liveFamily = String(liveAssignment?.contentLineage?.familyId || "").trim();
  const targetFamily = String(targetAssignment?.contentLineage?.familyId || "").trim();
  const liveVersion = Number(liveAssignment?.contentLineage?.version || 1);
  const targetVersion = Number(targetAssignment?.contentLineage?.version || 1);
  return Boolean(
    liveFamily
    && liveFamily === targetFamily
    && Number.isFinite(liveVersion)
    && Number.isFinite(targetVersion)
    && liveVersion >= targetVersion
  );
}

function contentUpgradePreviewPayload(plan, affectedStudentCount) {
  return {
    fromVersion: plan.fromVersion,
    toVersion: plan.toVersion,
    liveAssignmentRevision: plan.liveAssignmentRevision,
    targetAssignmentRevision: plan.targetAssignmentRevision,
    counts: plan.counts,
    requiresFundamentalChoice: plan.requiresFundamentalChoice,
    planHash: plan.planHash,
    affectedStudentCount,
    changes: plan.changes.map((change) => ({
      questionId: change.questionId,
      flatIndex: change.flatIndex,
      sectionRole: change.sectionRole,
      classification: change.classification,
      safe: change.safe,
      reason: change.reason || null,
      affectedFieldIds: change.affectedFieldIds || [],
      gradingKeys: change.gradingKeys || [],
      beforePrompt: String(change.beforeQuestion?.prompt || change.beforeQuestion?.scenario || "").slice(0, 500),
      afterPrompt: String(change.afterQuestion?.prompt || change.afterQuestion?.scenario || "").slice(0, 500),
    })),
  };
}

exports.previewAssignmentContentUpgrade = onCall(async (request) => {
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const targetAssignmentId = String(request.data?.targetAssignmentId || "").trim();

  try {
    const db = getFirestore();
    if (!assignmentId || !targetAssignmentId) {
      throw new HttpsError("invalid-argument", "Choose the assigned copy and the newer content release.");
    }

    const [liveSnapshot, targetSnapshot] = await Promise.all([
      db.collection("assignments").doc(assignmentId).get(),
      db.collection("assignments").doc(targetAssignmentId).get(),
    ]);
    if (!liveSnapshot.exists || !targetSnapshot.exists) {
      throw new HttpsError("not-found", "The assigned copy or newer content release no longer exists.");
    }

    const liveAssignment = { id: liveSnapshot.id, ...liveSnapshot.data() };
    const targetAssignment = { id: targetSnapshot.id, ...targetSnapshot.data() };
    await requireContentUpgradeOwner(db, request, liveAssignment);

    const targetClassIds = Array.isArray(targetAssignment.assignedClassIds)
      ? targetAssignment.assignedClassIds.filter(Boolean)
      : [];
    const targetPeriods = Array.isArray(targetAssignment.assignedClassPeriods)
      ? targetAssignment.assignedClassPeriods.filter((value) => String(value || "").trim() && String(value || "").trim() !== "Unassigned")
      : [];
    if (targetClassIds.length || targetPeriods.length) {
      throw new HttpsError("failed-precondition", "The upgrade target must be an unassigned Library content release.");
    }
    if (targetAssignment?.contentLineage?.releaseStatus !== "current") {
      throw new HttpsError("failed-precondition", "Choose the current content release for this assignment family.");
    }

    if (contentUpgradeAlreadyCurrent(liveAssignment, targetAssignment)) {
      const liveVersion = Number(liveAssignment?.contentLineage?.version || 1);
      const targetVersion = Number(targetAssignment?.contentLineage?.version || 1);
      return {
        alreadyCurrent: true,
        fromVersion: liveVersion,
        toVersion: targetVersion,
        liveAssignmentRevision: Number(liveAssignment.assignmentRevision || 1),
        targetAssignmentRevision: Number(targetAssignment.assignmentRevision || 1),
        counts: { unchanged: 0, safeResponseControl: 0, graphViewportRepair: 0, gradingExpansion: 0, clarificationOnly: 0, fundamental: 0 },
        requiresFundamentalChoice: false,
        planHash: null,
        affectedStudentCount: 0,
        changes: [],
        message: `Content V${liveVersion} is already applied to this assignment.`,
      };
    }

    const [plan, trackers] = await Promise.all([
      assignmentContentVersion.buildContentUpgradePlan({ liveAssignment, targetAssignment }),
      loadSavedAssignmentTrackers(db, assignmentId, liveAssignment),
    ]);
    return contentUpgradePreviewPayload(plan, trackers.length);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Content V2 upgrade preview failed", {
      assignmentId,
      targetAssignmentId,
      uid: request.auth?.uid || null,
      code: error?.code || null,
      message: String(error?.message || error || "Unknown error").slice(0, 1000),
      stack: String(error?.stack || "").slice(0, 4000),
    });
    throw new HttpsError(
      "unavailable",
      "MathMaster could not preview this Content V2 upgrade. Nothing was changed. The server logged the failure; retry after the Content V2 preview function is redeployed.",
      { reason: "content-upgrade-preview-failed" }
    );
  }
});

exports.commitAssignmentContentUpgrade = onCall(async (request) => {
  const db = getFirestore();
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const targetAssignmentId = String(request.data?.targetAssignmentId || "").trim();
  const expectedPlanHash = String(request.data?.expectedPlanHash || "").trim();
  const expectedAssignmentRevision = Number(request.data?.expectedAssignmentRevision);
  const expectedTargetRevision = Number(request.data?.expectedTargetRevision);
  const fundamentalChoices = request.data?.fundamentalChoices && typeof request.data.fundamentalChoices === "object"
    ? request.data.fundamentalChoices
    : {};

  if (!assignmentId || !targetAssignmentId || !expectedPlanHash) {
    throw new HttpsError("invalid-argument", "Preview this content upgrade before committing it.");
  }

  const initialLiveSnapshot = await db.collection("assignments").doc(assignmentId).get();
  if (!initialLiveSnapshot.exists) throw new HttpsError("not-found", "The assigned copy no longer exists.");
  const initialLive = { id: initialLiveSnapshot.id, ...initialLiveSnapshot.data() };
  await requireContentUpgradeOwner(db, request, initialLive);

  const actorEmail = callerEmail(request);
  const isRoot = Boolean(authLib.isRootAdminEmail(actorEmail));
  const eventRef = db.collection("assignmentVersionEvents").doc();

  try {
    return await db.runTransaction(async (transaction) => {
      const liveRef = db.collection("assignments").doc(assignmentId);
      const targetRef = db.collection("assignments").doc(targetAssignmentId);
      const liveSnapshot = await transaction.get(liveRef);
      const targetSnapshot = await transaction.get(targetRef);
      if (!liveSnapshot.exists || !targetSnapshot.exists) {
        throw new HttpsError("not-found", "The assigned copy or target content release no longer exists.");
      }

      const liveAssignment = { id: liveSnapshot.id, ...liveSnapshot.data() };
      const targetAssignment = { id: targetSnapshot.id, ...targetSnapshot.data() };

      if (contentUpgradeAlreadyCurrent(liveAssignment, targetAssignment)) {
        return {
          alreadyUpgraded: true,
          assignmentId,
          targetAssignmentId,
          contentVersion: Number(liveAssignment?.contentLineage?.version || 1),
          assignmentRevision: Number(liveAssignment.assignmentRevision || 1),
          counts: { unchanged: 0, safeResponseControl: 0, graphViewportRepair: 0, gradingExpansion: 0, clarificationOnly: 0, fundamental: 0 },
          replacementQuestionIds: {},
          affectedStudentCount: 0,
          migratedStudentCount: 0,
          gradeReconciliationRequested: false,
        };
      }

      if (Number(liveAssignment.assignmentRevision || 1) !== expectedAssignmentRevision
        || Number(targetAssignment.assignmentRevision || 1) !== expectedTargetRevision) {
        throw new HttpsError(
          "failed-precondition",
          "This assignment or its target release changed after preview. Preview the upgrade again."
        );
      }
      if (targetAssignment?.contentLineage?.releaseStatus !== "current"
        || (targetAssignment.assignedClassIds || []).filter(Boolean).length) {
        throw new HttpsError("failed-precondition", "The selected target is no longer the current unassigned Library release.");
      }

      const plan = await assignmentContentVersion.buildContentUpgradePlan({
        liveAssignment,
        targetAssignment,
      });
      if (plan.planHash !== expectedPlanHash) {
        throw new HttpsError(
          "failed-precondition",
          "The content upgrade plan changed after preview. Nothing was changed; preview it again."
        );
      }

      const fundamentalIds = plan.changes
        .filter((change) => change.classification === "fundamental")
        .map((change) => change.questionId);
      for (const questionId of fundamentalIds) {
        if (!["retire-only", "retire-and-replace"].includes(fundamentalChoices[questionId])) {
          throw new HttpsError(
            "failed-precondition",
            `Choose Retire only or Retire + replacement for fundamental correction "${questionId}".`
          );
        }
      }

      const { classIds, periods } = contentUpgradeAudience(liveAssignment);
      if (!classIds.length && !periods.length) {
        throw new HttpsError("failed-precondition", "This assignment is no longer assigned to a class.");
      }
      if (!isRoot) {
        if (classIds.length) {
          const classSnapshots = [];
          for (const classId of classIds) {
            // All reads occur before any transaction write.
            // eslint-disable-next-line no-await-in-loop
            classSnapshots.push(await transaction.get(db.collection("classes").doc(classId)));
          }
          const ownsEveryClass = classSnapshots.length === classIds.length && classSnapshots.every((snapshot) => (
            snapshot.exists
            && snapshot.data()?.status !== "archived"
            && String(snapshot.data()?.teacherOfRecord || "").trim().toLowerCase() === actorEmail
          ));
          if (!ownsEveryClass) {
            throw new HttpsError(
              "permission-denied",
              "Class ownership changed after preview. Only the current teacher of record may upgrade this live assignment."
            );
          }
        } else {
          const legacyClasses = [];
          for (const period of periods) {
            // Legacy assignments may predate class IDs. Query by the exact stored
            // period inside the same transaction so the ownership decision cannot
            // drift between preview and commit.
            // eslint-disable-next-line no-await-in-loop
            const periodSnapshot = await transaction.get(
              db.collection(CLASS_COLLECTION).where("period", "==", period)
            );
            periodSnapshot.docs.forEach((doc) => legacyClasses.push({ classId: doc.id, ...doc.data() }));
          }
          assertLegacyPeriodOwnership(legacyClasses, periods, actorEmail);
        }
      }

      const trackerDocs = await loadSavedAssignmentTrackersInTransaction(
        transaction,
        db,
        assignmentId,
        liveAssignment
      );
      if (trackerDocs.length > 450) {
        throw new HttpsError(
          "resource-exhausted",
          "This assignment has more than 450 saved student records. Use the server migration path in smaller cohorts instead of a partial content upgrade."
        );
      }

      const upgraded = assignmentContentVersion.buildUpgradedAssignment({
        liveAssignment,
        targetAssignment,
        plan,
        fundamentalChoices,
      });
      const correctedAt = new Date().toISOString();
      let migratedStudents = 0;
      let gradeReconciliationRequested = false;

      const migratedRows = trackerDocs.map((gradeRow) => {
        const migration = assignmentContentTrackerMigration.migrateTrackerForContentUpgrade({
          tracker: gradeRow.tracker,
          plan,
          correctedAt,
        });
        if (migration.changed) migratedStudents += 1;
        if (migration.gradeMayChange) gradeReconciliationRequested = true;
        return { gradeRow, migration };
      });

      transaction.update(liveRef, {
        sections: upgraded.assignment.sections,
        assignmentRevision: upgraded.assignment.assignmentRevision,
        contentLineage: upgraded.assignment.contentLineage,
        contentUpgrade: {
          fromVersion: plan.fromVersion,
          toVersion: plan.toVersion,
          targetAssignmentId,
          upgradedAt: correctedAt,
          upgradedBy: request.auth.uid,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      migratedRows.forEach(({ gradeRow, migration }) => {
        if (!migration.changed) return;
        transaction.update(
          gradeRow.ref,
          new FieldPath("gradesByAssignment", assignmentId),
          migration.tracker
        );
        if (migration.gradeMayChange) {
          transaction.update(
            gradeRow.ref,
            new FieldPath("classroomReleaseSignals", assignmentId),
            {
              requestedAt: correctedAt,
              // Reuse the section-grade reconciliation trigger delivered by
              // PR #177.  A content upgrade may change the derived grade, but
              // it must not invent a parallel Classroom passback protocol.
              reason: "section-grade-reconcile",
              source: "assignment-content-version",
            }
          );
        }
      });

      transaction.set(eventRef, {
        eventType: "liveUpgrade",
        familyId: upgraded.assignment.contentLineage.familyId,
        sourceAssignmentId: assignmentId,
        targetAssignmentId,
        sourceContentVersion: plan.fromVersion,
        targetContentVersion: plan.toVersion,
        actorUid: request.auth.uid,
        actorEmail: actorEmail || null,
        actorAuthorizationType: isRoot ? "administrator" : "teacherOwner",
        fromAssignmentRevision: plan.liveAssignmentRevision,
        toAssignmentRevision: upgraded.assignment.assignmentRevision,
        changeCounts: plan.counts,
        affectedQuestionIds: plan.changes
          .filter((change) => change.classification !== "unchanged")
          .map((change) => change.questionId),
        replacementQuestionIds: upgraded.replacementQuestionIds,
        affectedStudentCount: trackerDocs.length,
        migratedStudentCount: migratedStudents,
        gradeReconciliationRequested,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        assignmentId,
        targetAssignmentId,
        contentVersion: plan.toVersion,
        assignmentRevision: upgraded.assignment.assignmentRevision,
        counts: plan.counts,
        replacementQuestionIds: upgraded.replacementQuestionIds,
        affectedStudentCount: trackerDocs.length,
        migratedStudentCount: migratedStudents,
        gradeReconciliationRequested,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "failed-precondition",
      error.message || "MathMaster refused the live content upgrade."
    );
  }
});

/*
 * AUTHORITATIVE TEACHER QUESTION REPAIR.
 *
 * Teacher Review's flow is "paste/upload repair -> preview corrected question
 * -> Apply Corrected Question". previewTeacherQuestionRepair and
 * commitTeacherQuestionRepair are the only write paths: MathMaster decides
 * server-side, via functions/lib/teacherQuestionRepair.js, whether a
 * mathematically correct candidate question can replace directly, update in
 * place, or must retire the historical question and append a corrected
 * replacement. See that module for how it reuses the Content V2 classifier,
 * the Safe Live Repair analyzer, and the grade-tracker migration already
 * proven out by previewAssignmentContentUpgrade / commitAssignmentContentUpgrade
 * above.
 */

// owner/admin/designated-repairer: an administrator or a designated repairer
// (functions/lib/fullAssignmentRepair.js's authority, unchanged) may repair
// ANY assignment, assigned or not. A plain teacher may repair a LIVE copy
// only if they own every class it is assigned to -- the same rule
// requireContentUpgradeOwner already enforces for the Content V2 live
// upgrade, reused here rather than duplicated. An ordinary, unassigned
// editable assignment has no live student history to protect and is exactly
// the "any signed-in teacher may edit it" content Firestore's own
// `assignments` rule already allows (see firestore.rules: `allow update: if
// teacher()`, no ownership check) -- so any signed-in teacher may repair one
// here too, matching that existing model rather than inventing a stricter one.
async function requireTeacherQuestionRepairAuthority(db, request, assignment) {
  const uid = await requireTeacher(request);
  const email = callerEmail(request);
  if (!email) {
    throw new HttpsError("permission-denied", "A verified teacher email is required to repair a question.");
  }
  if (authLib.isRootAdminEmail(email)) {
    return { uid, email, authorizationType: "administrator" };
  }
  if (fullAssignmentRepair.repairAuthority(request.auth) === "designatedRepairer") {
    return { uid, email, authorizationType: "designatedRepairer" };
  }

  const { classIds, periods } = contentUpgradeAudience(assignment);
  if (!classIds.length && !periods.length) {
    return { uid, email, authorizationType: "teacherEditor" };
  }
  return requireContentUpgradeOwner(db, request, assignment);
}

function teacherQuestionRepairPreviewPayload(plan, affectedStudentCount) {
  return {
    assignmentId: plan.assignmentId,
    baseRevision: plan.baseRevision,
    planHash: plan.planHash,
    affectedStudentCount,
    hasStudentHistory: plan.hasStudentHistory,
    canApply: plan.canApply,
    counts: plan.counts,
    changes: plan.changes.map((change) => ({
      questionId: change.questionId,
      flatIndex: change.flatIndex,
      sectionRole: change.sectionRole,
      classification: change.classification,
      commitBehavior: change.commitBehavior,
      reason: change.reason || null,
      safe: change.safe,
      affectedFieldIds: change.affectedFieldIds || [],
      gradingKeys: change.gradingKeys || [],
      beforePrompt: String(change.beforeQuestion?.prompt || change.beforeQuestion?.scenario || "").slice(0, 500),
      afterPrompt: String(change.afterQuestion?.prompt || change.afterQuestion?.scenario || "").slice(0, 500),
    })),
  };
}

exports.previewTeacherQuestionRepair = onCall(async (request) => {
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const baseRevision = Number(request.data?.baseRevision);
  const replacements = Array.isArray(request.data?.replacements) ? request.data.replacements : [];

  try {
    const db = getFirestore();
    if (!assignmentId) {
      throw new HttpsError("invalid-argument", "Choose an assignment to repair.");
    }
    if (!Number.isInteger(baseRevision) || baseRevision < 1) {
      throw new HttpsError("invalid-argument", "A valid base assignment revision is required.");
    }
    if (!replacements.length) {
      throw new HttpsError("invalid-argument", "Provide at least one corrected question to preview.");
    }

    const snapshot = await db.collection("assignments").doc(assignmentId).get();
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "That assignment no longer exists.");
    }
    const liveAssignment = { id: snapshot.id, ...snapshot.data() };
    await requireTeacherQuestionRepairAuthority(db, request, liveAssignment);

    if (Number(liveAssignment.assignmentRevision || 1) !== baseRevision) {
      throw new HttpsError(
        "failed-precondition",
        "This assignment changed since this repair packet was built. Reload it and preview again."
      );
    }

    const trackers = await loadSavedAssignmentTrackers(db, assignmentId, liveAssignment);
    const plan = await teacherQuestionRepair.buildTeacherRepairPlan({
      liveAssignment,
      replacements,
      hasStudentHistory: trackers.length > 0,
    });

    return teacherQuestionRepairPreviewPayload(plan, trackers.length);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Teacher question repair preview failed", {
      assignmentId,
      uid: request.auth?.uid || null,
      code: error?.code || null,
      message: String(error?.message || error || "Unknown error").slice(0, 1000),
      stack: String(error?.stack || "").slice(0, 4000),
    });
    throw new HttpsError(
      "unavailable",
      "MathMaster could not preview this question repair. Nothing was changed. The server logged the failure; retry after the preview function is redeployed.",
      { reason: "teacher-question-repair-preview-failed" }
    );
  }
});

exports.commitTeacherQuestionRepair = onCall(async (request) => {
  const db = getFirestore();
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const baseRevision = Number(request.data?.baseRevision);
  const expectedPlanHash = String(request.data?.expectedPlanHash || "").trim();
  const replacements = Array.isArray(request.data?.replacements) ? request.data.replacements : [];

  if (!assignmentId || !expectedPlanHash) {
    throw new HttpsError("invalid-argument", "Preview this question repair before committing it.");
  }
  if (!Number.isInteger(baseRevision) || baseRevision < 1) {
    throw new HttpsError("invalid-argument", "A valid base assignment revision is required.");
  }
  if (!replacements.length) {
    throw new HttpsError("invalid-argument", "Provide at least one corrected question to apply.");
  }

  const initialSnapshot = await db.collection("assignments").doc(assignmentId).get();
  if (!initialSnapshot.exists) {
    throw new HttpsError("not-found", "That assignment no longer exists.");
  }
  const initialAssignment = { id: initialSnapshot.id, ...initialSnapshot.data() };
  const initialAuthorization = await requireTeacherQuestionRepairAuthority(db, request, initialAssignment);

  const actorEmail = callerEmail(request);
  const isRoot = Boolean(authLib.isRootAdminEmail(actorEmail));
  const isElevatedRepairer = fullAssignmentRepair.repairAuthority(request.auth) === "designatedRepairer";
  const eventRef = db.collection("assignmentVersionEvents").doc();

  try {
    return await db.runTransaction(async (transaction) => {
      const assignmentRef = db.collection("assignments").doc(assignmentId);
      const snapshot = await transaction.get(assignmentRef);
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "That assignment no longer exists.");
      }
      const liveAssignment = { id: snapshot.id, ...snapshot.data() };

      if (Number(liveAssignment.assignmentRevision || 1) !== baseRevision) {
        throw new HttpsError(
          "failed-precondition",
          "This assignment changed after preview. Nothing was changed; preview the repair again."
        );
      }

      // Re-check authorization against the CURRENT assignment/classes inside
      // the same transaction the write happens in, exactly like the Content
      // V2 live upgrade commit above.
      if (!isRoot && !isElevatedRepairer) {
        const { classIds, periods } = contentUpgradeAudience(liveAssignment);
        if (classIds.length) {
          const classSnapshots = [];
          for (const classId of classIds) {
            // All reads occur before any transaction write.
            // eslint-disable-next-line no-await-in-loop
            classSnapshots.push(await transaction.get(db.collection("classes").doc(classId)));
          }
          const ownsEveryClass = classSnapshots.length === classIds.length && classSnapshots.every((snap) => (
            snap.exists
            && snap.data()?.status !== "archived"
            && String(snap.data()?.teacherOfRecord || "").trim().toLowerCase() === actorEmail
          ));
          if (!ownsEveryClass) {
            throw new HttpsError(
              "permission-denied",
              "Class ownership changed after preview. Only the current teacher of record may apply this repair."
            );
          }
        } else if (periods.length) {
          const legacyClasses = [];
          for (const period of periods) {
            // eslint-disable-next-line no-await-in-loop
            const periodSnapshot = await transaction.get(
              db.collection(CLASS_COLLECTION).where("period", "==", period)
            );
            periodSnapshot.docs.forEach((doc) => legacyClasses.push({ classId: doc.id, ...doc.data() }));
          }
          assertLegacyPeriodOwnership(legacyClasses, periods, actorEmail);
        }
        // else: an ordinary, unassigned editable assignment. Any signed-in
        // teacher may repair it, matching Firestore's own `assignments` rule
        // (`allow update: if teacher()`, no ownership check) -- there is no
        // live student history on an unassigned assignment to protect, so
        // there is nothing here to re-check beyond requireTeacher, already
        // enforced by requireTeacherQuestionRepairAuthority above.
      }

      const trackerDocs = await loadSavedAssignmentTrackersInTransaction(
        transaction,
        db,
        assignmentId,
        liveAssignment
      );
      if (trackerDocs.length > 450) {
        throw new HttpsError(
          "resource-exhausted",
          "This assignment has more than 450 saved student records. Use the server migration path in smaller cohorts instead of a partial repair."
        );
      }
      const hasStudentHistory = trackerDocs.length > 0;

      const plan = await teacherQuestionRepair.buildTeacherRepairPlan({
        liveAssignment,
        replacements,
        hasStudentHistory,
      });
      if (plan.planHash !== expectedPlanHash) {
        throw new HttpsError(
          "failed-precondition",
          "This repair plan changed after preview. Nothing was changed; preview it again."
        );
      }

      if (!plan.canApply) {
        return {
          applied: false,
          assignmentId,
          baseRevision,
          assignmentRevision: Number(liveAssignment.assignmentRevision || 1),
          counts: plan.counts,
          replacementQuestionIds: {},
          affectedStudentCount: trackerDocs.length,
          migratedStudentCount: 0,
          gradeReconciliationRequested: false,
        };
      }

      const correctedAt = new Date().toISOString();
      const built = await teacherQuestionRepair.buildRepairedAssignment({
        liveAssignment,
        plan,
        correctionEventId: eventRef.id,
      });

      let migratedStudents = 0;
      let gradeReconciliationRequested = false;
      const migratedRows = trackerDocs.map((gradeRow) => {
        const migration = assignmentContentTrackerMigration.migrateTrackerForContentUpgrade({
          tracker: gradeRow.tracker,
          plan,
          correctedAt,
        });
        if (migration.changed) migratedStudents += 1;
        if (migration.gradeMayChange) gradeReconciliationRequested = true;
        return { gradeRow, migration };
      });

      // Allow-listed update: only authored question containers and the
      // revision move. Operational assignment data (classes, dates,
      // Classroom mappings, publication state, accommodations) is untouched,
      // so this can never create a new Classroom assignment or repost.
      transaction.update(assignmentRef, {
        sections: built.assignment.sections,
        assignmentRevision: built.assignment.assignmentRevision,
        updatedAt: FieldValue.serverTimestamp(),
      });

      migratedRows.forEach(({ gradeRow, migration }) => {
        if (!migration.changed) return;
        transaction.update(
          gradeRow.ref,
          new FieldPath("gradesByAssignment", assignmentId),
          migration.tracker
        );
        if (migration.gradeMayChange) {
          transaction.update(
            gradeRow.ref,
            new FieldPath("classroomReleaseSignals", assignmentId),
            {
              requestedAt: correctedAt,
              // Reuse the section-grade reconciliation trigger delivered by
              // PR #177, same as the Content V2 live upgrade above. A
              // question repair may change the derived grade, but it must
              // not invent a parallel Classroom passback protocol.
              reason: "section-grade-reconcile",
              source: "teacher-question-repair",
            }
          );
        }
      });

      transaction.set(eventRef, {
        eventType: "teacherQuestionRepair",
        assignmentId,
        actorUid: request.auth.uid,
        actorEmail: actorEmail || null,
        actorAuthorizationType: isRoot ? "administrator" : (isElevatedRepairer ? "designatedRepairer" : initialAuthorization.authorizationType),
        fromAssignmentRevision: baseRevision,
        toAssignmentRevision: built.assignment.assignmentRevision,
        hasStudentHistory,
        changeCounts: plan.counts,
        changes: plan.changes
          .filter((change) => change.classification !== "unchanged")
          .map((change) => ({
            questionId: change.questionId,
            classification: change.classification,
            commitBehavior: change.commitBehavior,
            replacementQuestionId: built.replacementQuestionIds[change.questionId] || null,
            // Always true by construction: a repair either touches no stored
            // response (graphViewportRepair, clarificationOnly, no history),
            // monotonically improves credit without losing attempts
            // (safeResponseControl, gradingExpansion), or leaves the
            // historical record completely untouched under its own
            // protected index (fundamental retire + replace).
            historyPreserved: true,
          })),
        replacementQuestionIds: built.replacementQuestionIds,
        affectedStudentCount: trackerDocs.length,
        migratedStudentCount: migratedStudents,
        gradeReconciliationRequested,
        planHash: plan.planHash,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        applied: true,
        assignmentId,
        baseRevision,
        assignmentRevision: built.assignment.assignmentRevision,
        counts: plan.counts,
        replacementQuestionIds: built.replacementQuestionIds,
        affectedStudentCount: trackerDocs.length,
        migratedStudentCount: migratedStudents,
        gradeReconciliationRequested,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "failed-precondition",
      error.message || "MathMaster refused this question repair."
    );
  }
});

/**
 * Create the next human-facing Content V# release from one reviewed Full Assignment Audit.
 * This never edits the source question content and never assigns the successor to students.
 */
exports.createAssignmentContentVersion = onCall(async (request) => {
  let authorizationType;
  try {
    authorizationType = fullAssignmentRepair.requireRepairAuthority(request.auth);
  } catch (error) {
    throw new HttpsError(error.code || "permission-denied", error.message);
  }

  const db = getFirestore();
  const assignmentId = String(request.data?.assignmentId || "").trim();
  if (!assignmentId) {
    throw new HttpsError("invalid-argument", "Choose an assignment before creating a corrected content release.");
  }

  const sourceRef = db.collection("assignments").doc(assignmentId);
  const releaseRef = db.collection("assignments").doc();
  const auditRef = db.collection("assignmentRepairAudits").doc();
  const eventRef = db.collection("assignmentVersionEvents").doc();

  try {
    return await db.runTransaction(async (transaction) => {
      const sourceSnapshot = await transaction.get(sourceRef);
      if (!sourceSnapshot.exists) {
        throw new HttpsError("not-found", "That assignment no longer exists.");
      }

      const stored = { id: sourceSnapshot.id, ...sourceSnapshot.data() };
      const reviewed = fullAssignmentRepair.prepareCommit({
        assignment: stored,
        request: request.data,
      });
      if (!reviewed.changedQuestionIds.length) {
        throw new HttpsError(
          "failed-precondition",
          "Select at least one approved assignment repair before creating a corrected content release."
        );
      }

      const rawLineage = stored.contentLineage && typeof stored.contentLineage === "object"
        ? stored.contentLineage
        : {};
      const existingFamilyId = String(rawLineage.familyId || "").trim();
      const familyId = existingFamilyId || crypto.randomUUID();
      const sourceVersion = Number.isInteger(Number(rawLineage.version)) && Number(rawLineage.version) > 0
        ? Number(rawLineage.version)
        : 1;

      let familyDocs = [];
      if (existingFamilyId) {
        const familyQuery = db.collection("assignments")
          .where("contentLineage.familyId", "==", familyId);
        const familySnapshot = await transaction.get(familyQuery);
        familyDocs = familySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), ref: doc.ref }));
      } else {
        familyDocs = [{ ...stored, ref: sourceRef }];
      }

      const highestVersion = familyDocs.reduce((highest, entry) => {
        const version = Number(entry?.contentLineage?.version || (entry.id === stored.id ? sourceVersion : 1));
        return Number.isInteger(version) && version > highest ? version : highest;
      }, sourceVersion);

      if (sourceVersion !== highestVersion || rawLineage.releaseStatus === "superseded") {
        throw new HttpsError(
          "failed-precondition",
          `This assignment is Content V${sourceVersion}, but a newer family release already exists. Create the next correction from the current release instead.`
        );
      }

      const nextVersion = highestVersion + 1;
      const preparedRelease = assignmentContentVersion.prepareContentRelease({
        sourceAssignment: stored,
        reviewedAssignment: reviewed.assignment,
        familyId,
        nextVersion,
        actorUid: request.auth.uid,
        auditId: auditRef.id,
      });
      const release = {
        ...preparedRelease.release,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      transaction.set(releaseRef, release);

      const sourceLineage = {
        ...rawLineage,
        familyId,
        version: sourceVersion,
        label: `V${sourceVersion}`,
        releaseStatus: "superseded",
        supersedesVersion: Number.isInteger(Number(rawLineage.supersedesVersion))
          ? Number(rawLineage.supersedesVersion)
          : null,
        sourceAssignmentId: rawLineage.sourceAssignmentId || null,
        createdFromAuditId: rawLineage.createdFromAuditId || null,
        createdBy: rawLineage.createdBy || request.auth.uid,
      };
      transaction.update(sourceRef, { contentLineage: sourceLineage });

      familyDocs
        .filter((entry) => entry.id !== stored.id && entry?.contentLineage?.releaseStatus === "current")
        .forEach((entry) => {
          transaction.update(entry.ref, {
            "contentLineage.releaseStatus": "superseded",
          });
        });

      const auditResults = Array.isArray(request.data?.auditResults) ? request.data.auditResults : [];
      const count = (classification) => auditResults.filter((item) => item?.classification === classification).length;
      transaction.set(auditRef, {
        assignmentId,
        startingRevision: reviewed.fromRevision,
        resultingRevision: reviewed.fromRevision,
        auditScope: fullAssignmentRepair.SCOPE,
        actorUid: request.auth.uid,
        actorEmail: callerEmail(request) || null,
        actorAuthorizationType: authorizationType,
        questionIdsChanged: reviewed.changedQuestionIds,
        numberAudited: auditResults.length,
        numberPassed: count("passed"),
        numberAssignmentIssues: count("assignmentIssue"),
        numberPlatformIssues: count("platformIssue"),
        numberUnclear: count("unclear"),
        proposedRepairsAccepted: reviewed.changedQuestionIds.length,
        proposedRepairsRejected: Math.max(
          0,
          (request.data?.replacements?.length || 0) - reviewed.changedQuestionIds.length
        ),
        commitOutcome: "content-version-created",
        createdContentAssignmentId: releaseRef.id,
        createdContentVersion: nextVersion,
        createdAt: FieldValue.serverTimestamp(),
      });

      const classifiedPlatformIssues = auditResults
        .filter((item) => item?.classification === "platformIssue")
        .map((item) => ({ ...item }));
      const globalPlatformIssues = (Array.isArray(request.data?.globalFindings) ? request.data.globalFindings : [])
        .filter((item) => item?.classification === "platformIssue")
        .map((item) => ({ ...item, questionId: null }));
      const platformIssues = [
        ...(Array.isArray(request.data?.platformIssues) ? request.data.platformIssues : []),
        ...classifiedPlatformIssues,
        ...globalPlatformIssues,
      ];
      for (const issue of platformIssues) {
        const issueRef = db.collection("assignmentPlatformIssues").doc();
        transaction.set(issueRef, {
          assignmentId,
          auditId: auditRef.id,
          classification: "platformIssue",
          questionId: String(issue?.questionId || "").trim() || null,
          reason: String(issue?.reason || "").trim().slice(0, 2000),
          suspectedComponent: String(issue?.suspectedComponent || "MathMaster platform").trim().slice(0, 500),
          status: "open",
          reportedAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.set(eventRef, {
        eventType: "releaseCreated",
        familyId,
        sourceAssignmentId: assignmentId,
        targetAssignmentId: releaseRef.id,
        sourceContentVersion: sourceVersion,
        targetContentVersion: nextVersion,
        actorUid: request.auth.uid,
        actorAuthorizationType: authorizationType,
        originatingAuditId: auditRef.id,
        fromAssignmentRevision: reviewed.fromRevision,
        toAssignmentRevision: 1,
        changedQuestionIds: reviewed.changedQuestionIds,
        changedQuestionCount: reviewed.changedQuestionIds.length,
        affectedStudentCount: 0,
        gradeReconciliationRequested: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        assignmentId: releaseRef.id,
        sourceAssignmentId: assignmentId,
        familyId,
        contentVersion: nextVersion,
        auditId: auditRef.id,
        changedQuestionIds: reviewed.changedQuestionIds,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "failed-precondition",
      error.message || "MathMaster could not create the corrected content release."
    );
  }
});

// Administrator connectivity check. Deliberately tiny: it proves the credential,
// the model entitlement, the billing quota and the egress path in one call, and
// reports which of those failed instead of the generic "AI is unavailable".
exports.assignmentAiSelfTest = onCall({
  secrets: ASSIGNMENT_AI_SECRETS,
  timeoutSeconds: 90,
  memory: "256MiB",
}, async (request) => {
  await requireRootAdmin(request);
  const requestedModel = assignmentAiModel();

  let apiKey = "";
  try {
    apiKey = readOpenAiApiKey();
  } catch (error) {
    logger.error("Assignment AI self-test could not read the provider credential", {
      message: error?.message || String(error),
    });
    return {
      ok: false,
      stage: "secret",
      requestedModel,
      code: "failed-precondition",
      message: "OPENAI_API_KEY is not readable by this deployment. Set it with: firebase functions:secrets:set OPENAI_API_KEY --project mathmaster-aleks, then redeploy the AI functions.",
    };
  }

  try {
    const probe = await assignmentAi.probeAssignmentAiProvider({ apiKey, model: requestedModel });
    logger.info("Assignment AI self-test succeeded", { requestedModel, diagnostics: probe.diagnostics });
    return {
      ok: true,
      stage: "provider",
      requestedModel,
      reply: probe.reply,
      diagnostics: probe.diagnostics,
      message: `MathMaster reached OpenAI and ${probe.diagnostics?.servedModel || requestedModel} responded normally.`,
    };
  } catch (error) {
    const code = error instanceof assignmentAi.AssignmentAiError ? error.code : "internal";
    logger.error("Assignment AI self-test failed", {
      requestedModel,
      code,
      httpStatus: error?.status || null,
      message: String(error?.message || error).slice(0, 500),
      diagnostics: error?.details || null,
    });
    return {
      ok: false,
      stage: "provider",
      requestedModel,
      code,
      httpStatus: error?.status || null,
      diagnostics: error?.details || null,
      message: String(error?.message || error).slice(0, 500),
    };
  }
});

/* =========================================================================
 * INCIDENT RECOVERY AND THE TEACHER'S VIEW OF IT.
 *
 * On September 14 students worked through Warm-Up and Classwork, saw local
 * feedback, moved between questions — and their teacher's gradebook showed the
 * questions unattempted. The delivery defects that caused it are fixed
 * elsewhere in this change. What is left is the work already captured before
 * the fix shipped, sitting in four places that no single query can see:
 *
 *   A. the durable outbox in each Chromebook's IndexedDB — recoverable only by
 *      that device, which now drains grade-bearing work first and reports what
 *      it is still holding;
 *   B. `studentResponseCheckpoints` — server-held drafts the deadline finalizer
 *      can still turn into canonical attempts under the SAME authority it
 *      always used;
 *   C. `studentWorkspaceDrafts` — workspaces, not grades, recoverable only
 *      where five separate proofs hold, and reviewable by a teacher otherwise;
 *   D. presence session summaries — never evidence of correctness, but real
 *      evidence that a student was working, which is what makes a missing
 *      canonical record visible as a discrepancy rather than as an absence.
 *
 * Nothing here deletes, clears or invalidates any of it.
 * ========================================================================= */

const DEVICE_QUEUE_REPORT_COLLECTION = "studentDevicePersistenceReports";
const WORKSPACE_DRAFT_COLLECTION = "studentWorkspaceDrafts";

/*
 * A TECHNICAL INCIDENT A TEACHER OF RECORD HAS CLOSED.
 *
 * SERVER-ONLY, and deliberately not a field on `grades/{studentId}`: a student
 * can write parts of their own grade document, and a flag that releases a final
 * passback must never sit anywhere a student can reach. Firestore rules refuse
 * every client write to this collection; the audited callable below, on the
 * Admin SDK, is the only way one is created.
 *
 * It records an ACKNOWLEDGEMENT, never a result. No grade, no attempt, no
 * correctness, no zero.
 */
const PERSISTENCE_RESOLUTION_COLLECTION = "studentPersistenceResolutions";
const persistenceResolutionDocumentId = ({ studentId, assignmentId } = {}) => (
  [studentId, assignmentId].map((part) => encodeURIComponent(String(part ?? ""))).join("__").slice(0, 1400)
);

/*
 * EVERY DEVICE THIS STUDENT HAS EVER REPORTED FROM. NOT THE FIRST TEN.
 *
 * These rows are the only evidence of work that exists nowhere a server query
 * can see, and they are read to decide whether a final Google Classroom grade
 * may go out. The query used to be `.limit(10)` with no ordering, so a student
 * with eleven device rows — a class set of Chromebooks, a browser-storage
 * reset, the old unstable fallback id minting a row per report — could have
 * the ONE device still holding an unsynced answer silently omitted. The total
 * came back zero and the final grade went out over the top of real work.
 *
 * There is no cap here, silent or otherwise. The pages are read to exhaustion.
 * `MAX_DEVICE_REPORT_PAGES` is a runaway guard, not a limit: reaching it means
 * something is badly wrong, and it THROWS rather than returning a short list,
 * because on this path a short list is indistinguishable from good news. A
 * throw withholds the final passback and surfaces in the teacher report; a
 * quiet under-count publishes a grade that should not exist.
 */
const DEVICE_REPORT_PAGE_SIZE = 300;
const MAX_DEVICE_REPORT_PAGES = 50;

async function readAllDeviceReportsForStudent({ db, studentId }) {
  const documents = [];
  let cursor = null;
  for (let page = 0; page < MAX_DEVICE_REPORT_PAGES; page += 1) {
    let query = db.collection(DEVICE_QUEUE_REPORT_COLLECTION)
      .where("studentId", "==", studentId)
      // Ordering by document id is what makes the cursor stable; an unordered
      // paginated read can repeat and skip rows.
      .orderBy(FieldPath.documentId())
      .limit(DEVICE_REPORT_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await query.get();
    documents.push(...snapshot.docs);
    if (snapshot.size < DEVICE_REPORT_PAGE_SIZE) return documents;
    cursor = snapshot.docs[snapshot.docs.length - 1].id;
  }
  throw new Error(
    `Student ${studentId} has more than ${MAX_DEVICE_REPORT_PAGES * DEVICE_REPORT_PAGE_SIZE} device persistence `
    + "reports; refusing to decide final-grade safety from a partial read.",
  );
}

let persistencePendingModule = null;
async function persistencePendingLib() {
  if (!persistencePendingModule) persistencePendingModule = await import("./shared/persistencePending.mjs");
  return persistencePendingModule;
}

/*
 * EVERY SIGNAL THE POLICY ACCEPTS, READ FROM THE PLACE THAT OWNS IT.
 *
 * `assessPersistencePending` advertises four sources. This function is the
 * only production reader of it, so any source it does not actually inspect is
 * an advertised safety net with nothing behind it. It inspects all four:
 *
 *   device-queue         what a Chromebook says it is still holding.
 *   response-checkpoint  server-held drafts of a response, not yet finalized.
 *   workspace-draft      a server-held draft our own recovery rules say a
 *                        teacher can still commit into a canonical attempt.
 *   session-summary-gap  the student's own session says they worked more
 *                        questions than the gradebook can account for.
 *
 * The workspace draft read is a single document get on a deterministic id, and
 * the schedule/class reads it needs happen only when a draft actually exists,
 * so the ordinary green path costs nothing extra.
 */
async function readPersistencePending({
  db,
  studentId,
  assignmentId,
  canonicalAttempted,
  secureTestCycle = false,
  assignment = null,
  gradeData = null,
}) {
  const { workspaceDraftDocumentId } = await import("./shared/workspaceDraftSchema.mjs");
  const [deviceDocuments, checkpointSnapshot, sessionSnapshot, draftSnapshot, resolutionSnapshot] = await Promise.all([
    readAllDeviceReportsForStudent({ db, studentId }),
    db.collection(CHECKPOINT_COLLECTION).where("studentId", "==", studentId)
      .where("assignmentId", "==", assignmentId).where("status", "==", CHECKPOINT_STATUS_ACTIVE).limit(200).get(),
    db.collection(STUDENT_SESSION_SUMMARY_COLLECTION).where("studentId", "==", studentId)
      .where("assignmentId", "==", assignmentId).limit(50).get(),
    db.collection(WORKSPACE_DRAFT_COLLECTION)
      .doc(workspaceDraftDocumentId({ studentId, assignmentId })).get(),
    db.collection(PERSISTENCE_RESOLUTION_COLLECTION)
      .doc(persistenceResolutionDocumentId({ studentId, assignmentId })).get(),
  ]);
  const assignmentKey = encodeURIComponent(assignmentId);
  const queuedGradeBearing = deviceDocuments.reduce(
    (total, snapshot) => total + (Number(snapshot.data()?.queuedGradeBearingByAssignment?.[assignmentKey]) || 0), 0,
  );
  const worked = sessionSnapshot.docs.reduce(
    (maximum, snapshot) => Math.max(maximum, Number(snapshot.data()?.answered) || 0), 0,
  );
  const recoverableDrafts = draftSnapshot.exists
    ? await countRecoverableWorkspaceDrafts({
      db,
      studentId,
      draft: draftSnapshot.data() || {},
      draftSavedAtMs: millisOf(draftSnapshot.data()?.updatedAt),
      assignment,
      assignmentId,
      gradeData,
    })
    : 0;
  const { assessPersistencePending } = await persistencePendingLib();
  return assessPersistencePending({
    queuedGradeBearing,
    activeCheckpoints: checkpointSnapshot.size,
    recoverableDrafts,
    worked,
    canonicalAttempted,
    secureTestCycle,
    sessionGapResolution: resolutionSnapshot.exists ? resolutionSnapshot.data() : null,
  });
}

/**
 * How many entries of this student's server-held workspace draft our recovery
 * rules would still accept as a canonical attempt.
 *
 * This is the SAME assessment the teacher recovery report and the recovery
 * dry run make — deliberately, so "the recovery panel says one response is
 * recoverable" and "final passback is held" can never disagree. Anything the
 * rules refuse (saved after the cutoff, no provable cutoff, superseded by a
 * newer canonical attempt, not a response at all) counts zero here: it is not
 * recoverable, so it is not a reason to withhold a grade forever.
 */
async function countRecoverableWorkspaceDrafts({
  db, studentId = null, draft, draftSavedAtMs, assignment, assignmentId, gradeData,
}) {
  if (!assignment) return 0;
  const recovery = await workspaceDraftRecovery();
  const { resolveAuthoritativeClose } = await import("./shared/sectionDeadline.mjs");
  const classId = String(gradeData?.classId || "").trim() || null;
  const [scheduleSnapshot, classSnapshot] = await Promise.all([
    db.collection("settings").doc("classSchedule").get(),
    classId ? db.collection(CLASS_COLLECTION).doc(classId).get() : Promise.resolve(null),
  ]);
  const schedule = scheduleSnapshot.exists ? scheduleSnapshot.data() : null;
  const classPeriod = String(classSnapshot?.data()?.period || "") || null;
  const questions = runtimeQuestionsFromAssignment(assignment) || [];
  const tracker = gradeData?.gradesByAssignment?.[assignmentId] || {};
  const assessment = recovery.assessWorkspaceDraftDocument({
    document: draft,
    documentSavedAtMs: draftSavedAtMs,
    resolveQuestion: (entry) => questions[Number(entry.questionIndex)] || null,
    resolveCanonicalRecord: (entry) => tracker?.[String(entry.questionIndex)] ?? tracker?.[entry.questionIndex] ?? null,
    resolveCloseAt: (entry) => resolveAuthoritativeClose({
      assignment,
      activityRole: questions[Number(entry.questionIndex)]?.activityRole || "classwork",
      schedule,
      classId,
      classPeriod,
      // Measured against the day the draft was SAVED, never today.
      nowValue: draftSavedAtMs || Date.now(),
      studentId,
    }).closesAtMs,
  });
  return Number(assessment?.recoverable?.length) || 0;
}

let workspaceDraftRecoveryModule = null;
async function workspaceDraftRecovery() {
  if (!workspaceDraftRecoveryModule) {
    workspaceDraftRecoveryModule = await import("./shared/workspaceDraftRecovery.mjs");
  }
  return workspaceDraftRecoveryModule;
}

/**
 * A. WHAT THIS CHROMEBOOK IS STILL HOLDING.
 *
 * An IndexedDB queue is the one part of the incident no server query can see,
 * so the device says so itself after it reconnects. Counts and reasons only —
 * no responses, no records, nothing that could become a grade. The report is
 * keyed by device so one student's two Chromebooks are two rows.
 */
exports.reportStudentDeviceQueue = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const deviceId = String(request.data?.deviceId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (!deviceId) throw new HttpsError("invalid-argument", "A device id is required.");
  const summary = request.data?.summary && typeof request.data.summary === "object" ? request.data.summary : {};
  const number = (value) => Math.max(0, Math.min(100_000, Number(value) || 0));
  const countMap = (value) => Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {})
      .slice(0, 40)
      .map(([key, count]) => [String(key).slice(0, 80), number(count)]),
  );
  /*
   * Firestore map keys cannot contain `/`, `.`, `[`, `]`, `*` or backtick, and
   * an assignment id can. Encoding the key keeps the breakdown storable without
   * losing which assignment it belongs to; the reader decodes with the same
   * function, so a document id that survives a round trip is the only contract.
   */
  const assignmentCountMap = (value) => Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {})
      .slice(0, 40)
      .map(([key, count]) => [encodeURIComponent(String(key)).slice(0, 300), number(count)]),
  );
  const assignmentNestedCountMap = (value) => Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {})
      .slice(0, 40)
      .map(([key, counts]) => [encodeURIComponent(String(key)).slice(0, 300), countMap(counts)]),
  );

  /*
   * A version 1 device sent only an aggregate. It is stored as an aggregate and
   * never reinterpreted: a per-assignment report that showed it would tell a
   * teacher three submissions are outstanding on the assignment they are
   * looking at when all three belong to a different one.
   */
  const summarySchemaVersion = Math.max(1, Number(summary.summarySchemaVersion) || 1);
  const hasAssignmentBreakdown = summary.queuedGradeBearingByAssignment
    && typeof summary.queuedGradeBearingByAssignment === "object";

  /*
   * WHICH OF TWO REPORTS FROM ONE DEVICE IS NEWER.
   *
   * The client's 12-second bound stops it WAITING; it does not cancel the
   * callable already on the wire. So a "2 queued" report captured before a
   * drain can arrive AFTER the "0 queued" report captured after it, and an
   * unconditional write would restore the stale count — with the tab closed,
   * nothing left to correct it, and the student's final Classroom grade held
   * as sync-pending indefinitely.
   *
   * The device stamps a monotonically increasing generation at CAPTURE (see
   * `deviceIdentity.js`), so arrival order stops mattering. A report that is
   * not strictly newer than what is stored is IGNORED, not rejected: the
   * client is not at fault, nothing is wrong, and an error would only make it
   * retry a report that is already obsolete.
   */
  const reportGeneration = Math.max(0, Number(request.data?.reportGeneration) || 0);

  const db = getFirestore();
  const reportRef = db.collection(DEVICE_QUEUE_REPORT_COLLECTION).doc(`${encodeURIComponent(studentId)}__${deviceId}`);
  const nextByAssignment = assignmentCountMap(summary.queuedGradeBearingByAssignment);
  const gradeData = (await db.collection("grades").doc(studentId).get()).data() || {};

  /*
   * THIS DOCUMENT IS A SNAPSHOT, SO IT IS WRITTEN AS ONE.
   *
   * `{ merge: true }` merges Firestore maps RECURSIVELY. A device that
   * reported `queuedGradeBearingByAssignment.assignmentA = 1` and then drained
   * it sends a summary with no `assignmentA` key at all — and a recursive
   * merge leaves the stale `1` exactly where it was. Nothing ever removes it,
   * so the assignment reads as permanently `persistencePending`, its Classroom
   * passback stays `sync-pending` forever, and the teacher recovery report
   * shows queued work on a Chromebook that is empty.
   *
   * A full `set()` replaces the document, so a key the device stopped
   * reporting actually disappears. The device sends its ENTIRE current state
   * on every report, so there is nothing here worth merging — except the
   * fields carried forward below, which are history rather than state.
   *
   * The read and the write share a TRANSACTION so the generation check cannot
   * be raced by the very concurrency it exists to order.
   */
  const outcome = await db.runTransaction(async (transaction) => {
    const previousSnapshot = await transaction.get(reportRef);
    const previousData = previousSnapshot.data() || {};
    const storedGeneration = Math.max(0, Number(previousData.reportGeneration) || 0);

    /*
     * A device on the release before generations existed sends none, and
     * arrives here as generation 0. Those reports keep working exactly as they
     * did — there is no newer report from that device to protect, because a
     * device runs one release at a time.
     *
     * The moment a generation-stamped report IS stored for this device id, an
     * unversioned one is necessarily from the older client and loses. The only
     * way to see both is two tabs across a deploy, and there the versioned tab
     * is the one telling the truth.
     */
    const unversionedAndUncontested = reportGeneration === 0 && storedGeneration === 0;
    if (!unversionedAndUncontested && reportGeneration <= storedGeneration) {
      return {
        applied: false,
        reason: "superseded-by-newer-report",
        storedGeneration,
        previousByAssignment: previousData.queuedGradeBearingByAssignment || {},
      };
    }

    transaction.set(reportRef, {
      studentId,
      deviceId,
      summarySchemaVersion,
      reportGeneration,
      hasAssignmentBreakdown: Boolean(hasAssignmentBreakdown),
      classId: String(gradeData.classId || "") || null,
      queued: number(summary.queued),
      queuedGradeBearing: number(summary.queuedGradeBearing),
      queuedByKind: countMap(summary.queuedByKind),
      queuedByAssignment: assignmentCountMap(summary.queuedByAssignment),
      queuedGradeBearingByAssignment: nextByAssignment,
      needsReviewByAssignment: assignmentCountMap(summary.needsReviewByAssignment),
      queuedKindsByAssignment: assignmentNestedCountMap(summary.queuedKindsByAssignment),
      blockedReasonsByAssignment: assignmentNestedCountMap(summary.blockedReasonsByAssignment),
      blockedReasons: countMap(summary.blockedReasons),
      needsReview: number(summary.needsReview),
      retired: number(summary.retired),
      retiredByDisposition: countMap(summary.retiredByDisposition),
      oldestCapturedAt: Number(summary.oldestCapturedAt) || null,
      latestCapturedAt: Number(summary.latestCapturedAt) || null,
      // CARRIED FORWARD ON PURPOSE. When this device first said anything is
      // incident history: it survives every later snapshot, and it is how a
      // teacher tells "reported once, three days ago" from "reporting since
      // Tuesday".
      firstReportedAt: previousData.firstReportedAt || FieldValue.serverTimestamp(),
      reportedAt: FieldValue.serverTimestamp(),
    });
    return {
      applied: true,
      reason: null,
      storedGeneration,
      previousByAssignment: previousData.queuedGradeBearingByAssignment || {},
    };
  });

  // An ignored report changed nothing, so there is nothing to wake.
  if (!outcome.applied) {
    return {
      success: true,
      applied: false,
      ignored: true,
      reason: outcome.reason,
      reportGeneration,
      storedReportGeneration: outcome.storedGeneration,
      summarySchemaVersion,
    };
  }

  // Clearing the last locally reported item must wake the existing grade
  // trigger; otherwise a passback withheld as sync-pending would wait until the
  // next unrelated grade change.
  const previousByAssignment = outcome.previousByAssignment;
  const resolvedAssignments = Object.keys(previousByAssignment).filter(
    (key) => Number(previousByAssignment[key]) > 0 && Number(nextByAssignment[key] || 0) === 0,
  );
  if (resolvedAssignments.length) {
    const gradeRef = db.collection("grades").doc(studentId);
    const updates = [];
    resolvedAssignments.forEach((encodedAssignmentId) => {
      updates.push(
        new FieldPath("classroomReleaseSignals", decodeURIComponent(encodedAssignmentId)),
        { requestedAt: new Date().toISOString(), reason: "persistence-reconciled" },
      );
    });
    await gradeRef.update(...updates);
  }
  return { success: true, applied: true, ignored: false, reportGeneration, summarySchemaVersion };
});

/*
 * CLASSWORK COMPLETION IS DERIVED FROM CANONICAL ATTEMPTS, BY THE SERVER.
 *
 * `classworkGradesByAssignment` unlocks the next assignment through
 * `prerequisiteAccess`, so it is a completion projection with real academic
 * consequences — not engagement state. The browser used to compute it from its
 * OWN tracker, which is the local overlay: it contains attempts that are still
 * only durably queued on this Chromebook and have never reached canonical
 * grades. A student could therefore be marked Classwork-complete on evidence
 * the gradebook cannot see, and stay marked complete even if that queued work
 * turned out to be permanently invalid.
 *
 * Ingestion already derives this projection from canonical records every time
 * an attempt lands, which covers every case where a RESPONSE completes the
 * rule. This callable exists for the one case ingestion cannot see: the
 * completion rule also has an engagement-minutes term, so a student whose last
 * response was ingested at minute 8 crosses the threshold at minute 10 with no
 * attempt to trigger anything.
 *
 * The browser may ask for the projection to be refreshed. It may not supply
 * it. Everything below is re-read from the canonical document — the tracker
 * the gradebook shows, and the activity total the server already holds — so
 * the answer is identical to the one ingestion would have computed, and an
 * attempt still sitting in a device queue cannot contribute to it.
 */
exports.reconcileAssignmentActivityProjection = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const assignmentId = String(request.data?.assignmentId || "").trim();
  if (!assignmentId) throw new HttpsError("invalid-argument", "An assignmentId is required.");

  const db = getFirestore();
  const [gradeSnapshot, assignmentSnapshot] = await Promise.all([
    db.collection("grades").doc(studentId).get(),
    db.collection("assignments").doc(assignmentId).get(),
  ]);
  if (!gradeSnapshot.exists || !assignmentSnapshot.exists) {
    return { reconciled: false, reason: "context-unavailable", classworkGrade: null };
  }
  const gradeData = gradeSnapshot.data() || {};
  const assignment = { id: assignmentSnapshot.id, ...assignmentSnapshot.data() };
  const classId = authoritativeStudentClassId(gradeData);
  if (!studentMatchesAssignmentAudience({ assignment, classId })) {
    return { reconciled: false, reason: "assignment-not-assigned-to-class", classworkGrade: null };
  }
  if (secureAssignmentMode(assignment) || assignment.secure === true) {
    // A Test Cycle has no classwork completion projection to refresh.
    return { reconciled: false, reason: "secure-assignment", classworkGrade: null };
  }

  const { classworkGradeProjection, evaluateClassworkCompletionRule } = await import("./shared/assignmentProjections.mjs");
  const completion = evaluateClassworkCompletionRule({
    classworkIndices: runtimeIncludedQuestionIndicesForSection(assignment, "classwork"),
    // THE CANONICAL TRACKER. Not the caller's, and not a merge of the two.
    assignmentTracker: gradeData?.gradesByAssignment?.[assignmentId] || {},
    totalTimeSeconds: Number(gradeData?.assignmentActivity?.[assignmentId]?.totalTimeSeconds) || 0,
    completionRule: assignment?.completionRule || {},
  });
  const existingGrade = gradeData?.classworkGradesByAssignment?.[assignmentId] || null;
  const classworkGrade = classworkGradeProjection({
    completion,
    existingGrade,
    recordedAt: new Date().toISOString(),
  });
  // Unmet writes NOTHING. This path can only ever add a completion the
  // canonical evidence supports; it never removes or downgrades one, which is
  // a teacher's decision and not a background reconciliation's.
  if (!classworkGrade) {
    return { reconciled: false, reason: "completion-not-met", completion, classworkGrade: null };
  }
  if (existingGrade && Number(existingGrade.score) === Number(classworkGrade.score)) {
    return { reconciled: false, reason: "already-recorded", completion, classworkGrade: existingGrade };
  }
  await db.collection("grades").doc(studentId).update(
    new FieldPath("classworkGradesByAssignment", assignmentId),
    classworkGrade,
  );
  return { reconciled: true, reason: null, completion, classworkGrade };
});

/*
 * CLOSING A PERSISTENCE INCIDENT THAT CANNOT BE RECOVERED.
 *
 * `session-summary-gap` fires when a student's own session says they worked
 * more questions than the gradebook can account for. That is the right alarm:
 * something happened and no grade came of it. But it can be permanently true.
 * A queued response proven invalid, a Chromebook reimaged, presence counting
 * something that was never going to become an attempt — in each case the work
 * is gone, and the assignment would otherwise sit at `sync-pending` and never
 * pass back to Classroom for the rest of the year.
 *
 * The fix is NOT a timeout. A gate that expires protects nobody, because the
 * case it is protecting against — work that really is still recoverable —
 * looks identical on the clock. The fix is a named human, on the record.
 *
 * WHAT THIS ACTION MEANS, EXACTLY:
 *
 *   "I acknowledge the unrecoverable discrepancy and permit normal
 *    finalization using the canonical evidence that exists."
 *
 * WHAT IT DOES NOT DO. It writes no grade, creates no attempt, manufactures no
 * zero and marks nothing correct or incorrect. The gradebook after this call
 * is byte-for-byte the gradebook before it. All that changes is that ONE
 * safety reason stops withholding the final passback.
 *
 * AND IT ONLY COVERS THE DISCREPANCY THE TEACHER ACTUALLY SAW. The caller must
 * send back the two numbers the panel showed them; if the evidence has moved
 * since, the call is refused rather than applied to a different incident. If
 * new concrete recoverable evidence appears later — a Chromebook reconnects
 * and reports queued grade-bearing work — that raises its own reason, which no
 * resolution suppresses, and the hard hold is active again.
 */
exports.resolveStudentPersistenceHold = onCall(async (request) => {
  const studentId = String(request.data?.studentId || "").trim();
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const classId = String(request.data?.classId || "").trim();
  const reason = String(request.data?.reason || "").trim().slice(0, 500);
  if (!studentId || !assignmentId || !classId) {
    throw new HttpsError("invalid-argument", "studentId, assignmentId and classId are required.");
  }
  if (!reason) {
    throw new HttpsError("invalid-argument", "Record why this discrepancy is unrecoverable.");
  }

  // Teacher of record for THIS class, or the root administrator. Nobody else,
  // including a teacher of record for some other class.
  const { email } = await requireClassTeacher(request, classId);
  const db = getFirestore();

  const [gradeSnapshot, assignmentSnapshot] = await Promise.all([
    db.collection("grades").doc(studentId).get(),
    db.collection("assignments").doc(assignmentId).get(),
  ]);
  if (!gradeSnapshot.exists) throw new HttpsError("not-found", "That student record no longer exists.");
  const gradeData = gradeSnapshot.data() || {};
  // The student must be on THIS class's roster, read from the authoritative
  // roster row rather than from anything the caller claimed.
  if (authoritativeStudentClassId(gradeData) !== classId) {
    throw new HttpsError("permission-denied", "That student is not in this class.");
  }
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment no longer exists.");
  const assignment = { id: assignmentSnapshot.id, ...assignmentSnapshot.data() };
  if (!studentMatchesAssignmentAudience({ assignment, classId })) {
    throw new HttpsError("failed-precondition", "That assignment is not assigned to this class.");
  }
  if (secureAssignmentMode(assignment) || assignment.secure === true) {
    // Secure Test Cycle release is a separate, server-authoritative authority.
    // It does not consult this policy, so there is nothing here to resolve.
    throw new HttpsError("failed-precondition", "Secure Test Cycle results are released through their own path.");
  }

  const { normalizeQuestionRecord } = await import("./shared/attemptPolicy.mjs");
  const tracker = gradeData?.gradesByAssignment?.[assignmentId] || {};
  const canonicalAttempted = runtimeIncludedQuestionIndices(assignment).reduce((total, index) => {
    const record = normalizeQuestionRecord(tracker?.[String(index)] ?? tracker?.[index]);
    return total + (Number(record.totalAttempts) > 0 ? 1 : 0);
  }, 0);
  const sessionSnapshot = await db.collection(STUDENT_SESSION_SUMMARY_COLLECTION)
    .where("studentId", "==", studentId).where("assignmentId", "==", assignmentId).limit(50).get();
  const worked = sessionSnapshot.docs.reduce(
    (maximum, snapshot) => Math.max(maximum, Number(snapshot.data()?.answered) || 0), 0,
  );

  if (!(worked > canonicalAttempted)) {
    throw new HttpsError(
      "failed-precondition",
      "There is no session/canonical discrepancy to resolve for this student and assignment.",
    );
  }

  /*
   * REFUSE WHILE THE WORK IS STILL REACHABLE.
   *
   * Every other reason names a concrete artifact a teacher can still recover
   * into a real attempt. Acknowledging the gap while one of those is
   * outstanding would be acknowledging work that has not been lost yet — so
   * the caller is sent to recover it instead. The policy would ignore the
   * resolution for those reasons anyway; refusing here means the audit trail
   * never records an acknowledgement that was not true when it was made.
   */
  const liveState = await readPersistencePending({
    db,
    studentId,
    assignmentId,
    canonicalAttempted,
    secureTestCycle: false,
    assignment,
    gradeData,
  });
  const recoverableReasons = liveState.reasons.filter((entry) => entry !== "session-summary-gap");
  if (recoverableReasons.length) {
    throw new HttpsError(
      "failed-precondition",
      `Recoverable evidence still exists (${recoverableReasons.join(", ")}). Recover it before resolving the hold.`,
    );
  }

  /*
   * THE TEACHER MUST HAVE SEEN THESE EXACT NUMBERS.
   *
   * A confirmation dialog opened ten minutes ago describes a discrepancy that
   * may no longer be the discrepancy. Requiring the panel to send back what it
   * displayed makes a stale confirmation a refusal instead of a resolution of
   * something nobody looked at.
   */
  const seenWorked = Number(request.data?.acknowledgedWorked);
  const seenAttempted = Number(request.data?.acknowledgedCanonicalAttempted);
  if (seenWorked !== worked || seenAttempted !== canonicalAttempted) {
    throw new HttpsError(
      "failed-precondition",
      "The persistence evidence changed since this discrepancy was displayed. Reload the report and look again.",
    );
  }

  const resolutionRef = db.collection(PERSISTENCE_RESOLUTION_COLLECTION)
    .doc(persistenceResolutionDocumentId({ studentId, assignmentId }));
  await resolutionRef.set({
    studentId,
    assignmentId,
    classId,
    resolvedByUid: request.auth?.uid || null,
    resolvedByEmail: email,
    resolvedAt: FieldValue.serverTimestamp(),
    reason,
    // The discrepancy that was acknowledged, frozen. Session evidence that
    // grows past this makes the resolution stop applying.
    acknowledgedWorked: worked,
    acknowledgedCanonicalAttempted: canonicalAttempted,
    acknowledgement: "The teacher of record acknowledged an unrecoverable discrepancy and permitted normal "
      + "finalization using the canonical evidence that exists. No grade, attempt or score was created.",
    revokedAt: null,
  });
  await writeAdminAudit(
    db,
    { uid: request.auth?.uid || null, email },
    "student_persistence_hold_resolved",
    `${studentId}__${assignmentId}`,
    { classId, worked, canonicalAttempted, reason },
  );

  // Wake the existing grade trigger so a passback withheld as `sync-pending`
  // resumes now rather than at the next unrelated grade change.
  await db.collection("grades").doc(studentId).update(
    new FieldPath("classroomReleaseSignals", assignmentId),
    { requestedAt: new Date().toISOString(), reason: "persistence-hold-resolved" },
  );

  return {
    success: true,
    studentId,
    assignmentId,
    acknowledgedWorked: worked,
    acknowledgedCanonicalAttempted: canonicalAttempted,
  };
});

/** The teacher of record for a class, or the root administrator. Nobody else. */
async function requireClassTeacher(request, classId) {
  await requireTeacher(request);
  const db = getFirestore();
  const classSnapshot = await db.collection(CLASS_COLLECTION).doc(classId).get();
  if (!classSnapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
  const email = callerEmail(request);
  const teacherOfRecord = String(classSnapshot.data()?.teacherOfRecord || "").trim().toLowerCase();
  if (email !== authLib.ROOT_ADMIN_EMAIL && (!email || teacherOfRecord !== email)) {
    throw new HttpsError("permission-denied", "Only the teacher of record for this class can review its persistence records.");
  }
  return { classSnapshot, email };
}

/**
 * B. FINALIZE OUTSTANDING CHECKPOINTS FOR ONE ASSIGNMENT AND CLASS, NOW.
 *
 * The scheduled finalizer only ever sees checkpoints whose `candidateFinalizeAt`
 * is in the past. A checkpoint written with a NULL hint — which the rules
 * deliberately allow, for a deadline a teacher had not set yet — therefore
 * never entered the due query at all, and a valid response that should have
 * produced a canonical attempt silently never did. That is the path this
 * repairs: the query here is bounded by assignment, class and role rather than
 * by the hint, so a null-hinted checkpoint is examined like any other.
 *
 * The DECISION is unchanged. Every checkpoint still goes through
 * `finalizeOneResponseCheckpoint`, which re-derives the real close, refuses
 * anything acknowledged after it, and skips a question a newer attempt already
 * settled. This makes the finalizer LOOK; it does not make it lenient.
 */
/*
 * HOW MUCH ONE SWEEP CALL WILL DO, AND HOW IT SAYS WHEN IT HAS NOT FINISHED.
 *
 * The first version read one page of 200 and returned. An assignment with 30
 * students and a dozen Classwork questions exceeds that easily, so a teacher
 * pressing "finalize outstanding checkpoints" was told the assignment had been
 * swept when only its first 200 records had been looked at. A recovery command
 * that quietly does part of the job is worse than one that refuses.
 */
const SWEEP_PAGE_SIZE = CHECKPOINT_BATCH_LIMIT;
// A ceiling so one call cannot run past its own function timeout. Reaching it
// is reported as truncation with a cursor, never as completion.
const SWEEP_MAX_EXAMINED = 2_000;
// Checkpoints for DIFFERENT students finalize concurrently; two for the SAME
// student do not, because their transactions would contend on one grade
// document and retry each other.
const SWEEP_STUDENT_CONCURRENCY = 5;

/** Run `worker` over `items` with at most `limit` in flight. */
async function runBounded(items, limit, worker) {
  if (!items.length) return;
  let cursor = 0;
  const take = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      // eslint-disable-next-line no-await-in-loop
      await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, take));
}

exports.sweepStudentResponseCheckpoints = onCall({ timeoutSeconds: 540 }, async (request) => {
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const classId = String(request.data?.classId || "").trim();
  if (!assignmentId || !classId) throw new HttpsError("invalid-argument", "assignmentId and classId are required.");
  await requireClassTeacher(request, classId);
  const cursor = String(request.data?.cursor || "").trim() || null;

  const db = getFirestore();
  const now = Date.now();
  const scheduleSnapshot = await db.collection("settings").doc("classSchedule").get();
  const schedule = scheduleSnapshot.exists ? scheduleSnapshot.data() : null;
  const classPeriodCache = new Map();

  const outcomes = {};
  let examined = 0;
  let pages = 0;
  /*
   * PAGED BY DOCUMENT ID, WHICH IS A TOTAL ORDER.
   *
   * Ordering by `__name__` and continuing with `startAfter` means one sweep
   * walks every matching checkpoint exactly once and never revisits one. That
   * matters because a `held` or `rescheduled` checkpoint is STILL `active`: a
   * cursor that re-queried the same filter without an order would keep handing
   * back the same held documents and the sweep would spin on them forever
   * without ever reaching the ones behind them.
   */
  let after = cursor;
  let truncated = false;

  for (;;) {
    let query = db.collection(CHECKPOINT_COLLECTION)
      .where("assignmentId", "==", assignmentId)
      .where("classId", "==", classId)
      .where("status", "==", CHECKPOINT_STATUS_ACTIVE)
      .orderBy(FieldPath.documentId())
      .limit(SWEEP_PAGE_SIZE);
    if (after) query = query.startAfter(after);

    // eslint-disable-next-line no-await-in-loop
    const page = await query.get();
    if (page.empty) break;
    pages += 1;
    after = page.docs[page.docs.length - 1].id;

    // One group per student: different students run together, one student's
    // checkpoints run in order against their single grade document.
    const byStudent = new Map();
    page.docs.forEach((snapshot) => {
      const studentId = String(snapshot.data()?.studentId || snapshot.id);
      if (!byStudent.has(studentId)) byStudent.set(studentId, []);
      byStudent.get(studentId).push(snapshot);
    });

    // eslint-disable-next-line no-await-in-loop
    await runBounded([...byStudent.values()], SWEEP_STUDENT_CONCURRENCY, async (group) => {
      for (const snapshot of group) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const outcome = await finalizeOneResponseCheckpoint({ db, ref: snapshot.ref, schedule, classPeriodCache, now });
          outcomes[outcome] = (outcomes[outcome] || 0) + 1;
        } catch (error) {
          // One unfinalizable checkpoint must not stop the sweep. It stays
          // active and is retried, exactly as the scheduler would retry it.
          outcomes.failed = (outcomes.failed || 0) + 1;
          logger.error("Could not finalize a checkpoint during a recovery sweep", {
            assignmentId, classId, checkpointId: snapshot.id, message: error.message,
          });
        }
      }
    });

    examined += page.size;
    if (page.size < SWEEP_PAGE_SIZE) break;
    if (examined >= SWEEP_MAX_EXAMINED) {
      truncated = true;
      break;
    }
  }

  /*
   * `complete` is the only thing a teacher should read as "this assignment has
   * been swept". When it is false, `nextCursor` resumes exactly where this call
   * stopped — the same document order, continuing after the last id examined.
   */
  const complete = !truncated;
  logger.info("Checkpoint recovery sweep finished", {
    assignmentId, classId, examined, pages, complete, ...outcomes,
  });
  return {
    assignmentId,
    classId,
    examined,
    pages,
    outcomes,
    complete,
    truncated,
    nextCursor: truncated ? after : null,
    // How many were still outstanding when this call stopped, so "not complete"
    // comes with a number rather than only a flag.
    remainingAtCursor: truncated
      ? (await db.collection(CHECKPOINT_COLLECTION)
        .where("assignmentId", "==", assignmentId)
        .where("classId", "==", classId)
        .where("status", "==", CHECKPOINT_STATUS_ACTIVE)
        .orderBy(FieldPath.documentId())
        .startAfter(after)
        .count()
        .get()).data().count
      : 0,
  };
});

const RECOVERY_REPORT_STUDENT_LIMIT = 60;

const millisOf = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const parsed = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * C + D. ONE STUDENT'S PERSISTENCE PICTURE, FROM SERVER-AUTHORITATIVE DATA.
 *
 * The discrepancy is the point: `presenceAnswered` is how many questions the
 * student's own live session said they answered, and `canonicalAttempted` is
 * how many the gradebook can prove. When the first exceeds the second, work was
 * done and not recorded, and the rest of the row says where that work still is
 * and what is blocking its recovery.
 *
 * Presence NEVER supplies correctness. It supplies the fact that somebody was
 * working, which is exactly what an incident report needs and exactly what a
 * grade may not be manufactured from.
 */
async function buildStudentRecoveryRow({
  db, studentId, gradeData, assignment, assignmentId, classId, schedule, classPeriod, drafts,
}) {
  const recovery = await workspaceDraftRecovery();
  const { resolveAuthoritativeClose } = await import("./shared/sectionDeadline.mjs");
  const { normalizeQuestionRecord } = await import("./shared/attemptPolicy.mjs");

  const questions = runtimeQuestionsFromAssignment(assignment) || [];
  const tracker = gradeData?.gradesByAssignment?.[assignmentId] || {};
  const attemptedByRole = {};
  let canonicalAttempted = 0;
  let latestCanonicalAttemptAt = null;
  runtimeIncludedQuestionIndices(assignment).forEach((index) => {
    const record = normalizeQuestionRecord(tracker?.[String(index)] ?? tracker?.[index]);
    if (!(Number(record.totalAttempts) > 0)) return;
    canonicalAttempted += 1;
    const role = String(questions[index]?.activityRole || "unknown").toLowerCase();
    attemptedByRole[role] = (attemptedByRole[role] || 0) + 1;
    const at = millisOf(record.lastAttemptAt);
    if (at && (!latestCanonicalAttemptAt || at > latestCanonicalAttemptAt)) latestCanonicalAttemptAt = at;
  });

  const [checkpointSnapshot, receiptSnapshot, deviceDocuments, sessionSnapshot, resolutionSnapshot] = await Promise.all([
    db.collection(CHECKPOINT_COLLECTION)
      .where("studentId", "==", studentId).where("assignmentId", "==", assignmentId)
      .limit(CHECKPOINT_BATCH_LIMIT).get(),
    db.collection(SUBMISSION_RECEIPT_COLLECTION)
      .where("studentId", "==", studentId).where("assignmentId", "==", assignmentId)
      .limit(500).get(),
    // Every device, not the first ten — a teacher's incident report that omits
    // the one Chromebook still holding work is worse than no report at all.
    readAllDeviceReportsForStudent({ db, studentId }),
    db.collection(STUDENT_SESSION_SUMMARY_COLLECTION)
      .where("studentId", "==", studentId).where("assignmentId", "==", assignmentId)
      .limit(50).get(),
    db.collection(PERSISTENCE_RESOLUTION_COLLECTION)
      .doc(persistenceResolutionDocumentId({ studentId, assignmentId })).get(),
  ]);
  const persistenceResolution = resolutionSnapshot.exists ? resolutionSnapshot.data() : null;

  const checkpointsByStatus = {};
  let latestCheckpointAcknowledgedAt = null;
  checkpointSnapshot.docs.forEach((snapshot) => {
    const data = snapshot.data() || {};
    const status = String(data.status || "unknown");
    checkpointsByStatus[status] = (checkpointsByStatus[status] || 0) + 1;
    const at = millisOf(data.serverAcknowledgedAt);
    if (at && (!latestCheckpointAcknowledgedAt || at > latestCheckpointAcknowledgedAt)) latestCheckpointAcknowledgedAt = at;
  });

  const receiptsByDisposition = {};
  receiptSnapshot.docs.forEach((snapshot) => {
    const disposition = String(snapshot.data()?.disposition || "unknown");
    receiptsByDisposition[disposition] = (receiptsByDisposition[disposition] || 0) + 1;
  });

  const draftDocument = drafts.get(studentId) || null;
  const draftAssessment = draftDocument
    ? recovery.assessWorkspaceDraftDocument({
      document: draftDocument.data,
      documentSavedAtMs: draftDocument.updatedAtMs,
      resolveQuestion: (entry) => questions[Number(entry.questionIndex)] || null,
      resolveCanonicalRecord: (entry) => tracker?.[String(entry.questionIndex)] ?? tracker?.[entry.questionIndex] ?? null,
      resolveCloseAt: (entry) => resolveAuthoritativeClose({
        assignment,
        activityRole: questions[Number(entry.questionIndex)]?.activityRole || "classwork",
        schedule,
        classId,
        classPeriod,
        // The close is resolved against the day the draft was SAVED, not today,
        // or a Monday draft would be measured against this week's bell.
        nowValue: draftDocument.updatedAtMs || Date.now(),
        studentId,
      }).closesAtMs,
    })
    : null;

  const presenceAnswered = sessionSnapshot.docs.reduce(
    (total, snapshot) => Math.max(total, Number(snapshot.data()?.answered) || 0), 0,
  );
  const presenceActiveSeconds = sessionSnapshot.docs.reduce(
    (total, snapshot) => total + (Number(snapshot.data()?.activeSeconds) || 0), 0,
  );
  const queuedGradeBearingForAssignment = deviceDocuments.reduce((total, snapshot) => {
    const data = snapshot.data() || {};
    return total + (Number(data.queuedGradeBearingByAssignment?.[encodeURIComponent(assignmentId)]) || 0);
  }, 0);
  const { assessPersistencePending } = await persistencePendingLib();
  const persistenceState = assessPersistencePending({
    queuedGradeBearing: queuedGradeBearingForAssignment,
    activeCheckpoints: Object.entries(checkpointsByStatus)
      .filter(([status]) => ["active", "recoverable", "recovered-after-close", "incomplete-at-close"].includes(status))
      .reduce((total, [, count]) => total + Number(count || 0), 0),
    recoverableDrafts: Number(draftAssessment?.recoverable?.length) || 0,
    worked: presenceAnswered,
    canonicalAttempted,
    secureTestCycle: secureAssignmentMode(assignment),
    // The teacher must see the SAME verdict final passback will reach. A panel
    // that still reads "sync pending" after a resolution the passback already
    // honours would send a teacher looking for a fault that is not there.
    sessionGapResolution: persistenceResolution,
  });

  /*
   * WHY A RECOVERY IS BLOCKED, IN ONE LIST.
   *
   * Every entry names a real artifact that still exists and the reason it has
   * not become a grade. None of them is a deletion, and none of them is a
   * grade: they are the queue for a human decision.
   */
  const needsReview = [
    ...Object.entries(checkpointsByStatus)
      .filter(([status]) => ["invalid-context", "unsupported-question", "recovered-after-close", "incomplete-at-close"].includes(status))
      .map(([status, count]) => ({ source: "checkpoint", reason: status, count })),
    ...Object.entries((draftAssessment?.counts) || {})
      .filter(([status]) => status !== "recoverable")
      .map(([status, count]) => ({ source: "workspaceDraft", reason: status, count })),
    ...deviceDocuments.flatMap((snapshot) => {
      const data = snapshot.data() || {};
      const assignmentKey = encodeURIComponent(assignmentId);
      const scoped = data.blockedReasonsByAssignment?.[assignmentKey];
      const reasons = scoped && typeof scoped === "object" ? scoped : data.blockedReasons || {};
      return Object.entries(reasons)
      .map(([reason, count]) => ({
        source: "deviceQueue",
        scope: scoped ? "assignment" : "device-wide",
        reason,
        count,
        deviceId: data.deviceId || null,
      }));
    }),
  ];

  return {
    studentId,
    studentName: String(gradeData?.displayName || studentId).slice(0, 180),
    canonicalAttempted,
    canonicalAttemptedByRole: attemptedByRole,
    expectedQuestionCount: runtimeIncludedQuestionIndices(assignment).length,
    latestCanonicalAttemptAt,
    checkpoints: {
      total: checkpointSnapshot.size,
      byStatus: checkpointsByStatus,
      latestAcknowledgedAt: latestCheckpointAcknowledgedAt,
    },
    workspaceDraft: draftAssessment
      ? {
        present: true,
        entryCount: draftAssessment.entryCount,
        savedAt: draftAssessment.documentSavedAtMs,
        latestEntrySavedAt: draftAssessment.latestSavedAt,
        counts: draftAssessment.counts,
        // Counts and reasons only. A teacher who wants to see the responses
        // runs the dry run below, which says exactly what it would write.
        recoverableCount: draftAssessment.recoverable.length,
      }
      : { present: false, entryCount: 0, savedAt: null, latestEntrySavedAt: null, counts: {}, recoverableCount: 0 },
    /*
     * WHAT THIS DEVICE IS HOLDING FOR *THIS* ASSIGNMENT.
     *
     * Only this student's own devices can report this, and only after they
     * reconnect. An empty list means "nothing has reported", never "nothing is
     * queued" — it is the one number this report cannot prove.
     *
     * A device that sent only an aggregate (the release before the breakdown
     * existed) reports `assignmentQueueKnown: false`. Its aggregate is passed
     * through as an aggregate and never displayed as this assignment's count:
     * three submissions queued for a different assignment must not read as
     * three outstanding here.
     */
    deviceQueues: deviceDocuments.map((snapshot) => {
      const data = snapshot.data() || {};
      const assignmentKey = encodeURIComponent(assignmentId);
      const knowsAssignments = data.hasAssignmentBreakdown === true;
      return {
        deviceId: data.deviceId || null,
        reportedAt: millisOf(data.reportedAt),
        summarySchemaVersion: Number(data.summarySchemaVersion) || 1,
        assignmentQueueKnown: knowsAssignments,
        queuedGradeBearingForAssignment: knowsAssignments
          ? Number(data.queuedGradeBearingByAssignment?.[assignmentKey]) || 0
          : null,
        queuedForAssignment: knowsAssignments
          ? Number(data.queuedByAssignment?.[assignmentKey]) || 0
          : null,
        needsReviewForAssignment: knowsAssignments
          ? Number(data.needsReviewByAssignment?.[assignmentKey]) || 0
          : null,
        blockedReasonsForAssignment: knowsAssignments
          ? (data.blockedReasonsByAssignment?.[assignmentKey] || {})
          : null,
        queuedKindsForAssignment: knowsAssignments
          ? (data.queuedKindsByAssignment?.[assignmentKey] || {})
          : null,
        // Device-wide totals across every assignment. Labelled, so a reader
        // cannot mistake them for this assignment's.
        deviceWideQueued: Number(data.queued) || 0,
        deviceWideQueuedGradeBearing: Number(data.queuedGradeBearing) || 0,
        deviceWideNeedsReview: Number(data.needsReview) || 0,
        retired: Number(data.retired) || 0,
        oldestCapturedAt: Number(data.oldestCapturedAt) || null,
      };
    }),
    recoveredAttempts: Number(receiptsByDisposition.accepted || 0),
    receiptsByDisposition,
    presence: { answered: presenceAnswered, activeSeconds: presenceActiveSeconds, sessions: sessionSnapshot.size },
    // The headline. Work the student's own session says they did, that the
    // gradebook cannot account for.
    unaccountedForQuestions: Math.max(0, presenceAnswered - canonicalAttempted),
    persistencePending: persistenceState.persistencePending,
    persistencePendingReasons: persistenceState.reasons,
    /*
     * A HOLD A TEACHER OF RECORD HAS ALREADY CLOSED.
     *
     * The discrepancy itself is still reported above, unchanged, because it
     * really happened. This says only that a named human looked at it, on a
     * recorded date, and accepted that the work is unrecoverable — so the row
     * reads as a closed incident rather than as a live one, and the panel can
     * refuse to offer the action twice.
     */
    persistenceResolvedReasons: persistenceState.resolvedReasons || [],
    persistenceResolution: persistenceResolution
      ? {
        resolvedByEmail: String(persistenceResolution.resolvedByEmail || "") || null,
        resolvedAt: millisOf(persistenceResolution.resolvedAt),
        reason: String(persistenceResolution.reason || "").slice(0, 500),
        acknowledgedWorked: Number(persistenceResolution.acknowledgedWorked) || 0,
        acknowledgedCanonicalAttempted: Number(persistenceResolution.acknowledgedCanonicalAttempted) || 0,
        // True when evidence has moved past what the teacher acknowledged, so
        // the panel can say the hold came back rather than silently re-arming.
        supersededByNewEvidence: !(persistenceState.resolvedReasons || []).includes("session-summary-gap")
          && presenceAnswered > canonicalAttempted,
      }
      : null,
    needsReview,
  };
}

/**
 * The narrowly scoped teacher/admin recovery report for one assignment and one
 * class. Built entirely from server-authoritative data, and carrying no
 * student's raw responses.
 */
exports.getStudentPersistenceRecoveryReport = onCall({ timeoutSeconds: 300 }, async (request) => {
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const classId = String(request.data?.classId || "").trim();
  if (!assignmentId || !classId) throw new HttpsError("invalid-argument", "assignmentId and classId are required.");
  const { classSnapshot } = await requireClassTeacher(request, classId);

  const db = getFirestore();
  const [assignmentSnapshot, scheduleSnapshot, roster] = await Promise.all([
    db.collection("assignments").doc(assignmentId).get(),
    db.collection("settings").doc("classSchedule").get(),
    db.collection("grades").where("classId", "==", classId).limit(RECOVERY_REPORT_STUDENT_LIMIT).get(),
  ]);
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment no longer exists.");
  const assignment = { id: assignmentSnapshot.id, ...assignmentSnapshot.data() };
  if (!studentMatchesAssignmentAudience({ assignment, classId })) {
    throw new HttpsError("failed-precondition", "That assignment is not assigned to this class.");
  }
  const schedule = scheduleSnapshot.exists ? scheduleSnapshot.data() : null;
  const classPeriod = String(classSnapshot.data()?.period || "") || null;

  // One query for the whole class's drafts rather than one per student.
  const draftSnapshot = await db.collection("studentWorkspaceDrafts")
    .where("assignmentId", "==", assignmentId)
    .where("classId", "==", classId)
    .limit(RECOVERY_REPORT_STUDENT_LIMIT)
    .get();
  const drafts = new Map(draftSnapshot.docs.map((snapshot) => {
    const data = snapshot.data() || {};
    return [String(data.studentId || ""), { data, updatedAtMs: millisOf(data.updatedAt) }];
  }));

  const students = roster.docs.filter((snapshot) => snapshot.data()?.status !== "disabled");
  const rows = [];
  for (const snapshot of students) {
    // eslint-disable-next-line no-await-in-loop
    rows.push(await buildStudentRecoveryRow({
      db,
      studentId: snapshot.id,
      gradeData: snapshot.data() || {},
      assignment,
      assignmentId,
      classId,
      schedule,
      classPeriod,
      drafts,
    }));
  }

  return {
    assignmentId,
    assignmentTitle: String(assignment.title || "").slice(0, 200),
    classId,
    generatedAt: Date.now(),
    studentCount: rows.length,
    totals: {
      canonicalAttempted: rows.reduce((total, row) => total + row.canonicalAttempted, 0),
      unaccountedForQuestions: rows.reduce((total, row) => total + row.unaccountedForQuestions, 0),
      recoverableDrafts: rows.reduce((total, row) => total + row.workspaceDraft.recoverableCount, 0),
      // Only devices that can answer per-assignment are counted here. A legacy
      // aggregate is reported separately rather than folded in, because adding
      // it would be the same misattribution at class scale.
      queuedOnDevices: rows.reduce((total, row) => total + row.deviceQueues.reduce(
        (sum, queue) => sum + (queue.assignmentQueueKnown ? queue.queuedGradeBearingForAssignment : 0), 0,
      ), 0),
      devicesWithoutAssignmentBreakdown: rows.reduce((total, row) => total + row.deviceQueues.filter(
        (queue) => !queue.assignmentQueueKnown,
      ).length, 0),
    },
    persistenceHealth: {
      ingestionService: rows.some((row) => row.needsReview.some(
        (item) => item.source === "deviceQueue" && /^callable-(unavailable|permission-denied|deadline-exceeded)/.test(item.reason),
      )) ? "degraded" : "no-reported-transport-error",
      deviceReportingService: rows.some((row) => row.deviceQueues.length) ? "reporting" : "not-yet-reported",
      queuedGradeBearing: rows.reduce((total, row) => total + row.deviceQueues.reduce(
        (sum, queue) => sum + (Number(queue.queuedGradeBearingForAssignment) || 0), 0,
      ), 0),
      oldestQueuedActionAt: rows.reduce((oldest, row) => row.deviceQueues.reduce((value, queue) => {
        const captured = Number(queue.oldestCapturedAt) || null;
        return captured && (!value || captured < value) ? captured : value;
      }, oldest), null),
    },
    students: rows.sort((left, right) => right.unaccountedForQuestions - left.unaccountedForQuestions),
  };
});

/**
 * Apply workspace-draft recovery for one assignment and class.
 *
 * DRY RUN BY DEFAULT. A draft is a workspace, not an attempt, so turning one
 * into a grade is a teacher's decision made with the list in front of them —
 * `commit: true` is the only way anything is written.
 *
 * What it writes goes through exactly the path an ordinary submission takes:
 * the same server grader, the same attempt policy, the same projections, the
 * same evidence builder, and the same idempotency key discipline. The draft's
 * proven response becomes an ingestion envelope carrying NO record and NO
 * verdict, so correctness is derived here and cannot come from the draft.
 *
 * Only entries the five proofs hold for are eligible; everything else stays
 * exactly where it is and keeps showing up in the report.
 */
exports.applyWorkspaceDraftRecovery = onCall({ timeoutSeconds: 540 }, async (request) => {
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const classId = String(request.data?.classId || "").trim();
  const commit = request.data?.commit === true;
  const previewTokens = Array.isArray(request.data?.previewTokens)
    ? request.data.previewTokens.map((value) => String(value || "")).filter(Boolean)
    : [];
  if (!assignmentId || !classId) throw new HttpsError("invalid-argument", "assignmentId and classId are required.");
  if (commit && !previewTokens.length) {
    throw new HttpsError("failed-precondition", "Preview this class and assignment before recovering workspace drafts.");
  }
  const { classSnapshot, email } = await requireClassTeacher(request, classId);

  const db = getFirestore();
  const recovery = await workspaceDraftRecovery();
  const { recoveryPreviewToken, previewTokenSetsMatch } = await import("./shared/recoveryPreviewToken.mjs");
  const ingestion = await submissionIngestion();
  const { resolveAuthoritativeClose } = await import("./shared/sectionDeadline.mjs");

  const [assignmentSnapshot, scheduleSnapshot] = await Promise.all([
    db.collection("assignments").doc(assignmentId).get(),
    db.collection("settings").doc("classSchedule").get(),
  ]);
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment no longer exists.");
  const assignment = { id: assignmentSnapshot.id, ...assignmentSnapshot.data() };
  if (secureAssignmentMode(assignment) || assignment.secure === true) {
    throw new HttpsError("failed-precondition", "Secure Test Cycle work is recovered through its own server-authoritative path.");
  }
  if (!studentMatchesAssignmentAudience({ assignment, classId })) {
    throw new HttpsError("failed-precondition", "That assignment is not assigned to this class.");
  }
  const schedule = scheduleSnapshot.exists ? scheduleSnapshot.data() : null;
  const classPeriod = String(classSnapshot.data()?.period || "") || null;
  const questions = runtimeQuestionsFromAssignment(assignment) || [];

  const draftSnapshot = await db.collection("studentWorkspaceDrafts")
    .where("assignmentId", "==", assignmentId)
    .where("classId", "==", classId)
    .limit(RECOVERY_REPORT_STUDENT_LIMIT)
    .get();

  const proposals = [];
  for (const snapshot of draftSnapshot.docs) {
    const draft = snapshot.data() || {};
    const studentId = String(draft.studentId || "");
    if (!studentId) continue;
    // eslint-disable-next-line no-await-in-loop
    const gradeSnapshot = await db.collection("grades").doc(studentId).get();
    if (!gradeSnapshot.exists) continue;
    const gradeData = gradeSnapshot.data() || {};
    if (String(gradeData.classId || "") !== classId) continue;
    const tracker = gradeData?.gradesByAssignment?.[assignmentId] || {};
    const savedAtMs = millisOf(draft.updatedAt);

    const assessment = recovery.assessWorkspaceDraftDocument({
      document: draft,
      documentSavedAtMs: savedAtMs,
      resolveQuestion: (entry) => questions[Number(entry.questionIndex)] || null,
      resolveCanonicalRecord: (entry) => tracker?.[String(entry.questionIndex)] ?? tracker?.[entry.questionIndex] ?? null,
      resolveCloseAt: (entry) => resolveAuthoritativeClose({
        assignment,
        activityRole: questions[Number(entry.questionIndex)]?.activityRole || "classwork",
        schedule,
        classId,
        classPeriod,
        nowValue: savedAtMs || Date.now(),
        studentId,
      }).closesAtMs,
    });

    assessment.recoverable.forEach((entry) => {
      const question = questions[Number(entry.questionIndex)] || null;
      const proposal = {
        studentId,
        studentName: String(gradeData.displayName || studentId).slice(0, 180),
        questionIndex: Number(entry.questionIndex),
        questionNumber: Number(entry.questionIndex) + 1,
        questionId: question?.questionId || question?.id || null,
        activityRole: question?.activityRole || "classwork",
        draftKey: entry.key,
        savedAt: entry.documentSavedAtMs,
        academicOccurredAt: entry.documentSavedAtMs,
        closesAt: entry.closesAtMs,
        qualificationReason: "Complete response saved on the server before the section closed; no canonical attempt exists.",
        canonicalStatus: "No canonical attempt",
        proposedResult: entry.proposedResult || "Server can grade this response",
        // The ONE thing that makes this idempotent across re-runs: the same
        // draft entry always proposes the same submission id, so a second
        // commit finds it already canonical and writes nothing.
        actionId: `draft-recovery:${snapshot.id}:${entry.key}`.slice(0, 200),
        envelope: ingestion.buildSubmissionEnvelope({
          actionId: `draft-recovery:${snapshot.id}:${entry.key}`.slice(0, 200),
          kind: "ordinarySubmission",
          studentId,
          assignmentId,
          questionIndex: Number(entry.questionIndex),
          questionId: question?.questionId || question?.id || null,
          variantIndex: Number(entry.variantIndex) || 0,
          activityRole: question?.activityRole || "classwork",
          capturedAt: entry.documentSavedAtMs,
          previousTotalAttempts: 0,
          // No record and no verdict. The server grades the raw response.
          record: null,
          response: entry.response,
        }),
      };
      proposal.previewToken = recoveryPreviewToken({
        studentId,
        assignmentId,
        classId,
        questionIndex: proposal.questionIndex,
        questionId: proposal.questionId,
        variantIndex: proposal.envelope.variantIndex,
        draftKey: proposal.draftKey,
        savedAt: proposal.savedAt,
        response: proposal.envelope.response,
        closesAt: proposal.closesAt,
      });
      proposals.push(proposal);
    });
  }

  if (!commit) {
    return {
      assignmentId,
      classId,
      committed: false,
      proposalCount: proposals.length,
      proposals: proposals.map(({ envelope: _envelope, ...rest }) => rest),
    };
  }

  // A commit is bounded to the exact server-issued proposal identities the UI
  // just displayed. Reassessment above still wins: stale/newer attempts simply
  // disappear and can never be overwritten.
  const currentTokens = proposals.map((proposal) => proposal.previewToken);
  if (!previewTokenSetsMatch(previewTokens, currentTokens)) {
    throw new HttpsError("failed-precondition", "The preview is stale. Run draft recovery preview again.");
  }

  const applied = [];
  for (const proposal of proposals) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const receipt = await ingestOneSubmission({
        db,
        studentId: proposal.studentId,
        envelope: { ...proposal.envelope, studentId: proposal.studentId },
        now: Date.now(),
      });
      applied.push({ ...receipt, studentId: proposal.studentId, draftKey: proposal.draftKey });
    } catch (error) {
      logger.error("Could not apply a workspace draft recovery", {
        assignmentId, classId, studentId: proposal.studentId, draftKey: proposal.draftKey, message: error.message,
      });
      applied.push({
        actionId: proposal.actionId,
        studentId: proposal.studentId,
        draftKey: proposal.draftKey,
        disposition: "retryable",
        reason: `recovery-error:${String(error.message || "unknown").slice(0, 120)}`,
      });
    }
  }
  logger.info("Workspace draft recovery committed", { assignmentId, classId, by: email, applied: applied.length });
  return { assignmentId, classId, committed: true, proposalCount: proposals.length, applied };
});



/**
 * Grade Transfer / TEAMS boundary.
 *
 * Client-side Firestore rules are intentionally not used for this workflow.
 * The server validates teacher-of-record access, freezes export snapshots, and
 * returns only the small audit projection the Grade Transfer Center needs.
 */
function normalizeTeamsSisStudentId(value) {
  const cleaned = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(cleaned)) {
    throw new HttpsError("invalid-argument", "SIS Student ID must contain digits only.");
  }
  return cleaned;
}

function serializableGradeTransferDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function gradeTransferClassAuthority(db, request, classId) {
  const cleanClassId = String(classId || "").trim();
  if (!cleanClassId) throw new HttpsError("invalid-argument", "classId is required.");
  const snapshot = await db.collection(CLASS_COLLECTION).doc(cleanClassId).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
  const email = callerEmail(request);
  const isRootAdmin = request.auth?.token?.rootAdmin === true && authLib.isRootAdminEmail(email);
  const teacherOfRecord = String(snapshot.data()?.teacherOfRecord || "").trim().toLowerCase();
  if (!isRootAdmin && (!email || teacherOfRecord !== email)) {
    throw new HttpsError("permission-denied", "Only the teacher of record for this class can use Grade Transfer.");
  }
  return { classId: cleanClassId, email, isRootAdmin, classData: snapshot.data() || {} };
}

exports.listGradeTransferState = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const classIds = [...new Set(
    (Array.isArray(request.data?.classIds) ? request.data.classIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  )];
  if (classIds.length > 20) throw new HttpsError("invalid-argument", "Too many classes requested at once.");

  await Promise.all(classIds.map((classId) => gradeTransferClassAuthority(db, request, classId)));

  const [snapshotGroups, redemptionGroups] = await Promise.all([
    Promise.all(classIds.map((classId) => db.collection("gradeTransferSnapshots").where("classId", "==", classId).get())),
    Promise.all(classIds.map((classId) => db.collection("classPointRewardRedemptions").where("classId", "==", classId).get())),
  ]);

  const snapshots = snapshotGroups.flatMap((group) => group.docs.map((entry) => {
    const data = entry.data() || {};
    return {
      id: entry.id,
      ...data,
      createdAt: serializableGradeTransferDate(data.createdAt),
      uploadConfirmedAt: serializableGradeTransferDate(data.uploadConfirmedAt),
    };
  }));
  const practicePassKeys = [...new Set(redemptionGroups.flatMap((group) => group.docs
    .map((entry) => entry.data() || {})
    .filter((value) => value.rewardCode === "practicePass" && value.status === "redeemed")
    .map((value) => `${String(value.studentId || "")}__${String(value.classId || "")}__${String(value.assignmentId || "")}`)
    .filter((value) => !value.startsWith("__"))))];

  return { snapshots, practicePassKeys };
});

exports.persistGradeTransferSnapshot = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const input = request.data?.snapshot || {};
  const transferId = String(input.transferId || "").trim();
  if (!/^transfer_[A-Za-z0-9_-]{1,120}$/.test(transferId)) {
    throw new HttpsError("invalid-argument", "Invalid transfer snapshot id.");
  }
  const classId = String(input.classId || "").trim();
  const assignmentId = String(input.assignmentId || "").trim();
  if (!assignmentId) throw new HttpsError("invalid-argument", "assignmentId is required.");
  const sectionKey = String(input.sectionKey || "").trim().toLowerCase();
  if (sectionKey && !["warmup", "classwork", "practice", "dol"].includes(sectionKey)) {
    throw new HttpsError("invalid-argument", "Invalid Grade Transfer section.");
  }
  const sectionLabel = String(input.sectionLabel || "").trim().slice(0, 80);
  const authority = await gradeTransferClassAuthority(db, request, classId);

  const rows = (Array.isArray(input.rows) ? input.rows : []).map((row) => {
    const grade = Number(row?.grade);
    if (!Number.isInteger(grade) || grade < 0 || grade > 100) {
      throw new HttpsError("invalid-argument", "Every TEAMS grade must be a whole number from 0 to 100.");
    }
    return {
      studentId: String(row?.studentId || "").trim().slice(0, 320),
      sisStudentId: normalizeTeamsSisStudentId(row?.sisStudentId),
      grade,
      gradeVersion: String(row?.gradeVersion || "").trim().slice(0, 240),
    };
  });
  if (!rows.length) throw new HttpsError("failed-precondition", "There are no valid finalized rows to export.");

  const withheld = (Array.isArray(input.withheld) ? input.withheld : []).slice(0, 500).map((row) => ({
    studentId: String(row?.studentId || "").trim().slice(0, 320),
    name: String(row?.name || "").trim().slice(0, 180),
    reason: String(row?.reason || "").trim().slice(0, 180),
    deadline: row?.deadline ? String(row.deadline).slice(0, 80) : null,
  }));
  const snapshot = {
    transferId,
    teacherUid: request.auth.uid,
    teacherEmail: authority.email,
    classId,
    assignmentId,
    assignmentTitle: String(input.assignmentTitle || "Untitled assignment").trim().slice(0, 240),
    sectionKey: sectionKey || null,
    sectionLabel: sectionLabel || null,
    exportKind: input.exportKind === "delta" ? "delta" : "initial",
    rows,
    withheld,
    fileName: String(input.fileName || "").trim().slice(0, 240),
    packageId: String(input.packageId || "").trim().slice(0, 160),
    schemaVersion: sectionKey ? 2 : 1,
  };

  const ref = db.collection("gradeTransferSnapshots").doc(transferId);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const data = existing.data() || {};
      if (
        data.classId !== classId
        || data.assignmentId !== assignmentId
        || String(data.sectionKey || "") !== sectionKey
        || JSON.stringify(data.rows || []) !== JSON.stringify(rows)
      ) {
        throw new HttpsError("already-exists", "Transfer id already belongs to a different immutable snapshot.");
      }
      return;
    }
    transaction.set(ref, { ...snapshot, createdAt: FieldValue.serverTimestamp() });
  });
  return { transferId };
});

exports.confirmGradeTransferUploaded = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const transferId = String(request.data?.transferId || "").trim();
  if (!transferId) throw new HttpsError("invalid-argument", "transferId is required.");
  const ref = db.collection("gradeTransferSnapshots").doc(transferId);
  const existing = await ref.get();
  if (!existing.exists) throw new HttpsError("not-found", "Export snapshot was not found.");
  const data = existing.data() || {};
  const authority = await gradeTransferClassAuthority(db, request, data.classId);

  if (!data.uploadConfirmedAt) {
    await ref.update({
      uploadConfirmedAt: FieldValue.serverTimestamp(),
      uploadConfirmedByUid: request.auth.uid,
      uploadConfirmedByEmail: authority.email,
    });
  }
  return { transferId, confirmed: true };
});

exports.setStudentSisId = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const studentId = String(request.data?.studentId || "").trim();
  if (!studentId) throw new HttpsError("invalid-argument", "studentId is required.");
  const sisStudentId = normalizeTeamsSisStudentId(request.data?.sisStudentId);
  const studentRef = db.collection("grades").doc(studentId);
  const studentSnapshot = await studentRef.get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "That student is not on the MathMaster roster.");

  const email = callerEmail(request);
  const isRootAdmin = request.auth?.token?.rootAdmin === true && authLib.isRootAdminEmail(email);
  const student = studentSnapshot.data() || {};
  let authorized = isRootAdmin
    || String(student.assignedTeacherEmail || "").trim().toLowerCase() === email;
  const classId = String(student.classId || "").trim();
  if (!authorized && classId) {
    const classSnapshot = await db.collection(CLASS_COLLECTION).doc(classId).get();
    authorized = classSnapshot.exists
      && String(classSnapshot.data()?.teacherOfRecord || "").trim().toLowerCase() === email;
  }
  if (!authorized) throw new HttpsError("permission-denied", "Only this student's teacher of record can set the SIS Student ID.");

  const [sameField, sameDocument] = await Promise.all([
    db.collection("grades").where("sisStudentId", "==", sisStudentId).limit(2).get(),
    db.collection("grades").doc(sisStudentId).get(),
  ]);
  const conflictingField = sameField.docs.find((entry) => entry.id !== studentId);
  const conflictingDocument = sameDocument.exists && sameDocument.id !== studentId ? sameDocument : null;
  if (conflictingField || conflictingDocument) {
    throw new HttpsError("already-exists", "That SIS Student ID is already assigned to another MathMaster student.");
  }

  await studentRef.set({
    sisStudentId,
    sisStudentIdVerifiedAt: FieldValue.serverTimestamp(),
    sisStudentIdVerifiedBy: email,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeAdminAudit(
    db,
    { uid: request.auth?.uid || null, email },
    "sis_student_id_set",
    studentId,
    { sisStudentId, classId: classId || null },
  );
  return { studentId, sisStudentId };
});


exports.retryLiveChallengeAchievementJobs = onSchedule({
  schedule: "every 15 minutes",
  invoker: "private",
}, async () => {
  const db = getFirestore();
  const rewards = await liveChallengeClassPoints();

  try {
    await rewards.retryPendingLiveChallengeAchievementJobs(db);
  } catch (error) {
    logger.error("liveChallenge.classPoints.retryJobs.failed", {
      message: error?.message || String(error),
    });
  }

  const challengeRules = await liveChallengeRules();
  const recoveryRooms = await db.collection(LIVE_CHALLENGE_ROOMS)
    .where("classPointsRecoveryPending", "==", true)
    .limit(20)
    .get();

  for (const roomDoc of recoveryRooms.docs) {
    const room = roomDoc.data() || {};
    if (room.status !== challengeRules.LIVE_CHALLENGE_STATUS.FINISHED) {
      // eslint-disable-next-line no-await-in-loop
      await roomDoc.ref.set({
        classPointsRecoveryPending: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }

    const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomDoc.id);
    // eslint-disable-next-line no-await-in-loop
    const privateSnapshot = await privateRef.get();
    if (!privateSnapshot.exists) {
      logger.error("liveChallenge.classPoints.recoveryMissingPrivateState", { roomId: roomDoc.id });
      // eslint-disable-next-line no-await-in-loop
      await roomDoc.ref.set({
        classPointsRecoveryPending: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const players = await loadPrivateChallengePlayers(privateRef);
      // eslint-disable-next-line no-await-in-loop
      await rewards.processLiveChallengeClassPoints(
        db,
        roomDoc.id,
        room,
        players,
        privateSnapshot.data() || {},
        room.status,
      );
      // eslint-disable-next-line no-await-in-loop
      await deletePrivateChallengeState(db, privateRef, players);
      // eslint-disable-next-line no-await-in-loop
      await roomDoc.ref.set({
        classPointsRecoveryPending: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      logger.error("liveChallenge.classPoints.recoveryRoom.failed", {
        roomId: roomDoc.id,
        message: error?.message || String(error),
      });
    }
  }
});
