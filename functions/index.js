const crypto = require("crypto");
const { initializeApp } = require("firebase-admin/app");
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
} = require("./lib/config");
const {
  publicationDocumentId,
  rosterLinkDocumentId,
  gradeSyncDocumentId,
  publicationMarker,
} = require("./lib/publication");

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
