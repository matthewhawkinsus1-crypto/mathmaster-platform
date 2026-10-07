// Running callables from functions/index.js AS WRITTEN, against a small,
// strict Firestore stand-in.
//
// The statement `exports.<name> = onCall(...)` is cut out of the source and
// evaluated with its module-level collaborators supplied here. The real
// top-level helpers a callable reaches (callerEmail, requireTeacher,
// readStudentRosterPresence, ...) are cut out the same way, so authorization
// and validation run exactly as deployed. A callable that starts depending on
// something this harness does not supply fails with a ReferenceError naming
// it, never silently.
//
// The stand-in models only what these callables use, and is strict about it:
// select() and field masks return ONLY the listed fields, update() of a missing
// document throws, where() supports '==' and 'in', and every read and write is
// recorded so a test can prove what was — and was not — loaded or changed.
// tests/platform/studentIdentityContract.test.mjs keeps its own, smaller copy.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { region } from './sourceContract.mjs';

const require = createRequire(import.meta.url);
export const authLib = require('../../../functions/lib/auth.js');

export const DELETE = Object.freeze({ fieldValue: 'delete' });
export const SERVER_TIME = Object.freeze({ fieldValue: 'serverTimestamp' });
const arrayOp = (op) => (...values) => Object.freeze({ fieldValue: op, values });
export const FAKE_FIELD_VALUE = Object.freeze({
  delete: () => DELETE,
  serverTimestamp: () => SERVER_TIME,
  arrayUnion: arrayOp('arrayUnion'),
  arrayRemove: arrayOp('arrayRemove'),
});

export const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
export const project = (data, fields) => (fields
  ? Object.fromEntries(fields.filter((field) => Object.hasOwn(data, field)).map((field) => [field, clone(data[field])]))
  : clone(data));

class FakeDocRef {
  constructor(db, collection, id) {
    Object.assign(this, { db, collection, id });
  }

  get path() {
    return `${this.collection}/${this.id}`;
  }

  async get() {
    this.db.reads.push({ collection: this.collection, id: this.id, fields: null, via: 'doc.get' });
    return this.db.snapshot(this.collection, this.id, null);
  }

  async set(payload, options = {}) {
    this.db.commit({ op: options?.merge ? 'merge' : 'set', ref: this, payload });
  }

  async update(payload) {
    this.db.commit({ op: 'update', ref: this, payload });
  }

  async delete() {
    this.db.commit({ op: 'delete', ref: this, payload: {} });
  }
}

class FakeQuery {
  constructor(db, collection, { fields = null, filters = [], limit = null } = {}) {
    Object.assign(this, { db, collection, fields, filters, limitCount: limit });
  }

  with(changes) {
    return new FakeQuery(this.db, this.collection, {
      fields: this.fields, filters: this.filters, limit: this.limitCount, ...changes,
    });
  }

  select(...fields) {
    return this.with({ fields });
  }

  where(field, op, value) {
    assert.ok(['==', 'in'].includes(op), `where('${field}', '${op}') is not modelled by this stand-in`);
    if (op === 'in') {
      assert.ok(Array.isArray(value) && value.length > 0 && value.length <= 30, 'Firestore `in` takes 1-30 values');
    }
    return this.with({ filters: [...this.filters, { field, op, value }] });
  }

  limit(count) {
    return this.with({ limit: count });
  }

  doc(id) {
    this.db.autoId += 1;
    return new FakeDocRef(this.db, this.collection, id ?? `auto-${this.db.autoId}`);
  }

  async add(payload) {
    const ref = this.doc();
    await ref.set(payload);
    return ref;
  }

  matches(data) {
    return this.filters.every(({ field, op, value }) => (op === 'in'
      ? value.some((entry) => entry === data[field])
      : data[field] === value));
  }

  run(via) {
    this.db.reads.push({
      collection: this.collection, id: null, fields: this.fields, via, filters: clone(this.filters),
    });
    let ids = [...this.db.docsOf(this.collection).entries()]
      .filter(([, data]) => this.matches(data))
      .map(([id]) => id);
    if (this.limitCount !== null) ids = ids.slice(0, this.limitCount);
    const docs = ids.map((id) => this.db.snapshot(this.collection, id, this.fields));
    return { docs, empty: docs.length === 0, size: docs.length };
  }

