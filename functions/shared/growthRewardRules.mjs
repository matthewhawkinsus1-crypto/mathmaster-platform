import { createHash } from 'node:crypto';

import { MAX_AWARD_AMOUNT } from './classPoints.mjs';
import { BADGE_CATALOG } from './rewardGrants.mjs';
import { normalizeTestCycleRecord, SESSION_STATE } from './testCycleRecord.mjs';
import { normalizeTestCyclePolicy } from './testCyclePolicy.mjs';
import { evaluateWeeklyGoalProgress, weekKeyFor } from './weeklyPathGrade.mjs';
import { MASTERY_RULE } from './masteryRule.mjs';
import { masteryHistoryWeekKeys, masteryStatusFromCode } from './masteryHistory.mjs';
import { skillMasteredEvents, skillMasteredEventsFromHistory } from './pathGrowthEvents.mjs';

/*
 * GROWTH, EFFORT AND MASTERY REWARDS (pure).
 *
 * Until this, Class Points came from a teacher's hand or from a Live Challenge
 * placement, and an achievement paid 2–3 points against the 100 a Practice
 * Pass costs. That pays the student who is already fast and leaves nothing for
 * the student who failed a test, did every correction and came back 20 points
 * higher. These rules pay for that: improvement, finished work and mastery.
 *
 * Every rule reads an AUTHORITATIVE record the student cannot write:
 *
 *   retest         testCycleRecords (server-only) + the assignment's policy
 *   corrections    testCycleRecords.corrections
 *   weekly Path    weeklyPathGoalSnapshots (frozen by the server) + the
 *                  student's completed pathSessions (server-only)
 *   mastery        studentMasteryHistory (WHEN a skill became Mastered:
 *                  Job D's weekly snapshots) checked against
 *                  studentMasteryProfiles (the evidence behind it). Both are
 *                  written ONLY by the evidence trigger
 *                  updateMyMathPathMasteryFromEvidence (Admin SDK), in one
 *                  transaction, from server-only evidenceEvents. No client —
 *                  student, teacher or root administrator — may write either
 *                  (firestore.rules). The profile used to be teacher-writable,
 *                  and `authorizedTeacherEmails` keeps former teachers, so a
 *                  teacher who once had the student could write 200 made-up
 *                  Mastered keys and mint 1,000 points. Defence in depth on
 *                  top of the rule: a skill pays only when its key is a
 *                  canonical skill code and its profile entry carries the
 *                  evidence counts the trigger writes, consistent with
 *                  Mastered (serverDerivedMastered / reachedMasteredEvidence),
 *                  and at most MASTERY_SKILLS_PER_SYNC skills pay per sync.
 *
 * Read but never trusted to mint: the assignment (teacher-writable) supplies
 * only the policy (server-owned fields in firestore.rules) and, when the
 * record names no class, the audience — which can route one real event's
 * single award to the class of record but never create a second one, since
 * identities name the student and the event, not the class. grades/{id}
 * supplies the class of record (roster fields are immutable to clients) and
 * the disabled flag (which can only refuse). The ledger and rewardGrants,
 * read to find streak blocks already paid, are client-unwritable.
 *
 * DEPENDENCY. My Math Path (Job D) exposes better weekly-goal and mastery
 * data. Mastery has switched over to its mastered-at history
 * (evaluateMasteryGrowth); the weekly rules still read weeklyPathGoalSnapshots
 * + pathSessions. The award identities below did not change in the switch and
 * must not, so nothing already paid is paid twice.
 *
 * AWARD IDENTITY. Every award is named by
 *
 *   'growth' ␀ studentId ␀ ruleId ␀ sourceId
 *
 * and its document ids are hashes of that (`gra_` in the Class Points ledger,
 * `grg_` in rewardGrants). Delivering the same event twice lands on the same
 * documents, so exactly-once is a property of the id, not of bookkeeping.
 * An event that pays points AND a badge shares one identity across the two
 * collections.
 *
 * Pure apart from hashing: no Firestore. functions/lib/growthRewards.js reads
 * the records and delivers.
 */

export const GROWTH_RULES_VERSION = 1;

/*
 * NO RETROACTIVE FLOOD. Growth rewards start counting on this day. Without a
 * start, the first sync after deploy would pay every retest, correction and
 * Path week a student has ever done — hundreds of points at once for long-time
 * students and nothing for new ones — which would make the wallet a measure of
 * how long someone has been enrolled rather than of growth, and would let the
 * first sync buy a stack of Practice Passes before anyone saw it happen.
 */
export const GROWTH_REWARDS_START_MS = Date.parse('2026-10-07T00:00:00Z');

export const GROWTH_RULE_IDS = Object.freeze({
  RETEST_IMPROVED: 'retestImproved',
  RETEST_PASSED: 'retestPassed',
  CORRECTIONS_COMPLETED: 'correctionsCompleted',
  WEEKLY_PATH_GOAL: 'weeklyPathGoal',
  WEEKLY_PATH_STREAK: 'weeklyPathStreak',
  MASTERY_SKILL: 'masterySkill',
  MASTERY_COUNT: 'masteryCount',
});

// Both retest variants share ONE identity per test cycle, so a test cycle can
// pay "improved" or "passed" and never both — even if the policy's passing
// score is edited between two syncs.
export const RETEST_IDENTITY_RULE_ID = 'retestGrowth';

