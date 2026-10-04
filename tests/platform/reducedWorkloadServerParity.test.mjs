// THE CLOUD FUNCTIONS COUNT THE SAME ITEMS THE STUDENT SEES.
//
// A reduced-item-count accommodation narrows a student's required items
// (functions/shared/reducedWorkload.mjs). The browser reads it through
// assignmentLifecycle.js studentRequiredQuestions; every server path that
// turns a tracker into a denominator — Classroom passback (whole assignment
// and section columns), the classwork completion rule that opens the next
// assignment, the DOL projection, Recovery — filters its own indices with
// functions/lib/studentWorkloadIndices.js. These tests prove the two sides
// agree, and that each server site is actually wired (AGENTS.md: a call with
// no import passes every other gate).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { region, executableSource } from './helpers/sourceContract.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { evaluateClassworkCompletionRule } from '../../functions/shared/assignmentProjections.mjs';
import { studentOmittedIndices } from '../../functions/shared/reducedWorkload.mjs';
import { practicePassWaivedIndices, studentRequiredQuestions } from '../../src/assignmentLifecycle.js';

const require = createRequire(import.meta.url);
const { runtimeIncludedQuestionIndices, runtimeIncludedQuestionIndicesForSection } = require('../../functions/lib/assignmentRuntime.js');
const { studentOmittedFor, studentRequiredIndices } = require('../../functions/lib/studentWorkloadIndices.js');
const { classroomPublicationGrade } = require('../../functions/lib/classroomSectionGrade.js');

const ID = 'reduced-item-count-same-rigor';
let n = 0;
const q = (standard, extra = {}) => { n += 1; return { questionId: `sq${n}`, type: 'numeric', prompt: 'Solve.', standard, dok: 2, ...extra }; };
const lesson = () => ({
  id: 'LESSON-1',
  schemaVersion: 5,
  dueAt: '2026-10-08',
  sections: [
    { id: 'w', role: 'warmup', questions: [q('A.2A'), q('A.2A'), q('A.2A')] },
    { id: 'c', role: 'classwork', questions: Array.from({ length: 10 }, (_, i) => q(i % 2 ? 'A.5A' : 'A.5B')) },
    { id: 'p', role: 'practice', questions: Array.from({ length: 10 }, (_, i) => q(i % 2 ? 'A.5A' : 'A.5B')) },
    { id: 'd', role: 'dol', questions: [q('A.5A'), q('A.5A'), q('A.5B'), q('A.5B')] },
  ],
});
const profileAt = (percent) => buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17',
    accommodations: [{ id: ID, params: { itemReduction: { mode: 'percent', value: percent } }, appliesTo: [] }],
    modifications: [],
  }],
  todayKey: '2026-10-01',
});

// The server reads the stored document (no id field; the id is the doc id).
const storedDocument = (assignment) => { const { id, ...data } = assignment; return data; };
const sorted = (values) => [...values].map(Number).sort((a, b) => a - b);

test('parity: the server\'s whole-assignment and section denominators equal the student\'s own items', async () => {
  const assignment = lesson();
  for (const percent of [25, 50]) {
    const profile = profileAt(percent);
    for (const hasPracticePass of [false, true]) {
      const browser = studentRequiredQuestions({ assignment, profile, hasPracticePass }).indices;
      const gradeData = { profile, gradesByAssignment: {} };
      const omitted = await studentOmittedFor({ assignment: storedDocument(assignment), gradeData, assignmentId: assignment.id });
      const waived = new Set(hasPracticePass ? practicePassWaivedIndices(assignment) : []);
      const server = studentRequiredIndices(runtimeIncludedQuestionIndices(assignment).filter((index) => !waived.has(index)), omitted);
      assert.deepEqual(sorted(server), sorted(browser), `${percent}% / pass=${hasPracticePass}`);
      for (const section of ['warmup', 'classwork', 'practice', 'dol']) {
        const serverSection = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, section), omitted)
          .filter((index) => !waived.has(index));
        const browserSection = browser.filter((index) => runtimeIncludedQuestionIndicesForSection(assignment, section).includes(index));
        assert.deepEqual(sorted(serverSection), sorted(browserSection), `${section} ${percent}%`);
      }
    }
  }
});

