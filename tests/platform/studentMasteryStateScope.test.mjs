import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordQuestionAttempt } from '../../src/attemptPolicy.js';
import { buildUnifiedMasteryProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { loadStudentMasteryState, masteryAssignmentScope } from '../../src/platform/mastery/studentMasteryState.js';
import {
  individuallyAssignedTestCycleIds, markIndividuallyAssigned, mergeStudentAssignments,
  priorWorkAssignmentIds, studentScopedAssignment,
} from '../../src/platform/assignments/studentAssignmentScope.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * D10 Phase 0, P0-1: My Math Path's mastery read no longer lists the whole
 * `assignments` collection (docs/handoffs/ANSWER_KEY_SERVER_SIDE_DESIGN.md §3).
 *
 * Proven here on fixtures, by behaviour:
 *   - without supplied assignments, the loader asks for the STUDENT-SCOPED set
 *     (their class, their recorded work, a Test they were added to), built
 *     from their own grade document — and for nothing else;
 *   - the mastery it shows is exactly what the whole-collection read showed;
 *   - another class's assignment never reaches the builder;
 *   - supplied assignments (the live app's path) are used as they are.
 * The Firestore half — that this scoped read is allowed by the rules with
 * both read-scope switches on — is in tests/rules/assignmentPrivacyRules.test.mjs.
 */

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

const question = (code, dok = 2) => ({
  type: 'algebra',
  alignments: [{ framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' }],
  dok,
});

// Real attempt records through the real attempt policy.
const records = (outcomes) => Object.fromEntries(outcomes.map((isCorrect, index) => {
  let record = recordQuestionAttempt({ record: null, isCorrect }).record;
  if (!isCorrect) record = recordQuestionAttempt({ record, isCorrect: false }).record;
  return [index, record];
}));

// The whole collection, as the old read returned it (document-id order).
const WORLD = {
  'a-own-graded': { title: 'Own class, worked', assignedClassIds: ['class-a'], dueAt: '2026-10-05', questions: [question('A.5A'), question('A.5A', 3), question('A.2B')] },
  'b-own-unworked': { title: 'Own class, not started', assignedClassIds: ['class-a'], dueAt: '2026-10-01', questions: [question('A.3C')] },
  'c-earlier-class': { title: 'Before the class move', assignedClassIds: ['class-old'], dueAt: '2026-09-01', questions: [question('A.7A'), question('A.7A')] },
  'd-other-class': { title: 'Another class', assignedClassIds: ['class-b'], dueAt: '2026-10-02', questions: [question('A.9C')] },
  'e-other-class-key': { title: 'Another class, keyed', assignedClassIds: ['class-b'], dueAt: '2026-10-03', questions: [question('A.5A')], studentOverrides: { S_B: { lateDueAt: '2026-10-09' } } },
  't-individual-test': { title: 'Test, added on their own', assignedClassIds: [], dueAt: '2026-10-07', questions: [question('A.6A')] },
};
const wholeCollection = () => Object.keys(WORLD).sort().map((id) => ({ id, ...structuredClone(WORLD[id]) }));

const GRADE = {
  classId: 'class-a',
  classPeriod: 'Period 1',
  gradesByAssignment: {
    'a-own-graded': records([true, false, true]),
    'c-earlier-class': records([true, true]),
    't-individual-test': records([false]),
  },
  testCycleGrades: { 't-individual-test': { individuallyAssigned: true } },
};

/*
 * The student-scoped read with the real pure scope helpers
 * (studentAssignmentScope.js): the class query's result, prior work and the
 * individually-assigned Test by id, each reduced to this student's view. Only
 * the Firestore query itself is stood in for (proven on the emulator).
 */
const scopedRead = (calls) => async ({ studentId, classId, gradesByAssignment, testCycleGrades }) => {
  calls.push({ studentId, classId, gradesByAssignment, testCycleGrades });
  const all = wholeCollection();
  const classAssignments = all.filter((entry) => entry.assignedClassIds.includes(classId))
    .map(({ id, ...data }) => studentScopedAssignment(id, data, studentId));
  const individual = individuallyAssignedTestCycleIds(testCycleGrades);
  const ids = priorWorkAssignmentIds({ gradesByAssignment, loadedIds: classAssignments.map((entry) => entry.id), extraIds: individual });
  const prior = markIndividuallyAssigned(all.filter((entry) => ids.includes(entry.id))
    .map(({ id, ...data }) => studentScopedAssignment(id, data, studentId)), individual);
  return mergeStudentAssignments(classAssignments, prior);
};

const readsFor = ({ grade = GRADE, calls = [] } = {}) => ({
  grade: async () => (grade ? structuredClone(grade) : null),
  retention: async () => ({ schedules: { 'A.5A': { status: 'due' } } }),
  serverMastery: async () => null,
  scopedAssignments: scopedRead(calls),
});

test('without supplied assignments, the read is scoped to the student — built from their own grade document, once', async () => {
  const calls = [];
  const state = await loadStudentMasteryState('S_A', { reads: readsFor({ calls }) });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    studentId: 'S_A',
    classId: 'class-a',
    gradesByAssignment: GRADE.gradesByAssignment,
    testCycleGrades: GRADE.testCycleGrades,
  });
  // Their class (worked or not), their earlier class's work, their own Test —
  // and no other class's assignment, in document-id order.
  assert.deepEqual(state.fallbackInputs.assignments.map((entry) => entry.id),
    ['a-own-graded', 'b-own-unworked', 'c-earlier-class', 't-individual-test']);
  assert.ok(!state.fallbackInputs.assignments.some((entry) => 'studentOverrides' in entry && entry.studentOverrides?.S_B),
    'no classmate controls ride in');
});

test('the mastery shown is exactly what the whole-collection read showed', async () => {
  const state = await loadStudentMasteryState('S_A', { reads: readsFor() });
  const student = { id: 'S_A', ...structuredClone(GRADE) };
  const before = buildUnifiedMasteryProfiles({
    student,
    assignments: wholeCollection(),
    serverProfiles: {},
    retentionSchedulesByTEKS: { 'A.5A': { status: 'due' } },
  });
  // Not a vacuous equality: the class's work, the earlier class's work and the
  // individual Test each contribute a skill.
  for (const code of ['A.5A', 'A.2B', 'A.7A', 'A.6A']) assert.ok(before[code], `fixture has evidence for ${code}`);
  assert.deepEqual(state.masteryProfilesByTEKS, before);
  assert.deepEqual(state.retentionSchedulesByTEKS, { 'A.5A': { status: 'due' } });
  assert.deepEqual(state.fallbackInputs.student, student);
  // The live re-derivation (MyMathPathApp liveMasteryData) builds from the
  // same inputs and agrees with the whole-collection build too.
  assert.deepEqual(
    buildUnifiedMasteryProfiles({ ...state.fallbackInputs, serverProfiles: {}, retentionSchedulesByTEKS: state.retentionSchedulesByTEKS }),
    before,
  );
});

test('supplied assignments (the live app hands its own) are used as they are and nothing is read for them', async () => {
  const calls = [];
  const supplied = [{ id: 'a-own-graded', ...structuredClone(WORLD['a-own-graded']) }];
  const state = await loadStudentMasteryState('S_A', { assignments: supplied, reads: readsFor({ calls }) });
  assert.equal(calls.length, 0);
  assert.equal(state.fallbackInputs.assignments, supplied);
  assert.ok(state.masteryProfilesByTEKS['A.5A']);
  assert.equal(state.masteryProfilesByTEKS['A.7A'], undefined);
});

test('a student with no grade document asks for no class and no work, and no student means no reads', async () => {
  const calls = [];
  const state = await loadStudentMasteryState('S_NEW', { reads: readsFor({ grade: null, calls }) });
  assert.deepEqual(calls, [{ studentId: 'S_NEW', classId: null, gradesByAssignment: {}, testCycleGrades: {} }]);
  assert.deepEqual(state.fallbackInputs.assignments, []);
  assert.deepEqual(state.fallbackInputs.student, { id: 'S_NEW' });
  assert.deepEqual(masteryAssignmentScope('x', { classId: 'c', gradesByAssignment: null }).gradesByAssignment, {});
  const none = await loadStudentMasteryState('', { reads: null });
  assert.deepEqual(none, { masteryProfilesByTEKS: {}, retentionSchedulesByTEKS: {} });
});

test('the service wires the scoped read and never lists the assignments collection', () => {
  const service = executableSource(read('src/services/masteryStateService.js'));
  assert.doesNotMatch(service, /\bcollection\s*\(/, 'no collection read at all: a list is how the whole collection reached a device');
  assert.doesNotMatch(service, /\bgetDocs\s*\(/);
  const scoped = region(service, 'scopedAssignments: (', '}),', 'the scoped read');
  assert.match(scoped, /fetchStudentAssignments\(\{/);
  assert.match(scoped, /classId,/);
  assert.match(scoped, /gradesByAssignment,/);
  assert.match(scoped, /individualAssignmentIds: individuallyAssignedTestCycleIds\(testCycleGrades\)/);
  assert.match(service, /import \{ fetchStudentAssignments, individuallyAssignedTestCycleIds \} from '..\/platform\/assignments\/studentAssignmentScope.js';/);
  assert.match(service, /export const fetchStudentMasteryState = \(studentId, \{ assignments = null \} = \{\}\) => loadStudentMasteryState\(studentId, \{\s*assignments,/);
});
