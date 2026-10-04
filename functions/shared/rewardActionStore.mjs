import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import {
  accountId,
  applyTransaction,
  authorizeClassPointsActor,
  classPointsAuthorizationContext,
  emptyAccount,
} from './classPoints.mjs';
import {
  PRACTICE_PASS_PAYMENT,
  PRACTICE_PASS_REWARD_CODE,
  REDEMPTION_STATUS,
  buildPracticePassLedgerTransaction,
  buildPracticePassRedemption,
  buildPracticePassRefundTransaction,
  evaluatePracticePassEligibility,
  isActivePracticePassRedemption,
  practicePassRedemptionId,
  practicePassRefundTransactionId,
  redemptionCycle,
  safeAssignmentTitle,
  summarizeReversedRedemption,
} from './classPointRewards.mjs';
import {
  GRANT_OUTCOME,
  REWARD_GRANTS_COLLECTION,
  REWARD_GRANT_STATUS,
  REWARD_SOURCE,
  buildRewardGrant,
  getRewardDefinition,
  pickGrantToSpend,
  planGrantTransition,
} from './rewardGrants.mjs';
import { normalizeQuestionRecord } from './attemptPolicy.mjs';
import { STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION, studentAssignmentOverrideId } from './studentAssignmentOverrides.mjs';
import { explainStudentChallengeRewards } from './rewardDiagnostics.mjs';

/*
 * EVERY REWARD ACTION A PERSON TAKES, APPLIED ATOMICALLY (server only).
 *
 * The callables in functions/index.js are thin: they verify who is calling and
 * hand over. Everything that reads, decides and writes lives here, inside one
 * Firestore transaction per action, so it can be exercised against the
 * emulator exactly as production runs it (tests/integration/rewardActions.test.mjs).
 *
 *   redeemPracticePass        a student uses a Practice Pass — paid with a pass
 *                             they hold, or with 100 Class Points
 *   undoPracticePassRedemption a teacher undoes a use; the waiver is lifted and
 *                             the pass (or the points) comes back
 *   awardRewardGrant          a teacher hands a student a pass or a badge
 *   revokeRewardGrant         a teacher takes back an unused reward
 *
 * THE INVARIANT: the benefit and its payment are one write. A Practice Pass is
 * the classPointRewardRedemptions document every grading consumer reads; the
 * transaction that writes it is the same one that marks the pass redeemed or
 * debits the points. No commit can leave one without the other.
 *
 * Errors are RewardActionError with an HttpsError code and a message written
 * for the person who will read it.
 */

export const COLLECTIONS = Object.freeze({
  REDEMPTIONS: 'classPointRewardRedemptions',
  ACCOUNTS: 'classPointAccounts',
  TRANSACTIONS: 'classPointTransactions',
  GRANTS: REWARD_GRANTS_COLLECTION,
});

export class RewardActionError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'RewardActionError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail) => { throw new RewardActionError(code, message, detail); };
const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const DAY_MS = 86_400_000;

/** How many days a returned pass is good for, at least, when its original expiry has passed or is close. */
export const RESTORED_PASS_MIN_DAYS = 7;
export const MAX_TEACHER_GRANT_EXPIRY_DAYS = 365;

/** The grant id of a teacher's award: one per (class, student, requestId), so a retried award is the same grant. */
export const teacherGrantId = ({ classId, studentId, requestId }) => `tgr_${sha(`${classId}\u0000${studentId}\u0000${requestId}`).slice(0, 40)}`;

/** The grant id of the pass a teacher's undo gives back. One per undone use. */
export const restoredGrantId = (redemptionId, cycle = 0) => `rgr_${sha(`${redemptionId}\u0000${Number(cycle) || 0}`).slice(0, 40)}`;

/*
 * Student-facing reasons a grant cannot be spent, from planGrantTransition's
 * codes. Never a raw code on a student's screen.
 */
const GRANT_REJECTION_MESSAGES = Object.freeze({
  already_redeemed: 'That pass was already used.',
  already_revoked: 'Your teacher took that pass back.',
  already_expired: 'That pass has expired.',
  expired: 'That pass has expired.',
});

const rosterAuthorization = ({ teacherEmail, isRootAdmin, classRecord, studentRecord, classId }) => {
  const decision = authorizeClassPointsActor({
    isRootAdmin, teacherEmail, classRecord, studentRecord, requestedClassId: classId,
  });
  if (!decision.authorized) fail(decision.reason, decision.message);
};

