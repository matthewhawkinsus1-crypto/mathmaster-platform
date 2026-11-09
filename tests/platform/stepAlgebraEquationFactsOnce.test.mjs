// STEP ALGEBRA READS THE EQUATION ON SCREEN ONCE, NOT ONCE A RENDER.
//
// Measured on the student's flow (tests/browser/teacherWorkflow/
// studentRuntimePerformance.mjs: a production build, 4x-throttled), opening a
// Step Algebra question ran a 500-600 ms task. Every render of the solver asked
// whether the equation was solved (isSolvedEquation simplifies both sides
// through mathjs: about 16 ms a call in node) and built each side's
// cancellation model, and the solver renders about eight times as its
// question opens, and again for a hint, Work View or a change of connection,
// with the equation unchanged. An equation is replaced, never edited in place,
// so platform/algebra/committedEquationFacts.js keys both readings on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { committedCancellationModel, equationIsSolved } from '../../src/platform/algebra/committedEquationFacts.js';
import { isSolvedEquation, parseEquationInput } from '../../src/algebraAstEngine.js';
import { buildCancellationModel } from '../../src/algebraCancellationModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// Counts every read of the equation: a reading worked out again reads it again.
const watched = (equation) => {
  const reads = { count: 0 };
  const proxy = new Proxy(equation, {
    get(target, key, receiver) {
      reads.count += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  return { proxy, reads };
};

const EQUATIONS = ['3x - 5 = 10', '3x - 5 + 5 = 10', '2x/2 = 7', 'x = 5', '2(x + 1) = 8'];

for (const text of EQUATIONS) {
  test(`${text}: eight renders read the equation once, and read it right`, () => {
    const plain = parseEquationInput({ equation: text });
    const { proxy, reads } = watched(structuredClone(plain));
    const render = () => [
      equationIsSolved(proxy),
      committedCancellationModel(proxy, 'left'),
      committedCancellationModel(proxy, 'right'),
    ];
    const first = render();
    const readsAfterFirst = reads.count;
    assert.ok(readsAfterFirst > 0, 'the first render works the readings out');
    for (let renders = 1; renders < 8; renders += 1) {
      const again = render();
      assert.equal(again[0], first[0]);
      assert.equal(again[1], first[1], 'the same left-side model, not a new one');
      assert.equal(again[2], first[2], 'the same right-side model, not a new one');
    }
    assert.equal(reads.count, readsAfterFirst, `seven more renders read the equation ${reads.count - readsAfterFirst} more times`);
    // What the board shows is what the engine says of this equation.
    assert.equal(first[0], isSolvedEquation(plain));
    assert.deepEqual(first[1], buildCancellationModel(plain.left, null, plain.variable, []));
    assert.deepEqual(first[2], buildCancellationModel(plain.right, null, plain.variable, []));
  });
}

test('the equation after a step is read afresh', () => {
  const before = parseEquationInput({ equation: '3x - 5 + 5 = 10' });
  const after = { ...before, left: '3x', right: '10' };
  assert.equal(equationIsSolved(before), false);
  assert.ok(committedCancellationModel(before, 'left')?.pairs?.length, '−5 + 5 offers a cancellation');
  assert.equal(equationIsSolved({ ...after, left: 'x', right: '5' }), true, 'a new equation object is never answered from an old one');
  assert.deepEqual(committedCancellationModel(after, 'left'), buildCancellationModel('3x', null, before.variable, []), 'and its sides are read afresh');
});

test('the solver takes both readings from the cache, everywhere it reads them', () => {
  const core = executableSource(readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8'));
  // Whether the equation is solved: the render's reading and the two a step makes.
  assert.doesNotMatch(core, /\bisSolvedEquation\(/, 'a solved check that bypasses the cache');
  assert.match(core, /const solved = equationIsSolved\(equation\);/);
  // The committed sides' models: the board's, and the rewrite menu's test of
  // which sides already show a cancellation.
  assert.doesNotMatch(core, /buildCancellationModel\(\s*(?:equation\[side\]|sideExpression\(side\))\s*,\s*null\s*,/, 'a committed side\'s model built in the render');
  const board = region(core, 'const visibleCancellationModel = ', 'const cancellationModel = ', 'the board\'s model for a side');
  assert.match(board, /!pendingMove\s*\?\s*committedCancellationModel\(equation, side\)/);
  const menu = region(core, 'const cancellationActiveSides = useMemo(', '}, [equation, pendingMove]);', 'the rewrite menu\'s cancellation sides');
  assert.match(menu, /committedCancellationModel\(equation, side\)/);
});
