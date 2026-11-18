/*
 * HOME'S MATH, FETCHED WHILE THE BROWSER IS IDLE (the teacher's first load,
 * second pass).
 *
 * ./teacherPanels.js names what a teacher's Home asked for before it drew and
 * did not draw: the math of Ask my teacher's prompts and the Spotlight's
 * projector view. Each arrives when it is first needed; this fetches them once
 * the workspace has drawn (once Home has drawn, for a teacher who lands
 * there), so a question's prompt draws as quickly as when it came with Home:
 * once per page, never when the device asks to save data, not while it is
 * offline (the student screens' idle prefetch, app/student/
 * studentScreenPrefetch.js, as the authoring code's, ./authoringKitLoader.js).
 *
 * Its own module, which only the workspace imports: Home's own modules take
 * what they draw from ./teacherPanels.js, and the student screens' prefetch
 * stays in the chunk it shares with App.
 */
import { createIdlePrefetch } from '../student/studentScreenPrefetch.js';
import { StudentSpotlightView, promptMath } from './teacherPanels.js';

// In the order a teacher is likeliest to want them.
export const TEACHER_PANEL_PREFETCH = Object.freeze([promptMath, StudentSpotlightView]);

const prefetchOnce = createIdlePrefetch();
/** Ask for all of it when the browser is next idle; returns a cancel for the effect that asked. */
export const prefetchTeacherPanels = (win) => prefetchOnce(TEACHER_PANEL_PREFETCH, win);
