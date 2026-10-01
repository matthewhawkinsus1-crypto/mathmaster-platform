/*
 * WHO IS HERE: THE TEACHER'S ROSTER DURING A LIVE CHALLENGE.
 *
 * A teacher running a game needs names, not code names: who has not joined,
 * whose device has gone quiet, who came back, who is signed in on two devices.
 * The public player rows are anonymous on purpose, so names come from a
 * teacher-only callable (getLiveChallengeHostRoster) keyed by player key, and
 * are shown on the teacher's console only — never on the projector.
 *
 * HONEST, NOT PRECISE. A browser cannot report that it closed. What the
 * server knows is when it last HEARD from a student's game screen: its clock
 * calibration (every ~30 s), its taps, its answers. So a student is
 * "connected" while that is recent, and otherwise "no signal for 2 min" — a
 * fact, not a guess that they left. Two devices are two game screens heard
 * from within the same window.
 *
 * Pure: tested in node.
 */

import { timestampToMillis } from '../../../functions/shared/liveChallengeTimer.mjs';
import { PRESENCE_FRESH_MS } from '../../../functions/shared/liveChallengePresence.mjs';

// Two missed 30-second reports (the server's own window, shared).
export { PRESENCE_FRESH_MS };
// A reconnect is news for this long after it happens.
export const RECONNECT_NEWS_MS = 120_000;

export const PRESENCE = Object.freeze({
  NOT_JOINED: 'notJoined',
  JOINED: 'joined',          // joined; no report from the game screen yet
  CONNECTED: 'connected',
  NO_SIGNAL: 'noSignal',
});

const millis = (value) => timestampToMillis(value) || null;

const freshSessions = (diagnostic, nowMs) => {
  const sessions = diagnostic?.sessions && typeof diagnostic.sessions === 'object' ? diagnostic.sessions : {};
  return Object.values(sessions)
    .map((value) => millis(value))
    .filter((at) => at && nowMs - at <= PRESENCE_FRESH_MS).length;
};

/** "just now", "40 s ago", "2 min ago". */
export const agoText = (sinceMs) => {
  const since = Math.max(0, Number(sinceMs) || 0);
  if (since < 10_000) return 'just now';
  if (since < 60_000) return `${Math.round(since / 1000)} s ago`;
  return `${Math.floor(since / 60_000)} min ago`;
};

/**
 * One student's presence from what the server last recorded.
 *
 * @param publicRow   the anonymous player row (joined, rushActiveAt, provisionalAt…)
 * @param diagnostic  the teacher-only diagnostics row (connectionUpdatedAt, sessions, reconnectedAt)
 * @param nowMs       the teacher's calibrated server time
 */
export const presenceOf = ({ publicRow = null, diagnostic = null, nowMs = Date.now() } = {}) => {
  const now = Number(nowMs);
  const joined = Boolean(publicRow) && publicRow.joined !== false;
  if (!joined) return Object.freeze({ state: PRESENCE.NOT_JOINED, label: 'Not joined', lastHeardMs: null, devices: 0, reconnected: false });
  const heard = [
    millis(diagnostic?.connectionUpdatedAt),
    millis(publicRow?.rushActiveAt),
    millis(publicRow?.provisionalAt),
  ].filter(Boolean);
  const lastHeardMs = heard.length ? Math.max(...heard) : null;
  const devices = freshSessions(diagnostic, now);
  const reconnectedAt = millis(diagnostic?.reconnectedAt);
  const reconnected = Boolean(reconnectedAt) && now - reconnectedAt <= RECONNECT_NEWS_MS && lastHeardMs !== null && now - lastHeardMs <= PRESENCE_FRESH_MS;
  if (lastHeardMs === null) return Object.freeze({ state: PRESENCE.JOINED, label: 'Joined', lastHeardMs: null, devices, reconnected: false });
  const since = now - lastHeardMs;
  if (since <= PRESENCE_FRESH_MS) {
    return Object.freeze({ state: PRESENCE.CONNECTED, label: reconnected ? 'Reconnected' : 'Connected', lastHeardMs, devices, reconnected, quality: diagnostic?.connectionStatus || null });
  }
  return Object.freeze({ state: PRESENCE.NO_SIGNAL, label: `No signal ${agoText(since).replace(' ago', '')}`, lastHeardMs, devices, reconnected: false, quality: diagnostic?.connectionStatus || null });
};

