/*
 * WHAT A TEACHER'S HOME ASKED FOR BEFORE IT DREW, AND DID NOT DRAW (the
 * teacher's first load, second pass).
 *
 * A signed-in teacher downloaded, before Home's heading:
 *
 *   - MathText, for the prompt of each of Ask my teacher's questions, inside
 *     two folds: with it MathLive (212 KB), whose <math-span> renders a
 *     prompt's mathematics as static markup when it first comes on screen,
 *     and the spoken copies MathDisplay gives a screen reader (17 KB);
 *   - the Spotlight's projector view, drawn by the live monitor only while a
 *     student presents, which draws with MathText too.
 *
 * Each now arrives when it is first needed (./onDemandCode.js), and the
 * workspace fetches them all while the browser is idle once it has drawn
 * (./teacherPanelPrefetch.js).
 */
import { drawnPanel, onDemandCode } from './onDemandCode.js';

// MathText, for Ask my teacher's prompts (components/teacher/StudentQuestionsPanel.jsx).
export const promptMath = onDemandCode(() => import('../../components/common/MathText.jsx'));
// The Spotlight's projector view (components/teacher/LiveClassMonitor.jsx).
export const StudentSpotlightView = drawnPanel(() => import('../../components/teacher/StudentSpotlightView.jsx'));
