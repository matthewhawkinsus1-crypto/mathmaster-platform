// A student must always be able to leave.
//
// THE TRAP THIS ENDS. Both My Math Path error screens offered exactly one
// control: Retry. A configuration problem does not fix itself between two
// clicks, so the reported live behaviour was precisely what the code made
// inevitable — the student pressed Retry, saw the same message, pressed it
// again, and had nowhere else to go. The container already received an
// `onReturnToDashboard` callback; neither error state used it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const container = readFileSync(
  new URL('../../src/components/student/MyMathPathProductionContainer.jsx', import.meta.url), 'utf8',
);

test('every error state offers a way back, not only a way to repeat the failure', () => {
  // Three screens can hold a student: the configuration error, the start
  // error, and a load that never resolves.
  const exits = container.match(/Back to My Math Path/g) || [];
  assert.ok(exits.length >= 3,
    `expected an exit on the configuration error, the start error and a stalled load; found ${exits.length}`);
});

test('a repeating failure stops leading with Retry', () => {
  // After two honest attempts, Retry has been demonstrated not to work.
  assert.match(container, /retryCount < 2 &&/,
    'Retry must retire once it has been shown not to help');
  assert.match(container, /setRetryCount\(\(current\) => current \+ 1\)/,
    'failures must actually be counted');
  assert.match(container, /setRetryCount\(0\)/,
    'and the count must reset when a load succeeds');
});

test('a stalled load hands the student an exit rather than a spinner', () => {
  assert.match(container, /setSlowLoad\(true\), 12000/,
    'a load that has clearly stalled must offer recovery');
  assert.match(container, /taking longer than it should/i);
});

test('error copy never blames the student for a system problem', () => {
  // "Never blame the student for a system configuration problem."
  assert.match(container, /setup problem on the site, not a problem with your work/i);
  assert.match(container, /Nothing you have done has been lost/i);
  assert.match(container, /rest of your path is still open/i,
    'one broken skill must not read as the whole path being broken');
});

test('the session exit goes one level up, not to Home', () => {
  // Back means one logical level up: Question -> Path Session -> My Math Path.
  assert.ok(!/Back to Home/.test(container),
    'Home is not the universal substitute for Back');
  assert.match(container, /onClick=\{onReturnToDashboard\}/);
});
