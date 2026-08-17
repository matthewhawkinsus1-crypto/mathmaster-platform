const { google } = require("googleapis");
const { getFirestore } = require("firebase-admin/firestore");
const {
  readGoogleClientId,
  readGoogleClientSecret,
  readPublicEnv,
} = require("./config");

// Classroom V2 stores one OAuth connection per MathMaster teacher. The legacy
// default document is retained only as a one-time migration source for the
// first teacher who upgrades from the original single-teacher integration.
const LEGACY_TEACHER_INTEGRATION_DOC = "teacherIntegrations/default";

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.profile.emails",
  "https://www.googleapis.com/auth/classroom.coursework.students",
  "https://www.googleapis.com/auth/classroom.topics",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials",
  "https://www.googleapis.com/auth/drive.file",
];

function integrationDoc(teacherUid) {
  return teacherUid
    ? `teacherIntegrations/${String(teacherUid)}`
    : LEGACY_TEACHER_INTEGRATION_DOC;
}

function requiredPublicEnv(name) {
  const value = readPublicEnv(name);
  if (!value) {
    throw new Error(`${name} is not set. See functions/.env.example.`);
  }
  return value;
}

function createOAuthClient() {
  return new google.auth.OAuth2(
    readGoogleClientId(),
    readGoogleClientSecret(),
    requiredPublicEnv("GOOGLE_OAUTH_REDIRECT_URI")
  );
}

