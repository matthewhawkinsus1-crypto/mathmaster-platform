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
import {
  DEFAULT_LIVE_CHALLENGE_REWARD_POLICY,
  DEFAULT_LIVE_CHALLENGE_REWARD_RULES,
  LEGACY_ACHIEVEMENT_RULE_ID,
  REWARD_KIND,
  criterionMet,
  evaluateRewardPolicy,
  storedRewardPolicy,
} from './liveChallengeRewardRules.mjs';
import { buildMatchResult, standingFromPlayer } from './liveChallengeResults.mjs';
import { REWARD_GRANTS_COLLECTION, buildRewardGrant } from './rewardGrants.mjs';

/*
 * LIVE CHALLENGE REWARD DELIVERY (server only).
 *
 * The rules decide WHO earned WHAT (liveChallengeRewardRules.mjs, pure). This
 * file delivers it, exactly once, from the durable final match result:
 *
 *   stage    evaluate the room's reward policy against the match result and
 *            record every planned award on liveChallengeAchievementJobs/{roomId}.
 *            Re-staging MERGES: an award already delivered stays delivered.
 *
 *   execute  deliver each undelivered award in its OWN transaction that
 *            (1) returns early if the award's deterministic document already
 *            exists, (2) re-checks the roster authorization, (3) writes the
 *            ledger credit or the item grant. Any number of concurrent or
 *            repeated executions deliver each award once.
 *
 * A roster check that fails is a business outcome ("this student is no longer
 * in that class"), recorded on the award as skipped — not a transient error to
 * retry forever. A transient failure is retried by the scheduled sweep up to
 * MAX_AWARD_ATTEMPTS times, then recorded as failed, so one stuck award can
 * never pin a job (and, through the sweep's limit, other jobs) indefinitely.
 */

// Rule ids of the original achievements, kept under their historical name.
export const ACHIEVEMENT_CODES = Object.freeze({
  FINISHER: LEGACY_ACHIEVEMENT_RULE_ID.FINISHER,
  STRONG_ACCURACY: LEGACY_ACHIEVEMENT_RULE_ID.STRONG_ACCURACY,
  COMEBACK: LEGACY_ACHIEVEMENT_RULE_ID.COMEBACK,
});

const defaultRule = (ruleId) => DEFAULT_LIVE_CHALLENGE_REWARD_RULES.find((rule) => rule.ruleId === ruleId);

export const ACHIEVEMENT_AMOUNTS = Object.freeze(Object.fromEntries(
  Object.values(ACHIEVEMENT_CODES).map((code) => [code, defaultRule(code).reward.amount]),
));

export const ACHIEVEMENT_LABELS = Object.freeze(Object.fromEntries(
  Object.values(ACHIEVEMENT_CODES).map((code) => [code, defaultRule(code).label]),
));

export const MAX_CHALLENGE_CLASS_POINTS = Object.values(ACHIEVEMENT_AMOUNTS).reduce((sum, amount) => sum + amount, 0);
export const JOBS_COLLECTION = 'liveChallengeAchievementJobs';
export { REWARD_GRANTS_COLLECTION };
export const ACHIEVEMENT_SOURCE_TYPE = SOURCE_TYPES?.LIVE_CHALLENGE_ACHIEVEMENT || 'liveChallengeAchievement';
export const ACHIEVEMENT_REASON_CODE = 'liveChallengeAchievement';
export const MAX_AWARD_ATTEMPTS = 8;

export const AWARD_OUTCOME = Object.freeze({
  AWARDED: 'awarded',
  ALREADY_AWARDED: 'alreadyAwarded',
  SKIPPED: 'skipped',
  FAILED: 'failed',
});

/**
 * The achievements the default policy awards one player, from their private
 * record. Kept for callers that reason about a single player; it evaluates the
 * SAME rules the delivery pipeline does, through the same standing shape.
 * Score, speed bonus, streak and rank never enter the default policy.
 */
