import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GROWTH_REWARDS_START_MS,
  GROWTH_REWARD_AMOUNTS,
  GROWTH_RULE_IDS,
  RETEST_IDENTITY_RULE_ID,
  SKIP_REASON,
  evaluateCorrectionsGrowth,
  evaluateGrowthRewards,
  evaluateMasteryGrowth,
  evaluateRetestGrowth,
  evaluateWeeklyPathGrowth,
  growthAwardIdentity,
  growthGrantId,
  growthLedgerTransactionId,
  masteryBaselineFor,
} from '../../functions/shared/growthRewardRules.mjs';
import { MAX_AWARD_AMOUNT, SOURCE_TYPES, applyTransaction, emptyAccount, isReversibleAward } from '../../functions/shared/classPoints.mjs';
import { BADGE_CATALOG, REWARD_SOURCE, badgeDisplay } from '../../functions/shared/rewardGrants.mjs';
import { buildMasteryHistoryDocument } from '../../functions/shared/masteryHistory.mjs';

/*
 * Growth, effort and mastery rewards: the pure rules. Delivery (exactly once,
 * roster re-check, the callable) is exercised against the emulator in
 * tests/integration/growthRewards.test.mjs.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const AFTER_START = GROWTH_REWARDS_START_MS + DAY;
const BEFORE_START = GROWTH_REWARDS_START_MS - DAY;
const STUDENT = 's1';
const CLASS = 'c1';

const testCyclePolicy = (extra = {}) => ({ mode: 'testCycle', passingScore: 70, ...extra });
const assignment = (extra = {}) => ({ assignedClassIds: [CLASS], assessmentPolicy: testCyclePolicy(), ...extra });
const cycleRecord = ({ original = 50, retest = null, releasedAt = AFTER_START, corrections = {}, ...extra } = {}) => ({
  assignmentId: 'a1',
  studentId: STUDENT,
  test: { state: 'released', rawScore: original, releasedAt: releasedAt - 10 * DAY },
  retest: retest === null ? { state: 'none' } : { state: 'released', rawScore: retest, releasedAt },
  corrections,
  ...extra,
});
const retestFor = (recordInput, assignmentInput = assignment()) => evaluateRetestGrowth({
  studentId: STUDENT, classId: CLASS, record: cycleRecord(recordInput), assignment: assignmentInput,
});
const pointsOf = (awards) => awards.filter((award) => award.kind === 'classPoints');
const badgesOf = (awards) => awards.filter((award) => award.kind === 'badge');

test('award identity and document ids are deterministic and scoped to student, rule and source', () => {
  const identity = growthAwardIdentity({ studentId: STUDENT, ruleId: 'weeklyPathGoal', sourceId: '2026-10-05' });
  assert.equal(identity, ['growth', STUDENT, 'weeklyPathGoal', '2026-10-05'].join('\u0000'));
  assert.match(growthLedgerTransactionId(identity), /^gra_[0-9a-f]{40}$/);
  assert.match(growthGrantId(identity), /^grg_[0-9a-f]{40}$/);
  assert.equal(growthLedgerTransactionId(identity), growthLedgerTransactionId(`${identity}`));
  const other = growthAwardIdentity({ studentId: 's2', ruleId: 'weeklyPathGoal', sourceId: '2026-10-05' });
  assert.notEqual(growthLedgerTransactionId(other), growthLedgerTransactionId(identity));
});

test('retest improvement needs at least 10 raw points over the original', () => {
  const ten = retestFor({ original: 40, retest: 50 });
  assert.equal(pointsOf(ten.awards).length, 1);
  assert.equal(pointsOf(ten.awards)[0].ruleId, GROWTH_RULE_IDS.RETEST_IMPROVED);
  assert.equal(pointsOf(ten.awards)[0].amount, GROWTH_REWARD_AMOUNTS.retestImproved);
  assert.equal(badgesOf(ten.awards)[0].badgeCode, 'growth-retest');

  assert.deepEqual(retestFor({ original: 40, retest: 49 }).awards, [], 'nine points is not growth');
  assert.deepEqual(retestFor({ original: 80, retest: 85 }).awards, []);
  assert.deepEqual(retestFor({ original: 40, retest: null }).awards, [], 'an unreleased retest pays nothing');
});

test('passing the retest after failing pays the passed reward instead of — never as well as — improvement', () => {
  const passed = retestFor({ original: 50, retest: 80 });
  const points = pointsOf(passed.awards);
  assert.equal(points.length, 1, 'one points award per test cycle');
  assert.equal(points[0].ruleId, GROWTH_RULE_IDS.RETEST_PASSED);
  assert.equal(points[0].amount, Math.min(GROWTH_REWARD_AMOUNTS.retestPassed, MAX_AWARD_AMOUNT));
  assert.equal(badgesOf(passed.awards).length, 1);

  // A two-point pass is still a pass.
  assert.equal(pointsOf(retestFor({ original: 68, retest: 70 }).awards)[0].ruleId, GROWTH_RULE_IDS.RETEST_PASSED);
  // Passing already: only improvement can pay.
  assert.equal(pointsOf(retestFor({ original: 72, retest: 90 }).awards)[0].ruleId, GROWTH_RULE_IDS.RETEST_IMPROVED);

  // The two variants share one identity, so a later sync that judges the same
  // cycle the other way (a teacher edits the passing score) lands on the same
  // documents and cannot pay twice.
  const improved = evaluateRetestGrowth({
    studentId: STUDENT, classId: CLASS, record: cycleRecord({ original: 50, retest: 80 }),
    assignment: assignment({ assessmentPolicy: testCyclePolicy({ passingScore: 90 }) }),
  });
  assert.equal(pointsOf(improved.awards)[0].ruleId, GROWTH_RULE_IDS.RETEST_IMPROVED);
  assert.equal(pointsOf(improved.awards)[0].id, points[0].id);
  assert.equal(pointsOf(improved.awards)[0].identityRuleId, RETEST_IDENTITY_RULE_ID);
});

test("the policy's passing score decides a pass", () => {
  const strict = assignment({ assessmentPolicy: testCyclePolicy({ passingScore: 80 }) });
  assert.equal(pointsOf(retestFor({ original: 75, retest: 80 }, strict).awards)[0].ruleId, GROWTH_RULE_IDS.RETEST_PASSED);
  assert.deepEqual(retestFor({ original: 75, retest: 79 }, strict).awards, []);
  assert.deepEqual(retestFor({ original: 40, retest: 80 }, assignment({ assessmentPolicy: null })).awards, [], 'not a Test Cycle');
});

test('external assessment: the entered original is compared with the MathMaster test, and a missing original is never zero', () => {
  const externalAssignment = assignment({ assessmentPolicy: testCyclePolicy({ externalAssessment: { source: 'District benchmark' } }) });
  const record = (originalScore) => ({
    assignmentId: 'a1',
    studentId: STUDENT,
    ...(originalScore === undefined ? {} : { externalAssessment: { originalScore, source: 'District benchmark' } }),
    test: { state: 'released', rawScore: 75, releasedAt: AFTER_START },
  });
  const passed = evaluateRetestGrowth({ studentId: STUDENT, classId: CLASS, record: record(45), assignment: externalAssignment });
  assert.equal(pointsOf(passed.awards)[0].ruleId, GROWTH_RULE_IDS.RETEST_PASSED);
  assert.equal(pointsOf(passed.awards)[0].eventAtMs, AFTER_START, 'the MathMaster test release is the event');

  const missing = evaluateRetestGrowth({ studentId: STUDENT, classId: CLASS, record: record(undefined), assignment: externalAssignment });
  assert.deepEqual(missing.awards, []);
  assert.equal(missing.skipped[0].reason, SKIP_REASON.EXTERNAL_ORIGINAL_MISSING);
});

test('corrections pay only when required, finished by the student, not waived and not empty', () => {
  const done = { required: true, complete: true, total: 3, completedTargets: 3, completedAt: AFTER_START };
  const run = (corrections, extra = {}) => evaluateCorrectionsGrowth({
    studentId: STUDENT, classId: CLASS, record: cycleRecord({ corrections, ...extra }), assignment: assignment(),
  });
  const paid = run(done);
  assert.equal(pointsOf(paid.awards)[0].amount, GROWTH_REWARD_AMOUNTS.correctionsCompleted);
  assert.equal(badgesOf(paid.awards)[0].badgeCode, 'growth-corrections');

  assert.deepEqual(run({ ...done, waived: true }).awards, [], 'waived on the corrections');
  assert.deepEqual(run(done, { teacherControls: { correctionsWaived: true } }).awards, [], 'waived by teacher control');
  assert.deepEqual(run({ ...done, total: 0, completedTargets: 0 }).awards, [], 'an empty plan is complete without work');
  assert.deepEqual(run({ ...done, required: false }).awards, [], 'not required');
  assert.deepEqual(run({ ...done, complete: false }).awards, [], 'not finished');
});

test('nothing that happened before the start date pays, and the skip says why', () => {
  const retest = retestFor({ original: 40, retest: 80, releasedAt: BEFORE_START });
  assert.deepEqual(retest.awards, []);
  assert.equal(retest.skipped[0].reason, SKIP_REASON.BEFORE_START);

  const corrections = evaluateCorrectionsGrowth({
    studentId: STUDENT, classId: CLASS, assignment: assignment(),
    record: cycleRecord({ corrections: { required: true, complete: true, total: 2, completedAt: BEFORE_START } }),
  });
  assert.deepEqual(corrections.awards, []);
  assert.equal(corrections.skipped[0].reason, SKIP_REASON.BEFORE_START);
});

test('a Test Cycle event pays only into the class of record', () => {
  const elsewhere = retestFor({ original: 40, retest: 80, classId: 'old-class' });
  assert.deepEqual(elsewhere.awards, []);
  assert.equal(elsewhere.skipped[0].reason, SKIP_REASON.DIFFERENT_CLASS);
  assert.equal(elsewhere.skipped[0].eventClassId, 'old-class');

  const ambiguous = retestFor({ original: 40, retest: 80 }, assignment({ assignedClassIds: ['x', 'y'] }));
  assert.equal(ambiguous.skipped[0].reason, SKIP_REASON.CLASS_UNKNOWN, 'never guessed into the current class');

  const shared = retestFor({ original: 40, retest: 80 }, assignment({ assignedClassIds: ['x', CLASS] }));
  assert.equal(pointsOf(shared.awards)[0].classId, CLASS);
});

// --- Weekly Path -----------------------------------------------------------

const WEEK_ONE = '2026-10-05'; // the week the start date falls in
const weekStart = (weekKey) => Date.parse(`${weekKey}T00:00:00Z`);
const addWeeks = (weekKey, count) => new Date(weekStart(weekKey) + count * 7 * DAY).toISOString().slice(0, 10);
const goalFor = (weekKey, { classId = CLASS, dueAt, createdAt, slots = 2 } = {}) => ({
  weekKey,
  studentId: STUDENT,
  classId,
  goalSessions: slots,
  assignmentState: 'assigned',
  dueAt: dueAt ?? weekStart(weekKey) + 7 * DAY + 5 * HOUR,
  createdAt: createdAt ?? weekStart(weekKey) + 2 * DAY,
  sessions: Array.from({ length: slots }, (_, index) => ({ slot: index + 1, weeklySlotKey: `${weekKey}|slot${index + 1}` })),
});
const completionsFor = (weekKey, { at = weekStart(weekKey) + 3 * DAY, slots = 2 } = {}) => Array.from({ length: slots }, (_, index) => ({
  status: 'completed',
  weekKey,
  weeklySlotKey: `${weekKey}|slot${index + 1}`,
  completedAt: at + index * HOUR,
}));
const weekly = (weekKeys, extra = {}) => evaluateWeeklyPathGrowth({
  studentId: STUDENT,
  classId: CLASS,
  goals: weekKeys.map((weekKey) => goalFor(weekKey)),
  completions: weekKeys.flatMap((weekKey) => completionsFor(weekKey)),
  nowMs: weekStart(addWeeks(WEEK_ONE, 20)),
  windowStartWeekKey: WEEK_ONE,
  ...extra,
});
const byRule = (awards, ruleId) => awards.filter((award) => award.ruleId === ruleId);

test('a weekly Path goal met on time pays once for that week', () => {
  const result = weekly([WEEK_ONE]);
  const goals = byRule(result.awards, GROWTH_RULE_IDS.WEEKLY_PATH_GOAL);
  assert.equal(goals.length, 1);
  assert.equal(goals[0].amount, GROWTH_REWARD_AMOUNTS.weeklyPathGoal);
  assert.equal(goals[0].sourceId, WEEK_ONE);
  assert.equal(goals[0].identity, growthAwardIdentity({ studentId: STUDENT, ruleId: GROWTH_RULE_IDS.WEEKLY_PATH_GOAL, sourceId: WEEK_ONE }));
});

test('a late week, a half-done week and a goal frozen after its week pay nothing', () => {
  const goal = goalFor(WEEK_ONE);
  const late = evaluateWeeklyPathGrowth({
    studentId: STUDENT, classId: CLASS, goals: [goal],
    completions: completionsFor(WEEK_ONE, { at: goal.dueAt + HOUR }),
    nowMs: goal.dueAt + 2 * DAY, windowStartWeekKey: WEEK_ONE,
  });
  assert.deepEqual(late.awards, [], 'finished after the due time');

  const half = evaluateWeeklyPathGrowth({
    studentId: STUDENT, classId: CLASS, goals: [goal], completions: completionsFor(WEEK_ONE).slice(0, 1),
    nowMs: goal.dueAt + DAY, windowStartWeekKey: WEEK_ONE,
  });
  assert.deepEqual(half.awards, []);

  // A due date proposed far in the future does not stretch the week.
  const stretched = goalFor(WEEK_ONE, { dueAt: weekStart(WEEK_ONE) + 30 * DAY });
  const afterWeek = evaluateWeeklyPathGrowth({
    studentId: STUDENT, classId: CLASS, goals: [stretched],
    completions: completionsFor(WEEK_ONE, { at: weekStart(WEEK_ONE) + 10 * DAY }),
    nowMs: weekStart(WEEK_ONE) + 31 * DAY, windowStartWeekKey: WEEK_ONE,
  });
  assert.deepEqual(afterWeek.awards, []);

  const backdated = evaluateWeeklyPathGrowth({
    studentId: STUDENT, classId: CLASS, goals: [goalFor(WEEK_ONE, { createdAt: weekStart(WEEK_ONE) + 9 * DAY })],
    completions: completionsFor(WEEK_ONE), nowMs: weekStart(WEEK_ONE) + 10 * DAY, windowStartWeekKey: WEEK_ONE,
  });
  assert.deepEqual(backdated.awards, []);
  assert.equal(backdated.skipped[0].reason, SKIP_REASON.GOAL_SET_AFTER_WEEK);
});

test('a week before the start date, or in another class, does not pay', () => {
  const earlier = '2026-09-28';
  const before = weekly([earlier], { windowStartWeekKey: earlier });
  assert.deepEqual(before.awards, []);
  assert.equal(before.skipped[0].reason, SKIP_REASON.BEFORE_START);

  const other = evaluateWeeklyPathGrowth({
    studentId: STUDENT, classId: CLASS, goals: [goalFor(WEEK_ONE, { classId: 'old-class' })],
    completions: completionsFor(WEEK_ONE), nowMs: weekStart(addWeeks(WEEK_ONE, 2)), windowStartWeekKey: WEEK_ONE,
  });
  assert.deepEqual(other.awards, []);
  assert.equal(other.skipped[0].reason, SKIP_REASON.DIFFERENT_CLASS);
});

test('three goal weeks in a row earn the streak once, named by the third week', () => {
  const three = [0, 1, 2].map((n) => addWeeks(WEEK_ONE, n));
  const streaks = byRule(weekly(three).awards, GROWTH_RULE_IDS.WEEKLY_PATH_STREAK);
  assert.equal(pointsOf(streaks).length, 1);
  assert.equal(pointsOf(streaks)[0].amount, GROWTH_REWARD_AMOUNTS.weeklyPathStreak);
  assert.equal(badgesOf(streaks)[0].badgeCode, 'growth-path-streak');
  assert.equal(streaks[0].sourceId, three[2]);

  const two = byRule(weekly(three.slice(0, 2)).awards, GROWTH_RULE_IDS.WEEKLY_PATH_STREAK);
  assert.deepEqual(two, []);

  // A fourth week does not re-pay the first three; a sixth earns the second block.
  const four = byRule(weekly([0, 1, 2, 3].map((n) => addWeeks(WEEK_ONE, n))).awards, GROWTH_RULE_IDS.WEEKLY_PATH_STREAK);
  assert.deepEqual(pointsOf(four).map((award) => award.sourceId), [three[2]]);
  const six = byRule(weekly([0, 1, 2, 3, 4, 5].map((n) => addWeeks(WEEK_ONE, n))).awards, GROWTH_RULE_IDS.WEEKLY_PATH_STREAK);
  assert.deepEqual(pointsOf(six).map((award) => award.sourceId), [addWeeks(WEEK_ONE, 2), addWeeks(WEEK_ONE, 5)]);

  // A missed week breaks the run.
  const gap = byRule(weekly([0, 1, 3, 4].map((n) => addWeeks(WEEK_ONE, n))).awards, GROWTH_RULE_IDS.WEEKLY_PATH_STREAK);
  assert.deepEqual(gap, []);
});

test('a run that starts at the edge of what was read is not counted from the wrong week', () => {
  const edge = addWeeks(WEEK_ONE, 4);
  const weeks = [0, 1, 2].map((n) => addWeeks(edge, n));
  const result = weekly(weeks, { windowStartWeekKey: edge });
  assert.deepEqual(byRule(result.awards, GROWTH_RULE_IDS.WEEKLY_PATH_STREAK), []);
  assert.ok(result.skipped.some((entry) => entry.reason === SKIP_REASON.RUN_START_UNKNOWN));
  assert.equal(byRule(result.awards, GROWTH_RULE_IDS.WEEKLY_PATH_GOAL).length, 3, 'each week still pays');
});

test('a run longer than the window keeps paying, aligned to the blocks already paid', () => {
  // The window has moved past the start date and the run began out of sight.
  // An earlier sync paid the block ending at edge+1, so blocks resume at edge+4.
  const edge = addWeeks(WEEK_ONE, 11);
  const weeks = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => addWeeks(edge, n));
  const result = weekly(weeks, { windowStartWeekKey: edge, paidStreakWeeks: [addWeeks(edge, 1)] });
  assert.deepEqual(
    pointsOf(byRule(result.awards, GROWTH_RULE_IDS.WEEKLY_PATH_STREAK)).map((award) => award.sourceId),
    [addWeeks(edge, 1), addWeeks(edge, 4), addWeeks(edge, 7)],
  );
  assert.ok(!result.skipped.some((entry) => entry.reason === SKIP_REASON.RUN_START_UNKNOWN));

  // A paid block outside this run is no anchor for it.
  const unrelated = weekly(weeks, { windowStartWeekKey: edge, paidStreakWeeks: [addWeeks(edge, -3)] });
  assert.deepEqual(byRule(unrelated.awards, GROWTH_RULE_IDS.WEEKLY_PATH_STREAK), []);
  assert.ok(unrelated.skipped.some((entry) => entry.reason === SKIP_REASON.RUN_START_UNKNOWN));
});

// --- Mastery ---------------------------------------------------------------

/*
 * One profile entry exactly as updateMyMathPathMasteryFromEvidence
 * (functions/index.js) writes it after `events` eligible events, all correct
 * and independent at weight 1, one of them DOK 3. Mastery pays only for this
 * shape (serverDerivedMastered); a bare `{ mastery: { status } }` label does
 * not.
 */
