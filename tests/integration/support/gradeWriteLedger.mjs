/*
 * EVERY WRITE ONE SUBMIT CAUSES, AND EVERY TRIGGER IT WAKES.
 *
 * For tests/integration/gradeWritesPerSubmit.test.mjs. A student's grades
 * document (grades/{studentId}) is the one document whose every change runs
 * Cloud Functions: `syncGradeToClassroom` and `syncSectionGradeToClassroom`
 * are both `onDocumentWritten("grades/{studentId}")`, and every teacher
 * listening to the gradebook or the live monitor is sent the document again.
 * So this counts, per step of a Submit:
 *
 *   writes     every document the server's Admin SDK committed (WriteBatch
 *              `_commit`: single writes, batches and transactions alike), and
 *              every write the harness makes as the student's own browser
 *              (`clientWrite`), with who made it, which document, which fields
 *              and whether it changed the document;
 *   reads      what each actor read, so a trigger invocation that exits at
 *              once (no reads) is told apart from one that does Classroom work;
 *   triggers   both grades triggers, run the way Firestore delivers them: one
 *              event per write that CHANGED grades/{studentId} (Firestore sends
 *              no event for a write that leaves a document as it was), in
 *              commit order, until no trigger write is left to deliver. A
 *              trigger's own write-back is delivered too, as in production.
 *
 * Who did it is an AsyncLocalStorage context (`asActor`), carried through
 * every await of a callable or trigger. Test-only: nothing in functions/ or
 * src/ imports it. It wraps the functions/ copy of @google-cloud/firestore,
 * which is what functions/index.js and every server module write through.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const functionsRequire = createRequire(path.join(repo, 'functions/package.json'));
const sdk = (file) => functionsRequire(`@google-cloud/firestore/build/src/${file}`);

const MARK = Symbol.for('mathmaster.gradeWriteLedger');
const context = new AsyncLocalStorage();

/** grades/{studentId} itself: the document both Classroom triggers watch. */
export const isGradeDocumentPath = (documentPath) => /^grades\/[^/]+$/.test(String(documentPath || ''));
/** grades/{studentId}/responseDetail/{assignmentId}: a record's detail (#561). */
export const isResponseDetailPath = (documentPath) => /^grades\/[^/]+\/responseDetail\/[^/]+$/.test(String(documentPath || ''));

const state = {
  installed: false,
  db: null,
  seq: 0,
  writes: [],
  reads: [],
  invocations: [],
  // The last state the ledger saw of each grades document it follows.
  known: new Map(),
  // Changes Firestore would deliver to the grades triggers, in commit order.
  pending: [],
  triggers: [],
};

export const actorNow = () => context.getStore()?.actor || 'harness';

/** Run `fn` as `actor`: every read and write inside it is that actor's. */
export const asActor = (actor, fn) => context.run({ actor }, fn);

