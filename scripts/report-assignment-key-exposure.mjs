#!/usr/bin/env node
/*
 * WHAT EACH ASSIGNMENT EXPOSES TO A STUDENT'S DEVICE. A READ-ONLY REPORT.
 * D10 Phase 0, P0-4 (docs/handoffs/ANSWER_KEY_SERVER_SIDE_DESIGN.md §1.1,
 * §1.2, §3). It has no write mode: no --execute, no repair, and no Firestore
 * write anywhere in this file (tests/platform/assignmentKeyExposureReport.test.mjs
 * runs it against a database that throws on any write, checks the source,
 * and runs the CLI against a seeded Firestore emulator).
 *
 *   node scripts/report-assignment-key-exposure.mjs --project <id> [--assignment <id>]... [--page-size <n>]
 *
 * For every assignment, and for each of its sections (by activity role), it
 * counts the questions that carry, anywhere in the question or its variants:
 *   - a STORED KEY: a field whose value is the answer (answerFields[].answer,
 *     acceptedAnswers, the correct* fields, feature answers, grading specs,
 *     table answers, …; the declared list is STORED_KEY_FIELDS below);
 *   - a CHOICE LABEL that marks the answer: an answer field whose stored
 *     answer equals one of its own options (or a context value equal to one
 *     of its choices) — readable without doing any mathematics;
 *   - a WORKED SOLUTION (solutionReview, workedSolution, …);
 *   - HINTS (hints, supportHints);
 *   - other ANSWER-BEARING HELP (attemptFeedback, misconceptions, guided-notes
 *     steps);
 *   - a DEVICE-ONLY item: one the server cannot grade as stored
 *     (serverResponseGradingSupport after deliveredQuestionForGrading — the
 *     check ingestion itself makes), by reason. Question Family slots are
 *     counted apart: the device computes their key, but ingestion grades them
 *     from the delivery pin.
 * and the section's VARIANT MODE (variantPolicy.sectionModes[role], else
 * variantPolicy.mode, else 'personalized' — storedAssignmentV5.js).
 *
 * Stimulus-derived answers (a graph's functionSpec, a system's equations) are
 * NOT counted: no split can hide what the device must draw (design §1.1).
 *
 * READS. `assignments` only, paged by id or the ids named with --assignment,
 * and only the fields in ASSIGNMENT_FIELDS (a field mask): the per-student
 * fields an assignment can still carry are never read. No other collection
 * is read.
 * WRITES. One local file, release-reports/assignment-key-exposure-<time>.json
 * (gitignored). Standard output is counts only.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deliveredQuestionForGrading } from '../functions/shared/serverGrading/deliveredQuestion.mjs';
import { serverResponseGradingSupport } from '../functions/shared/serverGrading/gradingSupport.mjs';
import { isFamilyBackedQuestion } from '../functions/shared/questionFamilyInstance.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin lives in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

export const REPORT_VERSION = 1;
/*
 * The only fields read from an assignment (a field mask on every read). An
 * assignment can still carry per-student fields — studentOverrides,
 * excusedStudentIds, dol.attemptGrantsByStudentId, audienceHistory — and the
 * mask is what keeps them out of this process altogether.
 */
export const ASSIGNMENT_FIELDS = Object.freeze([
  'title', 'schemaVersion', 'assignedClassIds', 'archived', 'assessmentPolicy.mode', 'variantPolicy', 'sections', 'questions',
]);
export const REPORT_DIR = 'release-reports';
export const PAGE_SIZE = 100;

/*
 * THE DECLARED FIELD LISTS (design §1.1). A name in ANYWHERE is unambiguous
 * and counted at any depth (stages, steps, variants). A name in ROOT is only
 * a key at the root of a question or of one of its variants (`answer`,
 * `target` or `behavior` can mean something else deeper down). The rest are
 * read where their contract puts them.
 */
