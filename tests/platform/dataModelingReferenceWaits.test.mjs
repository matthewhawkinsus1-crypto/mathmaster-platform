// THE REFERENCE MODEL WAITS UNTIL THE QUESTION IS OVER.
//
// Walkthrough 2026-10-22, Algebra I DOL #3 Review PR 11: after the FIRST wrong
// try, with two left, the feedback said "Reference after submit: linear
// regression y ≈ 6.13x + 54.9" — the model the item asks the student to
// produce — and "best candidate by RMSE: Quadratic." on a linear line-fit
// item. The reference now waits for a right answer, the last try, or a
// surface that reveals answers, and names a best candidate only where the item
// asks for a model family.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const lab = executableSource(readFileSync(new URL('../../src/tools/dataModeling/DataModelingLab.jsx', import.meta.url), 'utf8'));

test('the regression reference shows only once the question is over, or where answers are revealed', () => {
  assert.match(lab, /const \{ questionTerminal \} = useToolRuntimeContext\(\);/);
  assert.match(lab, /const answersRevealed = useRevealAnswers\(\);/);
  const feedbackBlock = region(lab, '{feedback ? (', ') : null}\n        </Panel>', 'the submit panel feedback');
  const gate = feedbackBlock.indexOf('{feedback.isCorrect || questionTerminal || answersRevealed ? (');
  const reference = feedbackBlock.indexOf('linear regression y ≈');
  assert.ok(gate > -1, 'the reference is gated');
  assert.ok(reference > gate, 'and the regression line is inside the gate');
  assert.doesNotMatch(feedbackBlock, /Reference after submit/);
});

test('"best candidate" is named only where the item asks the student to choose a model family', () => {
  const feedbackBlock = region(lab, '{feedback ? (', ') : null}\n        </Panel>', 'the submit panel feedback');
  assert.match(feedbackBlock, /\{showModelComparePanel \? <>; best candidate by /);
  assert.match(lab, /const showModelComparePanel = mode === 'full' \|\| mode === 'modelCompare';/);
});
