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
 * Find is asked for at once, as the workspace draws, not when the browser is
 * idle, and on a device that saves data too (2.4 KB): it opens on a keystroke,
 * App's Ctrl+K, and what is typed after it reaches its box only once its code
 * is here. Asked for later, a name typed straight after Ctrl+K went to the
 * box that had focus. Never while the device is offline: then once it is back.
 *
 * Its own module, which only the workspace imports: Home's own modules take
 * what they draw from ./teacherPanels.js, and the student screens' prefetch
 * stays in the chunk it shares with App.
 */
import { createIdlePrefetch } from '../student/studentScreenPrefetch.js';
import { whenOnline } from './onDemandCode.js';
import {
  AssignmentHub, ClassroomSyncReview, QuestionSignalNotes, StudentPersistenceRecoveryPanel, StudentProfileDrawer, StudentSpotlightView,
  SupportEvidenceReportView, TeacherQuickSearch, WorthAConversationTile, promptMath,
} from './teacherPanels.js';

// In the order a teacher is likeliest to want them.
export const TEACHER_PANEL_PREFETCH = Object.freeze([
  AssignmentHub, StudentProfileDrawer, TeacherQuickSearch, promptMath, SupportEvidenceReportView, ClassroomSyncReview, StudentSpotlightView,
  StudentPersistenceRecoveryPanel, WorthAConversationTile, QuestionSignalNotes,
]);

const prefetchOnce = createIdlePrefetch();
const browserWindow = () => (typeof window !== 'undefined' ? window : null);
/** Ask for Find now and the rest when the browser is next idle; returns a cancel for the effect that asked. */
export const prefetchTeacherPanels = (win = browserWindow()) => {
  const cancelFind = whenOnline(win, () => TeacherQuickSearch.prefetch());
  const cancelRest = prefetchOnce(TEACHER_PANEL_PREFETCH, win);
  return () => { cancelFind(); cancelRest(); };
};
