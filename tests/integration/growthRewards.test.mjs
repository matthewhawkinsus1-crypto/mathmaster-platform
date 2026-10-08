// Growth rewards against a real Firestore. Run through `npm run test:challenge-finish`.
//
// The rules (what earns what) are unit tested in
// tests/platform/growthRewardRules.test.mjs. This suite holds the delivery
// promises:
//
//   * an award is delivered once, across repeated and concurrent syncs
//   * the account balance is exactly the sum of the ledger credits
//   * the callable only ever syncs the signed-in student
//   * an archived class or a disabled student earns nothing new, including
//     when the roster changes between evaluation and delivery
//   * a Path streak longer than the one-year window keeps paying
//   * a later read missing a paid week never pays a new streak block
//   * abandoned Path sessions cannot crowd completed ones out of the read
//   * mastery pays only server-derived skills, at most five per sync
//   * a growth credit is the newest row in the student's Recent points query

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'mathmaster-finish-harness' });
const db = admin.firestore();
const growth = require(path.join(repo, 'functions/lib/growthRewards.js'));
const { accountId } = await import(path.join(repo, 'functions/shared/classPoints.mjs'));

const TEACHER = 'gr-teacher@example.com';
const CLASS_ID = 'gr-class';
const ARCHIVED_CLASS = 'gr-archived-class';
const WEEK = '2026-10-05';
const WEEK_START = Date.parse(`${WEEK}T00:00:00Z`);
const DAY = 86_400_000;
const HOUR = 3_600_000;
// Two weeks after the goal week, so the weekly window includes it.
const NOW = Date.parse('2026-10-21T15:00:00.000Z');
const RELEASED = Date.parse('2026-10-09T15:00:00.000Z');

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active' });
await db.collection('classes').doc(ARCHIVED_CLASS).set({ teacherOfRecord: TEACHER, status: 'archived' });

let counter = 0;
const uniqueId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

/**
 * A student with one of each growth event: a failed test passed on the retest,
 * finished corrections, a weekly Path goal met on time, and one Mastered skill
 * (which the first sync freezes as the baseline).
 */
const seedStudent = async ({ classId = CLASS_ID, status = 'active' } = {}) => {
  const studentId = uniqueId('gr-student');
  const assignmentId = uniqueId('gr-assignment');
  await db.collection('grades').doc(studentId).set({ classId, assignedTeacherEmail: TEACHER, status, displayName: 'Growth Student' });
  await db.collection('assignments').doc(assignmentId).set({
    title: 'Unit 3 Test',
    assignedClassIds: [classId],
    assessmentPolicy: { mode: 'testCycle', passingScore: 70 },
  });
  await db.collection('testCycleRecords').doc(`${assignmentId}__${studentId}`).set({
    assignmentId,
    studentId,
    recordId: `${assignmentId}__${studentId}`,
    test: { state: 'released', rawScore: 52, releasedAt: RELEASED - 7 * DAY },
    retest: { state: 'released', rawScore: 78, releasedAt: RELEASED },
    corrections: { required: true, complete: true, waived: false, total: 3, completedTargets: 3, completedAt: RELEASED - DAY },
  });
  await db.collection('weeklyPathGoalSnapshots').doc(`${studentId}__${WEEK}`).set({
    studentId,
    classId,
    weekKey: WEEK,
    goalSessions: 3,
    assignmentState: 'assigned',
    dueAt: WEEK_START + 7 * DAY + 5 * HOUR,
    createdAt: WEEK_START + 2 * DAY + HOUR,
    sessions: [1, 2, 3].map((slot) => ({ slot, weeklySlotKey: `${WEEK}|${slot}` })),
  });
  await Promise.all([1, 2, 3].map((slot) => db.collection('pathSessions').doc(uniqueId('gr-session')).set({
    studentId,
    classId,
    status: 'completed',
    weekKey: WEEK,
    weeklySlotKey: `${WEEK}|${slot}`,
    completedAt: WEEK_START + 3 * DAY + slot * HOUR,
  })));
  await db.collection('studentMasteryProfiles').doc(studentId).set({
    studentId,
    classId,
    profiles: { 'A.1': { teksCode: 'A.1', mastery: { status: 'Mastered' }, updatedAt: RELEASED } },
  });
  return { studentId, assignmentId };
};

