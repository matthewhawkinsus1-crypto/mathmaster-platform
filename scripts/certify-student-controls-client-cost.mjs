// WHAT EACH DEVICE'S LISTENERS RECEIVE — STUDENTS' CONTROLS, MIRRORED AND RETIRED.
//
// Runs the REAL client modules the app runs, as one Firestore client per
// device, under the REAL firestore.rules, against the emulator:
//
//   * every student of a class of 30, and of 60: the class lessons listener
//     (studentAssignmentScope.js) and the one own-controls listener
//     (studentAssignmentControls.js), projected as the app projects them
//     (projectStudentAssignments);
//   * their teacher: the assignments listener App.jsx keeps (unchanged here)
//     and the one class-scoped controls listener (teacherClassControls.js),
//     re-opened only when its scope key changes, as useTeacherClassControls
//     does.
//
// The server side (the callables a teacher's change goes through) runs
// in-process with the Admin SDK. For each class size, while the shared copy is
// still mirrored and after it is retired and stripped, it measures:
//
//   * active listeners per device, and that none is left open at the end;
//   * initial reads and bytes per device;
//   * reads and bytes across EVERY device when one student's extension
//     changes, and when one student's DOL attempt is granted — and whether
//     the whole lesson was sent again;
//   * what each student's app holds (bytes, and classmates' controls: none)
//     next to what Firestore delivered to it;
//   * the teacher switching classes (ten times), opening a cross-class view,
//     and switching assignments (twenty times);
//   * a student signing out and the next student signing in on that device,
//     and the teacher signing out.
//
// Reads are counted as Firestore bills a listener: each document a snapshot
// adds or changes, and one for an empty first result. Bytes are the JSON size
// of those documents (proportional to the wire size, not equal to it).
//
// HOW TO RUN (an isolated emulator project; nothing reaches a real project):
//
//   npx firebase emulators:exec --only firestore --project mathmaster-controls-client-cost \
//     --config tests/browser/emulator/firebase.json \
//     "node --expose-gc scripts/certify-student-controls-client-cost.mjs"
//
// (`--expose-gc` lets the heap figure — Node's heap per simulated device,
// indicative only — be taken after a collection.)
//
// `--students 30,60` (the default) chooses the class sizes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, onSnapshot } from 'firebase/firestore';

import { db as adminDb, fns, teacherRequest } from '../tests/integration/canonicalPersistenceHarness.mjs';
import { subscribeStudentClassAssignments } from '../src/platform/assignments/studentAssignmentScope.js';
import {
  EMPTY_STUDENT_CONTROLS,
  STUDENT_CONTROLS_STATUS,
  projectStudentAssignments,
  subscribeStudentAssignmentControls,
} from '../src/platform/assignments/studentAssignmentControls.js';
import { STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION } from '../functions/shared/studentAssignmentOverrides.mjs';
import {
  decodeTeacherControlsScope,
  subscribeTeacherClassControls,
  teacherControlsClassIds,
  teacherControlsScopeKey,
} from '../src/platform/teacher/teacherClassControls.js';
import { DAY, bytes, costLesson, legacyControls, withControls } from './lib/studentControlsCostFixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { ROOT_ADMIN_EMAIL } = require(path.join(here, '../functions/shared/rolePolicyIdentity.cjs'));
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run this through firebase emulators:exec — never against a real project.');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const projectId = process.env.GCLOUD_PROJECT;
assert.ok(projectId, 'emulators:exec sets GCLOUD_PROJECT.');

const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const classSizes = argValue('--students', '30,60').split(',').map(Number).filter((n) => n > 0);
const rules = await readFile(path.join(here, '../firestore.rules'), 'utf8');

