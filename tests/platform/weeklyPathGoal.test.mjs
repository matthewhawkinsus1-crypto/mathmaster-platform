// Weekly Path Goals, and the two things they must never become:
// a way to run out of curriculum, and a way to punish a student for the gap
// the practice was designed to find.

import test from 'node:test';
import assert from 'node:assert/strict';

import { PURPOSE } from '../../src/platform/path/recommendationV2.js';
import {
  CCMR_EXPECTATION, FRAMEWORK, GRADING_POLICY, SELECTION_MODE, WEEKLY_GOAL,
  buildTeacherWeeklyView, buildWeeklyGoal, deriveCompletionsFromEvidence, dueAtFor, evaluateWeeklyGoalProgress,
  gradeWeeklyGoal, normalizeGradingPolicy, normalizeWeeklyGoalConfig, weekKeyFor,
} from '../../src/platform/path/weeklyPathGoal.js';

const DAY = 24 * 60 * 60 * 1000;
const MONDAY = Date.parse('2026-09-14T09:00:00Z'); // a Monday
const session = (skillId, purpose = PURPOSE.CURRENT_LEARNING) => ({
  skillId, teksCode: skillId, purpose, purposeLabel: 'x', dok: 2, difficultyBand: 3,
});
const planOf = (...sessions) => ({ sessions, profile: null, suppressed: [] });
const completions = (count, { accuracy = null, at = MONDAY + DAY } = {}) => (
  Array.from({ length: count }, () => ({ status: 'completed', completedAt: at, ...(accuracy == null ? {} : { accuracy }) }))
);

// --- Config ---------------------------------------------------------------------

test('a teacher who configures nothing still gets a working goal', () => {
  // A blank settings record must never be the reason a student has no work.
  const regular = normalizeWeeklyGoalConfig();
  assert.equal(regular.sessions, WEEKLY_GOAL.REGULAR_DEFAULT);
  assert.equal(regular.selectionMode, SELECTION_MODE.AUTOMATIC,
    'the default has to favour autonomous selection — a teacher cannot hand-build 150 sequences');
});

test('Honors defaults to a longer week, not a harder one by default', () => {
  assert.equal(normalizeWeeklyGoalConfig({}, { honors: true }).sessions, WEEKLY_GOAL.HONORS_DEFAULT);
});

test('the session count stays inside a range a real week can hold', () => {
  assert.equal(normalizeWeeklyGoalConfig({ sessions: 40 }).sessions, WEEKLY_GOAL.MAXIMUM);
  assert.equal(normalizeWeeklyGoalConfig({ sessions: 0 }).sessions, WEEKLY_GOAL.MINIMUM);
  assert.equal(normalizeWeeklyGoalConfig({ sessions: 'lots' }).sessions, WEEKLY_GOAL.REGULAR_DEFAULT);
});

test('an unrecognised setting falls back rather than propagating', () => {
  const config = normalizeWeeklyGoalConfig({ selectionMode: 'whatever', framework: 'GRE', ccmrExpectation: 'sometimes' });
  assert.equal(config.selectionMode, SELECTION_MODE.AUTOMATIC);
  assert.equal(config.framework, FRAMEWORK.AUTO);
  assert.equal(config.ccmrExpectation, CCMR_EXPECTATION.NONE);
});

// --- Week boundaries ---------------------------------------------------------------

test('a week means the same thing on Monday morning and Friday afternoon', () => {
  const monday = weekKeyFor(Date.parse('2026-09-14T08:00:00Z'));
  const friday = weekKeyFor(Date.parse('2026-09-18T22:00:00Z'));
  assert.equal(monday, friday);
  assert.notEqual(monday, weekKeyFor(Date.parse('2026-09-21T08:00:00Z')), 'next week is a different week');
});

