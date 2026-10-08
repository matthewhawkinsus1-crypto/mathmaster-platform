import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CANONICAL_SKILL_CODE,
  GROWTH_REWARDS_START_MS,
  GROWTH_RULE_IDS,
  MASTERY_SKILLS_PER_SYNC,
  SKIP_REASON,
  evaluateMasteryGrowth,
  evaluateWeeklyPathGrowth,
  growthAwardIdentity,
  payableMasteredSkills,
  serverDerivedMastered,
} from '../../functions/shared/growthRewardRules.mjs';

/*
 * The growth rewards must not be a mint for anyone who can write a record
 * they read.
 *
 *   MASTERY. studentMasteryProfiles used to be writable by every teacher in
 *   authorizedTeacherEmails — a list that keeps FORMER teachers — and every
 *   key labelled Mastered paid 5 points: 200 made-up keys were 1,000 Class
 *   Points and both count badges. firestore.rules now closes the document to
 *   every client (tests/rules/growthRewardSourcesRules.test.mjs); these tests
 *   pin the rules' own guard: only a skill as the evidence trigger derives it
 *   pays, and at most MASTERY_SKILLS_PER_SYNC per sync.
 *
 *   STREAK. A later read that is missing a week must never re-segment a run
 *   whose blocks are already paid into a new block.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const AFTER_START = GROWTH_REWARDS_START_MS + DAY;
const STUDENT = 's1';
const CLASS = 'c1';
const pointsOf = (awards) => awards.filter((award) => award.kind === 'classPoints');
const badgesOf = (awards) => awards.filter((award) => award.kind === 'badge');

/*
 * The per-key arithmetic of updateMyMathPathMasteryFromEvidence
 * (functions/index.js), applied to a list of evidence events — so the guard is
 * tested against what the trigger actually writes, not a hand-made shape.
 */
const applyEvidence = (code, events, updatedAt = AFTER_START) => {
  let previous = {};
  for (const { score = 1, isCorrect = true, independent = true, roleWeight = 1, dok = null } of events) {
    const accumulator = previous.accumulator || {};
    const weight = roleWeight;
    const creditedScore = independent ? score : score * 0.75;
    const effectiveWeight = Number(accumulator.effectiveWeight || 0) + weight;
    const weightedScoreSum = Number(accumulator.weightedScoreSum || 0) + creditedScore * weight;
    const eligibleEvents = Number(accumulator.eligibleEvents || 0) + (weight > 0 ? 1 : 0);
    const modifiedEvents = Number(accumulator.modifiedEvents || 0);
    const independentSuccesses = Number(accumulator.independentSuccesses || 0) + (isCorrect && independent && weight > 0 ? 1 : 0);
    const dokRepresented = [...new Set([...(previous.dimensions?.dokRepresented || []), ...(dok ? [dok] : [])])].sort();
    const estimate = effectiveWeight > 0 ? Math.round((weightedScoreSum / effectiveWeight) * 100) : null;
    let status = 'Not Enough Evidence';
    if (eligibleEvents >= 2 && effectiveWeight >= 1.1) {
      if (estimate >= 85 && eligibleEvents >= 4 && independentSuccesses >= 2 && dokRepresented.some((value) => Number(value) >= 3)) status = 'Mastered';
      else if (estimate >= 70) status = 'Secure';
      else if (estimate >= 50) status = 'Developing';
      else status = 'Needs Attention';
    }
    previous = {
      ...previous,
      teksCode: code,
      mastery: { estimate, observedPerformance: estimate, status, confidence: 'Medium' },
      dimensions: { eligibleGradeLevelEvents: eligibleEvents, modifiedEvidenceEvents: modifiedEvents, independentSuccesses, dokRepresented, familiesRepresented: [], lastIndependentSuccessAt: updatedAt },
      accumulator: { effectiveWeight, weightedScoreSum, eligibleEvents, modifiedEvents, independentSuccesses },
      updatedAt,
    };
  }
  return previous;
};
// Four correct, independent answers, one at DOK 3, at the weights a quiz and practice carry.
const MASTERED_EVENTS = [{ roleWeight: 1 }, { roleWeight: 1.35 }, { roleWeight: 1, dok: 3 }, { roleWeight: 1.25, dok: 2 }];
const realMastered = (code) => applyEvidence(code, MASTERED_EVENTS);
const codes = (count) => Array.from({ length: count }, (_, index) => `A.${(index % 99) + 1}${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(index / 99)]}`);
const profileOf = (entries, { classId = CLASS } = {}) => ({ studentId: STUDENT, classId, profiles: entries });

