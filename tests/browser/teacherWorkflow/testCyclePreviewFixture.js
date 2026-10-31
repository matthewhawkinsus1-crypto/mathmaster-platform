/*
 * THE TEACHER'S PREVIEW OF A TEST CYCLE — synthetic (TT27, third slice). It belongs to the
 * `&innerScreens=1` scenario's Test Cycle (innerScreensFixture.js), and is what the harness's
 * `previewTestCycleSecureItems` answers for it (fakeTestCycleService.js). The real callable
 * draws items from the school's approved question families; the harness has none, so this is
 * the shape it sends (functions/index.js, previewTestCycleSecureItems) for two items a
 * student's Test is made of:
 *
 *   a field item   a typed answer, which RichQuestionRuntime draws as its secure response fields;
 *   a tool item    the interval number line, which it draws as QuestionEngine and the real
 *                  registry tool (the public payload is built by the same function the server
 *                  uses, from the same authored question the browser captures use).
 *
 * Both are drawn by the shared runtime in the student's own question player, which is what the
 * landmarks driver (accessibilityTeacherLandmarks.mjs) opens: each used to draw a <main> of its
 * own inside the teacher's. All invented. Nothing here reaches a Firebase project.
 */
import { buildPublicToolPayload } from '../../../functions/shared/pathToolContracts.mjs';
import { PATH_TOOL_QUESTIONS } from '../../platform/fixtures/pathToolQuestions.mjs';

const RUNTIME_MODE = { test: 'secureTest', retest: 'secureRetest', corrections: 'corrections' };

const slot = (ordinal, toolLabel) => ({
  targetId: `preview-target-${ordinal}`,
  alignmentKey: 'texas:A.5A',
  dok: 1,
  difficultyBand: 2,
  representation: 'symbolic',
  anchor: false,
  weight: 1,
  familyId: `preview-family-${ordinal}`,
  toolId: null,
  toolLabel,
  secureCompatible: true,
  devices: { chromebook: true, ipad: true, phone: true },
});

/** What `previewTestCycleSecureItems` answers: one field item, then one tool item. */
export const previewTestCycleItems = ({ stage = 'test', draw = 1, title = 'Test' } = {}) => {
  const runtimeMode = RUNTIME_MODE[stage] || RUNTIME_MODE.test;
  const authored = PATH_TOOL_QUESTIONS.intervalNumberLine;
  const issued = (ordinal, question) => ({
    questionInstanceId: `preview-${ordinal}`, attemptsAllowed: 1, attemptsUsed: 0, runtimeMode, alignmentKeys: ['texas:A.5A'], ...question,
  });
  return {
    success: true,
    assignmentId: null,
    candidate: false,
    title,
    draw,
    totalQuestions: 2,
    shown: 2,
    unfilledSlots: 0,
    unfilledTargetIds: [],
    delivery: { timed: false, timeLimitMinutes: null, calculatorMode: 'questionSpecific', questionCount: 2 },
    policy: { passingScore: 70, maxRecordedGrade: 70, summary: 'If you retest, your retest can raise your grade up to 70%. It can never lower it.' },
    items: [
      {
        ordinal: 1,
        questionInstance: issued(1, {
          questionType: 'response',
          prompt: 'Solve $3x + 4 = 19$ for $x$.',
          responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number' }],
          choices: [],
        }),
        gradable: true,
        slot: slot(1, 'Response fields'),
        previewItemId: 'harness-preview-1',
      },
      {
        ordinal: 2,
        questionInstance: issued(2, {
          questionType: 'intervalNumberLine',
          prompt: authored.prompt,
          ...buildPublicToolPayload(authored),
        }),
        gradable: true,
        slot: slot(2, 'Interval number line'),
        previewItemId: 'harness-preview-2',
      },
    ],
    writes: 'none',
  };
};
