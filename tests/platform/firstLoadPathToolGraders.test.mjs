// THE PATH TOOL GRADERS ARE NOT IN A STUDENT'S FIRST LOAD (PF01, C1-103).
//
// scripts/check-first-load-budget.mjs measured about 16 KB gzip of Path tool
// graders (the contracts, and the data-modelling, graphing, systems-of-
// inequalities, regression-calculator and solver-race rules under them) in
// front of every student's Home. The only way in was one function: a Test
// Cycle family describes the tool it renders on (describeFamily in
// functions/shared/testCycleBlueprint.mjs), which asked
// secureToolCertification.resolveSecureToolId, which asked
// pathToolContracts.resolvePathToolId which tool a name means, and that import
// brought every grader along. The answer needs only the names
// (functions/shared/pathToolIds.mjs; tests/platform/pathToolIds.test.mjs holds
// it to the contracts), so the graders now load with the question runtime, My
// Math Path and the teacher's screens, which grade.
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

test('the walker reaches the first load, and the Test Cycle code that asks which tool a name means', () => {
  assert.ok(graph.has(path.join(repo, 'src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  // What stays, on purpose: Home still describes a Test Cycle family's tool.
  for (const file of ['testCycleBlueprint.mjs', 'secureToolCertification.mjs', 'pathToolIds.mjs']) {
    assert.ok(graph.has(shared(file)), `${file} is no longer reached: the walk or the wiring changed, so the absences below prove nothing`);
  }
});

for (const [file, why] of [
  ['pathToolContracts.mjs', 'every Path tool\'s public/private contract and grader; Home needs only which tool a name means (pathToolIds.mjs)'],
  ['pathDataModelingGrading.mjs', 'a grader under the contracts'],
  ['pathGraphingGrading.mjs', 'a grader under the contracts'],
  ['pathSystemsInequalityGrading.mjs', 'a grader under the contracts'],
  ['pathRegressionCalculatorGrading.mjs', 'a grader under the contracts'],
  ['solverRaceEquivalence.mjs', 'the solver race\'s rule, under the contracts'],
]) {
  test(`${file} is not in the first load: ${why}`, () => {
    const key = shared(file);
    // A module that was renamed or deleted is in no graph at all: say so, or
    // the absence below proves nothing about the module that took its place.
    assert.ok(existsSync(key), `${file} no longer exists: point this list at the module that holds the grader now`);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}
