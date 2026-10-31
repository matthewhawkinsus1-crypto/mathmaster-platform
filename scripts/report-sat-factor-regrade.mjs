#!/usr/bin/env node
/*
 * ANSWERS MARKED WRONG ON THE TWO DEFECTIVE DIGITAL SAT FACTOR DRAWS (GR23).
 * A READ-ONLY REPORT. It has no write mode: no --execute, no re-grade, and no
 * Firestore write anywhere in this file (tests/platform/satFactorRegrade.test.mjs
 * runs it against a database that throws on any write, and checks the source).
 *
 *   node scripts/report-sat-factor-regrade.mjs --project <id> [--since <date>] [--until <date>] [--page-size <n>]
 *
 * Until 08964f1c, two Digital SAT templates could offer a true factor as a
 * "wrong" option (scripts/lib/satFactorRegradePlan.mjs names them and decides
 * each answer by the factor theorem, from the prompt the student saw and the
 * option they chose). The owner chose to re-grade those answers as right
 * (D22). This report lists them, on the two surfaces where a stored record
 * says which option was chosen:
 *
 *   - MY MATH PATH: an item's FINAL attempt leaves a recap entry on
 *     pathSubmissions/{id}.recapJson (since PR #459), with the prompt as shown
 *     and the chosen option's label. Each one recorded wrong is confirmed
 *     against its evidence event (the template it was drawn from). Answers
 *     from before the recap, and attempts that were not final, stored no
 *     option and cannot be decided: they are not listed. Nothing re-grades a
 *     Path answer yet (see the notes).
 *   - CLASSROOM: an assignment the audited bank filled with either template
 *     (ccmrAssignmentBank) keeps the template as an assignment-local Question
 *     Family. Each attempt is judged on the instance its delivery pin rebuilds
 *     and the option its evidence recorded. The rows it lists as
 *     would-be-correct are what scripts/apply-upward-regrade.mjs --from <this
 *     report> raises (the D8 upward-only step). A copy placed before the fix
 *     can still serve the defective draws: those questions are listed too.
 *
 * --since / --until bound the Path submissions read (createdAt); without them
 * every submission is read. A date alone is midnight UTC.
 *
 * PRIVACY. Standard output is COUNTS ONLY. The JSON lists students by id,
 * never by name (no name is read), and goes to the gitignored release-reports/.
 *
 * READS. pathSubmissions (paged, projected to studentId, sessionId, createdAt
 * and recapJson); for each recap of these two prompts recorded wrong, its
 * evidence event (projected); assignments (whole documents, paged: the
 * questions are needed); every grades/{studentId} document, paged and
 * projected to classId and, for the assignments that hold either template
 * only, gradesByAssignment.<id> and teacherGradeOverridesByAssignment.<id>;
 * for each attempted question there, its responseInspectionEvidence document
 * (projected).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePathRecapEntry } from '../functions/shared/pathSessionRecap.mjs';
import { responseInspectionEvidenceDocumentId } from '../functions/shared/responseInspector.mjs';
import { questionWasAttempted, trustedEvidence } from './lib/classroomRegradePlan.mjs';
import {
  FACTOR_CLASS,
  FIXED_BY,
  SAT_FACTOR_TEMPLATES,
  classifyPathRecapEntry,
  isSatFactorTemplateId,
  judgeClassroomFactorAttempt,
  polynomialOfPrompt,
  satFactorTemplateOfQuestion,
  servesDefectiveDraws,
} from './lib/satFactorRegradePlan.mjs';
import { teacherOverrideApplies } from './lib/upwardRegrade.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin, mathPath and the runtime projection live in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const mathPath = functionsRequire('./lib/mathPath.js');
const { runtimeQuestionsFromAssignment } = functionsRequire('./lib/assignmentRuntime.js');

export const TOOL = 'report-sat-factor-regrade';
export const REPORT_VERSION = 1;
export const REPORT_DIR = 'release-reports';
export const PAGE_SIZE = 200;
export const ASSIGNMENTS_PER_PASS = 40;
export const SUBMISSION_FIELDS = Object.freeze(['studentId', 'sessionId', 'createdAt', 'recapJson']);
export const PATH_EVIDENCE_FIELDS = Object.freeze(['questionSnapshot.questionId', 'performance.isCorrect', 'performance.attemptNumber']);
export const CLASSROOM_EVIDENCE_FIELDS = Object.freeze([
  'assignmentId', 'questionIndex', 'submissionId', 'variantIndex', 'totalAttempts',
  'evidence.submittedResponse', 'evidence.automaticResult', 'evidence.automaticScore', 'evidence.deliveredInstanceAuthority',
]);
// Only a recap that can be one of the two prompts is parsed.
const RECAP_HINT = /has zeros|linear factor of/;

export const REPORT_NOTES = Object.freeze([
  'Decided by the factor theorem: x − k is right exactly when the polynomial the prompt shows is 0 at k. No answer key is consulted, so an option that is not a factor is never listed.',
  'My Math Path: only an item\'s final attempt left a recap (since PR #459). An earlier answer, or an attempt that was not final, stored no option and is not listed. Nothing raises a Path answer yet: that needs a rescore of studentMasteryProfiles, the CCMR progress counters (ccmrProgress directItemsCorrect) and the session\'s accuracy, which no script does (GR23, not built).',
  'Classroom: the would-be-correct rows are what scripts/apply-upward-regrade.mjs raises with --from <this report> (dry run first). It re-reads each attempt and leaves any a teacher has decided.',
  `Classroom questions that serve the defective draws are copies placed before ${FIXED_BY}: they still can. Re-place them from the bank (or remove them); this report changes nothing.`,
  'Secure simulations (examSessions) are not read.',
]);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => String(value ?? '').trim();
const chunks = (values, size) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

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

const emptyClassCounts = () => Object.fromEntries(Object.values(FACTOR_CLASS).map((value) => [value, 0]));
const polynomialSummary = (prompt) => {
  const polynomial = polynomialOfPrompt(prompt);
  if (!polynomial) return null;
  return polynomial.shape === 'cubic'
    ? { shape: 'cubic', zeros: polynomial.zeros }
    : { shape: 'quartic', square: polynomial.square, b: polynomial.b, c: polynomial.c };
};

// --- My Math Path -------------------------------------------------------------

const pathSurface = async ({ db, since, until, pageSize, documentIdField }) => {
  const counts = { submissionsRead: 0, recapsOfTheseShapes: 0, byClass: emptyClassCounts(), otherTemplate: 0, evidenceNotFound: 0 };
  const pending = [];
  const query = db.collection('pathSubmissions').orderBy(documentIdField).select(...SUBMISSION_FIELDS);
  for await (const doc of pagedDocuments(query, pageSize)) {
    counts.submissionsRead += 1;
    const data = doc.data() || {};
    const createdAt = Number(data.createdAt);
    if ((since !== null && !(createdAt >= since)) || (until !== null && !(createdAt < until))) continue;
    if (typeof data.recapJson !== 'string' || !RECAP_HINT.test(data.recapJson)) continue;
    const entry = parsePathRecapEntry(data.recapJson);
    if (!entry || !polynomialOfPrompt(entry.question?.prompt)) continue;
    counts.recapsOfTheseShapes += 1;
    const decision = classifyPathRecapEntry(entry);
    if (decision.classification === FACTOR_CLASS.ALREADY_CORRECT) {
      counts.byClass[decision.classification] += 1;
      continue;
    }
    pending.push({ submissionId: doc.id, studentId: text(data.studentId), sessionId: text(data.sessionId || entry.sessionId), createdAt, entry, decision });
  }
  const rows = [];
  for (const group of chunks(pending, 100)) {
    const keyed = group.map((item) => {
      const attemptNumber = Number(item.entry.grading?.attemptNumber) || null;
      const evidenceKey = attemptNumber && item.studentId && item.sessionId
        ? mathPath.opaqueId('ev', item.sessionId, item.entry.questionInstanceId, attemptNumber)
        : null;
      return { ...item, attemptNumber, evidenceKey };
    });
    const withKeys = keyed.filter((item) => item.evidenceKey);
    const refs = withKeys.map((item) => db.collection('grades').doc(item.studentId).collection('evidenceEvents').doc(item.evidenceKey));
    // eslint-disable-next-line no-await-in-loop
    const snapshots = refs.length ? await db.getAll(...refs, { fieldMask: [...PATH_EVIDENCE_FIELDS] }) : [];
    const evidenceByKey = new Map(withKeys.map((item, index) => [item.evidenceKey, snapshots[index]]));
    keyed.forEach((item) => {
      const snapshot = item.evidenceKey ? evidenceByKey.get(item.evidenceKey) : null;
      const evidence = snapshot?.exists ? snapshot.data() || {} : null;
      const questionId = text(evidence?.questionSnapshot?.questionId);
      if (evidence && !isSatFactorTemplateId(questionId)) {
        counts.otherTemplate += 1;
        return;
      }
      if (!evidence) counts.evidenceNotFound += 1;
      counts.byClass[item.decision.classification] += 1;
      rows.push({
        surface: 'path',
        classification: item.decision.classification,
        reason: item.decision.reason,
        studentId: item.studentId,
        sessionId: item.sessionId,
        questionInstanceId: item.entry.questionInstanceId,
        attemptNumber: item.attemptNumber,
        evidenceKey: item.evidenceKey,
        template: questionId || null,
        templateConfirmed: Boolean(evidence),
        submittedAt: Number.isFinite(item.createdAt) ? new Date(item.createdAt).toISOString() : null,
        polynomial: polynomialSummary(item.entry.question?.prompt),
        chosen: item.decision.chosen,
      });
    });
  }
  return { counts, rows };
};

// --- Classroom ------------------------------------------------------------------

const classroomSurface = async ({ db, pageSize, fieldPath }) => {
  const counts = { assignmentsRead: 0, assignmentsSkippedTestCycle: 0, questions: 0, questionsServingDefectiveDraws: 0, studentsRead: 0, attempts: 0, byClass: emptyClassCounts(), teacherDecided: 0, undeterminableByReason: {} };
  const inScope = [];
  const questions = [];
  for await (const doc of pagedDocuments(db.collection('assignments'), pageSize)) {
    counts.assignmentsRead += 1;
    const assignment = { id: doc.id, ...doc.data() };
    if (text(assignment?.assessmentPolicy?.mode) === 'testCycle') {
      counts.assignmentsSkippedTestCycle += 1;
      continue;
    }
    const runtime = runtimeQuestionsFromAssignment(assignment);
    const indices = runtime.map((question, index) => (satFactorTemplateOfQuestion(question) ? index : -1)).filter((index) => index >= 0);
    if (!indices.length) continue;
    indices.forEach((questionIndex) => {
      const serving = servesDefectiveDraws(runtime[questionIndex]);
      counts.questions += 1;
      if (serving) counts.questionsServingDefectiveDraws += 1;
      questions.push({ assignmentId: assignment.id, questionIndex, template: satFactorTemplateOfQuestion(runtime[questionIndex]), servesDefectiveDraws: serving });
    });
    inScope.push({ assignment, runtime, indices });
  }

  const attempts = [];
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
      group.forEach(({ assignment, runtime, indices }) => {
        const tracker = grade.gradesByAssignment?.[assignment.id];
        if (!isObject(tracker)) return;
        indices.forEach((questionIndex) => {
          const record = tracker[String(questionIndex)];
          if (questionWasAttempted(record)) work.push({ assignment, question: runtime[questionIndex], questionIndex, record });
        });
      });
      if (!work.length) continue;
      const refs = work.map(({ assignment, questionIndex }) => db.collection('grades').doc(studentId)
        .collection('responseInspectionEvidence')
        .doc(responseInspectionEvidenceDocumentId({ assignmentId: assignment.id, questionIndex })));
      // eslint-disable-next-line no-await-in-loop
      const snapshots = await db.getAll(...refs, { fieldMask: [...CLASSROOM_EVIDENCE_FIELDS] });
      work.forEach(({ assignment, question, questionIndex, record }, index) => {
        counts.attempts += 1;
        const override = grade.teacherGradeOverridesByAssignment?.[assignment.id]?.[String(questionIndex)] ?? null;
        const teacherDecided = teacherOverrideApplies(record, override);
        if (teacherDecided) counts.teacherDecided += 1;
        let classification;
        let reason = null;
        let chosen = null;
        if (record.status === 'correct') {
          classification = FACTOR_CLASS.ALREADY_CORRECT;
        } else {
          const evidence = trustedEvidence(snapshots[index]?.exists ? snapshots[index].data() : null, { assignmentId: assignment.id, questionIndex, record });
          const judged = evidence
            ? judgeClassroomFactorAttempt({ question, record, gradingEvidence: evidence, assignment, questionIndex, studentId, classId })
            : { available: false, reason: 'no-trusted-evidence' };
          if (!judged.available) {
            classification = FACTOR_CLASS.UNDETERMINABLE;
            reason = judged.reason;
            counts.undeterminableByReason[reason] = (counts.undeterminableByReason[reason] || 0) + 1;
          } else {
            classification = judged.currentResult.isCorrect ? FACTOR_CLASS.WOULD_BE_CORRECT : FACTOR_CLASS.STILL_WRONG;
            chosen = judged.currentResult.chosen ?? null;
          }
        }
        counts.byClass[classification] += 1;
        if (classification === FACTOR_CLASS.ALREADY_CORRECT) return;
        attempts.push({ surface: 'classroom', classification, reason, studentId, classId, assignmentId: assignment.id, questionIndex, chosen, teacherDecided });
      });
    }
  }
  const order = (a, b) => (a.assignmentId.localeCompare(b.assignmentId) || a.questionIndex - b.questionIndex || String(a.studentId ?? '').localeCompare(String(b.studentId ?? '')));
  return { counts, questions: questions.sort(order), attempts: attempts.sort(order) };
};

/**
 * Reads and returns the report object. `db` is a Firestore (Admin SDK); only
 * collection/doc/orderBy/select/limit/startAfter/get and getAll (with a
 * fieldMask) are used. `fieldPath(...segments)` builds a field path for a map
 * key that may hold any character (the Admin SDK's FieldPath).
 */
