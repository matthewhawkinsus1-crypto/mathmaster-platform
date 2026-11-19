// AUTHORING: AI authoring and repair, content versions and upgrades, the assignment lifecycle.
//
// One of the domain modules functions/index.js loads (see its header). The
// code here was moved from index.js as it stood; helpers that another domain
// also uses are in functionsCommon.js.

const crypto = require("crypto");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { ASSIGNMENT_AI_SECRETS, readOpenAiApiKey, readPublicEnv } = require("./lib/config");
const authLib = require("./lib/auth");
const secureExam = require("./lib/secureExam");
// The Test Cycle rules are shared ESM; this is the CommonJS bridge to them.
const testCycleLib = require("./lib/testCycle");
const assignmentAi = require("./lib/assignmentAi");
const fullAssignmentRepair = require("./lib/fullAssignmentRepair");
const assignmentContentVersion = require("./lib/assignmentContentVersion");
const assignmentContentTrackerMigration = require("./lib/assignmentContentTrackerMigration");
const teacherQuestionRepair = require("./lib/teacherQuestionRepair");
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
const { gradeEntryStorage, splitPolicy, writeSplitTracker, hydrateTrackerRows } = require("./lib/gradeDetailStore");
const {
  CLASS_COLLECTION,
  TEST_CYCLE_ANSWER_RELEASES,
  TEST_CYCLE_CORRECTION_PLANS,
  TEST_CYCLE_OPERATIONS,
  TEST_CYCLE_PANEL_OPTIONS,
  TEST_CYCLE_RECORDS,
  TEST_CYCLE_RETEST_PLANS,
  assertTeacherMayManageAssignmentLifecycle,
  assignmentAudience,
  assignmentForTeacherCall,
  callerEmail,
  loadClasses,
  requireRootAdmin,
  requireTeacher,
  toDate,
} = require("./functionsCommon");

/*
 * THE CLASS SITTINGS RECORDED FOR ONE ASSIGNMENT, AS REFERENCES ONLY (TC04).
 *
 * For deleting them with the assignment (manageAssignmentLifecycle), which is
 * the only reason to find them this way. `select()` reads no field, and nothing
 * decides anything from this: the teacher's panel and `countClassSitting` read
 * one sitting by its id.
 */
async function classSittingRefsOf(db, assignmentId) {
  const shared = await testCycleLib.shared();
  const snapshot = await db.collection(shared.schedule.TEST_CYCLE_CLASS_SITTINGS)
    .where("assignmentId", "==", String(assignmentId)).select().get();
  return snapshot.docs.map((sittingSnapshot) => sittingSnapshot.ref);
}


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
  return hydrateTrackerRows(contentUpgradeTrackerRows(snapshots, assignmentId), assignmentId, { db });
}

