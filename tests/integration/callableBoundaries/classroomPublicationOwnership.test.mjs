/*
 * A CLASSROOM PUBLICATION THAT RECORDS NO TEACHER: WHO SEES IT, AND WHO ACTS ON IT.
 *
 * HOW TO RUN: npm run test:callable-boundaries:emulator
 *
 * A classroomLinks document records the teacher whose Google account made the
 * post (`teacherUid`). One the original single-connection integration wrote
 * records none. The six publication callables used to treat such a link as
 * every teacher's. Now (functions/lib/classroomLinkOwnership.js) it is shown,
 * and acted on, only for a caller who manages its assignment: the teacher of
 * record of every class it is assigned to, or the root administrator. Any other
 * teacher gets what they get for another teacher's link: nothing, with nothing
 * written and Google never asked.
 *
 * Each callable is called through the client SDK with a real Auth emulator
 * token (callableHost.mjs) by the assignment's teacher, by a teacher of another
 * class, and by the root administrator. The other teacher has a post of their
 * own on another assignment, so their answers show the callables working and
 * the legacy post absent.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const {
  NOTHING_CHANGED, answerGoogle, browser, changesBetween, db, googleCallsSince, googleFixtures, googleMark,
  projectSnapshot, refusalOf, repo, shutdown, signedIn,
} = await import('./callableHost.mjs');

const requireFromRepo = createRequire(path.join(repo, 'package.json'));
// The administrator's address comes from the code that recognises it.
const { ROOT_ADMIN_EMAIL } = requireFromRepo('./functions/shared/rolePolicyIdentity.cjs');
const { gradeSyncDocumentId } = requireFromRepo('./functions/lib/publication.js');

const CLASS = { owner: 'ownership-class-owner', other: 'ownership-class-other' };
// Synthetic addresses on a reserved domain: nobody's real account.
const TEACHER = {
  owner: { label: 'assignment-teacher', email: 'assignment.teacher@district-three.test', classId: CLASS.owner },
  other: { label: 'other-teacher', email: 'other.teacher@district-three.test', classId: CLASS.other },
};
// The assignment whose legacy post records no teacher. Only the owner's class has it.
const ASSIGNMENT = 'ownership-assignment';
const LEGACY = { id: 'ownership-legacy-post', courseId: 'course-legacy', courseworkId: 'coursework-legacy' };
// A post each teacher made, recorded as theirs, on assignments of their own.
const OWNER_POST = { id: 'ownership-owner-post', assignmentId: 'ownership-owner-assignment', courseId: 'course-owner', courseworkId: 'coursework-owner' };
const OTHER_POST = { id: 'ownership-other-post', assignmentId: 'ownership-other-assignment', courseId: 'course-other', courseworkId: 'coursework-other' };
const STUDENT = 'ownership-student';

const legacyPost = () => ({
  schemaVersion: 2, publicationId: LEGACY.id, assignmentId: ASSIGNMENT, courseId: LEGACY.courseId,
  courseName: 'Legacy course', courseworkId: LEGACY.courseworkId, status: 'published', maxPoints: 100,
  gradePassbackEnabled: true,
});
const ownPost = (post, teacherUid) => ({
  schemaVersion: 3, publicationId: post.id, teacherUid, assignmentId: post.assignmentId, courseId: post.courseId,
  courseName: `Course ${post.courseId}`, courseworkId: post.courseworkId, status: 'published', maxPoints: 100,
  gradePassbackEnabled: true,
});
const assignment = (title, assignedClassIds) => ({
  title,
  assignedClassIds,
  schemaVersion: 5,
  releaseAt: new Date(Date.now() - 86_400_000).toISOString(),
  dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  sections: [{ id: 'ownership-classwork', role: 'classwork', title: 'Classwork', questions: [] }],
});
const syncRow = (publicationId, assignmentId) => ({
  syncId: gradeSyncDocumentId(publicationId, STUDENT), publicationId, assignmentId, studentId: STUDENT,
  status: 'synced', stage: 'final-complete', grade: 90, updatedAt: new Date(),
});
/** The legacy post as it was first written: every test that changes it starts from this. */
const seedLegacyPost = () => db.collection('classroomLinks').doc(LEGACY.id).set(legacyPost());

const accounts = {};

