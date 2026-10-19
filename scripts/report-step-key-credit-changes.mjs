#!/usr/bin/env node
/*
 * WHICH RECORDED STEP CREDITS RELEASE 1'S STEP KEY WOULD MOVE. A READ-ONLY REPORT.
 * Student pass 3, W5-5 decision 7 (docs/handoffs/STUDENT_PASS3_MATH_DISPLAY.md,
 * "Owner's step"; docs/handoffs/STUDENT_PASS3_RELEASE_RUNBOOK.md, step 0). It
 * has no write mode: no --execute, no repair, and no Firestore write anywhere in
 * this file (tests/platform/stepKeyCreditChangeReport.test.mjs runs it against a
 * database that throws on any write and checks the source).
 *
 *   node scripts/report-step-key-credit-changes.mjs --project <id> [--student <id>]... [--page-size <n>]
 *
 * Release 1 changes the key the server uses to tell one Step Algebra state from
 * another when it derives a step item's credit from stored stepGrades
 * (functions/index.js and functions/lib/classroomGradeRuntime.js,
 * storedAlgebraStepPartialCredit): a TeX tie (2~ x) is spacing, and a unit
 * coefficient before a group (push Q's 1\left() is dropped. A record whose
 * steps wrote one state in both renderings was counted twice by the live key;
 * the new key counts it once, so its derived credit can fall, never below what
 * the server stored (credit = max(bestPartialCredit, derived)).
 *
 * For every question record with stepGrades, the report computes the question's
 * credit as the live servers do and as release 1 will, and lists every record
 * whose credit changes. Both are computed by the same copy of the derivation,
 * checked record by record against the release's own
 * functions/lib/classroomGradeRuntime.js (parityMismatches must be 0). Assignments, Test Cycle Review and Classroom
 * sections all read these same records: grades/{studentId}.gradesByAssignment.
 *
 * READS. `grades` only, paged by id or the ids named with --student, and only
 * the fields gradesByAssignment and teacherGradeOverridesByAssignment (a field
 * mask). No other collection is read.
 * WRITES. One local file, release-reports/step-key-credit-changes-<time>.json
 * (gitignored). Standard output is counts only.
 * EXIT. 0: no recorded credit changes. 3: some would change — the owner decides
 * before release 1 (the runbook's step 0). 1: an error. 2: a usage error.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin and the grade runtime live in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const runtime = functionsRequire('./lib/classroomGradeRuntime.js');

export const REPORT_VERSION = 1;
export const GRADE_FIELDS = Object.freeze(['gradesByAssignment', 'teacherGradeOverridesByAssignment']);
export const REPORT_DIR = 'release-reports';
export const PAGE_SIZE = 100;
export const EXIT_CHANGES_FOUND = 3;

// The key the live servers use (main before release 1, both server copies).
export const liveStateKey = (value) => String(value || '').replace(/\s+/g, '').replace(/[−–—]/g, '-');
// Release 1's key, as functions/shared/attemptPolicy.mjs compactStepStateKey.
export const releaseStateKey = (value) => String(value || '')
  .replace(/[\s~]+/g, '')
  .replace(/[−–—]/g, '-')
  .replace(/(^|[=+\-(,{])1\\left\(/g, '$1\\left(');

const clampPercent = (value) => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

// storedAlgebraStepPartialCredit with the key handed in, line for line.
export const derivedStepCredit = (record, stateKey) => {
  const steps = Array.isArray(record?.stepGrades) ? record.stepGrades : [];
  const variantIndex = Number(record?.variantIndex || 0);
  const currentSteps = steps.filter((step) => Number(step?.variantIndex) === variantIndex);
  if (!currentSteps.length) return 0;
  const expectedTotal = currentSteps.reduce(
    (maximum, step) => Math.max(maximum, Math.max(0, Number(step?.expectedTotalPoints) || 0)),
    0,
  );
  const visitedStates = new Set();
  const firstBefore = stateKey(currentSteps[0]?.equationBefore);
  if (firstBefore) visitedStates.add(firstBefore);
  let earned = 0;
  let fallbackPossible = 0;
  currentSteps.forEach((step) => {
    const afterKey = stateKey(step?.equationAfter);
    const acceptedProductive = step?.accepted !== false && step?.productive !== false;
    const newState = !afterKey || !visitedStates.has(afterKey);
    if (acceptedProductive && newState) {
      earned += Math.max(0, Number(step?.earned) || 0);
      fallbackPossible += Math.max(0, Number(step?.possible) || 0);
    }
    if (afterKey) visitedStates.add(afterKey);
  });
  const possible = expectedTotal > 0 ? expectedTotal : fallbackPossible;
  return possible > 0 ? Math.min(90, clampPercent(Math.round((earned / possible) * 100))) : 0;
};

// getQuestionCredit as a percent, with the key handed in (no teacher override).
export const questionCredit = (record, stateKey) => {
  const normalized = runtime.normalizeStoredQuestionRecord(record);
  if (normalized.status === 'correct') return 100;
  const stored = clampPercent(normalized.bestPartialCredit ?? normalized.partialCredit ?? 0);
  return Math.max(stored, derivedStepCredit(normalized, stateKey));
};

const hasSteps = (record) => Boolean(record) && typeof record === 'object' && Array.isArray(record.stepGrades) && record.stepGrades.length > 0;
const stepEquations = (record) => record.stepGrades.flatMap((step) => [step?.equationBefore, step?.equationAfter]).filter(Boolean).map(String);

// W5-5 decision 7's definition: one equationAfter holds `1\left(` and another
// equals it once that 1 is dropped.
const PUSH_Q_ONE = /(^|[=+\-(,{])1\\left\(/;
export const mixesPushQRenderings = (record) => {
  const afters = record.stepGrades.map((step) => String(step?.equationAfter || '')).filter(Boolean);
  const withoutTheOne = new Set(afters.filter((value) => PUSH_Q_ONE.test(value))
    .map((value) => value.replace(/(^|[=+\-(,{])1\\left\(/g, '$1\\left(')));
  return afters.some((value) => !PUSH_Q_ONE.test(value) && withoutTheOne.has(value));
};

// teacherOverrideAppliesToRecord (functions/index.js), rule for rule: a
// question's override decides its grade only for the attempt it was issued
// against. An older one, or one without a finite score, decides nothing.
export const teacherOverrideApplies = (record, override) => {
  if (!record || override?.active !== true || !Number.isFinite(Number(override.score))) return false;
  if (override.persistent === true && override.source === 'teacher-section-zero') return true;
  const recordAttempts = Number(record.totalAttempts ?? record.attemptCount ?? 0);
  const overrideAttempts = Number(override.totalAttempts);
  if (!Number.isFinite(overrideAttempts) || overrideAttempts !== recordAttempts) return false;
  const recordVariant = Number(record.variantIndex ?? 0);
  const overrideVariant = Number(override.variantIndex);
  if (!Number.isFinite(overrideVariant) || overrideVariant !== recordVariant) return false;
  const overrideSubmissionId = String(override.submissionId || '');
  if (overrideSubmissionId) return overrideSubmissionId === String(record.lastSubmissionId || '');
  const overrideLastAttemptAt = String(override.lastAttemptAt || '');
  return Boolean(overrideLastAttemptAt)
    && overrideLastAttemptAt === String(record.lastAttemptAt || record.academicOccurredAt || '');
};

// activeAssignmentGradeOverride (functions/index.js): a teacher's grade for the
// whole assignment, which replaces the grade its questions add up to.
export const ASSIGNMENT_GRADE_OVERRIDE_KEY = '__assignment';
export const assignmentOverrideActive = (overrides) => {
  const override = overrides?.[ASSIGNMENT_GRADE_OVERRIDE_KEY] || null;
  return override?.active === true && Number.isFinite(Number(override.score));
};

/**
 * One grades document's records whose credit release 1 changes, plus counts.
 * A record whose question override applies (`overridden`), or whose assignment
 * has an active grade override (`assignmentOverridden`), keeps the teacher's
 * grade; it is still listed, because its derived value changes. A section's
 * integrity zero is not modelled: such a record is listed as changing, which
 * can only overstate the impact.
 */
