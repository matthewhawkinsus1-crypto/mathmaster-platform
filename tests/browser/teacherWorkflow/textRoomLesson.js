// A PHONE QUESTION'S ROOM FOR ITS WORK, AT ANY TEXT SIZE: ONE QUESTION OF EACH KIND, AS ONE LESSON.
//
// `?questions=room` makes today's lesson (a-today) a Classwork of the question kinds whose room the opener sweep's
// room check reads in the real App (tests/browser/workViewOpenerCover.mjs --check=room): a typed answer, a choice, a
// graph a student draws (Graphing 2, which opens Work View on a plane with its zoom row) and a staged question
// (complete a table, graph it, state its domain and range), each in Focus view and with "Show progress" open. It is
// written the way a teacher's import file is and compiled through the chain a teacher import and publish run, as
// studentRuntimeLesson.js compiles its lesson. Browser only, and loaded by fakeFirestore.js only for
// `?questions=room`.
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../../src/platform/contract/assignmentSchemaV5.js';

const teks = (code) => ({ standard: code, alignments: [{ framework: 'teks', code, role: 'primary' }] });

export const TEXT_ROOM_LESSON = Object.freeze({
  schemaVersion: 5,
  assignment: { title: 'Room for the work', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [
    {
      id: 'room-warmup',
      role: 'warmup',
      title: 'Warm-Up',
      feedbackMode: 'immediate',
      hintsAllowed: true,
      attemptsAllowed: 3,
      questions: [{
        questionId: 'room-warmup-1',
        ...teks('A.5A'),
        prompt: 'Solve 2y = 10 for y.',
        studentActions: ['multipleResponses'],
        responses: [{ id: 'y', label: 'y', answer: '5' }],
      }],
    },
    {
      id: 'room-classwork',
      role: 'classwork',
      title: 'Classwork',
      feedbackMode: 'immediate',
      hintsAllowed: true,
      attemptsAllowed: 3,
      questions: [
        {
          questionId: 'room-typed',
          ...teks('A.3A'),
          prompt: 'A line passes through (0, 4) and (3, 2). Find its slope and its y-intercept.',
          studentActions: ['multipleResponses'],
          responses: [{ id: 'm', label: 'Slope', answer: '-2/3' }, { id: 'b', label: 'y-intercept', answer: '4' }],
          hints: ['How much does y change, and how much does x change?'],
        },
        {
          questionId: 'room-choice',
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
          hints: ['Which number in each equation tells you how steep the line is?'],
        },
        {
          questionId: 'room-graph',
          ...teks('A.3C'),
          prompt: 'Graph the line y = −2x + 3.',
          studentActions: ['constructLine'],
          lineIntent: { m: -2, b: 3 },
        },
        {
          questionId: 'room-staged',
          ...teks('A.3C'),
          prompt: 'A plant is 4 cm tall and grows 2 cm each week. Complete the table, graph the function, then give its domain and range.',
          studentActions: ['completeTable', 'constructGraph', 'stateDomain', 'stateRange'],
          function: { family: 'linear', m: 2, b: 4 },
          tableXValues: [0, 1, 2, 3, 4, 5, 6],
          graph: { xMin: -1, xMax: 8, yMin: -2, yMax: 18 },
          correctDomain: 'x >= 0',
          correctRange: 'y >= 4',
        },
      ],
    },
    {
      id: 'room-dol',
      role: 'dol',
      title: 'DOL',
      feedbackMode: 'afterSubmit',
      attemptsAllowed: 1,
      questions: [{
        questionId: 'room-dol-1',
        ...teks('A.3A'),
        prompt: 'Write the slope of y = −3x + 7.',
        studentActions: ['multipleResponses'],
        responses: [{ id: 'm', label: 'Slope', answer: '-3' }],
      }],
    },
  ],
});

let compiled = null;
// A copy for each assignment that asks, as lessonFixtures.js hands out its lessons.
export const lessonSectionsFor = () => {
  if (!compiled) {
    const parsed = parseAssignmentBlueprintText(JSON.stringify(TEXT_ROOM_LESSON));
    const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
    if (!model.isValid) throw new Error(`Preflight rejected the room lesson:\n${model.errors.join('\n')}`);
    const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
    compiled = rebuildV5SectionsFromQuestions(model.assignmentV5, questions);
  }
  return JSON.parse(JSON.stringify(compiled));
};
