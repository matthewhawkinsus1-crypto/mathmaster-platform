// WHAT A FINISHED SESSION LEADS TO.
//
// The end of a weekly session used to offer one button — "Back to My Math
// Path" — so a student with three sessions left went back to the panel, found
// the next card and pressed Start: two screens of navigation between pieces of
// one commitment. And the screen celebrated "Weekly target reached!" from a
// flag computed when the session STARTED, which knew nothing about what the
// server finally counted.
//
// Both answers now come from the week as it stands once THIS session is
// counted, by the one completion rule (functions/shared/weeklyPathCompletion.mjs)
// and the one slot matcher (functions/shared/weeklyPathGrade.mjs) that the
// weekly panel, the teacher's table and the Classroom publisher use. A session
// counts only when the server marked it "completed", so a paused session never
// moves the week. Pure: no React, no Firestore.

import { completionFromPathSession } from '../../../functions/shared/weeklyPathCompletion.mjs';
import { evaluateWeeklyGoalProgress } from '../../../functions/shared/weeklyPathGrade.mjs';

export const SESSION_END_STEP = Object.freeze({
  START_NEXT_WEEKLY: 'startNextWeekly',
  WEEKLY_GOAL_COMPLETE: 'weeklyGoalComplete',
  BACK_TO_PATH: 'backToPath',
});

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * The identity of one session launch, for the session container's React key.
 *
 * Starting the next weekly session from the end screen hands the container a
 * new launch while it is still mounted. Without a fresh container, the last
 * question's review, grading and "awaiting continue" state would carry over
 * onto the next session's first question.
 */
export const sessionLaunchKey = (config = {}) => [
  config?.targetAlignmentKey,
  config?.sessionKind || 'practice',
  config?.assessmentFramework || 'course',
  config?.coursePracticeIntent || '',
  config?.weeklySlotKey || '',
].map((part) => String(part ?? '')).join('|');

/**
 * The week once `finishedSession` is counted.
 *
 * Null when the session was not a weekly slot of this goal; `{ status:
 * 'loading' }` until the week's completions have arrived (a guess from partial
 * facts would offer a slot that is already done).
 */
export const describeWeeklySessionEnd = ({
  goal = null,
  completions = null,
  inProgress = [],
  finishedSession = null,
  now = Date.now(),
} = {}) => {
  if (!finishedSession?.weeklySlotKey || !list(goal?.sessions).length) return null;
  if (goal.weekKey && finishedSession.weekKey && goal.weekKey !== finishedSession.weekKey) return null;
  if (!Array.isArray(completions)) return { status: 'loading' };

  // The same record the server's weekly callable builds — and null unless the
  // session is "completed".
  const finished = completionFromPathSession(finishedSession.sessionId, finishedSession);
  const merged = [
    ...completions.filter((entry) => !finished || String(entry?.sessionId || '') !== finished.sessionId),
    ...(finished ? [finished] : []),
  ];
  const progress = evaluateWeeklyGoalProgress({ goal, completions: merged, now });
  const done = new Set(progress.matchedCompletions.map((entry) => Number(entry.matchedSlot)));
  const counted = Boolean(finished) && progress.matchedCompletions
    .some((entry) => String(entry?.sessionId || '') === finished.sessionId);
  const nextSession = goal.sessions.find((session) => !done.has(Number(session?.slot))) || null;
  return {
    status: 'ready',
    counted,
    goalComplete: counted && progress.complete,
    required: progress.required,
    completed: progress.completed,
    remaining: progress.remaining,
    nextSession,
    // A next slot the student already opened is RESUMED, never restarted.
    nextInProgress: nextSession
      ? list(inProgress).find((entry) => entry?.weeklySlotKey && entry.weeklySlotKey === nextSession.weeklySlotKey) || null
      : null,
  };
};

/**
 * The one next step the end screen leads with.
 *
 *   weekly session counted, week now complete  → say so
 *   weekly session counted, slots left         → start (or resume) the next one
 *   anything else                              → back to My Math Path
 *
 * `canStartNext` is false wherever launching is not allowed (a teacher's
 * read-only view), so the screen never offers a button that would refuse.
 */
export const chooseSessionEndNextStep = ({
  session = null,
  weeklyEnd = null,
  completesWeeklyGoal = false,
  canStartNext = false,
} = {}) => {
  const back = { kind: SESSION_END_STEP.BACK_TO_PATH };
  if (session?.status !== 'completed' || !session?.weeklySlotKey) return back;
  if (weeklyEnd?.status === 'ready') {
    if (weeklyEnd.goalComplete) return { kind: SESSION_END_STEP.WEEKLY_GOAL_COMPLETE, required: weeklyEnd.required };
    if (weeklyEnd.counted && weeklyEnd.nextSession && canStartNext) {
      return {
        kind: SESSION_END_STEP.START_NEXT_WEEKLY,
        nextSession: weeklyEnd.nextSession,
        nextInProgress: weeklyEnd.nextInProgress || null,
        required: weeklyEnd.required,
        remaining: weeklyEnd.remaining,
      };
    }
    return back;
  }
  // The week's facts have not arrived. The launch-time flag — this was the
  // last undone slot when it started — still holds for a completed session.
  if (completesWeeklyGoal) return { kind: SESSION_END_STEP.WEEKLY_GOAL_COMPLETE, required: null };
  return back;
};
