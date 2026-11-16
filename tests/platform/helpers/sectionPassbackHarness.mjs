// The real Classroom grade triggers, the split-section one and the
// whole-assignment one, run against fakes of the two things they talk to:
// Firestore, and Google's Classroom API.
//
// Only Google's HTTP layer is replaced. functions/lib/classroom.js is the real
// module, so every call is tagged with its step and a refusal reaches the
// trigger exactly as a GaxiosError from googleapis does. The Firestore fake
// keeps documents, merges `set(..., { merge: true })` and applies
// FieldValue.delete() as Firestore does, and records every read, so a test can
// assert what the triggers read and what they wrote.
//
// Load this module before anything else requires functions/classroomSectionEntry.js
// or functions/index.js: each takes getFirestore when it is first loaded.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const requireFromFunctions = createRequire(path.join(root, 'functions/index.js'));

const firestoreModule = requireFromFunctions('firebase-admin/firestore');
const { FieldValue } = firestoreModule;
const DELETE = FieldValue.delete();
const SERVER_TIME = FieldValue.serverTimestamp();
export const SERVER_TIMESTAMP = '(server timestamp)';

let currentDb = null;
firestoreModule.getFirestore = () => currentDb;

const classroomLib = requireFromFunctions('./lib/classroom.js');
let currentGoogle = null;
classroomLib.getClassroomClient = async (teacherUid) => {
  currentGoogle.clients.push(teacherUid);
  return currentGoogle.client;
};

