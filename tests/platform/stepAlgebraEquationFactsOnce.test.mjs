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
// so platform/algebra/committedEquationFacts.js keys its readings on it.
//
// Behind the equation object each reading is kept by its text, in a bounded
// cache that outlives the board, so an equal equation that is a new object (a
// draft restored, an Undo back, Start over, the same question after Next) is
// answered without mathjs; and the first render is not set up twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EQUATION_READINGS_KEPT,
  boardTerms,
  committedCancellationModel,
  equationIsSolved,
  equationReadingsKept,
  strategicHintReadings,
  suggestedMove,
} from '../../src/platform/algebra/committedEquationFacts.js';
import { getSuggestedMove, isSolvedEquation, parseEquationInput, splitAdditiveTerms } from '../../src/algebraAstEngine.js';
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

// An equation as a draft or a record hands it back: equal, and a new object.
const restored = (equation) => JSON.parse(JSON.stringify(equation));

const EQUATIONS = ['3x - 5 = 10', '3x - 5 + 5 = 10', '2x/2 = 7', 'x = 5', '2(x + 1) = 8'];

for (const text of EQUATIONS) {
  test(`${text}: eight renders read the equation once, and read it right`, () => {
    const plain = parseEquationInput({ equation: text });
    const { proxy, reads } = watched(structuredClone(plain));
    const render = () => [
      equationIsSolved(proxy),
      committedCancellationModel(proxy, 'left'),
      committedCancellationModel(proxy, 'right'),
      suggestedMove(proxy),
    ];
    const first = render();
    const readsAfterFirst = reads.count;
    assert.ok(readsAfterFirst > 0, 'the first render works the readings out');
    for (let renders = 1; renders < 8; renders += 1) {
      const again = render();
      assert.equal(again[0], first[0]);
      assert.equal(again[1], first[1], 'the same left-side model, not a new one');
      assert.equal(again[2], first[2], 'the same right-side model, not a new one');
      assert.equal(again[3], first[3], 'the same suggested move, not a new one');
    }
    assert.equal(reads.count, readsAfterFirst, `seven more renders read the equation ${reads.count - readsAfterFirst} more times`);
    // What the board shows is what the engine says of this equation.
    assert.equal(first[0], isSolvedEquation(plain));
    assert.deepEqual(first[1], buildCancellationModel(plain.left, null, plain.variable, []));
    assert.deepEqual(first[2], buildCancellationModel(plain.right, null, plain.variable, []));
    assert.deepEqual(first[3], getSuggestedMove(plain));
  });
}

test('an equal equation that is a new object is answered from the text it was read from', () => {
  const plain = parseEquationInput({ equation: '4x + 7 = -9' });
  const first = [equationIsSolved(plain), committedCancellationModel(plain, 'left'), committedCancellationModel(plain, 'right'), suggestedMove(plain)];
  // The draft restored when the student comes back, an Undo back to this step.
  const { proxy, reads } = watched(restored(plain));
  const again = [equationIsSolved(proxy), committedCancellationModel(proxy, 'left'), committedCancellationModel(proxy, 'right'), suggestedMove(proxy)];
  assert.equal(again[0], first[0]);
  assert.equal(again[1], first[1], 'the kept left-side model, not one built again');
  assert.equal(again[2], first[2], 'the kept right-side model, not one built again');
  assert.equal(again[3], first[3], 'the kept suggested move, not one worked out again');
  assert.ok(reads.count > 0, 'the equal equation was read for its key');
  // Whether it is solved: a kept answer reads only the fields its key is made
  // of, where working it out walks the equation again.
  const solvedReads = (equation) => {
    const probe = watched(equation);
    equationIsSolved(probe.proxy);
    return probe.reads.count;
  };
  const worked = solvedReads(parseEquationInput({ equation: '4x + 7 = -9 + 0' }));
  const kept = solvedReads(restored(plain));
  assert.equal(kept, 4, 'the sides, the variable and the objective');
  assert.ok(worked > kept, `working it out reads the equation ${worked} times`);
});

