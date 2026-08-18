import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');

test('add subtract below placement is an annotation and not a fraction bar', () => {
  assert.match(src, /className="staged-additive-below"/);
  assert.match(src, /Staged below this term; this is not a division bar/);

  const blockStart = src.indexOf('className="staged-additive-below"');
  const block = src.slice(blockStart, blockStart + 1100);
  assert.doesNotMatch(block, /borderTop/);
  assert.match(block, /↓/);
});

test('division keeps the actual horizontal fraction setup line', () => {
  assert.match(src, /className="staged-division-bar"/);
  assert.match(src, /borderTop: '2px solid #174ea6'/);
  assert.match(src, /Place divisor/);
});

test('cancellable fraction factors remain visible in dark mode', () => {
  assert.match(src, /className="fraction-cancellation-region"/);
  assert.match(src, /color: '#202124'/);
  assert.match(src, /colorScheme: 'light'/);
});

test('fraction cancellation uses factor presentation latex instead of reparsing text', () => {
  assert.match(src, /factor\.latex \|\| expressionToLatex\(factor\.text\)/);
});