// Retest passed (20) + badge, corrections (10) + badge, weekly goal (10).
const FIRST_SYNC_POINTS = 20 + 10 + 10;
const FIRST_SYNC_AWARDS = 5;

const ledgerFor = async (studentId) => (await db.collection('classPointTransactions').where('studentId', '==', studentId).get())
  .docs.map((entry) => entry.data());
const grantsFor = async (studentId) => (await db.collection('rewardGrants').where('studentId', '==', studentId).get())
  .docs.map((entry) => entry.data());
const accountFor = async (studentId, classId = CLASS_ID) => (await db.collection('classPointAccounts').doc(accountId(studentId, classId)).get()).data() || null;

const sync = (studentId) => growth.syncStudentGrowthRewards(db, { studentId, nowMs: NOW });

/*
 * A skill as updateMyMathPathMasteryFromEvidence writes it after four correct,
 * independent answers at weight 1, one at DOK 3. Mastery pays only for this
 * shape (growthRewardRules.mjs serverDerivedMastered), not a bare label.
 */
const derivedMastered = (code, updatedAt) => ({
  teksCode: code,
  mastery: { estimate: 100, observedPerformance: 100, status: 'Mastered', confidence: 'Medium' },
  dimensions: {
    eligibleGradeLevelEvents: 4, modifiedEvidenceEvents: 0, independentSuccesses: 4,
    dokRepresented: [2, 3], familiesRepresented: [], lastIndependentSuccessAt: updatedAt,
  },
  accumulator: { effectiveWeight: 4, weightedScoreSum: 4, eligibleEvents: 4, modifiedEvents: 0, independentSuccesses: 4 },
  updatedAt,
});

test('the first sync delivers every earned award, and a second sync delivers nothing again', async () => {
  const { studentId } = await seedStudent();
  const first = await sync(studentId);
  assert.equal(first.delivered.length, FIRST_SYNC_AWARDS, JSON.stringify(first));
  assert.equal(first.alreadyDelivered, 0);
  assert.deepEqual(
    first.delivered.map((award) => award.ruleId).sort(),
    ['correctionsCompleted', 'correctionsCompleted', 'retestPassed', 'retestPassed', 'weeklyPathGoal'],
  );

  const ledger = await ledgerFor(studentId);
  assert.equal(ledger.length, 3);
  ledger.forEach((entry) => {
    assert.equal(entry.sourceType, 'growthReward');
    assert.equal(entry.reasonCode, 'growthReward');
    assert.equal(entry.classId, CLASS_ID);
    assert.ok(entry.amount > 0 && entry.amount <= 20);
    assert.deepEqual(entry.authorizedTeacherEmails, [TEACHER]);
  });
  const grants = await grantsFor(studentId);
  assert.deepEqual(grants.map((grant) => grant.badgeCode).sort(), ['growth-corrections', 'growth-retest']);
  grants.forEach((grant) => {
    assert.equal(grant.source.type, 'growth');
    assert.equal(grant.status, 'available');
  });

  const account = await accountFor(studentId);
  assert.equal(account.balance, FIRST_SYNC_POINTS);
  assert.equal(account.lifetimeEarned, FIRST_SYNC_POINTS);
  assert.equal(account.lifetimeSpent, 0);

  const second = await sync(studentId);
  assert.deepEqual(second.delivered, []);
  assert.equal(second.alreadyDelivered, FIRST_SYNC_AWARDS);
  assert.equal((await accountFor(studentId)).balance, FIRST_SYNC_POINTS, 'balance unchanged');
  assert.equal((await ledgerFor(studentId)).length, 3);
});

test('mastery pays only for skills reached after the first sync, once', async () => {
  const { studentId } = await seedStudent();
  await sync(studentId);
  const state = (await db.collection(growth.GROWTH_STATE).doc(studentId).get()).data();
  assert.deepEqual(state.masteryBaseline.skills, ['A.1'], 'the skill already Mastered is the baseline');

  await db.collection('studentMasteryProfiles').doc(studentId).set({
    profiles: { 'A.2': derivedMastered('A.2', NOW - HOUR) },
  }, { merge: true });
  const next = await sync(studentId);
  assert.deepEqual(next.delivered.map((award) => [award.ruleId, award.sourceId, award.amount]), [['masterySkill', 'A.2', 5]]);
  assert.equal((await accountFor(studentId)).balance, FIRST_SYNC_POINTS + 5);

  const again = await sync(studentId);
  assert.deepEqual(again.delivered, []);
  assert.equal((await accountFor(studentId)).balance, FIRST_SYNC_POINTS + 5);
});

