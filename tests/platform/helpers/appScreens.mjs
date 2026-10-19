/*
 * APP'S CODE, WHEREVER APP KEEPS IT.
 *
 * Student push G2 moved the teacher's screen and the teacher-only handlers
 * only it calls (Pre-Flight, assignment intake and setup, the question editor,
 * duplicate, Library repair, Dates & Classes) out of src/App.jsx, verbatim,
 * into src/app/teacher/TeacherWorkspace.jsx, which App renders and hands its
 * state by name (appShellSplit.test.mjs holds that seam).
 *
 * Contracts that describe what those handlers do, not which file they sit
 * in, read both files through this helper. A forbidden pattern
 * (doesNotMatch) is then refused in either file. An import a call needs is
 * still checked in the file that makes the call: no-undef covers src/**,
 * and the import assertions in these tests name the workspace's own paths.
 */
import { readFileSync } from 'node:fs';

const read = (repoPath) => readFileSync(new URL(`../../../${repoPath}`, import.meta.url), 'utf8');

export const APP_PATH = 'src/App.jsx';
export const TEACHER_WORKSPACE_PATH = 'src/app/teacher/TeacherWorkspace.jsx';

/** App.jsx followed by TeacherWorkspace.jsx. */
export const appAndTeacherWorkspaceSource = () => `${read(APP_PATH)}\n${read(TEACHER_WORKSPACE_PATH)}`;

export default appAndTeacherWorkspaceSource;