  async get() {
    return this.run('query.get');
  }
}

export class FakeFirestore {
  constructor(seed = {}) {
    this.collections = new Map(Object.entries(seed).map(([name, docs]) => [
      name,
      new Map(Object.entries(docs).map(([id, data]) => [id, clone(data)])),
    ]));
    this.reads = [];
    this.writes = [];
    this.autoId = 0;
  }

  docsOf(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return this.collections.get(name);
  }

  data(name, id) {
    return clone(this.docsOf(name).get(id));
  }

  /** Every document of every collection, deep-copied: for "nothing else changed". */
  dump() {
    return Object.fromEntries([...this.collections.entries()].map(([name, docs]) => [
      name,
      Object.fromEntries([...docs.entries()].map(([id, data]) => [id, clone(data)])),
    ]));
  }

  collection(name) {
    return new FakeQuery(this, name);
  }

  doc(path) {
    const [collection, id, ...rest] = String(path).split('/');
    assert.equal(rest.length, 0, `db.doc('${path}'): only top-level documents are modelled`);
    return new FakeDocRef(this, collection, id);
  }

  snapshot(collection, id, fields) {
    const stored = this.docsOf(collection).get(id);
    return {
      id,
      ref: new FakeDocRef(this, collection, id),
      exists: stored !== undefined,
      data: () => (stored === undefined ? undefined : project(stored, fields)),
    };
  }

  maskedReads(refs, via) {
    const options = refs.length && !(refs.at(-1) instanceof FakeDocRef) ? refs.pop() : {};
    const fields = options?.fieldMask ? [...options.fieldMask] : null;
    return refs.map((ref) => {
      this.reads.push({ collection: ref.collection, id: ref.id, fields, via });
      return this.snapshot(ref.collection, ref.id, fields);
    });
  }

  async getAll(...args) {
    return this.maskedReads(args, 'db.getAll');
  }

  /** A write batch: nothing lands until commit(), then everything does. */
  batch() {
    const pending = [];
    const batch = {
      set: (ref, payload, options = {}) => { pending.push({ op: options?.merge ? 'merge' : 'set', ref, payload }); return batch; },
      update: (ref, payload) => { pending.push({ op: 'update', ref, payload }); return batch; },
      delete: (ref) => { pending.push({ op: 'delete', ref, payload: {} }); return batch; },
      commit: async () => { pending.forEach((write) => this.commit(write)); },
    };
    return batch;
  }

  async runTransaction(callback) {
    const pending = [];
    const db = this;
    let wrote = false;
    const transaction = {
      async get(target) {
        assert.ok(!wrote, 'a Firestore transaction must finish its reads before it writes');
        if (target instanceof FakeQuery) return target.run('transaction.get(query)');
        db.reads.push({ collection: target.collection, id: target.id, fields: null, via: 'transaction.get' });
        return db.snapshot(target.collection, target.id, null);
      },
      async getAll(...args) {
        assert.ok(!wrote, 'a Firestore transaction must finish its reads before it writes');
        return db.maskedReads(args, 'transaction.getAll');
      },
      update(ref, payload) {
        wrote = true;
        pending.push({ op: 'update', ref, payload });
        return transaction;
      },
      set(ref, payload, options = {}) {
        wrote = true;
        pending.push({ op: options?.merge ? 'merge' : 'set', ref, payload });
        return transaction;
      },
    };
    const result = await callback(transaction);
    pending.forEach((write) => this.commit(write));
    return result;
  }

  commit({ op, ref, payload }) {
    const docs = this.docsOf(ref.collection);
    this.writes.push({ op, collection: ref.collection, id: ref.id, keys: Object.keys(payload) });
    if (op === 'delete') {
      docs.delete(ref.id);
      return;
    }
    if (op === 'update') assert.ok(docs.has(ref.id), `update() of missing ${ref.collection}/${ref.id} would fail in Firestore`);
    const next = op === 'set' ? {} : { ...docs.get(ref.id) };
    Object.entries(payload).forEach(([key, value]) => {
      assert.ok(!key.includes('.'), 'dotted update paths are not modelled by this stand-in');
      if (value === DELETE) delete next[key];
      else if (value?.fieldValue === 'arrayUnion') next[key] = [...new Set([...(next[key] || []), ...value.values])];
      else if (value?.fieldValue === 'arrayRemove') next[key] = (next[key] || []).filter((entry) => !value.values.includes(entry));
      else next[key] = clone(value);
    });
    docs.set(ref.id, next);
  }
}

