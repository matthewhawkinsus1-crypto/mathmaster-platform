"use strict";

const crypto = require("crypto");
const { getFirestore, FieldPath, FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

const classroomLib = require("./lib/classroom");
const { readPublicEnv } = require("./lib/config");
const { encryptLaunchPayload } = require("./lib/linkToken");
const {
  requestedSectionKeys,
  classroomPublicationTargets,
} = require("./lib/classroomSectionPublishing");
const { launchPayloadForPublication } = require("./lib/classroomLaunch");
const { publicationMarker } = require("./lib/publication");
const { toDate } = require("./lib/classroomGradeRuntime");

const MAX_CLASSROOM_COURSES_PER_BATCH = 20;

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

function forcePublicationInstanceMarker(forceRequestId, publicationId) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${String(forceRequestId || "")}|${String(publicationId || "")}`)
    .digest("hex")
    .slice(0, 24);
  return `[MathMaster publication-instance:${fingerprint}]`;
}

function functionsBaseUrl() {
  const baseUrl = String(readPublicEnv("FUNCTIONS_BASE_URL") || "").trim().replace(/\/$/, "");
  if (!baseUrl) {
    throw new HttpsError(
      "failed-precondition",
      "FUNCTIONS_BASE_URL is not configured for secure Classroom section links."
    );
  }
  return baseUrl;
}

async function queueGradeSignalForAssignmentAudience({ db, assignmentId, assignment }) {
  const classIds = assignmentClassIds(assignment);
  if (!classIds.length) return 0;

  const byPath = new Map();
  for (const classId of classIds) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection("grades").where("classId", "==", classId).get();
    snapshot.docs.forEach((doc) => byPath.set(doc.ref.path, doc));
  }

  const gradeDocs = [...byPath.values()];
  const requestedAt = new Date().toISOString();
  for (let offset = 0; offset < gradeDocs.length; offset += 400) {
    const batch = db.batch();
    gradeDocs.slice(offset, offset + 400).forEach((gradeDoc) => {
      batch.update(
        gradeDoc.ref,
        new FieldPath("classroomReleaseSignals", assignmentId),
        // A forced repost replaces the Google CourseWork destination but keeps
        // the same MathMaster publication id. Mark this as a manual retry so
        // the section sync cannot skip an equal grade merely because the old
        // CourseWork already received that grade.
        { requestedAt, reason: "manual-retry" }
      );
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return gradeDocs.length;
}

async function forceOneSection({
  db,
  classroom,
  teacherUid,
  assignmentId,
  assignment,
  course,
  mapping,
  target,
  forceRequestId,
  materials,
  topicName,
  gradePassbackEnabled,
}) {
  const courseId = String(target.courseId);
  const publicationRef = db.doc(`classroomLinks/${target.publicationId}`);
  const publicationSnapshot = await publicationRef.get();
  const prior = publicationSnapshot.exists ? publicationSnapshot.data() || {} : {};
  const priorCourseworkId = String(prior.courseworkId || "").trim() || null;

  if (
    prior.lastForceRequestId === forceRequestId
    && prior.courseworkId
    && prior.status === "published"
  ) {
    return {
      courseId,
      courseName: course.name || prior.courseName || courseId,
      publicationId: target.publicationId,
      sectionKey: target.sectionKey,
      sectionLabel: target.sectionLabel,
      courseworkId: String(prior.courseworkId),
      classroomUrl: prior.classroomUrl || null,
      status: "already-forced",
    };
  }

  const baseMarker = publicationMarker(target.publicationId);
  const instanceMarker = forcePublicationInstanceMarker(forceRequestId, target.publicationId);
  const launchPayload = launchPayloadForPublication({
    assignmentId,
    courseId,
    publicationId: target.publicationId,
    sectionKey: target.sectionKey,
  });
  const launchToken = encryptLaunchPayload(launchPayload);
  const launchUrl = `${functionsBaseUrl()}/resolveClassroomSectionLaunchToken?token=${encodeURIComponent(launchToken)}`;
  const dueAtValue = assignment.dueAt || assignment.dueDate || null;
  const effectiveMaterials = materials.length
    ? materials
    : cleanMaterials(prior.materials);

  try {
    // A transport retry may arrive after Google created the new post but before
    // Firestore recorded it. The request-specific marker makes that retry
    // idempotent without weakening the explicit duplicate-bypass behavior.
    let courseWork = await classroomLib.findCourseWorkByPublicationMarker(
      classroom,
      courseId,
      baseMarker,
      [instanceMarker]
    );

    const topic = topicName
      ? await classroomLib.ensureTopic(classroom, courseId, topicName)
      : null;

    if (!courseWork) {
      courseWork = await classroomLib.createCourseWork(classroom, {
        courseId,
        title: target.title,
        description: [target.instructions, baseMarker, instanceMarker].filter(Boolean).join("\n\n"),
        dueDate: toDate(dueAtValue) || undefined,
        materials: effectiveMaterials,
        launchUrl,
        maxPoints: target.maxPoints,
        topicId: topic?.topicId || null,
      });
    }

    const update = {
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
      maxPoints: target.maxPoints,
      gradingMode: target.gradingMode,
      gradePassbackEnabled: false,
      sectionGradePassbackEnabled: gradePassbackEnabled !== false,
      sectionKey: target.sectionKey,
      sectionLabel: target.sectionLabel,
      questionIndices: [...target.questionIndices],
      materials: effectiveMaterials,
      topicName: topic?.name || topicName || null,
      topicId: topic?.topicId || null,
      status: "published",
      courseworkId: String(courseWork.id),
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

    await publicationRef.set(update, { merge: true });

    return {
      courseId,
      courseName: course.name || courseId,
      publicationId: target.publicationId,
      sectionKey: target.sectionKey,
      sectionLabel: target.sectionLabel,
      oldCourseworkId: priorCourseworkId,
      courseworkId: String(courseWork.id),
      classroomUrl: courseWork.alternateLink || null,
      status: "forced-reposted",
    };
  } catch (error) {
    return {
      courseId,
      courseName: course.name || courseId,
      publicationId: target.publicationId,
      sectionKey: target.sectionKey,
      sectionLabel: target.sectionLabel,
      oldCourseworkId: priorCourseworkId,
      status: "failed",
      error: String(error?.message || error),
    };
  }
}

async function forceRepublishAssignmentSectionsHandler(request) {
  const teacherUid = requireTeacher(request);
  const data = request.data || {};
  const assignmentId = String(data.assignmentId || "").trim();
  const forceRequestId = String(data.forceRequestId || crypto.randomUUID()).trim();
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
      `A maximum of ${MAX_CLASSROOM_COURSES_PER_BATCH} courses may be force-reposted at once.`
    );
  }

  const db = getFirestore();
  const assignmentSnapshot = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "Assignment not found.");
  const assignment = assignmentSnapshot.data() || {};
  if (Number(assignment.schemaVersion) !== 5 || !Array.isArray(assignment.sections)) {
    throw new HttpsError(
      "failed-precondition",
      "Split Google Classroom force-reposting requires an Assignment V5 lesson with sections."
    );
  }

  const audienceClassIds = assignmentClassIds(assignment);
  if (!audienceClassIds.length) {
    throw new HttpsError(
      "failed-precondition",
      "Assign this MathMaster lesson to a class before force-reposting it."
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
  const requestedMaterials = cleanMaterials(data.materials);
  const classroomPackage = assignment.classroomPackage || {};
  const topicName = String(data.topicName || classroomPackage?.topic?.name || "").trim().slice(0, 200);
  const gradePassbackEnabled = data.gradePassbackEnabled !== false
    && classroomPackage?.gradePassback?.enabled !== false;
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
    results.push(await forceOneSection({
      db,
      classroom,
      teacherUid,
      assignmentId,
      assignment,
      course,
      mapping,
      target,
      forceRequestId,
      materials: requestedMaterials,
      topicName,
      gradePassbackEnabled,
    }));
  }

  const forcedCount = results.filter((item) => item.status === "forced-reposted").length;
  let queuedGrades = 0;
  if (forcedCount && gradePassbackEnabled) {
    queuedGrades = await queueGradeSignalForAssignmentAudience({ db, assignmentId, assignment });
  }

  return {
    assignmentId,
    forceRequestId,
    results,
    summary: {
      selected: results.length,
      forcedReposted: forcedCount,
      alreadyForced: results.filter((item) => item.status === "already-forced").length,
      failed: results.filter((item) => item.status === "failed").length,
      queuedGrades,
    },
  };
}

module.exports = {
  forcePublicationInstanceMarker,
  forceRepublishAssignmentSectionsHandler,
};
