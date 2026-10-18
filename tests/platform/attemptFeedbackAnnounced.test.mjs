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
  // The engine's box: a live region behind the outcome-feedback gate. The
  // gate is asserted by its parts, not its spelling: since student pass 3
  // (RUN-6) it also leaves a closed question to the closed card below, and
  // the box carries the result-focus marker before its style.
  const box = region(engine, '{feedback && !feedback.blocked && showOutcomeFeedback', '</div>\n      )}', 'the engine outcome box');
  const gate = box.slice(0, box.indexOf('&& ('));
  assert.match(gate, /showOutcomeFeedback/, 'the box shows only where outcome feedback is shown');
  assert.match(gate, /!outcomeInTool/, 'the box steps aside when the tool shows the outcome');
  assert.match(box, /&& \(\s*<div role="status"/, 'the box is a live region');
  assert.match(box, /\{attemptOutcomeText\}/, 'the box shows the shared outcome words');
  // A closed question announces its outcome once, in the closed card, behind
  // the same gate and in the same words.
  const closed = region(engine, '{isExpired && showOutcomeFeedback && (', '</section>', 'the closed question card');
  assert.match(closed, /<div role="status"[^>]*>\s*\{feedback && !feedback\.blocked && attemptOutcomeText\s*\?\s*attemptOutcomeText/, 'the closed card announces the shared outcome words');
  // The gate is what keeps DOL / submit-only silent about correctness.
  assert.match(engine, /const showOutcomeFeedback = /);
  // The words exist once, and the box and the tool both read them.
  const words = region(engine, 'const attemptOutcomeText = feedback', 'const attemptOutcomeFocus', 'the outcome words');
  // A miss with tries left: "Not quite. You have 2 tries left." (submitCost.js).
  assert.match(words, /: missOutcomeText\(remainingAttempts\)\)\)/);
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
