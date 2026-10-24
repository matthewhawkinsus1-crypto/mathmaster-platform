import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIELDS, LEGACY_STEP_REASON, REPORT_DIR, STEP_WORK_SINCE, deviceQueuedSteps, legacyStepRecords,
  parseReportArgs, reportFilePath, runLegacyStepQueueReport,
} from '../../scripts/report-legacy-step-queue.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

/*
 * SI11 (B-114): the read-only report that tells the owner when the legacy Step
 * Algebra step path can be retired (scripts/report-legacy-step-queue.mjs).
 * Proven here:
 *   - what counts as a step still waiting on a device, and as a record last
 *     written by a step without step work — the exact reason ingestion stamps;
 *   - run against a database that throws on any write, it writes nothing,
 *     reads only through its field masks, pages past the first page, and puts
 *     no student id or name in its output;
 *   - its readiness signal is false while old work waits or old steps arrive,
 *     and true once neither does;
 *   - the script has no write mode, and writes one local file under
 *     release-reports/, which is gitignored. It never changes the switch.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = Date.UTC(2026, 9, 24, 12);
const DAY = 86_400_000;
const STEP_WORK_SINCE_MS = Date.parse(`${STEP_WORK_SINCE}T00:00:00Z`);

test('a device\'s waiting steps, per assignment, and whether it holds work from before step work', () => {
  const old = deviceQueuedSteps({
    queuedByKind: { stepSubmission: 3, ordinarySubmission: 2 },
    queuedKindsByAssignment: { [encodeURIComponent('A/1')]: { stepSubmission: 2 }, B2: { stepSubmission: 1, ordinarySubmission: 2 } },
    oldestCapturedAt: Date.UTC(2026, 8, 28),
  }, { stepWorkSinceMs: STEP_WORK_SINCE_MS });
  assert.equal(old.queuedSteps, 3);
  assert.deepEqual(old.byAssignment, { 'A/1': 2, B2: 1 }, 'assignment keys are decoded as the device report encoded them');
  assert.equal(old.holdsWorkFromBeforeStepWork, true);
  const recent = deviceQueuedSteps({ queuedByKind: { stepSubmission: 1 }, oldestCapturedAt: Date.UTC(2026, 9, 20) }, { stepWorkSinceMs: STEP_WORK_SINCE_MS });
  assert.equal(recent.holdsWorkFromBeforeStepWork, false);
  const none = deviceQueuedSteps({ queuedByKind: { ordinarySubmission: 4 }, oldestCapturedAt: Date.UTC(2026, 8, 1) }, { stepWorkSinceMs: STEP_WORK_SINCE_MS });
  assert.deepEqual([none.queuedSteps, none.holdsWorkFromBeforeStepWork], [0, false], 'old work that is not a step is not this report\'s');
});

test('a record counts only when a step without step work wrote it last — the reason ingestion stamps', () => {
  const { read, found } = legacyStepRecords({
    A1: {
      0: { gradedBy: 'client', serverGradingReason: LEGACY_STEP_REASON, ingestedAt: '2026-10-20T15:00:00.000Z' },
      1: { gradedBy: 'server', serverGradingReason: null },
      2: { gradedBy: 'client', serverGradingReason: 'legacy-unstructured-response' },
      3: { gradedBy: 'server', serverGradingReason: 'step-work-required' },
      4: 'attempted',
    },
    B2: { 0: { gradedBy: 'client', serverGradingReason: LEGACY_STEP_REASON } },
  });
  assert.equal(read, 5, 'every record is read, a legacy string record is not one');
  assert.deepEqual(found, [
    { assignmentId: 'A1', ingestedAtMs: Date.parse('2026-10-20T15:00:00.000Z') },
    { assignmentId: 'B2', ingestedAtMs: null },
  ]);
});

/* ------------------------- a store that refuses writes ------------------------- */

const WRITE_METHODS = new Set(['set', 'update', 'delete', 'create', 'add', 'batch', 'runTransaction', 'bulkWriter', 'recursiveDelete', 'bundle']);

