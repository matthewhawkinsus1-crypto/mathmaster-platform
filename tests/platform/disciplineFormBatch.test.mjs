// The backend that fills in the district's Campus Violation Tracker form
// (functions/lib/disciplineFormBatch.js), against a Firestore stand-in and a
// stand-in for Google Forms. Nothing here reaches the real form: a response
// there is a violation on a real student's district record.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { submitDisciplineForms, SENDING_STALE_MS, MAX_RETRIES } = require('../../functions/lib/disciplineFormBatch.js');

const FORM_PAGE = readFileSync(new URL('./fixtures/campusViolationTrackerForm.html', import.meta.url), 'utf8');
const at = (hhmm, day = '2026-11-30') => Date.parse(`${day}T${hhmm}:00-06:00`);

// ---- a Firestore stand-in: documents, equality queries, getAll, transactions
const fakeDb = (seed) => {
  const store = new Map(Object.entries(seed).flatMap(([collection, docs]) => Object.entries(docs).map(([id, data]) => [`${collection}/${id}`, structuredClone(data)])));
  const valueAt = (data, field) => field.split('.').reduce((value, key) => value?.[key], data);
  const snapshot = (path) => {
    const data = store.get(path);
    return { id: path.split('/')[1], exists: data !== undefined, data: () => structuredClone(data), ref: ref(path) };
  };
  const ref = (path) => ({
    path,
    id: path.split('/')[1],
    get: async () => snapshot(path),
    set: async (data, options) => { store.set(path, options?.merge ? { ...store.get(path), ...structuredClone(data) } : structuredClone(data)); },
  });
  let queue = Promise.resolve();
  const db = {
    store,
    collection: (name) => ({
      doc: (id) => ref(`${name}/${id}`),
      where: (field, op, value) => ({
        get: async () => ({
          docs: [...store.keys()].filter((path) => path.startsWith(`${name}/`) && valueAt(store.get(path), field) === value).map(snapshot),
        }),
      }),
    }),
    getAll: async (...refs) => refs.filter((entry) => entry?.path).map((entry) => snapshot(entry.path)),
    // Transactions run one at a time, as Firestore's contention makes them.
    runTransaction: (fn) => {
      const run = queue.then(() => fn({
        getAll: async (...refs) => refs.map((entry) => snapshot(entry.path)),
        update: (entry, data) => { store.set(entry.path, { ...store.get(entry.path), ...structuredClone(data) }); },
      }));
      queue = run.catch(() => {});
      return run;
    },
  };
  return db;
};

// ---- a Google Forms stand-in
const fakeForms = ({ page = FORM_PAGE, reply = () => ({ status: 200 }) } = {}) => {
  const posts = [];
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posts.push({ url, body: options.body });
      const answer = reply(posts.length);
      if (answer.throws) throw Object.assign(new Error(answer.throws), { code: answer.code });
      return { status: answer.status, ok: answer.status === 200, url: answer.url || url, text: async () => '' };
    }
    return { status: 200, ok: true, url, text: async () => page };
  };
  return { fetchImpl, posts };
};

const incident = (id, overrides = {}) => {
  const occurredAtMs = overrides.occurredAtMs ?? at('08:05');
  return {
    classId: 'alg1-p1', classPeriod: 'Period 1', studentId: 'u-ada', type: 'tardy', detail: '',
    occurredAtMs, dateKey: '2026-11-30', teacherOfRecord: 'teacher@desotoisd.org',
    form: { state: 'pending', attempts: 0 }, ...overrides,
  };
};
const world = (incidents) => fakeDb({
  disciplineIncidents: incidents,
  grades: {
    'u-ada': { classId: 'alg1-p1', firstName: 'Ada', lastName: 'Lovelace', sisStudentId: '1500101' },
    'u-ben': { classId: 'alg1-p1', displayName: 'Ortiz, Ben', sisStudentId: '1500102' },
    'u-dee': { classId: 'alg1-p1', firstName: 'Dee', lastName: 'Park' },
  },
  classes: { 'alg1-p1': { period: 'Period 1', teacherOfRecord: 'teacher@desotoisd.org' } },
  settings: {
    classSchedule: {
      version: 2,
      daySchedules: { A: { periods: { 'Period 1': { enabled: true, start: '08:00', end: '09:30' } } }, B: { periods: {} } },
      weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
    },
  },
});
const stateOf = (db, id) => db.store.get(`disciplineIncidents/${id}`).form;
const quiet = { warn() {} };
const run = (db, forms, now, extra = {}) => submitDisciplineForms({ db, fetchImpl: forms.fetchImpl, now, delayMs: 0, logger: quiet, ...extra });

