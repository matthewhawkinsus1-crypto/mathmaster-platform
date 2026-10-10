"use strict";

/**
 * THE SERVER'S OWN FACTS FOR FREEZING A STUDENT'S WEEK.
 *
 * The week a student's browser proposes is only a proposal. How many sessions
 * the week is graded on, and which slots may be two-question retention checks,
 * are decided here from records the browser cannot write:
 *
 *   - settings/weeklyPathGoals — the teacher's settings, by class id, then by
 *     period (the client's storedWeeklyGoalForClassContext): the session count,
 *     and whether the teacher selects every session (the one setting that
 *     explains a week with fewer sessions than the count);
 *   - studentMasteryProfiles/{studentId} and studentRetentionSchedules/
 *     {studentId} — which skills the server says are due a retention check.
 *
 * Returns the options freezeWeeklyPathGoalProposal takes
 * (functions/shared/weeklyPathSlotAuthority.mjs).
 */

const WEEKLY_GOAL_SETTINGS_DOC = "weeklyPathGoals";

const byCode = (map, code) => {
  if (!map || typeof map !== "object") return null;
  return map[code] || map[`texas:${code}`] || null;
};

async function loadWeeklyFreezeInputs({ db, studentId, studentData = null, classRecord = null, now = Date.now() } = {}) {
  const [slotAuthority, retentionCheck] = await Promise.all([
    import("../shared/weeklyPathSlotAuthority.mjs"),
    import("../shared/pathRetentionCheck.mjs"),
  ]);
  const [settingsSnapshot, profilesSnapshot, schedulesSnapshot] = await Promise.all([
    db.collection("settings").doc(WEEKLY_GOAL_SETTINGS_DOC).get(),
    db.collection("studentMasteryProfiles").doc(studentId).get(),
    db.collection("studentRetentionSchedules").doc(studentId).get(),
  ]);
  const byClass = settingsSnapshot.exists ? (settingsSnapshot.data()?.byClass || {}) : {};
  const config = (classRecord?.classId && byClass[classRecord.classId])
    || (classRecord?.period && byClass[classRecord.period])
    || null;
  // Honors as the student's own screen reads it (the student's profile, as
  // My Math Path does), so an honest proposal is never short of the count.
  const courseLevel = studentData?.profile?.courseLevel ?? classRecord?.courseLevel ?? "";
  const honors = String(courseLevel).toLowerCase() === "honors";
  const profiles = profilesSnapshot.exists ? (profilesSnapshot.data()?.profiles || {}) : {};
  const schedules = schedulesSnapshot.exists ? (schedulesSnapshot.data()?.schedules || {}) : {};
  return {
    requestedSessions: slotAuthority.weeklySessionsForClass({ config, honors }),
    shortWeekReason: config?.selectionMode === slotAuthority.TEACHER_SELECTED_MODE ? "teacherSelection" : null,
    retentionDue: (displayCode) => retentionCheck.retentionCheckIsDue({
      profile: byCode(profiles, displayCode),
      schedule: byCode(schedules, displayCode),
      now,
    }),
  };
}

module.exports = { loadWeeklyFreezeInputs, WEEKLY_GOAL_SETTINGS_DOC };
