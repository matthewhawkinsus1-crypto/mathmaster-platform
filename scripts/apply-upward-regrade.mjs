#!/usr/bin/env node
/*
 * RE-GRADE UPWARD ONLY: APPLY WHAT A READ-ONLY COUNT LISTED (decision D8,
 * the owner, 2026-10-16: "run the read-only count, then re-grade upward only").
 *
 *   node scripts/apply-upward-regrade.mjs --project <id> --from <report.json>...                        # DRY RUN (default)
 *   node scripts/apply-upward-regrade.mjs --project <id> --from <report.json>... --apply --actor <email>
 *
 * First run the read-only count — scripts/report-classroom-regrade-candidates.mjs,
 * or the assignments surface of scripts/report-grader-gaps-2-regrade.mjs — and
 * read it. This step takes that report's JSON detail and, for each classroom
 * attempt it listed for raising, reads the student's records again and raises
 * the grade only when scripts/lib/upwardRegrade.mjs says so: marked wrong,
 * right now under the platform's own replay, and no teacher decision on it.
 * It never lowers a grade, and it never touches an attempt the report says a
 * teacher must look at. Secure Test Cycle work and My Math Path are not
 * classroom attempts: their rows are left out and counted.
 *
 * SAFETY, as the other operator scripts:
 *   - read-only by default: without --apply it reads, plans and writes nothing;
 *   - --apply asks you to type the project id before the first write;
 *   - --yes skips that question and is refused unless FIRESTORE_EMULATOR_HOST
 *     is set: against a real project a person always types the id;
 *   - each attempt is one transaction that reads and plans again, so a teacher
 *     acting meanwhile is never overwritten;
 *   - each raise writes a gradeOverrideAudits record beside the grade, and
 *     the run one adminAuditLog entry naming --actor.
 *
 * GOOGLE CLASSROOM. Nothing here calls it. The override and the
 * classroomReleaseSignals entry wake syncGradeToClassroom, the platform's own
 * grade sync, which posts the grade the student now has.
 *
 * PRIVACY. Standard output is counts only. The JSON outcome lists student,
 * assignment and question ids with each outcome (no names, no answers) and
 * goes to the gitignored release-reports/ unless --report says otherwise.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SKIP, candidatesFromReports, planUpwardRegrade, upwardRegradeWrites } from './lib/upwardRegrade.mjs';
import { responseInspectionEvidenceDocumentId } from '../functions/shared/responseInspector.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

export const TOOL = 'apply-upward-regrade';
export const VERSION = 1;
export const RUN_AUDIT_ACTION = 'regrade_upward_d8';
export const REPORT_DIR = 'release-reports';
export const UNREADABLE = 'unreadable';
export const OUTCOMES = Object.freeze(['raise', ...Object.values(SKIP), UNREADABLE]);

const USAGE = `Re-grade upward only (decision D8): raise the classroom answers a read-only re-grade report listed.

  node scripts/apply-upward-regrade.mjs --project <id> --from <report.json> [options]

With no --apply this is a DRY RUN: it reads and plans, and writes nothing.

  --project <id>    Firebase project (required; there is no default)
  --from <path>     the JSON detail of report-classroom-regrade-candidates.mjs or
                    report-grader-gaps-2-regrade.mjs (repeatable; at least one)
  --apply           write the plan (asks you to type the project id)
  --actor <email>   who is running it; recorded in the audit (required with --apply)
  --yes             skip the typed project id; refused unless FIRESTORE_EMULATOR_HOST is set
  --report <path>   where the JSON outcome goes (default ${REPORT_DIR}/, gitignored)
  --help            this text`;

const VALUE_FLAGS = new Set(['project', 'from', 'actor', 'report']);
const BOOLEAN_FLAGS = new Set(['apply', 'yes', 'help']);

export const parseApplyArgs = (argv, env = process.env) => {
  const options = { from: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument "${arg}".`);
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      options[name] = true;
    } else if (VALUE_FLAGS.has(name)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value.`);
      index += 1;
      if (name === 'from') options.from.push(value);
      else options[name] = value.trim();
    } else {
      throw new Error(`Unknown option --${name}. See --help.`);
    }
  }
  if (options.help) return { help: true };
  if (!options.project) throw new Error('--project <id> is required. Nothing has been read.');
  if (!options.from.length) throw new Error('--from <report.json> is required: this step applies only what a read-only count listed.');
  if (options.apply && !options.actor) throw new Error('--actor <email> is required with --apply so the audit names who ran it.');
  if (options.yes && !options.apply) throw new Error('--yes only makes sense with --apply.');
  if (options.yes && !env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('refusing --yes: it skips the typed project id, which is allowed only against the Firestore emulator (FIRESTORE_EMULATOR_HOST). Against a real project, type the id.');
  }
  return {
    help: false,
    project: options.project,
    from: options.from,
    mode: options.apply ? 'apply' : 'dry-run',
    actor: options.actor || null,
    yes: Boolean(options.yes),
    reportPath: options.report || null,
  };
};

const refsFor = (db, { studentId, assignmentId, questionIndex }) => {
  const gradeRef = db.collection('grades').doc(studentId);
  return {
    gradeRef,
    assignmentRef: db.collection('assignments').doc(assignmentId),
    evidenceRef: gradeRef.collection('responseInspectionEvidence').doc(responseInspectionEvidenceDocumentId({ assignmentId, questionIndex })),
  };
};

// One malformed stored record is counted as unreadable and left as it is; it
// never ends the run for every other student.
const planFrom = (candidate, [gradeSnap, assignmentSnap, evidenceSnap]) => {
  try {
    return planUpwardRegrade({
      ...candidate,
      gradeData: gradeSnap?.exists ? gradeSnap.data() || {} : null,
      assignment: assignmentSnap?.exists ? assignmentSnap.data() || {} : null,
      evidenceDocument: evidenceSnap?.exists ? evidenceSnap.data() || null : null,
    });
  } catch {
    return { ...candidate, outcome: UNREADABLE };
  }
};

const summary = ({ studentId, assignmentId, questionIndex, outcome, oldScore = null, newScore = null }) => ({
  studentId, assignmentId, questionIndex, outcome, oldScore, newScore,
});

/**
 * Plan every candidate and, in 'apply' mode after `confirm`, raise each one
 * that still plans as a raise in its own transaction. `db` is a Firestore
 * (Admin SDK); `FieldPath` builds a path from segments (a map key may hold any
 * character). The dry run uses only getAll.
 */
