/*
 * A SHORT WEEK THE SERVER'S OWN PLANNER CANNOT FILL IS GRADED, NOT REFUSED
 * (student push I, item 5).
 *
 * Since the server decides the graded count (weeklyPathServerCount.test.mjs),
 * a proposal shorter than the class's count was refused unless the teacher
 * selects every session. In a sweep of 360 legitimate class configurations an
 * honest planner came up short 4 times — six-session Algebra I classes in
 * late August, when only five skills are open — and those students got no
 * graded week at all.
 *
 * Now, for a short proposal only, the server runs the same planner on its own
 * records (functions/lib/weeklyPathServerPlan.js). The week freezes when the
 * server's plan is at least as short, and is refused when the server could
 * fill more: a browser can never shorten its own week.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { freezeWeeklyPathGoalProposal } from '../../functions/shared/weeklyPathSlotAuthority.mjs';
import { gradeWeeklyGoal } from '../../functions/shared/weeklyPathGrade.mjs';
import {
  buildTeacherWeeklyView, buildWeeklyGoal, describeShortWeek, normalizeWeeklyGoalConfig, weeklyPlanClassInputs,
} from '../../src/platform/path/weeklyPathGoal.js';
import { buildWeeklyPathPlan } from '../../src/platform/path/weeklyPathPlan.js';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { buildStudentLearningProfile } from '../../src/platform/profile/studentLearningProfile.js';
import { buildUnifiedMasteryProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { interventionAsOverride, normalizeOverrides, overridesForClassContext } from '../../src/platform/path/pathStore.js';
import { plannerClosure, plannerVendorDrift, syncFunctionsWeeklyPlanner } from '../../scripts/sync-functions-weekly-planner.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const { loadWeeklyFreezeInputs } = require('../../functions/lib/weeklyPathFreezeInputs.js');
const serverPlan = require('../../functions/lib/weeklyPathServerPlan.js');
const { weeklyPathCourseWork } = require('../../functions/lib/weeklyPathClassroom.js');
const read = (file) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

const DAY = 86400000;
const STUDENT = 'S1';
const CLASS = { classId: 'class-1', period: 'Period 3' };

// Server mastery records in the stored shape (studentMasteryProfiles).
const evidence = (now, estimate, successes, daysAgo = 10) => ({
  mastery: { estimate },
  accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: successes },
  dimensions: { eligibleGradeLevelEvents: 6, dokRepresented: [2, 3], lastIndependentSuccessAt: now - daysAgo * DAY },
});
const LEARNERS = {
  new: { honors: false, profiles: () => ({}) },
  developing: {
    honors: false,
    profiles: (now, course) => (course === 'algebra1'
      ? { 'texas:A.2A': evidence(now, 60, 3), 'texas:A.2B': evidence(now, 55, 2) }
      : { 'texas:A2.2A': evidence(now, 60, 3) }),
  },
  strong: {
    honors: true,
    profiles: (now, course) => (course === 'algebra1'
      ? { 'texas:A.2A': evidence(now, 95, 6, 20), 'texas:A.2B': evidence(now, 94, 6, 20), 'texas:A.2C': evidence(now, 93, 6, 40) }
      : { 'texas:A2.2A': evidence(now, 95, 6, 40), 'texas:A2.2B': evidence(now, 94, 6, 20) }),
  },
  gap: {
    honors: false,
    profiles: (now, course) => (course === 'algebra1'
      ? { 'texas:A.2A': evidence(now, 20, 0), 'texas:A.2C': evidence(now, 25, 0) }
      : { 'texas:A2.2A': evidence(now, 20, 0) }),
  },
  honorsNew: { honors: true, profiles: () => ({}) },
};
const COURSES = ['algebra1', 'algebra2'];
const DATES = ['2026-08-26', '2026-09-09', '2026-09-23', '2026-10-07', '2026-11-04', '2026-12-02', '2027-01-13', '2027-02-10', '2027-03-24'];
const SESSIONS = [3, 4, 5, 6];

// The week the student's browser proposes, assembled as App.jsx and
// MyMathPathApp assemble it: the class's stored settings, the server mastery
// profile, and the planner, then the goal.
const clientProposal = ({ courseId, honors, settings, serverProfiles, now, pacing = null }) => {
  const config = normalizeWeeklyGoalConfig(settings, { honors: Boolean(settings.honors) });
  const masteryProfilesByTeks = buildUnifiedMasteryProfiles({ student: { id: STUDENT }, assignments: [], serverProfiles, retentionSchedulesByTEKS: {} });
  const options = buildStudentPathOptions({ student: { id: STUDENT }, assignments: [], courseId, pacing, serverMasteryProfiles: serverProfiles, nowValue: now });
  const profile = buildStudentLearningProfile({ courseId, masteryProfilesByTeks, evidenceEvents: [], retentionSchedules: {} });
  const plan = buildWeeklyPathPlan({
    options, courseId, profile, masteryProfilesByTeks, retentionSchedules: {}, evidenceEvents: [],
    ...weeklyPlanClassInputs({ config, honors }), now,
  });
  return buildWeeklyGoal({ plan, config, honors, studentId: STUDENT, courseId, now });
};

const fakeDb = (documents) => ({
  collection: (name) => ({
    doc: (id) => ({
      get: async () => {
        const data = documents[`${name}/${id}`];
        return { exists: data !== undefined, data: () => data };
      },
    }),
  }),
});

// The callable's path: the server's facts, then the freeze.
const serverFreeze = async ({ proposal, courseId, honors, documents, now, plannerOptions = {} }) => {
  const db = fakeDb(documents);
  const classRecord = { ...CLASS, course: courseId };
  const inputs = await loadWeeklyFreezeInputs({
    db, studentId: STUDENT, studentData: { profile: { courseLevel: honors ? 'Honors' : 'Regular' } }, classRecord, goal: proposal, now, plannerOptions,
  });
  const context = { studentId: STUDENT, classId: CLASS.classId, courseId, now };
  return { inputs, freeze: () => freezeWeeklyPathGoalProposal(proposal, { ...context, ...inputs }), context };
};

let sweep = null;
const buildSweep = () => COURSES.flatMap((courseId) => DATES.flatMap((date) => SESSIONS.flatMap((sessions) => (
  Object.entries(LEARNERS).map(([learner, { honors, profiles }]) => {
    const now = Date.parse(`${date}T15:00:00Z`);
    const serverProfiles = profiles(now, courseId);
    const settings = { sessions };
    return {
      courseId, date, sessions, learner, honors, now,
      settings,
      documents: {
        'settings/weeklyPathGoals': { byClass: { [CLASS.classId]: settings } },
        [`studentMasteryProfiles/${STUDENT}`]: { profiles: serverProfiles },
      },
      proposal: clientProposal({ courseId, honors, settings, serverProfiles, now }),
    };
  })
))));
// Built once: every test reads the same 360 proposals.
const configurations = () => { sweep ||= buildSweep(); return sweep; };

test('the 360-configuration sweep: the 4 short weeks freeze with a graded week, every full week is unchanged', async () => {
  const all = configurations();
  assert.equal(all.length, 360);
  const short = [];
  for (const config of all) {
    const label = `${config.courseId} ${config.date} ${config.sessions} ${config.learner}`;
    const { inputs, freeze, context } = await serverFreeze(config);
    assert.equal(inputs.requestedSessions, config.sessions, label);
    // What the freeze did before this change: the same facts, no server plan.
    const { plannedSessions, ...withoutPlan } = inputs;
    const before = () => freezeWeeklyPathGoalProposal(config.proposal, { ...context, ...withoutPlan });
    if (config.proposal.sessions.length === config.sessions) {
      // A full week never pays for a plan, and freezes exactly as it did.
      assert.equal(plannedSessions, null, label);
      assert.deepEqual(freeze(), before(), label);
      continue;
    }
    short.push(label);
    assert.throws(before, (error) => error.code === 'failed-precondition', `${label} used to be refused`);
    assert.equal(plannedSessions, config.proposal.sessions.length, `${label}: the server's own plan is as short`);
    const frozen = freeze();
    assert.equal(frozen.goalSessions, plannedSessions, label);
    assert.equal(frozen.requestedSessions, config.sessions, label);
    assert.equal(frozen.shortWeekReason, 'plannerShortfall', label);
    // Graded on the sessions it holds, and said so on every surface.
    const goal = { ...frozen, assignmentState: 'assigned' };
    assert.equal(gradeWeeklyGoal({ goal, completions: [], now: config.now }).progress.required, plannedSessions, label);
    assert.equal(describeShortWeek(frozen), `Graded on ${plannedSessions} of ${config.sessions} requested sessions`);
    const [row] = buildTeacherWeeklyView([{ studentId: STUDENT, studentName: 'A', goal, completions: [] }], { now: config.now });
    assert.equal(row.shortWeekNote, `Graded on ${plannedSessions} of ${config.sessions} requested sessions`);
  }
  assert.deepEqual(short, [
    'algebra1 2026-08-26 6 new',
    'algebra1 2026-08-26 6 developing',
    'algebra1 2026-08-26 6 gap',
    'algebra1 2026-08-26 6 honorsNew',
  ]);
});

test('the class\'s Classroom post names the shorter weeks the server froze', async () => {
  const [config] = configurations().filter((entry) => entry.proposal.sessions.length < entry.sessions);
  const { freeze } = await serverFreeze(config);
  const frozen = freeze();
  // weeklyPathSync.js's own test for a short week: goalSessions < requestedSessions.
  const shortWeeks = Number(frozen.requestedSessions) > 0 && Number(frozen.goalSessions) < Number(frozen.requestedSessions);
  assert.equal(shortWeeks, true);
  const work = weeklyPathCourseWork({ classId: CLASS.classId, weekKey: frozen.weekKey, goalSessions: frozen.requestedSessions, shortWeeks });
  assert.match(work.description, /If your week had fewer sessions than this, it is graded on the sessions it had\./);
  const sync = executableSource(read('functions/lib/weeklyPathSync.js'));
  assert.match(sync, /shortWeeks: Object\.values\(goalsByStudentId\)\.some\(\(goal\) => \(\s*Number\(goal\?\.requestedSessions\) > 0 && Number\(goal\?\.goalSessions\) < Number\(goal\.requestedSessions\)/);
});

test('a short proposal the server can fill is still refused', async () => {
  const full = configurations().find((entry) => entry.courseId === 'algebra1' && entry.date === '2026-10-07' && entry.sessions === 6 && entry.learner === 'new');
  assert.equal(full.proposal.sessions.length, 6);
  const dropped = { ...full.proposal, sessions: full.proposal.sessions.slice(0, 5), goalSessions: 5 };
  const { inputs, freeze } = await serverFreeze({ ...full, proposal: dropped });
  assert.equal(inputs.plannedSessions, 6, 'the server can fill all six');
  assert.throws(freeze, (error) => error.code === 'failed-precondition' && /needs 6 sessions and only 5 could be planned/.test(error.message));

  // In a short week, a proposal shorter than the server's own plan.
  const shortWeek = configurations().find((entry) => entry.proposal.sessions.length === 5 && entry.sessions === 6);
  const shorter = { ...shortWeek.proposal, sessions: shortWeek.proposal.sessions.slice(0, 4), goalSessions: 4 };
  const trimmed = await serverFreeze({ ...shortWeek, proposal: shorter });
  assert.equal(trimmed.inputs.plannedSessions, 5);
  assert.throws(trimmed.freeze, (error) => error.code === 'failed-precondition');

  // The coordinator's repro: one easy slot.
  const easy = { ...full.proposal, sessions: full.proposal.sessions.slice(0, 1), goalSessions: 1 };
  assert.throws((await serverFreeze({ ...full, proposal: easy })).freeze, (error) => error.code === 'failed-precondition');
});

test('the server plans on its own records: a teacher\'s hidden skill shortens the week, the browser\'s word does not', async () => {
  // The Algebra I six-session August week holds five. With the teacher's
  // override hiding one more skill for this class, the server plans four, and
  // the browser's four-session proposal is the week that freezes.
  const shortWeek = configurations().find((entry) => entry.courseId === 'algebra1' && entry.learner === 'new' && entry.proposal.sessions.length === 5);
  const hidden = shortWeek.proposal.sessions[4].skillId;
  const documents = {
    ...shortWeek.documents,
    'settings/skillOverrides': { overrides: [{ classId: CLASS.classId, skillId: hidden, action: 'hide' }] },
  };
  const four = { ...shortWeek.proposal, sessions: shortWeek.proposal.sessions.slice(0, 4), goalSessions: 4 };
  const { inputs, freeze } = await serverFreeze({ ...shortWeek, proposal: four, documents });
  assert.equal(inputs.plannedSessions, 4);
  assert.equal(freeze().goalSessions, 4);
  // The same override saved for another class is not this class's.
  const elsewhere = { ...documents, 'settings/skillOverrides': { overrides: [{ classId: 'class-2', skillId: hidden, action: 'hide' }] } };
  assert.equal((await serverFreeze({ ...shortWeek, proposal: four, documents: elsewhere })).inputs.plannedSessions, 5);
});

test('the server fails closed: no planner, or a course it cannot time, refuses a short week as before', async () => {
  const shortWeek = configurations().find((entry) => entry.proposal.sessions.length < entry.sessions);
  const missing = path.join(os.tmpdir(), 'mm-no-planner-here');
  const { inputs, freeze } = await serverFreeze({ ...shortWeek, plannerOptions: { repoRoot: missing, vendorRoot: missing } });
  assert.equal(inputs.plannedSessions, null);
  assert.throws(freeze, (error) => error.code === 'failed-precondition');

  // A course on the provisional sequence is timed by the class's open
  // assignments, which the server does not read: no saved pacing, no plan.
  const planner = await serverPlan.loadWeeklyPlanner();
  const args = { studentId: STUDENT, courseId: 'grade8', requestedSessions: 6, now: shortWeek.now };
  assert.equal(serverPlan.planWeeklySessions(planner, args), null);
  assert.equal(serverPlan.planWeeklySessions(planner, { ...args, pacing: { currentWindow: 1 } }) > 0, true, 'saved pacing is planned on');
  // A course timed by its district calendar is planned without saved pacing.
  assert.equal(serverPlan.planWeeklySessions(planner, { ...args, courseId: 'algebra1' }) > 0, true);
});

test('the server reads overrides and the live recommendation as the student client does', () => {
  const now = Date.parse('2026-10-07T15:00:00Z');
  const stored = [
    { classId: '', skillId: 'teks:A.5A', action: 'open' },
    { classId: 'Period 3', skillId: 'teks:A.5A', action: 'hide' },
    { classId: 'class-1', skillId: 'teks:A.6A', action: 'priority', expiresAt: '2026-12-01T00:00:00Z' },
    // The real class id outranks the legacy period key for the same skill.
    { classId: 'Period 3', skillId: 'teks:A.6A', action: 'hide' },
    { classId: 'class-2', skillId: 'teks:A.7A', action: 'hide' },
    { classId: 'class-1', skillId: 'teks:A.8A', action: 'nonsense' },
    { classId: 'class-1', action: 'hide' },
    null,
  ];
  const pick = (entries) => entries.map(({ classId, skillId, action, expiresAt }) => ({ classId, skillId, action, expiresAt }));
  for (const context of [{ classId: 'class-1', classPeriod: 'Period 3' }, { classId: 'other', classPeriod: 'Period 3' }, { classId: 'other', classPeriod: '' }]) {
    assert.deepEqual(pick(serverPlan.overridesForClassContext(stored, context)), pick(overridesForClassContext(normalizeOverrides(stored), context)), JSON.stringify(context));
  }
  for (const intervention of [
    { studentId: STUDENT, skillId: 'teks:A.5A', expiresAt: now + DAY },
    { studentId: STUDENT, skillId: 'teks:A.5A', expiresAt: now - 1 },
    { skillId: 'teks:A.5A', expiresAt: now + DAY },
    null,
  ]) {
    const client = interventionAsOverride(intervention, now);
    const server = serverPlan.interventionAsOverride(intervention, now);
    assert.deepEqual(server && pick([server]), client && pick([client]), JSON.stringify(intervention));
  }
});

test('the planner travels with the functions bundle and never forks', async () => {
  const closure = plannerClosure();
  Object.values(serverPlan.PLANNER_ENTRIES).forEach((entry) => assert.ok(closure.includes(entry), entry));
  assert.ok(closure.some((file) => file.startsWith('functions/shared/')), 'the shared modules the planner imports travel too');
  const vendorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-weekly-planner-'));
  try {
    syncFunctionsWeeklyPlanner({ vendorRoot });
    assert.deepEqual(plannerVendorDrift({ vendorRoot }), []);
    // As deployed: no repository beside it, only the copy.
    const plannerOptions = { repoRoot: path.join(vendorRoot, 'no-repository'), vendorRoot };
    assert.equal(serverPlan.plannerRoot(plannerOptions), vendorRoot);
    const shortWeek = configurations().find((entry) => entry.proposal.sessions.length < entry.sessions);
    const { inputs } = await serverFreeze({ ...shortWeek, plannerOptions });
    assert.equal(inputs.plannedSessions, shortWeek.proposal.sessions.length, 'the vendored planner plans the same week');
  } finally {
    fs.rmSync(vendorRoot, { recursive: true, force: true });
  }
  // In the repository the one real source wins, and the copy is never tracked.
  assert.equal(serverPlan.plannerRoot(), serverPlan.REPO_ROOT);
  assert.match(read('functions/.gitignore'), /^vendor\/$/m);
});

test('resolveWeeklyPathGoalSnapshot hands the proposal to the server\'s facts, and plans only a short one', () => {
  const index = executableSource(read('functions/index.js'));
  const callable = region(index, 'exports.resolveWeeklyPathGoalSnapshot = onCall(', '\n});', 'the freeze callable');
  assert.match(callable, /await loadWeeklyFreezeInputs\(\{[^}]*\bgoal: request\.data\?\.goal \|\| \{\}/);
  const inputs = executableSource(read('functions/lib/weeklyPathFreezeInputs.js'));
  assert.match(inputs, /const plannedSessions = !shortWeekReason && proposedCount > 0 && proposedCount < requestedSessions\s*\? await loadServerPlannedSessions\(/);
});
