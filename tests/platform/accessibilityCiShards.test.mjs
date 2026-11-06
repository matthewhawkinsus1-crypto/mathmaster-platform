// THE ACCESSIBILITY WORKFLOW'S TWO LONG JOBS, IN SHARDS AND PARTS (2026-11-06).
//
// Two jobs of .github/workflows/accessibility-certification.yml ran far longer than the rest. The teacher large-text
// sweep took 36 minutes on CI for 48 scenes, and the fifth slice made it 66: every push waited on it, and a newer push
// cancelled it before it finished. It now runs as three shards (studentShellLargeText.mjs --shard=i/3, cut by
// tests/browser/support/sceneShards.mjs). These pin that no scene is dropped or run twice on the way.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CERTIFIED_SCREENS, SCREENS, sceneLabel } from '../browser/accessibilityCertification.mjs';
import { TEACHER_SCREENS } from '../browser/accessibilityTeacherScreens.mjs';
import { parseShard, shardOf } from '../browser/support/sceneShards.mjs';
import { jobsOf, readWorkflow, runsOnPullRequest, stepsOf } from './helpers/ciWorkflows.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const sceneLabels = (screens) => screens.flatMap((screen) => screen.scenes.map((scene) => sceneLabel(screen, scene)));
const slicesOf = (screens, count) => Array.from({ length: count }, (_, at) => shardOf(screens, { index: at + 1, count }));
const ids = (slices) => slices.map((slice) => slice.map((screen) => screen.id));

// The lists the driver walks that node can read, and lists of the shapes a slice has to survive: none, one screen, a
// screen with no scene, one screen far larger than the rest, fewer screens than shards.
const screen = (id, scenes) => ({ id, scenes: Array.from({ length: scenes }, (_, at) => ({ id: `scene-${at + 1}` })) });
const LISTS = {
  'the teacher sweep (TEACHER_SCREENS)': TEACHER_SCREENS,
  "the certification's student screens": SCREENS,
  'every certified screen': CERTIFIED_SCREENS,
  'no screen': [],
  'one screen': [screen('only', 3)],
  'a screen with no scene': [screen('a', 2), screen('empty', 0), screen('b', 1)],
  'one large screen': [screen('a', 1), screen('large', 20), screen('b', 1), screen('c', 1)],
  'fewer screens than shards': [screen('a', 2), screen('b', 5)],
};

/* --- the slices ------------------------------------------------------------ */

test('--shard reads i/n, and refuses anything else', () => {
  assert.equal(parseShard(null), null, 'no --shard: the whole list');
  assert.equal(parseShard(undefined), null);
  assert.deepEqual(parseShard('1/1'), { index: 1, count: 1 });
  assert.deepEqual(parseShard('2/3'), { index: 2, count: 3 });
  assert.deepEqual(parseShard('3/3'), { index: 3, count: 3 });
  for (const value of ['0/3', '4/3', '3', '1/0', '0/0', 'a/b', '1/3/5', '-1/3', '1.5/3', '/3', '2/', '']) {
    assert.throws(() => parseShard(value), /give i\/n/, `--shard=${value}`);
  }
});

test('the slices of a list, one after another, are the list: every scene once, in order, for 1 to 4 shards', () => {
  for (const [name, list] of Object.entries(LISTS)) {
    for (let count = 1; count <= 4; count += 1) {
      const joined = slicesOf(list, count).flat();
      assert.equal(joined.length, list.length, `${name}, ${count} shard(s): as many screens as the list`);
      // The same screen objects, in the list's places: whole, so a screen's scenes stay on one page together.
      joined.forEach((entry, at) => assert.equal(entry, list[at], `${name}, ${count} shard(s): ${list[at].id} in its place`));
      assert.deepEqual(sceneLabels(joined), sceneLabels(list), `${name}, ${count} shard(s): no scene dropped or run twice`);
    }
  }
});

