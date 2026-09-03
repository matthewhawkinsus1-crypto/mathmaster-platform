// Weekly Path Goals — sessions, not consumable TEKS.
//
// THE MISTAKE THIS MODULE EXISTS TO AVOID. The obvious design is "four TEKS a
// week", and it breaks in the second month: a student retires four standards a
// week, runs out of course standards before spring, and the platform has
// nothing left to offer them. A TEKS is not a credit that gets spent. It comes
// back for initial learning, for mastery development, for prerequisite
// recovery, for retention, for cumulative review, for CCMR transfer, and for
// future related instruction.
//
// So the unit of a weekly goal is a SESSION. Four sessions a week is a
// commitment about the student's time, which is a real and finite thing. Which
// standards fill them is decided fresh each week by the recommendation engine,
// and the same standard may legitimately appear in October and again in March.
//
// Pure: no Firestore, no clock of its own. Persistence and the real clock are
// the caller's.

import { PURPOSE, PURPOSE_LABEL } from './recommendationV2.js';
import { attachWeeklyAlternatives } from './weeklyPathChoice.js';
// The grading half of this module now lives in functions/shared so the Cloud
// Function that publishes weekly grades to Google Classroom can reach it too.
// Re-exported here so nothing that already imported these names had to change.
import {
  GRADING_POLICY,
  evaluateWeeklyGoalProgress,
  gradeWeeklyGoal,
  matchWeeklyGoalCompletions,
  normalizeGradingPolicy,
  weeklySlotKey,
} from '../../../functions/shared/weeklyPathGrade.mjs';