test('parity holds after answers: the attempt being recorded counts as answered work', async () => {
  const assignment = lesson();
  const profile = profileAt(25);
  const plan = studentOmittedIndices({ assignment, profile });
  const omittedIndex = [...plan][0];
  // A queued response to an item the plan would omit (the support was switched
  // on after the student answered it offline) is accepted and becomes required.
  const gradeData = { profile, gradesByAssignment: {} };
  const whileIngesting = await studentOmittedFor({ assignment: storedDocument(assignment), gradeData, assignmentId: assignment.id, answeredIndex: omittedIndex });
  assert.ok(!whileIngesting.has(omittedIndex));
  const tracker = { [omittedIndex]: { status: 'correct' } };
  const browserAfter = studentRequiredQuestions({ assignment, profile, tracker }).indices;
  const serverAfter = studentRequiredIndices(runtimeIncludedQuestionIndices(assignment), whileIngesting);
  assert.deepEqual(sorted(serverAfter), sorted(browserAfter));
});

test('the classwork completion rule opens the next assignment when the student\'s own classwork is done', async () => {
  const assignment = lesson();
  const profile = profileAt(50);
  const omitted = await studentOmittedFor({ assignment: storedDocument(assignment), gradeData: { profile }, assignmentId: assignment.id });
  const allClasswork = runtimeIncludedQuestionIndicesForSection(assignment, 'classwork');
  const required = studentRequiredIndices(allClasswork, omitted);
  assert.ok(required.length < allClasswork.length && required.length > 0);
  const tracker = Object.fromEntries(required.map((index) => [index, { status: 'correct' }]));
  const rule = { minEngagementMinutes: 0, minimumQuestionCompletionPercent: 80 };
  assert.equal(evaluateClassworkCompletionRule({ classworkIndices: required, assignmentTracker: tracker, totalTimeSeconds: 600, completionRule: rule }).met, true);
  // Counting the omitted items as missing would have kept the gate shut.
  assert.equal(evaluateClassworkCompletionRule({ classworkIndices: allClasswork, assignmentTracker: tracker, totalTimeSeconds: 600, completionRule: rule }).met, false);
});

test('no support, a malformed profile, or a failure: the server grades every included item', async () => {
  const assignment = lesson();
  assert.equal((await studentOmittedFor({ assignment, gradeData: {}, assignmentId: assignment.id })).size, 0);
  assert.equal((await studentOmittedFor({ assignment, gradeData: { profile: { accommodations: [ID] } }, assignmentId: assignment.id })).size, 0, 'legacy bare support: recorded only');
  assert.equal((await studentOmittedFor({ assignment, gradeData: { profile: 'nonsense' }, assignmentId: assignment.id })).size, 0);
  let reported = null;
  const broken = { profile: profileAt(25), get gradesByAssignment() { throw new Error('boom'); } };
  const omitted = await studentOmittedFor({ assignment, gradeData: broken, assignmentId: assignment.id, onError: (error) => { reported = error; } });
  assert.equal(omitted.size, 0);
  assert.match(String(reported?.message), /boom/);
  // A list is never emptied.
  assert.deepEqual(studentRequiredIndices([3, 4], new Set([3, 4])), [3, 4]);
  assert.deepEqual(studentRequiredIndices([3, 4, 5], new Set([4])), [3, 5]);
});

test('a Classroom section column is graded over the student\'s required items', () => {
  const assignment = lesson();
  const classwork = runtimeIncludedQuestionIndicesForSection(assignment, 'classwork');
  const omitted = new Set(classwork.slice(0, 2));
  const gradeProgress = (tracker, indices) => ({ total: indices.length, attempted: indices.filter((i) => tracker[i]).length, grade: 100 });
  const graded = classroomPublicationGrade({ assignment, publication: { sectionKey: 'classwork' }, tracker: {}, questions: [], gradeProgress, omittedIndices: omitted });
  assert.equal(graded.total, classwork.length - 2);
  assert.ok(graded.questionIndices.every((index) => !omitted.has(index)));
  const unchanged = classroomPublicationGrade({ assignment, publication: { sectionKey: 'classwork' }, tracker: {}, questions: [], gradeProgress });
  assert.equal(unchanged.total, classwork.length);
  const guarded = classroomPublicationGrade({ assignment, publication: { sectionKey: 'classwork' }, tracker: {}, questions: [], gradeProgress, omittedIndices: new Set(classwork) });
  assert.equal(guarded.total, classwork.length, 'never an empty column');
});

