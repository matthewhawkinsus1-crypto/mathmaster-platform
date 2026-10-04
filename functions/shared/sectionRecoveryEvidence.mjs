/*
 * WHICH RECOVERY QUESTIONS COUNT, AND WHEN WHAT IS LEFT IS ENOUGH.
 *
 * A Recovery question the student answered is evidence about the student: a
 * right answer counts right, a wrong one counts wrong, and one they left
 * blank counts as nothing earned — exactly as an unanswered DOL question
 * always has. A Recovery question MathMaster itself could not reproduce or
 * mark is evidence about MathMaster, and nothing else. Before this module the
 * server stored it as `credit: 0` with its full weight in the denominator, so
 * a re-tuned family, a damaged pin or a generator that threw lowered a
 * student's Recovery exactly as a wrong answer would.
 *
 * Two promises, kept together:
 *
 *   1. A platform failure is never evidence that the student was wrong. It is
 *      never scored zero, never called incorrect, never spends an attempt.
 *   2. A platform failure never silently awards credit the student did not
 *      earn. Leaving a question out of the score is allowed only when the
 *      questions that WERE graded still assess what this Recovery was built
 *      to assess. Otherwise the Recovery is HELD: no Recovery score exists
 *      until a teacher resolves it.
 *
 * ITEM STATUSES (what the server stores per pinned question)
 *
 *   correct / incorrect   marked by the shared grader against the instance
 *                         rebuilt from the question's own pin
 *   unanswered            no answer, or a blank / incomplete one (the reasons
 *                         the deadline finalizer also treats as the student's
 *                         unfinished work: responseCheckpointFinalizer.mjs).
 *                         Worth zero, as before
 *   platform-unavailable  MathMaster could not rebuild the question from its
 *                         pin, the question left the student's section, or
 *                         the server cannot mark this kind of question at all.
 *                         Decided WITHOUT reading the student's payload, so a
 *                         student can never steer a question into it
 *   needs-review          MathMaster has the student's work but cannot use it:
 *                         the saved answer could not be read, marking threw,
 *                         or the student's device reported the question could
 *                         not be shown while the server can rebuild it. The
 *                         server cannot tell a platform bug from a tampered
 *                         payload here, so it neither excludes the question
 *                         nor marks it: a teacher decides
 *
 * THE SUFFICIENT-EVIDENCE RULE (evaluateRecoveryEvidence)
 *
 * Recovery's own design says what a Recovery assesses. Its plan is built from
 * the section's Recovery-ready questions (sectionRecoveryReadiness.mjs); each
 * pinned item carries the coverage key of its question's family — the family's
 * Recovery equivalence group, the unit the Practice mastery gate already
 * requires covered (`requiredCoverage`, `requireSkillCoverage`). A DOL plan is
 * one fresh instance of EVERY DOL question; a Warm-Up plan is 2-5 instances
 * drawn from the ready Warm-Up questions (the policy never plans fewer than
 * two). Each item carries its question's weight. Recovery has no pass mark:
 * its raw score feeds max(original, min(raw, cap)).
 *
 * So the questions MathMaster graded are enough to finalize only when ALL of:
 *
 *   a. nothing needs review                  (needs-review always holds)
 *   b. at least one question was graded      (else: no-graded-items)
 *   c. every skill the plan assesses still   (else: skill-without-evidence)
 *      has a graded question — a coverage
 *      key whose only items failed is a
 *      skill this Recovery can say nothing about
 *   d. the graded questions carry at least   (else: too-little-evidence)
 *      half of the plan's weight — the
 *      failure removed no more than half of
 *      what the teacher weighted
 *   e. at least as many graded questions as  (else: too-few-questions)
 *      the smallest Recovery the policy
 *      plans for the section: 2 for a
 *      Warm-Up, 1 for a DOL
 *
 * THE DENOMINATOR RULE (scoreRecoveryEvidence)
 *
 * When the evidence is sufficient, the raw score is computed over exactly the
 * graded questions (correct, incorrect, unanswered): earned weight over their
 * weight. A platform-unavailable question's weight is excluded, not
 * redistributed to its neighbours — the brief's 40/30/30 with Q3 unavailable
 * and Q1, Q2 right is 70 / 70 = 100, never 70 / 100.
 *
 * Pure: no Firestore, no clock, no graders.
 */
