// A weekly goal asks for the sessions the week actually holds.
//
// The planner can return fewer sessions than the teacher's count (a student
// with three open skills cannot be given four). The server froze min(count,
// sessions) cards but kept goalSessions at the count, so the student saw three
// cards and "0 of 4", could never finish, and Classroom received a grade that
// stopped near 75 for a student who did everything they were given.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  describeWeeklyGradeForStudent,
  evaluateWeeklyGoalProgress,
  gradeWeeklyGoal,
  matchWeeklyGoalCompletions,
  requiredWeeklySessions,
} from '../../functions/shared/weeklyPathGrade.mjs';
import { buildTeacherWeeklyView, buildWeeklyGoal } from '../../src/platform/path/weeklyPathGoal.js';
import { PURPOSE } from '../../src/platform/path/recommendationV2.js';
import { region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const { syncWeeklyPathClassWeek } = require('../../functions/lib/weeklyPathSync.js');

// The freeze as deployed, run with its real collaborators, so this tests the
// code resolveWeeklyPathGoalSnapshot runs rather than a copy of it. Here that
// is sanitizeWeeklyPathGoalProposal, cut out of functions/index.js. Where the
// freeze has moved to functions/shared/weeklyPathSlotAuthority.mjs (index.js
// then only forwards to it), that module is what the callable runs, so that is
// what gets tested: the invariant is about the frozen week, not about a file.
const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const frameworkSource = region(functionsSource, 'const PATH_ASSESSMENT_FRAMEWORKS = ', 'function pathQuestionMatchesFramework', 'framework normalizer');
const normalizePathAssessmentFramework = new Function(`${frameworkSource}\nreturn normalizePathAssessmentFramework;`)();
class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const sharedFreeze = new URL('../../functions/shared/weeklyPathSlotAuthority.mjs', import.meta.url);
const loadFreeze = async () => {
  if (existsSync(sharedFreeze)) {
    const { freezeWeeklyPathGoalProposal } = await import(sharedFreeze.href);
    return (goal, { studentId, classRecord }) => freezeWeeklyPathGoalProposal(goal, {
      studentId,
      classId: classRecord?.classId,
      courseId: classRecord?.course,
      canonicalTeks: mathPath.canonicalAlignmentKey,
      displayTeks: mathPath.displayAlignmentKey,
      normalizeFramework: normalizePathAssessmentFramework,
    });
  }
  const sanitizerSource = region(
    functionsSource,
    'function sanitizeWeeklyPathGoalProposal(',
    "/** Freeze the student's proposed autonomous week exactly once. */",
    'weekly goal sanitizer',
  );
  return new Function(
    'HttpsError',
    'mathPath',
    'normalizePathAssessmentFramework',
    `${sanitizerSource}\nreturn sanitizeWeeklyPathGoalProposal;`,
  )(HttpsError, mathPath, normalizePathAssessmentFramework);
};
const sanitizeWeeklyPathGoalProposal = await loadFreeze();

const CLASS = { classId: 'c1', course: 'algebra1' };
const NOW = Date.parse('2026-09-01T15:00:00Z'); // a Tuesday
const DAY = 24 * 60 * 60 * 1000;
const session = (code, purpose = PURPOSE.CURRENT_LEARNING) => ({
  skillId: `teks:${code}`, teksCode: code, purpose, dok: 2, difficultyBand: 3,
});
const planOf = (...codes) => ({ sessions: codes.map((code) => session(code)), profile: null, suppressed: [] });

const freeze = (goal) => ({
  ...sanitizeWeeklyPathGoalProposal(goal, { studentId: 'S1', classRecord: CLASS }),
  assignmentState: 'assigned',
});
const completeSlots = (goal, count, { accuracy = 1, at = goal.dueAt - DAY } = {}) => goal.sessions.slice(0, count).map((slot, index) => ({
  status: 'completed',
  sessionId: `P${index + 1}`,
  weekKey: goal.weekKey,
  weeklySlotKey: slot.weeklySlotKey,
  teksCode: slot.teksCode,
  completedAt: at,
  accuracy,
}));

test('the frozen week asks for exactly the sessions it holds', () => {
  // The student's proposal: the teacher asked for four, the planner found three.
  const proposal = buildWeeklyGoal({ plan: planOf('A.5A', 'A.3A', 'A.9A'), config: { sessions: 4 }, studentId: 'S1', now: NOW });
  assert.equal(proposal.goalSessions, 3, 'the client proposal already agrees with its cards');
  assert.equal(proposal.requestedSessions, 4);

  const frozen = freeze(proposal);
  assert.equal(frozen.sessions.length, 3);
  assert.equal(frozen.goalSessions, 3);
  assert.equal(frozen.requestedSessions, 4, 'the teacher asked for four, and that is still on record');

  // A proposal that still claims four for three cards (a client from before
  // this fix, with no requestedSessions) freezes as three as well.
  const { requestedSessions: _dropped, ...older } = proposal;
  const fromOlderClient = freeze({ ...older, goalSessions: 4 });
  assert.equal(fromOlderClient.goalSessions, 3);
  assert.equal(fromOlderClient.requestedSessions, 4);
});

// The week of 31 August 2026 closes at 23:59 Sunday 6 September, Central time.
const SUNDAY_NIGHT_AUG_31 = Date.parse('2026-09-06T23:59:59.999-05:00');

test('goalSessions equals sessions.length on every frozen week', () => {
  const codes = ['A.5A', 'A.3A', 'A.9A', 'A.2A', 'A.6A', 'A.7A', 'A.8A'];
  for (const requested of [undefined, 1, 3, 4, 5, 6, 9]) {
    for (let count = 1; count <= codes.length; count += 1) {
      const frozen = freeze({
        weekKey: '2026-08-31', courseId: 'algebra1', goalSessions: requested, dueAt: SUNDAY_NIGHT_AUG_31,
        sessions: codes.slice(0, count).map((code) => session(code)),
      });
      assert.equal(
        frozen.goalSessions,
        frozen.sessions.length,
        `requested ${requested}, planned ${count}: a frozen week must ask for exactly the sessions it holds `
        + '(goalSessions: sessions.length, requestedSessions: the teacher\'s count — in whichever freeze the callable runs)',
      );
      assert.ok(frozen.sessions.length <= frozen.requestedSessions, 'never more cards than the teacher asked for');
      assert.ok(frozen.requestedSessions >= 3 && frozen.requestedSessions <= 6);
    }
  }
  // An empty week is still refused rather than frozen as a zero-session goal.
  assert.throws(() => freeze({ weekKey: '2026-08-31', goalSessions: 4, dueAt: SUNDAY_NIGHT_AUG_31, sessions: [] }), /could not build any weekly Path sessions/);
});

test('a student who finishes every card they were given has finished the week', () => {
  const proposal = buildWeeklyGoal({ plan: planOf('A.5A', 'A.3A', 'A.9A'), config: { sessions: 4 }, studentId: 'S1', now: NOW });
  const goal = freeze(proposal);
  const completions = completeSlots(goal, 3);

  const progress = evaluateWeeklyGoalProgress({ goal, completions, now: goal.dueAt - 1000 });
  assert.equal(progress.required, 3);
  assert.equal(progress.complete, true);

  const grade = gradeWeeklyGoal({ goal, completions, now: goal.dueAt + 1000 });
  assert.equal(grade.grade, 100);
  assert.equal(grade.passing, true);
  assert.match(grade.explanation, /Completed every assigned session/);
});

test('a week already frozen with the larger count is read with the cap', () => {
  // Snapshots frozen before this fix still say goalSessions: 4 over three
  // slots. Every reader of the goal goes through the same cap, so the panel,
  // the teacher's table and Classroom agree on 3 of 3.
  const goal = {
    weekKey: '2026-08-31', goalSessions: 4, assignmentState: 'assigned',
    dueAt: Date.parse('2026-09-06T23:59:59.999-05:00'),
    sessions: ['A.5A', 'A.3A', 'A.9A'].map((code, index) => ({
      ...session(code), slot: index + 1, weeklySlotKey: `${index + 1}|teks:${code}|${code}|current_learning|course|2|3`,
    })),
  };
  const completions = completeSlots(goal, 3);

  assert.equal(requiredWeeklySessions(goal), 3);
  const shown = describeWeeklyGradeForStudent({ goal, completions, now: goal.dueAt - DAY });
  assert.equal(shown.required, 3);
  assert.equal(shown.complete, true);
  assert.equal(shown.nextStep, 'Every session is done. Anything else you practise this week is extra.');

  const [row] = buildTeacherWeeklyView([{ studentId: 'S1', goal, completions }], { now: goal.dueAt - DAY });
  assert.equal(row.goal, 3, 'the teacher table shows the count the grade used');
  assert.equal(row.complete, 3);

  assert.equal(gradeWeeklyGoal({ goal, completions, now: goal.dueAt + DAY }).grade, 100);
});

test('Classroom receives the grade the student was shown', async () => {
  const goal = freeze(buildWeeklyGoal({ plan: planOf('A.5A', 'A.3A', 'A.9A'), config: { sessions: 4 }, studentId: 'S1', now: NOW }));
  const completions = completeSlots(goal, 3);
  const patched = [];
  const created = [];
  const report = await syncWeeklyPathClassWeek({
    classId: 'c1', weekKey: goal.weekKey, courseId: 'course-1', enabled: true, maxPoints: 100,
    now: goal.dueAt + DAY,
    students: [{ studentId: 'S1', googleUserId: 'g1' }],
    goalsByStudentId: { S1: goal },
    completionsByStudentId: { S1: completions },
    publishedByStudentId: {},
    findCourseWork: async () => null,
    createCourseWork: async (courseId, work) => { created.push(work); return { id: 'cw-1' }; },
    findSubmission: async () => ({ id: 'sub-1', assignedGrade: null, draftGrade: null }),
    patchGrade: async (args) => { patched.push(args); },
    returnSubmission: async () => {},
    gradeWeeklyGoal,
  });
  assert.equal(report.published, 1);
  assert.equal(patched[0].grade, 100);
  assert.equal(
    patched[0].grade,
    describeWeeklyGradeForStudent({ goal, completions, now: goal.dueAt + DAY }).score,
  );
  // The one class-level post names the count the teacher set, not whichever
  // student's short week happens to be read first.
  assert.match(created[0].description, /4 practice sessions/);
});

test('the class-level post falls back to goalSessions for snapshots without requestedSessions', async () => {
  const created = [];
  const goal = { weekKey: '2026-08-31', goalSessions: 5, dueAt: 1, sessions: [] };
  await syncWeeklyPathClassWeek({
    classId: 'c1', weekKey: goal.weekKey, courseId: 'course-1', enabled: false, now: 2,
    students: [], goalsByStudentId: { S1: goal },
    findCourseWork: async () => null,
    createCourseWork: async (courseId, work) => { created.push(work); return { id: 'cw-1' }; },
    gradeWeeklyGoal,
  });
  assert.match(created[0].description, /5 practice sessions/);
});

test('the cap never raises a count and leaves count-only weeks alone', () => {
  const slots = (count) => Array.from({ length: count }, (_, index) => ({ slot: index + 1 }));
  assert.equal(requiredWeeklySessions({ goalSessions: 4, sessions: slots(3) }), 3);
  assert.equal(requiredWeeklySessions({ goalSessions: 3, sessions: slots(5) }), 3);
  assert.equal(requiredWeeklySessions({ goalSessions: 4, sessions: slots(4) }), 4);
  // A week with slots but no count asks for its slots, not for nothing.
  assert.equal(requiredWeeklySessions({ sessions: slots(3) }), 3);
  // Older count-only weeks have no slots; they keep their count.
  assert.equal(requiredWeeklySessions({ goalSessions: 4 }), 4);
  assert.equal(requiredWeeklySessions({ goalSessions: 4, sessions: [] }), 4);
  assert.equal(requiredWeeklySessions(null), 0);

  // And a count-only week still matches by count, up to its count.
  const legacy = { goalSessions: 2 };
  const done = Array.from({ length: 5 }, () => ({ status: 'completed', completedAt: NOW }));
  assert.equal(matchWeeklyGoalCompletions({ goal: legacy, completions: done }).matched.length, 2);
  // An unkeyed (older) week with fewer slots than its count matches only its slots.
  const shortLegacy = { goalSessions: 4, sessions: [session('A.5A'), session('A.3A')] };
  assert.equal(matchWeeklyGoalCompletions({ goal: shortLegacy, completions: done }).matched.length, 2);
  assert.equal(evaluateWeeklyGoalProgress({ goal: shortLegacy, completions: done }).complete, true);
});

test('the client and the server agree on a full week too', () => {
  const proposal = buildWeeklyGoal({ plan: planOf('A.5A', 'A.3A', 'A.9A', 'A.2A'), config: { sessions: 4 }, studentId: 'S1', now: NOW });
  const frozen = freeze(proposal);
  assert.equal(proposal.goalSessions, 4);
  assert.equal(frozen.goalSessions, 4);
  assert.deepEqual(frozen.sessions.map((slot) => slot.weeklySlotKey), proposal.sessions.map((slot) => slot.weeklySlotKey));
});
