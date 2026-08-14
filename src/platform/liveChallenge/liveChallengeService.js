import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase.js';

const call = (name) => {
  const callable = httpsCallable(functions, name);
  return async (payload = {}) => (await callable(payload)).data || {};
};

export const createLiveChallenge = call('createLiveChallenge');
export const joinLiveChallenge = call('joinLiveChallenge');
export const startLiveChallenge = call('startLiveChallenge');
export const advanceLiveChallenge = call('advanceLiveChallenge');
export const finishLiveChallenge = call('finishLiveChallenge');
export const cancelLiveChallenge = call('cancelLiveChallenge');
export const submitLiveChallengeResponse = call('submitLiveChallengeResponse');

export const watchLiveChallengeInvite = (studentId, onValue, onError = console.error) => {
  if (!studentId) {
    onValue?.(null);
    return () => {};
  }
  return onSnapshot(doc(db, 'liveChallengeInvites', String(studentId)), (snapshot) => {
    onValue?.(snapshot.exists() ? { studentId: snapshot.id, ...snapshot.data() } : null);
  }, onError);
};

export const watchLiveChallengeRoom = (roomId, onValue, onError = console.error) => {
  if (!roomId) {
    onValue?.(null);
    return () => {};
  }
  return onSnapshot(doc(db, 'liveChallengeRooms', String(roomId)), (snapshot) => {
    onValue?.(snapshot.exists() ? { roomId: snapshot.id, ...snapshot.data() } : null);
  }, onError);
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

// One server-owned pointer per teacher recovers an active lobby/game after a
// refresh without scanning completed challenge history.
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
