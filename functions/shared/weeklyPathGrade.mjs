/*
 * THE WEEKLY PATH GRADE, IN THE ONE PLACE BOTH SIDES CAN REACH IT.
 *
 * This is the grading half of weeklyPathGoal.js, moved here rather than copied.
 * Cloud Functions deploy only the functions/ directory, so the scheduled job
 * that publishes a weekly grade to Google Classroom cannot import from src/.
 * The alternative was a second implementation of a live grading formula, which
 * is exactly how two systems begin quietly disagreeing about what a student
 * earned — and the student would have no way to tell which number was real.
 *
 * src/platform/path/weeklyPathGoal.js re-exports everything below, so nothing
 * that already imported these names had to change, and there is still exactly
 * one definition of the grade.
 *
 * Pure by construction: no Firestore, no googleapis, no network.
 */

const DAY = 24 * 60 * 60 * 1000;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const list = (value) => (Array.isArray(value) ? value : []);

const slotFramework = (value) => {
  const text = String(value || '').trim();
  return text && text !== 'course' && text !== 'auto' ? text : null;
};

/**
 * The grading policy.
 *
 * WHY IT LEANS THIS FAR TOWARD COMPLETION. Adaptive practice exists to find out
 * what a student does not know yet. If the weekly grade punishes them for what
 * it discovers, the rational student response is to avoid the hard
 * recommendation — which destroys the evidence the whole system runs on. So
 * completion carries the grade and quality adjusts it.
 */
