/*
 * In-memory Firestore for the teacher-workflow harness. NEVER production.
 *
 * The harness serves the real App.jsx with `firebase/*` aliased to these
 * fakes (see vite.config.mjs), so every teacher screen, hand-off and write
 * runs exactly as in the product while nothing leaves the browser. The store
 * persists to localStorage so a reload keeps state; `?reset=1` reseeds.
 *
 * Implements only the Firestore surface the app imports.
 */
import { buildTeacherWorkflowFixture } from './fixture.js';

const STORAGE_KEY = 'mm-teacher-workflow-harness-db-v1';

export class Timestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromMillis(ms) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  static fromDate(date) { return Timestamp.fromMillis(date.getTime()); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate() { return new Date(this.toMillis()); }
  valueOf() { return this.toMillis(); }
  toJSON() { return new Date(this.toMillis()).toISOString(); }
}

const SERVER_TS = Symbol('serverTimestamp');
const DELETE = Symbol('deleteField');
const ARRAY_UNION = Symbol('arrayUnion');
const ARRAY_REMOVE = Symbol('arrayRemove');
export const serverTimestamp = () => ({ [SERVER_TS]: true });
export const deleteField = () => ({ [DELETE]: true });
export const arrayUnion = (...values) => ({ [ARRAY_UNION]: values });
export const arrayRemove = (...values) => ({ [ARRAY_REMOVE]: values });

// arrayUnion / arrayRemove resolved against the value already stored.
const resolveArrayTransform = (existing, value) => {
  const base = Array.isArray(existing) ? existing : [];
  if (value && value[ARRAY_UNION]) {
    const out = [...base];
    value[ARRAY_UNION].forEach((entry) => { if (!out.some((item) => JSON.stringify(item) === JSON.stringify(entry))) out.push(entry); });
    return out;
  }
  if (value && value[ARRAY_REMOVE]) {
    return base.filter((item) => !value[ARRAY_REMOVE].some((entry) => JSON.stringify(item) === JSON.stringify(entry)));
  }
  return undefined;
};

export class FieldPath { constructor(...segments) { this.segments = segments.map(String); } }

const isPlain = (value) => value && typeof value === 'object' && !(value instanceof Timestamp) && !Array.isArray(value);
const clone = (value) => {
  if (value instanceof Timestamp) return value;
  if (Array.isArray(value)) return value.map(clone);
  if (isPlain(value)) {
    if (value[SERVER_TS]) return Timestamp.now();
    if (value[ARRAY_UNION] || value[ARRAY_REMOVE]) return resolveArrayTransform([], value);
    return Object.fromEntries(Object.entries(value).filter(([, v]) => !(v && v[DELETE])).map(([k, v]) => [k, clone(v)]));
  }
  return value;
};

const serialize = (value) => {
  if (value instanceof Timestamp) return { __ts: value.toMillis() };
  if (Array.isArray(value)) return value.map(serialize);
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  return value;
};
const revive = (value) => {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.__ts === 'number') return Timestamp.fromMillis(value.__ts);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
  }
  return value;
};

const store = new Map();
const listeners = new Set();
// What the app asked of "Firestore", for the endurance journeys: document
// reads by path, listeners opened by path, and how many are open right now.
const stats = { reads: new Map(), subscriptions: new Map() };
const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const targetPath = (target) => (target?.type === 'query' ? target.collectionPath : target?.path) || '';

const persist = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...store.entries()].map(([path, data]) => [path, serialize(data)]))); } catch { /* quota: harness only */ }
};
const loadOrSeed = () => {
  const params = new URLSearchParams(window.location.search);
  const saved = params.get('reset') ? null : localStorage.getItem(STORAGE_KEY);
  store.clear();
  if (saved) {
    JSON.parse(saved).forEach(([path, data]) => store.set(path, revive(data)));
    return;
  }
  const fixture = buildTeacherWorkflowFixture({ now: Date.now(), Timestamp, params });
  Object.entries(fixture).forEach(([path, data]) => store.set(path, clone(data)));
  persist();
};
loadOrSeed();

let notifyQueued = false;
const notify = () => {
  persist();
  if (notifyQueued) return;
  notifyQueued = true;
  setTimeout(() => {
    notifyQueued = false;
    listeners.forEach((listener) => listener.emit());
  }, 0);
};

