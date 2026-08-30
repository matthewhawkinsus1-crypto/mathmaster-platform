// The seam between the two engines, exercised against the REAL skill graph.
//
// recommendationV2.test.mjs proves the rules in isolation on synthetic rows.
// This file proves that when the actual Algebra I engine runs — real
// prerequisite graph, real calendar, real statuses — its output survives the
// journey into V2 intact: nothing V1 locked comes back, nothing loses its TEKS
// code, and a student with no history at all still gets a usable week.

import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS } from '../../src/platform/path/recommendationEngine.js';
import { buildStudentPathOptions, calendarHasStarted } from '../../src/platform/path/studentPathOptions.js';
import ALGEBRA1_CALENDAR from '../../src/curriculum/calendars/algebra1-2026-2027.js';
import { PURPOSE } from '../../src/platform/path/recommendationV2.js';
import {
  buildLastPracticedIndex, buildRecentFailureIndex, buildStrandIndex,
  buildWeeklyPathPlan, deriveInstructionalContext, flattenEngineRows,
} from '../../src/platform/path/weeklyPathPlan.js';

const DAY = 24 * 60 * 60 * 1000;
// Mid-September of the Algebra I 2026-2027 calendar. The clock MUST sit inside
// the school year: outside it the real calendar marks every skill FUTURE, which
// is correct behaviour and useless as a fixture.
const NOW = Date.parse('2026-09-15T15:00:00Z');

const optionsFor = (student = {}, assignments = []) => buildStudentPathOptions({
  student, assignments, courseId: 'algebra1', nowValue: NOW,
});

const evidence = ({ code, correct = true, band = 3, dok = 2, at = NOW - DAY }) => ({
  performance: { status: 'finalized', isCorrect: correct },
  questionSnapshot: { dok, difficultyBand: band },
  alignmentKeys: [`texas:${code}`],
  source: { activityRole: 'practice' },
  recordedAt: at,
});

// --- Flattening -----------------------------------------------------------------

test('locked and future work never reaches the recommender', () => {
  // V1 owns the curriculum judgement. V2 reasons about the student and has no
  // standing to reopen a severe prerequisite gap or content the class has not
  // reached.
  const options = optionsFor();
  const rows = flattenEngineRows(options, { strandIndex: buildStrandIndex('algebra1') });
  const ids = new Set(rows.map((row) => row.skillId));
  const lockedOrFuture = [...(options[STATUS.LOCKED] || []), ...(options[STATUS.FUTURE] || [])];
  assert.ok(lockedOrFuture.length > 0, 'the fixture should actually contain some');
  lockedOrFuture.forEach((row) => {
    assert.ok(!ids.has(row.skillId), `${row.skillId} was locked or future and must not be considered`);
  });
});

test('every flattened row keeps a real TEKS code and its bucket', () => {
  const rows = flattenEngineRows(optionsFor(), { strandIndex: buildStrandIndex('algebra1') });
  assert.ok(rows.length > 0);
  rows.forEach((row) => {
    assert.ok(row.teksCode && !String(row.teksCode).startsWith('teks:'),
      `${row.skillId} lost its code in translation`);
    assert.ok(row.engineStatus, 'the engine\'s own judgement must travel with the row');
  });
});

test('strands come from the graph, not from splitting the code string', () => {
  const index = buildStrandIndex('algebra1');
  const named = [...index.values()].filter(Boolean);
  assert.ok(named.length > 0, 'the Algebra I graph should carry strand labels');
});

// --- Instructional context -------------------------------------------------------

test('a prerequisite only blocks when it blocks something the class is on', () => {
  // A gap under an April unit is not this week's problem. Treating it as one is
  // exactly how a student ends up in a September remediation trap.
  const rows = [
    { skillId: 'teks:A.5A', curriculumTiming: 'current', remediationTarget: 'teks:8.8C' },
    { skillId: 'teks:A.9C', curriculumTiming: 'future', remediationTarget: 'teks:8.5I' },
  ];
  const context = deriveInstructionalContext(rows);
  assert.deepEqual(context.prerequisiteOfCurrent, ['teks:8.8C']);
});

test('required work is treated as an open assignment', () => {
  const rows = [{ skillId: 'teks:A.5A', engineStatus: STATUS.REQUIRED, reasons: [] }];
  assert.deepEqual(deriveInstructionalContext(rows).openAssignmentSkills, ['teks:A.5A']);
});