// What each rule is worth. Sized against the 100-point Practice Pass: a
// failed-then-passed retest is a fifth of a pass, a finished week of Path a
// tenth. retestPassed is the ledger's single-award ceiling (MAX_AWARD_AMOUNT,
// 20), stated as what it pays rather than a larger number the cap would cut:
// raising the ceiling would also raise a teacher's single manual award.
export const GROWTH_REWARD_AMOUNTS = Object.freeze({
  retestImproved: 15,
  retestPassed: 20,
  correctionsCompleted: 10,
  weeklyPathGoal: 10,
  weeklyPathStreak: 15,
  masterySkill: 5,
});

/** A retest must beat the original by at least this many points to count as improvement. */
export const RETEST_IMPROVEMENT_POINTS = 10;
/** Consecutive on-time weekly goals that make a streak. */
export const PATH_STREAK_WEEKS = 3;
/**
 * At most this many newly Mastered skills pay in one sync; the rest pay on
 * later syncs under the same identities. Real mastery arrives a skill at a
 * time, so this never delays an honest student by more than a sync, and it
 * bounds what any undetected bad profile could mint at once.
 */
export const MASTERY_SKILLS_PER_SYNC = 5;
/** Mastered-skill counts that earn a badge. */
export const MASTERY_COUNT_BADGES = Object.freeze([
  Object.freeze({ count: 5, badgeCode: 'mastery-5' }),
  Object.freeze({ count: 10, badgeCode: 'mastery-10' }),
]);

export const GROWTH_BADGES = Object.freeze({
  RETEST: 'growth-retest',
  CORRECTIONS: 'growth-corrections',
  PATH_STREAK: 'growth-path-streak',
});

export const SKIP_REASON = Object.freeze({
  BEFORE_START: 'before_start',
  DIFFERENT_CLASS: 'different_class',
  CLASS_UNKNOWN: 'class_unknown',
  UNDATED: 'undated',
  EXTERNAL_ORIGINAL_MISSING: 'external_original_missing',
  GOAL_SET_AFTER_WEEK: 'goal_set_after_week',
  RUN_START_UNKNOWN: 'run_start_unknown',
  SYNC_LIMIT: 'sync_limit',
  BEFORE_BASELINE: 'before_baseline',
});

export const MASTERED_STATUS = 'Mastered';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
/*
 * The latest a weekly goal can be due: the end of the following Monday, UTC.
 * A goal's dueAt is end-of-Sunday in the school's time zone, which is Monday
 * morning UTC in every US zone. `dueAt` arrives with the student's proposal,
 * so a reward never trusts a later one: clamping it here means a week cannot be
 * made "on time" by proposing a due date in the future.
 */
const LATEST_DUE_AFTER_WEEK_START = WEEK + DAY;

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const list = (value) => (Array.isArray(value) ? value : []);

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

/** The plain-text award identity. Deterministic; never contains anything but ids. */
export const growthAwardIdentity = ({ studentId, ruleId, sourceId }) => (
  ['growth', clean(studentId, 64), clean(ruleId, 60), clean(sourceId, 200)].join('\u0000')
);

/** classPointTransactions/{id} for a growth award. */
export const growthLedgerTransactionId = (identity) => `gra_${sha256(identity).slice(0, 40)}`;

/** rewardGrants/{id} for a growth badge. */
export const growthGrantId = (identity) => `grg_${sha256(identity).slice(0, 40)}`;

/** An amount the ledger will accept from one award: a positive whole number no larger than MAX_AWARD_AMOUNT. */
export const deliverableAmount = (amount) => {
  const whole = Math.round(Number(amount) || 0);
  return whole > 0 ? Math.min(whole, MAX_AWARD_AMOUNT) : 0;
};

const weekStartMs = (weekKey) => Date.parse(`${weekKey}T00:00:00Z`);
const isWeekKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && Number.isFinite(weekStartMs(value));

/**
 * Turn one rewarded event into what gets delivered: a ledger credit, a badge,
 * or both, all under the event's one identity.
 */
const eventAwards = ({
  studentId, classId, ruleId, identityRuleId = ruleId, sourceId, points = 0, badgeCode = null, reasonLabel, eventAtMs = null,
}) => {
  const identity = growthAwardIdentity({ studentId, ruleId: identityRuleId, sourceId });
  const base = {
    identity,
    ruleId,
    identityRuleId,
    ruleVersion: GROWTH_RULES_VERSION,
    sourceId: clean(sourceId, 200),
    studentId,
    classId,
    reasonLabel: clean(reasonLabel, 140),
    eventAtMs,
  };
  const awards = [];
  const amount = deliverableAmount(points);
  if (amount > 0) {
    awards.push({
      ...base,
      id: growthLedgerTransactionId(identity),
      kind: 'classPoints',
      amount,
      ...(amount < Math.round(Number(points) || 0) ? { cappedFrom: Math.round(Number(points)) } : {}),
    });
  }
  if (badgeCode) {
    awards.push({
      ...base,
      id: growthGrantId(identity),
      kind: 'badge',
      rewardCode: 'badge',
      badgeCode,
      label: BADGE_CATALOG[badgeCode]?.label || null,
    });
  }
  return awards;
};

const skip = (ruleId, sourceId, reason, extra = {}) => ({ ruleId, sourceId: clean(sourceId, 200), reason, ...extra });

// ---------------------------------------------------------------------------
// TEST CYCLE: RETEST AND CORRECTIONS
// ---------------------------------------------------------------------------

