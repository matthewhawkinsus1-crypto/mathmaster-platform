import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  GROWTH_REWARDS_START_MS,
  GROWTH_RULE_IDS,
  MASTERY_SKILLS_PER_SYNC,
  SKIP_REASON,
  evaluateMasteryGrowth,
  growthAwardIdentity,
  growthLedgerTransactionId,
  masteryMilestones,
} from '../../functions/shared/growthRewardRules.mjs';
import { MASTERY_HISTORY_COLLECTION, buildMasteryHistoryDocument } from '../../functions/shared/masteryHistory.mjs';
import { classifyMasteryStatus } from '../../functions/shared/masteryRule.mjs';
import { accountId } from '../../functions/shared/classPoints.mjs';
import { region } from './helpers/sourceContract.mjs';

/*
 * "A skill reached Mastered" is paid from Job D's mastered-at data:
 * studentMasteryHistory/{studentId} (functions/shared/masteryHistory.mjs),
 * the weekly snapshots the mastery trigger writes in the same transaction as
 * the profile. These run the real sync (functions/lib/growthRewards.js
 * syncStudentGrowthRewards) against a small in-memory Firestore, with the
 * profile and history written the way the trigger writes them, and prove:
 *
 *   - the switch: the history decides; a profile alone pays nothing
 *   - exactly once across syncs, and once for mastered → lost → re-mastered
 *   - at most MASTERY_SKILLS_PER_SYNC per sync
 *   - only server-written records are read, and forged ones pay nothing
 *   - a skill paid before the switch is not paid again (same ledger id)
 *   - the first-sync baseline still protects earlier mastery
 *
 * The same delivery against the real emulator: tests/integration/growthRewards.test.mjs.
 */

const require = createRequire(import.meta.url);
const growth = require('../../functions/lib/growthRewards.js');

const DAY = 86_400_000;
const HOUR = 3_600_000;
const TEACHER = 'gm-teacher@example.com';
const CLASS = 'gm-class';
const STUDENT = 'gm-student';
const BASELINE_AT = GROWTH_REWARDS_START_MS + HOUR;
// One mastery update per week from here on: weeks 2026-10-05, -12, -19, ...
const weekAt = (index) => GROWTH_REWARDS_START_MS + DAY + index * 7 * DAY;

// --- A Firestore stand-in for exactly what the sync uses ---------------------

class Ref {
  constructor(db, collection, id) { Object.assign(this, { db, collection, id }); }

  async get() { return this.db.read(this.collection, this.id); }
}

class Query {
  constructor(db, collection, { filters = [], limitCount = null, after = null } = {}) {
    Object.assign(this, { db, collection, filters, limitCount, after });
  }

  with(changes) { return new Query(this.db, this.collection, { ...this, ...changes }); }

  doc(id) { return new Ref(this.db, this.collection, id); }

  where(field, op, value) { return this.with({ filters: [...this.filters, { field, op, value }] }); }

  // Every query the sync makes orders by document id, which is how this
  // stand-in always returns them.
  orderBy() { return this; }

  limit(limitCount) { return this.with({ limitCount }); }

  startAfter(snapshot) { return this.with({ after: snapshot.id }); }

