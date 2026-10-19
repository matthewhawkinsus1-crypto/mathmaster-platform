// Resolve the question a student should actually enter, without changing any
// section's lock policy. The caller owns the schedule/access decision; this
// helper only selects among questions that already belong to current content.

const normalizeRole = (value) => String(value || '').trim().toLowerCase();

export const resolveStudentAssignmentEntry = ({
  entries = [],
  includedQuestionIndices = [],
  requestedQuestionIndex = null,
  roleIsActionable = () => true,
  restrictToRole = null,
  /*
   * OPTIONAL: is this question already finished (correct, or out of tries)?
   * When given, entry lands on the first unfinished question the student can
   * do now — a requested question is kept only while it is unfinished — and
   * falls back to an open finished question (to review it) only when nothing
   * open is left to do. Omitted, behaviour is exactly as before.
   */
  isFinished = null,
} = {}) => {
  const included = new Set((includedQuestionIndices || []).map((value) => Number(value)));
  const restrictedRole = normalizeRole(restrictToRole);
  const candidates = (Array.isArray(entries) ? entries : []).filter((entry) => {
    const storageIndex = Number(entry?.storageIndex);
    if (!Number.isInteger(storageIndex) || !included.has(storageIndex)) return false;
    if (restrictedRole && normalizeRole(entry?.logicalRole) !== restrictedRole) return false;
    return true;
  });

  const actionable = (entry) => roleIsActionable(normalizeRole(entry?.logicalRole), entry) === true;
  const requested = Number(requestedQuestionIndex);
  const requestedEntry = Number.isInteger(requested)
    ? candidates.find((entry) => Number(entry.storageIndex) === requested)
    : null;

  const finished = (entry) => typeof isFinished === 'function' && isFinished(Number(entry.storageIndex)) === true;
  if (requestedEntry && actionable(requestedEntry) && !finished(requestedEntry)) return Number(requestedEntry.storageIndex);
  const firstUnfinished = candidates.find((entry) => actionable(entry) && !finished(entry));
  if (firstUnfinished) return Number(firstUnfinished.storageIndex);
  if (requestedEntry && actionable(requestedEntry)) return Number(requestedEntry.storageIndex);
  const firstAvailable = candidates.find(actionable);
  return firstAvailable ? Number(firstAvailable.storageIndex) : null;
};

export default resolveStudentAssignmentEntry;
