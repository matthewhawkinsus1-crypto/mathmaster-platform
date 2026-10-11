/*
 * WHAT ONE FROZEN WEEKLY SLOT PERMITS — ONE DEFINITION FOR BOTH SIDES.
 *
 * A student's week is frozen on the server the first time it is built
 * (resolveWeeklyPathGoalSnapshot). Each slot is a commitment: a standard, a
 * purpose, an assessment context, a depth and a complexity, under a frozen
 * `weeklySlotKey` that every completion is matched by.
 *
 * "Swap a skill" lets the student put a different, equally useful standard in
 * a slot. That only works end to end if the server agrees on which standards
 * are equally useful, so the agreement is frozen with the week: each slot keeps
 * a short, sanitized list of alternatives, and a launch for that slot may target
 * the slot's own standard or one of those — nothing else. The swap changes WHAT
 * is practised and never WHICH slot it fills, or how it is practised: the
 * session runs in the slot's assessment context, at the slot's DOK and
 * difficulty band, under the slot's key, so the student panel, the teacher
 * table and the Google Classroom grade all count it against the same slot.
 *
 * The same functions run in the Cloud Function (startMyMathPathSession and
 * resolveWeeklyPathGoalSnapshot) and in the Teacher Path Simulator's runtime,
 * so a teacher cannot watch a swap the server would refuse.
 *
 * A week frozen before alternatives existed has none, and therefore permits
 * exactly what it always did: the slot's own standard.
 *
 * Pure: no Firestore, no network. The TEKS canonicalizers are injected because
 * the server's live in CommonJS (functions/lib/mathPath.js); the defaults are
 * the shared ones in teksUtils.mjs, which the browser uses.
 */

import { toCanonicalKey, toDisplayCode } from './teksUtils.mjs';

// The server-side bound. The browser offers fewer (weeklyPathChoice.js), and a
// frozen week can never carry more than this however the proposal was built.
export const MAX_WEEKLY_SLOT_ALTERNATIVES = 3;

// 2 = slots carry `alternatives`. Weeks frozen at 1 predate swapping.
export const WEEKLY_PATH_GOAL_SCHEMA_VERSION = 2;

// The same four the session runtime accepts (normalizePathAssessmentFramework
// in functions/index.js). Anything else is ordinary course practice. The
// callable injects its own normalizer, but the simulator and the browser use
// this list, so the two are pinned equal by tests/platform/
// weeklyPathSlotAuthority.test.mjs: adding a framework on one side alone would
// let the simulator and the server classify a slot's context differently.
export const WEEKLY_PATH_FRAMEWORKS = Object.freeze(['digitalSAT', 'act', 'tsia2', 'asvab']);

// Mirrors TEKS_SKILL_PREFIX in pathSkillGraph.mjs (pinned by a test) without
// pulling the whole skill graph into a callable's cold start.
const TEKS_SKILL_PREFIX = 'teks:';

// Every Texas math display code: A.5A, A2.4F, 8.5I, 7.7, G.2B. A frozen
// alternative is a launch permission, so it must at least look like a standard.
const TEKS_DISPLAY_CODE = /^[A-Z0-9]{1,4}\.\d{1,2}[A-Z]?$/;

// How many proposed alternatives are even looked at for one slot. Anything past
// this is a malformed proposal, not a bigger choice.
const MAX_ALTERNATIVES_SCANNED = 12;

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();
const clip = (value, max) => {
  const clean = text(value);
  return clean ? clean.slice(0, max) : null;
};

export class WeeklyPathGoalError extends Error {
  constructor(code, message, reason = null) {
    super(message);
    this.name = 'WeeklyPathGoalError';
    // An HttpsError code, so the callable can rethrow it unchanged.
    this.code = code;
    this.reason = reason;
  }
}

export const normalizeWeeklyPathFramework = (value) => {
  const framework = text(value);
  return WEEKLY_PATH_FRAMEWORKS.includes(framework) ? framework : null;
};

const toolsFrom = ({
  canonicalTeks = toCanonicalKey,
  displayTeks = toDisplayCode,
  normalizeFramework = normalizeWeeklyPathFramework,
} = {}) => ({ canonicalTeks, displayTeks, normalizeFramework });

