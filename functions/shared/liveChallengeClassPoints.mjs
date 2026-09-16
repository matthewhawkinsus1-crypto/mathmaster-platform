import { FieldValue } from 'firebase-admin/firestore';
import {
  accountId,
  emptyAccount,
  applyTransaction,
  classPointsAuthorizationContext,
  SOURCE_TYPES,
  CLASS_POINTS_SCHEMA_VERSION,
} from './classPoints.mjs';

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
    return (
      answers.find(
        (a) =>
          (round?.id && a?.roundId === round.id) ||
          (round?.questionId && a?.questionId === round.questionId) ||
          a?.roundIndex === index
      ) || answers[index] || null
    );
  }
  if (typeof answers === 'object') {
    if (round?.id && answers[round.id] !== undefined) return answers[round.id];
    if (round?.questionId && answers[round.questionId] !== undefined) return answers[round.questionId];
    if (answers[index] !== undefined) return answers[index];
    if (answers[String(index)] !== undefined) return answers[String(index)];
  }
  return null;
}

function isSubmitted(ans) {
  if (!ans) return false;
  if (typeof ans.submitted === 'boolean') return ans.submitted;
  if (typeof ans.answered === 'boolean') return ans.answered;
  if (ans.selectedOption !== undefined || ans.submittedAnswer !== undefined || ans.answer !== undefined) return true;
  return typeof ans.isCorrect === 'boolean';
}

function isCorrect(ans) {
  return ans?.isCorrect === true || ans?.correct === true;
}

export function calculateStudentChallengeAchievements(playerState, roomRounds = []) {
  if (!playerState || !Array.isArray(roomRounds) || roomRounds.length === 0) return [];
  const hasJoined = Boolean(
    playerState.hasJoined ||
    playerState.joinedAt ||
    playerState.joinedAtRound !== undefined ||
    (playerState.answers && Object.keys(playerState.answers).length > 0)
  );
  if (!hasJoined) return [];

  const earned = [];
  const totalRounds = roomRounds.length;
  const joinedIndex = typeof playerState.joinedAtRound === 'number' ? Math.max(0, playerState.joinedAtRound) : 0;
  const availableRounds = Math.max(0, totalRounds - joinedIndex);

  // 1. Challenge Finisher (+2 Points)
  let answeredAvailable = 0;
  for (let i = joinedIndex; i < totalRounds; i++) {
    if (isSubmitted(getAnswerForRound(playerState, roomRounds[i], i))) {
      answeredAvailable++;
    }
  }
  if (availableRounds >= 2 && (answeredAvailable / availableRounds) >= 0.80) {
    earned.push({
      achievementCode: ACHIEVEMENT_CODES.FINISHER,
      amount: ACHIEVEMENT_AMOUNTS[ACHIEVEMENT_CODES.FINISHER],
      reasonLabel: ACHIEVEMENT_LABELS[ACHIEVEMENT_CODES.FINISHER],
    });
  }

  // 2. Strong Accuracy (+3 Points)
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
    earned.push({
      achievementCode: ACHIEVEMENT_CODES.STRONG_ACCURACY,
      amount: ACHIEVEMENT_AMOUNTS[ACHIEVEMENT_CODES.STRONG_ACCURACY],
      reasonLabel: ACHIEVEMENT_LABELS[ACHIEVEMENT_CODES.STRONG_ACCURACY],
    });
  }

  // 3. Comeback (+2 Points)
  let comebackEarned = false;
  const replays = roomRounds.filter((r) => Boolean(r.secondChanceOf || r.isSecondChance || r.isReplay));
  for (const rep of replays) {
    const origId = rep.secondChanceOf || rep.originalRoundId;
    const origIndex = roomRounds.findIndex((r) => r.id === origId || r.questionId === origId);
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
    earned.push({
      achievementCode: ACHIEVEMENT_CODES.COMEBACK,
      amount: ACHIEVEMENT_AMOUNTS[ACHIEVEMENT_CODES.COMEBACK],
      reasonLabel: ACHIEVEMENT_LABELS[ACHIEVEMENT_CODES.COMEBACK],
    });
  }

  return earned;
}

export function buildAchievementTransactionId(roomId, studentId, achievementCode) {
  return `lca_${roomId}_${studentId}_${achievementCode}`;
}

