"use strict";

const crypto = require("crypto");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");

const classroomLib = require("./lib/classroom");
const {
  GOOGLE_API_SECRETS,
  LINK_ENCRYPTION_KEY,
  readPublicEnv,
  readStudentAppBaseUrl,
} = require("./lib/config");
const { encryptLaunchPayload, decryptLaunchToken } = require("./lib/linkToken");
const {
  requestedSectionKeys,
  classroomPublicationTargets,
} = require("./lib/classroomSectionPublishing");
const {
  launchPayloadForPublication,
  launchRedirectParams,
} = require("./lib/classroomLaunch");
const {
  publicationMarker,
  publicationSectionKey,
  rosterLinkDocumentId,
  gradeSyncDocumentId,
} = require("./lib/publication");
const { runtimeQuestionsFromAssignment } = require("./lib/assignmentRuntime");
const { classroomPublicationGrade } = require("./lib/classroomSectionGrade");
const {
  assignmentGradeProgress,
  releaseSignalReason,
  resolveClassroomGradeStage,
  classroomGradeReleasePolicy,
  toDate,
} = require("./lib/classroomGradeRuntime");
const { assignmentFeedbackIsHeld } = require("./lib/activityFeedback");
const {
  CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION,
  sectionGradeEvidenceFingerprint,
  sectionGradeSyncIsCurrent,
} = require("./lib/classroomSectionGradeReconciliation");

const MAX_CLASSROOM_COURSES_PER_BATCH = 20;
const PUBLISH_LEASE_MS = 5 * 60 * 1000;
const SECTION_CHECKPOINT_COLLECTION = "classroomSectionGradeCheckpointState";
const SECTION_CHECKPOINT_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

function requireTeacher(request) {
  if (!request?.auth) {
    throw new HttpsError("unauthenticated", "Sign in before publishing to Google Classroom.");
  }
  if (request.auth.token?.role !== "teacher") {
    throw new HttpsError("permission-denied", "Only a teacher can publish to Google Classroom.");
  }
  return String(request.auth.uid || "").trim();
}

function assignmentClassIds(assignment = {}) {
  return [...new Set(
    (Array.isArray(assignment.assignedClassIds) ? assignment.assignedClassIds : [])
      .map((value) => String(value).trim())
      .filter(Boolean)
  )];
}

function cleanMaterials(materials) {
  if (!Array.isArray(materials)) return [];
  const result = [];
  for (const item of materials) {
    if (!item) continue;
    const title = String(item.title || "Resource").trim().slice(0, 500);
    const driveFileId = String(item.driveFileId || "").trim();
    if (driveFileId) {
      result.push({ title: title || "Google Drive resource", driveFileId, shareMode: "VIEW" });
      continue;
    }
    const url = String(item.url || "").trim();
    if (title && /^https?:\/\//i.test(url)) result.push({ title, url });
  }
  return result.slice(0, 20);
}

function serializableDate(value) {
  const date = toDate(value);
  return date ? date.toISOString() : value || null;
}

function classroomMaxPoints(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(1000, number)) : 100;
}

async function loadTeacherMappings(db, teacherUid) {
  const snapshot = await db
    .collection("classroomCourseMappings")
    .where("teacherUid", "==", teacherUid)
    .limit(100)
    .get();
  return new Map(snapshot.docs.map((doc) => {
    const data = doc.data() || {};
    return [String(data.courseId || ""), { id: doc.id, ...data }];
  }).filter(([courseId]) => courseId));
}

async function claimSectionPublication(ref, baseRecord) {
  const db = getFirestore();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() || {} : {};
    if (current.status === "published" && current.courseworkId) {
      return { action: "already-published", current };
    }
    if (current.status === "publishing" && Number(current.publishLeaseExpiresAt || 0) > Date.now()) {
      return { action: "in-progress", current };
    }

    const attemptId = crypto.randomUUID();
    transaction.set(ref, {
      ...baseRecord,
      status: "publishing",
      attemptId,
      publishLeaseExpiresAt: Date.now() + PUBLISH_LEASE_MS,
      error: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    return { action: "publish", attemptId, current };
  });
}