test('a side that differs, or a variable or objective that differs, is read afresh', () => {
  const before = parseEquationInput({ equation: '3x - 5 + 5 = 10' });
  const after = { ...before, left: '3x', right: '10' };
  assert.equal(equationIsSolved(before), false);
  assert.ok(committedCancellationModel(before, 'left')?.pairs?.length, '−5 + 5 offers a cancellation');
  assert.equal(equationIsSolved({ ...after, left: 'x', right: '5' }), true, 'a different equation is never answered from an old one');
  assert.deepEqual(committedCancellationModel(after, 'left'), buildCancellationModel('3x', null, before.variable, []), 'and its sides are read afresh');
  // The same sides with another variable or objective are another question.
  const solvedForX = { left: 'x', right: '2y', variable: 'x', objective: { kind: 'isolate', variable: 'x' } };
  const solvedForY = { left: 'x', right: '2y', variable: 'y', objective: { kind: 'isolate', variable: 'y' } };
  assert.equal(equationIsSolved(solvedForX), true);
  assert.equal(equationIsSolved(solvedForY), false);
  const strict = { left: 'x', right: '21 - 6', variable: 'x', objective: { kind: 'isolate', variable: 'x', requireSimplifiedFinalForm: true } };
  assert.equal(equationIsSolved({ ...strict, objective: { ...strict.objective, requireSimplifiedFinalForm: false } }), true);
  assert.equal(equationIsSolved(strict), false, 'a stricter objective on the same sides is not answered from the looser one');
  // undefined and null are told apart: the engine reads a side as String(side),
  // so a missing side is the name "undefined" and a null one is null.
  const missing = { left: undefined, right: '5', variable: 'undefined' };
  const nothing = { left: null, right: '5', variable: 'undefined' };
  assert.equal(equationIsSolved(missing), true);
  assert.equal(equationIsSolved(nothing), false);
});

test('the board\'s terms are the splitter\'s, kept by the side\'s text', () => {
  for (const side of ['3 x - 5', '(1/2) x - 6', '5 - 1 * (x + 2)', '0.6 (2 x + 1)', 'x']) {
    const terms = boardTerms(side);
    assert.deepEqual(terms, splitAdditiveTerms(side));
    assert.equal(boardTerms(String(side)), terms, 'the same text, the same terms');
  }
  assert.equal(boardTerms('x +'), splitAdditiveTerms('x +'), 'a side that does not parse has no terms, as before');
});

test('the strategic hint reads the equation only where the hint can be offered', () => {
  for (const text of [...EQUATIONS, '-3 = -3y', '7 = 2x + 1', 'x + 0 = 4']) {
    const equation = parseEquationInput({ equation: text, ...(text.includes('y') ? { objective: { kind: 'linearStandardForm', variables: ['y'] }, solveFor: 'y' } : {}) });
    for (const offered of [true, false]) {
      // The hint the solver built before: the move, unless the equation is solved.
      const before = offered && getSuggestedMove(equation) && !isSolvedEquation(equation)
        ? `${getSuggestedMove(equation).operation} ${getSuggestedMove(equation).operand}` : '';
      const { suggestedMove: move, solved } = strategicHintReadings(restored(equation), { offered });
      const now = offered && move && !solved ? `${move.operation} ${move.operand}` : '';
      assert.equal(now, before, `${text}, hints ${offered ? 'offered' : 'withheld'}`);
      if (!offered) assert.deepEqual({ move, solved }, { move: null, solved: false }, 'nothing is worked out where no hint is offered');
    }
  }
  // An equation that could not be read reaches the engine, and throws, as it always did.
  assert.throws(() => strategicHintReadings(null, { offered: false }));
});

test('each reading keeps at most a bounded number of equations', () => {
  for (let index = 0; index < EQUATION_READINGS_KEPT + 20; index += 1) {
    const equation = parseEquationInput({ equation: `${index + 2}x - ${index} = 1` });
    equationIsSolved(equation);
    committedCancellationModel(equation, 'left');
    suggestedMove(equation);
    boardTerms(equation.left);
  }
  const kept = equationReadingsKept();
  for (const [reading, size] of Object.entries(kept)) assert.ok(size <= EQUATION_READINGS_KEPT, `${reading} keeps ${size} entries`);
  // The oldest is gone and is worked out again, the same as before.
  const oldest = parseEquationInput({ equation: '2x - 0 = 1' });
  assert.equal(equationIsSolved(restored(oldest)), isSolvedEquation(oldest));
});

