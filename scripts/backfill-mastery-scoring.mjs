#!/usr/bin/env node
/*
 * RESCORE EVERY STORED MASTERY PROFILE, EACH QUESTION ONCE — WITHOUT LOSS.
 *
 * The mastery trigger now scores each question by its final attempt
 * (functions/shared/masteryScoring.mjs). Profiles written before that counted
 * every attempt. This tool rebuilds each student's studentMasteryProfiles
 * document from their whole evidence history (grades/{id}/evidenceEvents) the
 * new way, and writes it only when no screen would show the student less than
 * it does today — no Mastered status, unlock or progress lost (product
 * decision 8); any other student is refused and reported. The decisions are made by
 * planStudentMasteryBackfill (scripts/lib/masteryScoringBackfill.mjs), unit-
 * tested without Firebase in tests/platform/masteryScoringBackfill.test.mjs.
 * This file only reads, re-plans inside a transaction, and writes.
 *
 *   node scripts/backfill-mastery-scoring.mjs --project <id>             # DRY RUN (the default): reports what would change
 *   node scripts/backfill-mastery-scoring.mjs --project <id> --execute   # writes (asks for the project id again)
 *   node scripts/backfill-mastery-scoring.mjs --project <id> --student <studentId>   # one student
 *
 * My Math Path history is read as it should have been written: an answer's
 * post-answer review is not support for that answer
 * (functions/shared/pathReviewReclassification.mjs); the dry run reports how
 * many Path answers that reclassifies.
 *
 * Idempotent: a document already rescored (masteryScoring.version ≥ 2) is
 * skipped. A plan that would lower anything is REFUSED for that student and
 * reported, never written; expect some (a modified final attempt carries no
 * weight under the new scoring). Grades, evidence, assignments
 * and history are only read; the one document written per student is
 * studentMasteryProfiles/{studentId}.
 *
 * Run it after hours, after the functions deploy that ships the new trigger
 * and well after Hosting (an open tab on the old bundle reads the server's
 * number alone until it reloads). A student's grades, assignments and evidence
 * are read again inside the transaction that writes their document, and one
 * student's failure is reported without stopping the run.
 *
 * PRIVACY. Standard output is counts only; the JSON report (release-reports/,
 * gitignored) lists student ids and skill codes, never names.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { planStudentMasteryBackfill } from './lib/masteryScoringBackfill.mjs';
import { studentScopedAssignment } from '../src/platform/assignments/studentAssignmentScope.js';
import { assignmentIsForStudent } from '../src/assignmentLifecycle.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const mathPath = functionsRequire('./lib/mathPath.js');

export const USAGE = `Usage:
  node scripts/backfill-mastery-scoring.mjs --project <id> [--execute] [--yes] [--student <id>] [--limit <n>] [--report <path>]

  --project <id>   Firebase project (required; there is no default)
  --execute        write the planned documents (default: dry run, nothing written)
  --yes            skip the typed project-id confirmation (only with --execute)
  --student <id>   only this student
  --limit <n>      stop after n students (a trial run)
  --report <path>  where to write the JSON report (default release-reports/)`;

export const parseBackfillArgs = (argv = []) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}. See --help.`);
    const name = arg.slice(2);
    if (['execute', 'yes', 'help'].includes(name)) options[name] = true;
    else if (['project', 'student', 'limit', 'report'].includes(name)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value.`);
      options[name] = value;
      index += 1;
    } else throw new Error(`Unknown option --${name}. See --help.`);
  }
  if (options.help) return { help: true };
  if (!options.project) throw new Error('--project <id> is required. Nothing has been read.');
  return {
    help: false,
    project: options.project,
    execute: Boolean(options.execute),
    yes: Boolean(options.yes),
    student: options.student || null,
    limit: options.limit ? Math.max(1, Number.parseInt(options.limit, 10) || 1) : null,
    reportPath: options.report || null,
  };
};

const STUDENT_FIELDS = ['gradesByAssignment', 'supportUsageByAssignment', 'classId', 'classPeriod'];

/** The student and their assignments exactly as the student's app builds them. */
// `getAll` is db.getAll or a transaction's getAll; inside a transaction the
// assignments are read fresh, never from an earlier pass.
const loadStudentInputs = async (db, studentId, studentData, getAll) => {
  const gradesByAssignment = studentData.gradesByAssignment || {};
  const ids = Object.keys(gradesByAssignment);
  const byId = new Map();
  for (let start = 0; start < ids.length; start += 100) {
    // eslint-disable-next-line no-await-in-loop
    const snapshots = await getAll(...ids.slice(start, start + 100).map((id) => db.collection('assignments').doc(id)));
    snapshots.forEach((snapshot) => byId.set(snapshot.id, snapshot.exists ? snapshot.data() : null));
  }
  const assignments = ids
    .map((id) => (byId.get(id) ? studentScopedAssignment(id, byId.get(id), studentId) : null))
    .filter(Boolean)
    // App.jsx studentPathAssignments: the Path reads the student's class's work.
    .filter((assignment) => assignmentIsForStudent(assignment, { classId: studentData.classId || null, classPeriod: studentData.classPeriod }));
  return {
    student: { id: studentId, gradesByAssignment, supportUsageByAssignment: studentData.supportUsageByAssignment || {} },
    assignments,
  };
};

