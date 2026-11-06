// GRADES, ASSIGNMENTS, REWARDS AND THE RESULT PAGE ARE NOT IN A STUDENT'S
// FIRST LOAD (PF01).
//
// scripts/check-first-load-budget.mjs measured four screens in front of every
// student's Home that a student needs only after opening one: the Grade
// Center, the Assignments Center, My Rewards and an assignment's result page,
// with the modules only they reach (the Assignments Center's model, the result
// page's next step, the class rewards shelf and its catalog, the Practice Pass
// dialog). Without them studentHome is about 16 KB gzip smaller. App now takes
// them from src/app/lazyScreens.js: each loads on demand, is fetched while
// Home is idle (studentScreenPrefetch.test.mjs) and has its own way through
// code that cannot load (lazyStudentScreens.test.mjs). The response
// checkpoint's grading imports stay where they are: that code saves an answer.
//
// Same walk as tests/platform/initialBundleBoundary.test.mjs (static imports
// from main.jsx, then App.jsx), through tests/platform/helpers/firstLoadGraph.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';
import { importsComponent } from './helpers/componentImport.mjs';

const graph = firstLoadGraph();
const SCREENS = {
  StudentGradeCenter: 'src/components/student/StudentGradeCenter.jsx',
  StudentAssignmentsCenter: 'src/components/student/StudentAssignmentsCenter.jsx',
  StudentRewardsCenter: 'src/components/student/rewards/StudentRewardsCenter.jsx',
  StudentAssignmentResult: 'src/components/student/StudentAssignmentResult.jsx',
};

test('the walker reaches the first load, and what Home keeps on purpose', () => {
  assert.ok(graph.has(path.join(repo, 'src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  for (const file of [
    // How the four load, and what a student sees when their code cannot.
    'src/app/lazyScreens.js',
    'src/app/student/studentScreenPrefetch.js',
    'src/platform/runtime/retryableChunk.js',
    'src/components/common/ScreenErrorBoundary.jsx',
    // App builds the Grade Center model itself (Home's summary, Ways to raise).
    'src/platform/student/studentGradeCenterModel.js',
    // The code that saves a student's answer: not deferred (the owner's call).
    'src/platform/performance/responseCheckpoint.js',
  ]) {
    assert.ok(graph.has(path.join(repo, file)), `${file} is no longer reached: the walk or the wiring changed, so the absences below prove nothing`);
  }
});

for (const [file, why] of [
  ...Object.values(SCREENS).map((screen) => [screen, 'a screen a student opens from Home, loaded then (lazyScreens.js)']),
  ['src/platform/student/studentAssignmentsCenterModel.js', 'what the Assignments Center lists'],
  ['src/platform/student/assignmentsCenterMemory.js', 'the Assignments Center\'s remembered search and tab'],
  ['src/platform/student/studentResultNextStep.js', 'what the result page offers next'],
  ['src/components/student/GradeSectionBreakdown.jsx', 'a grade\'s sections, on Grades and the result page'],
  ['src/components/student/rewards/UsePracticePassDialog.jsx', 'using a Practice Pass, on My Rewards'],
  ['src/components/student/rewards/ClassRewardsShelf.jsx', 'the class rewards shelf, on My Rewards'],
  ['functions/shared/classRewardCatalog.mjs', 'the class reward catalog the shelf reads'],
]) {
  test(`${path.basename(file)} is not in the first load: ${why}`, () => {
    const key = path.join(repo, file);
    // A renamed or deleted module is in no graph at all: say so, or the
    // absence below proves nothing about the module that took its place.
    assert.ok(existsSync(key), `${file} no longer exists: point this list at the module that holds it now`);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}

test('App takes each screen from lazyScreens.js, as a student screen of its own module', () => {
  const lazyScreens = readFileSync(path.join(repo, 'src/app/lazyScreens.js'), 'utf8');
  for (const [name, file] of Object.entries(SCREENS)) {
    assert.equal(importsComponent('src/App.jsx', name, file), 'onDemand', `App imports ${name} statically, or not at all`);
    const loaded = `../${path.posix.relative('src', file)}`.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    assert.match(lazyScreens, new RegExp(`^export const ${name} = studentScreen\\(\\(\\) => import\\('${loaded}'\\), 'Opening [^']+…'\\);$`, 'm'));
  }
});