export const STORED_KEY_FIELDS = Object.freeze({
  anywhere: Object.freeze([
    'acceptedAnswers', 'correctMatches', 'correctIndependentId', 'correctDependentId', 'correctionAnswerId',
    'correctDomain', 'correctRange', 'correctEquation', 'tableAnswers', 'expectedStepPoints', 'expectedModel',
    'expectedConstraints', 'solutionKey', 'generatedAnswer',
  ]),
  root: Object.freeze([
    'answer', 'accepted', 'solution', 'grading', 'tolerance', 'targetValue', 'targetRoot', 'targetN',
    'xIntercepts', 'yIntercept', 'extreme', 'axisOfSymmetry', 'asymptote', 'behavior', 'continuity',
  ]),
  contextual: Object.freeze([
    'target (a number line\'s scalar key; a transformation\'s target {a,h,k} draws the item and is stimulus-derived)',
    'answerFields[].answer', 'answerFields[].numericTolerance', 'responseFields[].expected', 'responseFields[].answer',
    'responses[].answer', 'scaffold.correct', 'table.answers', 'task.expected', 'generator.derived',
    'targets[].classification', 'context.*.value (beside choices)',
  ]),
});
export const WORKED_SOLUTION_FIELDS = Object.freeze({
  anywhere: Object.freeze(['solutionReview', 'workedSolution', 'solutionExplanation', 'solutionSteps', 'solutionRepresentations']),
  root: Object.freeze(['explanation']),
});
export const HINT_FIELDS = Object.freeze(['hints', 'supportHints']);
export const ANSWER_BEARING_HELP_FIELDS = Object.freeze(['attemptFeedback', 'misconceptions', 'guidedNotes.steps']);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const present = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return true;
};
const optionTexts = (option) => (isObject(option)
  ? [option.label, option.value, option.text, option.id].filter((entry) => entry != null).map(clean)
  : [clean(option)]);
const answerValues = (value) => (Array.isArray(value) ? value : [value]).filter((entry) => entry != null && typeof entry !== 'object').map(clean).filter(Boolean);

/** Every object in a question, each once, with whether it is a root (the question or one of its variants). */
const walk = (question, visit) => {
  const roots = new Set([question, ...list(question.variants).filter(isObject)]);
  const seen = new Set();
  const step = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(step); return; }
    visit(node, roots.has(node));
    Object.values(node).forEach(step);
  };
  step(question);
};

/**
 * What one stored question carries. Pure: the report and its tests share it.
 *   { storedKeyFields: string[], choiceLabelKey, workedSolution, hints, answerBearingHelp }
 */
export const classifyQuestionExposure = (question) => {
  const storedKeyFields = new Set();
  let choiceLabelKey = false;
  let workedSolution = false;
  let hints = false;
  let answerBearingHelp = false;
  if (!isObject(question)) return { storedKeyFields: [], choiceLabelKey, workedSolution, hints, answerBearingHelp };
  walk(question, (node, root) => {
    STORED_KEY_FIELDS.anywhere.forEach((field) => { if (present(node[field])) storedKeyFields.add(field); });
    if (root) STORED_KEY_FIELDS.root.forEach((field) => { if (present(node[field])) storedKeyFields.add(field); });
    if (root && present(node.target) && typeof node.target !== 'object') storedKeyFields.add('target');
    list(node.answerFields).forEach((field) => {
      if (!isObject(field)) return;
      if (present(field.answer)) storedKeyFields.add('answerFields[].answer');
      if (present(field.numericTolerance)) storedKeyFields.add('answerFields[].numericTolerance');
      const options = list(field.options).flatMap(optionTexts).filter(Boolean);
      if (options.length && answerValues(field.answer).some((answer) => options.includes(answer))) choiceLabelKey = true;
    });
    list(node.responseFields).forEach((field) => {
      if (!isObject(field)) return;
      if (present(field.expected)) storedKeyFields.add('responseFields[].expected');
      if (present(field.answer)) storedKeyFields.add('responseFields[].answer');
    });
    list(node.responses).forEach((response) => { if (isObject(response) && present(response.answer)) storedKeyFields.add('responses[].answer'); });
    if (isObject(node.scaffold) && present(node.scaffold.correct)) storedKeyFields.add('scaffold.correct');
    if (isObject(node.table) && present(node.table.answers)) storedKeyFields.add('table.answers');
    if (isObject(node.task) && present(node.task.expected)) storedKeyFields.add('task.expected');
    if (isObject(node.generator) && present(node.generator.derived)) storedKeyFields.add('generator.derived');
    list(node.targets).forEach((target) => { if (isObject(target) && present(target.classification)) storedKeyFields.add('targets[].classification'); });
    if (isObject(node.context)) {
      Object.values(node.context).forEach((entry) => {
        if (!isObject(entry) || !Array.isArray(entry.choices) || !present(entry.value)) return;
        storedKeyFields.add('context.*.value');
        const choices = entry.choices.flatMap(optionTexts).filter(Boolean);
        if (answerValues(entry.value).some((value) => choices.includes(value))) choiceLabelKey = true;
      });
    }
    if (WORKED_SOLUTION_FIELDS.anywhere.some((field) => present(node[field]))) workedSolution = true;
    if (root && WORKED_SOLUTION_FIELDS.root.some((field) => present(node[field]))) workedSolution = true;
    if (root && HINT_FIELDS.some((field) => present(node[field]))) hints = true;
    if (root && (present(node.attemptFeedback) || present(node.misconceptions)
      || (isObject(node.guidedNotes) && present(node.guidedNotes.steps)))) answerBearingHelp = true;
  });
  return { storedKeyFields: [...storedKeyFields].sort(), choiceLabelKey, workedSolution, hints, answerBearingHelp };
};

