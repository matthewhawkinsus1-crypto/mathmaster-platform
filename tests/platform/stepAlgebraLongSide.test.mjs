/*
 * A STEP ALGEBRA SIDE OF MANY TERMS: REOPENING A MOVE, AND MAKING ONE, COST IN
 * PROPORTION TO THE SIDE (issue #559).
 *
 * Each balanced move kept as written adds a term to both sides, and nothing
 * makes a student combine them. A draft reopened with a move in progress
 * remakes the move (algebraDraftState.js makePendingMove), the move
 * simplifies its sides, and committing it checks the equation it makes. mathjs's
 * simplifyCore visited the head of every sum and product twice, so each term
 * doubled the work: reopening at 18 terms took over twenty times as long as at
 * 9, and 24 never finished (the grader fuzz harness's finding
 * drafts/reopen-time-grows-with-length/algebra). The platform's mathjs
 * instances now simplify each node once (functions/shared/algebra/
 * simplifyCoreOnce.mjs). These tests hold:
 *
 *   1. a count, the same on every machine: the nodes mathjs is asked for
 *      while a draft reopens, or a move is made, grow with the side, never
 *      faster (twice the terms, at most twice the visits);
 *   2. the time, as the harness holds it: reopening at 18 terms takes at most
 *      8 times as long as at 9, and so does making the move;
 *   3. 24 terms reopen, move and commit, in a child process with a time limit,
 *      so a return of the old cost fails here instead of hanging the suite;
 *   4. nothing else moves: on long sides and on ordinary work, every reading
 *      of a move (the move, its reopen, the verdict at every support level,
 *      the equation committed each way, its solved check, board and grade, the
 *      step grade and raw work, the server's verdict) is the one the same code
 *      gives with mathjs's own simplifyCore.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { ALGEBRA_DRAFT_VERSION, makePendingMove, rehydrateAlgebraDraft } from '../../src/algebraDraftState.js';
import { safeMathInstance, simplify } from '../../functions/shared/algebra/safeMath.mjs';
import { LONG_SIDES } from './helpers/stepAlgebraMoveReadings.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const READINGS = path.join(HERE, 'helpers/stepAlgebraMoveReadings.mjs');

const INITIAL = Object.freeze({ left: '2x + 3', right: '7' });
// The harness's draft: 2x + 1 + 1 + … = 7, with "subtract 3" in progress.
const draftWith = (left) => ({
  algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
  equation: { left, right: '7' },
  pendingMove: { operation: 'subtract', operandExpression: '3' },
  workSteps: [],
});
const reopen = (left) => rehydrateAlgebraDraft({ draft: draftWith(left), initialEquation: { ...INITIAL } });
const move = (left) => makePendingMove({ equation: { left, right: '7' }, operation: 'subtract', operand: '3' });
const SHAPES = ['ones', 'likeTerms', 'product'];

// How many times the graders' instance (the one the engine runs on, in the
// browser and on the server) asks an operator node for its children: every
// visit simplifyCore makes to a sum or a product, and every walk of a tree.
const nodeVisits = (work) => {
  const prototype = safeMathInstance.OperatorNode.prototype;
  const forEach = prototype.forEach;
  let visits = 0;
  prototype.forEach = function countedForEach(callback) {
    visits += 1;
    return forEach.call(this, callback);
  };
  try {
    work();
  } finally {
    prototype.forEach = forEach;
  }
  return visits;
};

test('reopening a draft or making the move on a longer side asks mathjs for at most proportionally more (a count, the same on every machine)', () => {
  simplify('x + y');
  for (const shape of SHAPES) {
    for (const [name, work] of [['reopening the draft', reopen], ['making the move', move]]) {
      const visits = (terms) => nodeVisits(() => work(LONG_SIDES[shape](terms)));
      const [at8, at16] = [visits(8), visits(16)];
      // Twice the terms, at most twice the visits. mathjs's own simplifyCore
      // made about 200 times as many at 16 as at 8 (262,544 against 1,264).
      assert.ok(at16 <= 2 * at8, `${shape}, ${name}: ${at8} visits at 8 terms, ${at16} at 16`);
      // Only once that holds is 24 asked for: under the old cost it would run for minutes.
      const at24 = visits(24);
      assert.ok(at24 <= 3 * at8, `${shape}, ${name}: ${at8} visits at 8 terms, ${at24} at 24`);
    }
  }
});

test('reopening at 18 terms takes at most 8 times as long as at 9, and so does making the move (the harness\'s measure)', () => {
  // The best of three: the first call also pays for building what it uses.
  const bestMs = (work) => {
    let best = Infinity;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const started = performance.now();
      work();
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };
  for (const [name, work] of [['reopening the draft', reopen], ['making the move', move]]) {
    const short = bestMs(() => work(LONG_SIDES.ones(9)));
    const long = bestMs(() => work(LONG_SIDES.ones(18)));
    const ratio = long / Math.max(short, 1);
    assert.ok(ratio <= 8, `${name}: ${Math.round(short)} ms at 9 terms, ${Math.round(long)} ms at 18 (${ratio.toFixed(1)} times as long)`);
  }
});

test('a side of 24 terms reopens, takes a move and commits it, in a few seconds at most', () => {
  // In a child process with a limit, so that a return of the old cost (24
  // terms never finished) fails here instead of holding the suite.
  const script = `
    const { makePendingMove, rehydrateAlgebraDraft } = await import(${JSON.stringify(path.join(ROOT, 'src/algebraDraftState.js'))});
    const { resolveEquationAfterMove } = await import(${JSON.stringify(path.join(ROOT, 'src/algebraSupportLevels.js'))});
    const { isSolvedEquation } = await import(${JSON.stringify(path.join(ROOT, 'src/algebraAstEngine.js'))});
    const { LONG_SIDES } = await import(${JSON.stringify(READINGS)});
    const results = {};
    for (const shape of ${JSON.stringify(SHAPES)}) {
      const equation = { left: LONG_SIDES[shape](24), right: '7' };
      const started = performance.now();
      const reopened = rehydrateAlgebraDraft({
        draft: { algebraDraftVersion: 2, equation, pendingMove: { operation: 'subtract', operandExpression: '3' }, workSteps: [] },
        initialEquation: { left: '2x + 3', right: '7' },
      });
      const made = makePendingMove({ equation, operation: 'subtract', operand: '3' });
      const committed = resolveEquationAfterMove(made, 3, made.requiredCancellationSides);
      results[shape] = {
        ms: Math.round(performance.now() - started),
        reopenedMove: Boolean(reopened?.pendingMove?.simplified),
        simplified: made.simplified.left,
        committed: committed.left,
        solved: isSolvedEquation(committed),
      };
    }
    console.log(JSON.stringify(results));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(child.error?.code, undefined, `the child did not finish within 60 s: ${child.error?.message}`);
  assert.equal(child.status, 0, child.stderr);
  const results = JSON.parse(child.stdout.trim());
  for (const shape of SHAPES) {
    assert.equal(results[shape].reopenedMove, true, `${shape}: the move in progress came back`);
    assert.equal(results[shape].solved, false, `${shape}: not solved by subtracting 3`);
  }
  // The move simplifies each side as it always did (mathjs writes 2^25 as 3.3554432e+7).
  assert.deepEqual(
    Object.fromEntries(SHAPES.map((shape) => [shape, results[shape].simplified])),
    { ones: '2 x + 21', likeTerms: '26 * x - 3', product: '3.3554432e+7 * x - 3' },
  );
});

test('every reading of a move, on long sides and on ordinary work, is the one mathjs\'s own simplifyCore gives', async () => {
  // The same cases, the same code, in two processes: one as the platform
  // runs, one with simplifyCoreOnce.mjs resolved to a pass-through
  // (helpers/mathjsOwnSimplifyCore.mjs), as it ran before.
  const run = promisify(execFile);
  const [platform, mathjsOwn] = (await Promise.all([
    run(process.execPath, [READINGS], { maxBuffer: 256 * 1024 * 1024 }),
    run(process.execPath, [READINGS, '--mathjs-own'], { maxBuffer: 256 * 1024 * 1024 }),
  ])).map(({ stdout }) => JSON.parse(stdout));

  // Each process ran the simplifyCore it says it did: each node of a 10-term
  // sum visited once, or the head of each link twice.
  assert.equal(platform.visitsInTenTerms, 9);
  assert.equal(mathjsOwn.visitsInTenTerms, 2 ** 9 - 1);

  assert.deepEqual(platform.cases.map((entry) => entry.name), mathjsOwn.cases.map((entry) => entry.name));
  const differing = platform.cases
    .filter((entry, index) => JSON.stringify(entry.readings) !== JSON.stringify(mathjsOwn.cases[index].readings))
    .map((entry) => entry.name);
  assert.deepEqual(differing, [], `${differing.length} of ${platform.cases.length} moves read differently`);

  // And the comparison means something: every move was made and reopened,
  // the verdicts and grades are there, and the server judged the steps. Its
  // budget grows with the question's own equation, and these questions are
  // authored with the long side, so it verified many of their steps too and
  // declined the rest as beyond it; it refused none.
  const long = platform.cases.filter((entry) => entry.name.includes(' × '));
  const ordinary = platform.cases.filter((entry) => !entry.name.includes(' × '));
  assert.ok(long.length >= 30 && ordinary.length >= 50, `${long.length} long, ${ordinary.length} ordinary`);
  for (const entry of platform.cases) {
    assert.ok(entry.readings.made.value, `${entry.name}: the move was made`);
    assert.deepEqual(entry.readings.reopened.value.pendingMove, entry.readings.made.value, `${entry.name}: the reopened move is the move`);
    assert.ok(entry.readings.verdicts.every((verdict) => typeof verdict.value?.valid === 'boolean'), `${entry.name}: verdicts`);
    assert.ok(entry.readings.step.value?.kind, `${entry.name}: a step grade`);
  }
  const verified = (entry) => entry.readings.server.value?.verified === true;
  const declined = (entry) => entry.readings.server.value?.reason === 'step-beyond-server-budget';
  assert.ok(long.every((entry) => verified(entry) || declined(entry)), 'each long step verified, or declined as beyond the server\'s budget');
  assert.ok(long.filter(verified).length >= 10 && long.filter(declined).length >= 10, `${long.filter(verified).length} long steps verified, ${long.filter(declined).length} declined`);
  assert.ok(ordinary.every(verified), 'every ordinary step verified by the server');
});
