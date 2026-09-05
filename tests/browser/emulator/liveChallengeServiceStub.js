// Stands in for the Live Challenge client service inside the harness.
//
// THE WATCHERS ARE THE REAL ONES. They are re-exported untouched, so the
// component under test subscribes through exactly the code students run — the
// only difference is that `db` points at the emulator.
//
// THE CALLABLES ARE NOT. Every one of them is a Cloud Function that requires an
// authenticated student or teacher token with custom claims, which a browser
// harness cannot mint. Their SERVER logic is already covered by the platform
// suite; what is uncovered, and what this harness exists for, is whether the
// student's screen renders the game correctly as room state changes.
//
// So the stubs do what the server would do to Firestore and nothing else. A
// submitted answer writes the player document the real function would write,
// which is what makes the leaderboard update for real rather than being faked.
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseEmulator.js';

export {
  watchLiveChallengeInvite,
  watchLiveChallengeRoom,
  watchLiveChallengePlayers,
  watchTeacherActiveChallenge,
  readChallengeReport,
  timestampMillis,
} from '../../../src/platform/liveChallenge/liveChallengeService.js';

// Recorded so the driver can assert the component called what it should have.
window.__mmGameCalls = [];
const record = (name, payload) => { window.__mmGameCalls.push({ name, payload }); };

export const joinLiveChallenge = async (payload) => {
  record('joinLiveChallenge', payload);
  return { joined: true };
};

export const submitLiveChallengeResponse = async (payload) => {
  record('submitLiveChallengeResponse', payload);
  const { roomId, roundIndex } = payload || {};
  const playerKey = window.__mmGamePlayerKey;
  const ref = doc(db, 'liveChallengeRooms', roomId, 'players', playerKey);
  const existing = await getDoc(ref);
  const previous = existing.exists() ? existing.data() : {};
  // The grade the real grader would return for this harness's seeded question.
  const isCorrect = window.__mmGameNextAnswerCorrect !== false;
  await setDoc(ref, {
    ...previous,
    score: Math.max(0, Number(previous.score) || 0) + (isCorrect ? 1000 : 0),
    correctCount: Math.max(0, Number(previous.correctCount) || 0) + (isCorrect ? 1 : 0),
    roundsAnswered: Math.max(0, Number(previous.roundsAnswered) || 0) + 1,
    answeredRound: roundIndex,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  // The exact shape submitLiveChallengeResponse returns. An approximation here
  // is worse than useless: the first version of this stub omitted totalScore,
  // the round threw on it, and the harness reported a crash the server could
  // never actually cause.
  const totalScore = Math.max(0, Number(previous.score) || 0) + (isCorrect ? 1000 : 0);
  return {
    isCorrect,
    scorePercent: isCorrect ? 100 : 0,
    pointsAwarded: isCorrect ? 1000 : 0,
    basePoints: isCorrect ? 1000 : 0,
    speedBonus: 0,
    streakBonus: 0,
    comebackBonus: 0,
    recoveryPoints: 0,
    secondChance: false,
    totalScore,
    streak: isCorrect ? 1 : 0,
    rank: null,
  };
};

/*
 * The progress report, doing exactly what the real callable does to Firestore:
 * a clamped provisional total on this player's OWN document, and nothing else.
 * Stubbing it as a no-op would leave the harness unable to see the one thing
 * this feature exists for — the board moving while a student is still working.
 */
export const reportLiveChallengeProgress = async (payload) => {
  record('reportLiveChallengeProgress', payload);
  const { roomId, roundIndex, provisionalPoints } = payload || {};
  const playerKey = window.__mmGamePlayerKey;
  if (!roomId || !playerKey) return { recorded: false };
  await setDoc(
    doc(db, 'liveChallengeRooms', roomId, 'players', playerKey),
    {
      provisionalPoints: Math.max(0, Math.min(1000, Math.round(Number(provisionalPoints) || 0))),
      provisionalRound: roundIndex,
      provisionalAt: serverTimestamp(),
    },
    { merge: true },
  );
  return { recorded: true };
};

export const createLiveChallenge = async (payload) => { record('createLiveChallenge', payload); return {}; };
export const startLiveChallenge = async (payload) => { record('startLiveChallenge', payload); return {}; };
export const advanceLiveChallenge = async (payload) => { record('advanceLiveChallenge', payload); return {}; };
export const finishLiveChallenge = async (payload) => { record('finishLiveChallenge', payload); return {}; };
export const cancelLiveChallenge = async (payload) => { record('cancelLiveChallenge', payload); return {}; };
