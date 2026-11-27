/*
 * A STEP ALGEBRA DRAFT WITH MANY LIKE TERMS REOPENS IN PROPORTION TO ITS
 * SQUARE, AND EXACTLY AS IT DID (issue #559).
 *
 * After simplifyCoreOnce.mjs (stepAlgebraLongSide.test.mjs), a side or a saved
 * operand of like terms with different coefficients, 2x + 3x + 4x + …, still
 * cost about the cube of its length to reopen: mathjs's simplify built every
 * match of a rule (every split of the sum, every combination of its
 * children's matches, each written out as JSON) to use the first. In node,
 * reopening such an operand took 1.7 s at 24 terms and 11 s at 41 (the grader
 * fuzz harness's own case: 41 terms, 203 s, before simplifyCoreOnce.mjs), a
 * 47-link division chain 3.7 s. Both instances now look for the first match
 * only (functions/shared/algebra/simplifyFirstMatch.mjs): 24 terms in 0.17 s,
 * 41 in 0.5 s. These tests hold:
 *
 *   1. a count, the same on every machine: what mathjs is asked to serialise
 *      or visit while a draft reopens, or a move is made, grows with the side
 *      about as its square (mathjs's own search: 10 to 13 times the work for
 *      twice the terms);
 *   2. every Step Algebra draft the tests hold (the draft fixtures, the
 *      harness's seeded drafts, and long sides and operands of every shape)
 *      reopens to the state it reopens to with mathjs's own simplify;
 *   3. every reading of a move (made, reopened, verdicts, commits, the step
 *      grade, the server's verdict) is the one mathjs's own simplify gives;
 *   4. 48 like terms reopen, in a child process with a time limit, so a
 *      return of the old cost fails here instead of holding the suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { ALGEBRA_DRAFT_VERSION, makePendingMove, rehydrateAlgebraDraft } from '../../src/algebraDraftState.js';
import { safeMathInstance, simplify } from '../../functions/shared/algebra/safeMath.mjs';
import { longExpression } from './helpers/algebraDraftRestores.mjs';
import { countedWork, totalWork } from './helpers/simplifyWork.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const RESTORES = path.join(HERE, 'helpers/algebraDraftRestores.mjs');
const READINGS = path.join(HERE, 'helpers/stepAlgebraMoveReadings.mjs');
const run = promisify(execFile);
const runJson = async (script, args = []) => JSON.parse((await run(process.execPath, [script, ...args], { maxBuffer: 256 * 1024 * 1024 })).stdout);

const INITIAL = Object.freeze({ left: '2x + 3', right: '7' });
const SHAPES = ['likeTerms', 'mixedLetters', 'divisions'];
// The draft the harness reopens, with the long expression as the side or as
// the operand of the move in progress.
const draftWith = ({ side = INITIAL.left, operand = '3' }) => ({
  algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
  equation: { left: side, right: INITIAL.right },
  pendingMove: { operation: 'subtract', operandExpression: operand },
  workSteps: [],
});
const WORK = [
  ['reopening a draft whose side is long', (text) => rehydrateAlgebraDraft({ draft: draftWith({ side: text }), initialEquation: { ...INITIAL } })],
  ['reopening a draft whose operand is long', (text) => rehydrateAlgebraDraft({ draft: draftWith({ operand: text }), initialEquation: { ...INITIAL } })],
  ['making the move on a long side', (text) => makePendingMove({ equation: { left: text, right: '7' }, operation: 'subtract', operand: '3' })],
];

test('reopening a draft or making the move on a longer side asks mathjs for about the square of the work (a count, the same on every machine)', () => {
  simplify('x + y');
  for (const shape of SHAPES) {
    for (const [name, work] of WORK) {
      const counted = (terms) => countedWork(safeMathInstance, () => work(longExpression(shape, terms)));
      const [at8, at16] = [counted(8), counted(16)];
      // Twice the terms, at most five times the work. mathjs's own search
      // asked for 10 to 13 times as much (likeTerms, reopening the operand:
      // 58,321 at 8 terms, 626,794 at 16, 8,359,549 at 32).
      assert.ok(totalWork(at16) <= 5 * totalWork(at8), `${shape}, ${name}: ${JSON.stringify(at8)} at 8 terms, ${JSON.stringify(at16)} at 16`);
      // Only once that holds is 32 asked for: under the old cost it takes seconds each.
      const at32 = counted(32);
      assert.ok(totalWork(at32) <= 5 * totalWork(at16), `${shape}, ${name}: ${JSON.stringify(at16)} at 16 terms, ${JSON.stringify(at32)} at 32`);
      // No match is written out at all: the first is looked for, and used.
      assert.equal(at32.serialised, 0, `${shape}, ${name}: matches serialised at 32 terms`);
    }
  }
});

test('every Step Algebra draft the tests hold reopens exactly as it does with mathjs\'s own simplify', async () => {
  // The same drafts, the same code, in two processes: one as the platform
  // runs, one with simplifyFirstMatch.mjs resolved to a pass-through
  // (helpers/mathjsOwnSimplify.mjs).
  const [platform, mathjsOwn] = await Promise.all([runJson(RESTORES), runJson(RESTORES, ['--mathjs-own-simplify'])]);
  assert.equal(platform.mathjsOwnSimplify, false);
  assert.equal(mathjsOwn.mathjsOwnSimplify, true);
  assert.deepEqual(platform.sources, mathjsOwn.sources);
  assert.deepEqual(platform.restores.map((entry) => entry.name), mathjsOwn.restores.map((entry) => entry.name));
  const differing = platform.restores
    .filter((entry, index) => JSON.stringify(entry) !== JSON.stringify(mathjsOwn.restores[index]))
    .map((entry) => entry.name);
  assert.deepEqual(differing, [], `${differing.length} of ${platform.restores.length} drafts reopen differently`);

  // And the comparison means something: every fixture source has drafts, and
  // many come back with the move in progress remade.
  for (const [source, count] of Object.entries(platform.sources)) assert.ok(count > 0, `${source}: no drafts`);
  const withMove = platform.restores.filter((entry) => entry.restored?.pendingMove?.simplified);
  assert.ok(withMove.length >= 60, `${withMove.length} drafts reopened with a move in progress`);
  assert.ok(withMove.filter((entry) => entry.name.startsWith('long')).length >= 40, 'long sides and operands reopened with their move');
});

test('every reading of a move, on long sides and on ordinary work, is the one mathjs\'s own simplify gives', async () => {
  const [platform, mathjsOwn] = await Promise.all([runJson(READINGS), runJson(READINGS, ['--mathjs-own-simplify'])]);
  assert.deepEqual(platform.cases.map((entry) => entry.name), mathjsOwn.cases.map((entry) => entry.name));
  const differing = platform.cases
    .filter((entry, index) => JSON.stringify(entry.readings) !== JSON.stringify(mathjsOwn.cases[index].readings))
    .map((entry) => entry.name);
  assert.deepEqual(differing, [], `${differing.length} of ${platform.cases.length} moves read differently`);
  const varied = platform.cases.filter((entry) => entry.name.startsWith('variedCoefficients'));
  assert.ok(varied.length >= 4 && varied.every((entry) => entry.readings.made.value && entry.readings.server.value), 'the varied-coefficient side was moved, reopened and judged');
});

test('48 like terms reopen, as a side and as an operand, in seconds at most', () => {
  // In a child process with a limit, so that a return of the old cost (11 s
  // at 41 terms in node, the cube of the length) fails here instead of
  // holding the suite. 48 terms took about 0.7 s.
  const script = `
    const { rehydrateAlgebraDraft } = await import(${JSON.stringify(path.join(ROOT, 'src/algebraDraftState.js'))});
    const { longExpression } = await import(${JSON.stringify(RESTORES)});
    const results = {};
    for (const shape of ${JSON.stringify(SHAPES)}) {
      for (const where of ['side', 'operand']) {
        const text = longExpression(shape, 48);
        const draft = { algebraDraftVersion: 2, equation: { left: where === 'side' ? text : '2x + 3', right: '7' }, pendingMove: { operation: 'subtract', operandExpression: where === 'side' ? '3' : text }, workSteps: [] };
        const started = performance.now();
        const reopened = rehydrateAlgebraDraft({ draft, initialEquation: { left: '2x + 3', right: '7' } });
        results[shape + ' ' + where] = { ms: Math.round(performance.now() - started), simplified: reopened?.pendingMove?.simplified ?? null };
      }
    }
    console.log(JSON.stringify(results));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(child.error?.code, undefined, `the child did not finish within 60 s: ${child.error?.message}`);
  assert.equal(child.status, 0, child.stderr);
  const results = JSON.parse(child.stdout.trim());
  for (const [name, result] of Object.entries(results)) assert.ok(result.simplified, `${name}: the move in progress came back (${result.ms} ms)`);
  // 2x + 3x + … + 49x is 1,224x: the like terms are combined, as they always were.
  assert.deepEqual(results['likeTerms side'].simplified, { left: '1224 * x - 3', right: '4' });
});