export const gradeDocumentChanges = (studentId, data) => {
  const counts = { assignmentTrackers: 0, records: 0, recordsWithSteps: 0, recordsWithTie: 0, recordsMixingPushQ: 0, parityMismatches: 0 };
  const changes = [];
  const byAssignment = data?.gradesByAssignment && typeof data.gradesByAssignment === 'object' ? data.gradesByAssignment : {};
  const overridesByAssignment = data?.teacherGradeOverridesByAssignment || {};
  Object.entries(byAssignment).forEach(([assignmentId, tracker]) => {
    if (!tracker || typeof tracker !== 'object') return;
    counts.assignmentTrackers += 1;
    Object.entries(tracker).forEach(([questionIndex, record]) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return;
      counts.records += 1;
      if (!hasSteps(record)) return;
      counts.recordsWithSteps += 1;
      if (stepEquations(record).some((equation) => equation.includes('~'))) counts.recordsWithTie += 1;
      if (mixesPushQRenderings(record)) counts.recordsMixingPushQ += 1;
      const normalized = runtime.normalizeStoredQuestionRecord(record);
      const live = questionCredit(record, liveStateKey);
      const release = questionCredit(record, releaseStateKey);
      // The release's own code must agree with this report's copy of it.
      if (derivedStepCredit(normalized, releaseStateKey) !== runtime.storedAlgebraStepPartialCredit(normalized)
        || Math.abs(release / 100 - runtime.getQuestionCredit(record)) > 1e-9) counts.parityMismatches += 1;
      if (live === release) return;
      const assignmentOverrides = overridesByAssignment?.[assignmentId] || {};
      changes.push({
        studentId,
        assignmentId,
        questionIndex,
        status: normalized.status,
        storedBestPartialCredit: clampPercent(normalized.bestPartialCredit),
        liveDerived: derivedStepCredit(normalized, liveStateKey),
        releaseDerived: derivedStepCredit(normalized, releaseStateKey),
        liveCredit: live,
        releaseCredit: release,
        direction: release < live ? 'down' : 'up',
        overridden: teacherOverrideApplies(record, assignmentOverrides[questionIndex] || null),
        assignmentOverridden: assignmentOverrideActive(assignmentOverrides),
      });
    });
  });
  return { counts, changes };
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
 * collection/doc/orderBy/select/limit/startAfter/get and getAll (with a fieldMask) are used.
 */
