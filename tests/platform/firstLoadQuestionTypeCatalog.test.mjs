// THE QUESTION TYPE CATALOG IS NOT IN A STUDENT'S FIRST LOAD (PF01).
//
// scripts/check-first-load-budget.mjs measured about 13 KB gzip of authoring
// metadata (the catalog of question types: labels, purposes, examples and
// validators, with the question recipes those validators ask) in front of every
// student's Home. The only way in was one call: the live-presence heartbeat
// asks what a question shows the student (App.jsx, getQuestionRepresentation).
// The answer needs only a name per type and a few rules about what a question
// carries (functions/shared/questionRepresentation.mjs; tests/platform/
// questionRepresentation.test.mjs holds it to the catalog), so the catalog now
// loads where questions are authored and checked: Preflight, the authoring
// contract, the teacher's Representation Audit.
//
// Same walk as tests/platform/initialBundleBoundary.test.mjs (static imports
// from main.jsx, then App.jsx), through tests/platform/helpers/firstLoadGraph.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';

const graph = firstLoadGraph();
const at = (file) => path.join(repo, file);

test('the walker reaches the first load, and the module that says what a question shows', () => {
  assert.ok(graph.has(at('src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  // What stays, on purpose: Home still tells a teacher's tile what a question shows.
  const key = at('functions/shared/questionRepresentation.mjs');
  assert.ok(existsSync(key), 'questionRepresentation.mjs no longer exists');
  assert.ok(graph.has(key), 'questionRepresentation.mjs is no longer reached: the walk or the wiring changed, so the absences below prove nothing');
});

for (const [file, why] of [
  ['src/platform/contract/questionTypeCatalog.js', 'authoring metadata for every question type; Home needs only what a question shows (questionRepresentation.mjs)'],
  ['functions/shared/questionTypeCatalog.mjs', 'the server\'s copy of the catalog, for validating a teacher\'s repair'],
  ['src/platform/workflow/questionRecipes.js', '39 KB of source; the catalog\'s validators ask the recipes whether an answer key would derive'],
]) {
  test(`${file} is not in the first load: ${why}`, () => {
    const key = at(file);
    // A module that was renamed or deleted is in no graph at all: say so, or
    // the absence below proves nothing about the module that took its place.
    assert.ok(existsSync(key), `${file} no longer exists: point this list at the module that holds it now`);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}