const contextOf = (value, tools) => tools.normalizeFramework(value) || 'course';

const teksFromSkillId = (skillId) => {
  const id = text(skillId);
  return id.startsWith(TEKS_SKILL_PREFIX) ? id.slice(TEKS_SKILL_PREFIX.length) : '';
};

const displayCodeOf = (value, tools) => text(tools.displayTeks(tools.canonicalTeks(value)));

/**
 * The standards already seated in a week, as canonical keys. No slot may offer
 * another slot's standard: the student would practise it twice for two slots.
 */
export const seatedWeeklyTeks = (sessions = [], options = {}) => {
  const tools = toolsFrom(options);
  return new Set(list(sessions)
    .map((slot) => text(tools.canonicalTeks(slot?.teksCode)))
    .filter(Boolean));
};

/**
 * Every slot's alternatives, sanitized in slot order.
 *
 * A standard is offered by ONE slot at most: each slot's kept alternatives are
 * seated before the next slot is sanitized, so two slots can never both offer
 * (and both be filled by) the same standard. `alternativesOf(slot, index)`
 * supplies what each slot proposes.
 */
const sanitizeWeekAlternatives = (slots, alternativesOf, tools) => {
  const seated = seatedWeeklyTeks(slots, tools);
  return list(slots).map((slot, index) => {
    const kept = sanitizeWeeklySlotAlternatives(alternativesOf(slot, index), { slot, seated, ...tools });
    kept.forEach((entry) => seated.add(text(tools.canonicalTeks(entry.teksCode))));
    return kept;
  });
};

/**
 * The alternatives one slot may freeze, sanitized.
 *
 * Kept: at most MAX_WEEKLY_SLOT_ALTERNATIVES, each a valid display code in the
 * slot's own assessment context and purpose, distinct from the slot, from each
 * other and from every standard seated in the week. Stored: only what the swap
 * control shows and the launch check needs — no scores, no reasoning, nothing
 * that could grow the snapshot without bound.
 */
export const sanitizeWeeklySlotAlternatives = (alternatives, {
  slot = null,
  seated = new Set(),
  limit = MAX_WEEKLY_SLOT_ALTERNATIVES,
  ...toolOptions
} = {}) => {
  if (!slot) return [];
  const tools = toolsFrom(toolOptions);
  const slotKey = text(tools.canonicalTeks(slot.teksCode));
  const slotContext = contextOf(slot.context, tools);
  const slotPurpose = text(slot.purpose);
  const max = Math.max(0, Math.min(MAX_WEEKLY_SLOT_ALTERNATIVES, Number(limit) || 0));
  const seen = new Set();
  const kept = [];

  for (const entry of list(alternatives).slice(0, MAX_ALTERNATIVES_SCANNED)) {
    if (kept.length >= max) break;
    if (!entry || typeof entry !== 'object') continue;

    const teksCode = displayCodeOf(text(entry.teksCode) || teksFromSkillId(entry.skillId), tools);
    if (!TEKS_DISPLAY_CODE.test(teksCode)) continue;
    const key = text(tools.canonicalTeks(teksCode));
    if (!key || key === slotKey || seen.has(key) || seated.has(key)) continue;

    // Same assessment context: a swap never turns SAT practice into course
    // practice, or one exam into another. An alternative that names no context
    // inherits the slot's — the stored records never repeat it, and the browser
    // builds options the same way (candidate.context || slot.context).
    const context = text(entry.context) ? contextOf(entry.context, tools) : slotContext;
    if (context !== slotContext) continue;
    // Same purpose: a retention slot is not swapped for current learning.
    if (entry.purpose != null && text(entry.purpose).slice(0, 60) !== slotPurpose) continue;

    const skillId = clip(entry.skillId, 180) || `${TEKS_SKILL_PREFIX}${teksCode}`;
    const skillTeks = teksFromSkillId(skillId);
    // A TEKS skill id that names a different standard is a contradiction, not
    // an alternative.
    if (skillTeks && displayCodeOf(skillTeks, tools) !== teksCode) continue;

    seen.add(key);
    kept.push({
      skillId,
      teksCode,
      studentLabel: clip(entry.studentLabel, 180),
      purposeLabel: clip(entry.purposeLabel, 120) || slot.purposeLabel || null,
      swapReason: clip(entry.swapReason, 240),
    });
  }
  return kept;
};