test('after the period ends, each student gets one response with every category they had', async () => {
  const db = world({
    t1: incident('t1'),
    t2: incident('t2', { type: 'idViolation', detail: 'noLanyard', occurredAtMs: at('08:40') }),
    t3: incident('t3', { studentId: 'u-ben', type: 'deviceCollected' }),
  });
  const forms = fakeForms();
  // 9:00: Period 1 (8:00-9:30) is still on. Nothing is sent.
  let summary = await run(db, forms, at('09:00'));
  assert.equal(forms.posts.length, 0);
  assert.deepEqual(summary.waiting.map((entry) => [entry.key, entry.dueAtMs]), [['alg1-p1|2026-11-30|u-ada', at('09:40')], ['alg1-p1|2026-11-30|u-ben', at('09:40')]]);
  // 9:41: sent.
  summary = await run(db, forms, at('09:41'));
  assert.deepEqual(forms.posts.map((post) => post.body), [
    'entry.53561676=1500101&entry.1778257346=Ada+Lovelace&entry.420745546=Tardy&entry.420745546=ID+Violation&fvv=1&pageHistory=0',
    'entry.53561676=1500102&entry.1778257346=Ben+Ortiz&entry.420745546=Electronic+Device+Collected&fvv=1&pageHistory=0',
  ]);
  assert.ok(forms.posts.every((post) => post.url.endsWith('/1FAIpQLSfYSd6Z_xOg2btdwGG3RqzjZnQ0QTE0r2BkYcC77gbIQg2ZAw/formResponse')));
  assert.deepEqual(['t1', 't2', 't3'].map((id) => stateOf(db, id).state), ['submitted', 'submitted', 'submitted']);
  assert.deepEqual(stateOf(db, 't1').options, ['Tardy', 'ID Violation']);
  assert.equal(summary.submitted.length, 2);
  // A later run sends nothing again.
  await run(db, forms, at('10:30'));
  assert.equal(forms.posts.length, 2);
});

test('an undone tap is never sent, and a later tap goes out as its own response', async () => {
  const db = world({ t1: incident('t1', { voidedAtMs: at('08:06') }), t2: incident('t2', { type: 'dressCode' }) });
  const forms = fakeForms();
  await run(db, forms, at('09:41'));
  assert.equal(forms.posts.length, 1);
  assert.match(forms.posts[0].body, /entry\.420745546=Dress\+Code&fvv/);
  assert.equal(stateOf(db, 't1').state, 'pending', 'the undone tap is left alone');
});

test('Send now goes out before the period ends', async () => {
  const db = world({ t1: incident('t1') });
  const forms = fakeForms();
  await run(db, forms, at('08:20'), { force: true });
  assert.equal(forms.posts.length, 1);
  assert.equal(stateOf(db, 't1').state, 'submitted');
});

test('a changed district form stops the batch and says why; nothing is guessed', async () => {
  const changed = FORM_PAGE.replace('["Electronic Device Collected",null,null,null,0]', '["Phone",null,null,null,0]');
  const db = world({ t1: incident('t1', { type: 'deviceCollected' }) });
  const forms = fakeForms({ page: changed });
  const summary = await run(db, forms, at('09:41'));
  assert.equal(forms.posts.length, 0);
  assert.match(summary.formProblems[0], /no longer offers: Electronic Device Collected/);
  assert.equal(db.store.get('disciplineStatus/form').ok, false);
  assert.equal(stateOf(db, 't1').state, 'pending', 'still waiting, to go once the form is fixed');
  // A sign-in page instead of the form: also stopped.
  const signIn = fakeForms({ page: '<html>Sign in</html>' });
  assert.match((await run(db, signIn, at('09:42'))).formProblems[0], /could not be read/);
});

