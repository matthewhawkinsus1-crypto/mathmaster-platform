/*
 * WHICH ROOM, IF ANY, BELONGS TO THIS WARM-UP.
 *
 * warmupChallenge.mjs decides what a student should be doing given a room
 * status. It does not decide WHICH room's status to hand it, and on the client
 * that is the question that can actually hurt someone.
 *
 * A student has at most one invite document. It is written for every Live
 * Challenge their teacher opens, including standalone ones launched from the
 * teacher dashboard that have nothing to do with any assignment. If the Warm-Up
 * simply read "is there an invite" it would hand a student straight into an
 * unrelated game the moment they opened an unrelated assignment — mid-lesson,
 * with no way back. So the link is explicit and it fails closed:
 *
 *   - an invite with no assignmentId is a standalone challenge and NEVER
 *     drives a Warm-Up, however live it is;
 *   - an invite for assignment A never drives assignment B;
 *   - anything unparseable resolves to "no room", which leaves the Warm-Up
 *     exactly as it behaves today.
 *
 * The failure that matters is the false positive, not the false negative. A
 * missed link means a teacher says "join the challenge" and a student taps the
 * dashboard banner instead — a mild annoyance. A wrong link means a student is
 * pulled out of their work into someone else's game. Every ambiguous case here
 * resolves to the first one.
 */

import {
  WARMUP_CHALLENGE_ROUTE,
  normalizeWarmupChallengeConfig,
  warmupChallengeRoute,
} from '../../../functions/shared/warmupChallenge.mjs';

/*
 * Invites carry the lifecycle word the server last wrote; rooms carry the
 * status enum. They are deliberately not the same vocabulary — an invite says
 * "you were invited", a room says "a lobby exists" — so the translation is
 * written down rather than assumed.
 */
export const INVITE_STATUS_TO_ROOM_STATUS = Object.freeze({
  invited: 'lobby',
  joined: 'lobby',
  running: 'running',
  finished: 'finished',
  cancelled: 'cancelled',
});

const trimmedId = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

/**
 * Does this invite name this exact assignment?
 *
 * Both ids must be present and identical. A blank on either side is a "no" —
 * never a wildcard.
 */
export const inviteBelongsToAssignment = (invite, assignmentId) => {
  const invited = trimmedId(invite?.assignmentId);
  const target = trimmedId(assignmentId);
  if (!invited || !target) return false;
  return invited === target;
};

/**
 * The room status this Warm-Up should reason about, or null when no room here
 * belongs to it.
 */
export const warmupRoomStatusFromInvite = (invite, assignmentId) => {
  if (!inviteBelongsToAssignment(invite, assignmentId)) return null;
  const status = trimmedId(invite?.status).toLowerCase();
  return INVITE_STATUS_TO_ROOM_STATUS[status] || null;
};

/**
 * The whole client-side decision, in one call.
 *
 * `playedRoomIds` is this student's own record of games they have already
 * finished. It is what stops a student who played the Warm-Up challenge being
 * dragged back into it every time they reopen the assignment before the window
 * closes.
 */
export const resolveWarmupChallenge = (input) => {
  // A default parameter only covers `undefined`, and a caller reading a missing
  // record out of state hands us `null` far more often than nothing at all.
  // Destructuring that would throw, which for this module means failing OPEN in
  // the middle of a lesson, so it is normalised before anything else happens.
  const {
    assignment = null,
    assignmentId = null,
    warmupState = null,
    invite = null,
    playedRoomIds = [],
  } = (input && typeof input === 'object') ? input : {};

  const targetId = trimmedId(assignmentId) || trimmedId(assignment?.id);
  const config = normalizeWarmupChallengeConfig(assignment);
  const belongs = inviteBelongsToAssignment(invite, targetId);
  const roomId = belongs ? trimmedId(invite?.roomId) || null : null;
  const roomStatus = belongs ? warmupRoomStatusFromInvite(invite, targetId) : null;

  const played = Array.isArray(playedRoomIds) ? playedRoomIds.map(trimmedId).filter(Boolean) : [];
  const alreadyPlayed = Boolean(roomId) && played.includes(roomId);

  const decision = warmupChallengeRoute({
    assignment,
    warmupState,
    roomStatus,
    alreadyPlayed,
  });

  return {
    ...decision,
    config,
    // Never hand back a room id on a route that is not going to play it. A
    // caller that reads roomId without checking route cannot then join a
    // finished or unrelated game by accident.
    roomId: decision.route === WARMUP_CHALLENGE_ROUTE.PLAY ? roomId : null,
    linkedRoomId: roomId,
    roomStatus,
  };
};

export { WARMUP_CHALLENGE_ROUTE };
export default resolveWarmupChallenge;