// A frozen week's due date must fall inside the week: its seven days plus the
// Sunday evening that is already Monday in UTC (the completion window's day).
export const WEEKLY_DUE_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

// The server freezes only the week that is current by its own clock: from a
// day before the week starts (a device clock a little ahead) until that same
// eight-day window closes.
export const WEEKLY_FREEZE_LEAD_MS = 24 * 60 * 60 * 1000;

// The teacher's weekly count, as the client's normalizeWeeklyGoalConfig reads
// it (src/platform/path/weeklyPathGoal.js WEEKLY_GOAL; pinned equal by test).
export const WEEKLY_SESSION_COUNT = Object.freeze({ MINIMUM: 3, MAXIMUM: 6, REGULAR_DEFAULT: 4, HONORS_DEFAULT: 5 });
export const TEACHER_SELECTED_MODE = 'teacherSelected';

/**
 * How many sessions a class's week is graded on, from the teacher's stored
 * settings (settings/weeklyPathGoals, by class) — never from the browser.
 */
export const weeklySessionsForClass = ({ config = null, honors = false } = {}) => {
  const requested = Number(config?.sessions);
  return Number.isFinite(requested)
    ? Math.max(WEEKLY_SESSION_COUNT.MINIMUM, Math.min(WEEKLY_SESSION_COUNT.MAXIMUM, Math.round(requested)))
    : (honors ? WEEKLY_SESSION_COUNT.HONORS_DEFAULT : WEEKLY_SESSION_COUNT.REGULAR_DEFAULT);
};

// What a Retention slot the server cannot confirm is due becomes: a full
// review session on a skill the student knows, never a two-question check.
const UNCONFIRMED_RETENTION = Object.freeze({ purpose: 'responsiveReview', purposeLabel: 'Review' });

/**
 * The server's frozen copy of a proposed week.
 *
 * Everything the browser sent is treated as a proposal: the slot fields are
 * bounded and normalized exactly as they always were, and each slot now also
 * keeps its sanitized alternatives. Throws WeeklyPathGoalError, whose `code` is
 * the HttpsError code the callable should answer with.
 */
