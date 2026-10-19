#!/usr/bin/env node
/*
 * ORDERED-PAIR QUESTIONS KEYED AS TEXT. A READ-ONLY REPORT.
 * Student pass 3, wave 7 (docs/handoffs/STUDENT_PASS3_GRADER_GAPS_2.md, item 2).
 * It has no write mode: no --execute, no repair, and no Firestore write
 * anywhere in this file (tests/platform/studentPass3GraderGaps2Reports.test.mjs
 * runs it against a database that throws on any write and checks the source;
 * tests/integration/orderedPairTextKeysReport.test.mjs runs the CLI against a
 * seeded Firestore emulator).
 *
 *   node scripts/report-ordered-pair-text-keys.mjs --project <id> [--assignment <id>]... [--page-size <n>]
 *
 * An `orderedPair` question whose key is text, `answer: '(2,3)'`, could never
 * be marked right before this wave: the grader compared the student's pair
 * with `answer[0]` and `answer[1]`, the characters "(" and "2". No repository
 * JSON has one, but an imported or AI-written assignment can. The grader now
 * reads the text (answerUtils.orderedPairKey), and the compile and the import
 * store new keys as [x, y]. This counts the ones already stored, in six
 * kinds:
 *
 *   textPairNowGraded   text the grader now reads as a point: every answer to
 *                       it so far was recorded wrong, whatever the student
 *                       wrote (scripts/report-grader-gaps-2-regrade.mjs counts
 *                       those answers);
 *   textNotAPair        text that is not a point ("none", three coordinates):
 *                       still never right; Pre-Flight now refuses it with a
 *                       reason the next time the assignment is checked;
 *   arrayKey            the catalog's [x, y], read by the grader: unaffected;
 *   arrayNotAPair       an array the grader cannot read as a point (["", 3],
 *                       three coordinates, letters): never right, and refused
 *                       by Pre-Flight. (["", 3] was graded as (0, 3) before.)
 *   objectKey           an object ({x, y}): never right, refused by Pre-Flight;
 *   noKey               nothing keyed (a generated question draws its key).
 *
 * Variants (question.variants[]) are read too: a variant's key replaces the
 * question's for the students who draw it.
 *
 * READS. `assignments` only, paged by id or the ids named with --assignment,
 * and only the fields in ASSIGNMENT_FIELDS (a field mask). No student data is
 * read. WRITES. One local file,
 * release-reports/ordered-pair-text-keys-<time>.json (gitignored), naming
 * assignments and questions by id with the key text. Standard output is
 * counts only.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { orderedPairKey } from '../functions/shared/answerUtils.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin lives in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

export const REPORT_VERSION = 1;
export const ASSIGNMENT_FIELDS = Object.freeze(['title', 'schemaVersion', 'assignedClassIds', 'archived', 'sections', 'questions']);
export const REPORT_DIR = 'release-reports';
export const PAGE_SIZE = 100;
export const KEY_KINDS = Object.freeze(['textPairNowGraded', 'textNotAPair', 'arrayKey', 'arrayNotAPair', 'objectKey', 'noKey']);
// The kinds Pre-Flight refuses the next time the assignment is checked.
export const REFUSED_KINDS = Object.freeze(['textNotAPair', 'arrayNotAPair', 'objectKey']);

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const has = (value) => value !== undefined && value !== null && value !== '';

/** The kind of key one orderedPair question (or variant) carries. */
export const orderedPairKeyKind = (question = {}) => {
  const key = has(question?.answer) ? question.answer : question?.solution;
  if (!has(key)) return 'noKey';
  // Every shape through the grader's own reader (review S4): an array it
  // cannot read (["", 3], three coordinates, letters) is refused by
  // Pre-Flight too, and so is an object ({x, y} is not a shape it reads).
  if (Array.isArray(key)) return orderedPairKey(key) ? 'arrayKey' : 'arrayNotAPair';
  if (typeof key === 'object') return 'objectKey';
  if (typeof key !== 'string') return 'textNotAPair';
  return orderedPairKey(key) ? 'textPairNowGraded' : 'textNotAPair';
};

