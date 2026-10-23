// A WRONG RATE OF CHANGE IS TOLD WHAT WENT WRONG, NOT "RECHECK THE SIGNS".
//
// Walkthrough 2026-10-22, Algebra I DOL #3 Review PR 3 and PR 5: the authored
// mistake — the rate written as Δy when x jumps by 2, 3 or 4 — was told to
// "recheck subtraction order and signs". The signs were right; the fix is to
// divide by Δx (and on PR 5 the slip flipped linear to nonlinear).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { intervalMissMessage } from '../../src/tools/linearTableWorkbench/intervalFeedback.js';

const rateWrong = { dxCorrect: true, dyCorrect: true, rateCorrect: false };

test('the rate written as Δy alone is told to divide by Δx', () => {
  const message = intervalMissMessage({ entry: { i: 0, j: 1, dx: '4', dy: '6', rate: '6' }, check: rateWrong });
  assert.match(message, /^Check Row 1 → Row 2: the rate of change is Δy ÷ Δx\. You wrote Δy itself, but x changes by 4 here, so divide by it\.$/);
  assert.doesNotMatch(message, /signs/);
});

test('an upside-down rate is told so; any other wrong rate is told to recheck the division', () => {
  assert.match(intervalMissMessage({ entry: { i: 1, j: 3, dx: '2', dy: '6', rate: '1/3' }, check: rateWrong }), /not Δx ÷ Δy\.$/);
  assert.match(intervalMissMessage({ entry: { i: 1, j: 3, dx: '2', dy: '6', rate: '4' }, check: rateWrong }), /Your Δx and Δy are right; recheck the division\.$/);
  // Δx = 1: Δy IS the rate, so a wrong rate there is not the Δy slip.
  assert.match(intervalMissMessage({ entry: { i: 0, j: 1, dx: '1', dy: '6', rate: '6' }, check: rateWrong }), /recheck the division/);
});

test('a wrong Δx or Δy is about the subtraction', () => {
  const message = intervalMissMessage({ entry: { i: 2, j: 4, dx: '-2', dy: '6', rate: '-3' }, check: { dxCorrect: false, dyCorrect: true, rateCorrect: false } });
  assert.match(message, /^Check Row 3 → Row 5: Δx\. Subtract the earlier row from the later one, the same way for x and for y, and watch the signs\.$/);
});

test('the workbench uses it', () => {
  const source = readFileSync(new URL('../../src/tools/linearTableWorkbench/LinearTableWorkbench.jsx', import.meta.url), 'utf8');
  assert.match(source, /return intervalMissMessage\(\{ entry: intervalIssueEvidence, check: intervalIssue \}\);/);
  assert.doesNotMatch(source, /Recheck subtraction order and signs before changing anything else/);
});