export const weekKeyFor = (now = Date.now(), weekStartsOn = 1) => {
  const date = new Date(now);
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(utc).getUTCDay();
  const back = (day - weekStartsOn + 7) % 7;
  const start = new Date(utc - back * DAY);
  const month = String(start.getUTCMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(start.getUTCDate()).padStart(2, '0');
  return `${start.getUTCFullYear()}-${month}-${dayOfMonth}`;
};

export const GRADING_POLICY = Object.freeze({
  completionWeight: 0.8,
  qualityWeight: 0.2,
  // A student who did everything asked of them passes. Full stop. This is a
  // floor, not a target: quality still lifts the grade above it.
  fullCompletionFloor: 80,
  passingGrade: 70,
});

// A weekly slot is more specific than a TEKS. The same standard may appear
// twice in one week for different purposes (current learning + retention, or
// course practice + assessment transfer). The stable key travels to the server
// and is what prevents one completed session from filling both rows.
export const weeklySlotKey = (session = {}, slot = session?.slot) => [
  Number(slot) || 0,
  String(session?.skillId || ''),
  String(session?.teksCode || ''),
  String(session?.purpose || ''),
  String(session?.context || 'course'),
  Number(session?.dok) || 0,
  Number(session?.difficultyBand) || 0,
].join('|');

const completionMatchesLegacySlot = (slot, completion, weekKey) => {
  if (completion?.weekKey && weekKey && completion.weekKey !== weekKey) return false;
  const slotTeks = String(slot?.teksCode || '').trim();
  const completionTeks = String(completion?.teksCode || '').trim();
  if (!slotTeks || !completionTeks || slotTeks !== completionTeks) return false;
  const expectedFramework = slotFramework(slot?.context || slot?.assessmentFramework);
  const actualFramework = slotFramework(completion?.assessmentFramework || completion?.context);
  return expectedFramework === actualFramework;
};

/**
 * Match completed Path sessions to assigned weekly slots one-to-one.
 *
 * Modern sessions carry `weeklySlotKey`, so matching is exact. Older sessions
 * predate snapshots; they receive a controlled TEKS/framework fallback, but a
 * completion is consumed after one match and can never fill a second slot.
 * Unmatched voluntary practice stays mastery evidence and is excluded here.
 */
export const matchWeeklyGoalCompletions = ({ goal, completions = [] } = {}) => {
  const slots = list(goal?.sessions).map((session, index) => ({
    ...session,
    slot: Number(session?.slot) || index + 1,
    weeklySlotKey: session?.weeklySlotKey || weeklySlotKey(session, Number(session?.slot) || index + 1),
  }));
  const available = list(completions)
    .filter((entry) => entry?.status === 'completed')
    .map((entry, index) => ({ ...entry, __index: index }));
  const used = new Set();
  const matched = [];
  const strictAssignedMatching = goal?.assignmentState === 'assigned'
    || available.some((entry) => Boolean(entry.weeklySlotKey));

  // Historical weekly-grade rows predate frozen slot identity. Preserve their
  // count-based semantics so old weeks do not retroactively become zeroes.
  // Current assigned weeks are strict: only the frozen slot can earn that slot.
  if (!strictAssignedMatching) {
    const required = Math.max(0, Number(goal?.goalSessions) || slots.length);
    available.slice(0, required).forEach((entry, index) => {
      const { __index, ...completion } = entry;
      used.add(__index);
      const slot = slots[index] || null;
      matched.push({
        ...completion,
        matchedSlot: slot?.slot || index + 1,
        weeklySlotKey: slot?.weeklySlotKey || completion.weeklySlotKey || null,
      });
    });
    return {
      matched,
      unmatched: available.filter((entry) => !used.has(entry.__index)).map(({ __index, ...entry }) => entry),
      slots,
    };
  }

  slots.forEach((slot) => {
    let match = available.find((entry) => !used.has(entry.__index)
      && entry.weeklySlotKey
      && entry.weeklySlotKey === slot.weeklySlotKey
      && (!entry.weekKey || !goal?.weekKey || entry.weekKey === goal.weekKey));
    if (!match) {
      match = available.find((entry) => !used.has(entry.__index)
        && !entry.weeklySlotKey
        && completionMatchesLegacySlot(slot, entry, goal?.weekKey));
    }
    if (!match) return;
    used.add(match.__index);
    const { __index, ...completion } = match;
    matched.push({ ...completion, matchedSlot: slot.slot, weeklySlotKey: slot.weeklySlotKey });
  });

  return {
    matched,
    unmatched: available.filter((entry) => !used.has(entry.__index)).map(({ __index, ...entry }) => entry),
    slots,
  };
};

/**
 * The grading weights, with the one invariant that cannot be configured away.
 *
 * A teacher may move the completion/quality balance. They may not create a
 * policy where a student who completed every required session can fail — that
 * is not a weighting preference, it is the failure mode the policy exists to
 * prevent.
 */
export const normalizeGradingPolicy = (policy = {}) => {
  const completionWeight = Number.isFinite(Number(policy?.completionWeight))
    ? clamp(Number(policy.completionWeight), 0, 1)
    : GRADING_POLICY.completionWeight;
  const passingGrade = Number.isFinite(Number(policy?.passingGrade))
    ? clamp(Number(policy.passingGrade), 0, 100)
    : GRADING_POLICY.passingGrade;

  return {
    completionWeight,
    qualityWeight: Number((1 - completionWeight).toFixed(4)),
    passingGrade,
    fullCompletionFloor: Math.max(
      passingGrade,
      Number.isFinite(Number(policy?.fullCompletionFloor))
        ? clamp(Number(policy.fullCompletionFloor), 0, 100)
        : GRADING_POLICY.fullCompletionFloor,
    ),
  };
};

/**
 * Where the student is against this week's goal.
 *
 * Completion counts FINISHED sessions. A session opened and abandoned is not
 * completion, and is also not a failure — it is simply not yet done.
 */
export const evaluateWeeklyGoalProgress = ({ goal, completions = [], now = Date.now() } = {}) => {
  const required = Number(goal?.goalSessions) || 0;
  const { matched: done, unmatched } = matchWeeklyGoalCompletions({ goal, completions });
  const onTime = done.filter((entry) => !goal?.dueAt || Number(entry.completedAt) <= Number(goal.dueAt));

  const completed = Math.min(done.length, required);
  const remaining = Math.max(0, required - done.length);
  const daysLeft = goal?.dueAt ? Math.ceil((Number(goal.dueAt) - now) / DAY) : null;

  return {
    required,
    completed,
    completedOnTime: Math.min(onTime.length, required),
    remaining,
    // Work done past the deadline still counts as learning. It just does not
    // rewrite a grade that has already closed.
    lateCompletions: done.length - onTime.length,
    complete: remaining === 0,
    ratio: required ? Number((completed / required).toFixed(4)) : 0,
    daysLeft,
    overdue: Boolean(goal?.dueAt && now > Number(goal.dueAt) && remaining > 0),
    matchedCompletions: done,
    extraPracticeCompletions: unmatched,
  };
};

/**
 * The weekly Path grade.
 *
 * THE RULE: a student who completes all required adaptive practice must not
 * fail because the system discovered they still need remediation. Finding a gap
 * is the system working, and the student who exposed it did the right thing.
 *
 * After the due date the completion component FREEZES — the grade reflects what
 * was done by the deadline, per normal deadline policy — while continued
 * practice still feeds mastery, which lives elsewhere and is not a grade.
 */
export const gradeWeeklyGoal = ({
  goal,
  completions = [],
  policy = null,
  now = Date.now(),
} = {}) => {
  const rules = policy ? normalizeGradingPolicy(policy) : (goal?.settings?.grading || normalizeGradingPolicy());
  const progress = evaluateWeeklyGoalProgress({ goal, completions, now });
  const frozen = Boolean(goal?.dueAt && now > Number(goal.dueAt));

  // Completion is measured on time. Quality is measured over everything that
  // has actually been finished, because the mathematics does not get worse for
  // having been done on Saturday.
  const completionRatio = progress.required
    ? Math.min(1, progress.completedOnTime / progress.required)
    : 0;

  const finished = progress.matchedCompletions || [];
  const graded = finished.filter((entry) => Number.isFinite(Number(entry?.accuracy)));
  const qualityRatio = graded.length
    ? graded.reduce((sum, entry) => sum + clamp(Number(entry.accuracy), 0, 1), 0) / graded.length
    // No quality evidence yet is not zero quality. Neutral, until there is
    // something to say.
    : null;

  const completionPoints = completionRatio * rules.completionWeight * 100;
  const qualityPoints = qualityRatio == null
    ? completionRatio * rules.qualityWeight * 100
    : qualityRatio * rules.qualityWeight * 100;

  let grade = completionPoints + qualityPoints;
  const floorApplied = completionRatio >= 1 && grade < rules.fullCompletionFloor;
  if (floorApplied) grade = rules.fullCompletionFloor;

  return {
    grade: Number(grade.toFixed(2)),
    passing: grade >= rules.passingGrade,
    frozen,
    progress,
    components: {
      completionRatio: Number(completionRatio.toFixed(4)),
      completionPoints: Number(completionPoints.toFixed(2)),
      qualityRatio: qualityRatio == null ? null : Number(qualityRatio.toFixed(4)),
      qualityPoints: Number(qualityPoints.toFixed(2)),
      floorApplied,
    },
    policy: rules,
    // A sentence a teacher can put in front of a parent. Full completion earns
    // the reassuring version whether or not the floor had to engage — the point
    // is what the student did, not which branch of the formula produced it.
    explanation: completionRatio >= 1
      ? 'Completed every assigned session. The grade reflects that, regardless of what the practice revealed.'
      : `${progress.completedOnTime} of ${progress.required} sessions completed by the due date.`,
  };
};

/*
 * THE WEEK'S GRADE, IN WORDS A STUDENT CAN ACT ON.
 *
 * A progress bar says how much is done. It does not say what that is worth,
 * and "how am I doing" is the question students actually ask. The grade was
 * computed all along — it just went to Google Classroom on Monday morning and
 * was never shown to the person who earned it.
 *
 * THE NUMBER IS NOT RECOMPUTED HERE. It comes from gradeWeeklyGoal, the same
 * call the Classroom publisher makes. A second implementation for the student
 * view would drift, and the day it drifted a student would read one number on
 * their screen while their family read another in the gradebook — which is
 * exactly the failure this feature is supposed to prevent.
 *
 * MID-WEEK, THE NUMBER IS TRUE BUT NOT FINAL, AND SAYING SO IS THE WHOLE JOB.
 * A student two sessions into a four-session week is genuinely at a low score
 * and will be at a high one on Friday. The publisher already refuses to send a
 * grade before the week ends for that reason. Showing the same number without
 * the word "so far" would tell a student they are failing a week they have four
 * days left to finish, so the provisional grade is always labelled, and it is
 * always paired with what finishing is worth.
 *
 * WHAT FINISHING IS WORTH IS A PROMISE, NOT AN ESTIMATE. fullCompletionFloor is
 * a floor in the grading policy: a student who completes every session cannot
 * score below it whatever the practice revealed. That makes it safe to state as
 * a guarantee, and it is the one sentence that turns a discouraging mid-week
 * number into a reason to do the next session.
 */
export const describeWeeklyGradeForStudent = ({
  goal = null,
  completions = [],
  policy = null,
  now = Date.now(),
} = {}) => {
  if (!goal || !Array.isArray(goal.sessions) || !goal.sessions.length) return null;

  const graded = gradeWeeklyGoal({ goal, completions, policy, now });
  const { progress } = graded;
  const required = Number(progress?.required) || 0;
  const done = Number(progress?.completed) || 0;
  const remaining = Math.max(0, required - done);
  const complete = required > 0 && remaining === 0;
  const floor = Number(graded.policy?.fullCompletionFloor) || 0;
  const started = done > 0;

  // Once the week is closed the number stops moving, so it stops being "so far"
  // and becomes the grade.
  const final = Boolean(graded.frozen);
  const score = Math.round(graded.grade);

  const status = final ? 'final' : complete ? 'complete' : started ? 'in_progress' : 'not_started';

  const label = final ? "This week's grade" : 'Grade so far';

  const nextStep = final
    ? null
    : complete
      ? 'Every session is done. Anything else you practise this week is extra.'
      : `Finish ${remaining} more session${remaining === 1 ? '' : 's'} to earn at least ${floor}.`;

  return {
    // The same number the gradebook will carry, out of 100.
    score,
    outOf: 100,
    final,
    complete,
    status,
    passing: graded.passing,
    label,
    headline: `${label}: ${score} out of 100`,
    nextStep,
    // Stated once, plainly, so a student is never surprised by where it went.
    teacherNote: final
      ? 'Your teacher has this grade for the week.'
      : 'This goes to your teacher when the week closes on Sunday night.',
    completed: done,
    required,
    remaining,
  };
};