// --- History indexes --------------------------------------------------------------

test('last-practiced takes the most recent event per standard', () => {
  const index = buildLastPracticedIndex([
    evidence({ code: 'A.5A', at: NOW - 9 * DAY }),
    evidence({ code: 'A.5A', at: NOW - 2 * DAY }),
    evidence({ code: 'A.3A', at: NOW - 5 * DAY }),
  ]);
  assert.equal(index['A.5A'], NOW - 2 * DAY);
  assert.equal(index['A.3A'], NOW - 5 * DAY);
});

test('an event with no timestamp cannot start a cooldown', () => {
  // A missing timestamp read as 0 would place the last attempt in 1970 and mark
  // every cooldown elapsed — the silent failure that turns the whole mechanism
  // off without anything reporting an error.
  const index = buildLastPracticedIndex([{ ...evidence({ code: 'A.5A' }), recordedAt: undefined }]);
  assert.deepEqual(index, {});
});

test('recent-failure records the band of the latest MISS, not the latest event', () => {
  const index = buildRecentFailureIndex([
    evidence({ code: 'A.5A', correct: false, band: 4, at: NOW - 2 * DAY }),
    evidence({ code: 'A.5A', correct: true, band: 2, at: NOW - DAY }),
  ]);
  assert.equal(index['A.5A'], 4, 'the miss at Band 4 is still the outstanding question');
});

test('correct work produces no failure signal at all', () => {
  assert.deepEqual(buildRecentFailureIndex([evidence({ code: 'A.5A', correct: true })]), {});
});

test('an unfinished attempt is not a failure', () => {
  const opened = { ...evidence({ code: 'A.5A', correct: false }), performance: { status: 'attempted', isCorrect: false } };
  assert.deepEqual(buildRecentFailureIndex([opened]), {},
    'completion is not mastery, and non-completion is not failure');
});

// --- End to end against the real engine --------------------------------------------

test('a brand-new Algebra I student gets a full, varied week', () => {
  const plan = buildWeeklyPathPlan({ options: optionsFor(), courseId: 'algebra1', sessions: 4, now: NOW });
  assert.equal(plan.sessions.length, 4, 'a student with no history must still have somewhere to start');
  assert.equal(plan.diversity.skills, 4, 'and not the same standard four times');
  plan.sessions.forEach((session) => {
    assert.ok(session.teksCode, 'a standard');
    assert.ok(session.studentExplanation, 'a sentence the student can read');
    assert.ok(session.difficultyBand >= 1 && session.difficultyBand <= 5);
    assert.ok(session.dok >= 1 && session.dok <= 3);
  });
});

test('a fresh student is never labelled by the week that was built for them', () => {
  const plan = buildWeeklyPathPlan({ options: optionsFor(), courseId: 'algebra1', now: NOW });
  assert.equal(plan.profile.baseline.established, false);
  assert.match(plan.profile.instructionalBandLabel, /Baseline/i,
    'four sessions of recommendations must not become a verdict about the student');
});

test('work done yesterday does not come straight back today', () => {
  const options = optionsFor();
  const firstRow = flattenEngineRows(options, { strandIndex: buildStrandIndex('algebra1') })[0];
  const code = firstRow.teksCode;

  const plan = buildWeeklyPathPlan({
    options,
    courseId: 'algebra1',
    masteryProfilesByTeks: { [code]: { mastery: { status: 'Mastered', estimate: 95 }, dimensions: { eligibleGradeLevelEvents: 10 } } },
    evidenceEvents: [evidence({ code, at: NOW - DAY })],
    sessions: 4,
    now: NOW,
  });

  assert.ok(!plan.sessions.some((session) => session.teksCode === code),
    `${code} was mastered yesterday and should be resting`);
  assert.ok(plan.suppressed.some((entry) => entry.teksCode === code && entry.eligibility.reason === 'cooling_down'),
    'and the reason must be reportable, not invisible');
});

test('a plan reports both engines rather than one merged verdict', () => {
  const plan = buildWeeklyPathPlan({ options: optionsFor(), courseId: 'algebra1', now: NOW });
  assert.ok(plan.engineRowCount >= plan.sessions.length, 'V1 considered at least what V2 scheduled');
  assert.ok(Array.isArray(plan.considered));
  assert.ok(plan.instructionalContext, 'the teacher-facing "where is the class" view');
  assert.ok(plan.profile, 'and the student-facing "where is this student" view');
});

