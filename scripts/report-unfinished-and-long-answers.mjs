#!/usr/bin/env node
/*
 * STORED ANSWERS THAT HOLD AN UNFINISHED OR AN OVER-LONG ENTRY. A READ-ONLY
 * COUNT (#557, #558; the owner, 2026-11-19).
 *
 * From this change on, a typed answer with a sign or a product sign left
 * dangling (`12 +`, `4*`, `*38`) is not graded, and neither is one longer than
 * the 240 characters the attempt record keeps (functions/shared/
 * typedEntryGuard.mjs). The owner's decision: grades already given stay as
 * they are. This report counts the stored answers that hold such an entry, by
 * the verdict they were given, so that the decision is made with the number
 * in hand. It has no write mode: no --execute, no re-grade, and no Firestore
 * write anywhere in this file (tests/platform/unfinishedAndLongAnswersReport
 * .test.mjs runs it against a database that throws on any write, and checks
 * the source).
 *
 *   node scripts/report-unfinished-and-long-answers.mjs --project <id> [--surface assignments|secure|path]... [--page-size <n>]
 *
 * WHAT IS COUNTED. Each stored answer is read as text, box by box:
 *
 *   unfinished   a box that typedEntryGuard's hasDanglingOperator calls
 *                unfinished. `recordedRight` are the ones #557 is about: the
 *                answer holding it was marked right. (The verdict stored is
 *                the whole answer's, so a two-box answer marked right with
 *                one unfinished box is one of them.)
 *   atTheLimit   a box holding the record's full 240 characters or more. An
 *                assignment box was cut to 240 before it was stored, so this
 *                is "240 or longer when typed"; a secure test keeps up to
 *                2,000 and a longer entry is seen whole.
 *
 * WHAT EACH SURFACE KEEPS (and so what can be counted):
 *
 *   assignments  grades/{student}/responseInspectionEvidence/{assignment}__q{i}:
 *                the raw response of the LAST counted attempt and the verdict
 *                it got. Earlier attempts are not stored and cannot be counted.
 *   secure       examSessions/{id}.responses[item]: the recorded response and
 *                verdict.
 *   path         pathSubmissions.recapJson, only on the attempt that closed a
 *                question: the typed text by field label, and the verdict.
 *   Live Challenge stores no response: not countable, and named as such.
 *
 * PRIVACY. Standard output is COUNTS ONLY. The JSON detail lists students by
 * id (no name is read) with the entry's text, under the gitignored
 * release-reports/.
 *
 * READS (all projected with a field mask): the `responseInspectionEvidence`
 * collection group; `examSessions` (the responses map); `pathSubmissions`
 * (recapJson and the student id).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAX_TYPED_ANSWER_LENGTH, hasDanglingOperator } from '../functions/shared/typedEntryGuard.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin lives in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

export const REPORT_VERSION = 1;
export const REPORT_DIR = 'release-reports';
export const PAGE_SIZE = 200;
export const SURFACES = Object.freeze(['assignments', 'secure', 'path']);
export const ENTRY_KINDS = Object.freeze(['unfinished', 'atTheLimit']);
export const EVIDENCE_FIELDS = Object.freeze([
  'evidence.submittedResponse', 'evidence.automaticResult.isCorrect', 'evidence.automaticResult.graded', 'evidence.submittedAt',
]);
export const EXAM_SESSION_FIELDS = Object.freeze(['studentId', 'responses']);
export const PATH_SUBMISSION_FIELDS = Object.freeze(['studentId', 'createdAt', 'recapJson']);

const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const typedText = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : null);

/** Which kinds one stored box is: 'unfinished', 'atTheLimit', both or neither. */
export const entryKindsOf = (value) => {
  const text = typedText(value);
  if (text === null) return [];
  return [
    ...(hasDanglingOperator(text) ? ['unfinished'] : []),
    ...(text.length >= MAX_TYPED_ANSWER_LENGTH ? ['atTheLimit'] : []),
  ];
};

/** The typed boxes of a stored assignment response: `[{ box, value }]`. */
export const assignmentBoxes = (response) => {
  if (!isObject(response)) return typedText(response) === null ? [] : [{ box: 'value', value: response }];
  if (response.kind === 'fields') return list(response.fields).map((field) => ({ box: String(field?.id ?? ''), value: field?.value }));
  // A scalar answer (literal, fraction, ordered pair, system). An opaque one
  // is a tool's work as JSON, not a typed box.
  return response.kind === 'scalar' ? [{ box: 'value', value: response.value }] : [];
};