/**
 * Which class a Test Cycle event belongs to. The record names its class when
 * it was written with one; otherwise the assignment's audience decides — the
 * class of record when the assignment was given to it, or the assignment's
 * only class. Anything else is unknown, and an unknown class is never guessed
 * into the student's current class.
 */
export const testCycleEventClassId = ({ record = {}, assignment = {}, classOfRecord = null } = {}) => {
  const recorded = clean(record?.classId, 120);
  if (recorded) return recorded;
  const audience = [...new Set(list(assignment?.assignedClassIds).map((value) => clean(value, 120)).filter(Boolean))];
  if (classOfRecord && audience.includes(classOfRecord)) return classOfRecord;
  return audience.length === 1 ? audience[0] : null;
};

/**
 * The retest rule for one test cycle.
 *
 * Raw scores are compared, not recorded grades: the district cap holds a
 * recorded retest at 70, so a student who went from 40 to 85 would otherwise
 * look like +30 rather than +45, and a student already at the cap could never
 * show growth at all.
 *
 * EXTERNAL ASSESSMENTS. When the policy marks the original as external
 * (a paper or district test entered by the teacher), the "original" is
 * `externalAssessment.originalScore` and MathMaster's own secure Test IS the
 * retest — the same mapping recordGradeState uses. The two scores then come
 * from different instruments, which is accepted (it is the comparison the
 * grade itself makes), but a missing external score is never treated as zero:
 * no original, no growth claim, recorded as skipped.
 */
export const evaluateRetestGrowth = ({ studentId, classId, record, assignment, policy = undefined } = {}) => {
  const normalized = normalizeTestCycleRecord(record);
  const resolved = normalizeTestCyclePolicy(policy === undefined ? assignment?.assessmentPolicy : policy);
  const sourceId = normalized.assignmentId;
  if (!resolved || !sourceId) return { awards: [], skipped: [] };

  const external = Boolean(resolved.externalAssessment);
  const released = (stage) => stage.state === SESSION_STATE.RELEASED;
  const retestStage = external ? normalized.test : normalized.retest;
  if (!released(retestStage) || finite(retestStage.rawScore) === null) return { awards: [], skipped: [] };

  const original = external
    ? finite(normalized.externalAssessment?.originalScore)
    : (released(normalized.test) ? finite(normalized.test.rawScore) : null);
  const retest = finite(retestStage.rawScore);
  if (original === null) {
    return {
      awards: [],
      skipped: external ? [skip(RETEST_IDENTITY_RULE_ID, sourceId, SKIP_REASON.EXTERNAL_ORIGINAL_MISSING)] : [],
    };
  }

  const passing = resolved.passingScore;
  let ruleId = null;
  if (original < passing && retest >= passing) ruleId = GROWTH_RULE_IDS.RETEST_PASSED;
  else if (retest - original >= RETEST_IMPROVEMENT_POINTS) ruleId = GROWTH_RULE_IDS.RETEST_IMPROVED;
  if (!ruleId) return { awards: [], skipped: [] };

  const eventAtMs = finite(retestStage.releasedAt);
  if (eventAtMs === null) return { awards: [], skipped: [skip(ruleId, sourceId, SKIP_REASON.UNDATED)] };
  if (eventAtMs < GROWTH_REWARDS_START_MS) return { awards: [], skipped: [skip(ruleId, sourceId, SKIP_REASON.BEFORE_START)] };

  const eventClass = testCycleEventClassId({ record: normalized, assignment, classOfRecord: classId });
  if (!eventClass) return { awards: [], skipped: [skip(ruleId, sourceId, SKIP_REASON.CLASS_UNKNOWN)] };
  if (eventClass !== classId) return { awards: [], skipped: [skip(ruleId, sourceId, SKIP_REASON.DIFFERENT_CLASS, { eventClassId: eventClass })] };

  return {
    awards: eventAwards({
      studentId,
      classId,
      ruleId,
      identityRuleId: RETEST_IDENTITY_RULE_ID,
      sourceId,
      points: GROWTH_REWARD_AMOUNTS[ruleId],
      badgeCode: GROWTH_BADGES.RETEST,
      reasonLabel: ruleId === GROWTH_RULE_IDS.RETEST_PASSED ? 'Passed the retest' : 'Raised your score on the retest',
      eventAtMs,
    }),
    skipped: [],
  };
};

/**
 * Corrections finished. Only corrections that were actually REQUIRED, have
 * something in them, and were done by the student — a teacher waiving them
 * is a kindness, not the student's work, and an empty plan is complete
 * without anyone doing anything.
 */
export const evaluateCorrectionsGrowth = ({ studentId, classId, record, assignment } = {}) => {
  const normalized = normalizeTestCycleRecord(record);
  const sourceId = normalized.assignmentId;
  const ruleId = GROWTH_RULE_IDS.CORRECTIONS_COMPLETED;
  const corrections = normalized.corrections;
  const waived = corrections.waived || normalized.teacherControls.correctionsWaived;
  if (!sourceId || !corrections.required || !corrections.complete || waived || corrections.total <= 0) {
    return { awards: [], skipped: [] };
  }
  const eventAtMs = finite(corrections.completedAt);
  if (eventAtMs === null) return { awards: [], skipped: [skip(ruleId, sourceId, SKIP_REASON.UNDATED)] };
  if (eventAtMs < GROWTH_REWARDS_START_MS) return { awards: [], skipped: [skip(ruleId, sourceId, SKIP_REASON.BEFORE_START)] };

  const eventClass = testCycleEventClassId({ record: normalized, assignment, classOfRecord: classId });
  if (!eventClass) return { awards: [], skipped: [skip(ruleId, sourceId, SKIP_REASON.CLASS_UNKNOWN)] };
  if (eventClass !== classId) return { awards: [], skipped: [skip(ruleId, sourceId, SKIP_REASON.DIFFERENT_CLASS, { eventClassId: eventClass })] };

  return {
    awards: eventAwards({
      studentId,
      classId,
      ruleId,
      sourceId,
      points: GROWTH_REWARD_AMOUNTS.correctionsCompleted,
      badgeCode: GROWTH_BADGES.CORRECTIONS,
      reasonLabel: 'Finished your test corrections',
      eventAtMs,
    }),
    skipped: [],
  };
};

