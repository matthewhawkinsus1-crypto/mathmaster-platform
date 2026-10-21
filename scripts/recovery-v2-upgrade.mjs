#!/usr/bin/env node
/*
 * RECOVERY V2 — THE PREPARED MIGRATION FOR A LESSON STUDENTS ARE ALREADY IN.
 *
 *   node scripts/recovery-v2-upgrade.mjs                       # offline dry run from the lesson file
 *   node scripts/recovery-v2-upgrade.mjs --snapshot <file>     # dry run of an exported assignment document
 *   node scripts/recovery-v2-upgrade.mjs --project <id>        # dry run against the live copies (read-only)
 *   node scripts/recovery-v2-upgrade.mjs --project <id> --execute \
 *        --actor <operator email> --approved-by <teacher email> \
 *        --expect <assignmentId>=<planHash> [--expect …]
 *
 * WHAT IT DOES. Finds every live copy of the prepared lesson (by title, then
 * verified: Assignment V5, the right course, assigned to existing active
 * classes — Standard and Honors copies are separate documents and are planned
 * separately), and builds the same dry-run report the teacher's "Prepare
 * Recovery" preview shows (functions/shared/recoveryContentUpgrade.mjs): what
 * will change — one `recoveryContent` field and one audit event per copy —
 * and everything that will not.
 *
 * WHAT IT NEVER DOES. It never edits, adds, removes, reorders or retires a
 * question, and it never writes a student document. Without --execute it
 * writes nothing at all. With --execute it writes only copies whose plan hash
 * matches an --expect the teacher approved from a dry run, re-planned inside
 * a transaction exactly as commitRecoveryContentUpgrade does, after the
 * operator types the project id. The teacher's in-app approval (assignment
 * details → Recovery → Prepare Recovery) is the same operation and the
 * preferred one; this script is for an operator acting on that approval.
 *
 * PRIVACY. Counts only: no student id or name is read into the report.
 * Reports go to recovery-reports/ (gitignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  applyRecoveryUpgrade,
  buildRecoveryUpgradePreview,
  renderRecoveryUpgradeReportText,
} from '../functions/shared/recoveryContentUpgrade.mjs';
import { serverRecoveryKeyCheck } from '../functions/shared/recoveryCertificationGrading.mjs';
import {
  ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2,
  matchPreparedRecoveryMigration,
  preparedRecoveryMigration,
} from '../functions/shared/recoveryMigrations.mjs';
import { RECOVERY_CONTENT_FIELD } from '../functions/shared/recoveryContent.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

export const REPORT_DIR = 'recovery-reports';
const clean = (value) => String(value ?? '').trim();

export const USAGE = `Recovery V2 prepared migration

  node scripts/recovery-v2-upgrade.mjs [options]

  --migration <id>        prepared migration (default ${ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2.id})
  --snapshot <file>       plan an exported assignment document (JSON) instead of reading Firestore
  --project <id>          read the live copies from this Firebase project (read-only unless --execute)
  --execute               write recoveryContent for copies whose plan hash matches an --expect
  --actor <email>         the operator running --execute (required with it)
  --approved-by <email>   the teacher of record who approved the dry run (required with --execute)
  --expect <id>=<hash>    an approved copy and its dry-run plan hash (repeatable; required with --execute)
  --report <path>         where to write the JSON report (default ${REPORT_DIR}/…)
  --yes                   skip the typed project-id confirmation (CI against an emulator only)
`;

export const parseRecoveryV2Args = (argv = []) => {
  const options = { migration: ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2.id, expect: {}, execute: false, yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = String(argv[index]).split(/=(.*)/s);
    const value = () => {
      const next = inline ?? argv[index + 1];
      if (inline === undefined) index += 1;
      if (next === undefined || String(next).startsWith('--')) throw new Error(`${flag} needs a value.`);
      return String(next);
    };
    if (flag === '--help' || flag === '-h') options.help = true;
    else if (flag === '--migration') options.migration = value();
    else if (flag === '--snapshot') options.snapshot = value();
    else if (flag === '--project') options.project = value();
    else if (flag === '--execute') options.execute = true;
    else if (flag === '--actor') options.actor = value();
    else if (flag === '--approved-by') options.approvedBy = value();
    else if (flag === '--report') options.report = value();
    else if (flag === '--yes') options.yes = true;
    else if (flag === '--expect') {
      const pair = value();
      const at = pair.indexOf('=');
      if (at < 1) throw new Error('--expect takes <assignmentId>=<planHash>.');
      options.expect[pair.slice(0, at)] = pair.slice(at + 1);
    } else throw new Error(`Unknown option ${flag}.`);
  }
  if (!preparedRecoveryMigration(options.migration)) throw new Error(`No prepared migration named "${options.migration}".`);
  if (options.execute) {
    if (!options.project) throw new Error('--execute needs --project: there is nothing to write offline.');
    if (!clean(options.actor) || !clean(options.approvedBy)) throw new Error('--execute needs --actor and --approved-by.');
    if (!Object.keys(options.expect).length) throw new Error('--execute needs at least one --expect <assignmentId>=<planHash> from an approved dry run.');
  }
  return options;
};

/*
 * IS THIS DOCUMENT A LIVE COPY WE MAY UPGRADE?
 *
 * The title alone is not enough: an unassigned Library copy, a copy for an
 * archived class, or a different course's lesson with the same title must
 * not be touched. Pure, so it is tested without Firestore.
 */
