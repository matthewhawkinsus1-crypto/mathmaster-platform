"use strict";

/*
 * CLASS REWARDS: EVERY WRITE, IN ONE TRANSACTION EACH (server only).
 *
 * A class reward is a teacher's own non-academic redeemable — "Choose your
 * seat for a day" for 50 Class Points. The rules (what may be listed, what a
 * student may spend, how a request is resolved) are pure and shared in
 * functions/shared/classRewardCatalog.mjs; this file reads, decides with those
 * rules and writes, the same way functions/shared/rewardActionStore.mjs does
 * for the Practice Pass:
 *
 *   saveClassRewardCatalog     the class's teacher of record (or the root
 *                              administrator) replaces classRewardCatalogs/{classId}
 *   redeemClassReward          a student spends points: the ledger debit, the
 *                              account projection and a PENDING request are one
 *                              commit — never a debit without a request, never a
 *                              request without a debit
 *   resolveClassRewardRequest  the teacher marks it fulfilled, or declined with
 *                              a reason; a decline refunds in the same commit
 *
 * IDEMPOTENCY IS THE DOCUMENT ID. A redemption's request document, its debit
 * and its refund all live at ids derived from (studentId, client requestId),
 * so a double click, a lost response and a retry all land on the same
 * documents: the second attempt finds the request and spends nothing.
 *
 * The callables in functions/index.js are one line each and call the
 * *Handler functions below, which verify the token and hand over.
 */

const { createHash } = require("node:crypto");
const { HttpsError } = require("firebase-functions/v2/https");

let modulesPromise = null;
function classRewardModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("../shared/classRewardCatalog.mjs"),
      import("../shared/classPoints.mjs"),
    ]).then(([catalog, classPoints]) => ({ catalog, classPoints }));
  }
  return modulesPromise;
}

const ACCOUNTS = "classPointAccounts";
const LEDGER = "classPointTransactions";

class ClassRewardError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = "ClassRewardError";
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = null) => { throw new ClassRewardError(code, message, detail); };
const cleanText = (value, max) => String(value ?? "").trim().slice(0, max);
const cleanEmail = (value) => cleanText(value, 320).toLowerCase();
const hashOf = (studentId, requestId) => createHash("sha256")
  .update(`${studentId}\u0000${requestId}`)
  .digest("hex")
  .slice(0, 40);

/*
 * One redemption's three ids. Scoped to the student so two students who happen
 * to send the same requestId can never collide on one document.
 */
const requestDocIdFor = (studentId, requestId) => `crr_${hashOf(studentId, requestId)}`;
const debitIdFor = (requestDocId) => `crd_${String(requestDocId).replace(/^crr_/, "")}`;
const refundIdFor = (requestDocId) => `crf_${String(requestDocId).replace(/^crr_/, "")}`;

// The input validators throw ClassRewardInputError; the ledger throws
// ClassPointsInputError for a balance that would go negative.
function translateInputError(error, fallbackCode = "invalid-argument") {
  if (error?.name === "ClassRewardInputError") return new ClassRewardError("invalid-argument", error.message, error.field ? { field: error.field } : null);
  if (error?.name === "ClassPointsInputError") return new ClassRewardError(fallbackCode, error.message);
  return error;
}

/*
 * Who may change a class's catalog, or resolve its requests: the class's
 * teacher of record, or the root administrator. Decided from classes/{classId}
 * — the authoritative record (functions/shared/classModel.mjs) — exactly as
 * authorizeClassPointsActor decides it, minus the per-student roster check,
 * because neither action is about one student's CURRENT placement: a catalog
 * belongs to the class, and a request was paid from the class account it
 * names, so a student who has since moved can still be refunded to it.
 */
function authorizeClassTeacher({ classRecord, teacher, allowArchived = false }) {
  if (!classRecord) fail("not-found", "That class was not found.");
  if (teacher?.isRootAdmin === true) return;
  // An archived class's catalog is frozen and nothing more is handed out, but
  // its teacher of record may still DECLINE a pending request: otherwise the
  // student's points would stay locked in a request nobody can close.
  if (classRecord.status === "archived" && !allowArchived) fail("failed-precondition", "That class is archived. Its rewards can no longer be changed.");
  const teacherOfRecord = cleanEmail(classRecord.teacherOfRecord);
  if (!teacherOfRecord || cleanEmail(teacher?.email) !== teacherOfRecord) {
    fail("permission-denied", "Only this class's teacher of record can manage its rewards.");
  }
}