export function calculateStudentChallengeAchievements(paramsOrPlayer, maybeScheduledRoundCount, maybeSecondChanceOf) {
  let player;
  let scheduledRoundCount;
  let secondChanceOf;
  if (paramsOrPlayer && typeof paramsOrPlayer === 'object' && ('player' in paramsOrPlayer || 'scheduledRoundCount' in paramsOrPlayer)) {
    ({ player, scheduledRoundCount, secondChanceOf } = paramsOrPlayer);
  } else {
    player = paramsOrPlayer;
    scheduledRoundCount = maybeScheduledRoundCount;
    secondChanceOf = maybeSecondChanceOf;
  }
  if (!player || player.joined !== true) return [];

  const standing = standingFromPlayer({ ...player, studentId: player.studentId || player.id || 'player' });
  const context = {
    scheduledRoundCount: typeof scheduledRoundCount === 'number' ? scheduledRoundCount : 0,
    secondChanceOf: secondChanceOf && typeof secondChanceOf === 'object' ? secondChanceOf : {},
  };
  return DEFAULT_LIVE_CHALLENGE_REWARD_RULES
    .filter((rule) => criterionMet(rule.criterion, standing, context))
    .map((rule) => ({
      achievementCode: rule.ruleId,
      amount: rule.reward.amount,
      reasonLabel: rule.label,
    }));
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * The Class Points ledger transaction id for one achievement. Unchanged from
 * the original implementation, so an award staged by earlier code and the same
 * award from this code are one transaction, never two.
 */
export function buildAchievementTransactionId(roomId, studentId, achievementCode) {
  return `lca_${sha256(`${roomId}\u0000${studentId}\u0000${achievementCode}`).slice(0, 32)}`;
}

/** The rewardGrants document id for one item award: a hash of its award identity. */
export function buildRewardGrantId(awardIdentity) {
  return `lcg_${sha256(String(awardIdentity || '')).slice(0, 40)}`;
}

const isArchivedClass = (classRecord = {}) => classRecord.status === 'archived'
  || classRecord.archived === true
  || classRecord.isArchived === true;

/**
 * Pure roster check from records already read. The class record is
 * authoritative for the teacher; the student's grade record must agree with
 * it and name the same class.
 */
export function rosterAuthorizationFromRecords({ classId, classExists = true, classRecord = null, gradeExists = true, gradeData = null } = {}) {
  if (!classId) return { valid: false, reason: 'missing_ids' };
  if (!classExists || !classRecord) return { valid: false, reason: 'class_not_found' };
  if (isArchivedClass(classRecord)) return { valid: false, reason: 'class_archived' };
  const teacherOfRecord = classRecord.teacherOfRecord;
  if (!teacherOfRecord || typeof teacherOfRecord !== 'string' || !teacherOfRecord.trim()) {
    return { valid: false, reason: 'missing_teacher_of_record' };
  }
  if (!gradeExists || !gradeData) return { valid: false, reason: 'grade_not_found' };
  if (gradeData.classId !== classId) return { valid: false, reason: 'grade_class_mismatch' };
  if (!gradeData.assignedTeacherEmail || gradeData.assignedTeacherEmail !== teacherOfRecord) {
    return { valid: false, reason: 'teacher_mismatch_or_missing' };
  }
  return { valid: true, classRecord, gradeData };
}

/**
 * Validates roster authorization for a student in a class.
 * Ensures class exists, is not archived, teacherOfRecord exists,
 * grades/{studentId} exists, grade.classId matches, and grade.assignedTeacherEmail matches teacherOfRecord.
 */
export async function validateRosterAuthorization(db, classId, studentId) {
  if (!classId || !studentId) return { valid: false, reason: 'missing_ids' };
  const classSnap = await db.collection('classes').doc(classId).get();
  if (!classSnap.exists) return { valid: false, reason: 'class_not_found' };
  const gradeSnap = await db.collection('grades').doc(studentId).get();
  return rosterAuthorizationFromRecords({
    classId,
    classExists: true,
    classRecord: classSnap.data() || {},
    gradeExists: gradeSnap.exists,
    gradeData: gradeSnap.exists ? (gradeSnap.data() || {}) : null,
  });
}

/** The class-level precondition for delivering any award from a match. */
async function classDeliveryPrecondition(db, classId) {
  if (!classId) return { ok: false, reason: 'missing_class_id' };
  const classSnap = await db.collection('classes').doc(classId).get();
  if (!classSnap.exists) return { ok: false, reason: 'class_not_found' };
  const classRecord = classSnap.data() || {};
  if (isArchivedClass(classRecord)) return { ok: false, reason: 'class_archived' };
  const teacherOfRecord = classRecord.teacherOfRecord;
  if (!teacherOfRecord || typeof teacherOfRecord !== 'string' || !teacherOfRecord.trim()) {
    return { ok: false, reason: 'missing_teacher_of_record' };
  }
  return { ok: true, classRecord };
}

/** The award records a match result produces under a policy. Pure apart from hashing. */
export function planLiveChallengeAwards({ matchResult, policy = DEFAULT_LIVE_CHALLENGE_REWARD_POLICY }) {
  const classId = matchResult?.classId || null;
  return evaluateRewardPolicy({ matchResult, policy: storedRewardPolicy(policy) }).map((award) => {
    const isPoints = award.reward.kind === REWARD_KIND.CLASS_POINTS;
    return {
      id: isPoints
        ? buildAchievementTransactionId(award.sourceId, award.studentId, award.ruleId)
        : buildRewardGrantId(award.identity),
      roomId: award.sourceId,
      classId,
      studentId: award.studentId,
      // Historical field name for the rule id; kept so existing job readers work.
      achievementCode: award.ruleId,
      ruleId: award.ruleId,
      ruleVersion: award.ruleVersion,
      identity: award.identity,
      rewardKind: award.reward.kind,
      amount: isPoints ? award.reward.amount : null,
      rewardCode: isPoints ? 'classPoints' : award.reward.rewardCode,
      badgeCode: isPoints ? null : (award.reward.badgeCode || null),
      rewardLabel: isPoints ? null : award.reward.label,
      expiresInDays: isPoints ? null : (award.reward.expiresInDays ?? null),
      reasonLabel: award.reasonLabel,
      processed: false,
      outcome: null,
      attempts: 0,
    };
  });
}

/*
 * Merge a freshly planned award list into what a job already recorded. An award
 * that was delivered, skipped or failed keeps that record; an award the plan no
 * longer produces is kept as history rather than silently dropped.
 */
export function mergeStagedAwards(existing = [], planned = []) {
  const byId = new Map((Array.isArray(existing) ? existing : []).filter((award) => award?.id).map((award) => [award.id, award]));
  const merged = planned.map((award) => {
    const prior = byId.get(award.id);
    byId.delete(award.id);
    if (!prior) return award;
    return {
      ...award,
      processed: prior.processed === true,
      outcome: prior.outcome ?? null,
      attempts: Math.max(0, Number(prior.attempts) || 0),
      ...(prior.processedAt ? { processedAt: prior.processedAt } : {}),
      ...(prior.skipReason ? { skipReason: prior.skipReason } : {}),
      ...(prior.lastError ? { lastError: prior.lastError } : {}),
    };
  });
  return [...merged, ...byId.values()];
}

export const JOB_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  // Every award processed, at least one of them failed for good.
  COMPLETED_WITH_FAILURES: 'completed_with_failures',
});

