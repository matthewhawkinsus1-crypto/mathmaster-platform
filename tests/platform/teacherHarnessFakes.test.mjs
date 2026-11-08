// The teacher-workflow harness fakes (tests/browser/teacherWorkflow) stand in
// for Firestore and Cloud Functions in every teacher journey. A journey can
// only be trusted as far as its fakes behave like the real thing, so:
//
//   - a listener hears a write only when that write changes what its own
//     document or query returns (Firestore's rule) — not every write;
//   - queries honour their constraints as Firestore does;
//   - a callable the harness does not implement fails loudly, never `{}`;
//   - the fakes export everything the app imports from Firebase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FAKES = path.join(ROOT, 'tests/browser/teacherWorkflow');

// The fakes run in a browser; give them the little of one they touch, and no
// presence heartbeat timer (it would keep this process alive).
const browserGlobals = (search) => {
  const memory = new Map();
  globalThis.window = { location: { search } };
  globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
};
const loadFake = async (file, search = '?reset=1', tag = 'default') => {
  browserGlobals(search);
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = () => 0;
  try {
    return await import(`../browser/teacherWorkflow/${file}?${tag}`);
  } finally {
    globalThis.setInterval = realSetInterval;
  }
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

const fs = await loadFake('fakeFirestore.js');
const listen = (target) => {
  const snapshots = [];
  const stop = fs.onSnapshot(target, (snapshot) => snapshots.push(snapshot));
  return { snapshots, stop };
};
const ids = (snapshot) => snapshot.docs.map((entry) => entry.id);

test('a document listener hears only writes that change that document', async () => {
  const db = fs.getFirestore();
  await fs.setDoc(fs.doc(db, 'harnessTest', 'a'), { value: 1 });
  await fs.setDoc(fs.doc(db, 'harnessTest', 'b'), { value: 1 });
  const watcher = listen(fs.doc(db, 'harnessTest', 'a'));
  await settle();
  assert.equal(watcher.snapshots.length, 1, 'the first snapshot always arrives');
  await fs.setDoc(fs.doc(db, 'harnessTest', 'b'), { value: 2 });
  await settle();
  assert.equal(watcher.snapshots.length, 1, 'a write to another document is not heard');
  await fs.setDoc(fs.doc(db, 'harnessTest', 'a'), { value: 1 });
  await settle();
  assert.equal(watcher.snapshots.length, 1, 'rewriting identical content is not a change');
  await fs.updateDoc(fs.doc(db, 'harnessTest', 'a'), { value: 3 });
  await settle();
  assert.equal(watcher.snapshots.length, 2);
  assert.equal(watcher.snapshots[1].data().value, 3);
  await fs.deleteDoc(fs.doc(db, 'harnessTest', 'a'));
  await settle();
  assert.equal(watcher.snapshots.length, 3);
  assert.equal(watcher.snapshots[2].exists(), false, 'a deletion is heard');
  watcher.stop();
  await fs.setDoc(fs.doc(db, 'harnessTest', 'a'), { value: 4 });
  await settle();
  assert.equal(watcher.snapshots.length, 3, 'nothing after unsubscribing');
  // An effect that unsubscribes at once (React's cleanup does) gets no first snapshot either.
  const early = listen(fs.doc(db, 'harnessTest', 'a'));
  early.stop();
  await settle();
  assert.equal(early.snapshots.length, 0, 'unsubscribed before the first snapshot: none arrives');
});

test('a query listener hears a write only when the query\'s result changes', async () => {
  const db = fs.getFirestore();
  const roster = fs.collection(db, 'harnessRoster');
  await fs.setDoc(fs.doc(roster, 's1'), { classId: 'c1', name: 'One' });
  await fs.setDoc(fs.doc(roster, 's2'), { classId: 'c2', name: 'Two' });
  const watcher = listen(fs.query(roster, fs.where('classId', '==', 'c1')));
  await settle();
  assert.deepEqual(ids(watcher.snapshots[0]), ['s1']);
  assert.deepEqual(watcher.snapshots[0].docChanges().map((change) => change.type), ['added']);

  await fs.updateDoc(fs.doc(roster, 's2'), { name: 'Two, renamed' });
  await fs.setDoc(fs.doc(db, 'elsewhere', 'x'), { classId: 'c1' });
  await settle();
  assert.equal(watcher.snapshots.length, 1, 'outside the query: in another class, or another collection');

  await fs.updateDoc(fs.doc(roster, 's1'), { name: 'One, renamed' });
  await settle();
  assert.equal(watcher.snapshots.length, 2, 'a result document changed');
  assert.deepEqual(watcher.snapshots[1].docChanges().map((change) => [change.type, change.doc.id]), [['modified', 's1']]);

  await fs.updateDoc(fs.doc(roster, 's2'), { classId: 'c1' });
  await settle();
  assert.deepEqual(ids(watcher.snapshots[2]), ['s1', 's2'], 'a document entered the result');
  assert.deepEqual(watcher.snapshots[2].docChanges().map((change) => [change.type, change.doc.id]), [['added', 's2']]);

  await fs.updateDoc(fs.doc(roster, 's1'), { classId: 'c3' });
  await settle();
  assert.deepEqual(ids(watcher.snapshots[3]), ['s2'], 'a document left the result');
  assert.deepEqual(watcher.snapshots[3].docChanges().map((change) => [change.type, change.doc.id]), [['removed', 's1']]);
  watcher.stop();
});

test('orderBy, limit, != and not-in scope a query as Firestore does', async () => {
  const db = fs.getFirestore();
  const events = fs.collection(db, 'harnessEvents');
  await fs.setDoc(fs.doc(events, 'e1'), { at: 1, kind: 'a' });
  await fs.setDoc(fs.doc(events, 'e2'), { at: 2, kind: 'b' });
  await fs.setDoc(fs.doc(events, 'e3'), { at: 3 });
  await fs.setDoc(fs.doc(events, 'e4'), { kind: 'a' });
  assert.deepEqual(ids(await fs.getDocs(fs.query(events, fs.orderBy('at', 'desc')))), ['e3', 'e2', 'e1'], 'orderBy leaves out a document without the field');
  assert.deepEqual(ids(await fs.getDocs(fs.query(events, fs.where('kind', '!=', 'b')))).sort(), ['e1', 'e4'], '!= leaves out a document without the field');
  assert.deepEqual(ids(await fs.getDocs(fs.query(events, fs.where('kind', 'not-in', ['b'])))).sort(), ['e1', 'e4']);

  const latestTwo = listen(fs.query(events, fs.orderBy('at', 'desc'), fs.limit(2)));
  await settle();
  assert.deepEqual(ids(latestTwo.snapshots[0]), ['e3', 'e2']);
  await fs.updateDoc(fs.doc(events, 'e1'), { kind: 'c' });
  await settle();
  assert.equal(latestTwo.snapshots.length, 1, 'beyond the limit: not heard');
  await fs.updateDoc(fs.doc(events, 'e1'), { at: 9 });
  await settle();
  assert.deepEqual(ids(latestTwo.snapshots[1]), ['e1', 'e3'], 'moved into the top two: heard');
  latestTwo.stop();
});

test('the every-write stress mode is opt-in and does what it says', async () => {
  const strict = await loadFake('fakeFirestore.js', '?reset=1&notify=every-write', 'strict');
  const db = strict.getFirestore();
  await strict.setDoc(strict.doc(db, 'harnessTest', 'a'), { value: 1 });
  await settle();
  const snapshots = [];
  const stop = strict.onSnapshot(strict.doc(db, 'harnessTest', 'a'), (snapshot) => snapshots.push(snapshot));
  await settle();
  await strict.setDoc(strict.doc(db, 'harnessTest', 'other'), { value: 1 });
  await settle();
  assert.equal(snapshots.length, 2, 'every write re-emits every listener');
  assert.equal(strict.harnessStore.stats().notifyEveryWrite, true);
  assert.equal(fs.harnessStore.stats().notifyEveryWrite, false, 'the default is Firestore\'s behaviour');
  stop();
});

test('a callable the harness does not implement fails loudly, never with {}', async () => {
  const functions = await loadFake('fakeFunctions.js');
  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await assert.rejects(
      functions.httpsCallable(functions.getFunctions(), 'someCallableNobodyFaked')({}),
      (error) => error.code === 'functions/unimplemented' && /someCallableNobodyFaked/.test(error.message),
    );
  } finally {
    console.error = realError;
  }
  assert.deepEqual(globalThis.window.__mmHarness.unimplementedCalls, ['someCallableNobodyFaked'], 'recorded for the journeys');
  assert.match(errors.join('\n'), /^\[teacher harness\] callable "someCallableNobodyFaked" is not implemented/, 'and said on the console, where journeyChecks.mjs looks');
  // An implemented callable still answers.
  const role = await functions.httpsCallable(functions.getFunctions(), 'resolveSignedInRole')({});
  assert.deepEqual(role.data, { role: 'teacher' });
});

