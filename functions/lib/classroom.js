const { google } = require("googleapis");
const { getFirestore } = require("firebase-admin/firestore");
const {
  readGoogleClientId,
  readGoogleClientSecret,
  readPublicEnv,
} = require("./config");

// Classroom OAuth currently uses one connected instructional Google account.
// Firebase Authentication and role/admin authorization are enforced by the
// callable layer before Classroom operations reach this helper.
const TEACHER_INTEGRATION_DOC = "teacherIntegrations/default";

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.profile.emails",
  "https://www.googleapis.com/auth/classroom.coursework.students",
];

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

async function saveTeacherTokens(tokens) {
  const db = getFirestore();
  const ref = db.doc(TEACHER_INTEGRATION_DOC);
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
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

async function getStoredTokens() {
  const db = getFirestore();
  const snap = await db.doc(TEACHER_INTEGRATION_DOC).get();
  if (!snap.exists) return null;
  return snap.data().googleTokens || null;
}

async function isConnected() {
  const tokens = await getStoredTokens();
  return Boolean(tokens && tokens.refresh_token);
}

async function getClassroomClient() {
  const tokens = await getStoredTokens();
  if (!tokens || !tokens.refresh_token) {
    throw new Error("Google Classroom is not connected yet. Connect the teacher account first.");
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);
  oauth2Client.on("tokens", (refreshed) => {
    saveTeacherTokens(refreshed).catch((err) =>
      console.error("Failed to persist refreshed Google tokens", err)
    );
  });

  return google.classroom({ version: "v1", auth: oauth2Client });
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

async function createCourseWork(
  classroom,
  { courseId, title, description, dueDate, materials, launchUrl, maxPoints }
) {
  const dueParts = classroomDueParts(dueDate);
  const materialItems = [
    ...(materials || []).map((material) => ({
      link: { url: material.url, title: material.title },
    })),
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
      maxPoints: maxPoints ?? 100,
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

module.exports = {
  SCOPES,
  buildAuthUrl,
  exchangeCodeForTokens,
  saveTeacherTokens,
  isConnected,
  getClassroomClient,
  listCourses,
  listStudents,
  createCourseWork,
  patchCourseWork,
  getCourseWork,
  findCourseWorkByPublicationMarker,
  findSubmissionForStudent,
  patchGrade,
};
