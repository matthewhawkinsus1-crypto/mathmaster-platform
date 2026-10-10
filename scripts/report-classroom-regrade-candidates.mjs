#!/usr/bin/env node
/*
 * CLASSROOM ATTEMPTS WHOSE VERDICT CHANGES UNDER JOB K'S GRADER FIXES (2a–2f).
 * A READ-ONLY REPORT. It has no write mode: no --execute, no re-grade, and no
 * Firestore write anywhere in this file (tests/platform/
 * kGrading_classroomRegradePlan.test.mjs runs it against a database that
 * throws on any write, and checks the source; tests/integration/
 * classroomRegradeReport.test.mjs does the same on the emulator).
 *
 *   node scripts/report-classroom-regrade-candidates.mjs --project <id> [--tools <list>] [--assignment <id>]... [--v5-sources <path>]... [--out <dir>]
 *
 * Every stored attempt on an assignment question of the affected tools is
 * replayed with the platform's own replay (responseInspector replayResponse,
 * the registry "Apply Corrected Grade" uses) and classified by
 * scripts/lib/classroomRegradePlan.mjs, whose header explains each outcome:
 * re-grade candidates, now-lower (listed apart; the owner decides),
 * needs-teacher (cannot be re-graded), and changes outside K. The owner
 * decides what to do with each; this report changes nothing.
 *
 * V5 SOURCES (2a, 2b). The stored question lost the coefficients or the
 * exponential, and assignments keep no authoring source. --v5-sources names
 * V5 JSON files or folders to rebuild them from (default: the repository's
 * teacher-import-jsons/); a question with no matching source is needs-teacher.
 *
 * PRIVACY. Standard output is COUNTS ONLY. The JSON detail lists students by
 * id, never by name (no name is read), with their submitted work, and goes to
 * the gitignored classroom-regrade-reports/ unless --out says otherwise.
 *
 * READS. assignments (whole documents, paged; the questions are needed); every
 * grades/{studentId} document, paged and projected to classId and, for the
 * assignments in scope only, gradesByAssignment.<id> and
 * teacherGradeOverridesByAssignment.<id>; for each attempted in-scope
 * question, its responseInspectionEvidence document (projected).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_TOOL_SCOPE,
  LISTED_CLASSES,
  REGRADE_CLASS,
  indexV5Sources,
  parseToolScope,
  planClassroomAttempt,
  questionMayBeInScope,
  questionWasAttempted,
} from './lib/classroomRegradePlan.mjs';
import { responseInspectionEvidenceDocumentId } from '../functions/shared/responseInspector.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin and the runtime projection live in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const { runtimeQuestionsFromAssignment } = functionsRequire('./lib/assignmentRuntime.js');

export const REPORT_VERSION = 1;
export const DEFAULT_OUT_DIR = 'classroom-regrade-reports';
export const DEFAULT_V5_SOURCES = Object.freeze(['teacher-import-jsons']);
export const PAGE_SIZE = 100;
// Assignments projected per pass over grades/: each adds two field paths.
export const ASSIGNMENTS_PER_PASS = 40;
export const EVIDENCE_FIELDS = Object.freeze([
  'assignmentId', 'questionIndex', 'submissionId', 'variantIndex', 'totalAttempts',
  'evidence.submittedResponse', 'evidence.automaticResult', 'evidence.automaticScore',
  'evidence.deliveredInstanceAuthority', 'evidence.submittedAt', 'evidence.graderVersion', 'evidence.gradingAuthority',
]);

const USAGE = `Usage: node scripts/report-classroom-regrade-candidates.mjs --project <id> [options]

Read-only. Lists stored classroom attempts whose verdict changes under Job K's
grader fixes (2a–2f), for the owner to decide on re-grading.

  --project <id>        Firebase project (Application Default Credentials; a viewer role is enough)
  --tools <list>        tool or tool:mode, comma separated (default ${DEFAULT_TOOL_SCOPE.join(',')})
  --assignment <id>     only this assignment (repeatable; default every assignment)
  --v5-sources <path>   V5 JSON file or folder to rebuild 2a/2b questions from
                        (repeatable; default ${DEFAULT_V5_SOURCES.join(', ')}/)
  --out <dir>           where the JSON detail goes (default ${DEFAULT_OUT_DIR}/, gitignored)
  --page-size <n>       documents per read (default ${PAGE_SIZE})`;

const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const parseReportArgs = (argv) => {
  const options = { assignments: [], v5Sources: [] };
  const known = ['--project', '--tools', '--assignment', '--v5-sources', '--out', '--page-size'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!known.includes(arg)) throw new Error(`unknown argument ${arg} (this report has no write mode)`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    if (arg === '--assignment') options.assignments.push(value);
    else if (arg === '--v5-sources') options.v5Sources.push(value);
    else options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required');
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('--page-size must be 1–500');
  return {
    help: false,
    project: options.project,
    scope: parseToolScope(options.tools || DEFAULT_TOOL_SCOPE),
    assignmentIds: [...new Set(options.assignments)],
    v5Sources: options.v5Sources.length ? options.v5Sources : null,
    outDir: options.out || null,
    pageSize,
  };
};

/** Every *.json under the given files or folders, read and parsed. */
export const loadV5Sources = (paths, { base = repoRoot } = {}) => {
  const files = [];
  const visit = (target) => {
    if (!existsSync(target)) throw new Error(`--v5-sources: ${target} does not exist`);
    if (statSync(target).isDirectory()) {
      readdirSync(target).sort().forEach((name) => visit(path.join(target, name)));
    } else if (target.endsWith('.json')) files.push(target);
  };
  list(paths).forEach((entry) => visit(path.resolve(base, entry)));
  return files.map((file) => {
    const relative = path.relative(base, file).startsWith('..') ? file : path.relative(base, file);
    try {
      return { path: relative, payload: JSON.parse(readFileSync(file, 'utf8')) };
    } catch (error) {
      return { path: relative, payload: null, error: String(error?.message || error) };
    }
  });
};

