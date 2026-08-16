import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveEquationAfterKeepingMove } from '../../src/algebraSupportLevels.js';

test('keep-as-written preserves unresolved simplification but honors completed cancellation', () => {
  const move = {
    simplified: { left: 'I / P', right: 'r * t' },
    unsimplified: { left: 'I / P', right: '(P * r * t) / (P)' },
    requiredCancellationSides: ['right'],
    simplificationTargets: [],
  };
  assert.deepEqual(
    resolveEquationAfterKeepingMove(move, []),
    { left: 'I / P', right: '(P * r * t) / (P)' },
  );
  assert.deepEqual(
    resolveEquationAfterKeepingMove(move, ['right']),
    { left: 'I / P', right: 'r * t' },
  );
});

test('keep-as-written preserves arithmetic cleanup on both sides', () => {
  const move = {
    simplified: { left: 'I / P + 3', right: 'r * t + 3' },
    unsimplified: { left: 'I / P + 9 - 6', right: 'r * t + 9 - 6' },
    requiredCancellationSides: [],
    simplificationTargets: [{ side: 'left' }, { side: 'right' }],
  };
  assert.deepEqual(
    resolveEquationAfterKeepingMove(move, []),
    { left: 'I / P + 9 - 6', right: 'r * t + 9 - 6' },
  );
});

test('Step Algebra exposes optional simplification and a non-attempt-reset action', () => {
  const source = fs.readFileSync(new URL('../../src/StepByStepAlgebra.jsx', import.meta.url), 'utf8');
  assert.match(source, /Keep as written/);
  assert.match(source, /Reset work/);
  assert.match(source, /attempt count will not change/);
  assert.match(source, /setEquation\(pristineEquation\)/);
  assert.match(source, /resolution: 'keep'/);
  assert.match(source, /resolution: 'simplified'/);
});

test('final-form simplification is strict only when explicitly authored', () => {
  const source = fs.readFileSync(new URL('../../src/algebraAstEngine.js', import.meta.url), 'utf8');
  assert.match(source, /requireSimplifiedFinalForm:\s*question\.objective\?\.requireSimplifiedFinalForm\s*\?\?/);
  assert.match(source, /objective\.requireSimplifiedFinalForm === true/);
});