/** Replace a class's reward list. `baseRevision` refuses a save from a stale tab. */
async function saveClassRewardCatalog(db, {
  classId, items, baseRevision = null, teacher = {}, nowMs = Date.now(),
} = {}) {
  const { catalog: rules } = await classRewardModules();
  let input;
  try {
    input = rules.validateCatalogInput({ classId, items, baseRevision });
  } catch (error) {
    throw translateInputError(error);
  }
  const classRef = db.collection("classes").doc(input.classId);
  const catalogRef = db.collection(rules.CLASS_REWARD_CATALOGS_COLLECTION).doc(input.classId);
  return db.runTransaction(async (transaction) => {
    const [classSnap, catalogSnap] = await Promise.all([transaction.get(classRef), transaction.get(catalogRef)]);
    authorizeClassTeacher({ classRecord: classSnap.exists ? classSnap.data() : null, teacher });
    const previous = catalogSnap.exists ? catalogSnap.data() : null;
    const currentRevision = Number(previous?.revision) || 0;
    if (input.baseRevision !== null && input.baseRevision !== currentRevision) {
      fail("failed-precondition", "The reward list was changed somewhere else. Reload it, then make your change again.", { reason: "stale-revision", revision: currentRevision });
    }
    const document = rules.buildCatalogDocument({
      classId: input.classId,
      items: input.items,
      previous,
      teacherEmail: cleanEmail(teacher.email) || null,
      at: new Date(nowMs).toISOString(),
    });
    transaction.set(catalogRef, document);
    return { outcome: "saved", catalog: document };
  });
}

/**
 * A student spends Class Points on one item of THEIR class's catalog.
 * Their class is read from their own grade record, never the request, so an
 * item from another class's list is simply "not on your class's list".
 */
