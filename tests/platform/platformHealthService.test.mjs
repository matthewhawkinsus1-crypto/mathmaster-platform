/*
 * THE SERVER'S SIDE OF CRASH REPORTING (functions/lib/platformHealth.js).
 *
 * What these protect:
 *   - off is off: no read beyond the cached flag, no write, whatever is sent;
 *   - a request is rebuilt from closed shapes, so a hand-built one stores
 *     nothing the app could not have sent;
 *   - one account is bounded per day in requests, buckets and count, and
 *     "reporters" counts accounts, not crashes;
 *   - a day's document is bounded; retention deletes; purge deletes all;
 *   - the stored record names no account.
 * An in-memory Firestore stand-in that counts reads and writes. Synthetic
 * identities only.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { CRASH_REPORT_LIMITS, crashBucketId, normalizeCrashBucket } from '../../functions/shared/crashReport.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { functionsBackendSource, topLevelDeclaration } from './helpers/functionsBackendSource.mjs';

const require = createRequire(import.meta.url);
const { createPlatformHealthService } = require('../../functions/lib/platformHealth.js');

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const fakeDb = () => {
  const docs = new Map(); // "collection/id" -> data
  const cost = { reads: 0, writes: 0, deletes: 0 };
  const snap = (path) => ({ exists: docs.has(path), data: () => structuredClone(docs.get(path)), id: path.split('/')[1], ref: { path } });
  const ref = (name, id) => ({
    path: `${name}/${id}`,
    get: async () => { cost.reads += 1; return snap(`${name}/${id}`); },
    set: async (data) => { cost.writes += 1; docs.set(`${name}/${id}`, structuredClone(data)); },
  });
  const queryOf = (name, filters = [], max = Infinity) => ({
    where: (field, op, value) => { assert.equal(op, '<'); return queryOf(name, [...filters, [field, value]], max); },
    limit: (count) => queryOf(name, filters, count),
    doc: (id) => ref(name, id),
    get: async () => {
      const found = [...docs.keys()].filter((path) => path.startsWith(`${name}/`) && filters.every(([field, value]) => docs.get(path)[field] < value)).slice(0, max);
      cost.reads += Math.max(found.length, 1);
      return { empty: !found.length, size: found.length, docs: found.map(snap) };
    },
  });
  return {
    docs, cost,
    collection: (name) => queryOf(name),
    runTransaction: async (work) => work({
      get: async (target) => { cost.reads += 1; return snap(target.path); },
      set: (target, data) => { cost.writes += 1; docs.set(target.path, structuredClone(data)); },
    }),
    batch: () => {
      const pending = [];
      return { delete: (target) => pending.push(target.path), commit: async () => { pending.forEach((path) => { cost.deletes += 1; docs.delete(path); }); } };
    },
  };
};

const setup = ({ mode } = {}) => {
  const db = fakeDb();
  if (mode) db.docs.set('platformFlags/crashReporting', { mode });
  const clock = { now: Date.parse('2026-11-16T15:30:00Z') };
  const service = createPlatformHealthService({ db, HttpsError, now: () => clock.now });
  return { db, clock, service };
};
const student = (uid, data) => ({ auth: { uid, token: { role: 'student', studentId: `S_${uid}` } }, data });
const teacher = (uid, data) => ({ auth: { uid, token: { role: 'teacher', email: `${uid}@example.test` } }, data });
const bucket = (overrides = {}) => ({
  build: 'bad3df73a1b2', kind: 'question-module-error', source: 'question', screen: '/assignments/:id/:id/:id',
  family: 'radical-step', questionType: 'StepByStepAlgebra', signature: '_ is not a function', count: 1, ...overrides,
});
const daily = (db) => db.docs.get('platformHealthDaily/2026-11-16');

test('signed out is refused', async () => {
  const { service } = setup({ mode: 'family' });
  await assert.rejects(service.report({ auth: null, data: {} }), (error) => error.code === 'unauthenticated');
});

test('off by default: a missing flag is off, and off writes nothing and reads only the flag, once', async () => {
  for (const mode of [undefined, 'off', 'everything']) {
    const { db, service } = setup({ mode });
    for (let index = 0; index < 50; index += 1) {
      assert.deepEqual(await service.report(student(`u${index}`, { v: 1, buckets: [bucket()] })), { mode: 'off', accepted: 0 });
    }
    assert.equal(db.cost.writes, 0);
    assert.equal(db.cost.reads, 1, 'the flag is cached: fifty requests, one read');
    assert.equal(daily(db), undefined);
  }
});

test('a probe answers the mode and stores nothing, even with reporting on', async () => {
  const { db, service } = setup({ mode: 'question' });
  assert.deepEqual(await service.report(student('u1', { probe: true, buckets: [bucket()] })), { mode: 'question', accepted: 0 });
  assert.equal(db.cost.writes, 0);
});

test('one report is three reads and two writes, and counts into the day', async () => {
  const { db, service } = setup({ mode: 'family' });
  await service.currentMode();
  const before = { ...db.cost };
  assert.deepEqual(await service.report(student('u1', { v: 1, buckets: [bucket({ count: 3 })] })), { mode: 'family', accepted: 1 });
  assert.equal(db.cost.reads - before.reads, 3, 'the switch, the day, the account limit');
  assert.equal(db.cost.writes - before.writes, 2);
  const day = daily(db);
  assert.equal(day.total, 3);
  const [stored] = Object.values(day.buckets);
  assert.deepEqual(stored, { ...bucket(), role: 'student', count: 3, reporters: 1, firstHour: 15, lastHour: 15 });
  assert.equal(Object.keys(day.buckets)[0], crashBucketId(normalizeCrashBucket(bucket(), { mode: 'family' })));
});

test('reporters counts accounts, not crashes; the role comes from the sign-in', async () => {
  const { db, service, clock } = setup({ mode: 'family' });
  await service.report(student('u1', { buckets: [bucket({ count: 5 })] }));
  await service.report(student('u1', { buckets: [bucket({ count: 5 })] }));
  await service.report(student('u2', { buckets: [bucket({ role: 'teacher' })] }));
  clock.now += 2 * 60 * 60 * 1000;
  await service.report(teacher('t1', { buckets: [bucket({ role: 'student' })] }));
  const buckets = Object.values(daily(db).buckets);
  assert.equal(buckets.length, 2, 'a teacher is a separate bucket');
  const students = buckets.find((entry) => entry.role === 'student');
  assert.deepEqual([students.count, students.reporters], [11, 2]);
  const teachers = buckets.find((entry) => entry.role === 'teacher');
  assert.deepEqual([teachers.count, teachers.reporters, teachers.firstHour], [1, 1, 17]);
});

test('a hand-built request stores nothing identifying and nothing outside the closed shape', async () => {
  for (const mode of ['family', 'question']) {
    const { db, service } = setup({ mode });
    await service.report(student('uid-rowan', {
      buckets: [{
        build: '<script>', kind: 'Rowan Example', source: 'rowan.example@school.example', screen: '/student/rowan.example@school.example/4417829931',
        family: 'Rowan Example', questionType: 'S_4417829931', signature: "Rowan Quillfeather typed '\\frac{3}{4}' 3x+7=22 rowan.example@school.example",
        assignmentId: 'rowan.example@school.example', questionId: 'Rowan Example', count: 1e12,
        studentId: 'S_48213', name: 'Rowan Example', answer: 'x=5', stack: 'at Quillfeather (app.js:1:1)', nested: { email: 'rowan.example@school.example' },
      }],
      studentId: 'S_48213',
    }));
    const everything = JSON.stringify([...db.docs.entries()].filter(([path]) => !path.startsWith('platformFlags/')));
    assert.doesNotMatch(everything, /rowan|example|quillfeather|4417829931|48213|frac|3x|x=5|script|@/i);
    assert.doesNotMatch(everything, /uid-rowan|S_uid/, 'the account is not in what is stored, nor in a document name');
    const [stored] = Object.values(daily(db).buckets);
    assert.equal(stored.count, CRASH_REPORT_LIMITS.countPerBucketPerCall);
    assert.deepEqual(Object.keys(stored).sort(), ['build', 'count', 'family', 'firstHour', 'kind', 'lastHour', 'questionType', 'reporters', 'role', 'screen', 'signature', 'source']);
  }
});

test('family mode never stores the question, even when a request names it', async () => {
  const { db, service } = setup({ mode: 'family' });
  await service.report(student('u1', { buckets: [bucket({ assignmentId: 'a1B2c3', questionId: 'q-7' })] }));
  assert.doesNotMatch(JSON.stringify(daily(db)), /a1B2c3|q-7/);
  const question = setup({ mode: 'question' });
  await question.service.report(student('u1', { buckets: [bucket({ assignmentId: 'a1B2c3', questionId: 'q-7' })] }));
  assert.match(JSON.stringify(daily(question.db)), /"assignmentId":"a1B2c3","questionId":"q-7"/);
});

test('one account is bounded per day: requests, distinct buckets, and buckets per request', async () => {
  const { db, service, clock } = setup({ mode: 'family' });
  const many = Array.from({ length: 40 }, (_, index) => bucket({ family: `family-${index}` }));
  const first = await service.report(student('u1', { buckets: many }));
  assert.equal(first.accepted, CRASH_REPORT_LIMITS.bucketsPerCall);
  let accepted = first.accepted;
  for (let call = 0; call < 30; call += 1) {
    accepted += (await service.report(student('u1', { buckets: Array.from({ length: 12 }, (_, index) => bucket({ family: `more-${call}-${index}` })) }))).accepted;
  }
  assert.equal(accepted, CRASH_REPORT_LIMITS.bucketsPerReporterPerDay);
  assert.equal(Object.keys(daily(db).buckets).length, CRASH_REPORT_LIMITS.bucketsPerReporterPerDay);
  const reporterDocs = [...db.docs.keys()].filter((path) => path.startsWith('platformHealthReporters/'));
  assert.equal(reporterDocs.length, 1);
  assert.equal(db.docs.get(reporterDocs[0]).calls, CRASH_REPORT_LIMITS.callsPerReporterPerDay);
  const writesAtCap = db.cost.writes;
  await service.report(student('u1', { buckets: [bucket()] }));
  assert.equal(db.cost.writes, writesAtCap, 'past the cap a request writes nothing');
  // A new day is a new allowance.
  clock.now += 24 * 60 * 60 * 1000;
  assert.equal((await service.report(student('u1', { buckets: [bucket()] }))).accepted, 1);
});

test("a day's document is bounded: past the limit, reports are counted as overflow", async () => {
  const { db, service } = setup({ mode: 'family' });
  const perAccount = CRASH_REPORT_LIMITS.bucketsPerCall;
  const accounts = Math.ceil(CRASH_REPORT_LIMITS.bucketsPerDay / perAccount) + 2;
  for (let account = 0; account < accounts; account += 1) {
    await service.report(student(`u${account}`, { buckets: Array.from({ length: perAccount }, (_, index) => bucket({ family: `f-${account}-${index}` })) }));
  }
  const day = daily(db);
  assert.equal(Object.keys(day.buckets).length, CRASH_REPORT_LIMITS.bucketsPerDay);
  assert.equal(day.overflow, accounts * perAccount - CRASH_REPORT_LIMITS.bucketsPerDay);
  assert.ok(JSON.stringify(day).length < 400 * 1024, 'well inside a 1 MiB document');
});

test('retention: days past the limit and rate-limit records past theirs are deleted; the rest stay', async () => {
  const { db, service, clock } = setup({ mode: 'family' });
  await service.report(student('u1', { buckets: [bucket()] }));
  clock.now += 3 * 24 * 60 * 60 * 1000;
  await service.report(student('u1', { buckets: [bucket()] }));
  assert.deepEqual(await service.prune(), { daily: 0, reporters: 1, complete: true });
  clock.now += (CRASH_REPORT_LIMITS.dailyRetentionDays - 2) * 24 * 60 * 60 * 1000;
  assert.deepEqual(await service.prune(), { daily: 1, reporters: 1, complete: true });
  assert.deepEqual([...db.docs.keys()].filter((path) => path.startsWith('platformHealth')), ['platformHealthDaily/2026-11-19']);
  for (const data of db.docs.values()) if (data.day) assert.ok(data.expireAt instanceof Date, 'every record carries its expiry');
});

test('the administrator sets the mode, and "purge" turns it off and deletes everything; both are audited', async () => {
  const { db, service } = setup({});
  const audits = [];
  const audit = async (actor, action, target, details) => audits.push({ actor: actor.email, action, target, details });
  const actor = { uid: 'uid-root', email: 'root.admin@example.test' };
  assert.deepEqual(await service.manage({ data: {}, actor, audit }), { mode: 'off', changed: false });
  await assert.rejects(service.manage({ data: { action: 'set', mode: 'everything' }, actor, audit }), (error) => error.code === 'invalid-argument');
  await assert.rejects(service.manage({ data: { action: 'drop' }, actor, audit }), (error) => error.code === 'invalid-argument');
  assert.deepEqual(await service.manage({ data: { action: 'set', mode: 'family' }, actor, audit }), { mode: 'family', changed: true });
  assert.deepEqual(Object.keys(db.docs.get('platformFlags/crashReporting')).sort(), ['mode', 'updatedAt'], 'the flag every client can read says the mode, never who');
  assert.equal((await service.report(student('u1', { buckets: [bucket()] }))).accepted, 1, 'on takes effect at once on this instance');
  const purged = await service.manage({ data: { action: 'purge' }, actor, audit });
  assert.deepEqual(purged, { mode: 'off', changed: true, removed: { daily: 1, reporters: 1, complete: true } });
  assert.deepEqual([...db.docs.keys()], ['platformFlags/crashReporting']);
  assert.equal((await service.report(student('u1', { buckets: [bucket()] }))).accepted, 0);
  assert.deepEqual(audits.map((entry) => entry.action), ['crash_reporting_mode_set', 'crash_reporting_purged']);
  assert.deepEqual(audits[0].details, { from: 'off', to: 'family' });
});

test('an instance that cached "on" cannot write after the owner turns reporting off or purges', async () => {
  const { db, clock, service: reporting } = setup({ mode: 'question' });
  // A second instance, as the management callable is: its own cache, the same database.
  const managing = createPlatformHealthService({ db, HttpsError, now: () => clock.now });
  const actor = { uid: 'uid-root', email: 'root.admin@example.test' };
  assert.equal((await reporting.report(student('u1', { buckets: [bucket()] }))).accepted, 1, 'the reporting instance has cached "question"');
  await managing.manage({ data: { action: 'purge' }, actor, audit: async () => {} });
  const writes = db.cost.writes;
  assert.deepEqual(await reporting.report(student('u2', { buckets: [bucket()] })), { mode: 'off', accepted: 0 }, 'refused in the transaction, and told the live mode');
  assert.equal(db.cost.writes, writes);
  assert.deepEqual([...db.docs.keys()], ['platformFlags/crashReporting'], 'the purge is not undone');
  // And question detail is not kept after the owner chooses family detail.
  const second = setup({ mode: 'question' });
  const other = createPlatformHealthService({ db: second.db, HttpsError, now: () => second.clock.now });
  await second.service.report(student('u1', { buckets: [bucket({ assignmentId: 'a1B2c3', questionId: 'q-7' })] }));
  await other.manage({ data: { action: 'set', mode: 'family' }, actor, audit: async () => {} });
  assert.deepEqual(await second.service.report(student('u2', { buckets: [bucket({ family: 'later', assignmentId: 'zz9Later', questionId: 'q-9' })] })), { mode: 'family', accepted: 0 });
  assert.doesNotMatch(JSON.stringify(daily(second.db)), /zz9Later|q-9/);
});

test('deleting goes on until nothing is left, and a pass that ran out of time says so', async () => {
  const { db, service } = setup({ mode: 'off' });
  for (let index = 0; index < 7000; index += 1) db.docs.set(`platformHealthReporters/2026-11-16_${index}`, { day: '2026-11-16', calls: 1 });
  db.docs.set('platformHealthDaily/2026-11-16', { day: '2026-11-16', buckets: {} });
  assert.deepEqual(await service.purge({ budgetMs: 0 }), { daily: 1, reporters: 300, complete: false }, 'out of time is reported, never "all deleted"');
  assert.deepEqual(await service.purge(), { daily: 0, reporters: 6700, complete: true });
  assert.deepEqual([...db.docs.keys()], ['platformFlags/crashReporting']);
});

test('the callables are wired: reporting needs a sign-in only, managing needs the root administrator, and a schedule prunes', () => {
  const source = executableSource(functionsBackendSource());
  // Each of the three is its own statement of the platform domain module.
  assert.match(topLevelDeclaration(source, 'exports.reportClientCrashes'), /exports\.reportClientCrashes = onCall\(\{ maxInstances: \d+ \}, \(request\) => platformHealth\(\)\.report\(request\)\)/);
  assert.match(topLevelDeclaration(source, 'exports.managePlatformHealthReporting'), /exports\.managePlatformHealthReporting = onCall\(\{[^}]*\}, async \(request\) => \{\s*const actor = await requireRootAdmin\(request\);/);
  const prune = topLevelDeclaration(source, 'exports.prunePlatformHealth');
  assert.match(prune, /exports\.prunePlatformHealth = onSchedule\(/);
  assert.match(prune, /platformHealth\(\)\.prune\(\)/);
});
