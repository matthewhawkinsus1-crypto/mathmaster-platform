// Which family a five-question session asks next.
//
// THE FIRST BUG THIS REPLACED. Selection narrowed to the single nearest
// difficulty band and then cycled positionally inside it. A standard with one
// Band 2, two Band 3, one Band 4 and one Band 5 family, offered to a student
// whose readiness says Band 3, would alternate between the same two Band 3
// items for the whole session — five questions, two distinct problems, and
// three families the student never saw.
//
// THE SECOND. Once polished content started arriving beside the placeholder
// content it replaces, difficulty-first selection would hand a student the
// placeholder whenever its band matched more exactly. A text box asking for a
// letter is not a better question than a graphing task one band away, and a
// selector that thinks it is will keep the old bank alive forever.
//
// THE RULE, in order:
//
//   1. QUALITY FIRST. A production-quality family outranks a placeholder,
//      whatever the bands say. This is the only axis that jumps the queue,
//      because the others are all preferences and this one is the difference
//      between practice and typing.
//   2. Then an unused family — a student who meets the same problem twice in
//      one session has been told the bank is thin.
//   3. Then variety: a representation and a kind of thinking the session has
//      not used yet. Five symbolic procedures in a row is five questions about
//      one thing.
//   4. Then difficulty, closest to the student's readiness band, and below
//      before above at equal distance, because dropping to easier work is the
//      kinder direction when everything at their level is used.
//   5. Only when every family has been used, repeat — the least used, longest
//      ago, rather than the first one again.
//
// Secure and server-side: nothing the browser sends selects a question.

import { QUESTION_QUALITY, auditPathQuestionQuality } from './pathQuestionQuality.mjs';
import { bestPathVariantForTarget } from './pathQuestionGeneration.mjs';

const bandOf = (question) => {
  const band = Number(question?.difficultyBand);
  return Number.isFinite(band) ? band : 3;
};

const dokOf = (question) => {
  const dok = Number(question?.dok);
  return Number.isFinite(dok) ? dok : 2;
};

// How much a family is worth on the quality axis. Deliberately coarse: the
// selector needs "is this the real thing or a placeholder", not a score.
const QUALITY_RANK = {
  [QUESTION_QUALITY.PRODUCTION]: 0,
  [QUESTION_QUALITY.CANDIDATE]: 1,
  [QUESTION_QUALITY.OPERATIONAL]: 2,
  [QUESTION_QUALITY.BLOCKED]: 3,
};

// Production and Candidate are both real teachable questions. Operational means
// placeholder-only, and Blocked is not acceptable. This safety tier lets the
// selector exhaust unused teachable families before repeating a polished one,
// without ever choosing a placeholder merely to avoid a repeat.
const QUALITY_SAFETY_TIER = {
  [QUESTION_QUALITY.PRODUCTION]: 0,
  [QUESTION_QUALITY.CANDIDATE]: 0,
  [QUESTION_QUALITY.OPERATIONAL]: 1,
  [QUESTION_QUALITY.BLOCKED]: 2,
};

/**
 * Order candidates the way selection should consider them.
 *
 * Exposed so a test — and a teacher-facing explanation — can see the whole
 * ranking rather than only the winner.
 *
 * `usedRepresentations` / `usedTaskTypes` are what THIS session has already
 * asked. They are sets of strings; a plain array works too.
 */
export const rankCandidates = (candidates = [], {
  preferredBand = 3,
  // COGNITIVE DEMAND WAS NOT A SELECTION CRITERION AT ALL.
  //
  // The engine decides a DOK for every session, stores it, reports it to
  // teachers and records it on the evidence — and selection never looked at it.
  // Only the band reached delivery, so "DOK and difficulty adapt
  // independently" was true in the reasoning and half-true in practice: a
  // student who had earned deeper thinking got the same complexity band with
  // whatever demand happened to be attached.
  //
  // Null means "no preference", which is what every caller that has not been
  // updated passes — so behaviour is unchanged until a caller opts in.
  preferredDok = null,
  usage = {},
  usedRepresentations = [],
  usedTaskTypes = [],
} = {}) => {
  const wantsDok = Number.isFinite(Number(preferredDok));
  const seenRepresentations = new Set(usedRepresentations);
  const seenTaskTypes = new Set(usedTaskTypes);

  return [...candidates].map((question, index) => {
    const timesUsed = Number(usage[question.id]?.timesUsed ?? usage[question.id] ?? 0) || 0;
    const lastUsedAt = Number(usage[question.id]?.lastUsedAt ?? 0) || 0;
    // A variant-bearing family is ranked by the effective row it would issue
    // for THIS target, not by the base family's metadata. Without this, a
    // family whose base is 2:3 but whose Challenge variant is 3:4 looks like a
    // 2:3 family during selection and only becomes 3:4 (or, previously,
    // randomly something else) after it has already won or lost.
    const variantMatch = bestPathVariantForTarget(question, {
      preferredDok: wantsDok ? Number(preferredDok) : null,
      preferredDifficultyBand: preferredBand,
    });
    const effectiveQuestion = variantMatch.template || question;
    const band = bandOf(effectiveQuestion);
    const distance = Math.abs(band - preferredBand);
    const dok = dokOf(effectiveQuestion);
    const dokDistance = wantsDok ? Math.abs(dok - Number(preferredDok)) : 0;
    const audit = auditPathQuestionQuality(effectiveQuestion);
    return {
      question,
      effectiveQuestion,
      effectiveVariantIndex: variantMatch.variantIndex,
      effectiveCoverageKey: variantMatch.variant?.coverageKey || null,
      index,
      band,
      distance,
      dok,
      dokDistance,
      timesUsed,
      lastUsedAt,
      quality: audit.level,
      qualityRank: QUALITY_RANK[audit.level] ?? 3,
      qualitySafetyTier: QUALITY_SAFETY_TIER[audit.level] ?? 2,
      qualityBlockers: audit.blockers.map((issue) => issue.code),
      representation: audit.representation,
      taskType: audit.taskType,
      representationRepeat: seenRepresentations.has(audit.representation) ? 1 : 0,
      taskTypeRepeat: audit.taskType && seenTaskTypes.has(audit.taskType) ? 1 : 0,
    };
  }).sort((a, b) => (
    // Never use placeholder/blocked content merely to avoid a repeat.
    a.qualitySafetyTier - b.qualitySafetyTier
    // Within the teachable pool, unused before used. This preserves the
    // five-family session contract even when one unused family is Candidate
    // while a previously used family is Production.
    || (a.timesUsed === 0 ? 0 : 1) - (b.timesUsed === 0 ? 0 : 1)
    // Then prefer the more polished family.
    || a.qualityRank - b.qualityRank
    // A representation this session has not used yet.
    || a.representationRepeat - b.representationRepeat
    // A kind of thinking this session has not used yet.
    || a.taskTypeRepeat - b.taskTypeRepeat
    // Then how far from the readiness band. Complexity comes before demand
    // because it governs whether the student can engage with the question at
    // all; asking the right KIND of thinking at an unreachable complexity
    // helps nobody.
    || a.distance - b.distance
    // At equal distance, the easier side first.
    || (a.band - preferredBand) - (b.band - preferredBand)
    // Then how far from the requested cognitive demand.
    || a.dokDistance - b.dokDistance
    // Among used families, least used and least recently used.
    || a.timesUsed - b.timesUsed
    || a.lastUsedAt - b.lastUsedAt
    // Deterministic tiebreak, so the same session state gives the same question.
    || a.index - b.index
  ));
};