// ---------------------------------------------------------------------------
// WEEKLY PATH
// ---------------------------------------------------------------------------

/**
 * Whether one week's goal was met on time, and when.
 *
 * The goal is the frozen snapshot; completions are the student's completed
 * pathSessions. Only completions inside the week (its Monday to its due time)
 * are offered to the matcher, and the due time is clamped (see
 * LATEST_DUE_AFTER_WEEK_START). A snapshot frozen after its week was over is
 * not a goal the student was working toward, so it cannot be met.
 */
export const weeklyGoalOutcome = ({ goal = {}, completions = [], nowMs = Date.now() } = {}) => {
  const weekKey = clean(goal?.weekKey, 10);
  if (!isWeekKey(weekKey)) return { met: false, weekKey: null };
  const start = weekStartMs(weekKey);
  const latestDue = start + LATEST_DUE_AFTER_WEEK_START;
  const dueAt = Math.min(finite(goal?.dueAt) ?? latestDue, latestDue);
  const createdAt = finite(goal?.createdAt);
  if (createdAt === null) return { met: false, weekKey, dueAt, reason: SKIP_REASON.UNDATED };
  if (createdAt > dueAt) return { met: false, weekKey, dueAt, reason: SKIP_REASON.GOAL_SET_AFTER_WEEK };

  const inWeek = list(completions).filter((entry) => {
    const at = finite(entry?.completedAt);
    return entry?.status === 'completed'
      && at !== null && at >= start && at <= dueAt
      && (!entry.weekKey || entry.weekKey === weekKey);
  });
  const progress = evaluateWeeklyGoalProgress({ goal: { ...goal, weekKey, dueAt }, completions: inWeek, now: nowMs });
  const required = progress.required;
  if (!(required > 0) || progress.completedOnTime < required) return { met: false, weekKey, dueAt, progress };

  // The moment the goal was met: the on-time completion that filled the last slot.
  const onTimeTimes = progress.matchedCompletions
    .map((entry) => finite(entry.completedAt))
    .filter((at) => at !== null && at <= dueAt)
    .sort((a, b) => a - b);
  return { met: true, weekKey, dueAt, metAtMs: onTimeTimes[required - 1] ?? null, progress };
};

/**
 * Weekly Path goals and streaks.
 *
 * `goals` are this student's snapshots for every week from `windowStartWeekKey`
 * on (the reader loads them by their deterministic ids). A goal met on time
 * pays once per week. A STREAK is PATH_STREAK_WEEKS consecutive qualifying
 * weeks; a longer run is cut into back-to-back blocks of three, each paying
 * once, named by the block's last week — so three weeks earn it, six earn it
 * twice, and a fourth week alone does not re-pay the first three.
 *
 * PAID BLOCKS ARE FIXED. `paidStreakWeeks` names every week in view whose
 * streak award is already delivered (the reader checks the ledger and grant
 * documents). Each paid block claims its last week and the two before it, and
 * a new block is built only from three consecutive qualifying weeks that no
 * paid block claims. So the history already paid is never re-segmented: a
 * later read that misses a week (its sessions did not load) splits a run, but
 * the pieces fall inside blocks already paid and pay nothing new. Counting
 * the run from its first week would instead name a new block (weeks 0-5 paid
 * blocks ending at weeks 2 and 5; dropping week 1 used to pay a third, ending
 * at week 4). Blocks are named by their last week, so identities are the same
 * as before.
 *
 * When a run begins at the very first week the reader loaded and the week
 * before it could have qualified (the one-year window has moved past the
 * start date), the run's true start is out of sight: its weeks count only
 * after the first week a paid block claims. With no paid block in it the run
 * is skipped rather than counted from the wrong week — that only happens to a
 * student who did not sync for a whole run of the window.
 */
