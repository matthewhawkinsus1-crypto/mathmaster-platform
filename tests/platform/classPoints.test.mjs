import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ClassPointsInputError,
  MAX_AWARD_AMOUNT,
  REASON_CODES,
  SOURCE_TYPES,
  accountId,
  applyTransaction,
  buildAnnouncement,
  buildAwardTransaction,
  buildReversalTransaction,
  emptyAccount,
  publicStudentLabel,
  reversalTransactionId,
  validateAwardInput,
  validateReversalInput,
} from '../../functions/shared/classPoints.mjs';

// Class Points is a server-authoritative reward ledger, so the domain rules —
// what counts as a legal award, how a transaction moves the balance, and what
// a reversal can never do — have to hold with no callable and no emulator in
// the loop. This is the fast, direct proof of them; tests/rules asserts the
// database refuses everything a client should never be allowed to do.

const TEACHER = 'teacher.a@desotoisd.org';

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
  const account = emptyAccount({ studentId: 'S1', classId: 'c', authorizedTeacherEmails: [TEACHER] });
  const award = buildAwardTransaction({
    studentId: 'S1', classId: 'c', amount: 3, reasonCode: 'participation', reasonLabel: 'Participation',
    requestId: 'r1', issuedByUid: 'u1', issuedByEmail: TEACHER, authorizedTeacherEmails: [TEACHER], at: '2026-09-16T00:00:00.000Z',
  });
  const next = applyTransaction(account, award);
  assert.equal(next.balance, 3);
  assert.equal(next.lifetimeEarned, 3);
  assert.equal(next.lifetimeSpent, 0);
  assert.equal(next.updatedAt, '2026-09-16T00:00:00.000Z');
});

test('a reversal restores the balance and undoes the earning, without counting as a spend', () => {
  const account = emptyAccount({ studentId: 'S1', classId: 'c', authorizedTeacherEmails: [TEACHER] });
  const award = buildAwardTransaction({
    studentId: 'S1', classId: 'c', amount: 5, reasonCode: 'teacherBonus', reasonLabel: 'Teacher bonus',
    requestId: 'r1', issuedByUid: 'u1', issuedByEmail: TEACHER, authorizedTeacherEmails: [TEACHER], at: '2026-09-16T00:00:00.000Z',
  });
  const afterAward = applyTransaction(account, award);
  assert.equal(afterAward.balance, 5);

  const reversal = buildReversalTransaction({
    original: { ...award, id: 'tx-1' }, reason: 'Mistaken click', requestId: 'r2',
    issuedByUid: 'u1', issuedByEmail: TEACHER, at: '2026-09-16T00:05:00.000Z',
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
  let account = emptyAccount({ studentId: 'S1', classId: 'c', authorizedTeacherEmails: [TEACHER] });
  const first = buildAwardTransaction({
    studentId: 'S1', classId: 'c', amount: 2, reasonCode: 'participation', reasonLabel: 'Participation',
    requestId: 'r1', issuedByUid: 'u1', issuedByEmail: TEACHER, authorizedTeacherEmails: [TEACHER], at: '2026-09-16T00:00:00.000Z',
  });
  const second = buildAwardTransaction({
    studentId: 'S1', classId: 'c', amount: 4, reasonCode: 'helpedClass', reasonLabel: 'Helped the class',
    requestId: 'r2', issuedByUid: 'u1', issuedByEmail: TEACHER, authorizedTeacherEmails: [TEACHER], at: '2026-09-16T00:01:00.000Z',
  });
  account = applyTransaction(account, first);
  account = applyTransaction(account, second);
  assert.equal(account.balance, 6);
  assert.equal(account.lifetimeEarned, 6);
});

// --- Ids ----------------------------------------------------------------------

test('accountId is stable and scoped to student and class', () => {
  assert.equal(accountId('S1', 'class-a'), 'S1__class-a');
  assert.notEqual(accountId('S1', 'class-a'), accountId('S1', 'class-b'));
  assert.notEqual(accountId('S1', 'class-a'), accountId('S2', 'class-a'));
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
