// THE TEACHER'S FIRST LOAD, THIRD PASS: WHAT THE WORKSPACE MOVED OUT, AND THE
// SEAMS IT IS HANDED BACK THROUGH.
//
// The workspace (src/app/teacher/TeacherWorkspace.jsx) carried, before Home
// drew, code no teacher needs to see Home: its async assignment actions, the
// Assignments and Grades screens' JSX and the root administrator's screen.
// Each moved verbatim into a module it loads on demand, and each reads what
// it read in the workspace from one object, `scope`, that the workspace
// builds where the code was. Lint cannot see that seam: a name the module
// takes from `scope` that the workspace forgot to put in it is `undefined` at
// run time, with no error until the screen or the action uses it. So the two
// lists are held equal here, name for name.
//
// Which modules a teacher's first load reaches is firstLoadTeacherWorkspace
// .test.mjs's (the third-pass entries of its list); the bytes are the budget's
// (scripts/check-first-load-budget.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repo } from './helpers/firstLoadGraph.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { TEACHER_WORKSPACE_MODULES, teacherWorkspaceSource } from './helpers/appScreens.mjs';

const read = (file) => executableSource(readFileSync(path.join(repo, file), 'utf8'));
const workspace = read('src/app/teacher/TeacherWorkspace.jsx');
const names = (text) => text.split(',').map((name) => name.trim()).filter(Boolean);

// What a module destructures from `scope`, in its one factory or render function.
const taken = (file, fn) => {
  const source = read(file);
  const match = new RegExp(`^export function ${fn}\\(scope\\) \\{\\n {2}const \\{\\n([\\s\\S]*?)\\n {2}\\} = scope;$`, 'm').exec(source);
  assert.ok(match, `${file} opens ${fn}(scope) by taking what it reads from scope`);
  assert.equal((source.match(/(?<!\.)\bscope\b/g) || []).length, 2, `${file} reads scope only there`);
  return names(match[1]).sort();
};
// The object literal the workspace hands it, after `start`.
const handed = (start) => {
  const at = workspace.indexOf(start);
  assert.ok(at >= 0, `the workspace has ${start}`);
  const body = workspace.slice(at + start.length, workspace.indexOf('}', at + start.length));
  return names(body).sort();
};

test('the workspace still runs each module its code moved into (or teacherWorkspaceSource proves nothing)', () => {
  assert.equal(TEACHER_WORKSPACE_MODULES.length, 4);
  const combined = teacherWorkspaceSource();
  for (const [file] of TEACHER_WORKSPACE_MODULES) assert.ok(combined.includes(readFileSync(path.join(repo, file), 'utf8')), file);
});

for (const [file, fn, start] of [
  ['src/app/teacher/workspaceAssignmentActions.js', 'createAssignmentActions', 'const assignmentActionScope = {'],
  ['src/app/teacher/assignmentsTabView.jsx', 'renderAssignmentsTab', 'assignmentsTab.renderAssignmentsTab({'],
  ['src/app/teacher/gradebookTabView.jsx', 'renderGradebookTab', 'gradebook.module.renderGradebookTab({'],
  ['src/app/teacher/administrationView.jsx', 'renderAdministration', 'administration.module.renderAdministration({'],
]) {
  test(`${path.basename(file)}: the workspace hands ${fn} exactly what it takes from scope`, () => {
    const takes = taken(file, fn);
    assert.ok(takes.length > 10, `${fn} takes ${takes.length} names`);
    assert.deepEqual(handed(start), takes, `what the workspace puts in scope is what ${fn} reads from it`);
    // Every name handed over is the workspace's own: a prop, or declared in it.
    for (const name of takes) {
      assert.match(workspace, new RegExp(`(?:^ {2}${name},$|\\bconst ${name}\\b|\\bconst \\[[^\\]]*\\b${name}\\b|^import [^;]*\\b${name}\\b[^;]*;$)`, 'm'), `${name} is the workspace's`);
    }
  });
}

