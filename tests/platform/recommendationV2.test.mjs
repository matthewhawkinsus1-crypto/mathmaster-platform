// Recommendation Engine V2 — the reasons, not just the ranking.
//
// V1 could tell you WHICH standard scored highest. It could not tell you why,
// could not decline to repeat yesterday's work, and could not ask for "the same
// standard, easier". These tests are the named regressions from section BC of
// the brief that belong to this module, plus the two rules most likely to be
// broken by a well-meaning later edit: difficulty descends before prerequisites
// do, and below-course work never takes over a normal week.

import test from 'node:test';
import assert from 'node:assert/strict';

import { INSTRUCTIONAL_BAND } from '../../src/platform/profile/studentLearningProfile.js';
import {
  COOLDOWN_DAYS, LIFECYCLE, PURPOSE, STUDENT_EXPLANATION,
  buildWeeklyRecommendations, evaluateEligibility, foundationBridgeCap,
  optimizeWeeklySet, resolveLifecycle, resolvePurpose, resolveTarget,
  scoreCandidate, weeklyMixFor,
} from '../../src/platform/path/recommendationV2.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000; // fixed clock — the module takes it injected

const mastery = (status, estimate = 70, eligibleGradeLevelEvents = 6) => ({
  mastery: { status, estimate },
  dimensions: { eligibleGradeLevelEvents },
});

const profileAt = (stableBand, overrides = {}) => ({
  baseline: { established: true },
  instructionalBand: INSTRUCTIONAL_BAND.ON,
  difficultyProfile: { stableBand },
  dokProfile: {},
  ccmrTransfer: {},
  foundationGapDepth: 0,
  ...overrides,
});

const row = (skillId, extra = {}) => ({
  skillId,
  teksCode: skillId,
  score: 0.6,
  strand: 'equations',
  representation: 'symbolic',
  ...extra,
});

// --- Lifecycle -----------------------------------------------------------------

test('a standard with no evidence at all is not yet introduced', () => {
  assert.equal(resolveLifecycle({}), LIFECYCLE.NOT_INTRODUCED);
  assert.equal(
    resolveLifecycle({ masteryEntry: mastery('Not Enough Evidence', 0, 0) }),
    LIFECYCLE.NOT_INTRODUCED,
  );
});

test('evidence without enough of it is current learning, not a gap', () => {
  // A student mid-unit has evidence but no verdict. Calling that "Needs
  // Attention" would push them into remediation for the crime of being partway
  // through the lesson.
  assert.equal(
    resolveLifecycle({ masteryEntry: mastery('Not Enough Evidence', 0, 4) }),
    LIFECYCLE.CURRENT,
  );
});

test('a due retention check outranks the mastery verdict', () => {
  const entry = { masteryEntry: mastery('Mastered', 95), retentionEntry: { status: 'due' } };
  assert.equal(resolveLifecycle(entry), LIFECYCLE.RETENTION_DUE,
    'the whole point of retention is that mastery alone stops being sufficient');
});

test('two successful retention checks move a standard to retained', () => {
  assert.equal(
    resolveLifecycle({
      masteryEntry: mastery('Mastered', 95),
      retentionEntry: { status: 'scheduled', successfulCheckCount: 2 },
    }),
    LIFECYCLE.RETAINED,
  );
});

// --- BC: cooldown suppresses recently mastered TEKS -----------------------------

