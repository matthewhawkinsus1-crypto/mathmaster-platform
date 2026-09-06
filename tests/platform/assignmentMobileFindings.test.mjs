import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * "Most of the assignment is almost impossible to complete on mobile."
 *
 * That complaint is now a standard, and this is its verdict without a browser.
 * tests/browser/assignmentMobile.mjs drives composed assignment questions
 * through QuestionEngine — the surface App.jsx actually mounts — at 344, 360
 * and 390px, and records anything that would stop a student finishing:
 *
 *   sideways    the page scrolls horizontally
 *   prompt      the task or the answer control is off the first screen
 *   reach       a control cannot be scrolled into view
 *   tap         a control under 44px tall
 *   plane       a graph too small to read the shape of
 *   enlarge     the enlarged workspace cannot be answered in, or left
 *   precision   a plane the student marks with no way to be exact without
 *               landing a fingertip on a lattice point
 *
 * Re-record with:  npx vite --port 5199 --strictPort &
 *                  node tests/browser/assignmentMobile.mjs --write
 */
const audit = JSON.parse(readFileSync('tests/platform/fixtures/assignmentMobileFindings.json', 'utf8'));

test('a composed assignment question can be finished on a 360-390px phone', () => {
  const lines = audit.findings.flatMap(({ device, scene, problems }) => problems
    .map((problem) => `  [${device}] ${scene} — ${problem.rule}: ${problem.detail}`));
  assert.deepEqual(audit.findings, [], `browser audit recorded findings:\n${lines.join('\n')}`);
});

test('the audit actually measured something', () => {
  // An empty findings list means nothing if the run mounted nothing. Three
  // devices times five question shapes.
  assert.equal(audit.measured, 15);
  assert.deepEqual(audit.devices.map((device) => device.width).sort((a, b) => a - b), [344, 360, 390]);
  assert.equal(audit.minTap, 44);
});
