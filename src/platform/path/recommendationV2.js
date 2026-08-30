// Recommendation Engine V2 — reasons, not just the lowest percentage.
//
// WHAT V1 DID, AND WHY THAT WAS NOT ENOUGH. The existing engine
// (`recommendationEngine.js`) scores eight signals and ranks skills. It is
// sound as far as it goes, and V2 does NOT replace it — V2 consumes its rows.
// What it could not do:
//
//   - It had no memory. Nothing suppressed a skill worked yesterday, so a
//     mastered standard stayed eligible all year. Its one counterweight was a
//     -0.4 cliff at 90% mastery.
//   - `avoidanceBySkill` was wired into the scorer and fed by nobody, so the
//     one variety term in the whole engine was permanently zero.
//   - It picked the top N independently. Four separately excellent choices can
//     be four ways of solving an equation, which is a monotonous week.
//   - A recommendation named a TEKS and nothing else. Difficulty was bound much
//     later, on the server, and DOK never at all — so "same standard, easier
//     version" was not something the engine could ask for.
//
// V2 adds the four missing pieces: a lifecycle with cooldowns, a purpose, a
// full specification (TEKS + purpose + context + DOK + difficulty), and a
// set-level optimiser that trades a little individual score for a week that is
// worth doing.
//
// Pure. The clock is injected.

import {
  GAP, INSTRUCTIONAL_BAND, diagnoseGaps,
} from '../profile/studentLearningProfile.js';
import { isFrameworkSkillLaunchable } from '../../../functions/shared/pathCoverage.mjs';

const DAY = 24 * 60 * 60 * 1000;

/** Why this skill is being recommended. A TEKS alone never said. */
export const PURPOSE = Object.freeze({
  CURRENT_LEARNING: 'currentLearning',
  RESPONSIVE_REVIEW: 'responsiveReview',
  FOUNDATION_BRIDGE: 'foundationBridge',
  RETENTION: 'retention',
  TRANSFER: 'transfer',
  EXTENSION: 'extension',
});

export const PURPOSE_LABEL = Object.freeze({
  [PURPOSE.CURRENT_LEARNING]: 'Current learning',
  [PURPOSE.RESPONSIVE_REVIEW]: 'Review',
  [PURPOSE.FOUNDATION_BRIDGE]: 'Foundation Bridge',
  [PURPOSE.RETENTION]: 'Retention check',
  [PURPOSE.TRANSFER]: 'Transfer',
  [PURPOSE.EXTENSION]: 'Challenge',
});

/**
 * Student-facing sentences. Concise, and about the student's learning rather
 * than about the engine's reasoning.
 */
export const STUDENT_EXPLANATION = Object.freeze({
  [PURPOSE.CURRENT_LEARNING]: 'This supports what you are learning right now.',
  [PURPOSE.RESPONSIVE_REVIEW]: 'Review, after how your recent work on this went.',
  [PURPOSE.FOUNDATION_BRIDGE]: 'This supports the skill you are working toward. Strengthen it here, then you will go back.',
  [PURPOSE.RETENTION]: 'A quick check that this one has stuck.',
  [PURPOSE.TRANSFER]: 'You know this well in class — now try it the way the exam asks it.',
  [PURPOSE.EXTENSION]: 'You have shown this, so here is a version that goes further.',
});

/** Where a student stands on one standard. Not consumed; it cycles. */
export const LIFECYCLE = Object.freeze({
  NOT_INTRODUCED: 'notYetIntroduced',
  CURRENT: 'currentLearning',
  DEVELOPING: 'developing',
  MASTERED: 'mastered',
  RETENTION_DUE: 'retentionDue',
  RETAINED: 'retained',
});

/**
 * How long a standard rests before it may come round again.
 *
 * THE FAILURE THIS PREVENTS: "a student should not keep solving equations all
 * year merely because equation standards remain eligible." A developing skill
 * comes back within days; a repeatedly retained one is strongly suppressed
 * until something real calls it back.
 */