const serverEntry = (code, status, updatedAt, { events = 4 } = {}) => {
  if (status !== 'Mastered') return { teksCode: code, mastery: { status }, updatedAt };
  return {
    teksCode: code,
    mastery: { estimate: 100, observedPerformance: 100, status, confidence: 'Medium' },
    dimensions: {
      eligibleGradeLevelEvents: events, modifiedEvidenceEvents: 0, independentSuccesses: events,
      dokRepresented: [2, 3], familiesRepresented: [], lastIndependentSuccessAt: updatedAt,
    },
    accumulator: { effectiveWeight: events, weightedScoreSum: events, eligibleEvents: events, modifiedEvents: 0, independentSuccesses: events },
    updatedAt,
  };
};
const profileDoc = (statuses, { classId = CLASS, updatedAt = AFTER_START } = {}) => ({
  studentId: STUDENT,
  classId,
  profiles: Object.fromEntries(Object.entries(statuses).map(([code, status]) => [code, serverEntry(code, status, updatedAt)])),
});
const codes = (count, prefix = 'A.') => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
const mastered = (list) => Object.fromEntries(list.map((code) => [code, 'Mastered']));
/*
 * The studentMasteryHistory the trigger would hold for `profile`, built by the
 * writer it uses (masteryHistory.mjs buildMasteryHistoryDocument): a week of
 * `before` profiles, then the week of `at` with the profile's. Mastery is
 * paid from this history (when), checked against the profile (the evidence).
 */