export const evaluateWeeklyPathGrowth = ({
  studentId, classId, goals = [], completions = [], nowMs = Date.now(), windowStartWeekKey = null,
  paidStreakWeeks = [],
} = {}) => {
  const awards = [];
  const skipped = [];
  const qualifying = new Set();
  const startWeekKey = weekKeyFor(GROWTH_REWARDS_START_MS);

  const byWeek = new Map();
  list(goals).forEach((goal) => {
    const weekKey = clean(goal?.weekKey, 10);
    if (isWeekKey(weekKey) && !byWeek.has(weekKey)) byWeek.set(weekKey, goal);
  });
  const weeks = [...byWeek.keys()].sort();

  weeks.forEach((weekKey) => {
    const goal = byWeek.get(weekKey);
    const outcome = weeklyGoalOutcome({ goal, completions, nowMs });
    const ruleId = GROWTH_RULE_IDS.WEEKLY_PATH_GOAL;
    if (!outcome.met) {
      if (outcome.reason) skipped.push(skip(ruleId, weekKey, outcome.reason));
      return;
    }
    if (outcome.metAtMs === null || outcome.metAtMs < GROWTH_REWARDS_START_MS) {
      skipped.push(skip(ruleId, weekKey, outcome.metAtMs === null ? SKIP_REASON.UNDATED : SKIP_REASON.BEFORE_START));
      return;
    }
    const goalClass = clean(goal?.classId, 120);
    if (goalClass && goalClass !== classId) {
      skipped.push(skip(ruleId, weekKey, SKIP_REASON.DIFFERENT_CLASS, { eventClassId: goalClass }));
      return;
    }
    qualifying.add(weekKey);
    awards.push(...eventAwards({
      studentId,
      classId,
      ruleId,
      sourceId: weekKey,
      points: GROWTH_REWARD_AMOUNTS.weeklyPathGoal,
      reasonLabel: `Met your My Math Path goal on time (week of ${weekKey})`,
      eventAtMs: outcome.metAtMs,
    }));
  });

  // Runs of consecutive qualifying weeks.
  const ordered = [...qualifying].sort();
  const paid = new Set(list(paidStreakWeeks).map((weekKey) => clean(weekKey, 10)).filter(isWeekKey));
  // Every week a paid block covers: the block's last week and the two before
  // it. A claimed week never counts toward a new block, so however a later
  // read cuts the runs (a week whose sessions did not load, a week that left
  // the window), no week is ever paid into a second block.
  const claimed = new Set();
  paid.forEach((end) => {
    for (let back = 0; back < PATH_STREAK_WEEKS; back += 1) claimed.add(weekKeyFor(weekStartMs(end) - back * WEEK));
  });
  const streakAwards = (lastWeek) => eventAwards({
    studentId,
    classId,
    ruleId: GROWTH_RULE_IDS.WEEKLY_PATH_STREAK,
    sourceId: lastWeek,
    points: GROWTH_REWARD_AMOUNTS.weeklyPathStreak,
    badgeCode: GROWTH_BADGES.PATH_STREAK,
    reasonLabel: 'Met your My Math Path goal on time three weeks in a row',
    eventAtMs: null,
  });
  let run = [];
  const closeRun = () => {
    if (!run.length) return;
    const first = run[0];
    const previous = weekKeyFor(weekStartMs(first) - WEEK);
    const firstIsWindowEdge = windowStartWeekKey && first <= windowStartWeekKey;
    const previousCouldQualify = previous >= startWeekKey;
    // A run whose start is out of sight counts only after a block already
    // paid inside it; with none, it is skipped rather than guessed.
    let counting = true;
    if (run.length >= PATH_STREAK_WEEKS && firstIsWindowEdge && previousCouldQualify) {
      if (!run.some((weekKey) => claimed.has(weekKey))) {
        skipped.push(skip(GROWTH_RULE_IDS.WEEKLY_PATH_STREAK, first, SKIP_REASON.RUN_START_UNKNOWN));
        run = [];
        return;
      }
      counting = false;
    }
    let open = 0;
    run.forEach((weekKey) => {
      if (paid.has(weekKey)) {
        // Re-offer a paid block: the delivery reports it already delivered,
        // or completes a half (points without badge) that was refused.
        awards.push(...streakAwards(weekKey));
      }
      if (claimed.has(weekKey)) {
        counting = true;
        open = 0;
        return;
      }
      if (!counting) return;
      open += 1;
      if (open === PATH_STREAK_WEEKS) {
        awards.push(...streakAwards(weekKey));
        open = 0;
      }
    });
    run = [];
  };
  ordered.forEach((weekKey) => {
    const last = run[run.length - 1];
    if (last && weekStartMs(weekKey) - weekStartMs(last) !== WEEK) closeRun();
    run.push(weekKey);
  });
  closeRun();

  return { awards, skipped };
};

// ---------------------------------------------------------------------------
// MASTERY
// ---------------------------------------------------------------------------

/**
 * Every skill a mastery profile document LABELS Mastered right now, sorted —
 * whatever its shape. Used only for the baseline, where counting too much can
 * only pay less.
 */
export const masteredSkills = (masteryProfile = {}) => Object.entries(
  masteryProfile?.profiles && typeof masteryProfile.profiles === 'object' ? masteryProfile.profiles : {},
)
  .filter(([, profile]) => profile?.mastery?.status === MASTERED_STATUS)
  .map(([code, profile]) => clean(profile?.teksCode || code, 120))
  .filter(Boolean)
  .sort();

/*
 * The key the evidence trigger writes: mathPath.displayAlignmentKey of a
 * `texas:` alignment key — an upper-case TEKS student expectation such as
 * A.2C, A2.4F or 8.5D (the same shape reducedWorkload.mjs accepts).
 */
export const CANONICAL_SKILL_CODE = /^[A-Z0-9]{1,4}\.\d{1,2}[A-Z]?$/;

