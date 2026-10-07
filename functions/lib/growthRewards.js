"use strict";

/*
 * GROWTH REWARD DELIVERY (server only).
 *
 * functions/shared/growthRewardRules.mjs decides, from a student's own
 * authoritative records, which growth, effort and mastery awards they have
 * earned. This file reads those records and delivers each award exactly once,
 * the same way Live Challenge rewards are delivered
 * (functions/shared/liveChallengeClassPoints.mjs deliverClassPointsAward /
 * deliverGrantAward): every award has a deterministic document id, and each is
 * written in its OWN transaction that
 *
 *   1. returns "already delivered" if that document exists,
 *   2. re-reads the class and the student's grade record and re-checks the
 *      roster (class exists, not archived, teacher of record agrees, student
 *      still in the class, account not disabled),
 *   3. writes the ledger credit + account projection, or the badge grant.
 *
 * Any number of repeated or concurrent syncs therefore deliver each award once.
 *
 * There is no job document and no trigger: the records the rules read change
 * in many places (test release, corrections, Path sessions, mastery
 * evidence), and wiring a delivery into each writer would spread reward logic
 * through grading code. Instead the student's app asks for a sync
 * (useGrowthRewardSync) and the server re-derives everything. Because the
 * award ids are deterministic, a sync that runs late pays exactly what an
 * immediate one would have.
 *
 * Every read is bounded: at most MAX_TEST_CYCLE_RECORDS records, one
 * assignment per record, at most WEEK_LOOKBACK snapshot ids, the Path sessions
 * of those weeks, one mastery profile and one state document.
 */

const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

const TEST_CYCLE_RECORDS = "testCycleRecords";
const WEEKLY_PATH_GOAL_SNAPSHOTS = "weeklyPathGoalSnapshots";
const PATH_SESSIONS = "pathSessions";
const MASTERY_PROFILES = "studentMasteryProfiles";
const LEDGER = "classPointTransactions";
const ACCOUNTS = "classPointAccounts";
// growthRewardState/{studentId}: server-only (no client rule matches it, so
// the catch-all denies every client). Holds the mastery baseline and the time
// of the last sync, nothing a student or teacher needs to read.
const GROWTH_STATE = "growthRewardState";

const MAX_TEST_CYCLE_RECORDS = 200;
// A year of weekly goals. Older weeks are settled: anything they earned was
// paid by an earlier sync (see the streak's run-start check for the edge).
const WEEK_LOOKBACK = 52;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_QUERY = 300;
const FIRESTORE_IN_LIMIT = 30;
// A student opening MathMaster in three tabs at once should cost one sync.
const SYNC_THROTTLE_MS = 60 * 1000;

let modulesPromise = null;
function growthModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("../shared/growthRewardRules.mjs"),
      import("../shared/classPoints.mjs"),
      import("../shared/rewardGrants.mjs"),
      import("../shared/weeklyPathGrade.mjs"),
      import("../shared/liveChallengeClassPoints.mjs"),
    ]).then(([rules, classPoints, rewardGrants, weeklyPath, delivery]) => ({
      rules, classPoints, rewardGrants, weeklyPath, delivery,
    }));
  }
  return modulesPromise;
}

const chunk = (values, size) => {
  const out = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
};

/*
 * The roster, as Live Challenge delivery reads it, plus one fact it does not
 * need: a disabled student account earns nothing new. Used both for the
 * up-front check and inside every delivery transaction.
 */
function rosterFromSnapshots(modules, { classId, classSnap, gradeSnap }) {
  const gradeData = gradeSnap.exists ? (gradeSnap.data() || {}) : null;
  if (gradeData && gradeData.status === "disabled") return { valid: false, reason: "student_disabled" };
  return modules.delivery.rosterAuthorizationFromRecords({
    classId,
    classExists: classSnap.exists,
    classRecord: classSnap.exists ? (classSnap.data() || {}) : null,
    gradeExists: gradeSnap.exists,
    gradeData,
  });
}

async function readRosterInTransaction(transaction, db, modules, { classId, studentId }) {
  const [classSnap, gradeSnap] = await Promise.all([
    transaction.get(db.collection("classes").doc(classId)),
    transaction.get(db.collection("grades").doc(studentId)),
  ]);
  return rosterFromSnapshots(modules, { classId, classSnap, gradeSnap });
}

