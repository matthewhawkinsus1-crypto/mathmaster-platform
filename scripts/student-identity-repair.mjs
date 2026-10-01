#!/usr/bin/env node
/*
 * STUDENT IDENTITY AUDIT AND LEGACY NAME BACKFILL.
 *
 * Some legacy roster records (grades/{studentId}) were created with no name:
 * by sign-in before roster creation was locked down, by browser-side creation,
 * or by createStudentAccount when names were optional. For many of them the
 * name is on file elsewhere, tied to the SAME studentId — the Google Classroom
 * copy (googleName), the Classroom roster link, the account-creation audit, the
 * linked Google account's profile. This tool finds those students and, only
 * when asked, copies that name onto the canonical record.
 *
 *   node scripts/student-identity-repair.mjs --project <id>                 # audit (DRY RUN, the default)
 *   node scripts/student-identity-repair.mjs --project <id> --execute --actor <email>
 *   node scripts/student-identity-repair.mjs --project <id> --rollback <runId> --actor <email>
 *
 * WHAT IT MAY CHANGE. Only firstName, lastName and displayName that are
 * MISSING, plus an identityBackfill provenance stamp beside them. A valid
 * stored name is never overwritten; an identifier, email or placeholder is
 * never a name; two sources that disagree are reported and left alone;
 * students are never merged, renamed, created or deleted; academic data is
 * never read or written (every read is projected to identity fields).
 *
 * The decisions are made by planStudentIdentityRepair in
 * functions/shared/studentIdentity.mjs — the same resolver the server roster
 * and every teacher screen use — and are unit-tested without Firebase in
 * tests/platform/studentIdentityRepairPlan.test.mjs. This file only reads,
 * re-checks inside a transaction, and writes.
 *
 * PRIVACY. Standard output is COUNTS ONLY. The JSON report holds counts unless
 * --list-ids (adds studentIds, never names) or --include-names (adds proposed
 * names: student PII — never commit or share it; identity-reports/ is
 * gitignored). Runbook: docs/handoffs/STUDENT_IDENTITY_REPAIR_RUNBOOK.md.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  IDENTITY_BACKFILL_VERSION,
  STUDENT_IDENTITY_FIELDS,
  identityBackfillStamp,
  planStudentIdentityRepair,
  planStudentIdentityRollback,
} from '../functions/shared/studentIdentity.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin and the auth helpers live in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const authLib = functionsRequire('./lib/auth.js');

export const GRADES_COLLECTION = 'grades';
export const ROSTER_LINK_COLLECTION = 'classroomRosterLinks';
export const BACKFILL_AUDIT_ACTION = 'student_identity_backfill';
export const ROLLBACK_AUDIT_ACTION = 'student_identity_backfill_rollback';
const ACCOUNT_CREATED_ACTION = 'student_account_created';

// Firestore allows 500 writes per transaction; 100 keeps each one small and
// quick to retry under contention, and matches Auth getUsers' limit.
export const TRANSACTION_CHUNK_SIZE = 100;
const GOOGLE_PROFILE_CHUNK_SIZE = 100;

/**
 * Every grades/{studentId} field this tool reads, in the bulk read AND in the
 * per-chunk transaction re-read (one list, so the re-plan sees exactly what the
 * plan saw). Names, the account state, the SIS id and googleUserId (both are
 * identifiers a "name" must not equal), the small support profile (legacy name
 * copies) and the provenance stamp — never gradesByAssignment or any other
 * history map, so the whole roster is read without loading attempt histories.
 */
export const STUDENT_READ_FIELDS = Object.freeze([
  'status',
  'sisStudentId',
  'googleUserId',
  'identityBackfill',
  'profile',
  ...STUDENT_IDENTITY_FIELDS,
]);

const ROLLBACK_READ_FIELDS = Object.freeze(['identityBackfill', ...STUDENT_IDENTITY_FIELDS]);

const noop = () => {};

const chunked = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

/**
 * functions/lib/auth.js studentIdKey throws on an id it would not accept at
 * sign-in. A legacy document id that fails that check must still be counted,
 * so the audit falls back to the same upper-casing instead of aborting.
 */
export const safeStudentIdKey = (value) => {
  try {
    return authLib.studentIdKey(value);
  } catch {
    return String(value ?? '').trim().toUpperCase();
  }
};