async function redeemClassReward(db, {
  studentId, itemId, requestId, expectedCost = null, actor = {}, nowMs = Date.now(),
} = {}) {
  const { catalog: rules, classPoints } = await classRewardModules();
  const student = cleanText(studentId, 64);
  if (!student) fail("permission-denied", "Sign in as a student to use a reward.");
  let input;
  try {
    input = rules.validateRedeemInput({ itemId, requestId, expectedCost });
  } catch (error) {
    throw translateInputError(error);
  }
  const requestDocId = requestDocIdFor(student, input.requestId);
  const requestRef = db.collection(rules.CLASS_REWARD_REQUESTS_COLLECTION).doc(requestDocId);
  const gradeRef = db.collection("grades").doc(student);
  const weekKey = rules.schoolWeekKey(nowMs);

  return db.runTransaction(async (transaction) => {
    const [requestSnap, gradeSnap] = await Promise.all([transaction.get(requestRef), transaction.get(gradeRef)]);

    // The same click again (a double click, a lost answer, a retry): the
    // request exists, so nothing more is spent. Checked before anything that
    // could refuse — the points were already spent, and the student must be
    // told so, even if the item has since been turned off.
    if (requestSnap.exists) {
      const existing = requestSnap.data() || {};
      if (existing.studentId !== student || existing.itemId !== input.itemId) {
        fail("already-exists", "That request was already used for a different reward. Reload and try again. Nothing was spent.");
      }
      return { outcome: "alreadyRequested", replay: true, requestDocId, request: existing };
    }

    if (!gradeSnap.exists) fail("not-found", "Your student record was not found.");
    const gradeData = gradeSnap.data() || {};
    if (gradeData.status === "disabled") fail("permission-denied", "Your account is turned off. Ask your teacher.");
    const classId = cleanText(gradeData.classId, 120);
    if (!classId) fail("failed-precondition", "You are not in a class yet, so there are no class rewards to use.");

    const classRef = db.collection("classes").doc(classId);
    const catalogRef = db.collection(rules.CLASS_REWARD_CATALOGS_COLLECTION).doc(classId);
    const accountRef = db.collection(ACCOUNTS).doc(classPoints.accountId(student, classId));
    /*
     * The weekly limit counts this week's requests with a query. That is safe
     * against two tabs racing for the last use because EVERY redemption also
     * writes this student's account document below: two concurrent
     * redemptions contend on it, Firestore retries the loser, and the retry's
     * query sees the winner's committed request.
     */
    const weekQuery = db.collection(rules.CLASS_REWARD_REQUESTS_COLLECTION)
      .where("studentId", "==", student)
      .where("classId", "==", classId)
      .where("weekKey", "==", weekKey);
    const [classSnap, catalogSnap, accountSnap, weekSnap] = await Promise.all([
      transaction.get(classRef),
      transaction.get(catalogRef),
      transaction.get(accountRef),
      transaction.get(weekQuery),
    ]);

    const classRecord = classSnap.exists ? { classId: classSnap.id, ...classSnap.data() } : null;
    // The same roster-consistency rule redeemPracticePass applies, with the
    // class's own teacher as the "actor" so only consistency is checked:
    // the class exists, is not archived, the student's record names it and
    // the roster's teacher agrees with the class's.
    const consistency = classPoints.authorizeClassPointsActor({
      isRootAdmin: false,
      teacherEmail: classRecord?.teacherOfRecord,
      classRecord,
      studentRecord: gradeData,
      requestedClassId: classId,
    });
    if (!consistency.authorized) fail(consistency.reason, consistency.message);

    const item = rules.findCatalogItem(catalogSnap.exists ? catalogSnap.data() : null, input.itemId);
    const account = accountSnap.exists ? accountSnap.data() : classPoints.emptyAccount({ studentId: student, classId });
    const decision = rules.evaluateClassRewardRedemption({
      item,
      balance: account.balance,
      requestsThisWeek: weekSnap.docs.map((entry) => entry.data()),
      weekKey,
      expectedCost: input.expectedCost,
    });
    if (!decision.eligible) {
      fail(decision.code === "not-in-catalog" ? "not-found" : "failed-precondition", `${decision.message} Nothing was spent.`, { reason: decision.code });
    }

    const at = new Date(nowMs).toISOString();
    const authorization = classPoints.classPointsAuthorizationContext({ classRecord, existingRecord: accountSnap.exists ? account : null });
    const debitId = debitIdFor(requestDocId);
    const request = rules.buildClassRewardRequest({
      requestDocId,
      requestId: input.requestId,
      studentId: student,
      classId,
      item,
      weekKey,
      studentLabel: classPoints.publicStudentLabel(gradeData),
      debitTransactionId: debitId,
      originTeacherEmail: authorization.originTeacherEmail,
      authorizedTeacherEmails: authorization.authorizedTeacherEmails,
      at,
    });
    const debit = rules.buildClassRewardDebit({
      request,
      sourceType: classPoints.SOURCE_TYPES.REWARD_REDEMPTION,
      issuedByUid: actor?.uid || null,
      at,
    });
    let nextAccount;
    try {
      nextAccount = { ...classPoints.applyTransaction(account, debit), ...authorization };
    } catch (error) {
      throw translateInputError(error, "failed-precondition");
    }
    transaction.set(db.collection(LEDGER).doc(debitId), debit);
    transaction.set(accountRef, nextAccount);
    transaction.set(requestRef, request);
    return { outcome: "requested", replay: false, requestDocId, request, account: nextAccount };
  });
}

/**
 * The teacher closes a pending request: fulfilled (the student got it; the
 * points stay spent) or declined with a reason the student reads (the points
 * come back, once — the refund has a fixed id and is written only if absent).
 *
 * A request whose student was permanently deleted (grades/{studentId} is
 * gone) is neither refunded nor fulfilled: it is marked cancelled and NO
 * account or ledger document is written, so a teacher acting on a stale
 * pending row can never re-create an erased student's wallet.
 *
 * A request on an ARCHIVED class may still be declined (with its refund) by
 * the class's teacher of record, never fulfilled.
 */