const readEvents = async (reader, gradeRef) => {
  const snapshot = await reader(gradeRef.collection('evidenceEvents'));
  return snapshot.docs.map((doc) => ({ id: doc.id, evidence: doc.data() || {} }));
};

export const runMasteryBackfill = async ({ db, execute = false, student = null, limit = null, confirm = null, log = () => {}, now = Date.now() }) => {
  const report = {
    startedAt: new Date(now).toISOString(),
    mode: execute ? 'execute' : 'dry-run',
    counts: { students: 0, skippedAlreadyRescored: 0, unchanged: 0, wouldWrite: 0, written: 0, refused: 0, failed: 0, changedSkills: 0, pathEvents: 0, pathReviewsReclassified: 0, pathReviewAnomalies: 0 },
    students: [],
  };
  const gradeRefs = student
    ? [db.collection('grades').doc(student)]
    : (await db.collection('grades').select().get()).docs.map((doc) => doc.ref);
  const plans = [];
  for (const gradeRef of gradeRefs.slice(0, limit || gradeRefs.length)) {
    // eslint-disable-next-line no-await-in-loop
    const [gradeSnapshot, profileSnapshot, events] = await Promise.all([
      db.getAll(gradeRef, { fieldMask: STUDENT_FIELDS }).then(([snapshot]) => snapshot),
      db.collection('studentMasteryProfiles').doc(gradeRef.id).get(),
      readEvents((query) => query.get(), gradeRef),
    ]);
    if (!gradeSnapshot.exists) continue;
    report.counts.students += 1;
    // eslint-disable-next-line no-await-in-loop
    const inputs = await loadStudentInputs(db, gradeRef.id, gradeSnapshot.data() || {}, (...refs) => db.getAll(...refs));
    const plan = planStudentMasteryBackfill({
      studentId: gradeRef.id, stored: profileSnapshot.exists ? profileSnapshot.data() : null, events, helpers: mathPath, now, ...inputs,
    });
    if (plan.action === 'skip') { report.counts.skippedAlreadyRescored += 1; continue; }
    report.counts.pathEvents += plan.pathReview?.pathEvents || 0;
    report.counts.pathReviewsReclassified += plan.pathReview?.reclassified || 0;
    report.counts.pathReviewAnomalies += plan.pathReview?.anomalies || 0;
    if (!events.length && !profileSnapshot.exists && !plan.changes.length) { report.counts.unchanged += 1; continue; }
    report.counts.changedSkills += plan.changes.length;
    report.students.push({ studentId: gradeRef.id, action: plan.action, changes: plan.changes, violations: plan.violations, pathReview: plan.pathReview });
    if (plan.action === 'refuse') { report.counts.refused += 1; continue; }
    report.counts.wouldWrite += 1;
    plans.push({ gradeRef });
  }
  log(`${report.counts.students} students read; ${report.counts.wouldWrite} documents to write, ${report.counts.refused} refused, ${report.counts.skippedAlreadyRescored} already rescored.`);
  if (!execute || !plans.length) return report;
  if (confirm && !(await confirm(report.counts))) { report.aborted = true; return report; }

  for (const { gradeRef } of plans) {
    const profileRef = db.collection('studentMasteryProfiles').doc(gradeRef.id);
    try {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await db.runTransaction(async (transaction) => {
        // Everything re-read and re-planned inside the transaction: grades and
        // assignments as they are now, evidence that arrived since the dry
        // plan, and a document the trigger rewrote meanwhile.
        const [[gradeSnapshot], profileSnapshot, events] = await Promise.all([
          transaction.getAll(gradeRef, { fieldMask: STUDENT_FIELDS }),
          transaction.get(profileRef),
          readEvents((query) => transaction.get(query), gradeRef),
        ]);
        if (!gradeSnapshot.exists) return 'missing';
        const inputs = await loadStudentInputs(db, gradeRef.id, gradeSnapshot.data() || {}, (...refs) => transaction.getAll(...refs));
        const plan = planStudentMasteryBackfill({
          studentId: gradeRef.id, stored: profileSnapshot.exists ? profileSnapshot.data() : null, events, helpers: mathPath, now, ...inputs,
        });
        if (plan.action !== 'write') return plan.action;
        transaction.set(profileRef, plan.document);
        return 'written';
      });
      if (outcome === 'written') report.counts.written += 1;
      else if (outcome === 'refuse') report.counts.refused += 1;
    } catch (error) {
      // One student never stops the run, and the report is still written.
      report.counts.failed += 1;
      report.students.push({ studentId: gradeRef.id, action: 'failed', message: String(error?.message || error).slice(0, 300) });
    }
  }
  return report;
};

