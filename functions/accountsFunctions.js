// ACCOUNTS AND ADMINISTRATION: sign-in, student and teacher accounts, classes, assignment privacy and controls, the admin audit log, preproduction reset.
//
// One of the domain modules functions/index.js loads (see its header). The
// code here was moved from index.js as it stood; helpers that another domain
// also uses are in functionsCommon.js.

const crypto = require("crypto");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const authLib = require("./lib/auth");
const adminPolicy = require("./lib/admin");
const { deployProvenance } = require("./lib/deployProvenance");
const {
  CLASS_COLLECTION,
  CLASS_POINT_ACCOUNTS_COLLECTION,
  CLASS_POINT_ANNOUNCEMENTS_COLLECTION,
  CLASS_POINT_IDEMPOTENCY_COLLECTION,
  CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION,
  CLASS_POINT_TRANSACTIONS_COLLECTION,
  LIVE_CHALLENGE_INVITES,
  LIVE_CHALLENGE_MATCH_RESULTS,
  LIVE_CHALLENGE_PRIVATE,
  LIVE_CHALLENGE_REPORTS,
  LIVE_CHALLENGE_ROOMS,
  LIVE_CHALLENGE_TEACHER_ACTIVE,
  assignClaims,
  authorizationContext,
  callerEmail,
  classModel,
  classPoints,
  joinCodeMatchesRoster,
  liveChallengeClassPoints,
  liveChallengeEngine,
  liveChallengeReportRules,
  liveChallengeRules,
  loadClasses,
  lookupJoinCode,
  requireRootAdmin,
  requireTeacher,
  resolveJoinCodeMembership,
  serializableDate,
  studentDeletionMark,
  studentIdentity,
  studentOverrides,
  toDate,
  translateAuthError,
  writeAdminAudit,
} = require("./functionsCommon");

/** True when this email may hold the teacher role right now. */
async function isAuthorizedTeacher(db, email) {
  if (!email) return false;
  if (authLib.isRootAdminEmail(email)) return true;
  const snapshot = await db.collection(authLib.TEACHER_COLLECTION).doc(email).get();
  if (snapshot.exists) return snapshot.data()?.active !== false;
  return authLib.bootstrapTeacherEmails().includes(email);
}

// What a student's DISTRICT (SIS) ID is, and that the account ID is not one
// once a district ID is stored: its format, the duplicate rule and who may
// change it. Shared with Grade Export and Student Access in the browser.
let studentDistrictIdModule = null;
async function studentDistrictIds() {
  if (!studentDistrictIdModule) studentDistrictIdModule = await import("./shared/studentDistrictId.mjs");
  return studentDistrictIdModule;
}

// The teacher-readable child records. Each one carries its own authorization
// context, because a rule that joined to the classes collection would need a
// get() per document and Firestore caps that at ten per query.
const AUTHORIZED_CHILD_COLLECTIONS = Object.freeze([
  { path: (studentId) => `grades/${studentId}/evidenceEvents`, label: "evidenceEvents" },
  { path: (studentId) => `grades/${studentId}/scratchpads`, label: "scratchpads" },
  // The history of a student's assignment controls (studentAssignmentOverrides.mjs).
  { path: (studentId) => `grades/${studentId}/assignmentOverrideEvents`, label: "assignmentOverrideEvents" },
]);

/**
 * Move a student's existing records onto their new teacher.
 *
 * Bounded by one student's history and batched, and it runs on a rare
 * administrative action rather than on a read. See the policy note at the top
 * of shared/authorizationContext.mjs: the access list moves, the origin fields
 * never do.
 */
