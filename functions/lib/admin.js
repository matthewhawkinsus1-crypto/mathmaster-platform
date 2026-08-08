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
]);

const STUDENT_DIRECT_COLLECTIONS = Object.freeze([
  "studentMasteryProfiles",
  "studentRetentionSchedules",
]);

function permanentDeleteConfirmation(studentId) {
  return `DELETE ${String(studentId || "").trim()}`;
}

function isPermanentDeleteConfirmed(studentId, confirmation) {
  return String(confirmation || "").trim() === permanentDeleteConfirmation(studentId);
}

module.exports = {
  STUDENT_DIRECT_COLLECTIONS,
  STUDENT_QUERY_COLLECTIONS,
  isPermanentDeleteConfirmed,
  permanentDeleteConfirmation,
};