const historyFor = (profile, { before = {}, at = AFTER_START } = {}) => {
  const authorization = { classId: profile.classId };
  const earlier = buildMasteryHistoryDocument({ profiles: before, studentId: STUDENT, authorization, now: at - 7 * DAY });
  return buildMasteryHistoryDocument({ existing: earlier, profiles: profile.profiles, studentId: STUDENT, authorization, now: at });
};
const masteryFor = (profile, extra = {}) => evaluateMasteryGrowth({
  studentId: STUDENT, classId: CLASS, masteryProfile: profile, masteryHistory: historyFor(profile), ...extra,
});
// A baseline frozen just after the start date, before the profile's mastery.
const BASELINE_AT = GROWTH_REWARDS_START_MS + HOUR;

test('mastery pays once per newly Mastered skill, never for the baseline', () => {
  assert.deepEqual(masteryFor(profileDoc({ 'A.1': 'Mastered' }), { baseline: null }).awards, [],
    'no baseline yet: the first sync only sets it');

  const baseline = masteryBaselineFor(profileDoc({ 'A.1': 'Mastered', 'A.2': 'Secure' }), BASELINE_AT);
  assert.deepEqual(baseline.skills, ['A.1']);
  const now = profileDoc({ 'A.1': 'Mastered', 'A.2': 'Mastered', 'A.3': 'Developing' });
  const result = masteryFor(now, { baseline });
  assert.deepEqual(pointsOf(result.awards).map((award) => [award.sourceId, award.amount]), [['A.2', GROWTH_REWARD_AMOUNTS.masterySkill]]);
  assert.equal(pointsOf(result.awards)[0].identity, growthAwardIdentity({ studentId: STUDENT, ruleId: GROWTH_RULE_IDS.MASTERY_SKILL, sourceId: 'A.2' }));

  const again = masteryFor(now, { baseline });
  assert.deepEqual(again.awards.map((award) => award.id), result.awards.map((award) => award.id), 'the same skill is the same award');
});