  async get() {
    this.db.reads.push(this.collection);
    let ids = [...this.db.docs(this.collection).keys()].sort()
      .filter((id) => this.after === null || id > this.after)
      .filter((id) => this.filters.every(({ field, op, value }) => {
        const actual = this.db.docs(this.collection).get(id)[field];
        return op === 'in' ? value.includes(actual) : actual === value;
      }));
    if (this.limitCount !== null) ids = ids.slice(0, this.limitCount);
    const docs = ids.map((id) => this.db.snapshot(this.collection, id));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class MemoryFirestore {
  constructor() {
    this.collections = new Map();
    this.reads = [];
  }

  docs(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return this.collections.get(name);
  }

  collection(name) { return new Query(this, name); }

  snapshot(collection, id) {
    const data = this.docs(collection).get(id);
    return { id, exists: data !== undefined, data: () => (data === undefined ? undefined : structuredClone(data)) };
  }

  read(collection, id) {
    this.reads.push(collection);
    return this.snapshot(collection, id);
  }

  write(ref, data, { merge = false } = {}) {
    const next = structuredClone(data);
    const stored = this.docs(ref.collection);
    stored.set(ref.id, merge && stored.has(ref.id) ? { ...stored.get(ref.id), ...next } : next);
  }

  seed(collection, id, data) { this.docs(collection).set(id, structuredClone(data)); }

  get(collection, id) { return this.docs(collection).get(id); }

  all(collection) { return [...this.docs(collection).entries()].map(([id, data]) => ({ id, ...data })); }

  async getAll(...refs) { return refs.map((ref) => this.read(ref.collection, ref.id)); }

  async runTransaction(callback) {
    const pending = [];
    const transaction = {
      get: async (ref) => this.read(ref.collection, ref.id),
      set: (ref, data, options) => { pending.push([ref, data, options]); return transaction; },
    };
    const result = await callback(transaction);
    pending.forEach(([ref, data, options]) => this.write(ref, data, options));
    return result;
  }
}

// --- The records, as their server writers write them ------------------------

/*
 * One profile entry as updateMyMathPathMasteryFromEvidence writes it, from
 * its accumulator, classified by the one Mastered rule.
 *   developing  three correct answers: not enough evidence for Mastered yet
 *   mastered    four correct and independent, one at DOK 3
 *   slipped     the same four plus two wrong ones: once Mastered, now not
 */
const SHAPES = {
  developing: { weight: 3, sum: 3, events: 3, successes: 3, dok: [2] },
  mastered: { weight: 4, sum: 4, events: 4, successes: 4, dok: [2, 3] },
  slipped: { weight: 6, sum: 4, events: 6, successes: 4, dok: [2, 3] },
};
const entry = (code, shape, updatedAt) => {
  const { weight, sum, events, successes, dok } = SHAPES[shape];
  const estimate = Math.round((sum / weight) * 100);
  const status = classifyMasteryStatus({ estimate, eligibleEvents: events, effectiveWeight: weight, independentSuccesses: successes, dokRepresented: dok });
  return {
    teksCode: code,
    mastery: { estimate, observedPerformance: estimate, status, confidence: 'Medium' },
    dimensions: { eligibleGradeLevelEvents: events, modifiedEvidenceEvents: 0, independentSuccesses: successes, dokRepresented: dok, familiesRepresented: [] },
    accumulator: { effectiveWeight: weight, weightedScoreSum: sum, eligibleEvents: events, modifiedEvents: 0, independentSuccesses: successes },
    updatedAt,
  };
};

/**
 * One mastery update, as the trigger applies it: `shapes` ({ code: shape })
 * merged into the profile, and the history rebuilt from the same profiles in
 * the same step (masteryHistory.mjs buildMasteryHistoryDocument).
 */
const practise = (db, at, shapes, { studentId = STUDENT, classId = CLASS } = {}) => {
  const stored = db.get('studentMasteryProfiles', studentId);
  const profiles = { ...stored?.profiles };
  Object.entries(shapes).forEach(([code, shape]) => { profiles[code] = entry(code, shape, at); });
  const authorization = { classId, originClassId: classId, originTeacherEmail: TEACHER, authorizedTeacherEmails: [TEACHER] };
  db.seed('studentMasteryProfiles', studentId, { profiles, studentId, ...authorization, updatedAt: at });
  db.seed(MASTERY_HISTORY_COLLECTION, studentId, buildMasteryHistoryDocument({
    existing: db.get(MASTERY_HISTORY_COLLECTION, studentId) || null, profiles, studentId, authorization, occurredAt: at, now: at,
  }));
};

const freshStudent = ({ baselineSkills = [], baselineAtMs = BASELINE_AT } = {}) => {
  const db = new MemoryFirestore();
  db.seed('classes', CLASS, { teacherOfRecord: TEACHER, status: 'active' });
  db.seed('grades', STUDENT, { classId: CLASS, assignedTeacherEmail: TEACHER, status: 'active' });
  if (baselineSkills) db.seed(growth.GROWTH_STATE, STUDENT, { studentId: STUDENT, masteryBaseline: { skills: baselineSkills, baselineAtMs } });
  return db;
};

const sync = (db, nowMs) => growth.syncStudentGrowthRewards(db, { studentId: STUDENT, nowMs });
const masteryPaid = (result) => result.delivered.filter((award) => award.ruleId === GROWTH_RULE_IDS.MASTERY_SKILL).map((award) => award.sourceId);
const ledger = (db) => db.all('classPointTransactions');
const balance = (db) => db.get('classPointAccounts', accountId(STUDENT, CLASS))?.balance || 0;
const masteryBadges = (db) => db.all('rewardGrants').map((grant) => grant.badgeCode).filter((code) => String(code).startsWith('mastery')).sort();

// The award id as the pre-switch code computed it — written out here, not
// imported, so a change to the identity cannot pass by changing both sides.
const preSwitchLedgerId = (studentId, code) => `gra_${createHash('sha256')
  .update(['growth', studentId, 'masterySkill', code].join('\u0000')).digest('hex').slice(0, 40)}`;

// --- The switch ---------------------------------------------------------------

test('mastery pays from the history: a profile that says Mastered pays nothing without it', async () => {
  const db = freshStudent();
  practise(db, weekAt(0), { 'A.2C': 'mastered' });
  db.docs(MASTERY_HISTORY_COLLECTION).delete(STUDENT); // a profile written before Job D's history existed
  const before = await sync(db, weekAt(0) + HOUR);
  assert.deepEqual(masteryPaid(before), [], 'no history, no mastery reward');
  assert.equal(ledger(db).length, 0);

  // The next mastery update writes the history; the skill pays then.
  practise(db, weekAt(1), { 'A.3A': 'developing' });
  const after = await sync(db, weekAt(1) + HOUR);
  assert.deepEqual(masteryPaid(after), ['A.2C']);
  assert.equal(balance(db), 5);
  assert.ok(db.reads.includes(MASTERY_HISTORY_COLLECTION), 'the sync read the history');
});

test('the history says when: a move it saw before the start date never pays', async () => {
  const db = freshStudent({ baselineSkills: [], baselineAtMs: null });
  practise(db, GROWTH_REWARDS_START_MS - 14 * DAY, { 'A.2C': 'developing' });
  practise(db, GROWTH_REWARDS_START_MS - 7 * DAY, { 'A.2C': 'mastered' });
  practise(db, weekAt(0), { 'A.3A': 'developing' });
  const result = await sync(db, weekAt(0) + HOUR);
  assert.deepEqual(masteryPaid(result), []);
  assert.ok(result.skipped.some((entry) => entry.sourceId === 'A.2C' && entry.reason === SKIP_REASON.BEFORE_START));
  const milestone = masteryMilestones(db.get(MASTERY_HISTORY_COLLECTION, STUDENT)).find(({ code }) => code === 'A.2C');
  assert.deepEqual(milestone, { code: 'A.2C', atMs: GROWTH_REWARDS_START_MS - 7 * DAY, timeKnown: true });
});

test('Mastered in the oldest week (time unknown): a profile entry last updated before the start date never pays', async () => {
  // The pre-switch rule in the time-unknown branch: it reads the profile
  // entry's own update time (verify lane, growth: this kept check had no test).
  const db = freshStudent({ baselineSkills: [], baselineAtMs: null });
  practise(db, GROWTH_REWARDS_START_MS - 7 * DAY, { 'A.2C': 'mastered' });
  practise(db, weekAt(0), { 'A.3A': 'developing' });
  const result = await sync(db, weekAt(0) + HOUR);
  assert.deepEqual(masteryPaid(result), []);
  assert.ok(result.skipped.some((entry) => entry.sourceId === 'A.2C' && entry.reason === SKIP_REASON.BEFORE_START), JSON.stringify(result.skipped));
});

// --- Exactly once ----------------------------------------------------------------

test('each skill is paid exactly once across any number of syncs', async () => {
  const db = freshStudent();
  practise(db, weekAt(0), { 'A.2C': 'developing', 'A.5A': 'developing' });
  practise(db, weekAt(1), { 'A.2C': 'mastered' });
  assert.deepEqual(masteryPaid(await sync(db, weekAt(1) + HOUR)), ['A.2C']);
  for (let round = 0; round < 3; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    const again = await sync(db, weekAt(1) + (round + 2) * HOUR);
    assert.deepEqual(masteryPaid(again), [], `sync ${round + 2}`);
    assert.ok(again.alreadyDelivered >= 1);
  }
  practise(db, weekAt(2), { 'A.5A': 'mastered' });
  assert.deepEqual(masteryPaid(await sync(db, weekAt(2) + HOUR)), ['A.5A']);
  assert.deepEqual(masteryPaid(await sync(db, weekAt(2) + 2 * HOUR)), []);
  assert.equal(ledger(db).filter((row) => row.ruleId === GROWTH_RULE_IDS.MASTERY_SKILL).length, 2);
  assert.equal(balance(db), 10);
});

test('mastered, then lost, then mastered again pays once — whenever the syncs happen', async () => {
  const history = (db) => {
    practise(db, weekAt(0), { 'A.2C': 'developing' });
    practise(db, weekAt(1), { 'A.2C': 'mastered' });
    practise(db, weekAt(2), { 'A.2C': 'slipped' });
  };
  // A sync while it is lost still pays the mastery the history saw.
  const between = freshStudent();
  history(between);
  assert.notEqual(between.get('studentMasteryProfiles', STUDENT).profiles['A.2C'].mastery.status, 'Mastered');
  assert.deepEqual(masteryPaid(await sync(between, weekAt(2) + HOUR)), ['A.2C']);
  practise(between, weekAt(3), { 'A.2C': 'mastered' });
  assert.deepEqual(masteryPaid(await sync(between, weekAt(3) + HOUR)), [], 'mastering it again pays nothing new');
  assert.equal(balance(between), 5);

  // No sync until it is back: still one award.
  const after = freshStudent();
  history(after);
  practise(after, weekAt(3), { 'A.2C': 'mastered' });
  assert.deepEqual(masteryPaid(await sync(after, weekAt(3) + HOUR)), ['A.2C']);
  assert.deepEqual(masteryPaid(await sync(after, weekAt(3) + 2 * HOUR)), []);
  assert.equal(ledger(after).length, 1);
});

// --- The cap ---------------------------------------------------------------------

test(`at most ${MASTERY_SKILLS_PER_SYNC} skills pay per sync; the rest follow, each once`, async () => {
  const db = freshStudent();
  const codes = Array.from({ length: 12 }, (_, index) => `A2.${index + 1}B`);
  practise(db, weekAt(0), Object.fromEntries(codes.map((code) => [code, 'developing'])));
  practise(db, weekAt(1), Object.fromEntries(codes.map((code) => [code, 'mastered'])));
  const rounds = [];
  for (let round = 0; round < 4; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sync(db, weekAt(1) + (round + 1) * HOUR);
    rounds.push(masteryPaid(result));
    if (round < 2) assert.ok(result.skipped.some((entry) => entry.reason === SKIP_REASON.SYNC_LIMIT), `round ${round} says why the rest wait`);
  }
  assert.deepEqual(rounds.map((round) => round.length), [5, 5, 2, 0]);
  assert.deepEqual(rounds.flat().sort(), [...codes].sort());
  assert.equal(balance(db), 12 * 5);
  assert.deepEqual(masteryBadges(db), ['mastery-10', 'mastery-5']);
});

// --- Server-trusted only -----------------------------------------------------------

test('mastery is read only from the two documents the trigger writes, which no client can write', async () => {
  const db = freshStudent();
  practise(db, weekAt(0), { 'A.2C': 'developing' });
  practise(db, weekAt(1), { 'A.2C': 'mastered' });
  db.reads.length = 0;
  await sync(db, weekAt(1) + HOUR);
  // Everything the sync opened. The mastery rule's inputs are the profile and
  // the history; the rest are the other rules' sources, the roster, the
  // baseline and the awards themselves.
  assert.deepEqual([...new Set(db.reads)].sort(), [
    'classPointAccounts', 'classPointTransactions', 'classes', 'grades', 'growthRewardState',
    MASTERY_HISTORY_COLLECTION, 'studentMasteryProfiles', 'testCycleRecords', 'weeklyPathGoalSnapshots',
  ].sort());
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  for (const collection of [MASTERY_HISTORY_COLLECTION, 'studentMasteryProfiles']) {
    const block = region(rules, `match /${collection}/{studentId} {`, '}');
    assert.match(block, /allow (write|create, update, delete): if false;/, collection);
    assert.doesNotMatch(block.replace(/allow read:[^;]*;/, ''), /allow (write|create|update|delete)[^;]*if (?!false)/, collection);
  }
});

test('a forged history pays nothing without the evidence in the profile', async () => {
  const db = freshStudent();
  practise(db, weekAt(0), { 'A.2C': 'developing' });
  // As if a client could write the history: twenty Mastered skills the
  // profile has no evidence for, and one it has only three answers for.
  const history = db.get(MASTERY_HISTORY_COLLECTION, STUDENT);
  const forged = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`A.${index + 1}F`, [100, 4]]));
  db.seed(MASTERY_HISTORY_COLLECTION, STUDENT, {
    ...history,
    weeks: { ...history.weeks, '2026-10-12': { skills: { ...forged, 'A.2C': [100, 4] }, updatedAt: weekAt(1) } },
  });
  const result = await sync(db, weekAt(1) + HOUR);
  assert.deepEqual(masteryPaid(result), []);
  assert.equal(ledger(db).length, 0);

