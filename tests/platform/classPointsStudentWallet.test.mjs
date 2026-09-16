import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  activeClassPointAnnouncements,
  classPointAccountId,
  describeClassPointTransaction,
  emptyClassPointAccount,
  normalizeClassPointAccount,
  subscribeToStudentClassPoints,
} from '../../src/platform/classPointsClient.js';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('wallet identity is the exact current student and current class', () => {
  assert.equal(classPointAccountId('student-a', 'class-2'), '9:student-a:class-2');
  assert.notEqual(classPointAccountId('student-b', 'class-2'), classPointAccountId('student-a', 'class-2'));
  assert.notEqual(classPointAccountId('student-a', 'class-3'), classPointAccountId('student-a', 'class-2'));
});

test('missing class membership performs no broad wallet query', () => {
  const hostileDb = new Proxy({}, { get() { throw new Error('Firestore was touched'); } });
  const unsubscribe = subscribeToStudentClassPoints({
    db: hostileDb, studentId: 'student-a', classId: '', onAccount() {}, onHistory() {}, onError() {},
  });
  assert.equal(typeof unsubscribe, 'function');
  unsubscribe();
});

test('student transaction query is bounded and constrained by both private identity fields', async () => {
  const source = await read('src/platform/classPointsClient.js');
  const start = source.indexOf('export const subscribeToStudentClassPoints');
  const end = source.indexOf('export const subscribeToClassPointAnnouncements');
  const walletSubscription = source.slice(start, end);
  assert.match(walletSubscription, /where\('studentId', '==', currentStudentId\)/);
  assert.match(walletSubscription, /where\('classId', '==', currentClassId\)/);
  assert.match(walletSubscription, /orderBy\('createdAt', 'desc'\)/);
  assert.match(walletSubscription, /fsLimit\(STUDENT_CLASS_POINTS_HISTORY_LIMIT\)/);
  assert.doesNotMatch(walletSubscription, /collectionGroup|authorizedTeacherEmails/);
});

test('zero-account state and lifetime totals are safe numeric presentation inputs', () => {
  assert.deepEqual(emptyClassPointAccount(), { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 });
  assert.deepEqual(normalizeClassPointAccount({ balance: 14, lifetimeEarned: 22, lifetimeSpent: 8 }), {
    balance: 14, lifetimeEarned: 22, lifetimeSpent: 8,
  });
  assert.deepEqual(normalizeClassPointAccount(null), emptyClassPointAccount());
});

test('corrections and future redemption preserve distinct ledger semantics', () => {
  const correction = describeClassPointTransaction({ amount: -3, sourceType: 'teacherReversal', reasonLabel: 'Adjusted duplicate award' });
  assert.equal(correction.kind, 'correction');
  assert.equal(correction.kindLabel, 'Teacher correction');
  assert.notEqual(correction.kind, 'spent');
  const redemption = describeClassPointTransaction({ amount: -5, sourceType: 'rewardRedemption', reasonLabel: 'Practice Pass' });
  assert.equal(redemption.kind, 'spent');
  assert.equal(redemption.kindLabel, 'Reward used');
});

test('wallet exposes teacher reason text but no internal ledger metadata', async () => {
  const source = await read('src/components/student/ClassPointsWallet.jsx');
  assert.match(source, /item\.reasonLabel/);
  assert.doesNotMatch(source, /requestId|issuedByUid|authorizedTeacherEmails|transaction\.id|accountId/);
  assert.doesNotMatch(source, /Redeem/);
});

test('teacher preview is isolated before subscriptions and identity points rendering', async () => {
  const app = await read('src/App.jsx');
  const effectStart = app.indexOf("// Teacher Preview and synthetic student views can never cross this role gate.");
  const effectEnd = app.indexOf('}, [user?.role, user?.id, user?.classId]);', effectStart);
  const effect = app.slice(effectStart, effectEnd);
  assert.match(effect, /user\?\.role !== 'student'/);
  assert.match(effect, /subscribeToStudentClassPoints/);
  assert.ok(effect.indexOf("user?.role !== 'student'") < effect.indexOf('subscribeToStudentClassPoints'));
  assert.match(app, /classPointsBalance=\{preview \|\| studentClassPoints\.unavailable \? null/);
});

test('student name remains the strongest identity element and points are secondary', async () => {
  const source = await read('src/components/student/StudentIdentityBar.jsx');
  assert.match(source, /<strong[\s\S]*?\{name\}\{context/);
  assert.match(source, /<span aria-label=\{`\$\{classPointsBalance\} Class Points`\}/);
  assert.ok(source.indexOf('<strong') < source.indexOf('classPointsBalance} Class Points'));
  assert.match(source, /fontSize: 15/);
  assert.match(source, /fontSize: 12/);
});

test('celebrations use only stored public labels, stay bounded, and never become a leaderboard', async () => {
  const [component, client] = await Promise.all([
    read('src/components/student/ClassPointsCelebrations.jsx'),
    read('src/platform/classPointsClient.js'),
  ]);
  assert.match(component, /announcement\.publicStudentLabel/);
  assert.match(component, /announcement\.reasonLabel/);
  assert.doesNotMatch(component, /studentId|balance|fullName|displayName|rank|leaderboard|top points/i);
  assert.match(client, /collection\(db, 'classes', currentClassId, 'classPointAnnouncements'\)/);
  assert.match(client, /limit\(CLASS_POINTS_ANNOUNCEMENT_LIMIT\)/);
});

test('celebration component re-filters expiry at render time so stale announcements cannot linger', async () => {
  const source = await read('src/components/student/ClassPointsCelebrations.jsx');
  assert.match(source, /activeClassPointAnnouncements\(announcements, nowValue\)/);
  assert.match(source, /visibleAnnouncements\.map/);
});

test('expired announcements are filtered without altering privacy-safe labels', () => {
  const current = { publicStudentLabel: 'Jordan H.', expiresAt: { toMillis: () => 2_000 } };
  const expired = { publicStudentLabel: 'Sam R.', expiresAt: { toMillis: () => 999 } };
  assert.deepEqual(activeClassPointAnnouncements([current, expired], 1_000), [current]);
  assert.equal(current.publicStudentLabel, 'Jordan H.');
});

test('Class Points client is read-only and academically isolated', async () => {
  const source = await read('src/platform/classPointsClient.js');
  assert.doesNotMatch(source, /addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction/);
  assert.doesNotMatch(source, /['"](?:grades|mastery|evidence|presence)['"]/);
  assert.match(source, /onSnapshot/);
});
