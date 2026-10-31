// The read-only counts of student pass 3, wave 7 (grader gaps 2), for the
// owner to run against production. Here they run against a database that
// throws on any write; tests/integration/orderedPairTextKeysReport.test.mjs
// runs the CLI against a seeded Firestore emulator.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASSIGNMENT_FIELDS,
  orderedPairKeyKind,
  parseReportArgs,
  runOrderedPairTextKeysReport,
} from '../../scripts/report-ordered-pair-text-keys.mjs';
import { executableSource } from './helpers/sourceContract.mjs';
import { readOnlyStore } from './helpers/readOnlyFirestore.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const seeded = () => {
  const docs = new Map();
  docs.set('assignments/A-pairs', {
    title: 'Systems', schemaVersion: 5, assignedClassIds: ['c1'],
    studentOverrides: { S1: { lateDueAt: 'per-student-secret' } },
    sections: [{ id: 'pr', role: 'practice', title: 'Practice', questions: [
      { type: 'orderedPair', questionId: 'p1', prompt: 'Where?', answer: '(2,3)' },
      { type: 'orderedPair', questionId: 'p2', prompt: 'Where?', answer: [2, 5] },
      { type: 'orderedPair', questionId: 'p3', prompt: 'Where?', answer: 'none' },
      { type: 'orderedPair', questionId: 'p4', prompt: 'Name the point.', generator: { kind: 'orderedPair' } },
      { type: 'orderedPair', questionId: 'p5', prompt: 'Where?', answer: [1, 1], variants: [{ answer: '(1/2, 4)' }] },
      { type: 'literal', questionId: 'p6', acceptedAnswers: ['(2,3)'] },
      // Shapes the grader cannot read as a point: refused by Pre-Flight too.
      { type: 'orderedPair', questionId: 'p7', prompt: 'Where?', answer: ['', 3] },
      { type: 'orderedPair', questionId: 'p8', prompt: 'Where?', answer: { x: 1, y: 2 } },
    ] }],
  });
  docs.set('assignments/B-clean', { title: 'Clean', schemaVersion: 5, archived: true, sections: [{ role: 'dol', questions: [{ type: 'orderedPair', answer: [0, 0] }] }] });
  docs.set('assignments/C-legacy', { title: 'Flat', questions: [{ type: 'orderedPair', answer: '(4, -1)', activityRole: 'classwork' }] });
  docs.set('grades/S1', { displayName: 'never read', gradesByAssignment: { 'A-pairs': {} } });
  return readOnlyStore(docs);
};

test('the store refuses writes, so the report test below would catch one', () => {
  const { db, attempts } = seeded();
  assert.throws(() => db.collection('assignments').doc('a').set({}), /write refused/);
  assert.throws(() => db.batch(), /write refused/);
  assert.equal(attempts.length, 2);
});

test('each key is classified the way the grader now reads it', () => {
  assert.equal(orderedPairKeyKind({ answer: '(2,3)' }), 'textPairNowGraded');
  assert.equal(orderedPairKeyKind({ solution: '(1/2, -3)' }), 'textPairNowGraded');
  assert.equal(orderedPairKeyKind({ answer: [2, 3] }), 'arrayKey');
  // Every shape through the grader's reader (review S4).
  assert.equal(orderedPairKeyKind({ answer: ['', 3] }), 'arrayNotAPair');
  assert.equal(orderedPairKeyKind({ answer: [2, 3, 4] }), 'arrayNotAPair');
  assert.equal(orderedPairKeyKind({ answer: ['a', 'b'] }), 'arrayNotAPair');
  assert.equal(orderedPairKeyKind({ answer: { x: 2, y: 3 } }), 'objectKey');
  assert.equal(orderedPairKeyKind({ answer: 'none' }), 'textNotAPair');
  assert.equal(orderedPairKeyKind({ answer: '(1,2,3)' }), 'textNotAPair');
  assert.equal(orderedPairKeyKind({}), 'noKey');
});

