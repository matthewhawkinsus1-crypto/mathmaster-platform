// COURSE RIGOR'S CHECKS ARE NOT IN A STUDENT'S FIRST LOAD (PF01).
//
// scripts/check-first-load-budget.mjs measured about 4.6 KB gzip of
// src/platform/rigor/courseRigor.js (the Honors rigor checks, a sequence's
// rigor summary, adaptive rigor) and the strand table under it
// (strandConfig.js) in front of every student's Home. App read two names from
// it: each class period's course profile and the defaults it starts from
// (defaultCourseProfiles, normalizeCourseProfiles). Those now live on their own
// (src/platform/rigor/courseProfiles.js), which courseRigor.js re-exports, so
// the checks load with the teacher's screens that use them (the teacher's
// workspace among them, fetched at a teacher's sign-in).
//
// Same walk as tests/platform/initialBundleBoundary.test.mjs (static imports
// from main.jsx, then App.jsx), through tests/platform/helpers/firstLoadGraph.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';
import * as rigor from '../../src/platform/rigor/courseRigor.js';
import * as profiles from '../../src/platform/rigor/courseProfiles.js';

const graph = firstLoadGraph();
const file = (name) => path.join(repo, name);

test('the walker reaches the first load, and the course profiles App reads', () => {
  assert.ok(graph.has(file('src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  // What stays, on purpose: App still reads each period's course and level.
  assert.ok(graph.has(file('src/platform/rigor/courseProfiles.js')),
    'courseProfiles.js is no longer reached: the walk or the wiring changed, so the absences below prove nothing');
});

for (const [name, why] of [
  ['src/platform/rigor/courseRigor.js', 'the Honors rigor checks; App reads only the course profiles (courseProfiles.js)'],
  ['src/platform/mastery/strandConfig.js', 'the strand table the rigor summary reads, under courseRigor.js'],
]) {
  test(`${path.basename(name)} is not in the first load: ${why}`, () => {
    const key = file(name);
    // A module that was renamed or deleted is in no graph at all: say so, or
    // the absence below proves nothing about the module that took its place.
    assert.ok(existsSync(key), `${name} no longer exists: point this list at the module that holds it now`);
    assert.ok(!graph.has(key), `${name} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}

test('every caller reads the same course profiles: courseRigor.js re-exports them', () => {
  for (const name of ['COURSE_LEVELS', 'COURSE_OPTIONS', 'defaultCourseProfiles', 'normalizeCourseId', 'normalizeCourseLevel', 'normalizeCourseProfiles']) {
    assert.equal(rigor[name], profiles[name], `${name} is one value, whichever module it is read from`);
  }
  const periods = ['1', '3', '5'];
  // As courseRigor.js built them before the move.
  assert.deepEqual(profiles.defaultCourseProfiles(periods)['3'], { classPeriod: '3', course: 'algebra1', courseLabel: 'Algebra I', courseLevel: 'standard' });
  const normalized = profiles.normalizeCourseProfiles({ 3: { course: 'Algebra 2', courseLevel: 'HONORS', teacherNote: 'kept' }, 5: { courseId: 'alg2', level: 'standard' } }, periods);
  assert.deepEqual(normalized['3'], { classPeriod: '3', course: 'algebra2', courseLabel: 'Algebra II', courseLevel: 'honors', teacherNote: 'kept' });
  assert.deepEqual(normalized['5'], { classPeriod: '5', course: 'algebra2', courseLabel: 'Algebra II', courseLevel: 'standard', courseId: 'alg2', level: 'standard' });
  assert.deepEqual(normalized['1'], profiles.defaultCourseProfiles(periods)['1']);
  // What the rigor checks still read through it.
  assert.deepEqual(rigor.splitClassPeriodsByRigor(periods, normalized), { standard: ['1', '5'], honors: ['3'] });
  assert.equal(rigor.resolveAdaptiveRigor({ courseLevel: 'HONORS', readiness: 'onTrack' }).mode, 'honors');
});
