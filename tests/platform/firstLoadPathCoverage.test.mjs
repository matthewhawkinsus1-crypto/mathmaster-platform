// MY MATH PATH'S COVERAGE BUILDER IS NOT IN A STUDENT'S FIRST LOAD (PF01).
//
// scripts/check-first-load-budget.mjs measured about 7.6 KB gzip of the code
// that builds My Math Path's coverage index and judges each standard's content
// (functions/shared/pathCoverage.mjs, with pathStandardQuality.mjs,
// pathQuestionQuality.mjs and the answer summaries' support under them) in
// front of every student's Home. Home asks the index only whether a skill is
// open to practise: the recommended skills (pathCoverageService.js,
// recommendedCoverage.js), the weekly plan's transfer framework
// (recommendationV2.js, weeklyTransferFramework.js) and the CCMR plan's
// frameworks (ccmrPlan.mjs). Those lookups now live on their own
// (functions/shared/pathCoverageLookup.mjs; tests/platform/
// pathCoverageLookup.test.mjs holds them to the originals), so the builder
// loads with My Math Path, the teacher's coverage audit and the server, which
// build or audit an index.
//
// Same walk as tests/platform/initialBundleBoundary.test.mjs (static imports
// from main.jsx, then App.jsx), through tests/platform/helpers/firstLoadGraph.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';

const graph = firstLoadGraph();
const file = (name) => path.join(repo, name);

test('the walker reaches the first load, and the code that asks whether a skill is open', () => {
  assert.ok(graph.has(file('src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  // What stays, on purpose: Home still asks the index, through the lookups.
  for (const name of [
    'functions/shared/pathCoverageLookup.mjs',
    'src/platform/path/pathCoverageService.js',
    'src/platform/path/recommendedCoverage.js',
    'src/platform/path/recommendationV2.js',
    'src/platform/path/weeklyTransferFramework.js',
    'functions/shared/ccmrPlan.mjs',
  ]) {
    assert.ok(graph.has(file(name)), `${name} is no longer reached: the walk or the wiring changed, so the absences below prove nothing`);
  }
});

for (const [name, why] of [
  ['functions/shared/pathCoverage.mjs', 'builds and explains a coverage index; Home only reads one (pathCoverageLookup.mjs)'],
  ['functions/shared/pathStandardQuality.mjs', 'judges a standard\'s content, under the builder'],
  ['functions/shared/pathQuestionQuality.mjs', 'judges a question\'s content, under the builder'],
]) {
  test(`${path.basename(name)} is not in the first load: ${why}`, () => {
    const key = file(name);
    // A module that was renamed or deleted is in no graph at all: say so, or
    // the absence below proves nothing about the module that took its place.
    assert.ok(existsSync(key), `${name} no longer exists: point this list at the module that holds it now`);
    assert.ok(!graph.has(key), `${name} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}