const isOrderedPair = (question) => clean(question?.type || question?.toolId) === 'orderedPair';

/** Every question an assignment stores: V5 sections, then a legacy root list. */
const storedQuestions = (assignment = {}) => [
  ...list(assignment.sections).flatMap((section) => list(section?.questions).map((question) => ({ question, sectionRole: clean(section?.role) || null }))),
  ...list(assignment.questions).map((question) => ({ question, sectionRole: clean(question?.activityRole) || null })),
];

export const assignmentOrderedPairKeys = (id, assignment = {}) => {
  const counts = Object.fromEntries(KEY_KINDS.map((kind) => [kind, 0]));
  const questions = [];
  storedQuestions(assignment).forEach(({ question, sectionRole }, index) => {
    const entries = [];
    if (isOrderedPair(question)) entries.push({ variant: null, kind: orderedPairKeyKind(question), key: question.answer ?? question.solution ?? null });
    list(question?.variants).forEach((variant, variantIndex) => {
      if (!isOrderedPair({ ...question, ...variant })) return;
      if (!has(variant?.answer) && !has(variant?.solution)) return;
      entries.push({ variant: variantIndex, kind: orderedPairKeyKind(variant), key: variant.answer ?? variant.solution ?? null });
    });
    entries.forEach((entry) => {
      counts[entry.kind] += 1;
      if (entry.kind !== 'arrayKey' && entry.kind !== 'noKey') {
        questions.push({ questionIndex: index, questionId: clean(question?.questionId || question?.id) || null, sectionRole, ...entry });
      }
    });
  });
  return {
    assignmentId: id,
    title: clean(assignment?.title) || null,
    archived: assignment?.archived === true,
    assignedClassCount: list(assignment?.assignedClassIds).length,
    ...counts,
    questions,
  };
};

async function* pagedDocuments(collection, pageSize) {
  let last = null;
  for (;;) {
    let page = collection.limit(pageSize);
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
 * collection/doc/orderBy/select/limit/startAfter/get and getAll (with a
 * fieldMask) are used.
 */
export const runOrderedPairTextKeysReport = async ({
  db, assignmentIds = [], pageSize = PAGE_SIZE, now = () => Date.now(), documentIdField = '__name__',
} = {}) => {
  const startedAt = new Date(now()).toISOString();
  const assignments = [];
  const missing = [];
  const consider = (id, data) => { assignments.push(assignmentOrderedPairKeys(id, data || {})); };
  if (assignmentIds.length) {
    const snapshots = await db.getAll(...assignmentIds.map((id) => db.collection('assignments').doc(id)), { fieldMask: [...ASSIGNMENT_FIELDS] });
    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists) consider(snapshot.id, snapshot.data());
      else missing.push(assignmentIds[index]);
    });
  } else {
    const ordered = db.collection('assignments').orderBy(documentIdField).select(...ASSIGNMENT_FIELDS);
    for await (const doc of pagedDocuments(ordered, pageSize)) consider(doc.id, doc.data());
  }
  assignments.sort((a, b) => (a.assignmentId < b.assignmentId ? -1 : a.assignmentId > b.assignmentId ? 1 : 0));
  const totals = { assignmentsRead: assignments.length, ...Object.fromEntries(KEY_KINDS.map((kind) => [kind, 0])), assignmentsWithTextKeys: 0, assignedWithTextKeys: 0, assignmentsWithRefusedKeys: 0 };
  assignments.forEach((entry) => {
    KEY_KINDS.forEach((kind) => { totals[kind] += entry[kind]; });
    if (entry.textPairNowGraded || entry.textNotAPair) {
      totals.assignmentsWithTextKeys += 1;
      if (entry.assignedClassCount > 0 && !entry.archived) totals.assignedWithTextKeys += 1;
    }
    if (REFUSED_KINDS.some((kind) => entry[kind])) totals.assignmentsWithRefusedKeys += 1;
  });
  return {
    tool: 'report-ordered-pair-text-keys',
    version: REPORT_VERSION,
    readOnly: true,
    startedAt,
    assignmentFilter: assignmentIds.length ? [...assignmentIds] : null,
    missingAssignments: missing,
    notes: [
      'Counts are orderedPair questions and variants. textPairNowGraded: text the grader now reads as a point (answerUtils.orderedPairKey); every answer recorded on it before this wave was recorded wrong.',
      'textNotAPair, arrayNotAPair, objectKey: never right (an array like ["", 3] was graded (0, 3) before this wave); Pre-Flight refuses each with a reason (questionTypeCatalog orderedPair) the next time the assignment is checked. Fix the key in the assignment.',
      'Only the fields in ASSIGNMENT_FIELDS were read (a field mask). No student data was read.',
    ],
    totals,
    // Only assignments that hold a text key, so the file stays small.
    assignments: assignments.filter((entry) => entry.questions.length),
  };
};