test('concurrent syncs deliver each award exactly once', async () => {
  const { studentId } = await seedStudent();
  // The mastery baseline already exists, so no sync waits on creating it and
  // all of them reach delivery together.
  await db.collection(growth.GROWTH_STATE).doc(studentId).set({ studentId, masteryBaseline: { skills: ['A.1'], baselineAtMs: NOW } });
  // Several at once, so more than one passes the cheap existence read before
  // any has written: only the check inside each delivery transaction stops a
  // second credit then.
  const results = await Promise.all(Array.from({ length: 6 }, () => sync(studentId)));
  assert.equal(results.reduce((sum, result) => sum + result.delivered.length, 0), FIRST_SYNC_AWARDS);
  results.forEach((result) => assert.equal(result.delivered.length + result.alreadyDelivered, FIRST_SYNC_AWARDS));
  const ledger = await ledgerFor(studentId);
  assert.equal(ledger.length, 3);
  assert.equal((await grantsFor(studentId)).length, 2);
  const account = await accountFor(studentId);
  assert.equal(account.balance, ledger.reduce((sum, entry) => sum + entry.amount, 0));
  assert.equal(account.balance, FIRST_SYNC_POINTS);
});

test('an archived class and a disabled student earn nothing', async () => {
  const archived = await seedStudent({ classId: ARCHIVED_CLASS });
  const result = await sync(archived.studentId);
  assert.deepEqual(result.delivered, []);
  assert.equal(result.skipped[0].reason, 'class_archived');
  assert.deepEqual(await ledgerFor(archived.studentId), []);
  assert.deepEqual(await grantsFor(archived.studentId), []);

  const disabled = await seedStudent({ status: 'disabled' });
  const refused = await sync(disabled.studentId);
  assert.deepEqual(refused.delivered, []);
  assert.equal(refused.skipped[0].reason, 'student_disabled');
  assert.deepEqual(await ledgerFor(disabled.studentId), []);
});

test('a student who moved classes is paid nothing into the new class for the old class', async () => {
  const { studentId, assignmentId } = await seedStudent();
  await db.collection('testCycleRecords').doc(`${assignmentId}__${studentId}`).set({ classId: 'gr-old-class' }, { merge: true });
  const result = await sync(studentId);
  assert.ok(result.skipped.some((entry) => entry.reason === 'different_class' && entry.sourceId === assignmentId));
  assert.deepEqual(result.delivered.map((award) => award.ruleId), ['weeklyPathGoal']);
});

const studentRequest = (studentId, data = {}) => ({ auth: { uid: `uid-${studentId}`, token: { role: 'student', studentId } }, data });
const codeOf = async (promise) => {
  try { await promise; } catch (error) { return error.code; }
  return 'resolved';
};

test('the callable syncs only the signed-in student, and refuses anyone else', async () => {
  const { studentId } = await seedStudent();
  const other = await seedStudent();

  assert.equal(await codeOf(growth.syncStudentGrowthRewardsHandler({ data: {} }, { db, nowMs: NOW })), 'unauthenticated');
  assert.equal(await codeOf(growth.syncStudentGrowthRewardsHandler(
    { auth: { uid: 't', token: { role: 'teacher', email: TEACHER } }, data: { studentId } }, { db, nowMs: NOW },
  )), 'permission-denied');
  assert.equal(await codeOf(growth.syncStudentGrowthRewardsHandler(
    studentRequest(studentId, { studentId: other.studentId }), { db, nowMs: NOW },
  )), 'permission-denied');
  assert.deepEqual(await ledgerFor(other.studentId), [], 'nothing was synced for the other student');

  const own = await growth.syncStudentGrowthRewardsHandler(studentRequest(studentId), { db, nowMs: NOW });
  assert.equal(own.success, true);
  assert.equal(own.delivered.length, FIRST_SYNC_AWARDS);
  assert.ok(own.delivered.every((award) => !('studentId' in award)), 'the answer carries award facts only');

  const soon = await growth.syncStudentGrowthRewardsHandler(studentRequest(studentId), { db, nowMs: NOW + 1000 });
  assert.equal(soon.throttled, true, 'a second tab within a minute costs no sync');
  assert.deepEqual(await ledgerFor(other.studentId), []);
});