async function handOverOpenTeacherQuestions(db, studentId, classRecord, apply) {
  const lifecycle = await import("./shared/askTeacherLifecycle.mjs");
  const waiting = await db.collection(lifecycle.ASK_TEACHER_COLLECTION)
    .where("studentId", "==", studentId)
    .where("status", "==", "open")
    .get();
  return apply(waiting.docs, (entry) => lifecycle.openQuestionHandover(entry.data() || {}, classRecord));
}

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
  for (const collectionName of ["studentSupportEvents", "studentSessionSummaries", "parentContactLogs", "studentAssignmentOverrides"]) {
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

  // "Ask my teacher": a question still waiting goes to the new teacher of
  // record, so it reaches a list someone reads (TT26).
  counts.askTeacherQuestions = await handOverOpenTeacherQuestions(db, studentId, classRecord, apply);

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

    // Class reward requests were paid from this same wallet, so they follow
    // it: same class only, same helper. Without this a handed-over class's
    // pending requests are invisible to the new teacher and unresolvable by
    // the old one, and the student's points stay locked.
    counts.classRewardRequests = await require("./lib/classRewardStore")
      .reauthorizeClassRewardRequests(db, studentId, classRecord);
  } else {
    counts.classPointAccounts = 0;
    counts.classPointTransactions = 0;
    counts.classRewardRequests = 0;
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
  // The mastery history follows its profile: a new teacher reads it, and an
  // earlier non-origin teacher stops reading it, on the same move.
  // studentCcmrPlans is the student's own CCMR plan (shared/ccmrPlan.mjs).
  for (const collectionName of ["studentMasteryProfiles", "studentRetentionSchedules", "studentMasteryHistory", "studentCcmrPlans"]) {
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

function translateClassError(error) {
  if (error?.name === "ClassInputError") return new HttpsError("invalid-argument", error.message);
  return error;
}

/**
 * The roster record a signed-in student's dashboard hangs off of — read, never
 * created. Signing in used to create a missing `grades` document, and every
 * one it created was a nameless roster row a teacher then saw as a bare ID.
 * Roster rows are created only by createStudentAccount, with a name. A field
 * mask keeps this read from loading the student's attempt history.
 */
async function readStudentRosterPresence(db, studentId) {
  const [snapshot] = await db.getAll(
    db.collection("grades").doc(String(studentId)),
    { fieldMask: ["classPeriod", "status"] },
  );
  return snapshot.exists ? { exists: true, classPeriod: snapshot.data()?.classPeriod || null } : { exists: false };
}

const STUDENT_NOT_ON_ROSTER_MESSAGE = "This MathMaster student account is no longer on a class roster. Ask your teacher.";

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
  // A token whose roster row is gone fails closed: the client shows this
  // message and signs out, and no empty roster row is created.
  if (token.role === "student" && token.studentId) {
    const record = await readStudentRosterPresence(db, token.studentId);
    if (!record.exists) throw new HttpsError("failed-precondition", STUDENT_NOT_ON_ROSTER_MESSAGE);
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
      const record = await readStudentRosterPresence(db, studentId);
      // A Google link to a roster row that no longer exists grants nothing
      // and creates nothing: the account goes back through linking, where
      // linkGoogleAccount accepts only an ID that is on the roster.
      if (!record.exists) return { role: null, needsLink: true, email };
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
    // No displayName: the student ID is not a name, and an Auth profile that
    // calls the student '101410' is one more place for the ID to surface as one.
    await getAuth().createUser({ uid });
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
  // update() on a row that exists, never set(merge): clearing the link on an
  // ID with no roster row must not create one — a ghost row with no name that
  // the roster would then show as a bare ID.
  // FOLLOW-UP: like resetStudentPasscode, this asks only for a teacher, not
  // for this student's teacher of record (see setStudentSisId for the check).
  const rosterRow = await readStudentRosterPresence(db, studentId);
  if (rosterRow.exists) {
    await db.collection("grades").doc(studentId).update({ linkedEmail: FieldValue.delete() });
  }

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
  const identity = await studentIdentity();
  const [roster, credentials, directory, aliases, teachers, classes] = await Promise.all([
    // Only the shared roster fields — names (every field the name resolver
    // reads, googleName included), class membership, account state and the
    // small support profile. The rest of a grades document is the student's
    // entire attempt history and has no business in this payload.
    db.collection("grades").select(...identity.TEACHER_ROSTER_SELECT_FIELDS).get(),
    db.collection(authLib.CREDENTIALS_COLLECTION).get(),
    db.collection(authLib.DIRECTORY_COLLECTION).get(),
    db.collection(authLib.ALIAS_COLLECTION).get(),
    db.collection(authLib.TEACHER_COLLECTION).get(),
    loadClasses(db),
  ]);
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

  // One row per student from the shared projection: the name is resolved from
  // every name field on file (a Classroom-linked legacy student whose only
  // name is googleName keeps it) and never from the id. A student with no name
  // on file says so (nameMissing) and sorts after the named ones.
  const caller = callerEmail(request);
  const students = roster.docs
    .filter((rosterDoc) => rosterDoc.id !== "test_connection")
    .filter((rosterDoc) => isRootAdmin || String(rosterDoc.data()?.assignedTeacherEmail || "").trim().toLowerCase() === caller)
    .map((rosterDoc) => identity.buildTeacherRosterSummaryRow(rosterDoc.id, rosterDoc.data() || {}, {
      credential: credentialByStudent[rosterDoc.id],
      linkedEmail: emailByStudent[rosterDoc.id],
    }))
    .sort(identity.compareStudentIdentities);

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
  // Every new student has a real first and last name. A nameless account is
  // how '101410' ended up where a child's name belonged, so a request with no
  // name — or with the ID, an email or a placeholder typed as one — is refused
  // here, not only in the form.
  const identity = await studentIdentity();
  const validatedName = identity.validateStudentNameInput(
    { firstName, lastName },
    { studentId, sisStudentId: studentId },
  );
  if (!validatedName.ok) throw new HttpsError("invalid-argument", validatedName.error);
  ({ firstName, lastName } = validatedName);
  const { displayName } = validatedName;

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
  // The new account's number is also its district ID, so another student must
  // not already answer to it — above all one whose district ID a teacher
  // corrected TO this number (setStudentSisId). Same rule, same shared module.
  const districtIds = await studentDistrictIds();
  const districtIdHolders = await db.collection("grades")
    .where("sisStudentId", "in", districtIds.districtStudentIdVariants(studentId))
    .select("sisStudentId")
    .limit(5)
    .get();
  const districtConflict = districtIds.findDistrictStudentIdConflict({
    studentId,
    districtId: studentId,
    districtIdHolders: districtIdHolders.docs.map((entry) => entry.id),
    accountIdHolders: rosterSnapshot.docs.map((entry) => entry.id).filter((id) => districtIds.sameDistrictStudentId(id, studentId)),
    creating: true,
  });
  if (districtConflict) throw new HttpsError("already-exists", districtConflict.message);

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
  // A student created straight into a class whose Live Challenge is on.
  if (membership.classId || assignedTeacherEmail) await inviteStudentToClassLiveChallengeSafely(db, studentId);

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
  // A question still waiting follows the student to this teacher (TT26).
  if (assignedTeacherEmail) {
    await handOverOpenTeacherQuestions(db, studentId, {
      teacherOfRecord: assignedTeacherEmail,
      classId: studentSnapshot.data()?.classId ?? null,
    }, async (docs, change) => {
      const batch = db.batch();
      let queued = 0;
      docs.forEach((entry) => {
        const patch = change(entry);
        if (patch) { batch.set(entry.ref, patch, { merge: true }); queued += 1; }
      });
      if (queued) await batch.commit();
      return queued;
    });
  }
  await writeAdminAudit(db, actor, "student_teacher_assignment_changed", studentId, { assignedTeacherEmail, classPeriod });
  if (assignedTeacherEmail) await inviteStudentToClassLiveChallengeSafely(db, studentId);
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
  // The students' stored teachers as they are BEFORE the restamp: what says
  // which of them it newly puts under the class's teacher, and so who is
  // invited into that teacher's game below, if one is on (LC02).
  let storedTeachers = [];
  const periodChanged = !isNew && existing?.period !== record.period;
  const teacherChanged = !isNew && (existing?.teacherOfRecord || null) !== record.teacherOfRecord;
  if (periodChanged || teacherChanged) {
    const members = await db.collection("grades").where("classId", "==", ref.id).get();
    storedTeachers = members.docs.map((member) => ({ studentId: member.id, assignedTeacherEmail: member.data()?.assignedTeacherEmail ?? null }));
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
  // The roster change is whole, and audited, before any game is asked; a game
  // that cannot be reached never fails it.
  await inviteStudentsToClassLiveChallengeSafely(db, (bulk) => bulk.movedByClassRestamp({ members: storedTeachers, teacherEmail: record.teacherOfRecord }));
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

    // A student the migration attached to a class whose teacher has a game on
    // is invited into it, as setStudentClass would (LC02).
    await inviteStudentsToClassLiveChallengeSafely(db, (bulk) => bulk.movedFromMigrationUpdates(plan.studentUpdates));
  }

  return { dryRun, ...plan.report };
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
 * Root-admin action: take attendance-extension details off the shared
 * assignment documents (PR #407 deep dive F-PRIV-1).
 *
 * Every student can read `assignments/{id}`; extensions granted before this
 * release stored the student's absence dates, meeting counts and the granting
 * teacher there. For each such extension the whole stored object (verbatim)
 * becomes a private grant record under the student FIRST — in the same
 * transaction that reduces the shared copy to the deadline stub — so nothing
 * leaves the shared document without landing in the private one
 * (shared/assignmentPrivacy.mjs planAssignmentPrivacyMigration).
 *
 * `dryRun` (the default) reports without writing. Idempotent: a stub is left
 * alone and a grant record that already exists is never rewritten, so a second
 * run plans nothing.
 */
exports.migrateAssignmentPrivacy = onCall({ timeoutSeconds: 540 }, async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const privacy = await import("./shared/assignmentPrivacy.mjs");
  const dryRun = request.data?.dryRun !== false;
  const grantsFor = (studentId) => db.collection("grades").doc(studentId).collection(privacy.ATTENDANCE_EXTENSION_GRANTS_COLLECTION);

  const roster = await db.collection("grades").select("classId", "assignedTeacherEmail").get();
  const studentsById = Object.fromEntries(roster.docs.map((entry) => [entry.id, entry.data() || {}]));
  const flagSnapshot = await db.collection(privacy.PLATFORM_FLAGS_COLLECTION).doc(privacy.ASSIGNMENT_READ_SCOPE_FLAG).get();

  const totals = {
    dryRun,
    assignmentsScanned: 0,
    assignmentsWithDetails: 0,
    extensionsMinimized: 0,
    extensionsAlreadyMinimal: 0,
    grantRecordsCreated: 0,
    failures: [],
  };

  const PAGE = 200;
  let cursor = null;
  for (;;) {
    let query = db.collection("assignments").orderBy(FieldPath.documentId()).select("studentOverrides").limit(PAGE);
    if (cursor) query = query.startAfter(cursor);
    // eslint-disable-next-line no-await-in-loop
    const page = await query.get();
    for (const assignmentDoc of page.docs) {
      totals.assignmentsScanned += 1;
      const overrides = assignmentDoc.data()?.studentOverrides || {};
      const candidates = Object.keys(overrides)
        .filter((studentId) => privacy.extensionNeedsMinimizing(overrides[studentId]?.extension));
      totals.extensionsAlreadyMinimal += Object.keys(overrides).length - candidates.length;
      if (!candidates.length) continue;
      totals.assignmentsWithDetails += 1;
      try {
        // Re-read and re-plan inside the transaction: a teacher granting an
        // extension at the same moment must not have their new stub replaced
        // by an older one.
        // eslint-disable-next-line no-await-in-loop
        const outcome = await db.runTransaction(async (transaction) => {
          const fresh = await transaction.get(assignmentDoc.ref);
          const assignment = fresh.data() || {};
          const freshOverrides = assignment.studentOverrides || {};
          const ids = Object.keys(freshOverrides)
            .filter((studentId) => privacy.extensionNeedsMinimizing(freshOverrides[studentId]?.extension));
          const grantRefs = ids.map((studentId) => grantsFor(studentId).doc(privacy.legacyExtensionGrantId(assignmentDoc.id)));
          const existing = grantRefs.length ? await transaction.getAll(...grantRefs) : [];
          const existingGrantIds = new Set(existing.filter((snapshot) => snapshot.exists)
            .map((snapshot) => `${snapshot.ref.parent.parent.id}/${snapshot.id}`));
          const plan = privacy.planAssignmentPrivacyMigration({
            assignmentId: assignmentDoc.id,
            assignment,
            studentsById,
            existingGrantIds,
          });
          if (!plan.minimize.length) return { minimized: 0, created: 0 };
          // A transaction holds 500 writes: one update plus at most 400 grants.
          const chunk = plan.minimize.slice(0, 400);
          if (!dryRun) {
            const fieldsAndValues = [];
            chunk.forEach((entry) => {
              if (entry.createGrant) {
                transaction.create(grantsFor(entry.studentId).doc(entry.grantId), {
                  ...entry.grantRecord,
                  migratedAt: FieldValue.serverTimestamp(),
                });
              }
              fieldsAndValues.push(new FieldPath("studentOverrides", entry.studentId, "extension"), entry.stub);
            });
            transaction.update(assignmentDoc.ref, ...fieldsAndValues);
          }
          return {
            minimized: chunk.length,
            created: chunk.filter((entry) => entry.createGrant).length,
            remaining: plan.minimize.length - chunk.length,
          };
        });
        totals.extensionsMinimized += outcome.minimized;
        totals.grantRecordsCreated += outcome.created;
        if (outcome.remaining) totals.failures.push({ assignmentId: assignmentDoc.id, reason: `${outcome.remaining} more extensions — run again` });
      } catch (error) {
        totals.failures.push({ assignmentId: assignmentDoc.id, reason: String(error?.message || error).slice(0, 200) });
      }
    }
    if (page.size < PAGE) break;
    cursor = page.docs[page.docs.length - 1];
  }

  const report = {
    ...totals,
    studentListScoped: flagSnapshot.data()?.[privacy.STUDENT_LIST_SCOPED_FIELD] === true,
    // The shared documents are clean once a run plans nothing and nothing failed.
    sharedDocumentsClean: totals.failures.length === 0 && (dryRun ? totals.extensionsMinimized === 0 : true),
  };
  if (!dryRun) await writeAdminAudit(db, actor, "assignment_privacy_migrated", "assignments", report);
  return report;
});

/**
 * Root-admin action: turn class-scoped assignment lists for students on or off
 * (firestore.rules `assignments`; shared/assignmentPrivacy.mjs), and, as a
 * second independent switch, class-scoped opening of one assignment by id
 * (`studentGetScoped`, D10 Phase 0 P0-3).
 *
 * Off is the state a release ships in, so open student tabs from the previous
 * release keep their live assignment updates. Turn the list on once this
 * release has been live for a school day; the by-id switch only after that.
 * By-id on with lists off is never stored: turning by-id on while lists are
 * off, or lists off while by-id is on, is refused (both in one call is fine).
 * Turning either off again is the rollback (by-id first), and needs no deploy.
 * A call with neither boolean only reads.
 */
exports.setAssignmentReadScope = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const privacy = await import("./shared/assignmentPrivacy.mjs");
  const ref = db.collection(privacy.PLATFORM_FLAGS_COLLECTION).doc(privacy.ASSIGNMENT_READ_SCOPE_FLAG);
  const wantsList = typeof request.data?.studentListScoped === "boolean";
  const wantsGet = typeof request.data?.studentGetScoped === "boolean";
  // Read and write in one transaction: two racing calls (one turning lists
  // off, one turning the by-id switch on) cannot end in "by-id on, lists off",
  // because each re-checks the state it is about to leave behind.
  const outcome = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const stored = {
      studentListScoped: snapshot.data()?.[privacy.STUDENT_LIST_SCOPED_FIELD] === true,
      studentGetScoped: snapshot.data()?.[privacy.STUDENT_GET_SCOPED_FIELD] === true,
    };
    if (!wantsList && !wantsGet) return { ...stored, changed: false };
    const next = {
      studentListScoped: wantsList ? request.data.studentListScoped : stored.studentListScoped,
      studentGetScoped: wantsGet ? request.data.studentGetScoped : stored.studentGetScoped,
    };
    if (next.studentGetScoped && !next.studentListScoped) {
      throw new HttpsError(
        "failed-precondition",
        wantsGet && request.data.studentGetScoped
          ? "Turn on class-scoped assignment lists first: limiting who opens an assignment protects nothing while every assignment can still be listed."
          : "Turn off class-scoped opening of an assignment first: it protects nothing once every assignment can be listed again.",
      );
    }
    transaction.set(ref, {
      ...(wantsList ? { [privacy.STUDENT_LIST_SCOPED_FIELD]: next.studentListScoped } : {}),
      ...(wantsGet ? { [privacy.STUDENT_GET_SCOPED_FIELD]: next.studentGetScoped } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    }, { merge: true });
    return { ...next, changed: true };
  });
  if (!outcome.changed) return outcome;
  const next = outcome;
  if (wantsList) {
    await writeAdminAudit(
      db,
      actor,
      next.studentListScoped ? "assignment_read_scope_enforced" : "assignment_read_scope_relaxed",
      privacy.ASSIGNMENT_READ_SCOPE_FLAG,
      { studentListScoped: next.studentListScoped },
    );
  }
  if (wantsGet) {
    await writeAdminAudit(
      db,
      actor,
      next.studentGetScoped ? "assignment_get_scope_enforced" : "assignment_get_scope_relaxed",
      privacy.ASSIGNMENT_READ_SCOPE_FLAG,
      { studentGetScoped: next.studentGetScoped },
    );
  }
  return outcome;
});

