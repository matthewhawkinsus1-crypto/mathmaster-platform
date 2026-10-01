// Case review exports: the underlying factual data, formula-safe, without
// response text or answer keys, and teacher next steps labelled as theirs.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRINT_SECTIONS, TEACHER_AUTHORED_LABEL, caseAssignmentsCsv, caseFactsCsv, caseQuestionsCsv, caseReviewFileName, caseReviewJson, gradeItemLabel,
} from '../../src/platform/caseReview/caseReviewExport.js';
import { buildStudentCaseReview } from '../../src/platform/caseReview/studentCaseReview.js';
import { assignments, caseInputs } from './helpers/caseReviewFixture.mjs';

const model = buildStudentCaseReview(caseInputs());

test('the print outline is exactly the twelve sections the brief lists, in order', () => {
  assert.deepEqual(PRINT_SECTIONS.map((section) => section.key), [
    'overview', 'academic', 'grades', 'sections', 'dol', 'skills', 'attempts', 'completion', 'supports', 'gaps', 'facts', 'nextSteps',
  ]);
});

test('the assignment CSV has one row per real instance with every contribution column', () => {
  const lines = caseAssignmentsCsv(model).trim().split('\r\n');
  assert.equal(lines.length, 1 + model.assignments.length);
  assert.match(lines[0], /^Assignment,Assignment ID,Type,Category \/ weight,Assigned,Class due,Individualized due,Final cutoff for this student,/);
  assert.ok(lines[0].includes('MathMaster grade contribution'));
  assert.ok(lines[0].includes('Changed since export'));
  assert.ok(lines.some((line) => line.includes(',L2,') && line.includes('Changed since export')));
});

test('the question CSV carries attempts and provenance, never a response or an answer key', () => {
  const text = caseQuestionsCsv(model);
  const lines = text.trim().split('\r\n');
  assert.equal(lines.length, 1 + model.questions.length);
  assert.ok(lines[0].includes('Attempt 1,Attempt 2,Attempt 3'));
  // The synthetic prompts stand in for question content: none of it leaves.
  assert.doesNotMatch(text, /Prompt L\d-/);
  assert.doesNotMatch(text, /acceptedAnswers|correctAnswer/);
});

test('a hostile title cannot become a spreadsheet formula', () => {
  const hostile = buildStudentCaseReview(caseInputs({ assignments: assignments.map((assignment) => (assignment.id === 'L1' ? { ...assignment, title: '=HYPERLINK("http://x")' } : assignment)) }));
  assert.ok(caseAssignmentsCsv(hostile).includes(`"'=HYPERLINK(""http://x"")"`));
});

test('facts export with how each is known; next steps are labelled teacher-authored in JSON', () => {
  const facts = caseFactsCsv(model);
  assert.match(facts, /Derived from platform records/);
  const json = JSON.parse(caseReviewJson(model, { nextSteps: 'Reteach A.3C in small group (synthetic).' }));
  assert.equal(json.teacherEnteredNextSteps.label, TEACHER_AUTHORED_LABEL);
  assert.equal(JSON.parse(caseReviewJson(model)).teacherEnteredNextSteps, null);
  assert.equal(caseReviewFileName(model, 'questions', 'csv').startsWith('MathMaster-case-review_S920001_'), true);
});

test('a grade contribution reads as what it is', () => {
  assert.equal(gradeItemLabel({ state: 'graded', grade: 85 }), '85');
  assert.equal(gradeItemLabel({ state: 'partial-open', grade: 40 }), '40 so far');
  assert.equal(gradeItemLabel({ state: 'not-started', grade: 0 }), 'Not started', 'an open, unanswered section is not a 0');
  assert.equal(gradeItemLabel({ state: 'no-answers-closed', grade: 0 }), '0 (no answers)', 'a closed one says why it is 0');
  assert.equal(gradeItemLabel({ state: 'no-answers-closed', grade: null }), 'No answers');
  assert.equal(gradeItemLabel({ state: 'excused', excused: true, grade: null }), 'Excused');
});
