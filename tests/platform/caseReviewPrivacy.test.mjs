// The case file is about what a student did, not what the answers are. Answer
// keys, solutions and the student's typed responses never enter the model,
// so they cannot reach the screen, the CSVs, the JSON or the print view. The
// latest response is one click away in the existing Response Inspector,
// which has its own server-side authorization. All data here is synthetic.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStudentCaseReview } from '../../src/platform/caseReview/studentCaseReview.js';
import {
  caseAssignmentsCsv, caseFactsCsv, caseQuestionsCsv, caseReviewJson,
} from '../../src/platform/caseReview/caseReviewExport.js';
import { caseInputs, assignments, studentA } from './helpers/caseReviewFixture.mjs';

const KEY = 'KEY-SECRET';
const RESPONSE = 'RESPONSE-SECRET';

const withAnswerKeys = (assignment) => ({
  ...assignment,
  sections: (assignment.sections || []).map((section) => ({
    ...section,
    questions: section.questions.map((question, index) => ({
      ...question,
      correctAnswer: `${KEY}-correct-${index}`,
      acceptableAnswers: [`${KEY}-acceptable-${index}`],
      answerSpec: { value: `${KEY}-spec-${index}` },
      solution: `${KEY}-solution-${index}`,
      workedSolution: `${KEY}-worked-${index}`,
      explanation: `${KEY}-explanation-${index}`,
      parts: [{ id: 'a', label: 'slope', answer: `${KEY}-part-${index}` }],
    })),
  })),
});

const withResponses = (student) => ({
  ...student,
  gradesByAssignment: Object.fromEntries(Object.entries(student.gradesByAssignment).map(([assignmentId, records]) => [
    assignmentId,
    Object.fromEntries(Object.entries(records).map(([index, record]) => [index, {
      ...record,
      lastResponse: `${RESPONSE}-last-${assignmentId}-${index}`,
      algebraState: { expression: `${RESPONSE}-algebra-${assignmentId}-${index}` },
      stepGrades: [{ input: `${RESPONSE}-step-${assignmentId}-${index}`, isCorrect: false }],
      partGrades: [
        ...(record.partGrades || []),
        { id: 'resp', label: 'response field', isComplete: true, isCorrect: false, response: `${RESPONSE}-part-${assignmentId}-${index}`, expected: `${KEY}-expected-${assignmentId}-${index}` },
      ],
    }])),
  ])),
});

const model = buildStudentCaseReview(caseInputs({
  assignments: assignments.map(withAnswerKeys),
  student: withResponses(studentA),
}));

test('no answer key, solution or student response reaches the case file or any export', () => {
  const outputs = {
    model: JSON.stringify(model),
    json: caseReviewJson(model, { nextSteps: 'Reteach slope from two points.' }),
    assignmentsCsv: caseAssignmentsCsv(model),
    questionsCsv: caseQuestionsCsv(model),
    factsCsv: caseFactsCsv(model),
  };
  Object.entries(outputs).forEach(([name, text]) => {
    assert.ok(!text.includes(KEY), `${name} carries an answer key`);
    assert.ok(!text.includes(RESPONSE), `${name} carries a student response`);
  });
});

test('the recorded result of each named part survives — the result, not the response', () => {
  const question = model.questions.find((row) => row.assignmentId === 'L2' && row.storageIndex === 3);
  assert.deepEqual(question.latestParts.map((part) => Object.keys(part).sort()), [
    ['id', 'isComplete', 'isCorrect', 'label'],
    ['id', 'isComplete', 'isCorrect', 'label'],
    ['id', 'isComplete', 'isCorrect', 'label'],
  ]);
  assert.ok(question.latestParts.some((part) => part.label === 'y-intercept' && part.isCorrect === false));
});
