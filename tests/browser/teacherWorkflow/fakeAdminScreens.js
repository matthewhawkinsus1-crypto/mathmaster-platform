/*
 * The callables behind four screens the accessibility scenes open, so that each shows what it shows
 * a school and not the harness's "no fake for the callable" banner (TT27):
 *
 *   Administration > Accounts & sign-in    listAdminAuditLog
 *   Administration > Pre-production reset  resetPreproductionTestData (the read-only preview)
 *   Administration > Path content coverage getPathRuntimeStatus, getCoursePathReleaseStatusV2
 *   Google Classroom                       getClassroomConnectionStatus, listGoogleCourses,
 *                                          listPublishedAssignments, listClassroomGradeSyncs (and the
 *                                          course mappings fakeFunctions.js's listClassroomCourseMappings reads)
 *
 * Each returns the shape the deployed callable returns (functions/index.js), over invented data: a few
 * audit entries, the counts of what the harness holds, the release this browser bundle was built from,
 * and a teacher who has not connected Google Classroom, or, when asked, one who has (GOOGLE CLASSROOM,
 * CONNECTED, below). Nothing here writes: the destructive half of resetPreproductionTestData is refused,
 * as it is for a school the lock covers.
 *
 * fakeFunctions.js adds these to its table without replacing a callable it already implements.
 */
import { PATH_WEB_RELEASE } from '../../../src/platform/path/pathRelease.js';
import { DEPLOYED_COURSE_PATH_RELEASE } from '../../../src/platform/path/pathReleaseManifest.generated.js';
import { harnessStore } from './fakeFirestore.js';
import { TEACHER_EMAIL } from './fixture.js';

const refusal = (code, message) => Object.assign(new Error(`${code}: ${message}`), { code: `functions/${code}` });
const documentCount = (collection) => harnessStore.paths(`${collection}/`).filter((path) => path.split('/').length === 2).length;

// Newest first, as the callable orders them (createdAt descending).
const AUDIT_EVENTS = [
  { id: 'audit-4', actorEmail: TEACHER_EMAIL, action: 'student_class_changed', target: 'Student 1500104, to Algebra II Period 3', createdAt: '2026-10-21T15:12:00.000Z' },
  { id: 'audit-3', actorEmail: TEACHER_EMAIL, action: 'student_passcode_reset', target: 'Student 1500102', createdAt: '2026-10-20T14:03:00.000Z' },
  { id: 'audit-2', actorEmail: TEACHER_EMAIL, action: 'student_district_id_changed', target: 'Student 1500101', createdAt: '2026-10-19T16:41:00.000Z' },
  { id: 'audit-1', actorEmail: TEACHER_EMAIL, action: 'teacher_access_granted', target: 'a second teacher', createdAt: '2026-10-14T13:30:00.000Z' },
];

/*
 * GOOGLE CLASSROOM, CONNECTED. A connected account loads its courses through listGoogleCourses, which reads the
 * teacher's Google account; the harness had no stand-in for it, so no scene had seen the screen past "Not
 * connected". Off unless asked, so every other journey meets the teacher it always did: `&classroom=connected` on
 * the address, or `window.__mmHarness.classroomConnected = true` before the screen opens (the accessibility scene
 * sets it and opens the screen again, as a teacher comes back to it once connected). Then the account is connected
 * with every permission, and teaches three active courses, invented: Algebra II Period 3, mapped to the harness's
 * class of that name, and two Algebra I sections not mapped yet.
 */
export const classroomConnected = () => {
  if (typeof window === 'undefined') return false;
  if (window.__mmHarness?.classroomConnected === true) return true;
  return new URLSearchParams(window.location.search).get('classroom') === 'connected';
};
// The shape lib/classroom.js listCourses gives each course.
const CLASSROOM_COURSES = [
  { id: 'course-alg2-p3', name: 'Algebra II', section: 'Period 3', room: 'Room 214', courseState: 'ACTIVE', alternateLink: '' },
  { id: 'course-alg1-p1', name: 'Algebra I', section: 'Period 1', room: 'Room 214', courseState: 'ACTIVE', alternateLink: '' },
  { id: 'course-alg1-p5', name: 'Algebra I', section: 'Period 5', room: 'Room 109', courseState: 'ACTIVE', alternateLink: '' },
];
// The connected teacher's saved mappings, in the shape listClassroomCourseMappings returns (classroomMappingResponse).
export const classroomCourseMappings = () => (classroomConnected() ? [{
  id: 'harness-mapping-alg2-p3', mappingId: 'harness-mapping-alg2-p3', courseId: 'course-alg2-p3', courseName: 'Algebra II',
  courseSection: 'Period 3', classId: 'c-alg2-p3', className: 'Algebra II — Period 3', classPeriod: 'Period 3', updatedAtMillis: Date.UTC(2026, 8, 2, 14),
}] : []);

