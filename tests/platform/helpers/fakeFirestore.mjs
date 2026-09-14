// A Firestore stand-in, small enough to read and honest about what it models.
//
// The Path release engine's interesting properties — resume after an
// interruption, never rewrite an unchanged document, never activate twice,
// delete superseded content only after activation — are properties of the
// SEQUENCE of Firestore operations. This records that sequence, counts it, and
// can fail a commit on demand, which is what "the process stopped after chunk N"
// means in a test.
//
// It implements only the surface the release engine actually uses. An emulator
// certification (tests/integration/pathReleaseV2Resume.test.mjs) proves the same
// contracts against real Firestore.

class InterruptedCommit extends Error {
  constructor(message = 'Simulated Firestore interruption.') {
    super(message);
    this.name = 'InterruptedCommit';
  }
}

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

class FakeDocumentReference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').pop();
  }

  collection(id) {
    return new FakeCollectionReference(this.db, `${this.path}/${id}`);
  }

  async get() {
    this.db.counters.reads += 1;
    return this.db.snapshotFor(this.path);
  }

  async set(data, options = {}) {
    this.db.counters.writes += 1;
    this.db.applySet(this.path, data, options);
  }

  async delete() {
    this.db.counters.deletes += 1;
    this.db.documents.delete(this.path);
  }
}

class FakeQuery {
  constructor(collection, { orderBy = null, limit = null } = {}) {
    this.collection = collection;
    this._orderBy = orderBy;
    this._limit = limit;
  }

  orderBy(field, direction = 'asc') {
    return new FakeQuery(this.collection, { orderBy: { field, direction }, limit: this._limit });
  }

  limit(count) {
    return new FakeQuery(this.collection, { orderBy: this._orderBy, limit: count });
  }

  async get() {
    const db = this.collection.db;
    let docs = db.documentsIn(this.collection.path);
    if (this._orderBy) {
      const { field, direction } = this._orderBy;
      docs = [...docs].sort((left, right) => {
        const a = left.data()?.[field];
        const b = right.data()?.[field];
        const order = a === b ? 0 : (a > b ? 1 : -1);
        return direction === 'desc' ? -order : order;
      });
    }
    if (this._limit != null) docs = docs.slice(0, this._limit);
    db.counters.reads += docs.length || 1;
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeCollectionReference extends FakeQuery {
  constructor(db, path) {
    super(null);
    this.db = db;
    this.path = path;
    this.collection = this;
  }

  doc(id) {
    return new FakeDocumentReference(this.db, `${this.path}/${id}`);
  }
}

class FakeWriteBatch {
  constructor(db) {
    this.db = db;
    this.operations = [];
  }

  set(ref, data, options = {}) {
    this.operations.push({ type: 'set', path: ref.path, data, options });
    return this;
  }

  delete(ref) {
    this.operations.push({ type: 'delete', path: ref.path });
    return this;
  }

  async commit() {
    this.db.counters.commits += 1;
    this.db.commitLog.push(this.operations.map((operation) => `${operation.type}:${operation.path}`));
    if (this.db.failCommitsFrom != null && this.db.counters.commits >= this.db.failCommitsFrom) {
      // The commit is refused BEFORE any document changes, which is the
      // behaviour that matters: an interrupted release must not leave a
      // half-written chunk behind.
      throw new InterruptedCommit(`Commit ${this.db.counters.commits} interrupted by the test.`);
    }
    this.operations.forEach((operation) => {
      if (operation.type === 'delete') {
        this.db.counters.deletes += 1;
        this.db.documents.delete(operation.path);
        return;
      }
      this.db.counters.writes += 1;
      this.db.applySet(operation.path, operation.data, operation.options);
    });
  }
}

export class FakeFirestore {
  constructor() {
    this.documents = new Map();
    this.counters = { reads: 0, writes: 0, deletes: 0, commits: 0 };
    this.commitLog = [];
    this.failCommitsFrom = null;
  }

  collection(path) {
    return new FakeCollectionReference(this, path);
  }

  doc(path) {
    return new FakeDocumentReference(this, path);
  }

  batch() {
    return new FakeWriteBatch(this);
  }

  async getAll(...refs) {
    this.counters.reads += refs.length;
    return refs.map((ref) => this.snapshotFor(ref.path));
  }

  snapshotFor(path) {
    const data = this.documents.get(path);
    return {
      id: path.split('/').pop(),
      ref: new FakeDocumentReference(this, path),
      exists: data !== undefined,
      data: () => clone(data),
    };
  }

  applySet(path, data, options = {}) {
    const next = clone(data) ?? {};
    if (options.merge && this.documents.has(path)) {
      this.documents.set(path, { ...this.documents.get(path), ...next });
      return;
    }
    this.documents.set(path, next);
  }

  /** Documents whose immediate parent is this collection path. */
  documentsIn(collectionPath) {
    const prefix = `${collectionPath}/`;
    return [...this.documents.keys()]
      .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .sort()
      .map((path) => this.snapshotFor(path));
  }

  /** Seed a document without counting it as production work. */
  seed(path, data) {
    this.documents.set(path, clone(data));
  }

  /** Every commit from this one on throws. Simulates a stopped process. */
  interruptFromCommit(index) {
    this.failCommitsFrom = index;
  }

  resume() {
    this.failCommitsFrom = null;
  }

  countIn(collectionPath) {
    return this.documentsIn(collectionPath).length;
  }

  resetCounters() {
    this.counters = { reads: 0, writes: 0, deletes: 0, commits: 0 };
    this.commitLog = [];
  }
}

export const createFakeFirestore = () => new FakeFirestore();
export { InterruptedCommit };
