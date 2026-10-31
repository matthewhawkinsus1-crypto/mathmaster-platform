#!/usr/bin/env node
/*
 * REMOVE THE PRE-#456 MY MATH PATH CHOICE MISSES FROM MASTERY, AS NOT ATTEMPTED.
 *
 *   node scripts/remove-path-choice-misses-from-mastery.mjs --project <id> --since <date> --until <date>
 *        READ ONLY (the default): the answers the report lists, and what
 *        removing each would change. Nothing is written to Firestore.
 *   node scripts/remove-path-choice-misses-from-mastery.mjs --project <id> --since <date> --until <date> --execute
 *        removes them, after the operator types the project id back.
 *
 * The owner's decision (MP19, 2026-10-23): every My Math Path multiple-choice
 * answer recorded before hotfix #456 was graded wrong whatever was picked, and
 * which option was picked was never stored, so those answers cannot be
 * re-graded; after the read-only report, they leave mastery as not attempted.
 *
 * WHICH ANSWERS. Exactly the ones scripts/report-path-choice-id-regrade.mjs
 * lists for the same --since/--until (this script runs that report's own code,
 * runPathChoiceIdRegradeReport, every time; read that file's header for the
 * window and its checks). Run the report, review it, then run this with the
 * same window. --student narrows a run to named students (a first, small
 * trial).
 *
 * WHAT CHANGES. One document per student: studentMasteryProfiles/{studentId}.
 * The decisions are scripts/lib/pathChoiceMasteryRemoval.mjs (what "not
 * attempted" means, what is left alone and why). What it changed is recorded
 * on that document (`voidedEvidence`, one entry per answer) and in the JSON
 * report. Evidence events, their application markers, grades, Path sessions
 * (weekly accuracy) and mastery history are never written; the mastery
 * backfill leaves voided answers out when it rescores.
 *
 * SAFETY. Without --execute nothing is written
 * (tests/platform/pathChoiceMasteryRemoval.test.mjs runs the default against a
 * database that throws on every write method, and checks this file's only
 * write). With --execute the project id must be typed back; --yes skips that
 * only when FIRESTORE_EMULATOR_HOST is set, never against a real project. Each
 * student's document and evidence are read again and re-planned inside the
 * transaction that writes it, so a run is idempotent: an answer already removed
 * is skipped, and a second run writes nothing.
 *
 * PRIVACY. Standard output is COUNTS ONLY. The JSON lists students by id,
 * never by name (no name is read), and goes to the gitignored
 * path-choice-reports/ unless --out says otherwise.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_OUT_DIR,
  PAGE_SIZE,
  PROBE_DAYS,
  parseDate,
  runPathChoiceIdRegradeReport,
} from './report-path-choice-id-regrade.mjs';
import { planStudentChoiceMissRemoval, statusFell } from './lib/pathChoiceMasteryRemoval.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const mathPath = functionsRequire('./lib/mathPath.js');

export const TOOL = 'remove-path-choice-misses-from-mastery';
export const PROFILES_COLLECTION = 'studentMasteryProfiles';

export const USAGE = `Usage: node scripts/${TOOL}.mjs --project <id> --since <date> --until <date> [options]

Read-only unless --execute. Removes from mastery, as not attempted, the My Math
Path multiple-choice answers scripts/report-path-choice-id-regrade.mjs lists
for the same window (recorded wrong before hotfix #456).

  --project <id>   Firebase project (required; there is no default)
  --since <date>   start of the pre-fix window, as given to the report
  --until <date>   end of the window, exclusive, as given to the report
  --execute        write (asks for the project id to be typed back)
  --yes            skip the typed confirmation: only with --execute, and only
                   when FIRESTORE_EMULATOR_HOST is set
  --student <id>   only this student (repeatable)
  --out <dir>      where the JSON goes (default ${DEFAULT_OUT_DIR}/, gitignored)
  --page-size <n>  submissions per read (default ${PAGE_SIZE})
  --probe-days <n> the report's window-edge check (default ${PROBE_DAYS})`;

export const parseRemovalArgs = (argv = [], env = process.env) => {
  const options = { students: [], execute: false, yes: false };
  const valued = ['--project', '--since', '--until', '--student', '--out', '--page-size', '--probe-days'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--execute' || arg === '--yes') { options[arg.slice(2)] = true; continue; }
    if (!valued.includes(arg)) throw new Error(`unknown argument ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    if (arg === '--student') options.students.push(value);
    else options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required. Nothing has been read.');
  if (!options.since || !options.until) throw new Error('--since and --until are required: the window the report was run with');
  const since = parseDate(options.since, '--since');
  const until = parseDate(options.until, '--until');
  if (since >= until) throw new Error('--since must be before --until');
  if (options.yes && !options.execute) throw new Error('--yes only means something with --execute');
  // The typed confirmation is what stands between a typo and a real project.
  if (options.yes && !env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('--yes is refused unless FIRESTORE_EMULATOR_HOST is set: against a real project the project id must be typed');
  }
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error('--page-size must be 1–1000');
  const probeDays = options['probe-days'] !== undefined ? Number(options['probe-days']) : PROBE_DAYS;
  if (!Number.isFinite(probeDays) || probeDays < 0 || probeDays > 60) throw new Error('--probe-days must be 0–60');
  return {
    help: false,
    project: options.project,
    since,
    until,
    execute: options.execute,
    yes: options.yes,
    students: options.students,
    outDir: options.out || null,
    pageSize,
    probeDays,
  };
};

/** The report's listed answers, by student, as the planner reads them. */
export const listedAnswersByStudent = (flagged = [], { students = [] } = {}) => {
  const byStudent = new Map();
  for (const entry of Array.isArray(flagged) ? flagged : []) {
    const studentId = String(entry?.studentId || '');
    if (!studentId || (students.length && !students.includes(studentId))) continue;
    const evidencePath = entry.evidence?.path || null;
    if (!byStudent.has(studentId)) byStudent.set(studentId, []);
    byStudent.get(studentId).push({
      eventId: evidencePath ? evidencePath.split('/').at(-1) : '',
      eventKey: entry.evidence?.eventKey || null,
      evidencePath,
      submissionDocId: entry.submissionDocId || null,
      applied: entry.mastery?.applied === true,
    });
  }
  return byStudent;
};

