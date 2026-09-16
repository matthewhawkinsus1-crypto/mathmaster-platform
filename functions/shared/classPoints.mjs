// Class Points: a classroom participation reward currency, scoped to
// studentId + classId. This is deliberately NOT assignment credit, mastery,
// Live Challenge score, or evidence of mathematical proficiency — it is a
// separate reward ledger a teacher hands out for participation, explanation,
// demonstration, helping the class, and similar classroom behavior.
//
// THE SHAPE. Three kinds of document, all server-written:
//
//   account       one authoritative balance projection per studentId+classId
//   transaction   an immutable, append-only ledger entry that explains it
//   announcement  a temporary, name-safe public event for the student's class
//
// The account is a PROJECTION, never a source of truth: it exists so a screen
// does not have to sum a whole ledger to show a balance, and every field on it
// is derived by replaying transactions through `applyTransaction`. A mistaken
// award is never edited or deleted — it is corrected by a new compensating
// `teacherReversal` transaction that names the transaction it reverses, which
// is what keeps "what happened" honest even after "the balance right now" is
// corrected.
//
// This file is pure and shared, the same way functions/shared/classModel.mjs
// and functions/shared/authorizationContext.mjs are: the callable enforces it
// server-side, and it is unit-tested directly without a Functions runtime or
// an emulator.

export const CLASS_POINTS_SCHEMA_VERSION = 1;

/** Reason codes a teacher may cite for an award. */
export const REASON_CODES = Object.freeze([
  'participation',
  'explanation',
  'demonstration',
  'helpedClass',
  'perseverance',
  'teacherBonus',
  'liveChallengeAchievement',
  'custom',
]);

const REASON_CODE_SET = new Set(REASON_CODES);

/** A sensible teacher-facing label for a reason code when none is supplied. */
export const DEFAULT_REASON_LABELS = Object.freeze({
  participation: 'Participation',
  explanation: 'Great explanation',
  demonstration: 'Demonstrated it for the class',
  helpedClass: 'Helped the class',
  perseverance: 'Kept working through a hard problem',
  teacherBonus: 'Teacher bonus',
  liveChallengeAchievement: 'Live Challenge achievement',
  custom: 'Class Points award',
});

/**
 * Where a transaction came from. `liveChallengeAchievement` and
 * `rewardRedemption` are accepted shapes for future work — this PR does not
 * issue either kind, but the ledger must already be able to hold them so the
 * eventual Live Challenge bonus and reward-shop redemption do not need a
 * schema migration to land.
 */
export const SOURCE_TYPES = Object.freeze({
  TEACHER_AWARD: 'teacherAward',
  TEACHER_REVERSAL: 'teacherReversal',
  LIVE_CHALLENGE_ACHIEVEMENT: 'liveChallengeAchievement',
  REWARD_REDEMPTION: 'rewardRedemption',
});

// Small positive integers only. High enough for a generous single award (a
// whole table helping the class) and low enough that one ordinary award
// action can never accidentally issue thousands of points a future reward
// shop would have to honor. This is a foundation limit, not a priced catalog —
// no reward-shop price is decided here.
export const MAX_AWARD_AMOUNT = 20;

export class ClassPointsInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClassPointsInputError';
  }
}

const reject = (message) => { throw new ClassPointsInputError(message); };

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

/** The stable id an account projection lives at. */
export const accountId = (studentId, classId) => `${cleanText(studentId, 64)}__${cleanText(classId, 120)}`;

/**
 * Validate and normalize an `awardClassPoints` call. Throws
 * `ClassPointsInputError` on anything malformed, so the callable can translate
 * it into an `invalid-argument` without duplicating the checks.
 */
export const validateAwardInput = (input = {}) => {
  const studentId = cleanText(input.studentId, 64);
  if (!studentId) reject('A student is required.');

  const classId = cleanText(input.classId, 120);
  if (!classId) reject('A class is required.');

  const amount = Number(input.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    reject('The award amount must be a positive whole number.');
  }
  if (amount > MAX_AWARD_AMOUNT) {
    reject(`A single award cannot exceed ${MAX_AWARD_AMOUNT} Class Points.`);
  }

  const reasonCode = cleanText(input.reasonCode, 40);
  if (!REASON_CODE_SET.has(reasonCode)) {
    reject(`"${reasonCode}" is not a recognized Class Points reason.`);
  }

  const reasonLabel = cleanText(input.reasonLabel, 140) || DEFAULT_REASON_LABELS[reasonCode];

  const requestId = cleanText(input.requestId, 200);
  if (!requestId) reject('A request identifier is required so a retry cannot double-award.');

  return {
    studentId,
    classId,
    amount,
    reasonCode,
    reasonLabel,
    requestId,
    announce: Boolean(input.announce),
  };
};

/** Validate and normalize a `reverseClassPointAward` call. */
export const validateReversalInput = (input = {}) => {
  const transactionId = cleanText(input.transactionId, 200);
  if (!transactionId) reject('The award to reverse is required.');

  const requestId = cleanText(input.requestId, 200);
  if (!requestId) reject('A request identifier is required so a retry cannot double-reverse.');

  return {
    transactionId,
    reason: cleanText(input.reason, 300),
    requestId,
  };
};