/** 'identity-20261001T153012Z' — sortable, and a valid Firestore value. */
export const defaultRunId = (now = new Date()) => (
  `identity-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
);

let firestoreModule = null;
const loadFieldValue = () => {
  if (!firestoreModule) {
    try {
      firestoreModule = functionsRequire('firebase-admin/firestore');
    } catch (error) {
      if (error?.code === 'MODULE_NOT_FOUND') {
        throw new Error('firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      }
      throw error;
    }
  }
  return firestoreModule.FieldValue;
};

const readGoogleProfiles = async (auth, directory) => {
  const linked = directory.filter((entry) => entry.uid && entry.studentId);
  const profiles = [];
  let accountsNotFound = 0;
  for (const chunk of chunked(linked, GOOGLE_PROFILE_CHUNK_SIZE)) {
    let result;
    try {
      result = await auth.getUsers(chunk.map((entry) => ({ uid: entry.uid })));
    } catch (error) {
      // Fail rather than plan without a source: a missing source can turn a
      // conflict into an apparently agreed name. Skipping it is the operator's call.
      throw new Error(`could not read linked Google profiles from Firebase Auth (${error?.code || error?.message || error}). `
        + 'Grant Auth read access, or re-run with --skip-google-profiles.');
    }
    const byUid = new Map((result.users || []).map((user) => [user.uid, user]));
    accountsNotFound += (result.notFound || []).length;
    chunk.forEach((entry) => {
      // displayName only. The planner rejects one that is an id or an email.
      const displayName = byUid.get(entry.uid)?.displayName;
      if (displayName) profiles.push({ studentId: entry.studentId, displayName });
    });
  }
  return { profiles, linkedAccounts: linked.length, accountsNotFound };
};

/**
 * Read everything the planner needs, every read projected. No per-student
 * reads: six collection reads, plus Auth profiles in batches of 100.
 */
export const readIdentityInputs = async ({ db, auth = null }) => {
  const [grades, creationAudits, rosterLinks, aliases, directory, credentials] = await Promise.all([
    db.collection(GRADES_COLLECTION).select(...STUDENT_READ_FIELDS).get(),
    db.collection(authLib.ADMIN_AUDIT_COLLECTION)
      .where('action', '==', ACCOUNT_CREATED_ACTION)
      .select('target', 'details')
      .get(),
    db.collection(ROSTER_LINK_COLLECTION).select('studentId', 'name', 'googleUserId', 'courseId').get(),
    db.collection(authLib.ALIAS_COLLECTION).select('key', 'studentId').get(),
    db.collection(authLib.DIRECTORY_COLLECTION).select('studentId', 'uid').get(),
    db.collection(authLib.CREDENTIALS_COLLECTION).select().get(),
  ]);

  const directoryEntries = directory.docs.map((entry) => ({
    email: entry.id,
    studentId: entry.get('studentId') || null,
    uid: entry.get('uid') || null,
  }));
  const google = auth
    ? await readGoogleProfiles(auth, directoryEntries)
    : { profiles: [], linkedAccounts: null, accountsNotFound: null };

  return {
    students: grades.docs.map((entry) => ({ studentId: entry.id, data: entry.data() || {} })),
    creationAudits: creationAudits.docs.map((entry) => {
      const details = entry.get('details') || {};
      return {
        studentId: entry.get('target') || null,
        firstName: details.firstName || null,
        lastName: details.lastName || null,
        displayName: details.displayName || null,
      };
    }),
    rosterLinks: rosterLinks.docs.map((entry) => ({
      studentId: entry.get('studentId') || null,
      name: entry.get('name') || null,
      googleUserId: entry.get('googleUserId') || null,
      courseId: entry.get('courseId') || null,
    })),
    googleProfiles: google.profiles,
    aliases: aliases.docs.map((entry) => ({ key: entry.get('key') || entry.id, studentId: entry.get('studentId') || null })),
    directory: directoryEntries.map(({ email, studentId }) => ({ email, studentId })),
    credentialKeys: credentials.docs.map((entry) => entry.id),
    studentIdKey: safeStudentIdKey,
    sources: {
      students: grades.size,
      accountCreationAudits: creationAudits.size,
      classroomRosterLinks: rosterLinks.size,
      aliases: aliases.size,
      directoryLinks: directory.size,
      credentials: credentials.size,
      googleProfiles: auth
        ? { linkedAccounts: google.linkedAccounts, withDisplayName: google.profiles.length, accountsNotFound: google.accountsNotFound }
        : 'skipped',
    },
  };
};

/** The planner over what was read (sources and studentIdKey pass straight through). */
export const planIdentityRepair = (inputs) => planStudentIdentityRepair(inputs);

const planFingerprint = (update) => JSON.stringify([update.source, update.split || null, update.filledFields, update.set]);

/**
 * Apply a plan, at most TRANSACTION_CHUNK_SIZE students per transaction. Inside
 * each transaction the chunk is re-read (same field mask) and RE-PLANNED, and a
 * student is written only when the fresh plan is exactly the planned one:
 *
 *   document gone            -> skipped (deleted); update() never recreates it
 *   name now complete        -> skipped (noLongerNeeded), e.g. a teacher added it
 *   plan differs             -> skipped (planChanged), e.g. a source was edited
 *
 * Writes are update() — never set/merge — and touch only the planned name
 * fields and the identityBackfill stamp.
 */
export const applyIdentityUpdates = async ({
  db,
  FieldValue = loadFieldValue(),
  inputs,
  plan,
  runId,
  chunkSize = TRANSACTION_CHUNK_SIZE,
  log = noop,
}) => {
  const outcome = {
    attempted: plan.updates.length,
    applied: 0,
    appliedBySource: {},
    skipped: { deleted: 0, noLongerNeeded: 0, planChanged: 0 },
    appliedStudentIds: [],
    skippedStudents: [],
    transactions: 0,
  };
  const chunks = chunked(plan.updates, Math.max(1, Math.min(chunkSize, TRANSACTION_CHUNK_SIZE)));
  for (const [chunkIndex, chunk] of chunks.entries()) {
    // The callback may run more than once under contention; only the value of
    // the attempt that committed is counted.
    const result = await db.runTransaction(async (transaction) => {
      const refs = chunk.map((update) => db.collection(GRADES_COLLECTION).doc(update.studentId));
      const snapshots = await transaction.getAll(...refs, { fieldMask: [...STUDENT_READ_FIELDS] });
      const fresh = planStudentIdentityRepair({
        ...inputs,
        students: snapshots
          .filter((snapshot) => snapshot.exists)
          .map((snapshot) => ({ studentId: snapshot.id, data: snapshot.data() || {} })),
      });
      const freshByStudent = new Map(fresh.updates.map((update) => [update.studentId, update]));
      const applied = [];
      const skipped = [];
      chunk.forEach((planned, index) => {
        if (!snapshots[index].exists) {
          skipped.push({ studentId: planned.studentId, reason: 'deleted' });
          return;
        }
        const current = freshByStudent.get(planned.studentId);
        if (!current) {
          skipped.push({ studentId: planned.studentId, reason: 'noLongerNeeded' });
          return;
        }
        if (planFingerprint(current) !== planFingerprint(planned)) {
          skipped.push({ studentId: planned.studentId, reason: 'planChanged' });
          return;
        }
        transaction.update(refs[index], {
          ...current.set,
          identityBackfill: identityBackfillStamp({
            runId,
            at: FieldValue.serverTimestamp(),
            source: current.source,
            split: current.split,
            filledFields: current.filledFields,
          }),
        });
        applied.push({ studentId: current.studentId, source: current.source });
      });
      return { applied, skipped };
    });
    outcome.transactions += 1;
    result.applied.forEach(({ studentId, source }) => {
      outcome.applied += 1;
      outcome.appliedBySource[source] = (outcome.appliedBySource[source] || 0) + 1;
      outcome.appliedStudentIds.push(studentId);
    });
    result.skipped.forEach((entry) => {
      outcome.skipped[entry.reason] += 1;
      outcome.skippedStudents.push(entry);
    });
    log(`  chunk ${chunkIndex + 1}/${chunks.length}: ${result.applied.length} written, ${result.skipped.length} skipped`);
  }
  return outcome;
};

/**
 * Roll back one run: for every student STILL carrying that run's stamp, delete
 * exactly the fields the run filled, and the stamp. A name a person set since
 * (setStudentName deletes the stamp) is not found by the query and is never
 * touched; the stamp is re-checked inside each transaction as well.
 */
export const rollbackIdentityRun = async ({
  db,
  FieldValue = loadFieldValue(),
  runId,
  chunkSize = TRANSACTION_CHUNK_SIZE,
  log = noop,
}) => {
  const target = String(runId || '').trim();
  if (!target) throw new Error('rollback needs the runId of the backfill to undo.');
  const stamped = await db.collection(GRADES_COLLECTION)
    .where('identityBackfill.runId', '==', target)
    .select(...ROLLBACK_READ_FIELDS)
    .get();
  const plan = planStudentIdentityRollback({
    students: stamped.docs.map((entry) => ({ studentId: entry.id, data: entry.data() || {} })),
    runId: target,
  });
  const outcome = {
    stampedStudents: plan.length,
    rolledBack: 0,
    fieldsRemoved: { firstName: 0, lastName: 0, displayName: 0 },
    skipped: { deleted: 0, stampChanged: 0 },
    rolledBackStudentIds: [],
    skippedStudents: [],
    transactions: 0,
  };
  const chunks = chunked(plan, Math.max(1, Math.min(chunkSize, TRANSACTION_CHUNK_SIZE)));
  for (const [chunkIndex, chunk] of chunks.entries()) {
    const result = await db.runTransaction(async (transaction) => {
      const refs = chunk.map((entry) => db.collection(GRADES_COLLECTION).doc(entry.studentId));
      const snapshots = await transaction.getAll(...refs, { fieldMask: [...ROLLBACK_READ_FIELDS] });
      const fresh = new Map(planStudentIdentityRollback({
        students: snapshots
          .filter((snapshot) => snapshot.exists)
          .map((snapshot) => ({ studentId: snapshot.id, data: snapshot.data() || {} })),
        runId: target,
      }).map((entry) => [entry.studentId, entry]));
      const rolledBack = [];
      const skipped = [];
      chunk.forEach((planned, index) => {
        if (!snapshots[index].exists) {
          skipped.push({ studentId: planned.studentId, reason: 'deleted' });
          return;
        }
        const current = fresh.get(planned.studentId);
        if (!current) {
          skipped.push({ studentId: planned.studentId, reason: 'stampChanged' });
          return;
        }
        transaction.update(refs[index], Object.fromEntries(
          current.deleteFields.map((field) => [field, FieldValue.delete()]),
        ));
        rolledBack.push(current);
      });
      return { rolledBack, skipped };
    });
    outcome.transactions += 1;
    result.rolledBack.forEach(({ studentId, deleteFields }) => {
      outcome.rolledBack += 1;
      outcome.rolledBackStudentIds.push(studentId);
      deleteFields.forEach((field) => {
        if (field in outcome.fieldsRemoved) outcome.fieldsRemoved[field] += 1;
      });
    });
    result.skipped.forEach((entry) => {
      outcome.skipped[entry.reason] += 1;
      outcome.skippedStudents.push(entry);
    });
    log(`  chunk ${chunkIndex + 1}/${chunks.length}: ${result.rolledBack.length} rolled back, ${result.skipped.length} skipped`);
  }
  return outcome;
};

const writeRunAudit = async ({ db, FieldValue, actor, action, target, details }) => {
  const ref = await db.collection(authLib.ADMIN_AUDIT_COLLECTION).add({
    actorUid: null,
    actorEmail: actor || null,
    action,
    target,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref?.id || null;
};

/**
 * Run the audit, the backfill or a rollback and return the report.
 *
 *   mode     'audit' (no writes at all) | 'execute' | 'rollback' (runId = the run to undo)
 *   auth     an Admin Auth instance to read linked Google profiles, or null to skip them
 *   confirm  optional async ({ mode, counts }) => boolean, called after planning and
 *            BEFORE the first write; false stops with nothing written
 *
 * The report holds counts only, unless includeStudentIds (studentIds, never
 * names) or includeNames (proposed names: PII) is set.
 */
export const runStudentIdentityRepair = async ({
  db,
  auth = null,
  mode = 'audit',
  runId = null,
  now = new Date(),
  actor = null,
  includeStudentIds = false,
  includeNames = false,
  confirm = null,
  FieldValue = null,
  chunkSize = TRANSACTION_CHUNK_SIZE,
  log = noop,
} = {}) => {
  if (!db) throw new Error('runStudentIdentityRepair needs a Firestore instance.');
  if (!['audit', 'execute', 'rollback'].includes(mode)) throw new Error(`Unknown mode "${mode}".`);
  const startedAt = new Date(now).toISOString();
  const report = {
    tool: 'student-identity-repair',
    backfillVersion: IDENTITY_BACKFILL_VERSION,
    mode,
    dryRun: mode === 'audit',
    runId: null,
    actor: actor || null,
    startedAt,
    finishedAt: null,
    containsStudentIds: Boolean(includeStudentIds),
    containsStudentNames: Boolean(includeNames),
  };

  if (mode === 'rollback') {
    const target = String(runId || '').trim();
    if (!target) throw new Error('rollback needs the runId of the backfill to undo.');
    report.runId = target;
    const fieldValue = FieldValue || loadFieldValue();
    if (confirm) {
      const stamped = await db.collection(GRADES_COLLECTION)
        .where('identityBackfill.runId', '==', target)
        .select()
        .get();
      report.rollback = { stampedStudents: stamped.size };
      if (!(await confirm({ mode, counts: { stampedStudents: stamped.size } }))) {
        report.aborted = true;
        report.finishedAt = new Date().toISOString();
        return report;
      }
    }
    log(`Rolling back ${target}…`);
    const outcome = await rollbackIdentityRun({ db, FieldValue: fieldValue, runId: target, chunkSize, log });
    const summary = {
      stampedStudents: outcome.stampedStudents,
      rolledBack: outcome.rolledBack,
      fieldsRemoved: outcome.fieldsRemoved,
      skipped: outcome.skipped,
      transactions: outcome.transactions,
    };
    report.rollback = summary;
    report.auditLogId = await writeRunAudit({
      db,
      FieldValue: fieldValue,
      actor,
      action: ROLLBACK_AUDIT_ACTION,
      target,
      details: { rolledBack: summary.rolledBack, fieldsRemoved: summary.fieldsRemoved, skipped: summary.skipped },
    });
    if (includeStudentIds) {
      report.studentIds = { rolledBack: outcome.rolledBackStudentIds, skipped: outcome.skippedStudents };
    }
    report.finishedAt = new Date().toISOString();
    return report;
  }

  const inputs = await readIdentityInputs({ db, auth });
  const plan = planIdentityRepair(inputs);
  report.sources = inputs.sources;
  report.counts = plan.counts;
  if (includeStudentIds) {
    report.studentIds = {
      plannedUpdates: plan.updates.map(({ studentId, source, filledFields }) => ({ studentId, source, filledFields })),
      unresolved: plan.unresolved,
      conflicts: plan.conflicts,
      needsStructuredNameConfirmation: plan.needsStructuredName,
    };
  }
  if (includeNames) {
    report.proposedNames = plan.updates.map(({ studentId, source, split, set }) => ({ studentId, source, split, set }));
  }

  if (mode === 'audit') {
    report.finishedAt = new Date().toISOString();
    return report;
  }

  report.runId = String(runId || defaultRunId(new Date(now)));
  // A rollback undoes everything stamped with a runId, so a runId is used once.
  const reused = await db.collection(GRADES_COLLECTION)
    .where('identityBackfill.runId', '==', report.runId)
    .select()
    .limit(1)
    .get();
  if (!reused.empty) {
    throw new Error(`runId ${report.runId} is already stamped on roster records; a run id is used once. Nothing was written.`);
  }
  const fieldValue = FieldValue || loadFieldValue();
  if (confirm && !(await confirm({ mode, counts: plan.counts }))) {
    report.aborted = true;
    report.finishedAt = new Date().toISOString();
    return report;
  }
  log(`Writing ${plan.updates.length} planned update(s) as ${report.runId}…`);
  const outcome = await applyIdentityUpdates({
    db, FieldValue: fieldValue, inputs, plan, runId: report.runId, chunkSize, log,
  });
  report.execution = {
    attempted: outcome.attempted,
    applied: outcome.applied,
    appliedBySource: outcome.appliedBySource,
    skipped: outcome.skipped,
    transactions: outcome.transactions,
  };
  report.auditLogId = await writeRunAudit({
    db,
    FieldValue: fieldValue,
    actor,
    action: BACKFILL_AUDIT_ACTION,
    target: report.runId,
    details: { counts: plan.counts, applied: outcome.applied, skipped: outcome.skipped },
  });
  if (includeStudentIds) {
    report.studentIds.applied = outcome.appliedStudentIds;
    report.studentIds.skipped = outcome.skippedStudents;
  }
  report.finishedAt = new Date().toISOString();
  return report;
};

/* ------------------------------------------------------------------------- */
/* Command line                                                              */
/* ------------------------------------------------------------------------- */

const USAGE = `Student identity audit and legacy name backfill.

  node scripts/student-identity-repair.mjs --project <id> [options]

With no mode flag this is a DRY RUN: it reads and reports, and writes nothing.

  --project <id>          Firebase project (required; there is no default)
  --execute               write the planned names (asks for the project id)
  --rollback <runId>      remove exactly what that run filled, where its stamp remains
  --actor <email>         who is running it; recorded in adminAuditLog
                          (required with --execute and --rollback)
  --yes                   skip the typed project-id confirmation
  --report <path>         report file (default identity-reports/student-identity-<mode>-<time>.json)
  --list-ids              add studentIds of planned/unresolved/conflicting students to
                          the report (never names)
  --include-names         add proposed names to the report. The report then holds
                          student PII: never commit or share it.
  --skip-google-profiles  do not read linked Google account profiles from Firebase Auth
  --help                  this text

Standard output is counts only. Runbook: docs/handoffs/STUDENT_IDENTITY_REPAIR_RUNBOOK.md`;

const VALUE_FLAGS = new Set(['project', 'rollback', 'actor', 'report']);
const BOOLEAN_FLAGS = new Set(['execute', 'yes', 'list-ids', 'include-names', 'skip-google-profiles', 'help']);

export const parseRepairArgs = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument "${arg}".`);
    const [rawName, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    if (BOOLEAN_FLAGS.has(rawName)) {
      if (inlineValue !== undefined) throw new Error(`--${rawName} takes no value.`);
      options[rawName] = true;
    } else if (VALUE_FLAGS.has(rawName)) {
      const value = inlineValue ?? argv[index + 1];
      if (!value || (inlineValue === undefined && value.startsWith('--'))) throw new Error(`--${rawName} needs a value.`);
      if (inlineValue === undefined) index += 1;
      options[rawName] = value.trim();
    } else {
      throw new Error(`Unknown option --${rawName}. See --help.`);
    }
  }
  if (options.help) return { help: true };
  if (!options.project) throw new Error('--project <id> is required. Nothing has been read.');
  if (options.execute && options.rollback) throw new Error('--execute and --rollback cannot be combined.');
  const mode = options.rollback ? 'rollback' : options.execute ? 'execute' : 'audit';
  if (mode !== 'audit' && !options.actor) throw new Error(`--actor <email> is required with --${mode} so the audit log names who ran it.`);
  return {
    help: false,
    project: options.project,
    mode,
    rollbackRunId: options.rollback || null,
    actor: options.actor || null,
    yes: Boolean(options.yes),
    reportPath: options.report || null,
    includeStudentIds: Boolean(options['list-ids']),
    includeNames: Boolean(options['include-names']),
    skipGoogleProfiles: Boolean(options['skip-google-profiles']),
  };
};