const emptyCounts = () => ({
  answersRead: 0,
  notReadable: 0,
  ...Object.fromEntries(ENTRY_KINDS.map((kind) => [kind, { answers: 0, recordedRight: 0, recordedWrong: 0, verdictNotStored: 0 }])),
});

/** Count one stored answer: once per kind, whatever number of its boxes are of it. */
const countAnswer = ({ counts, found, boxes, recorded, where }) => {
  counts.answersRead += 1;
  const byKind = {};
  for (const { box, value } of boxes) {
    for (const kind of entryKindsOf(value)) {
      byKind[kind] = [...(byKind[kind] || []), { box, entry: String(value), length: String(value).length }];
    }
  }
  for (const [kind, entries] of Object.entries(byKind)) {
    counts[kind].answers += 1;
    counts[kind][recorded === true ? 'recordedRight' : recorded === false ? 'recordedWrong' : 'verdictNotStored'] += 1;
    found.push({ ...where, kind, recorded: typeof recorded === 'boolean' ? (recorded ? 'right' : 'wrong') : null, entries });
  }
};

async function* paged(query, pageSize) {
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

const countAssignments = async ({ db, pageSize, counts, found }) => {
  // No orderBy: an unfiltered collection-group query already runs in document
  // order and needs no collection-group index (none is declared for it).
  const query = db.collectionGroup('responseInspectionEvidence').select(...EVIDENCE_FIELDS);
  for await (const doc of paged(query, pageSize)) {
    const match = /^(.*)__q(\d+)$/.exec(doc.id);
    const evidence = doc.data()?.evidence;
    if (!match || evidence?.submittedResponse === undefined || evidence?.submittedResponse === null) { counts.notReadable += 1; continue; }
    const graded = evidence.automaticResult?.graded !== false;
    countAnswer({
      counts,
      found,
      boxes: assignmentBoxes(evidence.submittedResponse),
      recorded: graded && typeof evidence.automaticResult?.isCorrect === 'boolean' ? evidence.automaticResult.isCorrect : null,
      where: {
        surface: 'assignments',
        studentId: doc.ref?.parent?.parent?.id || doc.ref?.path?.split('/')[1] || null,
        assignmentId: decodeURIComponent(match[1]),
        questionIndex: Number(match[2]),
        submittedAt: evidence.submittedAt ?? null,
      },
    });
  }
};

const countSecure = async ({ db, pageSize, documentIdField, counts, found }) => {
  const query = db.collection('examSessions').orderBy(documentIdField).select(...EXAM_SESSION_FIELDS);
  for await (const doc of paged(query, pageSize)) {
    const responses = isObject(doc.data()?.responses) ? doc.data().responses : {};
    for (const [itemId, recordedAnswer] of Object.entries(responses)) {
      if (!isObject(recordedAnswer) || recordedAnswer.unanswered) continue;
      const typed = recordedAnswer.responsePayload?.responses;
      if (!isObject(typed)) { counts.notReadable += 1; continue; }
      countAnswer({
        counts,
        found,
        boxes: Object.entries(typed).map(([box, value]) => ({ box, value })),
        recorded: typeof recordedAnswer.grading?.isCorrect === 'boolean' ? recordedAnswer.grading.isCorrect : null,
        where: { surface: 'secure', studentId: doc.data()?.studentId || null, examSessionId: doc.id, questionInstanceId: itemId },
      });
    }
  }
};

const countPath = async ({ db, pageSize, documentIdField, counts, found }) => {
  const query = db.collection('pathSubmissions').orderBy(documentIdField).select(...PATH_SUBMISSION_FIELDS);
  for await (const doc of paged(query, pageSize)) {
    const data = doc.data() || {};
    if (!data.recapJson) continue;
    let recap;
    try { recap = JSON.parse(data.recapJson); } catch { counts.notReadable += 1; continue; }
    if (recap?.response?.kind !== 'fields') { counts.notReadable += 1; continue; }
    countAnswer({
      counts,
      found,
      boxes: list(recap.response.entries).map((entry) => ({ box: String(entry?.label ?? ''), value: entry?.value })),
      recorded: typeof recap?.grading?.isCorrect === 'boolean' ? recap.grading.isCorrect : null,
      where: { surface: 'path', studentId: data.studentId || null, submissionId: doc.id, createdAt: data.createdAt ?? null },
    });
  }
};

/**
 * Reads and returns the report object. `db` is a Firestore (Admin SDK); only
 * collection/collectionGroup/orderBy/select/limit/startAfter/get are used.
 */
export const runUnfinishedAndLongAnswersReport = async ({
  db, surfaces = SURFACES, pageSize = PAGE_SIZE, now = () => Date.now(), documentIdField = '__name__',
} = {}) => {
  const startedAt = new Date(now()).toISOString();
  const totals = {};
  const found = [];
  const run = { assignments: countAssignments, secure: countSecure, path: countPath };
  for (const surface of SURFACES.filter((name) => surfaces.includes(name))) {
    totals[surface] = emptyCounts();
    // eslint-disable-next-line no-await-in-loop
    await run[surface]({ db, pageSize, documentIdField, counts: totals[surface], found });
  }
  return {
    tool: 'report-unfinished-and-long-answers',
    version: REPORT_VERSION,
    readOnly: true,
    startedAt,
    lengthLimit: MAX_TYPED_ANSWER_LENGTH,
    surfaces: Object.keys(totals),
    notCountable: { liveChallenge: 'no response is stored (liveChallengePrivate players hold submission receipts with the verdict only)' },
    notes: [
      'Grades already given stay as they are (the owner, 2026-11-19): this report counts and changes nothing.',
      'unfinished.recordedRight: stored answers marked right that hold an entry with a sign or product sign left dangling. The verdict is the whole answer\'s.',
      'atTheLimit: a box holding 240 characters or more. An assignment box was cut to 240 before it was stored.',
      'assignments: the last counted attempt of each question only (earlier attempts are not stored). path: the closing attempt only.',
    ],
    totals,
    found,
  };
};

// --- CLI ----------------------------------------------------------------------

const USAGE = `Usage: node scripts/report-unfinished-and-long-answers.mjs --project <id> [options]

Read-only. Counts the stored answers that hold an unfinished entry (a sign or
product sign left dangling) or one at the 240-character limit, by surface and
by the verdict they were given. Writes one JSON file to ${REPORT_DIR}/ (gitignored).

  --project <id>        Firebase project (Application Default Credentials; a viewer role is enough)
  --surface <name>      assignments, secure or path (repeatable; default all three)
  --page-size <n>       documents per read (default ${PAGE_SIZE})`;

export const parseReportArgs = (argv) => {
  const options = { surfaces: [] };
  const known = ['--project', '--surface', '--page-size'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!known.includes(arg)) throw new Error(`unknown argument ${arg} (this report has no write mode and no output option)`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    if (arg === '--surface') {
      if (!SURFACES.includes(value)) throw new Error(`--surface must be one of ${SURFACES.join(', ')}`);
      options.surfaces.push(value);
    } else options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required');
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('--page-size must be 1–500');
  return { help: false, project: options.project, surfaces: options.surfaces.length ? [...new Set(options.surfaces)] : [...SURFACES], pageSize };
};

export const reportFilePath = (startedAt) => path.join(repoRoot, REPORT_DIR, `unfinished-and-long-answers-${startedAt.replace(/[:.]/g, '-')}.json`);

const printCounts = (report) => {
  const add = (label, value) => console.log(`  ${label.padEnd(46)} ${value}`);
  Object.entries(report.totals).forEach(([surface, counts]) => {
    add(`${surface}: answers read`, counts.answersRead);
    add(`${surface}: not readable`, counts.notReadable);
    ENTRY_KINDS.forEach((kind) => {
      const row = counts[kind];
      add(`${surface}: ${kind}`, `${row.answers}  (recorded right ${row.recordedRight} · wrong ${row.recordedWrong} · no verdict stored ${row.verdictNotStored})`);
    });
  });
  add('liveChallenge', 'not countable (no response is stored)');
};

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`report-unfinished-and-long-answers: ${error.message}\n\n${USAGE}`);
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
      console.error('report-unfinished-and-long-answers: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'report-unfinished-and-long-answers');
  console.log('Stored answers that hold an unfinished or an over-long entry — READ ONLY (nothing is written to Firestore)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  let report;
  try {
    report = await runUnfinishedAndLongAnswersReport({
      db: app.firestore(),
      surfaces: options.surfaces,
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
  console.log(`\nDetail (student ids and the entries' text): ${path.relative(process.cwd(), reportPath) || reportPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`report-unfinished-and-long-answers: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
