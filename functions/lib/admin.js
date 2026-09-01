// Pure administrative policy helpers. Keep these dependency-free so the
// destructive-account contract can be regression-tested without booting the
// Firebase Functions runtime.

const STUDENT_QUERY_COLLECTIONS = Object.freeze([
  "classroomRosterLinks",
  "classroomGradeSyncs",
  "activePathLocks",
  "pathSessions",
  "pathSubmissions",
  "masteryEvidenceApplications",
  "modelingLabSubmissions",
  "examSessions",
  "examSubmissions",
  "examIntegrityEvents",
  "studentSupportEvents",
  "studentSessionSummaries",
]);

const STUDENT_DIRECT_COLLECTIONS = Object.freeze([
  "studentMasteryProfiles",
  "studentRetentionSchedules",
]);

const PREPRODUCTION_RESET_CONFIRMATION = "RESET TEST DATA";
const PREPRODUCTION_LOCK_CONFIRMATION = "LOCK FOR PRODUCTION";
const PREPRODUCTION_CONTROL_DOCUMENT = "adminControl/preproductionReset";

// These collections are test/runtime state, not platform configuration.
// The reset deliberately preserves classes, settings, teacherDirectory,
// teacherIntegrations, question banks, coverage, curriculum definitions, and
// the admin audit log.
const PREPRODUCTION_RESET_COLLECTIONS = Object.freeze([
  "assignments",
  "presence",
  "liveChallengeInvites",
  "liveChallengeRooms",
  "liveChallengeTeacherActive",
  "liveChallengePrivate",
  "pathHistory",
  "classroomLinks",
  "classroomRosterLinks",
  "classroomGradeSyncs",
  "studentCredentials",
  "studentAliases",
  "studentDirectory",
  "classJoinCodes",
  "authThrottle",
  "oauthStates",
  "activePathLocks",
  "weeklyPathGoalSnapshots",
  "pathSessions",
  "pathSubmissions",
  "masteryEvidenceApplications",
  "modelingLabSubmissions",
  "examSessions",
  "examSubmissions",
  "examIntegrityEvents",
  "studentSupportEvents",
  "studentSessionSummaries",
  "studentMasteryProfiles",
  "studentRetentionSchedules",
]);

const PREPRODUCTION_PRESERVED_COLLECTIONS = Object.freeze([
  "classes",
  "settings",
  "teacherDirectory",
  "teacherIntegrations",
  "classroomCourseMappings",
  "adminControl",
  "adminAuditLog",
  "pathQuestionBank",
  "pathCoverage",
  "examQuestionBank",
  "modelingLabDefinitions",
]);

function preproductionResetConfirmation() {
  return PREPRODUCTION_RESET_CONFIRMATION;
}

function isPreproductionResetConfirmed(confirmation) {
  return String(confirmation || "").trim() === PREPRODUCTION_RESET_CONFIRMATION;
}

function preproductionLockConfirmation() {
  return PREPRODUCTION_LOCK_CONFIRMATION;
}

function isPreproductionLockConfirmed(confirmation) {
  return String(confirmation || "").trim() === PREPRODUCTION_LOCK_CONFIRMATION;
}

function permanentDeleteConfirmation(studentId) {
  return `DELETE ${String(studentId || "").trim()}`;
}

function isPermanentDeleteConfirmed(studentId, confirmation) {
  return String(confirmation || "").trim() === permanentDeleteConfirmation(studentId);
}

module.exports = {
  PREPRODUCTION_CONTROL_DOCUMENT,
  PREPRODUCTION_LOCK_CONFIRMATION,
  PREPRODUCTION_PRESERVED_COLLECTIONS,
  PREPRODUCTION_RESET_COLLECTIONS,
  PREPRODUCTION_RESET_CONFIRMATION,
  STUDENT_DIRECT_COLLECTIONS,
  STUDENT_QUERY_COLLECTIONS,
  isPermanentDeleteConfirmed,
  isPreproductionLockConfirmed,
  isPreproductionResetConfirmed,
  permanentDeleteConfirmation,
  preproductionLockConfirmation,
  preproductionResetConfirmation,
};