import { FAMILY_RESOLUTION_ERROR, normalizeQuestionFamilyReference } from './questionFamilyInstance.mjs';
import { listPlatformQuestionFamilies } from './questionFamilyRegistry.mjs';
import { normalizeDeliveryPin } from './questionGenerationIdentity.mjs';

export const RECOVERY_EVIDENCE_POLICY_VERSION = 1;

export const RECOVERY_ITEM_STATUS = Object.freeze({
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
  UNANSWERED: 'unanswered',
  PLATFORM_UNAVAILABLE: 'platform-unavailable',
  NEEDS_REVIEW: 'needs-review',
});

const STATUSES = new Set(Object.values(RECOVERY_ITEM_STATUS));

/** Statuses that are legitimate evidence about the student: they count. */
export const GRADED_ITEM_STATUSES = Object.freeze([
  RECOVERY_ITEM_STATUS.CORRECT,
  RECOVERY_ITEM_STATUS.INCORRECT,
  RECOVERY_ITEM_STATUS.UNANSWERED,
]);
const GRADED = new Set(GRADED_ITEM_STATUSES);

export const isRecoveryItemStatus = (value) => STATUSES.has(value);
export const isGradedItemStatus = (value) => GRADED.has(value);

/*
 * PR #430'S CLASSIFICATIONS, AS THE SERVER SEES THEM.
 *
 * The same strings as QUESTION_RESOLUTION_FAILURE in
 * src/platform/generation/familyPinReplay.js, so a teacher reads one
 * vocabulary whether the browser or the server noticed the failure.
 * tests/platform/sectionRecoveryPlatformFailure.test.mjs holds this
 * classifier and the client's together. (This module cannot import the client
 * one: Cloud Functions deploy only `functions/`.)
 */
export const PIN_REPLAY_FAILURE = Object.freeze({
  PIN_FINGERPRINT_MISMATCH: 'pin-fingerprint-mismatch',
  PIN_FAMILY_MISMATCH: 'pin-family-mismatch',
  PIN_FAMILY_VERSION_UNKNOWN: 'pin-family-version-unknown',
  // On the server: the pin or slot names a family version newer than this
  // deployed build knows.
  CLIENT_BUILD_BEHIND: 'family-version-newer-than-client',
  PIN_SLOT_MISMATCH: 'pin-slot-mismatch',
  PIN_NOT_ALLOCATED: 'pin-not-allocated-to-student',
  PIN_MALFORMED: 'pin-malformed',
  FAMILY_UNKNOWN: 'family-unknown',
  FAMILY_UNSATISFIABLE: 'family-unsatisfiable',
  GENERATION_FAILED: 'generation-failed',
  RESOLUTION_EXCEPTION: 'resolution-exception',
});

/* Failures only the GRADING side of a Recovery can have. */
export const RECOVERY_GRADING_FAILURE = Object.freeze({
  // The pinned question is no longer one of this student's section questions.
  QUESTION_REMOVED: 'question-removed',
  // The server cannot mark this kind of question at all (payload-independent).
  GRADER_UNAVAILABLE: 'grader-unavailable',
  // The server could mark the question, but not the answer it was sent.
  RESPONSE_UNREADABLE: 'response-unreadable',
  // Marking the answer threw.
  GRADING_EXCEPTION: 'grading-exception',
  // The student's device could not show the question; the server can rebuild it.
  REPORTED_UNAVAILABLE: 'reported-unavailable',
});

// PR #430's recovery hint per classification, so the teacher audit can say
// whether the question can come back by itself (reload) or needs repair.
const RECOVERY_FOR = Object.freeze({
  [PIN_REPLAY_FAILURE.PIN_FINGERPRINT_MISMATCH]: 'needs-repair',
  [PIN_REPLAY_FAILURE.PIN_FAMILY_MISMATCH]: 'needs-repair',
  [PIN_REPLAY_FAILURE.PIN_FAMILY_VERSION_UNKNOWN]: 'legacy-unsupported',
  [PIN_REPLAY_FAILURE.CLIENT_BUILD_BEHIND]: 'reload',
  [PIN_REPLAY_FAILURE.PIN_SLOT_MISMATCH]: 'needs-repair',
  [PIN_REPLAY_FAILURE.PIN_NOT_ALLOCATED]: 'needs-repair',
  [PIN_REPLAY_FAILURE.PIN_MALFORMED]: 'legacy-unsupported',
  [PIN_REPLAY_FAILURE.FAMILY_UNKNOWN]: 'needs-repair',
  [PIN_REPLAY_FAILURE.FAMILY_UNSATISFIABLE]: 'needs-repair',
  [PIN_REPLAY_FAILURE.GENERATION_FAILED]: 'needs-repair',
  [PIN_REPLAY_FAILURE.RESOLUTION_EXCEPTION]: 'retry',
});