/** Credit one growth award to the Class Points ledger. Never credits twice. */
async function deliverGrowthPoints(db, modules, award) {
  const { classPoints } = modules;
  const { classId, studentId } = award;
  const ledgerRef = db.collection(LEDGER).doc(award.id);
  const accountRef = db.collection(ACCOUNTS).doc(classPoints.accountId(studentId, classId));

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ledgerRef);
    if (existing.exists) return { outcome: "alreadyDelivered" };

    // Re-checked immediately before the write, in the same transaction.
    const roster = await readRosterInTransaction(transaction, db, modules, { classId, studentId });
    if (!roster.valid) return { outcome: "skipped", reason: roster.reason };

    const accountSnap = await transaction.get(accountRef);
    const existingAccount = accountSnap.exists ? accountSnap.data() : null;
    const baseAccount = existingAccount || classPoints.emptyAccount({ studentId, classId });
    const authContext = classPoints.classPointsAuthorizationContext({ classRecord: roster.classRecord, existingRecord: existingAccount });

    const transactionData = {
      schemaVersion: classPoints.CLASS_POINTS_SCHEMA_VERSION,
      studentId,
      classId,
      amount: award.amount,
      reasonCode: "growthReward",
      reasonLabel: award.reasonLabel,
      sourceType: classPoints.SOURCE_TYPES.GROWTH_REWARD,
      isReversal: false,
      reversalOf: null,
      issuedByUid: null,
      issuedByEmail: null,
      originTeacherEmail: authContext.originTeacherEmail || "",
      authorizedTeacherEmails: authContext.authorizedTeacherEmails || [],
      ruleId: award.ruleId,
      ruleVersion: award.ruleVersion,
      growthSourceId: award.sourceId,
      awardIdentity: award.identity,
      createdAt: FieldValue.serverTimestamp(),
    };
    const nextAccount = classPoints.applyTransaction(baseAccount, transactionData);
    transaction.set(accountRef, {
      ...nextAccount,
      originTeacherEmail: authContext.originTeacherEmail || nextAccount.originTeacherEmail || "",
      authorizedTeacherEmails: authContext.authorizedTeacherEmails || nextAccount.authorizedTeacherEmails || [],
      updatedAt: FieldValue.serverTimestamp(),
      ...(accountSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    transaction.set(ledgerRef, {
      ...transactionData,
      id: award.id,
      awardedBy: "system",
      awardedByType: "server",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { outcome: "delivered" };
  });
}

/** Issue one growth badge as a reward grant. Never issues twice. */
async function deliverGrowthBadge(db, modules, award, nowMs) {
  const { rewardGrants, classPoints } = modules;
  const { classId, studentId } = award;
  const grantRef = db.collection(rewardGrants.REWARD_GRANTS_COLLECTION).doc(award.id);

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(grantRef);
    if (existing.exists) return { outcome: "alreadyDelivered" };

    const roster = await readRosterInTransaction(transaction, db, modules, { classId, studentId });
    if (!roster.valid) return { outcome: "skipped", reason: roster.reason };

    const authContext = classPoints.classPointsAuthorizationContext({ classRecord: roster.classRecord, existingRecord: null });
    transaction.set(grantRef, {
      ...rewardGrants.buildRewardGrant({
        grantId: award.id,
        rewardCode: "badge",
        badgeCode: award.badgeCode,
        label: award.label,
        studentId,
        classId,
        source: {
          type: rewardGrants.REWARD_SOURCE.GROWTH,
          id: award.sourceId,
          ruleId: award.ruleId,
          ruleVersion: award.ruleVersion,
          identity: award.identity,
        },
        awardedAt: new Date(nowMs).toISOString(),
        originTeacherEmail: authContext.originTeacherEmail,
        authorizedTeacherEmails: authContext.authorizedTeacherEmails,
      }),
      reasonLabel: award.reasonLabel,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { outcome: "delivered" };
  });
}

const deliverOne = (db, modules, award, nowMs) => (award.kind === "classPoints"
  ? deliverGrowthPoints(db, modules, award)
  : deliverGrowthBadge(db, modules, award, nowMs));

/**
 * Deliver one award produced by the rules — the same transaction a sync uses.
 * Exported so the in-transaction roster re-check can be tested for a roster
 * that changes after the award was evaluated. Returns { outcome, reason? }.
 */
async function deliverGrowthAward(db, award, { nowMs = Date.now() } = {}) {
  return deliverOne(db, await growthModules(), award, nowMs);
}

/** The student's Test Cycle records that could hold a growth event, with their assignments. */
async function loadTestCycles(db, studentId) {
  const snapshot = await db.collection(TEST_CYCLE_RECORDS)
    .where("studentId", "==", studentId)
    .limit(MAX_TEST_CYCLE_RECORDS)
    .get();
  const records = snapshot.docs.map((entry) => entry.data() || {}).filter((record) => (
    record.retest?.state === "released"
    || record.test?.state === "released"
    || record.corrections?.complete === true
  ));
  const assignmentIds = [...new Set(records.map((record) => String(record.assignmentId || "").trim()).filter(Boolean))];
  const assignments = new Map();
  for (const ids of chunk(assignmentIds, 100)) {
    // eslint-disable-next-line no-await-in-loop
    const docs = await db.getAll(...ids.map((id) => db.collection("assignments").doc(id)));
    docs.forEach((entry) => { if (entry.exists) assignments.set(entry.id, entry.data() || {}); });
  }
  return records
    .filter((record) => assignments.has(String(record.assignmentId || "").trim()))
    .map((record) => ({ record, assignment: assignments.get(String(record.assignmentId).trim()) }));
}

/** This student's weekly goals since the rewards began (at most a year), and the Path sessions of those weeks. */
async function loadWeeklyPath(db, modules, studentId, nowMs) {
  const { weekKeyFor } = modules.weeklyPath;
  const startWeekKey = weekKeyFor(modules.rules.GROWTH_REWARDS_START_MS);
  const lookbackWeekKey = weekKeyFor(nowMs - (WEEK_LOOKBACK - 1) * WEEK_MS);
  const windowStartWeekKey = lookbackWeekKey > startWeekKey ? lookbackWeekKey : startWeekKey;
  const currentWeekKey = weekKeyFor(nowMs);
  const weekKeys = [];
  for (let at = Date.parse(`${windowStartWeekKey}T00:00:00Z`); weekKeyFor(at) <= currentWeekKey; at += WEEK_MS) {
    weekKeys.push(weekKeyFor(at));
  }
  if (!weekKeys.length) return { goals: [], completions: [], windowStartWeekKey, paidStreakWeeks: [] };

  // Snapshot ids are deterministic, so this is a bounded getAll, not a query.
  const goalDocs = await db.getAll(...weekKeys.map((weekKey) => db.collection(WEEKLY_PATH_GOAL_SNAPSHOTS).doc(`${studentId}__${weekKey}`)));
  const goals = goalDocs.filter((entry) => entry.exists).map((entry) => entry.data() || {})
    .filter((goal) => String(goal.studentId || studentId) === studentId);
  if (!goals.length) return { goals, completions: [], windowStartWeekKey, paidStreakWeeks: [] };
  const paidStreakWeeks = await loadPaidStreakWeeks(db, modules, { studentId, goals, windowStartWeekKey, startWeekKey });

  // Every assigned weekly session carries weekKey (startPathSession requires
  // it with weeklySlotKey), so the student's sessions for these weeks are two
  // equality filters — served by Firestore's built-in single-field indexes,
  // with no composite index to deploy.
  const completions = [];
  for (const keys of chunk(goals.map((goal) => goal.weekKey).filter(Boolean), FIRESTORE_IN_LIMIT)) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(PATH_SESSIONS)
      .where("studentId", "==", studentId)
      .where("weekKey", "in", keys)
      .limit(MAX_SESSIONS_PER_QUERY)
      .get();
    snapshot.docs.forEach((entry) => {
      const session = entry.data() || {};
      if (session.status !== "completed") return;
      completions.push({
        status: "completed",
        sessionId: entry.id,
        completedAt: Number(session.completedAt || session.updatedAt || 0),
        weekKey: session.weekKey || null,
        weeklySlotKey: session.weeklySlotKey || null,
        assessmentFramework: session.assessmentFramework || null,
      });
    });
  }
  return { goals, completions, windowStartWeekKey, paidStreakWeeks };
}

/*
 * Once the one-year window has moved past the start date, a run of goal weeks
 * that begins at the window's first week may have begun earlier, out of
 * sight. The streak blocks already paid inside that run fix where its blocks
 * fall (see evaluateWeeklyPathGrowth), so read which of its weeks already
 * hold a streak award. Only the unbroken stretch of goal weeks from the
 * window's first week can be such a run, so only those ids are read; in the
 * first year nothing is read at all.
 */
async function loadPaidStreakWeeks(db, modules, { studentId, goals, windowStartWeekKey, startWeekKey }) {
  if (!(windowStartWeekKey > startWeekKey)) return [];
  const { weekKeyFor } = modules.weeklyPath;
  const { rules, rewardGrants } = modules;
  const goalWeeks = new Set(goals.map((goal) => goal.weekKey));
  const edgeWeeks = [];
  for (let at = Date.parse(`${windowStartWeekKey}T00:00:00Z`); goalWeeks.has(weekKeyFor(at)); at += WEEK_MS) {
    edgeWeeks.push(weekKeyFor(at));
  }
  if (!edgeWeeks.length) return [];
  const identities = edgeWeeks.map((weekKey) => rules.growthAwardIdentity({
    studentId, ruleId: rules.GROWTH_RULE_IDS.WEEKLY_PATH_STREAK, sourceId: weekKey,
  }));
  // The points and the badge share one identity; either one in place means
  // the block was delivered.
  const docs = await db.getAll(
    ...identities.map((identity) => db.collection(LEDGER).doc(rules.growthLedgerTransactionId(identity))),
    ...identities.map((identity) => db.collection(rewardGrants.REWARD_GRANTS_COLLECTION).doc(rules.growthGrantId(identity))),
  );
  return edgeWeeks.filter((weekKey, index) => docs[index].exists || docs[index + edgeWeeks.length].exists);
}

/** The mastery profile and its baseline, creating the baseline on the first sync (see masteryBaselineFor). */
async function loadMastery(db, modules, studentId, nowMs) {
  const profileRef = db.collection(MASTERY_PROFILES).doc(studentId);
  const stateRef = db.collection(GROWTH_STATE).doc(studentId);
  return db.runTransaction(async (transaction) => {
    const [profileSnap, stateSnap] = await Promise.all([transaction.get(profileRef), transaction.get(stateRef)]);
    const masteryProfile = profileSnap.exists ? (profileSnap.data() || {}) : null;
    const stored = stateSnap.exists ? stateSnap.data()?.masteryBaseline : null;
    if (stored && Array.isArray(stored.skills)) return { masteryProfile, masteryBaseline: stored };
    const masteryBaseline = modules.rules.masteryBaselineFor(masteryProfile || {}, nowMs);
    transaction.set(stateRef, { studentId, masteryBaseline, updatedAt: nowMs }, { merge: true });
    return { masteryProfile, masteryBaseline };
  });
}

const publicAward = (award) => ({
  id: award.id,
  kind: award.kind,
  ruleId: award.ruleId,
  sourceId: award.sourceId,
  reasonLabel: award.reasonLabel,
  ...(award.kind === "classPoints" ? { amount: award.amount } : { badgeCode: award.badgeCode, label: award.label }),
});

/**
 * Evaluate and deliver every growth award `studentId` has earned in their
 * class of record. Returns { delivered, alreadyDelivered, skipped }:
 *
 *   delivered         awards written by THIS call
 *   alreadyDelivered  how many earned awards were already in place
 *   skipped           [{ ruleId, sourceId, reason }] — a rule's event that does
 *                     not pay (before the start date, another class, ...), or an
 *                     award the roster re-check refused
 */
async function syncStudentGrowthRewards(db, { studentId, nowMs = Date.now() } = {}) {
  const modules = await growthModules();
  const id = String(studentId || "").trim();
  if (!id) return { delivered: [], alreadyDelivered: 0, skipped: [{ ruleId: null, sourceId: null, reason: "missing_student" }] };

  const gradeSnap = await db.collection("grades").doc(id).get();
  const classId = gradeSnap.exists ? String(gradeSnap.data()?.classId || "").trim() : "";
  if (!classId) {
    return { delivered: [], alreadyDelivered: 0, skipped: [{ ruleId: null, sourceId: null, reason: gradeSnap.exists ? "no_class" : "grade_not_found" }] };
  }
  const classSnap = await db.collection("classes").doc(classId).get();
  const roster = rosterFromSnapshots(modules, { classId, classSnap, gradeSnap });
  if (!roster.valid) return { delivered: [], alreadyDelivered: 0, skipped: [{ ruleId: null, sourceId: null, reason: roster.reason }] };

  const [testCycles, weekly, mastery] = await Promise.all([
    loadTestCycles(db, id),
    loadWeeklyPath(db, modules, id, nowMs),
    loadMastery(db, modules, id, nowMs),
  ]);

  const { awards, skipped } = modules.rules.evaluateGrowthRewards({
    studentId: id,
    classId,
    testCycles,
    goals: weekly.goals,
    completions: weekly.completions,
    windowStartWeekKey: weekly.windowStartWeekKey,
    paidStreakWeeks: weekly.paidStreakWeeks,
    masteryProfile: mastery.masteryProfile,
    masteryBaseline: mastery.masteryBaseline,
    nowMs,
  });

  // One cheap read of every award's document first, so a routine sync that
  // finds nothing new opens no transactions. The transaction still re-checks.
  const refFor = (award) => (award.kind === "classPoints"
    ? db.collection(LEDGER).doc(award.id)
    : db.collection(modules.rewardGrants.REWARD_GRANTS_COLLECTION).doc(award.id));
  const existing = new Set();
  for (const group of chunk(awards, 100)) {
    // eslint-disable-next-line no-await-in-loop
    const docs = await db.getAll(...group.map(refFor));
    docs.forEach((entry, index) => { if (entry.exists) existing.add(group[index].id); });
  }

  const delivered = [];
  const refused = [];
  let alreadyDelivered = existing.size;
  // One at a time: the points awards share the student's account document,
  // and parallel transactions on it would only contend and retry.
  for (const award of awards.filter((entry) => !existing.has(entry.id))) {
    // eslint-disable-next-line no-await-in-loop
    const result = await deliverOne(db, modules, award, nowMs);
    if (result.outcome === "delivered") delivered.push(publicAward(award));
    else if (result.outcome === "alreadyDelivered") alreadyDelivered += 1;
    else refused.push({ ruleId: award.ruleId, sourceId: award.sourceId, reason: result.reason });
  }

  return { delivered, alreadyDelivered, skipped: [...skipped, ...refused] };
}

/**
 * The callable: a signed-in student syncs THEIR OWN growth rewards. The same
 * checks as requireStudent in functions/index.js; the student id comes from the
 * verified token only, and a request naming anyone else is refused outright
 * rather than quietly answered for the caller.
 */
async function syncStudentGrowthRewardsHandler(request, { db = null, nowMs = Date.now(), throttleMs = SYNC_THROTTLE_MS } = {}) {
  if (!request?.auth) throw new HttpsError("unauthenticated", "Sign in to see your rewards.");
  const token = request.auth.token || {};
  if (token.role !== "student" || !token.studentId) {
    throw new HttpsError("permission-denied", "Growth rewards are available to signed-in students.");
  }
  const studentId = String(token.studentId);
  const requested = request.data?.studentId;
  if (requested !== undefined && requested !== null && String(requested) !== studentId) {
    throw new HttpsError("permission-denied", "You can only check your own rewards.");
  }

  const firestore = db || require("firebase-admin/firestore").getFirestore();
  if (throttleMs > 0) {
    const stateRef = firestore.collection(GROWTH_STATE).doc(studentId);
    const recent = await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(stateRef);
      const last = Number(snapshot.exists ? snapshot.data()?.lastSyncAtMs : 0) || 0;
      if (nowMs - last < throttleMs) return true;
      transaction.set(stateRef, { studentId, lastSyncAtMs: nowMs }, { merge: true });
      return false;
    });
    if (recent) return { success: true, throttled: true, delivered: [], alreadyDelivered: 0, skipped: [] };
  }

  const result = await syncStudentGrowthRewards(firestore, { studentId, nowMs });
  return { success: true, throttled: false, ...result };
}

module.exports = {
  GROWTH_STATE,
  deliverGrowthAward,
  SYNC_THROTTLE_MS,
  syncStudentGrowthRewards,
  syncStudentGrowthRewardsHandler,
};