// The names preservedLabel() in PreproductionReset.jsx knows, and a few the preview counts.
const PRESERVED_COLLECTIONS = [
  'classes', 'settings', 'teacherDirectory', 'teacherIntegrations', 'classroomCourseMappings', 'adminControl',
  'adminAuditLog', 'pathQuestionBank', 'pathCoverage', 'examQuestionBank', 'modelingLabDefinitions',
];

export const adminScreenHandlers = {
  listAdminAuditLog: ({ limit } = {}) => ({
    events: AUDIT_EVENTS.slice(0, Math.max(1, Math.min(100, Number(limit) || 40))),
  }),

  resetPreproductionTestData: ({ dryRun } = {}) => {
    if (dryRun !== true) throw refusal('failed-precondition', 'The teacher harness only previews a pre-production reset; it never deletes.');
    const students = harnessStore.paths('grades/').filter((path) => path.split('/').length === 2 && path !== 'grades/test_connection').length;
    const assignments = documentCount('assignments');
    return {
      success: true,
      dryRun: true,
      confirmationRequired: 'RESET TEST DATA',
      studentRosterRecords: students,
      studentAuthUsers: students,
      assignments,
      collections: {
        assignments,
        presence: documentCount('presence'),
        pathSessions: documentCount('pathSessions'),
        classroomLinks: documentCount('classroomLinks'),
        studentCredentials: documentCount('studentCredentials'),
      },
      preservedCollections: PRESERVED_COLLECTIONS,
      resetLocked: false,
      resetLockedAt: null,
      lockConfirmationRequired: 'LOCK FOR PRODUCTION',
    };
  },

  // What the Functions backend says it is running: the release this bundle was built from, and its bank.
  getPathRuntimeStatus: () => ({
    release: PATH_WEB_RELEASE,
    bankCount: DEPLOYED_COURSE_PATH_RELEASE.questionCount,
    starterAvailable: true,
    starterCount: DEPLOYED_COURSE_PATH_RELEASE.questionCount,
  }),

  // Production serving the certified release this bundle carries: nothing to publish.
  getCoursePathReleaseStatusV2: () => ({
    ok: true,
    status: 'current',
    label: 'Production is serving the certified release.',
    phase: 'complete',
    deployed: {
      releaseId: DEPLOYED_COURSE_PATH_RELEASE.releaseId,
      contentHash: DEPLOYED_COURSE_PATH_RELEASE.contentHash,
      questionCount: DEPLOYED_COURSE_PATH_RELEASE.questionCount,
    },
    activeReleaseId: DEPLOYED_COURSE_PATH_RELEASE.releaseId,
    active: { status: 'active', contentHash: DEPLOYED_COURSE_PATH_RELEASE.contentHash },
    job: null,
  }),

  // A teacher who has not connected Google Classroom, or one who has (lib/classroom.js getConnectionHealth).
  getClassroomConnectionStatus: () => ({ connected: classroomConnected(), needsReconnect: false, missingScopes: [] }),
  // The connected account's active courses. Without a connection the server's Classroom client throws a plain
  // Error, which reaches the browser as a bare "internal" (the screen never asks then: it waits for "Connected").
  listGoogleCourses: () => {
    if (!classroomConnected()) throw Object.assign(new Error('internal'), { code: 'functions/internal' });
    return { courses: CLASSROOM_COURSES.map((course) => ({ ...course })) };
  },
  listPublishedAssignments: () => ({
    links: harnessStore.paths('classroomLinks/').filter((path) => path.split('/').length === 2).map((path) => ({ id: path.split('/')[1], ...harnessStore.get(path) })),
  }),
  listClassroomGradeSyncs: () => ({ syncs: [], pushQueue: { waiting: 0 } }),
};