export const recoveryHintForClassification = (classification) => RECOVERY_FOR[classification] || 'needs-repair';

/*
 * The grader's reasons that mean "the student's own work is unfinished".
 * Exactly the set responseCheckpointFinalizer.mjs treats as incomplete at a
 * close: a blank or partly-filled answer is the student's, and counts as an
 * unanswered question. Every other "no verdict" is not the student's doing.
 */
export const UNANSWERED_GRADING_REASONS = Object.freeze(['blank-response', 'empty-response', 'incomplete-response']);
const UNANSWERED_REASONS = new Set(UNANSWERED_GRADING_REASONS);
export const isUnansweredGradingReason = (reason) => UNANSWERED_REASONS.has(String(reason ?? ''));

export const RECOVERY_HOLD_REASON = Object.freeze({
  NEEDS_REVIEW: 'needs-review',
  NO_GRADED_ITEMS: 'no-graded-items',
  SKILL_WITHOUT_EVIDENCE: 'skill-without-evidence',
  TOO_LITTLE_EVIDENCE: 'too-little-evidence',
  TOO_FEW_QUESTIONS: 'too-few-questions',
});

/** (d) The graded questions must carry at least this share of the planned weight. */
export const MINIMUM_GRADED_WEIGHT_SHARE = 0.5;
/** (e) The policy never plans a Warm-Up Recovery of fewer questions (recoveryPolicy.mjs). */
export const WARMUP_MINIMUM_GRADED_ITEMS = 2;

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const unique = (values) => [...new Set(values)];
const round = (value, places) => {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
};

/** A positive weight, or the grading engine's default of 1. */
export const itemWeight = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
};

/** The skill an item gives evidence for: its family's Recovery equivalence group. */
export const itemSkillKey = (item = {}) => clean(item.coverageKey)
  || clean(item.familyId)
  || `slot:${clean(item.questionId) || Math.max(0, Number(item.storageIndex) || 0)}`;

/** The minimum number of graded questions a Recovery of this section needs. */
export const minimumGradedItemsFor = (section, plannedCount) => Math.min(
  Math.max(0, Number(plannedCount) || 0),
  section === 'warmup' ? WARMUP_MINIMUM_GRADED_ITEMS : 1,
);

/**
 * Decide whether the graded questions are enough to finalize.
 *
 * `items`: one per pinned (not superseded) question:
 *   { itemId, coverageKey, familyId, questionId, storageIndex, weight, status }
 *
 * Returns the decision with every number a teacher needs to read it.
 */