export const verifyLiveCopy = ({ migration, assignment, classesById = {} }) => {
  const reasons = [];
  const match = matchPreparedRecoveryMigration(migration, assignment);
  reasons.push(...match.reasons);
  if (Number(assignment?.schemaVersion) !== 5) reasons.push('not-assignment-v5');
  if (assignment?.archived === true) reasons.push('archived');
  const classIds = (Array.isArray(assignment?.assignedClassIds) ? assignment.assignedClassIds : []).map(clean).filter(Boolean);
  if (!classIds.length) reasons.push('not-assigned-to-a-class');
  classIds.forEach((classId) => {
    const record = classesById[classId];
    if (!record) reasons.push(`class-missing:${classId}`);
    else if (record.status === 'archived') reasons.push(`class-archived:${classId}`);
  });
  return { live: reasons.length === 0, reasons, variant: match.variant };
};

/** The lesson file, compiled exactly as a teacher's import compiles it, as stand-in live copies. */
export const offlineLessonCopies = async (migration) => {
  const { compileTeacherImport } = await import('./check-teacher-import.mjs');
  const text = readFileSync(path.join(repoRoot, migration.lessonFile), 'utf8');
  const { model } = compileTeacherImport(text);
  const base = {
    ...model.assignmentV5,
    title: model.assignmentV5.assignment.title,
    courseId: model.assignmentV5.assignment.courseId,
  };
  return [
    { ...base, id: 'offline-standard', rigorVariant: 'standard', assignedClassIds: ['offline-class-standard'] },
    { ...base, id: 'offline-honors', rigorVariant: 'honors', assignedClassIds: ['offline-class-honors'] },
  ];
};

/** Every grades row for this assignment, counts only (as the callable reads it). */
const studentRows = async (db, assignment) => {
  const rows = [];
  const seen = new Set();
  for (const classId of assignment.assignedClassIds || []) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection('grades').where('classId', '==', classId)
      .select('gradesByAssignment', 'sectionRecoveryByAssignment').get();
    snapshot.docs.forEach((gradeDoc) => {
      if (seen.has(gradeDoc.id)) return;
      const data = gradeDoc.data() || {};
      const tracker = data.gradesByAssignment?.[assignment.id];
      if (tracker === undefined) return;
      seen.add(gradeDoc.id);
      rows.push({ tracker, recovery: data.sectionRecoveryByAssignment?.[assignment.id] || null });
    });
  }
  return rows;
};

