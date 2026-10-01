/*
 * WHAT THE SERVER KNOWS ABOUT A STUDENT'S GAME SCREEN.
 *
 * A student's game screen calibrates its clock against the server every
 * ~30 seconds and, with each calibration, reports its connection quality and
 * a per-tab session id. That report is the only heartbeat a Live Challenge
 * has: a browser cannot say that it closed, so the teacher's console shows
 * when a screen was last HEARD from, not a guess that it left.
 *
 * From the report the server keeps, in the teacher-only diagnostics row:
 *
 *   connectionStatus   the screen's own measure (synchronized, delayed, …)
 *   sessions           the game screens (tabs/devices) heard from recently,
 *                      session id -> last report (ms). Two fresh sessions are
 *                      one student signed in on two devices.
 *   reconnectedAt      set when a report arrives after a silence longer than
 *                      the freshness window: the student came back.
 *
 * Pure: the callable applies it inside a transaction on the one row.
 */

// Two missed 30-second reports.
export const PRESENCE_FRESH_MS = 75_000;
// Sessions older than this are forgotten; at most this many are kept.
export const SESSION_MEMORY_MS = 5 * 60_000;
export const MAX_REMEMBERED_SESSIONS = 6;

export const CONNECTION_QUALITIES = Object.freeze(['synchronized', 'delayed', 'reconnecting', 'degraded']);

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

/** A per-tab id a client sends, or null when it is not a usable one. */
export const cleanSessionId = (value) => {
  const id = String(value ?? '').trim();
  return SESSION_ID_PATTERN.test(id) ? id : null;
};

/**
 * The fields one connection report writes.
 *
 * @param previousHeardMs   when the row was last written (connectionUpdatedAt), or null
 * @param previousSessions  the row's sessions map, or null
 * @param quality           the screen's reported quality
 * @param sessionId         the screen's per-tab id (optional; old clients send none)
 * @param nowMs             server time
 */
export const nextConnectionReport = ({
  previousHeardMs = null,
  previousSessions = null,
  quality = 'delayed',
  sessionId = null,
  nowMs,
} = {}) => {
  const now = Number(nowMs);
  const status = CONNECTION_QUALITIES.includes(quality) ? quality : 'delayed';
  const report = {
    connectionStatus: status,
    connectionRttCategory: status === 'synchronized' ? 'normal' : 'elevated',
  };
  const id = cleanSessionId(sessionId);
  // The reporting screen is always kept (first); the most recent others fill
  // the rest of the bounded map.
  const others = Object.entries(previousSessions && typeof previousSessions === 'object' ? previousSessions : {})
    .map(([key, at]) => [key, Number(at)])
    .filter(([key, at]) => cleanSessionId(key) && Number.isFinite(at) && now - at <= SESSION_MEMORY_MS && key !== id)
    .sort((left, right) => right[1] - left[1])
    .slice(0, id ? MAX_REMEMBERED_SESSIONS - 1 : MAX_REMEMBERED_SESSIONS);
  report.sessions = Object.fromEntries(id ? [[id, now], ...others] : others);
  const heard = Number(previousHeardMs);
  if (Number.isFinite(heard) && heard > 0 && now - heard > PRESENCE_FRESH_MS) report.reconnectedAt = now;
  return Object.freeze(report);
};