async function readClassAndStudent(transaction, db, { classId, studentId }) {
  const [classSnap, gradeSnap] = await Promise.all([
    transaction.get(db.collection('classes').doc(classId)),
    transaction.get(db.collection('grades').doc(studentId)),
  ]);
  return {
    classRecord: classSnap.exists ? { classId: classSnap.id, ...classSnap.data() } : null,
    studentRecord: gradeSnap.exists ? gradeSnap.data() : null,
  };
}

/**
 * A student uses a Practice Pass on one assignment.
 *
 * `payWith`: 'pass' spends a pass the student holds (the soonest-expiring one,
 * or `preferredGrantId` while it is still usable); 'classPoints' spends 100
 * points. Retrying the same assignment — a double click, a refresh, a second
 * tab — finds the existing waiver and returns it as a replay; nothing is spent
 * twice. Two tabs using passes on two DIFFERENT assignments spend two
 * different passes, or the second is refused when only one is left.
 *
 * `assess({ assignment, classId })` supplies the facts only functions/index.js
 * can compute (audience, Test Cycle, Practice's current-content indices):
 * { assignedToClass, isTestCycleAssignment, practiceIndices }.
 */
export async function redeemPracticePass(db, {
  studentId,
  assignmentId,
  payWith = PRACTICE_PASS_PAYMENT.CLASS_POINTS,
  preferredGrantId = null,
  actor = {},
  assess,
  nowMs = Date.now(),
} = {}) {
  const student = cleanText(studentId, 64);
  const assignmentKey = cleanText(assignmentId, 200);
  if (!student) fail('permission-denied', 'Sign in as a student to use a reward.');
  if (!assignmentKey) fail('invalid-argument', 'Choose an assignment.');
  if (![PRACTICE_PASS_PAYMENT.CLASS_POINTS, PRACTICE_PASS_PAYMENT.PASS].includes(payWith)) {
    fail('invalid-argument', 'Choose how to pay for the Practice Pass.');
  }
  if (typeof assess !== 'function') throw new TypeError('redeemPracticePass needs an assignment assessor.');

  const gradeRef = db.collection('grades').doc(student);
  const assignmentRef = db.collection('assignments').doc(assignmentKey);
  // The student's own controls on this assignment (an extension keeps it
  // credit-eligible), read here with the server's authority — never taken
  // from the request.
  const overrideRef = db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION)
    .doc(studentAssignmentOverrideId(student, assignmentKey));

  return db.runTransaction(async (transaction) => {
    const [gradeSnap, assignmentSnap, overrideSnap] = await Promise.all([
      transaction.get(gradeRef), transaction.get(assignmentRef), transaction.get(overrideRef),
    ]);
    if (!gradeSnap.exists) fail('not-found', 'Your student record was not found.');
    const gradeData = gradeSnap.data() || {};
    const classId = cleanText(gradeData.classId, 120);
    if (!classId) fail('failed-precondition', 'You are not currently placed in a class.');
    if (!assignmentSnap.exists) fail('not-found', 'That assignment was not found.');
    const assignment = { id: assignmentSnap.id, ...assignmentSnap.data() };

    const redemptionId = practicePassRedemptionId({
      studentId: student, classId, assignmentId: assignmentKey, rewardCode: PRACTICE_PASS_REWARD_CODE,
    });
    const redemptionRef = db.collection(COLLECTIONS.REDEMPTIONS).doc(redemptionId);
    const accountRef = db.collection(COLLECTIONS.ACCOUNTS).doc(accountId(student, classId));
    const classRef = db.collection('classes').doc(classId);
    const passesQuery = db.collection(COLLECTIONS.GRANTS)
      .where('studentId', '==', student)
      .where('classId', '==', classId)
      .where('rewardCode', '==', PRACTICE_PASS_REWARD_CODE)
      .where('status', '==', REWARD_GRANT_STATUS.AVAILABLE);
    const [redemptionSnap, accountSnap, classSnap, passesSnap] = await Promise.all([
      transaction.get(redemptionRef),
      transaction.get(accountRef),
      transaction.get(classRef),
      payWith === PRACTICE_PASS_PAYMENT.PASS ? transaction.get(passesQuery) : Promise.resolve(null),
    ]);
    const existing = redemptionSnap.exists ? redemptionSnap.data() : null;

    // The same assignment again: Practice is already excused. Whatever the
    // student tried to pay with this time was not spent.
    if (isActivePracticePassRedemption(existing)) {
      return {
        outcome: 'alreadyExcused',
        replay: true,
        redemptionId,
        redemption: existing,
        account: accountSnap.exists ? accountSnap.data() : null,
      };
    }

    const classRecord = classSnap.exists ? { classId: classSnap.id, ...classSnap.data() } : null;
    /*
     * THE CLASS/ROSTER MUST BE INTERNALLY CONSISTENT BEFORE A NEW REDEMPTION.
     *
     * This reuses `authorizeClassPointsActor` -- the exact consistency rule
     * awardClassPoints/reverseClassPointAward enforce -- for a different
     * purpose: there is no teacher actor here, so the class's OWN
     * teacherOfRecord is passed as the "actor", which makes the identity check
     * a no-op while still requiring that the class exists, is not archived,
     * the student's own grade record names this same class, the class has a
     * teacherOfRecord, and the roster's assignedTeacherEmail agrees with it.
     * Any of those failing means the roster is not in a state a redemption
     * should spend a pass or real points against. A replay of an existing
     * waiver (above) is exempt: it spends nothing.
     */
    const consistency = authorizeClassPointsActor({
      isRootAdmin: false,
      teacherEmail: classRecord?.teacherOfRecord,
      classRecord,
      studentRecord: gradeData,
      requestedClassId: classId,
    });
    if (!consistency.authorized) fail(consistency.reason, consistency.message);

    const { assignedToClass, isTestCycleAssignment, practiceIndices } = assess({ assignment, classId }) || {};
    const indices = Array.isArray(practiceIndices) ? practiceIndices : [];
    const tracker = gradeData?.gradesByAssignment?.[assignmentKey] || {};
    // Authoritative evidence only — never the existence of a local draft.
    const hasCreditBearingAttempt = indices.some((index) => {
      const record = normalizeQuestionRecord(tracker?.[String(index)] ?? tracker?.[index]);
      return Number(record.totalAttempts) > 0;
    });
    const account = accountSnap.exists ? accountSnap.data() : emptyAccount({ studentId: student, classId });

    const decision = evaluatePracticePassEligibility({
      assignment,
      assignedToClass: Boolean(assignedToClass),
      isTestCycleAssignment: Boolean(isTestCycleAssignment),
      practiceIndices: indices,
      hasCreditBearingAttempt,
      alreadyRedeemed: false,
      balance: account.balance,
      nowValue: nowMs,
      studentId: student,
      privateOverride: overrideSnap.exists ? overrideSnap.data() : null,
      paymentMethod: payWith,
    });
    if (!decision.eligible) fail('failed-precondition', decision.message, { reason: decision.code });

    const at = new Date(nowMs).toISOString();
    const assignmentTitle = safeAssignmentTitle(assignment);
    const previousRedemptions = existing
      ? [...(Array.isArray(existing.previousRedemptions) ? existing.previousRedemptions : []), summarizeReversedRedemption(existing)]
      : [];

    if (payWith === PRACTICE_PASS_PAYMENT.PASS) {
      const held = passesSnap.docs.map((entry) => ({ grantId: entry.id, ...entry.data() }));
      const preferred = preferredGrantId ? held.find((grant) => grant.grantId === preferredGrantId) : null;
      const chosen = (preferred && pickGrantToSpend([preferred], PRACTICE_PASS_REWARD_CODE, nowMs)) || pickGrantToSpend(held, PRACTICE_PASS_REWARD_CODE, nowMs);
      if (!chosen) fail('failed-precondition', 'You do not have a Practice Pass to use right now.', { reason: 'no-pass' });

      const plan = planGrantTransition(chosen, {
        to: REWARD_GRANT_STATUS.REDEEMED,
        at,
        actor: { type: 'student' },
        redemption: {
          redemptionId,
          targetKind: getRewardDefinition(PRACTICE_PASS_REWARD_CODE).redeemsAgainst,
          targetId: assignmentKey,
          targetLabel: assignmentTitle,
        },
      }, nowMs);
      if (plan.outcome !== GRANT_OUTCOME.APPLY) {
        fail('failed-precondition', GRANT_REJECTION_MESSAGES[plan.code] || plan.message, { reason: plan.code });
      }
      const redemption = buildPracticePassRedemption({
        redemptionId,
        studentId: student,
        classId,
        assignmentId: assignmentKey,
        assignmentTitle,
        at,
        paidWith: PRACTICE_PASS_PAYMENT.PASS,
        grantId: chosen.grantId,
        previousRedemptions,
      });
      transaction.set(db.collection(COLLECTIONS.GRANTS).doc(chosen.grantId), { ...plan.next, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(redemptionRef, redemption);
      return {
        outcome: 'redeemed', replay: false, redemptionId, redemption, grantId: chosen.grantId, account: accountSnap.exists ? account : null,
      };
    }

    const authorization = classPointsAuthorizationContext({ classRecord, existingRecord: accountSnap.exists ? account : null });
    const transactionRef = db.collection(COLLECTIONS.TRANSACTIONS).doc();
    const ledgerTransaction = buildPracticePassLedgerTransaction({
      studentId: student,
      classId,
      assignmentId: assignmentKey,
      assignmentTitle,
      redemptionId,
      issuedByUid: actor?.uid || null,
      issuedByEmail: actor?.email || null,
      originTeacherEmail: authorization.originTeacherEmail,
      authorizedTeacherEmails: authorization.authorizedTeacherEmails,
      at,
    });
    let nextAccount;
    try {
      nextAccount = applyTransaction(account, ledgerTransaction);
    } catch (error) {
      fail('failed-precondition', error?.message || 'You do not have enough Class Points.');
    }
    nextAccount = { ...nextAccount, ...authorization };
    const redemption = buildPracticePassRedemption({
      redemptionId,
      studentId: student,
      classId,
      assignmentId: assignmentKey,
      assignmentTitle,
      transactionId: transactionRef.id,
      at,
      paidWith: PRACTICE_PASS_PAYMENT.CLASS_POINTS,
      previousRedemptions,
    });
    transaction.set(transactionRef, ledgerTransaction);
    transaction.set(accountRef, nextAccount);
    transaction.set(redemptionRef, redemption);
    return {
      outcome: 'redeemed', replay: false, redemptionId, redemption, account: nextAccount, transaction: ledgerTransaction,
    };
  });
}

/**
 * A teacher undoes a Practice Pass use. Practice is no longer excused, and
 * the student gets back what they paid: a pass (a new grant pointing at the
 * one they spent — the spent one stays redeemed, because terminal grants never
 * change) or the 100 Class Points (a refund transaction). The redemption
 * document stays as history with status `reversed`.
 *
 * Retrying the same undo is a replay. A use made AFTER an undo is a new cycle
 * with its own refund id, so undoing it again is a new, separate undo.
 */
export async function undoPracticePassRedemption(db, {
  redemptionId,
  reason,
  teacher = {},
  nowMs = Date.now(),
} = {}) {
  const id = cleanText(redemptionId, 200);
  if (!id) fail('invalid-argument', 'Choose the Practice Pass use to undo.');
  const cleanReason = cleanText(reason, 300);
  if (!cleanReason) fail('invalid-argument', 'Add a short reason. The student will see it.');
  const teacherEmail = cleanText(teacher.email, 200).toLowerCase();
  if (!teacherEmail) fail('permission-denied', 'A verified teacher email is required.');

  const redemptionRef = db.collection(COLLECTIONS.REDEMPTIONS).doc(id);
  return db.runTransaction(async (transaction) => {
    const redemptionSnap = await transaction.get(redemptionRef);
    if (!redemptionSnap.exists) fail('not-found', 'That Practice Pass use was not found.');
    const redemption = redemptionSnap.data() || {};
    const classId = cleanText(redemption.classId, 120);
    const studentId = cleanText(redemption.studentId, 64);
    const { classRecord, studentRecord } = await readClassAndStudent(transaction, db, { classId, studentId });
    // Authorization before ANY branch that returns data, the replay included.
    rosterAuthorization({ teacherEmail, isRootAdmin: teacher.isRootAdmin === true, classRecord, studentRecord, classId });

    if (redemption.status === REDEMPTION_STATUS.REVERSED) {
      return { outcome: 'alreadyApplied', redemptionId: id, redemption };
    }

    const cycle = redemptionCycle(redemption);
    const at = new Date(nowMs).toISOString();
    const paidWith = redemption.paidWith || PRACTICE_PASS_PAYMENT.CLASS_POINTS;
    let refund;

    if (paidWith === PRACTICE_PASS_PAYMENT.PASS) {
      const restoredId = restoredGrantId(id, cycle);
      const [restoredSnap, originalSnap] = await Promise.all([
        transaction.get(db.collection(COLLECTIONS.GRANTS).doc(restoredId)),
        redemption.grantId ? transaction.get(db.collection(COLLECTIONS.GRANTS).doc(String(redemption.grantId))) : Promise.resolve(null),
      ]);
      const original = originalSnap?.exists ? originalSnap.data() : null;
      const floor = nowMs + RESTORED_PASS_MIN_DAYS * DAY_MS;
      const originalExpiry = original?.expiresAt ? Date.parse(original.expiresAt) : null;
      const expiresAt = original?.expiresAt
        ? new Date(Number.isFinite(originalExpiry) ? Math.max(originalExpiry, floor) : floor).toISOString()
        : null;
      if (!restoredSnap.exists) {
        const authorization = classPointsAuthorizationContext({ classRecord, existingRecord: original });
        transaction.set(db.collection(COLLECTIONS.GRANTS).doc(restoredId), {
          ...buildRewardGrant({
            grantId: restoredId,
            rewardCode: PRACTICE_PASS_REWARD_CODE,
            label: original?.label || null,
            studentId,
            classId,
            source: { type: REWARD_SOURCE.RESTORED, id, restoresGrantId: redemption.grantId || null },
            awardedAt: at,
            expiresAt,
            originTeacherEmail: authorization.originTeacherEmail,
            authorizedTeacherEmails: authorization.authorizedTeacherEmails,
            actor: { type: 'teacher', email: teacherEmail },
            note: cleanReason,
          }),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      refund = { kind: PRACTICE_PASS_PAYMENT.PASS, grantId: restoredId };
    } else {
      const refundId = practicePassRefundTransactionId(id, cycle);
      const refundRef = db.collection(COLLECTIONS.TRANSACTIONS).doc(refundId);
      const accountRef = db.collection(COLLECTIONS.ACCOUNTS).doc(accountId(studentId, classId));
      const [refundSnap, accountSnap] = await Promise.all([transaction.get(refundRef), transaction.get(accountRef)]);
      if (!refundSnap.exists) {
        const account = accountSnap.exists ? accountSnap.data() : emptyAccount({ studentId, classId });
        const authorization = classPointsAuthorizationContext({ classRecord, existingRecord: accountSnap.exists ? account : null });
        const refundTransaction = buildPracticePassRefundTransaction({
          redemption: { ...redemption, redemptionId: id },
          reason: cleanReason,
          issuedByUid: teacher.uid || null,
          issuedByEmail: teacherEmail,
          originTeacherEmail: authorization.originTeacherEmail,
          authorizedTeacherEmails: authorization.authorizedTeacherEmails,
          at,
        });
        const nextAccount = { ...applyTransaction(account, refundTransaction), ...authorization };
        transaction.set(refundRef, refundTransaction);
        transaction.set(accountRef, nextAccount);
      }
      refund = { kind: PRACTICE_PASS_PAYMENT.CLASS_POINTS, transactionId: refundId, amount: Math.abs(Number(redemption.cost) || 0) };
    }

    const next = {
      ...redemption,
      status: REDEMPTION_STATUS.REVERSED,
      reversedAt: at,
      reversal: { actorEmail: teacherEmail, reason: cleanReason },
      refund,
    };
    transaction.set(redemptionRef, next);
    return { outcome: 'undone', redemptionId: id, redemption: next };
  });
}

/**
 * A teacher hands one student a reward. One requestId is one award: a retry
 * lands on the same grant document and is answered as a replay; a requestId
 * reused for a different reward is refused.
 */
export async function awardRewardGrant(db, {
  studentId,
  classId,
  rewardCode,
  label = null,
  note = null,
  expiresInDays = null,
  requestId,
  teacher = {},
  nowMs = Date.now(),
} = {}) {
  const student = cleanText(studentId, 64);
  const cls = cleanText(classId, 120);
  const request = cleanText(requestId, 200);
  if (!student || !cls) fail('invalid-argument', 'Choose a student and a class.');
  if (!request) fail('invalid-argument', 'A request identifier is required so a retry cannot award twice.');
  const definition = getRewardDefinition(rewardCode);
  if (!definition?.grantable || !definition.teacherAwardable) fail('invalid-argument', 'Choose a reward a teacher can give.');
  const badgeLabel = cleanText(label, 40);
  if (definition.category === 'badge' && !badgeLabel) fail('invalid-argument', 'Name the badge, for example "Great explainer".');
  let days = null;
  if (expiresInDays !== null && expiresInDays !== undefined && expiresInDays !== '') {
    days = Number(expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > MAX_TEACHER_GRANT_EXPIRY_DAYS) {
      fail('invalid-argument', `A reward can last from 1 to ${MAX_TEACHER_GRANT_EXPIRY_DAYS} days, or have no end date.`);
    }
  }
  const teacherEmail = cleanText(teacher.email, 200).toLowerCase();
  if (!teacherEmail) fail('permission-denied', 'A verified teacher email is required.');

  const grantId = teacherGrantId({ classId: cls, studentId: student, requestId: request });
  const grantRef = db.collection(COLLECTIONS.GRANTS).doc(grantId);
  return db.runTransaction(async (transaction) => {
    const { classRecord, studentRecord } = await readClassAndStudent(transaction, db, { classId: cls, studentId: student });
    const grantSnap = await transaction.get(grantRef);
    rosterAuthorization({ teacherEmail, isRootAdmin: teacher.isRootAdmin === true, classRecord, studentRecord, classId: cls });

    if (grantSnap.exists) {
      const prior = grantSnap.data() || {};
      if (prior.rewardCode !== definition.rewardCode || prior.studentId !== student) {
        fail('failed-precondition', 'This request was already used for a different reward.');
      }
      return { outcome: 'alreadyApplied', replay: true, grantId, grant: prior };
    }

    const authorization = classPointsAuthorizationContext({ classRecord, existingRecord: null });
    const at = new Date(nowMs).toISOString();
    const grant = {
      ...buildRewardGrant({
        grantId,
        rewardCode: definition.rewardCode,
        badgeCode: definition.category === 'badge' ? 'teacher' : null,
        label: badgeLabel || null,
        studentId: student,
        classId: cls,
        source: { type: REWARD_SOURCE.TEACHER, id: teacherEmail },
        awardedAt: at,
        expiresAt: days ? new Date(nowMs + days * DAY_MS).toISOString() : null,
        originTeacherEmail: authorization.originTeacherEmail,
        authorizedTeacherEmails: authorization.authorizedTeacherEmails,
        actor: { type: 'teacher', email: teacherEmail },
        note,
      }),
      requestId: request,
    };
    transaction.set(grantRef, { ...grant, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { outcome: 'awarded', replay: false, grantId, grant };
  });
}

/**
 * A teacher takes back an unused reward — a Challenge award that went to the
 * wrong student, a pass given by mistake. The grant stays as history with
 * status `revoked` and the teacher's reason. A used, expired or already
 * revoked reward cannot be taken back (undo the USE instead).
 *
 * Because the grant document still exists, the Live Challenge delivery that
 * issued it will never issue it again: delivery checks existence.
 */
export async function revokeRewardGrant(db, {
  grantId,
  reason,
  teacher = {},
  nowMs = Date.now(),
} = {}) {
  const id = cleanText(grantId, 200);
  if (!id) fail('invalid-argument', 'Choose the reward to take back.');
  const cleanReason = cleanText(reason, 300);
  if (!cleanReason) fail('invalid-argument', 'Add a short reason. The student will see it.');
  const teacherEmail = cleanText(teacher.email, 200).toLowerCase();
  if (!teacherEmail) fail('permission-denied', 'A verified teacher email is required.');

  const grantRef = db.collection(COLLECTIONS.GRANTS).doc(id);
  return db.runTransaction(async (transaction) => {
    const grantSnap = await transaction.get(grantRef);
    if (!grantSnap.exists) fail('not-found', 'That reward was not found.');
    const grant = grantSnap.data() || {};
    const classId = cleanText(grant.classId, 120);
    const { classRecord, studentRecord } = await readClassAndStudent(transaction, db, { classId, studentId: cleanText(grant.studentId, 64) });
    rosterAuthorization({ teacherEmail, isRootAdmin: teacher.isRootAdmin === true, classRecord, studentRecord, classId });

    const plan = planGrantTransition(grant, {
      to: REWARD_GRANT_STATUS.REVOKED,
      at: new Date(nowMs).toISOString(),
      reason: cleanReason,
      actor: { type: teacher.isRootAdmin === true ? 'admin' : 'teacher', email: teacherEmail },
    }, nowMs);
    if (plan.outcome === GRANT_OUTCOME.REJECT) {
      const message = plan.code === 'already_redeemed'
        ? 'This reward was already used. Undo the use instead.'
        : plan.code === 'already_expired' ? 'This reward already expired.' : plan.message;
      fail('failed-precondition', message, { reason: plan.code });
    }
    if (plan.outcome === GRANT_OUTCOME.ALREADY_APPLIED) return { outcome: 'alreadyApplied', grantId: id, grant };
    transaction.set(grantRef, { ...plan.next, updatedAt: FieldValue.serverTimestamp() });
    return { outcome: 'revoked', grantId: id, grant: plan.next };
  });
}

export const REWARD_DIAGNOSTIC_MATCH_LIMIT = 6;
export const TEACHER_REWARD_HISTORY_LIMIT = 30;

const plainTime = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return value;
};

/**
 * One student's rewards in one class, for their teacher. Authorized from the
 * class record BEFORE anything about the student is read. Bounded: the
 * student's own grants and waivers (a handful per term), their latest 30
 * Class Points entries, and their last six Live Challenges in this class with
 * those matches' award records.
 */
export async function loadStudentRewardsForTeacher(db, { studentId, classId, teacher = {} } = {}) {
  const student = cleanText(studentId, 64);
  const cls = cleanText(classId, 120);
  if (!student || !cls) fail('invalid-argument', 'Choose a student and a class.');
  const teacherEmail = cleanText(teacher.email, 200).toLowerCase();
  if (!teacherEmail) fail('permission-denied', 'A verified teacher email is required.');

  const [classSnap, gradeSnap] = await Promise.all([
    db.collection('classes').doc(cls).get(),
    db.collection('grades').doc(student).get(),
  ]);
  rosterAuthorization({
    teacherEmail,
    isRootAdmin: teacher.isRootAdmin === true,
    classRecord: classSnap.exists ? { classId: classSnap.id, ...classSnap.data() } : null,
    studentRecord: gradeSnap.exists ? gradeSnap.data() : null,
    classId: cls,
  });

  const [grantsSnap, redemptionsSnap, transactionsSnap, accountSnap, matchesSnap] = await Promise.all([
    db.collection(COLLECTIONS.GRANTS).where('studentId', '==', student).where('classId', '==', cls).get(),
    db.collection(COLLECTIONS.REDEMPTIONS).where('studentId', '==', student).where('classId', '==', cls).get(),
    db.collection(COLLECTIONS.TRANSACTIONS)
      .where('studentId', '==', student).where('classId', '==', cls)
      .orderBy('createdAt', 'desc').limit(TEACHER_REWARD_HISTORY_LIMIT).get(),
    db.collection(COLLECTIONS.ACCOUNTS).doc(accountId(student, cls)).get(),
    db.collection('liveChallengeMatchResults')
      .where('studentIds', 'array-contains', student)
      .orderBy('finalizedAtMs', 'desc').limit(REWARD_DIAGNOSTIC_MATCH_LIMIT * 2).get(),
  ]);

  const matches = matchesSnap.docs.map((entry) => ({ roomId: entry.id, ...entry.data() }))
    .filter((match) => match.classId === cls)
    .slice(0, REWARD_DIAGNOSTIC_MATCH_LIMIT);
  const jobRefs = matches.map((match) => db.collection('liveChallengeAchievementJobs').doc(match.roomId));
  const jobSnaps = jobRefs.length ? await db.getAll(...jobRefs) : [];
  const jobsByRoom = new Map(jobSnaps.filter((entry) => entry.exists).map((entry) => [entry.id, entry.data()]));

  const plain = (entry) => {
    const data = entry.data() || {};
    return { id: entry.id, ...data, createdAt: plainTime(data.createdAt), updatedAt: plainTime(data.updatedAt) };
  };
  const account = accountSnap.exists ? accountSnap.data() : {};
  return {
    studentId: student,
    classId: cls,
    account: {
      balance: Number(account.balance) || 0,
      lifetimeEarned: Number(account.lifetimeEarned) || 0,
      lifetimeSpent: Number(account.lifetimeSpent) || 0,
    },
    grants: grantsSnap.docs.map(plain),
    redemptions: redemptionsSnap.docs.map(plain),
    transactions: transactionsSnap.docs.map(plain),
    challenges: matches.map((match) => explainStudentChallengeRewards({
      matchResult: match, job: jobsByRoom.get(match.roomId) || null, studentId: student,
    })),
  };
}