/**
 * Reads, plans and (with execute and a confirmation) writes. `db` is a
 * Firestore Admin instance. `confirm(counts)` must resolve true before
 * anything is written; execute without it refuses.
 */
export const runPathChoiceMasteryRemoval = async ({
  db,
  since,
  until,
  pageSize = PAGE_SIZE,
  probeDays = PROBE_DAYS,
  execute = false,
  students = [],
  confirm = null,
  now = () => Date.now(),
  log = () => {},
}) => {
  if (execute && typeof confirm !== 'function') throw new Error('execute needs a confirmation step; nothing was written');
  const startedAt = new Date(now()).toISOString();
  const report = await runPathChoiceIdRegradeReport({ db, since, until, pageSize, probeDays, now });
  const listed = listedAnswersByStudent(report.flagged, { students });

  const planFor = async (studentId, read) => {
    const [profileSnapshot, eventsSnapshot] = await Promise.all([
      read(db.collection(PROFILES_COLLECTION).doc(studentId)),
      read(db.collection('grades').doc(studentId).collection('evidenceEvents')),
    ]);
    return planStudentChoiceMissRemoval({
      studentId,
      stored: profileSnapshot.exists ? (profileSnapshot.data() || {}) : null,
      events: eventsSnapshot.docs.map((doc) => ({ id: doc.id, evidence: doc.data() || {} })),
      listed: listed.get(studentId),
      helpers: mathPath,
      now: now(),
    });
  };

  const counts = {
    answersListed: 0, students: listed.size, studentsToWrite: 0, answersToRemove: 0, alreadyRemoved: 0,
    refused: 0, questionRowsRemoved: 0, skillsChanged: 0, statusesLower: 0, studentsWritten: 0, failed: 0,
  };
  const plans = [];
  const studentsOut = [];
  for (const [studentId, items] of listed) {
    counts.answersListed += items.length;
    // eslint-disable-next-line no-await-in-loop
    const plan = await planFor(studentId, (target) => target.get());
    counts.answersToRemove += plan.counts.voided;
    counts.alreadyRemoved += plan.counts.alreadyVoided;
    counts.refused += plan.counts.refused;
    counts.questionRowsRemoved += plan.counts.rowsRemoved;
    counts.skillsChanged += plan.changes.length;
    counts.statusesLower += plan.changes.filter((change) => statusFell(change.from?.status, change.to?.status)).length;
    if (plan.action === 'write') {
      counts.studentsToWrite += 1;
      plans.push(studentId);
    }
    studentsOut.push({ studentId, action: plan.action, answers: plan.answers, changes: plan.changes });
  }
  log(`${counts.answersListed} answers listed for ${counts.students} students; ${counts.answersToRemove} to remove, ${counts.refused} refused, ${counts.alreadyRemoved} already removed.`);

  const result = {
    tool: TOOL,
    mode: execute ? 'execute' : 'read-only',
    startedAt,
    window: report.window,
    windowCheck: report.windowCheck,
    reportCounts: report.counts,
    counts,
    students: studentsOut,
    execution: null,
  };
  if (!execute || !plans.length) return result;
  if (!(await confirm(counts))) return { ...result, aborted: true };

  const execution = { written: [], unchanged: [], failed: [] };
  for (const studentId of plans) {
    const profileRef = db.collection(PROFILES_COLLECTION).doc(studentId);
    try {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await db.runTransaction(async (transaction) => {
        // Everything read again and re-planned here: evidence that arrived and
        // a document the mastery trigger rewrote since the plan above.
        const plan = await planFor(studentId, (target) => transaction.get(target));
        if (plan.action !== 'write') return { action: plan.action };
        transaction.set(profileRef, plan.document);
        return { action: 'written', removed: plan.counts.voided, changes: plan.changes };
      });
      if (outcome.action === 'written') {
        counts.studentsWritten += 1;
        execution.written.push({ studentId, removed: outcome.removed, changes: outcome.changes });
      } else execution.unchanged.push({ studentId, action: outcome.action });
    } catch (error) {
      // One student never stops the run, and the report is still written.
      counts.failed += 1;
      execution.failed.push({ studentId, message: String(error?.message || error).slice(0, 300) });
    }
  }
  return { ...result, counts, execution };
};

