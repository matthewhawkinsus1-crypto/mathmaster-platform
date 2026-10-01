// Platform quirks audit: the attempt outcome ("Not quite. You have 2 attempts
// remaining on this version.") was not a live region, so a screen-reader user
// heard nothing after a wrong submission — only the Correct overlay was. The
// message renders only when outcome feedback is allowed, so a DOL or other
// submit-only item still announces nothing about correctness.
//
// PQ-022 moved a registry tool's outcome into the tool's result area, beside
// its own verdict. The behaviour this file protects is unchanged: the outcome
// is announced, once, and only where outcome feedback is shown. It is now
// asserted for both places it can appear (tests/platform/toolAttemptOutcome
// covers the hand-over itself; tests/browser/toolAttemptOutcome.mjs counts the
// live regions in a browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));
const shell = executableSource(readFileSync(new URL('../../src/tools/shared/ToolShell.jsx', import.meta.url), 'utf8'));

test('the attempt outcome is announced, and only when outcome feedback is shown', () => {
  // The engine's box: a live region behind the outcome-feedback gate.
  const box = region(engine, '{feedback && !feedback.blocked && showOutcomeFeedback', '</div>\n      )}', 'the engine outcome box');
  assert.match(box, /^\{feedback && !feedback\.blocked && showOutcomeFeedback && !outcomeInTool && \(\s*<div role="status"/);
  assert.match(box, /\{attemptOutcomeText\}/, 'the box shows the shared outcome words');
  // The gate is what keeps DOL / submit-only silent about correctness.
  assert.match(engine, /const showOutcomeFeedback = /);
  // The words exist once, and the box and the tool both read them.
  const words = region(engine, 'const attemptOutcomeText = feedback', 'const attemptOutcomeFocus', 'the outcome words');
  assert.match(words, /`Not quite\. You have \$\{remainingAttempts\}/);
});

test('a tool shows the outcome only behind the same gate, and then the box does not', () => {
  const handOver = region(engine, 'const outcomeInTool = Boolean(', ');', 'the hand-over condition');
  for (const condition of [/missingToolDefinition/, /toolOutcomeSlot !== null/, /!feedback\.blocked/, /showOutcomeFeedback/, /!locked/]) {
    assert.match(handOver, condition, `the tool shows the outcome only when ${condition}`);
  }
  // What the tool is handed is null unless the hand-over holds, and carries
  // the same words as the box.
  assert.match(engine, /const toolAttemptOutcome = outcomeInTool \? \{[^}]*text: attemptOutcomeText,[^}]*\} : null;/);
  // In the tool, the outcome is a live region of its own (or joins the tool's
  // existing one, `inline`).
  const slot = region(shell, 'export const AttemptOutcome', 'export const ResultPill', 'the attempt outcome slot');
  assert.match(slot, /<div\s+ref=\{regionRef\}\s+role="status"/);
  assert.match(slot, /attemptOutcome\.slot === slot/, 'only the slot the engine chose shows it');
});
