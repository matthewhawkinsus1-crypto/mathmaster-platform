import crypto from 'crypto';
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

export function calculateStudentChallengeAchievements({ player, scheduledRoundCount, secondChanceOf }) {
  if (!player || player.joined !== true) {
    return [];
  }

  const roundCount = typeof scheduledRoundCount === 'number' ? scheduledRoundCount : 0;
  const earned = [];

  const rawReceipts = player.submissionReceipts;
  const receipts = rawReceipts
    ? (Array.isArray(rawReceipts) ? rawReceipts : Object.values(rawReceipts))
    : [];

  // 1. Challenge Finisher (+2 Points)
  const joinedAt = typeof player.joinedAtRound === 'number' ? Math.max(0, player.joinedAtRound) : 0;
  const availableScheduledRounds = Math.max(0, roundCount - joinedAt);

  if (availableScheduledRounds >= 2) {
    const answeredList = Array.isArray(player.answeredRounds) ? player.answeredRounds : [];
    const uniqueAnsweredOriginal = new Set(
      answeredList.filter((idx) => typeof idx === 'number' && Number.isInteger(idx) && idx >= joinedAt && idx < roundCount)
    );

    const participation = uniqueAnsweredOriginal.size / availableScheduledRounds;
    if (participation >= 0.80) {
      earned.push({
        achievementCode: ACHIEVEMENT_CODES.FINISHER,
        amount: ACHIEVEMENT_AMOUNTS[ACHIEVEMENT_CODES.FINISHER],
        reasonLabel: ACHIEVEMENT_LABELS[ACHIEVEMENT_CODES.FINISHER],
      });
    }
  }

  // 2. Strong Accuracy (+3 Points)
  const originalReceiptsByRound = new Map();
  for (const r of receipts) {
    if (!r || r.serverConfirmed !== true) continue;
    const idx = r.roundIndex;
    if (typeof idx !== 'number' || !Number.isInteger(idx)) continue;
    if (idx < 0 || idx >= roundCount) continue;
    if (r.secondChance === true || r.isSecondChance === true) continue;

    if (!originalReceiptsByRound.has(idx)) {
      originalReceiptsByRound.set(idx, r);
    }
  }

  const originalAnsweredCount = originalReceiptsByRound.size;
  let originalCorrectCount = 0;
  for (const r of originalReceiptsByRound.values()) {
    if (r.isCorrect === true) {
      originalCorrectCount++;
    }
  }

  if (originalAnsweredCount >= 3) {
    const accuracy = originalCorrectCount / originalAnsweredCount;
    if (accuracy >= 0.80) {
      earned.push({
        achievementCode: ACHIEVEMENT_CODES.STRONG_ACCURACY,
        amount: ACHIEVEMENT_AMOUNTS[ACHIEVEMENT_CODES.STRONG_ACCURACY],
        reasonLabel: ACHIEVEMENT_LABELS[ACHIEVEMENT_CODES.STRONG_ACCURACY],
      });
    }
  }

  // 3. Comeback (+2 Points)
  let comebackEarned = false;
  const missedSet = new Set(
    Array.isArray(player.missedRounds)
      ? player.missedRounds.filter((x) => typeof x === 'number' && Number.isInteger(x))
      : []
  );

  if (secondChanceOf && typeof secondChanceOf === 'object') {
    for (const [replayKey, origRoundVal] of Object.entries(secondChanceOf)) {
      const replayIndex = Number(replayKey);
      const originalRoundIndex = typeof origRoundVal === 'number' ? origRoundVal : Number(origRoundVal);

      if (!Number.isInteger(replayIndex) || !Number.isInteger(originalRoundIndex)) {
        continue;
      }

      if (missedSet.has(originalRoundIndex)) {
        const replayReceipt = receipts.find(
          (r) => r && r.roundIndex === replayIndex && r.serverConfirmed === true
        );
        if (replayReceipt && replayReceipt.isCorrect === true) {
          comebackEarned = true;
          break;
        }
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
  const hash = crypto
    .createHash('sha256')
    .update(`${roomId}:${studentId}:${achievementCode}`)
    .digest('hex');
  return `lca_${hash.slice(0, 32)}`;
}

export async function stageLiveChallengeAchievements(db, roomId, roomData, players = [], privateState = {}) {
  if (!roomData || !roomData.classId) {
    return { status: 'skipped', reason: 'missing_class_id', awardsCount: 0 };
  }

  const classId = roomData.classId;
  const classDocRef = db.collection('classes').doc(classId);
  const classSnap = await classDocRef.get();
  if (!classSnap.exists) {
    return { status: 'skipped', reason: 'class_not_found', awardsCount: 0 };
  }

  const classRecord = classSnap.data() || {};
  if (classRecord.archived === true || classRecord.isArchived === true) {
    return { status: 'skipped', reason: 'class_archived', awardsCount: 0 };
  }

  const scheduledRoundCount = typeof privateState.scheduledRoundCount === 'number'
    ? privateState.scheduledRoundCount
    : (Array.isArray(privateState.questionIds) ? privateState.questionIds.length : 0);

  const secondChanceOf = privateState.secondChanceOf || {};
  const plannedAwards = [];

  for (const player of players) {
    const studentId = player.studentId || player.id || player.userId;
    if (!studentId) continue;

    const gradeSnap = await db.collection('grades').doc(studentId).get();
    if (!gradeSnap.exists) continue;

    const gradeData = gradeSnap.data() || {};
    if (gradeData.classId !== classId) continue;

    const teacherOfRecord = classRecord.teacherOfRecord;
    if (teacherOfRecord && gradeData.assignedTeacherEmail && gradeData.assignedTeacherEmail !== teacherOfRecord) {
      continue;
    }

    const achievements = calculateStudentChallengeAchievements({
      player,
      scheduledRoundCount,
      secondChanceOf,
    });

    for (const ach of achievements) {
      plannedAwards.push({
        id: buildAchievementTransactionId(roomId, studentId, ach.achievementCode),
        roomId,
        classId,
        studentId,
        achievementCode: ach.achievementCode,
        amount: ach.amount,
        reasonLabel: ach.reasonLabel,
        processed: false,
      });
    }
  }

  const jobRef = db.collection(JOBS_COLLECTION).doc(roomId);
  await jobRef.set(
    {
      roomId,
      classId,
      scheduledRoundCount,
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
  if (!jobSnap.exists) return { status: 'completed', awardsProcessed: 0, unprocessedCount: 0 };

  const jobData = jobSnap.data() || {};
  const awards = jobData.awards || [];
  const unprocessed = awards.filter((a) => !a.processed);

  if (unprocessed.length === 0) {
    await jobRef.update({ status: 'completed', updatedAt: FieldValue.serverTimestamp() });
    return { status: 'completed', awardsProcessed: 0, unprocessedCount: 0 };
  }

  const classId = jobData.classId;
  const classDocRef = db.collection('classes').doc(classId);
  const classSnap = await classDocRef.get();
  if (!classSnap.exists) {
    await jobRef.update({ status: 'partially_failed', updatedAt: FieldValue.serverTimestamp() });
    return { status: 'partially_failed', awardsProcessed: 0, unprocessedCount: unprocessed.length };
  }
  const classRecord = classSnap.data() || {};

  let processedCount = 0;

  for (const award of unprocessed) {
    const { id: txId, studentId, amount, achievementCode, reasonLabel } = award;
    const studentClassId = award.classId || classId;

    const accDocId = accountId(studentId, studentClassId);
    const accountRef = db.collection('classPointAccounts').doc(accDocId);
    const ledgerTxRef = db.collection('classPointTransactions').doc(txId);

    try {
      await db.runTransaction(async (transaction) => {
        const existingTx = await transaction.get(ledgerTxRef);
        if (existingTx.exists) return;

        const accountSnap = await transaction.get(accountRef);
        const existingAccount = accountSnap.exists ? accountSnap.data() : null;
        const baseAccount = existingAccount || emptyAccount({ studentId, classId: studentClassId });

        const authContext = classPointsAuthorizationContext({
          classRecord,
          existingRecord: existingAccount,
        });

        const transactionData = {
          id: txId,
          schemaVersion: CLASS_POINTS_SCHEMA_VERSION,
          studentId,
          classId: studentClassId,
          amount,
          reasonCode: ACHIEVEMENT_REASON_CODE,
          reasonLabel,
          sourceType: ACHIEVEMENT_SOURCE_TYPE,
          isReversal: false,
          reversalOf: null,
          originTeacherEmail: authContext.originTeacherEmail || '',
          authorizedTeacherEmails: authContext.authorizedTeacherEmails || [],
          roomId,
          achievementCode,
          awardedBy: 'system',
          awardedByType: 'server',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        const nextAccount = applyTransaction(baseAccount, transactionData);

        const updatedAccountData = {
          ...nextAccount,
          originTeacherEmail: authContext.originTeacherEmail || nextAccount.originTeacherEmail || '',
          authorizedTeacherEmails: authContext.authorizedTeacherEmails || nextAccount.authorizedTeacherEmails || [],
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (!accountSnap.exists) {
          updatedAccountData.createdAt = FieldValue.serverTimestamp();
        }

        transaction.set(accountRef, updatedAccountData, { merge: true });
        transaction.set(ledgerTxRef, transactionData);
      });

      award.processed = true;
      processedCount++;
    } catch (err) {
      console.error(`[LiveChallengeClassPoints] Award write failed for ${txId}:`, err);
    }
  }

  const remaining = awards.filter((a) => !a.processed).length;
  const finalStatus = remaining === 0 ? 'completed' : 'partially_failed';

  await jobRef.update({
    awards,
    status: finalStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { status: finalStatus, awardsProcessed: processedCount, unprocessedCount: remaining };
}

export async function processLiveChallengeClassPoints(db, roomId, roomData, players = [], privateState = {}, status) {
  const isFinished = (status === 'finished') ||
    (typeof FINISHED !== 'undefined' && status === FINISHED) ||
    (typeof LIVE_CHALLENGE_STATUS !== 'undefined' && status === LIVE_CHALLENGE_STATUS.FINISHED);

  if (!isFinished) {
    return { status: 'skipped', reason: 'not_finished', awardsCount: 0 };
  }

  const stageResult = await stageLiveChallengeAchievements(db, roomId, roomData, players, privateState);
  if (stageResult.status === 'skipped') return stageResult;
  if (!stageResult.awards || stageResult.awards.length === 0) {
    return { status: 'completed', awardsCount: 0 };
  }

  const execResult = await executeLiveChallengeAchievementAwards(db, roomId);
  return {
    status: execResult.status,
    awardsCount: stageResult.awards.length,
    awardsProcessed: execResult.awardsProcessed,
  };
}

export async function retryPendingLiveChallengeAchievementJobs(db) {
  const pendingSnap = await db
    .collection(JOBS_COLLECTION)
    .where('status', 'in', ['pending', 'partially_failed'])
    .limit(20)
    .get();

  for (const doc of pendingSnap.docs) {
    await executeLiveChallengeAchievementAwards(db, doc.id);
  }
}

export async function cleanupStudentLiveChallengeAchievements(db, studentId) {
  if (!db || !studentId) return;
  const jobsSnap = await db.collection(JOBS_COLLECTION).get();
  if (jobsSnap.empty) return;

  const batch = db.batch();
  let ops = 0;

  for (const doc of jobsSnap.docs) {
    const data = doc.data() || {};
    const awards = data.awards || [];
    if (!Array.isArray(awards) || awards.length === 0) continue;

    const filtered = awards.filter((a) => a.studentId !== studentId);
    if (filtered.length !== awards.length) {
      if (filtered.length === 0 && data.status === 'completed') {
        batch.delete(doc.ref);
      } else {
        batch.update(doc.ref, {
          awards: filtered,
          awardsCount: filtered.length,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      ops++;
      if (ops >= 450) {
        await batch.commit();
        ops = 0;
      }
    }
  }

  if (ops > 0) await batch.commit();
}