export const evaluateRecoveryEvidence = ({ section = 'dol', items = [] } = {}) => {
  const planned = list(items).filter((item) => item && clean(item.itemId));
  const graded = planned.filter((item) => GRADED.has(item.status));
  const unavailable = planned.filter((item) => item.status === RECOVERY_ITEM_STATUS.PLATFORM_UNAVAILABLE);
  const review = planned.filter((item) => item.status === RECOVERY_ITEM_STATUS.NEEDS_REVIEW);
  const plannedWeight = planned.reduce((sum, item) => sum + itemWeight(item.weight), 0);
  const gradedWeight = graded.reduce((sum, item) => sum + itemWeight(item.weight), 0);
  const plannedSkills = unique(planned.map(itemSkillKey));
  const coveredSkills = unique(graded.map(itemSkillKey));
  const missingSkills = plannedSkills.filter((skill) => !coveredSkills.includes(skill));
  const minimumGradedItems = minimumGradedItemsFor(section, planned.length);
  const base = {
    policyVersion: RECOVERY_EVIDENCE_POLICY_VERSION,
    plannedCount: planned.length,
    gradedCount: graded.length,
    plannedWeight: round(plannedWeight, 4),
    gradedWeight: round(gradedWeight, 4),
    weightShare: plannedWeight > 0 ? round(gradedWeight / plannedWeight, 4) : 0,
    plannedSkills,
    coveredSkills,
    missingSkills,
    minimumGradedItems,
    minimumWeightShare: MINIMUM_GRADED_WEIGHT_SHARE,
    unavailableItemIds: unavailable.map((item) => item.itemId),
    reviewItemIds: review.map((item) => item.itemId),
    excludedItemIds: [],
  };
  const hold = (reason) => ({ ...base, sufficient: false, reason });

  // Every question graded: the ordinary Recovery, decided exactly as before.
  if (!unavailable.length && !review.length) return { ...base, sufficient: true, reason: null };
  if (review.length) return hold(RECOVERY_HOLD_REASON.NEEDS_REVIEW);
  if (!graded.length) return hold(RECOVERY_HOLD_REASON.NO_GRADED_ITEMS);
  if (missingSkills.length) return hold(RECOVERY_HOLD_REASON.SKILL_WITHOUT_EVIDENCE);
  // A tolerance for weights like 0.25 summed in floating point.
  if (gradedWeight + 1e-9 < plannedWeight * MINIMUM_GRADED_WEIGHT_SHARE) return hold(RECOVERY_HOLD_REASON.TOO_LITTLE_EVIDENCE);
  if (graded.length < minimumGradedItems) return hold(RECOVERY_HOLD_REASON.TOO_FEW_QUESTIONS);
  return { ...base, sufficient: true, reason: null, excludedItemIds: base.unavailableItemIds };
};

/**
 * The raw Recovery score over the GRADED questions only.
 *
 * `items`: { status, credit (0-1), weight }. Returns { earned, possible,
 * rawScore } — rawScore null when nothing was graded (never 0).
 */
export const scoreRecoveryEvidence = (items = []) => {
  let earned = 0;
  let possible = 0;
  list(items).forEach((item) => {
    if (!GRADED.has(item?.status)) return;
    const weight = itemWeight(item.weight);
    const credit = item.status === RECOVERY_ITEM_STATUS.UNANSWERED
      ? 0
      : Math.max(0, Math.min(1, Number(item.credit) || 0));
    earned += credit * weight;
    possible += weight;
  });
  return {
    earned: round(earned, 4),
    possible: round(possible, 4),
    rawScore: possible > 0 ? Math.round((earned / possible) * 100) : null,
  };
};

/** The newest version of `familyId` this build ships, or null. */
const newestKnownVersion = (familyId) => {
  const id = clean(familyId);
  return listPlatformQuestionFamilies().find((family) => family.id === id)?.version ?? null;
};

/**
 * Why a Recovery item's pin did not reproduce, in PR #430's vocabulary.
 *
 * The same decision as classifyFamilyFailure in
 * src/platform/generation/familyPinReplay.js for a pinned question (a Recovery
 * item always has one), so the server and the student's browser name a
 * failure the same way.
 */