  // A history that names another student is not this student's.
  practise(db, weekAt(2), { 'A.2C': 'mastered' });
  const real = db.get(MASTERY_HISTORY_COLLECTION, STUDENT);
  assert.deepEqual(evaluateMasteryGrowth({
    studentId: STUDENT, classId: CLASS, masteryHistory: { ...real, studentId: 'someone-else' },
    masteryProfile: db.get('studentMasteryProfiles', STUDENT), baseline: { skills: [] },
  }).awards, []);
  assert.deepEqual(masteryPaid(await sync(db, weekAt(2) + HOUR)), ['A.2C'], 'the real one pays');
});

// --- Compatible with what was paid before the switch -------------------------------

/** A masterySkill credit as the pre-switch sync wrote it, from the profile. */
const seedPreSwitchPayment = (db, code) => {
  const paidId = preSwitchLedgerId(STUDENT, code);
  db.seed('classPointTransactions', paidId, {
    id: paidId, studentId: STUDENT, classId: CLASS, amount: 5, sourceType: 'growthReward', ruleId: 'masterySkill', growthSourceId: code,
  });
  db.seed('classPointAccounts', accountId(STUDENT, CLASS), { studentId: STUDENT, classId: CLASS, balance: 5, lifetimeEarned: 5, lifetimeSpent: 0 });
  return paidId;
};

