// Persistence for the three path inputs that are NOT the skill graph:
// class pacing position, teacher overrides, and route history.
//
// They are stored apart from the graph on purpose (§30 of the brief). A
// teacher moving their class to module 3, or opening one skill early for one
// period, must never mutate global curriculum metadata — otherwise one
// teacher's local decision silently becomes every teacher's.
//
// Normalisation is pure and exported separately from the Firestore calls, so
// the rules can be tested without a network and the Teacher Path Simulator can
// reuse them against synthetic data.

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { normalizeClassPacing } from './curriculumPacing.js';
import { normalizeWeeklyGoalConfig } from './weeklyPathGoal.js';

export const PACING_DOC = 'classPacing';
export const WEEKLY_GOAL_DOC = 'weeklyPathGoals';
export const OVERRIDES_DOC = 'skillOverrides';
export const HISTORY_COLLECTION = 'pathHistory';

// A student's route history is a rolling window, not an archive. It exists to
// explain the last few decisions to a teacher and to replay them in the
// simulator; long-term analytics belong in the evidence timeline.
export const MAX_HISTORY_EVENTS = 100;

export const OVERRIDE_ACTIONS = Object.freeze(['open', 'recommend', 'priority', 'hide']);

// ---------------------------------------------------------------- pure layer

/**
 * Pacing is stored per class period, so one teacher's Algebra I sections can
 * legitimately sit in different modules.
 */
export const normalizePacingByClass = (raw) => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([classId]) => classId)
      .map(([classId, pacing]) => [classId, normalizeClassPacing(pacing)]),
  );
};

export const getPacingForClass = (pacingByClass, classId) => (
  normalizePacingByClass(pacingByClass)[classId] || normalizeClassPacing({})
);

/**
 * Resolve a student's saved pacing without making the legacy period key the
 * source of truth. New controls save by real classId; old deployments saved by
 * period, so the period remains a read-only compatibility fallback until those
 * records are naturally replaced.
 */
export const storedPacingForClassContext = (pacingByClass, { classId = '', classPeriod = '' } = {}) => {
  const normalized = normalizePacingByClass(pacingByClass);
  return (classId && normalized[classId]) || (classPeriod && normalized[classPeriod]) || null;
};

/**
 * Weekly goal settings, stored per class for the same reason pacing is: one
 * teacher's Algebra I section and their Algebra II Honors section want
 * different weeks, and a setting saved for one must never silently become the
 * setting for the other.
 *
 * Normalisation runs on both read and write. A settings document written by an
 * older build, or hand-edited in the Firebase console, has to produce a working
 * week rather than an exception — the whole design rests on a teacher who
 * configures nothing still getting a functioning Path.
 */
export const normalizeWeeklyGoalsByClass = (raw) => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([classId]) => classId)
      .map(([classId, config]) => [
        classId,
        normalizeWeeklyGoalConfig(config, { honors: Boolean(config?.honors) }),
      ]),
  );
};

/**
 * The settings that apply to one student, with the same classId-then-period
 * fallback pacing uses. Returns null when nothing is stored, so the caller can
 * tell "the teacher chose the defaults" from "the teacher chose nothing" — the
 * difference matters when deciding whether to show a configuration prompt.
 */
export const storedWeeklyGoalForClassContext = (goalsByClass, { classId = '', classPeriod = '' } = {}) => {
  const normalized = normalizeWeeklyGoalsByClass(goalsByClass);
  return (classId && normalized[classId]) || (classPeriod && normalized[classPeriod]) || null;
};

export const normalizeOverride = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const action = String(raw.action || '');
  if (!OVERRIDE_ACTIONS.includes(action)) return null;
  if (!raw.skillId) return null;
  return {
    classId: String(raw.classId || ''),
    skillId: String(raw.skillId),
    action,
    // An override with no expiry is permanent until removed, which is a real
    // teacher intention ("this class always gets this early").
    expiresAt: raw.expiresAt ? String(raw.expiresAt) : null,
    note: raw.note ? String(raw.note).slice(0, 200) : '',
    createdAt: raw.createdAt || new Date().toISOString(),
  };
};

export const normalizeOverrides = (raw) => (Array.isArray(raw) ? raw : [])
  .map(normalizeOverride)
  .filter(Boolean);

export const overridesForClass = (overrides, classId) => normalizeOverrides(overrides)
  .filter((entry) => !entry.classId || entry.classId === classId);


/**
 * Class-scoped overrides with legacy period compatibility. If the same skill
 * exists at more than one scope, the real classId wins over the old period key
 * and either wins over a global override.
 */
export const overridesForClassContext = (overrides, { classId = '', classPeriod = '' } = {}) => {
  const ranked = new Map();
  const rankFor = (entry) => {
    if (classId && entry.classId === classId) return 3;
    if (classPeriod && entry.classId === classPeriod) return 2;
    if (!entry.classId) return 1;
    return 0;
  };
  normalizeOverrides(overrides).forEach((entry) => {
    const rank = rankFor(entry);
    if (!rank) return;
    const current = ranked.get(entry.skillId);
    if (!current || rank >= current.rank) ranked.set(entry.skillId, { entry, rank });
  });
  return [...ranked.values()].map(({ entry }) => entry);
};

