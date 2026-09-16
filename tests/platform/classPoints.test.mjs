import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ClassPointsInputError,
  MAX_AWARD_AMOUNT,
  REASON_CODES,
  SOURCE_TYPES,
  accountId,
  applyTransaction,
  authorizeClassPointsActor,
  awardPayloadFingerprint,
  buildAnnouncement,
  buildAwardTransaction,
  buildReversalTransaction,
  classPointsAuthorizationContext,
  emptyAccount,
  isReversibleAward,
  publicStudentLabel,
  reauthorizeClassPointsRecord,
  reversalTransactionId,
  validateAwardInput,
  validateReversalInput,
} from '../../functions/shared/classPoints.mjs';

// Class Points is a server-authoritative reward ledger, so the domain rules —
// what counts as a legal award, how a transaction moves the balance, who is
// authorized to act, and what a reversal can never do — have to hold with no
// callable and no emulator in the loop. This is the fast, direct proof of
// them; tests/rules asserts the database refuses everything a client should
// never be allowed to do, and
// tests/platform/classPointsAuthorizationOrder.test.mjs anchors that the
// callables actually call `authorizeClassPointsActor` before returning any
// data, including on an idempotent replay.

const TEACHER_A = 'teacher.a@desotoisd.org';
const TEACHER_B = 'teacher.b@desotoisd.org';

const classA = (overrides = {}) => ({
  classId: 'class-a', teacherOfRecord: TEACHER_A, status: 'active', ...overrides,
});
const classB = (overrides = {}) => ({
  classId: 'class-b', teacherOfRecord: TEACHER_B, status: 'active', ...overrides,
});
const studentInClassA = (overrides = {}) => ({
  classId: 'class-a', assignedTeacherEmail: TEACHER_A, ...overrides,
});

// --- Award input validation --------------------------------------------------

test('a well-formed award request normalizes cleanly', () => {
  const input = validateAwardInput({
    studentId: ' S1 ',
    classId: 'class-a',
    amount: 3,
    reasonCode: 'participation',
    requestId: 'req-1',
    announce: true,
  });
  assert.deepEqual(input, {
    studentId: 'S1',
    classId: 'class-a',
    amount: 3,
    reasonCode: 'participation',
    reasonLabel: 'Participation',
    requestId: 'req-1',
    announce: true,
  });
});

test('a custom reason label overrides the default', () => {
  const input = validateAwardInput({
    studentId: 'S1', classId: 'class-a', amount: 1, reasonCode: 'custom',
    reasonLabel: 'Fixed a classmate\'s sign error', requestId: 'req-2',
  });
  assert.equal(input.reasonLabel, 'Fixed a classmate\'s sign error');
});

test('every reason code has a usable default label', () => {
  REASON_CODES.forEach((reasonCode) => {
    const input = validateAwardInput({
      studentId: 'S1', classId: 'class-a', amount: 1, reasonCode, requestId: 'req',
    });
    assert.ok(input.reasonLabel && input.reasonLabel.length > 0, reasonCode);
  });
});

test('an award with no studentId, classId or requestId is refused', () => {
  assert.throws(() => validateAwardInput({ classId: 'c', amount: 1, reasonCode: 'participation', requestId: 'r' }), ClassPointsInputError);
  assert.throws(() => validateAwardInput({ studentId: 'S1', amount: 1, reasonCode: 'participation', requestId: 'r' }), ClassPointsInputError);
  assert.throws(() => validateAwardInput({ studentId: 'S1', classId: 'c', amount: 1, reasonCode: 'participation' }), ClassPointsInputError);
});

test('an unrecognized reason code is refused', () => {
  assert.throws(
    () => validateAwardInput({ studentId: 'S1', classId: 'c', amount: 1, reasonCode: 'freebie', requestId: 'r' }),
    ClassPointsInputError,
  );
});

