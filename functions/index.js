const crypto = require("crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
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

/** True when this email may hold the teacher role right now. */
async function isAuthorizedTeacher(db, email) {
  if (!email) return false;
  if (authLib.bootstrapTeacherEmails().includes(email)) return true;
  const snapshot = await db.collection(authLib.TEACHER_COLLECTION).doc(email).get();
  return snapshot.exists && snapshot.data()?.active !== false;
}

async function assignClaims(uid, claims) {
  await getAuth().setCustomUserClaims(uid, claims);
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
    if (token.role !== "teacher") await assignClaims(uid, { role: "teacher" });
    await db.collection(authLib.TEACHER_COLLECTION).doc(email).set(
      { email, active: true, lastSignInAt: FieldValue.serverTimestamp(), uid },
      { merge: true },
    );
    return { role: "teacher", email };
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

  const [roster, credentials, directory, aliases, teachers] = await Promise.all([
    // Only these two fields — the rest of a grades document is the student's
    // entire attempt history and has no business in this payload.
    db.collection("grades").select("classPeriod", "linkedEmail").get(),
    db.collection(authLib.CREDENTIALS_COLLECTION).get(),
    db.collection(authLib.DIRECTORY_COLLECTION).get(),
    db.collection(authLib.ALIAS_COLLECTION).get(),
    db.collection(authLib.TEACHER_COLLECTION).get(),
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

  const students = roster.docs
    .filter((rosterDoc) => rosterDoc.id !== "test_connection")
    .map((rosterDoc) => {
      const credential = credentialByStudent[rosterDoc.id];
      const data = rosterDoc.data() || {};
      return {
        studentId: rosterDoc.id,
        classPeriod: data.classPeriod || "Unassigned",
        hasPasscode: Boolean(credential?.hash) && credential?.resetRequired !== true,
        resetRequired: credential?.resetRequired === true,
        linkedEmail: emailByStudent[rosterDoc.id] || data.linkedEmail || null,
      };
    })
    .sort((a, b) => a.studentId.localeCompare(b.studentId));

  return {
    students,
    teachers: teachers.docs.map((teacherDoc) => ({
      email: teacherDoc.id,
      active: teacherDoc.data()?.active !== false,
    })),
    bootstrapTeachers: authLib.bootstrapTeacherEmails(),
  };
});

/** Teacher action: grant or revoke another teacher's access. */
exports.setTeacherAccess = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();

  let email;
  try {
    email = authLib.normalizeEmail(request.data?.email);
  } catch (error) {
    throw translateAuthError(error);
  }
  const active = request.data?.active !== false;

  const ref = db.collection(authLib.TEACHER_COLLECTION).doc(email);
  await ref.set({ email, active, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  if (!active) {
    const uid = (await ref.get()).data()?.uid;
    if (uid) await assignClaims(uid, {}).catch(() => {});
  }

  return { email, active };
});

// --- OAuth connect flow -----------------------------------------------------

exports.getGoogleAuthUrl = onCall({ secrets: GOOGLE_API_SECRETS }, async () => {
  const db = getFirestore();
  const state = crypto.randomBytes(16).toString("hex");
  await db.doc(`oauthStates/${state}`).set({
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Date.now() + 10 * 60 * 1000,
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

exports.getClassroomConnectionStatus = onCall(async () => ({
  connected: await classroomLib.isConnected(),
}));

exports.getGoogleClassroomDiagnostics = onCall(
  { secrets: GOOGLE_AND_LINK_SECRETS },
  async () => {
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

exports.listGoogleCourses = onCall({ secrets: GOOGLE_API_SECRETS }, async () => {
  const classroom = await classroomLib.getClassroomClient();
  return { courses: await classroomLib.listCourses(classroom) };
});

exports.listClassroomStudents = onCall({ secrets: GOOGLE_API_SECRETS }, async (request) => {
  const { courseId } = request.data || {};
  if (!courseId) throw new HttpsError("invalid-argument", "courseId is required.");
  const classroom = await classroomLib.getClassroomClient();
  return { students: await classroomLib.listStudents(classroom, String(courseId)) };
});

exports.linkStudentToClassroom = onCall(async (request) => {
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

exports.listPublishedAssignments = onCall(async () => {
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
    const changedAssignmentIds = Object.keys(afterByAssignment).filter(
      (assignmentId) =>
        JSON.stringify(afterByAssignment[assignmentId]) !==
        JSON.stringify(beforeByAssignment[assignmentId])
    );
    if (changedAssignmentIds.length === 0) return;

    const db = getFirestore();
    let classroom = null;

    for (const assignmentId of changedAssignmentIds) {
      const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
      const questionCount = assignmentSnap.exists
        ? (assignmentSnap.data().questions || []).length
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
