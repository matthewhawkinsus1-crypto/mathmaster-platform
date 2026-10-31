#!/usr/bin/env node
/*
 * ARE STEP ALGEBRA STEPS WITHOUT STEP WORK STILL WAITING OR ARRIVING?
 * A READ-ONLY REPORT (SI11, B-114).
 *
 * A Step Algebra step sent without its raw work (`stepWork`) — queued by a
 * client built before step work existed (b3b80f41, 2026-10-01) — still takes
 * the legacy, sanitized ingestion path (functions/shared/submissionIngestion.mjs,
 * "RETIRING THE LEGACY PATH"). `settings/serverGrading.requireStepWork` retires
 * that path once the old queues have drained. This report gathers what the
 * owner needs to decide when; it changes nothing and turns nothing on.
 *
 *   node scripts/report-legacy-step-queue.mjs --project <id> [--step-work-since YYYY-MM-DD] [--page-size <n>]
 *
 * It reports:
 *   - the switch as it stands (`settings/serverGrading.requireStepWork`);
 *   - QUEUED: every Step Algebra step still waiting in a device's outbox, as
 *     the devices last reported their queues (`studentDevicePersistenceReports`:
 *     `queuedByKind.stepSubmission`, per assignment where the device says),
 *     and how many of those devices hold work captured before step work
 *     existed (`oldestCapturedAt` before --step-work-since). A device report
 *     does not say whether a queued step carries step work, so the first is
 *     an upper bound and the second the devices that certainly hold old work;
 *   - ARRIVING: every question whose canonical record was last written by a
 *     step without step work (`gradedBy: 'client'` with
 *     `serverGradingReason: 'kind:stepSubmission'`), with when it arrived
 *     (`ingestedAt`). A record keeps only its last write, so this shows the
 *     latest such arrivals, not every one.
 *   - `readyToRequireStepWork`: no device holding work from before step work
 *     with a queued step, and no step without step work arrived in the last
 *     14 days. A signal for the owner, not a decision.
 *
 * READS. `settings/serverGrading`; `studentDevicePersistenceReports` and
 * `grades`, paged by id, each through a field mask (FIELDS below), so no
 * name and no support profile is read. A mask cannot reach inside
 * `gradesByAssignment` (its keys are assignment ids), so each question record
 * is read whole, step work (`equationBefore`/`equationAfter`) included; the
 * report uses only `gradedBy`, `serverGradingReason` and `ingestedAt`.
 * Document ids, which are student ids, are used only to page. The output
 * holds only counts, assignment ids and times: no id, name or answer.
 * WRITES. One local file, release-reports/legacy-step-queue-<time>.json
 * (gitignored). Standard output is counts only. No Firestore write anywhere
 * (tests/platform/legacyStepQueueReport.test.mjs runs it against a database
 * that throws on any write).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin lives in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

export const REPORT_VERSION = 1;
export const REPORT_DIR = 'release-reports';
export const PAGE_SIZE = 200;
// The first day a client could send step work (b3b80f41).
export const STEP_WORK_SINCE = '2026-10-01';
export const STEP_KIND = 'stepSubmission';
// What the ingestion stamps on a record written by a step without step work.
export const LEGACY_STEP_REASON = 'kind:stepSubmission';
export const RECENT_DAYS = 14;
const DAY_MS = 86_400_000;

/* The only fields read (a field mask on every read). */
export const FIELDS = Object.freeze({
  deviceReports: Object.freeze(['queuedByKind', 'queuedKindsByAssignment', 'oldestCapturedAt', 'reportedAt']),
  grades: Object.freeze(['gradesByAssignment']),
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const count = (value) => Math.max(0, Math.floor(Number(value) || 0));
const millis = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};
const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());
const decodeKey = (key) => {
  try { return decodeURIComponent(key); } catch { return String(key); }
};
const add = (map, key, amount) => { if (amount > 0) map[key] = (map[key] || 0) + amount; };
const sortedObject = (map) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** One device's queue report, as the steps it still holds. Pure. */
export const deviceQueuedSteps = (report = {}, { stepWorkSinceMs }) => {
  const queuedSteps = count(report?.queuedByKind?.[STEP_KIND]);
  const byAssignment = {};
  Object.entries(isObject(report?.queuedKindsByAssignment) ? report.queuedKindsByAssignment : {}).forEach(([key, kinds]) => {
    add(byAssignment, decodeKey(key), count(kinds?.[STEP_KIND]));
  });
  const oldest = millis(report?.oldestCapturedAt);
  return {
    queuedSteps,
    byAssignment,
    oldestCapturedAtMs: oldest,
    holdsWorkFromBeforeStepWork: queuedSteps > 0 && oldest !== null && oldest < stepWorkSinceMs,
    reportedAtMs: millis(report?.reportedAt),
  };
};