test('the due date lands at the end of the due day, not the start', () => {
  // Asserted in the school's own timezone, not UTC. The deadline is now local
  // midnight, so the UTC weekday and hour of that instant are the wrong
  // question: 23:59 Central on a Friday is 04:59 UTC on the Saturday.
  const due = dueAtFor(MONDAY, { weekStartsOn: 1, dueDayOfWeek: 5 });
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour12: false, weekday: 'short', hour: '2-digit',
  }).formatToParts(new Date(due)).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  assert.equal(local.weekday, 'Fri');
  assert.equal(local.hour, '23', 'a student working Friday evening is not late');
});

// --- The goal is sessions, not TEKS ---------------------------------------------------

test('a goal counts sessions, so a standard is never used up', () => {
  // The design failure this prevents: retire four TEKS a week and a student runs
  // out of course standards before spring.
  const week1 = buildWeeklyGoal({ plan: planOf(session('A.5A'), session('A.3A')), now: MONDAY });
  const week2 = buildWeeklyGoal({ plan: planOf(session('A.5A'), session('A.9A')), now: MONDAY + 7 * DAY });
  assert.equal(week1.goalSessions, 4, 'the goal is a number of sessions');
  assert.notEqual(week1.weekKey, week2.weekKey);
  assert.ok(week2.sessions.some((s) => s.teksCode === 'A.5A'),
    'A.5A may legitimately return in a later week — for retention, review or deeper work');
});

// --- Selection mode ---------------------------------------------------------------------

test('teacher-selected means teacher-selected', () => {
  const goal = buildWeeklyGoal({
    plan: planOf(session('A.5A'), session('A.3A'), session('A.9A')),
    config: { selectionMode: SELECTION_MODE.TEACHER_SELECTED, pinnedSkills: ['A.5A'] },
    now: MONDAY,
  });
  assert.deepEqual(goal.sessions.map((s) => s.teksCode), ['A.5A']);
});

test('the engine keeps explaining itself even in teacher-selected mode', () => {
  const goal = buildWeeklyGoal({
    plan: planOf({ ...session('A.5A'), studentExplanation: 'This supports what you are learning right now.' }),
    config: { selectionMode: SELECTION_MODE.TEACHER_SELECTED, pinnedSkills: ['A.5A'] },
    now: MONDAY,
  });
  assert.ok(goal.sessions[0].studentExplanation,
    'a teacher choosing the standard does not mean the student stops being told why');
});

test('automatic mode leaves the engine\'s week alone', () => {
  const goal = buildWeeklyGoal({ plan: planOf(session('A.5A'), session('A.3A')), now: MONDAY });
  assert.equal(goal.sessions.length, 2);
});

// --- CCMR expectation -------------------------------------------------------------------

test('CCMR set to none removes transfer work rather than relabelling it', () => {
  const goal = buildWeeklyGoal({
    plan: planOf(session('A.5A'), session('A.3A', PURPOSE.TRANSFER)),
    config: { ccmrExpectation: CCMR_EXPECTATION.NONE },
    now: MONDAY,
  });
  assert.ok(!goal.sessions.some((s) => s.purpose === PURPOSE.TRANSFER));
});

test('an unmet CCMR requirement is reported, never silently substituted', () => {
  // Forcing a transfer session the engine had no evidence to justify would be
  // worse than saying so: the teacher can act on a shortfall they can see.
  const goal = buildWeeklyGoal({
    plan: planOf(session('A.5A'), session('A.3A')),
    config: { ccmrExpectation: CCMR_EXPECTATION.REQUIRED },
    now: MONDAY,
  });
  assert.equal(goal.ccmr.satisfied, false);
  assert.equal(goal.ccmr.shortfallReason, 'no_transfer_work_was_available_this_week');
  assert.equal(goal.sessions.length, 2, 'and nothing was fabricated to paper over it');
});

test('a satisfied CCMR requirement says so', () => {
  const goal = buildWeeklyGoal({
    plan: planOf(session('A.5A'), session('A.3A', PURPOSE.TRANSFER)),
    config: { ccmrExpectation: CCMR_EXPECTATION.REQUIRED, framework: FRAMEWORK.DIGITAL_SAT },
    now: MONDAY,
  });
  assert.equal(goal.ccmr.satisfied, true);
  assert.equal(goal.ccmr.framework, FRAMEWORK.DIGITAL_SAT);
});

