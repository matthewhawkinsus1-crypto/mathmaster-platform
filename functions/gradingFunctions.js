// GRADING AND SUBMISSIONS: answer ingestion, response checkpoints, Recovery, grade overrides, the device queue and persistence holds, grade transfer.
//
// One of the domain modules functions/index.js loads (see its header). The
// code here was moved from index.js as it stood; helpers that another domain
// also uses are in functionsCommon.js.

const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const { runtimeIncludedQuestionIndices, runtimeIncludedQuestionIndicesForSection, runtimeQuestionsFromAssignment } = require("./lib/assignmentRuntime");
const { weightedQuestionTotals } = require("./lib/questionWeights");
const sectionRecoveryGrades = require("./lib/sectionRecoveryGrades");
const authLib = require("./lib/auth");
const mathPath = require("./lib/mathPath");
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
/*
 * A QUESTION RECORD IS STORED SPLIT (functions/shared/gradeEntryStorage.mjs).
 *
 * Its summary stays in grades/{studentId}.gradesByAssignment[a][q] (enough to
 * grade: credit, status, attempts, `stepCredit`), and its detail (parts,
 * steps, last response, support flags, algebra state) lives in
 * grades/{studentId}/responseDetail/{a}.questions[q], tied by one `detailRef`.
 * Since Nov 16, 2026 the grades document was approaching Firestore's 1 MiB cap.
 *
 * A writer stores both halves in the same transaction or batch
 * (writeQuestionRecord). A reader that needs the whole record (attempt policy,
 * review, recovery, mastery) joins them first (hydrateGradeData); a reader that
 * only grades (the Classroom triggers, class-wide reports) reads the summary.
 */
const {
  gradeEntryStorage,
  splitInlineRecords,
  splitPolicy,
  hydrateGradeData,
  questionRecordUpdates,
} = require("./lib/gradeDetailStore");
const {
  ASSIGNMENT_GRADE_OVERRIDE_KEY,
  CHECKPOINT_COLLECTION,
  CHECKPOINT_STATUS_ACTIVE,
  CLASS_COLLECTION,
  CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION,
  DEVICE_QUEUE_REPORT_COLLECTION,
  PERSISTENCE_RESOLUTION_COLLECTION,
  STUDENT_SESSION_SUMMARY_COLLECTION,
  WORKSPACE_DRAFT_COLLECTION,
  activeAssignmentGradeOverride,
  assignmentGradeProgress,
  authoritativeStudentClassId,
  callerEmail,
  classPointRewards,
  getQuestionCredit,
  millisOf,
  persistencePendingLib,
  persistenceResolutionDocumentId,
  privateOverrideFrom,
  questionWasAttempted,
  readAllDeviceReportsForStudent,
  readPersistencePending,
  requireClassTeacher,
  requireStudent,
  requireTeacher,
  resolveCheckpointClassPeriod,
  secureAssignmentMode,
  studentIdentity,
  studentIdentityRecord,
  studentMatchesAssignmentAudience,
  studentOmittedFor,
  studentOverrideRef,
  studentOverrides,
  studentRequiredIndices,
  workspaceDraftRecovery,
  writeAdminAudit,
} = require("./functionsCommon");