/** The question records in one student's grade map last written by a step without step work. Pure. */
export const legacyStepRecords = (gradesByAssignment = {}) => {
  const found = [];
  let read = 0;
  Object.entries(isObject(gradesByAssignment) ? gradesByAssignment : {}).forEach(([assignmentId, tracker]) => {
    Object.values(isObject(tracker) ? tracker : {}).forEach((record) => {
      if (!isObject(record)) return;
      read += 1;
      if (record.gradedBy === 'client' && record.serverGradingReason === LEGACY_STEP_REASON) {
        found.push({ assignmentId, ingestedAtMs: millis(record.ingestedAt) });
      }
    });
  });
  return { read, found };
};

async function* pagedDocuments(query, pageSize) {
  let last = null;
  for (;;) {
    let page = query.limit(pageSize);
    if (last) page = page.startAfter(last);
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await page.get();
    for (const doc of snapshot.docs) yield doc;
    if (snapshot.docs.length < pageSize) return;
    last = snapshot.docs[snapshot.docs.length - 1];
  }
}

/**
 * Reads and returns the report object. `db` is a Firestore (Admin SDK); only
 * collection/doc/orderBy/select/limit/startAfter/get are used.
 */
export const runLegacyStepQueueReport = async ({
  db, stepWorkSince = STEP_WORK_SINCE, pageSize = PAGE_SIZE, now = () => Date.now(), documentIdField = '__name__',
} = {}) => {
  const startedMs = now();
  const stepWorkSinceMs = Date.parse(`${stepWorkSince}T00:00:00Z`);
  const settings = await db.collection('settings').doc('serverGrading').get();
  const requireStepWork = settings.exists ? settings.data()?.requireStepWork === true : false;

  const queued = {
    devicesRead: 0, devicesWithQueuedSteps: 0, queuedSteps: 0,
    devicesHoldingWorkFromBeforeStepWork: 0, queuedStepsOnThoseDevices: 0,
    oldestQueuedCaptureAt: null, latestDeviceReportAt: null, byAssignment: {},
  };
  let oldestMs = null;
  let latestReportMs = null;
  const devices = db.collection('studentDevicePersistenceReports').orderBy(documentIdField).select(...FIELDS.deviceReports);
  for await (const doc of pagedDocuments(devices, pageSize)) {
    queued.devicesRead += 1;
    const device = deviceQueuedSteps(doc.data() || {}, { stepWorkSinceMs });
    if (device.reportedAtMs !== null) latestReportMs = Math.max(latestReportMs ?? device.reportedAtMs, device.reportedAtMs);
    if (!device.queuedSteps) continue;
    queued.devicesWithQueuedSteps += 1;
    queued.queuedSteps += device.queuedSteps;
    Object.entries(device.byAssignment).forEach(([assignmentId, steps]) => add(queued.byAssignment, assignmentId, steps));
    if (device.oldestCapturedAtMs !== null) oldestMs = Math.min(oldestMs ?? device.oldestCapturedAtMs, device.oldestCapturedAtMs);
    if (device.holdsWorkFromBeforeStepWork) {
      queued.devicesHoldingWorkFromBeforeStepWork += 1;
      queued.queuedStepsOnThoseDevices += device.queuedSteps;
    }
  }
  queued.oldestQueuedCaptureAt = iso(oldestMs);
  queued.latestDeviceReportAt = iso(latestReportMs);
  queued.byAssignment = sortedObject(queued.byAssignment);

  const arriving = {
    gradeDocumentsRead: 0, questionRecordsRead: 0, legacyStepRecords: 0,
    [`legacyStepRecordsInLast${RECENT_DAYS}Days`]: 0, legacyStepRecordsWithNoArrivalTime: 0,
    latestLegacyStepArrivedAt: null, byAssignment: {},
  };
  let latestArrivalMs = null;
  const grades = db.collection('grades').orderBy(documentIdField).select(...FIELDS.grades);
  for await (const doc of pagedDocuments(grades, pageSize)) {
    arriving.gradeDocumentsRead += 1;
    const { read, found } = legacyStepRecords(doc.data()?.gradesByAssignment);
    arriving.questionRecordsRead += read;
    found.forEach(({ assignmentId, ingestedAtMs }) => {
      arriving.legacyStepRecords += 1;
      add(arriving.byAssignment, assignmentId, 1);
      if (ingestedAtMs === null) {
        arriving.legacyStepRecordsWithNoArrivalTime += 1;
        return;
      }
      latestArrivalMs = Math.max(latestArrivalMs ?? ingestedAtMs, ingestedAtMs);
      if (ingestedAtMs >= startedMs - RECENT_DAYS * DAY_MS) arriving[`legacyStepRecordsInLast${RECENT_DAYS}Days`] += 1;
    });
  }
  arriving.latestLegacyStepArrivedAt = iso(latestArrivalMs);
  arriving.byAssignment = sortedObject(arriving.byAssignment);

  return {
    tool: 'report-legacy-step-queue',
    version: REPORT_VERSION,
    readOnly: true,
    startedAt: iso(startedMs),
    stepWorkSince,
    requireStepWork,
    queued,
    arriving,
    readyToRequireStepWork: queued.devicesHoldingWorkFromBeforeStepWork === 0
      && arriving[`legacyStepRecordsInLast${RECENT_DAYS}Days`] === 0,
    notes: [
      'queued.queuedSteps counts every Step Algebra step a device last reported as waiting; a device report does not say whether a step carries step work, so it is an upper bound.',
      `queued.devicesHoldingWorkFromBeforeStepWork: devices whose oldest waiting action was captured before ${stepWorkSince}, when no client sent step work.`,
      `arriving: question records whose last write was a step without step work (gradedBy 'client', serverGradingReason '${LEGACY_STEP_REASON}'). A record keeps only its last write.`,
      `readyToRequireStepWork: no device holding pre-step-work items with a queued step, and no such step arrived in the last ${RECENT_DAYS} days. A signal for the owner; this report changes no setting.`,
      'Only the fields in FIELDS were read (field masks); question records inside gradesByAssignment are read whole, but only gradedBy, serverGradingReason and ingestedAt are used. No student id, name or answer is in this report.',
    ],
  };
};