test('the callables the journeys reach answer as their real functions do — shape, authorization and order', async () => {
  const functions = await loadFake('fakeFunctions.js', '?reset=1', 'contracts');
  // fakeFunctions.js reads and writes the store its own import of fakeFirestore.js holds.
  const store = (await import('../browser/teacherWorkflow/fakeFirestore.js')).harnessStore;
  const call = (name, data) => functions.httpsCallable(functions.getFunctions(), name)(data).then((result) => result.data);
  const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error.code === `functions/${code}`, code);
  const student = store.get('grades/910002');
  assert.ok(student?.classId, 'the fixture student has a class');

  // getStudentRewards (rewardActionStore.loadStudentRewardsForTeacher): the response shape, empty when nothing is stored.
  const rewards = await call('getStudentRewards', { studentId: '910002', classId: student.classId });
  assert.deepEqual(Object.keys(rewards).sort(), ['account', 'challenges', 'classId', 'grants', 'redemptions', 'studentId', 'transactions']);
  assert.deepEqual(rewards.account, { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 });
  await rejectsWith(call('getStudentRewards', { studentId: '910002', classId: 'c-lab-p3' }), 'failed-precondition');
  await rejectsWith(call('getStudentRewards', { studentId: '', classId: student.classId }), 'invalid-argument');

  // getWeeklyPathClassroomSync / set: off at 100 points until changed; teacher of record only.
  assert.deepEqual(await call('getWeeklyPathClassroomSync', { classId: student.classId }), { classId: student.classId, enabled: false, maxPoints: 100, updatedAt: null, updatedByEmail: null });
  assert.deepEqual(await call('setWeeklyPathClassroomSync', { classId: student.classId, enabled: true, maxPoints: 5000 }), { classId: student.classId, enabled: true, maxPoints: 1000 });
  const after = await call('getWeeklyPathClassroomSync', { classId: student.classId });
  assert.equal(after.enabled, true);
  assert.equal(typeof after.updatedAt, 'string');
  await rejectsWith(call('getWeeklyPathClassroomSync', { classId: 'no-such-class' }), 'not-found');

  // listClassJoinCodes (Sign-in Access loads it with listSignInAccess): the
  // ACTIVE codes of the caller's own classes, in the real function's shape.
  const ownClass = store.get(`classes/${student.classId}`);
  assert.ok(ownClass, 'the fixture student\'s class exists');
  store.set('classJoinCodes/HARNESS-OWN', { active: true, classId: student.classId, className: 'Own class', classPeriod: '3' });
  store.set('classJoinCodes/HARNESS-OLD', { active: false, classId: student.classId, className: 'Own class', classPeriod: '3' });
  store.set('classes/harness-other-teacher', { name: 'Someone else\'s class', period: '9', teacherOfRecord: 'someone.else@example.test' });
  store.set('classJoinCodes/HARNESS-OTHER', { active: true, classId: 'harness-other-teacher', className: 'Someone else\'s class', classPeriod: '9' });
  store.set('classJoinCodes/HARNESS-NOCLASS', { active: true });
  const { codes } = await call('listClassJoinCodes', {});
  assert.deepEqual(codes.filter((entry) => entry.code.startsWith('HARNESS-')),
    [{ code: 'HARNESS-OWN', classId: student.classId, className: 'Own class', classPeriod: '3' }],
    'only the active code of a class the caller teaches; never another teacher\'s, never one with no class');

  // The student callables need a student session, as requireStudent does.
  await rejectsWith(call('getStudentWeeklyPathGoalSnapshot', { weekKey: '2026-09-28' }), 'permission-denied');
  globalThis.window.location.search = '?reset=1&as=student&studentId=910002';
  try {
    await rejectsWith(call('getStudentWeeklyPathGoalSnapshot', { weekKey: 'next week' }), 'invalid-argument');
    assert.deepEqual(await call('getStudentWeeklyPathGoalSnapshot', { weekKey: '2026-09-28' }), { success: true, goal: null });
    // reportStudentDeviceQueue keeps only a strictly newer report from a device.
    assert.equal((await call('reportStudentDeviceQueue', { deviceId: 'device-1', reportGeneration: 3, summary: { queued: 2 } })).applied, true);
    const stale = await call('reportStudentDeviceQueue', { deviceId: 'device-1', reportGeneration: 2, summary: { queued: 0 } });
    assert.equal(stale.ignored, true);
    assert.equal(store.get('studentDevicePersistenceReports/910002__device-1').queued, 2, 'the older report did not overwrite the newer one');
    await rejectsWith(call('reportStudentDeviceQueue', { deviceId: '///', summary: {} }), 'invalid-argument');
  } finally {
    globalThis.window.location.search = '?reset=1';
  }
});

