// Platform quirks audit: the attempt outcome ("Not quite. You have 2 attempts
// remaining on this version.") was not a live region, so a screen-reader user
// heard nothing after a wrong submission — only the Correct overlay was. The
// message renders only when outcome feedback is allowed, so a DOL or other
// submit-only item still announces nothing about correctness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region } from './helpers/sourceContract.mjs';

const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');

test('the attempt outcome is announced, and only when outcome feedback is shown', () => {
  const block = region(engine, '{feedback && !feedback.blocked && showOutcomeFeedback && (', 'Not quite. You have');
  assert.match(block, /^\{feedback && !feedback\.blocked && showOutcomeFeedback && \(\s*<div role="status"/);
  // The gate is what keeps DOL / submit-only silent about correctness.
  assert.match(engine, /const showOutcomeFeedback = /);
});