export const COOLDOWN_DAYS = Object.freeze({
  [LIFECYCLE.DEVELOPING]: 2,
  [LIFECYCLE.CURRENT]: 1,
  [LIFECYCLE.MASTERED]: 18,
  [LIFECYCLE.RETAINED]: 45,
  [LIFECYCLE.RETENTION_DUE]: 0,
  [LIFECYCLE.NOT_INTRODUCED]: 0,
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Where a standard sits in the student's lifecycle for it.
 *
 * Reads the records that already exist — the server's per-TEKS mastery and the
 * retention schedule — rather than introducing a fifth status vocabulary.
 */
export const resolveLifecycle = ({ masteryEntry = null, retentionEntry = null } = {}) => {
  const status = String(retentionEntry?.status || '');
  if (['due', 'overdue', 'concern'].includes(status)) return LIFECYCLE.RETENTION_DUE;
  if (Number(retentionEntry?.successfulCheckCount || 0) >= 2) return LIFECYCLE.RETAINED;

  const masteryStatus = String(masteryEntry?.mastery?.status || '');
  if (!masteryEntry || masteryStatus === 'Not Enough Evidence') {
    return Number(masteryEntry?.dimensions?.eligibleGradeLevelEvents || 0) > 0
      ? LIFECYCLE.CURRENT
      : LIFECYCLE.NOT_INTRODUCED;
  }
  if (masteryStatus === 'Mastered') return LIFECYCLE.MASTERED;
  if (['Secure', 'Developing', 'Needs Attention'].includes(masteryStatus)) return LIFECYCLE.DEVELOPING;
  return LIFECYCLE.CURRENT;
};

/**
 * Is this standard eligible right now, and if not, why not?
 *
 * The "why not" is as important as the "why": a teacher looking at the
 * simulator needs to see what was deliberately held back, not just what won.
 */
export const evaluateEligibility = ({
  lifecycle,
  lastPracticedAt = null,
  now = Date.now(),
  teacherPinned = false,
  cooldownDays = COOLDOWN_DAYS,
}) => {
  // A teacher asking for a skill outranks every cooldown the engine has.
  if (teacherPinned) return { eligible: true, reason: 'teacher_pinned' };

  const required = Number(cooldownDays[lifecycle] ?? 0);
  if (!required) return { eligible: true, reason: 'no_cooldown_for_this_state' };
  if (!lastPracticedAt) return { eligible: true, reason: 'never_practiced' };

  const daysSince = (now - Number(lastPracticedAt)) / DAY;
  if (daysSince >= required) return { eligible: true, reason: 'cooldown_elapsed', daysSince };
  return {
    eligible: false,
    reason: 'cooling_down',
    daysSince,
    daysRemaining: Math.ceil(required - daysSince),
    lifecycle,
  };
};

/**
 * What kind of work this skill should be, given where the student is.
 *
 * Purpose is decided BEFORE difficulty and DOK, because it changes what the
 * right difficulty and DOK are: a retention check is a light look at something
 * known, a foundation bridge is deliberately accessible.
 */
export const resolvePurpose = ({
  lifecycle,
  isCurrentInstruction = false,
  isPrerequisiteOfCurrent = false,
  transferGapFramework = null,
  masteryEstimate = null,
}) => {
  if (lifecycle === LIFECYCLE.RETENTION_DUE) return PURPOSE.RETENTION;
  if (isPrerequisiteOfCurrent) return PURPOSE.FOUNDATION_BRIDGE;
  if (transferGapFramework) return PURPOSE.TRANSFER;
  if (lifecycle === LIFECYCLE.MASTERED || (masteryEstimate != null && masteryEstimate >= 90)) {
    return PURPOSE.EXTENSION;
  }
  if (isCurrentInstruction) return PURPOSE.CURRENT_LEARNING;
  return PURPOSE.RESPONSIVE_REVIEW;
};

/**
 * WHAT THE CONTENT ACTUALLY AUTHORS.
 *
 * Auditing all 5,150 generator templates: DOK runs 1-3 and difficulty band runs
 * 1-4. Nothing anywhere is authored at band 5. That matters because a student
 * who is stable at band 4 earns an extension, `stable + 1` asks for band 5, and
 * no template can answer — which the student meets as an empty or failed
 * session, not as "there is nothing harder here".
 *
 * Requesting inside the authored range is the difference between the engine
 * degrading honestly and the engine breaking. These are the OBSERVED ceilings,
 * not aspirations: if the bank later authors band 5, raise this and the
 * audit test that pins it will tell you to.
 */
export const AUTHORED_CEILING = Object.freeze({ dok: 3, difficultyBand: 4 });

/**
 * The difficulty and DOK this session should ask for.
 *
 * THE RULE THAT MATTERS MOST HERE: after a failure at high difficulty, try the
 * SAME standard lower before concluding anything about prerequisites. A wrong
 * answer to a Band 4 question is evidence about Band 4, not about grade 6.
 */
export const resolveTarget = ({
  purpose,
  profile = null,
  recentFailureBand = null,
  authoredMaxDok = AUTHORED_CEILING.dok,
  authoredMaxBand = AUTHORED_CEILING.difficultyBand,
}) => {
  const stable = profile?.difficultyProfile?.stableBand ?? 3;
  const band = (value) => Math.max(1, Math.min(authoredMaxBand, value));

  // A miss at a band above where the student is stable is a complexity signal.
  // Drop to the stable band and hold the cognitive demand steady, so the next
  // result actually distinguishes the two axes.
  if (recentFailureBand != null && recentFailureBand > stable) {
    return {
      difficultyBand: band(stable),
      dok: 2,
      reason: 'retry_same_standard_at_a_manageable_complexity',
    };
  }

  if (purpose === PURPOSE.FOUNDATION_BRIDGE) {
    // A bridge is meant to be crossable. It is not the place to also raise the
    // difficulty.
    return { difficultyBand: band(Math.min(3, stable)), dok: 2, reason: 'bridge_should_be_accessible' };
  }
  if (purpose === PURPOSE.RETENTION) {
    return { difficultyBand: band(stable), dok: 2, reason: 'retention_checks_what_was_held' };
  }
  if (purpose === PURPOSE.EXTENSION) {
    // Deeper, not merely longer: the cognitive demand rises before the numbers
    // get uglier.
    return {
      // Capped at what exists. A student already at the authored ceiling gets a
      // deeper task rather than a session with no questions in it.
      difficultyBand: band(stable + 1),
      dok: Math.min(authoredMaxDok, 3),
      reason: 'extension_raises_demand_before_complexity',
    };
  }
  if (purpose === PURPOSE.TRANSFER) {
    return { difficultyBand: band(Math.max(2, stable)), dok: Math.min(authoredMaxDok, 3), reason: 'exam_style_application' };
  }

  // Ordinary current work sits at the student's stable band. Difficulty is not
  // a reward — it moves when the current band has stopped telling us anything.
  const dok3 = profile?.dokProfile?.['3'];
  const readyForMoreDemand = dok3?.confident && dok3.accuracy >= 0.7;
  return {
    difficultyBand: band(stable),
    dok: readyForMoreDemand ? Math.min(authoredMaxDok, 3) : 2,
    reason: readyForMoreDemand ? 'reasoning_evidence_supports_more_demand' : 'core_expectation_at_stable_band',
  };
};

/**
 * Score one candidate. Positive reasons and suppressions, kept separate so both
 * are reportable.
 *
 * "Why should I recommend this?" and "why should I deliberately not?" are two
 * questions, and an engine that only answers the first recommends the same four
 * things forever.
 */
export const scoreCandidate = ({
  baseScore = 0,
  purpose,
  lifecycle,
  isCurrentInstruction = false,
  hasOpenAssignment = false,
  teacherPriority = false,
  teacherPinned = false,
  recentIndependentAccuracy = null,
  gapTypes = [],
}) => {
  const positive = {};
  const negative = {};

  positive.engineScore = clamp01(baseScore) * 0.30;
  if (isCurrentInstruction) positive.currentInstruction = 0.22;
  if (hasOpenAssignment) positive.openAssignment = 0.14;
  if (teacherPinned) positive.teacherPinned = 0.40;
  else if (teacherPriority) positive.teacherPriority = 0.18;
  if (purpose === PURPOSE.RETENTION) positive.retentionDue = 0.20;
  if (purpose === PURPOSE.FOUNDATION_BRIDGE) positive.blockingPrerequisite = 0.24;
  if (purpose === PURPOSE.TRANSFER) positive.transferGap = 0.18;
  if (recentIndependentAccuracy != null && recentIndependentAccuracy < 0.5) {
    positive.weakRecentEvidence = 0.16;
  }
  if (gapTypes.includes(GAP.STRATEGIC) && purpose === PURPOSE.CURRENT_LEARNING) {
    positive.addressesDiagnosedGap = 0.10;
  }

  // Suppression. A standard held for a good reason is not a standard the
  // student has finished with.
  if (lifecycle === LIFECYCLE.RETAINED) negative.repeatedlyRetained = -0.30;
  else if (lifecycle === LIFECYCLE.MASTERED && purpose !== PURPOSE.EXTENSION) {
    negative.alreadyMastered = -0.22;
  }

  const score = Object.values(positive).reduce((a, b) => a + b, 0)
    + Object.values(negative).reduce((a, b) => a + b, 0);

  return {
    score: Number(Math.max(0, Math.min(1.5, score)).toFixed(4)),
    positive,
    negative,
  };
};

/**
 * The weekly mix a student should get, from their band.
 *
 * "Adapt the MIX, not the student's permanent identity." A below-level student
 * still needs course-level work; an above-level student still needs retention.
 */
export const weeklyMixFor = ({ band, honors = false, sessions = 4 }) => {
  const count = Math.max(0, Math.floor(Number(sessions) || 0));

  // Honors differentiation must survive a teacher reducing the weekly session
  // count. The previous implementation authored five desired purposes and then
  // sliced the array; at four sessions that silently dropped EXTENSION because
  // TRANSFER happened to appear first in the ordering. That let CCMR transfer
  // replace the student's course Challenge, even though the two are deliberately
  // separate Path purposes.
  if (honors) {
    const slots = band === INSTRUCTIONAL_BAND.BELOW
      // Keep contact with the course, repair the blocking foundation, and still
      // revisit prior learning. Challenge/transfer wait until the foundation holds.
      ? [PURPOSE.CURRENT_LEARNING, PURPOSE.FOUNDATION_BRIDGE, PURPOSE.RETENTION]
      // In a compressed Honors week, preserve course Challenge before adding
      // the extra CCMR transfer slot. A five-session week then restores the
      // second current-learning session.
      : [PURPOSE.CURRENT_LEARNING, PURPOSE.RETENTION, PURPOSE.EXTENSION];

    if (band !== INSTRUCTIONAL_BAND.BELOW && count >= 4) slots.push(PURPOSE.TRANSFER);
    if (count >= 5) slots.splice(1, 0, PURPOSE.CURRENT_LEARNING);
    while (slots.length < count) slots.push(PURPOSE.CURRENT_LEARNING);
    return slots.slice(0, count);
  }

  const mix = {
    [PURPOSE.CURRENT_LEARNING]: 2,
    [PURPOSE.RESPONSIVE_REVIEW]: 1,
    [PURPOSE.RETENTION]: 1,
  };

  if (band === INSTRUCTIONAL_BAND.BELOW) {
    // Repair, but never at the cost of contact with the course.
    mix[PURPOSE.FOUNDATION_BRIDGE] = 1;
  }
  if (band === INSTRUCTIONAL_BAND.ABOVE) {
    mix[PURPOSE.EXTENSION] = 1;
    mix[PURPOSE.RESPONSIVE_REVIEW] = 0;
  }

  // Trim or pad to the requested session count, always keeping current-course
  // work first.
  const order = [PURPOSE.CURRENT_LEARNING, PURPOSE.FOUNDATION_BRIDGE, PURPOSE.RETENTION,
    PURPOSE.RESPONSIVE_REVIEW, PURPOSE.TRANSFER, PURPOSE.EXTENSION];
  const slots = [];
  order.forEach((purpose) => {
    for (let i = 0; i < (mix[purpose] || 0); i += 1) slots.push(purpose);
  });
  while (slots.length < count) slots.push(PURPOSE.CURRENT_LEARNING);
  return slots.slice(0, count);
};

/**
 * The cap on below-course work in a normal week.
 *
 * "Do not create remediation traps." At most half a normal weekly goal may be
 * below-course, unless the teacher has deliberately chosen intervention mode.
 */
export const foundationBridgeCap = (sessions, interventionMode = false) => (
  interventionMode ? sessions : Math.floor(sessions / 2)
);

/**
 * Choose the WEEK, not the top N.
 *
 * Four individually excellent recommendations can be four ways of rearranging
 * an equation. This walks the intended mix and, for each slot, takes the best
 * remaining candidate after applying saturation penalties for a standard,
 * strand or representation the week has already used.
 */
export const optimizeWeeklySet = ({
  candidates = [],
  sessions = 4,
  band = INSTRUCTIONAL_BAND.ON,
  honors = false,
  interventionMode = false,
  saturation = { strand: 0.35, representation: 0.2 },
}) => {
  const wanted = weeklyMixFor({ band, honors, sessions });
  const bridgeCap = foundationBridgeCap(sessions, interventionMode);

  const pool = list(candidates).filter((entry) => entry?.eligibility?.eligible !== false);
  const chosen = [];
  const usedStrands = new Map();
  const usedRepresentations = new Map();
  const usedSkills = new Set();
  let bridges = 0;

  const seat = (candidate, slotPurpose, adjustedScore) => {
    chosen.push({ ...candidate, slotPurpose, adjustedScore });
    usedSkills.add(candidate.skillId);
    usedStrands.set(candidate.strand, (usedStrands.get(candidate.strand) || 0) + 1);
    usedRepresentations.set(candidate.representation, (usedRepresentations.get(candidate.representation) || 0) + 1);
    if (candidate.purpose === PURPOSE.FOUNDATION_BRIDGE) bridges += 1;
  };

  // A TEACHER PIN IS SEATED BEFORE THE ENGINE CHOOSES ANYTHING.
  //
  // Waiving the cooldown was not enough: a pinned standard still had to outscore
  // whatever the engine liked, so a teacher could pin a skill and simply not see
  // it. An override that competes is not an override. Pins take slots off the
  // top; the mix is then built from what is left.
  const pinned = pool
    .filter((entry) => entry.teacherPinned)
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)
      || String(a.skillId).localeCompare(String(b.skillId)))
    .slice(0, sessions);
  pinned.forEach((entry) => {
    if (usedSkills.has(entry.skillId)) return;
    seat(entry, entry.purpose, Number(entry.score) || 0);
  });

  const penalizedScore = (candidate) => {
    let score = Number(candidate.score) || 0;
    // An UNKNOWN key is not a shared key. Where the content has not declared a
    // representation, every candidate would otherwise land in one bucket and
    // every pick after the first would be penalised for a fact nobody asserted.
    if (candidate.strand) score -= (usedStrands.get(candidate.strand) || 0) * saturation.strand;
    if (candidate.representation) {
      score -= (usedRepresentations.get(candidate.representation) || 0) * saturation.representation;
    }
    return score;
  };

  // Pins have already taken their slots; the mix fills what remains.
  wanted.slice(0, Math.max(0, sessions - chosen.length)).forEach((purpose) => {
    // Prefer a candidate whose own purpose matches the slot; fall back to
    // anything eligible rather than leaving a session empty.
    const matching = pool.filter((entry) => (
      !usedSkills.has(entry.skillId)
      && entry.purpose === purpose
      && (purpose !== PURPOSE.FOUNDATION_BRIDGE || bridges < bridgeCap)
    ));
    const fallback = pool.filter((entry) => (
      !usedSkills.has(entry.skillId)
      && (entry.purpose !== PURPOSE.FOUNDATION_BRIDGE || bridges < bridgeCap)
    ));
    const bucket = matching.length ? matching : fallback;
    if (!bucket.length) return;

    const best = [...bucket].sort((a, b) => penalizedScore(b) - penalizedScore(a)
      || String(a.skillId).localeCompare(String(b.skillId)))[0];

    seat(best, purpose, Number(penalizedScore(best).toFixed(4)));
  });

  return {
    sessions: chosen,
    requestedMix: wanted,
    bridgeCount: bridges,
    bridgeCap,
    // What the week actually looks like, so a teacher screen can show the
    // spread rather than a list of four codes.
    diversity: {
      skills: new Set(chosen.map((entry) => entry.skillId)).size,
      strands: new Set(chosen.map((entry) => entry.strand)).size,
      purposes: new Set(chosen.map((entry) => entry.purpose)).size,
      representations: new Set(chosen.map((entry) => entry.representation)).size,
    },
  };
};