export async function stageLiveChallengeAchievements(db, roomId, roomData, privatePlayers = []) {
  if (!roomData || !roomData.classId) return { status: 'skipped', reason: 'missing_class_id' };
  const classSnap = await db.collection('classes').doc(roomData.classId).get();
  if (!classSnap.exists) return { status: 'skipped', reason: 'class_not_found' };

  const classData = classSnap.data() || {};
  const enrolled = new Set(Array.isArray(classData.studentIds) ? classData.studentIds : []);
  const rounds = roomData.rounds || roomData.scheduledRounds || [];
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
        achievementCode: a.achievementCode,
        amount: a.amount,
        reasonLabel: a.reasonLabel,
        processed: false,
      });
    }
  }

  const jobRef = db.collection(JOBS_COLLECTION).doc(roomId);
  await jobRef.set(
    {
      roomId,
      classId: roomData.classId,
      awardsCount: plannedAwards.length,
      awards: plannedAwards,
      status: plannedAwards.length === 0 ? 'completed' : 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { status: 'staged', awards: plannedAwards };
}

export async function executeLiveChallengeAchievementAwards(db, roomId) {
  const jobRef = db.collection(JOBS_COLLECTION).doc(roomId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return;

  const jobData = jobSnap.data() || {};
  const awards = jobData.awards || [];
  const unprocessed = awards.filter((a) => !a.processed);
  if (unprocessed.length === 0) return;

  const classId = jobData.classId;
  let authContext = { originTeacherEmail: '', authorizedTeacherEmails: [] };
  if (classId) {
    const classSnap = await db.collection('classes').doc(classId).get();
    if (classSnap.exists) {
      const classData = classSnap.data() || {};
      if (typeof classPointsAuthorizationContext === 'function') {
        try {
          authContext = classPointsAuthorizationContext(classData);
        } catch (e) {
          const tEmail = classData.teacherEmail || classData.ownerEmail || '';
          authContext = { originTeacherEmail: tEmail, authorizedTeacherEmails: [tEmail].filter(Boolean) };
        }
      } else {
        const tEmail = classData.teacherEmail || classData.ownerEmail || '';
        authContext = { originTeacherEmail: tEmail, authorizedTeacherEmails: [tEmail].filter(Boolean) };
      }
    }
  }

  for (const award of unprocessed) {
    const { id: txId, studentId, amount, achievementCode, reasonLabel } = award;
    const studentClassId = award.classId || classId;

    const accDocId = typeof accountId === 'function' ? accountId(studentId, studentClassId) : `${studentId}_${studentClassId}`;
    const accountRef = db.collection('classPointAccounts').doc(accDocId);
    const ledgerTxRef = db.collection('classPointTransactions').doc(txId);

    try {
      await db.runTransaction(async (transaction) => {
        const existingTx = await transaction.get(ledgerTxRef);
        if (existingTx.exists) return;

        const accountSnap = await transaction.get(accountRef);
        let currentAccount;
        if (accountSnap.exists) {
          currentAccount = accountSnap.data();
        } else if (typeof emptyAccount === 'function') {
          currentAccount = emptyAccount(studentId, studentClassId);
        } else {
          currentAccount = {
            studentId,
            classId: studentClassId,
            balance: 0,
            lifetimeEarned: 0,
            lifetimeSpent: 0,
            schemaVersion: CLASS_POINTS_SCHEMA_VERSION || 1,
          };
        }

        const txPayload = {
          amount,
          sourceType: ACHIEVEMENT_SOURCE_TYPE,
          reasonCode: ACHIEVEMENT_REASON_CODE,
        };

        const updatedAccount = typeof applyTransaction === 'function'
          ? applyTransaction(currentAccount, txPayload)
          : {
              ...currentAccount,
              balance: (currentAccount.balance || 0) + amount,
              lifetimeEarned: (currentAccount.lifetimeEarned || 0) + amount,
              lifetimeSpent: currentAccount.lifetimeSpent || 0,
            };

        transaction.set(
          accountRef,
          {
            ...updatedAccount,
            studentId,
            classId: studentClassId,
            updatedAt: FieldValue.serverTimestamp(),
            ...(accountSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
          },
          { merge: true }
        );

        transaction.set(ledgerTxRef, {
          id: txId,
          schemaVersion: CLASS_POINTS_SCHEMA_VERSION || 1,
          studentId,
          classId: studentClassId,
          amount,
          sourceType: ACHIEVEMENT_SOURCE_TYPE,
          reasonCode: ACHIEVEMENT_REASON_CODE,
          reasonLabel,
          achievementCode,
          roomId,
          originTeacherEmail: authContext.originTeacherEmail || '',
          authorizedTeacherEmails: authContext.authorizedTeacherEmails || [],
          awardedBy: 'system',
          awardedByType: 'server',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      award.processed = true;
    } catch (err) {
      console.error(`[LiveChallengeClassPoints] Failed award ${txId} for ${studentId}:`, err);
    }
  }

  await jobRef.update({
    awards,
    status: awards.every((a) => a.processed) ? 'completed' : 'partially_failed',
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function processLiveChallengeClassPoints(db, roomId, roomData, privatePlayers = [], status) {
  const isFinished = status === 'finished' || status === 'FINISHED';
  if (!isFinished) {
    return { status: 'skipped', reason: 'not_finished' };
  }
  const stagingResult = await stageLiveChallengeAchievements(db, roomId, roomData, privatePlayers);
  if (stagingResult.status === 'skipped') return stagingResult;
  await executeLiveChallengeAchievementAwards(db, roomId);
  return { status: 'completed', awardsCount: stagingResult.awards?.length || 0 };
}

export async function cleanupStudentLiveChallengeAchievements(db, studentId) {
  const allPendingJobs = await db.collection(JOBS_COLLECTION).get();
  const batch = db.batch();
  let count = 0;
  for (const doc of allPendingJobs.docs) {
    const data = doc.data() || {};
    if (Array.isArray(data.awards)) {
      const filtered = data.awards.filter((a) => a.studentId !== studentId);
      if (filtered.length !== data.awards.length) {
        batch.update(doc.ref, { awards: filtered, updatedAt: FieldValue.serverTimestamp() });
        count++;
      }
    }
  }
  if (count > 0) await batch.commit();
}