export const runStepKeyCreditReport = async ({
  db, studentIds = [], pageSize = PAGE_SIZE, now = () => Date.now(), documentIdField = '__name__',
} = {}) => {
  const startedAt = new Date(now()).toISOString();
  const totals = { gradeDocuments: 0, assignmentTrackers: 0, records: 0, recordsWithSteps: 0, recordsWithTie: 0, recordsMixingPushQ: 0, parityMismatches: 0 };
  const changes = [];
  const missing = [];
  const consider = (id, data) => {
    totals.gradeDocuments += 1;
    const result = gradeDocumentChanges(id, data || {});
    Object.entries(result.counts).forEach(([key, value]) => { totals[key] += value; });
    changes.push(...result.changes);
  };
  if (studentIds.length) {
    const snapshots = await db.getAll(...studentIds.map((id) => db.collection('grades').doc(id)), { fieldMask: [...GRADE_FIELDS] });
    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists) consider(snapshot.id, snapshot.data());
      else missing.push(studentIds[index]);
    });
  } else {
    const ordered = db.collection('grades').orderBy(documentIdField).select(...GRADE_FIELDS);
    for await (const doc of pagedDocuments(ordered, pageSize)) consider(doc.id, doc.data());
  }
  const summary = {
    creditChanges: changes.length,
    down: changes.filter((change) => change.direction === 'down').length,
    up: changes.filter((change) => change.direction === 'up').length,
    underTeacherOverride: changes.filter((change) => change.overridden || change.assignmentOverridden).length,
    students: new Set(changes.map((change) => change.studentId)).size,
    assignments: new Set(changes.map((change) => change.assignmentId)).size,
  };
  return {
    tool: 'report-step-key-credit-changes',
    version: REPORT_VERSION,
    readOnly: true,
    startedAt,
    studentFilter: studentIds.length ? [...studentIds] : null,
    missingStudents: missing,
    notes: [
      'Credits are percents: getQuestionCredit with the live key (liveCredit) and with release 1\'s key (releaseCredit), on the record as functions/lib/classroomGradeRuntime.js normalizes it.',
      'The same records feed assignment grades, Classroom sync, Test Cycle Review and Classroom section grades.',
      'overridden: a teacher override that applies to this attempt (teacherOverrideAppliesToRecord) decides the question\'s grade; assignmentOverridden: an active assignment-wide grade override decides the assignment\'s grade. Either way the grade does not move, though the derived value does. An override for an earlier attempt decides nothing, so its record counts as changing.',
      'parityMismatches must be 0: it counts records where this report\'s copy of the derivation disagrees with the release\'s own code.',
    ],
    totals,
    summary,
    changes,
  };
};