export const freezeWeeklyPathGoalProposal = (goal = {}, {
  studentId = null,
  classId = '',
  courseId = '',
  // The server's clock. The callable always passes it; the Teacher Path
  // Simulator, which runs its own synthetic weeks, does not.
  now = null,
  // The callable's own facts (functions/lib/weeklyPathFreezeInputs.js): the
  // count the class's settings give, whether those settings explain a week
  // with fewer sessions, and which skills the server's records say are due a
  // retention check. The simulator passes none of them.
  requestedSessions: serverRequestedSessions = null,
  shortWeekReason = null,
  retentionDue = null,
  // How many sessions the server's OWN plan holds for this student this week
  // (functions/lib/weeklyPathServerPlan.js), computed only for a short
  // proposal; null when the server did not or could not plan.
  plannedSessions = null,
  ...toolOptions
} = {}) => {
  const tools = toolsFrom(toolOptions);
  const weekKey = text(goal?.weekKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey) || !Number.isFinite(Date.parse(`${weekKey}T00:00:00Z`))) {
    throw new WeeklyPathGoalError('invalid-argument', 'A valid weekly Path weekKey is required.');
  }
  // The due date decides when the week's grade freezes and whether the
  // Classroom publisher may send it, and it arrives from the student's browser.
  // So it must belong to the week being frozen (its days, plus the Sunday
  // evening that is already Monday in UTC). A missing or far-future dueAt
  // would keep the week open for good — never graded, never published — and
  // count late work as on time. Every real client computes it with dueAtFor.
  const weekStart = Date.parse(`${weekKey}T00:00:00Z`);
  const dueAt = Number(goal?.dueAt);
  if (!Number.isFinite(dueAt) || dueAt < weekStart || dueAt >= weekStart + WEEKLY_DUE_WINDOW_MS) {
    throw new WeeklyPathGoalError('invalid-argument', 'This weekly Path proposal has no valid due date for its week.');
  }
  // Only the current week can be frozen. Otherwise a student could freeze a
  // past week they never opened, from practice they happened to do that week,
  // and count it toward the weeks-hit streak.
  if (now !== null && now !== undefined) {
    const clock = Number(now);
    if (!Number.isFinite(clock) || clock < weekStart - WEEKLY_FREEZE_LEAD_MS || clock >= weekStart + WEEKLY_DUE_WINDOW_MS) {
      throw new WeeklyPathGoalError('failed-precondition', 'This weekly Path is not for the current week. Check the date on this device, then reload.');
    }
  }
  const cleanClassId = text(classId);
  const cleanCourseId = text(courseId);
  if (!cleanClassId || !cleanCourseId) {
    throw new WeeklyPathGoalError('failed-precondition', 'Your MathMaster class is not fully configured yet.');
  }
  if (goal?.courseId && String(goal.courseId) !== cleanCourseId) {
    throw new WeeklyPathGoalError('failed-precondition', 'This weekly Path proposal belongs to a different course.');
  }
  // The teacher's count. On the server it comes from the class's settings and
  // nothing the browser sends can lower it; only the simulator still reads the
  // proposal's (a current client sends it as requestedSessions).
  const serverCount = Number(serverRequestedSessions);
  const fromServer = Number.isFinite(serverCount) && serverCount > 0;
  const requested = fromServer
    ? Math.max(WEEKLY_SESSION_COUNT.MINIMUM, Math.min(WEEKLY_SESSION_COUNT.MAXIMUM, Math.round(serverCount)))
    : Math.max(3, Math.min(6, Number(goal?.requestedSessions) || Number(goal?.goalSessions) || 4));
  const proposed = Array.isArray(goal?.sessions) ? goal.sessions.slice(0, requested) : [];
  if (!proposed.length) {
    throw new WeeklyPathGoalError('failed-precondition', 'MathMaster could not build any weekly Path sessions for this week.');
  }
  // A week with fewer sessions than the class asks for is graded on the
  // sessions it holds, so the server accepts one only when its own records
  // explain it: the teacher selects every session and selected fewer, or the
  // server's own planner, on the server's records, cannot fill the count
  // either and the proposal holds at least as many sessions as that plan. A
  // browser that sent one easy slot would otherwise be graded 100 for one
  // session, and a browser can never shorten a week the server could fill.
  const shortBy = requested - proposed.length;
  const planned = Number(plannedSessions);
  const plannerShortfall = Number.isInteger(planned) && planned > 0 && proposed.length >= planned;
  if (fromServer && shortBy > 0 && !shortWeekReason && !plannerShortfall) {
    throw new WeeklyPathGoalError(
      'failed-precondition',
      `This week's Path needs ${requested} sessions and only ${proposed.length} could be planned. Reload My Math Path to try again.`,
    );
  }

  const slots = proposed.map((session, index) => {
    const slot = index + 1;
    const displayCode = displayCodeOf(session?.teksCode || session?.skillId, tools);
    if (!displayCode) throw new WeeklyPathGoalError('invalid-argument', `Weekly Path slot ${slot} has no valid standard.`);
    const context = contextOf(session?.context, tools);
    const dok = Math.max(1, Math.min(4, Math.round(Number(session?.dok) || 2)));
    const difficultyBand = Math.max(1, Math.min(5, Math.round(Number(session?.difficultyBand) || 3)));
    const suppliedKey = text(session?.weeklySlotKey);
    const weeklySlotKey = suppliedKey || [
      slot,
      String(session?.skillId || ''),
      displayCode,
      String(session?.purpose || 'practice'),
      context,
      dok,
      difficultyBand,
    ].join('|');
    if (weeklySlotKey.length > 300) throw new WeeklyPathGoalError('invalid-argument', `Weekly Path slot ${slot} key is too long.`);
    // A Retention slot launches a two-question check (pathRetentionCheck.mjs),
    // so it is accepted only for a skill the server's records say is due one.
    const proposedPurpose = String(session?.purpose || 'practice').slice(0, 60);
    const unconfirmedRetention = typeof retentionDue === 'function'
      && proposedPurpose === 'retention'
      && !retentionDue(displayCode);
    return {
      slot,
      weeklySlotKey,
      skillId: String(session?.skillId || '').slice(0, 180) || null,
      teksCode: displayCode,
      purpose: unconfirmedRetention ? UNCONFIRMED_RETENTION.purpose : proposedPurpose,
      context,
      dok,
      difficultyBand,
      studentLabel: session?.studentLabel ? String(session.studentLabel).slice(0, 180) : null,
      purposeLabel: unconfirmedRetention
        ? UNCONFIRMED_RETENTION.purposeLabel
        : (session?.purposeLabel ? String(session.purposeLabel).slice(0, 120) : null),
      studentExplanation: session?.studentExplanation ? String(session.studentExplanation).slice(0, 400) : null,
      targetReason: session?.targetReason ? String(session.targetReason).slice(0, 180) : null,
      status: 'notStarted',
    };
  });

  const alternatives = sanitizeWeekAlternatives(slots, (slot, index) => proposed[index]?.alternatives, tools);
  const sessions = slots.map((slot, index) => ({ ...slot, alternatives: alternatives[index] }));

  return {
    schemaVersion: WEEKLY_PATH_GOAL_SCHEMA_VERSION,
    studentId,
    classId: cleanClassId,
    courseId: cleanCourseId,
    weekKey,
    dueAt,
    // A week asks for the sessions it actually holds: a planner that could
    // fill only three of four slots freezes a three-session goal, so the
    // panel, the teacher table and the Classroom grade agree it is complete
    // when all three are done. The teacher's count is kept beside it.
    goalSessions: sessions.length,
    requestedSessions: requested,
    // Why this week holds fewer sessions than the class asks for, when it does
    // (the teacher table and the Classroom post say "graded on N of M").
    shortWeekReason: sessions.length < requested ? (text(shortWeekReason) || 'plannerShortfall') : null,
    sessions,
    ccmr: goal?.ccmr && typeof goal.ccmr === 'object' ? {
      expectation: String(goal.ccmr.expectation || 'none').slice(0, 40),
      framework: String(goal.ccmr.framework || 'auto').slice(0, 40),
      transferCount: Math.max(0, Number(goal.ccmr.transferCount) || 0),
      satisfied: goal.ccmr.satisfied !== false,
      shortfallReason: goal.ccmr.shortfallReason ? String(goal.ccmr.shortfallReason).slice(0, 160) : null,
    } : null,
  };
};