test('the amount must be a positive whole number, and ordinary awards cannot be huge', () => {
  const base = { studentId: 'S1', classId: 'c', reasonCode: 'participation', requestId: 'r' };
  assert.throws(() => validateAwardInput({ ...base, amount: 0 }), ClassPointsInputError);
  assert.throws(() => validateAwardInput({ ...base, amount: -2 }), ClassPointsInputError);
  assert.throws(() => validateAwardInput({ ...base, amount: 2.5 }), ClassPointsInputError);
  assert.throws(() => validateAwardInput({ ...base, amount: 5000 }), ClassPointsInputError);
  // The cap itself is a real number a caller can rely on, not a made-up one.
  assert.doesNotThrow(() => validateAwardInput({ ...base, amount: MAX_AWARD_AMOUNT }));
  assert.throws(() => validateAwardInput({ ...base, amount: MAX_AWARD_AMOUNT + 1 }), ClassPointsInputError);
});

test('a reversal request needs a transactionId and a requestId', () => {
  assert.throws(() => validateReversalInput({ requestId: 'r' }), ClassPointsInputError);
  assert.throws(() => validateReversalInput({ transactionId: 't1' }), ClassPointsInputError);
  const input = validateReversalInput({ transactionId: ' t1 ', requestId: 'r1', reason: 'Mistaken click' });
  assert.deepEqual(input, { transactionId: 't1', requestId: 'r1', reason: 'Mistaken click' });
});

// --- Ledger replay: balance, lifetimeEarned, lifetimeSpent -----------------

test('an award adds to both balance and lifetimeEarned', () => {
  const account = emptyAccount({ studentId: 'S1', classId: 'c' });
  const award = buildAwardTransaction({
    studentId: 'S1', classId: 'c', amount: 3, reasonCode: 'participation', reasonLabel: 'Participation',
    requestId: 'r1', issuedByUid: 'u1', issuedByEmail: TEACHER_A,
    originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A], at: '2026-09-16T00:00:00.000Z',
  });
  const next = applyTransaction(account, award);
  assert.equal(next.balance, 3);
  assert.equal(next.lifetimeEarned, 3);
  assert.equal(next.lifetimeSpent, 0);
  assert.equal(next.updatedAt, '2026-09-16T00:00:00.000Z');
});

test('a reversal restores the balance and undoes the earning, without counting as a spend', () => {
  const account = emptyAccount({ studentId: 'S1', classId: 'c' });
  const award = buildAwardTransaction({
    studentId: 'S1', classId: 'c', amount: 5, reasonCode: 'teacherBonus', reasonLabel: 'Teacher bonus',
    requestId: 'r1', issuedByUid: 'u1', issuedByEmail: TEACHER_A,
    originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A], at: '2026-09-16T00:00:00.000Z',
  });
  const afterAward = applyTransaction(account, award);
  assert.equal(afterAward.balance, 5);

  const reversal = buildReversalTransaction({
    original: { ...award, id: 'tx-1' }, reason: 'Mistaken click', requestId: 'r2',
    issuedByUid: 'u1', issuedByEmail: TEACHER_A,
    originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A], at: '2026-09-16T00:05:00.000Z',
  });
  assert.equal(reversal.amount, -5);
  assert.equal(reversal.isReversal, true);
  assert.equal(reversal.reversalOf, 'tx-1');
  assert.equal(reversal.sourceType, SOURCE_TYPES.TEACHER_REVERSAL);

  const afterReversal = applyTransaction(afterAward, reversal);
  assert.equal(afterReversal.balance, 0);
  assert.equal(afterReversal.lifetimeEarned, 0, 'the erroneous earning is undone, not recorded as a spend');
  assert.equal(afterReversal.lifetimeSpent, 0);
});

test('a reversal cannot take the balance below zero', () => {
  const account = { ...emptyAccount({ studentId: 'S1', classId: 'c' }), balance: 2, lifetimeEarned: 2 };
  const reversal = { amount: -5, sourceType: SOURCE_TYPES.TEACHER_REVERSAL };
  assert.throws(() => applyTransaction(account, reversal), ClassPointsInputError);
});

test('a nonzero integer amount is required to replay a transaction', () => {
  const account = emptyAccount({ studentId: 'S1', classId: 'c' });
  assert.throws(() => applyTransaction(account, { amount: 0 }), ClassPointsInputError);
  assert.throws(() => applyTransaction(account, { amount: 1.5 }), ClassPointsInputError);
});