/*
 * The statuses the retry sweep selects. Only a job with an undelivered award
 * is retried; every processed outcome — delivered, skipped or failed — is
 * terminal. `partially_failed` is what the earlier implementation wrote for a
 * job that still had undelivered awards; the first run of this executor
 * relabels it.
 */
export const RETRYABLE_JOB_STATUSES = Object.freeze([JOB_STATUS.PENDING, 'partially_failed']);

export const jobStatusFor = (awards = []) => {
  const recorded = awards.filter(Boolean);
  if (recorded.some((award) => award.processed !== true)) return JOB_STATUS.PENDING;
  return recorded.some((award) => award.outcome === AWARD_OUTCOME.FAILED)
    ? JOB_STATUS.COMPLETED_WITH_FAILURES
    : JOB_STATUS.COMPLETED;
};

/**
 * Record the planned awards for a finished match. Idempotent and safe to run
 * concurrently: the job is read and merged inside one transaction.
 */
export async function stageLiveChallengeRewards(db, { matchResult, policy }) {
  const roomId = String(matchResult?.roomId || '');
  if (!roomId) return { status: 'skipped', reason: 'missing_room_id', awards: [] };
  if (matchResult.status !== 'finished') return { status: 'skipped', reason: 'not_finished', awards: [] };
  const precondition = await classDeliveryPrecondition(db, matchResult.classId);
  if (!precondition.ok) return { status: 'skipped', reason: precondition.reason, awards: [] };

  const planned = planLiveChallengeAwards({ matchResult, policy });
  const jobRef = db.collection(JOBS_COLLECTION).doc(roomId);
  const awards = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const existing = snapshot.exists ? (snapshot.data()?.awards || []) : [];
    const merged = mergeStagedAwards(existing, planned);
    transaction.set(jobRef, {
      roomId,
      classId: matchResult.classId,
      scheduledRoundCount: matchResult.scheduledRoundCount || 0,
      awardsCount: merged.length,
      awards: merged,
      studentIds: [...new Set(merged.map((award) => award.studentId).filter(Boolean))],
      status: jobStatusFor(merged),
      ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return merged;
  });
  return { status: 'staged', awards };
}

