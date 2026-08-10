const crypto = require("crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

const classroomLib = require("./lib/classroom");
const { encryptLaunchPayload, decryptLaunchToken } = require("./lib/linkToken");
const {
  GOOGLE_API_SECRETS,
  GOOGLE_AND_LINK_SECRETS,
  LINK_ENCRYPTION_KEY,
  readPublicEnv,
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
const {
  assignmentUsesTeacherReleasePolicy,
  assignmentFeedbackWasReleased,
  assignmentFeedbackIsHeld,
} = require("./lib/activityFeedback");
const mathPath = require("./lib/mathPath");
const labEvaluation = require("./lib/labEvaluation");
const secureExam = require("./lib/secureExam");
const adminPolicy = require("./lib/admin");
const rigorPolicy = require("./lib/rigorPolicy");

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
  return materials
    .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
    .map((item) => ({ title: item.title.trim(), url: item.url.trim() }))
    .filter((item) => item.title && /^https?:\/\//i.test(item.url))
    .slice(0, 20);
}

const clampPercent = (value) =>
  Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

function getQuestionCredit(record) {
  if (!record) return 0;
  if (record.status === "correct") return 1;
  return clampPercent(record.bestPartialCredit ?? record.partialCredit ?? 0) / 100;
}

function isQuestionTerminal(record) {
  const status = record?.status;
  return status === "correct" || status === "expired";
}

function calculateAssignmentGrade(assignmentTracker, questionCount) {
  if (!questionCount) return 0;
  let earnedCredit = 0;
  for (let index = 0; index < questionCount; index += 1) {
    earnedCredit += getQuestionCredit(assignmentTracker?.[index]);
  }
  return Math.round((earnedCredit / questionCount) * 100);
}

function isAssignmentComplete(assignmentTracker, questionCount) {
  if (!questionCount) return false;
  for (let index = 0; index < questionCount; index += 1) {
    if (!isQuestionTerminal(assignmentTracker?.[index])) return false;
  }
  return true;
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
    throw new HttpsError("permission-denied", "This action is restricted to the MathMaster root administrator.");
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
  const counts = {};

  const apply = async (ref, docs) => {
    let updated = 0;
    for (let index = 0; index < docs.length; index += 400) {
      const chunk = docs.slice(index, index + 400);
      const batch = db.batch();
      let queued = 0;
      chunk.forEach((entry) => {
        const change = auth.reauthorizeContext(entry.data() || {}, { classRecord });
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

  for (const collectionSpec of AUTHORIZED_CHILD_COLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(collectionSpec.path(studentId)).get();
    // eslint-disable-next-line no-await-in-loop
    counts[collectionSpec.label] = await apply(null, snapshot.docs);
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
async function ensureStudentRecord(db, studentId, { classPeriod } = {}) {
  const ref = db.collection("grades").doc(studentId);
  const snapshot = await ref.get();
  if (snapshot.exists) return snapshot.data() || {};

  const seed = {
    classPeriod: classPeriod || "Unassigned",
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
    const nextClaims = isRootAdmin
      ? { role: "teacher", admin: true, rootAdmin: true }
      : { role: "teacher" };
    if (
      token.role !== "teacher"
      || Boolean(token.admin) !== isRootAdmin
      || Boolean(token.rootAdmin) !== isRootAdmin
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
    return { role: "teacher", email, accessLevel: isRootAdmin ? "rootAdmin" : "teacher", rootAdmin: isRootAdmin };
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

  const studentId = await resolveCanonicalStudentId(db, key, typedId);
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

  const record = await ensureStudentRecord(db, studentId, { classPeriod: joinCode.classPeriod });
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

    classPeriod = joinCode.classPeriod || null;
    // If an administrator/teacher already placed this ID on a roster, first-
    // time setup must use that roster's class code. Knowing a code from a
    // different period is not enough to claim a pre-created student account.
    const rosterSnapshot = await db.collection("grades").select("classPeriod").get();
    const existingRoster = rosterSnapshot.docs.find((entry) => entry.id.trim().toUpperCase() === key);
    const assignedClassPeriod = existingRoster?.data()?.classPeriod || null;
    if (assignedClassPeriod && assignedClassPeriod !== "Unassigned" && classPeriod !== assignedClassPeriod) {
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
  if (existingRecord.exists && existingRecord.data()?.status === model.ACCOUNT_STATUS.DISABLED) {
    throw new HttpsError("permission-denied", "This MathMaster account is deactivated. Ask your teacher or campus administrator to reactivate it.");
  }

  const record = await ensureStudentRecord(db, studentId, { classPeriod });

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

/** Teacher action: rotate the join code for one class period. */
exports.issueClassJoinCode = onCall(async (request) => {
  const uid = await requireTeacher(request);
  const db = getFirestore();

  const classPeriod = String(request.data?.classPeriod ?? "").trim();
  if (!classPeriod) {
    throw new HttpsError("invalid-argument", "Choose a class period for this code.");
  }

  const existing = await db
    .collection(authLib.JOIN_CODE_COLLECTION)
    .where("classPeriod", "==", classPeriod)
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
    classPeriod,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
  });
  await batch.commit();

  return { code, classPeriod };
});

/** Teacher view of the active join code per class period. */
exports.listClassJoinCodes = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const snapshot = await db.collection(authLib.JOIN_CODE_COLLECTION).where("active", "==", true).get();
  return {
    codes: snapshot.docs.map((codeDoc) => {
      const data = codeDoc.data() || {};
      return { code: codeDoc.id, classPeriod: data.classPeriod || "Unassigned" };
    }),
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
    db.collection("grades").select("classPeriod", "classId", "status", "linkedEmail", "assignedTeacherEmail", "displayName").get(),
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

  const students = roster.docs
    .filter((rosterDoc) => rosterDoc.id !== "test_connection")
    .map((rosterDoc) => {
      const credential = credentialByStudent[rosterDoc.id];
      const data = rosterDoc.data() || {};
      return {
        studentId: rosterDoc.id,
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
    .sort((a, b) => a.studentId.localeCompare(b.studentId));

  return {
    students,
    // The classes every roster row refers to, so no screen has to guess what a
    // classId means or fetch them separately.
    classes: classes.sort((a, b) => String(a.period || "").localeCompare(String(b.period || ""))),
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

  const displayName = String(request.data?.displayName || "").trim().slice(0, 120);
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
  }
  const membership = model.membershipFieldsFor(classRecord);
  // Legacy callers may still pass a bare period; honoured only with no class.
  const classPeriod = classRecord
    ? membership.classPeriod
    : String(request.data?.classPeriod || model.UNASSIGNED_PERIOD).trim().slice(0, 80) || model.UNASSIGNED_PERIOD;

  let assignedTeacherEmail = classRecord?.teacherOfRecord || null;
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
    throw new HttpsError("already-exists", "That student ID already exists in MathMaster.");
  }

  const rosterRef = db.collection("grades").doc(studentId);
  await rosterRef.set({
    displayName: displayName || null,
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
  await db.collection(authLib.ALIAS_COLLECTION).doc(studentKey).set({
    key: studentKey,
    studentId,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeAdminAudit(db, actor, "student_account_created", studentId, {
    classId: membership.classId,
    classPeriod,
    assignedTeacherEmail,
    displayName: displayName || null,
  });
  return { studentId, displayName: displayName || null, classId: membership.classId, classPeriod, assignedTeacherEmail, signInSetupRequired: true };
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

/**
 * Which course's coverage index answers for a standard.
 *
 * The same rule the client's `courseIdForTeks` uses: an `A2.` code is Algebra
 * II, anything else is Algebra I. Prerequisites from earlier grades live in the
 * `offWheel` section of whichever course routed to them.
 */
function coverageCourseIdFor(alignmentKey) {
  return /^(texas:)?A2\./i.test(String(alignmentKey || "").trim()) ? "algebra2" : "algebra1";
}

let selectionModule = null;
async function pathSelection() {
  if (!selectionModule) selectionModule = await import("./shared/pathQuestionSelection.mjs");
  return selectionModule;
}

let promotionModule = null;
async function pathPromotion() {
  if (!promotionModule) promotionModule = await import("./shared/pathPromotion.mjs");
  return promotionModule;
}

/**
 * Promote an authored assignment question into the secure Path bank.
 *
 * The two banks stay distinct on purpose. Writing an assignment does not make
 * its questions trusted mastery content; a person has to say so, and the server
 * has to agree. The question is read from the assignment SERVER-SIDE — the
 * caller nominates which one, and never supplies its contents — so a browser
 * cannot promote a question that was never authored, or edit one on the way in.
 */
exports.promoteQuestionToPathBank = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const promotion = await pathPromotion();

  const assignmentId = String(request.data?.assignmentId || "").trim();
  const questionIndex = Number(request.data?.questionIndex);
  if (!assignmentId || !Number.isInteger(questionIndex) || questionIndex < 0) {
    throw new HttpsError("invalid-argument", "assignmentId and questionIndex are required.");
  }

  const assignmentSnapshot = await db.collection("assignments").doc(assignmentId).get();
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment no longer exists.");
  const question = (assignmentSnapshot.data()?.questions || [])[questionIndex];
  if (!question) throw new HttpsError("not-found", "That question is not in the assignment.");

  const evaluation = promotion.evaluatePromotion(question, { schemaResult: request.data?.schemaResult || null });
  if (!evaluation.canPromote) {
    throw new HttpsError("failed-precondition", evaluation.blocking.map((entry) => entry.detail || entry.label).join(" "), {
      reason: "promotion-blocked",
      checks: evaluation.checks,
    });
  }

  const record = promotion.buildPathBankRecord(question, {
    promotedBy: callerEmail(request),
    sourceAssignmentId: assignmentId,
    sourceQuestionIndex: questionIndex,
  });
  const bankId = promotion.pathBankIdFor({ sourceAssignmentId: assignmentId, sourceQuestionIndex: questionIndex });
  await db.collection("pathQuestionBank").doc(bankId).set(record, { merge: true });

  return { bankId, standards: evaluation.standards, toolId: evaluation.toolId, checks: evaluation.checks };
});

/**
 * Root-admin action: bootstrap the secure Path bank from a seed package.
 *
 * `pathQuestionBank` starts empty and is filled deliberately rather than
 * discovered to be empty by a student. This is how a reviewed starter set gets
 * in without anyone hand-creating Firestore documents.
 *
 * EVERY DOCUMENT IS VALIDATED BEFORE IT IS WRITTEN, by the same `buildIssuePlan`
 * the runtime uses to issue a question. A seed item that would not survive
 * production is rejected and reported, never stored — otherwise the bank fills
 * with content that counts toward coverage and fails in front of a child.
 *
 * IDEMPOTENT. Each item carries its own `id`; re-running replaces rather than
 * duplicating, so a partial import can simply be run again. `dryRun` validates
 * and reports without writing anything.
 */
exports.seedPathQuestionBank = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const dryRun = request.data?.dryRun === true;
  const items = Array.isArray(request.data?.items) ? request.data.items : [];
  if (!items.length) throw new HttpsError("invalid-argument", "Supply the seed items to import.");
  if (items.length > 600) throw new HttpsError("invalid-argument", "Import at most 600 items per call.");

  const accepted = [];
  const rejected = [];
  for (const item of items) {
    const id = String(item?.id || "").trim();
    // Every rejection names the document well enough to find and fix it.
    const describe = (reason) => ({
      id: id || null,
      familyId: item?.familyId || null,
      standards: (Array.isArray(item?.alignmentKeys) ? item.alignmentKeys : []).map((key) => String(key).replace(/^texas:/i, "").toUpperCase()),
      reason,
    });
    if (!id) { rejected.push(describe("missing_id")); continue; }
    // The exact production check. The gate must not be stricter than the
    // runtime, or content production would happily issue is refused here.
    // eslint-disable-next-line no-await-in-loop
    const plan = await mathPath.buildIssuePlan(item);
    if (!plan.issuable) { rejected.push(describe(plan.reason)); continue; }
    if (!Array.isArray(item.alignmentKeys) || item.alignmentKeys.length === 0) {
      rejected.push(describe("no_alignment_keys"));
      continue;
    }
    accepted.push({ ...item, id, active: item.active !== false });
  }

  // ALL OR NOTHING. A partially imported bank is the worst outcome: coverage
  // would report some standards ready and others not, and nobody could tell
  // whether that reflects the content or a half-finished import. So a single
  // failure writes nothing and reports everything.
  if (rejected.length) {
    return {
      dryRun,
      imported: false,
      received: items.length,
      accepted: 0,
      wouldAccept: accepted.length,
      rejected,
      standards: [],
    };
  }

  if (!dryRun && accepted.length) {
    for (let index = 0; index < accepted.length; index += 400) {
      const chunk = accepted.slice(index, index + 400);
      const batch = db.batch();
      chunk.forEach((record) => {
        const { id, ...fields } = record;
        batch.set(db.collection("pathQuestionBank").doc(id), {
          ...fields,
          seededAt: FieldValue.serverTimestamp(),
          seededBy: actor.uid,
        }, { merge: true });
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
    await writeAdminAudit(db, actor, "path_bank_seeded", "pathQuestionBank", {
      accepted: accepted.length,
      rejected: rejected.length,
    });
  }

  return {
    dryRun,
    imported: !dryRun,
    received: items.length,
    accepted: accepted.length,
    wouldAccept: accepted.length,
    rejected,
    // The standards this import supplies content for, so the caller can check
    // them against the coverage target without a second round trip.
    standards: [...new Set(accepted.flatMap((record) => record.alignmentKeys.map((key) => String(key).replace(/^texas:/i, "").toUpperCase())))].sort(),
  };
});

/** Remove a promoted question from the Path bank without touching the assignment. */
exports.withdrawQuestionFromPathBank = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const bankId = String(request.data?.bankId || "").trim();
  if (!bankId) throw new HttpsError("invalid-argument", "bankId is required.");
  // Deactivated rather than deleted: an evidence event already recorded against
  // it should still be able to name the question a student answered.
  await db.collection("pathQuestionBank").doc(bankId).set({ active: false, withdrawnAt: Date.now() }, { merge: true });
  return { bankId, active: false };
});

/**
 * Recompute the coverage index for one or more courses.
 *
 * Teacher-callable, because a teacher needs to know which standards their class
 * can actually practise. The write is server-side only.
 *
 * ISSUABILITY IS `buildIssuePlan` — the same function `issueNextQuestion` calls.
 * A question cannot count as coverage unless the server would really issue and
 * grade it, so this index and the runtime can never disagree about what exists.
 *
 * THE WHEEL LIST COMES FROM THE CALLER, and that is safe in the only direction
 * that matters. Deriving it server-side would mean importing the whole Texas
 * standards catalogue into the Functions bundle, which is not deployed with
 * `functions/`. Supplying it cannot make an uncovered skill launchable: a
 * standard absent from the index is not in `skills`, and `isSkillLaunchable`
 * fails closed on anything it does not find. A short or wrong list can only
 * make MORE skills unavailable, never fewer — it degrades the report, it cannot
 * open a dead end.
 */
exports.rebuildPathCoverage = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const coverage = await pathCoverage();

  const requestedCourses = Array.isArray(request.data?.courses) ? request.data.courses : [];
  const wheelByCourse = request.data?.wheelTeksByCourse && typeof request.data.wheelTeksByCourse === "object"
    ? request.data.wheelTeksByCourse
    : {};
  const courses = requestedCourses.length ? requestedCourses : Object.keys(wheelByCourse);
  if (!courses.length) {
    throw new HttpsError("invalid-argument", "Supply at least one course and its wheel standards.");
  }

  // One read of the bank for every course; a question may serve more than one.
  const bankSnapshot = await db.collection("pathQuestionBank").get();
  const bankItems = bankSnapshot.docs.map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }));

  const plans = {};
  for (const bankItem of bankItems) {
    // eslint-disable-next-line no-await-in-loop
    plans[bankItem.id] = await mathPath.buildIssuePlan(bankItem);
  }

  const indexes = {};
  for (const courseId of courses) {
    const wheelTeks = Array.isArray(wheelByCourse[courseId]) ? wheelByCourse[courseId] : [];
    if (!wheelTeks.length) {
      throw new HttpsError("invalid-argument", `No wheel standards were supplied for ${courseId}.`);
    }
    const index = coverage.buildCoverageIndex({
      courseId: String(courseId),
      wheelTeks,
      bankItems,
      plans,
      generatedAt: Date.now(),
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COVERAGE_COLLECTION).doc(String(courseId)).set(index);
    indexes[courseId] = index;
  }

  return { courses, indexes };
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
      await assignClaims(uid, { role: "teacher" });
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

  const deleted = {};

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
  return { url: classroomLib.buildAuthUrl(state) };
});

exports.oauthCallback = onRequest({ secrets: GOOGLE_API_SECRETS }, async (req, res) => {
  const { code, state, error } = req.query;
  const appBaseUrl = readPublicEnv("APP_BASE_URL", "/");

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
  if (!stateSnap.exists || stateSnap.data().expiresAt < Date.now()) {
    res.status(400).send("Invalid or expired OAuth state.");
    return;
  }
  await stateRef.delete();

  try {
    const tokens = await classroomLib.exchangeCodeForTokens(String(code));
    await classroomLib.saveTeacherTokens(tokens);
    res.redirect(302, `${appBaseUrl}?classroomConnected=1`);
  } catch (err) {
    logger.error("OAuth token exchange failed", err);
    res.redirect(302, `${appBaseUrl}?classroomError=token_exchange_failed`);
  }
});

exports.getClassroomConnectionStatus = onCall(async (request) => {
  await requireTeacher(request);
  return { connected: await classroomLib.isConnected() };
});

exports.getGoogleClassroomDiagnostics = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  async (request) => {
    await requireTeacher(request);
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

    checks.appBaseUrl = readPublicEnv("APP_BASE_URL");
    if (!checks.appBaseUrl) {
      problems.push(
        "APP_BASE_URL is not configured. Add it to functions/.env.mathmaster-aleks (see functions/.env.example) and redeploy."
      );
    }

    try {
      await getFirestore().doc("teacherIntegrations/default").get();
      checks.firestoreAvailable = true;
    } catch (err) {
      checks.firestoreAvailable = false;
      problems.push(`Firestore is unreachable: ${err.message}`);
    }

    checks.authUrlBuilds = false;
    if (checks.clientIdConfigured && checks.clientSecretConfigured && checks.redirectUri) {
      try {
        classroomLib.buildAuthUrl("diagnostics");
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
  await requireTeacher(request);
  const classroom = await classroomLib.getClassroomClient();
  return { courses: await classroomLib.listCourses(classroom) };
});

exports.listClassroomStudents = onCall({ secrets: GOOGLE_API_SECRETS }, async (request) => {
  await requireTeacher(request);
  const { courseId } = request.data || {};
  if (!courseId) throw new HttpsError("invalid-argument", "courseId is required.");
  const classroom = await classroomLib.getClassroomClient();
  return { students: await classroomLib.listStudents(classroom, String(courseId)) };
});

exports.linkStudentToClassroom = onCall(async (request) => {
  await requireTeacher(request);
  const { courseId, studentId, googleUserId, email, name } = request.data || {};
  if (!courseId || !studentId || !googleUserId) {
    throw new HttpsError(
      "invalid-argument",
      "courseId, studentId, and googleUserId are required."
    );
  }

  const cleanCourseId = String(courseId);
  const cleanStudentId = String(studentId).trim();
  const db = getFirestore();
  const rosterLinkId = rosterLinkDocumentId(cleanCourseId, cleanStudentId);

  await db.doc(`classroomRosterLinks/${rosterLinkId}`).set(
    {
      rosterLinkId,
      courseId: cleanCourseId,
      studentId: cleanStudentId,
      googleUserId: String(googleUserId),
      email: email || null,
      name: name || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const gradeRef = db.doc(`grades/${cleanStudentId}`);
  const gradeSnap = await gradeRef.get();
  await gradeRef.set(
    {
      ...(gradeSnap.exists
        ? {}
        : {
            classPeriod: "Unassigned",
            gradesByAssignment: {},
            assignmentActivity: {},
            dolGradesByAssignment: {},
            classworkGradesByAssignment: {},
            supportUsageByAssignment: {},
          }),
      // Retained only for backward compatibility with a legacy single-course
      // publication. New grade passback uses classroomRosterLinks by course.
      googleUserId: String(googleUserId),
      googleEmail: email || null,
      googleName: name || null,
      classroomCourseIds: FieldValue.arrayUnion(cleanCourseId),
    },
    { merge: true }
  );

  return { linked: true, rosterLinkId, courseId: cleanCourseId, studentId: cleanStudentId };
});

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

async function publishOneCourse({
  classroom,
  assignmentId,
  assignment,
  course,
  materials,
}) {
  const db = getFirestore();
  const courseId = String(course.id);
  const { ref: linkRef } = await resolvePublicationRef(db, assignmentId, courseId);
  const publicationId = linkRef.id;
  const dueAtValue = assignment.dueAt || assignment.dueDate || null;
  const baseRecord = {
    schemaVersion: 2,
    publicationId,
    assignmentId,
    courseId,
    courseName: course.name || courseId,
    courseSection: course.section || "",
    title: assignment.title,
    dueAt: serializableDate(dueAtValue),
    materials,
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
    // First recover an already-created item from an ambiguous prior attempt.
    let courseWork = null;
    const priorCourseworkId = claim.current.courseworkId;
    if (priorCourseworkId) {
      try {
        courseWork = await classroomLib.getCourseWork(
          classroom,
          courseId,
          priorCourseworkId
        );
      } catch {
        courseWork = null;
      }
    }
    if (!courseWork) {
      courseWork = await classroomLib.findCourseWorkByPublicationMarker(
        classroom,
        courseId,
        marker
      );
    }

    if (!courseWork) {
      courseWork = await classroomLib.createCourseWork(classroom, {
        courseId,
        title: assignment.title,
        description: `Complete "${assignment.title}" in MathMaster.\n\n${marker}`,
        dueDate: toDate(dueAtValue) || undefined,
        materials,
        launchUrl,
        maxPoints: 100,
      });
    }

    await finishPublication(linkRef, attemptId, {
      status: "published",
      courseworkId: courseWork.id,
      classroomUrl: courseWork.alternateLink || null,
      launchUrl,
      publishedAt: FieldValue.serverTimestamp(),
      // What was actually sent to Google. Staleness is derived by comparing
      // this with the assignment's current dueAt, so a fresh publish has to
      // record it or the post reads as out of date the moment it is created.
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
  await requireTeacher(request);
  const { assignmentId, materials } = request.data || {};
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
  const classroom = await classroomLib.getClassroomClient();
  const activeCourses = await classroomLib.listCourses(classroom);
  const courseMap = new Map(activeCourses.map((course) => [String(course.id), course]));
  const safeMaterials = cleanMaterials(materials);
  const results = [];

  // Publish sequentially. This avoids a burst of duplicate create calls and
  // gives the caller a complete per-course result even when one course fails.
  for (const courseId of courseIds) {
    const course = courseMap.get(courseId);
    if (!course) {
      results.push({
        courseId,
        courseName: courseId,
        status: "failed",
        error: "The connected teacher is not an active teacher in this course.",
      });
      continue;
    }
    results.push(
      await publishOneCourse({
        classroom,
        assignmentId: String(assignmentId),
        assignment,
        course,
        materials: safeMaterials,
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
  await requireTeacher(request);

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
    .filter((entry) => !requested || requested.has(String(entry.data.courseId)));

  if (!publications.length) {
    return { assignmentId: String(assignmentId), results: [], summary: { updated: 0, failed: 0, skipped: 0 } };
  }

  const classroom = await classroomLib.getClassroomClient();
  const results = [];

  for (const { ref, data } of publications) {
    const courseId = String(data.courseId);
    try {
      // Read the live item first so an association we must preserve — a grading
      // period, in particular — is carried into the patch rather than cleared
      // by omission.
      let existing = null;
      try {
        existing = await classroomLib.getCourseWork(classroom, courseId, data.courseworkId);
      } catch {
        existing = null;
      }
      if (!existing) {
        throw new Error(
          "That Classroom post no longer exists. Publish the assignment again to recreate it."
        );
      }

      const updated = await classroomLib.patchCourseWork(classroom, {
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

exports.listPublishedAssignments = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const snap = await db.collection("classroomLinks").limit(250).get();
  const links = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
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
    const appBaseUrl = readPublicEnv("APP_BASE_URL", "/");
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

exports.syncGradeToClassroom = onDocumentWritten(
  {
    document: "grades/{studentId}",
    secrets: GOOGLE_API_SECRETS,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after || !after.exists) return;

    const afterData = after.data();
    const beforeData = event.data?.before?.exists ? event.data.before.data() : {};
    const afterByAssignment = afterData.gradesByAssignment || {};
    const beforeByAssignment = beforeData.gradesByAssignment || {};
    const gradeChangedAssignmentIds = Object.keys(afterByAssignment).filter(
      (assignmentId) =>
        JSON.stringify(afterByAssignment[assignmentId]) !==
        JSON.stringify(beforeByAssignment[assignmentId])
    );
    const afterReleaseSignals = afterData.classroomReleaseSignals || {};
    const beforeReleaseSignals = beforeData.classroomReleaseSignals || {};
    const releaseSignaledAssignmentIds = Object.keys(afterReleaseSignals).filter(
      (assignmentId) =>
        JSON.stringify(afterReleaseSignals[assignmentId]) !==
        JSON.stringify(beforeReleaseSignals[assignmentId])
    );
    const changedAssignmentIds = [...new Set([
      ...gradeChangedAssignmentIds,
      ...releaseSignaledAssignmentIds,
    ])];
    if (changedAssignmentIds.length === 0) return;

    const db = getFirestore();
    let classroom = null;

    for (const assignmentId of changedAssignmentIds) {
      const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
      const assignment = assignmentSnap.exists ? assignmentSnap.data() : {};
      if (assignmentFeedbackIsHeld(assignment)) continue;
      const questionCount = assignmentSnap.exists
        ? (assignment.questions || []).length
        : 0;
      const assignmentTracker = afterByAssignment[assignmentId];
      if (!isAssignmentComplete(assignmentTracker, questionCount)) continue;

      const grade = calculateAssignmentGrade(assignmentTracker, questionCount);
      const publicationsSnap = await db
        .collection("classroomLinks")
        .where("assignmentId", "==", assignmentId)
        .get();
      const publications = publicationsSnap.docs.filter(
        (doc) => doc.data().status === "published" && doc.data().courseworkId
      );
      if (publications.length === 0) continue;
      if (!classroom) classroom = await classroomLib.getClassroomClient();

      for (const publicationDoc of publications) {
        const publication = publicationDoc.data();
        const courseId = String(publication.courseId || "");
        if (!courseId) continue;

        const rosterLinkId = rosterLinkDocumentId(
          courseId,
          event.params.studentId
        );
        const rosterLinkSnap = await db
          .doc(`classroomRosterLinks/${rosterLinkId}`)
          .get();
        const isLegacyPublication =
          publication.schemaVersion !== 2 || publicationDoc.id === assignmentId;
        const googleUserId = rosterLinkSnap.exists
          ? rosterLinkSnap.data().googleUserId
          : isLegacyPublication
            ? afterData.googleUserId
            : null;

        if (!googleUserId) {
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
            status: "skipped-unlinked",
            grade,
            message: "Student is not linked to this Classroom course.",
          });
          continue;
        }

        try {
          const submission = await classroomLib.findSubmissionForStudent(classroom, {
            courseId,
            courseWorkId: publication.courseworkId,
            googleUserId,
          });
          if (!submission) {
            await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
              assignmentId,
              courseId,
              courseworkId: publication.courseworkId,
              status: "submission-not-found",
              grade,
            });
            continue;
          }

          const patched = await classroomLib.patchGrade(classroom, {
            courseId,
            courseWorkId: publication.courseworkId,
            submissionId: submission.id,
            grade,
          });

          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
            submissionId: submission.id,
            submissionState: patched.state || submission.state || null,
            status: "synced",
            grade,
            syncedAt: FieldValue.serverTimestamp(),
          });
          logger.info(
            `Synced grade ${grade} for student ${event.params.studentId} to course ${courseId}, courseWork ${publication.courseworkId}`
          );
        } catch (err) {
          logger.error(
            `Grade passback failed for student ${event.params.studentId}, assignment ${assignmentId}, course ${courseId}`,
            err
          );
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
            status: "failed",
            grade,
            error: String(err.message || err),
          });
        }
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
          FieldValue.serverTimestamp()
        );
      });
      await batch.commit();
    }
    logger.info(`Queued released assessment grade passback for ${targets.length} student record(s) on assignment ${assignmentId}.`);
  }
);

// ---------------------------------------------------------------------------
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

/** Start or resume one server-owned learning-path session for a TEKS target. */
exports.startMyMathPathSession = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const targetAlignmentKey = mathPath.canonicalAlignmentKey(request.data?.targetAlignmentKey);
  if (!targetAlignmentKey) throw new HttpsError("invalid-argument", "targetAlignmentKey is required.");
  const sessionKind = request.data?.sessionKind === "retentionProbe" ? "retentionProbe" : "practice";
  const requiredQuestions = pathSessionRequiredQuestions(sessionKind, request.data?.requiredQuestions);
  const db = getFirestore();

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
      throw new HttpsError(
        "failed-precondition",
        coverage.explainCoverage(coverageForCourse.data(), targetAlignmentKey),
        { reason: "no-path-coverage" },
      );
    }
  }
  const lockId = mathPath.opaqueId("pathlock", studentId, targetAlignmentKey);
  const lockRef = db.collection("activePathLocks").doc(lockId);
  const proposedSessionRef = db.collection("pathSessions").doc();

  const session = await db.runTransaction(async (transaction) => {
    const lock = await transaction.get(lockRef);
    if (lock.exists && lock.data()?.sessionId) {
      const existingRef = db.collection("pathSessions").doc(lock.data().sessionId);
      const existing = await transaction.get(existingRef);
      if (existing.exists && existing.data()?.status === "active" && existing.data()?.studentId === studentId) {
        if (existing.data()?.sessionKind !== sessionKind) {
          throw new HttpsError("failed-precondition", "Finish the active session for this TEKS before starting a different check.");
        }
        return existing.data();
      }
    }

    const now = Date.now();
    const next = {
      sessionId: proposedSessionRef.id,
      studentId,
      status: "active",
      sessionKind,
      requiredQuestions,
      target: { alignmentKey: targetAlignmentKey },
      summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
      pathState: { counters: { questionsThisSession: 0 } },
      currentQuestion: null,
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(proposedSessionRef, next);
    transaction.set(lockRef, { sessionId: proposedSessionRef.id, studentId, targetAlignmentKey, sessionKind, updatedAt: now });
    return next;
  });

  return { success: true, session: publicPathSession(session) };
});

/** Issue only a sanitized question payload. Expected answers remain server-side. */
exports.issueNextQuestion = onCall(async (request) => {
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

  const targetDisplayCode = mathPath.displayAlignmentKey(session.target.alignmentKey);
  const [bankSnapshot, masterySnapshot, rosterSnapshot, courseSettingsSnapshot] = await Promise.all([
    db.collection("pathQuestionBank").where("alignmentKeys", "array-contains", session.target.alignmentKey).limit(40).get(),
    db.collection("studentMasteryProfiles").doc(studentId).get(),
    db.collection("grades").doc(studentId).get(),
    db.collection("settings").doc("courseProfiles").get(),
  ]);
  // Every candidate is screened by the Path Tool Contract before it can be
  // chosen. A question whose tool has no server grader is skipped here rather
  // than issued in a weaker form.
  const plans = await Promise.all(bankSnapshot.docs
    .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))
    .filter((question) => question.active !== false)
    .map(async (question) => ({ question, plan: await mathPath.buildIssuePlan(question) })));
  const issuable = plans.filter((entry) => entry.plan.issuable);
  const candidates = issuable.map((entry) => entry.question);
  const planByQuestionId = new Map(issuable.map((entry) => [entry.question.id, entry.plan]));
  if (!candidates.length) {
    const skipped = plans.length ? ` ${plans.length} question(s) were skipped: ${[...new Set(plans.map((entry) => entry.plan.reason))].join(", ")}.` : "";
    throw new HttpsError("failed-precondition", `No active secure question family is published for ${session.target.alignmentKey}.${skipped}`);
  }

  const classPeriod = rosterSnapshot.data()?.classPeriod || "Unassigned";
  const courseLevel = courseSettingsSnapshot.data()?.profiles?.[classPeriod]?.courseLevel || "standard";
  const masteryProfile = masterySnapshot.data()?.profiles?.[targetDisplayCode] || {};
  const adaptiveRigor = rigorPolicy.resolveAdaptiveRigor({ courseLevel, profile: masteryProfile });
  // Selection prefers an UNUSED family, widening to the closest adjacent band
  // before it repeats anything. Narrowing to the nearest band first and cycling
  // inside it — which is what this used to do — trapped a five-question session
  // in whichever one or two families happened to sit at the readiness band.
  const selection = await pathSelection();
  const familyUsage = session.familyUsage && typeof session.familyUsage === "object" ? session.familyUsage : {};
  const choice = selection.selectNextFamily(candidates, {
    preferredBand: adaptiveRigor.preferredDifficultyBand,
    usage: familyUsage,
  });
  const authored = choice.question;
  const issuePlan = planByQuestionId.get(authored.id);
  const attemptsAllowed = session.sessionKind === "retentionProbe" ? 1 : 3;
  const questionInstanceId = mathPath.runtimeId("qi");
  const currentQuestion = {
    // The public half — the authentic tool, by allowlist — plus the private
    // grading definition, which lives only in this session document.
    ...mathPath.buildSanitizedQuestion(authored, { questionInstanceId, attemptsAllowed, attemptsUsed: 0, toolPayload: issuePlan.toolPayload }),
    bankQuestionId: authored.id,
    alignmentKeys: [session.target.alignmentKey],
    attemptsAllowed,
    attemptsUsed: 0,
    adaptiveRigor,
    privateGrading: issuePlan.privateGrading,
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
      updatedAt: Date.now(),
    });
    return currentQuestion;
  });

  return { questionInstance: mathPath.buildSanitizedQuestion(issuedQuestion, { questionInstanceId: issuedQuestion.questionInstanceId, attemptsAllowed: issuedQuestion.attemptsAllowed, attemptsUsed: issuedQuestion.attemptsUsed, toolPayload: mathPath.storedToolPayload(issuedQuestion) }) };
});

/**
 * Grade a path response on the server and append immutable evidence in the same
 * transaction. submissionId is a real idempotency key, so a network retry can
 * safely repeat the request without creating a second attempt.
 */
exports.submitPathResponse = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const sessionId = String(request.data?.sessionId || "").trim();
  const questionInstanceId = String(request.data?.questionInstanceId || "").trim();
  const submissionId = String(request.data?.submissionId || "").trim();
  if (!sessionId || !questionInstanceId || !submissionId) throw new HttpsError("invalid-argument", "sessionId, questionInstanceId, and submissionId are required.");
  if (submissionId.length > 180) throw new HttpsError("invalid-argument", "submissionId is too long.");

  const db = getFirestore();
  const sessionRef = db.collection("pathSessions").doc(sessionId);
  const submissionRef = db.collection("pathSubmissions").doc(mathPath.opaqueId("submission", sessionId, submissionId));
  // Load the tool contract before the transaction opens, so a cold dynamic
  // import is never paid for inside it.
  await mathPath.pathToolContracts();

  // The authorization context this evidence will carry, resolved from the
  // student's class before the transaction so the read is not inside it.
  const auth = await authorizationContext();
  const studentRecord = await db.collection("grades").doc(studentId).get();
  const authorizationFields = auth.buildAuthorizationContext({
    studentId,
    student: studentRecord.data() || null,
    classRecord: await loadStudentClass(db, studentRecord.data()),
  });

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
    const supportUsage = request.data?.supportUsage && typeof request.data.supportUsage === "object" ? request.data.supportUsage : {};
    const independent = mathPath.mathematicalIndependence(supportUsage);
    const now = Date.now();
    const nextSummary = { ...(session.summary || {}) };
    let nextStatus = session.status;
    let nextCurrentQuestion = { ...currentQuestion, attemptsUsed: attemptNumber };

    if (questionFinalized) {
      nextSummary.completedQuestions = Number(nextSummary.completedQuestions || 0) + 1;
      nextSummary.correctQuestions = Number(nextSummary.correctQuestions || 0) + (gradingCore.isCorrect ? 1 : 0);
      nextSummary.independentSuccesses = Number(nextSummary.independentSuccesses || 0) + (gradingCore.isCorrect && independent ? 1 : 0);
      nextCurrentQuestion = null;
      if (nextSummary.completedQuestions >= Number(session.requiredQuestions || 5)) nextStatus = "completed";
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
      },
      source: { kind: "myMathPath", activityRole: "practice", activitySessionId: sessionId, sessionKind: session.sessionKind },
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

    transaction.set(evidenceRef, event);
    transaction.set(sessionRef, nextSession);
    if (nextStatus === "completed") {
      const lockRef = db.collection("activePathLocks").doc(mathPath.opaqueId("pathlock", studentId, session.target.alignmentKey));
      transaction.delete(lockRef);
    }

    const result = {
      success: true,
      submissionId,
      grading: { ...gradingCore, attemptNumber, attemptsRemaining, questionFinalized },
      session: publicPathSession(nextSession),
      needsNextQuestion: questionFinalized && nextStatus === "active",
    };
    transaction.set(submissionRef, { studentId, sessionId, submissionId, createdAt: now, result });
    return { duplicate: false, result };
  });

  return transactionResult.result;
});

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
    const classPeriod = studentSnapshot.exists ? String(studentSnapshot.data()?.classPeriod || "Unassigned") : "Unassigned";
    const assignedPeriods = Array.isArray(assignment.assignedClassPeriods) ? assignment.assignedClassPeriods.map(String) : [];
    if (assignedPeriods.length && !assignedPeriods.includes(classPeriod)) throw new HttpsError("permission-denied", "This modeling lab is not assigned to your class period.");

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
    return { questionInstance: mathPath.buildSanitizedQuestion(session.currentQuestion, session.currentQuestion), draftResponse: session.currentQuestion.draftResponse || null, session: secureExam.publicSession(session) };
  }
  if (Number(session.summary?.completedQuestions || 0) >= Number(session.requiredQuestions || 1)) {
    throw new HttpsError("failed-precondition", "All required exam questions have been completed.");
  }
  const bank = await db.collection("examQuestionBank").where("examTypes", "array-contains", session.examType).limit(100).get();
  const used = new Set(Array.isArray(session.usedQuestionIds) ? session.usedQuestionIds.map(String) : []);
  const candidates = bank.docs
    .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
    .filter((question) => question.active !== false && !used.has(question.id) && mathPath.hasGradeableDefinition(question));
  if (!candidates.length) throw new HttpsError("failed-precondition", `No unused secure ${session.examType} exam items are available.`);
  const authored = candidates[Number(session.summary?.completedQuestions || 0) % candidates.length];
  const questionInstanceId = mathPath.runtimeId("examq");
  const currentQuestion = {
    ...mathPath.buildSanitizedQuestion(authored, { questionInstanceId, attemptsAllowed: 1, attemptsUsed: 0 }),
    bankQuestionId: authored.id,
    alignmentKeys: secureExamAlignmentKeys(authored),
    questionInstanceId,
    attemptsAllowed: 1,
    attemptsUsed: 0,
    privateGrading: mathPath.privateGradingDefinition(authored),
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
  return { questionInstance: mathPath.buildSanitizedQuestion(issued.currentQuestion, issued.currentQuestion), draftResponse: issued.currentQuestion?.draftResponse || null, session: secureExam.publicSession(issued) };
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
    const grading = mathPath.gradeResponse(current.privateGrading, request.data?.responsePayload || {});
    const now = Date.now();
    const completedQuestions = Number(session.summary?.completedQuestions || 0) + 1;
    const correctQuestions = Number(session.summary?.correctQuestions || 0) + (grading.isCorrect ? 1 : 0);
    const safeSupport = request.data?.supportUsage && typeof request.data.supportUsage === "object" ? {
      accommodations: Array.isArray(request.data.supportUsage.accommodations) ? request.data.supportUsage.accommodations.map(String).slice(0, 20) : [],
      modifications: Array.isArray(request.data.supportUsage.modifications) ? request.data.supportUsage.modifications.map(String).slice(0, 20) : [],
      calculatorUsed: Boolean(request.data.supportUsage.calculatorUsed),
      teacherAssisted: Boolean(request.data.supportUsage.teacherAssisted),
    } : {};
    const responseRecord = {
      questionInstanceId,
      bankQuestionId: current.bankQuestionId,
      alignmentKeys: current.alignmentKeys || [],
      questionType: current.questionType,
      familyId: current.familyId,
      dok: current.dok,
      grading: { score: grading.score, isCorrect: grading.isCorrect },
      supportUsage: safeSupport,
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
    transaction.set(markerRef, { examSessionId, studentId, submissionId, createdAt: now, result: publicResult });
    return publicResult;
  });
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

function applyOpenSecureExamDraft(session, now) {
  const current = session.currentQuestion;
  const draft = current?.draftResponse;
  const responses = draft?.responsePayload?.responses && typeof draft.responsePayload.responses === "object" ? draft.responsePayload.responses : {};
  if (!current || !Object.values(responses).some((value) => String(value ?? "").trim())) return session;
  const grading = mathPath.gradeResponse(current.privateGrading, draft.responsePayload);
  const responseRecord = {
    questionInstanceId: current.questionInstanceId,
    bankQuestionId: current.bankQuestionId,
    alignmentKeys: current.alignmentKeys || [],
    questionType: current.questionType,
    familyId: current.familyId,
    dok: current.dok,
    grading: { score: grading.score, isCorrect: grading.isCorrect },
    supportUsage: draft.supportUsage || {},
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
    const withDraft = applyOpenSecureExamDraft(session, now);
    const updated = { ...withDraft, status: reason === "timeExpired" ? "time_expired" : "submitted", submittedAt: now, currentQuestion: null, updatedAt: now };
    transaction.set(ref, updated);
    return updated;
  });
  return { success: true, session: secureExam.publicSession(next) };
});