test('two independent awards accumulate correctly', () => {
  let account = emptyAccount({ studentId: 'S1', classId: 'c' });
  const first = buildAwardTransaction({
    studentId: 'S1', classId: 'c', amount: 2, reasonCode: 'participation', reasonLabel: 'Participation',
    requestId: 'r1', issuedByUid: 'u1', issuedByEmail: TEACHER_A,
    originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A], at: '2026-09-16T00:00:00.000Z',
  });
  const second = buildAwardTransaction({
    studentId: 'S1', classId: 'c', amount: 4, reasonCode: 'helpedClass', reasonLabel: 'Helped the class',
    requestId: 'r2', issuedByUid: 'u1', issuedByEmail: TEACHER_A,
    originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A], at: '2026-09-16T00:01:00.000Z',
  });
  account = applyTransaction(account, first);
  account = applyTransaction(account, second);
  assert.equal(account.balance, 6);
  assert.equal(account.lifetimeEarned, 6);
});

// --- Ids ----------------------------------------------------------------------

test('accountId is stable and scoped to student and class', () => {
  assert.equal(accountId('S1', 'class-a'), accountId('S1', 'class-a'));
  assert.notEqual(accountId('S1', 'class-a'), accountId('S1', 'class-b'));
  assert.notEqual(accountId('S1', 'class-a'), accountId('S2', 'class-a'));
});

test('accountId cannot collide across a studentId/classId boundary shift', () => {
  // The adversarial case a fixed "__" separator gets wrong: studentId allows
  // underscores (functions/lib/auth.js STUDENT_ID_PATTERN) and classId can be
  // an admin-typed document id with no character restriction (`saveClass`),
  // so "a__b" + "c" and "a" + "b__c" must never produce the same id.
  assert.notEqual(accountId('a__b', 'c'), accountId('a', 'b__c'));
  // A handful of other boundary shifts, for good measure.
  assert.notEqual(accountId('ab', 'cd'), accountId('a', 'bcd'));
  assert.notEqual(accountId('', 'ab'), accountId('a', 'b'));
});

test('accountId never introduces a forward slash and is not a reserved Firestore id', () => {
  // classId is itself a Firestore document id (functions/index.js's `classes`
  // collection), so it can never legitimately contain "/" — the separator
  // this function adds must not introduce one either, and the id must never
  // accidentally match Firestore's reserved __.*__ pattern.
  const id = accountId('a__b', 'c__d');
  assert.equal(id.includes('/'), false);
  assert.equal(/^__.*__$/.test(id), false);
});

test('the reversal id is deterministic per original transaction, which is what makes a second reversal impossible', () => {
  assert.equal(reversalTransactionId('tx-1'), reversalTransactionId('tx-1'));
  assert.notEqual(reversalTransactionId('tx-1'), reversalTransactionId('tx-2'));
});

// --- Public announcement: name-safe by construction --------------------------

test('the public label is First Name + Last Initial, never a full legal name', () => {
  assert.equal(publicStudentLabel({ firstName: 'Ann', lastName: 'Kim' }), 'Ann K.');
  assert.equal(publicStudentLabel({ displayName: 'Ann Kim' }), 'Ann K.');
  assert.equal(publicStudentLabel({ firstName: 'Cher' }), 'Cher');
  assert.equal(publicStudentLabel({}), 'A student');
  // Never the full surname, however it was supplied.
  assert.ok(!publicStudentLabel({ firstName: 'Ann', lastName: 'Kimberley' }).includes('Kimberley'));
});

test('an announcement carries no studentId and expires after its display window', () => {
  const announcement = buildAnnouncement({
    classId: 'class-a',
    publicStudentLabel: 'Ann K.',
    amount: 2,
    reasonLabel: 'Participation',
    awardTransactionId: 'tx-1',
    at: '2026-09-16T00:00:00.000Z',
  });
  assert.equal(announcement.studentId, undefined);
  assert.equal(announcement.classId, 'class-a');
  assert.equal(announcement.publicStudentLabel, 'Ann K.');
  assert.ok(new Date(announcement.expiresAt).getTime() > new Date(announcement.createdAt).getTime());
});

