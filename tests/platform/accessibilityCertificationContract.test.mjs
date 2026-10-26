// The WCAG 2.1 AA certification (tests/browser/accessibilityCertification.mjs)
// must keep auditing every student screen it was built for, at both viewports.
// The screens list is imported, not read as text: removing a screen, or
// leaving one without a driver, fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';
import {
  CERTIFIED_SCREENS, SCREENS, STUBBED_PROBE, VIEWPORTS, newScreenContext, sceneLabel, servesStubbedServices,
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
  'teacher-assignments': [null],
  'teacher-assignment-hub': ['drawer', 'progress'],
  'teacher-gradebook': ['table'],
  'teacher-preflight': ['details', 'delivery', 'check'],
  'teacher-live-challenge': ['setup', 'lobby'],
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
  const scene = region(source, 'const axe = await auditAccessibility(', 'results.push({', 'the scene audit');
  assert.match(scene, /screen\.keyboard/, 'only a screen that asks is walked');
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