class DocumentReference {
  constructor(path) { this.type = 'document'; this.path = path; this.id = path.split('/').pop(); }
  get parent() { return new CollectionReference(this.path.split('/').slice(0, -1).join('/')); }
}
class CollectionReference {
  constructor(path) { this.type = 'collection'; this.path = path; this.id = path.split('/').pop(); }
}
class Query {
  constructor(collectionPath, constraints) { this.type = 'query'; this.collectionPath = collectionPath; this.constraints = constraints; }
}

const db = { type: 'firestore', app: { name: 'harness' } };
export const initializeFirestore = () => db;
export const getFirestore = () => db;
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const connectFirestoreEmulator = () => {};

const autoId = () => `auto_${Math.random().toString(36).slice(2, 12)}`;
export const collection = (parent, ...segments) => {
  const base = parent?.type === 'document' || parent?.type === 'collection' ? `${parent.path}/` : '';
  return new CollectionReference(`${base}${segments.join('/')}`);
};
export const doc = (parent, ...segments) => {
  if (parent?.type === 'collection') return new DocumentReference(`${parent.path}/${segments.length ? segments.join('/') : autoId()}`);
  if (parent?.type === 'document') return new DocumentReference(`${parent.path}/${segments.join('/')}`);
  return new DocumentReference(segments.join('/'));
};

export const where = (field, op, value) => ({ kind: 'where', field, op, value });
export const orderBy = (field, direction = 'asc') => ({ kind: 'orderBy', field, direction });
export const limit = (count) => ({ kind: 'limit', count });
export const query = (ref, ...constraints) => new Query(ref.type === 'query' ? ref.collectionPath : ref.path, [...(ref.constraints || []), ...constraints]);

const getField = (data, field) => String(field).split('.').reduce((current, key) => (current == null ? undefined : current[key]), data);
const comparable = (value) => (value instanceof Timestamp ? value.toMillis() : value);
const matches = (data, { field, op, value }) => {
  const actual = comparable(getField(data, field));
  const expected = comparable(value);
  switch (op) {
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    case '<': return actual < expected;
    case '<=': return actual <= expected;
    case '>': return actual > expected;
    case '>=': return actual >= expected;
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'not-in': return Array.isArray(expected) && !expected.includes(actual);
    case 'array-contains': return Array.isArray(actual) && actual.includes(expected);
    case 'array-contains-any': return Array.isArray(actual) && Array.isArray(expected) && expected.some((entry) => actual.includes(entry));
    default: return true;
  }
};

const docSnapshot = (path) => {
  const data = store.get(path);
  const ref = new DocumentReference(path);
  return { id: ref.id, ref, exists: () => data !== undefined, data: () => (data === undefined ? undefined : clone(data)), get: (field) => getField(data, field) };
};
const childrenOf = (collectionPath) => [...store.keys()].filter((path) => {
  if (!path.startsWith(`${collectionPath}/`)) return false;
  return !path.slice(collectionPath.length + 1).includes('/');
});
const runQuery = (target) => {
  const collectionPath = target.type === 'query' ? target.collectionPath : target.path;
  const constraints = target.type === 'query' ? target.constraints : [];
  let paths = childrenOf(collectionPath).filter((path) => constraints.filter((entry) => entry.kind === 'where').every((entry) => matches(store.get(path), entry)));
  constraints.filter((entry) => entry.kind === 'orderBy').reverse().forEach(({ field, direction }) => {
    paths = paths.slice().sort((left, right) => {
      const a = comparable(getField(store.get(left), field)); const b = comparable(getField(store.get(right), field));
      if (a === b) return 0;
      return (a > b ? 1 : -1) * (direction === 'desc' ? -1 : 1);
    });
  });
  const limitEntry = constraints.find((entry) => entry.kind === 'limit');
  if (limitEntry) paths = paths.slice(0, limitEntry.count);
  const docs = paths.map(docSnapshot);
  return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn), docChanges: () => docs.map((entry) => ({ type: 'added', doc: entry })) };
};

export const getDoc = async (ref) => { bump(stats.reads, ref.path); return docSnapshot(ref.path); };
export const getDocs = async (target) => runQuery(target);

export const onSnapshot = (target, ...rest) => {
  const handlers = rest.filter((entry) => typeof entry === 'function');
  const [onNext, onError] = handlers.length ? handlers : [rest[1]?.next, rest[1]?.error];
  const listener = {
    emit: () => {
      try { onNext?.(target.type === 'document' ? docSnapshot(target.path) : runQuery(target)); } catch (error) { onError?.(error); }
    },
  };
  listeners.add(listener);
  bump(stats.subscriptions, targetPath(target));
  setTimeout(() => listener.emit(), 0);
  return () => listeners.delete(listener);
};