/*
 * Can the server grade this question as stored? The same two calls ingestion
 * makes. A Question Family slot is its own outcome: its key is computed on the
 * device, but ingestion grades it from the delivery pin.
 */
export const GRADING_OUTCOME = Object.freeze({
  SERVER: 'server-gradable',
  FAMILY_SLOT: 'family-slot',
  NON_GRADED: 'non-graded',
  EXCLUDED: 'teacher-excluded',
  DEVICE_ONLY: 'device-only',
});

export const gradingOutcomeFor = (question) => {
  let support;
  try {
    support = serverResponseGradingSupport(deliveredQuestionForGrading(question));
  } catch (error) {
    return { outcome: GRADING_OUTCOME.DEVICE_ONLY, reason: `unreadable:${String(error?.message || error).slice(0, 80)}` };
  }
  if (support?.supported) return { outcome: GRADING_OUTCOME.SERVER, reason: null };
  const reason = String(support?.reason || 'unknown');
  // An assignment's own template carries its `generator` and is family-backed:
  // ingestion rebuilds the instance from the delivery pin before it grades
  // (questionFamilyGrading.mjs resolveServerGradingQuestion), as for any family.
  if (reason === 'family-template' || (reason === 'generated-question' && isFamilyBackedQuestion(question))) {
    return { outcome: GRADING_OUTCOME.FAMILY_SLOT, reason: 'family-template' };
  }
  if (reason === 'teacher-excluded') return { outcome: GRADING_OUTCOME.EXCLUDED, reason };
  if (reason.startsWith('non-graded')) return { outcome: GRADING_OUTCOME.NON_GRADED, reason };
  return { outcome: GRADING_OUTCOME.DEVICE_ONLY, reason };
};

/** The variant mode a section's students get (storedAssignmentV5.js getStoredSectionVariantMode). */
export const sectionVariantMode = (assignment, role) => {
  if (Number(assignment?.schemaVersion) !== 5) return null;
  const policy = isObject(assignment?.variantPolicy) ? assignment.variantPolicy : {};
  const sectionModes = isObject(policy.sectionModes) ? policy.sectionModes : {};
  return clean(sectionModes[clean(role).toLowerCase()]).toLowerCase() || clean(policy.mode).toLowerCase() || 'personalized';
};

const emptyCounts = () => ({
  questions: 0,
  withStoredKey: 0,
  withChoiceLabelKey: 0,
  withWorkedSolution: 0,
  withHints: 0,
  withAnswerBearingHelp: 0,
  serverGradable: 0,
  familySlots: 0,
  nonGraded: 0,
  teacherExcluded: 0,
  deviceOnly: 0,
  deviceOnlyReasons: {},
  storedKeyFields: {},
});

