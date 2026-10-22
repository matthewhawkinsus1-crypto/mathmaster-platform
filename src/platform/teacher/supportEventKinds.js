// The kinds and stages of a support event (the append-only
// studentSupportEvents stream).
//
// Their own module because App reads only these names, for the support events
// it records; importing them from ./studentSupportSignals.js put every
// teacher signal there in each student's first load
// (scripts/check-first-load-budget.mjs). studentSupportSignals.js re-exports
// them unchanged.
export const SUPPORT_EVENT_KIND = Object.freeze({
  WATCH_PRACTICE: 'watchPractice',
  SMALL_GROUP: 'smallGroup',
  PARENT_FOLLOW_UP: 'parentFollowUp',
  TEACHER_INTERVENTION: 'teacherIntervention',
  OFF_TASK_CONCERN: 'offTaskConcern',
  INTEGRITY_REVIEW: 'integrityReview',
  ACADEMIC_INTEGRITY_INCIDENT: 'academicIntegrityIncident',
  SIGNAL_DISMISSED: 'signalDismissed',
  RESOLVED: 'resolved',
  // Absence recovery. See src/platform/attendance/returnCheckIn.js — these
  // live in the same append-only studentSupportEvents stream as every other
  // kind here, not a second task/action-item collection.
  RETURN_FROM_ABSENCE: 'returnFromAbsence',
  ATTENDANCE_CORRECTION_REVIEW: 'attendanceCorrectionReview',
  ATTENDANCE_EXTENSION_RECONCILIATION_PENDING: 'attendanceExtensionReconciliationPending',
});

export const SUPPORT_EVENT_STAGE = Object.freeze({
  SYSTEM_SIGNAL: 'systemSignal',
  TEACHER_CONFIRMED: 'teacherConfirmed',
  ACTION_TAKEN: 'actionTaken',
  DISMISSED: 'dismissed',
  RESOLVED: 'resolved',
});
