import { FieldValue } from 'firebase-admin/firestore';
import { SOURCE_TYPES, applyTransaction } from './classPoints.mjs';

export const ACHIEVEMENT_CODES = Object.freeze({
  FINISHER: 'challengeFinisher',
  STRONG_ACCURACY: 'strongAccuracy',
  COMEBACK: 'comeback',
});

export const ACHIEVEMENT_AMOUNTS = Object.freeze({
  [ACHIEVEMENT_CODES.FINISHER]: 2,
  [ACHIEVEMENT_CODES.STRONG_ACCURACY]: 3,
  [ACHIEVEMENT_CODES.COMEBACK]: 2,
});

export const ACHIEVEMENT_LABELS = Object.freeze({
  [ACHIEVEMENT_CODES.FINISHER]: 'Live Challenge — Finisher',
  [ACHIEVEMENT_CODES.STRONG_ACCURACY]: 'Live Challenge — Strong Accuracy',
  [ACHIEVEMENT_CODES.COMEBACK]: 'Live Challenge — Comeback',
});

export const MAX_CHALLENGE_CLASS_POINTS = 7;
export const JOBS_COLLECTION = 'liveChallengeAchievementJobs';
export const ACHIEVEMENT_SOURCE_TYPE = SOURCE_TYPES?.LIVE_CHALLENGE_ACHIEVEMENT || 'liveChallengeAchievement';
export const ACHIEVEMENT_REASON_CODE = 'liveChallengeAchievement';

function getAnswerForRound(playerState, round, index) {
  const answers = playerState?.answers || playerState?.responses || playerState?.roundResponses;
  if (!answers) return null;
  if (Array.isArray(answers)) {
    return answers.find(a => (round?.id && a?.roundId === round.id) || a?.roundIndex === index) || answers[index] || null;
  }
  if (typeof answers === 'object') {
    if (round?.id && answers[round.id] !== undefined) return answers[round.id];
    if (answers[index] !== undefined) return answers[index];
    if (answers[String(index)] !== undefined) return answers[String(index)];
  }
  return null;
}

function isSubmitted(ans) {
  if (!ans) return false;
  if (typeof ans.submitted === 'boolean') return ans.submitted;
  if (ans.selectedOption !== undefined || ans.submittedAnswer !== undefined || ans.answer !== undefined) return true;
  return typeof ans.isCorrect === 'boolean';
}

function isCorrect(ans) {
  return ans?.isCorrect === true || ans?.correct === true;
}

export function calculateStudentChallengeAchievements(playerState, roomRounds = []) {
  if (!playerState || !Array.isArray(roomRounds) || roomRounds.length === 0) return [];
  const hasJoined = Boolean(playerState.hasJoined || playerState.joinedAt || playerState.joinedAtRound !== undefined || playerState.answers);
  if (!hasJoined) return [];

  const earned = [];
  const totalRounds = roomRounds.length;
  const joinedIndex = typeof playerState.joinedAtRound === 'number' ? Math.max(0, playerState.joinedAtRound) : 0;
  const availableRounds = Math.max(0, totalRounds - joinedIndex);

  // 1. Challenge Finisher (+2)
  let answeredAvailable = 0;
  for (let i = joinedIndex; i < totalRounds; i++) {
    if (isSubmitted(getAnswerForRound(playerState, roomRounds[i], i))) answeredAvailable++;
  }
  if (availableRounds >= 2 && (answeredAvailable / availableRounds) >= 0.80) {
    earned.push({ achievementCode: ACHIEVEMENT_CODES.FINISHER, amount: 2, reasonLabel: ACHIEVEMENT_LABELS.challengeFinisher });
  }

  // 2. Strong Accuracy (+3)
  let originalAnswered = 0;
  let originalCorrect = 0;
  for (let i = 0; i < totalRounds; i++) {
    const r = roomRounds[i];
    if (r.secondChanceOf || r.isSecondChance || r.isReplay) continue;
    const ans = getAnswerForRound(playerState, r, i);
    if (isSubmitted(ans)) {
      originalAnswered++;
      if (isCorrect(ans)) originalCorrect++;
    }
  }
  if (originalAnswered >= 3 && (originalCorrect / originalAnswered) >= 0.80) {
    earned.push({ achievementCode: ACHIEVEMENT_CODES.STRONG_ACCURACY, amount: 3, reasonLabel: ACHIEVEMENT_LABELS.strongAccuracy });
  }

  // 3. Comeback (+2)
  let comebackEarned = false;
  const replays = roomRounds.filter(r => Boolean(r.secondChanceOf || r.isSecondChance || r.isReplay));
  for (const rep of replays) {
    const origId = rep.secondChanceOf || rep.originalRoundId;
    const origIndex = roomRounds.findIndex(r => r.id === origId || r.questionId === origId);
    if (origIndex < 0) continue;
    const origAns = getAnswerForRound(playerState, roomRounds[origIndex], origIndex);
    if (!origAns || !isCorrect(origAns)) {
      const repAns = getAnswerForRound(playerState, rep, roomRounds.indexOf(rep));
      if (repAns && isSubmitted(repAns) && isCorrect(repAns)) {
        comebackEarned = true;
        break;
      }
    }
  }
  if (comebackEarned) {
    earned.push({ achievementCode: ACHIEVEMENT_CODES.COMEBACK, amount: 2, reasonLabel: ACHIEVEMENT_LABELS.comeback });
  }

  return earned;
}

