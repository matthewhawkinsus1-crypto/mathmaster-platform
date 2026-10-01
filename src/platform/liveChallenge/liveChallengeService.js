import { collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase.js';

const call = (name) => {
  const callable = httpsCallable(functions, name);
  return async (payload = {}) => (await callable(payload)).data || {};
};

export const createLiveChallenge = call('createLiveChallenge');
export const joinLiveChallenge = call('joinLiveChallenge');
export const startLiveChallenge = call('startLiveChallenge');
// Round-scoped commands accept { expectedRoundIndex, expectedRoundVersion }: a
// command about a round that has already moved on is answered as already done.
export const closeLiveChallengeRound = call('closeLiveChallengeRound');
export const advanceLiveChallenge = call('advanceLiveChallenge');
export const finishLiveChallenge = call('finishLiveChallenge');
export const cancelLiveChallenge = call('cancelLiveChallenge');
export const submitLiveChallengeResponse = call('submitLiveChallengeResponse');
export const calibrateLiveChallengeClock = call('calibrateLiveChallengeClock');
export const reportLiveChallengeProgress = call('reportLiveChallengeProgress');
export const updateLiveChallengePacing = call('updateLiveChallengePacing');
// The room's own teacher only: player key -> student name, for the console's
// roster. Never shown on the projector.
export const getLiveChallengeHostRoster = call('getLiveChallengeHostRoster');

// Graph Feature Rush. A student's place in the round and their next graphs,
// and a batch of their taps, "Does Not Exist" presses and skips — graded
// again on the server, which alone decides what counts. The preview shows a
// teacher sample graphs for their settings and writes nothing.
export const getGraphFeatureRushRound = call('getGraphFeatureRushRound');
export const submitGraphFeatureRushAttempts = call('submitGraphFeatureRushAttempts');
export const previewGraphFeatureRush = call('previewGraphFeatureRush');

// Option B room experience. These remain server-authoritative: the browser
// chooses a policy, but the server owns public aliases and speed-score scaling.
export const configureLiveChallengeExperience = call('configureLiveChallengeExperience');
export const getLiveChallengeExperience = call('getLiveChallengeExperience');

// The assignment already belongs to the signed-in teacher and Firestore rules
// protect the write. Keeping this tiny persistence seam here avoids teaching the
// Live Challenge UI about assignment collection paths in multiple places.
export const setWarmupChallengeDelivery = async (assignmentId, {
  deliveryMode = 'liveChallenge',
  teacherDecision = null,
} = {}) => {
  const id = String(assignmentId || '').trim();
  if (!id) throw new Error('Choose a Warm-Up assignment first.');
  const validModes = new Set(['liveChallenge', 'teacherChoice', 'standard']);
  const validDecisions = new Set(['challenge', 'standard']);
  const mode = validModes.has(deliveryMode) ? deliveryMode : 'liveChallenge';
  const decision = validDecisions.has(teacherDecision) ? teacherDecision : null;
  await updateDoc(doc(db, 'assignments', id), {
    'warmup.liveChallenge.enabled': mode !== 'standard',
    'warmup.liveChallenge.deliveryMode': mode,
    'warmup.liveChallenge.teacherDecision': decision,
    'warmup.liveChallenge.updatedAt': serverTimestamp(),
  });
  return { assignmentId: id, deliveryMode: mode, teacherDecision: decision };
};

// A teacher rehearsing their own challenge. None of these touch a room, a
// roster, or anybody's record — see the dry-run block in functions/index.js.
export const createChallengeDryRun = call('createChallengeDryRun');
export const swapChallengeDryRunRound = call('swapChallengeDryRunRound');
export const gradeChallengeDryRunResponse = call('gradeChallengeDryRunResponse');
export const discardChallengeDryRun = call('discardChallengeDryRun');

export const watchLiveChallengeInvite = (studentId, onValue, onError = console.error) => {
  if (!studentId) {
    onValue?.(null);
    return () => {};
  }
  return onSnapshot(doc(db, 'liveChallengeInvites', String(studentId)), (snapshot) => {
    onValue?.(snapshot.exists() ? { studentId: snapshot.id, ...snapshot.data() } : null);
  }, onError);
};

// `onValue(room, { fromCache })`. With `includeMetadataChanges` the listener
// also reports when the SDK falls back to its cache (offline) and when it is
// back in sync — what a student's "Reconnecting…" is read from.
export const watchLiveChallengeRoom = (roomId, onValue, onError = console.error, { includeMetadataChanges = false } = {}) => {
  if (!roomId) {
    onValue?.(null, { fromCache: false });
    return () => {};
  }
  return onSnapshot(doc(db, 'liveChallengeRooms', String(roomId)), { includeMetadataChanges }, (snapshot) => {
    onValue?.(snapshot.exists() ? { roomId: snapshot.id, ...snapshot.data() } : null, { fromCache: snapshot.metadata.fromCache === true });
  }, onError);
};

// One closed round's anonymous result (liveChallengeRooms/{room}/rounds/{n}):
// written once, in the transaction that closes the round, with the standings
// the round left behind. Watched only while a screen shows that round's
// results; a document that never changes again costs one read.
export const watchLiveChallengeRound = (roomId, roundIndex, onValue, onError = console.error) => {
  if (!roomId || !Number.isInteger(Number(roundIndex)) || Number(roundIndex) < 0) {
    onValue?.(null);
    return () => {};
  }
  return onSnapshot(doc(db, 'liveChallengeRooms', String(roomId), 'rounds', String(Number(roundIndex))), (snapshot) => {
    onValue?.(snapshot.exists() ? snapshot.data() : null);
  }, onError);
};

// The round before, for movement since then. One read; it never changes.
export const readLiveChallengeRound = async (roomId, roundIndex) => {
  if (!roomId || !Number.isInteger(Number(roundIndex)) || Number(roundIndex) < 0) return null;
  const snapshot = await getDoc(doc(db, 'liveChallengeRooms', String(roomId), 'rounds', String(Number(roundIndex))));
  return snapshot.exists() ? snapshot.data() : null;
};

export const watchLiveChallengePlayers = (roomId, onValue, onError = console.error) => {
  if (!roomId) {
    onValue?.([]);
    return () => {};
  }
  return onSnapshot(collection(db, 'liveChallengeRooms', String(roomId), 'players'), (snapshot) => {
    onValue?.(snapshot.docs.map((playerDoc) => ({ playerKey: playerDoc.id, ...playerDoc.data() })));
  }, onError);
};

export const watchLiveChallengeDiagnostics = (roomId, onValue, onError = console.error) => {
  if (!roomId) { onValue?.([]); return () => {}; }
  return onSnapshot(collection(db, 'liveChallengeRooms', String(roomId), 'diagnostics'), (snapshot) => {
    onValue?.(snapshot.docs.map((entry) => ({ playerKey: entry.id, ...entry.data() })));
  }, onError);
};

// One server-owned pointer per teacher recovers an active lobby/game after a
// refresh without scanning completed challenge history.
/**
 * The report a finished game leaves behind, for the teacher who ran it.
 *
 * A one-shot read rather than a subscription: it is written once when the room
 * closes and never changes, so watching it would keep a listener open on a
 * document that will not move again.
 */
export const readChallengeReport = async (roomId) => {
  const id = String(roomId || '').trim();
  if (!id) return null;
  const snapshot = await getDoc(doc(db, 'liveChallengeReports', id));
  return snapshot.exists() ? snapshot.data() : null;
};

export const watchTeacherActiveChallenge = (teacherEmail, onValue, onError = console.error) => {
  if (!teacherEmail) {
    onValue?.(null);
    return () => {};
  }
  return onSnapshot(doc(db, 'liveChallengeTeacherActive', String(teacherEmail).trim().toLowerCase()), (snapshot) => {
    onValue?.(snapshot.exists() ? snapshot.data() : null);
  }, onError);
};

export const timestampMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