test('the trigger-derived Mastered entry pays; the trigger agrees it is Mastered', () => {
  const entry = realMastered('A.2C');
  assert.equal(entry.mastery.status, 'Mastered');
  assert.equal(serverDerivedMastered('A.2C', entry), true);
  // Supported successes never reach Mastered in the trigger, and never pay here either.
  const supported = applyEvidence('A.2C', MASTERED_EVENTS.map((event) => ({ ...event, independent: false })));
  assert.notEqual(supported.mastery.status, 'Mastered');
  assert.equal(serverDerivedMastered('A.2C', supported), false);
});

test('the guard mirrors the trigger thresholds it re-checks (functions/index.js)', () => {
  // If the trigger's Mastered thresholds move, serverDerivedMastered must move
  // with them, or real mastery stops paying (looser trigger) or forged
  // in-between shapes pay (stricter trigger). Bound to the trigger's own body.
  const source = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('exports.updateMyMathPathMasteryFromEvidence');
  assert.ok(start > 0, 'the mastery trigger exists');
  const body = source.slice(start, source.indexOf('\nexports.', start + 10));
  assert.match(
    body,
    /if \(estimate >= 85 && eligibleEvents >= 4 && independentSuccesses >= 2 && dokRepresented\.some\(\(value\) => Number\(value\) >= 3\)\) status = "Mastered";/,
  );
  assert.match(body, /if \(eligibleEvents >= 2 && effectiveWeight >= 1\.1\)/);
  assert.match(body, /const code = mathPath\.displayAlignmentKey\(alignmentKey\);/);
  assert.match(body, /teksCode: code,/);
});

test('200 bare "Mastered" labels — the insider forgery — pay nothing', () => {
  const forged = Object.fromEntries(codes(200).map((code) => [code, { teksCode: code, mastery: { status: 'Mastered' }, updatedAt: AFTER_START }]));
  const result = evaluateMasteryGrowth({ studentId: STUDENT, classId: CLASS, masteryProfile: profileOf(forged), baseline: { skills: [] } });
  assert.deepEqual(result.awards, []);
  assert.deepEqual(payableMasteredSkills(profileOf(forged)), []);
});