const readOnlyStore = (documents) => {
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
  const masked = (data, fields) => (fields ? Object.fromEntries(fields.filter((field) => field in data).map((field) => [field, structuredClone(data[field])])) : structuredClone(data));
  const snapshot = (docPath, fields = null) => {
    const data = documents.get(docPath);
    return { id: docPath.split('/').at(-1), exists: data !== undefined, ref: { path: docPath }, data: () => (data === undefined ? undefined : masked(data, fields)) };
  };
  const query = (collectionPath, state = { limit: Infinity, after: null, fields: null }) => guard({
    orderBy: () => query(collectionPath, state),
    select: (...fields) => { masks.push([collectionPath, fields]); return query(collectionPath, { ...state, fields }); },
    limit: (count) => query(collectionPath, { ...state, limit: count }),
    startAfter: (doc) => query(collectionPath, { ...state, after: doc }),
    get: async () => {
      reads.push(collectionPath);
      let rows = [...documents.keys()].filter((key) => key.startsWith(`${collectionPath}/`) && !key.slice(collectionPath.length + 1).includes('/')).sort();
      if (state.after) rows = rows.slice(rows.indexOf(state.after.ref.path) + 1);
      return { docs: rows.slice(0, state.limit).map((key) => snapshot(key, state.fields)) };
    },
  }, `query(${collectionPath})`);
  const docRef = (docPath) => guard({ id: docPath.split('/').at(-1), path: docPath, get: async () => { reads.push(docPath); return snapshot(docPath); } }, `doc(${docPath})`);
  const db = guard({ collection: (name) => guard({ ...query(name), doc: (id) => docRef(`${name}/${id}`) }, `collection(${name})`) }, 'db');
  return { db, attempts, reads, masks };
};

const seeded = ({ ready = false, recentArrival = !ready } = {}) => {
  const docs = new Map();
  docs.set('settings/serverGrading', { requireStepWork: false });
  // Device reports carry the student's id and the device's: never read.
  docs.set('studentDevicePersistenceReports/S1__dev-a', {
    studentId: 'S1-secret-id', deviceId: 'dev-a', reportedAt: new Date(NOW - DAY),
    queuedByKind: ready ? { ordinarySubmission: 1 } : { stepSubmission: 2, ordinarySubmission: 1 },
    queuedKindsByAssignment: ready ? {} : { 'asg-1': { stepSubmission: 2 } },
    oldestCapturedAt: Date.UTC(2026, 8, 26),
  });
  docs.set('studentDevicePersistenceReports/S2__dev-b', {
    studentId: 'S2-secret-id', deviceId: 'dev-b', reportedAt: new Date(NOW - 2 * DAY),
    queuedByKind: { stepSubmission: 1 }, queuedKindsByAssignment: { 'asg-2': { stepSubmission: 1 } },
    oldestCapturedAt: Date.UTC(2026, 9, 22),
  });
  docs.set('studentDevicePersistenceReports/S3__dev-c', { studentId: 'S3-secret-id', queuedByKind: {}, oldestCapturedAt: null });
  // Grade documents carry names and answers: only gradesByAssignment is read.
  docs.set('grades/S1', {
    displayName: 'Secret Student', googleName: 'Secret Student',
    gradesByAssignment: { 'asg-1': {
      0: { gradedBy: 'client', serverGradingReason: LEGACY_STEP_REASON, ingestedAt: new Date(NOW - (recentArrival ? 3 : 30) * DAY).toISOString(), responseKey: 'secret answer' },
      1: { gradedBy: 'server', serverGradingReason: null },
    } },
  });
  docs.set('grades/S2', {
    displayName: 'Another Secret',
    gradesByAssignment: { 'asg-2': { 0: { gradedBy: 'client', serverGradingReason: LEGACY_STEP_REASON, ingestedAt: new Date(NOW - 40 * DAY).toISOString() } } },
  });
  docs.set('grades/S3', { displayName: 'No Work' });
  return readOnlyStore(docs);
};

test('the store really refuses writes (so the report test below would have caught one)', () => {
  const { db, attempts } = seeded();
  assert.throws(() => db.collection('settings').doc('serverGrading').set({ requireStepWork: true }), /write refused/);
  assert.throws(() => db.batch(), /write refused/);
  assert.equal(attempts.length, 2);
});

