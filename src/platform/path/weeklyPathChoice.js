import { PURPOSE } from './recommendationV2.js';

/*
 * THE WEEK IS A RECOMMENDATION THE STUDENT CAN ACT ON, NOT A PRESCRIPTION.
 *
 * MathMaster picks what a student most needs and says why. That is worth
 * keeping. What was missing is the other half: a student who reads the reason
 * and wants to work on something else in that slot had no way to say so, so the
 * whole week read as handed down.
 *
 * This module supplies the missing half, under one hard constraint:
 *
 *   SWAPPING AN ALTERNATIVE MUST NOT CHANGE THE SLOT'S IDENTITY.
 *
 * `weeklySlotKey` is frozen when the week is built. It travels to the server on
 * every launch and is what stops one completed session from filling two rows
 * (see matchWeeklyGoalCompletions). If choosing an alternative minted a new key,
 * every in-flight week would silently stop counting, and students mid-week on
 * the live site would watch finished work fall off their progress bar.
 *
 * So a chosen alternative changes WHAT the student practises and keeps WHICH
 * slot it fills. The chosen skill is recorded alongside, so a teacher can still
 * see what actually happened.
 *
 * Alternatives are drawn from the engine's own considered pool and must share
 * the slot's instructional purpose. A "choice" between a retention review and a
 * foundation bridge is not a choice between equals, and offering it would let a
 * student quietly opt out of the thing they most need.
 */

export const MAX_ALTERNATIVES = 2;

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

// Why this option is a fair swap for the slot, in the student's words. Keyed by
// purpose because the honest answer differs: a retention slot is interchangeable
// in a way a current-learning slot is not.
const SWAP_RATIONALE = Object.freeze({
  [PURPOSE.CURRENT_LEARNING]: 'Also part of what your class is learning now.',
  [PURPOSE.RESPONSIVE_REVIEW]: 'Another skill your recent work says is worth another look.',
  [PURPOSE.FOUNDATION_BRIDGE]: 'Another building block this unit leans on.',
  [PURPOSE.RETENTION]: 'Another skill you have already learned that is due for a refresh.',
  [PURPOSE.TRANSFER]: 'Another way to practise this in a college-and-career test format.',
  [PURPOSE.EXTENSION]: 'Another way to push past what the lesson required.',
});

export const swapRationale = (purpose) => SWAP_RATIONALE[purpose]
  || 'Another skill MathMaster rates as about as useful for you right now.';

const isEligible = (candidate) => candidate?.eligibility?.eligible !== false;

const scoreOf = (candidate) => Number(candidate?.score) || 0;

/**
 * The options a student may put in one slot instead of the recommended skill.
 *
 * Restricted to candidates the engine already judged eligible and that carry the
 * slot's purpose, so every option is a real peer of the recommendation rather
 * than an easier way out. Ordered by the engine's own score, so the student sees
 * the next-best choices rather than an arbitrary two.
 */
export const buildSlotAlternatives = ({
  session = null,
  considered = [],
  excludeSkillIds = [],
  limit = MAX_ALTERNATIVES,
} = {}) => {
  if (!session) return [];
  const purpose = text(session.purpose);
  if (!purpose) return [];

  const excluded = new Set([
    text(session.skillId),
    ...list(excludeSkillIds).map(text),
  ].filter(Boolean));

  return list(considered)
    .filter((candidate) => (
      isEligible(candidate)
      && text(candidate.purpose) === purpose
      && text(candidate.skillId)
      && !excluded.has(text(candidate.skillId))
    ))
    .sort((a, b) => scoreOf(b) - scoreOf(a)
      || String(a.skillId).localeCompare(String(b.skillId)))
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((candidate) => ({
      skillId: candidate.skillId,
      teksCode: candidate.teksCode || null,
      studentLabel: candidate.studentLabel || candidate.label || candidate.teksCode || null,
      studentExplanation: candidate.studentExplanation || null,
      purpose: candidate.purpose,
      purposeLabel: candidate.purposeLabel || session.purposeLabel || null,
      context: candidate.context || session.context || 'course',
      dok: candidate.dok ?? session.dok ?? null,
      difficultyBand: candidate.difficultyBand ?? session.difficultyBand ?? null,
      swapReason: swapRationale(purpose),
    }));
};

