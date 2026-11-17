// Stands in for 'firebase/firestore', 'firebase/functions' and src/firebase.js
// when a node test imports a src/ module through firestoreClientIsolation.mjs.
//
// One in-memory Firestore, shared by the test and the module under test
// (globalThis.__firestoreClient), honest about what it models:
//
//   - every document read is recorded, getDoc and a transaction's get alike
//     (`reads`: { path, how }), as Firestore bills them;
//   - a transaction is optimistic, as the web SDK's is: its reads note each
//     document's version, and its writes commit only if every document read is
//     still at that version. Otherwise it runs the whole update again, reads
//     included — a refused write costs a read — up to five attempts. A read
//     that fails `unavailable` is run again the same way; anything else the
//     update throws is the caller's and ends it;
//   - `beforeCommit` runs between a transaction's update and its commit, so a
//     test can write as another device would in that moment;
//   - `failReads` fails that many reads, `readGate(path)` can hold one back;
//   - a callable answers with `answers[name](data)` and is recorded in
//     `calls`; one with no answer fails, as an undeployed function would.
//
// Only what the modules under test import exists; anything else refuses.
const state = (globalThis.__firestoreClient ||= {
  documents: new Map(),
  versions: new Map(),
  reads: [],
  commits: [],
  failReads: 0,
  readGate: null,
  beforeCommit: null,
  calls: [],
  answers: {},
});

export const resetFirestoreClient = () => {
  state.documents.clear();
  state.versions.clear();
  state.reads.length = 0;
  state.commits.length = 0;
  state.failReads = 0;
  state.readGate = null;
  state.beforeCommit = null;
  state.calls.length = 0;
  state.answers = {};
  return state;
};
export const firestoreClient = state;

export const db = { stub: 'db' };
export const functions = { stub: 'functions' };
export const auth = { stub: 'auth', currentUser: null };
export const app = { stub: 'app' };

const clone = (value) => (value === undefined ? undefined : structuredClone(value));
const firebaseError = (code, message) => Object.assign(new Error(message), { name: 'FirebaseError', code });
const RETRYABLE = new Set(['aborted', 'failed-precondition', 'already-exists', 'unavailable']);

class DocumentReference {
  constructor(path) {
    this.path = path;
    this.id = path.split('/').pop();
  }
}

export const doc = (_db, ...segments) => new DocumentReference(segments.join('/'));
const SERVER_TIMESTAMP = Object.freeze({ serverTimestamp: true });
export const serverTimestamp = () => SERVER_TIMESTAMP;

/** Write a document as another writer would (a new version). */
export const putDocument = (path, data) => {
  state.documents.set(path, clone(data));
  state.versions.set(path, (state.versions.get(path) || 0) + 1);
};

const snapshotOf = (path) => {
  const data = state.documents.get(path);
  return { id: path.split('/').pop(), exists: () => data !== undefined, data: () => clone(data) };
};

const readDocument = async (path, how) => {
  state.reads.push({ path, how });
  if (state.readGate) await state.readGate(path, how);
  if (state.failReads > 0) {
    state.failReads -= 1;
    throw firebaseError('unavailable', 'Failed to get document because the client is offline. (stub)');
  }
  return { snapshot: snapshotOf(path), version: state.versions.get(path) || 0 };
};

export const getDoc = async (reference) => (await readDocument(reference.path, 'getDoc')).snapshot;

const stamped = (data) => JSON.parse(JSON.stringify(data, (_key, value) => (value === SERVER_TIMESTAMP ? { stamped: 'server' } : value)));

export const runTransaction = async (_db, update, { maxAttempts = 5 } = {}) => {
  for (let attempt = 1; ; attempt += 1) {
    const readVersions = new Map();
    const writes = [];
    const transaction = {
      get: async (reference) => {
        const { snapshot, version } = await readDocument(reference.path, 'transaction');
        readVersions.set(reference.path, version);
        return snapshot;
      },
      set: (reference, data) => { writes.push([reference.path, data]); return transaction; },
    };
    let result;
    try {
      result = await update(transaction);
    } catch (error) {
      if (error?.name === 'FirebaseError' && RETRYABLE.has(error.code) && attempt < maxAttempts) continue;
      throw error;
    }
    if (state.beforeCommit) await state.beforeCommit();
    const stale = [...readVersions].some(([path, version]) => (state.versions.get(path) || 0) !== version);
    if (stale) {
      if (attempt < maxAttempts) continue;
      throw firebaseError('failed-precondition', 'The document changed since it was read. (stub)');
    }
    writes.forEach(([path, data]) => putDocument(path, stamped(data)));
    state.commits.push({ attempt, paths: writes.map(([path]) => path) });
    return result;
  }
};

const refused = (name) => () => { throw new Error(`${name} is not available in firestoreClientStub.mjs.`); };
export const collection = refused('collection');
export const getDocs = refused('getDocs');
export const limit = refused('limit');
export const orderBy = refused('orderBy');
export const query = refused('query');
export const where = refused('where');
export const onSnapshot = refused('onSnapshot');
export const setDoc = refused('setDoc');
export const updateDoc = refused('updateDoc');
export const httpsCallable = (_functions, name) => async (data) => {
  state.calls.push({ name, data });
  const answer = state.answers[name];
  if (typeof answer !== 'function') throw firebaseError('not-found', `The callable ${name} has no answer in firestoreClientStub.mjs.`);
  return { data: await answer(data) };
};
