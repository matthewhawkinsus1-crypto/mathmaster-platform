const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

const classroomLib = require("./lib/classroom");
const { runtimeQuestionCount } = require("./lib/assignmentRuntime");
const driveResources = require("./lib/driveResources");
const { encryptLaunchPayload, decryptLaunchToken } = require("./lib/linkToken");
const {
  GOOGLE_API_SECRETS,
  GOOGLE_AND_LINK_SECRETS,
  LINK_ENCRYPTION_KEY,
  ASSIGNMENT_AI_SECRETS,
  readOpenAiApiKey,
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
const { firestoreSafePathRecord } = require("./lib/pathFirestoreShape");
const labEvaluation = require("./lib/labEvaluation");
const secureExam = require("./lib/secureExam");
const adminPolicy = require("./lib/admin");
const rigorPolicy = require("./lib/rigorPolicy");
// Adaptive routing for live sessions. The DECISIONS come from the one shared
// engine in functions/shared/pathSessionRouting.mjs; this seam supplies the
// server-side facts (mastery documents, coverage indexes) it reasons over.
const pathRouting = require("./lib/pathRouting");
const pathContentRelease = require("./lib/pathContentRelease");
const assignmentAi = require("./lib/assignmentAi");

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

  const joinMembership = await resolveJoinCodeMembership(db, joinCode);
  const rosterSnapshot = await db.collection("grades").doc(studentId).get();
  if (rosterSnapshot.exists && !joinCodeMatchesRoster(rosterSnapshot.data() || {}, joinMembership)) {
    throw new HttpsError("permission-denied", "That class code does not match the class assigned to this student ID.");
  }
  const record = await ensureStudentRecord(db, studentId, joinMembership);
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
    if (existingRoster && !joinCodeMatchesRoster(existingRoster.data() || {}, joinMembership)) {
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

  const record = await ensureStudentRecord(db, studentId, joinMembership || { classPeriod });

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

const PATH_RUNTIME_RELEASE = "path-bank-2026-08-23-r11-ccmr-fidelity-v2";
const PATH_COURSE_IDS = Object.freeze(["grade6", "grade7", "grade8", "algebra1", "algebra2"]);
const CONTENT_RELEASE_MANIFEST_COLLECTION = "pathContentReleases";
const CONTENT_RELEASE_MANIFEST_DOC = "current";
const COORDINATED_CCMR_RELEASE_SEED_FILES = Object.freeze([
  "digitalSAT_pathQuestionBank_seed.json",
  "act_pathQuestionBank_seed.json",
  "tsia2_pathQuestionBank_seed.json",
]);
const COORDINATED_CCMR_RELEASE_FRAMEWORKS = Object.freeze(["act", "digitalSAT", "tsia2"]);

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

    // Validate the thing a student will actually receive. A bad template is a
    // rejected document, not an exception that aborts diagnosis of the other
    // 5,000 documents.
    // eslint-disable-next-line no-await-in-loop
    const plan = await safeBuildTemplateIssuePlan(item, { operation: "seed-import-validation" });
    if (!plan.issuable) { rejected.push(describe(plan.reason, plan)); continue; }
    accepted.push(firestoreSafePathRecord({ ...item, id, active: item.active !== false }));
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
      .filter((framework) => COORDINATED_CCMR_RELEASE_FRAMEWORKS.includes(framework)))].sort();
    if (attemptedProtectedFrameworks.length) {
      throw new HttpsError(
        "failed-precondition",
        "Release-managed assessment content (" + attemptedProtectedFrameworks.join(", ") + ") cannot be written by the generic Path seed importer. Use refreshReleasedCcmrPathBanks for the atomic SAT/ACT/TSIA2 release refresh.",
      );
    }
  }
  return processPathSeedImport({ db, actor, items, dryRun });
});

