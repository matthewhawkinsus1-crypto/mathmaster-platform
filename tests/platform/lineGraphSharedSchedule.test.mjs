// A SHARED LINE GAME MEETS EACH LINE ONCE (functions/shared/lineGraphReveal.mjs
// drawSharedLineSchedule, which liveChallengeFunctions.js's line planner calls).
//
// A Graph the Line Classic game with the same line for everyone draws its
// rounds' lines from a random seed, and nothing kept them apart. In about
// 0.4% of 3-round games (All three forms, Graph it) two rounds asked the same
// line: the class drew it twice, and round 0's solution, held while a later
// round asks its line, was not published at its close. The integration walk
// that reads it there (tests/integration/lineGraph.test.mjs) failed 3 tests on
// one CI run. Now the seed is drawn again while two rounds would share a line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generateLineQuestion } from '../../functions/shared/lineGraphGenerator.mjs';
import { normalizeLineGraphConfig } from '../../functions/shared/lineGraphConfig.mjs';
import { LINE_GRAPH_FORMAT } from '../../functions/shared/lineGraphRules.mjs';
import { SHARED_LINE_DRAWS, drawSharedLineSchedule, lineRevealKey } from '../../functions/shared/lineGraphReveal.mjs';
import { region } from './helpers/sourceContract.mjs';

const config = normalizeLineGraphConfig({ presetId: 'allThreeForms', itemTypes: ['graph'] }, { format: LINE_GRAPH_FORMAT.CLASSIC });
const itemFor = (seed, roundIndex) => generateLineQuestion({ seed, studentKey: '*', roundIndex, questionIndex: 0, config });
const keysOf = (seed, rounds = 3) => Array.from({ length: rounds }, (_, roundIndex) => lineRevealKey(itemFor(seed, roundIndex)));
const repeats = (keys) => new Set(keys).size < keys.length;

// A seed whose three rounds ask a line twice, and one whose rounds all differ.
// Found, not stored: the generator decides which seeds these are.
const findSeed = (wantRepeat) => {
  for (let index = 0; index < 200_000; index += 1) {
    const seed = `shared-schedule-probe-${index}`;
    if (repeats(keysOf(seed)) === wantRepeat) return seed;
  }
  throw new Error(`no seed found that ${wantRepeat ? 'repeats' : 'differs'}`);
};
const repeating = findSeed(true);
const differing = findSeed(false);

test('the settings are a Classic game with one line for the class', () => {
  assert.equal(config.format, LINE_GRAPH_FORMAT.CLASSIC);
  assert.equal(config.sameEquations, true);
  assert.equal(repeats(keysOf(repeating)), true, 'this seed would ask a line twice');
});

test('a seed whose rounds would ask a line twice is drawn again', () => {
  const seeds = [repeating, differing];
  const schedule = drawSharedLineSchedule({ roundCount: 3, itemFor, newSeed: () => seeds.shift() });
  assert.equal(schedule.seed, differing);
  assert.deepEqual(schedule.keys, keysOf(differing), 'the keys are those of the seed kept');
  assert.equal(repeats(schedule.keys), false);
  assert.deepEqual(seeds, [], 'two seeds drawn');
});

test('a schedule whose lines already differ keeps its first seed', () => {
  let drawn = 0;
  const schedule = drawSharedLineSchedule({ roundCount: 3, itemFor, newSeed: () => { drawn += 1; return differing; } });
  assert.equal(drawn, 1);
  assert.equal(schedule.seed, differing);
});

test(`settings with fewer lines than rounds keep the last of ${SHARED_LINE_DRAWS} draws; the same-line hold still covers them`, () => {
  let drawn = 0;
  const oneLine = () => ({ line: { a: 1, b: -1, c: 0 } });
  const schedule = drawSharedLineSchedule({ roundCount: 3, itemFor: oneLine, newSeed: () => `seed-${(drawn += 1)}` });
  assert.equal(drawn, SHARED_LINE_DRAWS);
  assert.equal(schedule.seed, `seed-${SHARED_LINE_DRAWS}`);
  assert.deepEqual(schedule.keys, ['line|1|-1|0', 'line|1|-1|0', 'line|1|-1|0']);
});

test('a round with no line to reveal is no repeat', () => {
  let drawn = 0;
  const schedule = drawSharedLineSchedule({ roundCount: 3, itemFor: () => ({}), newSeed: () => `seed-${(drawn += 1)}` });
  assert.equal(drawn, 1);
  assert.deepEqual(schedule.keys, [null, null, null]);
});

test('across many games, no shared schedule asks a line twice', () => {
  let counter = 0;
  for (let game = 0; game < 2_000; game += 1) {
    const schedule = drawSharedLineSchedule({ roundCount: 3, itemFor, newSeed: () => `many-games-${(counter += 1)}` });
    assert.equal(repeats(schedule.keys), false, `game ${game}`);
  }
});

test('the line planner draws a shared game this way, and a game without shared rounds keeps one seed', () => {
  const server = readFileSync(new URL('../../functions/liveChallengeFunctions.js', import.meta.url), 'utf8');
  const planner = region(server, 'const LINE_GRAPH_PLANNER = Object.freeze({', '\n});', 'line planner');
  assert.match(planner, /const schedule = lineGraphSharesRounds\(config\)\s*\? lineReveal\.drawSharedLineSchedule\(\{\s*roundCount,\s*itemFor: \(candidate, roundIndex\) => sharedLineItem\(generator, \{ seed: candidate, config, roundIndex \}\),\s*newSeed: \(\) => crypto\.randomUUID\(\),\s*\}\)\s*: null;/);
  assert.match(planner, /const seed = schedule \? schedule\.seed : crypto\.randomUUID\(\);/);
  assert.match(planner, /const sharedLineKeys = schedule \? schedule\.keys : null;/);
  assert.equal((planner.match(/crypto\.randomUUID\(\)/g) || []).length, 2, 'no other seed is drawn');
});