test('a value that is not plain text is never kept, and a failure is thrown each time', () => {
  // A function in the objective: worked out for every new object, never kept.
  const odd = () => watched({ left: 'x', right: '5', variable: 'x', objective: { kind: 'isolate', variable: 'x', note: () => 'x' } });
  const first = odd();
  assert.equal(equationIsSolved(first.proxy), true);
  const readsOfFirst = first.reads.count;
  assert.equal(equationIsSolved(first.proxy), true);
  assert.equal(first.reads.count, readsOfFirst, 'the same object is still answered from its first reading');
  const second = odd();
  assert.equal(equationIsSolved(second.proxy), true);
  assert.equal(second.reads.count, readsOfFirst, 'an equal objective holding a function is worked out again, not answered from a kept reading');
  // A reading that throws is not kept: an equal equation throws again.
  const failing = () => ({ left: 'x', right: '5', variable: 'x', objective: { kind: 'linearStandardForm', variables: 5 } });
  assert.throws(() => equationIsSolved(failing()), TypeError);
  assert.throws(() => equationIsSolved(failing()), TypeError);
  const throwing = failing();
  assert.throws(() => equationIsSolved(throwing), TypeError);
  assert.throws(() => equationIsSolved(throwing), TypeError, 'nor kept for the same object');
});

test('the solver takes its readings from the cache, everywhere it reads them', () => {
  const core = executableSource(readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8'));
  // Whether the equation is solved, the suggested move and a side's terms: never straight from the engine.
  assert.doesNotMatch(core, /\bisSolvedEquation\(/, 'a solved check that bypasses the cache');
  assert.doesNotMatch(core, /\bgetSuggestedMove\(/, 'a suggested move worked out in the render');
  assert.doesNotMatch(core, /\bsplitAdditiveTerms\(/, 'a side split into terms in the render');
  assert.match(core, /const terms = boardTerms\(sideExpression\(side\)\);/, 'the board draws a side\'s kept terms');
  // The committed sides' models: the board's, and the rewrite menu's test of
  // which sides already show a cancellation.
  assert.doesNotMatch(core, /buildCancellationModel\(\s*(?:equation\[side\]|sideExpression\(side\))\s*,\s*null\s*,/, 'a committed side\'s model built in the render');
  const board = region(core, 'const visibleCancellationModel = ', 'const cancellationModel = ', 'the board\'s model for a side');
  assert.match(board, /!pendingMove\s*\?\s*committedCancellationModel\(equation, side\)/);
  const menu = region(core, 'const cancellationActiveSides = useMemo(', '}, [equation, pendingMove]);', 'the rewrite menu\'s cancellation sides');
  assert.match(menu, /committedCancellationModel\(equation, side\)/);
  // The strategic hint's readings, from the cache and only where the hint can
  // be offered (strategicHintReadings, tested above).
  const hint = region(core, 'const hintOffered = ', 'const strategicHint = ', 'the strategic hint\'s readings');
  assert.match(hint, /const hintOffered = hintsAllowed && question\.showHint !== false;/);
  assert.match(hint, /const \{ suggestedMove, solved \} = strategicHintReadings\(equation, \{ offered: hintOffered \}\);/);
  // The committed equation's LaTeX once per equation: the board's state, the
  // operand keyboard's letters and the reported work.
  assert.match(core, /const equationLatex = useMemo\(\(\) => \(equation \? equationToLatex\(equation\) : ''\), \[equation\]\);/);
  assert.equal((core.match(/equationToLatex\(/g) || []).length, 1, 'the equation is written as LaTeX in one place');
});

test('the board is set up once when its question opens', () => {
  const core = executableSource(readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8'));
  // With no draft the first state is the problem set up, so the set-up effect
  // does not replace it with an equal equation (a new object) on mount.
  assert.match(core, /const problemSetUpRef = useRef\(savedDraft \? null : problemKey\);/);
  const setUp = region(core, 'useEffect(() => {\n    if (savedDraft) return;', '}, [question, savedDraft]);', 'the problem set-up');
  assert.match(setUp, /if \(problemSetUpRef\.current === problemKey\) return;\s*problemSetUpRef\.current = problemKey;/);
  // The authored equation is read once when the record holds none.
  const pristine = region(core, 'const pristineEquation = useMemo(', '[question],', 'the authored equation');
  assert.match(pristine, /recordHoldsEquation\(normalizedRecord\) \? getInitialEquation\(question, null\)\.equation : initialEquation/);
});