const setNested = (target, segments, value) => {
  let cursor = target;
  segments.slice(0, -1).forEach((segment) => {
    if (!isPlain(cursor[segment])) cursor[segment] = {};
    cursor = cursor[segment];
  });
  const last = segments[segments.length - 1];
  if (value && value[DELETE]) delete cursor[last];
  else if (value && (value[ARRAY_UNION] || value[ARRAY_REMOVE])) cursor[last] = resolveArrayTransform(cursor[last], value);
  else cursor[last] = clone(value);
};
const deepMerge = (base, patch) => {
  const out = isPlain(base) ? { ...base } : {};
  Object.entries(patch).forEach(([key, value]) => {
    if (value && value[DELETE]) delete out[key];
    else if (value && (value[ARRAY_UNION] || value[ARRAY_REMOVE])) out[key] = resolveArrayTransform(out[key], value);
    else if (isPlain(value) && !value[SERVER_TS]) out[key] = deepMerge(out[key], value);
    else out[key] = clone(value);
  });
  return out;
};

const writeSet = (ref, data, options = {}) => {
  store.set(ref.path, options?.merge ? deepMerge(store.get(ref.path), data) : clone(data));
};
const writeUpdate = (ref, args) => {
  const existing = store.get(ref.path);
  if (existing === undefined) {
    const error = new Error(`No document to update: ${ref.path}`);
    error.code = 'not-found';
    throw error;
  }
  const next = clone(existing);
  if (args[0] instanceof FieldPath || typeof args[0] === 'string') {
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index];
      setNested(next, key instanceof FieldPath ? key.segments : String(key).split('.'), args[index + 1]);
    }
  } else {
    Object.entries(args[0] || {}).forEach(([key, value]) => setNested(next, key.split('.'), value));
  }
  store.set(ref.path, next);
};

export const setDoc = async (ref, data, options) => { writeSet(ref, data, options); notify(); };
export const updateDoc = async (ref, ...args) => { writeUpdate(ref, args); notify(); };
export const addDoc = async (collectionRef, data) => { const ref = doc(collectionRef); writeSet(ref, data); notify(); return ref; };
export const deleteDoc = async (ref) => { store.delete(ref.path); notify(); };

export const writeBatch = () => {
  const ops = [];
  return {
    set: (ref, data, options) => { ops.push(() => writeSet(ref, data, options)); },
    update: (ref, ...args) => { ops.push(() => writeUpdate(ref, args)); },
    delete: (ref) => { ops.push(() => store.delete(ref.path)); },
    commit: async () => { ops.forEach((op) => op()); notify(); },
  };
};

export const runTransaction = async (_db, fn) => {
  const tx = {
    get: async (ref) => docSnapshot(ref.path),
    set: (ref, data, options) => { writeSet(ref, data, options); return tx; },
    update: (ref, ...args) => { writeUpdate(ref, args); return tx; },
    delete: (ref) => { store.delete(ref.path); return tx; },
  };
  const result = await fn(tx);
  notify();
  return result;
};

/* Driver/debug surface for scripted scenarios. */
export const harnessStore = {
  get: (path) => clone(store.get(path)),
  set: (path, data) => { store.set(path, clone(data)); notify(); },
  update: (path, patch) => { writeUpdate(new DocumentReference(path), [patch]); notify(); },
  paths: (prefix = '') => [...store.keys()].filter((path) => path.startsWith(prefix)),
  reset: () => { localStorage.removeItem(STORAGE_KEY); window.location.search = '?reset=1'; },
  stats: () => ({
    openListeners: listeners.size,
    reads: Object.fromEntries(stats.reads),
    subscriptions: Object.fromEntries(stats.subscriptions),
  }),
  resetStats: () => { stats.reads.clear(); stats.subscriptions.clear(); },
};
if (typeof window !== 'undefined') window.__mmHarnessStore = harnessStore;

// Live presence needs heartbeats to stay "online". The fixture marks which
// students are simulated as working; keep their heartbeat fresh.
setInterval(() => {
  const now = Date.now();
  let touched = false;
  [...store.keys()].filter((path) => path.startsWith('presence/')).forEach((path) => {
    const data = store.get(path);
    if (!data?.__simulated) return;
    store.set(path, { ...data, updatedAt: now, lastInteractionAt: data.__idle ? data.lastInteractionAt : now - 5_000 });
    touched = true;
  });
  if (touched) notify();
}, 15_000);