export const runUpwardRegrade = async ({
  db,
  FieldPath,
  candidates = [],
  mode = 'dry-run',
  confirm = null,
  actor = null,
  now = () => new Date().toISOString(),
  runId = null,
} = {}) => {
  if (!['dry-run', 'apply'].includes(mode)) throw new Error(`Unknown mode "${mode}".`);
  const startedAt = now();
  const id = runId || `regrade-upward-${startedAt.replace(/[:.]/g, '-')}`;
  const byOutcome = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
  const planned = [];
  for (const candidate of candidates) {
    const { gradeRef, assignmentRef, evidenceRef } = refsFor(db, candidate);
    // eslint-disable-next-line no-await-in-loop
    const plan = planFrom(candidate, await db.getAll(gradeRef, assignmentRef, evidenceRef));
    byOutcome[plan.outcome] = (byOutcome[plan.outcome] || 0) + 1;
    planned.push(summary(plan));
  }
  const report = {
    tool: TOOL, version: VERSION, mode, runId: id, startedAt,
    counts: { candidates: candidates.length, byOutcome },
    attempts: planned,
    execution: null,
  };
  const toRaise = planned.filter((entry) => entry.outcome === 'raise');
  if (mode !== 'apply' || !toRaise.length) return report;
  if (confirm && !(await confirm({ counts: report.counts }))) {
    report.execution = { aborted: true };
    return report;
  }

  const execution = { raised: 0, changedSincePlan: {}, refused: 0, failed: 0 };
  for (const candidate of toRaise) {
    const { gradeRef, assignmentRef, evidenceRef } = refsFor(db, candidate);
    // eslint-disable-next-line no-await-in-loop
    const outcome = await db.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(gradeRef, assignmentRef, evidenceRef);
      const plan = planFrom(candidate, snapshots);
      if (plan.outcome !== 'raise') return { outcome: plan.outcome };
      const gradeData = snapshots[0].data() || {};
      const assignment = snapshots[1].data() || {};
      const nowIso = now();
      let writes;
      try {
        writes = await upwardRegradeWrites({ plan, assignment, gradeData, actor: { email: actor }, nowIso, runId: id });
      } catch {
        return { outcome: 'refused' };
      }
      transaction.update(gradeRef, ...writes.updates.flatMap(([segments, value]) => [new FieldPath(...segments), value]));
      transaction.set(gradeRef.collection('gradeOverrideAudits').doc(), writes.audit);
      return { outcome: 'raise', newScore: plan.newScore };
    }).catch(() => ({ outcome: 'failed' }));
    const entry = planned.find((row) => row.studentId === candidate.studentId && row.assignmentId === candidate.assignmentId && row.questionIndex === candidate.questionIndex);
    if (outcome.outcome === 'raise') {
      execution.raised += 1;
      entry.applied = true;
    } else if (outcome.outcome === 'refused' || outcome.outcome === 'failed') {
      // Nothing of this attempt was written: a transaction lands whole or not at all.
      execution[outcome.outcome] += 1;
      entry.applied = false;
    } else {
      execution.changedSincePlan[outcome.outcome] = (execution.changedSincePlan[outcome.outcome] || 0) + 1;
      entry.applied = false;
      entry.outcomeAtWrite = outcome.outcome;
    }
  }
  report.execution = execution;
  await db.collection('adminAuditLog').add({
    action: RUN_AUDIT_ACTION,
    actorEmail: actor,
    at: now(),
    details: { runId: id, decision: 'D8', counts: report.counts, execution },
  });
  return report;
};