/* A Firestore field path as the update mask spells it, unescaped. */
const unescapePath = (fieldPath) => String(fieldPath)
  .split(/\.(?=(?:[^`]*`[^`]*`)*[^`]*$)/)
  .map((segment) => segment.replace(/^`|`$/g, '').replace(/\\`/g, '`'))
  .join('.');

const describeWrite = (proto = {}) => {
  if (proto.delete) return { kind: 'delete', fields: [] };
  const mask = proto.updateMask?.fieldPaths || null;
  const transforms = (proto.updateTransforms || []).map((transform) => unescapePath(transform.fieldPath));
  const exists = proto.currentDocument?.exists;
  const kind = exists === true ? 'update' : exists === false ? 'create' : mask ? 'set(merge)' : 'set';
  const fields = mask
    ? mask.map(unescapePath)
    : Object.keys(proto.update?.fields || {});
  return { kind, fields: [...new Set([...fields, ...transforms])].sort() };
};

const plain = (value) => (value === undefined ? null : value);

/** A document's data with Firestore values made comparable. */
const comparable = (data) => (data ? JSON.parse(JSON.stringify(data, (key, value) => {
  if (value && typeof value === 'object' && typeof value.toMillis === 'function') return { __ts: value.toMillis(), __ns: value.nanoseconds ?? null };
  return value;
})) : null);

// The ledger's own reads are its own: they never count as the actor's.
const readNow = (documentPath) => context.run({ actor: 'ledger' }, async () => {
  const snapshot = await state.db.doc(documentPath).get();
  return snapshot.exists ? (snapshot.data() || {}) : null;
});

/*
 * After a committed write to a followed grades document: did it change the
 * document? If so, Firestore delivers one event to each grades trigger.
 */
const observeGradeDocument = async (documentPath, entry) => {
  if (!state.known.has(documentPath)) return;
  const before = state.known.get(documentPath);
  const after = await readNow(documentPath);
  const changed = !isDeepStrictEqual(comparable(before), comparable(after));
  entry.changed = changed;
  state.known.set(documentPath, after);
  if (changed) state.pending.push({ documentPath, before, after, cause: entry.seq });
};

const recordRead = (documentPath, count = 1) => {
  state.reads.push({ actor: actorNow(), path: String(documentPath), count });
};

/** Install the counters in this process (idempotent). */
export function installGradeWriteLedger({ db }) {
  state.db = db;
  if (state.installed) return ledger;
  const { WriteBatch } = sdk('write-batch.js');
  const { DocumentReader } = sdk('document-reader.js');
  const { Query } = sdk('reference/query.js');
  if (WriteBatch.prototype._commit[MARK]) { state.installed = true; return ledger; }

  const commit = WriteBatch.prototype._commit;
  WriteBatch.prototype._commit = async function ledgerCommit(...args) {
    const ops = (this._ops || []).map((op) => ({ path: op.docPath, ...describeWrite(op.op()) }));
    const transactional = Boolean(args[0]?.transactionId);
    const actor = actorNow();
    const response = await commit.apply(this, args);
    const commitId = (state.seq += 1);
    const entries = ops.map((op) => ({
      seq: (state.seq += 1), commitId, actor, transactional, changed: null, client: false, ...op,
    }));
    state.writes.push(...entries);
    for (const entry of entries) {
      // eslint-disable-next-line no-await-in-loop
      if (isGradeDocumentPath(entry.path)) await observeGradeDocument(entry.path, entry);
    }
    return response;
  };
  WriteBatch.prototype._commit[MARK] = true;

  const readerGet = DocumentReader.prototype._get;
  DocumentReader.prototype._get = async function ledgerGet(...args) {
    const response = await readerGet.apply(this, args);
    (response?.result || []).forEach((snapshot) => recordRead(snapshot?.ref?.path || ''));
    return response;
  };
  const queryGet = Query.prototype._get;
  Query.prototype._get = async function ledgerQuery(...args) {
    const response = await queryGet.apply(this, args);
    const parent = this._queryOptions?.parentPath?.relativeName || '';
    const collectionPath = [parent, this._queryOptions?.collectionId].filter(Boolean).join('/');
    // A query that returns nothing is still billed one read.
    recordRead(`${collectionPath}/*`, Math.max(1, Number(response?.result?.size) || 0));
    return response;
  };

  state.installed = true;
  return ledger;
}

/** Follow a student's grades document: start from what is stored now. */
export async function followGradeDocument(studentId) {
  const documentPath = `grades/${studentId}`;
  state.known.set(documentPath, await readNow(documentPath));
}

/*
 * A write the student's own browser makes (the activity flush, a response
 * checkpoint): the harness performs it with the client SDK under the real
 * rules, and records it here with the paths and fields it names.
 */
export async function clientWrite(actor, writes, fn) {
  const result = await fn();
  const commitId = (state.seq += 1);
  for (const write of writes) {
    const entry = {
      seq: (state.seq += 1), commitId, actor, transactional: Boolean(write.transactional), changed: null, client: true,
      path: write.path, kind: write.kind || 'update', fields: [...(write.fields || [])].sort(),
    };
    state.writes.push(entry);
    // eslint-disable-next-line no-await-in-loop
    if (isGradeDocumentPath(entry.path)) await observeGradeDocument(entry.path, entry);
  }
  return result;
}

/** The grades triggers, as `{ name, fn }`: each must expose `.run(event)` (firebase-functions v2). */
export function useGradeTriggers(triggers) {
  state.triggers = triggers;
}

/*
 * Deliver every pending grades-document change to every grades trigger, in
 * commit order, including the changes the triggers' own write-backs make.
 */
export async function settleGradeTriggers({ maxEvents = 60 } = {}) {
  let delivered = 0;
  while (state.pending.length) {
    if ((delivered += 1) > maxEvents) throw new Error('The grades triggers did not settle: a trigger keeps writing the document it watches.');
    const event = state.pending.shift();
    const studentId = event.documentPath.split('/')[1];
    for (const trigger of state.triggers) {
      const actor = `trigger:${trigger.name}`;
      const readsBefore = state.reads.length;
      const writesBefore = state.writes.length;
      // eslint-disable-next-line no-await-in-loop
      await asActor(actor, () => trigger.fn.run({
        params: { studentId },
        data: {
          before: { exists: event.before !== null, data: () => plain(event.before) || undefined },
          after: { exists: event.after !== null, data: () => plain(event.after) || undefined, ref: state.db.doc(event.documentPath) },
        },
      }));
      const reads = state.reads.slice(readsBefore).filter((read) => read.actor === actor)
        .reduce((total, read) => total + read.count, 0);
      const writes = state.writes.slice(writesBefore).filter((write) => write.actor === actor);
      state.invocations.push({
        trigger: trigger.name, documentPath: event.documentPath, cause: event.cause,
        reads, writes: writes.length, didWork: reads > 0,
      });
    }
  }
}

/** A mark to measure from: everything recorded after it belongs to the step. */
export const mark = () => ({ writes: state.writes.length, reads: state.reads.length, invocations: state.invocations.length });

/** Everything recorded since `from` (a `mark()`), as plain data. */
export function since(from) {
  return {
    writes: state.writes.slice(from.writes).map((entry) => ({ ...entry, fields: [...entry.fields] })),
    reads: state.reads.slice(from.reads),
    invocations: state.invocations.slice(from.invocations),
  };
}

/** The pending trigger events (none, once settled). */
export const pendingEvents = () => state.pending.length;

const ledger = Object.freeze({
  installGradeWriteLedger, followGradeDocument, clientWrite, useGradeTriggers, settleGradeTriggers, mark, since, asActor,
});
export default ledger;
