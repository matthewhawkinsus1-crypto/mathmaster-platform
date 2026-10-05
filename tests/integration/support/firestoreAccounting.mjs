/*
 * WHAT THE SERVER READ AND WROTE, COUNTED THE WAY FIRESTORE BILLS IT.
 *
 * For the Live Challenge standings profile (scripts/profile-live-challenge-
 * standings.mjs) and the launch certification. Wraps the internals of the
 * Admin SDK (@google-cloud/firestore, the copy functions/index.js loads) in
 * this thread only:
 *
 *   a document fetched      one read (a missing document too)
 *   a query                 one read per document returned, one when it returns none
 *   an aggregation          one read (per 1,000 index entries; one at class scale)
 *   a commit                one write per document it writes, and its commit time
 *
 * Only work done INSIDE a callable counts: the harness runs callables inside
 * `runAsCallable(name, fn)`, and AsyncLocalStorage carries that context through
 * every await of the handler. The harness's own polling (waitUntil reading the
 * private players, the room) runs outside any callable and is recorded as
 * `harness`, so it never inflates what the server is said to cost.
 *
 * Test-only. Nothing in functions/ or src/ imports it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const functionsRequire = createRequire(path.join(repo, 'functions/package.json'));
const sdk = (file) => functionsRequire(`@google-cloud/firestore/build/src/${file}`);

const MARK = Symbol.for('mathmaster.firestoreAccounting');
const context = new AsyncLocalStorage();

/** The kind of document a path names, for the per-round breakdown. */
export const categoryOf = (documentPath = '') => {
  const parts = String(documentPath).split('/').filter(Boolean);
  const [root, , sub] = parts;
  if (root === 'liveChallengeRooms') {
    if (!sub) return 'room';
    return { players: 'publicPlayers', rounds: 'publicRounds', standings: 'standings', diagnostics: 'diagnostics' }[sub] || `room/${sub}`;
  }
  if (root === 'liveChallengePrivate') {
    if (!sub) return 'private';
    return { players: 'privatePlayers', rounds: 'privateRounds' }[sub] || `private/${sub}`;
  }
  return {
    liveChallengeInvites: 'invites',
    liveChallengeMatchResults: 'matchResults',
    liveChallengeReports: 'reports',
    liveChallengeExperience: 'experience',
    liveChallengeTeacherActive: 'teacherActive',
    pathQuestionBank: 'bank',
    grades: 'grades',
    classes: 'classes',
  }[root] || root || 'unknown';
};

const timestampMs = (value) => {
  if (!value) return null;
  const seconds = Number(value.seconds ?? 0);
  const nanos = Number(value.nanos ?? 0);
  return Number.isFinite(seconds) ? seconds * 1000 + Math.floor(nanos / 1e6) : null;
};

const state = {
  installed: false,
  // { t, op: 'read'|'write', cat, n, callable, path? }
  events: [],
  // One per callable invocation: { name, callId, startedAt, endedAt, commits: [commitMs...], ok }
  calls: [],
  // Commit times of public player-row and standings writes: { t, paths }
  commits: [],
  seq: 0,
};

const record = (op, documentPath, n = 1) => {
  const store = context.getStore();
  state.events.push({ t: Date.now(), op, cat: categoryOf(documentPath), n, callable: store?.name || 'harness' });
};

