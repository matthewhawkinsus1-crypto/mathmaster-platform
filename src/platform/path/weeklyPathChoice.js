import { PURPOSE } from './recommendationV2.js';
import { sameTeks } from '../../utils/teksUtils.js';

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
 *
 * THE SERVER HAS TO AGREE. The week is frozen on the server, and a weekly launch
 * is checked against that frozen copy (functions/shared/weeklyPathSlotAuthority
 * .mjs). The freeze keeps each slot's alternatives, so the only swaps a student
 * is offered are the ones frozen with their week: a proposal that has not been
 * frozen offers none, and a week frozen before swaps existed offers none. A
 * swap runs in the slot's assessment context at the slot's depth and band.
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

const contextOf = (value) => text(value) || 'course';

/**
 * The options a student may put in one slot instead of the recommended skill.
 *
 * Restricted to candidates the engine already judged eligible and that carry the
 * slot's purpose and assessment context, so every option is a real peer of the
 * recommendation rather than an easier way out — and one the server's freeze
 * will keep. Ordered by the engine's own score, so the student sees the
 * next-best choices rather than an arbitrary two.
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
  const context = contextOf(session.context);

  const excluded = new Set([
    text(session.skillId),
    ...list(excludeSkillIds).map(text),
  ].filter(Boolean));

  return list(considered)
    .filter((candidate) => (
      isEligible(candidate)
      && text(candidate.purpose) === purpose
      // SAT practice is not swapped for course practice, or for another exam.
      && contextOf(candidate.context || session.context) === context
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
 * HOW the slot is practised does not move either. Its assessment context, DOK
 * and difficulty band stay the slot's, because that is what the server runs a
 * swapped session at; a card that promised the alternative's own depth would
 * be promising something no student receives. (The purpose-based explanation
 * is the same for every option in a slot, so it stays too.)
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
    studentLabel: option.studentLabel || option.teksCode,
    // What the slot is, and how it is practised, neither of which moves.
    slot: session.slot,
    weeklySlotKey: session.weeklySlotKey,
    purpose: session.purpose,
    purposeLabel: session.purposeLabel,
    context: session.context,
    dok: session.dok,
    difficultyBand: session.difficultyBand,
    // What was recommended, so the student can go back and the teacher can see
    // that a choice was made at all.
    recommendedSkillId: session.recommendedSkillId || session.skillId,
    recommendedTeksCode: session.recommendedTeksCode || session.teksCode,
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

/**
 * Whether any card the student can still act on offers a swap.
 *
 * The panel's copy promises swapping only when this is true. A week frozen
 * before swaps existed, or one whose open slots have no options, says nothing
 * about swapping rather than pointing at a control that is not there. A card
 * already done, or already opened (bound to its skill on the server), does not
 * count.
 */
export const weeklyGoalOffersSwap = ({ goal = null, completedSlots = [], inProgress = [] } = {}) => {
  const done = new Set(list(completedSlots).map(Number));
  const opened = new Set(list(inProgress).map((entry) => text(entry?.weeklySlotKey)).filter(Boolean));
  return list(goal?.sessions).some((session) => (
    !done.has(Number(session?.slot))
    && !opened.has(text(session?.weeklySlotKey))
    && describeSlotChoice(session).canChoose
  ));
};

/**
 * A frozen slot's alternatives, as options the swap control can show.
 *
 * The server stores only what a swap needs (weeklyPathSlotAuthority.mjs); the
 * slot supplies the rest, because every alternative shares the slot's purpose
 * and assessment context by construction.
 */
export const frozenSlotAlternatives = (slot = null) => {
  if (!slot) return [];
  return list(slot.alternatives)
    .filter((entry) => text(entry?.skillId) && text(entry?.teksCode))
    .map((entry) => ({
      skillId: entry.skillId,
      teksCode: entry.teksCode,
      studentLabel: entry.studentLabel || entry.teksCode,
      purpose: slot.purpose || null,
      purposeLabel: entry.purposeLabel || slot.purposeLabel || null,
      context: slot.context || 'course',
      swapReason: entry.swapReason || swapRationale(slot.purpose),
    }));
};

const withoutAlternatives = (session) => ({ ...session, alternatives: [] });

/**
 * The week a student sees: the proposal, with the server's frozen copy on top.
 *
 * Swaps come ONLY from the frozen copy. The proposal is recomputed from today's
 * evidence and may list different options from the ones frozen on Monday; the
 * server would refuse those. So:
 *   - frozen with alternatives      -> those, and only those, are offered;
 *   - frozen before swaps existed   -> nothing is offered (the control hides);
 *   - not frozen (yet, or failed)   -> nothing is offered.
 */
export const mergeWeeklyGoalSnapshot = ({ proposed = null, snapshot = null, assignmentState = null } = {}) => {
  if (!snapshot) {
    if (!proposed) return null;
    return {
      ...proposed,
      assignmentState: assignmentState || 'proposed',
      sessions: list(proposed.sessions).map(withoutAlternatives),
    };
  }
  return {
    ...proposed,
    ...snapshot,
    // The teacher's settings and the learning profile are not part of the
    // frozen commitment, and the live engine's copies are the current ones.
    settings: proposed?.settings,
    profile: proposed?.profile,
    suppressed: proposed?.suppressed,
    assignmentState: assignmentState || snapshot.assignmentState || 'assigned',
    sessions: Array.isArray(snapshot.sessions)
      ? snapshot.sessions.map((slot) => ({
        ...slot,
        recommendedSkillId: slot.skillId || null,
        recommendedTeksCode: slot.teksCode || null,
        recommendedLabel: slot.studentLabel || null,
        alternatives: frozenSlotAlternatives(slot),
      }))
      : list(proposed?.sessions).map(withoutAlternatives),
  };
};

