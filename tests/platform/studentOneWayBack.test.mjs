/*
 * NAV-20 (student pass 3): one way back per screen, and Export PDF where it
 * helps.
 *
 *  - Grades and Tests & Exams: the shared nav's Home (on every size) is the
 *    way back; the "← Home" under it is gone (Grades: studentGradeCenter*).
 *  - The assignment workspace: the sticky navigator's "←" is a student's one
 *    Back. It stays on screen as the work scrolls, and it is named for where
 *    it goes ("Back to Assignments", not "Back to dashboard"). The header's
 *    "← Back to Home" text button is the teacher preview's only.
 *  - Home cards: Export PDF only on a card with work still to do; a finished
 *    or closed card offers its results (and Try again), not a worksheet too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const app = read('src/App.jsx');

test('NAV-20: the workspace has one student Back, named for its destination', () => {
  const header = region(app, '<header className="mathmaster-assignment-header"', '</header>', 'assignment header');
  // The header's text exit exists only inside a preview branch.
  assert.match(header, /\{preview && \(\s*<button\s+onClick=\{leaveAssignment\}[\s\S]*?Back to Instructor Dashboard\s*<\/button>\s*\)\}/);
  assert.equal((header.match(/onClick=\{leaveAssignment\}/g) || []).length, 1);
  assert.doesNotMatch(header, /studentAssignmentBackLabel/);
  const back = region(app, '<button type="button" className="mathmaster-unified-nav-back"', '</button>', 'sticky Back');
  assert.match(back, /onClick=\{leaveAssignment\}/);
  assert.match(back, /aria-label=\{preview \? 'Back to instructor dashboard' : studentAssignmentBackLabel\}/);
  assert.doesNotMatch(back, /Back to dashboard/);
  const label = region(app, 'const studentAssignmentBackLabel = ', ';', 'Back label');
  assert.match(label, /studentDashboardMode === 'testCycle'\s*\?\s*'Back to the Test Cycle'/, 'a Test Cycle review returns to its card');
});

test('NAV-20: Tests & Exams has no second Home under the nav', () => {
  const exams = read('src/components/assessment/StudentSecureExamDashboard.jsx');
  assert.doesNotMatch(exams, /← Home/);
  assert.doesNotMatch(exams, /\bonExit\b(?!AfterFinished)/);
  const branch = region(app, "studentDashboardMode === 'secureExams'", '/>', 'Tests & Exams branch');
  assert.match(branch, /<StudentGlobalNav current=\{STUDENT_DESTINATION\.SECURE_EXAMS\} onNavigate=\{navigateStudent\}/);
});

test('NAV-20: Export PDF only on a Home card with work to do', () => {
  const home = read('src/components/student/StudentDashboardView.jsx');
  assert.match(home, /\{onExportAssignmentPdf && actionable && \(/);
  assert.match(home, /const actionable = !finished && /, 'actionable is never a finished card');
  assert.doesNotMatch(home, /onExportAssignmentPdf && !waiting/);
});