test('a skill paid before the switch is not paid again, and takes no place under the cap', async () => {
  const db = freshStudent();
  const paidId = seedPreSwitchPayment(db, 'A.1A');
  assert.equal(paidId, growthLedgerTransactionId(growthAwardIdentity({ studentId: STUDENT, ruleId: GROWTH_RULE_IDS.MASTERY_SKILL, sourceId: 'A.1A' })));

  const codes = ['A.1A', 'A.2A', 'A.3A', 'A.4A', 'A.5A', 'A.6A', 'A.7A'];
  practise(db, weekAt(0), Object.fromEntries(codes.map((code) => [code, 'developing'])));
  practise(db, weekAt(1), Object.fromEntries(codes.map((code) => [code, 'mastered'])));
  const first = await sync(db, weekAt(1) + HOUR);
  // A.1A is already paid, so it takes no place under the cap: five others pay.
  assert.deepEqual(masteryPaid(first), ['A.2A', 'A.3A', 'A.4A', 'A.5A', 'A.6A']);
  assert.ok(first.alreadyDelivered >= 1, 'the pre-switch award is reported as delivered');
  assert.equal(ledger(db).filter((row) => row.growthSourceId === 'A.1A').length, 1);
  const second = await sync(db, weekAt(1) + 2 * HOUR);
  assert.deepEqual(masteryPaid(second), ['A.7A']);
  assert.equal(balance(db), 5 + 6 * 5);
});

