"use strict";

/**
 * THE ONE MASTERY RULE, ON THE SERVER (MP22).
 *
 * Every screen reads a skill as the MORE FAVOURABLE of the server's evidence
 * profile and the student's assignment record: the higher number, and
 * Mastered when either says so (product decision 8; the browser builds it in
 * src/platform/mastery/unifiedMastery.js and src/platform/path/masteryAdapter.js).
 * The server's own decisions read its profile alone, so a skill the student's
 * screens called Mastered by the assignment record could be refused by the
 * server. Two of those decisions now read the one rule:
 *
 *   - whether a retention check is due: the weekly freeze, which used to turn
 *     such a skill's Retention slot into a five-question Review, and an open
 *     check started from the map or the banner (MP21);
 *   - whether a Challenge is earned: the student's own Path shows the skill
 *     as a Challenge (or as Mastered). The old check read the target skill's
 *     own server profile, which a Challenge skill never has: a Challenge card
 *     is a skill ahead of the class whose PREREQUISITES are strong.
 *
 * Both are built by the browser's own code, which the weekly freeze already
 * runs on the server (weeklyPathServerPlan.js), from records the browser
 * cannot write: grades/{studentId} (server-written) and the class's
 * assignments. Reading those costs a query, so each helper asks the server's
 * own profile first and reads them only when the answer can change.
 *
 * The student's "Skills that moved" at the end of a session reads the one
 * rule too (src/platform/mastery/sessionSkillMovement.js).
 *
 * Still the server's profile alone, on purpose (recorded beside each, and in
 * the D handoff): in-session routing and adaptive rigor (functions/lib/
 * pathRouting.js: every answer, and it must react to today's answers), and the
 * mastery history behind My Progress and the growth rewards
 * (functions/shared/masteryHistory.mjs: week-by-week snapshots compare like
 * with like; the assignment record keeps no past to compare).
 *
 * Nothing here throws. When the browser's code is not deployed, or a read
 * fails, the server's own profile decides, exactly as before.
 */

const { loadClassAssignments, loadServerPathInputs, loadWeeklyPlanner } = require("./weeklyPathServerPlan");

const text = (value) => String(value ?? "").trim();
const byCode = (map, code) => (map && typeof map === "object" ? (map[code] || map[`texas:${code}`] || null) : null);

// The engine statuses a Challenge launch may run on (recommendationEngine.js
// STATUS): the card that offers it, and a skill already mastered.
const CHALLENGE_STATUSES = new Set(["extension", "mastered"]);

/**
 * Every skill's unified profile — the one the wheel, the map and the planner
 * read — or null when the server cannot build it.
 */
async function loadFavourableProfiles({
  db, studentId, studentData = null, classRecord = null, serverProfiles = {}, retentionSchedules = {}, plannerOptions = {},
} = {}) {
  try {
    const planner = await loadWeeklyPlanner(plannerOptions);
    if (!planner) return null;
    const assignments = await loadClassAssignments(db, classRecord);
    return planner.mastery.buildUnifiedMasteryProfiles({
      // The whole grades document, as the browser's mastery state reads it.
      student: { id: studentId, ...(studentData && typeof studentData === "object" ? studentData : {}) },
      assignments,
      serverProfiles: serverProfiles || {},
      retentionSchedulesByTEKS: retentionSchedules || {},
    });
  } catch (error) {
    console.warn("favourableMastery: the favourable profiles could not be built; the server profile decides.", error?.message || error);
    return null;
  }
}

/**
 * Which of `displayCodes` are due a retention check, by the one rule, as a
 * Map of code → boolean. Due when the server's own records say so (as before),
 * or when the unified profile — Mastered by either record — does
 * (retentionCheckIsDue, the scheduler's rule).
 */
async function retentionDueByOneRule({
  db, studentId, studentData = null, classRecord = null, serverProfiles = {}, schedules = {},
  displayCodes = [], now = Date.now(), plannerOptions = {},
} = {}) {
  const { retentionCheckIsDue } = await import("../shared/pathRetentionCheck.mjs");
  const codes = [...new Set((Array.isArray(displayCodes) ? displayCodes : []).map(text).filter(Boolean))];
  const due = new Map();
  const unresolved = [];
  codes.forEach((code) => {
    if (retentionCheckIsDue({ profile: byCode(serverProfiles, code), schedule: byCode(schedules, code), now })) due.set(code, true);
    else unresolved.push(code);
  });
  if (!unresolved.length) return due;
  const favourable = await loadFavourableProfiles({
    db, studentId, studentData, classRecord, serverProfiles, retentionSchedules: schedules, plannerOptions,
  });
  unresolved.forEach((code) => {
    due.set(code, Boolean(favourable) && retentionCheckIsDue({ profile: byCode(favourable, code), schedule: byCode(schedules, code), now }));
  });
  return due;
}

/**
 * Is a Challenge on `targetDisplayCode` earned, by the one rule? Yes when the
 * server's own record already says so (`ownProfileEarned`, the old rule), or
 * when the student's own Path — the engine over the more favourable record,
 * with the class's pacing and overrides — shows the skill as a Challenge or as
 * Mastered. The student's screen offers a Challenge card exactly there.
 */
async function courseChallengeEarnedByOneRule({
  db, studentId, studentData = null, classRecord = null, courseId = null, targetDisplayCode = null,
  serverProfiles = {}, ownProfileEarned = false, now = Date.now(), plannerOptions = {},
} = {}) {
  if (ownProfileEarned) return true;
  try {
    const planner = await loadWeeklyPlanner(plannerOptions);
    const code = text(targetDisplayCode);
    const course = text(courseId || classRecord?.course);
    if (!planner || !code || !course) return false;
    const { pacing, teacherOverrides, assignments } = await loadServerPathInputs({ db, studentId, classRecord, planner, now });
    const record = studentData && typeof studentData === "object" ? studentData : {};
    const options = planner.options.buildStudentPathOptions({
      // App.jsx's studentRecord, as the weekly server plan builds it.
      student: { id: studentId, gradesByAssignment: record.gradesByAssignment || {}, supportUsageByAssignment: record.supportUsageByAssignment || {} },
      assignments,
      courseId: course,
      pacing,
      teacherOverrides,
      serverMasteryProfiles: serverProfiles || {},
      nowValue: now,
    });
    const { teksSkillId } = await import("../shared/pathSkillGraph.mjs");
    const skillId = teksSkillId(code);
    const row = Object.values(options || {})
      .filter(Array.isArray)
      .flat()
      .find((entry) => entry?.skillId === skillId);
    return Boolean(row && CHALLENGE_STATUSES.has(row.status));
  } catch (error) {
    console.warn("favourableMastery: the Challenge could not be checked on the student's Path; the server profile decides.", error?.message || error);
    return false;
  }
}

module.exports = {
  CHALLENGE_STATUSES,
  courseChallengeEarnedByOneRule,
  loadFavourableProfiles,
  retentionDueByOneRule,
};
