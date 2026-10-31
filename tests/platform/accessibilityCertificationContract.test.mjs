// The WCAG 2.1 AA certification (tests/browser/accessibilityCertification.mjs)
// must keep auditing every student screen it was built for, at both viewports.
// The screens list is imported, not read as text: removing a screen, or
// leaving one without a driver, fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';

const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
import {
  CERTIFIED_SCREENS, SCREENS, STUBBED_PROBE, VIEWPORTS, newScreenContext, sceneLabel, sceneScope, servesStubbedServices,
} from '../browser/accessibilityCertification.mjs';
import { TEACHER_SCREENS } from '../browser/accessibilityTeacherScreens.mjs';

const REQUIRED_SCREENS = [
  'student-home',
  'student-assignments',
  'student-grades',
  'assignment-tools',
  'my-math-path',
  'secure-exam',
  'live-challenge',
];

test('all seven student screens are certified, each with at least one driven scene', () => {
  const ids = SCREENS.map((screen) => screen.id);
  for (const id of REQUIRED_SCREENS) assert.ok(ids.includes(id), `the accessibility certification no longer audits "${id}"`);
  assert.equal(new Set(ids).size, ids.length, 'screen ids must be unique (they are the ratchet keys)');
  for (const screen of SCREENS) {
    assert.ok(Array.isArray(screen.scenes) && screen.scenes.length > 0, `${screen.id} has no scenes`);
    for (const scene of screen.scenes) assert.equal(typeof scene.run, 'function', `${sceneLabel(screen, scene)} has no driver`);
    assert.ok(['app', 'audit'].includes(screen.harness), `${screen.id} names no harness`);
  }
  const labels = SCREENS.flatMap((screen) => screen.scenes.map((scene) => sceneLabel(screen, scene)));
  assert.equal(new Set(labels).size, labels.length, 'scene labels must be unique');
  // A rich tool is OPEN on the assignment screen, and the secure exam reaches a question.
  const tools = SCREENS.find((screen) => screen.id === 'assignment-tools');
  assert.ok(tools.scenes.length >= 2, 'the assignment screen must open several tools');
  assert.ok(SCREENS.find((screen) => screen.id === 'secure-exam').scenes.some((scene) => scene.id === 'question'));
});

