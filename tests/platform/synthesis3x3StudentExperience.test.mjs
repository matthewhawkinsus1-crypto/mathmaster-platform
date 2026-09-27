import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { verificationTokenNeeded } from '../../src/tools/systemsWorkspace/verificationTokenState.js';

test('verification keeps a solved value selected until every original equation has received it', () => {
  // The equations carry their text: whether one still needs a value depends on
  // whether it HAS that variable (#369).
  const equations = [{ id: 'E1', text: 'x + y + z = 6' }, { id: 'E2', text: '2x - y = 0' }, { id: 'E3', text: 'x + 3z = 10' }];
  const partial = { verification: { E1: { placed: { x: true } } } };
  const complete = {
    verification: {
      E1: { placed: { x: true } },
      E2: { placed: { x: true } },
      E3: { placed: { x: true } },
    },
  };
  assert.equal(verificationTokenNeeded(partial, equations, 'x'), true);
  assert.equal(verificationTokenNeeded(complete, equations, 'x'), false);
  assert.equal(verificationTokenNeeded(complete, equations, 'y'), true);
  // E3 has no y and never receives it: once E1 and E2 have y, y is done.
  const yPlaced = { verification: { E1: { placed: { y: true } }, E2: { placed: { y: true } } } };
  assert.equal(verificationTokenNeeded(yPlaced, equations, 'y'), false);
});

test('completed Warm-Up no longer keeps the active banner on screen', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(app, /const assignmentGrades = tracker\?\.\[assignment\.id\] \|\| \{\};/);
  assert.match(app, /\['correct', 'expired'\]\.includes\(rec\.status\)/);
  assert.match(app, /if \(allCompleted\) return null;/);
});

test('three-plane model gives short laptop viewports back to the mathematics', () => {
  const css = fs.readFileSync('src/tools/systemsWorkspace/ThreePlaneWorkspace.css', 'utf8');
  assert.match(css, /\.mathmaster-threeplane-viewport svg[\s\S]*?max-height:\s*min\(500px,\s*50vh\)/);
  assert.match(css, /\.mathmaster-work-view-surface\[data-enlarged="true"\][\s\S]*?max-height:\s*min\(720px,\s*75vh\)/);
});