export const classifyRecoveryReproductionFailure = ({ question = null, pin = null, error = '', issues = [] } = {}) => {
  let reference = null;
  try { reference = normalizeQuestionFamilyReference(question); } catch { reference = null; }
  const normalizedPin = pin ? normalizeDeliveryPin(pin) : null;
  if (pin && !normalizedPin) return PIN_REPLAY_FAILURE.PIN_MALFORMED;
  if (!pin) return PIN_REPLAY_FAILURE.PIN_MALFORMED;
  if (error === FAMILY_RESOLUTION_ERROR.PIN_MISMATCH && list(issues).includes('pin_invalid')) {
    return PIN_REPLAY_FAILURE.PIN_MALFORMED;
  }
  if (error === FAMILY_RESOLUTION_ERROR.FAMILY_VERSION_UNKNOWN) {
    const newest = newestKnownVersion(reference?.id);
    return newest !== null && Number(reference?.version) > newest
      ? PIN_REPLAY_FAILURE.CLIENT_BUILD_BEHIND
      : PIN_REPLAY_FAILURE.PIN_FAMILY_VERSION_UNKNOWN;
  }
  if (error === FAMILY_RESOLUTION_ERROR.FAMILY_UNKNOWN) return PIN_REPLAY_FAILURE.FAMILY_UNKNOWN;
  if (error === FAMILY_RESOLUTION_ERROR.TEMPLATE_INVALID
    || error === FAMILY_RESOLUTION_ERROR.NO_VALID_INSTANCES
    || error === FAMILY_RESOLUTION_ERROR.ALL_INSTANCES_EXCLUDED) {
    return PIN_REPLAY_FAILURE.FAMILY_UNSATISFIABLE;
  }
  // The slot resolved; compare what it resolves to with what the pin names.
  if (reference?.scope === 'platform' && reference.id && reference.id !== normalizedPin.familyId) {
    return PIN_REPLAY_FAILURE.PIN_FAMILY_MISMATCH;
  }
  const pinNewest = newestKnownVersion(normalizedPin.familyId);
  if (reference?.scope === 'platform' && pinNewest !== null && normalizedPin.familyVersion > pinNewest) {
    return PIN_REPLAY_FAILURE.CLIENT_BUILD_BEHIND;
  }
  const slotVersion = reference?.scope === 'platform' ? (reference.version || 1) : null;
  if (slotVersion !== null && slotVersion !== normalizedPin.familyVersion) {
    return PIN_REPLAY_FAILURE.PIN_FAMILY_MISMATCH;
  }
  return PIN_REPLAY_FAILURE.PIN_FINGERPRINT_MISMATCH;
};

/**
 * Why a question could not produce a FRESH instance (no pin involved: a
 * teacher-requested replacement), in the same vocabulary.
 */
export const classifyFamilyGenerationError = ({ question = null, error = '' } = {}) => {
  let reference = null;
  try { reference = normalizeQuestionFamilyReference(question); } catch { reference = null; }
  if (error === FAMILY_RESOLUTION_ERROR.NOT_FAMILY_BACKED || error === FAMILY_RESOLUTION_ERROR.FAMILY_UNKNOWN) {
    return PIN_REPLAY_FAILURE.FAMILY_UNKNOWN;
  }
  if (error === FAMILY_RESOLUTION_ERROR.FAMILY_VERSION_UNKNOWN) {
    const newest = newestKnownVersion(reference?.id);
    return newest !== null && Number(reference?.version) > newest
      ? PIN_REPLAY_FAILURE.CLIENT_BUILD_BEHIND
      : PIN_REPLAY_FAILURE.PIN_FAMILY_VERSION_UNKNOWN;
  }
  if (error === FAMILY_RESOLUTION_ERROR.TEMPLATE_INVALID
    || error === FAMILY_RESOLUTION_ERROR.NO_VALID_INSTANCES
    || error === FAMILY_RESOLUTION_ERROR.ALL_INSTANCES_EXCLUDED) {
    return PIN_REPLAY_FAILURE.FAMILY_UNSATISFIABLE;
  }
  return PIN_REPLAY_FAILURE.GENERATION_FAILED;
};

/** A client-reported classification, bounded to a vocabulary the audit can read. */
const KNOWN_CLASSIFICATIONS = new Set([...Object.values(PIN_REPLAY_FAILURE), ...Object.values(RECOVERY_GRADING_FAILURE)]);
export const sanitizeReportedClassification = (value) => {
  const text = clean(value).toLowerCase();
  return KNOWN_CLASSIFICATIONS.has(text) ? text : 'unclassified';
};

/*
 * THE STUDENT'S SAVED ANSWER, KEPT WHEN IT COULD NOT BE GRADED.
 *
 * Only for a question MathMaster did not grade, so a teacher (or a later
 * repair) still has the work. Bounded so a Recovery can never push the
 * grades document toward Firestore's size limit.
 */
export const KEPT_RESPONSE_MAX_CHARS = 6000;
export const keptResponse = (response) => {
  if (response === null || response === undefined) return null;
  let text = '';
  try { text = JSON.stringify(response); } catch { return { unreadable: true }; }
  if (!text || text === '{}' || text === 'null') return null;
  if (text.length > KEPT_RESPONSE_MAX_CHARS) return { truncated: true, length: text.length, head: text.slice(0, 500) };
  try { return JSON.parse(text); } catch { return { unreadable: true }; }
};
