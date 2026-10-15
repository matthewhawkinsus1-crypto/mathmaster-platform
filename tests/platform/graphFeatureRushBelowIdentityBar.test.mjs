/*
 * THE FULL-SCREEN GRAPH FEATURE RUSH ROUND STARTS BELOW THE STUDENT IDENTITY
 * BAR (found by job N's 200% Rush scene, review of #487).
 *
 * The identity bar is the authenticated-student shell's top bar: sticky, on top
 * of everything (StudentIdentityBar.jsx, z-index 21000), and it publishes its
 * height as --mm-student-identity-stack-offset. The Rush round is a fixed,
 * full-screen layer at z-index 9000. Laid out from the top of the viewport
 * (`inset: 0`), its first row — alias, round, found count, and the clock once
 * the row wraps — sat under the bar. The round now starts at the bar's height,
 * which the bar keeps current as it wraps (a ResizeObserver), and 0 where no
 * bar is shown.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the Rush round is laid out below the identity bar, which stays on top', () => {
  const bar = read('src/components/student/StudentIdentityBar.jsx');
  const offsetVar = /export const STUDENT_IDENTITY_STACK_OFFSET = '([^']+)'/.exec(bar)?.[1];
  const barZ = Number(/export const STUDENT_IDENTITY_Z_INDEX = (\d+)/.exec(bar)?.[1]);
  assert.equal(offsetVar, '--mm-student-identity-stack-offset');
  assert.ok(barZ > 0, 'the identity bar has a z-index');
  // The bar keeps the published height current as it wraps.
  assert.match(bar, /setProperty\(STUDENT_IDENTITY_STACK_OFFSET, `\$\{bar\.offsetHeight\}px`\)/);
  assert.match(bar, /new ResizeObserver\(publishHeight\)/);

  const rush = read('src/components/liveChallenge/GraphFeatureRushRound.jsx');
  const shell = region(rush, '.mm-rush-shell {', '}', 'Rush shell rule');
  assert.match(shell, /position: fixed;/);
  // Below the bar: the top is the bar's published height (0 without a bar).
  const top = /(?:^|[\s;])top:\s*([^;]+);/.exec(shell)?.[1]?.trim();
  assert.equal(top, `var(${offsetVar}, 0px)`, 'the round starts at the identity bar\'s height');
  assert.doesNotMatch(shell, /\binset:\s*0\s*;/, 'not laid out from the top of the viewport');
  // Still under the bar in the stacking order: the bar (and Log Out) stays usable.
  const rushZ = Number(/z-index:\s*(\d+)/.exec(shell)?.[1]);
  assert.ok(rushZ > 0 && rushZ < barZ, `Rush z-index ${rushZ} stays below the identity bar's ${barZ}`);
});