const NOW = Date.now();
const TEACHER = 'client.cost.teacher@desotoisd.org';
const STRIP_CONFIRMATION = 'STRIP SHARED COPIES';
const rootRequest = (data) => ({
  auth: { uid: 'client-cost-root', token: { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN_EMAIL, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* --- metering a device's listeners --------------------------------------- */

let lastEventAt = Date.now();

const newMeter = () => ({ open: 0, opened: 0, firstSnapshots: 0, reads: 0, bytes: 0, lessonDocs: 0, controlDocs: 0, held: new Map(), errors: [] });

const resetCounts = (meter) => Object.assign(meter, { reads: 0, bytes: 0, lessonDocs: 0, controlDocs: 0 });

/** Firestore's onSnapshot, counting what one device's listeners receive. */
const meteredListen = (meter) => (target, next, onError) => {
  meter.open += 1;
  meter.opened += 1;
  let first = true;
  const stop = onSnapshot(target, (snapshot) => {
    const changes = snapshot.docChanges();
    const delivered = changes.filter((change) => change.type !== 'removed');
    meter.reads += delivered.length || (first ? 1 : 0);
    delivered.forEach((change) => {
      const data = change.doc.data();
      meter.bytes += bytes(data);
      if (change.doc.ref.path.startsWith('assignments/')) meter.lessonDocs += 1;
      else meter.controlDocs += 1;
      meter.held.set(change.doc.ref.path, data);
    });
    changes.filter((change) => change.type === 'removed').forEach((change) => meter.held.delete(change.doc.ref.path));
    if (first) meter.firstSnapshots += 1;
    first = false;
    lastEventAt = Date.now();
    next(snapshot);
  }, (error) => {
    meter.errors.push(String(error?.code || error));
    lastEventAt = Date.now();
    onError?.(error);
  });
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    meter.open -= 1;
    stop();
  };
};

const waitFor = async (condition, label, maxMs = 30_000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > maxMs) throw new Error(`Timed out waiting for ${label}`);
    // eslint-disable-next-line no-await-in-loop
    await sleep(50);
  }
};

/** Until no listener has heard anything for `quietMs`. */
const settle = async (quietMs = 800, maxMs = 30_000) => {
  const start = Date.now();
  lastEventAt = Math.max(lastEventAt, Date.now());
  while (Date.now() - start < maxMs) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
    if (Date.now() - lastEventAt >= quietMs) return;
  }
};

/* --- devices -------------------------------------------------------------- */

const openStudentDevice = (env, studentId, classId) => {
  const firestore = env.authenticatedContext(`uid-${studentId}`, { role: 'student', studentId }).firestore();
  const meter = newMeter();
  const device = { studentId, classId, meter, lessons: [], controls: EMPTY_STUDENT_CONTROLS, stops: [] };
  device.stops.push(subscribeStudentClassAssignments({
    db: firestore, studentId, classId, listen: meteredListen(meter),
    onChange: (lessons) => { device.lessons = lessons; },
  }));
  device.stops.push(subscribeStudentAssignmentControls({
    db: firestore, studentId, listen: meteredListen(meter),
    onChange: ({ byAssignmentId, fromCache }) => {
      device.controls = { ownerId: studentId, status: STUDENT_CONTROLS_STATUS.READY, byAssignmentId, fromCache };
    },
  }));
  // What the app renders from: App.jsx publishes exactly this projection.
  device.appState = () => projectStudentAssignments({ assignments: device.lessons, studentId, controls: device.controls });
  device.signOut = () => {
    device.stops.forEach((stop) => stop());
    device.stops = [];
    device.lessons = [];
    device.controls = EMPTY_STUDENT_CONTROLS;
  };
  return device;
};

const openTeacherDevice = (env, email) => {
  const firestore = env.authenticatedContext(`uid-${email}`, { role: 'teacher', email, email_verified: true }).firestore();
  const meter = newMeter();
  const device = { meter, assignments: [], controls: null, scopeKey: '', scopesOpened: 0, stops: {} };
  // The assignments listener App.jsx keeps for teachers (not changed by this release).
  device.stops.assignments = meteredListen(meter)(collection(firestore, 'assignments'), (snapshot) => {
    device.assignments = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  });
  // useTeacherClassControls: one listener, re-opened only when the scope key changes.
  device.setScope = (classIds) => {
    const key = teacherControlsScopeKey({ email, classIds });
    if (key === device.scopeKey) return false;
    device.stops.controls?.();
    device.scopeKey = key;
    device.scopesOpened += 1;
    device.stops.controls = subscribeTeacherClassControls({
      db: firestore, scopeKey: key, listen: meteredListen(meter),
      onChange: (controls) => { device.controls = controls; },
    });
    return true;
  };
  device.signOut = () => {
    Object.values(device.stops).forEach((stop) => stop?.());
    device.stops = {};
    device.scopeKey = '';
  };
  return device;
};

