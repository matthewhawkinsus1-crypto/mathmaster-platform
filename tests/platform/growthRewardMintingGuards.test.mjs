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
  reachedMasteredEvidence,
  serverDerivedMastered,
} from '../../functions/shared/growthRewardRules.mjs';
import { weekKeyFor } from '../../functions/shared/weeklyPathGrade.mjs';

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
 *   pays, and at most MASTERY_SKILLS_PER_SYNC per sync. Mastery is paid from
 *   studentMasteryHistory (when), but the history is never enough on its
 *   own: the tests below hand the rules a history that says Mastered for
 *   every key — the worst case, as if it too had been forged — and the
 *   profile's evidence still decides.
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
/*
 * A studentMasteryHistory that calls every key Mastered ([estimate, 4]).
 * `observed`: a week before it shows them Secure, so the history saw each
 * move to Mastered (its time is known). Otherwise they are already Mastered in
 * the oldest week on record (time unknown).
 */
const historySaying = (keys, { observed = true, at = AFTER_START, classId = CLASS } = {}) => ({
  studentId: STUDENT,
  classId,
  weeks: {
    ...(observed ? { [weekKeyFor(at - 7 * DAY)]: { skills: Object.fromEntries(keys.map((key) => [key, [75, 3]])), updatedAt: at - 7 * DAY } } : {}),
    [weekKeyFor(at)]: { skills: Object.fromEntries(keys.map((key) => [key, [100, 4]])), updatedAt: at },
  },
});
const masteryOf = (entries, extra = {}) => evaluateMasteryGrowth({
  studentId: STUDENT, classId: CLASS, masteryProfile: profileOf(entries), masteryHistory: historySaying(Object.keys(entries)), baseline: { skills: [] }, ...extra,
});

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
  // The trigger classifies with the one Mastered rule (masteryRule.mjs), from
  // the same facts the guard re-checks; the guard reads that rule's numbers.
  // It scores through the shared scorer (masteryScoring.mjs), which builds
  // the rule's facts from the same accumulator fields the guard re-checks.
  assert.match(body, /const masteryScoring = await import\("\.\/shared\/masteryScoring\.mjs"\);/);
  assert.match(body, /masteryScoring\.applyMasteryEvent\(profiles\[code\], facts, code,/);
  const scorer = readFileSync(new URL('../../functions/shared/masteryScoring.mjs', import.meta.url), 'utf8');
  assert.match(scorer, /const ruleFacts = \{\s*estimate,\s*eligibleEvents: sums\.eligibleEvents,\s*effectiveWeight: sums\.effectiveWeight,\s*independentSuccesses: sums\.independentSuccesses,\s*dokRepresented,/);
  assert.match(scorer, /accumulator: sums,/);
  const rules = readFileSync(new URL('../../functions/shared/growthRewardRules.mjs', import.meta.url), 'utf8');
  for (const [constant, field] of [
    ['MASTERED_MIN_ESTIMATE', 'masteredEstimate'],
    ['MASTERED_MIN_ELIGIBLE_EVENTS', 'masteredEvents'],
    ['MASTERED_MIN_INDEPENDENT_SUCCESSES', 'masteredIndependentSuccesses'],
    ['MASTERED_MIN_EFFECTIVE_WEIGHT', 'minimumWeight'],
    ['MASTERED_MIN_DOK', 'masteredDok'],
  ]) assert.match(rules, new RegExp(`const ${constant} = MASTERY_RULE\\.${field};`), constant);
  assert.match(scorer, /codes: alignmentKeys\.map\(helpers\.displayAlignmentKey\),/);
  assert.match(scorer, /teksCode: code,/);
});

test('200 bare "Mastered" labels — the insider forgery — pay nothing', () => {
  const forged = Object.fromEntries(codes(200).map((code) => [code, { teksCode: code, mastery: { status: 'Mastered' }, updatedAt: AFTER_START }]));
  for (const observed of [true, false]) {
    const result = masteryOf(forged, { masteryHistory: historySaying(Object.keys(forged), { observed }) });
    assert.deepEqual(result.awards, [], `history ${observed ? 'saw the move' : 'starts Mastered'}`);
  }
  assert.deepEqual(payableMasteredSkills(profileOf(forged)), []);
});

