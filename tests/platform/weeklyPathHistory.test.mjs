/*
 * PAST WEEKS, WEEKLY PATH GRADES AND THE "WEEKS HIT" STREAK
 * (student push D, item 6).
 *
 * A student's past weekly goals and the grades they earned vanished from their
 * screen every Monday. getMyWeeklyPathHistory returns the last twelve frozen
 * goals graded by the SAME functions the Classroom publisher uses, plus the
 * streak. These tests pin the numbers to the publisher's, the streak's edges,
 * and that the callable reads only the caller's own records.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  WEEKLY_PATH_HISTORY_WEEKS,
  buildWeeklyPathHistory,
  recentWeeklyPathWeekKeys,
  summarizeWeeklyPathWeek,
  weeklyPathHistoryWindow,
  weeklyPathStreak,
} from '../../functions/shared/weeklyPathHistory.mjs';
import { completionFromPathSession, weeklyCompletionWindow } from '../../functions/shared/weeklyPathCompletion.mjs';
import { gradeWeeklyGoal } from '../../functions/shared/weeklyPathGrade.mjs';
import { dueAtFor } from '../../src/platform/path/weeklyPathGoal.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const { loadWeeklyPathHistory, FALLBACK_SESSION_LIMIT } = require('../../functions/lib/weeklyPathHistory.js');
const { syncWeeklyPathClassWeek } = require('../../functions/lib/weeklyPathSync.js');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const DAY = 86400000;
// Wednesday 7 October 2026; this week is 5 October, last week 28 September.
const NOW = Date.parse('2026-10-07T15:00:00Z');
const THIS_WEEK = '2026-10-05';
const LAST_WEEK = '2026-09-28';
const TWO_AGO = '2026-09-21';
const THREE_AGO = '2026-09-14';
const display = (key) => String(key).split(':').pop();

const slot = (n, teks) => ({
  slot: n, weeklySlotKey: `${n}|skill-${teks}|${teks}|current|course|2|3`, teksCode: teks,
  purpose: 'current', context: 'course', dok: 2, difficultyBand: 3, status: 'notStarted',
});
// The frozen shape resolveWeeklyPathGoalSnapshot stores — no settings, so the
// grade uses the default policy exactly as the Classroom publisher's does.
const frozenGoal = (weekKey, teks = ['A.5A', 'A.2C']) => ({
  schemaVersion: 1, studentId: 'S1', classId: 'class-a', courseId: 'algebra1', weekKey,
  dueAt: dueAtFor(Date.parse(`${weekKey}T12:00:00Z`)), goalSessions: teks.length,
  sessions: teks.map((code, index) => slot(index + 1, code)), assignmentState: 'assigned',
});
let sessionCount = 0;
const completed = (goal, slotNumber, completedAt, { correct = 4, questions = 5, studentId = 'S1' } = {}) => {
  sessionCount += 1;
  const target = goal.sessions[slotNumber - 1];
  return {
    id: `p${sessionCount}`,
    data: {
      studentId, status: 'completed', completedAt, updatedAt: completedAt, weekKey: goal.weekKey,
      weeklySlotKey: target.weeklySlotKey, weeklySlot: slotNumber, requiredQuestions: questions,
      target: { alignmentKey: `texas:${target.teksCode}` },
      summary: { completedQuestions: questions, correctQuestions: correct },
      privateGrading: { answer: 'never returned' },
    },
  };
};
const monday = (weekKey, hours = 15) => Date.parse(`${weekKey}T00:00:00Z`) + hours * 3600000;

test('the history covers this week and the eleven before it, newest first, computed rather than scanned', () => {
  const keys = recentWeeklyPathWeekKeys(NOW);
  assert.equal(keys.length, WEEKLY_PATH_HISTORY_WEEKS);
  assert.equal(keys[0], THIS_WEEK);
  assert.equal(keys[1], LAST_WEEK);
  assert.equal(keys[11], '2026-07-20');
  for (const key of keys) assert.equal(new Date(`${key}T00:00:00Z`).getUTCDay(), 1, `${key} is a Monday`);
  const window = weeklyPathHistoryWindow([LAST_WEEK, THIS_WEEK]);
  assert.equal(window.start, weeklyCompletionWindow(LAST_WEEK).start);
  assert.equal(window.end, weeklyCompletionWindow(THIS_WEEK).end);
  assert.equal(weeklyPathHistoryWindow([]), null);
});

test('a past week reads the very grade the Classroom publisher sends', async () => {
  const goal = frozenGoal(LAST_WEEK);
  // Accuracy 2/3 and 3/3: a grade with a fraction, so rounding is visible.
  const sessions = [
    completed(goal, 1, monday(LAST_WEEK) + DAY, { correct: 2, questions: 3 }),
    completed(goal, 2, monday(LAST_WEEK) + 3 * DAY, { correct: 3, questions: 3 }),
    // Another student's session in the same window is not this student's work.
    completed(goal, 1, monday(LAST_WEEK) + DAY, { studentId: 'S2' }),
  ];
  const mine = sessions.filter((entry) => entry.data.studentId === 'S1');
  const history = buildWeeklyPathHistory({ goalsByWeekKey: { [LAST_WEEK]: goal }, sessions: mine, now: NOW, displayTeks: display });
  const week = history.weeks.find((entry) => entry.weekKey === LAST_WEEK);
  assert.equal(week.closed, true);
  assert.equal(week.hit, true);
  assert.equal(week.completedOnTime, 2);

  // What the publisher does: its loader collects the class-week's completed
  // sessions in the window with completionFromPathSession, then the sync
  // grades the frozen goal with gradeWeeklyGoal. Run that real sync.
  const window = weeklyCompletionWindow(LAST_WEEK);
  const loaderCompletions = mine
    .filter((entry) => entry.data.completedAt >= window.start && entry.data.completedAt < window.end)
    .map((entry) => completionFromPathSession(entry.id, entry.data, { displayTeks: display }));
  const published = [];
  const report = await syncWeeklyPathClassWeek({
    classId: 'class-a', weekKey: LAST_WEEK, courseId: 'course-1', enabled: true, maxPoints: 100,
    students: [{ studentId: 'S1', googleUserId: 'g1' }],
    goalsByStudentId: { S1: goal }, completionsByStudentId: { S1: loaderCompletions },
    now: monday(THIS_WEEK, 12), gradeWeeklyGoal,
    findCourseWork: async () => ({ id: 'cw-1' }),
    createCourseWork: async () => ({ id: 'cw-1' }),
    findSubmission: async () => ({ id: 'sub-1' }),
    patchGrade: async ({ grade }) => { published.push(grade); },
    returnSubmission: async () => {},
  });
  assert.equal(report.results[0].published, true);
  assert.equal(week.grade, report.results[0].score, 'the student reads the published grade');
  assert.equal(week.grade, published[0], 'out of 100, the points are the grade');
  assert.equal(week.grade, 96.67);
  assert.equal(week.score, 96.67, 'the published grade itself, exactly as the gradebook shows it');
  assert.equal(week.passing, true);
});

test('Sunday evening after UTC midnight: last week is still open until its Central-time deadline', () => {
  // 9pm Sunday in Chicago is already Monday in UTC, so the UTC week has
  // turned; last week's goal is due at 23:59 Central and is not over yet.
  const sundayEvening = Date.parse('2026-10-05T02:00:00Z');
  const goal = frozenGoal(LAST_WEEK);
  assert.ok(sundayEvening < goal.dueAt);
  const history = buildWeeklyPathHistory({
    goalsByWeekKey: { [LAST_WEEK]: goal, [TWO_AGO]: frozenGoal(TWO_AGO, ['A.5A']) },
    sessions: [completed(goal, 1, monday(LAST_WEEK) + DAY), completed(frozenGoal(TWO_AGO, ['A.5A']), 1, monday(TWO_AGO) + DAY)],
    now: sundayEvening,
  });
  const last = history.weeks.find((week) => week.weekKey === LAST_WEEK);
  assert.equal(last.closed, false, 'its grade can still change');
  assert.equal(last.grade, null);
  assert.equal(history.streak.weeks, 1, 'an unfinished open week does not break the streak');
  assert.equal(history.streak.endedBy, '2026-09-14');
});

test('work finished after the due date still counts as done, but the week was not hit', () => {
  const goal = frozenGoal(LAST_WEEK);
  // Sunday-night lateness inside the publisher's window: after the 23:59
  // Central deadline, before the window's extra day ends.
  const late = goal.dueAt + 60 * 60 * 1000;
  const sessions = [completed(goal, 1, monday(LAST_WEEK) + DAY), completed(goal, 2, late)];
  const week = buildWeeklyPathHistory({ goalsByWeekKey: { [LAST_WEEK]: goal }, sessions, now: NOW }).weeks[1];
  assert.equal(week.weekKey, LAST_WEEK);
  assert.equal(week.completed, 2);
  assert.equal(week.completedOnTime, 1);
  assert.equal(week.lateCompletions, 1);
  assert.equal(week.hit, false);
  assert.equal(week.grade, gradeWeeklyGoal({ goal, completions: sessions.map((entry) => completionFromPathSession(entry.id, entry.data)), now: NOW }).grade);
});

test('this week is open: progress is shown, no grade is given yet, and it is not a miss', () => {
  const goal = frozenGoal(THIS_WEEK);
  const week = summarizeWeeklyPathWeek({
    weekKey: THIS_WEEK, goal, now: NOW,
    completions: [completionFromPathSession('p', completed(goal, 1, NOW - 3600000).data)],
  });
  assert.equal(week.current, true);
  assert.equal(week.closed, false);
  assert.equal(week.completed, 1);
  assert.equal(week.required, 2);
  assert.equal(week.hit, false);
  assert.equal(week.grade, null, 'mid-week the Path panel owns "grade so far"');
  assert.equal(week.score, null);

  const blank = summarizeWeeklyPathWeek({ weekKey: TWO_AGO, goal: null, now: NOW });
  assert.equal(blank.hasGoal, false);
  assert.equal(blank.closed, true, 'a past week with nothing assigned is over');
  assert.equal(blank.hit, false);
});

const row = (weekKey, { hit = false, closed = true } = {}) => ({ weekKey, hit, closed });

test('streak: an unfinished current week does not break it; finishing it extends it', () => {
  const weeks = [row(THIS_WEEK, { closed: false }), row(LAST_WEEK, { hit: true }), row(TWO_AGO, { hit: true }), row(THREE_AGO)];
  assert.deepEqual(weeklyPathStreak(weeks), { weeks: 2, includesOpenWeek: false, atLeast: false, endedBy: THREE_AGO });
  weeks[0].hit = true;
  assert.deepEqual(weeklyPathStreak(weeks), { weeks: 3, includesOpenWeek: true, atLeast: false, endedBy: THREE_AGO });
});

test('streak: a missed closed week breaks it, even with hits before it', () => {
  assert.equal(weeklyPathStreak([row(THIS_WEEK, { closed: false }), row(LAST_WEEK), row(TWO_AGO, { hit: true })]).weeks, 0);
  // This week already hit: one in a row.
  assert.equal(weeklyPathStreak([row(THIS_WEEK, { hit: true, closed: false }), row(LAST_WEEK), row(TWO_AGO, { hit: true })]).weeks, 1);
  // Order of the input does not matter; the newest week decides.
  assert.equal(weeklyPathStreak([row(TWO_AGO, { hit: true }), row(LAST_WEEK)]).weeks, 0);
});

test('streak: every week in view hit means "at least" that many', () => {
  const allHit = recentWeeklyPathWeekKeys(NOW).map((weekKey, index) => row(weekKey, { hit: true, closed: index > 0 }));
  assert.deepEqual(weeklyPathStreak(allHit), { weeks: 12, includesOpenWeek: true, atLeast: true, endedBy: null });
  assert.deepEqual(weeklyPathStreak([]), { weeks: 0, includesOpenWeek: false, atLeast: false, endedBy: null });
});

test('a past week stored with a due date far in its future still closes, and its miss ends the streak', () => {
  // The freeze now refuses such a date; a week stored before that must not
  // stay open for good and skip the streak instead of ending it.
  const forged = { ...frozenGoal(TWO_AGO), dueAt: NOW + 365 * DAY };
  const week = summarizeWeeklyPathWeek({ weekKey: TWO_AGO, goal: forged, completions: [], now: NOW });
  assert.equal(week.closed, true);
  assert.equal(week.hit, false);
  const history = buildWeeklyPathHistory({
    weekKeys: [LAST_WEEK, TWO_AGO, THREE_AGO],
    goalsByWeekKey: { [LAST_WEEK]: frozenGoal(LAST_WEEK, ['A.5A']), [TWO_AGO]: forged, [THREE_AGO]: frozenGoal(THREE_AGO, ['A.5A']) },
    sessions: [completed(frozenGoal(LAST_WEEK, ['A.5A']), 1, monday(LAST_WEEK)), completed(frozenGoal(THREE_AGO, ['A.5A']), 1, monday(THREE_AGO))],
    now: NOW,
    displayTeks: display,
  });
  assert.deepEqual(history.streak, { weeks: 1, includesOpenWeek: false, atLeast: false, endedBy: TWO_AGO });
  // Inside its own window the week keeps following its due date.
  const open = summarizeWeeklyPathWeek({ weekKey: THIS_WEEK, goal: { ...frozenGoal(THIS_WEEK), dueAt: NOW + 365 * DAY }, completions: [], now: NOW });
  assert.equal(open.closed, false);
});

test('end to end: a week with no goal is a closed week not hit, and ends the streak', () => {
  const last = frozenGoal(LAST_WEEK, ['A.5A']);
  const three = frozenGoal(THREE_AGO, ['A.5A']);
  const sessions = [completed(last, 1, monday(LAST_WEEK) + DAY), completed(three, 1, monday(THREE_AGO) + DAY)];
  // Two weeks ago the Path was never opened: nothing frozen, nothing graded.
  const history = buildWeeklyPathHistory({ goalsByWeekKey: { [LAST_WEEK]: last, [THREE_AGO]: three }, sessions, now: NOW });
  assert.deepEqual(history.weeks.slice(0, 4).map((week) => [week.weekKey, week.hasGoal, week.hit]), [
    [THIS_WEEK, false, false], [LAST_WEEK, true, true], [TWO_AGO, false, false], [THREE_AGO, true, true],
  ]);
  assert.equal(history.weeks[0].closed, false, 'this week is not over, goal or not');
  assert.equal(history.streak.weeks, 1);
  assert.equal(history.streak.endedBy, TWO_AGO);
  assert.equal(history.weeksHit, 2);
  assert.equal(history.weeksWithGoal, 2);
  assert.equal(history.truncated, false);
});

// --------------------------------------------------------------- the loader

const fakeDb = ({ goals = {}, sessions = [], rangeNeedsIndex = false, syncs = {} } = {}) => {
  const reads = { docs: [], queries: [] };
  const query = (name, filters, limit = null) => ({
    where: (field, op, value) => query(name, [...filters, [field, op, value]], limit),
    limit: (count) => query(name, filters, count),
    get: async () => {
      reads.queries.push({ name, filters, limit });
      if (rangeNeedsIndex && filters.some(([field]) => field === 'completedAt')) {
        throw Object.assign(new Error('The query requires an index.'), { code: 9 });
      }
      let rows = sessions.filter((entry) => filters.every(([field, op, value]) => (
        op === '==' ? entry.data[field] === value : op === '>=' ? entry.data[field] >= value : entry.data[field] < value
      )));
      if (limit) rows = rows.slice(0, limit);
      return { docs: rows.map((entry) => ({ id: entry.id, data: () => entry.data })), size: rows.length };
    },
  });
  return {
    reads,
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          reads.docs.push(`${name}/${id}`);
          const data = name === 'weeklyPathGoalSnapshots' ? goals[id]
            : name === 'weeklyPathClassroomSyncs' ? syncs[id]
              : undefined;
          return { exists: Boolean(data), data: () => data };
        },
      }),
      where: (field, op, value) => query(name, [[field, op, value]]),
    }),
  };
};

test('the loader reads only the caller\'s own goals, by computed id, and only the caller\'s sessions', async () => {
  const goal = frozenGoal(LAST_WEEK);
  const db = fakeDb({
    goals: { [`S1__${LAST_WEEK}`]: goal, [`S2__${LAST_WEEK}`]: frozenGoal(LAST_WEEK) },
    sessions: [
      completed(goal, 1, monday(LAST_WEEK) + DAY),
      completed(goal, 2, monday(LAST_WEEK) + DAY),
      completed(goal, 1, monday(LAST_WEEK) + DAY, { studentId: 'S2' }),
    ],
  });
  const history = await loadWeeklyPathHistory(db, { studentId: 'S1', now: NOW, displayTeks: display });
  // The caller's goals by computed id, then the publisher's record for each
  // week that had a goal, by its computed {classId}__{weekKey} id.
  assert.deepEqual(db.reads.docs, [
    ...recentWeeklyPathWeekKeys(NOW).map((weekKey) => `weeklyPathGoalSnapshots/S1__${weekKey}`),
    `weeklyPathClassroomSyncs/class-a__${LAST_WEEK}`,
  ]);
  assert.equal(db.reads.queries.length, 1);
  assert.deepEqual(db.reads.queries[0].filters[0], ['studentId', '==', 'S1']);
  assert.equal(history.weeks.find((week) => week.weekKey === LAST_WEEK).hit, true);
  assert.equal(history.streak.weeks, 1);
  assert.equal(JSON.stringify(history).includes('never returned'), false, 'no session payload leaves the server');
  await assert.rejects(loadWeeklyPathHistory(db, { studentId: '', now: NOW }));
});

test('no goal in twelve weeks reads no sessions; a missing index falls back to the student\'s own sessions', async () => {
  const empty = fakeDb();
  const none = await loadWeeklyPathHistory(empty, { studentId: 'S1', now: NOW });
  assert.equal(empty.reads.queries.length, 0);
  assert.equal(none.weeksWithGoal, 0);
  assert.equal(none.streak.weeks, 0);

  const goal = frozenGoal(LAST_WEEK, ['A.5A']);
  const building = fakeDb({ goals: { [`S1__${LAST_WEEK}`]: goal }, sessions: [completed(goal, 1, monday(LAST_WEEK) + DAY)], rangeNeedsIndex: true });
  const history = await loadWeeklyPathHistory(building, { studentId: 'S1', now: NOW });
  assert.equal(building.reads.queries.length, 2);
  assert.deepEqual(building.reads.queries[1], { name: 'pathSessions', filters: [['studentId', '==', 'S1']], limit: FALLBACK_SESSION_LIMIT });
  assert.equal(history.weeks[1].hit, true);
  assert.equal(history.truncated, false);
});

// ------------------------------------------------------------------ wiring

test('the callable is student-only and passes nothing from the request into the reads', () => {
  const source = executableSource(read('functions/index.js'));
  const callable = region(source, 'exports.getMyWeeklyPathHistory', 'exports.getMyWeeklyPathCompletions', 'weekly history callable');
  assert.match(callable, /const \{ studentId \} = requireStudent\(request\);/);
  assert.match(callable, /const \{ loadWeeklyPathHistory \} = require\("\.\/lib\/weeklyPathHistory"\);/);
  assert.match(callable, /loadWeeklyPathHistory\(getFirestore\(\), \{\s*studentId,/);
  assert.match(callable, /goalCollection: WEEKLY_PATH_GOAL_SNAPSHOTS/);
  assert.doesNotMatch(callable, /request\.data/, 'no client-supplied student or week can widen what is read');
  assert.match(callable, /withPathCallableDiagnostics\("getMyWeeklyPathHistory"/);
});

test('the shared builder grades with the publisher\'s functions, not its own rule', () => {
  const shared = executableSource(read('functions/shared/weeklyPathHistory.mjs'));
  assert.match(shared, /import \{ gradeWeeklyGoal, weekKeyFor \} from '\.\/weeklyPathGrade\.mjs';/);
  assert.match(shared, /import \{ collectWeeklyPathSessions, weeklyCompletionWindow \} from '\.\/weeklyPathCompletion\.mjs';/);
  assert.doesNotMatch(shared, /status\s*===\s*'completed'/, 'what counts as finished is weeklyPathCompletion.mjs\'s call');
  const loader = executableSource(read('functions/lib/weeklyPathHistory.js'));
  assert.match(loader, /\.doc\(`\$\{id\}__\$\{weekKey\}`\)/);
  assert.equal((loader.match(/collection\(PATH_SESSIONS\)\s*\n?\s*\.where\("studentId", "==", id\)/g) || []).length, 2, 'both session reads filter on the caller');
});

test('the client asks for the signed-in student\'s history and sends no identity', () => {
  const store = executableSource(read('src/platform/path/pathStore.js'));
  const fetcher = region(store, 'export const fetchMyWeeklyPathHistory = async () => {', '};', 'history fetch');
  assert.match(fetcher, /httpsCallable\(functions, 'getMyWeeklyPathHistory'\)/);
  assert.match(fetcher, /await call\(\{\}\)/);
});


test('a closed week shows the grade Classroom was sent, not a recomputation that late work has moved', async () => {
  // Published Monday morning from the on-time session alone. A session
  // finished after the deadline, but inside the publisher's eight-day window,
  // still moves the quality half of a recomputed grade — Classroom keeps what it
  // was sent.
  const goal = frozenGoal(LAST_WEEK);
  const late = goal.dueAt + 2 * 3600000;
  const sessions = [
    completed(goal, 1, monday(LAST_WEEK) + DAY, { correct: 5, questions: 5 }),
    completed(goal, 2, late, { correct: 0, questions: 5 }),
  ];
  const sentAt = goal.dueAt + 7 * 3600000;
  const db = fakeDb({
    goals: { [`S1__${LAST_WEEK}`]: goal },
    sessions,
    syncs: { [`class-a__${LAST_WEEK}`]: { publishedByStudentId: { S1: { points: 85, score: 85, at: sentAt }, S2: { points: 12, score: 12, at: sentAt } } } },
  });
  const history = await loadWeeklyPathHistory(db, { studentId: 'S1', now: NOW, displayTeks: display });
  const week = history.weeks.find((entry) => entry.weekKey === LAST_WEEK);
  const recomputed = buildWeeklyPathHistory({ goalsByWeekKey: { [LAST_WEEK]: goal }, sessions, now: NOW, displayTeks: display })
    .weeks.find((entry) => entry.weekKey === LAST_WEEK);
  assert.notEqual(recomputed.score, 85, 'the case is real: the late session moves a recomputed grade');
  assert.equal(week.score, 85, 'the number Classroom received');
  assert.equal(week.gradeSource, 'classroom');
  assert.equal(week.publishedAt, sentAt);
  assert.equal(JSON.stringify(history).includes('"score":12'), false, 'another student\'s published grade never leaves the server');
});

test('a closed week Classroom was never sent shows the MathMaster grade, and says so', async () => {
  const goal = frozenGoal(LAST_WEEK);
  const db = fakeDb({ goals: { [`S1__${LAST_WEEK}`]: goal }, sessions: [completed(goal, 1, monday(LAST_WEEK) + DAY)] });
  const history = await loadWeeklyPathHistory(db, { studentId: 'S1', now: NOW, displayTeks: display });
  const week = history.weeks.find((entry) => entry.weekKey === LAST_WEEK);
  assert.equal(week.gradeSource, 'mathmaster');
  assert.equal(typeof week.score, 'number');
  const open = history.weeks.find((entry) => entry.weekKey === THIS_WEEK);
  assert.equal(open.gradeSource, null, 'an open week has no grade yet');
});