const askLine = (question) => new Promise((resolve) => {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  let settled = false;
  const finish = (answer) => { if (!settled) { settled = true; prompt.close(); resolve(answer); } };
  prompt.on('close', () => finish(''));
  prompt.question(question).then(finish, () => finish(''));
});

const main = async () => {
  let options;
  try {
    options = parseBackfillArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`backfill-mastery-scoring: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) { console.log(USAGE); return; }
  const admin = functionsRequire('firebase-admin');
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  const app = admin.initializeApp({ projectId: options.project }, 'backfill-mastery-scoring');
  const db = app.firestore();
  console.log(`Mastery rescoring backfill — ${options.execute ? 'EXECUTE' : 'DRY RUN (nothing is written)'}`);
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  const confirm = options.execute && !options.yes
    ? async (counts) => {
      console.log(`\n  ${counts.wouldWrite} documents will be written (${counts.refused} students refused, left as they are).`);
      const answer = await askLine(`Type the project id to write to ${options.project}: `);
      return answer.trim() === options.project;
    }
    : null;
  let report;
  try {
    report = await runMasteryBackfill({ db, ...options, confirm, log: (line) => console.log(`  ${line}`) });
  } finally {
    await app.delete().catch(() => {});
  }
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const reportPath = options.reportPath ? path.resolve(options.reportPath) : path.join(repoRoot, 'release-reports', `mastery-backfill-${report.mode}-${stamp}.json`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify({ ...report, project: options.project, emulator }, null, 2)}\n`);
  console.log('');
  Object.entries(report.counts).forEach(([key, value]) => console.log(`  ${key.padEnd(24)} ${value}`));
  if (report.aborted) console.log('Not confirmed; nothing was written.');
  console.log(`Report: ${reportPath}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
