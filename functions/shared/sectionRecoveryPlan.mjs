/*
 * WHAT A RECOVERY ASKS: FRESH, EQUIVALENT, UNSEEN.
 *
 * Two kinds of generated question come out of a Recovery:
 *
 *   PRACTICE ITEMS — the mastery gate's evidence. Unlimited, one at a time,
 *   cycling through the original section's families so every skill is
 *   practised, and never repeating a question the student has already seen.
 *
 *   THE RECOVERY ASSESSMENT — for a DOL, one fresh instance of every original
 *   DOL question (same family, same constraints, same tool, so the same skill
 *   and rigor); for a Warm-Up, 2-3 fresh instances drawn from its ready
 *   questions. Built once, by the server, when the student starts, and stored
 *   as delivery pins so a refresh, another device, and the server's own
 *   marking all see exactly the same questions.
 *
 * "Fresh" is enforced, not hoped for: each instance comes from its own list
 * (a distinct slot key) and the walk skips every fingerprint the student has
 * already met — their original deliveries and their practice items.
 * Shuffling answer choices would not count as a different question here,
 * because fingerprints ignore choice order.
 *
 * Pure: no Firestore, no clock.
 */

import { resolveFamilyQuestionInstance } from './questionFamilyInstance.mjs';
import { resolveGenerationAllocation } from './questionGenerationIdentity.mjs';

const clean = (value) => String(value ?? '').trim();

const recoverySlotKey = ({ assignmentId, section, kind, opportunity = 1, questionId }) => (
  `${clean(assignmentId)}|${kind}:${section}:o${Math.max(1, Number(opportunity) || 1)}|${clean(questionId)}`
);

/**
 * Practice item number `practiceIndex` for this student.
 *
 * Returns { itemId, storageIndex, questionId, coverageKey, familyId, pin,
 * question } or { error }. Deterministic in its inputs; the server re-checks
 * any pin a student sends rather than trusting it.
 */
export const buildRecoveryPracticeItem = ({
  assignmentId = '',
  section = 'dol',
  readySlots = [],
  questionsByIndex = {},
  practiceIndex = 0,
  seatInfo = null,
  seenFingerprints = [],
  opportunity = 1,
} = {}) => {
  const slots = Array.isArray(readySlots) ? readySlots.filter((slot) => slot?.ready) : [];
  if (!slots.length) return { error: 'no-ready-slots' };
  const index = Math.max(0, Math.floor(Number(practiceIndex) || 0));
  const slot = slots[index % slots.length];
  const question = questionsByIndex[slot.storageIndex];
  if (!question) return { error: 'slot-question-missing' };
  const round = Math.floor(index / slots.length);
  const allocation = resolveGenerationAllocation({ seatInfo, variant: round });
  const result = resolveFamilyQuestionInstance({
    question,
    assignmentId,
    storageIndex: slot.storageIndex,
    slotKey: recoverySlotKey({ assignmentId, section, kind: 'recoveryPractice', opportunity, questionId: slot.questionId || `index-${slot.storageIndex}` }),
    allocation,
    excludeFingerprints: seenFingerprints,
  });
  if (result.error) return { error: result.error };
  return {
    itemId: `p${index}`,
    practiceIndex: index,
    storageIndex: slot.storageIndex,
    questionId: slot.questionId,
    coverageKey: slot.coverageKey,
    familyId: result.family.id,
    pin: result.delivery,
    question: result.question,
  };
};

/**
 * The Recovery assessment for one student: a list of items with pins.
 */
export const buildRecoveryAssessmentPlan = ({
  assignmentId = '',
  section = 'dol',
  readySlots = [],
  questionsByIndex = {},
  questionCount = 3,
  seatInfo = null,
  seenFingerprints = [],
  opportunity = 1,
} = {}) => {
  const slots = Array.isArray(readySlots) ? readySlots.filter((slot) => slot?.ready) : [];
  if (!slots.length) return { error: 'no-ready-slots' };
  const total = section === 'dol' ? slots.length : Math.max(1, Math.floor(Number(questionCount) || 3));
  const seen = new Set((Array.isArray(seenFingerprints) ? seenFingerprints : []).map(clean).filter(Boolean));
  const items = [];
  for (let position = 0; position < total; position += 1) {
    const slot = slots[position % slots.length];
    const question = questionsByIndex[slot.storageIndex];
    if (!question) return { error: 'slot-question-missing' };
    const round = Math.floor(position / slots.length);
    const result = resolveFamilyQuestionInstance({
      question,
      assignmentId,
      storageIndex: slot.storageIndex,
      slotKey: recoverySlotKey({ assignmentId, section, kind: 'recovery', opportunity, questionId: slot.questionId || `index-${slot.storageIndex}` }),
      allocation: resolveGenerationAllocation({ seatInfo, variant: round }),
      excludeFingerprints: [...seen],
    });
    if (result.error) return { error: result.error, position };
    // Two Recovery items must not be the same question either.
    seen.add(result.delivery.fingerprint);
    items.push({
      itemId: `r${position + 1}`,
      storageIndex: slot.storageIndex,
      questionId: slot.questionId,
      familyId: result.family.id,
      coverageKey: slot.coverageKey,
      pin: result.delivery,
    });
  }
  return {
    error: null,
    section,
    opportunity: Math.max(1, Number(opportunity) || 1),
    items,
  };
};