test('the report counts text pair keys in sections, variants and legacy lists; reads assignments only, masked; never a write', async () => {
  const { db, attempts, reads, masks } = seeded();
  const report = await runOrderedPairTextKeysReport({ db, pageSize: 1, now: () => Date.UTC(2026, 9, 19, 12) });
  assert.equal(report.readOnly, true);
  assert.deepEqual(report.totals, {
    assignmentsRead: 3, textPairNowGraded: 3, textNotAPair: 1, arrayKey: 3, arrayNotAPair: 1, objectKey: 1, noKey: 1,
    assignmentsWithTextKeys: 2, assignedWithTextKeys: 1, assignmentsWithRefusedKeys: 1,
  });
  assert.deepEqual(report.assignments.map((entry) => entry.assignmentId), ['A-pairs', 'C-legacy']);
  assert.deepEqual(report.assignments[0].questions.map(({ questionId, variant, kind, key }) => ({ questionId, variant, kind, key })), [
    { questionId: 'p1', variant: null, kind: 'textPairNowGraded', key: '(2,3)' },
    { questionId: 'p3', variant: null, kind: 'textNotAPair', key: 'none' },
    { questionId: 'p5', variant: 0, kind: 'textPairNowGraded', key: '(1/2, 4)' },
    { questionId: 'p7', variant: null, kind: 'arrayNotAPair', key: ['', 3] },
    { questionId: 'p8', variant: null, kind: 'objectKey', key: { x: 1, y: 2 } },
  ]);
  assert.deepEqual(attempts, []);
  assert.ok(reads.every((name) => name === 'assignments'), reads.join());
  assert.ok(masks.length && masks.every(([, fields]) => JSON.stringify(fields) === JSON.stringify(ASSIGNMENT_FIELDS)));
  assert.doesNotMatch(JSON.stringify(report), /per-student-secret|never read/);
  const named = await runOrderedPairTextKeysReport({ db, assignmentIds: ['C-legacy', 'gone'] });
  assert.deepEqual(named.missingAssignments, ['gone']);
  assert.equal(named.totals.textPairNowGraded, 1);
});

test('the script has no write mode, no Firestore write call, and writes only under release-reports/ (gitignored)', () => {
  const source = executableSource(readFileSync(path.join(repo, 'scripts/report-ordered-pair-text-keys.mjs'), 'utf8'))
    .replace(/\bapp\.delete\(\)/g, 'app-close()');
  assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/);
  assert.doesNotMatch(source, /--execute|--write|--apply|--out\b/);
  assert.equal((source.match(/writeFileSync\(/g) || []).length, 1, 'one local file write');
  assert.match(source, /export const REPORT_DIR = 'release-reports';/);
  assert.match(readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^release-reports$/m);
  assert.throws(() => parseReportArgs(['--project', 'p', '--execute']), /no write mode/);
  assert.throws(() => parseReportArgs(['--assignment', 'a']), /--project is required/);
});

// --- recorded answers whose verdict would change -----------------------------

const { runGraderGaps2RegradeReport, parseReportArgs: parseRegradeArgs, wave7Rule, EVIDENCE_FIELDS } = await import('../../scripts/report-grader-gaps-2-regrade.mjs');
const { createRequire } = await import('node:module');
const functionsRequire = createRequire(new URL('../../functions/package.json', import.meta.url));
const mathPath = functionsRequire('./lib/mathPath.js');
const { storableItem } = functionsRequire('./lib/secureItemStorage.js');

const evidenceDoc = (response, isCorrect, extra = {}) => ({ evidence: { submittedResponse: response, automaticResult: { graded: true, isCorrect }, submittedAt: '2026-10-01T12:00:00Z', ...extra } });
const fieldsResponse = (values) => ({ kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value, isComplete: true })) });
const scalarResponse = (value) => ({ kind: 'scalar', type: 'orderedPair', value, fields: [] });