/**
 * Plan (and, when asked, apply) every live copy. `db` is a Firestore Admin
 * instance, or null with `assignments` given (offline / snapshot).
 */
export const runRecoveryV2Upgrade = async ({
  db = null,
  assignments = null,
  migration = ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2,
  execute = false,
  actor = null,
  approvedBy = null,
  expect = {},
  confirm = null,
  now = () => new Date().toISOString(),
  log = () => {},
} = {}) => {
  const startedAt = now();
  const copies = [];
  let candidates = assignments;
  let classesById = {};
  if (db) {
    const titles = [...migration.match.titles];
    const snapshot = await db.collection('assignments').where('title', 'in', titles).get();
    candidates = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    const classIds = [...new Set(candidates.flatMap((entry) => entry.assignedClassIds || []).map(clean).filter(Boolean))];
    const classDocs = await Promise.all(classIds.map((classId) => db.collection('classes').doc(classId).get()));
    classesById = Object.fromEntries(classDocs.filter((entry) => entry.exists).map((entry) => [entry.id, entry.data() || {}]));
  } else {
    classesById = Object.fromEntries((candidates || []).flatMap((entry) => entry.assignedClassIds || []).map((classId) => [classId, { status: 'active' }]));
  }
  for (const assignment of candidates || []) {
    const verified = verifyLiveCopy({ migration, assignment, classesById });
    if (!verified.live) {
      copies.push({ assignmentId: assignment.id, title: assignment.title || null, live: false, reasons: verified.reasons });
      log(`skip ${assignment.id}: ${verified.reasons.join(', ')}`);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const trackers = db ? await studentRows(db, assignment) : [];
    const preview = buildRecoveryUpgradePreview({ assignment, manifest: migration, gradeSample: serverRecoveryKeyCheck, trackers, at: now() });
    copies.push({ assignmentId: assignment.id, live: true, variant: verified.variant, planHash: preview.planHash, report: preview.report });
    log(`\n${renderRecoveryUpgradeReportText(preview.report)}`);
  }
  const result = { startedAt, migrationId: migration.id, mode: execute ? 'execute' : 'dryRun', copies, execution: null };
  if (!execute) return result;

  const approved = copies.filter((copy) => copy.live && expect[copy.assignmentId] && expect[copy.assignmentId] === copy.planHash);
  const mismatched = copies.filter((copy) => copy.live && expect[copy.assignmentId] && expect[copy.assignmentId] !== copy.planHash);
  if (confirm && !(await confirm({ approved: approved.length, mismatched: mismatched.length }))) {
    return { ...result, aborted: true };
  }
  const { FieldValue } = functionsRequire('firebase-admin/firestore');
  const execution = { applied: [], alreadyCurrent: [], refused: mismatched.map((copy) => ({ assignmentId: copy.assignmentId, reason: 'plan-hash-differs-from-approval' })) };
  for (const copy of approved) {
    const ref = db.collection('assignments').doc(copy.assignmentId);
    const eventRef = db.collection('assignmentVersionEvents').doc();
    // eslint-disable-next-line no-await-in-loop
    const outcome = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { refused: 'assignment-missing' };
      const assignment = { id: snapshot.id, ...snapshot.data() };
      const at = now();
      const preview = buildRecoveryUpgradePreview({ assignment, manifest: migration, gradeSample: serverRecoveryKeyCheck, trackers: [], at });
      if (!preview.report.changed) return { alreadyCurrent: true, version: preview.report.recoveryContent.versionBefore };
      if (preview.planHash !== copy.planHash) return { refused: 'assignment-changed-since-dry-run' };
      const applied = applyRecoveryUpgrade({
        assignment,
        plan: preview.plan,
        planHash: preview.planHash,
        migrationId: migration.id,
        at,
        actorUid: null,
        actorEmail: clean(actor).toLowerCase(),
        authorizationType: 'operatorWithTeacherApproval',
        approvedBy: clean(approvedBy).toLowerCase(),
        affectedStudentCount: copy.report?.untouched?.studentRecords?.students ?? null,
      });
      if (!applied.changed) return { alreadyCurrent: true, version: applied.recoveryContent.version };
      transaction.update(ref, { [RECOVERY_CONTENT_FIELD]: applied.recoveryContent });
      transaction.set(eventRef, { ...applied.auditEvent, createdAt: FieldValue.serverTimestamp() });
      return { applied: true, version: applied.recoveryContent.version, added: applied.added };
    });
    if (outcome.applied) execution.applied.push({ assignmentId: copy.assignmentId, ...outcome });
    else if (outcome.alreadyCurrent) execution.alreadyCurrent.push({ assignmentId: copy.assignmentId, version: outcome.version });
    else execution.refused.push({ assignmentId: copy.assignmentId, reason: outcome.refused });
  }
  return { ...result, execution };
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
    options = parseRecoveryV2Args(process.argv.slice(2));
  } catch (error) {
    console.error(`recovery-v2-upgrade: ${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const migration = preparedRecoveryMigration(options.migration);
  let db = null;
  let app = null;
  let assignments = null;
  if (options.project) {
    const admin = functionsRequire('firebase-admin');
    app = admin.initializeApp({ projectId: options.project }, 'recovery-v2-upgrade');
    db = app.firestore();
  } else if (options.snapshot) {
    const parsed = JSON.parse(readFileSync(path.resolve(options.snapshot), 'utf8'));
    assignments = Array.isArray(parsed) ? parsed : [parsed];
  } else {
    assignments = await offlineLessonCopies(migration);
  }
  console.log(`Recovery V2 — ${migration.title}`);
  console.log(`  mode: ${options.execute ? 'EXECUTE' : 'DRY RUN (nothing is written)'} · source: ${options.project ? `project ${options.project}${process.env.FIRESTORE_EMULATOR_HOST ? ' (emulator)' : ''}` : options.snapshot ? `snapshot ${options.snapshot}` : `offline (${migration.lessonFile})`}`);
  const confirm = options.execute && !options.yes
    ? async ({ approved, mismatched }) => {
      console.log(`\n${approved} approved cop${approved === 1 ? 'y' : 'ies'} will gain Recovery; ${mismatched} changed since the dry run and will be refused.`);
      const answer = await askLine(`Type the project id (${options.project}) to write: `);
      return answer.trim() === options.project;
    }
    : null;
  let result;
  try {
    result = await runRecoveryV2Upgrade({
      db,
      assignments,
      migration,
      execute: options.execute,
      actor: options.actor,
      approvedBy: options.approvedBy,
      expect: options.expect,
      confirm,
      log: (line) => console.log(line),
    });
  } finally {
    await app?.delete().catch(() => {});
  }
  const stamp = result.startedAt.replace(/[:.]/g, '-');
  const reportPath = options.report ? path.resolve(options.report) : path.join(repoRoot, REPORT_DIR, `recovery-v2-${result.mode}-${stamp}.json`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log('');
  if (result.aborted) console.log('Not confirmed; nothing was written.');
  if (result.execution) console.log(`Applied ${result.execution.applied.length}, already current ${result.execution.alreadyCurrent.length}, refused ${result.execution.refused.length}.`);
  if (!options.execute) {
    const live = result.copies.filter((copy) => copy.live);
    console.log(`Dry run: ${live.length} live cop${live.length === 1 ? 'y' : 'ies'} planned. To apply with the teacher's approval:`);
    live.forEach((copy) => console.log(`  --expect ${copy.assignmentId}=${copy.planHash}`));
  }
  console.log(`Report: ${path.relative(process.cwd(), reportPath) || reportPath}`);
  if (result.aborted) process.exitCode = 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`recovery-v2-upgrade: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
