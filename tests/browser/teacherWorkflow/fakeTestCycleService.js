/*
 * src/services/testCycleService.js for the teacher harness (vite.config.mjs
 * swaps it in): the REAL module, except for the one Test Cycle of the
 * `&innerScreens=1` scenario (innerScreensFixture.js), which the MOCK_LOCAL
 * sandbox could not show in Corrections. Every other assignment, and every
 * other harness page, gets the real service's own answer.
 */
import {
  getStudentTestCycle as realGetStudentTestCycle,
  issueTestCycleCorrectionQuestion as realIssueTestCycleCorrectionQuestion,
  submitTestCycleCorrectionResponse as realSubmitTestCycleCorrectionResponse,
} from '../../../src/services/testCycleService.js';
import { harnessStore } from './fakeFirestore.js';
import {
  INNER_SCREENS_TEST_CYCLE_ID,
  innerScreensCard,
  innerScreensCorrectionQuestion,
  innerScreensSeeded,
} from './innerScreensFixture.js';

export * from '../../../src/services/testCycleService.js';

const scenarioCycle = (assignmentId) => assignmentId === INNER_SCREENS_TEST_CYCLE_ID && innerScreensSeeded(harnessStore);
const signedInStudent = () => (typeof window !== 'undefined' ? window.__mmHarnessAuth?.currentStudentId?.() || null : null);
const answer = (value) => new Promise((resolve) => { setTimeout(() => resolve(value), 40); });

export const getStudentTestCycle = (args = {}) => (scenarioCycle(args.assignmentId)
  ? answer(innerScreensCard({ studentId: signedInStudent() }))
  : realGetStudentTestCycle(args));

export const issueTestCycleCorrectionQuestion = (args = {}) => (scenarioCycle(args.assignmentId)
  ? answer(innerScreensCorrectionQuestion(args))
  : realIssueTestCycleCorrectionQuestion(args));

// Corrections are not graded in this scenario: the journey only moves between screens.
export const submitTestCycleCorrectionResponse = (args = {}) => (scenarioCycle(args.assignmentId)
  ? answer({ success: true, isCorrect: false, attemptsUsed: 1, progress: { total: 2, complete: 0 }, correctionsComplete: false })
  : realSubmitTestCycleCorrectionResponse(args));
