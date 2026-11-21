import { resolveRosterStudentName, studentIdentityIndexFor } from './platform/studentName.js';

const clean = (value) => String(value ?? '').trim();

// The roster name (googleName and first/last included), then a name the sync
// record carried if it is really a name, else "Name unavailable". The id is
// returned separately and rendered as its own "ID x" line — never as the name.
// The identity index is cached per roster array, so 100 rows are 100 lookups,
// not 100 roster scans.
export function gradeSyncStudentDisplay(sync = {}, students = []) {
  const studentId = clean(sync?.studentId);
  const name = resolveRosterStudentName({
    studentId,
    index: studentIdentityIndexFor(Array.isArray(students) ? students : []),
    historicalName: clean(sync?.studentName || sync?.name),
  });
  return { name, studentId };
}

export function gradeSyncStatusLabel(sync = {}) {
  const status = clean(sync?.status).toLowerCase();
  // Waiting in the server's paced queue (functions/lib/classroomPushQueue.js);
  // the row's last result is replaced when the push runs.
  if (sync?.queued === true) return 'Queued to send';
  // Google refused it for its per-minute limit; it is queued again by itself.
  if (status === 'rate-limited') return 'Waiting: Classroom limit';
  if (status === 'skipped-unlinked') return 'Needs roster link';
  if (status === 'failed') return 'Failed';
  if (status === 'synced') return 'Synced';
  if (status === 'not-yet-synced') return 'Not yet synced';
  // A Practice-based Recovery MathMaster could not grade is waiting for the
  // teacher; nothing was sent, on purpose (functions/lib/sectionRecoveryGrades.js).
  if (status === 'recovery-held') return 'Held: Recovery needs review';
  // The grade is in Classroom, but Classroom would not return it, usually
  // because the student never turned the work in there
  // (functions/lib/classroomPushErrors.js).
  if (status === 'graded-not-returned') return 'Graded, not returned';
  return status ? status.replaceAll('-', ' ') : 'Unknown';
}

// What Google said, for a row that did not go through. "Precondition check
// failed." alone says little, so Google's status and reason come with it.
export function gradeSyncErrorText(sync = {}) {
  const status = clean(sync?.status).toLowerCase();
  // The grade went through; the row says in plain words why it was not
  // returned and what the teacher can do.
  if (status === 'graded-not-returned') return clean(sync?.message);
  if (!['failed', 'rate-limited', 'auth-error'].includes(status)) return '';
  const message = clean(sync?.error || sync?.message);
  if (!message) return '';
  const reasons = Array.isArray(sync?.errorReasons) ? sync.errorReasons.map(clean).filter(Boolean) : [];
  const detail = [clean(sync?.errorStatus), ...reasons].filter(Boolean).join(', ');
  const step = clean(sync?.errorStep).replaceAll('-', ' ');
  return [message.slice(0, 200), detail && `(${detail})`, step && `at ${step}`].filter(Boolean).join(' ');
}

export function isGradeSyncRetryEligible(sync = {}) {
  return clean(sync?.status).toLowerCase() === 'failed'
    && sync?.queued !== true
    && Boolean(clean(sync?.publicationId))
    && Boolean(clean(sync?.assignmentId))
    && Boolean(clean(sync?.studentId));
}

export function retryEligibleGradeSyncs(syncs = []) {
  return (Array.isArray(syncs) ? syncs : []).filter(isGradeSyncRetryEligible);
}

const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

/**
 * What the teacher's last "Reconcile section grades" on an assignment did, as
 * one line: "Last reconcile: 12 repaired, 40 already up to date, 3 not sent,
 * 2 failed". The counts are grade columns (one student in one Classroom
 * column), added up by the server from each student's push
 * (functions/lib/classroomReconcileRuns.js). While pushes are still in the
 * paced queue, or waiting out Google's limit, the line says how many. Null
 * when there is no run to show.
 */
export function reconcileRunSummaryText(run) {
  if (!run || !clean(run.runId)) return null;
  const parts = [
    `${count(run.repaired)} repaired`,
    `${count(run.upToDate)} already up to date`,
    `${count(run.notSent)} not sent`,
    `${count(run.failed)} failed`,
  ];
  const waiting = count(run.waiting);
  const pending = count(run.pendingStudents);
  const tail = [
    waiting ? `${waiting} waiting for Google's limit` : '',
    pending ? `${pending} student${pending === 1 ? '' : 's'} still in the queue` : '',
  ].filter(Boolean);
  return `Last reconcile: ${parts.join(', ')}${tail.length ? ` (${tail.join('; ')})` : ''}`;
}

/** The run for one assignment among the monitor's `reconcileRuns`, or null. */
export function reconcileRunForAssignment(runs, assignmentId) {
  const id = clean(assignmentId);
  if (!id) return null;
  return (Array.isArray(runs) ? runs : []).find((run) => clean(run?.assignmentId) === id) || null;
}
