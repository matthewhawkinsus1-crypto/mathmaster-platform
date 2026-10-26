/*
 * The callables behind four screens the accessibility scenes open, so that each shows what it shows
 * a school and not the harness's "no fake for the callable" banner (TT27):
 *
 *   Administration > Accounts & sign-in    listAdminAuditLog
 *   Administration > Pre-production reset  resetPreproductionTestData (the read-only preview)
 *   Administration > Path content coverage getPathRuntimeStatus, getCoursePathReleaseStatusV2
 *   Google Classroom                       getClassroomConnectionStatus, listPublishedAssignments,
 *                                          listClassroomGradeSyncs
 *
 * Each returns the shape the deployed callable returns (functions/index.js), over invented data: a few
 * audit entries, the counts of what the harness holds, the release this browser bundle was built from,
 * and a teacher who has not connected Google Classroom. Nothing here writes: the destructive half of
 * resetPreproductionTestData is refused, as it is for a school the lock covers.
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

  // A teacher who has not connected Google Classroom (lib/classroom.js getConnectionHealth).
  getClassroomConnectionStatus: () => ({ connected: false, needsReconnect: false, missingScopes: [] }),
  listPublishedAssignments: () => ({
    links: harnessStore.paths('classroomLinks/').filter((path) => path.split('/').length === 2).map((path) => ({ id: path.split('/')[1], ...harnessStore.get(path) })),
  }),
  listClassroomGradeSyncs: () => ({ syncs: [], pushQueue: { waiting: 0 } }),
};