async function resolveClassRewardRequest(db, {
  requestDocId, resolution, reason = null, teacher = {}, nowMs = Date.now(),
} = {}) {
  const { catalog: rules, classPoints } = await classRewardModules();
  let input;
  try {
    input = rules.validateResolveInput({ requestDocId, resolution, reason });
  } catch (error) {
    throw translateInputError(error);
  }
  const teacherEmail = cleanEmail(teacher.email);
  if (!teacherEmail && teacher.isRootAdmin !== true) fail("permission-denied", "A verified teacher email is required.");
  const requestRef = db.collection(rules.CLASS_REWARD_REQUESTS_COLLECTION).doc(input.requestDocId);

  return db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) fail("not-found", "That request was not found.");
    const request = requestSnap.data() || {};
    const classId = cleanText(request.classId, 120);
    const studentId = cleanText(request.studentId, 64);
    const declining = input.resolution === rules.RESOLUTION.DECLINED;
    const refundRef = db.collection(LEDGER).doc(refundIdFor(input.requestDocId));
    const accountRef = db.collection(ACCOUNTS).doc(classPoints.accountId(studentId, classId));
    // Every read before any write (a Firestore transaction rule), so the
    // refund's documents are read up front whenever this could be a decline.
    const [classSnap, studentSnap, refundSnap, accountSnap] = await Promise.all([
      transaction.get(db.collection("classes").doc(classId)),
      studentId ? transaction.get(db.collection("grades").doc(studentId)) : Promise.resolve(null),
      declining ? transaction.get(refundRef) : Promise.resolve(null),
      declining ? transaction.get(accountRef) : Promise.resolve(null),
    ]);
    // Authorization before ANY answer, the replay included.
    const classRecord = classSnap.exists ? { classId: classSnap.id, ...classSnap.data() } : null;
    // A decline (which refunds) is allowed on an archived class; a fulfilment is not.
    authorizeClassTeacher({ classRecord, teacher, allowArchived: declining });

    const at = new Date(nowMs).toISOString();
    const plan = rules.planRequestResolution(request, {
      resolution: input.resolution, reason: input.reason, teacherEmail: teacherEmail || null, at,
    });
    if (plan.outcome === "replay") return { outcome: "alreadyApplied", requestDocId: input.requestDocId, request };
    if (plan.outcome === "refused") fail(plan.code, plan.message);

    // The student was permanently deleted: close the request without a refund
    // or a fulfilment. Writing the refund would re-create classPointAccounts
    // and a ledger row for someone who no longer exists.
    if (!studentSnap?.exists) {
      const cancelled = rules.buildCancelledRequest(request, { teacherEmail: teacherEmail || null, at });
      transaction.set(requestRef, cancelled);
      return { outcome: "cancelled", reason: "student-deleted", requestDocId: input.requestDocId, request: cancelled };
    }

    let next = plan.next;
    if (plan.refund) {
      if (!refundSnap.exists) {
        const account = accountSnap.exists ? accountSnap.data() : classPoints.emptyAccount({ studentId, classId });
        const authorization = classPoints.classPointsAuthorizationContext({ classRecord, existingRecord: accountSnap.exists ? account : null });
        const refund = rules.buildClassRewardRefund({
          request: { ...request, requestDocId: input.requestDocId },
          sourceType: classPoints.SOURCE_TYPES.REWARD_REFUND,
          reason: input.reason,
          teacherEmail: teacherEmail || null,
          issuedByUid: teacher.uid || null,
          originTeacherEmail: authorization.originTeacherEmail,
          authorizedTeacherEmails: authorization.authorizedTeacherEmails,
          at,
        });
        let nextAccount;
        try {
          nextAccount = { ...classPoints.applyTransaction(account, refund), ...authorization };
        } catch (error) {
          throw translateInputError(error, "failed-precondition");
        }
        transaction.set(refundRef, refund);
        transaction.set(accountRef, nextAccount);
      }
      next = { ...next, refundTransactionId: refundRef.id };
    }
    transaction.set(requestRef, next);
    return { outcome: input.resolution, requestDocId: input.requestDocId, request: next };
  });
}

/**
 * A class changed hands (or a student joined it): give the class's current
 * teacher of record access to this student's reward requests FOR THAT CLASS,
 * exactly as the wallet and ledger rows are re-pointed (reauthorizeClassPointsRecord:
 * same class only, origin frozen, the access list grows). Without this the new
 * teacher's pending panel — a query on authorizedTeacherEmails — never shows
 * the request, and the old teacher can no longer resolve it, so the student's
 * points stay locked. Called from reauthorizeStudentRecords in functions/index.js.
 */
