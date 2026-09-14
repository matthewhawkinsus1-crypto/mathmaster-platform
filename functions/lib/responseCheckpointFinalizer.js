const asMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const scoped = (map, classId) => (classId && map?.[classId]) || null;

function authoritativeCheckpointClose(checkpoint, assignment) {
  const role = String(checkpoint.activityRole || '');
  const classId = checkpoint.finalizationContext?.classId || null;
  const candidate = asMillis(checkpoint.candidateFinalizeAt);
  if (role === 'warmup') {
    const override = scoped(assignment?.warmup?.autoCloseByClassId, classId);
    const extension = asMillis(typeof override === 'object' ? override?.closesAt : override);
    const manualClose = scoped(assignment?.warmup?.closedByClassId, classId);
    const manualCloseAt = asMillis(typeof manualClose === 'object' ? manualClose?.closedAt : manualClose);
    return { cutoff: manualCloseAt || extension || candidate, reason: manualCloseAt ? 'manual-section-close' : 'warmup-close' };
  }
  if (role === 'dol') return { cutoff: candidate, reason: 'dol-close' };
  const section = assignment?.sectionAccess?.[role]?.overridesByClassId?.[classId];
  if (section?.state === 'closed') return { cutoff: asMillis(section.changedAt), reason: 'manual-section-close' };
  return {
    cutoff: asMillis(assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate),
    reason: 'assignment-final-deadline',
  };
}

function decideCheckpointFinalization({ checkpoint, assignment, gradeRecord, now = Date.now() }) {
  if (!checkpoint || checkpoint.status !== 'active') return { action: 'skip', status: 'not-active' };
  if (!checkpoint.isComplete || !checkpoint.response?.responseKey) return { action: 'close', status: 'incomplete-at-close' };
  const authoritative = authoritativeCheckpointClose(checkpoint, assignment);
  if (!authoritative.cutoff) return { action: 'hold', status: 'no-authoritative-close' };
  if (authoritative.cutoff > now) return { action: 'reschedule', finalizeAt: authoritative.cutoff };
  const capturedAt = asMillis(checkpoint.serverAcknowledgedAt || checkpoint.capturedAt);
  if (!capturedAt || capturedAt > authoritative.cutoff) return { action: 'close', status: 'recovered-after-close' };
  const expectedAttempts = Number(checkpoint.submissionEnvelope?.previousTotalAttempts || 0);
  const currentAttempts = Number(gradeRecord?.totalAttempts || 0);
  if (currentAttempts !== expectedAttempts) return { action: 'close', status: 'skipped-newer-submission' };
  return { action: 'finalize', cutoff: authoritative.cutoff, reason: authoritative.reason };
}

module.exports = { asMillis, authoritativeCheckpointClose, decideCheckpointFinalization };