// --- Progress --------------------------------------------------------------------------

test('an abandoned session is neither complete nor a failure', () => {
  const goal = buildWeeklyGoal({ plan: planOf(), now: MONDAY });
  const progress = evaluateWeeklyGoalProgress({
    goal,
    completions: [{ status: 'inProgress', completedAt: MONDAY + DAY }, ...completions(1)],
    now: MONDAY + DAY,
  });
  assert.equal(progress.completed, 1);
  assert.equal(progress.remaining, 3);
});

test('progress cannot exceed the goal', () => {
  const goal = buildWeeklyGoal({ plan: planOf(), now: MONDAY });
  const progress = evaluateWeeklyGoalProgress({ goal, completions: completions(9), now: MONDAY + DAY });
  assert.equal(progress.completed, 4);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.complete, true);
});

test('late work is counted as done, and separately marked late', () => {
  const goal = buildWeeklyGoal({ plan: planOf(), now: MONDAY });
  const progress = evaluateWeeklyGoalProgress({
    goal, completions: completions(4, { at: goal.dueAt + DAY }), now: goal.dueAt + DAY,
  });
  assert.equal(progress.completed, 4);
  assert.equal(progress.completedOnTime, 0);
  assert.equal(progress.lateCompletions, 4);
});

// --- Grading: the rule that matters --------------------------------------------------

test('completing every session cannot fail, whatever the practice revealed', () => {
  // The core rule. Adaptive practice exists to find gaps; if finding one lowers
  // the grade, the rational student avoids the hard recommendation and the
  // evidence the whole system runs on disappears.
  const goal = buildWeeklyGoal({ plan: planOf(), now: MONDAY });
  const result = gradeWeeklyGoal({ goal, completions: completions(4, { accuracy: 0 }), now: MONDAY + 2 * DAY });
  assert.equal(result.passing, true);
  assert.ok(result.grade >= GRADING_POLICY.fullCompletionFloor,
    `full completion graded ${result.grade}`);
});

test('quality still lifts the grade above the floor', () => {
  const goal = buildWeeklyGoal({ plan: planOf(), now: MONDAY });
  const weak = gradeWeeklyGoal({ goal, completions: completions(4, { accuracy: 0.2 }), now: MONDAY + 2 * DAY });
  const strong = gradeWeeklyGoal({ goal, completions: completions(4, { accuracy: 1 }), now: MONDAY + 2 * DAY });
  assert.ok(strong.grade > weak.grade, 'the floor is a floor, not a ceiling');
  assert.equal(strong.grade, 100);
});

test('the floor cannot be configured away', () => {
  // A teacher may move the completion/quality balance. They may not build a
  // policy where a student who did everything asked of them fails.
  const goal = buildWeeklyGoal({
    plan: planOf(), config: { grading: { completionWeight: 0.1, passingGrade: 70 } }, now: MONDAY,
  });
  const result = gradeWeeklyGoal({ goal, completions: completions(4, { accuracy: 0 }), now: MONDAY + 2 * DAY });
  assert.equal(result.passing, true, `graded ${result.grade} under a 10% completion weight`);
});

test('no quality evidence yet is neutral, not zero', () => {
  // A student who finished two sessions the server has not scored yet must not
  // be graded as though they got them wrong.
  const goal = buildWeeklyGoal({ plan: planOf(), now: MONDAY });
  const unscored = gradeWeeklyGoal({ goal, completions: completions(2), now: MONDAY + 2 * DAY });
  const zeroed = gradeWeeklyGoal({ goal, completions: completions(2, { accuracy: 0 }), now: MONDAY + 2 * DAY });
  assert.ok(unscored.grade > zeroed.grade);
  assert.equal(unscored.components.qualityRatio, null);
});

test('partial completion grades proportionally', () => {
  const goal = buildWeeklyGoal({ plan: planOf(), now: MONDAY });
  const half = gradeWeeklyGoal({ goal, completions: completions(2, { accuracy: 1 }), now: MONDAY + 2 * DAY });
  assert.ok(half.grade > 0 && half.grade < 100);
  assert.equal(half.components.completionRatio, 0.5);
});

