// THE TEACHER WORKSPACE'S MAIN LANDMARK AND SKIP LINK (TT27, slice 2).
//
// The teacher workspace had no <main> and no skip link, so a keyboard teacher passed
// 23 navigation stops (the collapse button and 22 destinations) and the header's Find
// and Log Out before the content of every screen. The student shell has both
// (SkipToContent, MAIN_CONTENT_ID, App.jsx renderStudentIdentityShell); the workspace
// now draws the same link first, and its screen is the main the link goes to.
//
// Exactly one main per page is what a screen reader's landmark list (and axe's
// landmark-one-main / landmark-no-duplicate-main) expects, and a <main> inside a
// <main> is not valid HTML. Four teacher components drew a main of their own, which was
// right while the workspace had none and is a second one now: the Pre-Flight review's
// student preview (the case the owner named), the response inspector, the Math Tools
// Lab and the Live Challenge projector. They are plain elements now.
//
// Node cannot render the workspace; this reads the markup. The browser proof counts the
// landmarks of every screen and of the dialogs on top of them, and presses the link:
// tests/browser/accessibilityTeacherLandmarks.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { executableSource, region } from './helpers/sourceContract.mjs';

const root = new URL('../../', import.meta.url);
const read = (file) => executableSource(readFileSync(new URL(file, root), 'utf8'));
const workspace = read('src/app/teacher/TeacherWorkspace.jsx');

test('the workspace takes the skip link and the target id from the shared page chrome, as the student shell does', () => {
  assert.match(workspace, /import \{ MAIN_CONTENT_ID, SkipToContent \} from '\.\.\/\.\.\/components\/common\/pageChrome\.jsx';/);
  const student = read('src/App.jsx');
  assert.match(student, /import \{ MAIN_CONTENT_ID, SkipToContent, pageTitleFor, useDocumentTitle \} from '\.\/components\/common\/pageChrome\.jsx';/, 'the student shell uses the same two');
});

test('the first thing the teacher workspace draws is the skip link, ahead of every dialog and the navigation', () => {
  assert.match(
    workspace,
    /backgroundColor: 'var\(--mm-surface-sunken\)', minHeight: '100vh', padding: '20px' \}\}>\s*(?:\{\s*\}\s*)?<SkipToContent \/>\s*\{renderDeleteAssignmentDialog\(\)\}/,
    'the link opens the workspace\'s root, before the dialogs (which are siblings of the shell) and the shell',
  );
});

test('the screen is the main landmark the link goes to, and the navigation and the header are outside it', () => {
  const main = '<main id={MAIN_CONTENT_ID} tabIndex={-1}';
  assert.equal(workspace.split(main).length - 1, 2, 'one for the teacher\'s screen and one for the administrator\'s');
  const teacher = workspace.slice(workspace.indexOf('<div className="mm-dashboard-shell"'));
  const [nav, header, screen] = [teacher.indexOf('<TeacherSidebar'), teacher.indexOf('<header style={{ padding: \'clamp('), teacher.indexOf(main)];
  assert.ok(nav >= 0 && header > nav && screen > header, 'the navigation, then the header, then the main: both before it, so neither is inside it');
  assert.ok(teacher.indexOf('</main>') > screen, 'and the main is closed after the screen');
  assert.ok(!teacher.slice(screen, teacher.indexOf('</main>')).includes('<TeacherSidebar'), 'the navigation is not inside it');
  const inside = teacher.slice(screen, teacher.indexOf('</main>'));
  assert.match(inside, /<div className="mm-dashboard-content" style=\{\{ padding: '30px' \}\}>/, 'it wraps the content area, whose class carries the tables\' and headings\' rules, and is not that area itself');
  assert.doesNotMatch(teacher.slice(screen, screen + 60), /className=/, 'so the main does not take those rules, which the Pre-Flight review inside it must not');
  // Exactly the two mains: any other would nest in these.
  assert.equal((workspace.match(/<main[\s>]/g) || []).length, 2);
});

