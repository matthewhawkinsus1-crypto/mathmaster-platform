/*
 * HOW ONE PIECE OF EVIDENCE MOVES A SKILL'S MASTERY — EACH QUESTION SCORED ONCE.
 *
 * The trigger (updateMyMathPathMasteryFromEvidence) used to add every ATTEMPT
 * to the skill's running sums. A question right on the second try was two
 * events, one wrong and one right, and read 50% where the assignment record
 * (one score per question, its final attempt) reads 100%. The Path map then
 * had to read the more favourable of the two records while the wheel, its
 * card and the weekly planner read the server's number, so they disagreed.
 *
 * Now each QUESTION is one event, scored by its final attempt, as the
 * assignment record scores it. A profile entry keeps, per question, the
 * contribution it last made (`questions`), so a later attempt replaces the
 * earlier one instead of adding to it:
 *
 *   sums  = sums − previous contribution of this question + this attempt's
 *
 * Which attempt is final: the higher attempt number, then the later time. An
 * older attempt delivered late (triggers do not run in order) changes nothing.
 *
 * What a "question" is (questionKeyFor):
 *   assignment  — the assignment and the question in it, whatever version
 *                 (variant) of it was answered: the assignment record keeps
 *                 one score per question too.
 *   otherwise   — the delivered instance (a Path item, a lab, a secure item);
 *                 failing that the event itself, which is one event as before.
 *
 * Bounded: an entry keeps at most MAX_QUESTIONS_PER_SKILL question rows. When
 * it would hold more, the oldest rows are dropped and their contribution stays
 * folded into the sums for good; a later attempt at a dropped question then
 * counts as a new question (the old behaviour, for that one question).
 *
 * Entries the old trigger wrote have sums but no `questions`. Their sums are
 * kept as the folded base; new questions are scored once from here on, and
 * the owner-run backfill (scripts/backfill-mastery-scoring.mjs) rescores the
 * whole history once.
 *
 * A FLOOR NEVER LETS DEPLOY DAY COST A STUDENT ANYTHING (product decision 8).
 * The backfill writes `floor` (status, estimate, effective weight) wherever
 * rescoring, or main's Path map, gave a student more than the new rule does.
 * The shared rule honours it (masteryRule.mjs), and it is cleared here as soon
 * as the student's own evidence reaches it, or once they have answered
 * FLOOR_FRESH_QUESTIONS new questions on the skill since it was set.
 *
 * Pure: no Firestore. The helpers the trigger already uses (functions/lib/
 * mathPath.js) are passed in, so the trigger and the backfill share one path.
 */
import {
  classifyMasteryStatus,
  masteryStatusRank,
} from './masteryRule.mjs';

export const MASTERY_SCORING_VERSION = 2;
export const MAX_QUESTIONS_PER_SKILL = 200;
// A floor protects deploy day, not every day after it: once the student has
// answered this many NEW questions on the skill, their own evidence speaks
// for itself and the floor goes even if it was not reached.
export const FLOOR_FRESH_QUESTIONS = 8;

// How much each kind of work counts as evidence (unchanged from the trigger).
// liveChallenge sits below practice on purpose. The answer is real and the
// grader is the same, but one attempt against a countdown with a leaderboard
// in view is noisier evidence than the same question at a desk — a wrong
// answer may mean "cannot do this" or may mean "ran out of seconds", and the
// estimate should not treat those as equally informative.
export const ROLE_WEIGHT = Object.freeze({
  warmup: 0.8, classwork: 0.9, dol: 1.25, practice: 1, quiz: 1.35, test: 1.4, retention: 1.15, liveChallenge: 0.7,
});

// Deliberately below the Mastered threshold: a student whose every success
// needed the platform to supply the mathematical idea has not shown mastery
// of it, and no quantity of such successes should add up to that claim.
export const SUPPORTED_CREDIT = 0.75;

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** The question this evidence answers, as a stable string (hashed by the caller). */
export const questionKeyFor = (evidence = {}) => {
  const source = evidence.source || {};
  const snapshot = evidence.questionSnapshot || {};
  if (source.kind === 'assignment' && source.assignmentId) {
    const question = snapshot.questionId || `index:${num(source.questionIndex)}`;
    return `assignment|${source.assignmentId}|${question}`;
  }
  if (snapshot.questionInstanceId) return `instance|${source.kind || 'unknown'}|${snapshot.questionInstanceId}`;
  return `event|${evidence.eventKey || ''}`;
};

