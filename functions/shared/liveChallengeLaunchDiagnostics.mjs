/*
 * Bounded launch telemetry for the one transition that is hardest to diagnose
 * after a classroom has moved on. The browser batches these milestones; the
 * server folds them into one per-player summary, never an event log.
 */

export const LAUNCH_EVENT = Object.freeze({
  LISTENER_ATTACHED: 'listener_attached',
  COUNTDOWN_RECEIVED: 'countdown_received',
  RUNNING_RECEIVED: 'running_received',
  GAME_MOUNTED: 'game_mounted',
  CONNECTION_LOST: 'connection_lost',
  CONNECTION_RESTORED: 'connection_restored',
  LISTENER_ERROR: 'listener_error',
});

export const LAUNCH_EVENTS = Object.freeze(Object.values(LAUNCH_EVENT));
export const MAX_LAUNCH_EVENTS = LAUNCH_EVENTS.length;

const cleanMilestone = (value = {}) => {
  const clientAtMs = Number(value.clientAtMs);
  if (!Number.isFinite(clientAtMs) || clientAtMs <= 0) return null;
  const milestone = { clientAtMs };
  if (['lobby', 'running', 'finished', 'cancelled'].includes(value.roomStatus)) milestone.roomStatus = value.roomStatus;
  if (Number.isInteger(Number(value.roundIndex)) && Number(value.roundIndex) >= 0) milestone.roundIndex = Number(value.roundIndex);
  return milestone;
};

/** Sanitize one browser batch to the fixed event vocabulary and size. */
export function normalizeLaunchReport(report = {}) {
  const input = report?.milestones && typeof report.milestones === 'object' ? report.milestones : {};
  const milestones = {};
  for (const event of LAUNCH_EVENTS) {
    const milestone = cleanMilestone(input[event]);
    if (milestone) milestones[event] = milestone;
  }
  return Object.freeze({ milestones: Object.freeze(milestones) });
}

/**
 * Merge a batch into a small summary. The first client observation is kept;
 * receivedAtMs proves when Firebase first received it. Duplicate batches do
 * not grow storage or counters.
 */
export function nextLaunchDiagnostic(previous = {}, { report, nowMs } = {}) {
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return Object.freeze({});
  const normalized = normalizeLaunchReport(report);
  if (!Object.keys(normalized.milestones).length) return Object.freeze({});
  const prior = previous?.launchMilestones && typeof previous.launchMilestones === 'object'
    ? previous.launchMilestones
    : {};
  const merged = {};
  for (const event of LAUNCH_EVENTS) {
    const oldMilestone = cleanMilestone(prior[event]);
    const incoming = normalized.milestones[event];
    if (oldMilestone) merged[event] = { ...oldMilestone, receivedAtMs: Number(prior[event]?.receivedAtMs) || now };
    else if (incoming) merged[event] = { ...incoming, receivedAtMs: now };
  }
  const latest = Object.entries(merged).sort((left, right) => right[1].clientAtMs - left[1].clientAtMs)[0];
  return Object.freeze({
    launchMilestones: Object.freeze(merged),
    lastLaunchEvent: latest?.[0] || null,
    lastLaunchClientAtMs: latest?.[1]?.clientAtMs || null,
    launchDiagnosticUpdatedAtMs: now,
  });
}