/**
 * Give every slot in a built week its alternatives.
 *
 * A skill already seated in another slot is never offered as an alternative:
 * putting the same skill in two slots would make one of them unfillable, because
 * a completion is consumed by the first slot it matches.
 */
export const attachWeeklyAlternatives = ({ sessions = [], considered = [], limit = MAX_ALTERNATIVES } = {}) => {
  const seated = list(sessions).map((session) => text(session?.skillId)).filter(Boolean);
  return list(sessions).map((session) => ({
    ...session,
    // Frozen alongside the slot key: what MathMaster actually recommended, so a
    // student who swaps can always get back to it exactly.
    recommendedSkillId: session.recommendedSkillId || session.skillId || null,
    recommendedTeksCode: session.recommendedTeksCode || session.teksCode || null,
    recommendedLabel: session.recommendedLabel || session.studentLabel || null,
    alternatives: buildSlotAlternatives({
      session,
      considered,
      excludeSkillIds: seated,
      limit,
    }),
  }));
};

/**
 * Put a chosen alternative into its slot.
 *
 * Returns a session that teaches the alternative and still fills the original
 * slot: `weeklySlotKey`, `slot` and `purpose` are carried over untouched, which
 * is what keeps completion matching working for a week already in progress.
 *
 * Returns the session unchanged when the id is unknown or names the
 * recommendation itself, so a stale click cannot empty a slot.
 */
export const chooseWeeklyAlternative = (session = null, alternativeSkillId = null) => {
  if (!session) return session;
  const wanted = text(alternativeSkillId);
  if (!wanted || wanted === text(session.recommendedSkillId || session.skillId)) {
    return clearWeeklyAlternative(session);
  }

  const option = list(session.alternatives).find((entry) => text(entry.skillId) === wanted);
  if (!option) return session;

  return {
    ...session,
    // What the student will actually practise.
    skillId: option.skillId,
    teksCode: option.teksCode,
    studentLabel: option.studentLabel,
    studentExplanation: option.studentExplanation || session.studentExplanation,
    context: option.context,
    dok: option.dok,
    difficultyBand: option.difficultyBand,
    // What the slot is, which does not move.
    slot: session.slot,
    weeklySlotKey: session.weeklySlotKey,
    purpose: session.purpose,
    purposeLabel: session.purposeLabel,
    // What was recommended, so the student can go back and the teacher can see
    // that a choice was made at all.
    recommendedSkillId: session.recommendedSkillId || session.skillId,
    recommendedLabel: session.recommendedLabel || session.studentLabel,
    chosenSkillId: option.skillId,
    studentChose: true,
  };
};

/** Put the recommendation back in a slot the student had swapped. */
export const clearWeeklyAlternative = (session = null) => {
  if (!session || !session.studentChose) return session;
  const recommendedSkillId = text(session.recommendedSkillId);
  if (!recommendedSkillId) return session;

  return {
    ...session,
    skillId: recommendedSkillId,
    teksCode: session.recommendedTeksCode || session.teksCode,
    studentLabel: session.recommendedLabel || session.studentLabel,
    chosenSkillId: null,
    studentChose: false,
  };
};

/**
 * The student-visible choice state of one slot.
 *
 * Kept here rather than in the panel so the wording of "you chose this" has one
 * source and the teacher-side view can reuse it.
 */
export const describeSlotChoice = (session = null) => {
  if (!session) return { canChoose: false, chose: false, optionCount: 0, label: '' };
  const optionCount = list(session.alternatives).length;
  const chose = session.studentChose === true;
  return {
    canChoose: optionCount > 0,
    chose,
    optionCount,
    label: chose ? 'You chose this' : 'Recommended for you',
    recommendedLabel: session.recommendedLabel || session.studentLabel || null,
  };
};

export default attachWeeklyAlternatives;
