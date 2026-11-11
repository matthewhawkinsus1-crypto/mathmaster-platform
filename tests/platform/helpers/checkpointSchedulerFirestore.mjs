// A Firestore that returns only what was asked for, and records every read.
//
// For the Classroom grade checkpoint schedulers and the section reconcile
// (classroomGradePushCapacity.test.mjs, classroomCheckpointScans.test.mjs):
// what they read, with which filters, projections and field masks, is the
// behaviour under test, so each read is kept in `reads` and a document comes
// back with only the fields the query selected or the field mask named.
// Equality filters only, as those functions use.

import assert from 'node:assert/strict';

const pathSegments = (field) => String(field).split('.');

const project = (data, fields) => {
  if (fields === null) return structuredClone(data);
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

export const checkpointSchedulerFirestore = (collections) => {
  const reads = [];
  const updates = [];
  const sets = [];
  const queued = [];
  const ref = (docPath) => {
    const [collection, id] = docPath.split('/');
    return {
      path: docPath,
      id,
      async get() {
        reads.push({ kind: 'doc', path: docPath, fields: null });
        const data = collections[collection]?.[id];
        return { id, ref: ref(docPath), exists: Boolean(data), data: () => (data ? structuredClone(data) : undefined) };
      },
      async set(data, options) { sets.push({ path: docPath, data, options }); },
      // update(field, value, field, value, …), as wakeArrivedStudentCheckpoints calls it.
      async update(...pairs) {
        for (let i = 0; i < pairs.length; i += 2) updates.push({ path: docPath, field: String(pairs[i]), value: pairs[i + 1] });
      },
    };
  };
  const query = (collection, state = { filters: [], fields: null, limit: null }) => ({
    where: (field, op, value) => query(collection, { ...state, filters: [...state.filters, { field, op, value }] }),
    select: (...fields) => query(collection, { ...state, fields: fields.map(pathSegments) }),
    limit: (limit) => query(collection, { ...state, limit }),
    doc: (id) => ref(`${collection}/${id}`),
    async get() {
      reads.push({ kind: 'query', collection, filters: state.filters, fields: state.fields });
      const docs = Object.entries(collections[collection] || {})
        .filter(([, data]) => state.filters.every(({ field, op, value }) => {
          assert.equal(op, '==', 'the fake supports equality only');
          return data[field] === value;
        }))
        .slice(0, state.limit ?? undefined)
        .map(([id, data]) => ({ id, ref: ref(`${collection}/${id}`), exists: true, data: () => project(data, state.fields) }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  return {
    reads,
    updates,
    sets,
    queued,
    collection: (name) => query(name),
    doc: ref,
    async getAll(...args) {
      const options = args.length && !args[args.length - 1]?.path ? args.pop() : null;
      const fields = options?.fieldMask ? options.fieldMask.map(pathSegments) : null;
      reads.push({ kind: 'getAll', paths: args.map((r) => r.path), fields });
      return args.map((r) => {
        const [collection, id] = r.path.split('/');
        const data = collections[collection]?.[id];
        return { id, ref: r, exists: Boolean(data), data: () => (data ? project(data, fields) : undefined) };
      });
    },
    batch() {
      const pending = [];
      const pendingSets = [];
      return {
        update(docRef, fieldPath, value) { pending.push({ path: docRef.path, field: String(fieldPath), value }); },
        set(docRef, data) { pendingSets.push({ path: docRef.path, data }); },
        async commit() { updates.push(...pending); queued.push(...pendingSets); },
      };
    },
  };
};