/** Everything a scenario wrote, so the next one's teacher listener starts from the same school. */
const removeScenario = async (p) => {
  const inRange = (ref, field = null) => {
    const base = field ? ref.where(field, '>=', p).where(field, '<', `${p}~`) : ref.orderBy('__name__').startAt(p).endAt(`${p}~`);
    return base.get();
  };
  const [lessons, records, grades, classes] = await Promise.all([
    inRange(adminDb.collection('assignments')),
    inRange(adminDb.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION), 'assignmentId'),
    inRange(adminDb.collection('grades')),
    inRange(adminDb.collection('classes')),
  ]);
  await Promise.all([
    ...lessons.docs.map((doc) => doc.ref.delete()),
    ...records.docs.map((doc) => doc.ref.delete()),
    ...classes.docs.map((doc) => doc.ref.delete()),
    ...grades.docs.map((doc) => adminDb.recursiveDelete(doc.ref)),
  ]);
};

const average = (values) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);
const total = (devices, key) => devices.reduce((sum, device) => sum + device.meter[key], 0);

/* --- one class size, one storage mode ------------------------------------ */

const scenario = async (classSize, mode) => {
  const p = `cc-${classSize}-${mode.slice(0, 1)}`;
  const classes = ['a', 'b', 'c', 'd'].map((letter) => `${p}-class-${letter}`);
  const [classA, classB] = classes;
  const rosterOf = (classId, size) => Array.from({ length: size }, (_, n) => `${classId}-s${String(n).padStart(2, '0')}`);
  const rosters = Object.fromEntries(classes.map((classId, index) => [classId, rosterOf(classId, index < 2 ? classSize : 10)]));
  const lessonsOf = (classId) => [`${classId}-closed`, `${classId}-open-1`, `${classId}-open-2`];

  await adminDb.collection('platformFlags').doc('assignmentOverrideStorage').set({ sharedRetired: false });
  const seed = adminDb.batch();
  classes.forEach((classId) => {
    seed.set(adminDb.collection('classes').doc(classId), { name: classId, period: 'Period 1', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
    rosters[classId].forEach((id) => seed.set(adminDb.collection('grades').doc(id), {
      displayName: id, classId, classPeriod: 'Period 1', assignedTeacherEmail: TEACHER, status: 'active', gradesByAssignment: {},
    }));
  });
  await seed.commit();
  const lessons = adminDb.batch();
  classes.forEach((classId) => {
    const controls = legacyControls(rosters[classId], { now: NOW });
    lessonsOf(classId).forEach((id) => lessons.set(
      adminDb.collection('assignments').doc(id),
      withControls(costLesson(id, classId, { closed: id.endsWith('-closed'), now: NOW }), controls),
    ));
  });
  await lessons.commit();
  await fns.migrateStudentAssignmentOverrides.run(rootRequest({ mode: 'backfill', dryRun: false, assignmentIdPrefix: p }));
  if (mode === 'retired') {
    // The gate is the operator's (rehearse-student-assignment-overrides-migration.mjs):
    // here the switch is set directly, then the strip runs as the card runs it.
    await adminDb.collection('platformFlags').doc('assignmentOverrideStorage').set({ sharedRetired: true });
    await fns.migrateStudentAssignmentOverrides.run(rootRequest({ mode: 'strip', assignmentIdPrefix: p }));
    const strip = await fns.migrateStudentAssignmentOverrides.run(rootRequest({ mode: 'strip', dryRun: false, confirm: STRIP_CONFIRMATION, assignmentIdPrefix: p }));
    assert.deepEqual(strip.failures, []);
  }

  const env = await initializeTestEnvironment({ projectId, firestore: { rules, host, port: Number(port) } });
  globalThis.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const students = rosters[classA].map((studentId) => openStudentDevice(env, studentId, classA));
  const teacher = openTeacherDevice(env, TEACHER);
  teacher.setScope(teacherControlsClassIds({ activeClassId: classA, taughtClassIds: classes }));
  const everyone = [...students, teacher];
  await waitFor(() => everyone.every((device) => device.meter.firstSnapshots >= device.meter.opened), 'every listener\'s first snapshot');
  await settle();
  globalThis.gc?.();
  const heapAfter = process.memoryUsage().heapUsed;
  everyone.forEach((device) => assert.deepEqual(device.meter.errors, [], 'the real rules allow every listener the app opens'));

  /* initial */
  const classmateIds = new Set(rosters[classA]);
  const classmatesIn = (value, self) => [...classmateIds].filter((id) => id !== self && JSON.stringify(value).includes(`"${id}"`)).length;
  const appStates = students.map((device) => device.appState());
  students.forEach((device, index) => {
    assert.equal(device.meter.open, 2, `${device.studentId}: the class lessons and their own controls — two listeners`);
    assert.equal(classmatesIn(appStates[index], device.studentId), 0, `${device.studentId}'s app holds no classmate's controls`);
  });
  assert.equal(teacher.meter.open, 2, 'the teacher: assignments and ONE controls listener');
  const initial = {
    student: {
      listeners: 2,
      reads: average(students.map((device) => device.meter.reads)),
      bytes: average(students.map((device) => device.meter.bytes)),
      appStateBytes: average(appStates.map(bytes)),
      firestoreHeldBytes: average(students.map((device) => bytes([...device.meter.held.values()]))),
      classmatesInWhatFirestoreDelivered: average(students.map((device) => classmatesIn([...device.meter.held.values()], device.studentId))),
      classmatesInAppState: 0,
    },
    teacher: {
      listeners: teacher.meter.open,
      reads: teacher.meter.reads,
      bytes: teacher.meter.bytes,
      controlRecordsHeld: teacher.controls?.recordCount ?? 0,
      classesInScope: decodeTeacherControlsScope(teacher.scopeKey).classIds.length,
      classesTaught: classes.length,
    },
    heapPerDeviceKB: globalThis.gc ? Math.round((heapAfter - heapBefore) / 1024 / everyone.length) : null,
  };

  /* one student's extension changes */
  const fanOut = async (label, change) => {
    everyone.forEach((device) => resetCounts(device.meter));
    await change();
    await settle();
    return {
      label,
      reads: total(everyone, 'reads'),
      bytes: total(everyone, 'bytes'),
      lessonDocumentsSentAgain: total(everyone, 'lessonDocs'),
      controlRecordsSent: total(everyone, 'controlDocs'),
      devicesThatHeardIt: everyone.filter((device) => device.meter.reads > 0).length,
    };
  };
  const extended = rosters[classA][Math.floor(classSize / 2)];
  const extension = await fanOut('one student\'s attendance extension', () => fns.applyStudentAttendanceExtension.run(teacherRequest({
    classId: classA, studentId: extended, assignmentId: `${classA}-closed`, proposedLateDueAtMs: NOW + 3 * DAY, extension: { dateKey: '2026-10-07' },
  }, TEACHER)));
  const extendedDevice = students.find((device) => device.studentId === extended);
  const seen = extendedDevice.appState().find((lesson) => lesson.id === `${classA}-closed`);
  assert.equal(seen.studentOverrides?.[extended]?.lateDueAt, new Date(NOW + 3 * DAY).toISOString(), 'the student\'s own device learned of it');
  const granted = rosters[classA][Math.floor(classSize / 2) + 1];
  const dolGrant = await fanOut('one student\'s extra DOL attempt', () => fns.setStudentAssignmentControls.run(teacherRequest({
    assignmentId: `${classA}-open-1`, classId: classA, studentIds: [granted], change: { kind: 'dolAttempts', increment: 1 },
  }, TEACHER)));
  if (mode === 'retired') {
    assert.equal(extension.lessonDocumentsSentAgain, 0, 'retired: the lesson is not sent again to anyone');
    assert.equal(dolGrant.lessonDocumentsSentAgain, 0);
  }

  /* the teacher moves around */
  resetCounts(teacher.meter);
  const switches = [];
  for (let n = 0; n < 10; n += 1) {
    const target = n % 2 === 0 ? classB : classA;
    resetCounts(teacher.meter);
    teacher.setScope(teacherControlsClassIds({ activeClassId: target, taughtClassIds: classes }));
    // eslint-disable-next-line no-await-in-loop
    await waitFor(() => teacher.meter.firstSnapshots >= teacher.meter.opened, 'the switched scope');
    // eslint-disable-next-line no-await-in-loop
    await settle(300);
    assert.equal(teacher.meter.open, 2, 'never more than one controls listener');
    switches.push(teacher.meter.reads);
  }
  resetCounts(teacher.meter);
  teacher.setScope(teacherControlsClassIds({ activeClassId: classA, crossClassTab: 'gradeTransfer', taughtClassIds: classes }));
  await waitFor(() => teacher.meter.firstSnapshots >= teacher.meter.opened, 'the cross-class scope');
  await settle(300);
  const crossClass = { reads: teacher.meter.reads, listeners: teacher.meter.open, classes: classes.length };
  teacher.setScope(teacherControlsClassIds({ activeClassId: classA, taughtClassIds: classes }));
  await waitFor(() => teacher.meter.firstSnapshots >= teacher.meter.opened, 'back to the class');
  await settle(300);
  const openedBefore = teacher.meter.opened;
  resetCounts(teacher.meter);
  for (let n = 0; n < 20; n += 1) {
    // Choosing another assignment in the same class changes nothing the scope is made of.
    teacher.setScope(teacherControlsClassIds({ activeClassId: classA, taughtClassIds: classes }));
  }
  await settle(300);
  const assignmentSwitching = { switches: 20, listenersOpened: teacher.meter.opened - openedBefore, reads: teacher.meter.reads };

  /* sign-out / sign-in on one device */
  const leaving = extendedDevice;
  leaving.signOut();
  assert.equal(leaving.meter.open, 0, 'signing out closes both listeners');
  const arriving = openStudentDevice(env, rosters[classA].find((id) => id !== extended), classA);
  await waitFor(() => arriving.meter.firstSnapshots >= arriving.meter.opened, 'the next student\'s listeners');
  await settle(300);
  const arrivingState = arriving.appState();
  assert.equal(JSON.stringify(arrivingState).includes(`"${extended}"`), false, 'the next student holds none of the previous student\'s controls');
  const signInOut = {
    afterSignOut: { listeners: leaving.meter.open },
    nextStudent: { listeners: arriving.meter.open, reads: arriving.meter.reads, bytes: arriving.meter.bytes },
  };
  teacher.signOut();
  assert.equal(teacher.meter.open, 0, 'the teacher signing out closes every listener');
  [...students, arriving].forEach((device) => device.signOut());
  assert.equal([...students, arriving, teacher].every((device) => device.meter.open === 0), true, 'no listener left open');
  await env.cleanup();
  await removeScenario(p);

  return {
    classSize,
    mode,
    initial,
    oneStudentsChange: [extension, dolGrant],
    teacherClassSwitching: { switches: switches.length, readsPerSwitch: switches, maxControlsListeners: 1 },
    teacherCrossClassView: crossClass,
    teacherAssignmentSwitching: assignmentSwitching,
    signOutSignIn: signInOut,
  };
};

const results = [];
for (const classSize of classSizes) {
  for (const mode of ['mirror', 'retired']) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await scenario(classSize, mode));
  }
}
await adminDb.collection('platformFlags').doc('assignmentOverrideStorage').set({ sharedRetired: false });

