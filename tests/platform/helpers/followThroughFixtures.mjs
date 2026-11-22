/*
 * The follow-through questions and the graders the SP-3 tests run them through
 * (tests/platform/followThroughGrading.test.mjs, followThroughParts.test.mjs).
 *
 * The questions are compiled as an author's file is, so the graders read the
 * compiled shape. Every grader here is the real one a surface uses:
 *   clientGrade     MultiAnswerGrader's grader (gradeMultiAnswerResponse)
 *   serverGrade     the server's dispatch over the checkpointed response, as a
 *                   manual submit and the deadline finalizer mark it
 *   secureGrade     a secure Test, Corrections or Path field item, issued and
 *                   graded from its private grading (functions/lib/mathPath.js)
 *   simulatorGrade  the teacher's Path simulation (teacherPathRuntime.js)
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../../../src/assignmentBlueprint.js';
import { gradeMultiAnswerResponse, normalizeOrdinaryResponse } from '../../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeQuestionResponse } from '../../../functions/shared/serverGrading/questionResponseGrading.mjs';
import { gradeFieldResponse } from '../../../src/platform/simulation/teacherPathRuntime.js';
import { buildFieldGradingDefinition } from '../../../functions/shared/legacyFieldGrading.mjs';

const require = createRequire(import.meta.url);
export const mathPath = require('../../../functions/lib/mathPath.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, 'tests/platform/fixtures/learningSupportsLessonFragment.json'), 'utf8'));

// The spec's own example (docs/platform/SHOWING_THE_PROCESS.md section 4).
export const INEQUALITY_SOURCE = Object.freeze({
  questionId: 'ft-inequality',
  standard: 'A.3D',
  dok: 2,
  studentActions: ['multipleResponses'],
  prompt: 'The boundary line of a linear inequality passes through (0, 3) and (1, 1). The region above it is shaded, and the line is dashed.',
  responses: [
    { id: 'slope', label: 'Slope of the boundary line', answer: '-2' },
    {
      id: 'inequality',
      label: 'Using your slope of {slope}, write the inequality',
      answer: 'y > -2x + 3',
      followThrough: { from: ['slope'], answer: 'y > {slope}x + 3' },
    },
  ],
});

const compiledQuestions = () => {
  const source = structuredClone(FIXTURE);
  source.sections.find((section) => section.id === 'classwork').questions.push(structuredClone(INEQUALITY_SOURCE));
  return parseAssignmentBlueprintText(JSON.stringify(source)).questions;
};
const QUESTIONS = compiledQuestions();
export const inequalityQuestion = QUESTIONS.find((question) => question.questionId === 'ft-inequality');
// The guide's example: slope 3, intercept -2, "y = {slope}x + {intercept}".
export const lineQuestion = QUESTIONS.find((question) => question.questionId === 'ls-cw-4');

// The same question as a secure Test, Corrections or Path item: responseFields
// with server-side keys (functions/shared/legacyFieldGrading.mjs).
export const fieldItem = Object.freeze({
  id: 'ft-field-item',
  prompt: INEQUALITY_SOURCE.prompt,
  responseFields: [
    { id: 'slope', label: 'Slope of the boundary line', inputProfile: 'number', expected: '-2' },
    {
      id: 'inequality',
      label: 'Using your slope of {slope}, write the inequality',
      inputProfile: 'expression',
      expected: 'y > -2x + 3',
      followThrough: { from: ['slope'], answer: 'y > {slope}x + 3' },
    },
  ],
});

const verdicts = (parts) => Object.fromEntries(parts.map((part) => [part.id, part.isCorrect]));

export const clientGrade = (question, answers) => verdicts(gradeMultiAnswerResponse(question, answers).parts);

// A response with a blank part is not marked (incomplete-response), but the
// server still reports each part's verdict, which is what is compared.
export const serverGrade = (question, answers) => {
  const answerState = { parts: gradeMultiAnswerResponse(question, answers).parts };
  const response = normalizeOrdinaryResponse({ question, answerState });
  const result = gradeQuestionResponse({ question, response });
  const filled = question.answerFields.every((field) => String(answers[field.id] ?? '').trim() !== '');
  if (filled) assert.equal(result.graded, true, `graded: ${result.reason}`);
  else assert.ok(['incomplete-response', 'blank-response'].includes(result.reason), `not graded: ${result.reason}`);
  // Nothing typed at all: nothing is right.
  if (result.reason === 'blank-response') return Object.fromEntries(question.answerFields.map((field) => [field.id, false]));
  return verdicts(result.parts);
};

export const secureGrade = async (item, responses) => {
  const plan = await mathPath.buildIssuePlan(item);
  assert.equal(plan.issuable, true, plan.reason);
  const result = await mathPath.gradeResponse(plan.privateGrading, { responses });
  return verdicts(result.fieldResults);
};

export const simulatorGrade = (item, responses) => verdicts(gradeFieldResponse(buildFieldGradingDefinition(item), { responses }).parts);