test('cooldown suppresses a recently mastered standard', () => {
  const result = evaluateEligibility({
    lifecycle: LIFECYCLE.MASTERED,
    lastPracticedAt: NOW - 3 * DAY,
    now: NOW,
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'cooling_down');
  assert.equal(result.daysRemaining, COOLDOWN_DAYS[LIFECYCLE.MASTERED] - 3);
});

test('a developing standard comes back within days, not weeks', () => {
  // The suppression must not become its own trap: something the student is
  // actively getting wrong has to recur quickly.
  const stillCooling = evaluateEligibility({
    lifecycle: LIFECYCLE.DEVELOPING, lastPracticedAt: NOW - 0.5 * DAY, now: NOW,
  });
  const backAgain = evaluateEligibility({
    lifecycle: LIFECYCLE.DEVELOPING, lastPracticedAt: NOW - 3 * DAY, now: NOW,
  });
  assert.equal(stillCooling.eligible, false);
  assert.equal(backAgain.eligible, true);
  assert.ok(COOLDOWN_DAYS[LIFECYCLE.DEVELOPING] < COOLDOWN_DAYS[LIFECYCLE.MASTERED]);
});

// --- BC: successful retention expands the recurrence interval -------------------

test('successful retention expands the recurrence interval', () => {
  assert.ok(
    COOLDOWN_DAYS[LIFECYCLE.RETAINED] > COOLDOWN_DAYS[LIFECYCLE.MASTERED],
    'a standard that has survived two checks should rest longer than one that just got mastered',
  );
  const retained = evaluateEligibility({
    lifecycle: LIFECYCLE.RETAINED, lastPracticedAt: NOW - 20 * DAY, now: NOW,
  });
  const mastered = evaluateEligibility({
    lifecycle: LIFECYCLE.MASTERED, lastPracticedAt: NOW - 20 * DAY, now: NOW,
  });
  assert.equal(retained.eligible, false, 'still resting at 20 days');
  assert.equal(mastered.eligible, true, 'due again at 20 days');
});

test('a due retention check is never suppressed by a cooldown', () => {
  const result = evaluateEligibility({
    lifecycle: LIFECYCLE.RETENTION_DUE, lastPracticedAt: NOW - 1000, now: NOW,
  });
  assert.equal(result.eligible, true);
});

test('a teacher pin outranks every cooldown the engine has', () => {
  const result = evaluateEligibility({
    lifecycle: LIFECYCLE.RETAINED, lastPracticedAt: NOW - 1000, now: NOW, teacherPinned: true,
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, 'teacher_pinned');
});

// --- BC: failure at high difficulty does not trigger prerequisite descent -------

test('a miss above the stable band retries the SAME standard lower', () => {
  // The single most consequential rule in this module. A wrong answer to a
  // Band 4 question is evidence about Band 4 — not about grade 6.
  const target = resolveTarget({
    purpose: PURPOSE.CURRENT_LEARNING,
    profile: profileAt(3),
    recentFailureBand: 4,
  });
  assert.equal(target.difficultyBand, 3, 'drop the complexity, keep the standard');
  assert.equal(target.reason, 'retry_same_standard_at_a_manageable_complexity');
  assert.equal(target.dok, 2, 'hold the cognitive demand steady so the axes stay distinguishable');
});

test('a miss at or below the stable band is not treated as a complexity signal', () => {
  const target = resolveTarget({
    purpose: PURPOSE.CURRENT_LEARNING, profile: profileAt(3), recentFailureBand: 2,
  });
  assert.notEqual(target.reason, 'retry_same_standard_at_a_manageable_complexity',
    'missing an easy question is a different problem and needs a different response');
});

// --- BC: DOK and difficulty adapt independently ---------------------------------

test('DOK and difficulty move on separate axes', () => {
  // Same purpose, same stable band. Only the reasoning evidence differs, and
  // only DOK should respond to it.
  const withoutReasoning = resolveTarget({ purpose: PURPOSE.CURRENT_LEARNING, profile: profileAt(3) });
  const withReasoning = resolveTarget({
    purpose: PURPOSE.CURRENT_LEARNING,
    profile: profileAt(3, { dokProfile: { 3: { confident: true, accuracy: 0.8 } } }),
  });
  assert.equal(withoutReasoning.difficultyBand, withReasoning.difficultyBand,
    'reasoning evidence must not silently raise structural complexity');
  assert.ok(withReasoning.dok > withoutReasoning.dok,
    'it should raise cognitive demand');
});

test('extension raises demand before it raises complexity', () => {
  const target = resolveTarget({ purpose: PURPOSE.EXTENSION, profile: profileAt(3) });
  assert.equal(target.dok, 3);
  assert.equal(target.difficultyBand, 4, 'one band, not a leap');
});

test('extension respects what the content actually authors', () => {
  // Asking for DOK 3 where no DOK 3 exists produces an empty session, which the
  // student experiences as a broken Path.
  const target = resolveTarget({ purpose: PURPOSE.EXTENSION, profile: profileAt(3), authoredMaxDok: 2 });
  assert.equal(target.dok, 2);
});

// --- BC: Foundation Bridge returns to course-level work -------------------------

test('a bridge is built to be crossable', () => {
  const target = resolveTarget({ purpose: PURPOSE.FOUNDATION_BRIDGE, profile: profileAt(5) });
  assert.ok(target.difficultyBand <= 3,
    'the bridge is not the place to also raise difficulty');
  assert.equal(target.reason, 'bridge_should_be_accessible');
});

test('the student is told the bridge is temporary', () => {
  assert.match(STUDENT_EXPLANATION[PURPOSE.FOUNDATION_BRIDGE], /go back/,
    'below-grade work must be framed as a route forward, not a demotion');
});

// --- BC: below-grade work does not dominate a normal weekly Path ----------------

test('at most half a normal week may be below-course work', () => {
  assert.equal(foundationBridgeCap(4), 2);
  assert.equal(foundationBridgeCap(5), 2);
  assert.equal(foundationBridgeCap(4, true), 4, 'unless the teacher chose intervention mode');
});

test('a below-level student still gets course-level work every week', () => {
  const slots = weeklyMixFor({ band: INSTRUCTIONAL_BAND.BELOW, sessions: 4 });
  assert.ok(slots.includes(PURPOSE.CURRENT_LEARNING),
    'adapt the mix, never sever contact with the course');
  assert.ok(slots.filter((slot) => slot === PURPOSE.FOUNDATION_BRIDGE).length <= foundationBridgeCap(4));
});

test('the bridge cap holds even when bridges outscore everything else', () => {
  const candidates = Array.from({ length: 6 }, (_, i) => ({
    skillId: `pre-${i}`,
    purpose: PURPOSE.FOUNDATION_BRIDGE,
    score: 1.4,
    strand: `s${i}`,
    representation: 'symbolic',
    eligibility: { eligible: true },
  })).concat([
    {
      skillId: 'A.5A', purpose: PURPOSE.CURRENT_LEARNING, score: 0.2,
      strand: 'equations', representation: 'symbolic', eligibility: { eligible: true },
    },
  ]);
  const week = optimizeWeeklySet({ candidates, sessions: 4, band: INSTRUCTIONAL_BAND.BELOW });
  assert.ok(week.bridgeCount <= week.bridgeCap, `bridges ${week.bridgeCount} exceeded cap ${week.bridgeCap}`);
  assert.ok(week.sessions.some((s) => s.purpose === PURPOSE.CURRENT_LEARNING),
    'the lower-scoring course-level work still has to appear');
});

// --- BC: domain/TEKS saturation prevents monotony -------------------------------

test('a week is not four ways of doing the same thing', () => {
  // Every candidate scores identically; only the strand differs. Without the
  // set optimiser this returns four equation standards.
  const candidates = [
    { skillId: 'A.5A', strand: 'equations', representation: 'symbolic' },
    { skillId: 'A.5B', strand: 'equations', representation: 'symbolic' },
    { skillId: 'A.5C', strand: 'equations', representation: 'symbolic' },
    { skillId: 'A.3A', strand: 'linear', representation: 'graph' },
    { skillId: 'A.9A', strand: 'exponential', representation: 'table' },
  ].map((entry) => ({
    ...entry, score: 0.8, purpose: PURPOSE.CURRENT_LEARNING, eligibility: { eligible: true },
  }));

  const week = optimizeWeeklySet({ candidates, sessions: 4 });
  assert.equal(week.sessions.length, 4);
  assert.ok(week.diversity.strands >= 3, `only ${week.diversity.strands} strands in the week`);
  assert.equal(week.diversity.skills, 4, 'no standard should be scheduled twice in one week');
});

test('saturation is a penalty, not a ban', () => {
  // If a strand is genuinely all that is available, the week still fills.
  const candidates = ['A.5A', 'A.5B', 'A.5C', 'A.5D'].map((skillId) => ({
    skillId, strand: 'equations', representation: 'symbolic', score: 0.8,
    purpose: PURPOSE.CURRENT_LEARNING, eligibility: { eligible: true },
  }));
  const week = optimizeWeeklySet({ candidates, sessions: 4 });
  assert.equal(week.sessions.length, 4, 'a monotonous week beats an empty one');
});

test('an ineligible candidate never reaches the week', () => {
  const candidates = [
    {
      skillId: 'A.5A', strand: 'equations', score: 1.4, purpose: PURPOSE.CURRENT_LEARNING,
      eligibility: { eligible: false, reason: 'cooling_down' },
    },
    {
      skillId: 'A.3A', strand: 'linear', score: 0.1, purpose: PURPOSE.CURRENT_LEARNING,
      eligibility: { eligible: true },
    },
  ];
  const week = optimizeWeeklySet({ candidates, sessions: 2 });
  assert.ok(!week.sessions.some((s) => s.skillId === 'A.5A'));
});

// --- BC: Honors strong students receive deeper work -----------------------------

test('an Honors week carries transfer and extension a regular week does not', () => {
  const honors = weeklyMixFor({ band: INSTRUCTIONAL_BAND.ON, honors: true, sessions: 5 });
  const regular = weeklyMixFor({ band: INSTRUCTIONAL_BAND.ON, honors: false, sessions: 4 });
  assert.equal(honors.length, 5);
  assert.equal(honors.filter((purpose) => purpose === PURPOSE.CURRENT_LEARNING).length, 2);
  assert.ok(honors.includes(PURPOSE.RETENTION));
  assert.ok(honors.includes(PURPOSE.TRANSFER));
  assert.ok(honors.includes(PURPOSE.EXTENSION));
  assert.ok(!regular.includes(PURPOSE.EXTENSION),
    'an on-level regular student gets review, not challenge, in the fourth slot');
});

test('a four-session Honors week preserves both course Challenge and CCMR transfer', () => {
  const slots = weeklyMixFor({ band: INSTRUCTIONAL_BAND.ON, honors: true, sessions: 4 });
  assert.deepEqual(slots, [
    PURPOSE.CURRENT_LEARNING,
    PURPOSE.RETENTION,
    PURPOSE.EXTENSION,
    PURPOSE.TRANSFER,
  ]);
});

test('a compressed three-session Honors week keeps Challenge instead of becoming ordinary-only', () => {
  const slots = weeklyMixFor({ band: INSTRUCTIONAL_BAND.ON, honors: true, sessions: 3 });
  assert.deepEqual(slots, [
    PURPOSE.CURRENT_LEARNING,
    PURPOSE.RETENTION,
    PURPOSE.EXTENSION,
  ]);
  assert.ok(!slots.includes(PURPOSE.TRANSFER),
    'with only three slots, course Challenge is preserved before the extra CCMR transfer slot');
});

test('an above-level regular student earns challenge work too', () => {
  const slots = weeklyMixFor({ band: INSTRUCTIONAL_BAND.ABOVE, honors: false, sessions: 4 });
  assert.ok(slots.includes(PURPOSE.EXTENSION),
    'the ceiling must not be the course label');
});

test('a below-level Honors student is still Honors, and still gets repair', () => {
  const slots = weeklyMixFor({ band: INSTRUCTIONAL_BAND.BELOW, honors: true, sessions: 4 });
  assert.equal(slots.length, 4);
  assert.ok(slots.includes(PURPOSE.CURRENT_LEARNING), 'repair must not remove contact with the enrolled course');
  assert.ok(slots.includes(PURPOSE.FOUNDATION_BRIDGE));
  assert.ok(slots.includes(PURPOSE.RETENTION));
  assert.ok(!slots.includes(PURPOSE.EXTENSION), 'challenge waits until the foundation holds');
  assert.ok(!slots.includes(PURPOSE.TRANSFER), 'CCMR transfer waits until the course foundation is ready');
});

// --- BC: weak course mastery suppresses premature CCMR transfer ------------------

test('transfer only fires where a transfer gap was actually diagnosed', () => {
  // A student who cannot do the standard in class is not "failing to transfer".
  // They have not learned it yet, and sending them SAT items proves nothing.
  const purpose = resolvePurpose({
    lifecycle: LIFECYCLE.DEVELOPING,
    isCurrentInstruction: true,
    transferGapFramework: null,
  });
  assert.equal(purpose, PURPOSE.CURRENT_LEARNING);
});

test('a diagnosed transfer gap does produce a CCMR recommendation', () => {
  const purpose = resolvePurpose({
    lifecycle: LIFECYCLE.DEVELOPING,
    isCurrentInstruction: true,
    transferGapFramework: 'digitalSAT',
  });
  assert.equal(purpose, PURPOSE.TRANSFER);
});

test('a blocking prerequisite outranks a transfer gap', () => {
  const purpose = resolvePurpose({
    lifecycle: LIFECYCLE.DEVELOPING,
    isPrerequisiteOfCurrent: true,
    transferGapFramework: 'digitalSAT',
  });
  assert.equal(purpose, PURPOSE.FOUNDATION_BRIDGE,
    'exam-style practice on top of a hole is wasted time');
});

test('a mastered standard becomes challenge, not more of the same', () => {
  assert.equal(resolvePurpose({ lifecycle: LIFECYCLE.MASTERED }), PURPOSE.EXTENSION);
});

// --- Scoring: suppressions are reported, not hidden ------------------------------

test('a mastered standard is suppressed unless it is being extended', () => {
  const asReview = scoreCandidate({
    baseScore: 0.8, purpose: PURPOSE.RESPONSIVE_REVIEW, lifecycle: LIFECYCLE.MASTERED,
  });
  const asExtension = scoreCandidate({
    baseScore: 0.8, purpose: PURPOSE.EXTENSION, lifecycle: LIFECYCLE.MASTERED,
  });
  assert.ok(asReview.negative.alreadyMastered < 0);
  assert.equal(asExtension.negative.alreadyMastered, undefined);
  assert.ok(asExtension.score > asReview.score);
});

test('every score can explain itself in both directions', () => {
  const scored = scoreCandidate({
    baseScore: 0.5, purpose: PURPOSE.RETENTION, lifecycle: LIFECYCLE.RETAINED,
    isCurrentInstruction: true,
  });
  assert.ok(Object.keys(scored.positive).length > 0, 'a teacher must see why it was chosen');
  assert.ok(Object.keys(scored.negative).length > 0, 'and why it was held back');
});

test('a teacher pin is visible in the reasoning, not buried in it', () => {
  const pinned = scoreCandidate({ baseScore: 0, purpose: PURPOSE.RESPONSIVE_REVIEW, lifecycle: LIFECYCLE.DEVELOPING, teacherPinned: true });
  assert.equal(pinned.positive.teacherPinned, 0.40,
    'the pin shows up as its own term so a teacher can see their own decision in the explanation');
});

test('a teacher pin takes a slot outright, even scoring last', () => {
  // Waiving the cooldown was never enough. If the pinned standard still has to
  // outscore the engine's favourites, a teacher can pin something and simply not
  // see it — which is not an override.
  const candidates = [
    {
      skillId: 'A.2C', teacherPinned: true, score: 0.05, purpose: PURPOSE.RESPONSIVE_REVIEW,
      strand: 'inequalities', representation: 'symbolic', eligibility: { eligible: true, reason: 'teacher_pinned' },
    },
    ...['A.5A', 'A.3A', 'A.9A', 'A.7A'].map((skillId) => ({
      skillId, score: 1.2, purpose: PURPOSE.CURRENT_LEARNING,
      strand: skillId, representation: 'graph', eligibility: { eligible: true },
    })),
  ];
  const week = optimizeWeeklySet({ candidates, sessions: 4 });
  assert.ok(week.sessions.some((s) => s.skillId === 'A.2C'),
    'the teacher\'s choice must appear regardless of what the engine preferred');
  assert.equal(week.sessions.length, 4, 'and it takes a slot rather than adding one');
});

test('pins cannot swallow the entire week beyond its size', () => {
  const candidates = Array.from({ length: 9 }, (_, i) => ({
    skillId: `pin-${i}`, teacherPinned: true, score: 0.5, purpose: PURPOSE.CURRENT_LEARNING,
    strand: `s${i}`, representation: 'symbolic', eligibility: { eligible: true },
  }));
  const week = optimizeWeeklySet({ candidates, sessions: 4 });
  assert.equal(week.sessions.length, 4);
});

test('a pin survives the whole pipeline, cooldown and all', () => {
  const result = buildWeeklyRecommendations({
    rows: [row('A.2C', { strand: 'inequalities', score: 0.02 }),
      row('A.5A', { score: 0.9 }), row('A.3A', { strand: 'linear', score: 0.9 })],
    profile: profileAt(3),
    masteryProfilesByTeks: { 'A.2C': mastery('Mastered', 97) },
    lastPracticedByTeks: { 'A.2C': NOW - DAY },
    pinnedSkills: ['A.2C'],
    sessions: 2,
    now: NOW,
  });
  assert.ok(result.sessions.some((s) => s.teksCode === 'A.2C'),
    'mastered yesterday, lowest score, still pinned — the teacher wins');
});

// --- End to end -----------------------------------------------------------------

test('engine rows become full specifications, not bare TEKS codes', () => {
  const result = buildWeeklyRecommendations({
    rows: [row('A.5A'), row('A.3A', { strand: 'linear', representation: 'graph' })],
    profile: profileAt(3),
    masteryProfilesByTeks: { 'A.5A': mastery('Developing', 62) },
    currentInstructionSkills: ['A.5A'],
    sessions: 2,
    now: NOW,
  });

  const first = result.sessions[0];
  assert.ok(first.teksCode, 'a standard');
  assert.ok(first.purpose, 'a reason');
  assert.ok(first.studentExplanation, 'something the student can read');
  assert.ok(Number.isInteger(first.dok), 'a cognitive demand');
  assert.ok(Number.isInteger(first.difficultyBand), 'a complexity');
  assert.ok(first.context, 'a context');
  assert.ok(first.targetReason, 'and a record of why those were chosen');
});

test('the week reports what it deliberately held back', () => {
  const result = buildWeeklyRecommendations({
    rows: [row('A.5A'), row('A.3A', { strand: 'linear' })],
    profile: profileAt(3),
    masteryProfilesByTeks: { 'A.5A': mastery('Mastered', 96) },
    lastPracticedByTeks: { 'A.5A': NOW - DAY },
    sessions: 2,
    now: NOW,
  });
  const suppressed = result.suppressed.map((entry) => entry.teksCode);
  assert.deepEqual(suppressed, ['A.5A']);
  assert.equal(result.suppressed[0].eligibility.reason, 'cooling_down');
  assert.ok(!result.sessions.some((s) => s.teksCode === 'A.5A'));
});

test('a student with no profile yet still gets a usable week', () => {
  // Before baseline is established the engine must not fail closed on the
  // student — it just cannot make strong claims.
  const result = buildWeeklyRecommendations({
    rows: ['A.5A', 'A.3A', 'A.9A', 'A.2C'].map((id) => row(id, { strand: id })),
    profile: null,
    sessions: 4,
    now: NOW,
  });
  assert.equal(result.sessions.length, 4);
  result.sessions.forEach((session) => {
    assert.ok(session.difficultyBand >= 1 && session.difficultyBand <= 5);
  });
});

test('the same inputs produce the same week', () => {
  // Recommendations get shown to a teacher and then to the student. They must
  // not shuffle between the two screens.
  const input = {
    rows: ['A.5A', 'A.3A', 'A.9A'].map((id) => row(id, { strand: id, score: 0.7 })),
    profile: profileAt(3),
    sessions: 3,
    now: NOW,
  };
  const a = buildWeeklyRecommendations(input);
  const b = buildWeeklyRecommendations(input);
  assert.deepEqual(a.sessions.map((s) => s.skillId), b.sessions.map((s) => s.skillId));
});

test('an empty row set returns an empty week rather than throwing', () => {
  const result = buildWeeklyRecommendations({ rows: [], profile: profileAt(3), now: NOW });
  assert.deepEqual(result.sessions, []);
  assert.deepEqual(result.considered, []);
});


test('a CCMR-disabled Honors week backfills with course work instead of shrinking', () => {
  const slots = weeklyMixFor({
    band: INSTRUCTIONAL_BAND.ON,
    honors: true,
    sessions: 5,
    allowTransfer: false,
  });
  assert.equal(slots.length, 5);
  assert.ok(!slots.includes(PURPOSE.TRANSFER));
  assert.ok(slots.includes(PURPOSE.EXTENSION),
    'turning CCMR off must not also remove the course Challenge');
  assert.ok(slots.includes(PURPOSE.CURRENT_LEARNING));
});

test('a compressed Honors week protects Challenge before optional transfer', () => {
  const four = weeklyMixFor({
    band: INSTRUCTIONAL_BAND.ON,
    honors: true,
    sessions: 4,
  });
  assert.equal(four.length, 4);
  assert.ok(four.includes(PURPOSE.EXTENSION));
  assert.ok(four.includes(PURPOSE.TRANSFER));

  const three = weeklyMixFor({
    band: INSTRUCTIONAL_BAND.ON,
    honors: true,
    sessions: 3,
  });
  assert.equal(three.length, 3);
  assert.ok(three.includes(PURPOSE.EXTENSION),
    'Challenge survives even when a teacher compresses Honors to the minimum');
});
