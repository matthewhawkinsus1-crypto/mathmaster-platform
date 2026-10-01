// RESOURCES A LONG SESSION MUST GIVE BACK.
//
// A Chromebook keeps MathMaster open all day. Each of these held something
// for the rest of the session that it only needed for a moment; each is now
// released. Behaviour tests run the real code where node can; the two React
// sites are pinned to the statement that does the releasing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('the walkthrough timer closes the AudioContext it opens for its beep', () => {
  const app = read('src/App.jsx');
  const beep = region(app, 'const audio = new window.AudioContext();', 'oscillator.stop(', 'walkthrough beep');
  // A running AudioContext is never collected; the close is wired before start.
  assert.match(beep, /oscillator\.onended = \(\) => \{ audio\.close\?\.\(\)/);
});

test('the mobile keypad container forgets inputs that left the page', () => {
  const container = read('src/components/student/MobileViewportContainer.jsx');
  const prepare = region(container, 'const prepareNumericInputs = (scope) => {', 'input.setAttribute(\'inputmode\', \'none\');', 'prepareNumericInputs');
  assert.match(prepare, /originals\.forEach\(\(_, input\) => \{ if \(!input\.isConnected\) originals\.delete\(input\); \}\);/);
});