test('the roster is re-checked inside each delivery, after the awards were evaluated', async () => {
  // The up-front check passes; the roster then changes before delivery. Only
  // the check inside each transaction can refuse the write now.
  const { evaluateGrowthRewards } = await import(path.join(repo, 'functions/shared/growthRewardRules.mjs'));
  const evaluate = async (studentId, assignmentId) => evaluateGrowthRewards({
    studentId,
    classId: CLASS_ID,
    testCycles: [{
      record: (await db.collection('testCycleRecords').doc(`${assignmentId}__${studentId}`).get()).data(),
      assignment: (await db.collection('assignments').doc(assignmentId).get()).data(),
    }],
    nowMs: NOW,
  }).awards;

  const disabled = await seedStudent();
  const disabledAwards = await evaluate(disabled.studentId, disabled.assignmentId);
  assert.deepEqual(disabledAwards.map((award) => award.kind).sort(), ['badge', 'badge', 'classPoints', 'classPoints']);
  await db.collection('grades').doc(disabled.studentId).set({ status: 'disabled' }, { merge: true });
  for (const award of disabledAwards) {
    // eslint-disable-next-line no-await-in-loop
    assert.deepEqual(await growth.deliverGrowthAward(db, award, { nowMs: NOW }), { outcome: 'skipped', reason: 'student_disabled' }, award.kind);
  }
  assert.deepEqual(await ledgerFor(disabled.studentId), []);
  assert.deepEqual(await grantsFor(disabled.studentId), []);
  assert.equal(await accountFor(disabled.studentId), null);

  const moved = await seedStudent();
  const movedAwards = await evaluate(moved.studentId, moved.assignmentId);
  await db.collection('grades').doc(moved.studentId).set({ classId: 'gr-other-class' }, { merge: true });
  for (const award of movedAwards) {
    // eslint-disable-next-line no-await-in-loop
    const result = await growth.deliverGrowthAward(db, award, { nowMs: NOW });
    assert.equal(result.outcome, 'skipped', `${award.kind}: ${JSON.stringify(result)}`);
  }
  assert.deepEqual(await ledgerFor(moved.studentId), []);
  assert.deepEqual(await grantsFor(moved.studentId), []);
});

test('a weekly Path streak longer than the one-year window keeps paying its blocks', async () => {
  const studentId = uniqueId('gr-streak');
  await db.collection('grades').doc(studentId).set({ classId: CLASS_ID, assignedTeacherEmail: TEACHER, status: 'active', displayName: 'Streak Student' });
  const weekAt = (index) => new Date(WEEK_START + index * 7 * DAY).toISOString().slice(0, 10);
  const seedWeeks = async (from, to) => {
    const batch = db.batch();
    for (let index = from; index <= to; index += 1) {
      const weekKey = weekAt(index);
      const start = Date.parse(`${weekKey}T00:00:00Z`);
      batch.set(db.collection('weeklyPathGoalSnapshots').doc(`${studentId}__${weekKey}`), {
        studentId,
        classId: CLASS_ID,
        weekKey,
        goalSessions: 1,
        assignmentState: 'assigned',
        dueAt: start + 7 * DAY + 5 * HOUR,
        createdAt: start + 2 * DAY + HOUR,
        sessions: [{ slot: 1, weeklySlotKey: `${weekKey}|1` }],
      });
      batch.set(db.collection('pathSessions').doc(uniqueId('gr-streak-session')), {
        studentId, classId: CLASS_ID, status: 'completed', weekKey, weeklySlotKey: `${weekKey}|1`, completedAt: start + 3 * DAY,
      });
    }
    await batch.commit();
  };
  const streakWeeks = (result) => result.delivered
    .filter((award) => award.ruleId === 'weeklyPathStreak' && award.kind === 'classPoints')
    .map((award) => award.sourceId)
    .sort();
  const every3 = (from, to) => Array.from({ length: Math.floor((to - from) / 3) + 1 }, (_, n) => weekAt(from + 3 * n));

  // Spring: 34 goal weeks in a row from the start, every one inside the window.
  await seedWeeks(0, 33);
  const spring = await growth.syncStudentGrowthRewards(db, { studentId, nowMs: Date.parse('2027-06-01T15:00:00Z') });
  assert.deepEqual(streakWeeks(spring), every3(2, 32));

  // The next December the same run is 62 weeks long and its first eleven weeks
  // have left the window; the blocks already paid fix where the new ones end.
  await seedWeeks(34, 61);
  const december = await growth.syncStudentGrowthRewards(db, { studentId, nowMs: Date.parse('2027-12-15T15:00:00Z') });
  assert.deepEqual(streakWeeks(december), every3(35, 59), JSON.stringify(december.skipped));
  assert.ok(!december.skipped.some((entry) => entry.reason === 'run_start_unknown'));
  const ledger = await ledgerFor(studentId);
  assert.equal((await accountFor(studentId)).balance, ledger.reduce((sum, entry) => sum + entry.amount, 0));
});