const BUILT_IN_PATH_SEED_FILES = Object.freeze([
  "algebra1_pathQuestionBank_seed.json",
  "algebra2_pathQuestionBank_seed.json",
  // The middle-school prerequisite packages. Grade 6 joined the list when the
  // routing graph gained reachable grade-6 prerequisites: a repair excursion
  // that arrives at a standard with no content strands the student it was
  // trying to help.
  "grade6_pathQuestionBank_seed.json",
  "grade7_pathQuestionBank_seed.json",
  "grade8_pathQuestionBank_seed.json",
  "digitalSAT_pathQuestionBank_seed.json",
  "act_pathQuestionBank_seed.json",
  "tsia2_pathQuestionBank_seed.json",
  "asvab_pathQuestionBank_seed.json",
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
  if (COORDINATED_CCMR_RELEASE_FRAMEWORKS.includes(framework)) {
    throw new HttpsError(
      "failed-precondition",
      "Released SAT, ACT, and TSIA2 questions cannot be withdrawn one at a time. Use refreshReleasedCcmrPathBanks so the complete audited release and manifest change together.",
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

async function preproductionResetPreview(db) {
  const [gradesSnapshot, authStudents, ...collectionSnapshots] = await Promise.all([
    db.collection("grades").get(),
    preproductionStudentAuthUsers(db),
    ...adminPolicy.PREPRODUCTION_RESET_COLLECTIONS.map((collectionName) => (
      db.collection(collectionName).get()
    )),
  ]);
  const collections = {};
  adminPolicy.PREPRODUCTION_RESET_COLLECTIONS.forEach((collectionName, index) => {
    collections[collectionName] = collectionSnapshots[index].size;
  });
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
  const stateData = stateSnap.exists ? stateSnap.data() : null;
  if (!stateData || stateData.expiresAt < Date.now()) {
    res.status(400).send("Invalid or expired OAuth state.");
    return;
  }
  await stateRef.delete();

  try {
    const tokens = await classroomLib.exchangeCodeForTokens(String(code));
    await classroomLib.saveTeacherTokens(tokens, stateData.createdBy);
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
    return classroomLib.getConnectionHealth(teacherUid);
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

    checks.appBaseUrl = readPublicEnv("APP_BASE_URL");
    if (!checks.appBaseUrl) {
      problems.push(
        "APP_BASE_URL is not configured. Add it to functions/.env.mathmaster-aleks (see functions/.env.example) and redeploy."
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
  const teacherUid = await requireTeacher(request);
  const classroom = await classroomLib.getClassroomClient(teacherUid);
  return { courses: await classroomLib.listCourses(classroom) };
});

exports.listClassroomStudents = onCall({ secrets: GOOGLE_API_SECRETS }, async (request) => {
  const teacherUid = await requireTeacher(request);
  const { courseId } = request.data || {};
  if (!courseId) throw new HttpsError("invalid-argument", "courseId is required.");
  const classroom = await classroomLib.getClassroomClient(teacherUid);
  return { students: await classroomLib.listStudents(classroom, String(courseId)) };
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

exports.listClassroomCourseMappings = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const snap = await getFirestore()
    .collection("classroomCourseMappings")
    .where("teacherUid", "==", teacherUid)
    .limit(100)
    .get();
  return { mappings: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
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

  const batch = db.batch();
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
  if (prepared.length) await batch.commit();
  return { linked: prepared.length };
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
    const classroom = await classroomLib.getClassroomClient(teacherUid);
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
          const topic = await classroomLib.ensureTopic(classroom, courseId, topicName);
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
    const health = await classroomLib.getConnectionHealth(teacherUid);
    if (health.connected && !(health.missingScopes || []).includes(driveScope)) {
      const drive = await classroomLib.getDriveClient(teacherUid);
      driveAsset = await driveResources.upsertLessonNotesPdf({
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
    const classroom = await classroomLib.getClassroomClient(teacherUid);
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
          ? await classroomLib.ensureTopic(classroom, courseId, topicName)
          : null;
        // eslint-disable-next-line no-await-in-loop
        const item = await classroomLib.createCourseWorkMaterial(classroom, {
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

    const topic = topicName
      ? await classroomLib.ensureTopic(classroom, courseId, topicName)
      : null;

    if (!courseWork) {
      const resolvedTitle = String(classroomTitle || assignment.title || 'MathMaster Assignment').trim();
      const defaultInstructions = `Complete "${resolvedTitle}" in MathMaster.`;
      courseWork = await classroomLib.createCourseWork(classroom, {
        courseId,
        title: resolvedTitle,
        description: `${String(instructions || defaultInstructions).trim()}\n\n${marker}`,
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
  const audience = assignmentAudience(assignment);
  if (!audience.classIds.length && !audience.classPeriods.length) {
    throw new HttpsError(
      "failed-precondition",
      "This MathMaster assignment is still in the library. Assign it to a class before publishing it to Google Classroom."
    );
  }

  const classroom = await classroomLib.getClassroomClient(teacherUid);
  const activeCourses = await classroomLib.listCourses(classroom);
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
    const mappedPeriod = String(mapping.classPeriod || "").trim();
    const mappingMatchesAudience = audience.classIds.length
      ? Boolean(mappedClassId && audience.classIds.includes(mappedClassId))
      : Boolean(mappedPeriod && audience.classPeriods.includes(mappedPeriod));
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

  const classroom = await classroomLib.getClassroomClient(teacherUid);
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

function classroomDeleteAlreadyGone(error) {
  const status = Number(error?.response?.status || error?.code || 0);
  const message = String(
    error?.response?.data?.error?.message || error?.message || error || ""
  );
  return status === 404
    || /already deleted|already been deleted|not found|failed[_ -]?precondition/i.test(message);
}

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

    const classroom = await classroomLib.getClassroomClient(teacherUid);
    const results = [];

    for (const publication of publications) {
      const courseId = String(publication.courseId);
      try {
        let courseWork = await classroomLib.getCourseWork(
          classroom,
          courseId,
          String(publication.courseworkId)
        );

        if (repairAudience && courseWork.assigneeMode !== "ALL_STUDENTS") {
          courseWork = await classroomLib.modifyCourseWorkAssignees(classroom, {
            courseId,
            courseWorkId: String(publication.courseworkId),
            assigneeMode: "ALL_STUDENTS",
          });
        }

        const students = await classroomLib.listStudents(classroom, courseId);

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
        failed: results.filter((item) => item.status === "failed").length,
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
    const classroom = await classroomLib.getClassroomClient(teacherUid);
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
          await classroomLib.deleteCourseWork(
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
          await classroomLib.deleteCourseWorkMaterial(
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

  const gradeRef = db.doc(`grades/${String(studentId)}`);
  const gradeSnap = await gradeRef.get();
  if (!gradeSnap.exists) {
    throw new HttpsError("not-found", "Student grade record not found.");
  }
  await gradeRef.update(
    new FieldPath("classroomReleaseSignals", String(assignmentId)),
    new Date().toISOString()
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
    const classroomByTeacher = new Map();

    for (const assignmentId of changedAssignmentIds) {
      const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
      const assignment = assignmentSnap.exists ? assignmentSnap.data() : {};
      if (assignmentFeedbackIsHeld(assignment)) continue;
      const questionCount = assignmentSnap.exists
        ? runtimeQuestionCount(assignment)
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

      for (const publicationDoc of publications) {
        const publication = publicationDoc.data();
        if (publication.gradePassbackEnabled === false) continue;
        const courseId = String(publication.courseId || "");
        if (!courseId) continue;

        const publicationTeacherUid = publication.teacherUid || null;
        const classroomKey = publicationTeacherUid || "__legacy__";
        let classroom = classroomByTeacher.get(classroomKey);
        if (!classroom) {
          try {
            // eslint-disable-next-line no-await-in-loop
            classroom = await classroomLib.getClassroomClient(publicationTeacherUid);
            classroomByTeacher.set(classroomKey, classroom);
          } catch (err) {
            // Keep an auth failure visible per publication instead of aborting
            // the whole grade-trigger run for every other Classroom course.
            // eslint-disable-next-line no-await-in-loop
            await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
              assignmentId,
              courseId,
              courseworkId: publication.courseworkId,
              status: "auth-error",
              grade,
              message: String(err.message || err),
            });
            continue;
          }
        }

        const rosterLinkId = rosterLinkDocumentId(
          courseId,
          event.params.studentId
        );
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

const LIVE_CHALLENGE_ROOMS = "liveChallengeRooms";
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

async function loadChallengeCandidates(db, { courseId, standardCode }) {
  const challenge = await liveChallengeRules();
  const normalized = challenge.canonicalChallengeStandard(standardCode);
  let snapshot;
  if (normalized === "mixed") {
    snapshot = await db.collection("pathQuestionBank").where("courseId", "==", courseId).limit(300).get();
  } else {
    const alignmentKey = mathPath.canonicalAlignmentKey(normalized);
    snapshot = await db.collection("pathQuestionBank").where("alignmentKeys", "array-contains", alignmentKey).limit(100).get();
  }

  const candidates = snapshot.docs
    .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))
    .filter((question) => question.active !== false)
    .filter((question) => normalized !== "mixed" || String(question.courseId || courseId) === courseId);

  const planned = await Promise.all(candidates.map(async (question) => ({
    question,
    plan: await safeBuildTemplateIssuePlan(question, { operation: "path-runtime-framework-check" }),
  })));
  return planned.filter((entry) => entry.plan.issuable);
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

async function buildLiveChallengePublicQuestion(db, { roomId, roundIndex, questionId }) {
  const snapshot = await db.collection("pathQuestionBank").doc(questionId).get();
  if (!snapshot.exists) throw new HttpsError("failed-precondition", "A Live Challenge question is no longer in the secure bank.");
  const authored = snapshot.data() || {};
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

exports.createLiveChallenge = onCall(async (request) => {
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
  const standardCode = challenge.canonicalChallengeStandard(request.data?.standardCode || "mixed");
  const requestedRoundCount = challenge.normalizeRoundCount(request.data?.roundCount);
  const roundSeconds = challenge.normalizeRoundSeconds(request.data?.roundSeconds);
  const defaultTitle = `${className || classPeriod || "Class"} Live Challenge`;
  const title = String(request.data?.title || defaultTitle).trim().slice(0, 120) || defaultTitle;

  // One active room per teacher. A tiny pointer keeps refresh recovery O(1) and
  // avoids reading completed challenge history every time the teacher opens
  // the dashboard.
  const activePointerRef = db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(teacherEmail);
  const activePointer = await activePointerRef.get();
  if (activePointer.exists && activePointer.data()?.roomId) {
    const activeRoom = await db.collection(LIVE_CHALLENGE_ROOMS).doc(activePointer.data().roomId).get();
    if (activeRoom.exists && [challenge.LIVE_CHALLENGE_STATUS.LOBBY, challenge.LIVE_CHALLENGE_STATUS.RUNNING].includes(activeRoom.data()?.status)) {
      throw new HttpsError("failed-precondition", "Finish or cancel your current Live Challenge before creating another one.", { roomId: activeRoom.id });
    }
    await activePointerRef.delete();
  }

  const roster = await loadChallengeRoster(db, teacherEmail, { classId, classPeriod });
  if (!roster.length) throw new HttpsError("failed-precondition", `No students assigned to you were found in ${className || classPeriod}.`);

  const candidates = await loadChallengeCandidates(db, { courseId, standardCode });
  if (candidates.length < challenge.MIN_ROUND_COUNT) {
    throw new HttpsError(
      "failed-precondition",
      standardCode === "mixed"
        ? `The secure ${courseId === "algebra2" ? "Algebra II" : "Algebra I"} bank needs at least ${challenge.MIN_ROUND_COUNT} usable questions before a Live Challenge can start.`
        : `${standardCode} has only ${candidates.length} securely gradeable challenge question${candidates.length === 1 ? "" : "s"}. At least ${challenge.MIN_ROUND_COUNT} are required.`,
    );
  }
  const selected = selectChallengeQuestions(candidates, requestedRoundCount);
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
    classId,
    classPeriod,
    className: className || null,
    courseId,
    standardCode,
    status: challenge.LIVE_CHALLENGE_STATUS.LOBBY,
    roundCount: actualRoundCount,
    requestedRoundCount,
    roundSeconds,
    currentRound: -1,
    currentQuestion: null,
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
    questionIds: selected.map((entry) => entry.question.id),
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
    const joinedPlayer = { ...player, joined: true, updatedAt: FieldValue.serverTimestamp() };
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
  const questionId = privateState.questionIds?.[roundIndex];
  if (!questionId) throw new HttpsError("failed-precondition", "That Live Challenge round has no question.");
  const currentQuestion = await buildLiveChallengePublicQuestion(db, { roomId: roomRef.id, roundIndex, questionId });
  const nowMs = Date.now();
  const roundSeconds = challenge.normalizeRoundSeconds(room.roundSeconds);

  await Promise.all([
    privateRef.set({
      status: challenge.LIVE_CHALLENGE_STATUS.RUNNING,
      currentRound: roundIndex,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    roomRef.set({
      status: challenge.LIVE_CHALLENGE_STATUS.RUNNING,
      currentRound: roundIndex,
      currentQuestion,
      roundStartedAt: new Date(nowMs),
      roundEndsAt: new Date(nowMs + roundSeconds * 1000),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ]);

  return { currentQuestion, roundIndex, roundEndsAt: new Date(nowMs + roundSeconds * 1000).toISOString() };
}

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
  await Promise.all([
    roomRef.set({
      status,
      currentQuestion: null,
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
  await deletePrivateChallengeState(db, privateRef, players);
  return { roomId: roomRef.id, status, roundCount: room.roundCount || 0 };
}

exports.advanceLiveChallenge = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  if (room.status !== challenge.LIVE_CHALLENGE_STATUS.RUNNING) throw new HttpsError("failed-precondition", "The challenge is not running.");
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privateSnapshot = await privateRef.get();
  if (!privateSnapshot.exists) throw new HttpsError("not-found", "The private challenge state is missing.");
  const privateState = privateSnapshot.data() || {};
  const nextRound = Number(room.currentRound) + 1;
  if (nextRound >= (privateState.questionIds?.length || 0)) {
    return finishLiveChallengeRoom({ db, roomRef, privateRef, room, status: challenge.LIVE_CHALLENGE_STATUS.FINISHED });
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
  if (!privateSnapshot.exists) throw new HttpsError("not-found", "The private challenge state is missing.");
  return finishLiveChallengeRoom({ db, roomRef, privateRef, room, status: challenge.LIVE_CHALLENGE_STATUS.CANCELLED });
});

exports.submitLiveChallengeResponse = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const roomId = String(request.data?.roomId || "").trim();
  const submittedRound = Number(request.data?.roundIndex);
  if (!roomId || !Number.isInteger(submittedRound) || submittedRound < 0) throw new HttpsError("invalid-argument", "roomId and roundIndex are required.");

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
  const privateState = privateSnapshot.data() || {};
  const currentPlayer = playerSnapshot.data() || {};
  if (room.status !== challenge.LIVE_CHALLENGE_STATUS.RUNNING || Number(room.currentRound) !== submittedRound) {
    throw new HttpsError("failed-precondition", "That Live Challenge round is no longer active.");
  }
  const endsAtMs = toDate(room.roundEndsAt)?.getTime() || 0;
  if (endsAtMs && Date.now() > endsAtMs) throw new HttpsError("deadline-exceeded", "Time is up for this round.");
  if (!currentPlayer.joined) throw new HttpsError("failed-precondition", "Join the Live Challenge before answering.");
  if (Number(currentPlayer.answeredRound) === submittedRound) throw new HttpsError("already-exists", "You already answered this round.");

  const questionId = privateState.questionIds?.[submittedRound];
  const questionSnapshot = questionId ? await db.collection("pathQuestionBank").doc(questionId).get() : null;
  if (!questionSnapshot?.exists) throw new HttpsError("failed-precondition", "This round's secure question is unavailable.");
  const authored = questionSnapshot.data() || {};
  const seedKey = `challenge|${roomId}|${submittedRound}|${questionId}`;
  const instantiated = await mathPath.instantiateQuestion(authored, seedKey);
  if (!instantiated.question) throw new HttpsError("failed-precondition", "This round's question could not be regenerated securely.");
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  if (!plan.issuable) throw new HttpsError("failed-precondition", "This round can no longer be securely graded.");
  const grading = await mathPath.gradePathToolResponse(plan.privateGrading, request.data?.responsePayload || {});
  if (grading?.rejected) throw new HttpsError("failed-precondition", grading.reason || "The response could not be graded.");

  let finalPlayer = null;
  let finalScore = null;
  await db.runTransaction(async (transaction) => {
    const [latestRoomSnapshot, latestPlayerSnapshot] = await Promise.all([
      transaction.get(roomRef), transaction.get(privatePlayerRef),
    ]);
    if (!latestRoomSnapshot.exists || !latestPlayerSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge ended before the response could be saved.");
    const latestRoom = latestRoomSnapshot.data() || {};
    const player = latestPlayerSnapshot.data() || {};
    if (latestRoom.status !== challenge.LIVE_CHALLENGE_STATUS.RUNNING || Number(latestRoom.currentRound) !== submittedRound) {
      throw new HttpsError("failed-precondition", "That Live Challenge round is no longer active.");
    }
    const latestEndsAtMs = toDate(latestRoom.roundEndsAt)?.getTime() || 0;
    const nowMs = Date.now();
    if (latestEndsAtMs && nowMs > latestEndsAtMs) throw new HttpsError("deadline-exceeded", "Time is up for this round.");
    if (!player.joined) throw new HttpsError("failed-precondition", "Join the Live Challenge before answering.");
    if (Number(player.answeredRound) === submittedRound) throw new HttpsError("already-exists", "You already answered this round.");
    if (!player.playerKey) throw new HttpsError("failed-precondition", "Your Live Challenge player record is incomplete.");

    finalScore = challenge.scoreChallengeRound({
      gradeScore: grading?.score ?? (grading?.isCorrect ? 1 : 0),
      isCorrect: grading?.isCorrect === true,
      remainingMs: Math.max(0, latestEndsAtMs - nowMs),
      totalMs: challenge.normalizeRoundSeconds(latestRoom.roundSeconds) * 1000,
      previousStreak: player.streak || 0,
    });
    finalPlayer = {
      ...player,
      joined: true,
      score: Math.max(0, Math.round(Number(player.score) || 0)) + finalScore.pointsAwarded,
      correctCount: Math.max(0, Math.round(Number(player.correctCount) || 0)) + (grading?.isCorrect ? 1 : 0),
      roundsAnswered: Math.max(0, Math.round(Number(player.roundsAnswered) || 0)) + 1,
      streak: finalScore.newStreak,
      answeredRound: submittedRound,
      updatedAt: FieldValue.serverTimestamp(),
    };
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

  return {
    isCorrect: grading?.isCorrect === true,
    scorePercent: Math.round(Math.max(0, Math.min(1, Number(grading?.score) || 0)) * 100),
    pointsAwarded: finalScore?.pointsAwarded || 0,
    basePoints: finalScore?.basePoints || 0,
    speedBonus: finalScore?.speedBonus || 0,
    streakBonus: finalScore?.streakBonus || 0,
    totalScore: finalPlayer?.score || 0,
    streak: finalPlayer?.streak || 0,
    rank: null,
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

/** Start or resume one server-owned learning-path session for a TEKS target. */
exports.startMyMathPathSession = onCall((request) => withPathCallableDiagnostics("startMyMathPathSession", async () => {
  const { studentId } = requireStudent(request);
  let targetAlignmentKey = mathPath.canonicalAlignmentKey(request.data?.targetAlignmentKey);
  if (!targetAlignmentKey) throw new HttpsError("invalid-argument", "targetAlignmentKey is required.");
  const sessionKind = request.data?.sessionKind === "retentionProbe" ? "retentionProbe" : "practice";
  let requiredQuestions = pathSessionRequiredQuestions(sessionKind, request.data?.requiredQuestions);
  let assessmentFramework = normalizePathAssessmentFramework(request.data?.assessmentFramework);
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

  // Ordinary course practice has visible passes too. Pass 1 is the foundation
  // session; later passes deliberately ask the selector for more demanding
  // work. This is NOT mastery — mastery remains evidence-driven.
  let priorCoursePasses = 0;
  let coursePassLevel = null;
  if (!assessmentFramework && sessionKind !== "retentionProbe") {
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
  if (!session.assessmentFramework && session.sessionKind !== "retentionProbe") {
    const coursePassLevel = Math.max(1, Math.min(COURSE_PATH_MAX_LEVEL, Number(session.coursePassLevel || 1)));
    if (coursePassLevel >= 2) {
      preferredDifficultyBand = Math.max(4, Number(preferredDifficultyBand || 3));
      preferredDok = Math.max(2, Number(preferredDok || 2));
    }
    if (coursePassLevel >= 3) {
      preferredDifficultyBand = Math.max(5, Number(preferredDifficultyBand || 4));
      preferredDok = Math.max(3, Number(preferredDok || 2));
    }
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
      const draw = await mathPath.instantiateQuestion(tentativeQuestion, `${sessionId}|${questionInstanceId}|${tentativeQuestion.id}`);
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
  // An authorized extra-attempts accommodation is ADDED to the pedagogical
  // figure rather than replacing it, and deliberately does not extend a
  // one-attempt diagnostic — that task is one attempt by design, because it is
  // asking what the student can do unaided right now. Resolved on the server,
  // so the browser cannot grant itself a fourth try.
  const attemptsAllowed = await mathPath.attemptsFor(baseAttempts, entitlements);
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
    coursePassLevel: session.assessmentFramework ? null : Math.max(1, Math.min(COURSE_PATH_MAX_LEVEL, Number(session.coursePassLevel || 1))),
    assessmentBridgeFramework: usingCourseBridge ? session.assessmentFramework : null,
    ccmrChallengeTier: session.assessmentFramework ? Math.max(1, Math.min(3, Number(session.ccmrChallengeTier || 1))) : null,
    ccmrFamilyRole: authored.ccmrFamilyRole || (Number(authored.ccmrChallengeTier || 1) >= 2 ? "challenge" : "direct"),
    // Teacher/QA metadata. `buildSanitizedQuestion` does not copy these onto the
    // student payload; the Path Simulator reads them from the session document.
    selectionReason: choice.reason,
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
    if (action === "forceSubmit") updated = { ...(await applyOpenSecureExamDraft(updated, now)), status: "force_submitted", submittedAt: now, currentQuestion: null };
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
    const roleWeight = { warmup: 0.8, classwork: 0.9, dol: 1.25, practice: 1, quiz: 1.35, test: 1.4, retention: 1.15 }[evidence.source?.activityRole] || 1;
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

function translateAssignmentAiError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof assignmentAi.AssignmentAiError) {
    return new HttpsError(
      error.code || "internal",
      error.message || "MathMaster could not build this assignment with AI.",
      error.details || undefined,
    );
  }
  logger.error("Integrated assignment AI failed", {
    name: error?.name || null,
    message: error?.message || String(error),
  });
  return new HttpsError(
    "internal",
    "MathMaster could not build this assignment with AI. Use the copy/paste AI workflow while the service is checked.",
  );
}

exports.authorAssignmentWithAI = onCall({
  secrets: ASSIGNMENT_AI_SECRETS,
  timeoutSeconds: 300,
  memory: "1GiB",
}, async (request) => {
  const teacherUid = await requireTeacher(request);
  const prompt = String(request.data?.prompt || "").trim();
  const requestedModel = String(readPublicEnv("OPENAI_ASSIGNMENT_MODEL", assignmentAi.DEFAULT_ASSIGNMENT_MODEL) || "").trim()
    || assignmentAi.DEFAULT_ASSIGNMENT_MODEL;

  try {
    await reserveAssignmentAiUsage(getFirestore(), teacherUid);
    const result = await assignmentAi.callOpenAiAssignmentAuthor({
      apiKey: readOpenAiApiKey(),
      prompt,
      model: requestedModel,
    });

    await getFirestore().collection("assignmentAiAudit").add({
      teacherUid,
      teacherEmail: callerEmail(request),
      provider: "openai",
      model: result.model,
      responseId: result.responseId,
      usage: result.usage || null,
      promptCharacters: prompt.length,
      createdAt: FieldValue.serverTimestamp(),
    });

    return result;
  } catch (error) {
    throw translateAssignmentAiError(error);
  }
});
