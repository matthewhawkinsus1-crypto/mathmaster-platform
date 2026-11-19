/*
 * A STEP ALGEBRA STEP IS COMMITTED ONCE, HOWEVER OFTEN ITS COMMIT IS PRESSED
 * (src/StepByStepAlgebraCore.jsx; a review after #386).
 *
 * A balanced step settles for 620 ms (its animation) before it is saved, and
 * Check my simplification was disabled only while the save ran, its handler
 * guarded only by the save. A second press in between committed the step again:
 * measured in Chromium (tests/browser/stepAlgebraFirstOperand.mjs `double`), two
 * clicks, a double click, Enter twice in the simplification box or on the
 * button, the number pad's Enter, Space twice and a phone's two taps each gave
 * 2 step grades and 2 work steps "Divided both sides by 5", and a composed
 * question's step 2 work steps; Keep as written and a pair cancelled with no
 * operation in hand already refused the second press. The browser driver
 * presses every way; these pin the board's wiring. Each was broken once and
 * went red.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';

const board = executableSource(readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8'));

test('the board keeps one mark for a step being committed, a ref, so a press in the same frame sees it', () => {
  assert.match(board, /const stepCommitInFlightRef = useRef\(false\);/);
  // Taken and given back only where a step's commit begins and ends.
  const taken = board.match(/stepCommitInFlightRef\.current = true;/g) || [];
  const released = board.match(/stepCommitInFlightRef\.current = false;/g) || [];
  assert.equal(taken.length, 2, 'commitMove and a pair cancelled with no operation in hand');
  assert.equal(released.length, 2, 'each gives it back once, when its step is committed, held or failed');
});

test('a balanced step\'s commit refuses a second commit until the first has settled', () => {
  const commit = region(board, 'const commitMove = async', 'const hasPartialCancellationSelection', 'commitMove');
  // First thing: refused while a step is being committed, then marked.
  assert.match(commit, /^const commitMove = async \(move, \{ resolution = 'normal', crossedSidesOverride = null \} = \{\}\) => \{\s*if \(stepCommitInFlightRef\.current\) return;\s*stepCommitInFlightRef\.current = true;/);
  // Given back only once the step has settled: committed, held or failed.
  const timer = commit.slice(commit.lastIndexOf('window.setTimeout('));
  assert.match(timer, /^window\.setTimeout\(\(\) => \{ settle\(\)\.finally\(\(\) => \{ stepCommitInFlightRef\.current = false; \}\); \}, motionDuration\(620, reducedMotion, \{ floor: 40 \}\)\);\s*\};\s*$/);
  const settle = region(commit, 'const settle = async () => {', 'window.setTimeout(', 'the step settling');
  assert.match(settle, /const saved = await saveStep\(/, 'the save is inside what the mark covers');
  assert.match(settle, /if \(holdUnsavedStep\(saved, \(\) => commitMove\(/, 'and so is a held step, whose "Apply the step again" commits anew');
});

test('a pair cancelled with no operation in hand is one commit too', () => {
  const cancel = region(board, 'const commitStandaloneCancellation = async (side, model) => {', 'const registerCancellationHits = async', 'commitStandaloneCancellation');
  assert.match(cancel, /^const commitStandaloneCancellation = async \(side, model\) => \{\s*if \(!model\?\.resultExpression \|\| savingStep \|\| cancelAnimating \|\| stepCommitInFlightRef\.current\) return;\s*stepCommitInFlightRef\.current = true;/);
  assert.match(cancel, /\} finally \{\s*setSavingStep\(false\);\s*setCancelAnimating\(false\);\s*stepCommitInFlightRef\.current = false;\s*\}/);
});

test('Check my simplification waits for the step to settle, from the button and from Enter in its box', () => {
  const check = region(board, 'const checkSimplifications = async () => {', 'const targets =', 'checkSimplifications');
  assert.match(check, /if \(!pendingMove \|\| savingStep \|\| cancelAnimating\) return;/, 'Enter in the box and the button both call it');
  assert.match(board, /onSubmit=\{checkSimplifications\}/, 'the simplification box submits through it');
  const panel = region(board, '<div className="algebra-simplification-actions">', '</div>', 'the simplification actions');
  assert.match(panel, /className="algebra-keep-written" onClick=\{keepPendingMoveAsWritten\} disabled=\{savingStep \|\| cancelAnimating\}/);
  assert.match(panel, /className="algebra-check-simplification" onClick=\{checkSimplifications\} disabled=\{savingStep \|\| cancelAnimating\}/, 'as Keep as written does');
});
