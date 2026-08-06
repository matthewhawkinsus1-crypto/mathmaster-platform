const { google } = require("googleapis");
const { getFirestore } = require("firebase-admin/firestore");
const {
  readGoogleClientId,
  readGoogleClientSecret,
  readPublicEnv,
} = require("./config");

// The broader app still does not have Firebase Authentication. Until teacher
// auth is added, one connected Google teacher account is stored here.
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
  getCourseWork,
  findCourseWorkByPublicationMarker,
  findSubmissionForStudent,
  patchGrade,
};
