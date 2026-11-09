// THE KEYBOARD SWEEP RUNS IN CI, AS A GATE, AT BOTH SIZES (student-keyboard-ci).
//
// tests/browser/keyboardSweep.mjs walks every student tool, its other modes and the 21 legacy question types with the
// keys alone, and with --gate judges each scene (tests/browser/support/keyboardSweepGate.mjs). No workflow ran it: the
// legacy question walk on a 390×844 touch phone ran by hand (about 42 walks), and the whole sweep had never been run
// with --gate. The accessibility workflow now runs the whole sweep at 1366×768 and on the phone, each in three shards,
// and these pin that: every scene of both sizes is run once, by a job that fails the CI gate when a scene breaks a
// criterion, on the server the page needs, with a report of its own.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { itemsOfShard, parseShard } from '../browser/support/sceneShards.mjs';
import { jobsOf, readWorkflow, runsOnPullRequest, stepsOf } from './helpers/ciWorkflows.mjs';
import { region } from './helpers/sourceContract.mjs';

const WORKFLOW = 'accessibility-certification.yml';
const job = jobsOf(readWorkflow(WORKFLOW))['browser-keyboard-sweep'];
// The sweep's own text, as keyboardSweepGate.test.mjs reads it (its static scan holds a "/*" in a string, which
// executableSource would read as the start of a comment).
const sweep = readFileSync(new URL('../browser/keyboardSweep.mjs', import.meta.url), 'utf8');

test('the sweep cuts any list into slices that are the list again: every scene once, in order', () => {
  const scenes = Array.from({ length: 54 }, (_, at) => ({ toolId: `tool-${at}` }));
  for (let count = 1; count <= 6; count += 1) {
    const slices = Array.from({ length: count }, (_, at) => itemsOfShard(scenes, { index: at + 1, count }));
    assert.deepEqual(slices.flat(), scenes, `${count} shard(s): every scene once, in its place`);
    slices.forEach((slice) => assert.ok(Math.abs(slice.length - scenes.length / count) <= 1, `${count} shard(s): ${slice.length} scenes in a slice`));
  }
  assert.equal(itemsOfShard(scenes, null), scenes, 'no shard: the whole list');
  assert.deepEqual(itemsOfShard([], { index: 1, count: 3 }), [], 'nothing to cut');
});

test('the sweep reads --viewport and --shard before it starts a browser, and runs the phone as a touch phone', () => {
  const viewports = region(sweep, 'const VIEWPORTS = {', '\n};', 'the sweep\'s viewports');
  assert.match(viewports, /chromebook: \{ width: 1366, height: 768, isMobile: false, hasTouch: false \}/);
  assert.match(viewports, /phone: \{ width: 390, height: 844, isMobile: true, hasTouch: true \}/, 'a phone answers touch, as a student\'s does');
  const launch = sweep.indexOf('browser = await chromium.launch(launch);');
  for (const read of ['const VIEWPORT_ID = ', 'const SHARD = parseShard(']) {
    const at = sweep.indexOf(read);
    assert.ok(at > 0 && at < launch, `${read}… comes before the browser starts: a wrong value stops the run first`);
  }
  assert.match(region(sweep, 'if (!VIEWPORTS[VIEWPORT_ID]) {', '\n}', 'an unknown viewport'), /process\.exit\(2\);$/, 'an unknown viewport is refused');
  assert.match(sweep, /browser\.newContext\(\{ viewport: VIEWPORT, deviceScaleFactor: 1, isMobile: DEVICE\.isMobile, hasTouch: DEVICE\.hasTouch \}\)/);
  assert.match(sweep, /const scenes = itemsOfShard\(listed, SHARD\);/, 'the slice is of the scenes the other options leave');
  // A phone's report does not replace the Chromebook's.
  assert.match(sweep, /\.\.\.\(VIEWPORT_ID === 'phone' \? \['phone'\] : \[\]\)/);
});