test('the completion grade freezes at the deadline; the learning does not', () => {
  const goal = buildWeeklyGoal({ plan: planOf(), now: MONDAY });
  const after = gradeWeeklyGoal({
    goal, completions: completions(4, { at: goal.dueAt + 2 * DAY }), now: goal.dueAt + 2 * DAY,
  });
  assert.equal(after.frozen, true);
  assert.equal(after.components.completionRatio, 0, 'nothing was done by the deadline');
  assert.equal(after.progress.completed, 4, 'but the work is still recorded as done');
  assert.equal(after.progress.lateCompletions, 4);
});

test('a grade explains itself in a sentence a parent can read', () => {
  const goal = buildWeeklyGoal({ plan: planOf(), now: MONDAY });
  const result = gradeWeeklyGoal({ goal, completions: completions(4, { accuracy: 0.1 }), now: MONDAY + DAY });
  assert.match(result.explanation, /Completed every assigned session/);
});

test('the default policy is 80 completion / 20 quality', () => {
  const policy = normalizeGradingPolicy();
  assert.equal(policy.completionWeight, 0.8);
  assert.equal(policy.qualityWeight, 0.2);
});

// --- Teacher view -------------------------------------------------------------------------

test('the class table reads labels off the profile rather than inventing them', () => {
  // Four independently written status tables already existed in this repository.
  // This must not become a fifth.
  const goal = buildWeeklyGoal({
    plan: {
      sessions: [session('A.5A')],
      profile: {
        instructionalBandLabel: 'On Level', performanceProjectionLabel: 'Meets', engagementLabel: 'On Track',
      },
    },
    now: MONDAY,
  });
  const [rowA] = buildTeacherWeeklyView([
    { studentId: 's1', studentName: 'Student A', goal, completions: completions(4) },
  ], { now: MONDAY + DAY });

  assert.equal(rowA.goal, 4);
  assert.equal(rowA.complete, 4);
  assert.equal(rowA.academicProfile, 'On Level · Meets');
  assert.equal(rowA.engagement, 'On Track');
});

test('a student with no baseline is shown as such, not guessed at', () => {
  const goal = buildWeeklyGoal({ plan: planOf(session('A.5A')), now: MONDAY });
  const [row] = buildTeacherWeeklyView([{ studentId: 's2', goal, completions: [] }], { now: MONDAY + DAY });
  assert.equal(row.academicProfile, 'Establishing Baseline');
});

test('an overdue student is flagged for follow-up, not silently zero', () => {
  const goal = buildWeeklyGoal({ plan: planOf(session('A.5A')), now: MONDAY });
  const [row] = buildTeacherWeeklyView([
    { studentId: 's3', goal, completions: completions(1) },
  ], { now: goal.dueAt + DAY });
  assert.equal(row.overdue, true);
  assert.equal(row.complete, 1);
});

// --- Completion, derived from the evidence ------------------------------------------

test('four questions in one sitting is one session, not four', () => {
  const events = Array.from({ length: 4 }, () => ({
    performance: { status: 'finalized', isCorrect: true },
    source: { activitySessionId: 'sess-1' },
    alignmentKeys: ['texas:A.5A'],
    recordedAt: MONDAY + DAY,
  }));
  const done = deriveCompletionsFromEvidence({ evidenceEvents: events, now: MONDAY + DAY });
  assert.equal(done.length, 1);
  assert.equal(done[0].accuracy, 1);
});

test('last week\'s work does not fill this week\'s goal', () => {
  const events = [{
    performance: { status: 'finalized', isCorrect: true },
    source: { activitySessionId: 'old' },
    alignmentKeys: ['texas:A.5A'],
    recordedAt: MONDAY - 3 * DAY,
  }];
  assert.deepEqual(deriveCompletionsFromEvidence({ evidenceEvents: events, now: MONDAY + DAY }), []);
});