/** Teacher-only live monitor summaries. No answer payloads are returned. */
exports.listProctorExamSessions = onCall(async (request) => {
  await requireTeacher(request);
  const examType = String(request.data?.examType || "").trim();
  const db = getFirestore();
  let query = db.collection("examSessions");
  if (examType && secureExam.policyFor(examType)) query = query.where("examType", "==", examType);
  const snapshot = await query.limit(200).get();
  return { sessions: snapshot.docs.map((docSnapshot) => secureExam.publicSession(docSnapshot.data(), { teacher: true })) };
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
    if (action === "forceSubmit") updated = { ...applyOpenSecureExamDraft(updated, now), status: "force_submitted", submittedAt: now, currentQuestion: null };
    transaction.set(ref, updated);
    return updated;
  });
  return { success: true, session: secureExam.publicSession(next, { teacher: true }) };
});

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
    const roleWeight = { warmup: 0.8, classwork: 0.9, dol: 1.25, practice: 1, quiz: 1.35, test: 1.4 }[evidence.source?.activityRole] || 1;
    const modified = Boolean(evidence.supportUsage?.modified) || Boolean(evidence.supportUsage?.modifications?.length);
    const independent = mathPath.mathematicalIndependence(evidence.supportUsage || {});
    const score = Math.max(0, Math.min(1, Number(evidence.performance?.score) || 0));
    const weight = modified ? 0 : roleWeight * (independent ? 1 : 0.85);
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
        const weightedScoreSum = Number(accumulator.weightedScoreSum || 0) + score * weight;
        const eligibleEvents = Number(accumulator.eligibleEvents || 0) + (weight > 0 ? 1 : 0);
        const modifiedEvents = Number(accumulator.modifiedEvents || 0) + (modified ? 1 : 0);
        const dokRepresented = [...new Set([...(previous.dimensions?.dokRepresented || []), ...(dok ? [dok] : [])])].sort();
        const familiesRepresented = [...new Set([...(previous.dimensions?.familiesRepresented || []), ...(familyId ? [familyId] : [])])];
        const estimate = effectiveWeight > 0 ? Math.round((weightedScoreSum / effectiveWeight) * 100) : null;
        let status = "Not Enough Evidence";
        if (eligibleEvents >= 2 && effectiveWeight >= 1.1) {
          if (estimate >= 85 && eligibleEvents >= 4 && dokRepresented.some((value) => Number(value) >= 3)) status = "Mastered";
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
          dimensions: { eligibleGradeLevelEvents: eligibleEvents, modifiedEvidenceEvents: modifiedEvents, dokRepresented, familiesRepresented, lastIndependentSuccessAt },
          accumulator: { effectiveWeight, weightedScoreSum, eligibleEvents, modifiedEvents },
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