const logger = requireFromFunctions('firebase-functions/logger');
export const logged = [];
for (const level of ['info', 'warn', 'error']) {
  logger[level] = (message, fields) => { logged.push({ level, message, fields }); };
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const copy = (value) => (isPlainObject(value) || Array.isArray(value) ? structuredClone(value) : value);

// set(..., { merge: true }): maps merge field by field; delete() removes.
function mergeInto(target, patch) {
  const out = { ...(isPlainObject(target) ? target : {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE) delete out[key];
    else if (value === SERVER_TIME) out[key] = SERVER_TIMESTAMP;
    else if (isPlainObject(value)) out[key] = mergeInto(out[key], value);
    else out[key] = copy(value);
  }
  return out;
}

const segmentsOf = (field) => (Array.isArray(field?.segments) ? [...field.segments] : String(field).split('.'));

function updateAt(data, segments, value) {
  const out = structuredClone(data || {});
  let node = out;
  segments.slice(0, -1).forEach((segment) => {
    if (!isPlainObject(node[segment])) node[segment] = {};
    node = node[segment];
  });
  const leaf = segments[segments.length - 1];
  if (value === DELETE) delete node[leaf];
  else node[leaf] = value === SERVER_TIME ? SERVER_TIMESTAMP : copy(value);
  return out;
}

const project = (data, fields) => {
  if (!fields) return structuredClone(data);
  const out = {};
  for (const segments of fields) {
    let from = data;
    for (const segment of segments) from = from?.[segment];
    if (from === undefined) continue;
    let to = out;
    segments.slice(0, -1).forEach((segment) => { to = (to[segment] ||= {}); });
    to[segments[segments.length - 1]] = structuredClone(from);
  }
  return out;
};

export function passbackFirestore(seed = {}) {
  const store = new Map();
  for (const [collection, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs)) store.set(`${collection}/${id}`, structuredClone(data));
  }
  const reads = [];
  const writes = [];
  const snapshotOf = (docPath, data, fields = null) => ({
    id: docPath.split('/').pop(),
    ref: ref(docPath),
    exists: data !== undefined,
    data: () => (data === undefined ? undefined : project(data, fields)),
  });
  function ref(docPath) {
    return {
      path: docPath,
      id: docPath.split('/').pop(),
      async get() {
        reads.push({ kind: 'doc', path: docPath });
        return snapshotOf(docPath, store.get(docPath));
      },
      async set(data, options = {}) {
        writes.push({ kind: 'set', path: docPath, data, merge: Boolean(options.merge) });
        store.set(docPath, options.merge ? mergeInto(store.get(docPath), data) : mergeInto({}, data));
      },
      async create(data) {
        if (store.has(docPath)) throw Object.assign(new Error('6 ALREADY_EXISTS: Document already exists'), { code: 6 });
        writes.push({ kind: 'create', path: docPath, data });
        store.set(docPath, mergeInto({}, data));
      },
      async update(...pairs) {
        assert.ok(store.has(docPath), `update of a missing document ${docPath}`);
        let data = store.get(docPath);
        for (let index = 0; index < pairs.length; index += 2) {
          writes.push({ kind: 'update', path: docPath, field: segmentsOf(pairs[index]).join('.'), value: pairs[index + 1] });
          data = updateAt(data, segmentsOf(pairs[index]), pairs[index + 1]);
        }
        store.set(docPath, data);
      },
      async delete() {
        writes.push({ kind: 'delete', path: docPath });
        store.delete(docPath);
      },
    };
  }
  const query = (collection, state = { filters: [], fields: null, limit: null, startAfter: null }) => ({
    where: (field, op, value) => {
      assert.equal(op, '==', 'the fake supports equality only');
      return query(collection, { ...state, filters: [...state.filters, { field: String(field), value }] });
    },
    select: (...fields) => query(collection, { ...state, fields: fields.map(segmentsOf) }),
    limit: (limit) => query(collection, { ...state, limit }),
    // Results already come in document-id order; a paged read asks for that
    // order and passes the last document (or its id) as the cursor.
    orderBy: (field) => {
      assert.equal(String(field), '__name__', 'the fake orders by document id only');
      return query(collection, state);
    },
    startAfter: (cursor) => query(collection, { ...state, startAfter: typeof cursor === 'string' ? cursor : cursor.id }),
    doc: (id) => ref(`${collection}/${id}`),
    async get() {
      const docs = [...store.entries()]
        .filter(([docPath]) => docPath.startsWith(`${collection}/`) && docPath.split('/').length === 2)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .filter(([, data]) => state.filters.every(({ field, value }) => data?.[field] === value))
        .filter(([docPath]) => state.startAfter === null || docPath.split('/')[1] > state.startAfter)
        .slice(0, state.limit ?? undefined)
        .map(([docPath, data]) => snapshotOf(docPath, data, state.fields));
      // Firestore bills a query by the documents it returns (one if none).
      reads.push({ kind: 'query', collection, filters: state.filters, fields: state.fields, returned: docs.map((doc) => doc.id) });
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  return {
    store,
    reads,
    writes,
    doc: ref,
    collection: (name) => query(name),
    // A write batch: its writes are applied in order when it is committed.
    batch() {
      const operations = [];
      const batch = {
        set: (docRef, data, options) => { operations.push(() => docRef.set(data, options)); return batch; },
        update: (docRef, ...pairs) => { operations.push(() => docRef.update(...pairs)); return batch; },
        delete: (docRef) => { operations.push(() => docRef.delete()); return batch; },
        async commit() {
          // eslint-disable-next-line no-await-in-loop
          for (const operation of operations) await operation();
        },
      };
      return batch;
    },
    // getAll(ref, ..., { fieldMask }), as Firestore bills it: one read a document.
    async getAll(...args) {
      const options = args.length && !args[args.length - 1]?.path ? args.pop() : null;
      const fields = options?.fieldMask ? options.fieldMask.map(segmentsOf) : null;
      reads.push({ kind: 'getAll', paths: args.map((docRef) => docRef.path), fields });
      return args.map((docRef) => snapshotOf(docRef.path, store.get(docRef.path), fields));
    },
    data: (docPath) => (store.has(docPath) ? structuredClone(store.get(docPath)) : undefined),
  };
}

/* --- Google ----------------------------------------------------------------- */

const { GaxiosError } = requireFromFunctions('gaxios');
const googleError = (status, error) => {
  const config = { url: 'https://classroom.googleapis.com/v1/courses/c/courseWork/w/studentSubmissions/s:return', method: 'POST', headers: {} };
  return new GaxiosError(error.message, config, {
    status, statusText: '', data: { error: { code: status, ...error } }, headers: {}, config, request: { responseURL: config.url },
  });
};
// What Google answers a return of work that was not turned in.
export const PRECONDITION = () => googleError(400, {
  message: 'Precondition check failed.', status: 'FAILED_PRECONDITION',
  errors: [{ message: 'Precondition check failed.', domain: 'global', reason: 'failedPrecondition' }],
});
export const PERMISSION_DENIED = () => googleError(403, {
  message: 'The caller does not have permission', status: 'PERMISSION_DENIED',
  errors: [{ message: 'The caller does not have permission', domain: 'global', reason: 'forbidden' }],
});
export const QUOTA = () => googleError(429, {
  message: "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute per user' of service 'classroom.googleapis.com'.",
  status: 'RESOURCE_EXHAUSTED',
  details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'RATE_LIMIT_EXCEEDED' }],
});

// Google's rule for a return: "The submission can only be returned if it has
// already been turned in by the student."
export const returnsOnlyTurnedInWork = (step, courseWorkId, state) => (
  step === 'return' && state !== 'TURNED_IN' ? PRECONDITION() : null
);

/**
 * Google's Classroom API for one test. `states[courseWorkId]` is the state of
 * the student's submission on that column (CREATED unless given);
 * `refuse(step, courseWorkId, state)` may return an error for 'list', 'patch'
 * or 'return'. A return Google accepts moves the submission to RETURNED, as
 * Classroom does.
 */
export function fakeGoogle({ states = {}, refuse = () => null } = {}) {
  const calls = [];
  const state = (courseWorkId) => states[courseWorkId] || 'CREATED';
  const submission = (courseWorkId) => ({ id: `sub-${courseWorkId}`, state: state(courseWorkId) });
  const answer = (step, courseWorkId, detail = {}) => {
    const error = refuse(step, courseWorkId, state(courseWorkId));
    calls.push({ step, courseWorkId, refused: Boolean(error), ...detail });
    if (error) throw error;
  };
  const google = {
    calls,
    clients: [],
    states,
    client: { courses: { courseWork: { studentSubmissions: {
      list: async ({ courseWorkId }) => { answer('list', courseWorkId); return { data: { studentSubmissions: [submission(courseWorkId)] } }; },
      // `body`: the grades sent, draftGrade alone or with assignedGrade.
      patch: async ({ courseWorkId, requestBody }) => { answer('patch', courseWorkId, { body: requestBody }); return { data: submission(courseWorkId) }; },
      return: async ({ courseWorkId }) => { answer('return', courseWorkId); states[courseWorkId] = 'RETURNED'; return { data: {} }; },
    } } } },
    steps: (courseWorkId) => calls.filter((call) => !courseWorkId || call.courseWorkId === courseWorkId).map((call) => call.step),
  };
  return google;
}

/* --- the triggers ----------------------------------------------------------- */

export const sectionEntry = () => requireFromFunctions('./classroomSectionEntry.js');
// The whole-assignment trigger, syncGradeToClassroom (functions/index.js).
export const wholeEntry = () => requireFromFunctions('./index.js');
const TRIGGERS = {
  section: () => sectionEntry().cloudFunctions.syncSectionGradeToClassroom,
  whole: () => wholeEntry().syncGradeToClassroom,
};

/**
 * Write the student's grade document as `change` describes, and return the
 * event Firestore delivers for that write: every trigger gets the same
 * before and after.
 */
export function writeGradeDocument({ db, studentId, change }) {
  const gradePath = `grades/${studentId}`;
  const beforeData = db.data(gradePath);
  const afterData = change(structuredClone(beforeData));
  db.store.set(gradePath, structuredClone(afterData));
  return {
    params: { studentId },
    data: {
      before: { exists: beforeData !== undefined, data: () => structuredClone(beforeData) },
      after: { exists: true, ref: db.doc(gradePath), data: () => structuredClone(afterData) },
    },
  };
}

/** Run one Classroom trigger, 'section' or 'whole', on a delivered write. */
export async function runTrigger(name, { db, google, event }) {
  currentDb = db;
  currentGoogle = google;
  await TRIGGERS[name]().run(event);
}

/**
 * Run one callable against this test's Firestore: `entry` is 'section'
 * (functions/classroomSectionEntry.js) or 'whole' (functions/index.js).
 */
export async function runCallable(entry, name, { db, google = null, request }) {
  currentDb = db;
  currentGoogle = google;
  const functions = entry === 'section' ? sectionEntry().cloudFunctions : wholeEntry();
  return functions[name].run(request);
}

/**
 * Write the student's grade document as `change` describes and run the
 * triggers on that write, in that order, as Firestore would deliver it. Both
 * Classroom triggers answer every write; the order between them is not fixed.
 */
export async function writeGrades({ db, google, studentId, change, triggers = ['section'] }) {
  const event = writeGradeDocument({ db, studentId, change });
  for (const name of triggers) {
    // eslint-disable-next-line no-await-in-loop
    await runTrigger(name, { db, google, event });
  }
  return event;
}