test('a skill paid before the switch counts toward the 5 badge, even once it has slipped', async () => {
  const db = freshStudent();
  seedPreSwitchPayment(db, 'A.1A');
  practise(db, weekAt(0), { 'A.1A': 'mastered', 'A.2A': 'developing', 'A.3A': 'developing', 'A.4A': 'developing', 'A.5A': 'developing' });
  practise(db, weekAt(1), { 'A.1A': 'slipped', 'A.2A': 'mastered', 'A.3A': 'mastered', 'A.4A': 'mastered', 'A.5A': 'mastered' });
  assert.deepEqual(masteryPaid(await sync(db, weekAt(1) + HOUR)), ['A.2A', 'A.3A', 'A.4A', 'A.5A']);
  // 1 paid before the switch + 4 now = 5.
  assert.deepEqual(masteryBadges(db), ['mastery-5']);
  assert.equal(ledger(db).filter((row) => row.growthSourceId === 'A.1A').length, 1);
});

// --- The baseline -----------------------------------------------------------------

test('the first-sync baseline still holds: earlier mastery never pays as a backlog', async () => {
  // A long-time student: A.1A Mastered long ago, already in the history's
  // oldest week. The first sync freezes it.
  const db = freshStudent({ baselineSkills: null });
  practise(db, weekAt(0), { 'A.1A': 'mastered', 'A.2A': 'developing' });
  const first = await sync(db, weekAt(0) + HOUR);
  assert.deepEqual(masteryPaid(first), []);
  assert.deepEqual(db.get(growth.GROWTH_STATE, STUDENT).masteryBaseline.skills, ['A.1A']);
  // Slipping and coming back does not turn it into new mastery.
  practise(db, weekAt(1), { 'A.1A': 'slipped', 'A.2A': 'mastered' });
  practise(db, weekAt(2), { 'A.1A': 'mastered' });
  assert.deepEqual(masteryPaid(await sync(db, weekAt(2) + HOUR)), ['A.2A']);
  assert.deepEqual(masteryPaid(await sync(db, weekAt(2) + 2 * HOUR)), []);
});