export class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const SERVER = readFileSync(new URL('../../../functions/index.js', import.meta.url), 'utf8');
const constant = (name) => {
  const match = SERVER.match(new RegExp(`^const ${name} = "([^"]+)";`, 'm'));
  assert.ok(match, `functions/index.js no longer defines const ${name}; update serverCallableHarness.mjs`);
  return match[1];
};

/** One top-level `function name(` / `async function name(` declaration, verbatim. */
export const topLevelFunction = (name) => {
  const start = SERVER.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.notEqual(start, -1, `functions/index.js no longer defines ${name}(); update serverCallableHarness.mjs`);
  return SERVER.slice(start, SERVER.indexOf('\n}\n', start) + 2);
};

/** The source of `exports.<name> = onCall(...)`, verbatim. */
export const callableSource = (name) => `${region(SERVER, `exports.${name} = onCall(`, '\n});\n', name)}\n});`;

const HELPERS = [
  'callerEmail', 'requireTeacher', 'requireRootAdmin', 'translateAuthError', 'loadClasses',
  'isAuthorizedTeacher', 'assignClaims', 'readStudentRosterPresence', 'resolveCanonicalStudentId',
  'lookupJoinCode', 'resolveJoinCodeMembership', 'joinCodeMatchesRoster',
];

/**
 * Run one callable as written. `auth` stands in for firebase-admin/auth
 * (getUser / createUser / setCustomUserClaims / createCustomToken); claims it
 * is given are recorded on `auth.claims`.
 */
export const runServerCallable = async (name, { db, request, auth = fakeAdminAuth() }) => {
  const collaborators = {
    onCall: (handler) => handler,
    HttpsError,
    authLib,
    FieldValue: FAKE_FIELD_VALUE,
    getFirestore: () => db,
    getAuth: () => auth,
    logger: { info() {}, warn() {}, error() {} },
    studentIdentity: async () => import('../../../functions/shared/studentIdentity.mjs'),
    studentDistrictIds: async () => import('../../../functions/shared/studentDistrictId.mjs'),
    classModel: async () => import('../../../functions/shared/classModel.mjs'),
    rolePolicy: async () => import('../../../functions/shared/rolePolicy.mjs'),
    CLASS_COLLECTION: constant('CLASS_COLLECTION'),
    STUDENT_NOT_ON_ROSTER_MESSAGE: constant('STUDENT_NOT_ON_ROSTER_MESSAGE'),
    serializableDate: (value) => value ?? null,
  };
  const factory = new Function(
    ...Object.keys(collaborators),
    `"use strict";\n${HELPERS.map(topLevelFunction).join('\n')}\nconst exports = {};\n${callableSource(name)}\nreturn exports.${name};`,
  );
  try {
    return await factory(...Object.values(collaborators))(request);
  } catch (error) {
    if (error instanceof ReferenceError) {
      throw new Error(`${name} now depends on something this harness does not supply (${error.message}). Add it to serverCallableHarness.mjs.`);
    }
    throw error;
  }
};

/** A firebase-admin Auth stand-in: users, custom claims and custom tokens. */
export const fakeAdminAuth = () => {
  const users = new Set();
  const claims = new Map();
  return {
    users,
    claims,
    async getUser(uid) {
      if (!users.has(uid)) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
      return { uid };
    },
    async createUser({ uid }) {
      users.add(uid);
      return { uid };
    },
    async setCustomUserClaims(uid, value) {
      claims.set(uid, clone(value));
    },
    async createCustomToken(uid, value) {
      return `custom-token:${uid}:${JSON.stringify(value)}`;
    },
  };
};

/** A verified teacher's callable request. */
export const teacherRequest = (email, data = {}, { rootAdmin = false } = {}) => ({
  auth: {
    uid: `uid-${email}`,
    token: { role: 'teacher', email, email_verified: true, ...(rootAdmin ? { admin: true, rootAdmin: true } : {}) },
  },
  data,
});
