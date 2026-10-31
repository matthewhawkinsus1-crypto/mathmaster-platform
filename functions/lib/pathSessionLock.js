"use strict";

/**
 * WHICH LOCK A MY MATH PATH SESSION HOLDS.
 *
 * One open session per student, standard, exam and place, where the place is a
 * weekly slot or open practice (MP23 records why the key stays per standard
 * and slot). An open retention check (from the map, the banner or the
 * Overview) used to share the open-practice lock with practice on the same
 * standard, so a student halfway through practice was told to finish it
 * before a two-question check could start, and the other way round. A check
 * now has its own place, "retention-check" (MP21), as the Teacher Path
 * Simulator already gave it its own session.
 *
 * IN-FLIGHT SESSIONS. A lock is released by its session's completion, by id.
 * A session started from now on records the id it took (`lockId`) and is
 * released by it. A session started before records none and is released by
 * the id it took then, which `legacyLockIdForSession` recomputes exactly as the
 * old code did, so no lock in flight is orphaned. A check opened before this
 * change holds the open-practice lock: a new launch of that check looks there
 * too and resumes it rather than opening a second one (startMyMathPathSession).
 */

const mathPath = require("./mathPath");

const OPEN_PRACTICE = "open-practice";
const RETENTION_CHECK = "retention-check";
const RETENTION_PROBE = "retentionProbe";

const lockId = (studentId, targetAlignmentKey, assessmentFramework, place) => mathPath.opaqueId(
  "pathlock", studentId, targetAlignmentKey, assessmentFramework || "course", place,
);

/** The lock a launch takes. */
function pathSessionLockId({ studentId, targetAlignmentKey, assessmentFramework = null, weeklySlotKey = null, sessionKind = "practice" } = {}) {
  const place = weeklySlotKey || (sessionKind === RETENTION_PROBE ? RETENTION_CHECK : OPEN_PRACTICE);
  return lockId(studentId, targetAlignmentKey, assessmentFramework, place);
}

/** The open-practice lock of a standard: where a check opened before MP21 is held. */
function openPracticeLockId({ studentId, targetAlignmentKey, assessmentFramework = null } = {}) {
  return lockId(studentId, targetAlignmentKey, assessmentFramework, OPEN_PRACTICE);
}

/** The id a session started before MP21 took, recomputed as the old code computed it. */
function legacyLockIdForSession(session = {}, { studentId = session?.studentId } = {}) {
  return lockId(studentId, session?.target?.alignmentKey, session?.assessmentFramework, session?.weeklySlotKey || OPEN_PRACTICE);
}

/** The lock a session holds: the one it recorded, or the one it took before locks were recorded. */
function lockIdForSession(session = {}, options = {}) {
  const recorded = String(session?.lockId || "").trim();
  return recorded || legacyLockIdForSession(session, options);
}

module.exports = {
  OPEN_PRACTICE,
  RETENTION_CHECK,
  legacyLockIdForSession,
  lockIdForSession,
  openPracticeLockId,
  pathSessionLockId,
};