// --- CLI ----------------------------------------------------------------------

const USAGE = `Usage: node scripts/report-step-key-credit-changes.mjs --project <id> [options]

Read-only. Lists every recorded step-item credit that release 1's step-state key
would change (W5-5 decision 7). Writes one JSON file to ${REPORT_DIR}/ (gitignored).
Exit 0: nothing changes. Exit ${EXIT_CHANGES_FOUND}: some credits change — the owner decides.

  --project <id>        Firebase project (Application Default Credentials; a viewer role is enough)
  --student <id>        only this student's grades document (repeatable; default every student)
  --page-size <n>       documents per read (default ${PAGE_SIZE})`;

export const parseReportArgs = (argv) => {
  const options = { students: [] };
  const known = ['--project', '--student', '--page-size'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!known.includes(arg)) throw new Error(`unknown argument ${arg} (this report has no write mode and no output option)`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    if (arg === '--student') options.students.push(value);
    else options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required');
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('--page-size must be 1–500');
  return { help: false, project: options.project, studentIds: [...new Set(options.students)], pageSize };
};

export const reportFilePath = (startedAt) => path.join(repoRoot, REPORT_DIR, `step-key-credit-changes-${startedAt.replace(/[:.]/g, '-')}.json`);

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`report-step-key-credit-changes: ${error.message}\n\n${USAGE}`);
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
      console.error('report-step-key-credit-changes: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'report-step-key-credit-changes');
  console.log('Step-key credit changes (pass 3 release 1, W5-5 decision 7) — READ ONLY (nothing is written to Firestore)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  let report;
  try {
    report = await runStepKeyCreditReport({
      db: app.firestore(),
      studentIds: options.studentIds,
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
  const { totals, summary } = report;
  const add = (label, value) => console.log(`  ${label.padEnd(48)} ${value}`);
  console.log('');
  add('grades documents read', totals.gradeDocuments);
  if (report.missingStudents.length) add('named students not found', report.missingStudents.length);
  add('question records', totals.records);
  add('records with Step Algebra steps', totals.recordsWithSteps);
  add('  with a TeX tie (2~ x)', totals.recordsWithTie);
  add('  mixing push Q\'s two renderings', totals.recordsMixingPushQ);
  add('credits that change', `${summary.creditChanges} (down ${summary.down}, up ${summary.up}; ${summary.students} students, ${summary.assignments} assignments; ${summary.underTeacherOverride} under a teacher override)`);
  console.log(`\nDetail: ${path.relative(process.cwd(), reportPath) || reportPath}`);
  if (totals.parityMismatches > 0) {
    console.error(`\nreport-step-key-credit-changes: ${totals.parityMismatches} record(s) where this report disagrees with the release's own code. Do not rely on this report; tell the integrator.`);
    process.exitCode = 1;
    return;
  }
  if (summary.creditChanges > 0) {
    console.log('\nSTOP: release 1 would change the credits listed in the detail file. The owner decides before release 1 (docs/handoffs/STUDENT_PASS3_RELEASE_RUNBOOK.md, step 0).');
    process.exitCode = EXIT_CHANGES_FOUND;
    return;
  }
  console.log('\nOK: release 1 changes no recorded credit.');
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`report-step-key-credit-changes: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