test('a Mastered entry pays only with a canonical key, its own teksCode, and evidence consistent with Mastered', () => {
  const good = realMastered('A.2C');
  // Real evidence whose estimate fell below 85 after a wrong answer.
  const slippedEntry = applyEvidence('A.2C', [...MASTERED_EVENTS, { score: 0, isCorrect: false }]);
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
    'labelled Mastered below 85': ['A.2C', { ...slippedEntry, mastery: { ...slippedEntry.mastery, status: 'Mastered' } }],
    'score sum above the weight': ['A.2C', { ...good, accumulator: { ...good.accumulator, weightedScoreSum: good.accumulator.effectiveWeight * 2 }, mastery: { ...good.mastery, estimate: 200 } }],
    'string counts': ['A.2C', { ...good, accumulator: { ...good.accumulator, eligibleEvents: '4' } }],
    'undated': ['A.2C', { ...good, updatedAt: undefined }],
  };
  for (const [label, [code, entry]] of Object.entries(variants)) {
    assert.equal(serverDerivedMastered(code, entry), false, label);
    assert.equal(reachedMasteredEvidence(code, entry), false, label);
    for (const observed of [true, false]) {
      const result = masteryOf({ [code]: entry }, { masteryHistory: historySaying([code], { observed }) });
      assert.deepEqual(pointsOf(result.awards), [], `${label}, history ${observed ? 'saw the move' : 'starts Mastered'}`);
    }
  }
  for (const code of ['A.2C', 'A2.4F', '8.5D', 'A.10A', 'G.12A', 'A.1']) assert.match(code, CANONICAL_SKILL_CODE);
  const paid = masteryOf({ 'A.2C': good });
  assert.deepEqual(pointsOf(paid.awards).map((award) => award.sourceId), ['A.2C']);
});

test('a skill that slipped after mastering pays only when the history saw it reach Mastered', () => {
  // Real evidence after the slip: the counts that reached Mastered are still
  // there, only the estimate fell. And Mastered facts read as Secure.
  const slipped = {
    'estimate below 85': applyEvidence('A.2C', [...MASTERED_EVENTS, { score: 0, isCorrect: false }]),
    'not labelled Mastered': { ...realMastered('A.2C'), mastery: { ...realMastered('A.2C').mastery, status: 'Secure' } },
  };
  for (const [label, entry] of Object.entries(slipped)) {
    assert.notEqual(entry.mastery.status, 'Mastered', label);
    assert.equal(serverDerivedMastered('A.2C', entry), false, label);
    assert.equal(reachedMasteredEvidence('A.2C', entry), true, label);
    // The history saw the move: mastered, then slipped, pays that once.
    assert.deepEqual(pointsOf(masteryOf({ 'A.2C': entry }).awards).map((award) => award.sourceId), ['A.2C'], label);
    // Already Mastered when the history began (time unknown): only the rule
    // from before the switch, Mastered now, pays.
    const unknown = masteryOf({ 'A.2C': entry }, { masteryHistory: historySaying(['A.2C'], { observed: false }) });
    assert.deepEqual(pointsOf(unknown.awards), [], label);
  }
  // Never enough evidence for Mastered: not even an observed move pays.
  const neverMastered = applyEvidence('A.2C', MASTERED_EVENTS.slice(0, 3));
  assert.equal(reachedMasteredEvidence('A.2C', neverMastered), false);
  assert.deepEqual(pointsOf(masteryOf({ 'A.2C': neverMastered }).awards), []);
});

test(`at most ${MASTERY_SKILLS_PER_SYNC} skills pay per sync; the rest pay later under unchanged identities`, () => {
  const all = codes(12);
  const profile = profileOf(Object.fromEntries(all.map((code) => [code, realMastered(code)])));
  const base = { studentId: STUDENT, classId: CLASS, masteryProfile: profile, masteryHistory: historySaying(all), baseline: { skills: [] } };
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
  for (const observed of [true, false]) {
    const result = evaluateMasteryGrowth({
      studentId: STUDENT, classId: CLASS, masteryProfile: profile, masteryHistory: historySaying(codes(200), { observed }), baseline: { skills: [] },
    });
    assert.equal(pointsOf(result.awards).length, MASTERY_SKILLS_PER_SYNC);
    assert.ok(pointsOf(result.awards).reduce((sum, award) => sum + award.amount, 0) <= 25);
    assert.deepEqual(badgesOf(result.awards).map((award) => award.badgeCode), ['mastery-5']);
  }
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
