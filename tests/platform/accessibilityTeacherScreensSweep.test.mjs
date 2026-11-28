// THE TEACHER SCREENS' ACCESSIBILITY SWEEP, WIRED INTO CI (2026-11-28).
//
// tests/browser/teacherScreensA11ySweep.mjs opens the teacher screens added in November (results with the signals and
// worked examples, Case Review, the Response Inspector, Pre-Flight, Grade Export with its TEAMS sync, the Discipline
// Tracker, Live Classroom and the Library) at 1366×900 and 390×844, light, dark and forced colours, and fails on any
// finding no owner has a decision on (docs/audits/2026-11-28-teacher-screens-a11y.md). These pin that the sweep keeps
// those screens and sizes and modes, that CI runs every one of its shards on every pull request that could change what
// it reads, and that each shard stays inside the job's time.

import assert from 'node:assert/strict';
import test from 'node:test';

import { CI_AREAS } from '../../scripts/lib/ciAreas.mjs';
import { itemsOfShard } from '../browser/support/sceneShards.mjs';
import { OWNER_DECISIONS, SWEEP_MODES, SWEEP_SCREENS, SWEEP_VIEWPORTS } from '../browser/teacherScreensA11ySweep.mjs';
import { jobsOf, readWorkflow, stepsOf } from './helpers/ciWorkflows.mjs';

const workflow = readWorkflow('accessibility-certification.yml');
const job = jobsOf(workflow)['browser-teacher-a11y-sweep'];

test('the sweep keeps the November teacher screens, both sizes and the three colour modes', () => {
  assert.deepEqual(SWEEP_SCREENS.map((screen) => screen.id).sort(), [
    'case-review', 'discipline', 'grade-export', 'library', 'live-class', 'preflight', 'response-inspector', 'results',
  ]);
  assert.deepEqual(SWEEP_VIEWPORTS.map(({ width, height }) => `${width}x${height}`), ['1366x900', '390x844']);
  assert.ok(SWEEP_VIEWPORTS[1].isMobile && SWEEP_VIEWPORTS[1].hasTouch, 'the phone is a touch phone');
  assert.deepEqual(SWEEP_MODES, ['light', 'dark', 'forced']);
  // The scenes that carry a fix's assertion (the audit's "Fixed" rows).
  const scene = (screenId, sceneId) => SWEEP_SCREENS.find((entry) => entry.id === screenId)?.scenes.find((entry) => entry.id === sceneId);
  assert.ok(scene('grade-export', 'review')?.dialog?.opener, 'Grade Export\'s review is opened by keyboard, and focus must come back to Export');
  assert.ok(scene('library', 'folder-dialog')?.dialog?.opener, 'the Library\'s folder dialog is opened by keyboard, and focus must come back to + New');
  assert.equal(typeof scene('library', 'folder-actions')?.assert, 'function', 'the folder actions are driven by keyboard');
  for (const [screenId, sceneId] of [['grade-export', 'teams-sync'], ['discipline', 'families-and-report'], ['case-review', 'print']]) {
    assert.equal(typeof scene(screenId, sceneId)?.live?.act, 'function', `${screenId}/${sceneId} acts and listens for its notice`);
  }
});

test('an owner decision names its screen, its check and why, and matches by a pattern', () => {
  for (const entry of OWNER_DECISIONS) {
    assert.ok(SWEEP_SCREENS.some((screen) => screen.id === entry.screen), entry.screen);
    assert.ok(entry.check && entry.element instanceof RegExp && entry.reason.length > 40, JSON.stringify(entry));
  }
});

test('CI runs the sweep in shards that together cover every item, on the in-memory harness', () => {
  assert.ok(job, 'accessibility-certification.yml has a browser-teacher-a11y-sweep job');
  const steps = stepsOf(job);
  const sweep = steps.filter((step) => /run: node tests\/browser\/teacherScreensA11ySweep\.mjs --shard=\$\{\{ matrix\.shard \}\}\/\d+$/m.test(step));
  assert.equal(sweep.length, 1, 'one sweep step, cut by --shard');
  const count = Number(sweep[0].match(/--shard=\$\{\{ matrix\.shard \}\}\/(\d+)$/m)[1]);
  const shards = JSON.parse(job.match(/^ {8}shard: (\[[\d, ]*\])$/m)?.[1] ?? 'null');
  assert.deepEqual(shards, Array.from({ length: count }, (_, at) => at + 1), 'the matrix runs every shard the command cuts');
  assert.match(sweep[0], /TEACHER_HARNESS_ORIGIN: "http:\/\/127\.0\.0\.1:5188"/);
  assert.ok(steps.some((step) => /accessibilityAppHarness\.vite\.config\.mjs/.test(step)), 'the job starts the in-memory app harness');
  assert.ok(steps.some((step) => /path: tests\/browser\/artifacts\/teacher-a11y-sweep/.test(step) && /if: always\(\)/.test(step)), 'each shard keeps its report');
  // Every item in exactly one shard.
  const items = SWEEP_SCREENS.flatMap((screen) => SWEEP_VIEWPORTS.flatMap((viewport) => SWEEP_MODES.map((mode) => `${screen.id} ${viewport.id} ${mode}`)));
  const sliced = Array.from({ length: count }, (_, at) => itemsOfShard(items, { index: at + 1, count })).flat();
  assert.deepEqual(sliced, items);
  // About ten minutes a shard: an item took 10 to 25 s on a four-core machine (2026-11-28).
  assert.ok(items.length / count <= 30, `${Math.ceil(items.length / count)} items a shard is more than ten minutes`);
  assert.match(job, /^ {4}timeout-minutes: (1[0-9]|20)$/m, 'a shard that hangs is stopped near its ten minutes');
});

test('a pull request that changes the sweep, or what it opens, runs the workflow', () => {
  const area = CI_AREAS['accessibility-certification'];
  for (const pattern of ['tests/browser/teacherScreensA11ySweep*', 'src/**', 'tests/browser/teacherWorkflow/**', 'tests/browser/accessibility*']) {
    assert.ok(area.includes(pattern), pattern);
  }
});