// TT27: Google Classroom and three of the administrator's sections used to draw this harness's "no fake for the callable"
// banner where their content goes, so the accessibility scenes that open them audited an error. fakeAdminScreens.js answers
// what they read, over invented data, in the deployed callables' shapes; the one destructive callable only previews.
test('the Classroom and administrator screens read callables the harness answers, and the reset only previews', async () => {
  const functions = await loadFake('fakeFunctions.js', '?reset=1', 'adminScreens');
  const store = (await import('../browser/teacherWorkflow/fakeFirestore.js')).harnessStore;
  const { default: PATH_WEB_RELEASE } = await import('../../src/platform/path/pathRelease.js');
  const call = (name, data) => functions.httpsCallable(functions.getFunctions(), name)(data).then((result) => result.data);

  // The audit log: functions/index.js listAdminAuditLog's events, newest first, no more than the limit.
  const audit = await call('listAdminAuditLog', { limit: 2 });
  assert.equal(audit.events.length, 2);
  assert.deepEqual(Object.keys(audit.events[0]).sort(), ['action', 'actorEmail', 'createdAt', 'id', 'target']);
  assert.ok(Date.parse(audit.events[0].createdAt) > Date.parse(audit.events[1].createdAt), 'newest first');
  assert.ok((await call('listAdminAuditLog', {})).events.length > 2, 'and more than two when it is not limited');

  // The reset: a preview of what the harness holds; asked to delete, it refuses and the roster is still there.
  const roster = store.paths('grades/').filter((path) => path.split('/').length === 2 && path !== 'grades/test_connection').length;
  assert.ok(roster > 0, 'the fixture has a roster');
  const preview = await call('resetPreproductionTestData', { dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.studentRosterRecords, roster);
  assert.equal(preview.confirmationRequired, 'RESET TEST DATA');
  assert.equal(preview.lockConfirmationRequired, 'LOCK FOR PRODUCTION');
  assert.equal(preview.resetLocked, false);
  assert.ok(preview.preservedCollections.length > 0 && preview.collections.assignments === preview.assignments);
  await assert.rejects(
    call('resetPreproductionTestData', { dryRun: false, confirmation: 'RESET TEST DATA' }),
    (error) => error.code === 'functions/failed-precondition',
  );
  assert.equal(store.paths('grades/').filter((path) => path.split('/').length === 2 && path !== 'grades/test_connection').length, roster, 'nothing was deleted');

  // The Path screens compare the server's release with this browser bundle's: the same, so no mismatch is shown.
  const runtime = await call('getPathRuntimeStatus', {});
  assert.equal(runtime.release, PATH_WEB_RELEASE);
  assert.ok(runtime.bankCount > 0 && runtime.starterAvailable === true);
  const release = await call('getCoursePathReleaseStatusV2', {});
  assert.equal(release.status, 'current');
  assert.equal(release.activeReleaseId, release.deployed.releaseId);

  // A teacher who has not connected Google Classroom, with nothing published and no grade passback yet.
  assert.deepEqual(await call('getClassroomConnectionStatus', {}), { connected: false, needsReconnect: false, missingScopes: [] });
  assert.deepEqual(await call('listPublishedAssignments', {}), { links: [] });
  assert.deepEqual(await call('listClassroomGradeSyncs', {}), { syncs: [], pushQueue: { waiting: 0 } });
});

// Google Classroom once connected (the November build's section 6): a connected account loads its courses through
// listGoogleCourses, which the harness could not answer, so no scene audited the screen past "Not connected". The
// stand-in is off unless asked for, so every other journey meets the teacher it always did; asked for (the flag the
// accessibility scene sets before it opens the screen again, or `&classroom=connected`), the account is connected and
// its courses and the first course's mapping come back in the deployed callables' shapes.
test('Google Classroom, connected: off unless asked for; then the courses and a mapping, in the deployed shapes', async () => {
  const functions = await loadFake('fakeFunctions.js', '?reset=1', 'classroomConnected');
  const store = (await import('../browser/teacherWorkflow/fakeFirestore.js')).harnessStore;
  const call = (name, data) => functions.httpsCallable(functions.getFunctions(), name)(data).then((result) => result.data);

  // Not asked for: the teacher who has never connected, whose courses the server cannot read (a bare "internal").
  assert.equal((await call('getClassroomConnectionStatus', {})).connected, false);
  assert.deepEqual(await call('listClassroomCourseMappings', {}), { mappings: [] }, 'and a created assignment\'s Classroom post still needs a mapping');
  await assert.rejects(call('listGoogleCourses', {}), (error) => error.code === 'functions/internal');

  globalThis.window.__mmHarness.classroomConnected = true;
  try {
    assert.deepEqual(await call('getClassroomConnectionStatus', {}), { connected: true, needsReconnect: false, missingScopes: [] });
    // lib/classroom.js listCourses: each active course's id, name, section, room, state and link.
    const { courses } = await call('listGoogleCourses', {});
    assert.ok(courses.length >= 2, 'more than one course, so the screen has a choice to offer');
    for (const course of courses) {
      assert.deepEqual(Object.keys(course).sort(), ['alternateLink', 'courseState', 'id', 'name', 'room', 'section']);
      assert.equal(course.courseState, 'ACTIVE');
    }
    // functions/index.js classroomMappingResponse: the first course is mapped to a class the harness holds.
    const { mappings } = await call('listClassroomCourseMappings', {});
    assert.equal(mappings.length, 1);
    assert.deepEqual(Object.keys(mappings[0]).sort(), ['classId', 'className', 'classPeriod', 'courseId', 'courseName', 'courseSection', 'id', 'mappingId', 'updatedAtMillis']);
    assert.equal(mappings[0].courseId, courses[0].id);
    assert.equal(store.get(`classes/${mappings[0].classId}`)?.name, mappings[0].className);
  } finally {
    delete globalThis.window.__mmHarness.classroomConnected;
  }
  assert.equal((await call('getClassroomConnectionStatus', {})).connected, false, 'and off again once the flag is gone');
  globalThis.window.location.search = '?reset=1&classroom=connected';
  try {
    assert.equal((await call('getClassroomConnectionStatus', {})).connected, true, 'the address asks for it too');
    assert.ok((await call('listGoogleCourses', {})).courses.length >= 2);
  } finally {
    globalThis.window.location.search = '?reset=1';
  }
});

// Google Classroom's roster, after Import Roster (the November build's section 6): the screen reads the mapped course's
// students from Google and the links the teacher made before, which the harness could not answer, so no scene audited the
// roster table. Off unless asked for, as the courses are. Asked for, both come back in the deployed shapes, over invented
// accounts for the mapped class's own students and one student more; and the screen's own matching
// (classroomRosterMatching.js, against the roster the teacher's screens load) makes of them a row of every kind an ID-only
// roster can give: a link made before, names for the teacher to review, and a student no one matches.
test('Google Classroom, connected: the roster Import Roster reads, off unless asked for, then in the deployed shapes', async () => {
  const functions = await loadFake('fakeFunctions.js', '?reset=1', 'classroomRoster');
  const { buildRosterMatchPlan, studentsForClass } = await import('../../src/classroomRosterMatching.js');
  const call = (name, data) => functions.httpsCallable(functions.getFunctions(), name)(data).then((result) => result.data);
  const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error.code === `functions/${code}`, code);

  // Not asked for: the teacher who has never connected. Google cannot be read for them, and they never made a link.
  await rejectsWith(call('listClassroomStudents', { courseId: 'course-alg2-p3' }), 'internal');
  assert.deepEqual(await call('listClassroomRosterLinks', { courseId: 'course-alg2-p3' }), { links: [] });
  // As the server: a course is always named.
  await rejectsWith(call('listClassroomStudents', {}), 'invalid-argument');
  await rejectsWith(call('listClassroomRosterLinks', { courseId: ' ' }), 'invalid-argument');

  globalThis.window.__mmHarness.classroomConnected = true;
  try {
    const { courses } = await call('listGoogleCourses', {});
    const [mapping] = (await call('listClassroomCourseMappings', {})).mappings;
    const { students } = await call('listClassroomStudents', { courseId: mapping.courseId });
    // lib/classroom.js listStudents: each student's Google user id, name and email, one account each.
    assert.ok(students.length > 2);
    for (const student of students) {
      assert.deepEqual(Object.keys(student).sort(), ['email', 'googleUserId', 'name']);
      assert.ok(student.googleUserId && student.name && /@students\.example$/.test(student.email), 'an invented account');
    }
    assert.equal(new Set(students.map((student) => student.googleUserId)).size, students.length);
    // functions/index.js listClassroomRosterLinks: the course's links, each in the shape it returns.
    const { links } = await call('listClassroomRosterLinks', { courseId: mapping.courseId });
    assert.equal(links.length, 1, 'one link made before');
    assert.deepEqual(Object.keys(links[0]).sort(), ['classId', 'courseId', 'email', 'googleUserId', 'name', 'rosterLinkId', 'studentId']);
    assert.equal(links[0].courseId, mapping.courseId);
    assert.equal(links[0].classId, mapping.classId);

    // What the table draws: the screen matches the Google roster against the mapped class's students, from the roster
    // the teacher's screens load (listSignInAccess), and a row with a link shows the link.
    const roster = await call('listSignInAccess', {});
    const classStudents = studentsForClass(roster.students.map((row) => ({ ...row, id: row.studentId })), roster.classes.find((entry) => entry.classId === mapping.classId), roster.classes);
    assert.ok(classStudents.length > 1, 'the mapped class has students');
    const plan = buildRosterMatchPlan({ classroomStudents: students, mathMasterStudents: classStudents });
    const linkFor = new Map(links.map((link) => [link.googleUserId, link]));
    const kinds = plan.map((item) => (linkFor.has(item.classroomStudent.googleUserId) ? 'linked' : item.status));
    assert.deepEqual(
      Object.fromEntries([...new Set(kinds)].map((kind) => [kind, kinds.filter((entry) => entry === kind).length])),
      { linked: 1, 'exact-name': classStudents.length - 1, unmatched: 1 },
      'the link made before, every other student of the class by name, and the one student more by nothing',
    );
    const linkedRow = plan.find((item) => linkFor.has(item.classroomStudent.googleUserId));
    assert.equal(linkedRow.suggestedStudent?.id, links[0].studentId, 'the link made before is to the student of that name');
    // The two Algebra I sections have no roster or link, and a course the account does not teach cannot be read.
    for (const other of courses.filter((course) => course.id !== mapping.courseId)) {
      assert.deepEqual(await call('listClassroomStudents', { courseId: other.id }), { students: [] });
      assert.deepEqual(await call('listClassroomRosterLinks', { courseId: other.id }), { links: [] });
    }
    await rejectsWith(call('listClassroomStudents', { courseId: 'course-not-taught' }), 'internal');
  } finally {
    delete globalThis.window.__mmHarness.classroomConnected;
  }
  await rejectsWith(call('listClassroomStudents', { courseId: 'course-alg2-p3' }), 'internal');
  assert.deepEqual(await call('listClassroomRosterLinks', { courseId: 'course-alg2-p3' }), { links: [] }, 'and off again once the flag is gone');
});

