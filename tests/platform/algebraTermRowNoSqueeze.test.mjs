import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Live QA: in cancellation mode the terms -2x, +12, -12 rendered as bare signs
// with a tiny scrollbar each. Every term's MathDisplay is a scroll container,
// so a term that may flex-shrink collapses to almost nothing in a narrow box.

test('each term in an algebra term row keeps its full width', () => {
  const source = readFileSync(new URL('../../src/AlgebraTermRow.jsx', import.meta.url), 'utf8');
  const termStart = source.indexOf('data-term-index={index}');
  const termStyle = source.slice(source.indexOf('style={{', termStart), source.indexOf('}}', source.indexOf('style={{', termStart)));
  assert.match(termStyle, /flexShrink:\s*0/, 'the per-term span must not shrink');
  assert.match(source.slice(0, termStart), /flexWrap: allowWrap \? 'wrap' : 'nowrap'/, 'rows stay on one line unless they opt in');
});

// Live QA (iPad portrait, systems substitution): with full-width terms the
// cancellation box was still narrower than -9x + 21 - 21, and the leading term
// ran off its left edge. The cancellation row may wrap; other rows stay on one
// line so drag-slot geometry is unchanged.
test('only the cancellation row is allowed to wrap onto a second line', () => {
  const row = readFileSync(new URL('../../src/AlgebraTermRow.jsx', import.meta.url), 'utf8');
  assert.match(row, /allowWrap = false,/);
  assert.match(row, /flexWrap: allowWrap \? 'wrap' : 'nowrap'/);
  const core = readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8');
  const wrapped = core.match(/<AlgebraTermRow allowWrap terms=\{cancellationModel\.terms\}/g) || [];
  assert.equal(wrapped.length, 1, 'the cancellation workspace row opts in');
  assert.equal((core.match(/<AlgebraTermRow allowWrap/g) || []).length, 1, 'no other row wraps');
});
