import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssignmentWorksheetModel,
  printableQuestionFromResolved,
  worksheetFileName,
} from '../../src/platform/resources/assignmentWorksheetPdfModel.js';

test('printable question exposes student-facing content but strips answers and grading internals', () => {
  const raw = {
    prompt: 'Solve $2x+3=11$.',
    type: 'algebra',
    choices: [
      { label: 'A', text: '$x=3$', isCorrect: false, value: '3' },
      { label: 'B', text: '$x=4$', isCorrect: true, value: '4' },
    ],
    context: { scenario: 'A balance model is shown.', scaffold: { correct: 'divide' } },
    expected: '4',
    accepted: ['4'],
    answer: '4',
    solution: ['Subtract 3', 'Divide by 2'],
    grading: { expected: '4' },
    generator: { x: [1, 9] },
    constraints: ['x>0'],
    teacherNotes: 'Answer is 4',
  };

  const printable = printableQuestionFromResolved(raw, {
    sourceIndex: 0,
    number: 1,
    sectionRole: 'practice',
    sectionLabel: 'Practice',
  });

  assert.equal(printable.prompt, 'Solve $2x+3=11$.');
  assert.equal(printable.scenario, 'A balance model is shown.');
  assert.deepEqual(printable.choices, [
    { label: 'A', text: '$x=3$' },
    { label: 'B', text: '$x=4$' },
  ]);
  assert.equal(JSON.stringify(printable).includes('isCorrect'), false);
  assert.equal(JSON.stringify(printable).includes('expected'), false);
  assert.equal(JSON.stringify(printable).includes('solution'), false);
  assert.equal(JSON.stringify(printable).includes('generator'), false);
  assert.equal(JSON.stringify(printable).includes('Answer is 4'), false);
});


test('accepted response arrays are never mistaken for visible multiple-choice options', () => {
  const printable = printableQuestionFromResolved({
    prompt: 'Enter the value of x.',
    responses: ['SECRET_CORRECT_RESPONSE'],
    accepted: ['SECRET_CORRECT_RESPONSE'],
  });
  assert.deepEqual(printable.choices, []);
  assert.equal(JSON.stringify(printable).includes('SECRET_CORRECT_RESPONSE'), false);
});

test('worksheet model contains only entries the runtime declared printable and numbers them by section', () => {
  const model = buildAssignmentWorksheetModel({
    assignment: { id: 'a1', title: 'Functions Practice', dueAt: '2026-08-28T20:00:00.000Z' },
    student: { displayName: 'Student One', classPeriod: '3rd Period' },
    entries: [
      { sourceIndex: 0, sectionRole: 'warmup', sectionLabel: 'Warm-Up', question: { prompt: 'Warm prompt', type: 'algebra' } },
      { sourceIndex: 1, available: false, sectionRole: 'dol', sectionLabel: 'DOL', question: { prompt: 'Locked DOL must not print', expected: 'secret' } },
      { sourceIndex: 2, sectionRole: 'practice', sectionLabel: 'Practice', question: { prompt: 'Practice one', type: 'algebra' } },
      { sourceIndex: 3, sectionRole: 'practice', sectionLabel: 'Practice', question: { prompt: 'Practice two', type: 'algebra' } },
    ],
  });

  assert.equal(model.sections.length, 2);
  assert.equal(JSON.stringify(model).includes('Locked DOL must not print'), false);
  assert.deepEqual(model.sections.map((section) => section.label), ['Warm-Up', 'Practice']);
  assert.deepEqual(model.sections[0].questions.map((q) => q.number), [1]);
  assert.deepEqual(model.sections[1].questions.map((q) => q.number), [1, 2]);
  assert.deepEqual(model.sections[1].questions.map((q) => q.sourceIndex), [2, 3]);
});

test('worksheet file name is safe and student-specific without exposing IDs', () => {
  assert.equal(
    worksheetFileName({ assignmentTitle: 'Algebra 1: Functions / Practice?', studentName: 'A. Student' }),
    'Algebra_1_Functions_Practice-A_Student.pdf',
  );
});