// --- reads ------------------------------------------------------------------

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

const assignmentsInScope = async ({ db, assignmentIds, scope, pageSize, counts }) => {
  const found = [];
  const consider = (id, data) => {
    counts.assignmentsRead += 1;
    const assignment = { id, ...data };
    if (String(assignment?.assessmentPolicy?.mode || '') === 'testCycle') {
      // Secure Test Cycle work is never an ordinary attempt (ingestion and the
      // override callable both refuse it).
      counts.assignmentsSkippedTestCycle += 1;
      return;
    }
    const questions = runtimeQuestionsFromAssignment(assignment);
    const indices = questions.map((question, index) => (questionMayBeInScope(scope, question) ? index : -1)).filter((index) => index >= 0);
    if (indices.length) found.push({ assignment, questions, indices });
  };
  if (assignmentIds.length) {
    const snapshots = await db.getAll(...assignmentIds.map((id) => db.collection('assignments').doc(id)));
    snapshots.forEach((snapshot) => { if (snapshot.exists) consider(snapshot.id, snapshot.data()); });
  } else {
    for await (const doc of pagedDocuments(db.collection('assignments'), pageSize)) consider(doc.id, doc.data());
  }
  return found;
};

const chunks = (values, size) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

// --- the report ---------------------------------------------------------------

/**
 * Reads, plans and returns the report object. `db` is a Firestore (Admin
 * SDK); only collection/doc/select/limit/startAfter/get and getAll are used.
 * `fieldPath(...segments)` builds a field path for a map key that may hold
 * any character (the Admin SDK's FieldPath); a dotted string by default.
 */
