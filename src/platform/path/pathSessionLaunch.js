// What each My Math Path button launches.
//
// A retention check only does its job when it is launched AS a retention check:
// the server moves a student's retention schedule for a `retentionProbe`
// session and for nothing else. Four buttons offer one — the weekly Retention
// slot, the Overview banner, the Overview focus card and the Path map's "Quick
// retention check" section — and three of them used to launch ordinary
// five-question practice. The practice counted, the schedule never moved, and
// the same check was due again the next week.
//
// So the launch options live here, as pure functions the screens call, and the
// weekly rule is the server's own (functions/shared/pathRetentionCheck.mjs):
// the slot's frozen purpose decides the session kind, on both sides.

import {
  PRACTICE_SESSION,
  RETENTION_CHECK_LAUNCH,
  RETENTION_PROBE,
  RETENTION_PROBE_QUESTIONS,
  resolveWeeklySlotSessionKind,
} from '../../../functions/shared/pathRetentionCheck.mjs';

const list = (value) => (Array.isArray(value) ? value : []);

// The retention scheduler's priority for a concern (retentionScheduler.js).
const CONCERN_PRIORITY = 1;

/** One label for every button that starts a retention check. */
export const RETENTION_CHECK_ACTION_LABEL = `Verify now · ${RETENTION_PROBE_QUESTIONS} questions`;

/** The ordinary quick-practice launch the Overview offers when nothing is due. */
export const QUICK_PRACTICE_LAUNCH = Object.freeze({ sessionKind: PRACTICE_SESSION, requiredQuestions: 5 });

export const retentionCheckLaunchOptions = () => ({ ...RETENTION_CHECK_LAUNCH });

/**
 * The options a weekly card hands to `startSession`.
 *
 * The session arrives with the student's swap already applied; a swap keeps
 * the slot's key and purpose, so a swapped Retention slot is still a retention
 * check and still fills its own slot.
 */
export const weeklySessionLaunchOptions = (session = null, { weekKey = null } = {}) => {
  if (!session) return null;
  const { sessionKind } = resolveWeeklySlotSessionKind({ slotPurpose: session.purpose });
  return {
    weekKey: weekKey || null,
    weeklySlotKey: session.weeklySlotKey || null,
    weeklySlot: session.slot || null,
    // Only a slot the student actually swapped names a chosen skill; the
    // server treats it as a label and authorizes from the frozen week.
    chosenSkillId: session.studentChose ? (session.chosenSkillId || null) : null,
    intendedDok: session.dok ?? null,
    intendedDifficultyBand: session.difficultyBand ?? null,
    weeklyPurpose: session.purpose || null,
    framework: session.context && session.context !== 'course' ? session.context : null,
    sessionKind,
    ...(sessionKind === RETENTION_PROBE ? { requiredQuestions: RETENTION_PROBE_QUESTIONS } : {}),
  };
};

/**
 * The options a Path map card hands to `startSession`. A retention-check card
 * launches the check; an earned Challenge card asks for Challenge; anything
 * else is ordinary practice.
 */
export const pathCardLaunchOptions = (card = null) => {
  if (card?.isRetentionCheck) return retentionCheckLaunchOptions();
  return { coursePracticeIntent: card?.status === 'extension' ? 'challenge' : null };
};

/**
 * The Overview's focus card: what it names and what its button launches.
 *
 * A due retention check takes the focus (the scheduler's first pending check —
 * the same one the banner names), and then the button has to start that
 * check. It used to start five questions of practice on it, which could never
 * clear the check it was headlining.
 */
export const overviewFocus = ({ pendingProbes = [], recommendedTeks = null } = {}) => {
  const probe = list(pendingProbes).find((entry) => entry?.teksCode) || null;
  if (probe) {
    return {
      teksCode: probe.teksCode,
      isRetentionCheck: true,
      concern: Number(probe.priority) === CONCERN_PRIORITY,
      launch: retentionCheckLaunchOptions(),
      buttonLabel: RETENTION_CHECK_ACTION_LABEL,
    };
  }
  if (!recommendedTeks) return null;
  return {
    teksCode: recommendedTeks,
    isRetentionCheck: false,
    concern: false,
    launch: { ...QUICK_PRACTICE_LAUNCH },
    buttonLabel: 'Start quick practice · 5 questions',
  };
};

export default {
  weeklySessionLaunchOptions,
  pathCardLaunchOptions,
  overviewFocus,
  retentionCheckLaunchOptions,
};