const regradeSeed = () => {
  const docs = new Map();
  docs.set('assignments/A1', {
    schemaVersion: 5,
    studentOverrides: { S1: 'per-student-secret' },
    sections: [{ role: 'practice', questions: [
      { type: 'multiAnswer', questionId: 'q0', answerFields: [{ id: 'v', label: 'Value', answer: '7/2', inputProfile: 'number' }] },
      { type: 'multiAnswer', questionId: 'q1', answerFields: [{ id: 'v', label: 'Value', answer: '1.5', inputProfile: 'number' }] },
      { type: 'orderedPair', questionId: 'q2', prompt: 'Where?', answer: '(2,3)' },
      { type: 'multiAnswer', questionId: 'q3', answerFields: [{ id: 'v', label: 'Value', answer: '4' }] },
      // A family slot's key is drawn per student: the stored template is not it.
      { type: 'multiAnswer', questionId: 'q4', questionFamily: { id: 'fam' }, answerFields: [{ id: 'v', label: 'Value', answer: '5' }] },
      // A fraction drill draws its sum on the device; an authored one is keyed.
      { type: 'fraction', questionId: 'q5', prompt: 'Add.' },
      { type: 'fraction', questionId: 'q6', prompt: 'Simplify 14/4.', answer: '7/2' },
    ] }],
  });
  docs.set('grades/S1', { displayName: 'never read' });
  docs.set('grades/S1/responseInspectionEvidence/A1__q0', evidenceDoc(fieldsResponse({ v: '3\\frac{1}{2}' }), false));
  docs.set('grades/S1/responseInspectionEvidence/A1__q1', evidenceDoc(fieldsResponse({ v: '3\\frac{1}{2}' }), true));
  docs.set('grades/S1/responseInspectionEvidence/A1__q2', evidenceDoc(scalarResponse('(2,3)'), false));
  docs.set('grades/S1/responseInspectionEvidence/A1__q3', evidenceDoc(fieldsResponse({ v: '4' }), true));
  docs.set('grades/S1/responseInspectionEvidence/A1__q4', evidenceDoc(fieldsResponse({ v: '4' }), false));
  docs.set('grades/S1/responseInspectionEvidence/A1__q5', evidenceDoc({ kind: 'scalar', type: 'fraction', value: '1/2', fields: [] }, false));
  // A mixed number with a reduced fraction part is in lowest terms since GR13
  // (the owner, 2026-10-23): recorded wrong, it moves up, by the mixed-number rule.
  docs.set('grades/S1/responseInspectionEvidence/A1__q6', evidenceDoc({ kind: 'scalar', type: 'fraction', value: '3\\frac{1}{2}', fields: [] }, false));
  const grading = mathPath.privateGradingDefinition({ responseFields: [{ id: 'answer', inputProfile: 'number', expected: 'sqrt(8)/2' }] });
  docs.set('examSessions/E1', {
    studentId: 'S2',
    responses: {
      i1: { grading: { isCorrect: false }, responsePayload: { responses: { answer: '\\sqrt{2}' } } },
      i2: { grading: { isCorrect: false }, responsePayload: { responses: { answer: '1.41' } } },
      i3: { unanswered: true, grading: { isCorrect: false } },
    },
  });
  docs.set('examSessions/E1/items/i1', { item: storableItem({ questionInstanceId: 'i1', privateGrading: grading }) });
  docs.set('examSessions/E1/items/i2', { item: storableItem({ questionInstanceId: 'i2', privateGrading: grading }) });
  const recap = (value, key, isCorrect) => JSON.stringify({ grading: { isCorrect }, response: { kind: 'fields', entries: [{ label: 'Answer', value, format: 'math' }] }, correctAnswer: [{ label: 'Answer', value: key, format: 'rich' }] });
  docs.set('pathSubmissions/P1', { studentId: 'S3', createdAt: 1, recapJson: recap('\\frac{1}{2}\\pi', 'pi/2', false) });
  docs.set('pathSubmissions/P2', { studentId: 'S3', createdAt: 2, recapJson: recap('5', '5', true) });
  docs.set('pathSubmissions/P3', { studentId: 'S3', createdAt: 3 });
  // A recap whose answer and key do not name the same field cannot be paired.
  docs.set('pathSubmissions/P4', { studentId: 'S3', createdAt: 4, recapJson: JSON.stringify({ grading: { isCorrect: false }, response: { kind: 'fields', entries: [{ label: 'Slope', value: '2' }] }, correctAnswer: [{ label: 'Answer', value: '2' }] }) });
  return readOnlyStore(docs);
};