export {
  GRADING_POLICY,
  evaluateWeeklyGoalProgress,
  gradeWeeklyGoal,
  matchWeeklyGoalCompletions,
  normalizeGradingPolicy,
  weeklySlotKey,
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Session counts. Teacher-configurable inside a range that stays honest about
 * what a week of adolescent attention actually holds.
 *
 * These are STARTING defaults. The brief is explicit that they should later be
 * calibrated from real time-on-task, so they live in one exported constant
 * rather than scattered through the UI.
 */

export const WEEKLY_GOAL = Object.freeze({
  REGULAR_DEFAULT: 4,
  HONORS_DEFAULT: 5,
  MINIMUM: 3,
  MAXIMUM: 6,
});

/** Who picks the standards. The default is autonomous, deliberately. */
export const SELECTION_MODE = Object.freeze({
  AUTOMATIC: 'automatic',
  HYBRID: 'hybrid',
  TEACHER_SELECTED: 'teacherSelected',
});

export const SELECTION_MODE_LABEL = Object.freeze({
  [SELECTION_MODE.AUTOMATIC]: 'MathMaster selects',
  [SELECTION_MODE.HYBRID]: 'Your picks first, then MathMaster',
  [SELECTION_MODE.TEACHER_SELECTED]: 'You select every session',
});

export const CCMR_EXPECTATION = Object.freeze({
  NONE: 'none',
  RECOMMENDED: 'recommended',
  REQUIRED: 'required',
});

export const FRAMEWORK = Object.freeze({
  AUTO: 'auto',
  DIGITAL_SAT: 'digitalSAT',
  ACT: 'act',
  TSIA2: 'tsia2',
  ASVAB: 'asvab',
});


const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const list = (value) => (Array.isArray(value) ? value : []);
const oneOf = (value, allowed, fallback) => (
  Object.values(allowed).includes(value) ? value : fallback
);

const slotFramework = (value) => {
  const text = String(value || '').trim();
  return text && text !== 'course' && text !== 'auto' ? text : null;
};


/**
 * A teacher's settings, made safe.
 *
 * Everything here has a working default, because the governing rule is that a
 * teacher who configures NOTHING still gets a functioning autonomous Path. A
 * blank settings record must never be the reason a student has no work.
 */
export const normalizeWeeklyGoalConfig = (config = {}, { honors = false } = {}) => {
  const requested = Number(config?.sessions);
  const sessions = Number.isFinite(requested)
    ? clamp(Math.round(requested), WEEKLY_GOAL.MINIMUM, WEEKLY_GOAL.MAXIMUM)
    : (honors ? WEEKLY_GOAL.HONORS_DEFAULT : WEEKLY_GOAL.REGULAR_DEFAULT);

  const ccmrExpectation = oneOf(
    config?.ccmrExpectation, CCMR_EXPECTATION,
    honors ? CCMR_EXPECTATION.RECOMMENDED : CCMR_EXPECTATION.NONE,
  );

  return {
    sessions,
    honors: Boolean(honors),
    selectionMode: oneOf(config?.selectionMode, SELECTION_MODE, SELECTION_MODE.AUTOMATIC),
    ccmrExpectation,
    framework: oneOf(config?.framework, FRAMEWORK, FRAMEWORK.AUTO),
    pinnedSkills: list(config?.pinnedSkills).map(String),
    // Day of week the goal is due, 0 = Sunday. Friday by default.
    dueDayOfWeek: Number.isFinite(Number(config?.dueDayOfWeek))
      ? clamp(Math.round(Number(config.dueDayOfWeek)), 0, 6) : 5,
    weekStartsOn: Number.isFinite(Number(config?.weekStartsOn))
      ? clamp(Math.round(Number(config.weekStartsOn)), 0, 6) : 1,
    interventionMode: Boolean(config?.interventionMode),
    grading: normalizeGradingPolicy(config?.grading),
  };
};


/**
 * The week a moment belongs to, as a stable key.
 *
 * Goals persist per week, and "this week" has to mean the same thing on Monday
 * morning and Friday afternoon, on the student's screen and the teacher's.
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

/** When this week's goal is due, in real milliseconds. */
export const dueAtFor = (now = Date.now(), { weekStartsOn = 1, dueDayOfWeek = 5 } = {}) => {
  const key = weekKeyFor(now, weekStartsOn);
  const start = Date.parse(`${key}T00:00:00Z`);
  const offset = (dueDayOfWeek - weekStartsOn + 7) % 7;
  // End of the due day, not the start of it.
  return start + offset * DAY + (DAY - 1);
};

/**
 * This week's goal: the sessions the student is being asked to do.
 *
 * Takes the plan the recommendation engine produced and applies the teacher's
 * settings ON TOP of it, rather than asking the engine to know about teacher
 * settings. The engine reasons about learning; this reasons about a class.
 */
export const buildWeeklyGoal = ({
  plan = null,
  config = {},
  honors = false,
  studentId = null,
  courseId = 'algebra1',
  now = Date.now(),
} = {}) => {
  const settings = normalizeWeeklyGoalConfig(config, { honors });
  const proposed = list(plan?.sessions);

  let sessions = proposed;
  if (settings.selectionMode === SELECTION_MODE.TEACHER_SELECTED) {
    // The teacher owns the week. Anything the engine added on its own is
    // dropped — but the engine's REASONING is kept on the rows that survive,
    // so the student still gets told why each one is there.
    const pinned = new Set(settings.pinnedSkills);
    sessions = proposed.filter((session) => (
      pinned.has(String(session.skillId)) || pinned.has(String(session.teksCode))
    ));
  }

  // CCMR expectation. "Required" means the week must contain transfer work; if
  // the engine did not produce any, that is a gap the teacher needs to see
  // rather than a silent substitution.
  const transferCount = sessions.filter((session) => session.purpose === PURPOSE.TRANSFER).length;
  const ccmrSatisfied = settings.ccmrExpectation !== CCMR_EXPECTATION.REQUIRED || transferCount > 0;

  const filtered = settings.ccmrExpectation === CCMR_EXPECTATION.NONE
    ? sessions.filter((session) => session.purpose !== PURPOSE.TRANSFER)
    : sessions;

  return {
    studentId,
    courseId,
    weekKey: weekKeyFor(now, settings.weekStartsOn),
    dueAt: dueAtFor(now, settings),
    createdAt: now,
    settings,
    // The goal is a number of SESSIONS. It is never a number of TEKS, and the
    // distinction is the whole design.
    goalSessions: settings.sessions,
    // Each slot keeps its frozen key and gains the equally-useful options the
    // student may put in it instead. Swapping never changes the key, so a week
    // already in progress keeps counting exactly as it did.
    sessions: attachWeeklyAlternatives({
      sessions: filtered.map((session, index) => {
        const slot = index + 1;
        return {
          ...session,
          slot,
          weeklySlotKey: weeklySlotKey(session, slot),
          purposeLabel: session.purposeLabel || PURPOSE_LABEL[session.purpose] || null,
          status: 'notStarted',
        };
      }),
      considered: list(plan?.considered),
    }),
    ccmr: {
      expectation: settings.ccmrExpectation,
      framework: settings.framework,
      transferCount,
      satisfied: ccmrSatisfied,
      // Honest about the shortfall rather than quietly forcing a session.
      shortfallReason: ccmrSatisfied ? null : 'no_transfer_work_was_available_this_week',
    },
    // Carried through so a teacher screen never has to re-derive them.
    profile: plan?.profile || null,
    suppressed: plan?.suppressed || [],
  };
};


/**
 * What the student has actually completed this week, from the evidence.
 *
 * A Path session is not a single question, so completion cannot be counted in
 * questions. It is counted in SESSIONS — distinct activity sessions that
 * produced finalized evidence inside the week — which is also how the goal is
 * expressed, so the two halves of the fraction measure the same thing.
 *
 * Accuracy per session feeds the 20% quality component. It is computed only
 * from evidence that would classify the student at all: modified work and
 * teacher-forced corrections measure something else and must not become a
 * quality score.
 */
export const deriveCompletionsFromEvidence = ({
  evidenceEvents = [],
  weekKey = null,
  weekStartsOn = 1,
  now = Date.now(),
} = {}) => {
  const key = weekKey || weekKeyFor(now, weekStartsOn);
  const weekStart = Date.parse(`${key}T00:00:00Z`);
  const weekEnd = weekStart + 7 * DAY;

  const bySession = new Map();
  list(evidenceEvents).forEach((event) => {
    if (event?.performance?.status !== 'finalized') return;
    const at = Number(event?.recordedAt || event?.occurredAt || event?.createdAt || 0);
    if (!at || at < weekStart || at >= weekEnd) return;
    // Without a session id there is nothing to group by, and counting the event
    // as its own session would inflate completion — four questions in one
    // sitting is one session, not four.
    const sessionId = event?.source?.activitySessionId;
    if (!sessionId) return;

    if (!bySession.has(sessionId)) {
      bySession.set(sessionId, {
        sessionId, completedAt: at, correct: 0, counted: 0, teksCode: null,
        weekKey: event?.source?.weekKey || null,
        weeklySlotKey: event?.source?.weeklySlotKey || null,
        weeklySlot: event?.source?.weeklySlot || null,
        assessmentFramework: event?.source?.assessmentFramework || null,
      });
    }
    const entry = bySession.get(sessionId);
    entry.completedAt = Math.max(entry.completedAt, at);
    if (!entry.teksCode) {
      const alignment = list(event.alignmentKeys)[0];
      entry.teksCode = alignment ? String(alignment).split(':').pop() : null;
    }
    // Quality counts only classifying evidence.
    if (event?.supportUsage?.modified || event?.teacherForced) return;
    entry.counted += 1;
    if (event.performance.isCorrect) entry.correct += 1;
  });

  return [...bySession.values()].map((entry) => ({
    status: 'completed',
    sessionId: entry.sessionId,
    teksCode: entry.teksCode,
    completedAt: entry.completedAt,
    weekKey: entry.weekKey,
    weeklySlotKey: entry.weeklySlotKey,
    weeklySlot: entry.weeklySlot,
    assessmentFramework: entry.assessmentFramework,
    // Null, not zero, when nothing classifying was produced — the grader treats
    // an absent accuracy as neutral rather than as a wrong answer.
    accuracy: entry.counted ? entry.correct / entry.counted : null,
  })).sort((a, b) => a.completedAt - b.completedAt);
};

/**
 * The teacher's class table: goal, progress, academic profile, engagement.
 *
 * Academic profile and engagement are read STRAIGHT off the learning profile
 * and never recomputed here — a fifth status vocabulary is precisely what this
 * work was meant to stop producing.
 */
export const buildTeacherWeeklyView = (entries = [], { now = Date.now() } = {}) => (
  list(entries).map(({ studentId, studentName, goal, completions = [] }) => {
    const grade = gradeWeeklyGoal({ goal, completions, now });
    const profile = goal?.profile || null;
    return {
      studentId,
      studentName,
      goal: Number(goal?.goalSessions) || 0,
      complete: grade.progress.completed,
      academicProfile: profile
        ? `${profile.instructionalBandLabel} · ${profile.performanceProjectionLabel}`
        : 'Establishing Baseline',
      engagement: profile?.engagementLabel || 'On Track',
      overdue: grade.progress.overdue,
      grade: grade.grade,
      passing: grade.passing,
    };
  })
);

export default buildWeeklyGoal;