test('mastery the history saw before the baseline, lost again by then, does not pay (conservative)', async () => {
  const db = freshStudent({ baselineSkills: null });
  practise(db, weekAt(0), { 'A.2C': 'developing' });
  practise(db, weekAt(1), { 'A.2C': 'mastered' });
  practise(db, weekAt(2), { 'A.2C': 'slipped' });
  // First sync now: A.2C is not Mastered, so it is not in the baseline, but
  // its first mastery on record came before the baseline.
  const first = await sync(db, weekAt(2) + HOUR);
  assert.deepEqual(db.get(growth.GROWTH_STATE, STUDENT).masteryBaseline.skills, []);
  assert.deepEqual(masteryPaid(first), []);
  assert.ok(first.skipped.some((entry) => entry.sourceId === 'A.2C' && entry.reason === SKIP_REASON.BEFORE_BASELINE));
  practise(db, weekAt(3), { 'A.2C': 'mastered' });
  assert.deepEqual(masteryPaid(await sync(db, weekAt(3) + HOUR)), [], 'its first mastery is the one that counts');
});

test('a baseline older than the history: a skill already Mastered in it pays by the pre-switch rule', async () => {
  // The baseline was frozen (empty) before Job D's history existed; the
  // history's oldest week already shows A.2C Mastered, at an unknown time.
  const db = freshStudent({ baselineSkills: [], baselineAtMs: BASELINE_AT });
  practise(db, weekAt(0), { 'A.2C': 'mastered', 'A.3A': 'mastered' });
  const milestones = masteryMilestones(db.get(MASTERY_HISTORY_COLLECTION, STUDENT));
  assert.ok(milestones.every(({ timeKnown }) => timeKnown === false));
  // Before the switch this paid: Mastered now, updated after the start, not
  // in the baseline. It still does.
  practise(db, weekAt(1), { 'A.3A': 'slipped' });
  // But a skill no longer Mastered, whose mastery the history never saw
  // happen, does not: its time is unknown.
  assert.deepEqual(masteryPaid(await sync(db, weekAt(1) + HOUR)), ['A.2C']);
});

test('the sync hands the history to the mastery rule, read in one transaction with the profile', () => {
  const source = readFileSync(new URL('../../functions/lib/growthRewards.js', import.meta.url), 'utf8');
  const loader = region(source, 'async function loadMastery(', '\nconst publicAward');
  assert.match(loader, /transaction\.get\(profileRef\), transaction\.get\(historyRef\), transaction\.get\(stateRef\)/);
  assert.match(source, /const MASTERY_HISTORY = "studentMasteryHistory";/);
  assert.equal('studentMasteryHistory', MASTERY_HISTORY_COLLECTION);
  const call = region(source, 'modules.rules.evaluateGrowthRewards({', '});');
  assert.match(call, /masteryHistory: mastery\.masteryHistory,/);
});