/** Install the counters in this thread (idempotent). */
export function installFirestoreAccounting() {
  if (state.installed) return accounting;
  const { DocumentReader } = sdk('document-reader.js');
  const { Query } = sdk('reference/query.js');
  const { AggregateQuery } = sdk('reference/aggregate-query.js');
  const { WriteBatch } = sdk('write-batch.js');
  if (DocumentReader.prototype._get[MARK]) { state.installed = true; return accounting; }

  const readerGet = DocumentReader.prototype._get;
  DocumentReader.prototype._get = async function accountedGet(...args) {
    const response = await readerGet.apply(this, args);
    (response?.result || []).forEach((snapshot) => record('read', snapshot?.ref?.path || ''));
    return response;
  };
  DocumentReader.prototype._get[MARK] = true;

  const queryGet = Query.prototype._get;
  Query.prototype._get = async function accountedQuery(...args) {
    const response = await queryGet.apply(this, args);
    const size = Number(response?.result?.size) || 0;
    const parent = this._queryOptions?.parentPath?.relativeName || '';
    const collectionPath = [parent, this._queryOptions?.collectionId].filter(Boolean).join('/');
    // A query that returns nothing is still billed one read.
    record('read', `${collectionPath}/_`, Math.max(1, size));
    return response;
  };

  const aggregateGet = AggregateQuery.prototype._get;
  AggregateQuery.prototype._get = async function accountedAggregate(...args) {
    const response = await aggregateGet.apply(this, args);
    const query = this._query;
    const parent = query?._queryOptions?.parentPath?.relativeName || '';
    record('read', `${[parent, query?._queryOptions?.collectionId].filter(Boolean).join('/')}/_`, 1);
    return response;
  };

  const commit = WriteBatch.prototype._commit;
  WriteBatch.prototype._commit = async function accountedCommit(...args) {
    const paths = (this._ops || []).map((op) => op.docPath);
    const response = await commit.apply(this, args);
    const commitMs = timestampMs(response?.commitTime) ?? Date.now();
    paths.forEach((docPath) => record('write', docPath));
    const store = context.getStore();
    if (store) store.commits.push(commitMs);
    const interesting = paths.filter((docPath) => /\/(players|standings)\//.test(docPath));
    if (interesting.length) state.commits.push({ t: commitMs, paths: interesting, callable: store?.name || 'harness' });
    return response;
  };

  state.installed = true;
  return accounting;
}

/**
 * Run `fn` as one callable invocation: its reads and writes are attributed to
 * `name`, and its span (start, commits, end) is kept.
 */
export async function runAsCallable(name, fn, extra = {}) {
  state.seq += 1;
  const call = { name, callId: state.seq, startedAt: Date.now(), endedAt: null, commits: [], ok: null, ...extra };
  state.calls.push(call);
  try {
    const result = await context.run(call, fn);
    call.ok = true;
    return result;
  } catch (error) {
    call.ok = false;
    call.code = error?.code || null;
    throw error;
  } finally {
    call.endedAt = Date.now();
  }
}

/** Everything recorded since `sinceMs` (or all of it), as plain data. */
export const accountingSince = (sinceMs = 0) => ({
  events: state.events.filter((event) => event.t >= sinceMs),
  calls: state.calls.filter((call) => call.startedAt >= sinceMs),
  commits: state.commits.filter((entry) => entry.t >= sinceMs),
});

export const resetAccounting = () => {
  state.events.length = 0;
  state.calls.length = 0;
  state.commits.length = 0;
};

/**
 * Sum events into { reads: {cat: n}, writes: {cat: n}, readsTotal, writesTotal }
 * between two instants, server work only (harness excluded unless asked).
 */
export const summarizeAccounting = (events = [], { fromMs = -Infinity, toMs = Infinity, includeHarness = false } = {}) => {
  const out = { reads: {}, writes: {}, readsTotal: 0, writesTotal: 0, byCallable: {} };
  events.forEach((event) => {
    if (event.t < fromMs || event.t > toMs) return;
    if (!includeHarness && event.callable === 'harness') return;
    const bucket = event.op === 'read' ? out.reads : out.writes;
    bucket[event.cat] = (bucket[event.cat] || 0) + event.n;
    if (event.op === 'read') out.readsTotal += event.n;
    else out.writesTotal += event.n;
    const byCall = (out.byCallable[event.callable] ||= { reads: 0, writes: 0 });
    byCall[event.op === 'read' ? 'reads' : 'writes'] += event.n;
  });
  return out;
};

const accounting = Object.freeze({ runAsCallable, accountingSince, resetAccounting, summarizeAccounting, categoryOf });
export default accounting;
