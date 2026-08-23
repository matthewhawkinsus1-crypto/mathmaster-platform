// Section BC — the brief's named policy regressions, in one place.
//
// "Add regression tests around the actual policies, not merely component
// rendering." Each test below is named for one line of the brief's list, so a
// failure says which promise broke rather than which function threw.
//
// Several of these are also covered in the module that owns them. That is
// deliberate: the module test protects the implementation, and this file
// protects the PROMISE — it keeps passing if the implementation is rewritten,
// and it is the file to read when asking "does the platform still do what we
// said it would?"
//
// Deterministic throughout. The clock is injected and no test depends on
// random generator selection.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { buildWeeklyPathPlan } from '../../src/platform/path/weeklyPathPlan.js';
import {
  COOLDOWN_DAYS, LIFECYCLE, PURPOSE, evaluateEligibility, resolveTarget, weeklyMixFor,
} from '../../src/platform/path/recommendationV2.js';
import {
  buildWeeklyGoal, deriveCompletionsFromEvidence, evaluateWeeklyGoalProgress, gradeWeeklyGoal,
  weekKeyFor,
} from '../../src/platform/path/weeklyPathGoal.js';
import {
  GAP, INSTRUCTIONAL_BAND, buildStudentLearningProfile, diagnoseGaps, isClassifyingEvidence,
  stabilizeBand,
} from '../../src/platform/profile/studentLearningProfile.js';
import {
  resolveAdaptedTarget, resolveAdaptivePolicy,
} from '../../src/platform/assignments/assignmentAdaptation.js';
import { buildAttemptEvidenceEvent } from '../../src/platform/history/evidenceEvent.js';
import { normalizeWeeklyGoalsByClass, storedWeeklyGoalForClassContext } from '../../src/platform/path/pathStore.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-15T15:00:00Z');
const MONDAY = Date.parse('2026-09-14T09:00:00Z');

const evidence = ({ dok = 2, band = 3, correct = true, skill = 'A.5A', role = 'practice', status = 'finalized', at = NOW - DAY, extra = {} } = {}) => ({
  performance: { status, isCorrect: correct },
  questionSnapshot: { dok, difficultyBand: band },
  alignmentKeys: [`texas:${skill}`],
  source: { activityRole: role, activitySessionId: `s-${skill}-${role}` },
  recordedAt: at,
  ...extra,
});

const profileAt = (stableBand, overrides = {}) => ({
  baseline: { established: true },
  instructionalBand: INSTRUCTIONAL_BAND.ON,
  difficultyProfile: { stableBand },
  dokProfile: {},
  ...overrides,
});

// ---------------------------------------------------------------------------
// 1. Path works without manual pacing
// ---------------------------------------------------------------------------

test('BC01 — Path works without manual pacing', () => {
  const options = buildStudentPathOptions({ student: {}, assignments: [], courseId: 'algebra1', nowValue: NOW });
  const open = [...(options.recommended || []), ...(options.available || [])];
  assert.ok(open.length > 0, 'a student whose teacher set no pacing still has work');
  assert.ok(buildWeeklyPathPlan({ options, courseId: 'algebra1', sessions: 4, now: NOW }).sessions.length > 0);
});

test('BC01b — and out of season too', () => {
  // The failure this caught in production: before the calendar's first day,
  // every skill classified as future and the Path was empty.
  const june = Date.parse('2026-06-01T12:00:00Z');
  const options = buildStudentPathOptions({ student: {}, assignments: [], courseId: 'algebra1', nowValue: june });
  assert.ok([...(options.recommended || []), ...(options.available || [])].length > 0);
});

// ---------------------------------------------------------------------------
// 3. Class ID isolation
// ---------------------------------------------------------------------------

test('BC03 — one class\'s settings never become another\'s', () => {
  const goals = normalizeWeeklyGoalsByClass({
    'class-a': { sessions: 3 },
    'class-b': { sessions: 6, honors: true },
  });
  assert.equal(storedWeeklyGoalForClassContext(goals, { classId: 'class-a' }).sessions, 3);
  assert.equal(storedWeeklyGoalForClassContext(goals, { classId: 'class-b' }).sessions, 6);
  assert.equal(storedWeeklyGoalForClassContext(goals, { classId: 'class-c' }), null,
    'an unconfigured class inherits nothing from a configured one');
});

// ---------------------------------------------------------------------------
// 6. Incomplete questions do not become mastery failures
// ---------------------------------------------------------------------------

