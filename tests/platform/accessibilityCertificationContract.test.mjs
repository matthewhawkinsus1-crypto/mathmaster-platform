// The WCAG 2.1 AA certification (tests/browser/accessibilityCertification.mjs)
// must keep auditing every student screen it was built for, at both viewports.
// The screens list is imported, not read as text: removing a screen, or
// leaving one without a driver, fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';
import { SCREENS, VIEWPORTS, sceneLabel } from '../browser/accessibilityCertification.mjs';

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