// The thresholds updateMyMathPathMasteryFromEvidence (functions/index.js)
// requires before it writes Mastered: the one Mastered rule
// (masteryRule.mjs classifyMasteryStatus), read here, never copied.
const MASTERED_MIN_ESTIMATE = MASTERY_RULE.masteredEstimate;
const MASTERED_MIN_ELIGIBLE_EVENTS = MASTERY_RULE.masteredEvents;
const MASTERED_MIN_INDEPENDENT_SUCCESSES = MASTERY_RULE.masteredIndependentSuccesses;
const MASTERED_MIN_EFFECTIVE_WEIGHT = MASTERY_RULE.minimumWeight;
const MASTERED_MIN_DOK = MASTERY_RULE.masteredDok;

const nonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const nonNegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Whether one profile entry carries the evidence the trigger writes for a
 * skill that has REACHED Mastered, whatever it reads now: a canonical code
 * that is also the entry's own teksCode, and the evidence counts the trigger
 * writes (accumulator + dimensions, which it keeps equal), at or above the
 * Mastered thresholds, with the estimate the accumulator implies — checked
 * against the Mastered threshold only while the entry is labelled Mastered.
 * The live counts do not only grow: the trigger scores each question once
 * (masteryScoring.mjs), so a later attempt replaces an earlier one, and the
 * rescoring backfill rebuilds them. So the same checks also pass on the
 * `masteredEvidence` snapshot the trigger keeps from the moment the skill
 * first reached Mastered — a skill that slipped, or was rescored, still meets
 * them; one that never was does not. A label alone — `{ mastery: { status:
 * 'Mastered' } }` — is not mastery.
 */
const meetsMasteredThresholds = ({ effectiveWeight, weightedScoreSum, eligibleEvents, independentSuccesses, dokRepresented }) => {
  if (!nonNegative(effectiveWeight) || !nonNegative(weightedScoreSum)) return false;
  if (!nonNegativeInteger(eligibleEvents) || !nonNegativeInteger(independentSuccesses)) return false;
  if (eligibleEvents < MASTERED_MIN_ELIGIBLE_EVENTS || independentSuccesses < MASTERED_MIN_INDEPENDENT_SUCCESSES) return false;
  if (independentSuccesses > eligibleEvents) return false;
  if (effectiveWeight < MASTERED_MIN_EFFECTIVE_WEIGHT || weightedScoreSum > effectiveWeight) return false;
  return list(dokRepresented).some((value) => Number(value) >= MASTERED_MIN_DOK);
};

const snapshotShowsMastered = (snapshot) => Boolean(snapshot)
  && typeof snapshot === 'object'
  && meetsMasteredThresholds(snapshot)
  && Math.round((snapshot.weightedScoreSum / snapshot.effectiveWeight) * 100) >= MASTERED_MIN_ESTIMATE
  && finite(snapshot.at) !== null;

export const reachedMasteredEvidence = (code, entry) => {
  if (!CANONICAL_SKILL_CODE.test(String(code || ''))) return false;
  if (!entry || typeof entry !== 'object' || entry.teksCode !== code) return false;
  const accumulator = entry.accumulator || {};
  const dimensions = entry.dimensions || {};
  const { effectiveWeight, weightedScoreSum, eligibleEvents, independentSuccesses } = accumulator;
  if (!nonNegative(effectiveWeight) || !nonNegative(weightedScoreSum)) return false;
  if (!nonNegativeInteger(eligibleEvents) || !nonNegativeInteger(independentSuccesses)) return false;
  if (dimensions.eligibleGradeLevelEvents !== eligibleEvents || dimensions.independentSuccesses !== independentSuccesses) return false;
  if (independentSuccesses > eligibleEvents || weightedScoreSum > effectiveWeight) return false;
  const estimate = effectiveWeight > 0 ? Math.round((weightedScoreSum / effectiveWeight) * 100) : null;
  if (entry.mastery?.estimate !== estimate) return false;
  if (entry.mastery.status === MASTERED_STATUS && estimate < MASTERED_MIN_ESTIMATE) return false;
  if (finite(entry.updatedAt) === null) return false;
  return meetsMasteredThresholds({ ...accumulator, dokRepresented: dimensions.dokRepresented })
    || snapshotShowsMastered(entry.masteredEvidence);
};

/**
 * Whether one profile entry is a Mastered skill AS THE SERVER DERIVES IT
 * right now: the evidence above, labelled Mastered, at a Mastered estimate.
 */
export const serverDerivedMastered = (code, entry) => (
  reachedMasteredEvidence(code, entry)
  && entry.mastery.status === MASTERED_STATUS
  && entry.mastery.estimate >= MASTERED_MIN_ESTIMATE
);

/** The skills that are Mastered now, as the server derives it (serverDerivedMastered), sorted. */
export const payableMasteredSkills = (masteryProfile = {}) => Object.entries(
  masteryProfile?.profiles && typeof masteryProfile.profiles === 'object' ? masteryProfile.profiles : {},
)
  .filter(([code, entry]) => serverDerivedMastered(code, entry))
  .map(([code]) => code)
  .sort();

/**
 * The starting line for mastery rewards.
 *
 * The first sync freezes whatever is already Mastered as the baseline and
 * pays only for skills that reach Mastered after it. This predates the
 * mastered-at history and is kept unchanged across the switch to it: the
 * history begins with Job D's deploy, and its oldest week cannot say when a
 * skill already Mastered in it got there, so the baseline is still what keeps
 * a long-time student's earlier mastery from paying out as a backlog. The
 * first sync runs when the student opens MathMaster (useGrowthRewardSync),
 * before that visit's practice can add new evidence, so in practice nothing
 * earned after the start is missed.
 */
