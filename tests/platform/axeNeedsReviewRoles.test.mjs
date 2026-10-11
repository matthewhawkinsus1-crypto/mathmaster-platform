// axe "needs review" (aria-prohibited-attr), job H item 5: an aria-label on a
// role-less <div> is not exposed. Each now has the role its label describes.
// Browser proof: the accessibility certification's needsReview list
// (tests/browser/accessibilityCertification.mjs) no longer carries them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('Step Algebra: the balance stage is a named group, its "=" an image named "equals"', () => {
  const core = read('src/StepByStepAlgebraCore.jsx');
  assert.match(core, /role="group"\s+aria-label="Interactive algebra balance scale"\s+className=\{`algebra-equation-stage/);
  assert.match(core, /className=\{`algebra-balance-equals[^`]*`\}[^>]*role="img" aria-label="equals">=<\/div>/);
});

test('Live Challenge: the round clock is a timer', () => {
  const live = read('src/components/liveChallenge/LiveChallengeStudent.jsx');
  assert.match(live, /<div\s+role="timer"\s+aria-label=\{roundStarted \? `\$\{Math\.ceil\(remainingMs \/ 1000\)\} seconds left`/);
});
