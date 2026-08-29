import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssignmentWorksheetModel,
  printableQuestionFromResolved,
  PRINT_OUTPUT_MODES,
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


test('teacher and answer-key models reveal only resolved answer data when explicitly requested', () => {
  const entry = {
    sourceIndex: 0,
    sectionRole: 'practice',
    sectionLabel: 'Practice',
    question: {
      prompt: 'Solve 2x + 3 = 11.',
      type: 'algebra',
      expected: '4',
      solution: ['Subtract 3 from both sides.', 'Divide both sides by 2.'],
      generator: { solutionRange: [4, 4] },
      teacherNotes: 'private planning note',
    },
  };

  const studentModel = buildAssignmentWorksheetModel({
    assignment: { id: 'a', title: 'Modes' },
    entries: [entry],
    outputMode: PRINT_OUTPUT_MODES.STUDENT,
  });
  const teacherModel = buildAssignmentWorksheetModel({
    assignment: { id: 'a', title: 'Modes' },
    entries: [entry],
    outputMode: PRINT_OUTPUT_MODES.TEACHER,
  });
  const keyModel = buildAssignmentWorksheetModel({
    assignment: { id: 'a', title: 'Modes' },
    entries: [entry],
    outputMode: PRINT_OUTPUT_MODES.ANSWER_KEY,
  });

  const studentQuestion = studentModel.sections[0].questions[0];
  const teacherQuestion = teacherModel.sections[0].questions[0];
  const keyQuestion = keyModel.sections[0].questions[0];

  assert.equal('answerLines' in studentQuestion, false);
  assert.equal('solutionLines' in studentQuestion, false);
  assert.deepEqual(teacherQuestion.answerLines, ['Answer: 4']);
  assert.deepEqual(teacherQuestion.solutionLines, ['Subtract 3 from both sides.', 'Divide both sides by 2.']);
  assert.deepEqual(keyQuestion.answerLines, ['Answer: 4']);
  assert.equal('solutionLines' in keyQuestion, false);
  assert.equal(JSON.stringify(teacherModel).includes('private planning note'), false);
  assert.equal(JSON.stringify(keyModel).includes('solutionRange'), false);
});

test('teacher and answer-key filenames identify both output type and personalized version', () => {
  assert.equal(
    worksheetFileName({
      assignmentTitle: 'Function Practice',
      studentName: 'A. Student',
      outputMode: PRINT_OUTPUT_MODES.TEACHER,
    }),
    'Function_Practice-Teacher_Copy-A_Student.pdf',
  );
  assert.equal(
    worksheetFileName({
      assignmentTitle: 'Function Practice',
      studentName: 'A. Student',
      outputMode: PRINT_OUTPUT_MODES.ANSWER_KEY,
    }),
    'Function_Practice-Answer_Key-A_Student.pdf',
  );
});

test('worksheet file name is safe and student-specific without exposing IDs', () => {
  assert.equal(
    worksheetFileName({ assignmentTitle: 'Algebra 1: Functions / Practice?', studentName: 'A. Student' }),
    'Algebra_1_Functions_Practice-A_Student.pdf',
  );
});


test('graph-analysis worksheets carry the actual graph instead of a generic blank grid', () => {
  const printable = printableQuestionFromResolved({
    type: 'graphAnalysis',
    prompt: 'Use the graph to identify the vertex.',
    functionSpec: { type: 'quadratic', a: 1, h: 2, k: -3 },
  });
  assert.equal(printable.visuals[0].kind, 'graph');
  assert.equal(printable.visuals[0].graph.functions[0].type, 'quadratic');
  assert.equal(printable.visuals[0].graph.functions[0].h, 2);
});

test('graph-construction student worksheet gets the function rule and blank workspace without the solved curve', () => {
  const student = printableQuestionFromResolved({
    type: 'functionGraph',
    prompt: 'Graph the function.',
    functionSpec: { type: 'linear', m: 2, b: -3 },
    graph: { xMin: -5, xMax: 5, yMin: -8, yMax: 8 },
  }, { includeAnswers: false });
  assert.ok(student.givens.some((line) => /Function:/.test(line)));
  assert.equal(student.visuals[0].kind, 'blankGraph');
  assert.equal(JSON.stringify(student.visuals).includes('"functions"'), false);

  const teacher = printableQuestionFromResolved({
    type: 'functionGraph',
    prompt: 'Graph the function.',
    functionSpec: { type: 'linear', m: 2, b: -3 },
    graph: { xMin: -5, xMax: 5, yMin: -8, yMax: 8 },
  }, { includeAnswers: true });
  assert.equal(teacher.visuals[0].kind, 'graph');
  assert.ok(teacher.visuals[0].graph.functions.length > 0);
});

test('printable tables preserve visible rows and blanks but strip hidden answer maps', () => {
  const printable = printableQuestionFromResolved({
    type: 'table',
    prompt: 'Complete the table.',
    table: {
      columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }],
      rows: [{ x: 0, y: null }, { x: 1, y: null }],
      answers: { '0:y': 2, '1:y': 5 },
    },
  });
  const table = printable.visuals.find((visual) => visual.kind === 'table');
  assert.ok(table);
  assert.deepEqual(table.table.rows, [{ x: 0, y: '' }, { x: 1, y: '' }]);
  assert.equal(JSON.stringify(table).includes('0:y'), false);
  assert.equal(JSON.stringify(table).includes('"answers"'), false);
});

test('student number-line worksheet never prints the hidden interval answer', () => {
  const question = {
    type: 'intervalNumberLine',
    prompt: 'Graph the solution.',
    inequalityText: 'x ≥ 3',
    min: -5,
    max: 8,
    intervals: [{ min: 3, max: null, minClosed: true, maxClosed: false }],
  };
  const student = printableQuestionFromResolved(question, { includeAnswers: false });
  const studentLine = student.visuals.find((visual) => visual.kind === 'numberLine');
  assert.deepEqual(studentLine.intervals, []);
  assert.equal(studentLine.showAnswer, false);

  const teacher = printableQuestionFromResolved(question, { includeAnswers: true });
  const teacherLine = teacher.visuals.find((visual) => visual.kind === 'numberLine');
  assert.equal(teacherLine.showAnswer, true);
  assert.equal(teacherLine.intervals[0].min, 3);
});

test('structured equations are carried into printable givens without relying on prompt duplication', () => {
  const printable = printableQuestionFromResolved({
    type: 'literal',
    prompt: 'Solve for r.',
    equation: 'A=πr^2',
    solveFor: 'r',
  });
  assert.ok(printable.givens.some((line) => line.includes('A=πr^2')));
});
