/*
 * THE CLOSED PANELS' CODE AND HOME'S MATH, FETCHED WHILE THE BROWSER IS IDLE
 * (the teacher's first load, second pass).
 *
 * ./teacherPanels.js names what a teacher's Home asked for before it drew and
 * did not draw: the five panels the workspace draws closed, the math of Ask my
 * teacher's prompts, the Spotlight's projector view and Submission recovery's
 * panel. Each arrives when it is first needed; this fetches them all once the
 * workspace has drawn (once Home has drawn, for a teacher who lands there), so
 * a panel opens and a question's prompt draws as quickly as when they came
 * with Home: once per page, never when the device asks to save data, not while
 * it is offline (the student screens' idle prefetch, app/student/
 * studentScreenPrefetch.js, as the authoring code's, ./authoringKitLoader.js).
 *
 * Its own module, which only the workspace imports: Home's own modules take
 * what they draw from ./teacherPanels.js, and the student screens' prefetch
 * stays in the chunk it shares with App.
 */
import { createIdlePrefetch } from '../student/studentScreenPrefetch.js';
import {
  AssignmentHub, ClassroomSyncReview, StudentPersistenceRecoveryPanel, StudentProfileDrawer, StudentSpotlightView, SupportEvidenceReportView,
  TeacherQuickSearch, promptMath,
} from './teacherPanels.js';

// In the order a teacher is likeliest to want them.
export const TEACHER_PANEL_PREFETCH = Object.freeze([
  AssignmentHub, StudentProfileDrawer, TeacherQuickSearch, promptMath, SupportEvidenceReportView, ClassroomSyncReview, StudentSpotlightView,
  StudentPersistenceRecoveryPanel,
]);

const prefetchOnce = createIdlePrefetch();
/** Ask for all of it when the browser is next idle; returns a cancel for the effect that asked. */
export const prefetchTeacherPanels = (win) => prefetchOnce(TEACHER_PANEL_PREFETCH, win);