// Linking the roster (the November build's section 6): the roster's buttons ("Confirm link", "Change link", "Link unique
// suggestions") send linkClassroomRosterBatch, which the harness could not answer, so no scene pressed one. Off unless
// asked for, as the rest of the connected screen is. Asked for, it refuses what the server refuses, links as the server
// links (one Google student, one MathMaster ID in a course), and the links read afterwards are the ones the screen draws.
test('Google Classroom, connected: linking the roster, off unless asked for, then as the server links', async () => {
  const functions = await loadFake('fakeFunctions.js', '?reset=1', 'classroomRosterLinking');
  const store = (await import('../browser/teacherWorkflow/fakeFirestore.js')).harnessStore;
  const { buildRosterMatchPlan, studentsForClass } = await import('../../src/classroomRosterMatching.js');
  const call = (name, data) => functions.httpsCallable(functions.getFunctions(), name)(data).then((result) => result.data);
  const rejectsWith = (promise, code, message = code) => assert.rejects(promise, (error) => error.code === `functions/${code}`, message);
  const COURSE = 'course-alg2-p3';
  const CLASS = 'c-alg2-p3';
  const linkPaths = () => store.paths('classroomRosterLinks/');
  const before = linkPaths();
  const link = (links, courseId = COURSE, classId = CLASS) => call('linkClassroomRosterBatch', { courseId, classId, links });
  const pairs = (links) => links.map((entry) => `${entry.studentId}~${entry.googleUserId}`).sort();

  // Not asked for: the teacher who never connected has no course mapped to the class, and the server refuses a link then.
  await rejectsWith(link([{ studentId: '910002', googleUserId: 'g-1' }]), 'failed-precondition');
  assert.deepEqual(linkPaths(), before, 'and writes nothing');

  globalThis.window.__mmHarness.classroomConnected = true;
  try {
    const { students } = await call('listClassroomStudents', { courseId: COURSE });
    const { links: [madeBefore] } = await call('listClassroomRosterLinks', { courseId: COURSE });
    const roster = await call('listSignInAccess', {});
    const classStudents = studentsForClass(roster.students.map((row) => ({ ...row, id: row.studentId })), roster.classes.find((entry) => entry.classId === CLASS), roster.classes);
    const plan = buildRosterMatchPlan({ classroomStudents: students, mathMasterStudents: classStudents });
    const asRow = ({ classroomStudent, suggestedStudent }) => ({ studentId: String(suggestedStudent.id), googleUserId: classroomStudent.googleUserId, email: classroomStudent.email, name: classroomStudent.name });
    const second = asRow(plan[1]);
    const third = asRow(plan[2]);
    const elsewhere = roster.students.find((row) => row.classId && row.classId !== CLASS).studentId;

    // As the server refuses: no course, class or link; more than 200 at once; a course not mapped to that class; a
    // student MathMaster does not have, or one of another class. A refused batch writes nothing.
    await rejectsWith(link([]), 'invalid-argument');
    await rejectsWith(link([second], ''), 'invalid-argument');
    await rejectsWith(link(Array.from({ length: 201 }, () => second)), 'invalid-argument', 'at most 200');
    await rejectsWith(link([second], 'course-alg1-p1', 'c-alg1-p1'), 'failed-precondition', 'a course with no mapping');
    await rejectsWith(link([second], COURSE, 'c-lab-p3'), 'failed-precondition', 'a course mapped to another class');
    await rejectsWith(link([second, { ...third, studentId: 'not-a-student' }]), 'not-found');
    await rejectsWith(link([second, { ...third, studentId: elsewhere }]), 'failed-precondition', 'a student of another class');
    assert.deepEqual(linkPaths(), before, 'and nothing was written');

    // A row's "Confirm link": the second Google student, to the MathMaster student of that name. Again: the same link.
    assert.deepEqual(await link([second]), { linked: 1, replaced: 0 });
    assert.deepEqual(await link([second]), { linked: 1, replaced: 0 });
    let { links } = await call('listClassroomRosterLinks', { courseId: COURSE });
    assert.deepEqual(pairs(links), pairs([madeBefore, second]), 'the link made before, and the new one');
    for (const entry of links) {
      assert.deepEqual(Object.keys(entry).sort(), ['classId', 'courseId', 'email', 'googleUserId', 'name', 'rosterLinkId', 'studentId'], 'the shape listClassroomRosterLinks returns');
      assert.equal(entry.courseId, COURSE);
      assert.equal(entry.classId, CLASS);
    }
    // What the table draws: both rows linked, every other name still to review, the one student more matched by no one.
    const linkFor = new Map(links.map((entry) => [entry.googleUserId, entry]));
    const kinds = plan.map((item) => (linkFor.get(item.classroomStudent.googleUserId)?.studentId === String(item.suggestedStudent?.id) ? 'linked' : item.status));
    assert.deepEqual(kinds.filter((kind) => kind === 'linked').length, 2);
    assert.deepEqual(kinds.filter((kind) => kind === 'unmatched').length, 1);

    // One Google student owns one MathMaster ID in a course: "Change link" gives the first one another ID, and the link
    // made before gives way to it.
    assert.deepEqual(await link([{ ...third, googleUserId: madeBefore.googleUserId }]), { linked: 1, replaced: 1 });
    ({ links } = await call('listClassroomRosterLinks', { courseId: COURSE }));
    assert.deepEqual(pairs(links), pairs([second, { ...third, googleUserId: madeBefore.googleUserId }]));
    // The two Algebra I sections have no links, and none is made there.
    assert.deepEqual(await call('listClassroomRosterLinks', { courseId: 'course-alg1-p1' }), { links: [] });
  } finally {
    delete globalThis.window.__mmHarness.classroomConnected;
  }
  assert.deepEqual(await call('listClassroomRosterLinks', { courseId: COURSE }), { links: [] }, 'off again once the flag is gone');
  await rejectsWith(link([{ studentId: '910002', googleUserId: 'g-1' }]), 'failed-precondition');
  // The store as this test found it, for the tests after it.
  linkPaths().filter((path) => !before.includes(path)).forEach((path) => store.remove(path));
});

