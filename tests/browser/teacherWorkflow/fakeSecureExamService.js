/*
 * src/services/secureExamService.js for the teacher harness (vite.config.mjs
 * swaps it in): the REAL module — its MOCK_LOCAL sandbox — except for the
 * `&innerScreens=1` scenario (innerScreensFixture.js). There Tests & Exams
 * lists two practice tests that outlive a reload (the sandbox keeps its
 * sessions in page memory), and the scenario's released course Test can be
 * reviewed. Nothing here starts a test: the journey stops at the start
 * screen, where only the student's own tap would.
 */
import {
  getStudentSecureExamReview as realGetStudentSecureExamReview,
  listStudentSecureExamSessions as realListStudentSecureExamSessions,
} from '../../../src/services/secureExamService.js';
import { harnessStore } from './fakeFirestore.js';
import {
  INNER_SCREENS_TEST_SESSION_ID,
  innerScreensPracticeTests,
  innerScreensSeeded,
  innerScreensTestReview,
} from './innerScreensFixture.js';

export * from '../../../src/services/secureExamService.js';

const scenario = () => innerScreensSeeded(harnessStore);
const answer = (value) => new Promise((resolve) => { setTimeout(() => resolve(value), 40); });

export const listStudentSecureExamSessions = (...args) => (scenario()
  ? answer(innerScreensPracticeTests())
  : realListStudentSecureExamSessions(...args));

export const getStudentSecureExamReview = (args = {}) => (scenario() && args.examSessionId === INNER_SCREENS_TEST_SESSION_ID
  ? answer(innerScreensTestReview())
  : realGetStudentSecureExamReview(args));
