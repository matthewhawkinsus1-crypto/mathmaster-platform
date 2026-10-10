/*
 * THE BROWSER NO LONGER DECIDES HOW MANY SESSIONS A WEEK IS GRADED ON
 * (coordinator review of PR #459, major 2).
 *
 * The freeze took goalSessions from the proposal's own length, so a student
 * calling resolveWeeklyPathGoalSnapshot with one easy slot froze a one-session
 * week and gradeWeeklyGoal gave 100 after one session; main required four. And
 * a proposed Retention slot became a two-question, one-attempt check for any
 * skill the browser named.
 *
 * Now the count comes from the class's settings (settings/weeklyPathGoals); a
 * shorter week is accepted only when those settings explain it (the teacher
 * selects every session) and refused otherwise; and a Retention slot is
 * accepted only for a skill the server's records say is due a check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  TEACHER_SELECTED_MODE,
  WEEKLY_SESSION_COUNT,
  freezeWeeklyPathGoalProposal,
  weeklySessionsForClass,
} from '../../functions/shared/weeklyPathSlotAuthority.mjs';
import { RETENTION_PROBE, resolveWeeklySlotSessionKind, retentionCheckIsDue } from '../../functions/shared/pathRetentionCheck.mjs';
import { gradeWeeklyGoal } from '../../functions/shared/weeklyPathGrade.mjs';
import { WEEKLY_GOAL, buildTeacherWeeklyView, describeShortWeek, normalizeWeeklyGoalConfig } from '../../src/platform/path/weeklyPathGoal.js';
import { evaluateStudentRetentionSchedule } from '../../src/platform/retention/retentionScheduler.js';
import { buildUnifiedMasteryProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const { loadWeeklyFreezeInputs } = require('../../functions/lib/weeklyPathFreezeInputs.js');
const { weeklyPathCourseWork } = require('../../functions/lib/weeklyPathClassroom.js');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const DAY = 86400000;
const WEEK = '2026-10-05';
const NOW = Date.parse('2026-10-07T15:00:00Z');
const SUNDAY_NIGHT = Date.parse('2026-10-11T23:59:59.999-05:00');
const CONTEXT = { studentId: 'S1', classId: 'class-1', courseId: 'algebra1', now: NOW };
const slot = (teksCode, extra = {}) => ({
  skillId: `teks:${teksCode}`, teksCode, purpose: 'currentLearning', purposeLabel: 'Current learning',
  context: 'course', dok: 2, difficultyBand: 3, studentLabel: `Skill ${teksCode}`, ...extra,
});
const proposal = (sessions, extra = {}) => ({ weekKey: WEEK, courseId: 'algebra1', dueAt: SUNDAY_NIGHT, goalSessions: sessions.length, sessions, ...extra });
const FOUR = ['A.5A', 'A.2C', 'A.3B', 'A.6A'].map((code) => slot(code));

test('one easy slot is refused, not graded 100', () => {
  // The coordinator's repro, sent straight to the callable's freeze.
  const easy = proposal([slot('A.2A', { dok: 1 })], { requestedSessions: 4, goalSessions: 1 });
  assert.throws(
    () => freezeWeeklyPathGoalProposal(easy, { ...CONTEXT, requestedSessions: 4 }),
    (error) => error.code === 'failed-precondition' && /needs 4 sessions and only 1 could be planned/.test(error.message),
  );
});

test('the class\'s count is the graded count, whatever the proposal claims', () => {
  // The browser claims a one-session week but sends four slots.
  const claimed = freezeWeeklyPathGoalProposal(proposal(FOUR, { requestedSessions: 1, goalSessions: 1 }), { ...CONTEXT, requestedSessions: 4 });
  assert.equal(claimed.goalSessions, 4);
  assert.equal(claimed.requestedSessions, 4);
  assert.equal(claimed.shortWeekReason, null);
  // More slots than the class asks for: the first four are frozen.
  const six = [...FOUR, slot('A.7A'), slot('A.8A')];
  const extra = freezeWeeklyPathGoalProposal(proposal(six, { requestedSessions: 6 }), { ...CONTEXT, requestedSessions: 4 });
  assert.deepEqual(extra.sessions.map((entry) => entry.teksCode), ['A.5A', 'A.2C', 'A.3B', 'A.6A']);
  assert.equal(gradeWeeklyGoal({ goal: { ...extra, assignmentState: 'assigned' }, completions: [], now: NOW }).progress.required, 4);
});

test('a shorter week is accepted only when the teacher\'s own selection explains it', () => {
  const two = FOUR.slice(0, 2);
  const justified = freezeWeeklyPathGoalProposal(proposal(two), { ...CONTEXT, requestedSessions: 4, shortWeekReason: 'teacherSelection' });
  assert.equal(justified.goalSessions, 2);
  assert.equal(justified.requestedSessions, 4);
  assert.equal(justified.shortWeekReason, 'teacherSelection');
  assert.throws(() => freezeWeeklyPathGoalProposal(proposal(two), { ...CONTEXT, requestedSessions: 4 }), (error) => error.code === 'failed-precondition');
  // The teacher table and the Classroom post say so.
  assert.equal(describeShortWeek(justified), 'Graded on 2 of 4 requested sessions');
  assert.equal(describeShortWeek({ goalSessions: 4, requestedSessions: 4 }), null);
  const [row] = buildTeacherWeeklyView([{ studentId: 'S1', studentName: 'A', goal: { ...justified, assignmentState: 'assigned' }, completions: [] }], { now: NOW });
  assert.equal(row.shortWeekNote, 'Graded on 2 of 4 requested sessions');
  const work = weeklyPathCourseWork({ classId: 'class-1', weekKey: WEEK, goalSessions: 4, shortWeeks: true });
  assert.match(work.description, /If your week had fewer sessions than this, it is graded on the sessions it had\./);
  assert.doesNotMatch(weeklyPathCourseWork({ classId: 'class-1', weekKey: WEEK, goalSessions: 4 }).description, /fewer sessions/);
});

test('a Retention slot is a two-question check only for a skill the server says is due one', () => {
  const week = [slot('A.5A'), slot('A.2C', { purpose: 'retention', purposeLabel: 'Retention check' }), slot('A.3B', { purpose: 'retention', purposeLabel: 'Retention check' }), slot('A.6A')];
  const frozen = freezeWeeklyPathGoalProposal(proposal(week), { ...CONTEXT, requestedSessions: 4, retentionDue: (code) => code === 'A.2C' });
  const [, due, notDue] = frozen.sessions;
  assert.equal(due.purpose, 'retention');
  assert.equal(resolveWeeklySlotSessionKind({ slotPurpose: due.purpose }).sessionKind, RETENTION_PROBE);
  assert.equal(notDue.purpose, 'responsiveReview', 'a full review session instead');
  assert.equal(notDue.purposeLabel, 'Review');
  assert.notEqual(resolveWeeklySlotSessionKind({ slotPurpose: notDue.purpose }).sessionKind, RETENTION_PROBE);
});

test('the server\'s "due" is the scheduler\'s "due" on the same records', () => {
  const mastered = (daysAgo) => ({
    mastery: { estimate: 92 },
    accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 4 },
    dimensions: { eligibleGradeLevelEvents: 6, dokRepresented: [2, 3], lastIndependentSuccessAt: NOW - daysAgo * DAY },
  });
  const secure = { ...mastered(40), mastery: { estimate: 75 } };
  const cases = [
    [mastered(20), null],
    [mastered(3), null],
    [secure, null],
    [mastered(3), { status: 'concern', successfulCheckCount: 0 }],
    [mastered(40), { status: 'scheduled', lastVerifiedAt: NOW - 5 * DAY, nextCheckDueAt: NOW + 9 * DAY, successfulCheckCount: 1 }],
    [mastered(40), { status: 'scheduled', lastVerifiedAt: NOW - 40 * DAY, nextCheckDueAt: NOW - 10 * DAY, successfulCheckCount: 1 }],
    [mastered(40), { status: 'confirmedLoss', lastVerifiedAt: NOW - 40 * DAY, nextCheckDueAt: NOW - 10 * DAY, successfulCheckCount: 1 }],
  ];
  const verdicts = cases.map(([profile, schedule]) => {
    // As the student's screens build it: the stored schedule reaches the
    // profile's retention signal.
    const unified = buildUnifiedMasteryProfiles({ serverProfiles: { 'A.5A': profile }, retentionSchedulesByTEKS: schedule ? { 'A.5A': schedule } : {} });
    const client = evaluateStudentRetentionSchedule(unified, schedule ? { 'A.5A': schedule } : {}, NOW).pendingProbes.some((probe) => probe.teksCode === 'A.5A');
    const server = retentionCheckIsDue({ profile, schedule, now: NOW });
    assert.equal(server, client, JSON.stringify(schedule));
    return server;
  });
  assert.deepEqual(verdicts, [true, false, false, true, false, true, false]);
});

test('the class count matches the count the teacher\'s settings give on every screen', () => {
  assert.deepEqual({ ...WEEKLY_SESSION_COUNT }, {
    MINIMUM: WEEKLY_GOAL.MINIMUM, MAXIMUM: WEEKLY_GOAL.MAXIMUM, REGULAR_DEFAULT: WEEKLY_GOAL.REGULAR_DEFAULT, HONORS_DEFAULT: WEEKLY_GOAL.HONORS_DEFAULT,
  });
  for (const sessions of [undefined, null, 2, 3, 4.6, 6, 9, 'x']) {
    for (const honors of [false, true]) {
      assert.equal(weeklySessionsForClass({ config: { sessions }, honors }), normalizeWeeklyGoalConfig({ sessions }, { honors }).sessions, `${sessions} ${honors}`);
    }
  }
  assert.equal(TEACHER_SELECTED_MODE, normalizeWeeklyGoalConfig({ selectionMode: 'teacherSelected' }).selectionMode);
});

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

test('the server reads the class\'s settings by class id, then period, and the student\'s own course level', async () => {
  const db = fakeDb({
    'settings/weeklyPathGoals': { byClass: { 'class-1': { sessions: 6, selectionMode: 'teacherSelected' }, 'Period 3': { sessions: 3 } } },
    'studentMasteryProfiles/S1': { profiles: { 'texas:A.5A': { mastery: { estimate: 92 }, accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 4 }, dimensions: { dokRepresented: [2, 3], lastIndependentSuccessAt: NOW - 20 * DAY } } } },
    'studentRetentionSchedules/S1': { schedules: {} },
  });
  const byId = await loadWeeklyFreezeInputs({ db, studentId: 'S1', classRecord: { classId: 'class-1', period: 'Period 3' }, now: NOW });
  assert.equal(byId.requestedSessions, 6);
  assert.equal(byId.shortWeekReason, 'teacherSelection');
  assert.equal(byId.retentionDue('A.5A'), true);
  assert.equal(byId.retentionDue('A.2C'), false);
  const byPeriod = await loadWeeklyFreezeInputs({ db, studentId: 'S1', classRecord: { classId: 'other', period: 'Period 3' }, now: NOW });
  assert.equal(byPeriod.requestedSessions, 3);
  assert.equal(byPeriod.shortWeekReason, null);
  // Nothing stored: the defaults, honors read from the student's profile.
  const empty = fakeDb({});
  assert.equal((await loadWeeklyFreezeInputs({ db: empty, studentId: 'S1', classRecord: { classId: 'x' }, now: NOW })).requestedSessions, 4);
  assert.equal((await loadWeeklyFreezeInputs({ db: empty, studentId: 'S1', studentData: { profile: { courseLevel: 'Honors' } }, classRecord: { classId: 'x', courseLevel: 'standard' }, now: NOW })).requestedSessions, 5);
});

test('resolveWeeklyPathGoalSnapshot freezes a new week with the server\'s facts, and returns a frozen one as it is', () => {
  const index = executableSource(read('functions/index.js'));
  const callable = region(index, 'exports.resolveWeeklyPathGoalSnapshot = onCall(', '\n});', 'the freeze callable');
  const existing = callable.indexOf('if (frozen.exists) return { success: true, goal: frozen.data() };');
  const load = callable.indexOf('await loadWeeklyFreezeInputs({ db, studentId, studentData: studentSnapshot.data(), classRecord, now: Date.now() })');
  const freeze = callable.indexOf('await sanitizeWeeklyPathGoalProposal(request.data?.goal || {}, { studentId, classRecord, freezeInputs })');
  assert.ok(existing > 0 && load > existing && freeze > load, 'existing week first, then the server facts, then the freeze');
  assert.match(callable, /const \{ loadWeeklyFreezeInputs \} = require\("\.\/lib\/weeklyPathFreezeInputs"\);/);
  const wrapper = region(index, 'async function sanitizeWeeklyPathGoalProposal(', '\n}\n', 'the server freeze');
  assert.match(wrapper, /\.\.\.freezeInputs,\s*\.\.\.WEEKLY_SLOT_TEKS_TOOLS,/);
  // The teacher table renders the note.
  const controls = executableSource(read('src/components/teacher/WeeklyPathControls.jsx'));
  assert.match(controls, /\{row\.shortWeekNote && \(/);
});