test('no reply from the form: marked unknown, and never posted again by itself', async () => {
  const db = world({ t1: incident('t1') });
  const forms = fakeForms({ reply: () => ({ throws: 'The operation was aborted due to timeout' }) });
  const summary = await run(db, forms, at('09:41'));
  assert.equal(summary.unknown.length, 1);
  assert.equal(stateOf(db, 't1').state, 'unknown');
  await run(db, forms, at('10:41'));
  await run(db, forms, at('11:41'));
  assert.equal(forms.posts.length, 1, 'one post only: a second could be a duplicate violation');
});

test('a form that answers 503 is tried again on later runs, then reported', async () => {
  const db = world({ t1: incident('t1') });
  const forms = fakeForms({ reply: () => ({ status: 503 }) });
  for (let attempt = 1; attempt <= MAX_RETRIES + 2; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    await run(db, forms, at('09:41') + attempt * 600000);
  }
  assert.equal(forms.posts.length, MAX_RETRIES);
  assert.equal(stateOf(db, 't1').state, 'failed');
  assert.match(stateOf(db, 't1').reason, /Tried 5 times/);
  // Nothing reached Google at all: also tried again.
  const offline = world({ t1: incident('t1') });
  const dns = fakeForms({ reply: () => ({ throws: 'fetch failed', code: 'ENOTFOUND' }) });
  await run(offline, dns, at('09:41'));
  assert.equal(stateOf(offline, 't1').state, 'pending');
});

test('a refusal, or a redirect to a sign-in, is reported and not retried', async () => {
  const refused = world({ t1: incident('t1') });
  await run(refused, fakeForms({ reply: () => ({ status: 400 }) }), at('09:41'));
  assert.deepEqual([stateOf(refused, 't1').state, stateOf(refused, 't1').reason], ['failed', 'The form refused the response (400).']);
  const signIn = world({ t1: incident('t1') });
  await run(signIn, fakeForms({ reply: () => ({ status: 200, url: 'https://accounts.google.com/v3/signin/identifier' }) }), at('09:41'));
  assert.match(stateOf(signIn, 't1').reason, /requires a sign-in/);
});

test('a student with no district ID waits, and goes through once one is on file', async () => {
  const db = world({ t1: incident('t1', { studentId: 'u-dee' }) });
  const forms = fakeForms();
  const summary = await run(db, forms, at('09:41'));
  assert.deepEqual(summary.blocked, [{ key: 'alg1-p1|2026-11-30|u-dee', reason: 'Missing or invalid district student ID' }]);
  assert.equal(forms.posts.length, 0);
  db.store.get('grades/u-dee').sisStudentId = '1500104';
  await run(db, forms, at('09:51'));
  assert.match(forms.posts[0].body, /entry\.53561676=1500104&entry\.1778257346=Dee\+Park/);
});

test('the scheduled run and Send now at the same moment post each response once', async () => {
  const db = world({ t1: incident('t1'), t2: incident('t2', { studentId: 'u-ben' }) });
  const forms = fakeForms();
  await Promise.all([run(db, forms, at('09:41')), run(db, forms, at('09:41'), { force: true })]);
  assert.equal(forms.posts.length, 2);
  assert.deepEqual(forms.posts.map((post) => /entry\.53561676=(\d+)/.exec(post.body)[1]).sort(), ['1500101', '1500102']);
});

test('a send cut off mid-way becomes unknown for the teacher, not a silent resend', async () => {
  const db = world({ t1: incident('t1', { form: { state: 'sending', attempts: 1, attemptAtMs: at('09:41') } }) });
  const forms = fakeForms();
  await run(db, forms, at('09:41') + SENDING_STALE_MS + 1000);
  assert.equal(stateOf(db, 't1').state, 'unknown');
  assert.equal(forms.posts.length, 0);
});

test('Send now for one class and one day leaves the rest alone', async () => {
  const db = world({
    t1: incident('t1'),
    t2: incident('t2', { classId: 'alg1-p5', classPeriod: 'Period 5' }),
    t3: incident('t3', { dateKey: '2026-11-19', occurredAtMs: at('08:05', '2026-11-19') }),
    t4: incident('t4', { teacherOfRecord: 'other@desotoisd.org' }),
  });
  const forms = fakeForms();
  await run(db, forms, at('08:20'), { force: true, scope: { teacherEmail: 'teacher@desotoisd.org', classIds: ['alg1-p1'], dateKey: '2026-11-30' } });
  assert.deepEqual(['t1', 't2', 't3', 't4'].map((id) => stateOf(db, id).state), ['submitted', 'pending', 'pending', 'pending']);
});