export const masteryBaselineFor = (masteryProfile = {}, nowMs = Date.now()) => ({
  skills: masteredSkills(masteryProfile),
  baselineAtMs: Number(nowMs) || null,
});

const historySkillStatus = ([, code] = []) => masteryStatusFromCode(code);

/**
 * WHEN EACH SKILL WAS FIRST MASTERED, from studentMasteryHistory (Job D,
 * functions/shared/masteryHistory.mjs): one entry per skill, its FIRST move
 * to Mastered on record, oldest first (pathGrowthEvents.mjs
 * skillMasteredEventsFromHistory, so Mastered means what the one Mastered rule
 * says it means). A skill that slips and comes back has the same first move,
 * so it can only ever be paid once.
 *
 *   { code, atMs, timeKnown }
 *
 * `timeKnown` is false for a skill already Mastered in the oldest week on
 * record: it got there at some unknown earlier time (before the history
 * began, or in a week since pruned), and `atMs` is only when that week was
 * written. Otherwise `atMs` is the time of the first snapshot that shows it
 * Mastered — the last update of the week it was mastered in, never before the
 * moment itself. Only canonical skill codes are returned.
 */
export const masteryMilestones = (masteryHistory = null, { studentId = null } = {}) => {
  const weekKeys = masteryHistoryWeekKeys(masteryHistory);
  if (!weekKeys.length) return [];
  const student = clean(studentId || masteryHistory?.studentId, 64) || 'student';
  const snapshots = weekKeys.map((weekKey) => ({
    at: finite(masteryHistory.weeks[weekKey]?.updatedAt),
    skills: masteryHistory.weeks[weekKey]?.skills,
  }));
  // Read with the same reader, so two spellings of one skill agree with it.
  const fromTheStart = new Set(skillMasteredEvents({
    studentId: student, before: {}, after: snapshots[0].skills, statusOf: historySkillStatus,
  }).map((event) => event.teksCode));
  return skillMasteredEventsFromHistory({
    studentId: student, history: snapshots, statusOf: historySkillStatus, assumeEmptyBaseline: true,
  })
    .filter((event) => CANONICAL_SKILL_CODE.test(event.teksCode))
    .map((event) => ({
      code: event.teksCode,
      atMs: fromTheStart.has(event.teksCode) ? snapshots[0].at : event.at,
      timeKnown: !fromTheStart.has(event.teksCode),
    }));
};

/**
 * Each skill newly Mastered since the baseline pays once ever — its identity
 * names the skill (`masterySkill` + the TEKS code: the same identity as
 * before the switch to the history, so a skill paid then is already paid
 * now). Reaching 5 and 10 Mastered skills earns a badge, but only when that
 * count was crossed after the baseline.
 *
 * WHICH SKILLS. The history says when (masteryMilestones); the profile says
 * the evidence is real. A skill outside the baseline pays when
 *
 *   - its first mastery on record is a move the history saw (timeKnown) on or
 *     after the start date AND on or after the moment the baseline was frozen
 *     (a skill mastered before the baseline and lost again by then was not
 *     frozen, but it was not mastered after the baseline either), and its
 *     profile entry shows the evidence of a Mastered skill
 *     (reachedMasteredEvidence). It need not still be Mastered: mastered,
 *     then slipped, pays that once.
 *   - or the history found it already Mastered (time unknown): then exactly
 *     the rule from before the switch — Mastered now as the server derives it
 *     (serverDerivedMastered), with a profile entry updated on or after the
 *     start date.
 *
 * No history yet (no mastery update since Job D's deploy) pays nothing; the
 * next update writes one and the skill pays then.
 *
 * At most MASTERY_SKILLS_PER_SYNC skills that have not been paid yet pay per
 * call, oldest mastery first; `paidSkills` names the skills whose award is
 * already delivered (the reader checks their ledger documents), so the next
 * sync moves on to the next ones. Already-paid skills are still returned,
 * under the same identity, so the delivery reports them as already
 * delivered. A count badge counts only the skills credited by now (baseline
 * skills still Mastered + paid + this sync's), so it never runs ahead of the
 * points.
 */