// The student preview in the Pre-Flight review draws its work area as the page's main wherever no main is around
// it (MobileViewportContainer: it is a main "only where no host gave one"), and the review is a dialog drawn
// over the screen: outside the screen's main, the preview made a second one, at both layouts. Inside it, it
// does not.
test('the Pre-Flight review is drawn inside the main, so the work area of its student preview finds a main around it', () => {
  const mainStart = workspace.indexOf('<main id={MAIN_CONTENT_ID} tabIndex={-1}>');
  const review = workspace.indexOf('<LessonPreflightModal');
  const content = workspace.indexOf('<div className="mm-dashboard-content"');
  assert.ok(mainStart > 0 && review > mainStart && review < content, 'in the main, ahead of the content area');
  assert.equal(workspace.split('<LessonPreflightModal').length - 1, 1, 'drawn once');
  assert.match(workspace.slice(mainStart, review), /^\s*<main id=\{MAIN_CONTENT_ID\} tabIndex=\{-1\}>\s*\{assignmentPreflight && \(\s*$/, 'first thing in it, when a review is open');
  const host = read('src/components/student/MobileViewportContainer.jsx');
  assert.match(host, /closest\('main, \[role="main"\]'\)/, 'the work area looks for a main around it (student code, unchanged)');
  assert.match(host, /role=\{hostHasMain \? undefined : 'main'\}/);
});

test('the administrator\'s workspace has the link and the target on its own main', () => {
  const admin = region(workspace, "if (teacherWorkspaceMode === 'administration' && rootAdminUiEligible) {", '<header style={{', 'the administrator workspace');
  assert.match(admin, /<SkipToContent \/>/, 'its link');
  const main = region(workspace, '<div role="tablist" aria-label="Administration sections"', '</main>', 'the administrator screen');
  assert.match(main, /<main id=\{MAIN_CONTENT_ID\} tabIndex=\{-1\} style=\{\{ padding: 28 \}\}>/, 'its main, with its screen inside');
});

// The mains that were drawn by components that render inside the workspace.
const TEACHER_FILES = [
  'src/components/teacher/LessonPreflightModal.jsx',
  'src/components/teacher/StudentResponseInspector.jsx',
  'src/dev/MathToolsLab.jsx',
  'src/components/liveChallenge/LiveChallengeArenaProjector.jsx',
];

test('no teacher component draws a main of its own: the Pre-Flight preview, the inspector, the Math Tools Lab and the projector are plain elements', () => {
  for (const file of TEACHER_FILES) {
    assert.doesNotMatch(read(file), /<main[\s>]|<\/main>|role="main"/, `${file} would be a second main inside the workspace's`);
  }
  // The Pre-Flight preview keeps its place and its styling: it is the same box, as a div, as the narrow layout already had.
  const preview = region(read('src/components/teacher/LessonPreflightModal.jsx'), '<aside style={{ width: \'min(280px, 34vw)\'', '</div>\n        ))}', 'the wide preview');
  assert.match(preview, /<div style=\{\{ flex: 1, padding: 16, background: 'var\(--mm-surface\)', minWidth: 0 \}\}>\{studentPreview\}<\/div>/);
});

const walk = (directory) => readdirSync(directory).flatMap((entry) => {
  const file = path.join(directory, entry);
  return statSync(file).isDirectory() ? walk(file) : [file];
});

test('and nothing else under the teacher\'s directories does either (a new one must not nest a main in the workspace\'s)', () => {
  const offenders = [];
  for (const directory of ['src/components/teacher', 'src/app/teacher']) {
    for (const file of walk(new URL(directory, root).pathname)) {
      if (!file.endsWith('.jsx') || file.endsWith('app/teacher/TeacherWorkspace.jsx')) continue;
      if (/<main[\s>]|role="main"/.test(executableSource(readFileSync(file, 'utf8')))) offenders.push(path.relative(new URL('.', root).pathname, file));
    }
  }
  assert.deepEqual(offenders, [], 'a main in these files would sit inside the workspace\'s');
});
