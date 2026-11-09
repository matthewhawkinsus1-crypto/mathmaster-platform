// THE PERFORMANCE CERTIFICATION'S STUDENT FLOW, AS ONE LESSON.
//
// `?questions=runtime` makes today's lesson (a-today) one question of each kind
// docs/handoffs/PERFORMANCE_CERTIFICATION.md certifies: a basic typed answer,
// a choice, a typed expression and a registry tool (Step Algebra, which opens
// Work View). It is written the way a teacher's import file is and compiled
// through the chain a teacher import and publish run, as lessonFixtures.js
// compiles its lessons, so the student meets the questions a published
// assignment holds. Browser only, and loaded by fakeFirestore.js only for
// `?questions=runtime`.
//
// Driven by tests/browser/teacherWorkflow/studentRuntimePerformance.mjs. Every
// question has hints, so the flow can open one; none of them states its answer.
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../../src/platform/contract/assignmentSchemaV5.js';

const teks = (code) => ({ standard: code, alignments: [{ framework: 'teks', code, role: 'primary' }] });

export const STUDENT_RUNTIME_LESSON = Object.freeze({
  schemaVersion: 5,
  assignment: { title: 'Student runtime lesson', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [
    {
      id: 'rt-warmup',
      role: 'warmup',
      title: 'Warm-Up',
      feedbackMode: 'immediate',
      hintsAllowed: true,
      attemptsAllowed: 3,
      questions: [
        {
          questionId: 'rt-basic',
          ...teks('A.5A'),
          prompt: 'Solve 3x = 12.',
          studentActions: ['multipleResponses'],
          responses: [{ id: 'x', label: 'x', answer: '4' }],
          hints: ['What do you do to both sides to undo multiplying by 3?', 'Divide both sides by the same number.'],
        },
      ],
    },
    {
      id: 'rt-classwork',
      role: 'classwork',
      title: 'Classwork',
      feedbackMode: 'immediate',
      hintsAllowed: true,
      attemptsAllowed: 3,
      questions: [
        {
          questionId: 'rt-choice',
          ...teks('A.3B'),
          prompt: 'Which line is steeper: y = 3x + 1 or y = x + 5?',
          studentActions: ['multipleResponses'],
          responses: [{
            id: 'steeper',
            label: 'The steeper line',
            type: 'choice',
            options: ['y = 3x + 1', 'y = x + 5', 'They are equally steep'],
            answer: 'y = 3x + 1',
          }],
          hints: ['Which number in each equation tells you how steep the line is?', 'Compare the two slopes.'],
        },
        {
          questionId: 'rt-expression',
          ...teks('A.10D'),
          prompt: 'Simplify 3(x + 2) − x.',
          studentActions: ['multipleResponses'],
          responses: [{ id: 'simplified', label: 'Simplified expression', answer: '2x+6' }],
          hints: ['What do you get when you distribute the 3?', 'Then combine the like terms.'],
        },
        {
          questionId: 'rt-tool',
          ...teks('A.5A'),
          prompt: 'Solve 3x − 5 = 10.',
          studentActions: ['solveStepByStep'],
          equation: '3x - 5 = 10',
          answer: 5,
          hints: ['Which operation is applied to x last?', 'Undo the subtraction first, then the multiplication.'],
        },
      ],
    },
    {
      id: 'rt-practice',
      role: 'practice',
      title: 'Practice',
      feedbackMode: 'immediate',
      hintsAllowed: true,
      attemptsAllowed: 3,
      questions: [
        {
          questionId: 'rt-practice-1',
          ...teks('A.3A'),
          prompt: 'What is the slope of the line through (1, 2) and (4, 8)?',
          studentActions: ['multipleResponses'],
          responses: [{ id: 'm', label: 'Slope', answer: '2' }],
          hints: ['How much does y change, and how much does x change?'],
        },
      ],
    },
    {
      id: 'rt-dol',
      role: 'dol',
      title: 'DOL',
      feedbackMode: 'afterSubmit',
      attemptsAllowed: 1,
      questions: [
        {
          questionId: 'rt-dol-1',
          ...teks('A.3A'),
          prompt: 'Write the slope of y = −3x + 7.',
          studentActions: ['multipleResponses'],
          responses: [{ id: 'm', label: 'Slope', answer: '-3' }],
        },
      ],
    },
  ],
});

let compiled = null;
// A copy for each assignment that asks, as lessonFixtures.js hands out its lessons.
export const lessonSectionsFor = () => {
  if (!compiled) {
    const parsed = parseAssignmentBlueprintText(JSON.stringify(STUDENT_RUNTIME_LESSON));
    const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
    if (!model.isValid) throw new Error(`Preflight rejected the student runtime lesson:\n${model.errors.join('\n')}`);
    const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
    compiled = rebuildV5SectionsFromQuestions(model.assignmentV5, questions);
  }
  return JSON.parse(JSON.stringify(compiled));
};