/**
 * Add or replace an override. One action per (class, skill): a teacher who
 * hides a skill after recommending it means the hide, not both.
 */
export const upsertOverride = (overrides, next) => {
  const entry = normalizeOverride(next);
  if (!entry) return normalizeOverrides(overrides);
  return [
    ...normalizeOverrides(overrides).filter((item) => !(item.classId === entry.classId && item.skillId === entry.skillId)),
    entry,
  ];
};

export const removeOverride = (overrides, { classId = '', skillId }) => normalizeOverrides(overrides)
  .filter((item) => !(item.classId === classId && item.skillId === skillId));

export const pruneExpiredOverrides = (overrides, nowValue = Date.now()) => normalizeOverrides(overrides)
  .filter((entry) => !entry.expiresAt || new Date(entry.expiresAt).getTime() >= nowValue);

// ------------------------------------------------------------- route history

export const ROUTE_EVENTS = Object.freeze({
  GENERATED: 'recommendation-generated',
  CHOSEN: 'skill-chosen',
  REMEDIATION_STARTED: 'remediation-started',
  REMEDIATION_RETURNED: 'remediation-returned',
  OVERRIDE_APPLIED: 'teacher-override-applied',
  PACING_MOVED: 'class-pacing-moved',
});

/**
 * One routing decision, in the shape §35 asks for. Reason codes rather than
 * prose, so teacher explanations, QA and simulator playback all read the same
 * record instead of parsing sentences.
 */
export const buildRouteEvent = ({
  studentId,
  event,
  originSkillId = null,
  selectedSkillId = null,
  decisionType = null,
  reasons = [],
  context = null,
  nowValue = Date.now(),
} = {}) => ({
  studentId: String(studentId || ''),
  timestamp: new Date(nowValue).toISOString(),
  event: String(event || ROUTE_EVENTS.GENERATED),
  originSkillId,
  selectedSkillId,
  decisionType,
  reasons: (Array.isArray(reasons) ? reasons : []).map(String).slice(0, 20),
  context: context && typeof context === 'object' ? context : null,
});

export const appendRouteEvent = (history, event, max = MAX_HISTORY_EVENTS) => {
  const list = Array.isArray(history) ? history : [];
  return [...list, event].slice(-Math.max(1, max));
};

// ----------------------------------------------------------- firestore layer

export const fetchClassPacing = async () => {
  const snapshot = await getDoc(doc(db, 'settings', PACING_DOC));
  return snapshot.exists() ? normalizePacingByClass(snapshot.data()?.byClass) : {};
};

export const saveClassPacing = async (pacingByClass) => {
  await setDoc(doc(db, 'settings', PACING_DOC), { byClass: normalizePacingByClass(pacingByClass) });
};

export const fetchWeeklyGoalSettings = async () => {
  const snapshot = await getDoc(doc(db, 'settings', WEEKLY_GOAL_DOC));
  return snapshot.exists() ? normalizeWeeklyGoalsByClass(snapshot.data()?.byClass) : {};
};

export const saveWeeklyGoalSettings = async (goalsByClass) => {
  await setDoc(doc(db, 'settings', WEEKLY_GOAL_DOC), { byClass: normalizeWeeklyGoalsByClass(goalsByClass) });
};

export const fetchSkillOverrides = async () => {
  const snapshot = await getDoc(doc(db, 'settings', OVERRIDES_DOC));
  return snapshot.exists() ? normalizeOverrides(snapshot.data()?.overrides) : [];
};

export const saveSkillOverrides = async (overrides) => {
  // Expired entries are dropped on write rather than accumulating forever.
  await setDoc(doc(db, 'settings', OVERRIDES_DOC), { overrides: pruneExpiredOverrides(overrides) });
};

export const fetchRouteHistory = async (studentId) => {
  if (!studentId) return [];
  const snapshot = await getDoc(doc(db, HISTORY_COLLECTION, studentId));
  return snapshot.exists() ? (snapshot.data()?.events || []) : [];
};

/**
 * Route history is best-effort. A failed log must never block a student from
 * moving on, so this resolves either way and reports what happened.
 */
export const logRouteEvent = async ({ studentId, event }) => {
  if (!studentId || !event) return { logged: false, reason: 'missing studentId or event' };
  try {
    const existing = await fetchRouteHistory(studentId);
    const events = appendRouteEvent(existing, event);
    await setDoc(doc(db, HISTORY_COLLECTION, studentId), { studentId, events }, { merge: true });
    return { logged: true, count: events.length };
  } catch (error) {
    return { logged: false, reason: error?.message || 'write failed' };
  }
};

export const clearRouteHistory = async (studentId) => {
  if (!studentId) return;
  await updateDoc(doc(db, HISTORY_COLLECTION, studentId), { events: [] });
};