export const runSatFactorRegradeReport = async ({
  db,
  since = null,
  until = null,
  pageSize = PAGE_SIZE,
  documentIdField = '__name__',
  fieldPath = (...segments) => segments.join('.'),
  now = () => Date.now(),
} = {}) => {
  const startedAt = new Date(now()).toISOString();
  const myMathPath = await pathSurface({ db, since, until, pageSize, documentIdField });
  const classroom = await classroomSurface({ db, pageSize, fieldPath });
  return {
    tool: TOOL,
    version: REPORT_VERSION,
    readOnly: true,
    startedAt,
    window: since === null && until === null ? null : {
      since: since === null ? null : new Date(since).toISOString(),
      until: until === null ? null : new Date(until).toISOString(),
    },
    templates: Object.fromEntries(Object.entries(SAT_FACTOR_TEMPLATES).map(([id, template]) => [id, template.defect])),
    fixedBy: FIXED_BY,
    notes: REPORT_NOTES,
    counts: { path: myMathPath.counts, classroom: classroom.counts },
    path: { rows: myMathPath.rows },
    classroom: { questions: classroom.questions, attempts: classroom.attempts },
  };
};

// --- CLI ----------------------------------------------------------------------

const USAGE = `Usage: node scripts/${TOOL}.mjs --project <id> [options]

Read-only. Lists the answers marked wrong for choosing a true factor on the two
defective Digital SAT factor draws (fixed by ${FIXED_BY}): My Math Path final
attempts with a recap, and classroom attempts. Writes one JSON file to
${REPORT_DIR}/ (gitignored); standard output is counts only.

  --project <id>     Firebase project (Application Default Credentials; a viewer role is enough)
  --since <date>     only Path submissions at or after this time (createdAt)
  --until <date>     only Path submissions before this time
  --page-size <n>    documents per read (default ${PAGE_SIZE})`;

