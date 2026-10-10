"use strict";

/**
 * THE SERVER'S OWN WEEKLY PLAN, FOR A WEEK THAT CAME UP SHORT.
 *
 * The freeze grades the count the class's settings give
 * (weeklyPathFreezeInputs.js), so a proposal with fewer sessions used to be
 * refused unless the teacher selects every session. But an honest planner does
 * sometimes come up short: in the first weeks of the school year a six-session
 * class has fewer open skills than sessions. Refusing that week left the
 * student with no graded week at all.
 *
 * So for a short proposal the server runs THE SAME pure planner the student's
 * browser runs (buildStudentPathOptions -> buildWeeklyPathPlan ->
 * buildWeeklyGoal, assembled as MyMathPathApp assembles them) on records the
 * browser cannot write, and the freeze accepts the short week only when the
 * server's own week is at least as short. A browser can never shorten its week
 * below what the server itself could plan.
 *
 * The server's inputs, and which way each one leans:
 *   - the class's weekly settings, pacing (settings/classPacing) and skill
 *     overrides (settings/skillOverrides, plus the student's live teacher
 *     recommendation), by class id then period, as the student client reads
 *     them;
 *   - the student's server mastery profile and retention schedule;
 *   - NO practice history. Its only effect on the count is a cooldown, which
 *     can only remove skills, so without it the server's week is never
 *     shorter than the browser's.
 *   - NO assignment grades. For a course timed by a district calendar they
 *     cannot move which skills are open (no evidence is never a gap). For a
 *     course on the provisional sequence they anchor the current window, so
 *     with no saved pacing the server does not plan at all and the short week
 *     is refused as before.
 *
 * The planner lives in src/ (the browser bundle). Firebase uploads only
 * functions/, so scripts/sync-functions-weekly-planner.mjs copies the
 * planner's module closure into functions/vendor/weeklyPathPlanner/ at
 * predeploy, in the repository's own layout. As in functions-path-admin, the
 * repository copy wins whenever it is present, so tests always read the one
 * real source. If neither is present the server does not plan, and a short
 * week is refused exactly as before: it fails closed.
 */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const PACING_DOC = "classPacing";
const OVERRIDES_DOC = "skillOverrides";
const STUDENT_PATH_INTERVENTION_COLLECTION = "studentPathInterventions";
// The same four actions the client stores (pathStore.js OVERRIDE_ACTIONS).
const OVERRIDE_ACTIONS = Object.freeze(["open", "recommend", "priority", "hide"]);

// What the server imports, relative to the repository root. The sync script
// copies these and everything they import.
const PLANNER_ENTRIES = Object.freeze({
  options: "src/platform/path/studentPathOptions.js",
  plan: "src/platform/path/weeklyPathPlan.js",
  goal: "src/platform/path/weeklyPathGoal.js",
  profile: "src/platform/profile/studentLearningProfile.js",
  mastery: "src/platform/mastery/unifiedMastery.js",
  districtUnits: "src/platform/path/districtUnits.js",
});

const REPO_ROOT = path.join(__dirname, "..", "..");
const VENDOR_ROOT = path.join(__dirname, "..", "vendor", "weeklyPathPlanner");

/** Where the planner modules resolve: the repository first, then the vendored copy. */
function plannerRoot({ repoRoot = REPO_ROOT, vendorRoot = VENDOR_ROOT } = {}) {
  const present = (root) => Object.values(PLANNER_ENTRIES).every((entry) => fs.existsSync(path.join(root, entry)));
  if (present(repoRoot)) return repoRoot;
  if (present(vendorRoot)) return vendorRoot;
  return null;
}

const plannerCache = new Map();
/** The planner modules, loaded once per root. Null when they are not deployed. */
async function loadWeeklyPlanner(options = {}) {
  const root = plannerRoot(options);
  if (!root) return null;
  if (!plannerCache.has(root)) {
    const names = Object.keys(PLANNER_ENTRIES);
    plannerCache.set(root, Promise.all(names.map((name) => import(pathToFileURL(path.join(root, PLANNER_ENTRIES[name])).href)))
      .then((modules) => Object.fromEntries(names.map((name, index) => [name, modules[index]]))));
  }
  return plannerCache.get(root);
}

const text = (value) => String(value ?? "").trim();

// The client's override handling (pathStore.js normalizeOverrides and
// overridesForClassContext, interventionAsOverride), pinned equal by
// tests/platform/weeklyPathShortWeek.test.mjs. Those helpers sit beside the
// browser's Firestore client, which the server cannot load.
function normalizeOverride(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const action = String(raw.action || "");
  if (!OVERRIDE_ACTIONS.includes(action) || !raw.skillId) return null;
  return {
    classId: String(raw.classId || ""),
    skillId: String(raw.skillId),
    action,
    expiresAt: raw.expiresAt ? String(raw.expiresAt) : null,
  };
}

function overridesForClassContext(overrides, { classId = "", classPeriod = "" } = {}) {
  const ranked = new Map();
  const rankFor = (entry) => {
    if (classId && entry.classId === classId) return 3;
    if (classPeriod && entry.classId === classPeriod) return 2;
    if (!entry.classId) return 1;
    return 0;
  };
  (Array.isArray(overrides) ? overrides : []).map(normalizeOverride).filter(Boolean).forEach((entry) => {
    const rank = rankFor(entry);
    if (!rank) return;
    const current = ranked.get(entry.skillId);
    if (!current || rank >= current.rank) ranked.set(entry.skillId, { entry, rank });
  });
  return [...ranked.values()].map(({ entry }) => entry);
}