// --- authorizeClassPointsActor: the ONE decision both callables share ------

test('teacher of record awards their own student in their own class', () => {
  const decision = authorizeClassPointsActor({
    teacherEmail: TEACHER_A, classRecord: classA(), studentRecord: studentInClassA(), requestedClassId: 'class-a',
  });
  assert.deepEqual(decision, { authorized: true });
});

test('a teacher who is not the class\'s teacher of record is denied, even with the exact studentId/classId/requestId a legitimate award used', () => {
  // This is the replay-authorization-bypass scenario: Teacher A awarded
  // Student A in class-a; Teacher B has somehow obtained that exact
  // studentId + classId + requestId tuple and calls the same award. The
  // decision must not depend on requestId at all — it is evaluated from the
  // authoritative class/roster records alone, so Teacher B is refused
  // identically whether or not a matching idempotency record exists.
  const decision = authorizeClassPointsActor({
    teacherEmail: TEACHER_B, classRecord: classA(), studentRecord: studentInClassA(), requestedClassId: 'class-a',
  });
  assert.equal(decision.authorized, false);
  assert.equal(decision.reason, 'permission-denied');
});

test('the original authorized teacher of record can still act on the same student/class', () => {
  const decision = authorizeClassPointsActor({
    teacherEmail: TEACHER_A, classRecord: classA(), studentRecord: studentInClassA(), requestedClassId: 'class-a',
  });
  assert.equal(decision.authorized, true);
});

test('a stale roster field naming a teacher other than the class\'s authoritative teacher of record is refused, for anyone', () => {
  // Student record says Teacher A, but the authoritative class record has
  // moved to Teacher B. Teacher A must not be trusted from the stale roster
  // field alone.
  const staleStudent = studentInClassA({ assignedTeacherEmail: TEACHER_A });
  const currentClass = classA({ teacherOfRecord: TEACHER_B });

  const asStaleTeacher = authorizeClassPointsActor({
    teacherEmail: TEACHER_A, classRecord: currentClass, studentRecord: staleStudent, requestedClassId: 'class-a',
  });
  assert.equal(asStaleTeacher.authorized, false);
  assert.equal(asStaleTeacher.reason, 'failed-precondition');

  // The class's real current teacher is also refused until the roster catches
  // up — a mismatch is treated as "this data is not trustworthy right now",
  // not as license to trust whichever side happens to be asking.
  const asCurrentTeacher = authorizeClassPointsActor({
    teacherEmail: TEACHER_B, classRecord: currentClass, studentRecord: staleStudent, requestedClassId: 'class-a',
  });
  assert.equal(asCurrentTeacher.authorized, false);
  assert.equal(asCurrentTeacher.reason, 'failed-precondition');
});

test('a class whose own teacherOfRecord agrees with the student\'s roster field succeeds', () => {
  const decision = authorizeClassPointsActor({
    teacherEmail: TEACHER_A,
    classRecord: classA({ teacherOfRecord: TEACHER_A }),
    studentRecord: studentInClassA({ assignedTeacherEmail: TEACHER_A }),
    requestedClassId: 'class-a',
  });
  assert.equal(decision.authorized, true);
});

test('a student who belongs to a different (internally consistent) class is refused, regardless of teacher match', () => {
  const decision = authorizeClassPointsActor({
    teacherEmail: TEACHER_A,
    classRecord: classA({ teacherOfRecord: TEACHER_A }),
    studentRecord: { classId: 'class-b', assignedTeacherEmail: TEACHER_B },
    requestedClassId: 'class-a',
  });
  assert.equal(decision.authorized, false);
  assert.equal(decision.reason, 'failed-precondition');
});

