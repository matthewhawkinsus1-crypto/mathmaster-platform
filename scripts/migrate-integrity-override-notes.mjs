#!/usr/bin/env node
/*
 * MOVE INTEGRITY-ZERO NOTES OFF THE STUDENT-READABLE GRADE DOCUMENT.
 *
 * Until this change an academic-integrity zero (overrideStudentAssignmentGrade)
 * wrote the teacher's free-text note, the teacher's identity and the
 * participant role into grades/{studentId}.teacherGradeOverridesByAssignment,
 * which the student can read. New zeros no longer do
 * (functions/shared/integrityOverridePrivacy.mjs). This one-off moves the
 * fields of existing overrides onto their teacher-only incident
 * (studentSupportEvents/{incidentId}) and strips them from the grade doc.
 *
 *   node scripts/migrate-integrity-override-notes.mjs --project <id>                         # DRY RUN (default)
 *   node scripts/migrate-integrity-override-notes.mjs --project <id> --execute --actor <email>
 *
 * WHAT IT MAY CHANGE. On the grade doc: only the `note`, `actor` and
 * `participantRole` keys of override entries (and an `incidentId` link where
 * it had to create the incident). A score, an active flag, a source, the
 * section restore state — any grade value — is never changed; the transaction
 * refuses a plan that would. On an incident: only fields it does NOT already
 * hold are added; a differing grade copy is kept beside them, never
 * overwriting. An entry whose details have nowhere to go is left as it is and
 * reported. Re-running after a complete run plans nothing.
 *
 * Each student is one transaction that re-reads and re-plans, so a teacher
 * acting meanwhile is never overwritten. Stripping a field changes the
 * override map, which wakes syncGradeToClassroom for that assignment; it
 * recomputes and re-posts the SAME grade.
 *
 * PRIVACY. Standard output is counts only. --report writes counts and, with
 * --list-ids, studentId/assignmentId pairs — never a note or a name.
 */

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  INTEGRITY_INCIDENT_COLLECTION,
  INTEGRITY_OVERRIDE_TEACHER_ONLY_FIELDS,
  linkedIncidentIds,
  planIntegrityOverrideNoteMigration,
} from '../functions/shared/integrityOverridePrivacy.mjs';

const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

export const GRADES_COLLECTION = 'grades';
export const MIGRATION_AUDIT_ACTION = 'integrity_override_notes_migration';
const READ_FIELDS = Object.freeze(['teacherGradeOverridesByAssignment', 'assignedTeacherEmail', 'classId']);

const USAGE = `Move integrity-zero notes, actors and participant roles off student-readable grade docs.

  node scripts/migrate-integrity-override-notes.mjs --project <id> [options]

With no mode flag this is a DRY RUN: it reads and reports, and writes nothing.

  --project <id>    Firebase project (required; there is no default)
  --execute         write the plan (asks you to type the project id)
  --actor <email>   who is running it; recorded in adminAuditLog (required with --execute)
  --yes             skip the typed project-id confirmation
  --report <path>   write a JSON report (counts; ids only with --list-ids; never notes)
  --list-ids        add studentId/assignmentId pairs to the report
  --help            this text`;

const VALUE_FLAGS = new Set(['project', 'actor', 'report']);
const BOOLEAN_FLAGS = new Set(['execute', 'yes', 'list-ids', 'help']);