test('the report: what waits on devices, what still arrives, the switch as it stands; never a write, never a name', async () => {
  const { db, attempts, reads, masks } = seeded();
  const report = await runLegacyStepQueueReport({ db, pageSize: 1, now: () => NOW });
  assert.deepEqual(attempts, []);
  assert.deepEqual(masks.map(([collection]) => collection).sort(), ['grades', 'studentDevicePersistenceReports']);
  assert.ok(masks.every(([collection, fields]) => JSON.stringify(fields) === JSON.stringify(collection === 'grades' ? FIELDS.grades : FIELDS.deviceReports)), 'every collection read is field-masked');
  assert.deepEqual([...new Set(reads)].sort(), ['grades', 'settings/serverGrading', 'studentDevicePersistenceReports']);
  assert.doesNotMatch(JSON.stringify(report), /secret|Secret|dev-a|dev-b|S1|S2|S3/, 'no student id, device id, name or answer');

  assert.equal(report.readOnly, true);
  assert.equal(report.requireStepWork, false);
  assert.equal(report.stepWorkSince, STEP_WORK_SINCE);
  assert.deepEqual(report.queued, {
    devicesRead: 3,
    devicesWithQueuedSteps: 2,
    queuedSteps: 3,
    devicesHoldingWorkFromBeforeStepWork: 1,
    queuedStepsOnThoseDevices: 2,
    oldestQueuedCaptureAt: '2026-09-26T00:00:00.000Z',
    latestDeviceReportAt: new Date(NOW - DAY).toISOString(),
    byAssignment: { 'asg-1': 2, 'asg-2': 1 },
  }, 'paging reached every device report');
  assert.equal(report.arriving.gradeDocumentsRead, 3);
  assert.equal(report.arriving.questionRecordsRead, 3);
  assert.equal(report.arriving.legacyStepRecords, 2);
  assert.equal(report.arriving.legacyStepRecordsInLast14Days, 1);
  assert.equal(report.arriving.latestLegacyStepArrivedAt, new Date(NOW - 3 * DAY).toISOString());
  assert.deepEqual(report.arriving.byAssignment, { 'asg-1': 1, 'asg-2': 1 });
  assert.equal(report.readyToRequireStepWork, false, 'old work still waits, and an old step arrived three days ago');
});

test('ready once no device holds old steps and none arrived in the last 14 days', async () => {
  const { db, attempts } = seeded({ ready: true });
  const report = await runLegacyStepQueueReport({ db, now: () => NOW });
  assert.deepEqual(attempts, []);
  assert.equal(report.queued.devicesHoldingWorkFromBeforeStepWork, 0);
  assert.equal(report.arriving.legacyStepRecordsInLast14Days, 0);
  assert.equal(report.readyToRequireStepWork, true);
  assert.equal(report.requireStepWork, false, 'and the report leaves the switch exactly as it was');
  // No old work waiting, but an old step arrived three days ago: not yet.
  const arriving = await runLegacyStepQueueReport({ db: seeded({ ready: true, recentArrival: true }).db, now: () => NOW });
  assert.equal(arriving.queued.devicesHoldingWorkFromBeforeStepWork, 0);
  assert.equal(arriving.readyToRequireStepWork, false);
});

test('the script has no write mode, no Firestore write call, and writes only under release-reports/ (gitignored)', () => {
  const source = executableSource(readFileSync(path.join(repo, 'scripts/report-legacy-step-queue.mjs'), 'utf8'))
    // Not Firestore: app.delete() closes the Admin SDK's channels.
    .replace(/\bapp\.delete\(\)/g, 'app-close()');
  assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/);
  assert.doesNotMatch(source, /--execute|--write|--apply|--out\b/);
  assert.equal((source.match(/writeFileSync\(/g) || []).length, 1, 'one local file write');
  assert.match(source, /writeFileSync\(reportPath, /);
  const file = reportFilePath('2026-10-24T12:00:00.000Z');
  assert.equal(path.relative(path.join(repo, REPORT_DIR), file), 'legacy-step-queue-2026-10-24T12-00-00-000Z.json');
  assert.match(readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^release-reports\/?$/m);
  assert.throws(() => parseReportArgs(['--project', 'p', '--execute']), /no write mode/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--require-step-work']), /no write mode/);
  assert.throws(() => parseReportArgs(['--step-work-since', '2026-10-01']), /--project is required/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--step-work-since', 'October']), /YYYY-MM-DD/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--page-size', '0']), /--page-size/);
  assert.deepEqual(parseReportArgs(['--project', 'p']), { help: false, project: 'p', stepWorkSince: STEP_WORK_SINCE, pageSize: 200 });
});
