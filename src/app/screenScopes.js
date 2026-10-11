/*
 * Which screens scope what, moved out of App.jsx unchanged (the App shell
 * split, student push G): the teacher tabs a class scopes, the tabs that read
 * full student data, support streams, parent contacts and session summaries,
 * and where a student's Recovery is discovered and announced.
 */

// A stable "none", so a signed-in teacher's clock tick never hands the student
// surfaces a new empty list.
export const NO_RECOVERY_OPPORTUNITIES = Object.freeze([]);
// The discovery scope that means "every assignment" (the dashboard screens);
// otherwise the scope is the one open assignment's id.
export const RECOVERY_DISCOVERY_ALL = '__allAssignments__';
// Where a newly open Recovery is announced: the screens a student chooses
// their next step from (Home, Assignments, Grades) — never inside a Live
// Challenge, My Math Path or a secure exam.
export const RECOVERY_ANNOUNCEMENT_MODES = new Set(['assignments', 'assignmentsCenter', 'grades']);

/*
 * Which teacher tabs a class actually scopes, and what it scopes there.
 *
 * This table is the honest boundary of the class-first architecture. A tab in
 * it inherits the workspace's class rather than asking again; a tab absent from
 * it genuinely operates outside class scope, and showing a class selector above
 * it would imply a filter that does not exist.
 *
 * `allowAllClasses: false` marks the views that cannot answer anything without
 * a specific class — a weekly goal or a live room is a fact about one class, not
 * an average across five.
 */
export const CLASS_SCOPED_TABS = Object.freeze({
  home: { scopeLabel: 'Showing what needs attention' },
  classesWorkspace: { scopeLabel: 'Showing the class' },
  students: { scopeLabel: 'Showing the roster' },
  grades: { scopeLabel: 'Showing grades' },
  weeklyPath: { scopeLabel: 'Showing weekly goals', allowAllClasses: false },
  pacing: { scopeLabel: 'Showing pacing', allowAllClasses: false },
  standards: { scopeLabel: 'Showing mastery' },
  analytics: { scopeLabel: 'Showing analytics' },
  assignments: { scopeLabel: 'Showing assignments' },
});

export const TEACHER_FULL_STUDENT_DATA_TABS = new Set([
  'students', 'weeklyPath', 'actionCenter', 'parentContacts', 'grades', 'gradeTransfer',
  'standards', 'analytics', 'exams',
]);
export const TEACHER_SUPPORT_STREAM_TABS = new Set(['home', 'classesWorkspace', 'attendanceHistory', 'actionCenter', 'parentContacts']);
export const TEACHER_PARENT_CONTACT_STREAM_TABS = new Set(['parentContacts', 'actionCenter']);
// Tabs that work across every class a teacher teaches by design (Grade
// Export's units, the Action Center's queue, Parent Contacts' roster): their
// students' private controls are read for all of those classes, in the one
// controls listener (platform/teacher/teacherClassControls.js).
export const TEACHER_CROSS_CLASS_TABS = new Set(['gradeTransfer', 'actionCenter', 'parentContacts']);
export const TEACHER_SESSION_SUMMARY_TABS = new Set(['home', 'classesWorkspace', 'parentContacts']);