before(async () => {
  for (const [key, teacher] of Object.entries(TEACHER)) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classes').doc(teacher.classId).set({
      name: `Ownership ${key} class`, course: 'algebra1', courseLevel: 'standard', period: 'Period 2',
      teacherOfRecord: teacher.email, status: 'active',
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection('teacherDirectory').doc(teacher.email).set({ email: teacher.email, active: true });
  }
  await db.collection('assignments').doc(ASSIGNMENT).set(assignment('Published before posts recorded a teacher', [CLASS.owner]));
  await db.collection('assignments').doc(OWNER_POST.assignmentId).set(assignment('The owner\'s other lesson', [CLASS.owner]));
  await db.collection('assignments').doc(OTHER_POST.assignmentId).set(assignment('The other teacher\'s lesson', [CLASS.other]));

  // Every account signs in and is given its role by resolveSignedInRole, as in the app.
  for (const [key, teacher] of Object.entries(TEACHER)) {
    // eslint-disable-next-line no-await-in-loop
    accounts[key] = await signedIn({ label: teacher.label, email: teacher.email });
  }
  accounts.admin = await signedIn({ label: 'root-administrator', email: ROOT_ADMIN_EMAIL });

  await seedLegacyPost();
  await db.collection('classroomLinks').doc(OWNER_POST.id).set(ownPost(OWNER_POST, accounts.owner.uid));
  await db.collection('classroomLinks').doc(OTHER_POST.id).set(ownPost(OTHER_POST, accounts.other.uid));
  googleFixtures.publicationByCourseWork[LEGACY.courseworkId] = LEGACY.id;
  // The owner mapped the legacy post's course to their class, as Check / Repost needs.
  await db.collection('classroomCourseMappings').doc('ownership-owner-mapping').set({
    teacherUid: accounts.owner.uid, courseId: LEGACY.courseId, courseName: 'Legacy course', classId: CLASS.owner, classPeriod: 'Period 2',
  });
  // One grade passback row for each post.
  for (const [publicationId, assignmentId] of [[LEGACY.id, ASSIGNMENT], [OWNER_POST.id, OWNER_POST.assignmentId], [OTHER_POST.id, OTHER_POST.assignmentId]]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomGradeSyncs').doc(gradeSyncDocumentId(publicationId, STUDENT)).set(syncRow(publicationId, assignmentId));
  }

  // What Google answers the callables that change a post.
  answerGoogle('patchCourseWork', async (client, { courseWorkId }) => ({ id: courseWorkId, alternateLink: null }));
  answerGoogle('deleteCourseWork', async () => ({}));
  answerGoogle('listCourses', async () => [{ id: LEGACY.courseId, name: 'Legacy course' }]);
});

after(shutdown);

test('the accounts carry the roles the server granted', () => {
  assert.equal(accounts.owner.claims.role, 'teacher');
  assert.equal(accounts.other.claims.role, 'teacher');
  assert.equal(accounts.admin.claims.role, 'teacher');
  assert.equal(accounts.admin.claims.rootAdmin, true);
  assert.equal(accounts.owner.claims.rootAdmin, undefined);
  const legacy = legacyPost();
  assert.equal('teacherUid' in legacy, false, 'the legacy post records no teacher');
});

/** The call succeeds with `expected`, writes nothing anywhere, and never reaches Google. */
async function assertAbsentAndNothingWritten(caller, name, data, expected) {
  const before = await projectSnapshot();
  const mark = googleMark();
  const result = await caller.call(name, data);
  assert.deepEqual(result, expected, `${caller.label} calling ${name}`);
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED, `${caller.label} calling ${name} wrote nothing`);
  assert.deepEqual(googleCallsSince(mark), [], `${caller.label} calling ${name} never reached Google Classroom`);
  return result;
}

/** What Google was asked since `mark`: [call, whose account, course]. */
const asked = (mark) => googleCallsSince(mark).map((call) => [call.call, call.teacherUid, call.courseId ?? null]);

/* ==========================================================================
 * ANOTHER TEACHER: THE LEGACY POST IS NOT THEIRS.
 * ======================================================================== */

test('another teacher updating the assignment\'s due date in Classroom finds no post of theirs', async () => {
  await assertAbsentAndNothingWritten(accounts.other, 'updateAssignmentClassroomPublications', { assignmentId: ASSIGNMENT }, {
    assignmentId: ASSIGNMENT, results: [], summary: { updated: 0, failed: 0, skipped: 0 },
  });
});

test('another teacher inspecting the assignment\'s Classroom audience is told nothing about the legacy post', async () => {
  await assertAbsentAndNothingWritten(accounts.other, 'inspectClassroomPublication', { assignmentId: ASSIGNMENT, repairAudience: true }, {
    assignmentId: ASSIGNMENT, results: [], summary: { courses: 0, rosterStudents: 0, failed: 0 },
  });
});

test('another teacher removing the assignment from Classroom removes nothing, and their Google account is not used', async () => {
  await assertAbsentAndNothingWritten(accounts.other, 'removeAssignmentClassroomPackage', { assignmentId: ASSIGNMENT }, {
    assignmentId: ASSIGNMENT, results: [], summary: { destinations: 0, removed: 0, failed: 0 },
  });
});

