import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * "ENLARGE MADE THE GRAPH BIGGER AND LEFT THE ACTIVITY BEHIND."
 *
 * That is the Stage 3A complaint, and this is its verdict without a browser.
 * tests/browser/workViewMatrix.mjs drives the migrated families through
 * QuestionEngine — the surface App.jsx actually mounts, so the platform Undo,
 * task and help are the real ones — on a Chromebook and on an iPhone in both
 * orientations, and records anything that would stop a student finishing the
 * activity inside Work View:
 *
 *   controls   a registered capability with no control, or one off screen
 *   clipped    a control cut off by the viewport or under 44px
 *   cover      something on top of the workspace, or on top of a control
 *   majority   the mathematics gets less than its share of a phone screen
 *   chrome     section tabs, question bubbles or a TEKS badge over the tool
 *   axis       more tick labels than the shared scale service allows
 *   undo       Undo disabled after an edit, or not restoring the state before it
 *   camera     Fit View changing the mathematics instead of only the camera
 *   state      opening, closing or re-entering Work View moving student work
 *
 * The last two are the ones that are about correctness rather than layout, and
 * they are the reason this file exists rather than a screenshot review: PR #185
 * shipped display fitting that rewrote `predictionX`, a mathematical default,
 * and nothing caught it until a student's prediction target had moved.
 *
 * Re-record with:  npx vite --port 5199 --strictPort &
 *                  node tests/browser/workViewMatrix.mjs --write
 */
const audit = JSON.parse(readFileSync('tests/platform/fixtures/workViewMatrixFindings.json', 'utf8'));

test('every Stage 3A family keeps its controls, its state and its Undo in Work View', () => {
  const lines = audit.findings.flatMap(({ device, scene, problems }) => problems
    .map((problem) => `  [${device}] ${scene} — ${problem.rule}: ${problem.detail}`));
  assert.deepEqual(audit.findings, [], `Work View browser matrix recorded findings:\n${lines.join('\n')}`);
});

test('the matrix actually measured the families this stage migrated', () => {
  // An empty findings list means nothing if the run mounted nothing. Three
  // devices times five scenes, and a screenshot for every step of each.
  assert.equal(audit.measured, 15);
  assert.deepEqual(
    [...new Set(audit.scenes.map((scene) => scene.family))].sort(),
    ['FunctionInvestigation2', 'Graphing2', 'InteractiveGraphWorkspace', 'TransformationsLab'],
  );
  assert.ok(audit.screenshots >= audit.measured * 5, 'each scene is captured at every step of the matrix');
});

test('the standard it held them to is the one Stage 3A committed to', () => {
  // A Chromebook, and a phone in BOTH orientations — landscape is where the
  // action rail, the keypad and the browser chrome compete for 390px of height.
  assert.deepEqual(
    audit.devices.map((device) => `${device.id} ${device.width}x${device.height}`),
    ['chromebook 1366x768', 'iphone-portrait 390x844', 'iphone-landscape 844x390'],
  );
  // The readable-axis ceiling is the shared scale service's, not a number this
  // gate invented; the workspace share is the "majority of the viewport" rule
  // from the Stage 3 brief.
  assert.equal(audit.maxAxisLabels, 12);
  assert.ok(audit.minMobileWorkspaceShare > 0.5, 'the mathematics gets the majority of a phone screen');
});