test('5 and 10 mastered skills earn badges only when the count is crossed after the baseline', () => {
  const crossFive = masteryFor(profileDoc(mastered(codes(5))), { baseline: { skills: codes(4) } });
  assert.deepEqual(badgesOf(crossFive.awards).map((award) => award.badgeCode), ['mastery-5']);

  const alreadyFive = masteryFor(profileDoc(mastered(codes(6))), { baseline: { skills: codes(5) } });
  assert.deepEqual(badgesOf(alreadyFive.awards), []);

  // Ten at once: five pay now (MASTERY_SKILLS_PER_SYNC), so only the 5 badge;
  // once those five are paid the next five pay and the 10 badge follows.
  const firstFive = masteryFor(profileDoc(mastered(codes(10))), { baseline: { skills: [] } });
  assert.deepEqual(badgesOf(firstFive.awards).map((award) => award.badgeCode), ['mastery-5']);
  const both = masteryFor(profileDoc(mastered(codes(10))), {
    baseline: { skills: [] },
    paidSkills: pointsOf(firstFive.awards).map((award) => award.sourceId),
  });
  assert.deepEqual(badgesOf(both.awards).map((award) => award.badgeCode).sort(), ['mastery-10', 'mastery-5']);
});

test('mastery from another class or before the start does not pay', () => {
  const other = masteryFor(profileDoc({ 'A.1': 'Mastered' }, { classId: 'old-class' }), { baseline: { skills: [] } });
  assert.deepEqual(other.awards, []);
  assert.equal(other.skipped[0].reason, SKIP_REASON.DIFFERENT_CLASS);

  // A history whose last evidence named no class is not guessed into the
  // current one, and the skill is not settled: it pays once a later change
  // names the class of record.
  const baseline = { skills: [] };
  const unknown = masteryFor(profileDoc({ 'A.1': 'Mastered' }, { classId: null }), { baseline });
  assert.deepEqual(unknown.awards, []);
  assert.equal(unknown.skipped[0].reason, SKIP_REASON.CLASS_UNKNOWN);
  const labelled = masteryFor(profileDoc({ 'A.1': 'Mastered' }), { baseline });
  assert.deepEqual(pointsOf(labelled.awards).map((award) => award.sourceId), ['A.1']);

  // Mastered (by the history) before the start date.
  const early = profileDoc({ 'A.1': 'Mastered' }, { updatedAt: BEFORE_START });
  const old = evaluateMasteryGrowth({
    studentId: STUDENT, classId: CLASS, masteryProfile: early, masteryHistory: historyFor(early, { at: BEFORE_START }), baseline: { skills: [] },
  });
  assert.deepEqual(pointsOf(old.awards), []);
  assert.equal(old.skipped[0].reason, SKIP_REASON.BEFORE_START);
});