const printCounts = (report) => {
  const lines = [];
  const add = (label, value) => lines.push(`  ${label.padEnd(56)} ${value}`);
  if (report.counts) {
    const { counts } = report;
    add('students on the roster', counts.totalStudents);
    add('  active / disabled', `${counts.activeStudents} / ${counts.disabledStudents}`);
    add('active with complete canonical names', counts.active.completeCanonicalNames);
    add('active with no usable name on file', counts.active.noUsableHumanName);
    add('active with an id-like stored name', counts.active.idLikeStoredName);
    add('active recoverable from another source', counts.active.recoverableElsewhere);
    add('active NOT recoverable automatically', counts.active.notRecoverableAutomatically);
    add('planned updates', counts.plannedUpdates);
    Object.entries(counts.plannedUpdatesBySource).forEach(([source, value]) => {
      if (value) add(`  from ${source}`, value);
    });
    add('first/last splits (two-part / "Last, First")', `${counts.plannedFirstLastSplits.twoPartName} / ${counts.plannedFirstLastSplits.commaName}`);
    add('need a person to confirm first/last', counts.needsStructuredNameConfirmation);
    add('unresolved (no source / conflicting)', `${counts.unresolved.noAuthoritativeSource} / ${counts.unresolved.conflictingSources}`);
    add('duplicate human names (groups / students)', `${counts.duplicateHumanNames.groups} / ${counts.duplicateHumanNames.students}`);
    add('duplicate SIS ids (groups / students)', `${counts.duplicateSisIds.groups} / ${counts.duplicateSisIds.students}`);
    Object.entries(counts.identityRecordMismatches).forEach(([name, value]) => add(`mismatch: ${name}`, value));
  }
  if (report.execution) {
    add('written', report.execution.applied);
    add('skipped (deleted / now named / plan changed)', `${report.execution.skipped.deleted} / ${report.execution.skipped.noLongerNeeded} / ${report.execution.skipped.planChanged}`);
  }
  if (report.rollback) {
    add('students still stamped with this run', report.rollback.stampedStudents);
    if ('rolledBack' in report.rollback) {
      add('rolled back', report.rollback.rolledBack);
      add('skipped (deleted / stamp changed)', `${report.rollback.skipped.deleted} / ${report.rollback.skipped.stampChanged}`);
    }
  }
  console.log(lines.join('\n'));
};