const nameOrder = (left, right) => String(left.name).localeCompare(String(right.name), undefined, { sensitivity: 'base', numeric: true });

/**
 * The console roster: every student invited to the room, by name, with their
 * presence and whether they have finished the current round.
 *
 * @param roster       [{ playerKey, name, alias }] from getLiveChallengeHostRoster, or null while loading
 * @param players      public player rows
 * @param diagnostics  teacher-only diagnostics rows
 * @param roundIndex   the current round (null outside a round)
 * @param finishedKeys player keys that have finished the current round
 */
export const hostRoster = ({ roster = null, players = [], diagnostics = [], roundIndex = null, finishedKeys = null, nowMs = Date.now() } = {}) => {
  const rows = Array.isArray(players) ? players : [];
  const byKey = new Map(rows.filter((row) => row?.playerKey).map((row) => [String(row.playerKey), row]));
  const diagnosticByKey = new Map((Array.isArray(diagnostics) ? diagnostics : []).filter((row) => row?.playerKey).map((row) => [String(row.playerKey), row]));
  const finished = finishedKeys instanceof Set ? finishedKeys : new Set();
  // Before the names arrive, the console still lists who is in — by game alias.
  const source = Array.isArray(roster) && roster.length
    ? roster.map((entry) => ({ playerKey: String(entry.playerKey || ''), name: String(entry.name || entry.alias || 'Student'), alias: String(entry.alias || '') }))
    : rows.map((row) => ({ playerKey: String(row.playerKey || ''), name: String(row.alias || 'Player'), alias: String(row.alias || '') }));
  const entries = source
    .filter((entry) => entry.playerKey)
    .map((entry) => {
      const publicRow = byKey.get(entry.playerKey) || null;
      const presence = presenceOf({ publicRow, diagnostic: diagnosticByKey.get(entry.playerKey) || null, nowMs });
      return Object.freeze({
        ...entry,
        // The roster's alias is from when the names were read; a display
        // setting changed in the lobby shows on the public row.
        alias: String(publicRow?.alias || entry.alias || ''),
        presence,
        finishedRound: roundIndex === null || roundIndex === undefined ? null : finished.has(entry.playerKey),
      });
    })
    .sort(nameOrder);
  const count = (predicate) => entries.filter(predicate).length;
  return Object.freeze({
    entries,
    summary: Object.freeze({
      invited: entries.length,
      joined: count((entry) => entry.presence.state !== PRESENCE.NOT_JOINED),
      connected: count((entry) => entry.presence.state === PRESENCE.CONNECTED),
      noSignal: count((entry) => entry.presence.state === PRESENCE.NO_SIGNAL),
      multiDevice: count((entry) => entry.presence.devices > 1),
      reconnected: count((entry) => entry.presence.reconnected),
      notJoined: entries.filter((entry) => entry.presence.state === PRESENCE.NOT_JOINED).map((entry) => entry.name),
    }),
    hasNames: Array.isArray(roster) && roster.length > 0,
  });
};

/*
 * A STUDENT'S OWN DEVICE: is it in touch with the game? `online` is the
 * browser's report; `fromCache` is the room listener's (the SDK serves its
 * cache while the server is unreachable); `everInSync` is whether this screen
 * has had a server copy of the room yet. A first paint from the device's own
 * cache is not "reconnecting" — the screen has not lost anything yet.
 */
export const STUDENT_CONNECTION = Object.freeze({ ONLINE: 'online', RECONNECTING: 'reconnecting', OFFLINE: 'offline' });

export const studentConnectionState = ({ online = true, fromCache = false, everInSync = false } = {}) => {
  if (online === false) return STUDENT_CONNECTION.OFFLINE;
  if (fromCache && everInSync) return STUDENT_CONNECTION.RECONNECTING;
  return STUDENT_CONNECTION.ONLINE;
};
