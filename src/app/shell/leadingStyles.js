/*
 * STYLESHEETS THAT MUST LINK BEFORE App.css (student push G2).
 *
 * At 805b69e2 these reached App through modules App imported statically
 * (AssignmentCardMenu, the teacher panels). Those modules' chunks were
 * App's imports, so Vite linked their CSS before App's own:
 *   supportEvidence.css, teacherWorkspace.css, MobileInteractionFoundation.css,
 *   then App-*.css.
 * App.css's `.mm-dashboard-content` touch rules (22px checkboxes, 12px cells,
 * 52px controls, the large-screen headings) have the same specificity as some
 * rules in the teacher sheets, so they win only by coming after them.
 *
 * This module carries the three sheets in a chunk of its own. App and the
 * teacher workspace both import it, so it is a shared chunk that App imports,
 * and its CSS links before App's: the order of 805b69e2. Importing the sheets
 * from App.jsx directly is not enough. The bundler lists a chunk's own CSS
 * before any shared CSS asset it pulls in.
 */
import '../../components/teacher/supportEvidence.css';
import '../../components/teacher/teacherWorkspace.css';
import '../../platform/mobile/MobileInteractionFoundation.css';


