/*
 * THE RESPONSE INSPECTOR, WITH SOMETHING TO INSPECT — synthetic. Opt-in:
 * `&inspector=1` (fakeFirestore.js loads this only then; it pulls in every
 * shared grader). Driven by responseInspectorJourneys.mjs and the inspector's
 * accessibility scene (tests/browser/accessibilityTeacherScreens.mjs).
 *
 * Today's lesson keeps its shape (Warm-Up 1, Classwork 2, Practice 2, DOL 1,
 * so every Live Class heartbeat still points at the same positions) with
 * questions the graders mark: typed boxes, a factored-form box, a Graphing
 * construction, a table and a Step Algebra solve. Two Period 3 students have
 * answered them, each attempt recorded by the real attempt policy and its
 * evidence captured exactly as ingestion stores it (captureAutomaticGradingEvidence,
 * keyed and checked as inspectStudentResponse checks it):
 *
 *   910003  on Classwork Q1 in Live Class ("cx....", 3 attempts): r² typed
 *           "0,49" (a comma the grader does not read as a decimal point),
 *           the factored-form box answered "x^2+5x+6" (the key's value, not
 *           its form), a graph, a table with one blank wrong, and the DOL's
 *           Step Algebra solve with its steps in the saved workspace.
 *   910002  on Classwork Q2 ("cc...."): both Classwork questions right.
 *
 * All invented. Nothing here reaches a Firebase project.
 */
import {
  captureAutomaticGradingEvidence,
  responseInspectionEvidenceDocumentId,
} from '../../../functions/shared/responseInspector.mjs';
import { gradeServerResponse, gradeToolWork } from '../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from '../../../functions/shared/serverGrading/toolResponseContract.mjs';
import { attemptInputsFromGrading } from '../../../functions/shared/serverGrading/gradingResult.mjs';
import { recordQuestionAttempt } from '../../../functions/shared/attemptPolicy.mjs';
import { WORKSPACE_DRAFT_SCHEMA_VERSION, workspaceDraftDocumentId } from '../../../functions/shared/workspaceDraftSchema.mjs';

export const INSPECTOR_ASSIGNMENT_ID = 'a-today';
export const INSPECTOR_STUDENT_ID = '910003';
export const INSPECTOR_CLASSMATE_ID = '910002';

const ONE_VARIABLE = { primary: ['A.5A'] };
const id = INSPECTOR_ASSIGNMENT_ID;

export const INSPECTOR_QUESTIONS = Object.freeze([
  { questionId: `${id}-w1`, activityRole: 'warmup', type: 'literal', prompt: 'Solve 2y = 10 for y.', solveFor: 'y', acceptedAnswers: ['5'], standards: ONE_VARIABLE },
  { questionId: `${id}-c1`, activityRole: 'classwork', type: 'multiAnswer', prompt: 'For r = −0.70, calculate r² and the corresponding percentage.', standards: ONE_VARIABLE, answerFields: [{ id: 'r2', label: 'r²', answer: 0.49, inputProfile: 'number' }, { id: 'percent', label: 'Percentage', answer: 49, inputProfile: 'number' }] },
  { questionId: `${id}-c2`, activityRole: 'classwork', type: 'multiAnswer', prompt: 'Factor x² + 5x + 6.', standards: ONE_VARIABLE, answerFields: [{ id: 'f', label: 'Factored form', answer: '(x+2)(x+3)', gradingMode: 'factoredForm' }] },
  { questionId: `${id}-p1`, activityRole: 'practice', type: 'graphing2', prompt: 'Graph y = 2x + 1 using two points.', mode: 'slopeIntercept', line: { m: 2, b: 1 }, graphBounds: { xMin: -6, xMax: 6, yMin: -8, yMax: 10 }, tolerance: 0.12, standards: ONE_VARIABLE },
  { questionId: `${id}-p2`, activityRole: 'practice', type: 'table', prompt: 'Complete the table for y = 2x + 1.', standards: ONE_VARIABLE, table: { columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }], rows: [{ x: -1, y: -1 }, { x: 0, y: null }, { x: 1, y: 3 }, { x: 2, y: null }], answers: { '1:y': 1, '3:y': 5 } } },
  { questionId: `${id}-d1`, activityRole: 'dol', type: 'stepAlgebra', prompt: 'Solve 2x + 3 = 7 on the balance.', equation: '2x + 3 = 7', objective: { kind: 'solve', variable: 'x' }, standards: ONE_VARIABLE },
]);

const sections = () => [
  { id: `${id}-wu`, role: 'warmup', title: 'Warm-Up', questions: [INSPECTOR_QUESTIONS[0]] },
  { id: `${id}-cw`, role: 'classwork', title: 'Classwork', questions: INSPECTOR_QUESTIONS.slice(1, 3) },
  { id: `${id}-pr`, role: 'practice', title: 'Practice', questions: INSPECTOR_QUESTIONS.slice(3, 5) },
  { id: `${id}-dol`, role: 'dol', title: 'DOL', questions: [INSPECTOR_QUESTIONS[5]] },
];

const fieldsOf = (values, type) => ({ kind: 'fields', type, value: '', fields: Object.entries(values).map(([field, value]) => ({ id: field, value, isComplete: String(value).trim() !== '' })) });
const scalarOf = (type, value) => ({ kind: 'scalar', type, value, fields: [] });