test('the actions: the names the factory returns are the names the workspace takes, in order, each from the loaded module', () => {
  const actions = read('src/app/teacher/workspaceAssignmentActions.js');
  const returned = /\n {2}return \{\n([\s\S]*?)\n {2}\};\n\}\n?$/.exec(actions);
  assert.ok(returned, 'the factory ends by returning its actions');
  const list = /^const ASSIGNMENT_ACTIONS = Object\.freeze\(\[\n([\s\S]*?)\n\]\);$/m.exec(workspace);
  assert.ok(list, 'the workspace names the actions it takes');
  const declared = names(list[1]).map((name) => name.replace(/^'|'$/g, ''));
  assert.deepEqual(declared, names(returned[1]));
  for (const name of declared) assert.match(actions, new RegExp(`^ {2}const ${name} = async \\(`, 'm'), `${name} is async, as every caller already treated it`);
  const take = /const \[\n([\s\S]*?)\n {2}\] = ASSIGNMENT_ACTIONS\.map\(assignmentAction\);/.exec(workspace);
  assert.ok(take);
  assert.deepEqual(names(take[1]), declared, 'taken under the same names, in the same order');
  // Built each render from that render's scope: at once when the module is
  // here, else once it has arrived; a failed request reaches AppErrorBoundary
  // through the authoring code's error state.
  const action = region(workspace, 'const assignmentAction = (name) => (...args) => {', '\n  };', 'assignmentAction');
  assert.match(action, /const actions = loadedAssignmentActions\(\);\s*if \(actions\) return actions\.createAssignmentActions\(assignmentActionScope\)\[name\]\(\.\.\.args\);/);
  assert.match(action, /return loadAssignmentActions\(\)\.then\(\s*\(module\) => module\.createAssignmentActions\(assignmentActionScope\)\[name\]\(\.\.\.args\),\s*\(error\) => \{\s*setAuthoringKitError\(error\);\s*throw error;\s*\},\s*\);/);
  // None of them is declared in the workspace any more.
  for (const name of declared) assert.doesNotMatch(workspace, new RegExp(`\\bconst ${name} = `), name);
});

test('the actions load once per page, and the idle prefetch asks for them before the authoring code', () => {
  const loader = read('src/app/teacher/authoringKitLoader.js');
  assert.match(loader, /if \(!actionsPending\) actionsPending = import\('\.\/workspaceAssignmentActions\.js'\)\.then\(\(actions\) => \{ actionsLoaded = actions; return actions; \}\);/);
  assert.equal((loader.match(/\bactionsPending = /g) || []).length, 2, 'declared, and set once by the request');
  assert.match(loader, /export const prefetchAuthoringKit = \(win\) => prefetchOnce\(\[actionsCode, authoringCode\], win\);/);
});

test('the Assignments screen waits for its JSX as it waits for the authoring code, both asked for at once', () => {
  const ask = workspace.indexOf("if (teacherTab === 'assignments') assignmentsView.prefetch();");
  const kit = workspace.indexOf("const assignmentListKit = teacherTab === 'assignments' ? (loadedAuthoringKit() || use(loadAuthoringKit())) : null;");
  const view = workspace.indexOf("const assignmentsTab = teacherTab === 'assignments' ? (assignmentsView.loaded() || use(assignmentsView.load())) : null;");
  assert.ok(ask >= 0 && kit > ask && view > kit, 'the JSX is asked for before the wait for the authoring code, so the two downloads overlap');
});

test('the gradebook and Administration: busy and named while their code arrives, and a failure reaches AppErrorBoundary', () => {
  assert.match(workspace, /if \(teacherTab === 'grades' && gradebook\.failure\) throw gradebook\.failure;/);
  const grades = region(workspace, "{teacherTab === 'grades' && (", "{teacherTab === 'gradeTransfer'", 'the Grades screen');
  assert.ok(grades.indexOf('<h2 style={{ marginTop: 0 }}>Gradebook and Evidence</h2>') < grades.indexOf('gradebook.module ?'), 'the heading stands while the gradebook arrives');
  assert.match(grades, /\) : \(\s*<div aria-busy="true">\s*<p role="status"[^>]*>[\s\S]*?'Opening the gradebook…'/);
  const admin = region(workspace, "if (teacherWorkspaceMode === 'administration' && rootAdminUiEligible) {", "\n  }\n", 'the administrator screen');
  assert.match(admin, /^if \(teacherWorkspaceMode === 'administration' && rootAdminUiEligible\) \{\s*if \(administration\.failure\) throw administration\.failure;/);
  assert.match(admin, /<main id=\{MAIN_CONTENT_ID\} tabIndex=\{-1\} aria-busy="true"[^>]*>\s*<p role="status"[^>]*>[\s\S]*?'Opening Administration…'/);
  const panels = read('src/app/teacher/teacherPanels.js');
  for (const [name, file] of [['gradebookView', 'gradebookTabView.jsx'], ['administrationView', 'administrationView.jsx'], ['assignmentsView', 'assignmentsTabView.jsx']]) {
    assert.match(panels, new RegExp(`^export const ${name} = onDemandCode\\(\\(\\) => import\\('\\./${file.replace('.', '\\.')}'\\)\\);$`, 'm'), name);
  }
});

test('the moved modules do not import the lazy screens: App\'s chunk would split, and the student\'s first load grow', () => {
  for (const [file] of TEACHER_WORKSPACE_MODULES) {
    assert.doesNotMatch(read(file), /from '\.\.\/lazyScreens\.js'/, file);
  }
});
