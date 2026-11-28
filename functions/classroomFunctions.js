// GOOGLE CLASSROOM: the teacher's Google connection, rosters, publishing, launch links, whole-assignment grade passback and its checkpoint scheduler.
//
// One of the domain modules functions/index.js loads (see its header). The
// code here was moved from index.js as it stood; helpers that another domain
// also uses are in functionsCommon.js.

const crypto = require("crypto");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const { runtimeIncludedQuestionIndices, runtimeIncludedQuestionIndicesForSection, runtimeQuestionsFromAssignment } = require("./lib/assignmentRuntime");
const sectionRecoveryGrades = require("./lib/sectionRecoveryGrades");
// The reduced-item-count accommodation, loaded once (lazily) by this lib.
const studentWorkloadIndices = require("./lib/studentWorkloadIndices");
const { encryptLaunchPayload, decryptLaunchToken } = require("./lib/linkToken");
const { CLASSROOM_GRADE_TRIGGER_CAPACITY } = require("./lib/classroomGradeTriggerCapacity");
const {
  CLASSROOM_GRADED_NOT_RETURNED,
  classroomPushFailure,
  classroomPushHeldForLimit,
  classroomReturnRefusal,
  clearedClassroomErrorFields,
  clearedReturnRefusalFields,
  standingClassroomReturnRefusal,
} = require("./lib/classroomPushErrors");
const classroomPushQueue = require("./lib/classroomPushQueue");
const classroomReconcileRuns = require("./lib/classroomReconcileRuns");
const classroomStudentCheckpoints = require("./lib/classroomStudentCheckpoints");
const classroomCheckpointScan = require("./lib/classroomCheckpointScan");
// Which Classroom publications a teacher may see and act on: the publication
// callables' one rule.
const classroomLinkOwnership = require("./lib/classroomLinkOwnership");
// The grade passback monitor's rows: a teacher's own, read by their own posts.
const classroomGradeSyncRows = require("./lib/classroomGradeSyncRows");
// The release rule (whether Classroom shows the student a grade, and whether
// it is returned) is the lib's: one rule for this whole-assignment trigger and
// the section trigger (tests/platform/classroomReleasePolicyOneRule.test.mjs).
const { classroomGradeReleasePolicy, classroomReceiptNeedsWriting, deferredClassCheckpoint } = require("./lib/classroomGradeRuntime");
const { noWorkIsMissingNotZero, noWorkRetryRow, noWorkRetryRowIsDue } = require("./lib/classroomMissingWork");
// What wakes the two grade triggers: a tracker that moved beyond time on task.
const { trackerChangedBeyondTimeOnTask } = require("./lib/classroomTrackerChange");
const {
  GOOGLE_API_SECRETS,
  GOOGLE_AND_LINK_SECRETS,
  LINK_ENCRYPTION_KEY,
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
const { ownedMappings } = require("./lib/classroomMappingOwnership");
const {
  assignmentUsesTeacherReleasePolicy,
  assignmentFeedbackWasReleased,
  assignmentFeedbackIsHeld,
} = require("./lib/activityFeedback");
// The Test Cycle rules are shared ESM; this is the CommonJS bridge to them.
const testCycleLib = require("./lib/testCycle");
const {
  CLASS_POINT_REWARD_REDEMPTIONS_COLLECTION,
  activeAssignmentGradeOverride,
  assertTeacherMayManageAssignment,
  assignClaims,
  assignmentAudience,
  assignmentGradeProgress,
  authoritativeStudentClassId,
  callerEmail,
  classPointRewards,
  classroomLib,
  joinCodeMatchesRoster,
  loadTestCycleAssignment,
  lookupJoinCode,
  questionWasAttempted,
  readPersistencePending,
  requireTeacher,
  resolveJoinCodeMembership,
  runTestCyclePreflight,
  serializableDate,
  studentIdentity,
  studentOmittedFor,
  studentRequiredIndices,
  toDate,
  translateAuthError,
} = require("./functionsCommon");

let driveResourcesModule = null;
function driveResources() {
  if (!driveResourcesModule) driveResourcesModule = require("./lib/driveResources");
  return driveResourcesModule;
}

const MAX_CLASSROOM_COURSES_PER_BATCH = 20;
const PUBLISH_LEASE_MS = 5 * 60 * 1000;

function requirePublicEnv(name) {
  const value = readPublicEnv(name);
  if (!value) throw new HttpsError("failed-precondition", `${name} is not configured.`);
  return value;
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

/*
 * Whether the caller manages this assignment, by the rule above: the root
 * administrator, or the verified teacher of record of every class it is
 * assigned to. Answered rather than thrown, for the Classroom publication
 * callables: a publication that records no teacher is shown and acted on only
 * for that caller (lib/classroomLinkOwnership.js).
 */
async function callerManagesAssignment(request, assignmentSnap) {
  try {
    await assertTeacherMayManageAssignment(request, assignmentSnap);
    return true;
  } catch (error) {
    if (error instanceof HttpsError && ["permission-denied", "failed-precondition"].includes(error.code)) return false;
    throw error;
  }
}

/** The same question for an assignment the callable has not read: one read, of the one field it needs. */
async function callerManagesAssignmentId(request, db, assignmentId) {
  const [assignmentSnap] = await db.getAll(db.doc(`assignments/${String(assignmentId)}`), { fieldMask: ["assignedClassIds"] });
  return callerManagesAssignment(request, assignmentSnap);
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

// The per-student final cutoff for Classroom passback. Classroom must never
// call a student "final" earlier than the deadline the student's own dashboard
// and the server's own submission finalizer already honor for them.
// `studentFinalCutoff` is that student's individual cutoff — their private
// record (studentAssignmentOverrides.mjs) merged with any copy still on the
// shared document, and their extra-time final date (supportDeadline.mjs) —
// resolved by the caller (resolvedStudentClassroomDeadlines below). The class
// cutoff is never shortened by it.
function studentLateDueAt(assignment, studentFinalCutoff = null) {
  const classFinal = toDate(
    assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate
  );
  const studentFinal = toDate(studentFinalCutoff);
  if (!classFinal) return studentFinal;
  if (!studentFinal) return classFinal;
  return studentFinal.getTime() > classFinal.getTime() ? studentFinal : classFinal;
}

// The student's own due time: an extra-time accommodation's individualized
// due date (supportDeadline.mjs) moves it later; nothing moves it earlier.
function studentDueDate(assignment, studentDueAt = null) {
  const classDue = toDate(assignment?.dueAt || assignment?.dueDate);
  const studentDue = toDate(studentDueAt);
  if (!classDue) return studentDue;
  if (!studentDue) return classDue;
  return studentDue.getTime() > classDue.getTime() ? studentDue : classDue;
}

/**
 * One student's individual due time and final cutoff on one assignment, read
 * with the server's authority: their private record, and their pinned support
 * profile (`studentProfile`, from the grade document in hand). Each is null
 * when it is not individual (lib/classroomStudentCheckpoints.js).
 */
async function resolvedStudentClassroomDeadlines(db, assignmentId, assignment, studentId, studentProfile = null) {
  return classroomStudentCheckpoints.studentClassroomDeadlinesFor({ db, assignmentId, assignment, studentId, studentProfile });
}

function resolveClassroomGradeStage({ assignment, progress, releaseSignal, nowValue = Date.now(), studentFinalCutoff = null, studentDueAt = null }) {
  const reason = releaseSignalReason(releaseSignal);
  const now = Number(nowValue) || Date.now();
  const dueAt = studentDueDate(assignment, studentDueAt);
  const lateDueAt = studentLateDueAt(assignment, studentFinalCutoff);
  // H-116: "final-deadline" and "due-checkpoint" are queued for the whole
  // roster at the CLASS's cutoff and due time. They speak for this student
  // only once THEIR own has arrived; before it the grade is ordinary progress
  // (not returned), and the scheduler wakes them again at their own time.
  if (reason === "final-deadline" && !(lateDueAt && now < lateDueAt.getTime())) return "final-deadline";
  if (reason === "due-checkpoint" && !(dueAt && now < dueAt.getTime())) return "due-checkpoint";
  if (reason === "assessment-release") return progress.complete ? "final-complete" : "assessment-release";

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

  // Guesses are throttled per signed-in account, as PIN sign-in is per ID
  // (security review 2026-11-28, A1).
  const throttleKey = `googleLink_${request.auth.uid}`;
  const throttle = await authLib.checkThrottle(db, throttleKey);
  if (throttle.locked) {
    throw new HttpsError("resource-exhausted", authLib.describeLockout(throttle.retryAfterMs));
  }
  const refuseAndCount = async (code, message) => {
    await authLib.recordFailedAttempt(db, throttleKey);
    return new HttpsError(code, message);
  };

  const joinCode = await lookupJoinCode(db, code);
  if (!joinCode) {
    throw await refuseAndCount("permission-denied", "That class code is not valid. Ask your teacher for the current one.");
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
    throw await refuseAndCount("permission-denied", "That class code does not match the class assigned to this student ID.");
  }
  const record = rosterSnapshot.data() || {};
  // A roster row that already knows this student's Google account (from the
  // Classroom roster) links only that account. And an account already linked
  // to one student is not moved to another by itself: the teacher unlinks it
  // first. Either way a classmate holding the class code cannot take over a
  // student's record (security review 2026-11-28, A1).
  const knownGoogleEmail = String(record.googleEmail || "").trim().toLowerCase();
  if (knownGoogleEmail && knownGoogleEmail !== email) {
    throw await refuseAndCount("permission-denied", "That student ID belongs to a different Google account. Ask your teacher.");
  }
  const callerLink = await directoryRef.get();
  const callerLinkedStudent = callerLink.exists ? String(callerLink.data()?.studentId || "") : "";
  if (callerLinkedStudent && callerLinkedStudent !== studentId) {
    throw new HttpsError("already-exists", "This Google account is already linked to a different student ID. Ask your teacher to unlink it.");
  }
  await directoryRef.set(
    { email, studentId, linkedAt: FieldValue.serverTimestamp(), uid: request.auth.uid },
    { merge: true },
  );
  await db.collection("grades").doc(studentId).set({ linkedEmail: email }, { merge: true });
  await assignClaims(request.auth.uid, { role: "student", studentId });
  await authLib.clearThrottle(db, throttleKey);

  return { role: "student", studentId, classPeriod: record.classPeriod || joinCode.classPeriod || "Unassigned" };
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

// Upper bounds for one call that makes a Google request per course (and per
// topic). The publish callables already stop at 20 courses.
const CLASSROOM_MAX_COURSES_PER_CALL = 20;
const CLASSROOM_MAX_TOPICS_PER_CALL = 100;

async function getTeacherClassroomMapping(db, teacherUid, courseId) {
  const mappingId = classroomMappingDocumentId(teacherUid, String(courseId));
  const snap = await db.doc(`classroomCourseMappings/${mappingId}`).get();
  if (!snap.exists) return null;
  // A mapping whose class has moved to another teacher is no mapping at all
  // (lib/classroomMappingOwnership.js).
  const [mapping] = await ownedMappings(db, [{ id: snap.id, ...snap.data() }], { isRootAdminEmail: authLib.isRootAdminEmail });
  return mapping || null;
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

  const identity = await studentIdentity();
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
        // A stored copy that is an id or a placeholder is not a name.
        name: identity.acceptStudentName(entry.name, entry) || null,
      })),
  };
});