/**
 * The next family, and why it was chosen.
 *
 * `usage` is what the session has already issued: `{ [bankId]: { timesUsed,
 * lastUsedAt } }`. A bare number is accepted too, so an older session document
 * that stored only counts still selects sensibly.
 */
export const selectNextFamily = (candidates = [], {
  preferredBand = 3,
  preferredDok = null,
  usage = {},
  usedRepresentations = [],
  usedTaskTypes = [],
} = {}) => {
  if (!candidates.length) return null;
  const ranked = rankCandidates(candidates, {
    preferredBand, preferredDok, usage, usedRepresentations, usedTaskTypes,
  });
  const chosen = ranked[0];
  const unusedRemaining = ranked.filter((entry) => entry.timesUsed === 0).length;

  const reason = chosen.timesUsed > 0
    ? 'all_families_used_repeating_least_used'
    : chosen.quality === QUESTION_QUALITY.PRODUCTION && chosen.representationRepeat === 0
      ? 'production_family_with_a_new_representation'
      : chosen.quality === QUESTION_QUALITY.PRODUCTION
        ? 'production_family'
        : chosen.distance === 0
          ? 'unused_family_in_preferred_band'
          : 'unused_family_in_adjacent_band';

  return {
    question: chosen.question,
    band: chosen.band,
    preferredBand,
    dok: chosen.dok,
    preferredDok: Number.isFinite(Number(preferredDok)) ? Number(preferredDok) : null,
    dokDistanceFromPreferred: chosen.dokDistance,
    quality: chosen.quality,
    representation: chosen.representation,
    taskType: chosen.taskType,
    effectiveVariantIndex: chosen.effectiveVariantIndex,
    effectiveCoverageKey: chosen.effectiveCoverageKey,
    // Why, in terms a teacher-facing explanation can use directly.
    reason,
    distanceFromPreferred: chosen.distance,
    unusedRemaining: Math.max(0, unusedRemaining - 1),
    isRepeat: chosen.timesUsed > 0,
    repeatsRepresentation: chosen.representationRepeat === 1,
  };
};

/** The usage record after issuing a family. */
export const recordFamilyUse = (usage = {}, bankId, now = Date.now()) => {
  if (!bankId) return usage;
  const previous = usage[bankId];
  const timesUsed = Number(previous?.timesUsed ?? previous ?? 0) || 0;
  return { ...usage, [bankId]: { timesUsed: timesUsed + 1, lastUsedAt: now } };
};

/**
 * Can this standard supply a full session without repeating?
 *
 * The reason MathMaster's minimum is five families rather than one: a session
 * is five questions, and a student who meets the same problem twice in one
 * sitting has been told the bank is thin, whatever the coverage screen says.
 */
export const canFillSessionWithoutRepeats = (candidates = [], requiredQuestions = 5) => (
  candidates.length >= requiredQuestions
);

/**
 * Can this standard supply a session that is varied as well as non-repeating?
 *
 * Used by the coverage audit rather than at issue time — a thin standard still
 * runs, it is simply reported honestly.
 */
export const sessionVarietyAvailable = (candidates = []) => {
  const audits = candidates.map((question) => auditPathQuestionQuality(question));
  return {
    representations: [...new Set(audits.map((audit) => audit.representation))],
    taskTypes: [...new Set(audits.map((audit) => audit.taskType).filter(Boolean))],
    productionFamilies: audits.filter((audit) => audit.level === QUESTION_QUALITY.PRODUCTION).length,
  };
};
