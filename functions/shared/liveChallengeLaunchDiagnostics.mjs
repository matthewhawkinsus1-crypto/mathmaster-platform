/*
 * Bounded launch telemetry for the one transition that is hardest to diagnose
 * after a classroom has moved on.  Events are server-timestamped and folded
 * into one per-player document; they are not an event log.
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

const FIRST_AT_FIELD = Object.freeze({
  [LAUNCH_EVENT.LISTENER_ATTACHED]: 'listenerAttachedAtMs',
  [LAUNCH_EVENT.COUNTDOWN_RECEIVED]: 'countdownReceivedAtMs',
  [LAUNCH_EVENT.RUNNING_RECEIVED]: 'runningReceivedAtMs',
  [LAUNCH_EVENT.GAME_MOUNTED]: 'gameMountedAtMs',
  [LAUNCH_EVENT.CONNECTION_LOST]: 'firstConnectionLostAtMs',
  [LAUNCH_EVENT.CONNECTION_RESTORED]: 'firstConnectionRestoredAtMs',
  [LAUNCH_EVENT.LISTENER_ERROR]: 'firstListenerErrorAtMs',
});

export const normalizeLaunchEvent = (value) => (LAUNCH_EVENTS.includes(value) ? value : null);

/** Fold a report into a small, idempotent summary. Repeated snapshots do not grow storage. */
export function nextLaunchDiagnostic(previous = {}, { event, nowMs, roomStatus = null, roundIndex = null } = {}) {
  const kind = normalizeLaunchEvent(event);
  const now = Number(nowMs);
  if (!kind || !Number.isFinite(now)) return Object.freeze({});
  const field = FIRST_AT_FIELD[kind];
  const previousFirst = Number(previous?.[field]);
  const patch = {
    [field]: Number.isFinite(previousFirst) && previousFirst > 0 ? previousFirst : now,
    lastLaunchEvent: kind,
    lastLaunchEventAtMs: now,
  };
  if (kind === LAUNCH_EVENT.CONNECTION_LOST) patch.connectionLossCount = Math.min(99, Math.max(0, Number(previous?.connectionLossCount) || 0) + 1);
  if (kind === LAUNCH_EVENT.CONNECTION_RESTORED) patch.connectionRestoreCount = Math.min(99, Math.max(0, Number(previous?.connectionRestoreCount) || 0) + 1);
  if (kind === LAUNCH_EVENT.LISTENER_ERROR) patch.listenerErrorCount = Math.min(99, Math.max(0, Number(previous?.listenerErrorCount) || 0) + 1);
  if (['lobby', 'running', 'finished', 'cancelled'].includes(roomStatus)) patch.lastObservedRoomStatus = roomStatus;
  if (Number.isInteger(Number(roundIndex)) && Number(roundIndex) >= 0) patch.lastObservedRound = Number(roundIndex);
  return Object.freeze(patch);
}

