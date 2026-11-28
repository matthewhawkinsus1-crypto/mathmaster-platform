// A Firestore stand-in seeded with one Discipline Tracker class, for the
// family-message queue (functions/lib/familyMessageOutbox.js). Shared by
// familyMessageOutbox.test.mjs (the server's rules) and
// schoolStatusExtensionRunner.test.mjs (the extension's loop against them).

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const outbox = require('../../../functions/lib/familyMessageOutbox.js');

export const at = (hhmm, day = '2026-11-30') => Date.parse(`${day}T${hhmm}:00-06:00`);
export const TEACHER = 'teacher@desotoisd.org';
export const OTHER = 'other@desotoisd.org';
export const serverTimestamp = () => 'SERVER_TIME';

// ---- a Firestore stand-in: documents, chained queries, getAll, and
// transactions that run one at a time and keep nothing when they throw.
export const fakeDb = (seed) => {
  const store = new Map(Object.entries(seed).flatMap(([collection, docs]) => Object.entries(docs).map(([id, data]) => [`${collection}/${id}`, structuredClone(data)])));
  const snapshot = (path) => {
    const data = store.get(path);
    return { id: path.split('/')[1], exists: data !== undefined, data: () => (data === undefined ? undefined : structuredClone(data)) };
  };
  const ref = (path) => ({
    path,
    id: path.split('/')[1],
    get: async () => snapshot(path),
    set: async (data, options) => { store.set(path, options?.merge ? { ...store.get(path), ...structuredClone(data) } : structuredClone(data)); },
  });
  const OPS = { '==': (left, right) => left === right, '>=': (left, right) => left >= right, '<=': (left, right) => left <= right, in: (left, right) => right.includes(left) };
  const query = (name, filters = [], max = Infinity) => ({
    isQuery: true,
    where: (field, op, value) => query(name, [...filters, { field, op, value }], max),
    limit: (n) => query(name, filters, n),
    // A field mask changes nothing the stand-in returns.
    select: () => query(name, filters, max),
    run: () => [...store.keys()]
      .filter((path) => path.startsWith(`${name}/`) && filters.every(({ field, op, value }) => OPS[op](store.get(path)?.[field], value)))
      .slice(0, max)
      .map(snapshot),
    get: async () => ({ docs: query(name, filters, max).run() }),
  });
  let queue = Promise.resolve();
  const db = {
    store,
    collection: (name) => ({ doc: (id) => ref(`${name}/${id}`), where: (...args) => query(name).where(...args) }),
    getAll: async (...refs) => refs.filter((entry) => entry?.path).map((entry) => snapshot(entry.path)),
    runTransaction: (fn) => {
      const run = queue.then(async () => {
        const writes = [];
        const result = await fn({
          get: async (target) => (target.isQuery ? { docs: target.run() } : snapshot(target.path)),
          getAll: async (...refs) => refs.map((entry) => snapshot(entry.path)),
          set: (entry, data, options) => writes.push(() => store.set(entry.path, options?.merge ? { ...store.get(entry.path), ...structuredClone(data) } : structuredClone(data))),
          create: (entry, data) => {
            if (store.has(entry.path)) throw new Error(`ALREADY_EXISTS ${entry.path}`);
            writes.push(() => store.set(entry.path, structuredClone(data)));
          },
          update: (entry, data) => {
            if (!store.has(entry.path)) throw new Error(`NOT_FOUND ${entry.path}`);
            writes.push(() => store.set(entry.path, { ...store.get(entry.path), ...structuredClone(data) }));
          },
        });
        writes.forEach((write) => write());
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return db;
};

export const tap = (id, overrides = {}) => ({
  classId: 'alg1-p1', classPeriod: 'Period 1', studentId: 'u-ada', type: 'tardy', detail: '',
  occurredAtMs: at('08:05'), dateKey: '2026-11-30', teacherOfRecord: TEACHER, form: { state: 'submitted' }, ...overrides,
});
export const world = ({ mode = 'test', testDistrictIds = ['1500101'], incidents = null } = {}) => fakeDb({
  disciplineIncidents: incidents || {
    'alg1-p1_t1': tap('t1'),
    'alg1-p1_t2': tap('t2', { studentId: 'u-ben', type: 'deviceCollected', occurredAtMs: at('08:30') }),
  },
  grades: {
    'u-ada': { classId: 'alg1-p1', firstName: 'Ada', lastName: 'Lovelace', sisStudentId: '1500101' },
    'u-ben': { classId: 'alg1-p1', firstName: 'Ben', lastName: 'Ortiz', sisStudentId: '1500102' },
  },
  classes: { 'alg1-p1': { name: 'Algebra I', period: 'Period 1', teacherOfRecord: TEACHER } },
  disciplineSettings: { [TEACHER]: { teacherName: 'Mr. Hawkins' } },
  disciplineStatus: mode ? { familyMessaging: { mode, testDistrictIds } } : {},
});
export const queue = (db, overrides = {}) => outbox.queueFamilyMessages({
  db, teacherEmail: TEACHER, classId: 'alg1-p1', classData: { name: 'Algebra I', period: 'Period 1' }, dateKey: '2026-11-30', nowMs: at('09:00'), ...overrides,
});
export const messagesIn = (db) => [...db.store].filter(([path]) => path.startsWith('familyMessages/')).map(([path, data]) => ({ id: path.split('/')[1], ...data }));
export const contactsIn = (db) => [...db.store].filter(([path]) => path.startsWith('parentContactLogs/')).map(([path, data]) => ({ id: path.split('/')[1], ...data }));