test('mastery pays only server-derived skills, at most five per sync, each once', async () => {
  const { studentId } = await seedStudent();
  await sync(studentId); // freezes the baseline (A.1)

  // A former teacher's forgery, had the rules still let one through: bare
  // labels pay nothing.
  const forged = Object.fromEntries(Array.from({ length: 50 }, (_, index) => {
    const code = `A.${index + 2}F`;
    return [code, { teksCode: code, mastery: { status: 'Mastered' }, updatedAt: NOW - HOUR }];
  }));
  await db.collection('studentMasteryProfiles').doc(studentId).set({ profiles: forged }, { merge: true });
  assert.deepEqual((await sync(studentId)).delivered, []);

  // Twelve skills reached through evidence: five, five, then two.
  const real = Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
    const code = `A2.${index + 1}B`;
    return [code, derivedMastered(code, NOW - HOUR)];
  }));
  await db.collection('studentMasteryProfiles').doc(studentId).set({ profiles: real }, { merge: true });
  const skillsOf = (result) => result.delivered.filter((award) => award.ruleId === 'masterySkill').map((award) => award.sourceId);
  const rounds = [];
  for (let round = 0; round < 4; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    rounds.push(skillsOf(await sync(studentId)));
  }
  assert.deepEqual(rounds.map((round) => round.length), [5, 5, 2, 0]);
  assert.deepEqual(rounds.flat().sort(), Object.keys(real).sort());
  const ledger = await ledgerFor(studentId);
  assert.equal(ledger.filter((entry) => entry.ruleId === 'masterySkill').length, 12);
  assert.equal((await accountFor(studentId)).balance, FIRST_SYNC_POINTS + 12 * 5);
  assert.deepEqual((await grantsFor(studentId)).map((grant) => grant.badgeCode).filter((code) => code.startsWith('mastery')).sort(), ['mastery-10', 'mastery-5']);
});

test('a growth credit is the newest row in the student\'s Recent points query', async () => {
  const { studentId } = await seedStudent();
  // Ten earlier ledger rows from the other writers, ISO-dated (classPoints.mjs builders).
  const batch = db.batch();
  for (let index = 0; index < 10; index += 1) {
    batch.set(db.collection('classPointTransactions').doc(uniqueId('gr-manual')), {
      studentId, classId: CLASS_ID, amount: 1, reasonLabel: 'Helping a classmate', sourceType: 'teacherAward',
      authorizedTeacherEmails: [TEACHER], createdAt: new Date(NOW - (index + 1) * DAY).toISOString(),
    });
  }
  await batch.commit();
  await sync(studentId);

  // Exactly the student's history query (src/platform/classPointsClient.js
  // subscribeToStudentClassPoints).
  const recent = await db.collection('classPointTransactions')
    .where('studentId', '==', studentId)
    .where('classId', '==', CLASS_ID)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();
  const rows = recent.docs.map((entry) => entry.data());
  assert.equal(rows[0].sourceType, 'growthReward', JSON.stringify(rows.map((row) => [row.sourceType, row.createdAt])));
  assert.equal(rows.filter((row) => row.sourceType === 'growthReward').length, 3, 'all three growth credits are in the newest ten');
  rows.filter((row) => row.sourceType === 'growthReward').forEach((row) => {
    assert.equal(typeof row.createdAt, 'string');
    assert.equal(row.createdAt, new Date(NOW).toISOString());
  });
  (await grantsFor(studentId)).forEach((grant) => assert.equal(typeof grant.createdAt, 'string'));
});