export function buildAchievementTransactionId(roomId, studentId, achievementCode) {
  return `lca_${roomId}_${studentId}_${achievementCode}`;
}

export async function stageLiveChallengeAchievements(db, roomId, roomData, privatePlayers = []) {
  if (!roomData || roomData.status === 'cancelled' || !roomData.classId) return { status: 'skipped' };
  const classSnap = await db.collection('classes').doc(roomData.classId).get();
  if (!classSnap.exists) return { status: 'skipped' };

  const classData = classSnap.data() || {};
  const enrolled = new Set(classData.studentIds || []);
  const teacherId = classData.teacherId || classData.ownerId || 'system';
  const rounds = roomData.rounds || [];
  const plannedAwards = [];

  for (const p of privatePlayers) {
    const sId = p.studentId || p.id;
    if (!sId || (enrolled.size > 0 && !enrolled.has(sId))) continue;
    const achs = calculateStudentChallengeAchievements(p, rounds);
    for (const a of achs) {
      plannedAwards.push({
        id: buildAchievementTransactionId(roomId, sId, a.achievementCode),
        roomId,
        classId: roomData.classId,
        studentId: sId,
        teacherId,
        achievementCode: a.achievementCode,
        amount: a.amount,
        reasonLabel: a.reasonLabel,
        processed: false,
      });
    }
  }

  const jobRef = db.collection(JOBS_COLLECTION).doc(roomId);
  await jobRef.set({
    roomId,
    classId: roomData.classId,
    awards: plannedAwards,
    status: plannedAwards.length === 0 ? 'completed' : 'pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { status: 'staged', awards: plannedAwards };
}

export async function executeLiveChallengeAchievementAwards(db, roomId) {
  const jobRef = db.collection(JOBS_COLLECTION).doc(roomId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return;
  const awards = jobSnap.data()?.awards || [];
  const pending = awards.filter(a => !a.processed);
  if (pending.length === 0) return;

  for (const award of pending) {
    const { id: txId, classId, studentId, teacherId, amount, achievementCode, reasonLabel } = award;
    const accountRef = db.collection('classes').doc(classId).collection('classPointsAccounts').doc(studentId);
    const ledgerTxRef = db.collection('classes').doc(classId).collection('classPointsTransactions').doc(txId);

    try {
      await db.runTransaction(async (transaction) => {
        const existingTx = await transaction.get(ledgerTxRef);
        if (existingTx.exists) return;

        const accSnap = await transaction.get(accountRef);
        const current = accSnap.exists ? accSnap.data() : { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 };
        const updated = applyTransaction ? applyTransaction(current, { amount }) : {
          balance: (current.balance || 0) + amount,
          lifetimeEarned: (current.lifetimeEarned || 0) + amount,
          lifetimeSpent: current.lifetimeSpent || 0,
        };

        transaction.set(accountRef, {
          studentId,
          classId,
          balance: updated.balance,
          lifetimeEarned: updated.lifetimeEarned,
          lifetimeSpent: updated.lifetimeSpent,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        transaction.set(ledgerTxRef, {
          id: txId,
          studentId,
          classId,
          teacherId,
          amount,
          sourceType: ACHIEVEMENT_SOURCE_TYPE,
          reasonCode: ACHIEVEMENT_REASON_CODE,
          reasonLabel,
          achievementCode,
          roomId,
          awardedBy: 'system',
          awardedByType: 'server',
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      award.processed = true;
    } catch (e) {
      console.error(`[ClassPoints] Failed award ${txId}:`, e);
    }
  }

  await jobRef.update({
    awards,
    status: awards.every(a => a.processed) ? 'completed' : 'partially_failed',
    updatedAt: FieldValue.serverTimestamp(),
  });
}
