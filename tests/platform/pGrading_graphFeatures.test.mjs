import test from 'node:test';
import assert from 'node:assert/strict';

import { gradeAnalysisPart, normalizeAnalysisRequests } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';

/*
 * JOB P, ITEM 4 — lines in the graph-features grader.
 *
 * getMonotonicAcceptedAnswers had no branch for a line, so y = 2x + 1 was
 * keyed "none" for increasing; and an unrestricted horizontal line's range was
 * keyed as every real number. Graded through gradeAnalysisPart, the function
 * the graph workspace's shared grader (browser and server) runs per part.
 */
const window = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
const verdict = (spec, request, answer) => {
  const [part] = normalizeAnalysisRequests({ analysisRequests: [{ id: 'p', ...request }] }, spec, window, false);
  return gradeAnalysisPart(part, { answers: { p: answer } }).isCorrect;
};

const rising = { type: 'linear', a: 2, h: 0, k: 1 }; // y = 2x + 1 as the V5 tool spec stores it
const falling = { type: 'line', m: -3, b: 2 };
const flat = { type: 'line', m: 0, b: 3 };
const flatOnSegment = { type: 'line', m: 0, b: 3, domain: { min: -2, max: 4, minInclusive: true, maxInclusive: true } };

test('a line is increasing or decreasing on its whole domain, never "none"', () => {
  assert.equal(verdict(rising, { kind: 'increasing' }, '(-\\infty,\\infty)'), true);
  assert.equal(verdict(rising, { kind: 'increasing' }, '(-∞, ∞)'), true);
  assert.equal(verdict(rising, { kind: 'decreasing' }, 'none'), true);
  assert.equal(verdict(falling, { kind: 'decreasing' }, '(-inf,inf)'), true);
  assert.equal(verdict(falling, { kind: 'increasing' }, 'none'), true);
  // Near misses.
  assert.equal(verdict(rising, { kind: 'increasing' }, 'none'), false);
  assert.equal(verdict(rising, { kind: 'decreasing' }, '(-inf,inf)'), false);
  assert.equal(verdict(rising, { kind: 'increasing' }, '(0,inf)'), false);
  assert.equal(verdict(falling, { kind: 'increasing' }, '(-inf,inf)'), false);
  assert.equal(verdict(rising, { kind: 'constant' }, '(-inf,inf)'), false);
});

test('a horizontal line is constant, and its range is one value', () => {
  assert.equal(verdict(flat, { kind: 'constant' }, '(-inf,inf)'), true);
  assert.equal(verdict(flat, { kind: 'increasing' }, 'none'), true);
  assert.equal(verdict(flat, { kind: 'decreasing' }, 'none'), true);
  assert.equal(verdict(flat, { kind: 'range' }, '\\{3\\}'), true);
  assert.equal(verdict(flat, { kind: 'range' }, '{3}'), true);
  assert.equal(verdict(flat, { kind: 'range' }, '[3,3]'), true);
  assert.equal(verdict(flat, { kind: 'range', notation: 'inequality' }, 'y=3'), true);
  assert.equal(verdict(flatOnSegment, { kind: 'range' }, '{3}'), true);
  // Near misses: every real number was the old key.
  assert.equal(verdict(flat, { kind: 'range' }, '(-inf,inf)'), false);
  assert.equal(verdict(flat, { kind: 'range' }, '{-3}'), false);
  assert.equal(verdict(flat, { kind: 'range' }, '(3,3)'), false);
  assert.equal(verdict(flat, { kind: 'range' }, '[3,inf)'), false);
  assert.equal(verdict(flat, { kind: 'range', notation: 'inequality' }, 'y>=3'), false);
  assert.equal(verdict(flat, { kind: 'increasing' }, '(-inf,inf)'), false);
});

test('a non-horizontal line keeps every real number as its range', () => {
  assert.equal(verdict(rising, { kind: 'range' }, '(-inf,inf)'), true);
  assert.equal(verdict(rising, { kind: 'range' }, '{1}'), false);
});