async function finishSectionPublication(ref, attemptId, patch) {
  const db = getFirestore();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data()?.attemptId !== attemptId) return false;
    transaction.set(ref, {
      ...patch,
      publishLeaseExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

function sectionFunctionsBaseUrl() {
  const baseUrl = String(readPublicEnv("FUNCTIONS_BASE_URL") || "").trim().replace(/\/$/, "");
  if (!baseUrl) {
    throw new HttpsError(
      "failed-precondition",
      "FUNCTIONS_BASE_URL is not configured for secure Classroom section links."
    );
  }
  return baseUrl;
}

async function publishOneSection({
  db,
  classroom,
  teacherUid,
  assignmentId,
  assignment,
  course,
  mapping,
  target,
  materials,
  topicName,
  maxPoints,
  gradePassbackEnabled,
}) {
  const linkRef = db.doc(`classroomLinks/${target.publicationId}`);
  const courseId = String(target.courseId);
  const dueAtValue = assignment.dueAt || assignment.dueDate || null;
  const baseRecord = {
    schemaVersion: 5,
    publicationKind: "section",
    publicationId: target.publicationId,
    teacherUid,
    assignmentId,
    classId: mapping.classId,
    classPeriod: mapping.classPeriod || null,
    courseId,
    courseName: course.name || courseId,
    courseSection: course.section || "",
    title: target.title,
    dueAt: serializableDate(dueAtValue),
    publishAt: serializableDate(target.publishAt),
    maxPoints,
    // Critical compatibility guard: the mature whole-assignment trigger reads
    // classroomLinks too. It must skip split publications so it can never send
    // the whole assignment score to a Warm-Up/Classwork/Practice/DOL slot.
    gradePassbackEnabled: false,
    sectionGradePassbackEnabled: gradePassbackEnabled !== false,
    sectionKey: target.sectionKey,
    sectionLabel: target.sectionLabel,
    questionIndices: [...target.questionIndices],
    materials,
    topicName: topicName || null,
  };

  const claim = await claimSectionPublication(linkRef, baseRecord);
  if (claim.action === "already-published") {
    return {
      courseId,
      courseName: baseRecord.courseName,
      publicationId: target.publicationId,
      sectionKey: target.sectionKey,
      sectionLabel: target.sectionLabel,
      status: "already-published",
      courseworkId: claim.current.courseworkId,
      classroomUrl: claim.current.classroomUrl || null,
    };
  }
  if (claim.action === "in-progress") {
    return {
      courseId,
      courseName: baseRecord.courseName,
      publicationId: target.publicationId,
      sectionKey: target.sectionKey,
      sectionLabel: target.sectionLabel,
      status: "in-progress",
    };
  }

  const marker = publicationMarker(target.publicationId);
  const launchPayload = launchPayloadForPublication({
    assignmentId,
    courseId,
    publicationId: target.publicationId,
    sectionKey: target.sectionKey,
  });
  const launchToken = encryptLaunchPayload(launchPayload);
  const launchUrl = `${sectionFunctionsBaseUrl()}/resolveClassroomSectionLaunchToken?token=${encodeURIComponent(launchToken)}`;

  try {
    let courseWork = null;
    const priorCourseworkId = String(claim.current?.courseworkId || "").trim();
    if (priorCourseworkId) {
      try {
        const candidate = await classroomLib.getCourseWork(classroom, courseId, priorCourseworkId);
        if (String(candidate?.description || "").includes(marker)) courseWork = candidate;
      } catch {
        courseWork = null;
      }
    }
    if (!courseWork) {
      courseWork = await classroomLib.findCourseWorkByPublicationMarker(classroom, courseId, marker);
    }

    const topic = topicName
      ? await classroomLib.ensureTopic(classroom, courseId, topicName)
      : null;

    if (!courseWork) {
      courseWork = await classroomLib.createCourseWork(classroom, {
        courseId,
        title: target.title,
        description: [target.instructions, marker].filter(Boolean).join("\n\n"),
        dueDate: toDate(dueAtValue) || undefined,
        materials,
        launchUrl,
        maxPoints,
        topicId: topic?.topicId || null,
        publishAt: target.publishAt,
      });
    }

    await finishSectionPublication(linkRef, claim.attemptId, {
      ...baseRecord,
      status: "published",
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
      publicationId: target.publicationId,
      sectionKey: target.sectionKey,
      sectionLabel: target.sectionLabel,
      status: "published",
      courseworkId: courseWork.id,
      classroomUrl: courseWork.alternateLink || null,
      launchUrl,
    };
  } catch (error) {
    logger.error("Classroom section publication failed", {
      assignmentId,
      courseId,
      sectionKey: target.sectionKey,
      message: error?.message || String(error),
    });
    await finishSectionPublication(linkRef, claim.attemptId, {
      status: "failed",
      error: String(error?.message || error),
      failedAt: FieldValue.serverTimestamp(),
    });
    return {
      courseId,
      courseName: baseRecord.courseName,
      publicationId: target.publicationId,
      sectionKey: target.sectionKey,
      sectionLabel: target.sectionLabel,
      status: "failed",
      error: String(error?.message || error),
    };
  }
}

async function queueGradeSignalForAssignmentAudience({
  db,
  assignmentId,
  assignment,
  reason,
  requireSavedTracker = false,
}) {
  const classIds = assignmentClassIds(assignment);
  if (!classIds.length) return 0;
  const byPath = new Map();
  for (const classId of classIds) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection("grades").where("classId", "==", classId).get();
    snapshot.docs.forEach((doc) => byPath.set(doc.ref.path, doc));
  }
  const gradeDocs = [...byPath.values()].filter((gradeDoc) => (
    !requireSavedTracker
    || gradeDoc.data()?.gradesByAssignment?.[assignmentId] != null
  ));
  const requestedAt = new Date().toISOString();
  for (let offset = 0; offset < gradeDocs.length; offset += 400) {
    const batch = db.batch();
    gradeDocs.slice(offset, offset + 400).forEach((gradeDoc) => {
      batch.update(
        gradeDoc.ref,
        new FieldPath("classroomReleaseSignals", assignmentId),
        { requestedAt, reason }
      );
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return gradeDocs.length;
}

const reconcileClassroomSectionGrades = onCall(async (request) => {
  const teacherUid = requireTeacher(request);
  const assignmentId = String(request.data?.assignmentId || "").trim();
  if (!assignmentId) throw new HttpsError("invalid-argument", "assignmentId is required.");

  const db = getFirestore();
  const assignmentSnapshot = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "Assignment not found.");

  const publicationSnapshot = await db
    .collection("classroomLinks")
    .where("assignmentId", "==", assignmentId)
    .get();
  const ownedSections = publicationSnapshot.docs.filter((doc) => {
    const publication = doc.data() || {};
    return publication.publicationKind === "section"
      && publication.status === "published"
      && Boolean(publication.courseworkId)
      && publication.sectionGradePassbackEnabled !== false
      && String(publication.teacherUid || "") === teacherUid;
  });
  if (!ownedSections.length) {
    throw new HttpsError(
      "failed-precondition",
      "This assignment has no published section grade columns owned by this teacher."
    );
  }

  // This deliberately writes only a release signal. The existing trigger reads
  // canonical saved trackers and updates the preserved CourseWork IDs; it does
  // not create posts, recreate assignments, or mutate student answers.
  const queuedStudents = await queueGradeSignalForAssignmentAudience({
    db,
    assignmentId,
    assignment: assignmentSnapshot.data() || {},
    reason: "section-grade-reconcile",
    requireSavedTracker: true,
  });
  return {
    assignmentId,
    queuedStudents,
    publications: ownedSections.length,
    reconciliationVersion: CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION,
  };
});

async function publishAssignmentSectionsHandler(request) {
  const teacherUid = requireTeacher(request);
  const data = request.data || {};
  const assignmentId = String(data.assignmentId || "").trim();
  if (!assignmentId) throw new HttpsError("invalid-argument", "assignmentId is required.");

  const sectionKeys = requestedSectionKeys(data).filter((sectionKey) => sectionKey !== "whole");
  if (!sectionKeys.length) {
    throw new HttpsError("invalid-argument", "Choose at least one split Classroom section.");
  }

  const rawCourseIds = Array.isArray(data.courseIds)
    ? data.courseIds
    : data.courseId ? [data.courseId] : [];
  const courseIds = [...new Set(rawCourseIds.map((value) => String(value).trim()).filter(Boolean))];
  if (!courseIds.length) throw new HttpsError("invalid-argument", "Select at least one Google Classroom course.");
  if (courseIds.length > MAX_CLASSROOM_COURSES_PER_BATCH) {
    throw new HttpsError(
      "invalid-argument",
      `A maximum of ${MAX_CLASSROOM_COURSES_PER_BATCH} courses may be published at once.`
    );
  }

  const db = getFirestore();
  const assignmentSnapshot = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "Assignment not found.");
  const assignment = assignmentSnapshot.data() || {};
  if (Number(assignment.schemaVersion) !== 5 || !Array.isArray(assignment.sections)) {
    throw new HttpsError(
      "failed-precondition",
      "Split Google Classroom publishing requires an Assignment V5 lesson with sections."
    );
  }
  const audienceClassIds = assignmentClassIds(assignment);
  if (!audienceClassIds.length) {
    throw new HttpsError(
      "failed-precondition",
      "Assign this MathMaster lesson to a class before publishing it to Google Classroom."
    );
  }

  const classroom = await classroomLib.getClassroomClient(teacherUid);
  const [activeCourses, mappings] = await Promise.all([
    classroomLib.listCourses(classroom),
    loadTeacherMappings(db, teacherUid),
  ]);
  const courseMap = new Map(activeCourses.map((course) => [String(course.id), course]));
  const targets = classroomPublicationTargets({
    assignmentId,
    assignment,
    courseIds,
    requestData: { ...data, sectionKeys },
  });
  const safeMaterials = cleanMaterials(data.materials);
  const topicName = String(data.topicName || "").trim().slice(0, 200);
  const maxPoints = classroomMaxPoints(data.maxPoints);
  const gradePassbackEnabled = data.gradePassbackEnabled !== false;
  const results = [];

  for (const target of targets) {
    const course = courseMap.get(String(target.courseId));
    const mapping = mappings.get(String(target.courseId));
    if (!course) {
      results.push({
        courseId: target.courseId,
        sectionKey: target.sectionKey,
        sectionLabel: target.sectionLabel,
        status: "failed",
        error: "The connected teacher is not an active teacher in this Google Classroom course.",
      });
      continue;
    }
    if (!mapping?.classId) {
      results.push({
        courseId: target.courseId,
        courseName: course.name || target.courseId,
        sectionKey: target.sectionKey,
        sectionLabel: target.sectionLabel,
        status: "failed",
        error: "Map this Google Classroom course to a MathMaster class first.",
      });
      continue;
    }
    if (!audienceClassIds.includes(String(mapping.classId))) {
      results.push({
        courseId: target.courseId,
        courseName: course.name || target.courseId,
        sectionKey: target.sectionKey,
        sectionLabel: target.sectionLabel,
        status: "failed",
        error: `This assignment is not assigned to ${mapping.className || mapping.classPeriod || "the mapped MathMaster class"}.`,
      });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    results.push(await publishOneSection({
      db,
      classroom,
      teacherUid,
      assignmentId,
      assignment,
      course,
      mapping,
      target,
      materials: safeMaterials,
      topicName,
      maxPoints,
      gradePassbackEnabled,
    }));
  }

  const hasPublishedDestination = results.some((item) =>
    ["published", "already-published"].includes(item.status));
  let queuedStudents = 0;
  if (hasPublishedDestination && gradePassbackEnabled) {
    queuedStudents = await queueGradeSignalForAssignmentAudience({
      db,
      assignmentId,
      assignment,
      reason: "initial-reconcile",
    });
  }

  return {
    assignmentId,
    results,
    queuedStudents,
    summary: {
      selected: results.length,
      published: results.filter((item) => item.status === "published").length,
      alreadyPublished: results.filter((item) => item.status === "already-published").length,
      inProgress: results.filter((item) => item.status === "in-progress").length,
      failed: results.filter((item) => item.status === "failed").length,
    },
  };
}

const resolveClassroomSectionLaunchToken = onRequest(
  { secrets: [LINK_ENCRYPTION_KEY] },
  (req, res) => {
    const appBaseUrl = readStudentAppBaseUrl();
    try {
      const payload = decryptLaunchToken(req.query.token);
      const sectionKey = publicationSectionKey(payload?.sectionKey);
      if (sectionKey === "whole") throw new Error("Section launch token is missing section identity.");
      const params = launchRedirectParams({ ...payload, sectionKey });
      res.redirect(302, `${appBaseUrl}?${params.toString()}`);
    } catch (error) {
      logger.warn("Rejected invalid Classroom section launch token", error);
      res.redirect(302, `${appBaseUrl}?launchError=invalid_token`);
    }
  }
);

async function writeGradeSyncAudit(db, publicationId, studentId, patch) {
  const syncId = gradeSyncDocumentId(publicationId, studentId);
  await db.doc(`classroomGradeSyncs/${syncId}`).set({
    syncId,
    publicationId,
    studentId,
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

function sectionPublicationReleased(publication, now = Date.now()) {
  const publishAt = toDate(publication?.publishAt);
  return !publishAt || publishAt.getTime() <= now;
}

const syncSectionGradeToClassroom = onDocumentWritten(
  {
    document: "grades/{studentId}",
    secrets: GOOGLE_API_SECRETS,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const afterData = after.data() || {};
    const beforeData = event.data?.before?.exists ? event.data.before.data() || {} : {};
    const afterByAssignment = afterData.gradesByAssignment || {};
    const beforeByAssignment = beforeData.gradesByAssignment || {};
    const gradeChangedAssignmentIds = Object.keys(afterByAssignment).filter(
      (assignmentId) => JSON.stringify(afterByAssignment[assignmentId]) !== JSON.stringify(beforeByAssignment[assignmentId])
    );
    const afterSignals = afterData.classroomReleaseSignals || {};
    const beforeSignals = beforeData.classroomReleaseSignals || {};
    const signaledAssignmentIds = Object.keys(afterSignals).filter(
      (assignmentId) => JSON.stringify(afterSignals[assignmentId]) !== JSON.stringify(beforeSignals[assignmentId])
    );
    const signaledSet = new Set(signaledAssignmentIds);
    const assignmentIds = [...new Set([...gradeChangedAssignmentIds, ...signaledAssignmentIds])];
    if (!assignmentIds.length) return;

    const db = getFirestore();
    const classroomByTeacher = new Map();

    for (const assignmentId of assignmentIds) {
      // eslint-disable-next-line no-await-in-loop
      const assignmentSnapshot = await db.doc(`assignments/${assignmentId}`).get();
      if (!assignmentSnapshot.exists) continue;
      const assignment = assignmentSnapshot.data() || {};
      if (assignmentFeedbackIsHeld(assignment)) continue;
      const questions = runtimeQuestionsFromAssignment(assignment);
      const tracker = afterByAssignment[assignmentId] || {};
      const releaseSignal = signaledSet.has(assignmentId) ? afterSignals[assignmentId] : null;
      const signalReason = releaseSignalReason(releaseSignal);
      const forceRetry = signalReason === "manual-retry" || signalReason === "section-grade-reconcile";

      // eslint-disable-next-line no-await-in-loop
      const publicationSnapshot = await db
        .collection("classroomLinks")
        .where("assignmentId", "==", assignmentId)
        .get();
      const publications = publicationSnapshot.docs.filter((doc) => {
        const publication = doc.data() || {};
        return publication.publicationKind === "section"
          && publication.status === "published"
          && Boolean(publication.courseworkId)
          && publication.sectionGradePassbackEnabled !== false;
      });
      if (!publications.length) continue;

      const successfulBySection = new Map();
      for (const publicationDoc of publications) {
        const publication = publicationDoc.data() || {};
        if (!sectionPublicationReleased(publication, Date.now())) continue;

        let gradeResult;
        try {
          gradeResult = classroomPublicationGrade({
            assignment,
            publication,
            tracker,
            questions,
            gradeProgress: assignmentGradeProgress,
          });
        } catch (error) {
          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId: publication.courseId || null,
            courseworkId: publication.courseworkId || null,
            sectionKey: publication.sectionKey || null,
            sectionLabel: publication.sectionLabel || null,
            status: "invalid-section-publication",
            error: String(error?.message || error),
          });
          continue;
        }

        const stage = resolveClassroomGradeStage({
          assignment,
          progress: gradeResult,
          releaseSignal,
          nowValue: Date.now(),
        });
        if (!stage) continue;
        const releasePolicy = classroomGradeReleasePolicy({ stage, assignment, nowValue: Date.now() });
        const courseId = String(publication.courseId || "");
        if (!courseId) continue;
        const maxPoints = classroomMaxPoints(publication.maxPoints);
        const classroomGrade = Math.round((gradeResult.grade / 100) * maxPoints * 100) / 100;
        const isFinal = ["final-complete", "final-deadline"].includes(stage);

        const syncId = gradeSyncDocumentId(publicationDoc.id, event.params.studentId);
        // eslint-disable-next-line no-await-in-loop
        const priorSnapshot = await db.doc(`classroomGradeSyncs/${syncId}`).get();
        const prior = priorSnapshot.exists ? priorSnapshot.data() || {} : {};
        const priorReturned = prior.returnedToStudent === true
          || String(prior.submissionState || "").toUpperCase() === "RETURNED";
        const evidenceFingerprint = sectionGradeEvidenceFingerprint({
          assignmentId,
          publicationId: publicationDoc.id,
          sectionKey: gradeResult.sectionKey,
          questionIndices: gradeResult.questionIndices,
          tracker,
          grade: gradeResult.grade,
          classroomGrade,
          maxPoints,
          stage,
          studentVisible: releasePolicy.studentVisible,
        });
        if (
          !forceRetry
          && sectionGradeSyncIsCurrent({
            prior,
            evidenceFingerprint,
            returnedToStudent: priorReturned,
            shouldReturn: releasePolicy.shouldReturn,
          })
        ) {
          continue;
        }

        const teacherUid = String(publication.teacherUid || "").trim();
        if (!teacherUid) continue;
        let classroom = classroomByTeacher.get(teacherUid);
        if (!classroom) {
          try {
            // eslint-disable-next-line no-await-in-loop
            classroom = await classroomLib.getClassroomClient(teacherUid);
            classroomByTeacher.set(teacherUid, classroom);
          } catch (error) {
            // eslint-disable-next-line no-await-in-loop
            await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
              assignmentId,
              courseId,
              courseworkId: publication.courseworkId,
              sectionKey: gradeResult.sectionKey,
              sectionLabel: gradeResult.sectionLabel,
              status: "auth-error",
              stage,
              grade: gradeResult.grade,
              classroomGrade,
              maxPoints,
              attempted: gradeResult.attempted,
              total: gradeResult.total,
              creditOnAttempted: gradeResult.creditOnAttempted,
              isFinal,
              studentVisible: releasePolicy.studentVisible,
              returnedToStudent: false,
              message: String(error?.message || error),
            });
            continue;
          }
        }

        const rosterLinkId = rosterLinkDocumentId(courseId, event.params.studentId);
        // eslint-disable-next-line no-await-in-loop
        const rosterLinkSnapshot = await db.doc(`classroomRosterLinks/${rosterLinkId}`).get();
        const googleUserId = rosterLinkSnapshot.exists
          ? String(rosterLinkSnapshot.data()?.googleUserId || "").trim()
          : "";
        if (!googleUserId) {
          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
            sectionKey: gradeResult.sectionKey,
            sectionLabel: gradeResult.sectionLabel,
            status: "skipped-unlinked",
            stage,
            grade: gradeResult.grade,
            classroomGrade,
            maxPoints,
            attempted: gradeResult.attempted,
            total: gradeResult.total,
            creditOnAttempted: gradeResult.creditOnAttempted,
            isFinal,
            studentVisible: releasePolicy.studentVisible,
            returnedToStudent: false,
            message: "Student is not linked to this Classroom course.",
          });
          continue;
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          const submission = await classroomLib.findSubmissionForStudent(classroom, {
            courseId,
            courseWorkId: publication.courseworkId,
            googleUserId,
          });
          if (!submission) {
            // eslint-disable-next-line no-await-in-loop
            await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
              assignmentId,
              courseId,
              courseworkId: publication.courseworkId,
              sectionKey: gradeResult.sectionKey,
              sectionLabel: gradeResult.sectionLabel,
              status: "submission-not-found",
              stage,
              grade: gradeResult.grade,
              classroomGrade,
              maxPoints,
              attempted: gradeResult.attempted,
              total: gradeResult.total,
              creditOnAttempted: gradeResult.creditOnAttempted,
              isFinal,
              studentVisible: releasePolicy.studentVisible,
              returnedToStudent: false,
            });
            continue;
          }

          // eslint-disable-next-line no-await-in-loop
          const patched = await classroomLib.patchGrade(classroom, {
            courseId,
            courseWorkId: publication.courseworkId,
            submissionId: submission.id,
            grade: classroomGrade,
            assignToStudent: releasePolicy.assignToStudent,
          });
          let submissionState = patched.state || submission.state || null;
          let returnedToStudent = String(submissionState || "").toUpperCase() === "RETURNED";
          if (releasePolicy.shouldReturn && !returnedToStudent) {
            // eslint-disable-next-line no-await-in-loop
            await classroomLib.returnSubmission(classroom, {
              courseId,
              courseWorkId: publication.courseworkId,
              submissionId: submission.id,
            });
            submissionState = "RETURNED";
            returnedToStudent = true;
          }

          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
            submissionId: submission.id,
            submissionState,
            status: "synced",
            stage,
            grade: gradeResult.grade,
            classroomGrade,
            maxPoints,
            attempted: gradeResult.attempted,
            total: gradeResult.total,
            creditOnAttempted: gradeResult.creditOnAttempted,
            isFinal,
            studentVisible: releasePolicy.studentVisible,
            returnedToStudent,
            sectionKey: gradeResult.sectionKey,
            sectionLabel: gradeResult.sectionLabel,
            questionIndices: gradeResult.questionIndices,
            gradePassbackMode: "section",
            reconciliationVersion: CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION,
            evidenceFingerprint,
            syncedAt: FieldValue.serverTimestamp(),
          });
          successfulBySection.set(gradeResult.sectionKey, {
            assignmentId,
            sectionKey: gradeResult.sectionKey,
            sectionLabel: gradeResult.sectionLabel,
            grade: gradeResult.grade,
            stage,
            attempted: gradeResult.attempted,
            total: gradeResult.total,
            isFinal,
            studentVisible: releasePolicy.studentVisible,
            returnedToStudent,
            syncedAt: new Date().toISOString(),
          });
        } catch (error) {
          logger.error("Section grade passback failed", {
            assignmentId,
            studentId: event.params.studentId,
            courseId,
            sectionKey: gradeResult.sectionKey,
            message: error?.message || String(error),
          });
          // eslint-disable-next-line no-await-in-loop
          await writeGradeSyncAudit(db, publicationDoc.id, event.params.studentId, {
            assignmentId,
            courseId,
            courseworkId: publication.courseworkId,
            sectionKey: gradeResult.sectionKey,
            sectionLabel: gradeResult.sectionLabel,
            status: "failed",
            stage,
            grade: gradeResult.grade,
            classroomGrade,
            maxPoints,
            attempted: gradeResult.attempted,
            total: gradeResult.total,
            creditOnAttempted: gradeResult.creditOnAttempted,
            isFinal,
            studentVisible: releasePolicy.studentVisible,
            returnedToStudent: false,
            error: String(error?.message || error),
          });
        }
      }

      if (successfulBySection.size) {
        const updateArgs = [];
        successfulBySection.forEach((status, sectionKey) => {
          updateArgs.push(
            new FieldPath("classroomSectionSyncStatusByAssignment", assignmentId, sectionKey),
            status
          );
        });
        // eslint-disable-next-line no-await-in-loop
        await after.ref.update(...updateArgs);
      }
    }
  }
);