const printCounts = (report) => {
  const lines = [`mode: ${report.mode}`];
  const add = (label, value) => lines.push(`  ${label.padEnd(44)} ${value}`);
  add('attempts the reports listed', report.counts.candidates);
  Object.entries(report.counts.byOutcome).filter(([, value]) => value).forEach(([outcome, value]) => add(`  ${outcome}`, value));
  if (report.execution) {
    if (report.execution.aborted) add('execution', 'aborted (not confirmed): nothing was written');
    else {
      add('raised', report.execution.raised);
      add('refused at write (would not raise)', report.execution.refused);
      add('failed (nothing written)', report.execution.failed);
      Object.entries(report.execution.changedSincePlan).forEach(([outcome, value]) => add(`  changed since the plan: ${outcome}`, value));
    }
  }
  console.log(lines.join('\n'));
};

const askLine = (question) => new Promise((resolve) => {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  let settled = false;
  const finish = (answer) => {
    if (settled) return;
    settled = true;
    prompt.close();
    resolve(answer);
  };
  prompt.on('close', () => finish(''));
  prompt.question(question).then(finish, () => finish(''));
});

const main = async () => {
  let options;
  try {
    options = parseApplyArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${TOOL}: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  let reports;
  try {
    reports = options.from.map((file) => JSON.parse(readFileSync(path.resolve(file), 'utf8')));
  } catch (error) {
    console.error(`${TOOL}: a --from report could not be read (${error.message}). Nothing has been read from Firestore.`);
    process.exitCode = 2;
    return;
  }
  let candidates;
  let ignored;
  try {
    ({ candidates, ignored } = candidatesFromReports(reports));
  } catch (error) {
    console.error(`${TOOL}: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  let admin;
  let FieldPath;
  try {
    admin = functionsRequire('firebase-admin');
    ({ FieldPath } = functionsRequire('firebase-admin/firestore'));
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      console.error(`${TOOL}: firebase-admin is not installed in functions/. Run \`npm --prefix functions ci\` first.`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application default credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, TOOL);
  console.log(`Re-grade upward only (D8) — ${options.mode === 'apply' ? 'APPLY' : 'DRY RUN (nothing is written)'}`);
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  console.log(`  ${candidates.length} attempt(s) listed for raising in ${options.from.length} report(s); ${Object.values(ignored).reduce((sum, value) => sum + value, 0)} row(s) left out`);
  const confirm = options.mode === 'apply' && !options.yes
    ? async ({ counts }) => {
      printCounts({ mode: 'plan', counts });
      const typed = await askLine(`\nThis raises ${counts.byOutcome.raise} grade(s) in ${options.project}${emulator ? ' (emulator)' : ''}. Type the project id to continue: `);
      return typed.trim() === options.project;
    }
    : null;
  let report;
  try {
    report = await runUpwardRegrade({ db: app.firestore(), FieldPath, candidates, mode: options.mode, confirm, actor: options.actor });
  } finally {
    await app.delete().catch(() => {});
  }
  report.project = options.project;
  report.emulator = emulator;
  report.sources = { files: options.from, ignored };
  const reportPath = options.reportPath
    ? path.resolve(options.reportPath)
    : path.join(repoRoot, REPORT_DIR, `${TOOL}-${report.mode}-${report.startedAt.replace(/[:.]/g, '-')}.json`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log('');
  printCounts(report);
  console.log(`\nOutcome by attempt (ids only): ${path.relative(process.cwd(), reportPath) || reportPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`${TOOL}: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