async function loadSavedAssignmentTrackersInTransaction(transaction, db, assignmentId, assignment) {
  const snapshots = [];
  for (const queryRef of contentUpgradeGradeQueries(db, assignment)) {
    // Keep all transaction reads before writes and avoid reading the entire school roster.
    // eslint-disable-next-line no-await-in-loop
    snapshots.push(await transaction.get(queryRef));
  }
  return hydrateTrackerRows(contentUpgradeTrackerRows(snapshots, assignmentId), assignmentId, { db, transaction });
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

function contentUpgradePreviewPayload(plan, affectedStudentCount, recovery = null) {
  return {
    // The Recovery each proposed binding would add, certified against the
    // live questions (recoveryContentUpgrade.certifyRecoveryProposals).
    recovery: recovery ? recovery.results : [],
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
        counts: { unchanged: 0, safeResponseControl: 0, graphViewportRepair: 0, gradingExpansion: 0, clarificationOnly: 0, recoveryCapability: 0, fundamental: 0 },
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
    const recovery = Object.keys(plan.recoveryProposals || {}).length
      ? (await recoveryUpgradeLibrary()).certifyRecoveryProposals({
        assignment: liveAssignment,
        proposals: plan.recoveryProposals,
        gradeSample: (await recoveryUpgradeLibrary()).serverRecoveryKeyCheck,
        at: new Date().toISOString(),
      })
      : null;
    return contentUpgradePreviewPayload(plan, trackers.length, recovery);
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
          counts: { unchanged: 0, safeResponseControl: 0, graphViewportRepair: 0, gradingExpansion: 0, clarificationOnly: 0, recoveryCapability: 0, fundamental: 0 },
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
      // Recovery the upgrade adds without changing a question: certified
      // against the questions as this upgrade leaves them, stored beside them.
      let recoveryUpdate = null;
      if (Object.keys(upgraded.recoveryProposals || {}).length) {
        const recoveryLibrary = await recoveryUpgradeLibrary();
        const certified = recoveryLibrary.certifyRecoveryProposals({
          assignment: upgraded.assignment,
          proposals: upgraded.recoveryProposals,
          gradeSample: recoveryLibrary.serverRecoveryKeyCheck,
          at: correctedAt,
        });
        const content = await import("./shared/recoveryContent.mjs");
        const applied = content.applyRecoveryBindings({
          content: liveAssignment.recoveryContent || null,
          bindings: certified.bindings,
          at: correctedAt,
          actorUid: request.auth.uid,
          source: content.RECOVERY_BINDING_ORIGIN.UPGRADE,
          planHash: plan.planHash,
        });
        if (applied.changed) recoveryUpdate = { content: applied.content, added: applied.added, replaced: applied.replaced };
      }
      let migratedStudents = 0;
      let gradeReconciliationRequested = false;

      // A regrade is marked by the server's own grader (GR07).
      const serverGrading = await assignmentContentTrackerMigration.loadServerGrading();
      const migratedRows = trackerDocs.map((gradeRow) => {
        const migration = assignmentContentTrackerMigration.migrateTrackerForContentUpgrade({
          tracker: gradeRow.tracker,
          plan,
          correctedAt,
          serverGrading,
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
        ...(recoveryUpdate ? { recoveryContent: recoveryUpdate.content } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const storage = await gradeEntryStorage();
      // Split only with settings/serverGrading.splitGradeRecords on; until then
      // a record already stored split stays split and the rest stay whole.
      const recordPolicy = await splitPolicy({
        settings: (await db.collection("settings").doc("serverGrading").get()).data() || {},
      });
      migratedRows.forEach(({ gradeRow, migration }) => {
        if (!migration.changed) return;
        // Records on the grades document, any split detail beside it (gradeEntryStorage.mjs).
        writeSplitTracker(storage, transaction, gradeRow.ref, assignmentId, migration.tracker, recordPolicy);
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
        ...(recoveryUpdate ? {
          recoveryContentVersionTo: recoveryUpdate.content.version,
          recoveryBindingsAdded: recoveryUpdate.added,
          recoveryBindingsReplaced: recoveryUpdate.replaced,
        } : {}),
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
        recoveryBindingsAdded: recoveryUpdate ? [...recoveryUpdate.added, ...recoveryUpdate.replaced] : [],
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
 * RECOVERY V2 — A LIVE ASSIGNMENT GAINS WARM-UP AND DOL RECOVERY, UNCHANGED.
 *
 * previewRecoveryContentUpgrade is the dry run a teacher reads: which static
 * Warm-Up and DOL questions a certified family will recover, what stays
 * exactly as it is, and the plan hash their approval is bound to.
 * commitRecoveryContentUpgrade applies it: inside one transaction it re-reads
 * the assignment, re-plans and re-certifies against the LIVE questions with
 * the full shared graders, refuses if anything moved since the preview, and
 * writes ONE field (`recoveryContent`, functions/shared/recoveryContent.mjs)
 * plus one assignmentVersionEvents row naming the approver. No question is
 * edited, added or retired; no student document is written; no Classroom sync
 * is requested; a repeat writes nothing (functions/shared/
 * recoveryContentUpgrade.mjs). A prepared migration that matches the
 * assignment (functions/shared/recoveryMigrations.mjs) supplies its reviewed
 * bindings, certified exactly like any other.
 */
let recoveryUpgradeModules = null;
async function recoveryUpgradeLibrary() {
  if (!recoveryUpgradeModules) {
    // The full grader is loaded only here, on the server: every sampled
    // Recovery version is marked with its own key before it can be stored.
    const [upgrade, grading, migrations, content] = await Promise.all([
      import("./shared/recoveryContentUpgrade.mjs"),
      import("./shared/recoveryCertificationGrading.mjs"),
      import("./shared/recoveryMigrations.mjs"),
      import("./shared/recoveryContent.mjs"),
    ]);
    recoveryUpgradeModules = {
      ...upgrade,
      serverRecoveryKeyCheck: grading.serverRecoveryKeyCheck,
      preparedMigrationFor: migrations.preparedMigrationFor,
      RECOVERY_CONTENT_FIELD: content.RECOVERY_CONTENT_FIELD,
    };
  }
  return recoveryUpgradeModules;
}

// The teacher of record for every assigned class (or the root
// administrator) — the Content V2 rule. An unassigned Library copy has no
// student history to protect, so any teacher may prepare its Recovery, as
// with teacher question repair.
async function requireRecoveryUpgradeAuthority(db, request, assignment) {
  const { classIds, periods } = contentUpgradeAudience(assignment);
  if (!classIds.length && !periods.length) {
    const uid = await requireTeacher(request);
    return { uid, email: callerEmail(request), authorizationType: "teacherLibrary" };
  }
  return requireContentUpgradeOwner(db, request, assignment);
}

// Counts only: the report never needs a student id or name.
async function recoveryUpgradeStudentRows(db, assignmentId, assignment) {
  const { classIds, periods } = contentUpgradeAudience(assignment);
  const queries = [
    ...classIds.map((classId) => db.collection("grades").where("classId", "==", classId).select("gradesByAssignment", "sectionRecoveryByAssignment")),
    ...periods.map((period) => db.collection("grades").where("classPeriod", "==", period).select("gradesByAssignment", "sectionRecoveryByAssignment")),
  ];
  if (!queries.length) return [];
  const snapshots = await Promise.all(queries.map((queryRef) => queryRef.get()));
  const seen = new Set();
  const rows = [];
  snapshots.forEach((snapshot) => snapshot.docs.forEach((gradeDoc) => {
    if (seen.has(gradeDoc.id)) return;
    const data = gradeDoc.data() || {};
    const tracker = data.gradesByAssignment?.[assignmentId];
    if (tracker === undefined) return;
    seen.add(gradeDoc.id);
    rows.push({ tracker, recovery: data.sectionRecoveryByAssignment?.[assignmentId] || null });
  }));
  return rows;
}

function requireRecoveryUpgradeAssignment(snapshot) {
  if (!snapshot.exists) throw new HttpsError("not-found", "That assignment no longer exists.");
  const assignment = { id: snapshot.id, ...snapshot.data() };
  if (Number(assignment.schemaVersion) !== 5) {
    throw new HttpsError("failed-precondition", "Recovery V2 prepares Assignment V5 lessons. Re-import this assignment as V5 first.");
  }
  return assignment;
}

exports.previewRecoveryContentUpgrade = onCall(async (request) => {
  const assignmentId = String(request.data?.assignmentId || "").trim();
  if (!assignmentId) throw new HttpsError("invalid-argument", "Choose the assignment to prepare Recovery for.");
  try {
    const db = getFirestore();
    const assignment = requireRecoveryUpgradeAssignment(await db.collection("assignments").doc(assignmentId).get());
    await requireRecoveryUpgradeAuthority(db, request, assignment);
    const library = await recoveryUpgradeLibrary();
    const trackers = await recoveryUpgradeStudentRows(db, assignmentId, assignment);
    const preview = library.buildRecoveryUpgradePreview({
      assignment,
      manifest: library.preparedMigrationFor(assignment),
      gradeSample: library.serverRecoveryKeyCheck,
      trackers,
      at: new Date().toISOString(),
    });
    return { assignmentId, changed: preview.report.changed, planHash: preview.planHash, report: preview.report };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Recovery V2 preview failed", {
      assignmentId,
      uid: request.auth?.uid || null,
      message: String(error?.message || error || "Unknown error").slice(0, 1000),
      stack: String(error?.stack || "").slice(0, 4000),
    });
    throw new HttpsError("unavailable", "MathMaster could not prepare this Recovery preview. Nothing was changed.", { reason: "recovery-upgrade-preview-failed" });
  }
});

exports.commitRecoveryContentUpgrade = onCall(async (request) => {
  const db = getFirestore();
  const assignmentId = String(request.data?.assignmentId || "").trim();
  const expectedPlanHash = String(request.data?.expectedPlanHash || "").trim();
  if (!assignmentId || !expectedPlanHash) {
    throw new HttpsError("invalid-argument", "Preview this Recovery upgrade before approving it.");
  }
  const initial = requireRecoveryUpgradeAssignment(await db.collection("assignments").doc(assignmentId).get());
  const authority = await requireRecoveryUpgradeAuthority(db, request, initial);
  const actorEmail = callerEmail(request);
  const isRoot = Boolean(authLib.isRootAdminEmail(actorEmail));
  const library = await recoveryUpgradeLibrary();
  // Counted outside the transaction: the report's numbers, never an input to
  // the plan, and no student document is written.
  const trackers = await recoveryUpgradeStudentRows(db, assignmentId, initial);
  const eventRef = db.collection("assignmentVersionEvents").doc();

  try {
    return await db.runTransaction(async (transaction) => {
      const ref = db.collection("assignments").doc(assignmentId);
      const assignment = requireRecoveryUpgradeAssignment(await transaction.get(ref));
      const { classIds } = contentUpgradeAudience(assignment);
      if (!isRoot && classIds.length) {
        const classSnapshots = [];
        for (const classId of classIds) {
          // All reads occur before any transaction write.
          // eslint-disable-next-line no-await-in-loop
          classSnapshots.push(await transaction.get(db.collection("classes").doc(classId)));
        }
        const ownsEveryClass = classSnapshots.every((snapshot) => (
          snapshot.exists
          && snapshot.data()?.status !== "archived"
          && String(snapshot.data()?.teacherOfRecord || "").trim().toLowerCase() === actorEmail
        ));
        if (!ownsEveryClass) {
          throw new HttpsError("permission-denied", "Class ownership changed after preview. Only the current teacher of record may approve this Recovery upgrade.");
        }
      }
      const at = new Date().toISOString();
      const preview = library.buildRecoveryUpgradePreview({
        assignment,
        manifest: library.preparedMigrationFor(assignment),
        gradeSample: library.serverRecoveryKeyCheck,
        trackers,
        at,
      });
      if (!preview.report.changed) {
        return {
          assignmentId,
          alreadyCurrent: true,
          recoveryContentVersion: preview.report.recoveryContent.versionBefore,
          readiness: preview.report.readiness,
          fullyReady: preview.report.fullyReadyAfter,
        };
      }
      if (preview.planHash !== expectedPlanHash) {
        throw new HttpsError("failed-precondition", "This assignment changed after the preview, so nothing was changed. Preview the Recovery upgrade again.", { reason: "recovery-upgrade-plan-changed" });
      }
      const applied = library.applyRecoveryUpgrade({
        assignment,
        plan: preview.plan,
        planHash: preview.planHash,
        migrationId: preview.report.migrationId,
        at,
        actorUid: request.auth.uid,
        actorEmail,
        authorizationType: isRoot ? "administrator" : authority.authorizationType,
        approvedBy: actorEmail,
        affectedStudentCount: trackers.length,
      });
      if (!applied.changed) {
        return { assignmentId, alreadyCurrent: true, recoveryContentVersion: applied.recoveryContent.version, readiness: preview.report.readiness, fullyReady: preview.report.fullyReadyAfter };
      }
      // ONE field. Not updatedAt, not assignmentRevision: no question moved,
      // so no open editor or Content V2 preview is invalidated by it.
      transaction.update(ref, { [library.RECOVERY_CONTENT_FIELD]: applied.recoveryContent });
      transaction.set(eventRef, { ...applied.auditEvent, createdAt: FieldValue.serverTimestamp() });
      return {
        assignmentId,
        alreadyCurrent: false,
        recoveryContentVersion: applied.recoveryContent.version,
        added: applied.added,
        replaced: applied.replaced,
        readiness: preview.report.readiness,
        fullyReady: preview.report.fullyReadyAfter,
        affectedStudentCount: trackers.length,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Recovery V2 commit failed", {
      assignmentId,
      uid: request.auth?.uid || null,
      message: String(error?.message || error || "Unknown error").slice(0, 1000),
    });
    throw new HttpsError("failed-precondition", error.message || "MathMaster refused the Recovery upgrade. Nothing was changed.");
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
      // A regrade is marked by the server's own grader (GR07).
      const serverGrading = await assignmentContentTrackerMigration.loadServerGrading();
      const migratedRows = trackerDocs.map((gradeRow) => {
        const migration = assignmentContentTrackerMigration.migrateTrackerForContentUpgrade({
          tracker: gradeRow.tracker,
          plan,
          correctedAt,
          serverGrading,
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

      const storage = await gradeEntryStorage();
      // Split only with settings/serverGrading.splitGradeRecords on; until then
      // a record already stored split stays split and the rest stay whole.
      const recordPolicy = await splitPolicy({
        settings: (await db.collection("settings").doc("serverGrading").get()).data() || {},
      });
      migratedRows.forEach(({ gradeRow, migration }) => {
        if (!migration.changed) return;
        // Records on the grades document, any split detail beside it (gradeEntryStorage.mjs).
        writeSplitTracker(storage, transaction, gradeRow.ref, assignmentId, migration.tracker, recordPolicy);
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
      const { stripAssignmentInstanceState } = await import("./shared/assignmentPrivacy.mjs");
      const preparedRelease = assignmentContentVersion.prepareContentRelease({
        sourceAssignment: stored,
        reviewedAssignment: reviewed.assignment,
        familyId,
        nextVersion,
        actorUid: request.auth.uid,
        auditId: auditRef.id,
        stripInstanceState: stripAssignmentInstanceState,
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

/*
 * ARCHIVE, PAUSE, OR DELETE — AND WHICH ONE IS SAFE.
 *
 * Deleting used to run in the teacher's browser: read every grade document,
 * delete the assignment, then strip the assignment's entries from each student.
 * For an ordinary teacher the first read was refused by the rules, so delete
 * simply failed; for the administrator it succeeded and erased student
 * evidence, while leaving Test Cycle records, secure sessions and recorded
 * grades orphaned. Neither is acceptable for an assessment.
 *
 * Now:
 *   archive / unarchive   always allowed. Hidden from students and from the
 *                         teacher's active lists; every record, response and
 *                         grade is kept, and it can be restored.
 *   unpublish / publish   "pause": hidden from students and closed to new
 *                         work, kept in the teacher's lists. Reversible.
 *   delete                only while NO student evidence exists. Once a
 *                         student has worked on it, delete is refused with the
 *                         evidence named and Archive offered instead.
 */
// Grade-document maps whose presence means a student did something (or a
// teacher recorded something) on this assignment. `testCycleGrades` is NOT one
// of them: opening secure sessions writes a score-less projection for every
// student, so its presence proves nothing. Test Cycle work is judged from the
// records and sessions themselves, below.
const ASSIGNMENT_EVIDENCE_GRADE_MAPS = Object.freeze([
  "gradesByAssignment",
  "dolGradesByAssignment",
  "classworkGradesByAssignment",
  "teacherGradeOverridesByAssignment",
  "sectionRecoveryByAssignment",
  "warmupChallengeByAssignment",
]);

const ASSIGNMENT_EVIDENCE_SCAN_LIMIT = 400;

async function assignmentEvidenceSummary(db, assignmentId, assignment) {
  const studentsWithWork = new Set();
  // Only this assignment's entry in each evidence map is read: a whole grade
  // document per student is every assignment that student ever did.
  const evidenceMask = ASSIGNMENT_EVIDENCE_GRADE_MAPS.map((field) => new FieldPath(field, assignmentId));
  const noteWork = (studentId, data) => {
    const hasWork = ASSIGNMENT_EVIDENCE_GRADE_MAPS.some((field) => {
      const entry = data?.[field]?.[assignmentId];
      return entry !== undefined && entry !== null && (typeof entry !== "object" || Object.keys(entry).length > 0);
    });
    if (hasWork) studentsWithWork.add(studentId);
  };
  const scanned = new Set();
  for (const classId of assignmentAudience(assignment).classIds) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection("grades").where("classId", "==", classId).select(...evidenceMask).get();
    snapshot.docs.forEach((doc) => {
      scanned.add(doc.id);
      noteWork(doc.id, doc.data() || {});
    });
  }
  const [records, sessions, publications, operations] = await Promise.all([
    db.collection(TEST_CYCLE_RECORDS).where("assignmentId", "==", assignmentId).limit(ASSIGNMENT_EVIDENCE_SCAN_LIMIT).get(),
    db.collection("examSessions").where("courseTest.assignmentId", "==", assignmentId).limit(ASSIGNMENT_EVIDENCE_SCAN_LIMIT).get(),
    db.collection("classroomLinks").where("assignmentId", "==", assignmentId).limit(50).get(),
    db.collection(TEST_CYCLE_OPERATIONS).where("assignmentId", "==", assignmentId).limit(200).select().get(),
  ]);
  /*
   * A STUDENT ADDED ON THEIR OWN, OR MOVED TO ANOTHER CLASS, STILL HAS WORK.
   * Their class is not one of the assignment's, so the class scan above never
   * saw their Review answers. Every record holder outside those classes is
   * read by id, so "nobody has worked on this" is true of everybody.
   */
  const outside = [...new Set(records.docs.map((doc) => String(doc.data()?.studentId || "")).filter((id) => id && !scanned.has(id)))];
  for (let index = 0; index < outside.length; index += 100) {
    // eslint-disable-next-line no-await-in-loop
    const snapshots = await db.getAll(
      ...outside.slice(index, index + 100).map((id) => db.collection("grades").doc(id)),
      { fieldMask: evidenceMask },
    );
    snapshots.forEach((gradeSnapshot) => { if (gradeSnapshot.exists) noteWork(gradeSnapshot.id, gradeSnapshot.data() || {}); });
  }
  // More than one scan can hold: what was not read cannot be called empty.
  const scanIncomplete = records.size >= ASSIGNMENT_EVIDENCE_SCAN_LIMIT || sessions.size >= ASSIGNMENT_EVIDENCE_SCAN_LIMIT;
  const startedSessions = sessions.docs.filter((doc) => String(doc.data()?.status || "") !== "not_started");
  startedSessions.forEach((doc) => studentsWithWork.add(String(doc.data()?.studentId || "")));
  records.docs.forEach((doc) => {
    const record = doc.data() || {};
    // A grade a teacher set by hand is recorded work too: deleting the cycle
    // would erase it and its audit (TT33, A2-133).
    if (record.review?.complete === true || record.test?.state && !["none", "assigned"].includes(record.test.state)
      || (record.gradeAdjustment && typeof record.gradeAdjustment === "object")) {
      studentsWithWork.add(String(record.studentId || ""));
    }
  });
  studentsWithWork.delete("");
  const classroomPublications = publications.docs.filter((doc) => String(doc.data()?.status || "") !== "deleted").length;
  return {
    studentsWithWork: studentsWithWork.size,
    testCycleRecords: records.size,
    secureSessions: sessions.size,
    startedSecureSessions: startedSessions.length,
    classroomPublications,
    scanIncomplete,
    canDelete: studentsWithWork.size === 0 && !scanIncomplete,
    unstartedSessionIds: sessions.docs.filter((doc) => String(doc.data()?.status || "") === "not_started").map((doc) => doc.id),
    recordIds: records.docs.map((doc) => doc.id),
    recordStudentIds: records.docs.map((doc) => String(doc.data()?.studentId || "")).filter(Boolean),
    operationIds: operations.docs.map((doc) => doc.id),
  };
}

exports.getAssignmentEvidenceSummary = onCall(TEST_CYCLE_PANEL_OPTIONS, async (request) => {
  const db = getFirestore();
  const snapshot = await assignmentForTeacherCall(request, db);
  await assertTeacherMayManageAssignmentLifecycle(request, snapshot);
  const summary = await assignmentEvidenceSummary(db, snapshot.id, snapshot.data() || {});
  const {
    unstartedSessionIds: _unstarted, recordIds: _records, recordStudentIds: _recordStudents, operationIds: _operations,
    ...publicSummary
  } = summary;
  return { success: true, assignmentId: snapshot.id, ...publicSummary };
});

/*
 * A PAUSED OR ARCHIVED TEST CYCLE STOPS THE CLOCK OF EVERY TEST UNDER WAY.
 *
 * Students cannot work while the teacher has the assessment paused or
 * archived, so their time does not run either: each course session that is
 * started and not finished gets the "assignment" hold (secureExam.withPauseHold),
 * and loses it when the assessment is open again, which extends its deadline
 * by the time it was closed. Each session changes in its own transaction, so a
 * proctor's pause or a save landing at the same moment is never lost — and
 * that transaction reads the assignment, so the hold follows whether the
 * assessment is closed then, not when this call began: an archive racing an
 * unarchive (two tabs, two teachers) ends with the hold matching where the
 * assessment ended up. A Test starting meanwhile is gated inside its own start
 * transaction (startSecureExamSession).
 */
async function holdCourseTestClocks(db, assignmentId) {
  const assignmentRef = db.collection("assignments").doc(String(assignmentId));
  const snapshot = await db.collection("examSessions").where("courseTest.assignmentId", "==", String(assignmentId)).get();
  const live = (session) => session.status === "in_progress" || secureExam.LOCKED_STATES.has(session.status);
  await Promise.all(snapshot.docs
    .filter((doc) => live(doc.data() || {}))
    .map((doc) => db.runTransaction(async (transaction) => {
      const [sessionSnapshot, assignmentSnapshot] = await Promise.all([transaction.get(doc.ref), transaction.get(assignmentRef)]);
      const session = sessionSnapshot.data() || {};
      if (!live(session)) return;
      const assignment = assignmentSnapshot.data() || {};
      const closed = assignment.archived === true || assignment.unpublished === true;
      const now = Date.now();
      const change = closed ? secureExam.withPauseHold(session, "assignment", now) : secureExam.withoutPauseHold(session, "assignment", now);
      // The hold stops or restarts the clock, so the finalizer's deadline moves with it.
      if (Object.keys(change).length) {
        transaction.set(doc.ref, {
          ...change, autoFinalizeAt: secureExam.autoFinalizeAtFor({ ...session, ...change }, now), updatedAt: now,
        }, { merge: true });
      }
    })));
}

exports.manageAssignmentLifecycle = onCall(TEST_CYCLE_PANEL_OPTIONS, async (request) => {
  const db = getFirestore();
  const snapshot = await assignmentForTeacherCall(request, db);
  const ref = snapshot.ref;
  const { teacherUid, teacherEmail } = await assertTeacherMayManageAssignmentLifecycle(request, snapshot);
  const assignment = snapshot.data() || {};
  const action = String(request.data?.action || "").trim();
  const actor = teacherEmail || teacherUid;
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const audit = (event) => FieldValue.arrayUnion({ at: now, by: actor, event });

  if (action === "archive" || action === "unarchive") {
    const archived = action === "archive";
    await ref.update({
      archived,
      archivedAt: archived ? stamp : null,
      archivedBy: archived ? actor : null,
      lifecycleHistory: audit(action),
      updatedAt: stamp,
    });
    await holdCourseTestClocks(db, ref.id);
    return { success: true, assignmentId: ref.id, action, archived };
  }
  if (action === "unpublish" || action === "publish") {
    const unpublished = action === "unpublish";
    await ref.update({
      unpublished,
      unpublishedAt: unpublished ? stamp : null,
      unpublishedBy: unpublished ? actor : null,
      lifecycleHistory: audit(action),
      updatedAt: stamp,
    });
    await holdCourseTestClocks(db, ref.id);
    return { success: true, assignmentId: ref.id, action, unpublished };
  }
  if (action !== "delete") throw new HttpsError("invalid-argument", "Choose archive, unarchive, unpublish, publish or delete.");

  // Deleting is irreversible, so the title is typed back as confirmation and
  // checked here, not only in the dialog.
  const confirmTitle = String(request.data?.confirmTitle || "").trim();
  if (confirmTitle !== String(assignment.title || "").trim()) {
    throw new HttpsError("failed-precondition", "Type the assignment's exact title to confirm deletion.");
  }
  const summary = await assignmentEvidenceSummary(db, ref.id, assignment);
  if (summary.scanIncomplete && summary.studentsWithWork === 0) {
    throw new HttpsError(
      "failed-precondition",
      "This assessment has more secure sessions than can be checked for student work in one pass. Archive it instead: archiving hides it from students and keeps everything.",
      { evidence: { scanIncomplete: true } },
    );
  }
  if (!summary.canDelete) {
    throw new HttpsError(
      "failed-precondition",
      `${summary.studentsWithWork} student${summary.studentsWithWork === 1 ? " has" : "s have"} work on this assignment. Archive it instead: archiving hides it from students and keeps their work and grades.`,
      { evidence: { studentsWithWork: summary.studentsWithWork } },
    );
  }
  if (summary.classroomPublications > 0 && request.data?.acknowledgeClassroom !== true) {
    throw new HttpsError(
      "failed-precondition",
      "This assignment is posted to Google Classroom. Deleting it here does not remove the Classroom post; confirm that you understand.",
      { evidence: { classroomPublications: summary.classroomPublications } },
    );
  }
  /*
   * No student has worked on it, so the only things to remove are the
   * assignment and the untouched secure scaffolding opened for it: unstarted
   * sessions, score-less records and their plans, the projection each record
   * wrote on its student's grade document, any answer release, the class-wide
   * operation logs, and the class sittings recorded for its Test days.
   *
   * ORDER, AND WHY IT IS NOT ONE BATCH. A batch holds 500 writes and a class
   * set can need more, which used to fail the whole delete with a bare server
   * error. The scaffolding goes first, in groups; the assignment goes LAST. If
   * a group fails, the assignment is still there, still refusing students
   * (their sessions and records are already gone or about to be), and the
   * teacher runs delete again. The other order could leave sessions behind for
   * an assignment that no longer exists.
   */
  const writes = [];
  summary.unstartedSessionIds.forEach((id) => writes.push((batch) => batch.delete(db.collection("examSessions").doc(id))));
  const projectionHolders = [];
  for (let index = 0; index < summary.recordStudentIds.length; index += 100) {
    // eslint-disable-next-line no-await-in-loop
    projectionHolders.push(...await db.getAll(
      ...summary.recordStudentIds.slice(index, index + 100).map((id) => db.collection("grades").doc(id)),
      { fieldMask: [new FieldPath("testCycleGrades", ref.id)] },
    ));
  }
  projectionHolders
    .filter((gradeSnapshot) => gradeSnapshot.exists && gradeSnapshot.data()?.testCycleGrades?.[ref.id] !== undefined)
    .forEach((gradeSnapshot) => writes.push((batch) => batch.update(gradeSnapshot.ref, new FieldPath("testCycleGrades", ref.id), FieldValue.delete())));
  summary.recordIds.forEach((id) => {
    writes.push((batch) => batch.delete(db.collection(TEST_CYCLE_RECORDS).doc(id)));
    writes.push((batch) => batch.delete(db.collection(TEST_CYCLE_CORRECTION_PLANS).doc(id)));
    writes.push((batch) => batch.delete(db.collection(TEST_CYCLE_RETEST_PLANS).doc(id)));
  });
  summary.operationIds.forEach((id) => writes.push((batch) => batch.delete(db.collection(TEST_CYCLE_OPERATIONS).doc(id))));
  writes.push((batch) => batch.delete(db.collection(TEST_CYCLE_ANSWER_RELEASES).doc(ref.id)));
  // The class sittings recorded for its Test days (TC04): one small server-only
  // document per class and day, which nothing else would ever remove.
  const sittingRefs = await classSittingRefsOf(db, ref.id);
  sittingRefs.forEach((sittingRef) => writes.push((batch) => batch.delete(sittingRef)));
  for (let index = 0; index < writes.length; index += 400) {
    const batch = db.batch();
    writes.slice(index, index + 400).forEach((write) => write(batch));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  await ref.delete();
  await db.collection("assignmentDeletionLog").doc(ref.id).set({
    assignmentId: ref.id,
    title: String(assignment.title || "").slice(0, 200),
    deletedAt: now,
    deletedBy: actor,
    removedSecureSessions: summary.unstartedSessionIds.length,
    removedTestCycleRecords: summary.recordIds.length,
    removedClassSittings: sittingRefs.length,
  });
  return { success: true, assignmentId: ref.id, action, deleted: true };
});