/** The frozen slot a launch names, or null. */
export const findWeeklySlot = (goal = null, weeklySlotKey = null) => {
  const key = text(weeklySlotKey);
  if (!key) return null;
  return list(goal?.sessions).find((slot) => text(slot?.weeklySlotKey) === key) || null;
};

/**
 * The alternatives a frozen slot permits right now: the stored lists, read back
 * through the same sanitizer in the same slot order, so a launch can never be
 * authorized by anything a fresh freeze would not keep — including a standard
 * an earlier slot already offers.
 */
export const permittedWeeklySlotAlternatives = (goal = null, slot = null, options = {}) => {
  if (!slot) return [];
  const tools = toolsFrom(options);
  const slots = list(goal?.sessions);
  const key = text(slot.weeklySlotKey);
  let index = slots.indexOf(slot);
  if (index === -1 && key) index = slots.findIndex((entry) => text(entry?.weeklySlotKey) === key);
  if (index === -1) {
    return sanitizeWeeklySlotAlternatives(slot.alternatives, {
      slot,
      seated: seatedWeeklyTeks(slots, tools),
      ...tools,
    });
  }
  const replay = slots.map((entry, position) => (position === index ? slot : entry));
  return sanitizeWeekAlternatives(replay, (entry) => entry?.alternatives, tools)[index];
};

/**
 * The open session a weekly slot already holds, or null.
 *
 * ONE SLOT, ONE OPEN SESSION. The session lock is keyed by target, and a slot
 * frozen with alternatives can be launched on more than one standard — so the
 * lock alone would let a second launch for the same slot (a reload that shows
 * the recommendation before the student's sessions have loaded, or an older
 * browser) open a second session beside the first, and the student's card and
 * the teacher's row would then disagree about what filled the slot. A launch
 * for a slot that already has an open session resumes that session instead,
 * on whichever of the slot's standards it was opened.
 *
 * `sessions` is [{ id, data }] in the pathSessions document shape. The session
 * named by `preferSessionId` (the target's own lock) wins when it is open;
 * otherwise the most recently updated open one.
 */
