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

/*
 * A TEACHER'S CONTROLS (the App split, slice 3).
 *
 * The handlers behind the teacher's screen hold no state and run no effects,
 * so they did not become hooks: each group is a factory under
 * src/app/teacher/controls that the teacher kit exports, and App calls
 *
 *   const [a, b] = teacherKit ? teacherKit.createXControls(x, y) : NO_TEACHER_CONTROLS;
 *
 * once the kit has loaded. That keeps them out of a student's first load. The
 * seam is by position, which leaves no property names in either chunk, so
 * position is what is checked here: App's arguments must be the factory's
 * parameters, name for name and in order, and the names App takes from the
 * result must be the names the factory returns, in order.
 *
 *   teacherControlsSource('createDolClassControls')   that factory's module,
 *                                                     after checking the seam
 */
const TEACHER_KIT_PATH = 'src/app/teacher/teacherKit.js';
const CONTROL_EXPORT = /^export \{ (create\w+) \} from '\.\/(controls\/[^']+)';$/gm;
const nameList = (text) => text.split(',').map((entry) => entry.trim()).filter(Boolean);

/** { factoryName: repo path } for every control factory the teacher kit exports. */
export const teacherControlPaths = () => Object.fromEntries(
  [...read(TEACHER_KIT_PATH).matchAll(CONTROL_EXPORT)].map(([, name, path]) => [name, `src/app/teacher/${path}`]),
);

/** The seam of one control factory: what App passes and takes, and what the factory declares and returns. */
export const teacherControlsSeam = (factoryName) => {
  const path = teacherControlPaths()[factoryName];
  if (!path) throw new Error(`The teacher kit does not export ${factoryName} from ./controls: App could not reach it.`);
  const app = read(APP_PATH);
  const calls = [...app.matchAll(new RegExp(`const \\[([^\\]]*)\\] = teacherKit \\? teacherKit\\.${factoryName}\\(([^)]*)\\) : NO_TEACHER_CONTROLS;`, 'g'))];
  const mentions = app.match(new RegExp(`\\b${factoryName}\\b`, 'g')) || [];
  if (calls.length !== 1 || mentions.length !== 1) {
    throw new Error(`App.jsx must call teacherKit.${factoryName} exactly once, behind the kit check (found ${calls.length} such calls among ${mentions.length} mentions).`);
  }
  const source = read(path);
  const declared = new RegExp(`^export function ${factoryName}\\(([^)]*)\\) \\{$`, 'm').exec(source);
  const returned = /\n {2}return \[([^\]]*)\];\n\}\n$/.exec(source);
  if (!declared || !returned) throw new Error(`${path} must declare ${factoryName}(…) and end by returning one array of its handlers.`);
  return { path, source, passed: nameList(calls[0][2]), taken: nameList(calls[0][1]), parameters: nameList(declared[1]), returned: nameList(returned[1]) };
};

/** What is wrong with a control factory's seam, or null: by position, the names must match in order. */
export const teacherControlsSeamProblem = (factoryName, seam) => {
  const same = (left, right) => left.length === right.length && left.every((name, index) => name === right[index]);
  if (!same(seam.passed, seam.parameters)) return `App.jsx passes ${factoryName}(${seam.passed.join(', ')}) but ${seam.path} declares (${seam.parameters.join(', ')}): the seam is by position, so the names must match in order.`;
  if (!same(seam.taken, seam.returned)) return `App.jsx takes [${seam.taken.join(', ')}] from ${factoryName} but ${seam.path} returns [${seam.returned.join(', ')}]: the seam is by position, so the names must match in order.`;
  return null;
};

/** The module of a control factory App calls through the teacher kit. Throws when the seam does not line up. */
export const teacherControlsSource = (factoryName) => {
  const seam = teacherControlsSeam(factoryName);
  const problem = teacherControlsSeamProblem(factoryName, seam);
  if (problem) throw new Error(problem);
  return seam.source;
};

/** Every module App's own code moved into: the hooks it calls and the teacher's control factories. */
export const appModulePaths = () => [...new Set([...Object.values(appHookPaths()), ...Object.values(teacherControlPaths())])];

/** App.jsx, the teacher workspace and every module App's code moved into: where a forbidden pattern is refused. */
export const appSurfaceSource = () => [APP_PATH, TEACHER_WORKSPACE_PATH, ...appModulePaths()].map(read).join('\n');