const addQuestion = (counts, exposure, grading) => {
  counts.questions += 1;
  if (exposure.storedKeyFields.length) counts.withStoredKey += 1;
  if (exposure.choiceLabelKey) counts.withChoiceLabelKey += 1;
  if (exposure.workedSolution) counts.withWorkedSolution += 1;
  if (exposure.hints) counts.withHints += 1;
  if (exposure.answerBearingHelp) counts.withAnswerBearingHelp += 1;
  exposure.storedKeyFields.forEach((field) => { counts.storedKeyFields[field] = (counts.storedKeyFields[field] || 0) + 1; });
  if (grading.outcome === GRADING_OUTCOME.SERVER) counts.serverGradable += 1;
  if (grading.outcome === GRADING_OUTCOME.FAMILY_SLOT) counts.familySlots += 1;
  if (grading.outcome === GRADING_OUTCOME.NON_GRADED) counts.nonGraded += 1;
  if (grading.outcome === GRADING_OUTCOME.EXCLUDED) counts.teacherExcluded += 1;
  if (grading.outcome === GRADING_OUTCOME.DEVICE_ONLY) {
    counts.deviceOnly += 1;
    counts.deviceOnlyReasons[grading.reason] = (counts.deviceOnlyReasons[grading.reason] || 0) + 1;
  }
};

const mergeCounts = (into, from) => {
  Object.entries(from).forEach(([key, value]) => {
    if (typeof value === 'number') into[key] += value;
    else Object.entries(value).forEach(([name, count]) => { into[key][name] = (into[key][name] || 0) + count; });
  });
};

/*
 * The sections of one stored assignment. V5 keeps `sections[]`; an older
 * document may still hold a flat `questions[]` — it is reported too (under
 * each question's own activityRole, else 'legacy'), since its keys are just as
 * readable.
 */
const sectionsOf = (assignment) => {
  if (Array.isArray(assignment?.sections) && assignment.sections.length) {
    return assignment.sections.map((section, index) => ({
      sectionId: clean(section?.id) || `section-${index}`,
      role: clean(section?.role).toLowerCase() || 'classwork',
      title: clean(section?.title) || null,
      questions: list(section?.questions),
    }));
  }
  const byRole = new Map();
  list(assignment?.questions).forEach((question) => {
    const role = clean(question?.activityRole).toLowerCase() || 'legacy';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(question);
  });
  return [...byRole.entries()].map(([role, questions]) => ({ sectionId: `legacy-${role}`, role, title: null, questions }));
};