export const evaluateMasteryGrowth = ({
  studentId,
  classId,
  masteryHistory = null,
  masteryProfile = null,
  baseline = null,
  paidSkills = [],
  maxSkillsPerSync = MASTERY_SKILLS_PER_SYNC,
} = {}) => {
  const none = { awards: [], skipped: [] };
  if (!masteryHistory || !baseline) return none;
  const historyStudent = clean(masteryHistory.studentId, 64);
  if (historyStudent && historyStudent !== clean(studentId, 64)) return none;
  const baselineSkills = new Set(list(baseline.skills).map((code) => clean(code, 120)));
  const fresh = masteryMilestones(masteryHistory, { studentId }).filter(({ code }) => !baselineSkills.has(code));
  if (!fresh.length) return none;
  // The history names the class of the evidence that last changed it (the
  // profile's, from the same transaction). Mastery shown in a class the
  // student has left is not paid into the new class, and a history whose last
  // evidence carried no class (a Modeling Lab event, for one) is not guessed
  // into the current one — the same as the Test Cycle rules. Neither is
  // settled: the skills stay out of the baseline and pay once the history
  // next changes under the class of record. (One class for every skill, not
  // one per skill.)
  const historyClass = clean(masteryHistory.classId, 120);
  const freshCodes = fresh.map(({ code }) => code).join(',');
  if (!historyClass) return { awards: [], skipped: [skip(GROWTH_RULE_IDS.MASTERY_SKILL, freshCodes, SKIP_REASON.CLASS_UNKNOWN)] };
  if (historyClass !== classId) {
    return {
      awards: [],
      skipped: [skip(GROWTH_RULE_IDS.MASTERY_SKILL, freshCodes, SKIP_REASON.DIFFERENT_CLASS, { eventClassId: historyClass })],
    };
  }

  const awards = [];
  const skipped = [];
  const profiles = masteryProfile?.profiles && typeof masteryProfile.profiles === 'object' ? masteryProfile.profiles : {};
  const paid = new Set(list(paidSkills).map((code) => clean(code, 120)).filter((code) => code && !baselineSkills.has(code)));
  const baselineAtMs = finite(baseline.baselineAtMs);
  const limit = Math.max(0, Math.floor(Number(maxSkillsPerSync) || 0));
  let paying = 0;
  fresh.forEach(({ code, atMs, timeKnown }) => {
    const entry = profiles[code];
    let eventAtMs;
    if (timeKnown) {
      if (!reachedMasteredEvidence(code, entry)) return;
      if (atMs === null) {
        skipped.push(skip(GROWTH_RULE_IDS.MASTERY_SKILL, code, SKIP_REASON.UNDATED));
        return;
      }
      if (atMs < GROWTH_REWARDS_START_MS) {
        skipped.push(skip(GROWTH_RULE_IDS.MASTERY_SKILL, code, SKIP_REASON.BEFORE_START));
        return;
      }
      if (baselineAtMs !== null && atMs < baselineAtMs) {
        skipped.push(skip(GROWTH_RULE_IDS.MASTERY_SKILL, code, SKIP_REASON.BEFORE_BASELINE));
        return;
      }
      eventAtMs = atMs;
    } else {
      if (!serverDerivedMastered(code, entry)) return;
      eventAtMs = finite(entry.updatedAt);
      if (eventAtMs < GROWTH_REWARDS_START_MS) {
        skipped.push(skip(GROWTH_RULE_IDS.MASTERY_SKILL, code, SKIP_REASON.BEFORE_START));
        return;
      }
    }
    if (!paid.has(code)) {
      if (paying >= limit) {
        skipped.push(skip(GROWTH_RULE_IDS.MASTERY_SKILL, code, SKIP_REASON.SYNC_LIMIT));
        return;
      }
      paying += 1;
    }
    awards.push(...eventAwards({
      studentId,
      classId,
      ruleId: GROWTH_RULE_IDS.MASTERY_SKILL,
      sourceId: code,
      points: GROWTH_REWARD_AMOUNTS.masterySkill,
      reasonLabel: `Mastered ${code}`,
      eventAtMs,
    }));
  });

  const baselineCount = baselineSkills.size;
  const baselineStillMastered = payableMasteredSkills(masteryProfile || {}).filter((code) => baselineSkills.has(code)).length;
  const creditedCount = baselineStillMastered + paid.size + paying;
  MASTERY_COUNT_BADGES.forEach(({ count, badgeCode }) => {
    if (creditedCount >= count && baselineCount < count) {
      awards.push(...eventAwards({
        studentId,
        classId,
        ruleId: GROWTH_RULE_IDS.MASTERY_COUNT,
        sourceId: String(count),
        badgeCode,
        reasonLabel: `${count} skills mastered`,
      }));
    }
  });
  return { awards, skipped };
};

// ---------------------------------------------------------------------------
// ALL RULES
// ---------------------------------------------------------------------------

/**
 * Every growth award a student's records produce, for their class of record.
 *
 *   testCycles  [{ record, assignment }]  the student's Test Cycle records
 *   goals, completions, windowStartWeekKey, paidStreakWeeks, nowMs   (see evaluateWeeklyPathGrowth)
 *   masteryHistory, masteryProfile, masteryBaseline, paidMasterySkills   (see evaluateMasteryGrowth)
 *
 * Returns { awards, skipped }. Awards are de-duplicated by document id, so a
 * caller can deliver the list as-is.
 */
export const evaluateGrowthRewards = ({
  studentId,
  classId,
  testCycles = [],
  goals = [],
  completions = [],
  windowStartWeekKey = null,
  paidStreakWeeks = [],
  masteryHistory = null,
  masteryProfile = null,
  masteryBaseline = null,
  paidMasterySkills = [],
  nowMs = Date.now(),
} = {}) => {
  const student = clean(studentId, 64);
  const cls = clean(classId, 120);
  if (!student || !cls) return { awards: [], skipped: [] };

  const results = [
    ...list(testCycles).flatMap(({ record, assignment } = {}) => [
      evaluateRetestGrowth({ studentId: student, classId: cls, record, assignment }),
      evaluateCorrectionsGrowth({ studentId: student, classId: cls, record, assignment }),
    ]),
    evaluateWeeklyPathGrowth({ studentId: student, classId: cls, goals, completions, nowMs, windowStartWeekKey, paidStreakWeeks }),
    evaluateMasteryGrowth({
      studentId: student, classId: cls, masteryHistory, masteryProfile, baseline: masteryBaseline, paidSkills: paidMasterySkills,
    }),
  ];

  const seen = new Set();
  const awards = [];
  results.flatMap((result) => result.awards).forEach((award) => {
    if (seen.has(award.id)) return;
    seen.add(award.id);
    awards.push(award);
  });
  return { awards, skipped: results.flatMap((result) => result.skipped) };
};