// --- CLI ----------------------------------------------------------------------

const USAGE = `Usage: node scripts/report-ordered-pair-text-keys.mjs --project <id> [options]

Read-only. Counts the orderedPair questions whose key is stored as text
('(2,3)'), which the grader could never mark right before student pass 3
wave 7. Writes one JSON file to ${REPORT_DIR}/ (gitignored).

  --project <id>        Firebase project (Application Default Credentials; a viewer role is enough)
  --assignment <id>     only this assignment (repeatable; default every assignment)
  --page-size <n>       documents per read (default ${PAGE_SIZE})`;

export const parseReportArgs = (argv) => {
  const options = { assignments: [] };
  const known = ['--project', '--assignment', '--page-size'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!known.includes(arg)) throw new Error(`unknown argument ${arg} (this report has no write mode and no output option)`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    if (arg === '--assignment') options.assignments.push(value);
    else options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required');
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('--page-size must be 1–500');
  return { help: false, project: options.project, assignmentIds: [...new Set(options.assignments)], pageSize };
};

export const reportFilePath = (startedAt) => path.join(repoRoot, REPORT_DIR, `ordered-pair-text-keys-${startedAt.replace(/[:.]/g, '-')}.json`);

const printCounts = (report) => {
  const add = (label, value) => console.log(`  ${label.padEnd(52)} ${value}`);
  add('assignments read', report.totals.assignmentsRead);
  if (report.missingAssignments.length) add('named assignments not found', report.missingAssignments.length);
  add('orderedPair keys stored as a point (unaffected)', report.totals.arrayKey);
  add('orderedPair keys stored as pair text (now graded)', report.totals.textPairNowGraded);
  add('orderedPair keys stored as text that is not a pair', report.totals.textNotAPair);
  add('orderedPair keys stored as an array that is not a pair', report.totals.arrayNotAPair);
  add('orderedPair keys stored as an object', report.totals.objectKey);
  add('assignments Pre-Flight will refuse on their next check', report.totals.assignmentsWithRefusedKeys);
  add('orderedPair questions with no key (generated)', report.totals.noKey);
  add('assignments holding a text key', report.totals.assignmentsWithTextKeys);
  add('  of them assigned to a class and not archived', report.totals.assignedWithTextKeys);
};

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`report-ordered-pair-text-keys: ${error.message}\n\n${USAGE}`);
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
      console.error('report-ordered-pair-text-keys: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'report-ordered-pair-text-keys');
  console.log('Ordered-pair questions keyed as text — READ ONLY (nothing is written to Firestore)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  let report;
  try {
    report = await runOrderedPairTextKeysReport({
      db: app.firestore(),
      assignmentIds: options.assignmentIds,
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
  console.log(`\nDetail (assignment and question ids, key text): ${path.relative(process.cwd(), reportPath) || reportPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`report-ordered-pair-text-keys: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