test('a Mastered entry pays only with a canonical key, its own teksCode, and evidence consistent with Mastered', () => {
  const good = realMastered('A.2C');
  const variants = {
    'non-canonical key': ['not a skill', { ...realMastered('not a skill') }],
    'lower-case key': ['a.2c', { ...realMastered('a.2c') }],
    'namespaced key': ['TEXAS:A.2C', { ...realMastered('TEXAS:A.2C') }],
    'teksCode names another skill': ['A.2C', { ...good, teksCode: 'A.3A' }],
    'no accumulator': ['A.2C', { ...good, accumulator: undefined }],
    'no dimensions': ['A.2C', { ...good, dimensions: undefined }],
    'dimensions disagree with accumulator': ['A.2C', { ...good, dimensions: { ...good.dimensions, eligibleGradeLevelEvents: 9 } }],
    'too few events': ['A.2C', { ...good, accumulator: { ...good.accumulator, eligibleEvents: 3 }, dimensions: { ...good.dimensions, eligibleGradeLevelEvents: 3 } }],
    'one independent success': ['A.2C', { ...good, accumulator: { ...good.accumulator, independentSuccesses: 1 }, dimensions: { ...good.dimensions, independentSuccesses: 1 } }],
    'more successes than events': ['A.2C', { ...good, accumulator: { ...good.accumulator, independentSuccesses: 5 }, dimensions: { ...good.dimensions, independentSuccesses: 5 } }],
    'no DOK 3': ['A.2C', { ...good, dimensions: { ...good.dimensions, dokRepresented: [1, 2] } }],
    'estimate the accumulator does not imply': ['A.2C', { ...good, accumulator: { ...good.accumulator, weightedScoreSum: good.accumulator.effectiveWeight * 0.5 } }],
    'estimate below 85': ['A.2C', applyEvidence('A.2C', [...MASTERED_EVENTS, { score: 0, isCorrect: false }])],
    'score sum above the weight': ['A.2C', { ...good, accumulator: { ...good.accumulator, weightedScoreSum: good.accumulator.effectiveWeight * 2 }, mastery: { ...good.mastery, estimate: 200 } }],
    'string counts': ['A.2C', { ...good, accumulator: { ...good.accumulator, eligibleEvents: '4' } }],
    'undated': ['A.2C', { ...good, updatedAt: undefined }],
    'not Mastered': ['A.2C', { ...good, mastery: { ...good.mastery, status: 'Secure' } }],
  };
  for (const [label, [code, entry]] of Object.entries(variants)) {
    assert.equal(serverDerivedMastered(code, entry), false, label);
    const result = evaluateMasteryGrowth({ studentId: STUDENT, classId: CLASS, masteryProfile: profileOf({ [code]: entry }), baseline: { skills: [] } });
    assert.deepEqual(pointsOf(result.awards), [], label);
  }
  for (const code of ['A.2C', 'A2.4F', '8.5D', 'A.10A', 'G.12A', 'A.1']) assert.match(code, CANONICAL_SKILL_CODE);
  const paid = evaluateMasteryGrowth({ studentId: STUDENT, classId: CLASS, masteryProfile: profileOf({ 'A.2C': good }), baseline: { skills: [] } });
  assert.deepEqual(pointsOf(paid.awards).map((award) => award.sourceId), ['A.2C']);
});

test(`at most ${MASTERY_SKILLS_PER_SYNC} skills pay per sync; the rest pay later under unchanged identities`, () => {
  const all = codes(12);
  const profile = profileOf(Object.fromEntries(all.map((code) => [code, realMastered(code)])));
  const base = { studentId: STUDENT, classId: CLASS, masteryProfile: profile, baseline: { skills: [] } };
  const paidSoFar = [];
  const rounds = [];
  for (let round = 0; round < 4; round += 1) {
    const result = evaluateMasteryGrowth({ ...base, paidSkills: [...paidSoFar] });
    const fresh = pointsOf(result.awards).map((award) => award.sourceId).filter((code) => !paidSoFar.includes(code));
    assert.ok(fresh.length <= MASTERY_SKILLS_PER_SYNC, `round ${round}: ${fresh.length}`);
    // Every award keeps the identity that names the student, the rule and the skill.
    pointsOf(result.awards).forEach((award) => {
      assert.equal(award.identity, growthAwardIdentity({ studentId: STUDENT, ruleId: GROWTH_RULE_IDS.MASTERY_SKILL, sourceId: award.sourceId }));
    });
    if (fresh.length < all.length - paidSoFar.length) {
      assert.ok(result.skipped.some((entry) => entry.reason === SKIP_REASON.SYNC_LIMIT), `round ${round} says why the rest wait`);
    }
    rounds.push(fresh);
    paidSoFar.push(...fresh);
  }
  assert.deepEqual(rounds.map((round) => round.length), [5, 5, 2, 0]);
  assert.deepEqual([...paidSoFar].sort(), [...all].sort(), 'every skill paid exactly once, in the end');

  // The count badges never run ahead of the skills paid.
  const first = evaluateMasteryGrowth({ ...base, paidSkills: [] });
  assert.deepEqual(badgesOf(first.awards).map((award) => award.badgeCode), ['mastery-5']);
  const second = evaluateMasteryGrowth({ ...base, paidSkills: rounds[0] });
  assert.deepEqual(badgesOf(second.awards).map((award) => award.badgeCode).sort(), ['mastery-10', 'mastery-5']);
});