test('BC06 — an unfinished question is missing evidence, not wrong evidence', () => {
  assert.equal(isClassifyingEvidence(evidence({ status: 'attempted', correct: false })), false);
  assert.equal(isClassifyingEvidence(evidence({ status: 'unattempted', correct: false })), false);
  // ...and a genuine miss still counts, or the profile only ever sees successes.
  assert.equal(isClassifyingEvidence(evidence({ status: 'incorrect', correct: false })), true);
});

// ---------------------------------------------------------------------------
// 7. Exhausted attempts generate correct evidence
// ---------------------------------------------------------------------------

test('BC07 — running out of attempts produces real evidence, not a hole', () => {
  // A student who used every attempt and did not get it has told us something
  // definite. Dropping that as "not finalized" would leave the profile blind to
  // exactly the questions a teacher most needs to know about.
  const exhausted = buildAttemptEvidenceEvent({
    studentId: 's1',
    assignment: { id: 'a1', title: 'Practice' },
    question: { questionId: 'q1', teks: ['A.5C'], standards: ['A.5C'], dok: 2, difficulty: { generatorBand: 3 } },
    questionIndex: 0,
    activityRole: 'practice',
    attemptRecord: { status: 'incorrect', totalAttempts: 3 },
    attemptResult: { isCorrect: false, partialCredit: 20 },
  });
  assert.equal(exhausted.performance.attemptNumber, 3);
  assert.equal(exhausted.performance.isCorrect, false);
  assert.ok(exhausted.performance.score < 1);
  assert.equal(isClassifyingEvidence(exhausted), true, 'and it classifies');
});

test('BC07b — a timed-out question is a real outcome', () => {
  assert.equal(isClassifyingEvidence(evidence({ status: 'expired', correct: false })), true);
});

// ---------------------------------------------------------------------------
// 8. Teacher force-correct does not create mastery
// ---------------------------------------------------------------------------

test('BC08 — a teacher marking something correct is not the student\'s mathematics', () => {
  assert.equal(isClassifyingEvidence(evidence({ extra: { teacherForced: true } })), false);
  assert.equal(isClassifyingEvidence({ ...evidence(), supportUsage: { modified: true } }), false);
});

// ---------------------------------------------------------------------------
// 9-10. Cooldown and retention intervals
// ---------------------------------------------------------------------------

test('BC09 — a standard mastered days ago is not offered again today', () => {
  const result = evaluateEligibility({ lifecycle: LIFECYCLE.MASTERED, lastPracticedAt: NOW - 2 * DAY, now: NOW });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'cooling_down');
});

test('BC10 — surviving retention checks lengthens the interval', () => {
  assert.ok(COOLDOWN_DAYS[LIFECYCLE.RETAINED] > COOLDOWN_DAYS[LIFECYCLE.MASTERED]);
  assert.ok(COOLDOWN_DAYS[LIFECYCLE.DEVELOPING] < COOLDOWN_DAYS[LIFECYCLE.MASTERED],
    'and something still being learned comes back quickly');
});

// ---------------------------------------------------------------------------
// 11. Domain / TEKS saturation prevents monotony
// ---------------------------------------------------------------------------

test('BC11 — a real week is not four versions of the same thing', () => {
  const options = buildStudentPathOptions({ student: {}, assignments: [], courseId: 'algebra1', nowValue: NOW });
  const plan = buildWeeklyPathPlan({ options, courseId: 'algebra1', sessions: 4, now: NOW });
  assert.equal(plan.diversity.skills, 4, 'no standard twice in one week');
  assert.ok(plan.diversity.strands >= 2, `only ${plan.diversity.strands} strand(s)`);
});

// ---------------------------------------------------------------------------
// 13-14. Foundation Bridge behaviour
// ---------------------------------------------------------------------------

test('BC13 — a below-level student still gets course-level work every week', () => {
  const slots = weeklyMixFor({ band: INSTRUCTIONAL_BAND.BELOW, sessions: 4 });
  assert.ok(slots.includes(PURPOSE.CURRENT_LEARNING), 'adapt the mix, never sever contact with the course');
});

test('BC14 — below-grade work never dominates a normal week', () => {
  const slots = weeklyMixFor({ band: INSTRUCTIONAL_BAND.BELOW, sessions: 4 });
  const bridges = slots.filter((slot) => slot === PURPOSE.FOUNDATION_BRIDGE).length;
  assert.ok(bridges <= 2, `${bridges} of 4 sessions were below-course`);
});