// --- CLI ----------------------------------------------------------------------

const USAGE = `Usage: node scripts/report-legacy-step-queue.mjs --project <id> [options]

Read-only. Reports Step Algebra steps without step work still waiting in
device queues or still arriving, and whether settings/serverGrading.requireStepWork
is on. Changes nothing. Writes one JSON file to ${REPORT_DIR}/ (gitignored).

  --project <id>               Firebase project (Application Default Credentials; a viewer role is enough)
  --step-work-since YYYY-MM-DD the first day clients sent step work (default ${STEP_WORK_SINCE})
  --page-size <n>              documents per read (default ${PAGE_SIZE})`;

export const parseReportArgs = (argv) => {
  const options = {};
  const known = ['--project', '--step-work-since', '--page-size'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!known.includes(arg)) throw new Error(`unknown argument ${arg} (this report has no write mode and no output option)`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required');
  const stepWorkSince = options['step-work-since'] || STEP_WORK_SINCE;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stepWorkSince) || !Number.isFinite(Date.parse(`${stepWorkSince}T00:00:00Z`))) {
    throw new Error('--step-work-since must be YYYY-MM-DD');
  }
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('--page-size must be 1–500');
  return { help: false, project: options.project, stepWorkSince, pageSize };
};

export const reportFilePath = (startedAt) => path.join(repoRoot, REPORT_DIR, `legacy-step-queue-${startedAt.replace(/[:.]/g, '-')}.json`);

const printCounts = (report) => {
  const lines = [];
  const line = (label, value) => lines.push(`  ${label.padEnd(60)} ${value}`);
  line('settings/serverGrading.requireStepWork', report.requireStepWork ? 'on' : 'off');
  line('device queue reports read', report.queued.devicesRead);
  line('Step Algebra steps waiting on devices (upper bound)', report.queued.queuedSteps);
  line(`  devices among them holding work from before ${report.stepWorkSince}`, report.queued.devicesHoldingWorkFromBeforeStepWork);
  line('  steps waiting on those devices', report.queued.queuedStepsOnThoseDevices);
  line('oldest waiting capture', report.queued.oldestQueuedCaptureAt || '—');
  line('grade documents read', report.arriving.gradeDocumentsRead);
  line('questions last written by a step without step work', report.arriving.legacyStepRecords);
  line(`  of them in the last ${RECENT_DAYS} days`, report.arriving[`legacyStepRecordsInLast${RECENT_DAYS}Days`]);
  line('latest such arrival', report.arriving.latestLegacyStepArrivedAt || '—');
  line('ready to require step work (signal)', report.readyToRequireStepWork ? 'yes' : 'not yet');
  console.log(lines.join('\n'));
};

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`report-legacy-step-queue: ${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  let admin;
  try {
    admin = functionsRequire('firebase-admin');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      console.error('report-legacy-step-queue: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'report-legacy-step-queue');
  console.log('Step Algebra steps without step work (SI11) — READ ONLY (nothing is written to Firestore)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  let report;
  try {
    report = await runLegacyStepQueueReport({
      db: app.firestore(),
      stepWorkSince: options.stepWorkSince,
      pageSize: options.pageSize,
      documentIdField: admin.firestore.FieldPath.documentId(),
    });
  } finally {
    // Firestore keeps gRPC channels open; without this the process lingers.
    await app.delete().catch(() => {});
  }
  report.project = options.project;
  report.emulator = emulator;
  const reportPath = reportFilePath(report.startedAt);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log('');
  printCounts(report);
  console.log(`\nDetail (per assignment): ${path.relative(process.cwd(), reportPath) || reportPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`report-legacy-step-queue: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