test('another teacher\'s Check / Repost does not count the legacy post among their destinations', async () => {
  // They map no course to the assignment's class, so the class is reported
  // unmapped, as for any assignment that is not theirs.
  await assertAbsentAndNothingWritten(accounts.other, 'repairClassroomAssignmentPublications', { assignmentId: ASSIGNMENT }, {
    assignmentId: ASSIGNMENT,
    results: [{
      courseId: null, classId: CLASS.owner, courseName: 'Ownership owner class', status: 'failed',
      error: 'No Google Classroom course is currently mapped to this assigned MathMaster class.',
    }],
    summary: { checked: 1, healthy: 0, reposted: 0, failed: 1, queuedGrades: 0, targetDestinations: 0, ignoredPriorDestinations: 0 },
  });
});

/* ==========================================================================
 * THE ASSIGNMENT'S TEACHER: THE LEGACY POST IS THEIRS.
 * ======================================================================== */

test('the assignment\'s teacher inspects the legacy post with their own Google account', async () => {
  const before = await projectSnapshot();
  const mark = googleMark();
  const result = await accounts.owner.call('inspectClassroomPublication', { assignmentId: ASSIGNMENT, repairAudience: false });
  assert.deepEqual(result.results.map((entry) => [entry.courseId, entry.courseworkId, entry.status]), [[LEGACY.courseId, LEGACY.courseworkId, 'ok']]);
  assert.deepEqual(asked(mark), [
    ['getClassroomClient', accounts.owner.uid, null],
    ['getCourseWork', accounts.owner.uid, LEGACY.courseId],
    ['listStudents', accounts.owner.uid, LEGACY.courseId],
  ]);
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED);
});

test('the assignment\'s teacher updates the legacy post\'s due date, and only that post is written', async () => {
  await seedLegacyPost();
  const before = await projectSnapshot();
  const mark = googleMark();
  const result = await accounts.owner.call('updateAssignmentClassroomPublications', { assignmentId: ASSIGNMENT });
  assert.deepEqual(result.results.map((entry) => [entry.courseId, entry.status]), [[LEGACY.courseId, 'updated']]);
  assert.deepEqual(asked(mark), [
    ['getClassroomClient', accounts.owner.uid, null],
    ['getCourseWork', accounts.owner.uid, LEGACY.courseId],
    ['patchCourseWork', accounts.owner.uid, LEGACY.courseId],
  ]);
  assert.deepEqual(changesBetween(before, await projectSnapshot()), { added: [], removed: [], changed: [`classroomLinks/${LEGACY.id}`] });
  assert.equal((await db.collection('classroomLinks').doc(LEGACY.id).get()).data().syncStatus, 'in-sync');
});

test('the assignment\'s teacher\'s Check / Repost finds the legacy post healthy in their mapped course', async () => {
  await seedLegacyPost();
  const before = await projectSnapshot();
  const mark = googleMark();
  const result = await accounts.owner.call('repairClassroomAssignmentPublications', { assignmentId: ASSIGNMENT });
  assert.deepEqual(result.results.map((entry) => [entry.courseId, entry.publicationId, entry.status]), [[LEGACY.courseId, LEGACY.id, 'healthy']]);
  assert.deepEqual(result.summary, { checked: 1, healthy: 1, reposted: 0, failed: 0, queuedGrades: 0, targetDestinations: 1, ignoredPriorDestinations: 0 });
  assert.deepEqual(asked(mark), [
    ['getClassroomClient', accounts.owner.uid, null],
    ['listCourses', accounts.owner.uid, null],
    ['getCourseWork', accounts.owner.uid, LEGACY.courseId],
  ]);
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED);
});

test('the assignment\'s teacher removes the legacy post with their own Google account', async () => {
  await seedLegacyPost();
  const before = await projectSnapshot();
  const mark = googleMark();
  const result = await accounts.owner.call('removeAssignmentClassroomPackage', { assignmentId: ASSIGNMENT });
  assert.deepEqual(result.results, [{ courseId: LEGACY.courseId, courseName: 'Legacy course', assignment: 'removed', material: 'not-published' }]);
  assert.deepEqual(asked(mark), [
    ['getClassroomClient', accounts.owner.uid, null],
    ['deleteCourseWork', accounts.owner.uid, LEGACY.courseId],
  ]);
  assert.deepEqual(changesBetween(before, await projectSnapshot()), { added: [], removed: [], changed: [`classroomLinks/${LEGACY.id}`] });
  const removed = (await db.collection('classroomLinks').doc(LEGACY.id).get()).data();
  assert.equal(removed.status, 'removed');
  assert.equal(removed.courseworkId, undefined);
  await seedLegacyPost();
});