// What each student submitted, per storage index: the response the device
// sent, and how many times the same answer was submitted.
const ANSWERS = {
  [INSPECTOR_STUDENT_ID]: {
    0: { response: scalarOf('literal', '5'), tries: 1 },
    1: { response: fieldsOf({ r2: '0,49', percent: '49' }, 'multiAnswer'), tries: 3 },
    2: { response: fieldsOf({ f: 'x^2+5x+6' }, 'multiAnswer'), tries: 3 },
    3: { work: { toolId: 'graphing2', points: [[0, 1], [2, 5]], studentLine: { kind: 'slopeIntercept', m: 2, b: 1 } }, tries: 1 },
    4: { response: fieldsOf({ '1:y': '1', '3:y': '4' }, 'table'), tries: 3 },
    5: { stepWork: { equation: { left: 'x', right: '2' }, promptAnswers: [] }, tries: 1 },
  },
  [INSPECTOR_CLASSMATE_ID]: {
    0: { response: scalarOf('literal', '5'), tries: 1 },
    1: { response: fieldsOf({ r2: '0.49', percent: '49' }, 'multiAnswer'), tries: 1 },
    2: { response: fieldsOf({ f: '(x+3)(x+2)' }, 'multiAnswer'), tries: 1 },
  },
};

const STEP_DRAFT = {
  equation: { left: 'x', right: '2', variable: 'x' },
  workSteps: [
    { kind: 'step', description: 'Subtract 3 from both sides', parts: ['Subtract 3'], before: { left: '2 x + 3', right: '7' }, after: { left: '2 x', right: '4' } },
    { kind: 'step', description: 'Divide both sides by 2', parts: ['Divide by 2'], before: { left: '2 x', right: '4' }, after: { left: 'x', right: '2' } },
  ],
  promptAnswers: {},
};

const graded = (question, answer) => {
  if (answer.work) {
    const { toolId, ...work } = answer.work;
    const result = gradeToolWork({ toolId, question, work });
    return { response: result.toolResponse, grading: result };
  }
  const response = answer.stepWork ? buildToolResponse({ question, toolId: 'stepAlgebra', work: answer.stepWork }) : answer.response;
  return { response, grading: gradeServerResponse({ question, response }) };
};

/** Add the scenario to a built fixture (fakeFirestore.js, `&inspector=1`). */
export const addResponseInspectorScenario = ({ fixture, now = Date.now() } = {}) => {
  const assignmentPath = `assignments/${id}`;
  if (!fixture[assignmentPath]) return fixture;
  fixture[assignmentPath] = { ...fixture[assignmentPath], sections: sections() };
  Object.entries(ANSWERS).forEach(([studentId, answers]) => {
    const gradePath = `grades/${studentId}`;
    if (!fixture[gradePath]) return;
    const tracker = {};
    Object.entries(answers).forEach(([index, answer]) => {
      const questionIndex = Number(index);
      const question = INSPECTOR_QUESTIONS[questionIndex];
      const { response, grading } = graded(question, answer);
      const inputs = attemptInputsFromGrading(grading);
      const at = now - (40 - questionIndex * 4) * 60_000;
      let record = {};
      for (let attempt = 0; attempt < answer.tries; attempt += 1) {
        record = recordQuestionAttempt({
          record, isCorrect: inputs.isCorrect, parts: inputs.parts, partialCreditPercent: inputs.partialCreditPercent,
          maximumAttempts: 3, responseKey: String(response.value || JSON.stringify(response.fields)), occurredAt: at + attempt * 30_000,
        }).record;
      }
      const submissionId = `inspector-${studentId}-q${questionIndex}`;
      record = { ...record, variantIndex: 0, lastSubmissionId: submissionId, submissionOrigin: 'server-ingestion', gradedBy: 'server' };
      tracker[questionIndex] = record;
      const evidence = captureAutomaticGradingEvidence({
        response,
        grading: { isCorrect: record.status === 'correct', parts: record.partGrades },
        question,
        submittedAt: new Date(at + (answer.tries - 1) * 30_000).toISOString(),
        source: 'ordinarySubmission',
        graderVersion: grading.graderVersion || 'ordinary-response-v3',
      });
      fixture[`${gradePath}/responseInspectionEvidence/${responseInspectionEvidenceDocumentId({ assignmentId: id, questionIndex })}`] = {
        assignmentId: id, questionIndex, submissionId, variantIndex: 0, totalAttempts: record.totalAttempts, evidence,
      };
    });
    fixture[gradePath] = { ...fixture[gradePath], gradesByAssignment: { ...fixture[gradePath].gradesByAssignment, [id]: tracker } };
  });
  // The DOL's saved Step Algebra workspace: the steps, saved as it was submitted.
  const savedAt = now - 20 * 60_000;
  fixture[`studentWorkspaceDrafts/${workspaceDraftDocumentId({ studentId: INSPECTOR_STUDENT_ID, assignmentId: id })}`] = {
    schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
    studentId: INSPECTOR_STUDENT_ID,
    assignmentId: id,
    entries: [
      { key: `mathmaster:draft:v2::${INSPECTOR_STUDENT_ID}:${id}:5:0:student:step-algebra`, valueJson: JSON.stringify(STEP_DRAFT), savedAt, questionIndex: 5, variantIndex: 0 },
      { key: `mathmaster:draft:v2::${INSPECTOR_STUDENT_ID}:${id}:1:0:student:multi-answer`, valueJson: JSON.stringify({ r2: '0,49', percent: '49' }), savedAt: now - 30 * 60_000, questionIndex: 1, variantIndex: 0 },
    ],
    updatedAt: new Date(savedAt).toISOString(),
  };
  return fixture;
};
