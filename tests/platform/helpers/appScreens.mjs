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

/*
 * APP'S HOOKS (the App split, 2026-11).
 *
 * App.jsx's concerns are moving, verbatim, into hooks under src/app/** that
 * App calls where the code was and hands what they read by name
 * (scripts/codemods/extract-app-hook.mjs; scripts/app-hook-ledger.mjs holds
 * the order their effects run in). A contract about one concern reads the
 * hook that now owns it:
 *
 *   appHookSource('useSchoolClock')   that hook's module, after checking that
 *                                     App imports it from src/app and calls it
 *
 * The seam is checked because the module's text only describes the app while
 * App runs it: delete the call and every regex over the module still passes.
 *
 * A forbidden pattern (doesNotMatch) that used to be refused in App.jsx is
 * refused in appSurfaceSource(): App, the teacher workspace and every hook
 * App calls, so the pattern cannot return by moving.
 */
const HOOK_IMPORT = /^import \{([^}]*)\} from '\.\/(app\/[^']+)';$/gm;

/** { hookName: repo path } for every hook App imports from src/app. */
export const appHookPaths = () => {
  const paths = {};
  for (const [, names, path] of read(APP_PATH).matchAll(HOOK_IMPORT)) {
    for (const name of names.split(',').map((entry) => entry.trim())) if (/^use[A-Z]/.test(name)) paths[name] = `src/${path}`;
  }
  return paths;
};

/** The module of a hook App calls. Throws when App does not import and call it. */
export const appHookSource = (hookName) => {
  const path = appHookPaths()[hookName];
  if (!path) throw new Error(`App.jsx does not import ${hookName} from src/app: the hook's code is not running, so its text proves nothing.`);
  const calls = read(APP_PATH).replace(/^import .*$/gm, '').match(new RegExp(`\\b${hookName}\\(`, 'g')) || [];
  if (calls.length !== 1) throw new Error(`App.jsx calls ${hookName} ${calls.length} times; a hook that holds App's state is called once.`);
  return read(path);
};

/** App.jsx, the teacher workspace and every hook App calls: where a forbidden pattern is refused. */
export const appSurfaceSource = () => [APP_PATH, TEACHER_WORKSPACE_PATH, ...new Set(Object.values(appHookPaths()))].map(read).join('\n');
