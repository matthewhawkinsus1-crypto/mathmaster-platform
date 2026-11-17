import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

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
  // An empty findings list means nothing if the run mounted nothing. Keep this
  // tied to the recorded matrix dimensions so adding Stage 3B+ scenes cannot
  // silently leave this gate pinned to the Stage 3A count.
  assert.equal(audit.measured, audit.devices.length * audit.scenes.length);
  // EVERY FAMILY THIS STAGE MIGRATED, NOT MOST OF THEM. An empty findings file
  // proves nothing about a tool the matrix never mounted, and the list is the
  // only thing standing between "we migrated five families" and a gate that
  // covers four.
  assert.deepEqual(
    [...new Set(audit.scenes.map((scene) => scene.family))].sort(),
    ['ConstraintFunctionBuilder', 'FunctionInvestigation2', 'Graphing2', 'InteractiveGraphWorkspace', 'MultiRelationAlgebra', 'QuestionEngineWorkflow', 'SequenceExplorer', 'StepAlgebra2', 'StepByStepAlgebra', 'SystemsWorkspace', 'TransformationsLab'],
  );
  assert.ok(audit.screenshots >= audit.measured * 5, 'each scene is captured at every step of the matrix');
});

test('the standard it held them to is the one Stage 3A committed to', () => {
  // Certify the real Chromebook baseline, the wider CSS viewport produced by
  // roughly 67% browser zoom, a full desktop, and a phone in BOTH orientations.
  // Landscape is where the action rail, keypad and browser chrome compete for
  // the least vertical space.
  assert.deepEqual(
    audit.devices.map((device) => `${device.id} ${device.width}x${device.height}`),
    [
      'chromebook 1366x768',
      'chromebook-67-percent-css 2039x1146',
      'desktop 1920x1080',
      'iphone-portrait 390x844',
      'iphone-landscape 844x390',
    ],
  );
  // The readable-axis ceiling is the shared scale service's, not a number this
  // gate invented; the workspace share is the "majority of the viewport" rule
  // from the Stage 3 brief.
  assert.equal(audit.maxAxisLabels, 12);
  assert.ok(audit.minMobileWorkspaceShare > 0.5, 'the mathematics gets the majority of a phone screen');
});

test('the matrix reads a tool once it has loaded, not its "Opening Work View…" placeholder, and a tool that never loads fails by name', () => {
  // A fixed 450ms after mounting read the Systems scene's placeholder at a load average of 15 to 24, and the run
  // blamed the tool for arriving late. Each reading waits for the placeholder to go: after the scene mounts and
  // again after Work View opens, before the state the STATE rule compares is read.
  const driver = executableSource(readFileSync('tests/browser/workViewMatrix.mjs', 'utf8'));
  assert.match(driver, /const toolLoaded = \(page\) => page\.waitForFunction\(\s*\(\) => !document\.querySelector\('\.mathmaster-work-view-loading'\),\s*null,\s*\{ timeout: TOOL_LOAD_TIMEOUT_MS \},\s*\)\.then\(\(\) => true, \(\) => false\);/);
  assert.match(driver, /const TOOL_LOAD_TIMEOUT_MS = Number\(process\.env\.WORK_VIEW_TOOL_TIMEOUT_MS\) \|\| 60_000;/);
  const scene = region(driver, 'for (const scene of SCENES) {', 'if (!view.open) {', 'one scene, mounted and opened');
  const mounted = scene.indexOf('await page.waitForSelector(`[data-scene-id="${scene.id}"]`);');
  const firstWait = scene.indexOf('if (!(await toolLoaded(page))) {');
  const embedded = scene.indexOf('const embedded = await page.evaluate(READ_MATH_STATE);');
  const opened = scene.indexOf('const opened = await page.evaluate(OPEN_WORK_VIEW);');
  const secondWait = scene.indexOf('const loadedInView = await toolLoaded(page);');
  const openedState = scene.indexOf('const openedState = await page.evaluate(READ_MATH_STATE);');
  for (const [name, at] of Object.entries({ mounted, firstWait, embedded, opened, secondWait, openedState })) assert.notEqual(at, -1, name);
  assert.ok(mounted < firstWait && firstWait < embedded, 'the first state is read after the tool has loaded');
  assert.ok(opened < secondWait && secondWait < openedState, 'the state in Work View is read after the tool has loaded there');
  // Never loaded: the scene fails, and says why, rather than being measured as an empty tool.
  assert.match(scene, /problems\.push\(\{ rule: 'controls', detail: `the tool was still loading \("Opening Work View…"\) \$\{TOOL_LOAD_TIMEOUT_MS \/ 1000\}s after the scene mounted` \}\);\s*rows\.push\(\{ device: device\.id, scene: scene\.id, opened: false \}\);\s*findings\.push\(\{ device: device\.id, scene: scene\.id, problems \}\);\s*continue;/);
  assert.match(scene, /problems\.push\(\{ rule: 'controls', detail: `the tool was still loading \("Opening Work View…"\) \$\{TOOL_LOAD_TIMEOUT_MS \/ 1000\}s after Work View opened` \}\);\s*rows\.push\(\{ device: device\.id, scene: scene\.id, opened: false \}\);\s*findings\.push\(\{ device: device\.id, scene: scene\.id, problems \}\);\s*continue;/);
  // What it checks is unchanged: the two readings are still compared.
  assert.match(scene, /if \(JSON\.stringify\(openedState\) !== JSON\.stringify\(embedded\)\) \{[\s\S]*?problems\.push\(\{ rule: 'state', detail: 'opening Work View changed the mathematics' \}\);/);
});