// ---------------------------------------------------------------------------
// 15. Assignment evidence changes recommendations
// ---------------------------------------------------------------------------

test('BC15 — work done in an assignment changes what the Path offers next', () => {
  // This is the requirement that the status-vocabulary bug silently broke:
  // assignment evidence is written with 'correct'/'incorrect', and the profile
  // accepted only the server's 'finalized', so a student's entire assignment
  // history changed nothing about their Path.
  const assignmentEvidence = [
    ...Array.from({ length: 6 }, () => evidence({ skill: 'A.5A', band: 4, dok: 2, status: 'correct', role: 'practice' })),
    ...Array.from({ length: 6 }, () => evidence({ skill: 'A.3A', band: 4, dok: 2, status: 'correct', role: 'dol' })),
    ...Array.from({ length: 4 }, () => evidence({ skill: 'A.9A', band: 4, dok: 3, status: 'correct', role: 'quiz' })),
  ];

  const withHistory = buildStudentLearningProfile({ evidenceEvents: assignmentEvidence });
  const withoutHistory = buildStudentLearningProfile({ evidenceEvents: [] });

  assert.equal(withHistory.baseline.established, true, 'assignment work establishes a baseline');
  assert.equal(withoutHistory.baseline.established, false);
  assert.equal(withHistory.difficultyProfile.stableBand, 4);

  const options = buildStudentPathOptions({ student: {}, assignments: [], courseId: 'algebra1', nowValue: NOW });
  const informed = buildWeeklyPathPlan({ options, courseId: 'algebra1', profile: withHistory, sessions: 4, now: NOW });
  const blind = buildWeeklyPathPlan({ options, courseId: 'algebra1', profile: withoutHistory, sessions: 4, now: NOW });

  assert.notDeepEqual(
    informed.sessions.map((s) => s.difficultyBand),
    blind.sessions.map((s) => s.difficultyBand),
    'a student with a term of assignment evidence must not get the same week as one with none',
  );
});

// ---------------------------------------------------------------------------
// 16-17. The two axes, and what a failure means
// ---------------------------------------------------------------------------

test('BC16 — DOK and difficulty move independently', () => {
  const plain = resolveTarget({ purpose: PURPOSE.CURRENT_LEARNING, profile: profileAt(3) });
  const reasoning = resolveTarget({
    purpose: PURPOSE.CURRENT_LEARNING,
    profile: profileAt(3, { dokProfile: { 3: { confident: true, accuracy: 0.8 } } }),
  });
  assert.equal(plain.difficultyBand, reasoning.difficultyBand);
  assert.ok(reasoning.dok > plain.dok);
});

test('BC17 — a miss at high difficulty retries the standard, it does not descend', () => {
  const target = resolveTarget({
    purpose: PURPOSE.CURRENT_LEARNING, profile: profileAt(3), recentFailureBand: 4,
  });
  assert.equal(target.difficultyBand, 3);
  assert.equal(target.reason, 'retry_same_standard_at_a_manageable_complexity');
});

// ---------------------------------------------------------------------------
// 18-19. Stability and baseline
// ---------------------------------------------------------------------------

test('BC18 — a classification does not oscillate on a single result', () => {
  const flip = stabilizeBand({
    previous: INSTRUCTIONAL_BAND.ON,
    candidate: INSTRUCTIONAL_BAND.BELOW,
    eventsSincePreviousChange: 1,
  });
  assert.equal(flip.band, INSTRUCTIONAL_BAND.ON, 'one bad day is not a reclassification');
  assert.equal(flip.changed, false);

  const sustained = stabilizeBand({
    previous: INSTRUCTIONAL_BAND.ON,
    candidate: INSTRUCTIONAL_BAND.BELOW,
    eventsSincePreviousChange: 12,
  });
  assert.equal(sustained.band, INSTRUCTIONAL_BAND.BELOW, 'a sustained pattern does move it');
});

test('BC19 — nothing is asserted about a student until there is enough to be right', () => {
  const thin = buildStudentLearningProfile({ evidenceEvents: Array.from({ length: 4 }, () => evidence()) });
  assert.equal(thin.baseline.established, false);
  assert.equal(thin.instructionalBand, INSTRUCTIONAL_BAND.BASELINE);
});

