/*
 * GROWTH OVER TIME (student push D, item 6).
 *
 * Each mastery update overwrote studentMasteryProfiles, so nothing remembered
 * where a student was a month ago. The trigger now also keeps one compact
 * snapshot per week in studentMasteryHistory/{studentId}. These tests pin the
 * snapshot, the week it lands in, the bounds, the readers, and that the trigger
 * writes it in the same transaction with the profile's own authorization.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  MASTERY_HISTORY_COLLECTION,
  MASTERY_HISTORY_MAX_BYTES,
  MASTERY_HISTORY_MAX_WEEKS,
  MASTERY_STATUS_CODE,
  buildMasteryHistoryDocument,
  compareMasteryGrowth,
  derivedMasteryAuthorization,
  masteryHistorySeries,
  masteryHistorySnapshot,
  masteryHistoryWeekKey,
  masteryHistoryWeeksBytes,
  masterySkillsAsOf,
  masteryStatusFromCode,
  pruneMasteryHistoryWeeks,
  shiftWeekKey,
  summarizeMasterySkills,
} from '../../functions/shared/masteryHistory.mjs';
import { MASTERY_STATUS } from '../../functions/shared/masteryRule.mjs';
import { weekKeyFor } from '../../functions/shared/weeklyPathGrade.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const DAY = 86400000;
// Wednesday 7 October 2026, mid-morning UTC; its week starts Monday 5 October.
const NOW = Date.parse('2026-10-07T15:00:00Z');
const THIS_WEEK = '2026-10-05';

const mastered = (estimate = 90) => ({
  teksCode: 'A.5A',
  mastery: { estimate, status: 'Mastered' },
  accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 3 },
  dimensions: { dokRepresented: [2, 3] },
});
const developing = (estimate = 60) => ({
  mastery: { estimate, status: 'Developing' },
  accumulator: { eligibleEvents: 3, effectiveWeight: 3, independentSuccesses: 1 },
  dimensions: { dokRepresented: [1, 2] },
});

const history = (weeks) => ({ weeks: Object.fromEntries(Object.entries(weeks).map(([key, skills]) => [key, { skills, updatedAt: 1 }])) });

test('a snapshot is [estimate, status code] per skill, and the status comes from the one Mastered rule', () => {
  const snapshot = masteryHistorySnapshot({
    'A.5A': mastered(88),
    'A.2C': developing(61.6),
    // Stored as "Mastered" by an older build, but only three events and no
    // DOK 3: the rule says Secure, and the history must say what the rule says.
    'A.3B': { mastery: { estimate: 91, status: 'Mastered' }, accumulator: { eligibleEvents: 3, effectiveWeight: 3, independentSuccesses: 3 }, dimensions: { dokRepresented: [1, 2] } },
    // Only modified evidence: started, with no score.
    'A.7A': { mastery: { estimate: null, status: 'Not Enough Evidence' }, accumulator: { eligibleEvents: 0, effectiveWeight: 0 } },
  });
  assert.deepEqual(snapshot, {
    'A.2C': [62, MASTERY_STATUS_CODE[MASTERY_STATUS.DEVELOPING]],
    'A.3B': [91, MASTERY_STATUS_CODE[MASTERY_STATUS.SECURE]],
    'A.5A': [88, MASTERY_STATUS_CODE[MASTERY_STATUS.MASTERED]],
    'A.7A': [null, MASTERY_STATUS_CODE[MASTERY_STATUS.NOT_ENOUGH_EVIDENCE]],
  });
  assert.equal(masteryStatusFromCode(4), MASTERY_STATUS.MASTERED);
  assert.equal(masteryStatusFromCode(null), MASTERY_STATUS.NOT_ENOUGH_EVIDENCE);
  assert.deepEqual(masteryHistorySnapshot(null), {});
});

test('the snapshot lands in the Monday-start week the evidence happened, never earlier than the newest week on record', () => {
  const sunday = Date.parse('2026-10-04T22:00:00Z');
  assert.equal(weekKeyFor(sunday), '2026-09-28');
  assert.equal(masteryHistoryWeekKey({ weeks: {}, occurredAt: sunday, now: NOW }), '2026-09-28');
  assert.equal(masteryHistoryWeekKey({ weeks: {}, occurredAt: NOW - 1000, now: NOW }), THIS_WEEK);
  // A delayed event from last week, processed after this week already has a
  // snapshot: the profile it copies includes this week's answers, so filing it
  // under last week would rewrite last week with knowledge it did not have.
  assert.equal(masteryHistoryWeekKey({ weeks: { [THIS_WEEK]: {} }, occurredAt: sunday, now: NOW }), THIS_WEEK);
  // A clock in the future, or no timestamp at all, is read as now.
  assert.equal(masteryHistoryWeekKey({ weeks: {}, occurredAt: NOW + 30 * DAY, now: NOW }), THIS_WEEK);
  assert.equal(masteryHistoryWeekKey({ weeks: {}, occurredAt: null, now: NOW }), THIS_WEEK);
  // A bad future key on record does not capture today's snapshot.
  assert.equal(masteryHistoryWeekKey({ weeks: { '2027-01-04': {} }, occurredAt: NOW, now: NOW }), THIS_WEEK);
});

test('one entry per week: a second update in the same week replaces it, a new week adds one', () => {
  const evidence = { classId: 'class-a', originTeacherEmail: 't@example.test', authorizedTeacherEmails: ['t@example.test'] };
  const authorization = derivedMasteryAuthorization(evidence);
  const first = buildMasteryHistoryDocument({ profiles: { 'A.5A': developing(55) }, studentId: 'S1', authorization, occurredAt: NOW - 10 * DAY, now: NOW - 10 * DAY });
  assert.deepEqual(Object.keys(first.weeks), ['2026-09-21']);
  const later = buildMasteryHistoryDocument({ existing: first, profiles: { 'A.5A': developing(64) }, studentId: 'S1', authorization, occurredAt: NOW - 1000, now: NOW });
  const again = buildMasteryHistoryDocument({ existing: later, profiles: { 'A.5A': mastered(90) }, studentId: 'S1', authorization, occurredAt: NOW, now: NOW });
  assert.deepEqual(Object.keys(again.weeks), ['2026-09-21', THIS_WEEK]);
  assert.deepEqual(again.weeks['2026-09-21'].skills, { 'A.5A': [55, 2] });
  assert.deepEqual(again.weeks[THIS_WEEK].skills, { 'A.5A': [90, 4] });
  assert.equal(again.weeks[THIS_WEEK].updatedAt, NOW);
  assert.equal(again.studentId, 'S1');
  assert.equal(again.schemaVersion, 1);
});

test('the history carries exactly the authorization the profile gets from the same evidence', () => {
  const evidence = { classId: 'class-b', originClassId: 'class-a', originTeacherEmail: 'origin@example.test', authorizedTeacherEmails: ['origin@example.test', 'now@example.test'] };
  const authorization = derivedMasteryAuthorization(evidence);
  assert.deepEqual(authorization, {
    classId: 'class-b',
    originClassId: 'class-a',
    originTeacherEmail: 'origin@example.test',
    authorizedTeacherEmails: ['origin@example.test', 'now@example.test'],
  });
  // Idempotent, so the trigger can hand the derived object straight on.
  assert.deepEqual(derivedMasteryAuthorization(authorization), authorization);
  const document = buildMasteryHistoryDocument({ profiles: {}, studentId: 'S1', authorization, now: NOW });
  for (const [key, value] of Object.entries(authorization)) assert.deepEqual(document[key], value, key);
  // Missing context derives to "nobody but the student and root", never to "anyone".
  assert.deepEqual(derivedMasteryAuthorization({}), { classId: null, originClassId: null, originTeacherEmail: null, authorizedTeacherEmails: [] });
});

test('bounded: at most 60 weeks, oldest dropped first; a byte budget keeps the newest weeks', () => {
  const weeks = {};
  for (let index = 0; index < 75; index += 1) weeks[shiftWeekKey(THIS_WEEK, -index)] = { skills: { 'A.5A': [index, 2] }, updatedAt: index };
  const pruned = pruneMasteryHistoryWeeks(weeks, { now: NOW });
  const keys = Object.keys(pruned);
  assert.equal(keys.length, MASTERY_HISTORY_MAX_WEEKS);
  assert.equal(keys[keys.length - 1], THIS_WEEK, 'the newest week survives');
  assert.equal(keys[0], shiftWeekKey(THIS_WEEK, -59), 'the oldest kept is the sixtieth week back');
  assert.deepEqual(keys, [...keys].sort(), 'oldest first');

  const tight = pruneMasteryHistoryWeeks(weeks, { now: NOW, maxBytes: 200 });
  assert.ok(masteryHistoryWeeksBytes(tight) <= 200 || Object.keys(tight).length === 1);
  assert.equal(Object.keys(tight).pop(), THIS_WEEK);
  assert.ok(Object.keys(tight).length < 10);
  // Even a budget nothing fits keeps the current week.
  assert.deepEqual(Object.keys(pruneMasteryHistoryWeeks(weeks, { now: NOW, maxBytes: 1 })), [THIS_WEEK]);
  // A week after today can only be a bad clock.
  assert.deepEqual(Object.keys(pruneMasteryHistoryWeeks({ ...weeks, '2027-03-01': {} }, { now: NOW, maxWeeks: 2 })), [shiftWeekKey(THIS_WEEK, -1), THIS_WEEK]);

  // Through the builder: a 61st week pushes the oldest out.
  const full = { weeks: Object.fromEntries(Object.entries(weeks).filter(([key]) => key < THIS_WEEK).slice(-60)) };
  const next = buildMasteryHistoryDocument({ existing: full, profiles: { 'A.5A': mastered() }, studentId: 'S1', now: NOW, occurredAt: NOW });
  assert.equal(Object.keys(next.weeks).length, MASTERY_HISTORY_MAX_WEEKS);
  assert.ok(next.weeks[THIS_WEEK]);
});

test('a heavy but real history stays far inside the budget and the 1 MiB document limit', () => {
  const profiles = {};
  for (let index = 0; index < 120; index += 1) profiles[`A.${index}Z`] = developing(50 + (index % 40));
  let document = null;
  for (let week = 59; week >= 0; week -= 1) {
    const now = NOW - week * 7 * DAY;
    document = buildMasteryHistoryDocument({ existing: document, profiles, studentId: 'S1', occurredAt: now, now });
  }
  assert.equal(Object.keys(document.weeks).length, 60);
  const bytes = masteryHistoryWeeksBytes(document.weeks);
  assert.ok(bytes < MASTERY_HISTORY_MAX_BYTES, `${bytes} bytes`);
  assert.ok(Buffer.byteLength(JSON.stringify(document)) < 1024 * 1024);
});

test('readers: the state as of a week is the newest snapshot at or before it', () => {
  const record = history({
    '2026-09-07': { 'A.5A': [58, 2] },
    '2026-09-21': { 'A.5A': [72, 3], 'A.2C': [40, 1] },
  });
  assert.equal(masterySkillsAsOf(record, '2026-08-31'), null);
  assert.deepEqual(masterySkillsAsOf(record, '2026-09-14'), { weekKey: '2026-09-07', skills: { 'A.5A': { estimate: 58, status: MASTERY_STATUS.DEVELOPING } } });
  assert.equal(masterySkillsAsOf(record, THIS_WEEK).weekKey, '2026-09-21');
  assert.deepEqual(summarizeMasterySkills(masterySkillsAsOf(record, THIS_WEEK).skills), { skills: 2, scored: 2, mastered: 0, averageScore: 56 });
  assert.deepEqual(masteryHistorySeries(record).map((row) => [row.weekKey, row.averageScore]), [['2026-09-07', 58], ['2026-09-21', 56]]);
});

test('this week against four weeks ago: mastered count, like-for-like average, the skills that moved most', () => {
  const record = history({
    '2026-08-31': { 'A.5A': [40, 1] },
    // Four weeks before this week is 7 September; this is the state then.
    '2026-09-07': { 'A.5A': [58, 2], 'A.2C': [80, 3], 'A.3B': [90, 4], 'A.4A': [70, 3] },
    // Three weeks back: newer than the baseline, so it must not be used as one.
    '2026-09-14': { 'A.5A': [66, 2], 'A.2C': [80, 3], 'A.3B': [90, 4], 'A.4A': [70, 3] },
    '2026-09-28': { 'A.5A': [75, 3], 'A.2C': [80, 3], 'A.3B': [92, 4], 'A.4A': [66, 3] },
    [THIS_WEEK]: { 'A.5A': [88, 4], 'A.2C': [86, 4], 'A.3B': [92, 4], 'A.4A': [62, 2], 'A.6A': [45, 1], 'A.7A': [null, 0] },
  });
  const growth = compareMasteryGrowth({ history: record, now: NOW });
  assert.equal(growth.available, true);
  assert.equal(growth.baselineKind, 'weeksAgo');
  assert.equal(growth.baselineWeekKey, '2026-09-07');
  assert.equal(growth.latestWeekKey, THIS_WEEK);
  assert.equal(growth.weeksBetween, 4);
  assert.deepEqual(growth.mastered, { before: 1, after: 3, change: 2 });
  // Like for like over A.5A, A.2C, A.3B, A.4A: (58+80+90+70)/4 → (88+86+92+62)/4.
  assert.deepEqual(growth.sameSkills, { count: 4, before: 75, after: 82, change: 7 });
  // The all-skills average now includes the newly started A.6A at 45 — which is
  // exactly why it is not the number compared.
  assert.equal(growth.current.averageScore, 75);
  assert.deepEqual(growth.movers.map((entry) => [entry.code, entry.change]), [['A.5A', 30], ['A.4A', -8], ['A.2C', 6]]);
  assert.deepEqual(growth.newlyMastered, ['A.2C', 'A.5A']);
  assert.deepEqual(growth.newSkills, ['A.6A'], 'a skill with no score yet is not a new score');
  assert.equal(growth.noRecentPractice, false);
});

test('a history younger than four weeks compares from its first week, and says so', () => {
  const record = history({ '2026-09-21': { 'A.5A': [50, 2] }, [THIS_WEEK]: { 'A.5A': [70, 3] } });
  const growth = compareMasteryGrowth({ history: record, now: NOW });
  assert.equal(growth.available, true);
  assert.equal(growth.baselineKind, 'firstWeek');
  assert.equal(growth.baselineWeekKey, '2026-09-21');
  assert.equal(growth.weeksBetween, 2);
  assert.deepEqual(growth.movers, [{ code: 'A.5A', before: 50, after: 70, change: 20 }]);
});

test('no comparison without two different weeks; nothing recorded lately is said plainly', () => {
  assert.deepEqual(compareMasteryGrowth({ history: null, now: NOW }), { currentWeekKey: THIS_WEEK, weeksBack: 4, available: false, reason: 'no_history' });
  const onlyThisWeek = compareMasteryGrowth({ history: history({ [THIS_WEEK]: { 'A.5A': [70, 3] } }), now: NOW });
  assert.equal(onlyThisWeek.available, false);
  assert.equal(onlyThisWeek.reason, 'not_enough_history');
  assert.equal(onlyThisWeek.current.averageScore, 70);

  const idle = compareMasteryGrowth({ history: history({ '2026-08-03': { 'A.5A': [40, 1] }, '2026-08-24': { 'A.5A': [70, 3] } }), now: NOW });
  assert.equal(idle.available, true);
  assert.equal(idle.noRecentPractice, true);
  assert.equal(idle.baselineWeekKey, '2026-08-24');
  assert.deepEqual(idle.movers, []);
});

// ------------------------------------------------------------------ wiring

const functionsSource = executableSource(read('functions/index.js'));
const trigger = region(functionsSource, 'exports.updateMyMathPathMasteryFromEvidence', 'ASSIGNMENT_AI_USAGE_COLLECTION', 'mastery trigger');

test('the trigger reads the history inside the mastery transaction and writes it from the same profiles', () => {
  assert.match(trigger, /const masteryHistory = await import\("\.\/shared\/masteryHistory\.mjs"\)/);
  assert.match(trigger, /const historyRef = db\.collection\(masteryHistory\.MASTERY_HISTORY_COLLECTION\)\.doc\(studentId\)/);
  assert.equal(MASTERY_HISTORY_COLLECTION, 'studentMasteryHistory');
  const transaction = region(trigger, 'await db.runTransaction(async (transaction) => {', 'transaction.set(applicationRef', 'mastery transaction');
  assert.match(transaction, /transaction\.get\(historyRef\)/, 'read in the transaction, so concurrent updates cannot lose a week');
  const build = region(transaction, 'masteryHistory.buildMasteryHistoryDocument({', '});', 'history build');
  assert.match(build, /existing: historySnapshot\.exists \? historySnapshot\.data\(\) : null/);
  assert.match(build, /^\s*profiles,\s*$/m, 'the snapshot is of the profiles this transaction writes');
  assert.match(build, /\bauthorization,/);
  assert.match(build, /occurredAt: evidence\.occurredAt/);
  // Written whole: a merge would keep weeks the pruning removed.
  assert.match(transaction, /transaction\.set\(historyRef, historyDocument\);/);
  // The history can never be what stops a mastery update.
  assert.match(transaction, /try \{\s*historyDocument = masteryHistory\.buildMasteryHistoryDocument/);
  assert.ok(transaction.indexOf('transaction.set(profileRef') < transaction.indexOf('transaction.set(historyRef'));
});

test('the profile and its history are authorized by one derived object', () => {
  const transaction = region(trigger, 'await db.runTransaction(async (transaction) => {', 'transaction.set(applicationRef', 'mastery transaction');
  assert.match(transaction, /const authorization = masteryHistory\.derivedMasteryAuthorization\(evidence\);/);
  const profileWrite = region(transaction, 'transaction.set(profileRef, {', '}, { merge: true });', 'profile write');
  assert.match(profileWrite, /\.\.\.authorization,/);
  assert.doesNotMatch(profileWrite, /authorizedTeacherEmails:/, 'a second derivation could let the two drift apart');
});

test('a class move re-authorizes the history; erasure and the pre-production reset include it', () => {
  const reauthorize = region(functionsSource, 'async function reauthorizeStudentRecords(', 'async function loadClasses(db)', 'reauthorization');
  assert.match(reauthorize, /for \(const collectionName of \[[^\]]*"studentMasteryHistory"[^\]]*\]\)/);
  assert.match(region(reauthorize, 'for (const collectionName of [', '}\n', 'derived loop'), /auth\.reauthorizeContext\(/);
  const admin = require('../../functions/lib/admin.js');
  assert.equal(admin.STUDENT_DIRECT_COLLECTIONS.includes('studentMasteryHistory'), true, 'permanent deletion erases it');
  assert.equal(admin.PREPRODUCTION_RESET_COLLECTIONS.includes('studentMasteryHistory'), true);
});

test('rules: read exactly as the mastery profile is read; no client write at all', () => {
  const rules = read('firestore.rules');
  const history = region(rules, 'match /studentMasteryHistory/{studentId} {', '}', 'history rules');
  const profile = region(rules, 'match /studentMasteryProfiles/{studentId} {', '}', 'profile rules');
  const readRule = (block) => (block.match(/allow read: if ([^;]+);/) || [])[1];
  assert.equal(readRule(history), readRule(profile));
  assert.match(history, /allow create, update, delete: if false;/);
  assert.doesNotMatch(history, /allow (write|create|update|delete)[^;]*if (?!false)/);
});