/**
 * Which alternative each slot holds, by frozen slot key.
 *
 * What the server already holds outranks a click: a slot the student opened or
 * finished is bound to the standard it was launched with, so THAT standard is
 * the choice. This is what makes Resume reopen a swapped session after a reload
 * (the in-progress session's TEKS is the swap) rather than launching the
 * recommendation as a second session, and what lets a finished swap still say
 * what was chosen. Otherwise the click made in this tab stands; it is
 * deliberately not stored anywhere else.
 *
 * Facts are read by the slot key each SESSION was launched with — never by a
 * key a count-based legacy match assigned — so free practice on an option's
 * standard is never mistaken for a swap.
 */
export const resolveWeeklySlotChoices = ({
  goal = null,
  choices = {},
  inProgress = [],
  completions = [],
} = {}) => {
  const resolved = {};
  const thisWeek = (entry) => !entry?.weekKey || !goal?.weekKey || entry.weekKey === goal.weekKey;
  list(goal?.sessions).forEach((slot) => {
    const key = text(slot?.weeklySlotKey);
    if (!key) return;
    const fact = list(inProgress).find((entry) => text(entry?.weeklySlotKey) === key && thisWeek(entry))
      || list(completions).find((entry) => text(entry?.weeklySlotKey) === key && thisWeek(entry));
    if (fact) {
      if (sameTeks(fact.teksCode, slot.teksCode)) return;
      const option = list(slot.alternatives).find((entry) => sameTeks(entry?.teksCode, fact.teksCode));
      if (option) resolved[key] = option.skillId;
      return;
    }
    const wanted = text(choices?.[key]);
    if (wanted) resolved[key] = wanted;
  });
  return resolved;
};

/**
 * The week with each slot's choice applied, and only the options still open.
 *
 * An option is dropped when another slot already holds that skill (the student
 * would practise it twice) or when `isLaunchable(teksCode, context)` says the
 * secure bank cannot issue it — offering a swap the server will refuse is worse
 * than offering none. The option a slot currently holds always stays listed, so
 * a student can always see their choice and switch back.
 */
export const applyWeeklySlotChoices = ({ goal = null, choices = {}, isLaunchable = null } = {}) => {
  if (!goal || !Array.isArray(goal.sessions) || !goal.sessions.length) return goal;
  const chosen = goal.sessions.map((session) => {
    const wanted = text(choices?.[session?.weeklySlotKey]);
    return wanted ? chooseWeeklyAlternative(session, wanted) : session;
  });
  const heldBySlot = chosen.map((session) => text(session?.skillId));
  return {
    ...goal,
    sessions: chosen.map((session, index) => ({
      ...session,
      alternatives: list(session.alternatives).filter((option) => {
        const id = text(option?.skillId);
        if (!id) return false;
        if (id === heldBySlot[index]) return true;
        if (heldBySlot.some((held, other) => other !== index && held === id)) return false;
        return typeof isLaunchable === 'function' ? isLaunchable(option.teksCode, session.context || 'course') !== false : true;
      }),
    })),
  };
};

/**
 * What a teacher should know about swaps in one student's week: for each slot
 * a finished session filled with a different standard, "chose X instead of Y".
 *
 * Read from completions by the slot key each session was launched with. The
 * server only ever accepts a different standard for a slot when it is one of
 * that slot's frozen alternatives, so a slot-keyed completion on another
 * standard is a swap by construction. Labels come from the frozen week.
 */
export const describeWeeklySlotSwaps = ({ goal = null, completions = [] } = {}) => {
  const thisWeek = (entry) => !entry?.weekKey || !goal?.weekKey || entry.weekKey === goal.weekKey;
  return list(goal?.sessions).flatMap((slot) => {
    const key = text(slot?.weeklySlotKey);
    if (!key) return [];
    const filled = list(completions).find((entry) => (
      entry?.status === 'completed' && text(entry?.weeklySlotKey) === key && thisWeek(entry)
    ));
    if (!filled?.teksCode || sameTeks(filled.teksCode, slot.teksCode)) return [];
    const option = list(slot.alternatives).find((entry) => sameTeks(entry?.teksCode, filled.teksCode));
    const chosenTeks = option?.teksCode || filled.teksCode;
    return [{
      slot: Number(slot.slot) || null,
      weeklySlotKey: key,
      recommendedTeks: slot.teksCode || null,
      recommendedLabel: slot.studentLabel || null,
      chosenTeks,
      chosenLabel: option?.studentLabel || null,
      sentence: `Session ${Number(slot.slot) || '?'}: chose ${chosenTeks} instead of ${slot.teksCode}`,
    }];
  });
};

export default attachWeeklyAlternatives;
