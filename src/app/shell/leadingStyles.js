/*
 * STYLESHEETS THAT MUST LINK BEFORE App.css (student push G2; PF01).
 *
 * At 805b69e2 three sheets reached App through modules App imported
 * statically (AssignmentCardMenu, the teacher panels), so Vite linked their
 * CSS before App's own: supportEvidence.css, teacherWorkspace.css,
 * MobileInteractionFoundation.css, then App-*.css. This module kept that order.
 *
 * The two teacher sheets no longer come this way (PF01): they load with the
 * teacher's workspace (src/app/teacher/TeacherWorkspace.jsx imports them), so
 * a student does not download them. They link after App.css now, and App.css's
 * touch rules (22px checkboxes, 12px table cells, the large-screen headings)
 * win over the teacher rules they used to tie with by weight, not by coming
 * later: App.css names the teacher classes in them (its "TABLET AND
 * INTERACTIVE DISPLAY" rules).
 *
 * What still links before App.css, in the place it had:
 *   supportEvidencePrint.css  the support evidence report's print rules, which
 *                             reach every page (that file says why they stay);
 *   MobileInteractionFoundation.css  the phone layout rules App's own
 *                             assignment screens use.
 *
 * This module carries them in a chunk of its own. App and the teacher
 * workspace both import it, so it is a shared chunk that App imports, and its
 * CSS links before App's. Importing the sheets from App.jsx directly is not
 * enough. The bundler lists a chunk's own CSS before any shared CSS asset it
 * pulls in.
 */
import '../../components/teacher/supportEvidencePrint.css';
import '../../platform/mobile/MobileInteractionFoundation.css';
