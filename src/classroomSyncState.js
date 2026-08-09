// Is what Google Classroom shows still what MathMaster says?
//
// THE RULE THIS ENCODES. MathMaster's assignment `dueAt` is the single source
// of truth. A publication record never holds a second opinion about when the
// work is due — it holds `syncedDueAt`, which means only "the value we last
// successfully sent to Google". Staleness is then a comparison rather than a
// stored flag, so it cannot drift out of date, cannot be forgotten on a write
// path, and is always correct the instant the teacher edits the date.
//
// WHY NOT UPDATE CLASSROOM AUTOMATICALLY. Changing a due date on a post
// students are already looking at is an outward-facing action with real
// consequences — late marks, notifications, a scramble. So the platform saves
// the MathMaster change immediately, shows that Classroom is behind, and waits
// for the teacher to say go.
//
// Pure, so the UI, the tests and any future server-side check all agree.

export const SYNC_STATUS = Object.freeze({
  NOT_PUBLISHED: 'not_published',
  IN_SYNC: 'in_sync',
  DUE_DATE_CHANGED: 'due_date_changed',
  FAILED: 'failed',
  PUBLISHING: 'publishing',
});

const toTime = (value) => {
  if (!value) return null;
  // Firestore timestamps arrive as { seconds } or as an ISO string depending on
  // whether they came through a callable or the client SDK.
  if (typeof value === 'object' && value !== null) {
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (Number.isFinite(value.seconds)) return value.seconds * 1000;
    if (Number.isFinite(value._seconds)) return value._seconds * 1000;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

/**
 * The state of one course's publication against the assignment as it stands.
 */
export const describePublicationSync = (assignment, publication) => {
  if (!publication || !publication.courseworkId || publication.status === 'failed') {
    return {
      status: publication?.status === 'failed' ? SYNC_STATUS.FAILED : SYNC_STATUS.NOT_PUBLISHED,
      label: publication?.status === 'failed' ? 'Publish failed' : 'Not published',
      needsUpdate: false,
      error: publication?.error || null,
    };
  }

  if (publication.status === 'publishing') {
    return { status: SYNC_STATUS.PUBLISHING, label: 'Publishing…', needsUpdate: false, error: null };
  }

  const assignmentDue = toTime(assignment?.dueAt || assignment?.dueDate);
  // Older records predate syncedDueAt and stored the value under `dueAt`. Both
  // mean the same thing — what was sent — so both are read.
  const syncedDue = toTime(publication.syncedDueAt ?? publication.dueAt);

  if (assignmentDue === null) {
    return { status: SYNC_STATUS.IN_SYNC, label: 'Published', needsUpdate: false, error: null };
  }

  if (syncedDue === null || syncedDue !== assignmentDue) {
    return {
      status: SYNC_STATUS.DUE_DATE_CHANGED,
      label: 'Published · due date changed',
      needsUpdate: true,
      error: null,
      syncedDueAt: publication.syncedDueAt ?? publication.dueAt ?? null,
    };
  }

  return { status: SYNC_STATUS.IN_SYNC, label: 'Published · in sync', needsUpdate: false, error: null };
};

/**
 * The same question across every course an assignment was published to.
 */
export const summarizeAssignmentSync = (assignment, publications = []) => {
  const list = (Array.isArray(publications) ? publications : [])
    .filter((entry) => String(entry?.assignmentId || '') === String(assignment?.id || ''))
    .map((publication) => ({
      publication,
      courseId: publication.courseId,
      courseName: publication.courseName || publication.courseId,
      ...describePublicationSync(assignment, publication),
    }));

  const stale = list.filter((entry) => entry.needsUpdate);
  const failed = list.filter((entry) => entry.status === SYNC_STATUS.FAILED);

  return {
    courses: list,
    publishedCount: list.filter((entry) => entry.status !== SYNC_STATUS.NOT_PUBLISHED).length,
    staleCount: stale.length,
    staleCourseIds: stale.map((entry) => entry.courseId),
    failedCount: failed.length,
    // The sentence the teacher reads. Generated here so the wording cannot
    // disagree with the count that produced it.
    message: stale.length
      ? `${stale.length} Classroom post${stale.length === 1 ? '' : 's'} need${stale.length === 1 ? 's' : ''} updating.`
      : list.length
        ? 'Google Classroom is up to date.'
        : 'Not published to Google Classroom.',
    needsUpdate: stale.length > 0,
  };
};

/**
 * Which courses an update call should target. Retrying after a partial failure
 * must not re-patch the courses that already succeeded.
 */
export const coursesToUpdate = (assignment, publications = []) => (
  summarizeAssignmentSync(assignment, publications).staleCourseIds
);
