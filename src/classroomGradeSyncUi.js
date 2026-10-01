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
