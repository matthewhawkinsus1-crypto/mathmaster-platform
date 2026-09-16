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

/**
 * Pure policy calculator using authoritative Challenge private state.
 * Score, streak, speed bonus, and rank are completely ignored.
 *
 * @param {Object} params
 * @param {Object} params.player - Authoritative private player state
 * @param {number} params.scheduledRoundCount - Total original scheduled rounds
 * @param {Object} [params.secondChanceOf] - Map: replayRoundIndex -> originalRoundIndex
 */
export function calculateStudentChallengeAchievements(paramsOrPlayer, maybeScheduledRoundCount, maybeSecondChanceOf) {
  let player, scheduledRoundCount, secondChanceOf;
  if (paramsOrPlayer && typeof paramsOrPlayer === 'object' && ('player' in paramsOrPlayer || 'scheduledRoundCount' in paramsOrPlayer)) {
    player = paramsOrPlayer.player;
    scheduledRoundCount = paramsOrPlayer.scheduledRoundCount;
    secondChanceOf = paramsOrPlayer.secondChanceOf;
  } else {
    player = paramsOrPlayer;
    scheduledRoundCount = maybeScheduledRoundCount;
    secondChanceOf = maybeSecondChanceOf;
  }

  // 1. Must have actually joined
  if (!player || player.joined !== true) {
    return [];
  }

  const roundCount = typeof scheduledRoundCount === 'number' ? scheduledRoundCount : 0;
  const earned = [];

  const rawReceipts = player.submissionReceipts;
  const receipts = rawReceipts
    ? (Array.isArray(rawReceipts) ? rawReceipts : Object.values(rawReceipts))
    : [];

  // -------------------------------------------------------------
  // 1. Challenge Finisher (+2 Points)
  // -------------------------------------------------------------
  const joinedAt = typeof player.joinedAtRound === 'number' ? Math.max(0, player.joinedAtRound) : 0;
  const availableScheduledRounds = Math.max(0, roundCount - joinedAt);

  if (availableScheduledRounds >= 2) {
    const answeredList = Array.isArray(player.answeredRounds) ? player.answeredRounds : [];
    // Count only scheduled round indices: joinedAt <= idx < scheduledRoundCount
    // Replay rounds (index >= scheduledRoundCount) are excluded from numerator and denominator
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

  // -------------------------------------------------------------
  // 2. Strong Accuracy (+3 Points)
  // -------------------------------------------------------------
  // Original scheduled round indices only: 0 .. scheduledRoundCount - 1
  // Use serverConfirmed receipts; replays excluded
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

  // -------------------------------------------------------------
  // 3. Comeback (+2 Points)
  // -------------------------------------------------------------
  // Round 0 is a valid original round index. Explicit numeric validation.
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

/**
 * Deterministic safe document ID using sha256 hash.
 */
export function buildAchievementTransactionId(roomId, studentId, achievementCode) {
  const hash = crypto
    .createHash('sha256')
    .update(`${roomId}\u0000${studentId}\u0000${achievementCode}`)
    .digest('hex');
  return `lca_${hash.slice(0, 32)}`;
}

/**
 * Validates roster authorization for a student in a class.
 * Ensures class exists, is not archived, teacherOfRecord exists,
 * grades/{studentId} exists, grade.classId matches, and grade.assignedTeacherEmail matches teacherOfRecord.
 */
export async function validateRosterAuthorization(db, classId, studentId) {
  if (!classId || !studentId) {
    return { valid: false, reason: 'missing_ids' };
  }

  const classSnap = await db.collection('classes').doc(classId).get();
  if (!classSnap.exists) {
    return { valid: false, reason: 'class_not_found' };
  }

  const classRecord = classSnap.data() || {};
  if (classRecord.status === 'archived' || classRecord.archived === true || classRecord.isArchived === true) {
    return { valid: false, reason: 'class_archived' };
  }

  const teacherOfRecord = classRecord.teacherOfRecord;
  if (!teacherOfRecord || typeof teacherOfRecord !== 'string' || !teacherOfRecord.trim()) {
    return { valid: false, reason: 'missing_teacher_of_record' };
  }

  const gradeSnap = await db.collection('grades').doc(studentId).get();
  if (!gradeSnap.exists) {
    return { valid: false, reason: 'grade_not_found' };
  }

  const gradeData = gradeSnap.data() || {};
  if (gradeData.classId !== classId) {
    return { valid: false, reason: 'grade_class_mismatch' };
  }

  if (!gradeData.assignedTeacherEmail || gradeData.assignedTeacherEmail !== teacherOfRecord) {
    return { valid: false, reason: 'teacher_mismatch_or_missing' };
  }

  return { valid: true, classRecord, gradeData };
}

/**
 * Stages achievement awards durably into liveChallengeAchievementJobs/{roomId}.
 */
export async function stageLiveChallengeAchievements(db, roomId, roomData, players = [], privateState = {}) {
  if (!roomData || !roomData.classId) {
    return { status: 'skipped', reason: 'missing_class_id', awardsCount: 0 };
  }

  const classId = roomData.classId;
  const classSnap = await db.collection('classes').doc(classId).get();
  if (!classSnap.exists) {
    return { status: 'skipped', reason: 'class_not_found', awardsCount: 0 };
  }

  const classRecord = classSnap.data() || {};
  if (classRecord.status === 'archived' || classRecord.archived === true || classRecord.isArchived === true) {
    return { status: 'skipped', reason: 'class_archived', awardsCount: 0 };
  }

  const teacherOfRecord = classRecord.teacherOfRecord;
  if (!teacherOfRecord || typeof teacherOfRecord !== 'string' || !teacherOfRecord.trim()) {
    return { status: 'skipped', reason: 'missing_teacher_of_record', awardsCount: 0 };
  }

  const scheduledRoundCount = typeof privateState.scheduledRoundCount === 'number'
    ? privateState.scheduledRoundCount
    : (Array.isArray(privateState.questionIds) ? privateState.questionIds.length : 0);

  const secondChanceOf = privateState.secondChanceOf || {};
  const plannedAwards = [];

  for (const player of players) {
    const studentId = player.studentId || player.id || player.userId;
    if (!studentId) continue;

    const authCheck = await validateRosterAuthorization(db, classId, studentId);
    if (!authCheck.valid) {
      console.warn(`[LiveChallengeClassPoints] Student ${studentId} roster authorization failed (${authCheck.reason}). Skipping.`);
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
      studentIds: [...new Set(plannedAwards.map((award) => award.studentId))],
      status: plannedAwards.length === 0 ? 'completed' : 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { status: 'staged', awards: plannedAwards };
}

/**
 * Atomically executes awards from the durable job record into top-level collections.
 */
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
  let processedCount = 0;

  for (const award of unprocessed) {
    const { id: txId, studentId, amount, achievementCode, reasonLabel } = award;
    const studentClassId = award.classId || classId;

    // Requirement 5: Recheck roster authorization immediately before writing award
    const authCheck = await validateRosterAuthorization(db, studentClassId, studentId);
    if (!authCheck.valid) {
      console.warn(`[LiveChallengeClassPoints] Award ${txId} execution skipped due to invalid roster authorization (${authCheck.reason})`);
      continue;
    }

    const classRecord = authCheck.classRecord;
    const accDocId = accountId(studentId, studentClassId);
    const accountRef = db.collection('classPointAccounts').doc(accDocId);
    const ledgerTxRef = db.collection('classPointTransactions').doc(txId);

    try {
      await db.runTransaction(async (transaction) => {
        const existingTx = await transaction.get(ledgerTxRef);
        if (existingTx.exists) return; // Idempotent skip

        const accountSnap = await transaction.get(accountRef);
        const existingAccount = accountSnap.exists ? accountSnap.data() : null;
        const baseAccount = existingAccount || emptyAccount({ studentId, classId: studentClassId });

        const authContext = classPointsAuthorizationContext({
          classRecord,
          existingRecord: existingAccount,
        });

        const transactionData = {
          schemaVersion: CLASS_POINTS_SCHEMA_VERSION,
          studentId,
          classId: studentClassId,
          amount,
          reasonCode: ACHIEVEMENT_REASON_CODE,
          reasonLabel,
          sourceType: ACHIEVEMENT_SOURCE_TYPE,
          isReversal: false,
          reversalOf: null,
          issuedByUid: null,
          issuedByEmail: null,
          originTeacherEmail: authContext.originTeacherEmail || '',
          authorizedTeacherEmails: authContext.authorizedTeacherEmails || [],
          roomId,
          achievementCode,
          createdAt: FieldValue.serverTimestamp(),
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
        transaction.set(ledgerTxRef, {
          ...transactionData,
          id: txId,
          awardedBy: 'system',
          awardedByType: 'server',
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      award.processed = true;
      processedCount++;
    } catch (err) {
      console.error(`[LiveChallengeClassPoints] Award write failed for ${txId}:`, err);
    }
  }

  const remaining = awards.filter((a) => !a.processed).length;
  const isDone = remaining === 0;
  const finalStatus = isDone ? 'completed' : 'partially_failed';

  await jobRef.update({
    awards,
    status: finalStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { status: finalStatus, awardsProcessed: processedCount, unprocessedCount: remaining };
}

/**
 * Main coordinator called from finishLiveChallengeRoom.
 */
export async function processLiveChallengeClassPoints(db, roomId, roomData, players = [], privateState = {}, status) {
  if (status !== 'finished') {
    return { status: 'skipped', reason: 'not_finished', awardsCount: 0 };
  }

  const stageResult = await stageLiveChallengeAchievements(db, roomId, roomData, players, privateState);
  if (stageResult.status === 'skipped') {
    return stageResult;
  }
  if (!stageResult.awards || stageResult.awards.length === 0) {
    return { status: 'completed', awardsCount: 0 };
  }

  const execResult = await executeLiveChallengeAchievementAwards(db, roomId);
  return {
    status: execResult.status,
    awardsCount: stageResult.awards.length,
    awardsProcessed: execResult.awardsProcessed,
    unprocessedCount: execResult.unprocessedCount,
  };
}

/**
 * Background retry reconciler for pending/partially_failed jobs.
 */
export async function retryPendingLiveChallengeAchievementJobs(db) {
  const pendingSnap = await db
    .collection(JOBS_COLLECTION)
    .where('status', 'in', ['pending', 'partially_failed'])
    .limit(20)
    .get();

  let completed = 0;
  let failed = 0;
  for (const doc of pendingSnap.docs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await executeLiveChallengeAchievementAwards(db, doc.id);
      if (result.status === 'completed') completed += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      console.error(`[LiveChallengeClassPoints] Retry failed for job ${doc.id}:`, error);
    }
  }
  return { scanned: pendingSnap.size, completed, failed };
}

/**
 * Permanent student deletion lifecycle hook with safe batch renewal.
 */
export async function cleanupStudentLiveChallengeAchievements(db, studentId) {
  if (!db || !studentId) return { jobsUpdated: 0, jobsDeleted: 0 };

  const jobsSnap = await db.collection(JOBS_COLLECTION)
    .where('studentIds', 'array-contains', studentId)
    .get();
  if (jobsSnap.empty) return { jobsUpdated: 0, jobsDeleted: 0 };

  let batch = db.batch();
  let ops = 0;
  let jobsUpdated = 0;
  let jobsDeleted = 0;

  for (const doc of jobsSnap.docs) {
    const data = doc.data() || {};
    const awards = Array.isArray(data.awards) ? data.awards : [];
    const filtered = awards.filter((award) => award.studentId !== studentId);
    if (filtered.length === awards.length) continue;

    if (filtered.length === 0) {
      batch.delete(doc.ref);
      jobsDeleted += 1;
    } else {
      batch.update(doc.ref, {
        awards: filtered,
        awardsCount: filtered.length,
        studentIds: [...new Set(filtered.map((award) => award.studentId).filter(Boolean))],
        updatedAt: FieldValue.serverTimestamp(),
      });
      jobsUpdated += 1;
    }

    ops += 1;
    if (ops >= 450) {
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  return { jobsUpdated, jobsDeleted };
}
