// THE QUESTION FAMILY ENGINE IS NOT IN A STUDENT'S FIRST LOAD (PF01).
//
// scripts/check-first-load-budget.mjs measured about 6 KB gzip of the engine
// that turns a question family into one student's question
// (functions/shared/questionFamilyEngine.mjs, and the family contract under it)
// in front of every student's Home. The only way in was one eight-line function:
// questionGenerationIdentity.mjs names a student's seat with a token made from
// the platform's string hash, and the hash was defined in the engine. It now
// lives on its own (functions/shared/hashString32.mjs; tests/platform/
// hashString32.test.mjs holds it to the original), so the engine loads with the
// question runtime, which builds family questions.
//
// Same walk as tests/platform/initialBundleBoundary.test.mjs (static imports
// from main.jsx, then App.jsx), through tests/platform/helpers/firstLoadGraph.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';

const graph = firstLoadGraph();
const shared = (name) => path.join(repo, 'functions/shared', name);

test('the walker reaches the first load, and the code that names a student\'s seat', () => {
  assert.ok(graph.has(path.join(repo, 'src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  // What stays, on purpose: Home still names a student's seat.
  for (const file of ['questionGenerationIdentity.mjs', 'hashString32.mjs']) {
    assert.ok(graph.has(shared(file)), `${file} is no longer reached: the walk or the wiring changed, so the absences below prove nothing`);
  }
});

for (const [file, why] of [
  ['questionFamilyEngine.mjs', 'turns a family into a student\'s question; Home needs only the hash (hashString32.mjs)'],
  ['questionFamilyContract.mjs', 'what a family is, under the engine'],
]) {
  test(`${file} is not in the first load: ${why}`, () => {
    const key = shared(file);
    // A module that was renamed or deleted is in no graph at all: say so, or
    // the absence below proves nothing about the module that took its place.
    assert.ok(existsSync(key), `${file} no longer exists: point this list at the module that holds it now`);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}