const table = results.map((result) => {
  const [extension, dol] = result.oneStudentsChange;
  return [
    `${result.classSize} students, ${result.mode}:`,
    `student listeners ${result.initial.student.listeners}, initial reads ${result.initial.student.reads} (${Math.round(result.initial.student.bytes / 1024)} KB),`,
    `app holds ${Math.round(result.initial.student.appStateBytes / 1024)} KB with 0 classmates (Firestore delivered ${result.initial.student.classmatesInWhatFirestoreDelivered});`,
    `teacher listeners ${result.initial.teacher.listeners}, initial reads ${result.initial.teacher.reads};`,
    `one extension → ${extension.reads} reads / ${Math.round(extension.bytes / 1024)} KB across ${extension.devicesThatHeardIt} devices (lesson re-sent ${extension.lessonDocumentsSentAgain}×);`,
    `one DOL grant → ${dol.reads} reads / ${Math.round(dol.bytes / 1024)} KB (lesson re-sent ${dol.lessonDocumentsSentAgain}×);`,
    `class switch reads ${result.teacherClassSwitching.readsPerSwitch.join('/')}; assignment switches opened ${result.teacherAssignmentSwitching.listenersOpened} listeners.`,
  ].join(' ');
});
console.log(JSON.stringify({ projectId, results, summary: table }, null, 2));
process.exit(0);