/* =========================================================================
 * A STUDENT'S PRIVATE ASSIGNMENT CONTROLS (PR #415 I-4).
 *
 * Deadline, excusal, reopen and DOL attempt grants live in
 * `studentAssignmentOverrides` (shared/studentAssignmentOverrides.mjs), not on
 * the shared assignment every classmate receives. The callables below are the
 * only writers besides `applyStudentAttendanceExtension`; firestore.rules lets
 * no client write a record. See docs/architecture/
 * student-assignment-overrides.md for the stages and the deployment order.
 * ========================================================================= */
let studentOverrideStoreModule = null;
async function studentOverrideStore() {
  if (!studentOverrideStoreModule) studentOverrideStoreModule = await import("./shared/studentAssignmentOverrideStore.mjs");
  return studentOverrideStoreModule;
}

const STUDENT_CONTROLS_HTTPS_CODES = new Set([
  "invalid-argument", "permission-denied", "failed-precondition", "not-found", "unauthenticated",
]);

function translateStudentControlsError(error) {
  if (error?.name === "StudentControlsError") {
    const code = STUDENT_CONTROLS_HTTPS_CODES.has(error.code) ? error.code : "failed-precondition";
    return new HttpsError(code, error.message, error.detail || undefined);
  }
  if (error instanceof HttpsError) return error;
  logger.error("Student assignment controls failed", { message: String(error?.message || error) });
  return new HttpsError("internal", "That change could not be saved. Nothing was changed; try again.");
}

/**
 * A class's teacher of record (or the root administrator) grants extra DOL
 * attempts to, excuses, or reopens selected students on one assignment.
 * `{ assignmentId, classId, studentIds: [...], change: { kind: 'dolAttempts',
 * increment } | { kind: 'excused'|'reopened', value: boolean } }`.
 * Each student must currently belong to that class and the assignment must be
 * assigned to it; otherwise nothing is written.
 */
exports.setStudentAssignmentControls = onCall(async (request) => {
  const uid = await requireTeacher(request);
  const email = callerEmail(request);
  if (!email) throw new HttpsError("permission-denied", "Sign in with a verified school email to change a student's controls.");
  const store = await studentOverrideStore();
  try {
    return await store.applyStudentControlsChange({
      db: getFirestore(),
      actor: { uid, email },
      isRootAdmin: authLib.isRootAdminEmail(email),
      assignmentId: request.data?.assignmentId,
      classId: request.data?.classId,
      studentIds: Array.isArray(request.data?.studentIds) ? request.data.studentIds : [],
      change: request.data?.change && typeof request.data.change === "object" ? request.data.change : {},
    });
  } catch (error) {
    throw translateStudentControlsError(error);
  }
});

/**
 * Root-admin action: one bounded pass of the staged migration — `backfill`
 * (copy shared per-student controls into private storage), `strip` (remove them
 * from the shared documents; refused until the shared copy is retired) or
 * `restore` (the rollback of a strip). Dry run by default; pass the returned
 * `nextCursor` as `startAfter` until `done`. Idempotent and safe to interrupt.
 */
