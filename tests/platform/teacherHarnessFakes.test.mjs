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