// ---------------------------------------------------------------------------
// 20-22. Honors and CCMR transfer
// ---------------------------------------------------------------------------

test('BC20 — a strong Honors student gets depth a regular week does not carry', () => {
  const honors = weeklyMixFor({ band: INSTRUCTIONAL_BAND.ON, honors: true, sessions: 5 });
  const regular = weeklyMixFor({ band: INSTRUCTIONAL_BAND.ON, honors: false, sessions: 4 });
  assert.ok(honors.includes(PURPOSE.TRANSFER) || honors.includes(PURPOSE.EXTENSION));
  assert.ok(!regular.includes(PURPOSE.EXTENSION));
});

test('BC21 — weak course mastery suppresses premature exam transfer', () => {
  // Transfer means "you know this in class, now try the exam's version". A
  // student who does not know it in class has nothing to transfer, and sending
  // them SAT items proves nothing.
  const struggling = buildStudentLearningProfile({
    evidenceEvents: [
      ...Array.from({ length: 6 }, () => evidence({ skill: 'A.5A', correct: false, role: 'practice' })),
      ...Array.from({ length: 6 }, () => evidence({ skill: 'A.3A', correct: false, role: 'dol' })),
      ...Array.from({ length: 4 }, () => evidence({ skill: 'A.9A', correct: false, role: 'quiz' })),
    ],
  });
  const options = buildStudentPathOptions({ student: {}, assignments: [], courseId: 'algebra1', nowValue: NOW });
  const plan = buildWeeklyPathPlan({ options, courseId: 'algebra1', profile: struggling, sessions: 4, now: NOW });
  assert.ok(!plan.sessions.some((session) => session.purpose === PURPOSE.TRANSFER),
    'a student failing the course is not failing to TRANSFER');
  assert.ok(!diagnoseGaps(struggling).some((gap) => gap.type === GAP.TRANSFER),
    'and no transfer gap is even diagnosed');
});

test('BC22 — a genuine transfer gap DOES produce exam-style work', () => {
  // The other half of BC21, which would otherwise pass for the trivial reason
  // that nothing ever produces transfer. A student who knows the course and
  // cannot do the exam's version of it has a real, nameable gap.
  const mastery = (code) => [code, {
    mastery: { status: 'Mastered', estimate: 92, confidence: 'High' },
    dimensions: { eligibleGradeLevelEvents: 8 },
  }];

  const transferGap = buildStudentLearningProfile({
    masteryProfilesByTeks: Object.fromEntries(['A.5A', 'A.3A', 'A.9A'].map(mastery)),
    evidenceEvents: [
      // Strong in class...
      ...Array.from({ length: 6 }, () => evidence({ skill: 'A.5A', correct: true, role: 'practice' })),
      ...Array.from({ length: 4 }, () => evidence({ skill: 'A.3A', correct: true, role: 'dol' })),
      // ...and weak on the exam's version of the same mathematics.
      ...Array.from({ length: 6 }, (_, i) => ({
        ...evidence({ skill: 'A.9A', correct: i === 0, role: 'quiz' }),
        source: { activityRole: 'quiz', assessmentFramework: 'digitalSAT', activitySessionId: `sat-${i}` },
      })),
    ],
  });

  assert.equal(transferGap.baseline.established, true);
  assert.ok(transferGap.courseMastery >= 0.7, `course mastery was ${transferGap.courseMastery}`);
  const gaps = diagnoseGaps(transferGap);
  assert.ok(gaps.some((gap) => gap.type === GAP.TRANSFER),
    `no transfer gap diagnosed; gaps were ${JSON.stringify(gaps.map((g) => g.type))}`);
});

// ---------------------------------------------------------------------------
// 23-25. Assignment adaptation
// ---------------------------------------------------------------------------

test('BC23 — adaptive Practice preserves the assigned standard', () => {
  const policy = resolveAdaptivePolicy({
    question: { teks: ['A.5C'], dok: 2, difficultyBand: 3, activityRole: 'practice', adaptivePolicy: { preserveStandard: false } },
    variationMode: 'adaptive',
    teacherPolicy: { preserveStandard: false },
  });
  assert.equal(policy.preserveStandard, true, 'neither author nor teacher can switch this off');
});