const seedPathWeeks = async (studentId, indexes, { sessionPrefix = 'gr-path' } = {}) => {
  const weekAt = (index) => new Date(WEEK_START + index * 7 * DAY).toISOString().slice(0, 10);
  const batch = db.batch();
  const sessionIds = {};
  for (const index of indexes) {
    const weekKey = weekAt(index);
    const start = Date.parse(`${weekKey}T00:00:00Z`);
    batch.set(db.collection('weeklyPathGoalSnapshots').doc(`${studentId}__${weekKey}`), {
      studentId, classId: CLASS_ID, weekKey, goalSessions: 1, assignmentState: 'assigned',
      dueAt: start + 7 * DAY + 5 * HOUR, createdAt: start + 2 * DAY + HOUR,
      sessions: [{ slot: 1, weeklySlotKey: `${weekKey}|1` }],
    });
    const sessionId = uniqueId(sessionPrefix);
    sessionIds[index] = sessionId;
    batch.set(db.collection('pathSessions').doc(sessionId), {
      studentId, classId: CLASS_ID, status: 'completed', weekKey, weeklySlotKey: `${weekKey}|1`, completedAt: start + 3 * DAY,
    });
  }
  await batch.commit();
  return { weekAt, sessionIds };
};
const pathStudent = async () => {
  const studentId = uniqueId('gr-path-student');
  await db.collection('grades').doc(studentId).set({ classId: CLASS_ID, assignedTeacherEmail: TEACHER, status: 'active', displayName: 'Path Student' });
  return studentId;
};
const streakEndsOf = (result) => result.delivered
  .filter((award) => award.ruleId === 'weeklyPathStreak' && award.kind === 'classPoints')
  .map((award) => award.sourceId)
  .sort();

test('a later read missing a paid week pays no new streak block', async () => {
  const studentId = await pathStudent();
  const { weekAt, sessionIds } = await seedPathWeeks(studentId, [0, 1, 2, 3, 4, 5]);
  const atNow = Date.parse('2026-11-20T15:00:00Z');
  const first = await growth.syncStudentGrowthRewards(db, { studentId, nowMs: atNow });
  assert.deepEqual(streakEndsOf(first), [weekAt(2), weekAt(5)]);

  // Week 1's completed session is no longer read (the reproduced case paid a
  // new block ending at week 4 here).
  await db.collection('pathSessions').doc(sessionIds[1]).delete();
  const later = await growth.syncStudentGrowthRewards(db, { studentId, nowMs: atNow });
  assert.deepEqual(later.delivered, [], JSON.stringify(later.delivered));
  const streakLedger = (await ledgerFor(studentId)).filter((entry) => entry.ruleId === 'weeklyPathStreak');
  assert.deepEqual(streakLedger.map((entry) => entry.growthSourceId).sort(), [weekAt(2), weekAt(5)]);
});

test('abandoned Path sessions cannot crowd the completed ones out of the read', async () => {
  const studentId = await pathStudent();
  const { weekAt } = await seedPathWeeks(studentId, [0], { sessionPrefix: 'z-completed' });
  // More unfinished sessions in the same week than one read returns, with ids
  // that sort before the completed one.
  for (let start = 0; start < 320; start += 160) {
    const batch = db.batch();
    for (let index = start; index < start + 160; index += 1) {
      batch.set(db.collection('pathSessions').doc(`a-abandoned-${studentId}-${String(index).padStart(3, '0')}`), {
        studentId, classId: CLASS_ID, status: index % 2 ? 'abandoned' : 'active', weekKey: weekAt(0), weeklySlotKey: `${weekAt(0)}|1`,
      });
    }
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  const result = await growth.syncStudentGrowthRewards(db, { studentId, nowMs: Date.parse('2026-10-21T15:00:00Z') });
  assert.deepEqual(result.delivered.map((award) => [award.ruleId, award.sourceId]), [['weeklyPathGoal', weekAt(0)]]);
});