// Explicit, audited correction workflow. Ordinary support-profile saves never call it.
exports.reviewRetroactiveAccommodation = onCall(async (request) => {
  const { createRetroactiveAccommodationService } = require("./lib/retroactiveAccommodation");
  return createRetroactiveAccommodationService({
    db: getFirestore(), FieldPath, FieldValue, HttpsError,
    gradeFor: async ({ assignment, gradeData, practiceWaived }) => {
      const originalTracker = gradeData.gradesByAssignment?.[assignment.id];
      const omitted = await studentOmittedFor({ assignment, gradeData, assignmentId: assignment.id });
      const questions = runtimeQuestionsFromAssignment(assignment);
      const indices = runtimeIncludedQuestionIndices(assignment).filter((index) => !practiceWaived.includes(index) && !omitted.has(index));
      if (!indices.length) return null;
      const inputs = await sectionRecoveryGrades.projectRecoveredGradeInputs({
        assignment, tracker: originalTracker || {}, questions,
        overrides: gradeData.teacherGradeOverridesByAssignment?.[assignment.id] || {},
        recoveryForAssignment: gradeData.sectionRecoveryByAssignment?.[assignment.id] || null,
        challengeCredit: gradeData.warmupChallengeByAssignment?.[assignment.id] || null,
        gradeProgress: assignmentGradeProgress, omittedIndices: omitted,
      });
      if (!originalTracker && !Object.keys(inputs.tracker).length) return null;
      return calculateAssignmentGrade(inputs.tracker, indices, questions, inputs.overrides);
    },
  })(request);
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
const RESPONSE_INSPECTION_EVIDENCE_COLLECTION = "responseInspectionEvidence";
const CHECKPOINT_BATCH_LIMIT = 200;
// How long a checkpoint with no provable close waits before being re-examined.
const CHECKPOINT_HOLD_BACKOFF_MS = 60 * 60 * 1000;

/** The storage switch (platformFlags/assignmentOverrideStorage), read fresh each time. */
async function overrideStorageMode(db, transaction = null) {
  const overrides = await studentOverrides();
  const ref = db.collection("platformFlags").doc(overrides.OVERRIDE_STORAGE_FLAG);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  return overrides.resolveOverrideStorageMode(snapshot.exists ? snapshot.data() : null);
}

/**
 * Apply the shared-copy writes a planner returned ({op, path, value}) as ONE
 * dotted-path update on the assignment — never a whole-document rewrite, so a
 * concurrent teacher edit to anything else on it is untouched.
 */
function applySharedCopyWrites(transaction, assignmentRef, writes = []) {
  if (!writes.length) return 0;
  const fieldsAndValues = [];
  writes.forEach(({ op, path, value }) => {
    const fieldPath = new FieldPath(...path);
    if (op === "delete") fieldsAndValues.push(fieldPath, FieldValue.delete());
    else if (op === "arrayRemove") fieldsAndValues.push(fieldPath, FieldValue.arrayRemove(value));
    else fieldsAndValues.push(fieldPath, value);
  });
  transaction.update(assignmentRef, ...fieldsAndValues);
  return writes.length;
}

/** Where a student's override history lives: grades/{sid}/assignmentOverrideEvents/{eventId}. */
async function studentOverrideEventRef(db, studentId, eventId) {
  const overrides = await studentOverrides();
  return db.collection("grades").doc(String(studentId)).collection(overrides.ASSIGNMENT_OVERRIDE_EVENTS_COLLECTION).doc(String(eventId));
}

async function finalizeOneResponseCheckpoint({ db, ref, schedule, classPeriodCache, now, serverGradingSettings = null }) {
  const {
    decideCheckpointFinalization,
    buildCheckpointFinalization,
  } = await responseCheckpointFinalizer();
  const { excludedAsSecureWork } = await submissionIngestion();

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
    // The student's own deadline and DOL attempt grant: read with the
    // server's authority, keyed by the checkpoint's (rules-pinned) owner.
    const overrideRef = await studentOverrideRef(db, String(checkpoint.studentId || studentId), checkpoint.assignmentId);
    const [assignmentSnapshot, gradeSnapshot, overrideSnapshot] = await Promise.all([
      transaction.get(assignmentRef),
      transaction.get(gradeRef),
      overrideRef ? transaction.get(overrideRef) : Promise.resolve(null),
    ]);
    const privateOverride = privateOverrideFrom(overrideSnapshot);

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
    // Whether this record is written split (settings/serverGrading.splitGradeRecords,
    // or a grades document near the cap), measured on the document as stored.
    const storedGradeData = gradeSnapshot.data() || {};
    const recordPolicy = await splitPolicy({ settings: serverGradingSettings, gradeRef, storedGradeData });
    // The whole record (summary joined to its stored detail), read in this transaction.
    const gradeData = await hydrateGradeData({
      transaction, gradeRef, gradeData: storedGradeData, assignmentIds: [String(checkpoint.assignmentId)],
    });
    const question = runtimeQuestionsFromAssignment(assignment)?.[Number(checkpoint.questionIndex)] || null;

    const decision = decideCheckpointFinalization({
      checkpoint,
      assignment,
      gradeDocument: gradeData,
      gradeDocumentId: gradeSnapshot.id,
      question,
      schedule,
      classPeriod,
      // A Test Cycle's Review is ordinary work (excludedAsSecureWork); the
      // finalizer still refuses an assignment flagged `secure` on its own.
      isSecureAssignment: excludedAsSecureWork({ testCycle: secureAssignmentMode(assignment), question }),
      privateOverride,
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
    const assignmentId = String(checkpoint.assignmentId);
    // Classwork completion and the DOL score count the student's own required
    // items (a reduced-item-count accommodation omits some; see studentOmittedFor).
    const studentOmitted = await studentOmittedFor({
      assignment, gradeData, assignmentId, answeredIndex: checkpoint.questionIndex, nowValue: now,
    });
    const classworkIndices = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, "classwork"), studentOmitted);
    const dolIndices = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, "dol"), studentOmitted);
    const authoritativeOverrides =
      gradeData?.teacherGradeOverridesByAssignment?.[assignmentId] || {};
    const finalization = buildCheckpointFinalization({
      checkpoint, assignment, question, decision,
      gradeDocument: gradeData, classworkIndices, dolIndices,
      privateOverride,
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
      // The record here, whole or (by the policy above) as its summary with
      // the detail beside it (responseDetail), one detailRef.
      ...await questionRecordUpdates({
        writer: transaction, gradeRef, studentId: gradeRef.id, assignmentId,
        questionKey: String(checkpoint.questionIndex), record: finalization.record, policy: recordPolicy,
      }),
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
  {
    schedule: "every 1 minutes",
    timeZone: "America/Chicago",
    // This scheduler is internal infrastructure. setGlobalOptions() makes
    // client-callable HTTPS functions public at the transport layer, so
    // explicitly keep scheduled work private just like the other schedulers.
    invoker: "private",
  },
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
    // Whether records are written split (splitGradeRecords), read once per run.
    const serverGradingSettings = (await db.collection("settings").doc("serverGrading").get()).data() || {};
    const classPeriodCache = new Map();
    const outcomes = {};

    for (const snapshot of [...due.docs, ...unhinted.docs]) {
      try {
        const outcome = await finalizeOneResponseCheckpoint({
          db, ref: snapshot.ref, schedule, classPeriodCache, now, serverGradingSettings,
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

/**
 * Ingest ONE envelope inside a transaction and return its receipt.
 *
 * Every read happens before every write, and the canonical attempt, its
 * projections, the evidence event and the checkpoint retirement all commit
 * together — so a teacher never sees a grade without its evidence, and a
 * deadline can never turn one response into two attempts.
 */
async function ingestOneSubmission({ db, studentId, envelope, now, serverGradingSettings = {}, hints = null }) {
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
  // The AUTHENTICATED student's own controls on this assignment — the id comes
  // from the caller's token (`studentId`), never from the envelope.
  const overrideRef = await studentOverrideRef(db, studentId, envelope.assignmentId);

  return db.runTransaction(async (transaction) => {
    const [assignmentSnapshot, gradeSnapshot, receiptSnapshot, checkpointSnapshot, overrideSnapshot] = await Promise.all([
      transaction.get(assignmentRef),
      transaction.get(gradeRef),
      transaction.get(receiptRef),
      checkpointRef ? transaction.get(checkpointRef) : Promise.resolve(null),
      overrideRef ? transaction.get(overrideRef) : Promise.resolve(null),
    ]);
    const privateOverride = privateOverrideFrom(overrideSnapshot);

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
    // The whole record of this assignment's questions: the summary joined to
    // its stored detail, read in this transaction (attempt policy compares the
    // last response and replays the steps).
    const storedGradeData = gradeSnapshot.exists ? gradeSnapshot.data() || {} : null;
    // Whether this record is written split (settings/serverGrading.splitGradeRecords,
    // or a grades document near the cap), measured on the document as stored.
    const recordPolicy = await splitPolicy({ settings: serverGradingSettings, gradeRef, storedGradeData });
    // Records stored whole are moved after this call (splitInlineRecords), when
    // the switch is on or this document is near the cap.
    if (hints && storedGradeData && (recordPolicy.splitAll || recordPolicy.nearCap)
      && (await gradeEntryStorage()).anyInlineRecords(storedGradeData)) hints.inlineRecords = true;
    const gradeData = await hydrateGradeData({
      transaction,
      gradeRef,
      gradeData: storedGradeData,
      assignmentIds: [envelope.assignmentId],
    });
    const classId = authoritativeStudentClassId(gradeData);

    const question = assignment ? runtimeQuestionsFromAssignment(assignment)?.[envelope.questionIndex] || null : null;

    // Secure Test Cycle work keeps its own server-authoritative state machine
    // and never becomes an ordinary attempt, whatever an envelope claims. A
    // cycle's Review is not secure work: it is ingested like any other
    // question, and it is what the Test gate reads (excludedAsSecureWork).
    if (assignment && ingestion.excludedAsSecureWork({
      testCycle: secureAssignmentMode(assignment),
      secure: assignment.secure === true,
      question,
    })) {
      return {
        actionId: envelope.actionId,
        disposition: dispositions.SUBMISSION_DISPOSITION.PERMANENTLY_INVALID,
        reason: "secure-assignment-excluded",
      };
    }
    // The activity this work is judged under: the question's own wherever it
    // carries one, never Classwork by omission (withAuthoritativeActivityRole).
    const activityRole = ingestion.withAuthoritativeActivityRole({ envelope, question })?.activityRole || null;
    const canonicalRecord = gradeData?.gradesByAssignment?.[envelope.assignmentId]?.[String(envelope.questionIndex)]
      ?? gradeData?.gradesByAssignment?.[envelope.assignmentId]?.[envelope.questionIndex]
      ?? null;

    // A per-student extension (the student's private override, read above
    // with the server's authority and merged with any copy still on the
    // shared document) is the same authoritative final cutoff the client and
    // the checkpoint finalizer both read — ingestion must not be the one path
    // that ignores it. Nothing in the envelope can name a later one.
    // The individualized extra-time deadline is derived from the student's
    // pinned profile (functions/shared/supportDeadline.mjs) — same answer the
    // student's dashboard and the checkpoint finalizer give.
    const finalCloseAtMs = assignment ? assignmentFinalCloseAt(assignment, null, studentId, gradeData?.profile || null, { privateOverride }) : null;
    const decision = ingestion.decideSubmissionIngestion({
      envelope,
      assignmentExists: assignmentSnapshot.exists,
      gradeRecordExists: gradeSnapshot.exists,
      authorizedForClass: assignment
        ? studentMatchesAssignmentAudience({ assignment, classId, gradeData, assignmentId: envelope.assignmentId })
        : null,
      // Judged at the moment the student pressed Submit, not at the moment the
      // background queue happened to reach this function.
      assignmentClosedAtCapture: finalCloseAtMs === null
        ? null
        : Number(envelope.capturedAt || now) > Number(finalCloseAtMs),
      liveSectionAccess: assignment
        ? ingestion.resolveLiveSectionAccess({ assignment, activityRole, classId })
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
      // A use a teacher undid is history, not a waiver: Practice is required
      // again and its responses are accepted normally.
      if (rewards.isActivePracticePassRedemption(redemptionSnap.exists ? redemptionSnap.data() : null)) {
        // A proven fact -- Practice is excused for this assignment -- so the
        // outbox may retire this action instead of retrying it forever. (A
        // teacher who later undoes the pass makes Practice required again;
        // the student answers it afresh.) No grade, no evidence, no attempt is ever written for it.
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

    /*
     * A MODELING LAB ATTEMPT IS RECORDED FROM THE SERVER'S OWN EVALUATION.
     *
     * Read here, inside the transaction and before any write, from the marker
     * `submitModelingLab` wrote — by the exact submission the attempt names,
     * or (for an attempt queued by an older client that named none) the
     * newest evaluation of this lab for this student. Identities are checked
     * against the authoritative question, never the envelope.
     */
    let modelingLabMarker = null;
    if (question?.type === "modelingLab") {
      const labGrading = await import("./shared/serverGrading/modelingLabGrading.mjs");
      const labId = labGrading.modelingLabIdFor(question);
      const reference = labGrading.modelingLabSubmissionReference(envelope.response);
      let markers = [];
      if (labId && reference?.submissionId) {
        const markerSnapshot = await transaction.get(db.collection("modelingLabSubmissions").doc(
          mathPath.opaqueId("labsub", studentId, envelope.assignmentId, labId, reference.submissionId),
        ));
        markers = markerSnapshot.exists ? [markerSnapshot.data()] : [];
      } else if (labId) {
        const markerQuery = await transaction.get(db.collection("modelingLabSubmissions")
          .where("studentId", "==", studentId)
          .where("assignmentId", "==", envelope.assignmentId)
          .where("labId", "==", labId)
          .limit(50));
        markers = markerQuery.docs.map((doc) => doc.data());
      }
      modelingLabMarker = labGrading.selectModelingLabMarker({
        markers,
        studentId,
        assignmentId: envelope.assignmentId,
        question,
        reference,
      });
    }

    // Classwork completion and the DOL score count the student's own required
    // items (a reduced-item-count accommodation omits some; see
    // studentOmittedFor). A response to an omitted item is NOT refused: it is
    // accepted like any other, and as answered work it becomes required. An
    // authorized replacement resets its question instead, and is read that way.
    const resetsRecord = ingestion.envelopeResetsRecord({ envelope, canonicalRecord });
    const studentOmitted = await studentOmittedFor({
      assignment,
      gradeData,
      assignmentId,
      answeredIndex: resetsRecord ? null : envelope.questionIndex,
      resetIndex: resetsRecord ? envelope.questionIndex : null,
      nowValue: now,
    });
    const classworkIndices = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, "classwork"), studentOmitted);
    const dolIndices = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, "dol"), studentOmitted);
    const built = ingestion.buildIngestedAttempt({
      envelope,
      assignment,
      question,
      canonicalRecord,
      gradeDocument: gradeData,
      classworkIndices,
      dolIndices,
      modelingLabMarker,
      requireStepWork: serverGradingSettings.requireStepWork === true,
      privateOverride,
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
    if (built.final) {
      // The question is finished (buildIngestedAttempt): no attempt can count,
      // so its record, response evidence, evidence events and checkpoint stay
      // exactly as they are. Only the receipt is written, so the device can
      // retire the delivery.
      transaction.set(receiptRef, {
        studentId,
        actionId: envelope.actionId,
        assignmentId,
        questionIndex: envelope.questionIndex,
        disposition: dispositions.SUBMISSION_DISPOSITION.SUPERSEDED,
        reason: built.reason,
        capturedAt: envelope.capturedAt ? new Date(envelope.capturedAt) : null,
        issuedAt: FieldValue.serverTimestamp(),
      });
      return {
        actionId: envelope.actionId,
        disposition: dispositions.SUBMISSION_DISPOSITION.SUPERSEDED,
        reason: built.reason,
        receiptId: receiptRef.id,
      };
    }

    if (activityRole === "dol" && dolIndices.length) {
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
      // The record here, whole or (by the policy above) as its summary with
      // the detail beside it (responseDetail), one detailRef.
      ...await questionRecordUpdates({
        writer: transaction, gradeRef, studentId, assignmentId,
        questionKey: String(envelope.questionIndex), record: built.record, policy: recordPolicy,
      }),
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

/*
 * ELAPSED TIME ON A QUESTION, RECORDED BY THE SERVER.
 *
 * The student's Next button used to write the whole canonical record back
 * from the browser with a new `timeSpent`. Those records are server-owned now
 * (firestore.rules lets a student's client change only its engagement time),
 * so the reading arrives here as a `questionProgress` envelope and this is
 * its only writer. Identity is the caller's, the class is the roster's, the
 * question must exist on the authoritative assignment, and the write is
 * `questionProgressRecord`: raise `timeSpent`, leave every other field of the
 * record exactly as the server last wrote it. No attempt, no grade, no
 * receipt, no evidence — and so nothing here can be used to move one.
 */
async function recordOneQuestionProgress({ db, studentId, envelope }) {
  const ingestion = await submissionIngestion();
  const gradeRef = db.collection("grades").doc(studentId);
  const assignmentRef = db.collection("assignments").doc(envelope.assignmentId);
  const questionKey = String(envelope.questionIndex);

  return db.runTransaction(async (transaction) => {
    const [assignmentSnapshot, gradeSnapshot] = await Promise.all([
      transaction.get(assignmentRef),
      transaction.get(gradeRef),
    ]);
    const assignment = assignmentSnapshot.exists
      ? { id: assignmentSnapshot.id, ...assignmentSnapshot.data() }
      : null;
    const gradeData = gradeSnapshot.exists ? gradeSnapshot.data() || {} : null;
    const question = assignment ? runtimeQuestionsFromAssignment(assignment)?.[envelope.questionIndex] || null : null;
    const decision = ingestion.decideQuestionProgress({
      envelope,
      assignmentExists: assignmentSnapshot.exists,
      gradeRecordExists: gradeSnapshot.exists,
      // A Test Cycle's Review is ordinary work (excludedAsSecureWork).
      secureAssignment: Boolean(assignment && ingestion.excludedAsSecureWork({
        testCycle: secureAssignmentMode(assignment),
        secure: assignment.secure === true,
        question,
      })),
      authorizedForClass: assignment
        ? studentMatchesAssignmentAudience({ assignment, classId: authoritativeStudentClassId(gradeData), gradeData, assignmentId: assignment.id })
        : null,
      question,
      canonicalRecord: gradeData?.gradesByAssignment?.[envelope.assignmentId]?.[questionKey] ?? null,
    });
    if (decision.record) {
      transaction.update(
        gradeRef,
        new FieldPath("gradesByAssignment", envelope.assignmentId, questionKey),
        decision.record,
      );
    }
    return { actionId: envelope.actionId, disposition: decision.disposition, reason: decision.reason };
  });
}

// Ingestion stops starting new envelopes after this long, well inside the
// callable's 60-second limit (the slowest single step verification measured
// about 3 seconds).
const INGESTION_CALL_BUDGET_MS = 40_000;

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
  // Platform switches for server grading (settings/serverGrading), read once
  // per call. `requireStepWork` retires the legacy Step Algebra step path once
  // queues from clients built before step work existed have drained.
  const serverGradingSettings = (await db.collection("settings").doc("serverGrading").get()).data() || {};
  const receipts = [];
  const hints = {};
  for (const raw of incoming) {
    // A wall-clock budget for the whole call: verifying a crafted step can
    // cost seconds, and a batch of them must not time out the honest work
    // queued beside it. Whatever is not reached is retried on the next call.
    if (Date.now() - now > INGESTION_CALL_BUDGET_MS) {
      receipts.push({
        actionId: String(raw?.actionId || "").slice(0, 200) || null,
        disposition: dispositions.SUBMISSION_DISPOSITION.RETRYABLE,
        reason: "ingestion-call-time-budget",
      });
      continue;
    }
    // Elapsed time is not graded work: it takes its own, narrower path.
    const progress = ingestion.normalizeProgressEnvelope(raw);
    if (progress) {
      progress.studentId = studentId;
      try {
        receipts.push(await recordOneQuestionProgress({ db, studentId, envelope: progress }));
      } catch (error) {
        // `errorMessage`, not `message`: the logger's own message overwrites a
        // `message` field, and the cause (Nov 16, 2026: "too many index entries
        // for entity /grades/…") reached only the device, never the log.
        logger.error("Could not record question progress", {
          studentId, actionId: progress.actionId, errorMessage: error?.message, errorCode: error?.code ?? null,
        });
        receipts.push({
          actionId: progress.actionId,
          disposition: dispositions.SUBMISSION_DISPOSITION.RETRYABLE,
          reason: `ingestion-error:${String(error.message || "unknown").slice(0, 120)}`,
        });
      }
      continue;
    }
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
      receipts.push(await ingestOneSubmission({ db, studentId, envelope, now, serverGradingSettings, hints }));
    } catch (error) {
      logger.error("Could not ingest a student submission", {
        studentId, actionId: envelope.actionId, errorMessage: error?.message, errorCode: error?.code ?? null,
      });
      // A failed write is a retry, never a retirement.
      receipts.push({
        actionId: envelope.actionId,
        disposition: dispositions.SUBMISSION_DISPOSITION.RETRYABLE,
        reason: `ingestion-error:${String(error.message || "unknown").slice(0, 120)}`,
      });
    }
  }
  /*
   * THIS STUDENT'S RECORDS STILL STORED WHOLE MOVE INTO THE SPLIT NOW
   * (functions/lib/gradeDetailStore.js splitInlineRecords): after every receipt
   * above is decided, in its own transaction, best effort. Nothing here can
   * change a receipt or a grade; a failure is logged and retried on the next call.
   */
  if (hints.inlineRecords) {
    try {
      const moved = await splitInlineRecords({ db, studentId, settings: serverGradingSettings });
      if (moved.split || moved.kept) logger.info("Moved a student's records into the split", { studentId, ...moved });
    } catch (error) {
      logger.warn("Could not move a student's records into the split", { studentId, errorMessage: error?.message, errorCode: error?.code ?? null });
    }
  }
  return { receipts, ingestedAt: now };
});

/*
 * PRACTICE-BASED RECOVERY — THE ONLY WRITER OF A STUDENT'S RECOVERY RECORD.
 *
 * Students reach their own Warm-Up/DOL Recovery through this callable:
 * `status` (read), `practice` (one server-graded Practice item for the
 * mastery gate), `unlock`, `start` (freeze a fresh plan) and `submit` (server-
 * graded Recovery). Every rule — who may recover, when, what they are asked,
 * how it is graded and recorded — is the shared, pure service in
 * functions/shared/sectionRecoveryService.mjs; this function only reads the
 * authoritative documents, runs it inside a transaction and writes the result
 * to `grades/{studentId}.sectionRecoveryByAssignment`, a map the Firestore
 * rules pin to the server. A completed Recovery changes the recorded score
 * through the Classroom triggers' existing grade calculation; nothing here
 * writes a grade directly.
 */
let sectionRecoveryServiceModule = null;
async function sectionRecoveryService() {
  if (!sectionRecoveryServiceModule) {
    // The context builder (shared with the student app) and the grading
    // actions (server-only: they load every shared tool grader) are two
    // modules so the browser never downloads the graders it does not run.
    const [service, actions, misconceptionSites] = await Promise.all([
      import("./shared/sectionRecoveryService.mjs"),
      import("./shared/sectionRecoveryActions.mjs"),
      import("./shared/misconceptionEvidenceSites.mjs"),
    ]);
    sectionRecoveryServiceModule = {
      ...service,
      ...actions,
      recoveryMisconceptionEvidenceRecords: misconceptionSites.recoveryMisconceptionEvidenceRecords,
      MISCONCEPTION_EVIDENCE_COLLECTION: misconceptionSites.MISCONCEPTION_EVIDENCE_COLLECTION,
    };
  }
  return sectionRecoveryServiceModule;
}

const RECOVERY_SECTION_KEYS = new Set(["warmup", "dol"]);
const RECOVERY_ACTIONS_WITH_ATTENDANCE = new Set(["status", "unlock", "start"]);
// The actions that deal a Practice item, and so read the student's evidence.
const RECOVERY_ACTIONS_WITH_TARGETING = new Set(["status", "practice"]);
async function readRecoveryMisconceptionRecords(gradeRef, assignmentId, recoveryEvidenceCollection) {
  try {
    const [attemptEvents, recoveryEvidence] = await Promise.all([
      gradeRef.collection("evidenceEvents").where("source.assignmentId", "==", assignmentId)
        .select("source", "performance", "occurredAt").get(),
      gradeRef.collection(recoveryEvidenceCollection).where("source.assignmentId", "==", assignmentId)
        .select("source", "performance", "occurredAt").get(),
    ]);
    return [...attemptEvents.docs, ...recoveryEvidence.docs].map((doc) => doc.data() || {});
  } catch (error) {
    logger.warn("Recovery misconception evidence unavailable; Practice is untargeted", { assignmentId, message: error?.message });
    return null;
  }
}

function serverSectionVariantMode(assignment = {}, role = "") {
  const policy = assignment?.variantPolicy && typeof assignment.variantPolicy === "object" ? assignment.variantPolicy : {};
  const sectionMode = String(policy.sectionModes?.[role] || "").trim().toLowerCase();
  if (["shared", "personalized", "variant", "adaptive"].includes(sectionMode)) return sectionMode;
  const mode = String(policy.mode || "").trim().toLowerCase();
  return ["shared", "personalized", "variant", "adaptive"].includes(mode) ? mode : "personalized";
}

exports.advanceSectionRecovery = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const section = String(request.data?.section || "").trim().toLowerCase();
  const action = String(request.data?.action || "status").trim();
  if (!assignmentId || !RECOVERY_SECTION_KEYS.has(section)) {
    throw new HttpsError("invalid-argument", "A Recovery request needs an assignment and a Warm-Up or DOL section.");
  }
  const service = await sectionRecoveryService();
  if (!Object.values(service.RECOVERY_ACTION).includes(action)) {
    throw new HttpsError("invalid-argument", "Unknown Recovery action.");
  }

  const db = getFirestore();
  const gradeRef = db.collection("grades").doc(studentId);
  const assignmentRef = db.collection("assignments").doc(assignmentId);
  const overrideRef = await studentOverrideRef(db, studentId, assignmentId);

  // Reads that do not need to be transactional: the schedule, the class
  // period and, when the decision needs it, that day's attendance.
  const [scheduleSnapshot, preGrade, preAssignment] = await Promise.all([
    db.collection("settings").doc("classSchedule").get(),
    gradeRef.get(),
    assignmentRef.get(),
  ]);
  if (!preAssignment.exists) throw new HttpsError("not-found", "That assignment is no longer available.");
  const schedule = scheduleSnapshot.exists ? scheduleSnapshot.data() : null;
  const preGradeData = preGrade.exists ? preGrade.data() || {} : {};
  const classId = authoritativeStudentClassId(preGradeData);
  const classPeriod = await resolveCheckpointClassPeriod(db, classId, preGradeData, new Map());
  let supportEvents = null;
  if (RECOVERY_ACTIONS_WITH_ATTENDANCE.has(action)) {
    const deadlines = await import("./shared/sectionDeadline.mjs");
    const preAssignmentData = { id: preAssignment.id, ...preAssignment.data() };
    const dateKey = section === "warmup"
      ? deadlines.resolveWarmupInstructionDateKey({ assignment: preAssignmentData, classId, classPeriod })
      : deadlines.resolveDolInstructionDateKey({ assignment: preAssignmentData, classId, classPeriod });
    if (dateKey) {
      const eventsSnapshot = await db.collection("studentSupportEvents")
        .where("studentId", "==", studentId)
        .where("dateKey", "==", dateKey)
        .get();
      supportEvents = eventsSnapshot.docs.map((doc) => doc.data() || {});
    } else {
      supportEvents = [];
    }
  }

  // Targeted Recovery Practice: the student's own trusted misconception
  // evidence on this assignment (job J). Read outside the transaction; a
  // failed read deals untargeted Practice and never blocks Recovery.
  const misconceptionRecords = RECOVERY_ACTIONS_WITH_TARGETING.has(action)
    ? await readRecoveryMisconceptionRecords(gradeRef, assignmentId, service.MISCONCEPTION_EVIDENCE_COLLECTION)
    : null;

  try {
    return await db.runTransaction(async (transaction) => {
      const [assignmentSnapshot, gradeSnapshot, overrideSnapshot] = await Promise.all([
        transaction.get(assignmentRef),
        transaction.get(gradeRef),
        overrideRef ? transaction.get(overrideRef) : Promise.resolve(null),
      ]);
      if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment is no longer available.");
      if (!gradeSnapshot.exists) throw new HttpsError("failed-precondition", "Your class record is not ready yet.");
      const assignment = { id: assignmentSnapshot.id, ...assignmentSnapshot.data() };
      // The records whole: recovery reads their family pins and practice evidence,
      // stored beside the grades document (gradeEntryStorage.mjs).
      const gradeData = await hydrateGradeData({ transaction, gradeRef, gradeData: gradeSnapshot.data() || {}, assignmentIds: [assignmentId] });
      if (secureAssignmentMode(assignment) || assignment.secure === true) {
        throw new HttpsError("failed-precondition", "Secure assessments use their own retest process.");
      }
      if (!studentMatchesAssignmentAudience({ assignment, classId: authoritativeStudentClassId(gradeData) })) {
        throw new HttpsError("permission-denied", "This assignment is not assigned to your class.");
      }

      const questions = runtimeQuestionsFromAssignment(assignment);
      // The section original is the student's own required items — the same
      // denominator the Classroom passback recovers (see studentOmittedFor).
      const studentOmitted = await studentOmittedFor({ assignment, gradeData, assignmentId });
      const sectionIndices = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, section), studentOmitted);
      const tracker = gradeData.gradesByAssignment?.[assignmentId] || {};
      const overrides = gradeData.teacherGradeOverridesByAssignment?.[assignmentId] || {};
      const original = assignmentGradeProgress(tracker, sectionIndices, questions, overrides);
      const context = service.buildSectionRecoveryContext({
        assignment,
        section,
        sectionEntries: sectionIndices.map((storageIndex) => ({ storageIndex, question: questions[storageIndex] })),
        questions,
        tracker,
        sectionOriginal: { score: original.total ? original.grade : null, attempted: original.attempted, total: original.total },
        record: gradeData.sectionRecoveryByAssignment?.[assignmentId]?.[section] || null,
        studentId,
        classId: authoritativeStudentClassId(gradeData),
        classPeriod,
        schedule,
        supportEvents,
        challengeCredit: gradeData.warmupChallengeByAssignment?.[assignmentId] || null,
        studentProfile: gradeData.profile || null,
        // The Recovery end date is the student's own final cutoff, their
        // private extension included — read above, never from the request.
        privateOverride: privateOverrideFrom(overrideSnapshot),
        misconceptionRecords,
        // A teacher-graded Practice question is not the student's own evidence.
        overrides,
        sectionModeFor: (role) => serverSectionVariantMode(assignment, role),
        nowValue: Date.now(),
      });
      const actedAt = Date.now();
      const outcome = service.runSectionRecoveryAction({
        context,
        action,
        payload: request.data?.payload && typeof request.data.payload === "object" ? request.data.payload : {},
        at: actedAt,
      });
      if (outcome.changed) {
        transaction.update(
          gradeRef,
          new FieldPath("sectionRecoveryByAssignment", assignmentId, section),
          outcome.record,
        );
      }
      // Misconception evidence from items the server legitimately graded —
      // a side effect, written apart from attempt events (so it never moves
      // mastery, Path or a Recovery score) under a key fixed by the item, so
      // a retried transaction writes the same document.
      if (outcome.changed && Array.isArray(outcome.misconceptionEvidence) && outcome.misconceptionEvidence.length) {
        service.recoveryMisconceptionEvidenceRecords({
          entries: outcome.misconceptionEvidence,
          studentId,
          assignmentId,
          section,
          occurredAt: actedAt,
        }).forEach((evidenceRecord) => transaction.set(
          gradeRef.collection(service.MISCONCEPTION_EVIDENCE_COLLECTION).doc(evidenceRecord.eventKey),
          evidenceRecord,
        ));
      }
      return {
        action,
        section,
        state: context.eligibility.state,
        reason: context.eligibility.reason,
        record: outcome.record,
        ...outcome.response,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error?.name === "RecoveryTransitionError") {
      throw new HttpsError("failed-precondition", error.message || error.code, { code: error.code });
    }
    logger.error("Section recovery action failed", { studentId, assignmentId, section, action, message: error?.message });
    throw new HttpsError("internal", "Recovery could not be updated. Your work is still saved; try again.");
  }
});

/*
 * A TEACHER RESOLVES A HELD PRACTICE-BASED RECOVERY.
 *
 * A Recovery is HELD when MathMaster could not grade enough of it to score it
 * (functions/shared/sectionRecoveryEvidence.mjs): no Recovery score exists,
 * the original stands, and neither Classroom passback nor Grade Transfer
 * treats the grade as settled. Only this student's teacher of record (or a
 * root admin) may release it, in one of three ways
 * (functions/shared/sectionRecoveryResolution.mjs):
 *
 *   finalizeGraded     score it over the questions MathMaster could grade
 *   keepOriginal       record no Recovery score; the original stands
 *   issueReplacement   a NEW question for each one MathMaster could not
 *                      grade, built HERE from the student's own seat — never
 *                      one a browser chose (PR #430) — the old pin and result
 *                      kept exactly as they were
 *
 * None of them counts a question MathMaster could not grade against the
 * student. Each is appended to the record's history and written to
 * gradeOverrideAudits, and signals the Classroom triggers to re-run.
 */
exports.resolveHeldSectionRecovery = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  const studentId = String(request.data?.studentId || "").trim();
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const section = String(request.data?.section || "").trim().toLowerCase();
  const action = String(request.data?.action || "").trim();
  const note = String(request.data?.note || "").trim().slice(0, 500);
  if (!studentId || !assignmentId || !RECOVERY_SECTION_KEYS.has(section)) {
    throw new HttpsError("invalid-argument", "A student, an assignment and a Warm-Up or DOL section are required.");
  }
  if (!teacherEmail) throw new HttpsError("permission-denied", "A verified teacher email is required.");
  const [service, resolution, recoveryPlan] = await Promise.all([
    sectionRecoveryService(),
    import("./shared/sectionRecoveryResolution.mjs"),
    import("./shared/sectionRecoveryPlan.mjs"),
  ]);
  if (!resolution.isHeldRecoveryAction(action)) {
    throw new HttpsError("invalid-argument", "Choose how to resolve this Recovery.");
  }

  const db = getFirestore();
  const gradeRef = db.collection("grades").doc(studentId);
  const assignmentRef = db.collection("assignments").doc(assignmentId);
  const overrideRef = await studentOverrideRef(db, studentId, assignmentId);
  const [scheduleSnapshot, preGrade] = await Promise.all([
    db.collection("settings").doc("classSchedule").get(),
    gradeRef.get(),
  ]);
  const schedule = scheduleSnapshot.exists ? scheduleSnapshot.data() : null;
  const preGradeData = preGrade.exists ? preGrade.data() || {} : {};
  const classPeriod = await resolveCheckpointClassPeriod(db, authoritativeStudentClassId(preGradeData), preGradeData, new Map());
  const nowIso = new Date().toISOString();

  try {
    return await db.runTransaction(async (transaction) => {
      const [gradeSnap, assignmentSnap, overrideSnapshot] = await Promise.all([
        transaction.get(gradeRef),
        transaction.get(assignmentRef),
        overrideRef ? transaction.get(overrideRef) : Promise.resolve(null),
      ]);
      if (!gradeSnap.exists || !assignmentSnap.exists) throw new HttpsError("not-found", "The student or assignment was not found.");
      // The records whole (stored beside the grades document; gradeEntryStorage.mjs).
      const gradeData = await hydrateGradeData({ transaction, gradeRef, gradeData: gradeSnap.data() || {}, assignmentIds: [assignmentId] });
      const classId = authoritativeStudentClassId(gradeData);
      const classSnap = classId ? await transaction.get(db.collection("classes").doc(String(classId))) : null;
      const ownsClass = classSnap?.exists
        && String(classSnap.data()?.teacherOfRecord || "").trim().toLowerCase() === teacherEmail;
      if (!authLib.isRootAdminEmail(teacherEmail) && !ownsClass) {
        throw new HttpsError("permission-denied", "Only this student's teacher of record may resolve this Recovery.");
      }
      const assignment = { id: assignmentSnap.id, ...assignmentSnap.data() };
      if (!authLib.isRootAdminEmail(teacherEmail) && !studentMatchesAssignmentAudience({ assignment, classId })) {
        throw new HttpsError("permission-denied", "This assignment is not assigned to the student's current class.");
      }
      const stored = gradeData.sectionRecoveryByAssignment?.[assignmentId]?.[section] || null;
      // The one gate (sectionRecoveryResolution.mjs heldRecoveryActionsFor): a
      // held Recovery, or one completed under the old rule with a platform
      // failure scored as 0; and only the resolutions that record allows.
      const allowed = resolution.heldRecoveryActionsFor(stored, section);
      if (!allowed.length) {
        throw new HttpsError("failed-precondition", "This Recovery is not waiting for a teacher.");
      }
      if (!allowed.includes(action)) {
        throw new HttpsError(
          "failed-precondition",
          action === resolution.HELD_RECOVERY_ACTION.ISSUE_REPLACEMENT
            ? "A replacement question is already waiting for this student, or there is nothing left to replace."
            : "That is not available for this Recovery.",
          { code: "recovery-resolution-unavailable" },
        );
      }

      // The same inputs advanceSectionRecovery decides with: the student's own
      // required items (reduced-item-count accommodation), the original after
      // teacher corrections, their seat, their final cutoff.
      const questions = runtimeQuestionsFromAssignment(assignment);
      const studentOmitted = await studentOmittedFor({ assignment, gradeData, assignmentId });
      const sectionIndices = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, section), studentOmitted);
      const tracker = gradeData.gradesByAssignment?.[assignmentId] || {};
      const overrides = gradeData.teacherGradeOverridesByAssignment?.[assignmentId] || {};
      const original = assignmentGradeProgress(tracker, sectionIndices, questions, overrides);
      const context = service.buildSectionRecoveryContext({
        assignment,
        section,
        sectionEntries: sectionIndices.map((storageIndex) => ({ storageIndex, question: questions[storageIndex] })),
        questions,
        tracker,
        sectionOriginal: { score: original.total ? original.grade : null, attempted: original.attempted, total: original.total },
        record: stored,
        studentId,
        classId,
        classPeriod,
        schedule,
        supportEvents: null,
        challengeCredit: gradeData.warmupChallengeByAssignment?.[assignmentId] || null,
        studentProfile: gradeData.profile || null,
        privateOverride: privateOverrideFrom(overrideSnapshot),
        overrides,
        sectionModeFor: (role) => serverSectionVariantMode(assignment, role),
        nowValue: Date.now(),
      });
      const actor = { uid: teacherUid, email: teacherEmail, name: request.auth?.token?.name || null };

      let replacements = null;
      if (action === resolution.HELD_RECOVERY_ACTION.ISSUE_REPLACEMENT) {
        if (context.opportunity?.recoveryWindowEnded) {
          throw new HttpsError(
            "failed-precondition",
            "This student's final submission date has passed, so they could not answer a replacement question. Extend their date first, finalize from the graded questions, or keep the original score.",
            { code: "recovery-window-ended" },
          );
        }
        const built = recoveryPlan.buildRecoveryReplacementItems({
          assignmentId,
          section,
          record: context.record,
          itemIds: resolution.heldRecoveryItemIds(context.record),
          questionsByIndex: context.questionsByIndex,
          seatInfo: context.seatInfo,
          seenFingerprints: context.seenFingerprints,
          issuedAt: nowIso,
          issueReasonFor: (itemId) => context.record.results?.[itemId]?.classification || null,
        });
        if (built.error) {
          throw new HttpsError(
            "failed-precondition",
            "MathMaster cannot make a replacement for this question until the question itself is fixed. Fix it in the assignment, finalize from the graded questions, or keep the original score.",
            { code: built.error, itemId: built.itemId || null, classification: built.classification || null },
          );
        }
        replacements = built.items;
      }

      const applied = resolution.applyHeldRecoveryResolution({
        record: context.record,
        section,
        action,
        actor,
        note,
        replacements,
        policy: context.policy,
        originalScore: context.sectionOriginal?.score ?? null,
        originalAttempted: Number(context.sectionOriginal?.attempted) > 0,
        at: Date.now(),
      });
      transaction.update(
        gradeRef,
        new FieldPath("sectionRecoveryByAssignment", assignmentId, section),
        applied.record,
        new FieldPath("classroomReleaseSignals", assignmentId),
        { requestedAt: nowIso, reason: "manual-retry", source: "teacher-recovery-resolution" },
      );
      transaction.set(gradeRef.collection("gradeOverrideAudits").doc(), {
        scope: "sectionRecovery",
        sectionRole: section,
        assignmentId,
        questionIndex: null,
        action,
        note: note || null,
        actor,
        at: nowIso,
        // A correction of a Recovery completed under the old rule, or the
        // resolution of a hold.
        kind: resolution.recoveryNeedsLegacyCorrection(stored, section) ? "legacyCorrection" : "heldResolution",
        holdReason: stored.hold?.reason || null,
        heldItemIds: Array.isArray(stored.hold?.itemIds) ? stored.hold.itemIds.slice(0, 20) : [],
        statusAfter: applied.record.status,
        rawScoreAfter: applied.record.rawScore ?? null,
        recordedScoreAfter: applied.gradeState?.recordedScore ?? null,
        replacements: (replacements || []).map((item) => ({ from: item.replaces, to: item.itemId })),
      });
      return {
        status: applied.record.status,
        rawScore: applied.record.rawScore ?? null,
        recordedScore: applied.gradeState?.recordedScore ?? null,
        replacements: (replacements || []).map((item) => ({ from: item.replaces, to: item.itemId })),
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error?.name === "RecoveryTransitionError") {
      throw new HttpsError("failed-precondition", error.message || error.code, { code: error.code });
    }
    logger.error("Held Recovery resolution failed", { studentId, assignmentId, section, action, message: error?.message });
    throw new HttpsError("internal", "The Recovery could not be updated. Nothing was changed; try again.");
  }
});
const ASSIGNMENT_ZERO_REASONS = Object.freeze({
  cellPhoneUse: "Prohibited cellphone use",
  academicDishonesty: "Unauthorized assistance / cheating",
  accountSwitching: "Account or laptop switching",
});
const INTEGRITY_PARTICIPANT_ROLES = new Set(["individual", "received", "supplied"]);
const SECTION_INTEGRITY_KEY_PREFIX = "__sectionIntegrity_";

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

  // The inspected record whole: its parts and pin are stored beside the grades document.
  const student = await hydrateGradeData({ db, gradeRef, gradeData: studentSnap.data() || {}, assignmentIds: [assignmentId] });
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
  const identity = await studentIdentity();
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
    questionIndex,
    section,
    // The real name or null — never the id. The inspector labels a missing
    // name explicitly and shows the id separately.
    student: {
      id: studentId,
      classId: student.classId || null,
      displayName: identity.studentNameForStorage(studentIdentityRecord(identity, studentId, student)),
    },
    record,
    workspace,
    override,
    gradingEvidence,
    auditHistory,
  });
});

// Review My Work (student, read-only): the caller's OWN answers beside the
// worked solutions once the assignment is closed for them and feedback is
// released. Every gate and projection is in functions/lib/reviewMyWork.js.
exports.loadMyReviewWork = onCall((request) => require("./lib/reviewMyWork").loadMyReviewWorkHandler({
  db: getFirestore(), auth: requireStudent(request), data: request.data, now: Date.now(),
}));

/**
 * Student Case Review (teacher, read-only): the records a case review needs
 * that no teacher browser may read under firestore.rules — one event per
 * graded attempt, submission receipts (including answers refused after the
 * assignment closed), Practice Mode question records and teacher grade-change
 * audits — for ONE student and the assignments the teacher selected.
 *
 * Authorization and every projection live in
 * functions/shared/caseReviewEvidence.mjs (tested in
 * tests/platform/caseReviewEvidenceProjection.test.mjs): the root
 * administrator, the student's class teacher of record, or their roster
 * teacher. Nothing is written, and nothing leaves that the case review does not
 * show: no response text, no answer key, no draft contents, no other student.
 * See docs/STUDENT_CASE_REVIEW_DESIGN.md §5.2.
 */
exports.loadStudentCaseEvidence = onCall(async (request) => {
  await requireTeacher(request);
  const caseEvidence = await import("./shared/caseReviewEvidence.mjs");
  const validation = caseEvidence.validateCaseEvidenceRequest(request.data || {});
  if (!validation.ok) throw new HttpsError("invalid-argument", validation.errors.join(" "));
  const { studentId, assignmentIds } = validation.request;
  const teacherEmail = callerEmail(request);

  const db = getFirestore();
  const gradeRef = db.collection("grades").doc(studentId);
  const studentSnap = await gradeRef.get();
  const student = studentSnap.exists ? studentSnap.data() || {} : null;
  const classSnap = student?.classId
    ? await db.collection(CLASS_COLLECTION).doc(String(student.classId)).get()
    : null;
  const decision = caseEvidence.authorizeCaseEvidenceCaller({
    callerEmail: teacherEmail,
    callerRole: request.auth?.token?.role,
    isRootAdmin: authLib.isRootAdminEmail(teacherEmail),
    student,
    classRecord: classSnap?.exists ? classSnap.data() || {} : null,
  });
  if (!decision.allowed) {
    throw new HttpsError(
      decision.reason === "student-not-found" ? "not-found" : "permission-denied",
      "Only this student's teacher may load case review evidence.",
    );
  }

  const { workspaceDraftDocumentId } = await import("./shared/workspaceDraftSchema.mjs");
  const limits = caseEvidence.CASE_EVIDENCE_LIMITS;
  const chunks = caseEvidence.chunk(assignmentIds);
  const draftRefs = assignmentIds.map((assignmentId) => db
    .collection(WORKSPACE_DRAFT_COLLECTION)
    .doc(workspaceDraftDocumentId({ studentId, assignmentId })));
  const [eventSnapshots, receiptSnapshots, draftSnapshots, auditSnapshot, misconceptionSnapshots] = await Promise.all([
    // By assignment (single-field indexes only), so My Math Path and Live
    // Challenge events never crowd out the assignments asked about.
    Promise.all(chunks.map((ids) => gradeRef.collection("evidenceEvents")
      .where("source.assignmentId", "in", ids)
      .limit(Math.ceil(limits.maxEvents / chunks.length))
      .get())),
    Promise.all(chunks.map((ids) => db.collection(SUBMISSION_RECEIPT_COLLECTION)
      .where("studentId", "==", studentId)
      .where("assignmentId", "in", ids)
      .limit(limits.maxReceiptsPerChunk)
      .get())),
    // Only the Practice Mode fields: a draft's saved work is never read here.
    db.getAll(...draftRefs, { fieldMask: ["practice", "practiceUpdatedAt", "updatedAt"] }),
    gradeRef.collection("gradeOverrideAudits").limit(limits.maxAudits).get(),
    // Recovery and Recovery Practice misconception evidence (server-only).
    Promise.all(chunks.map((ids) => gradeRef.collection("misconceptionEvidence")
      .where("source.assignmentId", "in", ids)
      .limit(Math.ceil(limits.maxMisconceptionRecords / chunks.length))
      .get())),
  ]);

  const drafts = {};
  draftSnapshots.forEach((snapshot, index) => {
    if (snapshot.exists) drafts[assignmentIds[index]] = snapshot.data() || {};
  });
  const response = caseEvidence.buildCaseEvidenceResponse({
    request: validation.request,
    events: eventSnapshots.flatMap((snapshot) => snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() || {} }))),
    receipts: receiptSnapshots.flatMap((snapshot) => snapshot.docs.map((entry) => entry.data() || {})),
    drafts,
    audits: auditSnapshot.docs.map((entry) => entry.data() || {}),
    misconceptionRecords: misconceptionSnapshots.flatMap((snapshot) => snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() || {} }))),
    nowMs: Date.now(),
  });
  response.truncated.events = eventSnapshots.some((snapshot) => snapshot.size >= Math.ceil(limits.maxEvents / chunks.length));
  response.truncated.receipts = receiptSnapshots.some((snapshot) => snapshot.size >= limits.maxReceiptsPerChunk);
  // Per chunk, like the two above: each chunk is read with its share of the cap,
  // so a busy chunk can be cut off while the total is under it (TT05).
  response.truncated.misconceptionEvidence = response.truncated.misconceptionEvidence
    || caseEvidence.anyChunkAtItsShare({
      sizes: misconceptionSnapshots.map((snapshot) => snapshot.size),
      cap: limits.maxMisconceptionRecords,
      chunks: chunks.length,
    });
  return response;
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

    // The record whole (its parts and pin are stored beside the grades document).
    const gradeData = await hydrateGradeData({ transaction, gradeRef, gradeData: gradeSnap.data() || {}, assignmentIds: [assignmentId] });
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
            // A Question Family attempt is replayed against the instance its
            // validated delivery pin rebuilds, never the template.
            assignment,
            questionIndex,
            studentId,
            classId: gradeData.classId || null,
          });
          if (!replay.available) throw new Error(replay.reason);
          // It raises the score the student stands on, or changes nothing
          // (the owner, 2026-11-19; responseInspector.mjs correctedGradeFromReplay).
          const corrected = inspector.correctedGradeFromReplay({
            replayScore: replay.currentScore,
            standingScore: inspector.effectiveQuestionScore(record, previousOverride),
            // A section's academic-integrity zero is never lifted by a replay.
            sectionZero: inspector.sectionZeroHolds(previousOverride),
          });
          if (!corrected.apply) throw new Error(corrected.reason);
          score = corrected.score;
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

    // The corrected classwork rule and DOL score count the student's own
    // required items (see studentOmittedFor). The corrected question was
    // answered, and answered work is always required.
    const studentOmitted = await studentOmittedFor({ assignment, gradeData, assignmentId });
    const classworkIndices = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, "classwork"), studentOmitted);
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

    const dolIndices = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, "dol"), studentOmitted);
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
  const identity = await studentIdentity();
  const integrityPrivacy = await import("./shared/integrityOverridePrivacy.mjs");

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
    // The grade doc is the student's own to read, so it gets the consequence
    // and its fixed reason only. The teacher's note, who acted and the
    // participant role go on the incident (teacher-only) and the audit —
    // functions/shared/integrityOverridePrivacy.mjs.
    const { studentOverride, incidentDetails } = integrityPrivacy.splitIntegrityConsequence({
      scope, reasonCode, reasonLabel: ASSIGNMENT_ZERO_REASONS[reasonCode], sectionRole: scope === "section" ? sectionRole : null,
      participantRole, note, actor, incidentId: incidentRef.id, at: nowIso,
    });

    if (scope === "section") {
      const included = runtimeIncludedQuestionIndicesForSection(assignment, sectionRole);
      if (!included.length) throw new HttpsError("invalid-argument", "Choose a section that contains graded questions.");
      const stateKey = `${SECTION_INTEGRITY_KEY_PREFIX}${sectionRole}`;
      if (action === "issueZero") {
        if (assignmentOverrides[stateKey]?.active === true) throw new HttpsError("already-exists", "This section already has an integrity consequence.");
        const previousOverridesByQuestion = Object.fromEntries(included.map((index) => [String(index), assignmentOverrides[String(index)] || null]));
        assignmentOverrides[stateKey] = { active: true, incidentId: incidentRef.id, sectionRole, previousOverridesByQuestion };
        included.forEach((index) => { assignmentOverrides[String(index)] = { ...studentOverride }; });
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
      nextOverride = action === "issueZero" ? studentOverride : null;
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
      // studentName is the real name or null — never the id. Teacher screens
      // resolve a null name by studentId against the roster at display time.
      const commonEvent = { schemaVersion: 1, studentId,
        studentName: identity.studentNameForStorage(studentIdentityRecord(identity, studentId, gradeData)),
        classId: gradeData.classId || null, assignmentId, assignmentTitle: assignment.title || null,
        originClassId: gradeData.classId || null, originTeacherEmail: teacherEmail,
        createdByEmail: teacherEmail, authorizedTeacherEmails: [teacherEmail], createdAt: nowIso, createdAtServer: FieldValue.serverTimestamp(),
        source: "teacher", confidence: "confirmed", relatedEventId: incidentRef.id };
      transaction.set(incidentRef, { ...commonEvent, kind: "academicIntegrityIncident", stage: "teacherConfirmed",
        signalKey: `academicIntegrityIncident:${incidentRef.id}`, summary: ASSIGNMENT_ZERO_REASONS[reasonCode], note: incidentDetails.note,
        actor: incidentDetails.actor,
        evidence: { scope, sectionRole: scope === "section" ? sectionRole : null, incidentReason: reasonCode, participantRole: incidentDetails.participantRole } });
      transaction.set(parentFollowUpRef, { ...commonEvent, kind: "parentFollowUp", stage: "teacherConfirmed",
        signalKey: `parentFollowUp:${parentFollowUpRef.id}`, summary: "Parent follow-up for confirmed academic-integrity incident", note: "",
        evidence: { incidentId: incidentRef.id, scope, sectionRole: scope === "section" ? sectionRole : null } });
    }
    return { override: nextOverride, incidentId: action === "issueZero" ? incidentRef.id : null };
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

  const privacy = await import("./shared/assignmentPrivacy.mjs");
  const overrides = await studentOverrides();
  const { zonedDateKey } = await import("./shared/instructionalCalendar.mjs");
  const { SCHOOL_TIME_ZONE } = await import("./shared/sectionDeadline.mjs");
  const overrideRef = await studentOverrideRef(db, studentId, assignmentId);

  return db.runTransaction(async (transaction) => {
    const [gradeSnap, classSnap, assignmentSnap, overrideSnap, storageMode] = await Promise.all([
      transaction.get(gradeRef),
      transaction.get(classRef),
      transaction.get(assignmentRef),
      transaction.get(overrideRef),
      overrideStorageMode(db, transaction),
    ]);
    const studentRecord = gradeSnap.exists ? gradeSnap.data() : null;
    const classRecord = classSnap.exists ? { classId: classSnap.id, ...classSnap.data() } : null;
    const assignment = assignmentSnap.exists ? { id: assignmentSnap.id, ...assignmentSnap.data() } : null;
    const existingPrivate = privateOverrideFrom(overrideSnap);

    const { authorizeAttendanceExtensionActor, validateProposedFinalCutoff } =
      await import("./shared/attendanceExtensionAuthorization.mjs");
    const authorization = authorizeAttendanceExtensionActor({
      isRootAdmin, teacherEmail, classRecord, studentRecord, assignment, requestedClassId: classId,
    });
    if (!authorization.authorized) throw new HttpsError(authorization.reason, authorization.message);

    // Read fresh, inside this transaction — never trust a snapshot the
    // caller's browser might have held onto while another change landed.
    const { assignmentFinalCloseAt } = await import("./shared/sectionDeadline.mjs");
    // What is on file for this student is their private record merged with any
    // copy still on the shared document — the same answer every deadline
    // reader gives — so "never shorten" compares against the real cutoff.
    const currentEffectiveCutoffMs = assignmentFinalCloseAt(assignment, null, studentId, null, { privateOverride: existingPrivate });
    const validity = validateProposedFinalCutoff({ proposedLateDueAtMs, currentEffectiveCutoffMs });
    // `allowShorten` bypasses only the expected monotonicity precondition.
    // It can never turn NaN, infinity, or another malformed cutoff into a
    // valid Date (which would otherwise throw after authorization).
    const reviewedShortening = allowShorten && validity.reason === "failed-precondition";
    if (!validity.valid && !reviewedShortening) throw new HttpsError(validity.reason, validity.message);

    const lateDueAtIso = new Date(proposedLateDueAtMs).toISOString();
    const grantedAtMs = Date.now();
    /*
     * THE STUDENT'S RECORD GETS THE DEADLINE; THE STAFF HISTORY GETS THE WHY.
     *
     * The cutoff and the stub attendance reconciliation compares (the
     * cutoff's date key and grant time) go into the student's private
     * override — studentAssignmentOverrides.mjs — readable by them, their
     * teacher and the root administrator only. While previous-release clients
     * may still read the shared assignment (the storage switch is off), the
     * same two values are mirrored onto it exactly as before; once it is
     * retired, this student's shared copy is deleted instead. The absences,
     * meeting counts and granting teacher stay in the immutable private grant
     * record under the student (shared/assignmentPrivacy.mjs), one per grant.
     *
     * The stub's date key must never be empty — reconciliation treats a
     * missing one as "nothing granted yet" and would grant again — so a
     * browser that sent none gets the school-calendar date of the cutoff.
     */
    const details = privacy.sanitizeExtensionDetails(extension);
    const dateKey = details.dateKey || zonedDateKey(proposedLateDueAtMs, SCHOOL_TIME_ZONE);
    const plan = overrides.planStudentOverrideChange({
      assignmentId,
      assignment,
      studentId,
      existingPrivate,
      change: {
        kind: overrides.OVERRIDE_CHANGE.ATTENDANCE_EXTENSION,
        lateDueAt: lateDueAtIso,
        dateKey,
        grantedAtMs,
        reason: reviewedShortening ? "attendance-correction-shortened" : "attendance-extension",
      },
      authorization: overrides.overrideAuthorizationContext({ existing: existingPrivate, studentId, classRecord, student: studentRecord }),
      actor: { email: teacherEmail, uid: request.auth?.uid || null, role: isRootAdmin ? "rootAdmin" : "teacher" },
      nowMs: grantedAtMs,
      storageMode,
    });
    transaction.set(overrideRef, { ...plan.record, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(await studentOverrideEventRef(db, studentId, plan.eventId), { ...plan.event, at: FieldValue.serverTimestamp() });
    applySharedCopyWrites(transaction, assignmentRef, plan.sharedWrites);
    transaction.set(gradeRef.collection(privacy.ATTENDANCE_EXTENSION_GRANTS_COLLECTION).doc(), {
      ...privacy.buildExtensionGrantRecord({
        studentId,
        classId,
        assignmentId,
        details: { ...details, dateKey },
        lateDueAt: lateDueAtIso,
        previousCutoffMs: currentEffectiveCutoffMs,
        grantedByEmail: teacherEmail,
        teacherOfRecordEmail: classRecord?.teacherOfRecord || studentRecord?.assignedTeacherEmail || null,
        grantedAtMs,
        shortenedAfterReview: reviewedShortening,
      }),
      grantedAt: FieldValue.serverTimestamp(),
    });

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
  if (!studentMatchesAssignmentAudience({ assignment, classId, gradeData, assignmentId: assignment.id })) {
    return { reconciled: false, reason: "assignment-not-assigned-to-class", classworkGrade: null };
  }
  if (secureAssignmentMode(assignment) || assignment.secure === true) {
    // A Test Cycle has no classwork completion projection to refresh.
    return { reconciled: false, reason: "secure-assignment", classworkGrade: null };
  }

  const { classworkGradeProjection, evaluateClassworkCompletionRule } = await import("./shared/assignmentProjections.mjs");
  // The student's own required classwork (a reduced-item-count accommodation
  // omits some; see studentOmittedFor) — what ingestion would have counted.
  const studentOmitted = await studentOmittedFor({ assignment, gradeData, assignmentId });
  const completion = evaluateClassworkCompletionRule({
    classworkIndices: studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, "classwork"), studentOmitted),
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
  // Whether records are written split (splitGradeRecords), read once per sweep.
  const serverGradingSettings = (await db.collection("settings").doc("serverGrading").get()).data() || {};
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
          const outcome = await finalizeOneResponseCheckpoint({
            db, ref: snapshot.ref, schedule, classPeriodCache, now, serverGradingSettings,
          });
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
  const identity = await studentIdentity();

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

  const overrideRef = await studentOverrideRef(db, studentId, assignmentId);
  const [checkpointSnapshot, receiptSnapshot, deviceDocuments, sessionSnapshot, resolutionSnapshot, overrideSnapshot] = await Promise.all([
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
    overrideRef ? overrideRef.get() : Promise.resolve(null),
  ]);
  const privateOverride = privateOverrideFrom(overrideSnapshot);
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
        studentProfile: gradeData?.profile || null,
        privateOverride,
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
    // The real name or null — never the id; the report resolves a null name
    // against the teacher's roster by studentId.
    studentName: identity.studentNameForStorage(studentIdentityRecord(identity, studentId, gradeData))?.slice(0, 180) || null,
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
  const identity = await studentIdentity();

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
    // eslint-disable-next-line no-await-in-loop
    const overrideRef = await studentOverrideRef(db, studentId, assignmentId);
    // eslint-disable-next-line no-await-in-loop
    const privateOverride = privateOverrideFrom(overrideRef ? await overrideRef.get() : null);

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
        studentProfile: gradeData?.profile || null,
        privateOverride,
      }).closesAtMs,
    });

    assessment.recoverable.forEach((entry) => {
      const question = questions[Number(entry.questionIndex)] || null;
      const proposal = {
        studentId,
        // Real name or null — never the id (resolved by studentId on screen).
        studentName: identity.studentNameForStorage(studentIdentityRecord(identity, studentId, gradeData))?.slice(0, 180) || null,
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

  // The gradebook needs only "which students have Practice excused"; it asks
  // for that alone rather than every transfer snapshot of the class.
  const practicePassesOnly = request.data?.practicePassesOnly === true;
  const [snapshotGroups, redemptionGroups] = await Promise.all([
    practicePassesOnly
      ? Promise.resolve([])
      : Promise.all(classIds.map((classId) => db.collection("gradeTransferSnapshots").where("classId", "==", classId).get())),
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