// AX17: a math box's placeholder was 1.66:1 and no scene had a box that showed
// one. The scene must keep waiting for the placeholder it audits.
test('an empty math box with its placeholder showing is among the audited scenes', () => {
  const tools = SCREENS.find((screen) => screen.id === 'assignment-tools');
  assert.ok(tools.scenes.some((scene) => scene.id === 'math-box-placeholder'), 'the assignment tools audit an empty math box');
  const source = executableSource(readFileSync(new URL('../browser/accessibilityCertification.mjs', import.meta.url), 'utf8'));
  const scene = region(source, 'const openMathBoxPlaceholder', '\n};', 'the placeholder scene');
  assert.match(scene, /uxQuestion\('ux-simple'/, 'a question whose answer box is empty');
  assert.match(scene, /\[part="placeholder"\]/, 'and waits until the placeholder is drawn, so it audits what it names');
});

// TT27: the teacher's screens, written out. The ratchet counts per screen id, so a
// screen dropped from the list stops being counted without any count changing:
// the ids are named here, and not read back from the list they check.
const REQUIRED_TEACHER_SCREENS = {
  'teacher-home': [null],
  'teacher-live-class': ['walkthrough', 'attention'],
  'teacher-assignments': [null, 'class-list', 'card-menu'],
  'teacher-assignment-hub': ['drawer', 'progress'],
  'teacher-gradebook': ['table'],
  'teacher-preflight': ['details', 'delivery', 'check'],
  'teacher-live-challenge': ['setup', 'lobby'],
  // The third slice: the rest of the navigation's destinations, a class's page, a student's drawer, the Find palette,
  // the TEKS screen's views, the Path Simulator's modes, and the administrator's five sections.
  'teacher-classes': [null, 'class'],
  'teacher-students': [null, 'drawer'],
  'teacher-library': [null],
  'teacher-weekly-path': [null],
  'teacher-action-center': [null],
  'teacher-grade-export': [null],
  'teacher-secure-exams': [null],
  'teacher-pacing': [null],
  'teacher-attendance': [null],
  'teacher-parent-contacts': [null],
  'teacher-teks': [null, 'demand', 'ccmr', 'items', 'registry', 'pathway'],
  'teacher-analytics': [null],
  'teacher-math-tools': [null],
  // Not 'session' (a running simulated session): the Tab walk reads a student's tool in it and the Path's own sticky
  // button; see accessibilityTeacherScreens.mjs. The landmarks driver opens it.
  'teacher-simulator': [null, 'week', 'bench'],
  'teacher-find': [null, 'results'],
  'teacher-demo': [null],
  'teacher-schedule': [null],
  'teacher-classroom': [null],
  'teacher-access': [null],
  'teacher-admin': ['classes', 'accounts', 'coverage', 'ai', 'reset'],
};

test('the teacher screens are audited next to the student ones, each scene driven, under one set of unique ratchet keys', () => {
  const ids = CERTIFIED_SCREENS.map((screen) => screen.id);
  assert.equal(new Set(ids).size, ids.length, 'screen ids are the ratchet keys: they cannot repeat across the student and teacher lists');
  for (const [id, scenes] of Object.entries(REQUIRED_TEACHER_SCREENS)) {
    const screen = TEACHER_SCREENS.find((entry) => entry.id === id);
    assert.ok(screen, `the accessibility certification no longer audits the teacher screen "${id}"`);
    assert.ok(CERTIFIED_SCREENS.includes(screen), `${id} is in the list the run audits`);
    assert.deepEqual(screen.scenes.map((scene) => scene.id), scenes, `${id}: its scenes`);
    for (const scene of screen.scenes) assert.equal(typeof scene.run, 'function', `${sceneLabel(screen, scene)} has no driver`);
    assert.equal(screen.harness, 'app', `${id} is the real app in memory`);
  }
  assert.deepEqual(TEACHER_SCREENS.map((screen) => screen.id).sort(), Object.keys(REQUIRED_TEACHER_SCREENS).sort(), 'no teacher screen is audited without being named here');
  // The student list is what the other drivers (large text, names, landmarks) import: it stays the student's.
  assert.ok(SCREENS.every((screen) => !screen.id.startsWith('teacher-')), 'SCREENS is the student list');
  assert.ok(CERTIFIED_SCREENS.length === SCREENS.length + TEACHER_SCREENS.length);
});

// Every destination of the teacher's navigation has a scene (TT27, third slice). The list is read from the navigation itself, so a
// destination added to it without a scene fails here and is audited from the day it lands, not found by hand later.
test('each of the teacher navigation\'s destinations is opened by a scene', () => {
  const sidebar = read('src/TeacherSidebar.jsx');
  const labels = [...region(sidebar, 'const TAB_LABELS = {', '};', 'the navigation\'s labels').matchAll(/^\s*\w+: '([^']+)',$/gm)].map((match) => match[1]);
  assert.equal(labels.length, 22, 'the navigation has 22 destinations');
  const scenes = executableSource(readFileSync(new URL('../browser/accessibilityTeacherScreens.mjs', import.meta.url), 'utf8'));
  // The administrator's workspace is the "Student Access" destination for the root administrator, and is audited through its own sections.
  for (const label of labels) {
    const opened = new RegExp(`(?:goTo\\(page, |openDestination\\()'${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(scenes);
    assert.ok(opened, `"${label}" is opened by a scene (goTo / openDestination in accessibilityTeacherScreens.mjs)`);
  }
});

test('the teacher\'s modals are audited as the dialog, and the Find palette is a screen of its own', () => {
  const students = TEACHER_SCREENS.find((screen) => screen.id === 'teacher-students');
  assert.equal(students.scenes.find((scene) => scene.id === 'drawer').include, '[data-student-profile-drawer]');
  assert.equal(students.scenes.find((scene) => scene.id === null).include, undefined, 'and the page itself is audited whole');
  assert.equal(TEACHER_SCREENS.find((screen) => screen.id === 'teacher-find').include, '[aria-label="Find a student, class, assignment or standard"]');
  assert.match(read('src/components/teacher/StudentProfileDrawer.jsx'), /data-student-profile-drawer=/, 'the drawer carries the hook');
  assert.match(read('src/components/teacher/TeacherQuickSearch.jsx'), /aria-label="Find a student, class, assignment or standard"/, 'the palette carries the name');
});

test('every teacher screen opens on the school clock and is walked by Tab; a modal is audited as the dialog, not the page behind its scrim', () => {
  for (const screen of TEACHER_SCREENS) {
    assert.equal(screen.schoolClock, true, `${screen.id}: its bell schedule reads the clock, so it opens on the school's`);
    assert.equal(screen.keyboard, true, `${screen.id}: it is walked by Tab as well as by axe`);
  }
  // The two modal screens: axe and the contrast review read the page behind a scrim as covered, undecided text.
  assert.equal(TEACHER_SCREENS.find((screen) => screen.id === 'teacher-preflight').include, '[aria-label="Lesson pre-flight review"]');
  assert.equal(TEACHER_SCREENS.find((screen) => screen.id === 'teacher-assignment-hub').include, '[data-assignment-hub]');
  assert.equal(SCREENS.some((screen) => screen.schoolClock || screen.keyboard), false, 'the student screens are unchanged');
});

test('a scene audits and is walked as it says, and otherwise as its screen does', () => {
  const screen = { include: '[data-modal]', exclude: '.stand-in', keyboard: true };
  assert.deepEqual(sceneScope(screen, {}), { include: '[data-modal]', exclude: '.stand-in', keyboard: true }, 'a scene with nothing to say is its screen\'s');
  assert.deepEqual(sceneScope(screen, { include: '.menu', keyboard: false }), { include: '.menu', exclude: '.stand-in', keyboard: false }, 'a scene can name its own region and decline the walk');
  assert.deepEqual(sceneScope({}, { keyboard: false }), { include: undefined, exclude: undefined, keyboard: false });
  assert.deepEqual(sceneScope({ keyboard: false }, { keyboard: true }), { include: undefined, exclude: undefined, keyboard: true });
  // The contrast review reads the same scope as axe: a region axe does not audit is not one it decides.
  const review = executableSource(readFileSync(new URL('../browser/contrastReview.mjs', import.meta.url), 'utf8'));
  assert.match(review, /const scope = sceneScope\(screen, scene\);/);
  assert.match(review, /collectInPage, \{ include: asList\(scope\.include\), exclude: asList\(scope\.exclude\) \}/);
});

// TT27 slice 2: the class selector's list and a card's ⋮ menu are scenes of the Assignments screen, each
// opened as a keyboard teacher opens it. The scene is not reached unless focus lands inside the pop-up, so
// the audit fails if those keys stop working. Each audits the pop-up itself (the page behind it is read as
// covered, undecided text, as the page behind a modal is), and is not walked by Tab, because Tab closes a
// pop-up: the walk would read the page behind one that a keyboard teacher cannot be on.
test('the two pop-up scenes are opened by keyboard, wait for focus to land inside, audit the pop-up and are not walked', () => {
  const assignments = TEACHER_SCREENS.find((screen) => screen.id === 'teacher-assignments');
  const popups = assignments.scenes.filter((scene) => ['class-list', 'card-menu'].includes(scene.id));
  assert.equal(popups.length, 2);
  for (const scene of popups) assert.equal(scene.keyboard, false, `${scene.id}: not walked by Tab`);
  for (const scene of assignments.scenes.filter((entry) => !popups.includes(entry))) assert.deepEqual(sceneScope(assignments, scene), { include: undefined, exclude: undefined, keyboard: true }, 'the page itself is audited whole and walked');
  assert.equal(popups.find((scene) => scene.id === 'class-list').include, '[role="listbox"][aria-label="Class"]');
  const hook = popups.find((scene) => scene.id === 'card-menu').include.match(/^\[(data-[a-z-]+)\]$/)?.[1];
  assert.ok(hook, 'the card menu is found by a data hook');
  assert.match(read('src/AssignmentCardMenu.jsx'), new RegExp(`${hook}=""`), 'which the menu carries');
  const source = executableSource(readFileSync(new URL('../browser/accessibilityTeacherScreens.mjs', import.meta.url), 'utf8'));
  const classList = region(source, 'const openClassList = async', '\n};', 'the class list scene');
  assert.match(classList, /locator\('button\[aria-haspopup="listbox"\]'\)\.first\(\)\.focus\(\)/);
  assert.match(classList, /keyboard\.press\('ArrowDown'\)/, 'a key, not a click');
  assert.match(classList, /focusIsOnItem\(page, 'listbox', 'option'\)/, 'and focus must have gone in');
  const cardMenu = region(source, 'const openCardMenu = async', '\n};', 'the card menu scene');
  assert.match(cardMenu, /getByRole\('button', \{ name: \/\^More actions for\/ \}\)\.first\(\)\.focus\(\)/);
  assert.match(cardMenu, /keyboard\.press\('Enter'\)/, 'a key, not a click');
  assert.match(cardMenu, /focusIsOnItem\(page, 'menu', 'menuitem'\)/, 'and focus must have gone in');
  const wait = region(source, 'const focusIsOnItem', '], { timeout: 10_000 });', 'the focus wait');
  assert.match(wait, /active\?\.getAttribute\('role'\) === item && Boolean\(active\.closest\(/, 'on an item of that pop-up, not merely somewhere');
  // A pop-up one scene leaves open is closed the way a teacher closes it, so the next scene starts from the page.
  const closer = region(source, 'const closePopups = async', '\n};', 'closing a pop-up');
  assert.match(closer, /keyboard\.press\('Escape'\)/);
});

test('a screen on the school clock gets the school\'s browser context, and any other the plain one', async () => {
  const made = [];
  const browser = { newContext: async (options) => { made.push(['plain', options]); return { plain: true }; } };
  assert.deepEqual(await newScreenContext(browser, { schoolClock: false }, { viewport: { width: 1 } }), { plain: true });
  assert.deepEqual(made, [['plain', { viewport: { width: 1 } }]]);
  // The school's context is the plain one in the school's zone, with Date on the school's clock.
  const added = [];
  const schoolBrowser = { newContext: async (options) => ({ options, addInitScript: async (...args) => { added.push(args.length); } }) };
  const context = await newScreenContext(schoolBrowser, { schoolClock: true }, { viewport: { width: 2 } });
  assert.equal(context.options.timezoneId, 'America/Chicago');
  assert.deepEqual(context.options.viewport, { width: 2 });
  assert.equal(added.length, 1, 'the school clock is installed on the context');
});

test('the run walks a screen that asks for it by Tab, counts what it finds into the same keys as axe, and cannot pass without a walk', () => {
  const source = executableSource(readFileSync(new URL('../browser/accessibilityCertification.mjs', import.meta.url), 'utf8'));
  const scene = region(source, 'const scope = sceneScope(screen, scene);', 'results.push({', 'the scene audit');
  assert.match(scene, /const scope = sceneScope\(screen, scene\);/, 'what a scene audits and walks is its own, else its screen\'s');
  assert.match(scene, /auditAccessibility\(page, \{ name: label, viewport: viewport\.id, include: scope\.include, exclude: scope\.exclude \}\)/);
  assert.match(scene, /if \(scope\.keyboard\) \{/, 'only what asks is walked');
  assert.match(scene, /await auditKeyboardReach\(page,/);
  assert.match(scene, /mergeNormalized\(axe, keyboard\)/, 'the findings join axe\'s counts');
  assert.match(scene, /compare\(baselineCounts, audit\.counts,/, 'the verdict is of the merged counts');
  assert.match(scene, /unreachable\.push\([^)]*the Tab walk failed/, 'a walk that failed leaves the scene unreached, which fails the run');
  const walker = executableSource(readFileSync(new URL('../browser/accessibilityKeyboardReach.mjs', import.meta.url), 'utf8'));
  const finish = region(walker, 'if (!stops.length) throw new Error(', 'if (!completed && !trap)', 'the end of the walk');
  assert.match(finish, /^if \(!stops\.length\) throw new Error\(`the Tab walk found no stop/, 'no stop at all is an error, not a clean screen');
});

test('both viewports: Chromebook 1366×768 and phone 390×844', () => {
  const sizes = VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`);
  assert.ok(sizes.includes('1366x768'), `viewports: ${sizes.join(', ')}`);
  assert.ok(sizes.includes('390x844'), `viewports: ${sizes.join(', ')}`);
  assert.equal(new Set(VIEWPORTS.map((viewport) => viewport.id)).size, VIEWPORTS.length);
});

test('the run audits every viewport × every (selected) screen × every scene, in the light theme, against the ratchet', () => {
  const source = executableSource(readFileSync(new URL('../browser/accessibilityCertification.mjs', import.meta.url), 'utf8'));
  const run = region(source, 'const main = async', 'const current = mergeNormalized', 'certification main loop');
  assert.match(run, /for \(const viewport of VIEWPORTS\)/, 'the loop must cover every viewport');
  assert.match(run, /for \(const screen of screens\)/, 'the loop must cover the selected screens');
  assert.match(run, /SCREENS\.filter\(\(screen\) => !ONLY\.size \|\| ONLY\.has\(screen\.id\)\)/, 'only ONLY may narrow the screens');
  assert.match(run, /for \(const scene of screen\.scenes\)/, 'every scene is audited');
  assert.match(run, /colorScheme: 'light'/, 'the certification runs in the light theme');
  assert.match(run, /auditAccessibility\(page,/, 'each scene is audited with axe');
  const verdict = region(source, 'const comparison = compare(', 'process.exitCode = 1;\n  } else', 'certification verdict');
  assert.match(verdict, /ratchetFailed\(comparison\)/);
  assert.match(verdict, /unreachable\.length/, 'an unreachable screen fails the run');
});

// The secure exam's screens need the emulator config's stubbed services. A
// plain dev server on the audit port serves the same page wired to the real
// ones, and its start screen never loaded ("could not reach the screen" after
// 180 s, wave 6). The run recognises that server by how the Test Cycle card
// imports its service, and then starts a stubbed one of its own.
test('the certification tells the stubbed audit server from a plain one', () => {
  assert.equal(STUBBED_PROBE, '/src/components/student/TestCycleCard.jsx');
  // What each server serves for the card (Vite's import rewriting, as seen).
  assert.equal(servesStubbedServices('import { getStudentTestCycle } from "/tests/browser/emulator/testCycleServiceStub.js";'), true);
  assert.equal(servesStubbedServices('import { getStudentTestCycle } from "/src/services/testCycleService.js";'), false);
  assert.equal(servesStubbedServices(''), false);
  assert.equal(servesStubbedServices(undefined), false);
  // The emulator config still swaps that service for that stub.
  const config = readFileSync(new URL('../browser/emulator/vite.config.mjs', import.meta.url), 'utf8');
  assert.match(config, /\[path\.join\(repo, 'src\/services\/testCycleService\.js'\), path\.join\(here, 'testCycleServiceStub\.js'\)\]/);
  // And the card still imports the service the probe reads.
  const card = readFileSync(new URL('../../src/components/student/TestCycleCard.jsx', import.meta.url), 'utf8');
  assert.match(card, /from '\.\.\/\.\.\/services\/testCycleService\.js'/);
});

// In CI the workflow starts the stubbed server; a wrong one there is a
// mis-wired workflow, so the run fails instead of starting its own.
test('under CI the certification fails on a plain audit server instead of working around it', () => {
  const source = executableSource(readFileSync(new URL('../browser/accessibilityCertification.mjs', import.meta.url), 'utf8'));
  const probe = source.indexOf('!await auditOriginIsStubbed(origins.audit)');
  const ciGuard = source.indexOf("if (process.env.CI === 'true')", probe);
  const start = source.indexOf('await startStubbedAuditServer()', probe);
  assert.ok(probe > 0 && ciGuard > probe && start > ciGuard, 'the CI check sits between the probe and the server start');
  assert.match(source.slice(ciGuard, start), /throw new Error\(/);
});

// TT27, third slice. A screen whose callable the harness does not fake draws the harness's own banner where its content
// goes; four of the third slice's scenes did, and passed axe on an error. The run now fails a scene that shows the banner,
// and the words it looks for are the words the harness writes.
test('the run fails a teacher or student app scene that shows the harness\'s "no fake for the callable" banner', () => {
  const run = executableSource(readFileSync(new URL('../browser/accessibilityCertification.mjs', import.meta.url), 'utf8'));
  const check = region(run, "if (screen.harness === 'app') {", "const total = Object.values(audit.counts)", 'the app screens\' checks');
  assert.match(check, /\/has no fake for the callable\/\.test\(document\.body\?\.innerText \|\| ''\)/, 'it reads the page\'s text for the banner');
  assert.match(check, /harnessBanners\.push\(/);
  assert.match(run, /titleFailures\.length \|\| harnessBanners\.length\) \{\s*console\.error\(`\\nAccessibility certification FAILED/, 'and a banner fails the run');
  const fakes = readFileSync(new URL('../browser/teacherWorkflow/fakeFunctions.js', import.meta.url), 'utf8');
  assert.match(fakes, /The teacher harness has no fake for the callable "\$\{name\}"/, 'the harness still says it in those words');
});

// The Math Tools Lab opens its first tool in the full-screen Work View on a wide screen: a modal over the page, the student's
// own. The scene audits the page, so it closes it (nothing to close on a phone), and leaves out only the label text of the
// shared coordinate plane, where the Lab's sample draws a line through the labels.
test('the Math Tools Lab scene closes the Work View and leaves out only the plane\'s label text', () => {
  const lab = TEACHER_SCREENS.find((screen) => screen.id === 'teacher-math-tools');
  assert.deepEqual(lab.exclude, ['svg[role="application"] text']);
  assert.deepEqual(lab.scenes.map((scene) => scene.include ?? null), [null], 'the page itself is audited');
  const scenes = executableSource(readFileSync(new URL('../browser/accessibilityTeacherScreens.mjs', import.meta.url), 'utf8'));
  const open = region(scenes, 'const openMathToolsLab = async (page) => {', '\n};', 'the Lab\'s opener');
  assert.match(open, /openDestination\('Math Tools Lab', \/\^Math Tools Lab\$\/\)\(page\)/);
  assert.match(open, /getByRole\('button', \{ name: \/Close full screen\/ \}\)/);
  assert.match(open, /if \(await close\.count\(\)\)/, 'only when it is open: a phone has none');
});

// The four scenes whose callables the harness now answers (fakeAdminScreens.js) are registered without replacing a callable
// fakeFunctions.js implements itself.
test('the Classroom and administrator callables are registered after the harness\'s own, and never over them', () => {
  const fakes = readFileSync(new URL('../browser/teacherWorkflow/fakeFunctions.js', import.meta.url), 'utf8');
  assert.match(fakes, /import \{ adminScreenHandlers \} from '\.\/fakeAdminScreens\.js';/);
  assert.match(fakes, /Object\.entries\(adminScreenHandlers\)\.forEach\(\(\[name, handler\]\) => \{ if \(!handlers\[name\]\) handlers\[name\] = handler; \}\);/);
});