// --- All rules ---------------------------------------------------------------

const everything = () => ({
  studentId: STUDENT,
  classId: CLASS,
  testCycles: [{
    record: cycleRecord({ original: 40, retest: 90, corrections: { required: true, complete: true, total: 4, completedAt: AFTER_START } }),
    assignment: assignment(),
  }],
  goals: [0, 1, 2].map((n) => goalFor(addWeeks(WEEK_ONE, n))),
  completions: [0, 1, 2].flatMap((n) => completionsFor(addWeeks(WEEK_ONE, n))),
  windowStartWeekKey: WEEK_ONE,
  masteryProfile: profileDoc(mastered(codes(5))),
  masteryHistory: historyFor(profileDoc(mastered(codes(5)))),
  masteryBaseline: { skills: [] },
  nowMs: weekStart(addWeeks(WEEK_ONE, 4)),
});

test('every award respects MAX_AWARD_AMOUNT, carries the class of record, and the result is deterministic', () => {
  const first = evaluateGrowthRewards(everything());
  const second = evaluateGrowthRewards(everything());
  assert.deepEqual(first, second);
  assert.ok(first.awards.length > 10);
  first.awards.forEach((award) => {
    assert.equal(award.classId, CLASS);
    assert.equal(award.studentId, STUDENT);
    if (award.kind === 'classPoints') {
      assert.ok(Number.isInteger(award.amount) && award.amount > 0 && award.amount <= MAX_AWARD_AMOUNT, `${award.ruleId} ${award.amount}`);
    }
  });
  assert.equal(new Set(first.awards.map((award) => award.id)).size, first.awards.length, 'no document id twice');
  assert.deepEqual(evaluateGrowthRewards({ ...everything(), classId: '' }), { awards: [], skipped: [] });
});