function interventionAsOverride(raw, now) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const skillId = text(raw.skillId);
  const expiresAt = Number(raw.expiresAt) || 0;
  if (!text(raw.studentId) || !skillId || !expiresAt || expiresAt <= now) return null;
  return { classId: "", skillId, action: "recommend", expiresAt: new Date(expiresAt).toISOString() };
}

const byClassContext = (byClass, classRecord) => (
  (classRecord?.classId && byClass?.[classRecord.classId])
  || (classRecord?.period && byClass?.[classRecord.period])
  || null
);

/**
 * How many sessions the server's own plan holds for this student this week,
 * asked for `requestedSessions`. Pure apart from the planner it is given.
 * Returns null when the server cannot plan this week faithfully.
 */
function planWeeklySessions(planner, {
  studentId,
  courseId,
  honors = false,
  requestedSessions,
  weeklyConfig = null,
  pacing = null,
  teacherOverrides = [],
  serverProfiles = {},
  retentionSchedules = {},
  now,
} = {}) {
  const course = text(courseId);
  if (!planner || !course || !(Number(requestedSessions) > 0)) return null;
  // Provisional pacing with nothing saved is anchored to the class's open
  // assignments, which the server does not read.
  if (!planner.districtUnits.districtCalendarFor(course) && !(pacing && typeof pacing === "object")) return null;
  const { normalizeWeeklyGoalConfig, weeklyPlanClassInputs, buildWeeklyGoal } = planner.goal;
  // As App.jsx hands the class's settings to My Math Path
  // (storedWeeklyGoalForClassContext), asked for the count the server grades.
  const stored = weeklyConfig && typeof weeklyConfig === "object"
    ? normalizeWeeklyGoalConfig(weeklyConfig, { honors: Boolean(weeklyConfig.honors) })
    : {};
  const config = { ...stored, sessions: Number(requestedSessions) };
  const masteryProfilesByTeks = planner.mastery.buildUnifiedMasteryProfiles({
    student: { id: studentId },
    serverProfiles,
    retentionSchedulesByTEKS: retentionSchedules,
  });
  const options = planner.options.buildStudentPathOptions({
    student: { id: studentId },
    assignments: [],
    courseId: course,
    pacing,
    teacherOverrides,
    serverMasteryProfiles: serverProfiles,
    nowValue: now,
  });
  const profile = planner.profile.buildStudentLearningProfile({
    courseId: course,
    masteryProfilesByTeks,
    evidenceEvents: [],
    retentionSchedules,
  });
  const plan = planner.plan.buildWeeklyPathPlan({
    options,
    courseId: course,
    profile,
    masteryProfilesByTeks,
    retentionSchedules,
    evidenceEvents: [],
    ...weeklyPlanClassInputs({ config, honors }),
    now,
  });
  const goal = buildWeeklyGoal({ plan, config, honors, studentId, courseId: course, now });
  return Array.isArray(goal?.sessions) ? goal.sessions.length : null;
}

/**
 * Read what the server's plan needs and plan the week. Never throws: a week
 * the server cannot plan returns null, and the freeze then refuses a short
 * proposal as it always did.
 */
async function loadServerPlannedSessions({
  db,
  studentId,
  classRecord = null,
  honors = false,
  requestedSessions,
  weeklyConfig = null,
  serverProfiles = {},
  retentionSchedules = {},
  now = Date.now(),
  plannerOptions = {},
} = {}) {
  try {
    const planner = await loadWeeklyPlanner(plannerOptions);
    if (!planner) {
      console.warn("weeklyPathServerPlan: the weekly planner is not deployed; a short week is refused.");
      return null;
    }
    const [pacingSnapshot, overridesSnapshot, interventionSnapshot] = await Promise.all([
      db.collection("settings").doc(PACING_DOC).get(),
      db.collection("settings").doc(OVERRIDES_DOC).get(),
      db.collection(STUDENT_PATH_INTERVENTION_COLLECTION).doc(studentId).get(),
    ]);
    const pacing = byClassContext(pacingSnapshot.exists ? pacingSnapshot.data()?.byClass : null, classRecord);
    const classOverrides = overridesForClassContext(
      overridesSnapshot.exists ? overridesSnapshot.data()?.overrides : [],
      { classId: classRecord?.classId || "", classPeriod: classRecord?.period || "" },
    );
    const personal = interventionAsOverride(interventionSnapshot.exists ? interventionSnapshot.data() : null, now);
    return planWeeklySessions(planner, {
      studentId,
      courseId: classRecord?.course,
      honors,
      requestedSessions,
      weeklyConfig,
      pacing,
      teacherOverrides: personal ? [...classOverrides, personal] : classOverrides,
      serverProfiles,
      retentionSchedules,
      now,
    });
  } catch (error) {
    console.warn("weeklyPathServerPlan: could not plan the week; a short week is refused.", error?.message || error);
    return null;
  }
}

module.exports = {
  PLANNER_ENTRIES,
  REPO_ROOT,
  VENDOR_ROOT,
  plannerRoot,
  loadWeeklyPlanner,
  planWeeklySessions,
  loadServerPlannedSessions,
  normalizeOverride,
  overridesForClassContext,
  interventionAsOverride,
};