test('the regrade count: per surface, up and down by the wave-7 rule that explains it; reads masked; never a write', async () => {
  const { db, attempts, reads, masks } = regradeSeed();
  const report = await runGraderGaps2RegradeReport({ db, pageSize: 2, now: () => Date.UTC(2026, 9, 19) });
  assert.equal(report.readOnly, true);
  const { assignments, secure, path: pathCounts } = report.totals;
  assert.deepEqual([assignments.read, assignments.regraded, assignments.notRegradable, assignments.unchanged], [7, 5, 2, 1]);
  assert.equal(assignments.up.mixedNumber, 2, '3½ for 7/2, recorded wrong, in a number box and on a lowest-terms fraction question (GR13)');
  assert.equal(assignments.down.mixedNumber, 1, '3½ for 1.5, recorded right: listed, never applied (D8)');
  assert.equal(assignments.up.textPairKey, 1, '(2,3) for the text key (2,3)');
  assert.deepEqual([secure.read, secure.regraded, secure.up.exactNumber, secure.unchanged], [2, 2, 1, 1]);
  assert.deepEqual([pathCounts.read, pathCounts.regraded, pathCounts.notRegradable, pathCounts.up.halfPi, pathCounts.unchanged], [3, 2, 1, 1, 1]);
  assert.match(report.notCountable.liveChallenge, /no response is stored/);
  assert.deepEqual(report.changes.map(({ surface, direction, rule }) => `${surface} ${direction} ${rule}`).sort(), [
    'assignments down mixedNumber', 'assignments up mixedNumber', 'assignments up mixedNumber', 'assignments up textPairKey', 'path up halfPi', 'secure up exactNumber',
  ]);
  assert.deepEqual(attempts, []);
  assert.ok(reads.every((name) => ['group:responseInspectionEvidence', 'examSessions', 'pathSubmissions', 'getAll'].includes(name)), reads.join());
  assert.ok(masks.some(([label, fields]) => label === 'group:responseInspectionEvidence' && JSON.stringify(fields) === JSON.stringify(EVIDENCE_FIELDS)));
  assert.doesNotMatch(JSON.stringify(report), /per-student-secret|never read/);
  const onlyPath = await runGraderGaps2RegradeReport({ db, surfaces: ['path'] });
  assert.deepEqual(onlyPath.surfaces, ['path']);
});

test('the rule tags read the response and the key, never a guess', () => {
  assert.equal(wave7Rule({ response: '-3 1/2', key: '-7/2' }), 'mixedNumber');
  // A key written as a mixed number (review S5): 7/2 up, 31/2 down.
  assert.equal(wave7Rule({ response: '7/2', key: '3 1/2' }), 'mixedNumber');
  assert.equal(wave7Rule({ response: '\\frac{31}{2}', key: '3\\frac{1}{2}' }), 'mixedNumber');
  assert.equal(wave7Rule({ response: '\\frac{3}{4}\\pi', key: '3pi/4' }), 'halfPi');
  assert.equal(wave7Rule({ response: '\\sqrt{2}', key: 'sqrt(8)/2', field: { inputProfile: 'number' } }), 'exactNumber');
  assert.equal(wave7Rule({ response: '\\sqrt{2}', key: 'sqrt(8)/2', field: { inputProfile: 'expression' } }), 'other');
  assert.equal(wave7Rule({ response: '(2,3)', key: '(2,3)', question: { type: 'orderedPair', answer: '(2,3)' } }), 'textPairKey');
});

test('the regrade script has no write mode, no Firestore write call, and writes only under release-reports/', () => {
  const source = executableSource(readFileSync(path.join(repo, 'scripts/report-grader-gaps-2-regrade.mjs'), 'utf8'))
    .replace(/\bapp\.delete\(\)/g, 'app-close()')
    // Not Firestore: the in-memory Map of assignments read once each.
    .replace(/\bassignments\.set\(/g, 'map-set(');
  assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/);
  assert.doesNotMatch(source, /--execute|--write|--apply|--out\b/);
  assert.equal((source.match(/writeFileSync\(/g) || []).length, 1, 'one local file write');
  assert.throws(() => parseRegradeArgs(['--project', 'p', '--execute']), /no write mode/);
  assert.throws(() => parseRegradeArgs(['--project', 'p', '--surface', 'live']), /--surface must be one of/);
});