exports.migrateStudentAssignmentOverrides = onCall({ timeoutSeconds: 540 }, async (request) => {
  const actor = await requireRootAdmin(request);
  const store = await studentOverrideStore();
  const gate = await overrideRetirementGate();
  const dryRun = request.data?.dryRun !== false;
  const mode = String(request.data?.mode || "backfill");
  const prefix = String(request.data?.assignmentIdPrefix || "").slice(0, 160).trim();
  // The destructive steps are deliberate actions of their own: a typed
  // confirmation, never just `dryRun: false` (a strip removes the shared copy;
  // a restore writes it back).
  if (!dryRun && mode === "strip" && String(request.data?.confirm || "") !== gate.STRIP_CONFIRMATION) {
    throw new HttpsError("invalid-argument", `Type "${gate.STRIP_CONFIRMATION}" to strip the shared copies. Run the dry run first.`);
  }
  if (!dryRun && mode === "restore" && String(request.data?.confirm || "") !== gate.RESTORE_CONFIRMATION) {
    throw new HttpsError("invalid-argument", `Type "${gate.RESTORE_CONFIRMATION}" to write the shared copies back.`);
  }
  // A strip only after a dry run of the same scope — run to the end, with no
  // failures, since the shared copy was retired (a canary's own dry run for a
  // canary strip; the full dry run for the full strip).
  if (!dryRun && mode === "strip") {
    const progress = await store.readOverrideMigrationProgress({ db: getFirestore() });
    const passes = prefix ? progress?.canaryPasses?.strip?.[prefix] : progress?.strip;
    const dry = passes?.lastCompletedDryRunPass || null;
    const retiredAtMs = Number(progress?.retirement?.retiredAtMs) || 0;
    if (!dry || Number(dry.failureCount) > 0 || (Number(dry.completedAtMs) || 0) < retiredAtMs) {
      throw new HttpsError("failed-precondition", "Run the strip's dry run to the end first — after retiring the shared copy, with no failures.");
    }
  }
  try {
    const report = await store.runOverrideMigration({
      db: getFirestore(),
      mode,
      dryRun,
      startAfter: request.data?.startAfter || null,
      maxAssignments: request.data?.maxAssignments,
      migrationRunId: String(request.data?.migrationRunId || "").slice(0, 80) || null,
      assignmentIdPrefix: prefix || null,
      actor,
    });
    if (!dryRun) {
      await writeAdminAudit(getFirestore(), actor, `student_assignment_overrides_${mode}`, "assignments", {
        ...report,
        failures: report.failures.slice(0, 20),
      });
    }
    return report;
  } catch (error) {
    throw translateStudentControlsError(error);
  }
});

let overrideRetirementGateModule = null;
async function overrideRetirementGate() {
  if (!overrideRetirementGateModule) overrideRetirementGateModule = await import("./shared/overrideRetirementGate.mjs");
  return overrideRetirementGateModule;
}

/**
 * What Hosting serves right now, read the way the release script reads it
 * (mathmaster-build.json is served no-cache): evidence for the retirement
 * gate's first condition, read by the server itself — never a browser's
 * claim. Unreachable (the emulator, a network failure) is reported as such;
 * the gate then needs the operator's explicit attestation instead.
 */
