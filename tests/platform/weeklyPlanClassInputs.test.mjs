/*
 * A TEACHER'S PREVIEW OF A STUDENT'S WEEK ASKS FOR THE STUDENT'S WEEK
 * (student push D, item 8 review).
 *
 * The student's Path built the week from the class's settings — how many
 * sessions, whether the class expects CCMR work, the framework the teacher
 * picked — but the teacher's Weekly Path table (before the week is frozen) and
 * the profile drawer asked the planner with none of them. A class that expects
 * no CCMR work previewed an EMPTY week to its teacher while every student was
 * given four sessions, and a teacher who picked ACT saw SAT practice.
 * weeklyPlanClassInputs is now the one place those settings become planner
 * inputs, on both sides.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildWeeklyGoal, weeklyPlanClassInputs } from '../../src/platform/path/weeklyPathGoal.js';
import { INSTRUCTIONAL_BAND } from '../../src/platform/profile/studentLearningProfile.js';
import { buildWeeklyPathPlan } from '../../src/platform/path/weeklyPathPlan.js';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-07T15:00:00Z');

test('the class settings become the same planner inputs the student\'s Path uses', () => {
  assert.deepEqual(weeklyPlanClassInputs({ config: {}, honors: false }), {
    sessions: 4, honors: false, interventionMode: false, allowTransfer: false, pinnedSkills: [], ccmrFramework: 'auto',
  });
  assert.deepEqual(weeklyPlanClassInputs({ config: {}, honors: true }), {
    sessions: 5, honors: true, interventionMode: false, allowTransfer: true, pinnedSkills: [], ccmrFramework: 'auto',
  });
  const picked = weeklyPlanClassInputs({
    config: { sessions: 6, ccmrExpectation: 'required', framework: 'act', interventionMode: true, pinnedSkills: ['teks:A.5A'] },
    honors: false,
  });
  assert.deepEqual(picked, {
    sessions: 6, honors: false, interventionMode: true, allowTransfer: true, pinnedSkills: ['teks:A.5A'], ccmrFramework: 'act',
  });
  // An Honors class whose teacher expects no CCMR work gets none.
  assert.equal(weeklyPlanClassInputs({ config: { ccmrExpectation: 'none' }, honors: true }).allowTransfer, false);
  // Out-of-range counts are clamped exactly as the goal clamps them.
  assert.equal(weeklyPlanClassInputs({ config: { sessions: 40 } }).sessions, weeklyPlanClassInputs({ config: { sessions: 99 } }).sessions);
});

// Strong in class, behind on the SAT's format: the student the planner gives
// transfer work when the class expects it (weeklyNoCcmrExpectation.test.mjs).
const transferGapProfile = {
  baseline: { established: true },
  instructionalBand: INSTRUCTIONAL_BAND.ON,
  difficultyProfile: { stableBand: 3 },
  dokProfile: {},
  courseMastery: 0.9,
  ccmrTransfer: { digitalSAT: { proficiency: 0.5, provisional: false } },
  foundationGapDepth: 0,
};

// The teacher table's pre-freeze row: the plan, then the goal from the same
// class settings (App.jsx teacherWeeklyGoalsByStudent).
const teacherPreview = ({ config, honors }) => {
  const options = buildStudentPathOptions({ student: { id: 's' }, assignments: [], courseId: 'algebra1', nowValue: NOW });
  const plan = buildWeeklyPathPlan({
    options, courseId: 'algebra1', profile: transferGapProfile, ...weeklyPlanClassInputs({ config, honors }), now: NOW,
  });
  return buildWeeklyGoal({ plan, config, honors, studentId: 's', courseId: 'algebra1', now: NOW });
};

test('a class that expects no CCMR work previews the week its students get, not an empty one', () => {
  const goal = teacherPreview({ config: {}, honors: false });
  assert.equal(goal.sessions.length, 4, 'the four sessions the student is given');
  assert.deepEqual([...new Set(goal.sessions.map((session) => session.context))], ['course']);
});

test('a teacher who picked ACT previews ACT practice, as the student\'s week has it', () => {
  const goal = teacherPreview({ config: { ccmrExpectation: 'required', framework: 'act' }, honors: true });
  assert.equal(goal.sessions.length, 5);
  assert.ok(goal.sessions.some((session) => session.purpose === 'transfer'));
  goal.sessions.filter((session) => session.purpose === 'transfer')
    .forEach((session) => assert.equal(session.context, 'act'));
});

test('the teacher\'s Weekly Path table and profile drawer build the week through the same helper', () => {
  const app = executableSource(read('src/App.jsx'));
  const table = region(app, 'const teacherWeeklyGoalsByStudent = useMemo(() => {', '\n  }, [', 'teacher weekly table');
  assert.match(table, /buildWeeklyPathPlan\(\{[^}]*\.\.\.weeklyPlanClassInputs\(\{ config, honors \}\),/);
  const drawer = region(app, 'return buildWeeklyPathPlan({\n      options,\n      courseId: context.courseId,', '\n  }, [', 'profile drawer plan');
  assert.match(drawer, /\.\.\.weeklyPlanClassInputs\(\{\s*config: storedWeeklyGoalForClassContext\(weeklyGoalsByClass, \{/);
  assert.match(app, /profileDrawerLearningProfile, weeklyGoalsByClass\]\);/, 'and the drawer follows a settings change');
  // The calls above need their import (AGENTS.md).
  assert.match(app, /import \{[^}]*\bweeklyPlanClassInputs\b[^}]*\} from '\.\/platform\/path\/weeklyPathGoal\.js';/);
});