/** The zero-balance account a student+class starts at before any transaction. */
export const emptyAccount = ({ studentId, classId, authorizedTeacherEmails = [] }) => ({
  schemaVersion: CLASS_POINTS_SCHEMA_VERSION,
  studentId,
  classId,
  balance: 0,
  lifetimeEarned: 0,
  lifetimeSpent: 0,
  authorizedTeacherEmails,
  updatedAt: null,
});

/**
 * Replay one ledger transaction onto an account projection.
 *
 * A `teacherReversal` undoes an erroneous earning, so it is subtracted from
 * `lifetimeEarned` rather than added to `lifetimeSpent` — it was never a real
 * spend, and treating it as one would make "lifetime earned" overstate what a
 * student actually keeps. Every other negative transaction (the future
 * `rewardRedemption`) is a real spend and counts there instead.
 *
 * Throws rather than ever returning a negative balance — this is the one
 * place that invariant can be violated, so it is the one place it is
 * enforced.
 */
export const applyTransaction = (account, transaction) => {
  const amount = Number(transaction?.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    reject('A ledger transaction must carry a nonzero whole-number amount.');
  }

  const nextBalance = (account?.balance || 0) + amount;
  if (nextBalance < 0) reject('This would take the account balance below zero.');

  const isReversal = transaction.sourceType === SOURCE_TYPES.TEACHER_REVERSAL;
  const earnedDelta = isReversal ? amount : Math.max(amount, 0);
  const spentDelta = (!isReversal && amount < 0) ? -amount : 0;

  return {
    ...account,
    schemaVersion: CLASS_POINTS_SCHEMA_VERSION,
    studentId: account?.studentId ?? transaction.studentId,
    classId: account?.classId ?? transaction.classId,
    balance: nextBalance,
    lifetimeEarned: (account?.lifetimeEarned || 0) + earnedDelta,
    lifetimeSpent: (account?.lifetimeSpent || 0) + spentDelta,
    updatedAt: transaction.createdAt || account?.updatedAt || null,
  };
};

/** The immutable ledger entry a teacher award creates. */
export const buildAwardTransaction = ({
  studentId,
  classId,
  amount,
  reasonCode,
  reasonLabel,
  requestId,
  issuedByUid,
  issuedByEmail,
  authorizedTeacherEmails,
  at,
}) => ({
  schemaVersion: CLASS_POINTS_SCHEMA_VERSION,
  studentId,
  classId,
  amount,
  reasonCode,
  reasonLabel,
  sourceType: SOURCE_TYPES.TEACHER_AWARD,
  issuedByUid,
  issuedByEmail,
  requestId,
  isReversal: false,
  reversalOf: null,
  authorizedTeacherEmails,
  createdAt: at,
});

/**
 * The compensating ledger entry a reversal creates. `original` is the award
 * transaction being undone, complete with its own document id as `id`.
 */
export const buildReversalTransaction = ({
  original,
  reason,
  requestId,
  issuedByUid,
  issuedByEmail,
  at,
}) => ({
  schemaVersion: CLASS_POINTS_SCHEMA_VERSION,
  studentId: original.studentId,
  classId: original.classId,
  amount: -Math.abs(Number(original.amount) || 0),
  reasonCode: original.reasonCode,
  reasonLabel: reason || `Reversal of "${original.reasonLabel}"`,
  sourceType: SOURCE_TYPES.TEACHER_REVERSAL,
  issuedByUid,
  issuedByEmail,
  requestId,
  isReversal: true,
  reversalOf: original.id,
  authorizedTeacherEmails: original.authorizedTeacherEmails,
  createdAt: at,
});

/**
 * The deterministic id a reversal of `transactionId` lives at. One award has
 * exactly one compensating transaction, so this id IS the "cannot be reversed
 * twice" guarantee: a second reversal attempt collides with the first rather
 * than needing a query to discover it.
 */
export const reversalTransactionId = (transactionId) => `rev_${cleanText(transactionId, 200)}`;

/**
 * "Ann K." — first name plus last initial, never the full legal name. This is
 * the only student-identifying text a public class announcement may carry;
 * the teacher-facing transaction keeps the canonical studentId separately.
 */
export const publicStudentLabel = ({ firstName, lastName, displayName } = {}) => {
  const first = cleanText(firstName, 60);
  const lastInitial = cleanText(lastName, 60).slice(0, 1);
  if (first && lastInitial) return `${first} ${lastInitial}.`;
  if (first) return first;

  const parts = cleanText(displayName, 120).split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]} ${parts.at(-1).slice(0, 1)}.`;
  if (parts.length === 1) return parts[0];
  return 'A student';
};

/** How long a class announcement stays on a future display before it expires. */
export const ANNOUNCEMENT_DISPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A temporary, name-safe public event suitable for a future class feed. It
 * carries no studentId, no balance, and no way to reconstruct one — only what
 * a classmate is allowed to see: a safe label, the amount, why, and when it
 * stops showing. `awardTransactionId` lets a teacher screen trace it back to
 * the authoritative record without exposing that link to students.
 */
export const buildAnnouncement = ({
  classId,
  publicStudentLabel: label,
  amount,
  reasonLabel,
  awardTransactionId,
  at,
  displayWindowMs = ANNOUNCEMENT_DISPLAY_WINDOW_MS,
}) => ({
  schemaVersion: CLASS_POINTS_SCHEMA_VERSION,
  classId,
  publicStudentLabel: label,
  amount,
  reasonLabel,
  awardTransactionId,
  createdAt: at,
  expiresAt: new Date(new Date(at).getTime() + displayWindowMs).toISOString(),
});