export const runClassroomRegradeReport = async ({
  db,
  scope = DEFAULT_TOOL_SCOPE.flatMap((entry) => parseToolScope(entry)),
  assignmentIds = [],
  v5Sources = [],
  pageSize = PAGE_SIZE,
  fieldPath = (...segments) => segments.join('.'),
  now = () => Date.now(),
} = {}) => {
  const startedAt = new Date(now()).toISOString();
  const counts = {
    assignmentsRead: 0,
    assignmentsSkippedTestCycle: 0,
    assignmentsInScope: 0,
    studentsRead: 0,
    attemptsInScope: 0,
    byClass: Object.fromEntries(Object.values(REGRADE_CLASS).map((value) => [value, 0])),
    byDefect: {},
    notReplayableByReason: {},
    needsTeacherByReason: {},
    studentsListed: 0,
  };
  const v5Index = indexV5Sources(list(v5Sources).filter((source) => source.payload));
  const v5SourceErrors = [
    ...list(v5Sources).filter((source) => !source.payload).map((source) => ({ path: source.path, error: source.error || 'unreadable' })),
    ...v5Index.errors,
  ];

  const inScope = await assignmentsInScope({ db, assignmentIds, scope, pageSize, counts });
  counts.assignmentsInScope = inScope.length;
  const byAssignment = new Map(inScope.map((entry) => [entry.assignment.id, entry]));
  const listed = new Map();
  const planErrors = [];

  for (const [pass, group] of chunks(inScope, ASSIGNMENTS_PER_PASS).entries()) {
    const projection = ['classId', ...group.flatMap(({ assignment }) => [
      fieldPath('gradesByAssignment', assignment.id),
      fieldPath('teacherGradeOverridesByAssignment', assignment.id),
    ])];
    for await (const gradeDoc of pagedDocuments(db.collection('grades').select(...projection), pageSize)) {
      if (pass === 0) counts.studentsRead += 1;
      const studentId = gradeDoc.id;
      const grade = gradeDoc.data() || {};
      const classId = grade.classId || null;
      const work = [];
      for (const { assignment, questions, indices } of group) {
        const tracker = grade.gradesByAssignment?.[assignment.id];
        if (!isObject(tracker)) continue;
        for (const questionIndex of indices) {
          const record = tracker[String(questionIndex)];
          if (!questionWasAttempted(record)) continue;
          work.push({ assignment, question: questions[questionIndex], questionIndex, record });
        }
      }
      if (!work.length) continue;
      const evidenceRefs = work.map(({ assignment, questionIndex }) => db.collection('grades').doc(studentId)
        .collection('responseInspectionEvidence')
        .doc(responseInspectionEvidenceDocumentId({ assignmentId: assignment.id, questionIndex })));
      // eslint-disable-next-line no-await-in-loop
      const evidenceSnapshots = await db.getAll(...evidenceRefs, { fieldMask: [...EVIDENCE_FIELDS] });
      work.forEach(({ assignment, question, questionIndex, record }, index) => {
        const snapshot = evidenceSnapshots[index];
        const overrides = grade.teacherGradeOverridesByAssignment?.[assignment.id] || {};
        let plan;
        try {
          plan = planClassroomAttempt({
            assignment,
            question,
            questionIndex,
            studentId,
            classId,
            record,
            evidenceDocument: snapshot?.exists ? snapshot.data() : null,
            override: overrides[String(questionIndex)] ?? null,
            scope,
            v5Index,
          });
        } catch (error) {
          // One malformed stored record must not end the report: it is
          // counted, and named in the detail, as one that could not be read.
          plan = { classification: REGRADE_CLASS.NOT_REPLAYABLE, reason: 'stored-record-unreadable', error: String(error?.message || error).slice(0, 300) };
          planErrors.push({ studentId, assignmentId: assignment.id, questionIndex, error: plan.error });
        }
        if (!plan) return;
        counts.attemptsInScope += 1;
        counts.byClass[plan.classification] += 1;
        if (plan.classification === REGRADE_CLASS.NOT_REPLAYABLE) {
          counts.notReplayableByReason[plan.reason] = (counts.notReplayableByReason[plan.reason] || 0) + 1;
        }
        if (plan.classification === REGRADE_CLASS.NEEDS_TEACHER) {
          counts.needsTeacherByReason[plan.reason] = (counts.needsTeacherByReason[plan.reason] || 0) + 1;
        }
        if (!LISTED_CLASSES.includes(plan.classification)) return;
        for (const defect of plan.defects.length ? plan.defects : ['none']) {
          counts.byDefect[defect] ??= Object.fromEntries(LISTED_CLASSES.map((value) => [value, 0]));
          counts.byDefect[defect][plan.classification] += 1;
        }
        const key = `${assignment.id}\u0000${questionIndex}`;
        if (!listed.has(key)) listed.set(key, { assignmentId: assignment.id, questionIndex, attempts: [] });
        listed.get(key).attempts.push({ studentId, classId, ...plan });
      });
    }
  }

  // By assignment, then question, then student id.
  const assignments = [];
  for (const { assignmentId, questionIndex, attempts } of [...listed.values()].sort((a, b) => (
    a.assignmentId.localeCompare(b.assignmentId) || a.questionIndex - b.questionIndex))) {
    const { assignment, questions } = byAssignment.get(assignmentId);
    let entry = assignments.at(-1);
    if (entry?.assignmentId !== assignmentId) {
      entry = { assignmentId, title: assignment.title || null, questions: [] };
      assignments.push(entry);
    }
    const question = questions[questionIndex];
    entry.questions.push({
      questionIndex,
      questionId: question?.questionId || question?.id || null,
      sectionId: question?.sectionId || null,
      activityRole: question?.activityRole || null,
      prompt: String(question?.prompt || '').slice(0, 400) || null,
      attempts: attempts.sort((a, b) => a.studentId.localeCompare(b.studentId)),
    });
  }
  counts.studentsListed = new Set(assignments.flatMap((entry) => entry.questions.flatMap((question) => question.attempts.map((attempt) => attempt.studentId)))).size;

  return {
    tool: 'report-classroom-regrade-candidates',
    version: REPORT_VERSION,
    readOnly: true,
    startedAt,
    scope: scope.map((entry) => (entry.mode ? `${entry.tool}:${entry.mode}` : entry.tool)),
    assignmentFilter: assignmentIds.length ? [...assignmentIds] : null,
    v5Sources: { files: list(v5Sources).map((source) => source.path), errors: v5SourceErrors },
    counts,
    planErrors,
    notes: [
      'Only the attempt each record last counted can be replayed: earlier attempts kept no response, and a record keeps its best credit over all of them (record.automaticScore).',
      'old is the recorded attempt (responseInspectionEvidence automaticResult), new is the current shared grader on the same response; scores are per attempt, 0-100.',
      'An active teacher override is shown as override; the student sees that score, not the automatic one.',
      'needs-teacher attempts must not be re-graded automatically: see each reason in scripts/lib/classroomRegradePlan.mjs.',
    ],
    assignments,
  };
};

