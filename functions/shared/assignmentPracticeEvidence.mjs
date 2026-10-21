/*
 * THE ASSIGNMENT'S OWN PRACTICE AS RECOVERY EVIDENCE — ONLY WHAT IS TRUSTWORTHY.
 *
 * Recovery unlocks on recent, independent Practice mastery (practiceMastery.mjs:
 * 7 of the last 8 unique items by default). Until Recovery V2 only Recovery
 * Practice counted, and the students who had already practised well in the
 * assignment itself were sent to answer eight more questions. Now a question
 * from the assignment's Practice section counts too — but only when the record
 * proves what the gate needs. A Practice question counts when:
 *
 *   ALIGNED        it assesses a skill the original Warm-Up or DOL assessed:
 *                  its family's skill (the same equivalence group), or the
 *                  same primary TEKS as one of the section's questions
 *   FINISHED       answered correctly, or out of tries — an item still being
 *                  worked is not evidence yet
 *   SERVER-GRADED  the server marked the student's own answer
 *                  (`gradedBy: 'server'`); a device's verdict the server could
 *                  only sanitize is not evidence of mastery
 *   THEIR OWN      no teacher grade override, and no credit from a content
 *                  correction (a repaired answer box is not a demonstration)
 *   INDEPENDENT    no hint, worked example, scaffold, remediation, teacher
 *                  help or modified version — the very rule Recovery Practice
 *                  uses (practiceMastery.attemptWasIndependent). Help is fine
 *                  to use; it just is not evidence
 *   BEFORE ANY SOLUTION  the assignment player shows a question's solution
 *                  only once it is finished, so a correct item was answered
 *                  before it; and a finished question records nothing more
 *                  (submissionIngestion.mjs), so it cannot be re-answered from
 *                  a remembered solution
 *   DISTINCT       one item per question (its delivered instance for a family
 *                  slot, its id for a static one): answering a question again
 *                  is not new evidence
 *   RECENT         dated by the day the student answered it, inside the
 *                  policy's lookback (the gate applies it)
 *
 * The source is the canonical question record — server-written, never
 * student-writable (firestore.rules allow a student's device to change only
 * engagement time) — which the browser and the server both already hold, so
 * the panel a student reads and the unlock the server records agree.
 *
 * Pure: no Firestore, no clock.
 */

import { attemptWasIndependent, PRACTICE_EVIDENCE_SOURCE } from './practiceMastery.mjs';
import { normalizeQuestionRecord } from './attemptPolicy.mjs';
import { isFamilyBackedQuestion, resolveQuestionFamilyDefinition } from './questionFamilyInstance.mjs';
import { normalizeDeliveryPin } from './questionGenerationIdentity.mjs';
import { primaryStandardCodes } from './recoveryContent.mjs';

export const ASSIGNMENT_PRACTICE_EXCLUSION = Object.freeze({
  NOT_ALIGNED: 'not-aligned',
  NOT_FINISHED: 'not-finished',
  NOT_SERVER_GRADED: 'not-server-graded',
  TEACHER_GRADED: 'teacher-graded',
  CORRECTION_CREDIT: 'correction-credit',
  NO_DATE: 'no-date',
});

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toMillis = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The family skill a question assesses, if it is a family slot. */
const familySkillOf = (question) => {
  if (!isFamilyBackedQuestion(question)) return null;
  const definition = resolveQuestionFamilyDefinition(question);
  return definition.error ? null : definition.family.recovery.equivalenceGroup;
};

/** A teacher's per-question grade decision (any kind) is active for this index. */
const teacherGraded = (overrides, storageIndex) => {
  const entry = overrides?.[storageIndex] ?? overrides?.[String(storageIndex)];
  return isObject(entry) ? entry.active !== false : Boolean(entry);
};

/** Credit a content correction granted, rather than an answer the student gave. */
const creditFromCorrection = (record) => list(record?.partGrades).some((part) => part?.liveCorrectionCredit === true);

/**
 * The trustworthy assignment Practice outcomes for one section's Recovery, and
 * a per-question account of why each Practice question does or does not
 * count (what the student's panel names).
 *
 *   slots     the section's ready Recovery slots (sectionRecoveryReadiness):
 *             each has `coverageKey` and the original's `primaryStandards`
 *   overrides the student's teacherGradeOverridesByAssignment[assignmentId]
 */