export const parseMigrationArgs = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument "${arg}".`);
    const [name, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    if (BOOLEAN_FLAGS.has(name)) {
      if (inlineValue !== undefined) throw new Error(`--${name} takes no value.`);
      options[name] = true;
    } else if (VALUE_FLAGS.has(name)) {
      const value = inlineValue ?? argv[index + 1];
      if (!value || (inlineValue === undefined && value.startsWith('--'))) throw new Error(`--${name} needs a value.`);
      if (inlineValue === undefined) index += 1;
      options[name] = value.trim();
    } else {
      throw new Error(`Unknown option --${name}. See --help.`);
    }
  }
  if (options.help) return { help: true };
  if (!options.project) throw new Error('--project <id> is required. Nothing has been read.');
  if (options.execute && !options.actor) throw new Error('--actor <email> is required with --execute so the audit log names who ran it.');
  return {
    help: false,
    project: options.project,
    mode: options.execute ? 'execute' : 'dry-run',
    actor: options.actor || null,
    yes: Boolean(options.yes),
    reportPath: options.report || null,
    listIds: Boolean(options['list-ids']),
  };
};

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const stableJson = (value) => (Array.isArray(value)
  ? `[${value.map(stableJson).join(',')}]`
  : isObject(value)
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
    : JSON.stringify(value ?? null));

// One entry as far as grading is concerned: everything but the teacher-only
// fields, and but an incident link the plan ADDED (one it already had counts).
const gradeShape = (entry, before) => {
  if (!isObject(entry)) return entry;
  const shape = { ...entry };
  INTEGRITY_OVERRIDE_TEACHER_ONLY_FIELDS.forEach((field) => { delete shape[field]; });
  if (!(isObject(before) && before.incidentId)) delete shape.incidentId;
  if (isObject(shape.previousOverridesByQuestion)) {
    shape.previousOverridesByQuestion = Object.fromEntries(Object.entries(shape.previousOverridesByQuestion)
      .map(([index, prior]) => [index, gradeShape(prior, before?.previousOverridesByQuestion?.[index])]));
  }
  return shape;
};
const mapShape = (overrides, beforeOverrides) => stableJson(Object.fromEntries(Object.entries(overrides || {})
  .map(([key, entry]) => [key, gradeShape(entry, beforeOverrides?.[key])])));

/**
 * The plan never changes a grade value: everything on an entry except the
 * teacher-only fields (and an added incident link) must survive unchanged.
 * Checked again here, against the live document, before anything is written.
 */
export const assertPlanKeepsGrades = (gradeData, plan) => {
  plan.assignments.forEach(({ assignmentId, nextOverrides }) => {
    const before = gradeData?.teacherGradeOverridesByAssignment?.[assignmentId] || {};
    if (mapShape(before, before) !== mapShape(nextOverrides, before)) {
      throw new Error(`refusing: the plan for ${plan.studentId}/${assignmentId} would change a grade value.`);
    }
  });
};

const readIncidents = async (read, db, ids) => {
  const found = {};
  if (!ids.length) return found;
  const refs = ids.map((id) => db.collection(INTEGRITY_INCIDENT_COLLECTION).doc(id));
  const snapshots = await read(refs);
  snapshots.forEach((snapshot) => { if (snapshot.exists) found[snapshot.id] = snapshot.data() || {}; });
  return found;
};

/*
 * Plan one student from what `read` returns. The plan may name incidents to
 * CREATE under a deterministic id; those are read too, and if one exists
 * already the student is re-planned with it, so a re-run reuses it.
 */
const planStudent = async ({ db, read, studentId, gradeData, nowIso }) => {
  const incidentsById = await readIncidents(read, db, linkedIncidentIds(gradeData));
  let plan = planIntegrityOverrideNoteMigration({ studentId, gradeData, incidentsById, nowIso });
  const createIds = plan.incidentWrites.filter((write) => write.op === 'create' && !(write.incidentId in incidentsById))
    .map((write) => write.incidentId);
  const existing = await readIncidents(read, db, createIds);
  if (Object.keys(existing).length) {
    plan = planIntegrityOverrideNoteMigration({ studentId, gradeData, incidentsById: { ...incidentsById, ...existing }, nowIso });
  }
  return plan;
};

const emptyCounts = () => ({
  gradeDocsScanned: 0,
  gradeDocsToChange: 0,
  assignmentsChanged: 0,
  strippedEntries: 0,
  incidentsFilled: 0,
  incidentsCreated: 0,
  unresolved: 0,
});

const addCounts = (total, counts) => {
  Object.keys(counts).forEach((key) => { total[key] = (total[key] || 0) + counts[key]; });
};

/**
 * Run the migration against a Firestore Admin `db`. mode 'dry-run' never
 * writes. `confirm` (optional) is asked after planning, before any write.
 */
export const runIntegrityOverrideNoteMigration = async ({
  db,
  FieldPath,
  mode = 'dry-run',
  actor = null,
  confirm = null,
  listIds = false,
  now = () => new Date().toISOString(),
} = {}) => {
  if (!['dry-run', 'execute'].includes(mode)) throw new Error(`Unknown mode "${mode}".`);
  const nowIso = now();
  const counts = emptyCounts();
  const planned = [];
  const unresolved = [];
  const snapshot = await db.collection(GRADES_COLLECTION).select(...READ_FIELDS).get();
  counts.gradeDocsScanned = snapshot.size;
  for (const doc of snapshot.docs) {
    const gradeData = doc.data() || {};
    // One malformed document is reported and left untouched; it never stops
    // the run for every other student.
    let plan;
    try {
      // eslint-disable-next-line no-await-in-loop
      plan = await planStudent({ db, read: (refs) => db.getAll(...refs), studentId: doc.id, gradeData, nowIso });
      assertPlanKeepsGrades(gradeData, plan);
    } catch (error) {
      counts.unresolved += 1;
      unresolved.push({ studentId: doc.id, reason: 'plan-refused', message: String(error?.message || error).slice(0, 200) });
      continue;
    }
    if (plan.assignments.length) {
      counts.gradeDocsToChange += 1;
      planned.push(doc.id);
    }
    addCounts(counts, plan.counts);
    plan.unresolved.forEach((entry) => unresolved.push({ studentId: doc.id, ...entry }));
  }

  const report = { mode, plannedAt: nowIso, counts, execution: null };
  if (listIds) report.ids = { planned, unresolved };
  if (mode !== 'execute' || !planned.length) return report;
  if (confirm && !(await confirm({ counts }))) {
    report.execution = { aborted: true };
    return report;
  }

  const execution = { applied: 0, unchanged: 0, missing: 0, refused: 0 };
  for (const studentId of planned) {
    const gradeRef = db.collection(GRADES_COLLECTION).doc(studentId);
    // eslint-disable-next-line no-await-in-loop
    const outcome = await db.runTransaction(async (transaction) => {
      const [fresh] = await transaction.getAll(gradeRef, { fieldMask: [...READ_FIELDS] });
      if (!fresh.exists) return 'missing';
      const gradeData = fresh.data() || {};
      const plan = await planStudent({
        db, read: (refs) => transaction.getAll(...refs), studentId, gradeData, nowIso,
      });
      try {
        assertPlanKeepsGrades(gradeData, plan);
      } catch {
        return 'refused';
      }
      if (!plan.assignments.length) return 'unchanged';
      // Teacher-only copy first, in the same transaction as the strip.
      plan.incidentWrites.forEach((write) => {
        const ref = db.collection(INTEGRITY_INCIDENT_COLLECTION).doc(write.incidentId);
        if (write.op === 'create') transaction.create(ref, write.data);
        else transaction.set(ref, write.data, { merge: true });
      });
      const updates = plan.assignments.flatMap(({ assignmentId, nextOverrides }) => [
        new FieldPath('teacherGradeOverridesByAssignment', assignmentId), nextOverrides,
      ]);
      transaction.update(gradeRef, ...updates);
      return 'applied';
    });
    execution[outcome] += 1;
  }
  report.execution = execution;
  await db.collection('adminAuditLog').add({
    action: MIGRATION_AUDIT_ACTION,
    actorEmail: actor,
    at: now(),
    details: { counts, execution },
  });
  return report;
};

const printCounts = (report) => {
  const lines = [`mode: ${report.mode}`];
  const add = (label, value) => lines.push(`  ${label.padEnd(44)} ${value}`);
  add('grade docs scanned', report.counts.gradeDocsScanned);
  add('grade docs to change', report.counts.gradeDocsToChange);
  add('assignments to change', report.counts.assignmentsChanged);
  add('override entries to strip', report.counts.strippedEntries);
  add('incidents to fill (missing fields only)', report.counts.incidentsFilled);
  add('incidents to create (none linked)', report.counts.incidentsCreated);
  add('unresolved (left untouched)', report.counts.unresolved);
  if (report.execution) {
    if (report.execution.aborted) add('execution', 'aborted');
    else add('applied / unchanged / missing', `${report.execution.applied} / ${report.execution.unchanged} / ${report.execution.missing}`);
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
    options = parseMigrationArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`migrate-integrity-override-notes: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  let admin;
  let FieldPath;
  try {
    admin = functionsRequire('firebase-admin');
    ({ FieldPath } = functionsRequire('firebase-admin/firestore'));
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      console.error('migrate-integrity-override-notes: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  // Application default credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'migrate-integrity-override-notes');
  const db = app.firestore();
  const confirm = options.yes ? null : async ({ counts }) => {
    printCounts({ mode: 'plan', counts });
    const typed = await askLine(`Type the project id (${options.project}) to write: `);
    return typed.trim() === options.project;
  };
  const report = await runIntegrityOverrideNoteMigration({
    db, FieldPath, mode: options.mode, actor: options.actor, confirm, listIds: options.listIds,
  });
  printCounts(report);
  if (options.reportPath) writeFileSync(options.reportPath, `${JSON.stringify({ project: options.project, ...report }, null, 2)}\n`);
  await app.delete();
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`migrate-integrity-override-notes: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