async function reauthorizeClassRewardRequests(db, studentId, classRecord) {
  if (!studentId || !classRecord?.classId) return 0;
  const { catalog: rules, classPoints } = await classRewardModules();
  const snapshot = await db.collection(rules.CLASS_REWARD_REQUESTS_COLLECTION)
    .where("studentId", "==", String(studentId))
    .where("classId", "==", String(classRecord.classId))
    .get();
  let updated = 0;
  for (let index = 0; index < snapshot.docs.length; index += 400) {
    const batch = db.batch();
    let queued = 0;
    snapshot.docs.slice(index, index + 400).forEach((entry) => {
      const change = classPoints.reauthorizeClassPointsRecord(entry.data() || {}, { classRecord });
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
}

// ---------------------------------------------------------------------------
// The callables' bodies. Identity comes from the verified token only.
// ---------------------------------------------------------------------------

const HTTPS_CODES = new Set(["invalid-argument", "failed-precondition", "permission-denied", "not-found", "already-exists"]);

function toHttpsError(error) {
  const translated = translateInputError(error);
  if (translated?.name === "ClassRewardError") {
    const code = HTTPS_CODES.has(translated.code) ? translated.code : "failed-precondition";
    return new HttpsError(code, translated.message, translated.detail || undefined);
  }
  return translated;
}

function verifiedEmail(request) {
  const token = request.auth?.token || {};
  // An unverified email is an identity anyone can claim (see callerEmail in
  // functions/index.js), so it never matches a teacher of record.
  if (!token.email || token.email_verified === false) return null;
  return cleanEmail(token.email) || null;
}

function teacherFromRequest(request) {
  if (!request?.auth) throw new HttpsError("unauthenticated", "Sign in before making this change.");
  if (request.auth.token?.role !== "teacher") throw new HttpsError("permission-denied", "Only a teacher can manage class rewards.");
  const email = verifiedEmail(request);
  if (!email) throw new HttpsError("permission-denied", "Sign in with a verified school email to manage rewards.");
  // eslint-disable-next-line global-require
  const authLib = require("./auth");
  return { uid: request.auth.uid, email, isRootAdmin: authLib.isRootAdminEmail(email) };
}

function studentFromRequest(request) {
  if (!request?.auth) throw new HttpsError("unauthenticated", "Sign in to use your rewards.");
  const token = request.auth.token || {};
  if (token.role !== "student" || !token.studentId) {
    throw new HttpsError("permission-denied", "Class rewards are used by signed-in students.");
  }
  return { uid: request.auth.uid, studentId: String(token.studentId) };
}

const firestoreOf = (db) => db || require("firebase-admin/firestore").getFirestore();

async function saveClassRewardCatalogHandler(request, { db = null, nowMs = Date.now() } = {}) {
  const teacher = teacherFromRequest(request);
  try {
    return await saveClassRewardCatalog(firestoreOf(db), {
      classId: request.data?.classId,
      items: request.data?.items,
      baseRevision: request.data?.baseRevision ?? null,
      teacher,
      nowMs,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
}

async function redeemClassRewardHandler(request, { db = null, nowMs = Date.now() } = {}) {
  const { uid, studentId } = studentFromRequest(request);
  // The student is the token's, never the request's: a request naming anyone
  // else is refused outright rather than quietly answered for the caller.
  const named = request.data?.studentId;
  if (named !== undefined && named !== null && String(named) !== studentId) {
    throw new HttpsError("permission-denied", "You can only use your own rewards.");
  }
  try {
    return await redeemClassReward(firestoreOf(db), {
      studentId,
      itemId: request.data?.itemId,
      requestId: request.data?.requestId,
      expectedCost: request.data?.expectedCost ?? null,
      actor: { uid },
      nowMs,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
}

async function resolveClassRewardRequestHandler(request, { db = null, nowMs = Date.now() } = {}) {
  const teacher = teacherFromRequest(request);
  try {
    return await resolveClassRewardRequest(firestoreOf(db), {
      requestDocId: request.data?.requestDocId,
      resolution: request.data?.resolution,
      reason: request.data?.reason ?? null,
      teacher,
      nowMs,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
}

module.exports = {
  ClassRewardError,
  debitIdFor,
  redeemClassReward,
  redeemClassRewardHandler,
  reauthorizeClassRewardRequests,
  refundIdFor,
  requestDocIdFor,
  resolveClassRewardRequest,
  resolveClassRewardRequestHandler,
  saveClassRewardCatalog,
  saveClassRewardCatalogHandler,
};