export const assignmentPracticeEvidence = ({
  assignmentId = '',
  questions = [],
  tracker = {},
  overrides = {},
  slots = [],
} = {}) => {
  const ready = list(slots).filter((slot) => slot?.ready && slot.coverageKey);
  const outcomes = [];
  const questionsConsidered = [];
  let practicePosition = 0;
  list(questions).forEach((question, storageIndex) => {
    if (clean(question?.activityRole).toLowerCase() !== 'practice') return;
    practicePosition += 1;
    if (question?.teacherExcluded === true) return;
    const questionId = clean(question?.questionId || question?.id) || `index-${storageIndex}`;
    const entry = { storageIndex, questionId, label: `Practice Q${practicePosition}`, counts: false, reason: null, coverageKeys: [] };
    questionsConsidered.push(entry);

    // ALIGNED: the family's skill, or a primary standard the section assessed.
    const skill = familySkillOf(question);
    const standards = primaryStandardCodes(question);
    const coverageKeys = [...new Set(ready
      .filter((slot) => (skill && skill === slot.coverageKey)
        || list(slot.primaryStandards).some((code) => standards.includes(code)))
      .map((slot) => slot.coverageKey))];
    entry.coverageKeys = coverageKeys;
    if (!coverageKeys.length) {
      entry.reason = ASSIGNMENT_PRACTICE_EXCLUSION.NOT_ALIGNED;
      return;
    }
    entry.aligned = true;

    const raw = tracker?.[storageIndex] ?? tracker?.[String(storageIndex)];
    const record = raw ? normalizeQuestionRecord(raw) : null;
    if (!record || !['correct', 'expired'].includes(record.status)) {
      entry.reason = ASSIGNMENT_PRACTICE_EXCLUSION.NOT_FINISHED;
      return;
    }
    // A teacher's decision on this question — read from the overrides map
    // (the server) or from a record the browser already projected it onto.
    if (teacherGraded(overrides, storageIndex) || raw?.teacherGradeOverrideDisplay) {
      entry.reason = ASSIGNMENT_PRACTICE_EXCLUSION.TEACHER_GRADED;
      return;
    }
    if (clean(raw?.gradedBy) !== 'server') {
      entry.reason = ASSIGNMENT_PRACTICE_EXCLUSION.NOT_SERVER_GRADED;
      return;
    }
    if (record.status === 'correct' && creditFromCorrection(record)) {
      entry.reason = ASSIGNMENT_PRACTICE_EXCLUSION.CORRECTION_CREDIT;
      return;
    }
    const at = toMillis(raw?.academicOccurredAt) || toMillis(record.lastAttemptAt) || toMillis(raw?.recordedAt);
    if (!at) {
      entry.reason = ASSIGNMENT_PRACTICE_EXCLUSION.NO_DATE;
      return;
    }
    const pin = isFamilyBackedQuestion(question) ? normalizeDeliveryPin(raw?.familyDelivery) : null;
    const correct = record.status === 'correct';
    const outcome = {
      // DISTINCT: the instance delivered (a family slot), else the question.
      key: pin ? pin.fingerprint : `assignment:${clean(assignmentId)}|${questionId}`,
      familyId: pin?.familyId || null,
      coverageKeys,
      coverageKey: coverageKeys[0],
      source: PRACTICE_EVIDENCE_SOURCE.ASSIGNMENT_PRACTICE,
      correct,
      firstAttemptCorrect: correct && Math.max(1, Number(record.attemptCount) || 1) <= 1,
      independent: attemptWasIndependent(record.supportUsage) && !record.supportUsage?.modified,
      // The player shows a solution only after a question is finished.
      solutionViewed: false,
      at,
      storageIndex,
      questionId,
    };
    outcomes.push(outcome);
    entry.counts = correct && outcome.independent;
    entry.outcome = { correct, independent: outcome.independent, at };
    entry.reason = null;
  });
  return {
    outcomes,
    questions: questionsConsidered,
    // The Practice questions that CAN count, in the student's words.
    alignedLabels: questionsConsidered.filter((entry) => entry.aligned).map((entry) => entry.label),
  };
};
