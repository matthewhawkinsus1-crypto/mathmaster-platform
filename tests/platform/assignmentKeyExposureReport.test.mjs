import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import {
  ASSIGNMENT_FIELDS, GRADING_OUTCOME, REPORT_DIR, assignmentExposure, classifyQuestionExposure, gradingOutcomeFor,
  parseReportArgs, reportFilePath, runAssignmentKeyExposureReport, sectionVariantMode,
} from '../../scripts/report-assignment-key-exposure.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

/*
 * D10 Phase 0, P0-4: the read-only exposure report
 * (scripts/report-assignment-key-exposure.mjs). Proven here:
 *   - each column means what it says, on hand-made questions, variants and
 *     nested stages included;
 *   - on the repository's own 16 lesson files it reproduces the design's
 *     independent count (ANSWER_KEY_SERVER_SIDE_DESIGN.md §1.2) exactly;
 *   - run against a database that throws on any write, it writes nothing and
 *     returns the documented shape, per assignment and section role;
 *   - the script has no write mode and its output goes to release-reports/,
 *     which is gitignored.
 * The CLI against a seeded Firestore emulator:
 *   tests/integration/assignmentKeyExposureReport.test.mjs.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// --- the columns ---------------------------------------------------------------

test('a stored key is found at the root, in answer fields, in variants and in nested stages', () => {
  assert.deepEqual(classifyQuestionExposure({ type: 'literal', prompt: 'x?', acceptedAnswers: ['2'] }).storedKeyFields, ['acceptedAnswers']);
  assert.deepEqual(classifyQuestionExposure({ type: 'multiAnswer', answerFields: [{ id: 'a', answer: '-1' }] }).storedKeyFields, ['answerFields[].answer']);
  assert.deepEqual(classifyQuestionExposure({ type: 'x', variants: [{ answer: '3' }] }).storedKeyFields, ['answer'], 'a variant is a root of its own');
  assert.deepEqual(classifyQuestionExposure({ type: 'workflow', stages: [{ question: { correctRange: '[0, inf)' } }] }).storedKeyFields, ['correctRange'], 'unambiguous names count at any depth');
  assert.deepEqual(classifyQuestionExposure({ type: 'workflow', stages: [{ answer: 'not a root' }] }).storedKeyFields, [], '`answer` deeper down is not assumed to be a key');
  assert.deepEqual(classifyQuestionExposure({ type: 'numberLine', target: 4 }).storedKeyFields, ['target'], "a number line's target is its key");
  assert.deepEqual(classifyQuestionExposure({ type: 'transformationsLab', target: { a: 1, h: -2, k: 3 } }).storedKeyFields, [], 'a transformation target draws the item (stimulus-derived)');
  assert.deepEqual(classifyQuestionExposure({ type: 'table', table: { answers: { '0:1': '4' } } }).storedKeyFields, ['table.answers']);
  assert.deepEqual(classifyQuestionExposure({ type: 'graph', functionSpec: { m: 2, b: -1 } }).storedKeyFields, [], 'the data that draws a graph is not counted');
  assert.deepEqual(classifyQuestionExposure({ type: 'x', answerFields: [{ answer: '' }], hints: [] }), {
    storedKeyFields: [], choiceLabelKey: false, workedSolution: false, hints: false, answerBearingHelp: false,
  }, 'empty values are not exposure');
});

test('a choice label marks the answer only when the stored answer is one of its own options', () => {
  assert.equal(classifyQuestionExposure({ answerFields: [{ answer: 'Slope 2', options: ['Slope 1', 'Slope 2'] }] }).choiceLabelKey, true);
  assert.equal(classifyQuestionExposure({ answerFields: [{ answer: 'b', options: [{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }] }] }).choiceLabelKey, true);
  assert.equal(classifyQuestionExposure({ answerFields: [{ answer: '7', options: ['1', '2'] }] }).choiceLabelKey, false);
  assert.equal(classifyQuestionExposure({ answerFields: [{ answer: '7' }] }).choiceLabelKey, false, 'a typed answer is a stored key, not a choice label');
  const context = classifyQuestionExposure({ context: { shape: { value: 'linear', choices: ['linear', 'quadratic'] } } });
  assert.equal(context.choiceLabelKey, true);
  assert.deepEqual(context.storedKeyFields, ['context.*.value']);
});

test('worked solutions, hints and other answer-bearing help are their own columns', () => {
  const full = classifyQuestionExposure({
    solutionReview: { headline: 'Subtract 3' }, hints: ['Think about slope'], attemptFeedback: { wrong: 'Check the sign' },
  });
  assert.deepEqual([full.workedSolution, full.hints, full.answerBearingHelp], [true, true, true]);
  assert.equal(classifyQuestionExposure({ supportHints: ['x'] }).hints, true);
  assert.equal(classifyQuestionExposure({ guidedNotes: { steps: [{ text: 'worked example' }] } }).answerBearingHelp, true);
  assert.equal(classifyQuestionExposure({ stages: [{ workedSolution: 'deep' }] }).workedSolution, true);
  assert.equal(classifyQuestionExposure({ variants: [{ explanation: 'because' }] }).workedSolution, true);
});

test('grading outcome: what ingestion can grade as stored, Question Family slots apart, the rest device-only by reason', () => {
  assert.equal(gradingOutcomeFor({ type: 'numberLine', target: 3 }).outcome, GRADING_OUTCOME.DEVICE_ONLY);
  assert.match(gradingOutcomeFor({ type: 'numberLine', target: 3 }).reason, /numberLine/);
  assert.deepEqual(gradingOutcomeFor({ type: 'literal', generator: { kind: 'x' } }), { outcome: GRADING_OUTCOME.DEVICE_ONLY, reason: 'generated-question' });
  assert.deepEqual(gradingOutcomeFor({ type: 'literal', variants: [{}] }), { outcome: GRADING_OUTCOME.DEVICE_ONLY, reason: 'variant-selection' });
  assert.deepEqual(gradingOutcomeFor({ type: 'literal', teacherExcluded: true }), { outcome: GRADING_OUTCOME.EXCLUDED, reason: 'teacher-excluded' });
});

test('variant mode: the section\'s own, else the assignment\'s, else personalized; none before V5', () => {
  const assignment = { schemaVersion: 5, variantPolicy: { mode: 'shared', sectionModes: { practice: 'adaptive' } } };
  assert.equal(sectionVariantMode(assignment, 'practice'), 'adaptive');
  assert.equal(sectionVariantMode(assignment, 'dol'), 'shared');
  assert.equal(sectionVariantMode({ schemaVersion: 5 }, 'dol'), 'personalized');
  assert.equal(sectionVariantMode({ questions: [] }, 'dol'), null);
});

// --- the repository's own lessons, against the design's independent count ------

const lessonFiles = () => {
  const files = [];
  const visit = (target) => {
    if (statSync(target).isDirectory()) readdirSync(target).sort().forEach((name) => visit(path.join(target, name)));
    else if (target.endsWith('.json')) files.push(target);
  };
  visit(path.join(repo, 'teacher-import-jsons'));
  visit(path.join(repo, 'docs/assignments'));
  return files;
};

// Lessons added after the design counted its 16 files, each with its own rows.
const AFTER_THE_DESIGN = Object.freeze({
  'L1_Operations_on_Polynomials.json': {
    warmup: { questions: 3, withStoredKey: 3, serverGradable: 3, familySlots: 0, deviceOnly: 0, withHints: 3 },
    classwork: { questions: 11, withStoredKey: 7, serverGradable: 11, familySlots: 0, deviceOnly: 0, withHints: 11 },
    practice: { questions: 15, withStoredKey: 12, serverGradable: 15, familySlots: 0, deviceOnly: 0, withHints: 15 },
    dol: { questions: 3, withStoredKey: 1, serverGradable: 3, familySlots: 0, deviceOnly: 0, withHints: 0 },
  },
  // The Workshop's long and synthetic division items keep their key in the
  // tool's own fields (dividend, divisor), not a stored answer.
  'L2_Dividing_Polynomials.json': {
    warmup: { questions: 3, withStoredKey: 3, serverGradable: 3, familySlots: 0, deviceOnly: 0, withHints: 3 },
    classwork: { questions: 11, withStoredKey: 4, serverGradable: 11, familySlots: 0, deviceOnly: 0, withHints: 11 },
    practice: { questions: 16, withStoredKey: 10, serverGradable: 16, familySlots: 0, deviceOnly: 0, withHints: 16 },
    dol: { questions: 3, withStoredKey: 1, serverGradable: 3, familySlots: 0, deviceOnly: 0, withHints: 0 },
  },
});

const exposureByRole = (files) => {
  const byRole = {};
  files.forEach((file) => {
    const { assignmentV5 } = parseAssignmentBlueprintText(readFileSync(file, 'utf8'));
    assignmentExposure(path.basename(file), assignmentV5).sections.forEach((section) => {
      const row = (byRole[section.role] ??= { questions: 0, withStoredKey: 0, serverGradable: 0, familySlots: 0, deviceOnly: 0, withHints: 0 });
      Object.keys(row).forEach((key) => { row[key] += section[key]; });
    });
  });
  return byRole;
};

test('lessons added after the design: each has its own expected rows, and every Warm-Up and DOL item is server-gradable', () => {
  const files = lessonFiles().filter((file) => path.basename(file) in AFTER_THE_DESIGN);
  assert.deepEqual(files.map((file) => path.basename(file)).sort(), Object.keys(AFTER_THE_DESIGN).sort());
  files.forEach((file) => {
    const byRole = exposureByRole([file]);
    assert.deepEqual(byRole, AFTER_THE_DESIGN[path.basename(file)], path.basename(file));
    ['warmup', 'dol'].forEach((role) => assert.equal(byRole[role].serverGradable, byRole[role].questions, `${path.basename(file)} ${role}`));
  });
});

test('on the 16 lesson files it reproduces the design\'s count (§1.2): questions, stored keys, server-gradable, family slots', () => {
  const files = lessonFiles().filter((file) => !(path.basename(file) in AFTER_THE_DESIGN));
  assert.equal(files.length, 16, 'the design counted these 16 files; a new lesson goes in AFTER_THE_DESIGN with its own rows');
  const byRole = exposureByRole(files);
  // Design §1.2: Q / stored key / has hints / server can grade as stored.
  // Hints are one higher in Practice: the report also counts `supportHints`
  // (design §1.1 lists both), and one Absolute Value item has only those.
  assert.deepEqual(byRole, {
    warmup: { questions: 44, withStoredKey: 27, serverGradable: 42, familySlots: 2, deviceOnly: 0, withHints: 8 },
    classwork: { questions: 108, withStoredKey: 51, serverGradable: 105, familySlots: 3, deviceOnly: 0, withHints: 27 },
    practice: { questions: 110, withStoredKey: 55, serverGradable: 107, familySlots: 2, deviceOnly: 1, withHints: 37 },
    dol: { questions: 45, withStoredKey: 30, serverGradable: 44, familySlots: 1, deviceOnly: 0, withHints: 0 },
  });
});

// --- the report against a database that refuses every write ---------------------

const WRITE_METHODS = new Set(['set', 'update', 'delete', 'create', 'add', 'batch', 'runTransaction', 'bulkWriter', 'recursiveDelete', 'bundle']);

const readOnlyStore = (documents) => {
  const attempts = [];
  const guard = (target, label) => new Proxy(target, {
    get(object, property) {
      if (WRITE_METHODS.has(property)) {
        return () => { attempts.push(`${label}.${String(property)}`); throw new Error(`write refused: ${label}.${String(property)}`); };
      }
      return object[property];
    },
  });
  // A field mask is applied as Firestore applies it: only the named paths come back.
  const masked = (data, fields) => {
    if (!fields) return structuredClone(data);
    const out = {};
    fields.forEach((field) => {
      const parts = field.split('.');
      let source = data;
      for (const part of parts) source = source?.[part];
      if (source === undefined) return;
      let target = out;
      parts.slice(0, -1).forEach((part) => { target[part] ??= {}; target = target[part]; });
      target[parts.at(-1)] = structuredClone(source);
    });
    return out;
  };
  const masks = [];
  const snapshot = (docPath, fields = null) => {
    const data = documents.get(docPath);
    return { id: docPath.split('/').at(-1), exists: data !== undefined, ref: { path: docPath }, data: () => (data === undefined ? undefined : masked(data, fields)) };
  };
  const reads = [];
  const query = (collectionPath, state = { limit: Infinity, after: null, ordered: false, fields: null }) => guard({
    orderBy: () => query(collectionPath, { ...state, ordered: true }),
    select: (...fields) => { masks.push(fields); return query(collectionPath, { ...state, fields }); },
    limit: (count) => query(collectionPath, { ...state, limit: count }),
    startAfter: (doc) => query(collectionPath, { ...state, after: doc }),
    get: async () => {
      reads.push(collectionPath);
      let rows = [...documents.keys()].filter((key) => key.startsWith(`${collectionPath}/`) && !key.slice(collectionPath.length + 1).includes('/')).sort();
      if (state.after) rows = rows.slice(rows.indexOf(state.after.ref.path) + 1);
      return { docs: rows.slice(0, state.limit).map((key) => snapshot(key, state.fields)) };
    },
  }, `query(${collectionPath})`);
  const docRef = (docPath) => guard({ id: docPath.split('/').at(-1), path: docPath, get: async () => snapshot(docPath) }, `doc(${docPath})`);
  const db = guard({
    collection: (name) => guard({ ...query(name), doc: (id) => docRef(`${name}/${id}`) }, `collection(${name})`),
    getAll: async (...args) => {
      reads.push('getAll');
      const options = args.at(-1)?.fieldMask ? args.pop() : {};
      if (options.fieldMask) masks.push(options.fieldMask);
      return args.map((ref) => snapshot(ref.path, options.fieldMask || null));
    },
  }, 'db');
  return { db, attempts, reads, masks };
};

const seeded = () => {
  const docs = new Map();
  docs.set('assignments/A-dol', {
    title: 'Lesson 3', schemaVersion: 5, assignedClassIds: ['c1', 'c2'],
    // Per-student fields an assignment can still carry: never read.
    studentOverrides: { S1: { lateDueAt: 'per-student-secret' } },
    excusedStudentIds: ['S1-per-student-secret'],
    dol: { attemptGrantsByStudentId: { S1: 'per-student-secret' } },
    audienceHistory: [{ studentId: 'S1-per-student-secret' }],
    variantPolicy: { mode: 'shared', sectionModes: { practice: 'adaptive' } },
    sections: [
      { id: 'dol', role: 'dol', title: 'Exit Ticket', questions: [
        { type: 'multiAnswer', questionId: 'd1', answerFields: [{ id: 'f', answer: 'B', options: ['A', 'B'] }] },
        { type: 'numberLine', questionId: 'd2', target: 3 },
      ] },
      { id: 'pr', role: 'practice', title: 'Practice', questions: [
        { type: 'literal', questionId: 'p1', acceptedAnswers: ['2'], hints: ['h'], solutionReview: { headline: 's' } },
        { type: 'graph', questionId: 'p2', functionSpec: { m: 1 } },
      ] },
    ],
  });
  docs.set('assignments/B-legacy', { title: 'Old flat lesson', questions: [{ type: 'literal', answer: '5', activityRole: 'classwork' }, { type: 'literal' }] });
  // A grade document the report must never read.
  docs.set('grades/S1', { displayName: 'never read', gradesByAssignment: { 'A-dol': {} } });
  return readOnlyStore(docs);
};

test('the store really refuses writes (so the report test below would have caught one)', () => {
  const { db, attempts } = seeded();
  assert.throws(() => db.collection('assignments').doc('a').set({}), /write refused/);
  assert.throws(() => db.batch(), /write refused/);
  assert.equal(attempts.length, 2);
});

test('the report: per assignment and section role, totals by role and variant mode; reads assignments only; never a write', async () => {
  const { db, attempts, reads, masks } = seeded();
  const report = await runAssignmentKeyExposureReport({ db, pageSize: 1, now: () => Date.UTC(2026, 9, 16, 12) });
  assert.deepEqual(attempts, []);
  assert.ok(masks.length >= 1 && masks.every((mask) => JSON.stringify(mask) === JSON.stringify(ASSIGNMENT_FIELDS)), 'every read is field-masked');
  for (const field of ['studentOverrides', 'excusedStudentIds', 'dol', 'audienceHistory']) assert.ok(!ASSIGNMENT_FIELDS.includes(field), field);
  assert.doesNotMatch(JSON.stringify(report), /per-student-secret/);
  assert.ok(reads.every((entry) => entry === 'assignments'), `reads: ${reads.join(', ')}`);
  assert.deepEqual(Object.keys(report), ['tool', 'version', 'readOnly', 'startedAt', 'assignmentFilter', 'missingAssignments', 'fieldLists', 'notes', 'totals', 'assignments']);
  assert.equal(report.readOnly, true);
  assert.equal(report.startedAt, '2026-10-16T12:00:00.000Z');
  assert.deepEqual(report.assignments.map((entry) => entry.assignmentId), ['A-dol', 'B-legacy'], 'paging reached past the first page');

  const [lesson, legacy] = report.assignments;
  assert.equal(lesson.assignedClassCount, 2);
  assert.deepEqual(lesson.sections.map(({ role, variantMode, questions }) => [role, variantMode, questions]), [['dol', 'shared', 2], ['practice', 'adaptive', 2]]);
  const [dol, practice] = lesson.sections;
  assert.deepEqual(
    [dol.withStoredKey, dol.withChoiceLabelKey, dol.withWorkedSolution, dol.withHints, dol.deviceOnly],
    [2, 1, 0, 0, 1],
  );
  assert.deepEqual(dol.storedKeyFields, { 'answerFields[].answer': 1, target: 1 });
  assert.equal(Object.keys(dol.deviceOnlyReasons).length, 1);
  assert.match(Object.keys(dol.deviceOnlyReasons)[0], /numberLine/);
  assert.deepEqual([practice.withStoredKey, practice.withWorkedSolution, practice.withHints], [1, 1, 1]);
  assert.equal(lesson.questions, 4, 'assignment totals add up its sections');
  assert.equal(lesson.withStoredKey, 3);

  assert.equal(legacy.schemaVersion, null);
  assert.deepEqual(legacy.sections.map(({ role, variantMode, questions, withStoredKey }) => [role, variantMode, questions, withStoredKey]), [['classwork', null, 1, 1], ['legacy', null, 1, 0]], 'a pre-V5 flat document is reported too, by each question\'s own role');

  assert.equal(report.totals.assignments, 2);
  assert.equal(report.totals.questions, 6);
  assert.equal(report.totals.withStoredKey, 4);
  assert.deepEqual(Object.keys(report.totals.byRole).sort(), ['classwork', 'dol', 'legacy', 'practice']);
  assert.equal(report.totals.byRole.dol.sections, 1);
  assert.equal(report.totals.byRole.dol.withChoiceLabelKey, 1);
  assert.deepEqual(report.totals.byVariantMode, { dol: { shared: 1 }, practice: { adaptive: 1 }, classwork: { 'not-v5': 1 }, legacy: { 'not-v5': 1 } });
  assert.doesNotMatch(JSON.stringify(report), /never read/, 'nothing about a student is in the report');
});

test('named assignments are read by id, and a missing one is listed, not fatal', async () => {
  const { db, attempts, reads, masks } = seeded();
  const report = await runAssignmentKeyExposureReport({ db, assignmentIds: ['B-legacy', 'gone'] });
  assert.deepEqual(attempts, []);
  assert.deepEqual(masks, [[...ASSIGNMENT_FIELDS]], 'a by-id read is field-masked too');
  assert.deepEqual(reads, ['getAll']);
  assert.deepEqual(report.assignments.map((entry) => entry.assignmentId), ['B-legacy']);
  assert.deepEqual(report.missingAssignments, ['gone']);
  assert.deepEqual(report.assignmentFilter, ['B-legacy', 'gone']);
});

test('the script has no write mode, no Firestore write call, and writes only under release-reports/ (gitignored)', () => {
  const source = executableSource(readFileSync(path.join(repo, 'scripts/report-assignment-key-exposure.mjs'), 'utf8'))
    // Not Firestore: app.delete() closes the Admin SDK's channels.
    .replace(/\bapp\.delete\(\)/g, 'app-close()')
    // Not Firestore: the in-memory Sets and the Map that group a document.
    .replace(/\b(storedKeyFields|seen)\.add\(/g, 'set-add(')
    .replace(/\bbyRole\.set\(/g, 'map-set(');
  assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/);
  assert.doesNotMatch(source, /--execute|--write|--apply|--out\b/);
  assert.equal((source.match(/writeFileSync\(/g) || []).length, 1, 'one local file write');
  assert.match(source, /writeFileSync\(reportPath, /);
  assert.match(source, /const reportPath = reportFilePath\(report\.startedAt\);/);
  const file = reportFilePath('2026-10-16T12:00:00.000Z');
  assert.equal(path.relative(path.join(repo, REPORT_DIR), file), 'assignment-key-exposure-2026-10-16T12-00-00-000Z.json');
  assert.match(readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^release-reports\/?$/m);
  assert.throws(() => parseReportArgs(['--project', 'p', '--execute']), /no write mode/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--out', 'x']), /no write mode/);
  assert.throws(() => parseReportArgs(['--assignment', 'a']), /--project is required/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--page-size', '0']), /--page-size/);
  assert.deepEqual(parseReportArgs(['--project', 'p', '--assignment', 'a', '--assignment', 'a']), { help: false, project: 'p', assignmentIds: ['a'], pageSize: 100 });
});
