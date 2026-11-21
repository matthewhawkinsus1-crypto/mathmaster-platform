/*
 * WHAT A TEACHER'S HOME ASKED FOR BEFORE IT DREW, AND DID NOT DRAW (the
 * teacher's first load, second pass).
 *
 * A signed-in teacher downloaded, before Home's heading:
 *
 *   - the five panels the workspace draws closed on every screen (Find, the
 *     Classroom sync review, an assignment's details, a student's drawer and
 *     the support evidence report), about 170 KB gzip with what only they
 *     reach: the question family registry (73 KB), through the Recovery plan
 *     an assignment's details reads, among it;
 *   - MathText, for the prompt of each of Ask my teacher's questions, inside
 *     two folds: with it MathLive (212 KB), whose <math-span> renders a
 *     prompt's mathematics as static markup when it first comes on screen,
 *     and the spoken copies MathDisplay gives a screen reader (17 KB);
 *   - the Spotlight's projector view, drawn by the live monitor only while a
 *     student presents, which draws with MathText too;
 *   - Submission recovery's panel, drawn inside Home's fold of that name once
 *     the teacher has chosen a class and an assignment there.
 *
 * And, since the teacher signals (SP-2), the Live tile's "Worth a
 * conversation", drawn only on the tile of a student whose attempts raised a
 * fact.
 *
 * Each now arrives when it is first needed (./onDemandCode.js), and the
 * workspace fetches them all while the browser is idle once it has drawn
 * (./teacherPanelPrefetch.js).
 *
 * What each panel does while closed, kept by drawing nothing until it opens:
 * TeacherQuickSearch, ClassroomSyncReview, StudentProfileDrawer and
 * SupportEvidenceReportView draw nothing and hold nothing (the drawer's read
 * of the student's rewards waits for it to open; Ctrl+K is App's own
 * listener). AssignmentHub draws nothing and reports no class to App
 * (onClassChange(null)), which is where App's own value starts, and reports
 * none again as it leaves the page.
 *
 * Opened while the device is offline before anything asked for its code, each
 * says so in its place, in a note the teacher can put away, and opens once the
 * device is back online, unless the teacher is typing in a box by then. Code
 * whose request already failed goes to AppErrorBoundary instead: only a new
 * page can bring it (./onDemandCode.js).
 */
import { closedPanel, drawnPanel, onDemandCode } from './onDemandCode.js';

export const TeacherQuickSearch = closedPanel(() => import('../../components/teacher/TeacherQuickSearch.jsx'), (props) => props.open, "This device is offline. Find opens when it is back online.");
export const ClassroomSyncReview = closedPanel(() => import('../../components/teacher/ClassroomSyncReview.jsx'), (props) => props.proposal, "This device is offline. The Classroom sync review opens when it is back online.");
export const AssignmentHub = closedPanel(() => import('../../components/teacher/AssignmentHub.jsx'), (props) => props.open, "This device is offline. The assignment's details open when it is back online.");
export const StudentProfileDrawer = closedPanel(() => import('../../components/teacher/StudentProfileDrawer.jsx'), (props) => props.open, "This device is offline. The student's details open when it is back online.");
export const SupportEvidenceReportView = closedPanel(() => import('../../components/teacher/SupportEvidenceReportView.jsx'), (props) => props.open, "This device is offline. The support evidence report opens when it is back online.");

// MathText, for Ask my teacher's prompts (components/teacher/StudentQuestionsPanel.jsx).
export const promptMath = onDemandCode(() => import('../../components/common/MathText.jsx'));
// The Spotlight's projector view (components/teacher/LiveClassMonitor.jsx).
export const StudentSpotlightView = drawnPanel(() => import('../../components/teacher/StudentSpotlightView.jsx'), "This device is offline. The Spotlight shows when it is back online.");
// "Worth a conversation" on a Live tile (components/teacher/LiveClassMonitor.jsx), drawn only for a student whose attempts raised a fact.
export const WorthAConversationTile = drawnPanel(() => import('../../components/teacher/WorthAConversation.jsx'), "This device is offline. Worth a conversation shows when it is back online.");
// Submission recovery's panel (src/TeacherHome.jsx), mounted again for each class and assignment chosen.
export const StudentPersistenceRecoveryPanel = drawnPanel(() => import('../../components/teacher/StudentPersistenceRecoveryPanel.jsx'), "This device is offline. Submission recovery shows when it is back online.");