/* ==========================================================================
 * THE ROOT ADMINISTRATOR: THE LEGACY POST IS ACTED ON FOR THEM TOO.
 * ======================================================================== */

test('the administrator inspects the legacy post with their own Google account', async () => {
  const mark = googleMark();
  const result = await accounts.admin.call('inspectClassroomPublication', { assignmentId: ASSIGNMENT, repairAudience: false });
  assert.deepEqual(result.results.map((entry) => [entry.courseId, entry.status]), [[LEGACY.courseId, 'ok']]);
  assert.deepEqual(asked(mark), [
    ['getClassroomClient', accounts.admin.uid, null],
    ['getCourseWork', accounts.admin.uid, LEGACY.courseId],
    ['listStudents', accounts.admin.uid, LEGACY.courseId],
  ]);
});

test('the administrator updates and removes the legacy post', async () => {
  await seedLegacyPost();
  let mark = googleMark();
  const updated = await accounts.admin.call('updateAssignmentClassroomPublications', { assignmentId: ASSIGNMENT });
  assert.deepEqual(updated.results.map((entry) => [entry.courseId, entry.status]), [[LEGACY.courseId, 'updated']]);
  assert.deepEqual(asked(mark).map(([call, uid]) => [call, uid]), [
    ['getClassroomClient', accounts.admin.uid], ['getCourseWork', accounts.admin.uid], ['patchCourseWork', accounts.admin.uid],
  ]);
  mark = googleMark();
  const removed = await accounts.admin.call('removeAssignmentClassroomPackage', { assignmentId: ASSIGNMENT });
  assert.deepEqual(removed.results.map((entry) => [entry.courseId, entry.assignment]), [[LEGACY.courseId, 'removed']]);
  assert.deepEqual(asked(mark).map(([call, uid]) => [call, uid]), [['getClassroomClient', accounts.admin.uid], ['deleteCourseWork', accounts.admin.uid]]);
  await seedLegacyPost();
});

test('the administrator\'s Check / Repost counts the legacy post among the assignment\'s prior destinations', async () => {
  // The administrator maps no course, so nothing is checked in Google; the
  // legacy post is theirs to see, and is counted.
  const before = await projectSnapshot();
  const mark = googleMark();
  const result = await accounts.admin.call('repairClassroomAssignmentPublications', { assignmentId: ASSIGNMENT });
  assert.equal(result.summary.ignoredPriorDestinations, 1);
  assert.deepEqual(googleCallsSince(mark), []);
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED);
});

/* ==========================================================================
 * THE LISTS: "PUBLISHED ASSIGNMENTS" AND THE GRADE PASSBACK MONITOR.
 * ======================================================================== */

const listedPosts = async (caller) => {
  const before = await projectSnapshot();
  const mark = googleMark();
  const { links } = await caller.call('listPublishedAssignments', {});
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED, `${caller.label}: listing writes nothing`);
  assert.deepEqual(googleCallsSince(mark), [], `${caller.label}: listing never reaches Google`);
  return links.map((link) => link.id).filter((id) => id.startsWith('ownership-')).sort();
};
const monitoredPosts = async (caller) => {
  const before = await projectSnapshot();
  const mark = googleMark();
  const { syncs } = await caller.call('listClassroomGradeSyncs', {});
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED, `${caller.label}: the monitor writes nothing`);
  assert.deepEqual(googleCallsSince(mark), [], `${caller.label}: the monitor never reaches Google`);
  return syncs.map((row) => row.publicationId).filter((id) => id.startsWith('ownership-')).sort();
};

test('"Published assignments" lists the legacy post for the assignment\'s teacher and the administrator, and not for another teacher', async () => {
  assert.deepEqual(await listedPosts(accounts.other), [OTHER_POST.id]);
  assert.deepEqual(await listedPosts(accounts.owner), [LEGACY.id, OWNER_POST.id].sort());
  assert.deepEqual(await listedPosts(accounts.admin), [LEGACY.id]);
});

test('the grade passback monitor shows the legacy post\'s rows to the assignment\'s teacher and the administrator, and not to another teacher', async () => {
  assert.deepEqual(await monitoredPosts(accounts.other), [OTHER_POST.id]);
  assert.deepEqual(await monitoredPosts(accounts.owner), [LEGACY.id, OWNER_POST.id].sort());
  assert.deepEqual(await monitoredPosts(accounts.admin), [LEGACY.id]);
});

test('refusals are unchanged: a signed-out caller is still refused before any post is read', async () => {
  const signedOut = browser('ownership-signed-out');
  assert.deepEqual(await refusalOf(signedOut.call('listPublishedAssignments', {})), {
    code: 'functions/unauthenticated', message: 'Sign in before making this change.',
  });
});