/**
 * Turn engine rows into full recommendations — TEKS, purpose, context, DOK and
 * difficulty — then choose the week.
 *
 * This is the entry point. Everything above is exported so a teacher-facing
 * simulator can show each step rather than only the answer.
 */

export const publishedTransferFrameworkFor = ({ coverage = undefined, teksCode, framework }) => {
  if (!framework) return null;
  // Preserve pure legacy callers that intentionally do not have a coverage
  // input. Production passes an explicit index (or null while it is loading),
  // and therefore fails closed.
  if (coverage === undefined) return framework;
  return isFrameworkSkillLaunchable(coverage, teksCode, framework) ? framework : null;
};

export const buildWeeklyRecommendations = ({
  rows = [],
  profile = null,
  masteryProfilesByTeks = {},
  retentionSchedules = {},
  lastPracticedByTeks = {},
  currentInstructionSkills = [],
  openAssignmentSkills = [],
  pinnedSkills = [],
  prerequisiteOfCurrent = [],
  sessions = 4,
  honors = false,
  interventionMode = false,
  coverage = undefined,
  now = Date.now(),
} = {}) => {
  const currentSet = new Set(currentInstructionSkills.map(String));
  const openSet = new Set(openAssignmentSkills.map(String));
  const pinnedSet = new Set(pinnedSkills.map(String));
  const prereqSet = new Set(prerequisiteOfCurrent.map(String));
  const gapTypes = diagnoseGaps(profile).map((gap) => gap.type);
  const transferGaps = diagnoseGaps(profile).filter((gap) => gap.type === GAP.TRANSFER);

  const candidates = list(rows).map((row) => {
    const code = String(row.teksCode || row.code || row.skillId || '');
    const transferGapFramework = publishedTransferFrameworkFor({
      coverage,
      teksCode: code,
      framework: transferGaps[0]?.framework || null,
    });
    const masteryEntry = masteryProfilesByTeks[code] || null;
    const retentionEntry = retentionSchedules[code] || null;
    const lifecycle = resolveLifecycle({ masteryEntry, retentionEntry });
    const teacherPinned = pinnedSet.has(String(row.skillId)) || pinnedSet.has(code);

    const eligibility = evaluateEligibility({
      lifecycle,
      lastPracticedAt: lastPracticedByTeks[code] ?? null,
      now,
      teacherPinned,
    });

    const purpose = resolvePurpose({
      lifecycle,
      isCurrentInstruction: currentSet.has(String(row.skillId)) || currentSet.has(code),
      isPrerequisiteOfCurrent: prereqSet.has(String(row.skillId)) || prereqSet.has(code),
      transferGapFramework,
      masteryEstimate: masteryEntry?.mastery?.estimate ?? null,
    });

    const target = resolveTarget({
      purpose,
      profile,
      recentFailureBand: row.recentFailureBand ?? null,
    });

    const scored = scoreCandidate({
      baseScore: row.score,
      purpose,
      lifecycle,
      isCurrentInstruction: currentSet.has(String(row.skillId)) || currentSet.has(code),
      hasOpenAssignment: openSet.has(String(row.skillId)) || openSet.has(code),
      teacherPriority: Boolean(row.teacherPriority),
      teacherPinned,
      recentIndependentAccuracy: row.recentAccuracy ?? null,
      gapTypes,
    });

    return {
      skillId: row.skillId,
      teksCode: code,
      // The name a STUDENT sees — "Solving linear equations", never "A.5A".
      // Carried from the row rather than looked up here, so this module stays
      // pure and the label has exactly one source.
      studentLabel: row.studentLabel || null,
      label: row.label || null,
      teacherPinned,
      // Fall back to the standard's PARENT grouping ("A.12A" -> "A.12"), not to
      // the sub-letter. `code.split('.')[1]` yielded "12A", a key unique to one
      // skill, so nothing ever collided and the saturation penalty this feeds
      // was silently inert — the same class of dead input as V1's
      // `avoidanceBySkill`. Null where there is genuinely no grouping: an
      // unknown key must not masquerade as a shared one.
      strand: row.strand || (code.includes('.') ? code.replace(/[A-Za-z]+$/, '') : null),
      representation: row.representation || null,
      lifecycle,
      eligibility,
      purpose,
      purposeLabel: PURPOSE_LABEL[purpose],
      studentExplanation: STUDENT_EXPLANATION[purpose],
      context: purpose === PURPOSE.TRANSFER ? (transferGapFramework || 'course') : 'course',
      dok: target.dok,
      difficultyBand: target.difficultyBand,
      targetReason: target.reason,
      score: scored.score,
      scoreTerms: scored,
    };
  });

  const week = optimizeWeeklySet({ candidates, sessions, band: profile?.instructionalBand, honors, interventionMode });

  return {
    ...week,
    // Everything considered, including what was held back and why. A teacher
    // needs the suppressions as much as the selections.
    considered: candidates,
    suppressed: candidates.filter((entry) => !entry.eligibility.eligible),
  };
};

export default buildWeeklyRecommendations;