// Every name the app imports from a Firebase module, from every file under src/.
const appImports = (moduleName) => {
  const names = new Set();
  const walk = (dir) => readdirSync(dir).forEach((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    if (!/\.(js|jsx|mjs)$/.test(entry)) return;
    const pattern = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${moduleName.replace('/', '\\/')}['"]`, 'g');
    for (const match of readFileSync(full, 'utf8').matchAll(pattern)) {
      match[1].split(',').map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((name) => names.add(name));
    }
  });
  walk(path.join(ROOT, 'src'));
  return [...names].sort();
};

test('the fakes export everything the app imports from Firebase', async () => {
  const fakes = {
    'firebase/firestore': fs,
    'firebase/functions': await loadFake('fakeFunctions.js', '?reset=1', 'exports'),
    'firebase/auth': await loadFake('fakeAuth.js', '?reset=1', 'exports'),
    'firebase/app': await loadFake('fakeApp.js', '?reset=1', 'exports'),
  };
  Object.entries(fakes).forEach(([moduleName, fake]) => {
    const imported = appImports(moduleName);
    assert.ok(imported.length > 0, `the app imports from ${moduleName}`);
    const missing = imported.filter((name) => !(name in fake));
    assert.deepEqual(missing, [], `${moduleName}: the harness fake must export what the app imports`);
  });
  // The app's queries use none of these; the fake does not pretend to.
  ['startAfter', 'documentId', 'collectionGroup'].forEach((name) => {
    assert.equal(appImports('firebase/firestore').includes(name), false, `${name} is imported by the app now: add it to fakeFirestore.js`);
  });
  assert.ok(readFileSync(path.join(FAKES, 'vite.config.mjs'), 'utf8').includes("replacement: path.join(here, 'fakeFirestore.js')"));
});
