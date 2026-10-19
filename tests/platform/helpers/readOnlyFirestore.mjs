// An in-memory Firestore for the read-only reports' tests: it refuses every
// write (and records the attempt), applies a field mask as Firestore does,
// and supports the reads those reports use — collection and collection-group
// queries (orderBy/select/limit/startAfter/get), subcollection documents and
// getAll with a fieldMask. Documents are given as a Map of full paths.

const WRITE_METHODS = new Set(['set', 'update', 'delete', 'create', 'add', 'batch', 'runTransaction', 'bulkWriter', 'recursiveDelete', 'bundle']);

export const readOnlyStore = (documents) => {
  const attempts = [];
  const reads = [];
  const masks = [];
  const guard = (target, label) => new Proxy(target, {
    get(object, property) {
      if (WRITE_METHODS.has(property)) {
        return () => { attempts.push(`${label}.${String(property)}`); throw new Error(`write refused: ${label}.${String(property)}`); };
      }
      return object[property];
    },
  });
  const masked = (data, fields) => {
    if (!fields) return structuredClone(data);
    const out = {};
    fields.forEach((field) => {
      const parts = field.split('.');
      let source = data;
      for (const part of parts) source = source?.[part];
      if (source === undefined) return;
      let target = out;
      parts.slice(0, -1).forEach((part) => { target[part] ??= {}; target = target[part]; });
      target[parts.at(-1)] = structuredClone(source);
    });
    return out;
  };
  const refOf = (docPath) => {
    const parts = docPath.split('/');
    const parentDoc = parts.length > 2 ? parts.slice(0, -2).join('/') : null;
    return { id: parts.at(-1), path: docPath, parent: { id: parts.at(-2), parent: parentDoc ? { id: parentDoc.split('/').at(-1), path: parentDoc } : null } };
  };
  const snapshot = (docPath, fields = null) => {
    const data = documents.get(docPath);
    return { id: docPath.split('/').at(-1), exists: data !== undefined, ref: refOf(docPath), data: () => (data === undefined ? undefined : masked(data, fields)) };
  };
  const query = (label, matches, state = { limit: Infinity, after: null, fields: null }) => guard({
    orderBy: () => query(label, matches, state),
    select: (...fields) => { masks.push([label, fields]); return query(label, matches, { ...state, fields }); },
    limit: (count) => query(label, matches, { ...state, limit: count }),
    startAfter: (doc) => query(label, matches, { ...state, after: doc }),
    get: async () => {
      reads.push(label);
      let rows = [...documents.keys()].filter(matches).sort();
      if (state.after) rows = rows.slice(rows.indexOf(state.after.ref.path) + 1);
      return { docs: rows.slice(0, state.limit).map((key) => snapshot(key, state.fields)) };
    },
  }, `query(${label})`);
  const inCollection = (collectionPath) => (key) => key.startsWith(`${collectionPath}/`) && !key.slice(collectionPath.length + 1).includes('/');
  const docRef = (docPath) => guard({
    id: docPath.split('/').at(-1),
    path: docPath,
    get: async () => snapshot(docPath),
    collection: (name) => collectionRef(`${docPath}/${name}`),
  }, `doc(${docPath})`);
  const collectionRef = (collectionPath) => guard({ ...query(collectionPath, inCollection(collectionPath)), doc: (id) => docRef(`${collectionPath}/${id}`) }, `collection(${collectionPath})`);
  const db = guard({
    collection: (name) => collectionRef(name),
    collectionGroup: (name) => query(`group:${name}`, (key) => key.split('/').at(-2) === name && key.split('/').length % 2 === 0),
    getAll: async (...args) => {
      reads.push('getAll');
      const options = args.at(-1)?.fieldMask ? args.pop() : {};
      if (options.fieldMask) masks.push(['getAll', options.fieldMask]);
      return args.map((ref) => snapshot(ref.path, options.fieldMask || null));
    },
  }, 'db');
  return { db, attempts, reads, masks };
};