export const parseDate = (value, flag) => {
  const raw = String(value || '').trim();
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T00:00:00Z`) : Date.parse(raw);
  if (!raw || !Number.isFinite(ms)) throw new Error(`${flag} needs a date (2026-10-07 or 2026-10-07T21:15:00Z), got "${raw}"`);
  return ms;
};

export const parseReportArgs = (argv) => {
  const options = {};
  const known = ['--project', '--since', '--until', '--page-size'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!known.includes(arg)) throw new Error(`unknown argument ${arg} (this report has no write mode and no output option)`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required');
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('--page-size must be 1–500');
  const since = options.since ? parseDate(options.since, '--since') : null;
  const until = options.until ? parseDate(options.until, '--until') : null;
  if (since !== null && until !== null && !(since < until)) throw new Error('--since must be before --until');
  return { help: false, project: options.project, since, until, pageSize };
};

export const reportFilePath = (startedAt) => path.join(repoRoot, REPORT_DIR, `${TOOL}-${startedAt.replace(/[:.]/g, '-')}.json`);

const printCounts = (report) => {
  const lines = [];
  const add = (label, value) => lines.push(`  ${label.padEnd(48)} ${value}`);
  const classes = (byClass) => Object.entries(byClass).map(([name, count]) => `${name} ${count}`).join(' · ');
  const { path: pathCounts, classroom } = report.counts;
  add('My Math Path submissions read', pathCounts.submissionsRead);
  add('  recaps of these two prompts', pathCounts.recapsOfTheseShapes);
  add('  by class', classes(pathCounts.byClass));
  add('  drawn from another template (left out)', pathCounts.otherTemplate);
  add('  evidence event not found (template unconfirmed)', pathCounts.evidenceNotFound);
  add('assignments read', classroom.assignmentsRead);
  add('  questions from these templates', `${classroom.questions} (${classroom.questionsServingDefectiveDraws} still serve the defective draws)`);
  add('  attempts', classroom.attempts);
  add('  by class', classes(classroom.byClass));
  add('  a teacher has decided', classroom.teacherDecided);
  Object.entries(classroom.undeterminableByReason).forEach(([reason, count]) => add(`    undeterminable: ${reason}`, count));
  console.log(lines.join('\n'));
};

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
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
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, TOOL);
  console.log('Defective Digital SAT factor draws (GR23) — READ ONLY (nothing is written to Firestore)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  let report;
  try {
    report = await runSatFactorRegradeReport({
      db: app.firestore(),
      since: options.since,
      until: options.until,
      pageSize: options.pageSize,
      documentIdField: FieldPath.documentId(),
      fieldPath: (...segments) => new FieldPath(...segments),
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
  console.log(`\nDetail (student ids only): ${path.relative(process.cwd(), reportPath) || reportPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`${TOOL}: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