// --- CLI ----------------------------------------------------------------------

const printCounts = (report) => {
  const lines = [];
  const add = (label, value) => lines.push(`  ${label.padEnd(64)} ${value}`);
  const { counts } = report;
  add('assignments read', counts.assignmentsRead);
  add('  Test Cycle assignments skipped', counts.assignmentsSkippedTestCycle);
  add('  assignments with a question in scope', counts.assignmentsInScope);
  add('attempts in scope (the last attempt per record)', counts.attemptsInScope);
  Object.entries(counts.byClass).forEach(([name, value]) => add(`  ${name}`, value));
  Object.entries(counts.needsTeacherByReason).forEach(([name, value]) => add(`    needs-teacher: ${name}`, value));
  Object.entries(counts.notReplayableByReason).forEach(([name, value]) => add(`    not-replayable: ${name}`, value));
  Object.entries(counts.byDefect).forEach(([defect, byClass]) => add(`  ${defect}`, LISTED_CLASSES.map((name) => `${name} ${byClass[name]}`).join(', ')));
  add('students with a listed attempt', counts.studentsListed);
  console.log(lines.join('\n'));
  if (report.v5Sources.errors.length) console.log(`\n${report.v5Sources.errors.length} V5 source file(s) could not be read or compiled (listed in the detail).`);
};

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`report-classroom-regrade-candidates: ${error.message}\n\n${USAGE}`);
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
      console.error('report-classroom-regrade-candidates: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const v5Sources = loadV5Sources(options.v5Sources || DEFAULT_V5_SOURCES, { base: options.v5Sources ? process.cwd() : repoRoot });

  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'report-classroom-regrade-candidates');
  console.log('Classroom re-grade candidates (Job K 2a-2f) — READ ONLY (nothing is written)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  console.log(`  tools:   ${options.scope.map((entry) => (entry.mode ? `${entry.tool}:${entry.mode}` : entry.tool)).join(', ')}`);
  console.log(`  V5 sources: ${v5Sources.length} file(s)${options.assignmentIds.length ? `; ${options.assignmentIds.length} assignment(s) named` : ''}`);

  let report;
  try {
    report = await runClassroomRegradeReport({
      db: app.firestore(),
      scope: options.scope,
      assignmentIds: options.assignmentIds,
      v5Sources,
      pageSize: options.pageSize,
      fieldPath: (...segments) => new admin.firestore.FieldPath(...segments),
    });
  } finally {
    // Firestore keeps gRPC channels open; without this the process lingers.
    await app.delete().catch(() => {});
  }
  report.project = options.project;
  report.emulator = emulator;

  const outDir = path.resolve(options.outDir || path.join(repoRoot, DEFAULT_OUT_DIR));
  const reportPath = path.join(outDir, `classroom-regrade-${report.startedAt.replace(/[:.]/g, '-')}.json`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const insideRepo = !path.relative(repoRoot, reportPath).startsWith('..');
  const insideIgnored = !path.relative(path.join(repoRoot, DEFAULT_OUT_DIR), reportPath).startsWith('..');
  if (insideRepo && !insideIgnored) {
    console.error(`\nWARNING: ${reportPath} lists student ids and their work and is inside the repository but outside the gitignored ${DEFAULT_OUT_DIR}/. Move it before anything is committed.`);
  }

  console.log('');
  printCounts(report);
  console.log(`\nDetail (student ids, no names): ${path.relative(process.cwd(), reportPath) || reportPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`report-classroom-regrade-candidates: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