test('an unfinished question does not complete a session', () => {
  const events = [{
    performance: { status: 'attempted', isCorrect: false },
    source: { activitySessionId: 's' },
    recordedAt: MONDAY + DAY,
  }];
  assert.deepEqual(deriveCompletionsFromEvidence({ evidenceEvents: events, now: MONDAY + DAY }), []);
});

test('modified work completes the session but does not score it', () => {
  // The student did the work — that is completion. It measures a different
  // construct, so it cannot become a quality grade.
  const events = [{
    performance: { status: 'finalized', isCorrect: false },
    supportUsage: { modified: true },
    source: { activitySessionId: 's' },
    alignmentKeys: ['texas:A.5A'],
    recordedAt: MONDAY + DAY,
  }];
  const [done] = deriveCompletionsFromEvidence({ evidenceEvents: events, now: MONDAY + DAY });
  assert.equal(done.status, 'completed');
  assert.equal(done.accuracy, null, 'neutral, not zero');
});

test('accuracy is the session\'s own, not the week\'s average', () => {
  const at = MONDAY + DAY;
  const events = [
    { performance: { status: 'finalized', isCorrect: true }, source: { activitySessionId: 'a' }, alignmentKeys: ['texas:A.5A'], recordedAt: at },
    { performance: { status: 'finalized', isCorrect: false }, source: { activitySessionId: 'a' }, alignmentKeys: ['texas:A.5A'], recordedAt: at },
    { performance: { status: 'finalized', isCorrect: true }, source: { activitySessionId: 'b' }, alignmentKeys: ['texas:A.3A'], recordedAt: at },
  ];
  const done = deriveCompletionsFromEvidence({ evidenceEvents: events, now: at });
  assert.equal(done.length, 2);
  assert.equal(done.find((d) => d.sessionId === 'a').accuracy, 0.5);
  assert.equal(done.find((d) => d.sessionId === 'b').accuracy, 1);
});

test('evidence with no session id is not counted as a session', () => {
  const events = [{
    performance: { status: 'finalized', isCorrect: true },
    source: {},
    recordedAt: MONDAY + DAY,
  }];
  assert.deepEqual(deriveCompletionsFromEvidence({ evidenceEvents: events, now: MONDAY + DAY }), []);
});

// --- The teacher's setting actually reaches the student ------------------------------

test('a plan built shorter than the goal leaves empty cards', () => {
  // The failure this guards: MyMathPathApp builds the plan and the goal from
  // two different session counts, and the student opens a six-session week with
  // four cards in it.
  const plan = planOf(session('A.5A'), session('A.3A'));
  const goal = buildWeeklyGoal({ plan, config: { sessions: 6 }, now: MONDAY });
  assert.equal(goal.goalSessions, 6);
  assert.equal(goal.sessions.length, 2,
    'the goal knows it asked for six; the caller must build six');
});

test('a teacher lowering the goal lowers what the student is asked for', () => {
  const plan = planOf(session('A.5A'), session('A.3A'), session('A.9A'));
  const goal = buildWeeklyGoal({ plan, config: { sessions: 3 }, now: MONDAY });
  assert.equal(goal.goalSessions, 3);
  assert.equal(goal.settings.sessions, 3);
});

test('a null config is a working state, not a missing one', () => {
  // What a student in a class the teacher never configured actually gets.
  const goal = buildWeeklyGoal({ plan: planOf(session('A.5A')), config: null, now: MONDAY });
  assert.equal(goal.goalSessions, WEEKLY_GOAL.REGULAR_DEFAULT);
  assert.equal(goal.settings.selectionMode, SELECTION_MODE.AUTOMATIC);
});

test('intervention mode reaches the plan as a cap, not as a label', () => {
  // The setting changes how much below-course work a week MAY contain. It must
  // not change anything about how the student is described.
  const normal = normalizeWeeklyGoalConfig({ interventionMode: false });
  const intervention = normalizeWeeklyGoalConfig({ interventionMode: true });
  assert.equal(normal.interventionMode, false);
  assert.equal(intervention.interventionMode, true);
  assert.equal(normal.sessions, intervention.sessions, 'it is not a different amount of work');
});