/**
 * Everything the profile update reads from one evidence event.
 * helpers: { canonicalAlignmentKey, displayAlignmentKey, mathematicalIndependence, opaqueId }
 */
export const masteryEventFacts = (evidence = {}, helpers, { eventId = null } = {}) => {
  const keys = evidence.masteryEvidenceKeys?.length ? evidence.masteryEvidenceKeys : evidence.alignmentKeys || [];
  const alignmentKeys = [...new Set(keys.map(helpers.canonicalAlignmentKey).filter((key) => key.startsWith('texas:')))];
  const roleWeight = ROLE_WEIGHT[evidence.source?.activityRole] || 1;
  const modified = Boolean(evidence.supportUsage?.modified) || Boolean(evidence.supportUsage?.modifications?.length);
  const independent = helpers.mathematicalIndependence(evidence.supportUsage || {});
  const score = Math.max(0, Math.min(1, Number(evidence.performance?.score) || 0));
  // WEIGHT and CREDIT are different questions (see the trigger's comment):
  // weight is how much this counts as evidence at all and stays in the
  // denominator; credit is what the student demonstrated, discounted for
  // support so a supported success is worth less than an independent one.
  const weight = modified ? 0 : roleWeight;
  const creditedScore = independent ? score : score * SUPPORTED_CREDIT;
  const eventKey = String(evidence.eventKey || eventId || '');
  return {
    codes: alignmentKeys.map(helpers.displayAlignmentKey),
    questionId: helpers.opaqueId('mq', questionKeyFor({ ...evidence, eventKey })),
    attemptNumber: Math.max(1, num(evidence.performance?.attemptNumber) || 1),
    occurredAt: num(evidence.occurredAt),
    weight,
    creditedScore,
    modified,
    independent,
    isCorrect: Boolean(evidence.performance?.isCorrect),
    dok: Number(evidence.questionSnapshot?.dok) || null,
    familyId: evidence.questionSnapshot?.familyId || null,
  };
};

// One question's share of the sums, compactly: w weight, c credit × weight,
// e eligible (0/1), m modified (0/1), s independent success (0/1),
// n attempt number, t time.
const contributionOf = (facts) => ({
  w: facts.weight,
  c: facts.creditedScore * facts.weight,
  e: facts.weight > 0 ? 1 : 0,
  m: facts.modified ? 1 : 0,
  s: facts.isCorrect && facts.independent && facts.weight > 0 ? 1 : 0,
  n: facts.attemptNumber,
  t: facts.occurredAt,
});

const isLater = (next, previous) => (
  !previous || next.n > num(previous.n) || (next.n === num(previous.n) && next.t >= num(previous.t))
);

const confidenceFor = ({ eligibleEvents, effectiveWeight, dokRepresented }) => (
  eligibleEvents >= 8 && effectiveWeight >= 5 && dokRepresented.length >= 2 ? 'High'
    : eligibleEvents >= 4 && effectiveWeight >= 2.4 ? 'Medium' : 'Low'
);

/** True while a floor still lifts this evidence above what it earns itself. */
const floorStillNeeded = (floor, { status, estimate, effectiveWeight }) => {
  if (!floor || typeof floor !== 'object') return false;
  if (num(floor.questionsSince) >= FLOOR_FRESH_QUESTIONS) return false;
  if (masteryStatusRank(status) < masteryStatusRank(floor.status)) return true;
  if (floor.estimate != null && (estimate == null || estimate < num(floor.estimate))) return true;
  return num(effectiveWeight) < num(floor.effectiveWeight);
};

/**
 * The entry after one event. `previous` is the stored entry for the skill (or
 * undefined); `code` its display code. Returns { entry, changed }: changed is
 * false when the event was an older attempt than the one already counted.
 */
