// THE ASSESSMENT CROSSWALK IS NOT IN A STUDENT'S FIRST LOAD (PF01).
//
// scripts/check-first-load-budget.mjs measured src/platform/ccmr/
// assessmentCrosswalk.js (the layer that resolves a skill to the assessments it
// appears on) in front of every student's Home, where only the assessments'
// names were read: a question card's "Digital SAT practice" (App.jsx) and the
// weekly plan's transfer reason (weeklyTransferFramework.js, under the
// recommendation engine). The names now live on their own
// (src/platform/ccmr/frameworkLabels.js), which the crosswalk re-exports, so
// the crosswalk loads with My Math Path, the question screen and the teacher's
// tools, which resolve skills.
//
// Same walk as tests/platform/initialBundleBoundary.test.mjs (static imports
// from main.jsx, then App.jsx), through tests/platform/helpers/firstLoadGraph.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';
import * as crosswalk from '../../src/platform/ccmr/assessmentCrosswalk.js';
import * as names from '../../src/platform/ccmr/frameworkLabels.js';
import { TRANSFER_FRAMEWORK_REASON, transferExplanationFor } from '../../src/platform/path/weeklyTransferFramework.js';

const graph = firstLoadGraph();
const file = (name) => path.join(repo, name);

test('the walker reaches the first load, and both places Home names an assessment', () => {
  assert.ok(graph.has(file('src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  // What stays, on purpose: Home still names assessments, from the names alone.
  for (const name of ['src/platform/ccmr/frameworkLabels.js', 'src/platform/path/weeklyTransferFramework.js']) {
    assert.ok(graph.has(file(name)), `${name} is no longer reached: the walk or the wiring changed, so the absence below proves nothing`);
  }
});

test('assessmentCrosswalk.js is not in the first load: Home reads only the names (frameworkLabels.js)', () => {
  const key = file('src/platform/ccmr/assessmentCrosswalk.js');
  // A module that was renamed or deleted is in no graph at all: say so, or the
  // absence below proves nothing about the module that took its place.
  assert.ok(existsSync(key), 'assessmentCrosswalk.js no longer exists: point this test at the module that holds the crosswalk now');
  assert.ok(!graph.has(key), `assessmentCrosswalk.js is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
});

test('every caller reads the same names: the crosswalk re-exports the one object', () => {
  assert.equal(crosswalk.FRAMEWORK_LABELS, names.FRAMEWORK_LABELS);
  assert.ok(Object.isFrozen(names.FRAMEWORK_LABELS));
  // The names as assessmentCrosswalk.js wrote them before the move.
  assert.deepEqual({ ...names.FRAMEWORK_LABELS }, {
    digitalSAT: 'Digital SAT',
    act: 'ACT',
    tsia2: 'TSIA2',
    asvab: 'ASVAB',
  });
  // Every framework the crosswalk resolves has a name.
  for (const framework of crosswalk.ASSESSMENT_FRAMEWORKS) assert.ok(names.FRAMEWORK_LABELS[framework], `${framework} has no name`);
});

test('the weekly plan still names the assessment it chose, from the names alone', () => {
  assert.equal(
    transferExplanationFor({ framework: 'tsia2', reason: TRANSFER_FRAMEWORK_REASON.TEST_SOON }),
    'Your TSIA2 is coming up, so this practice uses the TSIA2 format.',
  );
  assert.equal(
    transferExplanationFor({ framework: 'digitalSAT', reason: TRANSFER_FRAMEWORK_REASON.GOAL }),
    'You are preparing for the Digital SAT, so this practice uses its format.',
  );
  assert.equal(transferExplanationFor({ framework: 'course', reason: TRANSFER_FRAMEWORK_REASON.GOAL }), null);
});