test('a missing options object degrades to an empty week, not a crash', () => {
  // My Math Path renders before the student document resolves. A throw here is
  // the error screen the student cannot escape.
  const plan = buildWeeklyPathPlan({ options: null, courseId: 'algebra1', now: NOW });
  assert.deepEqual(plan.sessions, []);
  assert.equal(plan.engineRowCount, 0);
});

test('a teacher pin survives the whole two-engine journey', () => {
  const options = optionsFor();
  const rows = flattenEngineRows(options, { strandIndex: buildStrandIndex('algebra1') });
  // Something the engine ranked last, so only the pin can explain its presence.
  const lowest = [...rows].sort((a, b) => a.score - b.score)[0];

  const plan = buildWeeklyPathPlan({
    options, courseId: 'algebra1', pinnedSkills: [lowest.skillId], sessions: 4, now: NOW,
  });
  assert.ok(plan.sessions.some((session) => session.skillId === lowest.skillId),
    'a teacher choice must not have to outscore the engine to be honoured');
});

test('an Honors week requests both course Challenge and CCMR transfer when the week has room', () => {
  const options = optionsFor();
  const honors = buildWeeklyPathPlan({ options, courseId: 'algebra1', honors: true, sessions: 5, now: NOW });
  const purposes = new Set(honors.requestedMix);
  assert.equal(honors.requestedMix.length, 5);
  assert.ok(purposes.has(PURPOSE.EXTENSION),
    'Honors pacing must preserve a course-TEKS Challenge slot');
  assert.ok(purposes.has(PURPOSE.TRANSFER),
    'Honors pacing must also preserve a CCMR transfer slot');
});

test('a four-session Honors plan keeps Challenge and transfer instead of truncating one', () => {
  const options = optionsFor();
  const honors = buildWeeklyPathPlan({ options, courseId: 'algebra1', honors: true, sessions: 4, now: NOW });
  assert.deepEqual(honors.requestedMix, [
    PURPOSE.CURRENT_LEARNING,
    PURPOSE.RETENTION,
    PURPOSE.EXTENSION,
    PURPOSE.TRANSFER,
  ]);
});

// --- A calendar that has not started yet ------------------------------------------

test('a course whose calendar has not started still gives the student a Path', () => {
  // Found by running the real engine on a clock outside the school year: before
  // the first window opens EVERY skill classifies as future, every bucket except
  // `future` comes back empty, and My Math Path has nothing to offer. A student
  // in summer school — or anyone opening the app in June — met a dead Path.
  const june = Date.parse('2026-06-01T15:00:00Z');
  const options = buildStudentPathOptions({ student: {}, assignments: [], courseId: 'algebra1', nowValue: june });
  const open = [...(options.recommended || []), ...(options.available || [])];
  assert.ok(open.length > 0, 'a not-yet-started calendar must not empty the Path');

  const plan = buildWeeklyPathPlan({ options, courseId: 'algebra1', sessions: 4, now: june });
  assert.equal(plan.sessions.length, 4);
});

test('out-of-season pacing tells the truth about being provisional', () => {
  // The fallback is a placeholder, not a district plan, and the student and the
  // teacher are entitled to know which one they are looking at.
  const june = Date.parse('2026-06-01T15:00:00Z');
  const inYear = Date.parse('2026-09-15T15:00:00Z');
  assert.equal(
    buildStudentPathOptions({ student: {}, assignments: [], courseId: 'algebra1', nowValue: june }).pacingIsProvisional,
    true,
  );
  assert.equal(
    buildStudentPathOptions({ student: {}, assignments: [], courseId: 'algebra1', nowValue: inYear }).pacingIsProvisional,
    false,
    'once the year starts the real calendar takes back over',
  );
});

test('the real calendar governs from its first instructional day, not a day early', () => {
  assert.equal(calendarHasStarted(ALGEBRA1_CALENDAR, Date.parse('2026-08-09T23:00:00Z')), false);
  assert.equal(calendarHasStarted(ALGEBRA1_CALENDAR, Date.parse('2026-08-10T15:00:00Z')), true);
});

test('an undated calendar is never overridden on a guess', () => {
  assert.equal(calendarHasStarted({ windows: [{ id: 'x' }] }, Date.parse('2026-06-01')), true,
    'missing data is ignorance, not a decision');
  assert.equal(calendarHasStarted(null, Date.parse('2026-06-01')), true);
});
