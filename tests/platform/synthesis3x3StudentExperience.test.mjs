import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { verificationTokenNeeded } from '../../src/tools/systemsWorkspace/verificationTokenState.js';

test('verification keeps a solved value selected until every original equation has received it', () => {
  const equations = [{ id: 'E1' }, { id: 'E2' }, { id: 'E3' }];
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