test('CI runs the whole sweep with --gate at both sizes, in shards that together run every slice', () => {
  assert.ok(job, `${WORKFLOW} has a browser-keyboard-sweep job`);
  const viewports = JSON.parse(job.match(/^ {8}viewport: (\[[\w, ]*\])$/m)?.[1].replace(/(\w+)/g, '"$1"') ?? 'null');
  assert.deepEqual(viewports, ['chromebook', 'phone'], 'the Chromebook and the phone');
  const run = stepsOf(job).filter((step) => /^ {8}run: node tests\/browser\/keyboardSweep\.mjs /m.test(step));
  assert.equal(run.length, 1, 'one sweep step');
  const command = run[0].match(/^ {8}run: (.+)$/m)[1];
  assert.match(command, / --gate( |$)/, 'judged: a scene that breaks a criterion fails the step');
  assert.match(command, / --viewport=\$\{\{ matrix\.viewport \}\}( |$)/);
  const count = Number(command.match(/ --shard=\$\{\{ matrix\.shard \}\}\/(\d+)( |$)/)?.[1]);
  assert.ok(count >= 2, `cut in ${count}`);
  const shards = JSON.parse(job.match(/^ {8}shard: (\[[\d, ]*\])$/m)?.[1] ?? 'null');
  assert.deepEqual(shards, Array.from({ length: count }, (_, at) => at + 1), 'the matrix runs shards 1 to n of the n the command cuts');
  // The whole sweep: no option that leaves scenes out (the phone's legacy scenes are the walk that ran by hand).
  assert.doesNotMatch(command, /--(tool|legacy-only|no-legacy|extras-only|no-extras|host|no-shell)\b/, 'every scene, in the assignment shell');
  assert.doesNotMatch(command, /--out=/, 'the report the job keeps');
  assert.match(job, /^ {4}name: browser-keyboard-sweep \(\$\{\{ matrix\.viewport \}\} \$\{\{ matrix\.shard \}\}\/\d+\)$/m, 'a failed shard says which it is');
  assert.match(job, /^ {6}fail-fast: false$/m, 'every shard runs and reports');
  assert.match(job, /^ {10}name: keyboard-sweep-\$\{\{ matrix\.viewport \}\}-\$\{\{ matrix\.shard \}\}$/m, 'each shard keeps its own report');
  assert.match(job, /^ {10}path: tests\/browser\/artifacts\/keyboard$/m, 'where the sweep writes it');
  assert.equal(parseShard(`1/${count}`).count, count);
});

test('the sweep step is pointed at the stubbed harness server the job starts, and the gate decides its exit', () => {
  const steps = stepsOf(job);
  const at = steps.findIndex((step) => /run: node tests\/browser\/keyboardSweep\.mjs /.test(step));
  assert.ok(steps.slice(0, at).some((step) => /npx vite --config tests\/browser\/emulator\/vite\.config\.mjs --host 127\.0\.0\.1 --port 5199 --strictPort/.test(step)), 'the server starts first');
  assert.match(steps[at], /AUDIT_ORIGIN: "http:\/\/127\.0\.0\.1:5199"/);
  assert.match(steps[at], /PLAYWRIGHT_MODULE: playwright/);
  assert.match(sweep, /const verdict = gateVerdict\(tools\);[\s\S]*process\.exit\(verdict\.ok \? 0 : 1\);/, 'the step fails with the verdict');
  assert.match(job, /^ {4}timeout-minutes: \d+$/m);
});

test('a pull request that changes the sweep, its page, its gate or the phone\'s keypad runs it', () => {
  for (const file of ['tests/browser/keyboardSweep.mjs', 'tests/browser/keyboardSweep.html', 'tests/browser/keyboardSweepMain.jsx',
    'tests/browser/support/keyboardSweepGate.mjs', 'tests/browser/support/sceneShards.mjs', 'tests/browser/support/touchEmulation.mjs',
    'src/components/student/MobileViewportContainer.jsx', 'src/platform/mobile/mobileFocusViewport.js']) {
    assert.ok(runsOnPullRequest(WORKFLOW, file), `a change to ${file} runs the sweep`);
  }
});