export const openWeeklySlotSession = ({
  sessions = [],
  studentId = null,
  weekKey = null,
  weeklySlotKey = null,
  preferSessionId = null,
} = {}) => {
  const key = text(weeklySlotKey);
  const week = text(weekKey);
  if (!key || !week) return null;
  const open = list(sessions)
    .filter((entry) => {
      const data = entry?.data;
      return text(entry?.id)
        && data?.status === 'active'
        && (!studentId || data.studentId === studentId)
        && text(data.weekKey) === week
        && text(data.weeklySlotKey) === key;
    })
    .sort((a, b) => (Number(b.data.updatedAt || b.data.createdAt) || 0) - (Number(a.data.updatedAt || a.data.createdAt) || 0));
  return open.find((entry) => preferSessionId && entry.id === preferSessionId) || open[0] || null;
};

const refuse = (code, message, reason) => ({ ok: false, code, message, reason });

/**
 * May this launch run for this frozen weekly slot?
 *
 * Accepts the slot's own standard, or one of the slot's frozen alternatives.
 * Refuses another standard, another assessment context, a slot that is not in
 * the week, or a week that belongs to another class. On success it returns what
 * the session must record — always the SLOT's framework, DOK, band and purpose,
 * because a swap changes the standard and nothing else — plus, for a swap,
 * which alternative was chosen and which standard it replaced.
 *
 * `chosenSkillId` is the browser's claim of which option it picked. It never
 * authorizes anything; it only breaks a tie between alternatives sharing a
 * standard, which the freeze already prevents.
 */
export const authorizeWeeklySlotLaunch = ({
  goal = null,
  weeklySlotKey = null,
  targetAlignmentKey = null,
  requestedFramework = null,
  chosenSkillId = null,
  classId = null,
  ...toolOptions
} = {}) => {
  const tools = toolsFrom(toolOptions);
  if (!goal) {
    return refuse('failed-precondition', 'This weekly commitment has not been assigned yet. Return to My Math Path and reload the week.', 'week-not-assigned');
  }
  if (classId && goal.classId !== classId) {
    return refuse('failed-precondition', 'This weekly commitment belongs to a different class.', 'class-mismatch');
  }
  const slot = findWeeklySlot(goal, weeklySlotKey);
  if (!slot) {
    return refuse('failed-precondition', 'That weekly Path slot is no longer part of the assigned week.', 'slot-missing');
  }

  const target = text(tools.canonicalTeks(targetAlignmentKey));
  const assignedTarget = text(tools.canonicalTeks(slot.teksCode));
  let chosenAlternative = null;
  if (!assignedTarget || !target) {
    return refuse('failed-precondition', 'That launch does not match the assigned weekly standard.', 'target-mismatch');
  }
  if (target !== assignedTarget) {
    const matches = permittedWeeklySlotAlternatives(goal, slot, tools)
      .filter((entry) => text(tools.canonicalTeks(entry.teksCode)) === target);
    const alternative = matches.find((entry) => text(entry.skillId) === text(chosenSkillId)) || matches[0] || null;
    if (!alternative) {
      return refuse('failed-precondition', 'That launch does not match the assigned weekly standard.', 'target-mismatch');
    }
    chosenAlternative = { skillId: alternative.skillId, teksCode: alternative.teksCode };
  }

  const assessmentFramework = tools.normalizeFramework(slot.context);
  const requested = tools.normalizeFramework(requestedFramework);
  if (requested && requested !== assessmentFramework) {
    return refuse('failed-precondition', 'That launch does not match the assigned weekly assessment context.', 'framework-mismatch');
  }

  return {
    ok: true,
    slot,
    swapped: Boolean(chosenAlternative),
    chosenAlternative,
    swappedFromTeks: chosenAlternative ? slot.teksCode : null,
    assessmentFramework,
    intendedDok: slot.dok ?? null,
    intendedDifficultyBand: slot.difficultyBand ?? null,
    weeklyPurpose: slot.purpose || null,
  };
};