const queueClassroomSectionGradeCheckpoints = onSchedule({
  schedule: "every 5 minutes",
  invoker: "private",
}, async () => {
  const db = getFirestore();
  const now = Date.now();
  const cutoff = now - SECTION_CHECKPOINT_LOOKBACK_MS;
  const publicationSnapshot = await db
    .collection("classroomLinks")
    .where("status", "==", "published")
    .limit(1000)
    .get();
  const assignmentIds = [...new Set(publicationSnapshot.docs
    .map((doc) => doc.data() || {})
    .filter((publication) => publication.publicationKind === "section"
      && publication.courseworkId
      && publication.sectionGradePassbackEnabled !== false)
    .map((publication) => String(publication.assignmentId || "").trim())
    .filter(Boolean))];
  if (!assignmentIds.length) return;

  const assignmentSnapshots = await db.getAll(
    ...assignmentIds.map((assignmentId) => db.doc(`assignments/${assignmentId}`))
  );

  for (const assignmentSnapshot of assignmentSnapshots) {
    if (!assignmentSnapshot.exists) continue;
    const assignmentId = assignmentSnapshot.id;
    const assignment = assignmentSnapshot.data() || {};
    const releaseAt = toDate(assignment.releaseAt || assignment.releaseDate);
    const dueAt = toDate(assignment.dueAt || assignment.dueDate);
    const lateDueAt = toDate(
      assignment.lateDueAt || assignment.lateDueDate || assignment.dueAt || assignment.dueDate
    );
    const stateRef = db.collection(SECTION_CHECKPOINT_COLLECTION).doc(assignmentId);
    // eslint-disable-next-line no-await-in-loop
    const stateSnapshot = await stateRef.get();
    const state = stateSnapshot.exists ? stateSnapshot.data() || {} : {};

    let reason = null;
    let statePatch = null;
    if (
      lateDueAt
      && lateDueAt.getTime() <= now
      && lateDueAt.getTime() >= cutoff
      && (!state.finalQueuedAt || state.finalDueAt !== lateDueAt.toISOString())
    ) {
      reason = "final-deadline";
      statePatch = { finalQueuedAt: new Date(now).toISOString(), finalDueAt: lateDueAt.toISOString() };
    } else if (
      dueAt
      && dueAt.getTime() <= now
      && dueAt.getTime() >= cutoff
      && (!state.dueQueuedAt || state.dueAt !== dueAt.toISOString())
    ) {
      reason = "due-checkpoint";
      statePatch = { dueQueuedAt: new Date(now).toISOString(), dueAt: dueAt.toISOString() };
    } else if (
      releaseAt
      && releaseAt.getTime() <= now
      && releaseAt.getTime() >= cutoff
      && (!state.releaseQueuedAt || state.releaseAt !== releaseAt.toISOString())
    ) {
      reason = "initial-reconcile";
      statePatch = { releaseQueuedAt: new Date(now).toISOString(), releaseAt: releaseAt.toISOString() };
    }

    if (!reason) continue;
    // eslint-disable-next-line no-await-in-loop
    const queuedStudents = await queueGradeSignalForAssignmentAudience({
      db,
      assignmentId,
      assignment,
      reason,
    });
    // eslint-disable-next-line no-await-in-loop
    await stateRef.set({
      assignmentId,
      ...statePatch,
      queuedStudents,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
});

module.exports = {
  publishAssignmentSectionsHandler,
  cloudFunctions: {
    reconcileClassroomSectionGrades,
    resolveClassroomSectionLaunchToken,
    syncSectionGradeToClassroom,
    queueClassroomSectionGradeCheckpoints,
  },
};