test('BC24 — DOL and test rigor stays comparable across students', () => {
  ['dol', 'quiz', 'test'].forEach((role) => {
    const strong = resolveAdaptedTarget({
      question: { dok: 2, difficultyBand: 3, activityRole: role }, variationMode: 'adaptive', profile: profileAt(4),
    });
    const weak = resolveAdaptedTarget({
      question: { dok: 2, difficultyBand: 3, activityRole: role }, variationMode: 'adaptive', profile: profileAt(1),
    });
    assert.equal(strong.difficultyBand, weak.difficultyBand, `${role} was levelled per student`);
    assert.equal(strong.dok, weak.dok);
  });
});

test('BC25 — a teacher can see why a student got the version they got', () => {
  const delivered = resolveAdaptedTarget({
    question: { dok: 2, difficultyBand: 3, activityRole: 'practice' },
    variationMode: 'adaptive',
    profile: profileAt(2),
  });
  const event = buildAttemptEvidenceEvent({
    studentId: 's1',
    assignment: { id: 'a1', title: 'Practice' },
    question: { questionId: 'q1', teks: ['A.5C'], standards: ['A.5C'], dok: 2, difficulty: { generatorBand: 3 } },
    questionIndex: 0,
    activityRole: 'practice',
    attemptRecord: { status: 'correct', totalAttempts: 1 },
    attemptResult: { isCorrect: true },
    delivered: { dok: delivered.dok, difficultyBand: delivered.difficultyBand, adapted: delivered.adapted, target: delivered },
  });
  assert.equal(event.questionSnapshot.assignedDifficultyBand, 3);
  assert.equal(event.questionSnapshot.difficultyBand, 2);
  assert.ok(event.adaptation?.reasonCode, 'and the reason is stored with the evidence, not recomputed later');
});

// ---------------------------------------------------------------------------
// 28. Weekly goal progress persists
// ---------------------------------------------------------------------------

test('BC28 — a week means the same thing all week', () => {
  // Progress persists because the week KEY is stable, not because anything is
  // cached. Monday morning and Friday evening resolve to one bucket.
  assert.equal(weekKeyFor(MONDAY), weekKeyFor(MONDAY + 4 * DAY + 13 * 60 * 60 * 1000));
  assert.notEqual(weekKeyFor(MONDAY), weekKeyFor(MONDAY + 7 * DAY));
});

test('BC28b — progress is recomputed from evidence, so it survives a reload', () => {
  const goal = buildWeeklyGoal({ plan: { sessions: [] }, now: MONDAY });
  const events = ['A.5A', 'A.3A'].map((code, index) => ({
    performance: { status: 'finalized', isCorrect: true },
    source: { activitySessionId: `sess-${index}` },
    alignmentKeys: [`texas:${code}`],
    recordedAt: MONDAY + DAY,
  }));

  // Two independent reads of the same stored evidence — a page reload, or the
  // teacher's screen and the student's.
  const first = evaluateWeeklyGoalProgress({
    goal, completions: deriveCompletionsFromEvidence({ evidenceEvents: events, weekKey: goal.weekKey }), now: MONDAY + DAY,
  });
  const second = evaluateWeeklyGoalProgress({
    goal, completions: deriveCompletionsFromEvidence({ evidenceEvents: events, weekKey: goal.weekKey }), now: MONDAY + 2 * DAY,
  });
  assert.equal(first.completed, 2);
  assert.equal(second.completed, 2, 'nothing was consumed by reading it');
});

test('BC28c — last week\'s progress does not carry into this week', () => {
  const goal = buildWeeklyGoal({ plan: { sessions: [] }, now: MONDAY + 7 * DAY });
  const lastWeek = [{
    performance: { status: 'finalized', isCorrect: true },
    source: { activitySessionId: 'old' },
    alignmentKeys: ['texas:A.5A'],
    recordedAt: MONDAY + DAY,
  }];
  const progress = evaluateWeeklyGoalProgress({
    goal,
    completions: deriveCompletionsFromEvidence({ evidenceEvents: lastWeek, weekKey: goal.weekKey }),
    now: MONDAY + 8 * DAY,
  });
  assert.equal(progress.completed, 0);
});

test('BC28d — a completed week cannot fail on grading', () => {
  const goal = buildWeeklyGoal({ plan: { sessions: [] }, now: MONDAY });
  const result = gradeWeeklyGoal({
    goal,
    completions: Array.from({ length: 4 }, () => ({ status: 'completed', completedAt: MONDAY + DAY, accuracy: 0 })),
    now: MONDAY + 2 * DAY,
  });
  assert.equal(result.passing, true);
});