test('the ledger treats a growth award as earnings that a teacher reversal cannot touch', () => {
  const account = applyTransaction(emptyAccount({ studentId: STUDENT, classId: CLASS }), { amount: 15, sourceType: SOURCE_TYPES.GROWTH_REWARD });
  assert.equal(account.balance, 15);
  assert.equal(account.lifetimeEarned, 15);
  assert.equal(account.lifetimeSpent, 0);
  assert.equal(isReversibleAward({ sourceType: SOURCE_TYPES.GROWTH_REWARD, isReversal: false, amount: 15 }), false);
  assert.equal(REWARD_SOURCE.GROWTH, 'growth');
});

test('every growth badge has wallet copy; unknown and old badge codes keep their own label', () => {
  for (const badgeCode of ['growth-retest', 'growth-corrections', 'growth-path-streak', 'mastery-5', 'mastery-10']) {
    const entry = BADGE_CATALOG[badgeCode];
    assert.ok(entry?.label && entry.icon && entry.studentDescription, badgeCode);
    assert.equal(badgeDisplay({ badgeCode }).label, entry.label);
  }
  assert.equal(badgeDisplay({ badgeCode: 'champion', label: 'Live Challenge Champion' }).label, 'Live Challenge Champion');
  assert.equal(badgeDisplay({}).label, 'Badge');
});