// --- Every server site is wired -----------------------------------------------------------

const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const sectionEntry = readFileSync(new URL('../../functions/classroomSectionEntry.js', import.meta.url), 'utf8');
const recoveryLib = readFileSync(new URL('../../functions/lib/sectionRecoveryGrades.js', import.meta.url), 'utf8');

test('functions/index.js loads the helper once and filters at every grade/completion site', () => {
  const code = executableSource(index);
  assert.match(code, /const studentWorkloadIndices = require\("\.\/lib\/studentWorkloadIndices"\);/);
  assert.match(code, /const \{ studentRequiredIndices \} = studentWorkloadIndices;/);
  const sites = [
    ['async function finalizeOneResponseCheckpoint(', 'function ', 'checkpoint finalizer'],
    ['async function ingestOneSubmission(', '\nexports.', 'ingestion'],
    ['exports.advanceSectionRecovery = onCall(', '\nexports.', 'Recovery'],
    ['exports.resolveHeldSectionRecovery = onCall(', '\nexports.', 'held Recovery resolution'],
    ['exports.overrideStudentResponseGrade = onCall(', '\nexports.', 'teacher response override'],
    ['exports.reconcileAssignmentActivityProjection = onCall(', '\nexports.', 'classwork reconcile'],
  ];
  sites.forEach(([start, end, label]) => {
    const body = executableSource(region(index, start, end, label));
    assert.match(body, /await studentOmittedFor\(\{[^}]*assignment,\s*gradeData/, `${label} resolves the omission`);
    assert.match(body, /studentRequiredIndices\(runtimeIncludedQuestionIndicesForSection\(assignment, "(classwork|warmup|dol)"\)|studentRequiredIndices\(runtimeIncludedQuestionIndicesForSection\(assignment, section\)/, `${label} filters its section indices`);
  });
  const ingestion = executableSource(region(index, 'async function ingestOneSubmission(', '\nexports.', 'ingestion'));
  assert.match(ingestion, /const resetsRecord = ingestion\.envelopeResetsRecord\(\{ envelope, canonicalRecord \}\);/);
  assert.match(ingestion, /answeredIndex: resetsRecord \? null : envelope\.questionIndex,/, 'the attempt being recorded counts as answered');
  assert.match(ingestion, /resetIndex: resetsRecord \? envelope\.questionIndex : null,/, 'an authorized replacement reads as reset');
  const sync = executableSource(region(index, 'exports.syncGradeToClassroom', 'exports.queueReleasedAssessmentGrades', 'whole-assignment passback'));
  assert.match(sync, /questionIndices = studentRequiredIndices\(questionIndices, studentOmitted\);/);
  assert.match(sync, /omittedIndices: studentOmitted,/, 'recovered sections use the same items');
  assert.match(sync, /canonicalAttempted,/, 'persistence safety keeps its full count');
});

test('section passback and recovery originals thread the omitted set', () => {
  assert.match(executableSource(sectionEntry), /const \{ studentOmittedFor \} = require\("\.\/lib\/studentWorkloadIndices"\);/);
  const sync = executableSource(region(sectionEntry, 'const syncSectionGradeToClassroom = onDocumentWritten(', '\nconst ', 'section passback'));
  assert.match(sync, /const studentOmitted = await studentOmittedFor\(/);
  assert.equal((sync.match(/omittedIndices: studentOmitted,/g) || []).length, 2, 'recovery originals and the column grade');
  assert.match(executableSource(recoveryLib), /studentRequiredIndices\(runtimeIncludedQuestionIndicesForSection\(assignment, section\), omittedIndices\)/);
});