test('the same list always cuts the same way, and the cut changes nothing', () => {
  const frozen = Object.freeze(TEACHER_SCREENS.map((entry) => Object.freeze({ ...entry })));
  for (let count = 1; count <= 4; count += 1) {
    const once = ids(slicesOf(frozen, count));
    assert.deepEqual(ids(slicesOf(frozen, count)), once, `${count} shard(s): cut twice, cut the same`);
    assert.deepEqual(ids(slicesOf(frozen.map((entry) => ({ ...entry })), count)), once, `${count} shard(s): a copy of the list cuts the same`);
  }
});

test("CI's three shards of the teacher sweep each have scenes, and about a third of the work", () => {
  // A screen costs its opening and each scene (sceneShards.mjs): a slice may be off a third by at most one screen.
  const cost = (screens) => screens.reduce((sum, entry) => sum + 1 + entry.scenes.length, 0);
  const whole = cost(TEACHER_SCREENS);
  const largest = Math.max(...TEACHER_SCREENS.map((entry) => cost([entry])));
  slicesOf(TEACHER_SCREENS, 3).forEach((slice, at) => {
    assert.ok(sceneLabels(slice).length > 0, `shard ${at + 1}/3 has scenes to measure`);
    assert.ok(Math.abs(cost(slice) - whole / 3) <= largest, `shard ${at + 1}/3 costs ${cost(slice)} of ${whole}`);
  });
});

test('the large-text driver cuts whichever list a check walks, after --only, and reads --shard before it starts a browser', () => {
  const driver = executableSource(readFileSync(new URL('../browser/studentShellLargeText.mjs', import.meta.url), 'utf8'));
  const walk = region(driver, 'const runScenes = async (', 'await newPage(setting, screen);', 'the walk');
  assert.match(walk, /for \(const screen of screens\) \{\s*if \(ONLY\.size && !ONLY\.has\(screen\.id\)\) continue;\s*if \(SHARD && !inShard\(screens, screen\)\) continue;/,
    'every walk skips the screens outside its slice of the list it was given');
  const slice = region(driver, 'const inShard = (screens, screen) => {', '\n};', 'the slice');
  assert.match(slice, /const listed = screens\.filter\(\(entry\) => !ONLY\.size \|\| ONLY\.has\(entry\.id\)\);/, 'the slice is of the screens --only leaves');
  assert.match(slice, /shardOf\(listed, SHARD\)/);
  const parsed = driver.indexOf("const SHARD = parseShard(arg('shard'));");
  assert.ok(parsed !== -1 && parsed < driver.indexOf('await chromium.launch('), 'a wrong --shard stops the run before a browser starts');
});

test('a pull request that changes the shard module runs the accessibility workflow', () => {
  assert.equal(runsOnPullRequest('accessibility-certification.yml', 'tests/browser/support/sceneShards.mjs'), true);
});

/* --- the workflow ---------------------------------------------------------- */

const workflow = readWorkflow('accessibility-certification.yml');
const jobs = jobsOf(workflow);
test('the teacher sweep runs as one job per shard, each named for its shard, and together they run every slice', () => {
  const job = jobs['browser-teacher-large-text'];
  assert.ok(job, 'the job');
  const sweep = stepsOf(job).filter((step) => /run: node tests\/browser\/studentShellLargeText\.mjs --check=text,targetsize --teacher/.test(step));
  assert.equal(sweep.length, 1, 'one sweep step');
  const count = Number(sweep[0].match(/ --shard=\$\{\{ matrix\.shard \}\}\/(\d+)$/m)?.[1]);
  assert.equal(count, 3, 'cut in three');
  const shards = JSON.parse(job.match(/^ {8}shard: (\[[\d, ]*\])$/m)?.[1] ?? 'null');
  assert.deepEqual(shards, Array.from({ length: count }, (_, at) => at + 1), 'the matrix runs shards 1 to n of the n the command cuts: no slice left out');
  assert.match(job, new RegExp(`^ {4}name: browser-teacher-large-text \\(\\$\\{\\{ matrix\\.shard \\}\\}/${count}\\)$`, 'm'), 'a failed shard says which it is');
  assert.match(job, /^ {10}name: accessibility-certification-teacher-large-text-\$\{\{ matrix\.shard \}\}$/m, 'each shard keeps its own report');
});