const askLine = (question) => new Promise((resolve) => {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  let settled = false;
  const finish = (answer) => { if (!settled) { settled = true; prompt.close(); resolve(answer); } };
  prompt.on('close', () => finish(''));
  prompt.question(question).then(finish, () => finish(''));
});

const printCounts = (result) => {
  Object.entries(result.counts).forEach(([key, value]) => console.log(`  ${key.padEnd(24)} ${value}`));
  const check = result.windowCheck || {};
  if (check.holds === false) {
    console.log(`\nThe window does not hold (${check.choiceItemsRecordedRight} choice answer(s) recorded RIGHT inside it): only the answers whose own recap shows the bug are listed. See the report.`);
  }
  for (const [label, probe] of [['before --since', check.beforeSince], ['after --until', check.afterUntil]]) {
    if (probe?.recordedWrongChoiceWithoutRecap) {
      console.log(`\nWindow edge: ${probe.recordedWrongChoiceWithoutRecap} choice answer(s) recorded wrong ${label} are NOT listed and NOT removed. Widen the window if the double-hashing code was still serving then.`);
    }
  }
};

const main = async () => {
  let options;
  try {
    options = parseRemovalArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${TOOL}: ${error.message}\n\n${USAGE}`);
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
      console.error(`${TOOL}: firebase-admin is not installed in functions/. Run \`npm --prefix functions ci\` first.`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, TOOL);
  console.log(`My Math Path choice misses, removed from mastery — ${options.execute ? 'EXECUTE' : 'READ ONLY (nothing is written)'}`);
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  console.log(`  window:  ${new Date(options.since).toISOString()} .. ${new Date(options.until).toISOString()}`);
  const confirm = !options.execute ? null : options.yes
    ? async () => true
    : async (counts) => {
      console.log(`\n  ${counts.answersToRemove} answer(s) will be removed from ${counts.studentsToWrite} student(s)' mastery (${counts.refused} refused, left as they are).`);
      const answer = await askLine(`Type the project id to write to ${options.project}: `);
      return answer.trim() === options.project;
    };

  let result;
  try {
    result = await runPathChoiceMasteryRemoval({
      db: app.firestore(),
      since: options.since,
      until: options.until,
      pageSize: options.pageSize,
      probeDays: options.probeDays,
      execute: options.execute,
      students: options.students,
      confirm,
      log: (line) => console.log(`  ${line}`),
    });
  } finally {
    // Firestore keeps gRPC channels open; without this the process lingers.
    await app.delete().catch(() => {});
  }
  result.project = options.project;
  result.emulator = emulator;

  const outDir = path.resolve(options.outDir || path.join(repoRoot, DEFAULT_OUT_DIR));
  const reportPath = path.join(outDir, `path-choice-mastery-removal-${result.mode}-${result.startedAt.replace(/[:.]/g, '-')}.json`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log('');
  printCounts(result);
  if (result.aborted) console.log('\nNot confirmed; nothing was written.');
  console.log(`\nDetail (student ids, no names): ${path.relative(process.cwd(), reportPath) || reportPath}`);
  if (result.aborted || result.counts.failed) process.exitCode = 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`${TOOL}: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