test('an archived class refuses an ordinary teacher', () => {
  const decision = authorizeClassPointsActor({
    teacherEmail: TEACHER_A,
    classRecord: classA({ status: 'archived' }),
    studentRecord: studentInClassA(),
    requestedClassId: 'class-a',
  });
  assert.equal(decision.authorized, false);
  assert.equal(decision.reason, 'failed-precondition');
});

test('a missing class or student is refused as not-found, for anyone including the root administrator', () => {
  const missingClass = authorizeClassPointsActor({
    teacherEmail: TEACHER_A, classRecord: null, studentRecord: studentInClassA(), requestedClassId: 'class-a',
  });
  assert.deepEqual({ authorized: missingClass.authorized, reason: missingClass.reason }, { authorized: false, reason: 'not-found' });

  const missingStudent = authorizeClassPointsActor({
    teacherEmail: TEACHER_A, classRecord: classA(), studentRecord: null, requestedClassId: 'class-a',
  });
  assert.deepEqual({ authorized: missingStudent.authorized, reason: missingStudent.reason }, { authorized: false, reason: 'not-found' });

  const adminMissingClass = authorizeClassPointsActor({
    isRootAdmin: true, teacherEmail: 'admin@desotoisd.org', classRecord: null, studentRecord: studentInClassA(), requestedClassId: 'class-a',
  });
  assert.equal(adminMissingClass.authorized, false);
});

test('the root administrator bypasses archived-class, roster-membership and teacher-match business rules', () => {
  const decision = authorizeClassPointsActor({
    isRootAdmin: true,
    teacherEmail: 'admin@desotoisd.org',
    classRecord: classA({ status: 'archived', teacherOfRecord: TEACHER_B }),
    studentRecord: { classId: 'class-does-not-match', assignedTeacherEmail: 'someone-else@desotoisd.org' },
    requestedClassId: 'class-a',
  });
  assert.deepEqual(decision, { authorized: true });
});

// --- isReversibleAward: only a live teacher award can be targeted -----------

test('a live, un-reversed positive teacherAward is reversible', () => {
  assert.equal(isReversibleAward({ sourceType: SOURCE_TYPES.TEACHER_AWARD, isReversal: false, amount: 3 }), true);
});

test('a reversal, a non-positive amount, or a non-teacherAward source is never reversible', () => {
  assert.equal(isReversibleAward({ sourceType: SOURCE_TYPES.TEACHER_REVERSAL, isReversal: true, amount: -3 }), false);
  assert.equal(isReversibleAward({ sourceType: SOURCE_TYPES.TEACHER_AWARD, isReversal: true, amount: 3 }), false, 'a transaction cannot be both an award and already-a-reversal');
  assert.equal(isReversibleAward({ sourceType: SOURCE_TYPES.TEACHER_AWARD, isReversal: false, amount: 0 }), false);
  assert.equal(isReversibleAward({ sourceType: SOURCE_TYPES.TEACHER_AWARD, isReversal: false, amount: -3 }), false);
  // Future transaction shapes the schema already anticipates must not be
  // reversible through this teacher-award-only path.
  assert.equal(isReversibleAward({ sourceType: SOURCE_TYPES.REWARD_REDEMPTION, isReversal: false, amount: -20 }), false);
  assert.equal(isReversibleAward({ sourceType: SOURCE_TYPES.LIVE_CHALLENGE_ACHIEVEMENT, isReversal: false, amount: 5 }), false);
  assert.equal(isReversibleAward({}), false);
});

// --- awardPayloadFingerprint: a requestId reused for a different award -----

test('the same award inputs always produce the same fingerprint', () => {
  const input = {
    studentId: 'S1', classId: 'class-a', amount: 1, reasonCode: 'participation', reasonLabel: 'Participation', announce: false,
  };
  assert.equal(awardPayloadFingerprint(input), awardPayloadFingerprint({ ...input }));
});