function buildAuthUrl(state) {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

async function saveTeacherTokens(tokens, teacherUid) {
  const db = getFirestore();
  const ref = db.doc(integrationDoc(teacherUid));
  const existing = await ref.get();
  const existingTokens = existing.exists ? existing.data().googleTokens || {} : {};
  const merged = { ...existingTokens, ...tokens };

  // Google commonly returns refresh_token only on the first consent. Keep the
  // previous refresh token during reconnects and access-token refreshes.
  if (!merged.refresh_token && existingTokens.refresh_token) {
    merged.refresh_token = existingTokens.refresh_token;
  }

  await ref.set(
    {
      googleTokens: merged,
      connectionState: "connected",
      lastError: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

async function migrateLegacyTokensToTeacher(db, teacherUid) {
  if (!teacherUid) return null;
  const legacyRef = db.doc(LEGACY_TEACHER_INTEGRATION_DOC);
  return db.runTransaction(async (transaction) => {
    const legacy = await transaction.get(legacyRef);
    if (!legacy.exists) return null;
    const data = legacy.data() || {};
    const tokens = data.googleTokens || null;
    if (!tokens?.refresh_token) return null;

    // Never copy one teacher's Classroom credentials into multiple MathMaster
    // accounts. The original integration was global, so the first teacher to
    // upgrade claims that legacy connection and everyone else reconnects.
    if (data.migratedToUid && data.migratedToUid !== teacherUid) return null;

    const teacherRef = db.doc(integrationDoc(teacherUid));
    transaction.set(
      teacherRef,
      {
        googleTokens: tokens,
        connectionState: "connected",
        migratedFromLegacy: true,
        migratedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    transaction.set(
      legacyRef,
      {
        migratedToUid: teacherUid,
        migratedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return tokens;
  });
}

async function getStoredTokens(teacherUid) {
  const db = getFirestore();
  const ref = db.doc(integrationDoc(teacherUid));
  const snap = await ref.get();
  if (snap.exists && snap.data().googleTokens) return snap.data().googleTokens;
  return migrateLegacyTokensToTeacher(db, teacherUid);
}

async function markConnectionProblem(teacherUid, error) {
  if (!teacherUid) return;
  await getFirestore().doc(integrationDoc(teacherUid)).set(
    {
      connectionState: "reconnect_required",
      lastError: String(
        error?.response?.data?.error_description ||
        error?.response?.data?.error ||
        error?.message ||
        error ||
        ""
      ),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

function missingScopes(tokens) {
  const granted = new Set(String(tokens?.scope || "").split(/\s+/).filter(Boolean));
  // Older stored tokens did not always retain the granted scope string. In that
  // case force one reconnect so Topics and Materials are explicitly consented.
  if (!granted.size) {
    return SCOPES.filter((scope) =>
      scope.endsWith("/classroom.topics") ||
      scope.endsWith("/classroom.courseworkmaterials") ||
      scope.endsWith("/drive.file")
    );
  }
  return SCOPES.filter((scope) => !granted.has(scope));
}

async function isConnected(teacherUid) {
  const tokens = await getStoredTokens(teacherUid);
  return Boolean(tokens && tokens.refresh_token);
}

async function getClassroomClient(teacherUid) {
  const tokens = await getStoredTokens(teacherUid);
  if (!tokens || !tokens.refresh_token) {
    throw new Error("Google Classroom is not connected yet. Connect the teacher account first.");
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);
  oauth2Client.on("tokens", (refreshed) => {
    saveTeacherTokens(refreshed, teacherUid).catch((err) =>
      console.error("Failed to persist refreshed Google tokens", err)
    );
  });

  return google.classroom({ version: "v1", auth: oauth2Client });
}

async function getDriveClient(teacherUid) {
  const tokens = await getStoredTokens(teacherUid);
  if (!tokens || !tokens.refresh_token) {
    throw new Error("Google Drive is not connected yet. Reconnect the teacher Google account first.");
  }
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);
  oauth2Client.on("tokens", (refreshed) => {
    saveTeacherTokens(refreshed, teacherUid).catch((err) =>
      console.error("Failed to persist refreshed Google tokens", err)
    );
  });
  return google.drive({ version: "v3", auth: oauth2Client });
}

async function getConnectionHealth(teacherUid) {
  const tokens = await getStoredTokens(teacherUid);
  if (!tokens?.refresh_token) {
    return { connected: false, needsReconnect: false, missingScopes: [] };
  }

  const missing = missingScopes(tokens);
  try {
    const classroom = await getClassroomClient(teacherUid);
    await classroom.courses.list({
      teacherId: "me",
      courseStates: ["ACTIVE"],
      pageSize: 1,
    });
    return {
      connected: true,
      needsReconnect: missing.length > 0,
      missingScopes: missing,
    };
  } catch (error) {
    const code = String(error?.response?.data?.error || "");
    const description = String(
      error?.response?.data?.error_description || error?.message || ""
    );
    if (code === "invalid_grant" || /expired|revoked|invalid_grant/i.test(description)) {
      await markConnectionProblem(teacherUid, error);
      return {
        connected: false,
        needsReconnect: true,
        missingScopes: missing,
        error: "Google Classroom authorization expired or was revoked. Reconnect the teacher account.",
      };
    }
    throw error;
  }
}

async function listCourses(classroom) {
  const courses = [];
  let pageToken;
  do {
    const res = await classroom.courses.list({
      teacherId: "me",
      courseStates: ["ACTIVE"],
      pageSize: 100,
      pageToken,
    });
    for (const course of res.data.courses || []) {
      courses.push({
        id: course.id,
        name: course.name,
        section: course.section || "",
        room: course.room || "",
        courseState: course.courseState || "ACTIVE",
        alternateLink: course.alternateLink || "",
      });
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return courses;
}

async function listStudents(classroom, courseId) {
  const students = [];
  let pageToken;
  do {
    const res = await classroom.courses.students.list({
      courseId,
      pageToken,
      pageSize: 100,
    });
    for (const student of res.data.students || []) {
      students.push({
        googleUserId: student.userId,
        name: student.profile?.name?.fullName || "",
        email: student.profile?.emailAddress || "",
      });
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return students;
}

function classroomDueParts(dueDate) {
  if (!dueDate) return { dueDate: undefined, dueTime: undefined };
  return {
    dueDate: {
      year: dueDate.getUTCFullYear(),
      month: dueDate.getUTCMonth() + 1,
      day: dueDate.getUTCDate(),
    },
    dueTime: {
      hours: dueDate.getUTCHours(),
      minutes: dueDate.getUTCMinutes(),
      seconds: 0,
      nanos: 0,
    },
  };
}

function toClassroomMaterial(material) {
  if (material?.driveFileId) {
    return {
      driveFile: {
        driveFile: { id: String(material.driveFileId) },
        shareMode: "VIEW",
      },
    };
  }
  return {
    link: {
      url: String(material?.url || ""),
      title: String(material?.title || "Resource"),
    },
  };
}

async function createCourseWork(
  classroom,
  { courseId, title, description, dueDate, materials, launchUrl, maxPoints, topicId }
) {
  const dueParts = classroomDueParts(dueDate);
  const materialItems = [
    ...(materials || []).map(toClassroomMaterial),
    { link: { url: launchUrl, title: "Open in MathMaster" } },
  ];

  const res = await classroom.courses.courseWork.create({
    courseId,
    requestBody: {
      title,
      description,
      materials: materialItems,
      workType: "ASSIGNMENT",
      state: "PUBLISHED",
      assigneeMode: "ALL_STUDENTS",
      maxPoints: maxPoints ?? 100,
      topicId: topicId || undefined,
      dueDate: dueParts.dueDate,
      dueTime: dueParts.dueTime,
    },
  });

  return res.data;
}

/**
 * Change an existing CourseWork item in place.
 *
 * This is deliberately not "publish again". Publishing creates; a teacher who
 * moves a due date wants the post students are already looking at to change,
 * not a second post beside it. Google patches only what the updateMask names,
 * so the mask is built from the fields actually supplied.
 *
 * Two details that are easy to get wrong:
 *   - dueDate and dueTime are separate fields and Classroom treats a date with
 *     no time as invalid, so both are always sent together.
 *   - a courseWork associated with a grading period loses that association if
 *     the patch omits it while naming it in the mask, so gradingPeriodId is
 *     carried through only when the caller supplies one.
 */
async function patchCourseWork(
  classroom,
  { courseId, courseWorkId, dueDate, gradingPeriodId }
) {
  const requestBody = {};
  const mask = [];

  if (dueDate !== undefined) {
    const dueParts = classroomDueParts(dueDate);
    requestBody.dueDate = dueParts.dueDate;
    requestBody.dueTime = dueParts.dueTime;
    mask.push("dueDate", "dueTime");
  }

  if (gradingPeriodId) {
    requestBody.gradingPeriodId = gradingPeriodId;
    mask.push("gradingPeriodId");
  }

  if (!mask.length) {
    throw new Error("patchCourseWork was called with nothing to change.");
  }

  const res = await classroom.courses.courseWork.patch({
    courseId,
    id: courseWorkId,
    updateMask: mask.join(","),
    requestBody,
  });

  return res.data;
}

async function modifyCourseWorkAssignees(
  classroom,
  { courseId, courseWorkId, assigneeMode = "ALL_STUDENTS" }
) {
  const response = await classroom.courses.courseWork.modifyAssignees({
    courseId,
    id: courseWorkId,
    requestBody: { assigneeMode },
  });
  return response.data;
}

async function deleteCourseWork(classroom, courseId, courseWorkId) {
  await classroom.courses.courseWork.delete({
    courseId,
    id: courseWorkId,
  });
  return true;
}

async function deleteCourseWorkMaterial(classroom, courseId, materialId) {
  await classroom.courses.courseWorkMaterials.delete({
    courseId,
    id: materialId,
  });
  return true;
}

async function getCourseWork(classroom, courseId, courseWorkId) {
  const res = await classroom.courses.courseWork.get({
    courseId,
    id: courseWorkId,
  });
  return res.data;
}

// The Classroom create endpoint has no caller-provided idempotency key. We add
// a unique MathMaster marker to the description and look for it before every
// retry. This recovers safely if Google created the work but Firestore failed
// to record the response.
async function findCourseWorkByPublicationMarker(classroom, courseId, marker) {
  let pageToken;
  do {
    const res = await classroom.courses.courseWork.list({
      courseId,
      courseWorkStates: ["PUBLISHED", "DRAFT"],
      orderBy: "updateTime desc",
      pageSize: 100,
      pageToken,
    });

    const found = (res.data.courseWork || []).find((item) =>
      String(item.description || "").includes(marker)
    );
    if (found) return found;
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return null;
}

async function findSubmissionForStudent(
  classroom,
  { courseId, courseWorkId, googleUserId }
) {
  const res = await classroom.courses.courseWork.studentSubmissions.list({
    courseId,
    courseWorkId,
    userId: googleUserId,
    pageSize: 10,
  });
  const [submission] = res.data.studentSubmissions || [];
  return submission || null;
}

// Teachers may patch draftGrade and assignedGrade. We intentionally do not
// call turnIn: Google's turnIn endpoint may only be called by the student who
// owns the submission.
async function patchGrade(
  classroom,
  { courseId, courseWorkId, submissionId, grade }
) {
  const res = await classroom.courses.courseWork.studentSubmissions.patch({
    courseId,
    courseWorkId,
    id: submissionId,
    updateMask: "assignedGrade,draftGrade",
    requestBody: {
      assignedGrade: grade,
      draftGrade: grade,
    },
  });
  return res.data;
}


async function listTopics(classroom, courseId) {
  const topics = [];
  let pageToken;
  do {
    const response = await classroom.courses.topics.list({
      courseId,
      pageSize: 100,
      pageToken,
    });
    topics.push(...(response.data.topic || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return topics;
}

async function ensureTopic(classroom, courseId, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;
  const topics = await listTopics(classroom, courseId);
  const existing = topics.find(
    (topic) => String(topic.name || "").trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (existing) return existing;

  const response = await classroom.courses.topics.create({
    courseId,
    requestBody: { name: cleanName },
  });
  return response.data;
}

async function createCourseWorkMaterial(
  classroom,
  { courseId, title, description, materials, topicId }
) {
  const materialItems = (materials || []).slice(0, 20).map(toClassroomMaterial);

  const response = await classroom.courses.courseWorkMaterials.create({
    courseId,
    requestBody: {
      title,
      description: description || "",
      materials: materialItems,
      state: "PUBLISHED",
      assigneeMode: "ALL_STUDENTS",
      topicId: topicId || undefined,
    },
  });
  return response.data;
}

module.exports = {
  SCOPES,
  buildAuthUrl,
  exchangeCodeForTokens,
  saveTeacherTokens,
  getStoredTokens,
  isConnected,
  getConnectionHealth,
  getClassroomClient,
  getDriveClient,
  listCourses,
  listStudents,
  createCourseWork,
  patchCourseWork,
  modifyCourseWorkAssignees,
  deleteCourseWork,
  deleteCourseWorkMaterial,
  getCourseWork,
  findCourseWorkByPublicationMarker,
  findSubmissionForStudent,
  patchGrade,
  listTopics,
  ensureTopic,
  createCourseWorkMaterial,
};