async function liveHostingBuild() {
  const gate = await overrideRetirementGate();
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR === "true") return { checked: false, reason: "emulator" };
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
  if (!project) return { checked: false, reason: "no-project" };
  if (typeof fetch !== "function") return { checked: false, reason: "no-fetch" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`https://${project}.web.app/mathmaster-build.json?ts=${Date.now()}`, {
      signal: controller.signal,
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) return { checked: false, reason: `http-${response.status}` };
    const manifest = await response.json();
    return {
      checked: true,
      gitSha: String(manifest?.gitSha || "") || null,
      builtAt: String(manifest?.builtAt || "") || null,
      capability: Number(manifest?.[gate.CLIENT_CUTOVER_CAPABILITY]) || 0,
    };
  } catch (error) {
    return { checked: false, reason: error?.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** A short, client-reported build stamp: kept as evidence, never trusted for the gate. */
const reportedBuild = (value) => (value && typeof value === "object" ? {
  gitSha: String(value.gitSha || "").slice(0, 40) || null,
  builtAt: String(value.builtAt || "").slice(0, 40) || null,
} : null);

/**
 * Root-admin action: the storage switch (platformFlags/assignmentOverrideStorage)
 * and the cutover record it depends on. `{ action }`:
 *
 *   status                 (default) the switch, the migration's progress and
 *                          the retirement gate, evaluated now;
 *   confirmClientCutover   record that the client release reading private
 *                          records is live — the server reads the live build
 *                          manifest itself; where it cannot, the request must
 *                          carry `attestHostingDeployed: true`. Stamped with the
 *                          SERVER's clock: the school-day clock starts here;
 *   retire                 `sharedRetired: true` — refused unless every gate in
 *                          shared/overrideRetirementGate.mjs passes (deployed;
 *                          live one full school day; a full backfill pass;
 *                          zero failures), re-checked in the transaction that
 *                          flips it, and only with `confirmation` typed and
 *                          `attestFullSchoolDay: true`;
 *   mirror                 `sharedRetired: false` — the rollback, never gated.
 *
 * `{ sharedRetired: true|false }` (the #432 shape) means retire / mirror.
 * Who acted and on what evidence goes to the root-only migration record and the
 * admin audit log — never onto the flag, which every signed-in client can read.
 */
exports.setAssignmentOverrideStorage = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const overrides = await studentOverrides();
  const gate = await overrideRetirementGate();
  const flagRef = db.collection("platformFlags").doc(overrides.OVERRIDE_STORAGE_FLAG);
  const progressRef = db.collection(overrides.PLATFORM_MIGRATIONS_COLLECTION).doc(overrides.OVERRIDE_MIGRATION_ID);
  const data = request.data && typeof request.data === "object" ? request.data : {};
  const action = typeof data.action === "string" && data.action
    ? data.action
    : typeof data.sharedRetired === "boolean" ? (data.sharedRetired ? "retire" : "mirror") : "status";
  const nowMs = Date.now();
  const readState = async () => {
    const [flagSnap, progressSnap] = await Promise.all([flagRef.get(), progressRef.get()]);
    return { storage: flagSnap.exists ? flagSnap.data() : null, migration: progressSnap.exists ? progressSnap.data() || {} : {} };
  };
  const report = (state, hosting, changed) => ({
    ...overrides.resolveOverrideStorageMode(state.storage),
    changed,
    migration: state.migration,
    readiness: gate.evaluateRetirementReadiness({ storage: state.storage, migration: state.migration, hosting, nowMs }),
  });
  const gateSummary = (readiness) => readiness.gates.map(({ id, ok, detail }) => ({ id, ok, detail }));

  if (action === "status") {
    return report(await readState(), await liveHostingBuild(), false);
  }

  if (action === "confirmClientCutover") {
    const hosting = await liveHostingBuild();
    const evidence = gate.hostingCutoverEvidence(hosting);
    if (evidence.state === "notDeployed") {
      await writeAdminAudit(db, actor, "student_assignment_overrides_cutover_refused", overrides.OVERRIDE_STORAGE_FLAG, { hosting: evidence });
      throw new HttpsError("failed-precondition", `Hosting still serves a build that does not read students' private records (${evidence.gitSha || "unknown build"}). Deploy this release's Hosting, then record it.`);
    }
    const attested = data.attestHostingDeployed === true;
    if (evidence.state !== "deployed" && !attested) {
      throw new HttpsError("invalid-argument", `MathMaster could not read the live build (${evidence.reason}). Confirm that this release's Hosting is deployed and live for everyone.`);
    }
    await db.runTransaction(async (transaction) => {
      const [flagSnap, progressSnap] = await Promise.all([transaction.get(flagRef), transaction.get(progressRef)]);
      if (flagSnap.exists && flagSnap.data()?.[overrides.SHARED_RETIRED_FIELD] === true) {
        throw new HttpsError("failed-precondition", "The shared copy is already retired.");
      }
      const current = progressSnap.exists ? progressSnap.data() || {} : {};
      transaction.set(progressRef, {
        ...current,
        cutover: {
          confirmedAtMs: nowMs,
          confirmedAt: FieldValue.serverTimestamp(),
          confirmedByUid: actor.uid,
          confirmedByEmail: actor.email || null,
          hosting: evidence,
          hostingVerified: evidence.state === "deployed",
          hostingAttested: evidence.state !== "deployed" && attested,
          clientBuild: reportedBuild(data.clientBuild),
          servedBuildSeenByBrowser: reportedBuild(data.servedBuild),
          functionsBuild: { gitSha: deployProvenance.gitSha || null, treeClean: deployProvenance.treeClean ?? null },
          previousConfirmedAtMs: Number(current.cutover?.confirmedAtMs) || null,
        },
      });
    });
    await writeAdminAudit(db, actor, "student_assignment_overrides_client_cutover_confirmed", overrides.OVERRIDE_STORAGE_FLAG, {
      hosting: evidence,
      hostingAttested: evidence.state !== "deployed" && attested,
      clientBuild: reportedBuild(data.clientBuild),
      functionsGitSha: deployProvenance.gitSha || null,
    });
    return report(await readState(), hosting, true);
  }

  if (action === "retire") {
    const hosting = await liveHostingBuild();
    const before = await readState();
    if (before.storage?.[overrides.SHARED_RETIRED_FIELD] === true) return report(before, hosting, false);
    const readiness = gate.evaluateRetirementReadiness({ storage: before.storage, migration: before.migration, hosting, nowMs });
    const refusal = gate.retirementRefusal({
      readiness,
      confirmation: data.confirmation,
      attestFullSchoolDay: data.attestFullSchoolDay === true,
    });
    if (refusal) {
      await writeAdminAudit(db, actor, "student_assignment_overrides_retire_refused", overrides.OVERRIDE_STORAGE_FLAG, {
        reason: refusal.message,
        gates: gateSummary(readiness),
      });
      throw new HttpsError(refusal.code, refusal.message, { gates: gateSummary(readiness) });
    }
    // Re-evaluated in the transaction that flips the switch: a backfill pass
    // or a cutover record that changed in between is decided on, not missed.
    const retired = await db.runTransaction(async (transaction) => {
      const [flagSnap, progressSnap] = await Promise.all([transaction.get(flagRef), transaction.get(progressRef)]);
      const current = progressSnap.exists ? progressSnap.data() || {} : {};
      const fresh = gate.evaluateRetirementReadiness({ storage: flagSnap.exists ? flagSnap.data() : null, migration: current, hosting, nowMs });
      if (fresh.sharedRetired) return fresh;
      if (!fresh.canRetire) {
        throw new HttpsError("failed-precondition", "The retirement gate changed while retiring. Check the status and try again.", { gates: gateSummary(fresh) });
      }
      transaction.set(flagRef, {
        [overrides.SHARED_RETIRED_FIELD]: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(progressRef, {
        ...current,
        retirement: {
          retiredAtMs: nowMs,
          retiredAt: FieldValue.serverTimestamp(),
          retiredByUid: actor.uid,
          retiredByEmail: actor.email || null,
          attestedFullSchoolDay: true,
          gates: gateSummary(fresh),
          hosting: fresh.hosting,
          cutoverConfirmedAtMs: fresh.confirmedAtMs,
          mirroredAgainAtMs: null,
        },
      });
      return fresh;
    });
    await writeAdminAudit(db, actor, "student_assignment_overrides_shared_retired", overrides.OVERRIDE_STORAGE_FLAG, {
      sharedRetired: true,
      gates: gateSummary(retired),
      hosting: retired.hosting,
      attestedFullSchoolDay: true,
    });
    return report(await readState(), hosting, true);
  }

  if (action === "mirror") {
    // The rollback: never gated. Writers mirror again from their next change;
    // `restore` writes the shared copy back for previous-release clients.
    // Rolling back a retirement also sets its cutover record aside: retiring
    // again starts over — the release recorded as live again, on fresh
    // evidence, and live one more full school day.
    await db.runTransaction(async (transaction) => {
      const [flagSnap, progressSnap] = await Promise.all([transaction.get(flagRef), transaction.get(progressRef)]);
      const wasRetired = flagSnap.exists && flagSnap.data()?.[overrides.SHARED_RETIRED_FIELD] === true;
      const current = progressSnap.exists ? progressSnap.data() || {} : {};
      transaction.set(flagRef, { [overrides.SHARED_RETIRED_FIELD]: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (wasRetired) {
        const next = { ...current };
        if (current.retirement && typeof current.retirement === "object") next.retirement = { ...current.retirement, mirroredAgainAtMs: nowMs };
        if (current.cutover && typeof current.cutover === "object") {
          next.previousCutover = { ...current.cutover, supersededAtMs: nowMs };
          next.cutover = null;
        }
        transaction.set(progressRef, next);
      }
    });
    await writeAdminAudit(db, actor, "student_assignment_overrides_shared_mirrored", overrides.OVERRIDE_STORAGE_FLAG, { sharedRetired: false });
    return report(await readState(), null, true);
  }

  throw new HttpsError("invalid-argument", "Unknown action. Use status, confirmClientCutover, retire or mirror.");
});

/**
 * THE ABSORBER. A client from the previous release (or a stale tab) can still
 * write per-student data onto a shared assignment — a teacher's whole-`dol`
 * DOL action carries `attemptGrantsByStudentId`. Whatever it wrote is moved
 * into private storage within seconds (the merge keeps the larger grant, so a
 * stale write can never take one away), and once the shared copy is retired it
 * is removed again. Idempotent: it re-reads everything in its own transactions.
 */
exports.absorbSharedStudentControls = onDocumentWritten(
  "assignments/{assignmentId}",
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const store = await studentOverrideStore();
    const outcome = await store.absorbSharedStudentControls({
      db: getFirestore(),
      assignmentId: event.params.assignmentId,
      before,
      after,
    });
    if (!outcome.skipped) {
      logger.info("Absorbed per-student controls from a shared assignment", {
        assignmentId: event.params.assignmentId,
        ...outcome,
      });
    }
  },
);

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
  // The new class's Live Challenge, if one is on (lobby or running) — after
  // the audit, so nothing it waits on can come between the move and its record.
  if (classRecord) await inviteStudentToClassLiveChallengeSafely(db, studentId);
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

/*
 * A STUDENT'S ENTRIES ON SHARED ASSIGNMENT DOCUMENTS.
 *
 * Every per-student collection disappears with the student, but an assignment
 * is shared: it kept `studentOverrides[studentId]` (an extension's dates), the
 * student's DOL attempt grant and their id inside the DOL recovery audit —
 * readable by every signed-in user, after the account was gone. Those entries
 * are removed here; the audit entry stays (it records a teacher's action) with
 * the id replaced by the deletion receipt (shared/assignmentPrivacy.mjs).
 *
 * Deletion is rare and explicit, so reading the collection's two relevant
 * fields once is acceptable; nothing else is written.
 */
async function removeStudentFromAssignmentDocuments(db, studentId, receipt, deleted) {
  const { planStudentRemovalFromAssignment } = await import("./shared/assignmentPrivacy.mjs");
  const snapshot = await db.collection("assignments")
    .select("studentOverrides", "dol", "excusedStudentIds", "reopenedStudentIds").get();
  let updated = 0;
  for (const assignmentDoc of snapshot.docs) {
    const plan = planStudentRemovalFromAssignment({ assignment: assignmentDoc.data() || {}, studentId, receipt });
    if (!plan.deletePaths.length && !plan.recoveryAudit && !plan.arrayRemovals.length) continue;
    const fieldsAndValues = [];
    plan.deletePaths.forEach((segments) => fieldsAndValues.push(new FieldPath(...segments), FieldValue.delete()));
    plan.arrayRemovals.forEach((field) => fieldsAndValues.push(new FieldPath(field), FieldValue.arrayRemove(studentId)));
    if (plan.recoveryAudit) fieldsAndValues.push(new FieldPath("dol", "recoveryAudit"), plan.recoveryAudit);
    // Sequential for the same reason as recursiveDeleteQuery below.
    // eslint-disable-next-line no-await-in-loop
    await assignmentDoc.ref.update(...fieldsAndValues);
    updated += 1;
  }
  if (updated) deleted.assignmentStudentEntries = Number(deleted.assignmentStudentEntries || 0) + updated;

  // The verbatim archives a strip kept (several students per document, root
  // admin only) lose this student's part too; the rest of each archive stays.
  const overrides = await studentOverrides();
  const archives = await db.collection(overrides.ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION)
    .where("studentIds", "array-contains", studentId).get();
  for (const archiveDoc of archives.docs) {
    const scrubbed = overrides.scrubStudentFromArchive(archiveDoc.data() || {}, studentId, `deleted-student:${receipt}`);
    // eslint-disable-next-line no-await-in-loop
    await archiveDoc.ref.set(scrubbed);
  }
  if (archives.size) deleted.assignmentOverrideArchiveEntries = Number(deleted.assignmentOverrideArchiveEntries || 0) + archives.size;
  return updated;
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

/*
 * A deleted student's Live Challenge footprint beyond Class Points: the match
 * they are in now, their item rewards (Practice Passes, badges) and their
 * standing inside finished match results and teacher reports. Results and
 * reports keep the rest of the class — they are the class's record — and lose
 * only this student's row. Both carry a `studentIds` query key for exactly this
 * purpose; reports written before that key existed are not reachable by query
 * and are recorded as a known gap in docs/architecture/live-challenge-engine.md.
 */
async function deleteStudentLiveChallengeFootprint(db, studentId, deleted) {
  // The match they are in now (lobby or running) has no result yet, so the
  // results query below cannot find it: their invite names the room. They
  // leave it whole: the private roster row (without it the match never writes
  // them again: no summary, no place in the final result or report, no
  // reward), their anonymous public row and device diagnostics, their own
  // summary, and the invite itself, which carries their room, alias and class.
  // One transaction that reads the invite and the roster row it deletes: a
  // round that closes at the same moment either committed first, and this
  // removes what it wrote, or reads the roster after them; and an invite that
  // moved to a new room in between (the teacher started the next match) is
  // read again, so the room the student leaves is the one the deleted invite
  // named (as updateLiveChallengeInvitesForRoom guards re-invitation). The
  // same invite also leads to a room retired before it finished.
  const inviteRef = db.collection(LIVE_CHALLENGE_INVITES).doc(studentId);
  const membership = await db.runTransaction(async (transaction) => {
    const inviteSnapshot = await transaction.get(inviteRef);
    if (!inviteSnapshot.exists) return null;
    const invite = inviteSnapshot.data() || {};
    const invitedRoomId = String(invite.roomId || "").trim();
    let rosterRowRemoved = false;
    if (invitedRoomId) {
      const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(invitedRoomId);
      const rosterRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(invitedRoomId).collection("players").doc(studentId);
      const rosterSnapshot = await transaction.get(rosterRef);
      const playerKey = String(rosterSnapshot.data()?.playerKey || invite.playerKey || "").trim();
      transaction.delete(rosterRef);
      transaction.delete(roomRef.collection("playerSummaries").doc(studentId));
      if (playerKey) {
        transaction.delete(roomRef.collection("players").doc(playerKey));
        transaction.delete(roomRef.collection("diagnostics").doc(playerKey));
      }
      rosterRowRemoved = rosterSnapshot.exists;
    }
    transaction.delete(inviteRef);
    return { rosterRowRemoved, roomId: invitedRoomId };
  });
  if (membership) {
    if (membership.rosterRowRemoved) deleted.liveChallengeRoomMemberships = 1;
    deleted.liveChallengeInvites = 1;
  }

  const grantsSnapshot = await db.collection("rewardGrants").where("studentId", "==", studentId).get();
  for (const grantDoc of grantsSnapshot.docs) {
    // eslint-disable-next-line no-await-in-loop
    await grantDoc.ref.delete();
  }
  if (grantsSnapshot.size) deleted.rewardGrants = grantsSnapshot.size;

  // Their own place in each match they played (liveChallengeRooms/{room}/
  // playerSummaries/{studentId}, keyed by their id): found through the match
  // results that list them, before the scrub below takes them off the list.
  const playedSnapshot = await db.collection(LIVE_CHALLENGE_MATCH_RESULTS).where("studentIds", "array-contains", studentId).get();
  let summariesDeleted = 0;
  for (const resultDoc of playedSnapshot.docs) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection(LIVE_CHALLENGE_ROOMS).doc(resultDoc.id).collection("playerSummaries").doc(studentId).delete();
    summariesDeleted += 1;
  }
  if (summariesDeleted) deleted.liveChallengePlayerSummaries = summariesDeleted;

  // Their rows in the private round results (liveChallengePrivate/{room}/
  // rounds/{n}: named standings, SI13). A finished match's private state is
  // removed by its finalization, but a room retired before it finished keeps
  // it, and no sweep removes it. The invite names that room; a played match
  // whose private cleanup has not run yet is listed by its result. Read after
  // the transaction above: no round closed later can name them again.
  const roomIds = new Set([membership?.roomId, ...playedSnapshot.docs.map((resultDoc) => resultDoc.id)].filter(Boolean));
  let roundsScrubbed = 0;
  for (const roomId of roomIds) {
    // eslint-disable-next-line no-await-in-loop
    const rounds = await db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId).collection("rounds").get();
    for (const roundDoc of rounds.docs) {
      const standings = Array.isArray(roundDoc.data()?.standings) ? roundDoc.data().standings : [];
      if (!standings.some((row) => row?.studentId === studentId)) continue;
      // eslint-disable-next-line no-await-in-loop
      await roundDoc.ref.set({ standings: standings.filter((row) => row?.studentId !== studentId) }, { merge: true });
      roundsScrubbed += 1;
    }
  }
  if (roundsScrubbed) deleted.liveChallengePrivateRoundsScrubbed = roundsScrubbed;

  const scrub = async (collectionName, patchOf) => {
    const snapshot = await db.collection(collectionName).where("studentIds", "array-contains", studentId).get();
    for (const recordDoc of snapshot.docs) {
      // eslint-disable-next-line no-await-in-loop
      await recordDoc.ref.set(patchOf(recordDoc.data() || {}), { merge: true });
    }
    return snapshot.size;
  };
  const resultsScrubbed = await scrub(LIVE_CHALLENGE_MATCH_RESULTS, (data) => ({
    studentIds: (Array.isArray(data.studentIds) ? data.studentIds : []).filter((id) => id !== studentId),
    ...(Array.isArray(data.standings) ? { standings: data.standings.filter((row) => row?.studentId !== studentId) } : {}),
  }));
  if (resultsScrubbed) deleted.liveChallengeMatchResultsScrubbed = resultsScrubbed;
  // Every row a report names them in, a question-set mode's own player rows
  // included (lineGraph / graphFeatureRush / inequalityRush; SI07) — the class's totals stay.
  const reportRules = await liveChallengeReportRules();
  const reportsScrubbed = await scrub(LIVE_CHALLENGE_REPORTS, (data) => reportRules.reportRowsWithout(data, (id) => id === studentId));
  if (reportsScrubbed) deleted.liveChallengeReportsScrubbed = reportsScrubbed;
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

  // The FIRST write marks the roster row (SI07): a Live Challenge finishing
  // while this runs reads the row in each effect's transaction and pays,
  // credits and reports this student no more (studentDeletionMark.mjs). The
  // row, mark and all, is deleted below; a retry finds it marked and goes on.
  if (rosterSnapshot.exists) {
    const { STUDENT_DELETION_MARK } = await studentDeletionMark();
    await rosterRef.update({ [STUDENT_DELETION_MARK]: FieldValue.serverTimestamp() });
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
  await deleteStudentLiveChallengeFootprint(db, studentId, deleted);

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

  // Preserve accountability without retaining the deleted student's ID in the
  // audit collection. The short irreversible digest is only a deletion receipt.
  const receipt = crypto.createHash("sha256").update(studentKey).digest("hex").slice(0, 16);
  // The student's entries on shared assignments go FIRST. The absorber trigger
  // copies whatever a shared assignment still names into private storage
  // (studentAssignmentOverrides.mjs); removing the entries before the private
  // records and the roster row means any absorber run either committed before
  // this (and what it wrote is deleted below) or no longer finds the student.
  await removeStudentFromAssignmentDocuments(db, studentId, receipt, deleted);

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

/*
 * A STUDENT ADDED TO A CLASS WHILE ITS GAME IS ON.
 *
 * createLiveChallenge invites the class as it stands at create time. A student
 * enrolled after that sat the game out until the next one. Now the roster
 * change itself invites them into the class's game while it is still in its
 * lobby or running, exactly as if they had been on the roster and arrived
 * late (live-challenge-shell.md §10): the next seat and code name, an invite
 * their screen follows at once, and joinLiveChallenge's late-join rule —
 * they play from the round that is open now, and no round that closed
 * before is counted against them. Grand Prix sizes each round's field from
 * who played it, so a late player changes nobody's earlier rounds.
 *
 * Never takes a student out of another game: an invite to a different room
 * that is still live is left alone. Only a game active in the last 12 hours.
 * Never fails the roster change.
 *
 * A STUDENT MOVED BETWEEN TWO CLASSES THAT BOTH HAVE A GAME STAYS IN THE FIRST
 * (decided 2026-10-25, LC02 / C2-44; pinned by the integration test "a student
 * already in another live game is not pulled out of it"). Leaving a game is a
 * removal — their seat, their points so far, a graded Warm-Up's grade — and
 * the game has no teacher-side removal yet (live-challenge-shell.md §14), so
 * nothing here ever takes a student out of a room. The new class's game
 * invites them once the first one ends or is cancelled and the roster is
 * touched again, or in its next game.
 *
 * The callers: one student at a time (setStudentClass,
 * assignStudentToTeacher, createStudentAccount) and, for a bulk roster change,
 * saveClass and migrateClassesFromPeriods through
 * inviteStudentsToClassLiveChallengeSafely (liveChallengeBulkInvite.mjs).
 */
// A game idle longer than this is not "on" for a newly enrolled student.
const LIVE_CHALLENGE_LATE_INVITE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

async function inviteStudentToClassLiveChallenge(db, studentId) {
  const id = String(studentId || "").trim();
  if (!id) return { invited: false, reason: "no_student" };
  const challenge = await liveChallengeRules();
  const { experience } = await liveChallengeEngine();
  const gradeRef = db.collection("grades").doc(id);
  const gradeSnapshot = await gradeRef.get();
  const grade = gradeSnapshot.exists ? gradeSnapshot.data() || {} : null;
  const teacherEmail = String(grade?.assignedTeacherEmail || "").trim().toLowerCase();
  if (!teacherEmail) return { invited: false, reason: "no_teacher" };
  // One active room per teacher: the pointer names it.
  const pointer = await db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(teacherEmail).get();
  const roomId = String(pointer.data()?.roomId || "").trim();
  if (!roomId) return { invited: false, reason: "no_game" };

  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const playerRef = privateRef.collection("players").doc(id);
  const inviteRef = db.collection(LIVE_CHALLENGE_INVITES).doc(id);
  const live = (status) => [challenge.LIVE_CHALLENGE_STATUS.LOBBY, challenge.LIVE_CHALLENGE_STATUS.RUNNING].includes(status);
  return db.runTransaction(async (transaction) => {
    const [roomSnapshot, privateSnapshot, playerSnapshot, inviteSnapshot, latestGrade] = await Promise.all([
      transaction.get(roomRef), transaction.get(privateRef), transaction.get(playerRef), transaction.get(inviteRef), transaction.get(gradeRef),
    ]);
    if (!roomSnapshot.exists || !privateSnapshot.exists) return { invited: false, reason: "no_game" };
    const room = roomSnapshot.data() || {};
    const student = latestGrade.data() || {};
    if (!live(room.status) || room.teacherEmail !== teacherEmail) return { invited: false, reason: "no_game" };
    // Today's game, not a lobby left open since yesterday: measured from the
    // room's latest activity — its round's start, its last change — so a game
    // created last night and started this morning is today's.
    const activeMs = Math.max(
      ...[room.createdAt, room.updatedAt, room.startsAt, room.roundStartedAt, room.roundClosedAt]
        .map((value) => toDate(value)?.getTime() ?? 0),
    );
    if (Date.now() - activeMs > LIVE_CHALLENGE_LATE_INVITE_MAX_AGE_MS) return { invited: false, reason: "stale_game" };
    // The same membership rule as loadChallengeRoster.
    const inClass = room.classId
      ? String(student.classId || "") === String(room.classId)
      : Boolean(room.classPeriod) && !student.classId && String(student.classPeriod || "") === String(room.classPeriod);
    if (!inClass || String(student.assignedTeacherEmail || "").trim().toLowerCase() !== teacherEmail) {
      return { invited: false, reason: "not_in_class" };
    }
    if (playerSnapshot.exists) return { invited: false, reason: "already_invited", roomId };
    const otherRoomId = inviteSnapshot.exists ? String(inviteSnapshot.data()?.roomId || "") : "";
    if (otherRoomId && otherRoomId !== roomId) {
      const otherRoom = await transaction.get(db.collection(LIVE_CHALLENGE_ROOMS).doc(otherRoomId));
      if (otherRoom.exists && live(otherRoom.data()?.status)) return { invited: false, reason: "in_another_game" };
    }
    // The next seat, and its code name from the room's own seed — the one
    // createLiveChallenge would have given the next student — under the
    // room's name setting: their name in a game played with names.
    const slot = Math.max(0, Number(room.eligibleCount) || 0);
    const aliasSeed = parseInt(crypto.createHash("sha256").update(roomId).digest("hex").slice(0, 6), 16);
    const player = {
      playerKey: crypto.randomUUID(),
      slot,
      ...experience.seatAliasUnder({ room, student, studentId: id, player: { codeAlias: challenge.challengeAlias(slot, aliasSeed) } }),
    };
    transaction.set(playerRef, {
      ...player,
      joined: false,
      score: 0,
      correctCount: 0,
      roundsAnswered: 0,
      streak: 0,
      answeredRound: -1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(inviteRef, {
      roomId,
      title: room.title || null,
      teacherEmail,
      assignmentId: room.assignmentId || null,
      classId: room.classId || null,
      classPeriod: room.classPeriod || null,
      className: room.className || null,
      courseId: room.courseId || null,
      alias: player.alias,
      playerKey: player.playerKey,
      slot,
      // A running game's invites say so (startLiveChallenge set the rest).
      status: room.status === challenge.LIVE_CHALLENGE_STATUS.RUNNING ? "running" : "invited",
      updatedAt: FieldValue.serverTimestamp(),
    });
    // The console's "Joined X of N" and its roster read follow the class.
    transaction.set(roomRef, { eligibleCount: slot + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { invited: true, roomId, status: room.status };
  });
}

/** After a roster change: invite the student to their class's game, if one is on. Never throws. */
async function inviteStudentToClassLiveChallengeSafely(db, studentId) {
  try {
    const outcome = await inviteStudentToClassLiveChallenge(db, studentId);
    if (outcome.invited) logger.info("liveChallenge.lateInvite", { roomId: outcome.roomId, status: outcome.status });
    return outcome;
  } catch (error) {
    logger.error("liveChallenge.lateInvite.failed", { message: error?.message || String(error) });
    return { invited: false, reason: "failed" };
  }
}

// A BULK roster change's invites (saveClass, migrateClassesFromPeriods): the
// rules are pure and live beside the single invite's, in
// shared/liveChallengeBulkInvite.mjs.
let liveChallengeBulkInviteModule = null;
async function liveChallengeBulkInvite() {
  if (!liveChallengeBulkInviteModule) liveChallengeBulkInviteModule = await import("./shared/liveChallengeBulkInvite.mjs");
  return liveChallengeBulkInviteModule;
}

/**
 * After a BULK roster change: invite the students it moved into their
 * teacher's game, if one is on — each through the safe single invite, so the
 * same rules apply (never out of another game, only a game active in the last
 * 12 hours). One small read per teacher; only a teacher with a game is asked
 * about their students, one at a time, within a time budget. Never throws:
 * the roster change is already made. `moved` is the list of moves, or a
 * function of the rules module that makes it, so nothing about who moved is
 * worked out outside this guard.
 */
async function inviteStudentsToClassLiveChallengeSafely(db, moved) {
  try {
    const bulk = await liveChallengeBulkInvite();
    const summary = await bulk.inviteMovedStudents({
      moved: typeof moved === "function" ? await moved(bulk) : moved,
      hasGame: async (teacherEmail) => Boolean(String((await db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(teacherEmail).get()).data()?.roomId || "").trim()),
      invite: (studentId) => inviteStudentToClassLiveChallengeSafely(db, studentId),
    });
    if (summary.invited || summary.notReached) logger.info("liveChallenge.bulkLateInvite", summary);
    return summary;
  } catch (error) {
    logger.error("liveChallenge.bulkLateInvite.failed", { message: error?.message || String(error) });
    return { considered: 0, invited: 0, notReached: 0, failed: true };
  }
}

/**
 * Teacher action: set or CORRECT a student's district (SIS) ID — the number
 * Grade Export writes into every TEAMS file for this student.
 *
 * This is how a student whose MathMaster account was created with a mistyped
 * but valid-looking number (account 123456, district record 123465) gets
 * their grades onto their real district record. Only grades/{studentId}
 * .sisStudentId and its verification stamp change. The account ID does not,
 * so nothing keyed by it moves: attempts, grades, evidence, rewards, supports,
 * Classroom links, the PIN credential, sign-in aliases and the Google link all
 * stay exactly where they are, and the student signs in exactly as before.
 * See functions/shared/studentDistrictId.mjs for what each ID is for.
 *
 * Authorized like setStudentName: the root administrator, the student's
 * roster teacher, or the teacher of record of the student's class. Refused,
 * writing nothing, when the number is not 1–20 digits or when another student
 * already answers to it (the shared duplicate rule — a stored district ID or
 * an account ID, leading zeros ignored). The duplicate check, the write and
 * the audit entry are one transaction, and every read is a field mask: no
 * student's attempt history is loaded. The audit entry keeps the previous
 * district ID, so a correction can always be traced and undone.
 */
exports.setStudentSisId = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const districtIds = await studentDistrictIds();
  const studentId = String(request.data?.studentId || "").trim();
  if (!studentId || studentId.length > 180 || studentId.includes("/")) {
    throw new HttpsError("invalid-argument", "studentId is required.");
  }
  const checked = districtIds.validateDistrictStudentIdInput(request.data?.sisStudentId);
  if (!checked.ok) throw new HttpsError("invalid-argument", checked.error);
  const sisStudentId = checked.value;
  const email = callerEmail(request);
  const isRootAdmin = request.auth?.token?.rootAdmin === true && authLib.isRootAdminEmail(email);
  const studentRef = db.collection("grades").doc(studentId);
  const auditRef = db.collection(authLib.ADMIN_AUDIT_COLLECTION).doc();
  // Every way this number can be stored (leading zeros do not make a
  // different district number): at most 20, so one `in` query and one getAll.
  const variants = districtIds.districtStudentIdVariants(sisStudentId);

  return db.runTransaction(async (transaction) => {
    const [snapshot] = await transaction.getAll(studentRef, { fieldMask: ["assignedTeacherEmail", "classId", "sisStudentId"] });
    if (!snapshot.exists) throw new HttpsError("not-found", "That student is not on the MathMaster roster.");
    const student = snapshot.data() || {};
    const classId = String(student.classId || "").trim();

    let authorized = districtIds.mayChangeStudentDistrictId({ callerEmail: email, isRootAdmin, student });
    if (!authorized && classId) {
      const classSnapshot = await transaction.get(db.collection(CLASS_COLLECTION).doc(classId));
      authorized = districtIds.mayChangeStudentDistrictId({
        callerEmail: email,
        isRootAdmin,
        student,
        classRecord: classSnapshot.exists ? classSnapshot.data() || {} : null,
      });
    }
    if (!authorized) throw new HttpsError("permission-denied", "Only this student's teacher of record can change the student's district ID.");

    // Every other record that already answers to this number — as its stored
    // district ID, or as its account ID. Ids and one field only.
    const [districtIdHolders, accountIdHolders] = await Promise.all([
      transaction.get(db.collection("grades").where("sisStudentId", "in", variants).select("sisStudentId").limit(5)),
      transaction.getAll(...variants.map((variant) => db.collection("grades").doc(variant)), { fieldMask: ["sisStudentId"] }),
    ]);
    const conflict = districtIds.findDistrictStudentIdConflict({
      studentId,
      districtId: sisStudentId,
      districtIdHolders: districtIdHolders.docs.map((entry) => entry.id),
      accountIdHolders: accountIdHolders.filter((entry) => entry.exists).map((entry) => entry.id),
    });
    if (conflict) throw new HttpsError("already-exists", conflict.message);

    const change = districtIds.districtIdChangeRecord({ studentId, student, districtId: sisStudentId, classId });
    transaction.update(studentRef, {
      sisStudentId,
      sisStudentIdVerifiedAt: FieldValue.serverTimestamp(),
      sisStudentIdVerifiedBy: email,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(auditRef, {
      actorUid: request.auth?.uid || null,
      actorEmail: email,
      action: "sis_student_id_set",
      target: studentId,
      details: change.details,
      createdAt: FieldValue.serverTimestamp(),
    });
    return change.response;
  });
});

/**
 * Teacher action: set or correct a student's name.
 *
 * This is how a student whose roster record has no usable name (an account
 * created before names were required, or a legacy row whose only name was a
 * Google Classroom copy) gets one, and how a misspelling is fixed. The people
 * who may set the SIS Student ID may set the name: the root administrator, the
 * student's roster teacher, or the teacher of record of the student's class.
 *
 * It writes ONLY the canonical name fields and their provenance — never an
 * attempt, a grade, an identifier or class membership — and reads the roster
 * record through a field mask, so the attempt history is never loaded.
 * Removing identityBackfill marks the name as a person's decision, so rolling
 * back an automated backfill can never undo it.
 */
exports.setStudentName = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const identity = await studentIdentity();
  const studentId = String(request.data?.studentId || "").trim();
  if (!studentId || studentId.length > 180 || studentId.includes("/")) {
    throw new HttpsError("invalid-argument", "studentId is required.");
  }
  const email = callerEmail(request);
  const isRootAdmin = request.auth?.token?.rootAdmin === true && authLib.isRootAdminEmail(email);
  const studentRef = db.collection("grades").doc(studentId);
  const auditRef = db.collection(authLib.ADMIN_AUDIT_COLLECTION).doc();
  const readMask = [...identity.STUDENT_IDENTITY_FIELDS, "assignedTeacherEmail", "classId", "sisStudentId", "status"];
  const storedText = (value) => (typeof value === "string" ? value : null);

  return db.runTransaction(async (transaction) => {
    const [snapshot] = await transaction.getAll(studentRef, { fieldMask: readMask });
    if (!snapshot.exists) throw new HttpsError("not-found", "That student is not on the MathMaster roster.");
    const student = snapshot.data() || {};

    let authorized = isRootAdmin
      || String(student.assignedTeacherEmail || "").trim().toLowerCase() === email;
    const classId = String(student.classId || "").trim();
    if (!authorized && classId) {
      const classSnapshot = await transaction.get(db.collection(CLASS_COLLECTION).doc(classId));
      authorized = classSnapshot.exists
        && String(classSnapshot.data()?.teacherOfRecord || "").trim().toLowerCase() === email;
    }
    if (!authorized) throw new HttpsError("permission-denied", "Only this student's teacher of record can change the student's name.");

    const validatedName = identity.validateStudentNameInput(
      { firstName: request.data?.firstName, lastName: request.data?.lastName },
      { studentId, sisStudentId: student.sisStudentId || "" },
    );
    if (!validatedName.ok) throw new HttpsError("invalid-argument", validatedName.error);
    const next = {
      firstName: validatedName.firstName,
      lastName: validatedName.lastName,
      displayName: validatedName.displayName,
    };
    const previous = {
      firstName: storedText(student.firstName),
      lastName: storedText(student.lastName),
      displayName: storedText(student.displayName),
    };

    transaction.update(studentRef, {
      ...next,
      nameUpdatedAt: FieldValue.serverTimestamp(),
      nameUpdatedBy: email,
      identityBackfill: FieldValue.delete(),
    });
    transaction.set(auditRef, {
      actorUid: request.auth?.uid || null,
      actorEmail: email,
      action: "student_name_set",
      target: studentId,
      details: { previous, next },
      createdAt: FieldValue.serverTimestamp(),
    });
    return { studentId, ...next };
  });
});
