import { formatStudentName } from './platform/studentName.js';

const clean = (value) => String(value ?? '').trim();

export function gradeSyncStudentDisplay(sync = {}, students = []) {
  const studentId = clean(sync?.studentId);
  const student = (Array.isArray(students) ? students : [])
    .find((candidate) => clean(candidate?.id || candidate?.studentId) === studentId);
  const studentName = student
    ? formatStudentName(student, { lastFirst: false, fallbackToId: false })
    : '';
  const fallbackName = clean(sync?.studentName || sync?.name);
  return {
    name: studentName || fallbackName || (studentId ? `Student ${studentId}` : 'Unknown student'),
    studentId,
  };
}

export function gradeSyncStatusLabel(sync = {}) {
  const status = clean(sync?.status).toLowerCase();
  if (status === 'skipped-unlinked') return 'Needs roster link';
  if (status === 'failed') return 'Failed';
  if (status === 'synced') return 'Synced';
  if (status === 'not-yet-synced') return 'Not yet synced';
  return status ? status.replaceAll('-', ' ') : 'Unknown';
}

export function isGradeSyncRetryEligible(sync = {}) {
  return clean(sync?.status).toLowerCase() === 'failed'
    && Boolean(clean(sync?.publicationId))
    && Boolean(clean(sync?.assignmentId))
    && Boolean(clean(sync?.studentId));
}

export function retryEligibleGradeSyncs(syncs = []) {
  return (Array.isArray(syncs) ? syncs : []).filter(isGradeSyncRetryEligible);
}