export const applyMasteryEvent = (previous = {}, facts, code, { now = Date.now(), markScored = false } = {}) => {
  const prior = previous && typeof previous === 'object' ? previous : {};
  const accumulator = prior.accumulator || {};
  const questions = { ...(prior.questions || {}) };
  const before = questions[facts.questionId] || null;
  const next = contributionOf(facts);
  if (before && !isLater(next, before)) return { entry: prior, changed: false };
  questions[facts.questionId] = next;

  const minus = before || { w: 0, c: 0, e: 0, m: 0, s: 0 };
  const sums = {
    effectiveWeight: num(accumulator.effectiveWeight) - num(minus.w) + next.w,
    weightedScoreSum: num(accumulator.weightedScoreSum) - num(minus.c) + next.c,
    eligibleEvents: num(accumulator.eligibleEvents) - num(minus.e) + next.e,
    modifiedEvents: num(accumulator.modifiedEvents) - num(minus.m) + next.m,
    independentSuccesses: num(accumulator.independentSuccesses) - num(minus.s) + next.s,
  };
  // Floating-point subtraction can leave -1e-17; nothing here is negative.
  Object.keys(sums).forEach((key) => { sums[key] = Math.max(0, Math.round(sums[key] * 1e9) / 1e9); });

  // Bounded: drop the oldest rows; their share stays folded into the sums.
  const rows = Object.entries(questions);
  if (rows.length > MAX_QUESTIONS_PER_SKILL) {
    rows.sort(([, a], [, b]) => num(a.t) - num(b.t));
    rows.slice(0, rows.length - MAX_QUESTIONS_PER_SKILL).forEach(([id]) => { delete questions[id]; });
  }

  const dokRepresented = [...new Set([...(prior.dimensions?.dokRepresented || []), ...(facts.dok ? [facts.dok] : [])])].sort();
  const familiesRepresented = [...new Set([...(prior.dimensions?.familiesRepresented || []), ...(facts.familyId ? [facts.familyId] : [])])];
  const estimate = sums.effectiveWeight > 0 ? Math.round((sums.weightedScoreSum / sums.effectiveWeight) * 100) : null;
  const ruleFacts = {
    estimate,
    eligibleEvents: sums.eligibleEvents,
    effectiveWeight: sums.effectiveWeight,
    independentSuccesses: sums.independentSuccesses,
    dokRepresented,
  };
  // The student's own evidence, without any floor: once it reaches the floor
  // the floor has done its job and goes.
  const earned = classifyMasteryStatus(ruleFacts);
  const counted = prior.floor && typeof prior.floor === 'object'
    ? { ...prior.floor, questionsSince: num(prior.floor.questionsSince) + (before ? 0 : 1) }
    : null;
  const floor = floorStillNeeded(counted, { status: earned, estimate, effectiveWeight: sums.effectiveWeight }) ? counted : null;
  const status = classifyMasteryStatus({ ...ruleFacts, floor });
  const shownEstimate = floor?.estimate != null && (estimate == null || estimate < num(floor.estimate)) ? num(floor.estimate) : estimate;
  const lastIndependentSuccessAt = facts.isCorrect && facts.independent
    ? Math.max(num(prior.dimensions?.lastIndependentSuccessAt), facts.occurredAt)
    : prior.dimensions?.lastIndependentSuccessAt || null;

  const { floor: _dropped, ...rest } = prior;
  const entry = {
    ...rest,
    teksCode: code,
    mastery: { estimate: shownEstimate, observedPerformance: estimate, status, confidence: confidenceFor({ ...sums, dokRepresented }) },
    signals: { ...(prior.signals || {}), breadth: dokRepresented.length >= 2 ? 'broad' : 'developing', retention: prior.signals?.retention || 'stable' },
    dimensions: {
      eligibleGradeLevelEvents: sums.eligibleEvents,
      modifiedEvidenceEvents: sums.modifiedEvents,
      independentSuccesses: sums.independentSuccesses,
      dokRepresented,
      familiesRepresented,
      lastIndependentSuccessAt,
    },
    accumulator: sums,
    questions,
    recommendation: { reason: status === 'Needs Attention' ? 'Rebuild this skill with targeted grade-level support.' : 'Continue building independent accuracy and breadth.' },
    updatedAt: now,
    ...(floor ? { floor } : {}),
    ...(markScored || prior.scoringVersion >= MASTERY_SCORING_VERSION ? { scoringVersion: MASTERY_SCORING_VERSION } : {}),
  };
  return { entry, changed: true };
};

/**
 * Every profile, rebuilt from a student's whole evidence history, each
 * question scored once. Used by the backfill; events in any order.
 */
export const rescoreProfilesFromEvidence = (events = [], helpers, { now = Date.now() } = {}) => {
  const ordered = [...events].sort((a, b) => num(a.evidence?.occurredAt) - num(b.evidence?.occurredAt)
    || String(a.id).localeCompare(String(b.id)));
  const profiles = {};
  ordered.forEach(({ id, evidence }) => {
    const facts = masteryEventFacts(evidence || {}, helpers, { eventId: id });
    facts.codes.forEach((code) => {
      profiles[code] = applyMasteryEvent(profiles[code], facts, code, { now, markScored: true }).entry;
    });
  });
  return profiles;
};
