// "INFORMATION YOU NEED" KNOWS A PRICE FROM A FORMULA.
//
// Walkthrough 2026-10-23 (Module 3 T1 L3 CW 1, T2 L1 CW 8): the reference card
// had its own `$…$` pattern, so "a credit of $25 toward sales, and each box of
// popcorn sells for $3.75" rendered everything between the two prices as one
// italic formula ("25towardsales,∧eachbox…"). Seven statements in the Module 3
// lessons were garbled. The card now splits with the prompt's own splitter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';

test('two prices in one statement stay prose; real math is still math', () => {
  const kinds = (text) => splitMathSegments(text).map((segment) => [segment, isMathSegment(segment)]);
  assert.deepEqual(kinds('Each camper starts with a credit of $25 toward sales, and each box of popcorn sells for $3.75.'),
    [['Each camper starts with a credit of $25 toward sales, and each box of popcorn sells for $3.75.', false]]);
  assert.deepEqual(kinds('Student tickets cost $5, adult tickets cost $10, and $s$ is student tickets.').filter(([, math]) => math), [['$s$', true]]);
});

test('the card uses that splitter, not a pattern of its own', () => {
  const card = readFileSync(new URL('../../src/ReferenceInfoCard.jsx', import.meta.url), 'utf8');
  assert.match(card, /import \{ isMathSegment, splitMathSegments, splitProseFractionRuns \} from '\.\/components\/common\/mathSegments\.js';/);
  assert.match(card, /const segments = splitMathSegments\(text\);/);
  assert.doesNotMatch(card, /INLINE_MATH_PATTERN/);
});