async function readRosterInTransaction(transaction, db, { classId, studentId }) {
  const [classSnap, gradeSnap] = await Promise.all([
    transaction.get(db.collection('classes').doc(classId)),
    transaction.get(db.collection('grades').doc(studentId)),
  ]);
  return rosterAuthorizationFromRecords({
    classId,
    classExists: classSnap.exists,
    classRecord: classSnap.exists ? (classSnap.data() || {}) : null,
    gradeExists: gradeSnap.exists,
    gradeData: gradeSnap.exists ? (gradeSnap.data() || {}) : null,
  });
}

/** Credit one Class Points award. Returns the outcome; never double-credits. */
async function deliverClassPointsAward(db, award) {
  const classId = award.classId;
  const studentId = award.studentId;
  const ledgerTxRef = db.collection('classPointTransactions').doc(award.id);
  const accountRef = db.collection('classPointAccounts').doc(accountId(studentId, classId));

  return db.runTransaction(async (transaction) => {
    const existingTx = await transaction.get(ledgerTxRef);
    if (existingTx.exists) return { outcome: AWARD_OUTCOME.ALREADY_AWARDED };

    // Re-checked immediately before the write, in the same transaction.
    const roster = await readRosterInTransaction(transaction, db, { classId, studentId });
    if (!roster.valid) return { outcome: AWARD_OUTCOME.SKIPPED, skipReason: roster.reason };

    const accountSnap = await transaction.get(accountRef);
    const existingAccount = accountSnap.exists ? accountSnap.data() : null;
    const baseAccount = existingAccount || emptyAccount({ studentId, classId });
    const authContext = classPointsAuthorizationContext({ classRecord: roster.classRecord, existingRecord: existingAccount });

    const transactionData = {
      schemaVersion: CLASS_POINTS_SCHEMA_VERSION,
      studentId,
      classId,
      amount: award.amount,
      reasonCode: ACHIEVEMENT_REASON_CODE,
      reasonLabel: award.reasonLabel,
      sourceType: ACHIEVEMENT_SOURCE_TYPE,
      isReversal: false,
      reversalOf: null,
      issuedByUid: null,
      issuedByEmail: null,
      originTeacherEmail: authContext.originTeacherEmail || '',
      authorizedTeacherEmails: authContext.authorizedTeacherEmails || [],
      roomId: award.roomId,
      achievementCode: award.achievementCode,
      ruleId: award.ruleId || award.achievementCode,
      ruleVersion: award.ruleVersion || 1,
      awardIdentity: award.identity || null,
      createdAt: FieldValue.serverTimestamp(),
    };
    const nextAccount = applyTransaction(baseAccount, transactionData);
    transaction.set(accountRef, {
      ...nextAccount,
      originTeacherEmail: authContext.originTeacherEmail || nextAccount.originTeacherEmail || '',
      authorizedTeacherEmails: authContext.authorizedTeacherEmails || nextAccount.authorizedTeacherEmails || [],
      updatedAt: FieldValue.serverTimestamp(),
      ...(accountSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    transaction.set(ledgerTxRef, {
      ...transactionData,
      id: award.id,
      awardedBy: 'system',
      awardedByType: 'server',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { outcome: AWARD_OUTCOME.AWARDED };
  });
}

/** Issue one item grant (a pass, a badge). Returns the outcome; never issues twice. */
async function deliverGrantAward(db, award, { nowMs = Date.now() } = {}) {
  const classId = award.classId;
  const studentId = award.studentId;
  const grantRef = db.collection(REWARD_GRANTS_COLLECTION).doc(award.id);

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(grantRef);
    if (existing.exists) return { outcome: AWARD_OUTCOME.ALREADY_AWARDED };

    const roster = await readRosterInTransaction(transaction, db, { classId, studentId });
    if (!roster.valid) return { outcome: AWARD_OUTCOME.SKIPPED, skipReason: roster.reason };

    const authContext = classPointsAuthorizationContext({ classRecord: roster.classRecord, existingRecord: null });
    const awardedAt = new Date(nowMs).toISOString();
    const days = Number(award.expiresInDays);
    const expiresAt = Number.isInteger(days) && days > 0 ? new Date(nowMs + days * 86400000).toISOString() : null;
    transaction.set(grantRef, {
      ...buildRewardGrant({
        grantId: award.id,
        rewardCode: award.rewardCode,
        badgeCode: award.badgeCode,
        label: award.rewardLabel,
        studentId,
        classId,
        source: {
          type: 'liveChallenge',
          id: award.roomId,
          ruleId: award.ruleId,
          ruleVersion: award.ruleVersion,
          identity: award.identity,
        },
        awardedAt,
        expiresAt,
        originTeacherEmail: authContext.originTeacherEmail,
        authorizedTeacherEmails: authContext.authorizedTeacherEmails,
      }),
      reasonLabel: award.reasonLabel,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { outcome: AWARD_OUTCOME.AWARDED };
  });
}

/**
 * Deliver every undelivered award on a job. Safe to run concurrently with
 * another executor or a recovery sweep: each delivery is idempotent, and the
 * job's bookkeeping is merged inside a transaction so a slower executor can
 * never mark a delivered award as undelivered again.
 */
export async function executeLiveChallengeAchievementAwards(db, roomId, { maxAttempts = MAX_AWARD_ATTEMPTS } = {}) {
  const jobRef = db.collection(JOBS_COLLECTION).doc(roomId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return { status: 'completed', awardsProcessed: 0, unprocessedCount: 0 };

  const awards = Array.isArray(jobSnap.data()?.awards) ? jobSnap.data().awards : [];
  const updates = new Map();
  let processedCount = 0;

  for (const award of awards.filter((entry) => entry && entry.processed !== true)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = award.rewardKind === REWARD_KIND.GRANT
        ? await deliverGrantAward(db, award)
        : await deliverClassPointsAward(db, award);
      updates.set(award.id, {
        processed: true,
        outcome: result.outcome,
        processedAt: new Date().toISOString(),
        ...(result.skipReason ? { skipReason: result.skipReason } : {}),
      });
      if (result.skipReason) {
        console.warn(`[LiveChallengeRewards] Award ${award.id} skipped (${result.skipReason}).`);
      }
      processedCount += 1;
    } catch (error) {
      const attempts = Math.max(0, Number(award.attempts) || 0) + 1;
      console.error(`[LiveChallengeRewards] Award delivery failed for ${award.id}:`, error);
      updates.set(award.id, attempts >= maxAttempts
        ? { processed: true, outcome: AWARD_OUTCOME.FAILED, attempts, lastError: String(error?.message || error).slice(0, 300) }
        : { attempts, lastError: String(error?.message || error).slice(0, 300) });
    }
  }

  const finalAwards = await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(jobRef);
    // Deleted during this run (permanent student deletion removes a job whose
    // every award was that student's): writing it back would recreate it,
    // without the studentIds a later deletion searches by.
    if (!latest.exists) return null;
    const current = Array.isArray(latest.data()?.awards) ? latest.data().awards : [];
    const merged = current.map((award) => {
      const update = updates.get(award?.id);
      if (!update) return award;
      // Once processed (delivered, skipped or failed — or processed by the
      // earlier implementation, which recorded no outcome) always processed.
      if (award.processed === true) return award;
      return { ...award, ...update };
    });
    transaction.set(jobRef, {
      awards: merged,
      status: jobStatusFor(merged),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return merged;
  });
  // Like a job that was never there: nothing is left to deliver.
  if (!finalAwards) return { status: JOB_STATUS.COMPLETED, awardsProcessed: processedCount, unprocessedCount: 0 };

  const remaining = finalAwards.filter((award) => award.processed !== true).length;
  return { status: jobStatusFor(finalAwards), awardsProcessed: processedCount, unprocessedCount: remaining };
}

/**
 * Deliver a finished match's rewards: stage from the durable match result,
 * then execute. The only entry point new code should call.
 */
export async function processLiveChallengeMatchRewards(db, { matchResult, policy = null } = {}) {
  const staged = await stageLiveChallengeRewards(db, { matchResult, policy });
  if (staged.status === 'skipped') return { status: 'skipped', reason: staged.reason, awardsCount: 0 };
  if (!staged.awards.length) return { status: 'completed', awardsCount: 0 };
  const executed = await executeLiveChallengeAchievementAwards(db, matchResult.roomId);
  return {
    status: executed.status,
    awardsCount: staged.awards.length,
    awardsProcessed: executed.awardsProcessed,
    unprocessedCount: executed.unprocessedCount,
  };
}

/**
 * The original entry point, for rooms finished before match results existed
 * (and flagged classPointsRecoveryPending). It builds the same match result
 * the new finalization writes and delivers through the same pipeline.
 */
export async function processLiveChallengeClassPoints(db, roomId, roomData, players = [], privateState = {}, status) {
  if (status !== 'finished') return { status: 'skipped', reason: 'not_finished', awardsCount: 0 };
  const matchResult = buildMatchResult({ roomId, room: roomData || {}, privateState: privateState || {}, players, status });
  return processLiveChallengeMatchRewards(db, { matchResult, policy: privateState?.rewardPolicy || null });
}

/**
 * Background retry for jobs with undelivered awards. Terminal outcomes
 * (delivered, skipped, failed after MAX_AWARD_ATTEMPTS) take a job out of this
 * query, so a permanently undeliverable award cannot occupy a slot forever.
 */
export async function retryPendingLiveChallengeAchievementJobs(db) {
  const pendingSnap = await db
    .collection(JOBS_COLLECTION)
    .where('status', 'in', [...RETRYABLE_JOB_STATUSES])
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
      console.error(`[LiveChallengeRewards] Retry failed for job ${doc.id}:`, error);
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