// A closed stdin (piped, CI) answers "" instead of leaving the prompt pending.
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
    options = parseRepairArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`student-identity-repair: ${error.message}`);
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
      console.error('student-identity-repair: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application default credentials (gcloud auth application-default login);
  // under FIRESTORE_EMULATOR_HOST the Admin SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'student-identity-repair');
  const db = app.firestore();
  let auth = options.skipGoogleProfiles ? null : app.auth();
  const notes = [];
  if (auth && emulator && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    auth = null;
    notes.push('Google profiles skipped: Firestore is the emulator and no Auth emulator is configured.');
  }

  const labels = { audit: 'AUDIT (dry run — nothing is written)', execute: 'EXECUTE', rollback: `ROLLBACK of ${options.rollbackRunId}` };
  console.log(`Student identity repair — ${labels[options.mode]}`);
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  notes.forEach((note) => console.log(`  ${note}`));
  if (options.includeNames) {
    console.error('\nWARNING: --include-names puts student names (PII) in the report file.'
      + '\n         Never commit it, paste it, or share it. Delete it when you are done.\n');
  }

  const confirm = options.mode === 'audit' || options.yes
    ? null
    : async ({ counts }) => {
      console.log('');
      printCounts(options.mode === 'rollback' ? { rollback: counts } : { counts });
      const action = options.mode === 'rollback' ? 'removes backfilled names from' : 'writes names to';
      const answer = await askLine(`\nThis ${action} ${options.project}${emulator ? ' (emulator)' : ''}. Type the project id to continue: `);
      return answer.trim() === options.project;
    };

  let report;
  try {
    report = await runStudentIdentityRepair({
      db,
      auth,
      mode: options.mode,
      runId: options.rollbackRunId,
      actor: options.actor,
      includeStudentIds: options.includeStudentIds,
      includeNames: options.includeNames,
      confirm,
      log: (line) => console.log(line),
    });
  } finally {
    // Firestore keeps gRPC channels open; without this the process lingers.
    await app.delete().catch(() => {});
  }
  report.project = options.project;
  report.emulator = emulator;

  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const reportPath = options.reportPath
    ? path.resolve(options.reportPath)
    : path.join(repoRoot, 'identity-reports', `student-identity-${options.mode}-${stamp}.json`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const insideRepo = !path.relative(repoRoot, reportPath).startsWith('..');
  const insideIgnored = !path.relative(path.join(repoRoot, 'identity-reports'), reportPath).startsWith('..');
  if ((options.includeNames || options.includeStudentIds) && insideRepo && !insideIgnored) {
    console.error(`\nWARNING: ${reportPath} is inside the repository but outside the gitignored identity-reports/. Move it before anything is committed.`);
  }

  console.log('');
  if (report.aborted) {
    console.log('Not confirmed; nothing was written.');
  } else if (confirm) {
    // The plan's counts were printed above the confirmation; only the outcome is new.
    printCounts({ execution: report.execution, rollback: report.rollback });
  } else {
    printCounts(report);
  }
  if (options.mode === 'execute' && report.execution?.applied > 0) {
    console.log(`\nrunId: ${report.runId}`);
    console.log(`Undo: node scripts/student-identity-repair.mjs --project ${options.project} --rollback ${report.runId} --actor <email>`);
  }
  if (options.mode === 'audit') console.log('\nDry run. Re-run with --execute --actor <email> to write the planned names.');
  console.log(`Report: ${path.relative(process.cwd(), reportPath) || reportPath}${options.includeNames ? '  (contains student PII)' : ''}`);
  if (report.aborted) process.exitCode = 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`student-identity-repair: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
