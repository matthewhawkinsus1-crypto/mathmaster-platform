// REWARDS: class points, Practice Passes, reward grants and the class reward catalog.
//
// One of the domain modules functions/index.js loads (see its header). The
// code here was moved from index.js as it stood; helpers that another domain
// also uses are in functionsCommon.js.

const { getFirestore } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { runtimeIncludedQuestionIndicesForSection } = require("./lib/assignmentRuntime");
const authLib = require("./lib/auth");
const {
  CLASS_POINT_ACCOUNTS_COLLECTION,
  CLASS_POINT_ANNOUNCEMENTS_COLLECTION,
  CLASS_POINT_IDEMPOTENCY_COLLECTION,
  CLASS_POINT_TRANSACTIONS_COLLECTION,
  callerEmail,
  classPointRewards,
  classPoints,
  requireStudent,
  requireTeacher,
  secureAssignmentMode,
  studentMatchesAssignmentAudience,
} = require("./functionsCommon");

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
        // The id travels with the record so a name that only repeats it is refused.
        publicStudentLabel: points.publicStudentLabel({ ...studentRecord, studentId }),
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
  // Paying with a pass the student holds is the default whenever the caller
  // says so; a call that names no payment keeps the original meaning (spend
  // 100 Class Points), so a browser still running the previous build works.
  const payWith = request.data?.payWith === rewards.PRACTICE_PASS_PAYMENT.PASS
    ? rewards.PRACTICE_PASS_PAYMENT.PASS
    : rewards.PRACTICE_PASS_PAYMENT.CLASS_POINTS;
  const store = await rewardActionStore();
  try {
    return await store.redeemPracticePass(getFirestore(), {
      studentId,
      assignmentId: input.assignmentId,
      payWith,
      preferredGrantId: String(request.data?.grantId || "").trim() || null,
      actor: { uid: request.auth.uid, email: callerEmail(request) },
      // Every fact the eligibility rule needs that only this file can compute,
      // from the assignment the transaction itself just read.
      assess: ({ assignment, classId }) => ({
        assignedToClass: studentMatchesAssignmentAudience({ assignment, classId }),
        isTestCycleAssignment: secureAssignmentMode(assignment) || assignment.secure === true,
        practiceIndices: runtimeIncludedQuestionIndicesForSection(assignment, "practice"),
      }),
    });
  } catch (error) {
    throw translateRewardActionError(error);
  }
});

// ---------------------------------------------------------------------------
// Reward actions a teacher takes on one student's rewards. Each is one
// transaction in functions/shared/rewardActionStore.mjs, authorized from the
// class record (authorizeClassPointsActor) before anything is read back.
// ---------------------------------------------------------------------------

let rewardActionStoreModule = null;
async function rewardActionStore() {
  if (!rewardActionStoreModule) rewardActionStoreModule = await import("./shared/rewardActionStore.mjs");
  return rewardActionStoreModule;
}

const REWARD_ACTION_HTTPS_CODES = new Set([
  "invalid-argument", "failed-precondition", "permission-denied", "not-found", "already-exists",
]);

function translateRewardActionError(error) {
  if (error?.name === "RewardActionError") {
    const code = REWARD_ACTION_HTTPS_CODES.has(error.code) ? error.code : "failed-precondition";
    return new HttpsError(code, error.message, error.detail || undefined);
  }
  return translateClassPointsError(error);
}

async function rewardTeacher(request) {
  const uid = await requireTeacher(request);
  const email = callerEmail(request);
  if (!email) throw new HttpsError("permission-denied", "Sign in with a verified school email to manage rewards.");
  return { uid, email, isRootAdmin: authLib.isRootAdminEmail(email) };
}

/** A teacher gives one student a Practice Pass or a badge. */
exports.awardRewardGrant = onCall(async (request) => {
  const teacher = await rewardTeacher(request);
  const data = request.data || {};
  const store = await rewardActionStore();
  try {
    return await store.awardRewardGrant(getFirestore(), {
      studentId: data.studentId,
      classId: data.classId,
      rewardCode: data.rewardCode,
      label: data.label,
      note: data.note,
      expiresInDays: data.expiresInDays ?? null,
      requestId: data.requestId,
      teacher,
    });
  } catch (error) {
    throw translateRewardActionError(error);
  }
});

/** A teacher takes back an unused reward, with a reason the student sees. */
exports.revokeRewardGrant = onCall(async (request) => {
  const teacher = await rewardTeacher(request);
  const store = await rewardActionStore();
  try {
    return await store.revokeRewardGrant(getFirestore(), {
      grantId: request.data?.grantId,
      reason: request.data?.reason,
      teacher,
    });
  } catch (error) {
    throw translateRewardActionError(error);
  }
});

/** A teacher undoes a Practice Pass use: Practice is required again and the pass or points come back. */
exports.undoPracticePassRedemption = onCall(async (request) => {
  const teacher = await rewardTeacher(request);
  const store = await rewardActionStore();
  try {
    return await store.undoPracticePassRedemption(getFirestore(), {
      redemptionId: request.data?.redemptionId,
      reason: request.data?.reason,
      teacher,
    });
  } catch (error) {
    throw translateRewardActionError(error);
  }
});

/**
 * Everything a teacher needs to understand ONE student's rewards in one class,
 * in one authorized, one-time read (rewardActionStore.mjs
 * loadStudentRewardsForTeacher): what they hold, what they used and on what,
 * what was taken back, their recent Class Points, and — for the last few Live
 * Challenges — why each reward rule did or did not pay out and whether the
 * reward arrived. No listener: Refresh re-reads.
 */
// GROWTH, EFFORT AND MASTERY REWARDS: the signed-in student's own records are
// re-derived server-side and each award is delivered exactly once
// (functions/lib/growthRewards.js, functions/shared/growthRewardRules.mjs).
exports.syncStudentGrowthRewards = onCall((request) => require("./lib/growthRewards").syncStudentGrowthRewardsHandler(request));

// CLASS REWARDS: a teacher's non-academic redeemables, bought with Class Points
// (functions/lib/classRewardStore.js, functions/shared/classRewardCatalog.mjs).
exports.saveClassRewardCatalog = onCall((request) => require("./lib/classRewardStore").saveClassRewardCatalogHandler(request));
exports.redeemClassReward = onCall((request) => require("./lib/classRewardStore").redeemClassRewardHandler(request));
exports.resolveClassRewardRequest = onCall((request) => require("./lib/classRewardStore").resolveClassRewardRequestHandler(request));

exports.getStudentRewards = onCall(async (request) => {
  const teacher = await rewardTeacher(request);
  const store = await rewardActionStore();
  try {
    return await store.loadStudentRewardsForTeacher(getFirestore(), {
      studentId: request.data?.studentId,
      classId: request.data?.classId,
      teacher,
    });
  } catch (error) {
    throw translateRewardActionError(error);
  }
});