/** One assignment's report entry. Pure. */
export const assignmentExposure = (id, assignment) => {
  const counts = emptyCounts();
  const sections = sectionsOf(assignment).map((section) => {
    const sectionCounts = emptyCounts();
    section.questions.forEach((question) => {
      addQuestion(sectionCounts, classifyQuestionExposure(question), gradingOutcomeFor(question));
    });
    mergeCounts(counts, sectionCounts);
    return {
      sectionId: section.sectionId,
      role: section.role,
      title: section.title,
      variantMode: sectionVariantMode(assignment, section.role),
      ...sectionCounts,
    };
  });
  return {
    assignmentId: id,
    title: clean(assignment?.title) || null,
    schemaVersion: assignment?.schemaVersion ?? null,
    assignedClassCount: list(assignment?.assignedClassIds).length,
    archived: assignment?.archived === true,
    testCycle: clean(assignment?.assessmentPolicy?.mode) === 'testCycle',
    variantMode: sectionVariantMode(assignment, ''),
    ...counts,
    sections,
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
 * collection/doc/orderBy/select/limit/startAfter/get and getAll (with a fieldMask) are used.
 */
export const runAssignmentKeyExposureReport = async ({
  db, assignmentIds = [], pageSize = PAGE_SIZE, now = () => Date.now(), documentIdField = '__name__',
} = {}) => {
  const startedAt = new Date(now()).toISOString();
  const assignments = [];
  const consider = (id, data) => { assignments.push(assignmentExposure(id, data || {})); };
  const missing = [];
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

  const totals = { assignments: assignments.length, ...emptyCounts(), byRole: {}, byVariantMode: {} };
  assignments.forEach((entry) => {
    entry.sections.forEach((section) => {
      const { sectionId, role, title, variantMode, ...sectionCounts } = section;
      void sectionId; void title;
      totals.byRole[role] ??= { sections: 0, ...emptyCounts() };
      totals.byRole[role].sections += 1;
      mergeCounts(totals.byRole[role], sectionCounts);
      mergeCounts(totals, sectionCounts);
      const mode = variantMode || 'not-v5';
      totals.byVariantMode[role] ??= {};
      totals.byVariantMode[role][mode] = (totals.byVariantMode[role][mode] || 0) + 1;
    });
  });

  return {
    tool: 'report-assignment-key-exposure',
    version: REPORT_VERSION,
    readOnly: true,
    startedAt,
    assignmentFilter: assignmentIds.length ? [...assignmentIds] : null,
    missingAssignments: missing,
    fieldLists: {
      storedKey: STORED_KEY_FIELDS,
      workedSolution: WORKED_SOLUTION_FIELDS,
      hints: HINT_FIELDS,
      answerBearingHelp: ANSWER_BEARING_HELP_FIELDS,
    },
    notes: [
      'Counts are questions: a question counts once per column however many fields or variants carry it.',
      'withChoiceLabelKey: an answer field whose stored answer equals one of its own options, or a context value equal to one of its choices — readable without doing any mathematics.',
      'deviceOnly: the server cannot grade it as stored (serverResponseGradingSupport after deliveredQuestionForGrading). familySlots are graded by ingestion from the delivery pin and are not device-only, though the device computes their key.',
      'Stimulus-derived answers (the data that draws a graph, a system, a matrix) are not counted: no split can hide them (design §1.1, R9).',
      'Only the fields in ASSIGNMENT_FIELDS were read (a field mask), so no per-student field on an assignment was read. Titles are the teacher\'s own.',
    ],
    totals,
    assignments,
  };
};

// --- CLI ----------------------------------------------------------------------

const USAGE = `Usage: node scripts/report-assignment-key-exposure.mjs --project <id> [options]

Read-only. For every assignment and section role, counts the questions whose
answer key, choice label, worked solution, hints or other answer-bearing help a
student's device receives, the items only the device can grade, and the
section's variant mode. Writes one JSON file to ${REPORT_DIR}/ (gitignored).

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

export const reportFilePath = (startedAt) => path.join(repoRoot, REPORT_DIR, `assignment-key-exposure-${startedAt.replace(/[:.]/g, '-')}.json`);

const printCounts = (report) => {
  const lines = [];
  const add = (label, value) => lines.push(`  ${label.padEnd(56)} ${value}`);
  const row = (counts) => [
    `questions ${counts.questions}`, `stored key ${counts.withStoredKey}`, `choice label ${counts.withChoiceLabelKey}`,
    `solution ${counts.withWorkedSolution}`, `hints ${counts.withHints}`, `device-only ${counts.deviceOnly}`,
  ].join(' · ');
  add('assignments read', report.totals.assignments);
  if (report.missingAssignments.length) add('named assignments not found', report.missingAssignments.length);
  add('all sections', row(report.totals));
  Object.entries(report.totals.byRole).sort(([a], [b]) => a.localeCompare(b)).forEach(([role, counts]) => {
    add(`  ${role} (${counts.sections} sections)`, row(counts));
  });
  Object.entries(report.totals.deviceOnlyReasons).forEach(([reason, count]) => add(`    device-only: ${reason}`, count));
  console.log(lines.join('\n'));
};

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`report-assignment-key-exposure: ${error.message}\n\n${USAGE}`);
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
      console.error('report-assignment-key-exposure: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'report-assignment-key-exposure');
  console.log('Assignment key exposure (D10 P0-4) — READ ONLY (nothing is written to Firestore)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  let report;
  try {
    report = await runAssignmentKeyExposureReport({
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
  console.log(`\nDetail (per assignment and section): ${path.relative(process.cwd(), reportPath) || reportPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`report-assignment-key-exposure: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