test('even 200 trigger-shaped skills mint at most one sync\'s worth at once', () => {
  const profile = profileOf(Object.fromEntries(codes(200).map((code) => [code, realMastered(code)])));
  const result = evaluateMasteryGrowth({ studentId: STUDENT, classId: CLASS, masteryProfile: profile, baseline: { skills: [] } });
  assert.equal(pointsOf(result.awards).length, MASTERY_SKILLS_PER_SYNC);
  assert.ok(pointsOf(result.awards).reduce((sum, award) => sum + award.amount, 0) <= 25);
  assert.deepEqual(badgesOf(result.awards).map((award) => award.badgeCode), ['mastery-5']);
});

// --- Weekly Path streak: paid blocks are never re-segmented ------------------

const WEEK_ONE = '2026-10-05';
const weekStart = (weekKey) => Date.parse(`${weekKey}T00:00:00Z`);
const addWeeks = (weekKey, count) => new Date(weekStart(weekKey) + count * 7 * DAY).toISOString().slice(0, 10);
const goalFor = (weekKey) => ({
  weekKey,
  studentId: STUDENT,
  classId: CLASS,
  goalSessions: 1,
  assignmentState: 'assigned',
  dueAt: weekStart(weekKey) + 7 * DAY + 5 * HOUR,
  createdAt: weekStart(weekKey) + 2 * DAY,
  sessions: [{ slot: 1, weeklySlotKey: `${weekKey}|slot1` }],
});
const completionFor = (weekKey) => ({ status: 'completed', weekKey, weeklySlotKey: `${weekKey}|slot1`, completedAt: weekStart(weekKey) + 3 * DAY });
/** Every week has a goal; `completed` are the weeks whose completion this read saw. */
const streakEnds = (completed, paidStreakWeeks, goalWeeks = completed) => {
  const result = evaluateWeeklyPathGrowth({
    studentId: STUDENT,
    classId: CLASS,
    goals: goalWeeks.map(goalFor),
    completions: completed.map(completionFor),
    nowMs: weekStart(addWeeks(WEEK_ONE, 20)),
    windowStartWeekKey: WEEK_ONE,
    paidStreakWeeks,
  });
  return pointsOf(result.awards).filter((award) => award.ruleId === GROWTH_RULE_IDS.WEEKLY_PATH_STREAK).map((award) => award.sourceId);
};
const weeks = (...indexes) => indexes.map((index) => addWeeks(WEEK_ONE, index));

test('weeks 0-5 paid two blocks; a later read missing week 1 pays no third block', () => {
  const full = weeks(0, 1, 2, 3, 4, 5);
  const paid = streakEnds(full, []);
  assert.deepEqual(paid, weeks(2, 5), 'the first read pays blocks ending at weeks 2 and 5');

  // The reproduced defect: dropping week 1 used to pay a new block ending at week 4.
  const missingOne = streakEnds(weeks(0, 2, 3, 4, 5), paid, full);
  assert.deepEqual(missingOne.filter((week) => !paid.includes(week)), [], `no new block: ${missingOne}`);
  // Any one week missing, never a new block.
  for (const drop of [0, 1, 2, 3, 4, 5]) {
    const read = full.filter((_, index) => index !== drop);
    const ends = streakEnds(read, paid, full);
    assert.deepEqual(ends.filter((week) => !paid.includes(week)), [], `dropping week ${drop}: ${ends}`);
  }
});

test('a block paid from a partial read is honoured when the full history returns', () => {
  // Block 0-2 paid. A read missing week 4 then pays 5-7. With everything
  // back, weeks 3-4 are only two unclaimed weeks: no block ending at 5.
  const paid = weeks(2, 7);
  const ends = streakEnds(weeks(0, 1, 2, 3, 4, 5, 6, 7), paid);
  assert.deepEqual(ends, weeks(2, 7));
  // And the run carries on in blocks of three after the last paid one.
  assert.deepEqual(streakEnds(weeks(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10), paid), weeks(2, 7, 10));
});