test('a different amount, reason, label, or announce flag changes the fingerprint', () => {
  const base = {
    studentId: 'S1', classId: 'class-a', amount: 1, reasonCode: 'participation', reasonLabel: 'Participation', announce: false,
  };
  const baseline = awardPayloadFingerprint(base);
  assert.notEqual(awardPayloadFingerprint({ ...base, amount: 10 }), baseline);
  assert.notEqual(awardPayloadFingerprint({ ...base, reasonCode: 'teacherBonus' }), baseline);
  assert.notEqual(awardPayloadFingerprint({ ...base, reasonLabel: 'Different label' }), baseline);
  assert.notEqual(awardPayloadFingerprint({ ...base, announce: true }), baseline);
});

// --- classPointsAuthorizationContext & reauthorizeClassPointsRecord --------

test('a brand new record is originated at whoever currently teaches the class', () => {
  const context = classPointsAuthorizationContext({ classRecord: classA(), existingRecord: null });
  assert.deepEqual(context, { originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A] });
});

test('an existing record keeps its origin teacher and gains the new teacher of record', () => {
  const existing = { originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A] };
  const context = classPointsAuthorizationContext({ classRecord: classA({ teacherOfRecord: TEACHER_B }), existingRecord: existing });
  assert.equal(context.originTeacherEmail, TEACHER_A, 'the original issuing teacher is never dropped');
  assert.deepEqual([...context.authorizedTeacherEmails].sort(), [TEACHER_A, TEACHER_B].sort());
});

test('same class, teacher changes A to B: the new teacher gains access and the record\'s classId never moves', () => {
  const record = {
    schemaVersion: 1, studentId: 'S1', classId: 'class-a', balance: 6, lifetimeEarned: 6, lifetimeSpent: 0,
    originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A],
  };
  const change = reauthorizeClassPointsRecord(record, { classRecord: classA({ teacherOfRecord: TEACHER_B }) });
  assert.ok(change, 'a change should be produced when the teacher of record actually changed');
  assert.equal(change.originTeacherEmail, TEACHER_A, 'historical accountability: the original issuing teacher keeps access');
  assert.deepEqual([...change.authorizedTeacherEmails].sort(), [TEACHER_A, TEACHER_B].sort());
  // The change must never carry classId or balance — reauthorization grants
  // access, it never touches what class a wallet belongs to or what it holds.
  assert.equal('classId' in change, false);
  assert.equal('balance' in change, false);
});

test('already-authorized access reauthorizes to a no-op', () => {
  const record = {
    classId: 'class-a', originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A],
  };
  const change = reauthorizeClassPointsRecord(record, { classRecord: classA({ teacherOfRecord: TEACHER_A }) });
  assert.equal(change, null);
});

test('a student moving to a DIFFERENT class leaves the old class\'s wallet and history completely untouched', () => {
  // The record below is class-a's wallet, worth 6 points. The student has
  // moved to class-b, so `setStudentClass` calls reauthorization with class-b
  // as `classRecord`. Class Points must not migrate: this must return null,
  // meaning nothing about the class-a record is written — not its classId,
  // not its balance, not its access list.
  const classAWallet = {
    schemaVersion: 1, studentId: 'S1', classId: 'class-a', balance: 6, lifetimeEarned: 6, lifetimeSpent: 0,
    originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A],
  };
  const change = reauthorizeClassPointsRecord(classAWallet, { classRecord: classB({ teacherOfRecord: TEACHER_B }) });
  assert.equal(change, null, 'a different class\'s wallet must never be rewritten toward the student\'s new class');
});

test('removing a student from all classes (classRecord null) never touches Class Points records', () => {
  const record = { classId: 'class-a', originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A] };
  assert.equal(reauthorizeClassPointsRecord(record, { classRecord: null }), null);
  assert.equal(reauthorizeClassPointsRecord(record, {}), null);
});

test('balances never transfer between classes: reauthorization output never carries an account\'s balance fields', () => {
  const record = {
    classId: 'class-a', balance: 40, lifetimeEarned: 40, lifetimeSpent: 0,
    originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A],
  };
  const change = reauthorizeClassPointsRecord(record, { classRecord: classA({ teacherOfRecord: TEACHER_B }) });
  assert.ok(change);
  assert.equal('balance' in change, false);
  assert.equal('lifetimeEarned' in change, false);
  assert.equal('lifetimeSpent' in change, false);
});