/**
 * The Google identity a Classroom link copies onto grades/{studentId} and onto
 * the classroomRosterLinks record.
 *
 * googleName is the ONLY name some legacy students have, so a roster entry
 * with no usable name (blank, an email address, an id) never erases one: the
 * name and the email are written only when the new value is real. The one
 * exception is a link that moves the record to a DIFFERENT Google account —
 * the name and email on file then belong to someone else and are removed, for
 * the same reason the replaced-link cleanup in linkClassroomRosterBatch
 * removes them from a student who loses a link.
 */
function classroomGoogleIdentityFields(
  identity,
  { studentId, googleUserId, name, email, previousGoogleUserId = null },
  { nameField, emailField },
) {
  const acceptedName = identity.acceptStudentName(name, { studentId, googleUserId });
  const cleanEmail = typeof email === "string" ? email.trim().slice(0, 320) : "";
  const previous = String(previousGoogleUserId || "").trim();
  const accountChanged = Boolean(previous) && previous !== String(googleUserId);
  const fields = {};
  if (acceptedName) fields[nameField] = acceptedName;
  else if (accountChanged) fields[nameField] = FieldValue.delete();
  if (cleanEmail) fields[emailField] = cleanEmail;
  else if (accountChanged) fields[emailField] = FieldValue.delete();
  return fields;
}

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
  const { student } = await assertMappedStudent(db, teacherUid, String(courseId), effectiveClassId, cleanStudentId);

  const rosterLinkId = rosterLinkDocumentId(String(courseId), cleanStudentId);
  const rosterLinkRef = db.doc(`classroomRosterLinks/${rosterLinkId}`);
  const identity = await studentIdentity();
  const cleanGoogleUserId = String(googleUserId);
  const existingLink = await rosterLinkRef.get();
  // Only a real name/email is copied; a blank one never erases what is on file.
  const linkInput = { studentId: cleanStudentId, googleUserId: cleanGoogleUserId, name, email };
  await rosterLinkRef.set(
    {
      rosterLinkId,
      teacherUid,
      classId: effectiveClassId,
      courseId: String(courseId),
      studentId: cleanStudentId,
      googleUserId: cleanGoogleUserId,
      ...classroomGoogleIdentityFields(
        identity,
        { ...linkInput, previousGoogleUserId: existingLink.exists ? existingLink.data()?.googleUserId : null },
        { nameField: "name", emailField: "email" },
      ),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await db.doc(`grades/${cleanStudentId}`).set(
    {
      googleUserId: cleanGoogleUserId,
      ...classroomGoogleIdentityFields(
        identity,
        { ...linkInput, previousGoogleUserId: student?.googleUserId },
        { nameField: "googleName", emailField: "googleEmail" },
      ),
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
      // Raw Classroom values; classroomGoogleIdentityFields decides what is
      // a real name/email before anything is written.
      email: item.email,
      name: item.name,
      previousGoogleUserId: studentSnap.data()?.googleUserId || null,
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

  const identity = await studentIdentity();
  const existingLinkById = new Map(existingLinks.map((entry) => [entry.id, entry]));
  for (const item of prepared) {
    const rosterLinkId = rosterLinkDocumentId(cleanCourseId, item.studentId);
    // Only a real name/email is copied; a blank one never erases what is on
    // file (googleName is the only name some legacy students have).
    batch.set(
      db.doc(`classroomRosterLinks/${rosterLinkId}`),
      {
        rosterLinkId,
        teacherUid,
        classId: cleanClassId,
        courseId: cleanCourseId,
        studentId: item.studentId,
        googleUserId: item.googleUserId,
        ...classroomGoogleIdentityFields(
          identity,
          { ...item, previousGoogleUserId: existingLinkById.get(rosterLinkId)?.googleUserId || null },
          { nameField: "name", emailField: "email" },
        ),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(
      db.doc(`grades/${item.studentId}`),
      {
        googleUserId: item.googleUserId,
        ...classroomGoogleIdentityFields(identity, item, { nameField: "googleName", emailField: "googleEmail" }),
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
    const courseIds = [...new Set((Array.isArray(request.data?.courseIds) ? request.data.courseIds : []).map(String).filter(Boolean))];
    const topicNames = [...new Set(
      (Array.isArray(request.data?.topicNames) ? request.data.topicNames : []).map((value) => String(value).trim().slice(0, 120)).filter(Boolean)
    )];
    if (!courseIds.length || !topicNames.length) {
      throw new HttpsError("invalid-argument", "Select at least one course and one topic.");
    }
    // One Google call per course and topic: bounded as the publish callables
    // are (security review 2026-11-28, A5).
    if (courseIds.length > CLASSROOM_MAX_COURSES_PER_CALL || topicNames.length > CLASSROOM_MAX_TOPICS_PER_CALL) {
      throw new HttpsError("invalid-argument", `Choose at most ${CLASSROOM_MAX_COURSES_PER_CALL} courses and ${CLASSROOM_MAX_TOPICS_PER_CALL} topics at once.`);
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
    const courseIds = [...new Set((Array.isArray(request.data?.courseIds) ? request.data.courseIds : []).map(String).filter(Boolean))];
    let materials = cleanMaterials(request.data?.materials);
    if (!title || !courseIds.length || !materials.length) {
      throw new HttpsError(
        "invalid-argument",
        "title, courseIds and at least one material link are required."
      );
    }
    if (courseIds.length > CLASSROOM_MAX_COURSES_PER_CALL) {
      throw new HttpsError("invalid-argument", `Choose at most ${CLASSROOM_MAX_COURSES_PER_CALL} courses at once.`);
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

  // The caller's own posts (lib/classroomLinkOwnership.js). Every link read
  // here is this assignment's, which the callable has read already.
  const publications = await classroomLinkOwnership.linksForTeacher(
    linkSnap.docs
      .map((doc) => ({ ref: doc.ref, data: doc.data() }))
      .filter((entry) => entry.data.status === "published" && entry.data.courseworkId)
      .filter((entry) => !requested || requested.has(String(entry.data.courseId))),
    { teacherUid, linkOf: (entry) => entry.data, managesAssignment: () => callerManagesAssignment(request, assignmentSnap) }
  );

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
  // Existence only: a grade document is a student's whole year.
  const gradeSnapshots = await db.getAll(...gradeRefs, { fieldMask: [] });
  const existingGrades = gradeSnapshots.filter((snapshot) => snapshot.exists);

  // A reposted column has to receive every grade again, so these go as manual
  // retries, queued a minute's worth at a time (lib/classroomPushQueue.js).
  await classroomPushQueue.enqueueClassroomPushes(db, {
    assignmentId: String(assignmentId),
    studentIds: existingGrades.map((snapshot) => snapshot.id),
    reason: "manual-retry",
    source: "reposted-assignment",
  });

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

    // The caller's own posts (lib/classroomLinkOwnership.js), all of them this
    // assignment's.
    const existingPublications = await classroomLinkOwnership.linksForTeacher(
      publicationSnapshot.docs
        .map((doc) => ({ ref: doc.ref, id: doc.id, data: doc.data() || {} }))
        .filter(({ data }) => data.courseId),
      { teacherUid, linkOf: (entry) => entry.data, managesAssignment: () => callerManagesAssignment(request, assignmentSnap) }
    );

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

    // The caller's own posts (lib/classroomLinkOwnership.js).
    const publications = await classroomLinkOwnership.linksForTeacher(
      snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((item) => item.courseId && item.courseworkId && item.status === "published"),
      { teacherUid, managesAssignment: () => callerManagesAssignmentId(request, db, assignmentId) }
    );

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
    const snap = await db
      .collection("classroomLinks")
      .where("assignmentId", "==", assignmentId)
      .get();

    // The caller's own posts (lib/classroomLinkOwnership.js). Their Google
    // account is used only when there is one to remove.
    const publications = await classroomLinkOwnership.linksForTeacher(
      snap.docs
        .map((doc) => ({ ref: doc.ref, data: doc.data() }))
        .filter((entry) => entry.data.courseId),
      { teacherUid, linkOf: (entry) => entry.data, managesAssignment: () => callerManagesAssignmentId(request, db, assignmentId) }
    );
    const classroom = publications.length ? await classroomLib().getClassroomClient(teacherUid) : null;

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

/*
 * One teacher's own Classroom publications, for the two lists below: every one
 * of them, a page at a time (lib/classroomLinkOwnership.js). The lists read
 * any 500 (or 2,000) links of every teacher's and kept the caller's, so past
 * that a teacher's own posts dropped off without a sign.
 */
async function readOwnClassroomLinks(db, teacherUid, callable, options = {}) {
  const read = await classroomLinkOwnership.readTeacherLinks(db, teacherUid, options);
  const concerns = classroomLinkOwnership.teacherLinkReadConcerns({ links: read.docs.length, complete: read.complete });
  if (!read.complete) {
    logger.error("A teacher's Classroom publications stopped at the page limit", { callable, teacherUid, links: read.docs.length, pages: read.pages, concerns });
  } else if (concerns.length) {
    logger.warn("A teacher's Classroom publications are near the list limits", { callable, teacherUid, links: read.docs.length, pages: read.pages, concerns });
  }
  return read.docs;
}

exports.listPublishedAssignments = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const db = getFirestore();
  const links = (await readOwnClassroomLinks(db, teacherUid, "listPublishedAssignments"))
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
  // Called before sign-in (the launch preview), so the id is one assignment
  // document id and nothing else: a path with a slash would name a document
  // somewhere under it (security review 2026-11-28, A6).
  if (typeof assignmentId !== "string" || !assignmentId || assignmentId.length > 200 || assignmentId.includes("/")) {
    throw new HttpsError("invalid-argument", "assignmentId is required.");
  }
  const db = getFirestore();
  const snap = await db.collection("assignments").doc(assignmentId).get();
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
  // The caller's own posts, as "Published assignments" reads them: only their
  // ids and assignments are needed.
  const ownPublications = await readOwnClassroomLinks(db, teacherUid, "listClassroomGradeSyncs", { fields: ["assignmentId"] });
  const publicationIds = new Set(ownPublications.map((doc) => doc.id));
  if (!publicationIds.size) return { syncs: [], pushQueue: { waiting: 0 }, reconcileRuns: [] };
  const ownAssignments = new Set(ownPublications.map((doc) => String(doc.data().assignmentId || "")));

  // The rows of those posts alone, by their ids, and the newest 500 of them
  // (lib/classroomGradeSyncRows.js). This read the newest 500 rows of every
  // teacher's and kept the caller's, so a teacher whose rows were not among
  // the school's newest 500 saw part of their monitor, or none of it.
  const read = await classroomGradeSyncRows.readPublicationGradeSyncs(db, [...publicationIds]);
  const rowConcerns = classroomGradeSyncRows.gradeSyncReadConcerns({ rows: read.docs.length, complete: read.complete });
  if (!read.complete) {
    logger.error("The grade passback monitor stopped reading a teacher's rows at its limit", { teacherUid, posts: publicationIds.size, rows: read.docs.length, queries: read.queries, concerns: rowConcerns });
  } else if (rowConcerns.length) {
    logger.warn("The grade passback monitor read many rows for one teacher", { teacherUid, posts: publicationIds.size, rows: read.docs.length, queries: read.queries, concerns: rowConcerns });
  }
  // Pushes waiting in the paced queue (lib/classroomPushQueue.js).
  const waiting = (await classroomPushQueue.waitingClassroomPushes(db, { limit: 2000 }))
    .filter((entry) => ownAssignments.has(entry.assignmentId));
  const queuedPushes = new Set(waiting.map((entry) => `${entry.assignmentId}/${entry.studentId}`));
  const syncs = classroomGradeSyncRows.newestGradeSyncs(read.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => publicationIds.has(String(item.publicationId))))
    .map((item) => ({
      ...item,
      queued: queuedPushes.has(`${item.assignmentId}/${item.studentId}`),
      updatedAt: serializableDate(item.updatedAt),
      syncedAt: serializableDate(item.syncedAt),
    }));
  // What the caller's last "Reconcile section grades" did on each assignment
  // (lib/classroomReconcileRuns.js): one read a run.
  // The line is an extra: a failed read of it must not take the monitor down.
  const reconcile = await classroomReconcileRuns.readTeacherReconcileRuns(db, teacherUid).catch((error) => {
    logger.warn("The grade passback monitor could not read the teacher's reconcile runs", { teacherUid, message: String(error?.message || error) });
    return { runs: [], complete: true };
  });
  if (!reconcile.complete) {
    logger.warn("The grade passback monitor read a teacher's reconcile runs up to its limit", { teacherUid, runs: reconcile.runs.length });
  }
  return { syncs, pushQueue: { waiting: waiting.length }, reconcileRuns: reconcile.runs };
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
  // The caller's own post, by the publication callables' one rule
  // (lib/classroomLinkOwnership.js): a post that records no teacher is theirs
  // only if they manage its assignment. Anyone else is refused as for another
  // teacher's post.
  const [ownPublication] = await classroomLinkOwnership.linksForTeacher([publication], {
    teacherUid,
    linkOf: (snapshot) => snapshot.data(),
    managesAssignment: (id) => callerManagesAssignmentId(request, db, id),
  });
  if (!ownPublication) {
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

  // Existence only: a grade document is a student's whole year.
  const [gradeSnap] = await db.getAll(db.doc(`grades/${String(studentId)}`), { fieldMask: [] });
  if (!gradeSnap.exists) {
    throw new HttpsError("not-found", "Student grade record not found.");
  }
  // Queued like every other push, so retries cannot outrun Google's limit
  // (lib/classroomPushQueue.js). It goes out within a minute when the queue is empty.
  await classroomPushQueue.enqueueClassroomPushes(db, {
    assignmentId: String(assignmentId),
    studentIds: [String(studentId)],
    reason: "manual-retry",
    source: "teacher-retry",
  });
  return { queued: true };
});

// "Retry all eligible failures": every failed push this teacher owns, queued
// in one call. The browser used to call retryClassroomGradeSync once for each
// failed row it had been sent (any 500 rows), and every call went to Google
// at once: on Oct 14, 2026, 208 of them became about 2,000 Classroom requests
// in 70 seconds against a limit of 600 a minute.
exports.retryAllClassroomGradeSyncs = onCall(async (request) => {
  const teacherUid = await requireTeacher(request);
  const db = getFirestore();
  const failedSnap = await db.collection("classroomGradeSyncs")
    .where("status", "==", "failed")
    .select("publicationId", "studentId", "assignmentId")
    .get();
  const rows = failedSnap.docs
    .map((doc) => doc.data() || {})
    .filter((row) => row.publicationId && row.studentId && row.assignmentId);
  const publicationIds = [...new Set(rows.map((row) => String(row.publicationId)))];
  const publications = new Map();
  for (let start = 0; start < publicationIds.length; start += 100) {
    // eslint-disable-next-line no-await-in-loop
    const snapshots = await db.getAll(
      ...publicationIds.slice(start, start + 100).map((id) => db.doc(`classroomLinks/${id}`)),
      { fieldMask: ["teacherUid", "assignmentId"] }
    );
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) publications.set(snapshot.id, snapshot.data() || {});
    });
  }

  // The same ownership rule as one row's retry (lib/classroomLinkOwnership.js):
  // a post that records no teacher is the caller's only if they manage its
  // assignment, asked once an assignment.
  const ownPublicationIds = new Set((await classroomLinkOwnership.linksForTeacher([...publications], {
    teacherUid,
    linkOf: ([, link]) => link,
    managesAssignment: (id) => callerManagesAssignmentId(request, db, id),
  })).map(([id]) => id));
  const studentsByAssignment = new Map();
  let failedRows = 0;
  for (const row of rows) {
    const publication = publications.get(String(row.publicationId));
    if (!publication || !ownPublicationIds.has(String(row.publicationId))) continue;
    if (String(publication.assignmentId || "") !== String(row.assignmentId)) continue;
    failedRows += 1;
    const students = studentsByAssignment.get(String(row.assignmentId)) || new Set();
    students.add(String(row.studentId));
    studentsByAssignment.set(String(row.assignmentId), students);
  }

  let queued = 0;
  for (const [assignmentId, students] of studentsByAssignment) {
    // eslint-disable-next-line no-await-in-loop
    queued += await classroomPushQueue.enqueueClassroomPushes(db, {
      assignmentId,
      studentIds: [...students],
      reason: "manual-retry",
      source: "teacher-retry-all",
    });
  }
  return { failedRows, queued, assignments: studentsByAssignment.size };
});

exports.syncGradeToClassroom = onDocumentWritten(
  {
    document: "grades/{studentId}",
    secrets: GOOGLE_API_SECRETS,
    ...CLASSROOM_GRADE_TRIGGER_CAPACITY,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after || !after.exists) return;

    const afterData = after.data() || {};
    const beforeData = event.data?.before?.exists ? event.data.before.data() || {} : {};
    const afterByAssignment = afterData.gradesByAssignment || {};
    const beforeByAssignment = beforeData.gradesByAssignment || {};
    // A change that moves only time on task (a Next's `timeSpent`) is no
    // change: nothing here reads it (lib/classroomTrackerChange.js).
    const gradeChangedAssignmentIds = Object.keys(afterByAssignment).filter(
      (assignmentId) => trackerChangedBeyondTimeOnTask(beforeByAssignment[assignmentId], afterByAssignment[assignmentId])
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
    // A completed Practice-based Recovery, or a Live Challenge Warm-Up result,
    // rescores its section in this same grade, so it has to wake this trigger
    // too.
    const recoveryChangedIds = sectionRecoveryGrades.recoveryChangedAssignmentIds(afterData, beforeData);
    const changedAssignmentIds = [...new Set([
      ...gradeChangedAssignmentIds,
      ...overrideChangedAssignmentIds,
      ...testCycleChangedAssignmentIds,
      ...releaseSignaledAssignmentIds,
      ...recoveryChangedIds,
    ])];
    /*
     * A SUPPORT-PROFILE CHANGE THAT MOVES WHICH ITEMS THE STUDENT OWES (TT23).
     *
     * Saving a support profile writes only `grades/{id}.profile`, so a
     * reduced-item-count accommodation changed on open work changed the grade
     * MathMaster shows and left Classroom on the old one until the next answer.
     * The assignments the change moved get the push an answer would give them,
     * with one rule of their own below: it only corrects a grade Classroom
     * already holds, and only when the grade really differs. (Parts inside one
     * question are not reduced: design 11.9.)
     */
    const profileMovedIds = await studentWorkloadIndices.profileMovedAssignmentIds({
      db: getFirestore(),
      beforeData,
      afterData,
      onError: (error) => logger.warn("Support-profile change: could not tell which assignments it moved", {
        studentId: event.params.studentId,
        message: String(error?.message || error),
      }),
    });
    const profileOnlyIds = new Set(profileMovedIds.filter((id) => !changedAssignmentIds.includes(id)));
    changedAssignmentIds.push(...profileOnlyIds);
    if (changedAssignmentIds.length === 0) return;
    // Woken by a release signal and nothing else.
    const changedBeyondSignal = new Set([
      ...gradeChangedAssignmentIds,
      ...overrideChangedAssignmentIds,
      ...testCycleChangedAssignmentIds,
      ...recoveryChangedIds,
    ]);
    const signalOnlyAssignmentIds = new Set(releaseSignaledAssignmentIds.filter((id) => !changedBeyondSignal.has(id)));

    const db = getFirestore();
    const classroomByTeacher = new Map();
    // Once Google refuses a teacher for the per-minute limit, this push stops
    // calling it for that teacher; the rest of the columns wait in the queue.
    const teachersAtClassroomLimit = new Set();

    for (const assignmentId of changedAssignmentIds) {
      // eslint-disable-next-line no-await-in-loop
      const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
      if (!assignmentSnap.exists) continue;
      const assignment = assignmentSnap.data() || {};
      if (assignmentFeedbackIsHeld(assignment)) continue;
      if (!await require("./lib/retroactiveAccommodation").correctionSyncAllowed({ db, studentId: event.params.studentId, gradeData: afterData, assignment: { ...assignment, id: assignmentId } })) continue;

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
            if (rewards.isActivePracticePassRedemption(redemptionSnap.exists ? redemptionSnap.data() : null)) {
              questionIndices = rewards.excludeWaivedIndices(
                questionIndices,
                rewards.waivedPracticeIndices({ hasRedemption: true, practiceIndices }),
              );
            }
          }
        }
      }
      /*
       * A REDUCED-ITEM-COUNT ACCOMMODATION REMOVES THE ITEMS IT OMITS FROM
       * THIS SAME DENOMINATOR, after the Practice Pass (the two commute; the
       * plan is content-only). An omitted item is not missing and never a
       * zero: Classroom receives the grade MathMaster shows over the student's
       * own required items (see studentOmittedFor). A secure Test Cycle is
       * never reshaped.
       */
      // Persistence safety (below) keeps counting every included item.
      const includedQuestionIndices = questionIndices;
      const studentOmitted = isTestCycleAssignment
        ? new Set()
        // eslint-disable-next-line no-await-in-loop
        : await studentOmittedFor({ assignment, gradeData: afterData, assignmentId });
      questionIndices = studentRequiredIndices(questionIndices, studentOmitted);
      if (!isTestCycleAssignment && !questionIndices.length) continue;

      const assignmentTracker = afterByAssignment[assignmentId] || {};
      const questions = runtimeQuestionsFromAssignment(assignment);
      const releaseSignal = releaseSignalSet.has(assignmentId)
        ? afterReleaseSignals[assignmentId]
        : null;
      // A completed Recovery credits its section at the recorded score inside
      // this same calculation (functions/lib/sectionRecoveryGrades.js).
      // eslint-disable-next-line no-await-in-loop
      const recoveredInputs = isTestCycleAssignment
        ? { tracker: assignmentTracker, overrides: authoritativeOverrides }
        : await sectionRecoveryGrades.projectRecoveredGradeInputs({
          assignment,
          tracker: assignmentTracker,
          questions,
          overrides: authoritativeOverrides,
          recoveryForAssignment: afterData.sectionRecoveryByAssignment?.[assignmentId] || null,
          // A Live Challenge Warm-Up result is the Warm-Up grade.
          challengeCredit: afterData.warmupChallengeByAssignment?.[assignmentId] || null,
          gradeProgress: assignmentGradeProgress,
          // A recovered section's original is the student's required items too.
          omittedIndices: studentOmitted,
        });
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
          recoveredInputs.tracker,
          questionIndices,
          questions,
          recoveredInputs.overrides,
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
      // The student's own individual due time and final cutoff: their private
      // record and their extra-time dates (H-116).
      const { studentDueAt, studentFinalCutoff } = isTestCycleAssignment
        ? { studentDueAt: null, studentFinalCutoff: null }
        // eslint-disable-next-line no-await-in-loop
        : await resolvedStudentClassroomDeadlines(db, assignmentId, assignment, event.params.studentId, afterData.profile || null);
      // One clock for the stage, the deferral and the release: at a student's
      // own cutoff they are either called final or recorded, never neither.
      const stageNow = Date.now();
      const stage = isTestCycleAssignment
        ? (testCycleProjection?.recordedGradeSource === "retest" ? "testcycle-retest" : "testcycle-test")
        : resolveClassroomGradeStage({
          assignment,
          progress,
          releaseSignal,
          nowValue: stageNow,
          studentFinalCutoff,
          studentDueAt,
        });
      // H-116: a class-wide "final"/"due" wake-up that reached this student
      // before their own time is set aside above; record their own time so
      // the checkpoint scheduler wakes them again then.
      const deferredCheckpoint = isTestCycleAssignment
        ? null
        : deferredClassCheckpoint({ assignment, releaseSignal, nowValue: stageNow, studentFinalCutoff, studentDueAt });
      if (deferredCheckpoint) {
        // eslint-disable-next-line no-await-in-loop
        await classroomStudentCheckpoints.recordDeferredStudentCheckpoint({
          stateRef: db.collection(CLASSROOM_GRADE_CHECKPOINT_COLLECTION).doc(assignmentId),
          assignmentId,
          studentId: event.params.studentId,
          deferred: deferredCheckpoint,
        });
      }
      if (!stage) continue;
      // No work at the due date: nothing is sent, and Classroom shows the
      // work as Missing, as the section columns do
      // (lib/classroomMissingWork.js).
      if (noWorkIsMissingNotZero({ stage, progress })) {
        // A teacher's Retry on a row that was left failed is answered on the
        // row: why nothing was sent (lib/classroomMissingWork.js).
        if (releaseSignalReason(releaseSignal) === "manual-retry") {
          // eslint-disable-next-line no-await-in-loop
          const noWorkLinks = await db.collection("classroomLinks").where("assignmentId", "==", assignmentId).get();
          for (const linkDoc of noWorkLinks.docs) {
            const link = linkDoc.data() || {};
            // Only the columns this trigger sends to.
            if (link.status !== "published" || !link.courseworkId || link.gradePassbackEnabled === false || !String(link.courseId || "")) continue;
            // eslint-disable-next-line no-await-in-loop
            const noWorkPrior = await db.doc(`classroomGradeSyncs/${gradeSyncDocumentId(linkDoc.id, event.params.studentId)}`).get();
            if (!noWorkRetryRowIsDue({ signalReason: "manual-retry", priorExists: noWorkPrior.exists, prior: noWorkPrior.data() || {} })) continue;
            // eslint-disable-next-line no-await-in-loop
            await writeGradeSyncAudit(db, linkDoc.id, event.params.studentId, {
              ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
              assignmentId,
              courseId: String(link.courseId || ""),
              courseworkId: link.courseworkId || null,
              ...noWorkRetryRow({ stage, progress, clearedErrors: clearedClassroomErrorFields() }),
            });
          }
        }
        continue;
      }

      const grade = progress.grade;
      const isFinal = ["final-complete", "final-deadline"].includes(stage);
      // Persistence safety counts canonical attempts over EVERY included item,
      // as it did before the accommodation narrowed the grade's denominator
      // (an assignment-level override still counts as at least one attempt).
      const canonicalAttempted = studentOmitted.size
        ? Math.max(
          progress.attempted,
          includedQuestionIndices.filter((index) => questionWasAttempted(recoveredInputs.tracker?.[index])).length,
        )
        : progress.attempted;
      // A final-looking partial grade is more dangerous than a delayed grade.
      // Ordinary assignments consult known queue/checkpoint/session evidence;
      // Secure Test Cycle retains its separate release authority unchanged.
      const persistenceState = (!isTestCycleAssignment && isFinal)
        // eslint-disable-next-line no-await-in-loop
        ? await readPersistencePending({
          db,
          studentId: event.params.studentId,
          assignmentId,
          canonicalAttempted,
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
        nowValue: stageNow,
        studentDueAt,
        studentFinalCutoff,
      });
      // NV02: a partial grade held for the student's own extended time is
      // returned at their own cutoff, so the scheduler must wake them then —
      // also when no class-wide wake-up reached them first (an extension
      // granted after the class's final cutoff).
      if (releasePolicy.heldUntilMs) {
        // eslint-disable-next-line no-await-in-loop
        await classroomStudentCheckpoints.recordDeferredStudentCheckpoint({
          stateRef: db.collection(CLASSROOM_GRADE_CHECKPOINT_COLLECTION).doc(assignmentId),
          assignmentId,
          studentId: event.params.studentId,
          deferred: { kind: "final", atMs: releasePolicy.heldUntilMs },
        });
      }
      // A push queued again after Google's per-minute limit sends only the
      // columns that did not go through; the rest are already current.
      const quotaRetry = Math.max(0, Number(releaseSignal?.quotaRetry) || 0);
      const forceRetry = releaseSignalReason(releaseSignal) === "manual-retry" && quotaRetry === 0;
      const mayRequeue = quotaRetry < classroomPushQueue.MAX_QUOTA_RETRIES;
      let requeueForLimit = false;

      // eslint-disable-next-line no-await-in-loop
      const publicationsSnap = await db
        .collection("classroomLinks")
        .where("assignmentId", "==", assignmentId)
        .get();
      // A teacher's "Reconcile section grades" wakes this trigger too. It
      // acts on that teacher's own posts only, never a co-teacher's column
      // (lib/classroomReconcileRuns.js); a write that also changed the
      // student's work is an ordinary push to every column.
      const reconcileScope = signalOnlyAssignmentIds.has(assignmentId)
        ? classroomReconcileRuns.reconcileScopeOfSignal(releaseSignal)
        : null;
      const publications = publicationsSnap.docs.filter(
        (doc) => doc.data().status === "published" && doc.data().courseworkId
          && classroomReconcileRuns.publicationInReconcileScope(reconcileScope, doc.data())
      );
      if (publications.length === 0) continue;

      // A HELD Practice-based Recovery: MathMaster could not grade enough of
      // it to score it, so this grade is not settled — not as a zero, not as
      // the original, never as final. Nothing goes to Classroom until the
      // teacher resolves it (functions/lib/sectionRecoveryGrades.js); an
      // assignment-level teacher override already decided the whole grade.
      const recoveryHold = isTestCycleAssignment
        ? { held: false, sections: [] }
        : sectionRecoveryGrades.recoveryPassbackHold({
          recoveryForAssignment: afterData.sectionRecoveryByAssignment?.[assignmentId] || null,
          sectionKey: "whole",
          assignmentGradeOverride,
        });
      if (recoveryHold.held) {
        for (const publicationDoc of publications) {
          const publication = publicationDoc.data() || {};
          // Only the columns this trigger sends to (the loop below skips the
          // rest): a split section's column is the section trigger's, and it
          // records its own hold for its own section only.
          if (publication.gradePassbackEnabled === false || !String(publication.courseId || "")) continue;
          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
            assignmentId,
            courseId: String(publication.courseId || ""),
            courseworkId: publication.courseworkId || null,
            status: "recovery-held",
            stage: "recovery-held",
            // No number: a held row must never read as a grade that was sent.
            grade: null,
            isFinal: false,
            recoveryHeldSections: recoveryHold.sections,
            studentVisible: false,
            returnedToStudent: false,
            message: sectionRecoveryGrades.RECOVERY_HELD_SYNC_MESSAGE,
          });
        }
        continue;
      }

      if (persistenceState.persistencePending) {
        for (const publicationDoc of publications) {
          const publication = publicationDoc.data() || {};
          // Only the columns this trigger sends to, as for the Recovery hold
          // above. A split section's row is the section trigger's own, and it
          // does not hold for persistence: "sync-pending" there replaced its
          // record, so it sent that grade, and asked for a refused return,
          // again (tests/platform/classroomPersistencePendingColumns.test.mjs).
          if (publication.gradePassbackEnabled === false || !String(publication.courseId || "")) continue;
          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
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
      // Grades saved in Classroom whose return Google refused: counted for one
      // warning per assignment, not an error per column.
      const notReturned = { refused: 0, notAskedAgain: 0, states: new Set(), reasons: new Set() };

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
        // TT23: woken by a profile change alone, this column is corrected only
        // if Classroom already holds a pushed grade and the grade now differs.
        if (profileOnlyIds.has(assignmentId) && !studentWorkloadIndices.profileChangeNeedsPush(priorAudit, grade)) continue;
        const priorReturnConfirmed = priorAudit.returnedToStudent === true
          || String(priorAudit.submissionState || "").toUpperCase() === "RETURNED";
        if (
          (!forceRetry || (afterData.profile?.workloadCorrections?.[assignmentId]?.eventId
            && priorAudit.correctionEventId === afterData.profile.workloadCorrections[assignmentId].eventId))
          && ["synced", CLASSROOM_GRADED_NOT_RETURNED].includes(priorAudit.status)
          && String(priorAudit.stage || "") === stage
          && Number(priorAudit.maxPoints || 100) === maxPoints
          && Boolean(priorAudit.studentVisible) === releasePolicy.studentVisible
          // Stage identity alone cannot answer "has anything changed?".
          // Ordinary assignments can improve inside the same checkpoint stage
          // after a teacher reopens/extends a timed section, so compare the
          // actual MathMaster percentage for every assignment type.
          && Number(priorAudit.grade) === Number(grade)
          // Classroom holds this same grade and refused to return it: sending
          // it again would only be refused again. A new grade, or a teacher's
          // Retry, sends it, and asks for the return if the submission has
          // changed (lib/classroomPushErrors.js).
          && (!releasePolicy.shouldReturn || priorReturnConfirmed || priorAudit.status === CLASSROOM_GRADED_NOT_RETURNED)
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
        // Classroom holds the grade when the row is "synced", and when only its
        // return was refused ("graded-not-returned"), which a Test Cycle grade
        // can be since it is returned (the lib's release rule).
        if (isTestCycleAssignment && ["synced", CLASSROOM_GRADED_NOT_RETURNED].includes(priorAudit.status) && !assignmentGradeOverride) {
          // eslint-disable-next-line no-await-in-loop
          const passback = (await testCycleLib.shared()).grade.testCycleClassroomPassback({
            recordedGrade: grade,
            previouslyPostedGrade: priorAudit.grade,
            teacherAdjusted: testCycleProjection?.recordedGradeSource === "teacherAdjustment",
          });
          if (passback.refusedLowering) {
            // eslint-disable-next-line no-await-in-loop
            await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
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
            ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
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
            ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
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

        if (teachersAtClassroomLimit.has(classroomKey)) {
          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
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
            ...classroomPushHeldForLimit({ mayRequeue }),
          });
          requeueForLimit = requeueForLimit || mayRequeue;
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
            ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
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
          if (!await require("./lib/retroactiveAccommodation").correctionSyncAllowed({ db, studentId: event.params.studentId, gradeData: afterData, assignment: { ...assignment, id: assignmentId } })) continue;
          const patched = await classroomLib().patchGrade(classroom, {
            courseId,
            courseWorkId: publication.courseworkId,
            submissionId: submission.id,
            grade: classroomGrade,
            assignToStudent: releasePolicy.assignToStudent,
          });

          let submissionState = patched.state || submission.state || null;
          let returnedToStudent = String(submissionState || "").toUpperCase() === "RETURNED";
          let returnRefusal = null;
          if (releasePolicy.shouldReturn && !returnedToStudent) {
            // Patching assignedGrade alone can still leave Classroom showing a
            // teacher-only Draft. Returning the submission is the explicit
            // Google action that releases the assigned grade to the student.
            // Google returns only work the student turned in. Once it has
            // refused this submission, it is not asked again while the
            // submission is in the same state, unless a teacher sends the
            // grade again (lib/classroomPushErrors.js), as in the section
            // trigger.
            returnRefusal = forceRetry ? null : standingClassroomReturnRefusal({
              prior: priorAudit,
              courseworkId: publication.courseworkId,
              submissionId: submission.id,
              submissionState,
            });
            if (returnRefusal) {
              notReturned.notAskedAgain += 1;
            } else {
              try {
                // eslint-disable-next-line no-await-in-loop
                await classroomLib().returnSubmission(classroom, {
                  courseId,
                  courseWorkId: publication.courseworkId,
                  submissionId: submission.id,
                });
                submissionState = "RETURNED";
                returnedToStudent = true;
              } catch (returnError) {
                returnRefusal = classroomReturnRefusal(returnError, { submissionState });
                // Every other refusal is a failed push, as before.
                if (!returnRefusal) throw returnError;
                notReturned.refused += 1;
              }
            }
          }

          if (returnRefusal) {
            notReturned.states.add(returnRefusal.submissionState || "unknown");
            notReturned.reasons.add(returnRefusal.reason);
            // The grade is in Classroom; only its return is missing. The row
            // says why in a teacher's words ("Graded, not returned"), it is not
            // a failure for "Retry all", and the student's receipt names only
            // the columns that went through.
            // eslint-disable-next-line no-await-in-loop
            await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
              ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
              assignmentId,
              courseId,
              courseworkId: publication.courseworkId,
              submissionId: submission.id,
              submissionState,
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
              syncedAt: FieldValue.serverTimestamp(),
              ...returnRefusal.audit,
            });
            continue;
          }

          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
            ...clearedReturnRefusalFields(priorAudit),
            ...clearedClassroomErrorFields(),
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
          const failure = classroomPushFailure(err, { mayRequeue });
          if (failure.quota) {
            teachersAtClassroomLimit.add(classroomKey);
            requeueForLimit = requeueForLimit || mayRequeue;
          }
          logger.error(
            `Grade passback failed for student ${event.params.studentId}, assignment ${assignmentId}, course ${courseId}`,
            {
              step: failure.description.step,
              httpStatus: failure.description.httpStatus,
              googleStatus: failure.description.googleStatus,
              reasons: failure.description.reasons,
              error: failure.description.message,
            }
          );
          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            ...(afterData.profile?.workloadCorrections?.[assignmentId] ? { correctionEventId: afterData.profile.workloadCorrections[assignmentId].eventId } : {}),
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
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
            ...failure.audit,
          });
        }
      }

      if (notReturned.refused || notReturned.notAskedAgain) {
        logger.warn("Grades saved in Classroom but not returned", {
          assignmentId,
          studentId: event.params.studentId,
          // Google refused the return in this push.
          refused: notReturned.refused,
          // Refused before, and the submission has not changed: not asked.
          notAskedAgain: notReturned.notAskedAgain,
          submissionStates: [...notReturned.states],
          reasons: [...notReturned.reasons],
        });
      }

      if (requeueForLimit) {
        // eslint-disable-next-line no-await-in-loop
        await classroomPushQueue.requeueClassroomPushAfterQuota(db, {
          assignmentId,
          studentId: event.params.studentId,
          reason: releaseSignal ? releaseSignalReason(releaseSignal) : null,
          quotaRetry,
          // A reconcile run's retry stays that run's, and that teacher's.
          runId: releaseSignal?.runId,
          scopeTeacherUid: releaseSignal?.scopeTeacherUid,
        });
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
        // that second invocation exits immediately. A draft receipt no student
        // screen shows, over none or another draft, is not written
        // (lib/classroomGradeRuntime.js classroomReceiptNeedsWriting).
        if (classroomReceiptNeedsWriting(status, afterData.classroomSyncStatusByAssignment?.[assignmentId])) {
          // eslint-disable-next-line no-await-in-loop
          await after.ref.update(
            new FieldPath("classroomSyncStatusByAssignment", assignmentId),
            status
          );
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
    // Only whether each student has this assignment: a grade document is a
    // student's whole year.
    const gradesSnap = await db.collection("grades")
      .select(new FieldPath("gradesByAssignment", assignmentId))
      .get();
    const targets = gradesSnap.docs.filter((gradeDoc) => (
      gradeDoc.data()?.gradesByAssignment?.[assignmentId] != null
    ));

    // Queued, a minute's worth at a time (lib/classroomPushQueue.js).
    await classroomPushQueue.enqueueClassroomPushes(db, {
      assignmentId,
      studentIds: targets.map((gradeDoc) => gradeDoc.id),
      reason: "assessment-release",
      source: "assessment-release",
    });
    logger.info(`Queued released assessment grade passback for ${targets.length} student record(s) on assignment ${assignmentId}.`);
  }
);

const CLASSROOM_GRADE_CHECKPOINT_COLLECTION = "classroomGradeCheckpointState";
const CLASSROOM_GRADE_CHECKPOINT_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
// The only fields the checkpoint scheduler reads from a publication and from
// its assignment (issue #545). An assignment carries its questions (one was
// 1.4 MB on Nov 11, 2026), and the scheduler read them all in full every 5
// minutes to decide on four dates and a class list.
const CLASSROOM_GRADE_CHECKPOINT_LINK_FIELDS = Object.freeze([
  "assignmentId",
  "courseworkId",
  "gradePassbackEnabled",
]);
const CLASSROOM_GRADE_CHECKPOINT_ASSIGNMENT_FIELDS = Object.freeze([
  "dueAt",
  "dueDate",
  "lateDueAt",
  "lateDueDate",
  "assignedClassIds",
]);
// This scheduler has the 60 s default timeout. A run warns at 24 s, two fifths
// of it, as the section scheduler warns at 120 s of its 300 s.
const CLASSROOM_GRADE_CHECKPOINT_SLOW_RUN_MS = 24_000;

async function queueClassroomGradeSignalForAudience({
  db,
  assignmentId,
  assignment,
  reason,
  requestedAt,
}) {
  const classIds = assignmentAudience(assignment).classIds;
  if (!classIds.length) return 0;

  const studentIds = new Set();
  for (const classId of classIds) {
    // References only: a grade document is a student's whole year.
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection("grades").where("classId", "==", classId).select().get();
    snapshot.docs.forEach((gradeDoc) => studentIds.add(gradeDoc.id));
  }

  // Queued, a minute's worth at a time (lib/classroomPushQueue.js).
  return classroomPushQueue.enqueueClassroomPushes(db, {
    assignmentId,
    studentIds: [...studentIds],
    reason,
    requestedAt,
    source: reason,
  });
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

  // Whole-assignment publications with passback on, asked of Firestore (issue
  // #545). Every writer stores gradePassbackEnabled as a boolean: the publish's
  // base record and the forced repost (`!== false`), and a split-section
  // publication `false`, since it passes back through its own scheduler. So
  // `== true` is the `!== false` below, read by the database: 35 of the 480
  // published links on Nov 11, 2026, where this read all 480 in full every 5
  // minutes (tests/platform/classroomCheckpointScans.test.mjs). Every one of
  // them, a page at a time, as the section scheduler reads its own: one
  // unordered limit(1000) would have dropped classes' checkpoints past 1,000
  // links (lib/classroomCheckpointScan.js).
  const scan = await classroomCheckpointScan.scanPublishedLinks(db, {
    filters: [["status", "published"], ["gradePassbackEnabled", true]],
    fields: CLASSROOM_GRADE_CHECKPOINT_LINK_FIELDS,
  });
  const scanConcerns = classroomCheckpointScan.checkpointScanConcerns({ links: scan.docs.length, complete: scan.complete });
  if (!scan.complete) {
    logger.error("Whole-assignment checkpoint scan stopped at its limit", { links: scan.docs.length, pages: scan.pages, concerns: scanConcerns });
  } else if (scanConcerns.length) {
    logger.warn("Whole-assignment checkpoint scan is near its limits", { links: scan.docs.length, pages: scan.pages, concerns: scanConcerns });
  }

  const classroomAssignmentIds = [...new Set(
    scan.docs
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
  // live course when the library grows. Only the dates and classes are read,
  // never the questions, a hundred at a time.
  const assignmentSnapshots = await classroomCheckpointScan.getAllInBatches(
    db,
    classroomAssignmentIds.map((assignmentId) => db.doc(`assignments/${assignmentId}`)),
    { fieldMask: CLASSROOM_GRADE_CHECKPOINT_ASSIGNMENT_FIELDS }
  );

  // The assignments a checkpoint can be owed for: those that exist, with a
  // class and a due or final time. Only their state is read, as before.
  const scheduled = [];
  for (const assignmentDoc of assignmentSnapshots) {
    if (!assignmentDoc.exists) continue;
    const assignment = assignmentDoc.data() || {};
    if (!assignmentAudience(assignment).classIds.length) continue;
    const dueAt = toDate(assignment.dueAt || assignment.dueDate);
    const lateDueAt = toDate(
      assignment.lateDueAt || assignment.lateDueDate || assignment.dueAt || assignment.dueDate
    );
    if (!dueAt && !lateDueAt) continue;
    scheduled.push({ assignmentId: assignmentDoc.id, assignment, dueAt, lateDueAt });
  }
  // Their state documents, a hundred at a time rather than one by one (25 on
  // Nov 11, 2026). A run writes only each assignment's own state, so this
  // reads what the loop would have read; a student a trigger records meanwhile
  // is woken on the next run.
  const stateSnapshots = await classroomCheckpointScan.getAllInBatches(
    db,
    scheduled.map(({ assignmentId }) => db.collection(CLASSROOM_GRADE_CHECKPOINT_COLLECTION).doc(assignmentId))
  );
  const stateById = new Map(stateSnapshots.map((snapshot) => [snapshot.id, snapshot]));

  let dueAssignments = 0;
  let finalAssignments = 0;
  let reconcileAssignments = 0;
  let queuedStudents = 0;
  let studentCheckpointStudents = 0;

  for (const { assignmentId, assignment, dueAt, lateDueAt } of scheduled) {
    const stateRef = db.collection(CLASSROOM_GRADE_CHECKPOINT_COLLECTION).doc(assignmentId);
    const stateSnap = stateById.get(assignmentId);
    const state = stateSnap?.exists ? stateSnap.data() || {} : {};

    // H-116: a student whose OWN due time or final cutoff is later than the
    // class's was recorded by the grade trigger when it set the class's
    // wake-up aside for them (deferredClassCheckpoint); wake them at theirs.
    // eslint-disable-next-line no-await-in-loop
    const ownCheckpointsQueued = await classroomStudentCheckpoints.wakeArrivedStudentCheckpoints({
      stateRef,
      state,
      now,
      enqueue: ({ studentIds, reason }) => classroomPushQueue.enqueueClassroomPushes(db, {
        assignmentId, studentIds, reason, requestedAt, source: reason,
      }),
    });
    if (ownCheckpointsQueued) {
      studentCheckpointStudents += ownCheckpointsQueued;
      queuedStudents += ownCheckpointsQueued;
    }

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

  if (dueAssignments || finalAssignments || reconcileAssignments || studentCheckpointStudents) {
    logger.info("Queued Classroom grade checkpoints", {
      dueAssignments,
      finalAssignments,
      reconcileAssignments,
      studentCheckpointStudents,
      queuedStudents,
    });
  }

  // A run this long says so while it still fits in its time.
  const elapsedMs = Date.now() - now;
  if (elapsedMs >= CLASSROOM_GRADE_CHECKPOINT_SLOW_RUN_MS) {
    logger.warn("Whole-assignment checkpoint scan is near its limits", {
      links: scan.docs.length, assignments: classroomAssignmentIds.length, elapsedMs, concerns: ["slow-run"],
    });
  }
});
