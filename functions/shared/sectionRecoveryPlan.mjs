/*
 * WHAT A RECOVERY ASKS: FRESH, EQUIVALENT, UNSEEN.
 *
 * Two kinds of generated question come out of a Recovery:
 *
 *   PRACTICE ITEMS — the mastery gate's evidence. One at a time, for as long
 *   as the families hold a version the student has not seen, cycling through
 *   the original section's families so every skill is practised, and never
 *   repeating a question the student has already seen.
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
 * already met — their original deliveries and their practice items — and
 * only those (`historyIsComplete`). The engine's own reconstruction of a
 * student's earlier variants is for callers that have no such history; run
 * on top of one, it hid versions the student had never seen, and Practice ran
 * dry with most of a family unused (tests/platform/recoveryPracticeSupply).
 * Shuffling answer choices would not count as a different question here,
 * because fingerprints ignore choice order.
 *
 * Pure: no Firestore, no clock.
 */

import { resolveFamilyQuestionInstance } from './questionFamilyInstance.mjs';
import { familyInstanceServerGradable } from './questionFamilyGrading.mjs';
import { resolveGenerationAllocation } from './questionGenerationIdentity.mjs';
import { RECOVERY_GRADING_FAILURE, classifyFamilyGenerationError } from './sectionRecoveryEvidence.mjs';
import {
  TARGETED_PRACTICE_CANDIDATES,
  familyTargetsCodes,
  instanceExposesMisconception,
  normalizeMisconceptionFocus,
  orderSlotsForFocus,
} from './recoveryMisconceptionTargeting.mjs';

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
  misconceptionFocus = null,
} = {}) => {
  // Targeted Recovery (recoveryMisconceptionTargeting.mjs): questions with a
  // diagnosed error lead the rotation; every ready question still follows.
  const focus = normalizeMisconceptionFocus(misconceptionFocus);
  const slots = orderSlotsForFocus(Array.isArray(readySlots) ? readySlots.filter((slot) => slot?.ready) : [], focus);
  if (!slots.length) return { error: 'no-ready-slots' };
  const index = Math.max(0, Math.floor(Number(practiceIndex) || 0));
  const slot = slots[index % slots.length];
  const question = questionsByIndex[slot.storageIndex];
  if (!question) return { error: 'slot-question-missing' };
  const round = Math.floor(index / slots.length);
  const resolveVariant = (variant) => resolveFamilyQuestionInstance({
    question,
    assignmentId,
    storageIndex: slot.storageIndex,
    slotKey: recoverySlotKey({ assignmentId, section, kind: 'recoveryPractice', opportunity, questionId: slot.questionId || `index-${slot.storageIndex}` }),
    allocation: resolveGenerationAllocation({ seatInfo, variant }),
    excludeFingerprints: seenFingerprints,
    // Every version the student has been shown — originals and every earlier
    // Practice item — is in `seenFingerprints`, so nothing is reconstructed.
    historyIsComplete: true,
  });
  let result = resolveVariant(round);
  if (result.error) return { error: result.error };
  // The version in which the student's own error is visible, from a few more
  // allocations of their own seat (any of them is a pin the server accepts);
  // none found keeps the untargeted version.
  const codes = focus[slot.storageIndex] || [];
  const familyKey = `${result.family?.id}@${result.family?.version}`;
  if (codes.length && familyTargetsCodes(familyKey, codes)) {
    for (let step = 0; step < TARGETED_PRACTICE_CANDIDATES; step += 1) {
      const candidate = step === 0 ? result : resolveVariant(round + step);
      if (candidate.error) continue;
      if (instanceExposesMisconception({ familyKey, values: candidate.instance?.values, codes })) {
        result = candidate;
        break;
      }
    }
  }
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
      // `seen` is the student's whole history plus this plan's earlier items.
      historyIsComplete: true,
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

/*
 * A TEACHER'S REPLACEMENT FOR QUESTIONS MATHMASTER COULD NOT GRADE.
 *
 * Never a re-roll of the old question and never chosen by a browser (PR #430:
 * the client must not pick a replacement for an authoritative pin). For each
 * held item the server builds a NEW item:
 *
 *   - a new item id (`r3-replacement-1`) that names the one it replaces;
 *   - a new slot key, so its identity is its own — not the next instance on
 *     the failed pin's list;
 *   - allocated from the student's own seat, from the question's CURRENT
 *     content (the teacher may have fixed it), skipping every question the
 *     student has seen — the failed pins included.
 *
 * The old item stays in the plan with its pin byte-identical (the caller
 * marks it `supersededBy`); its result is never rewritten.
 *
 * If the question still cannot produce a gradable instance, nothing is issued
 * and the classification says why — the teacher fixes the question first.
 *
 * Returns { error: null, items } or { error, itemId, classification }.
 */
const REPLACEMENT_KIND = 'recoveryReplacement';

const rootItemId = (items, itemId) => {
  let current = items.find((item) => item.itemId === itemId);
  const visited = new Set();
  while (current?.replaces && !visited.has(current.itemId)) {
    visited.add(current.itemId);
    const replaced = current.replaces;
    current = items.find((item) => item.itemId === replaced) || { itemId: replaced };
  }
  return current?.itemId || itemId;
};

export const buildRecoveryReplacementItems = ({
  assignmentId = '',
  section = 'dol',
  record = null,
  itemIds = [],
  questionsByIndex = {},
  seatInfo = null,
  seenFingerprints = [],
  issuedAt = null,
  issueReasonFor = () => null,
} = {}) => {
  const planItems = Array.isArray(record?.plan?.items) ? record.plan.items : [];
  const opportunity = Math.max(1, Number(record?.plan?.opportunity) || 1);
  const seen = new Set((Array.isArray(seenFingerprints) ? seenFingerprints : []).map(clean).filter(Boolean));
  planItems.forEach((item) => { if (clean(item?.pin?.fingerprint)) seen.add(clean(item.pin.fingerprint)); });
  const usedIds = new Set(planItems.map((item) => item.itemId));
  const items = [];
  for (const itemId of (Array.isArray(itemIds) ? itemIds : [])) {
    const original = planItems.find((item) => item.itemId === itemId);
    if (!original) return { error: 'replacement-item-unknown', itemId, classification: null };
    const question = questionsByIndex?.[original.storageIndex] || null;
    if (!question) return { error: 'replacement-unavailable', itemId, classification: RECOVERY_GRADING_FAILURE.QUESTION_REMOVED };
    const root = rootItemId(planItems, itemId);
    let generation = 1;
    while (usedIds.has(`${root}-replacement-${generation}`)) generation += 1;
    const newItemId = `${root}-replacement-${generation}`;
    usedIds.add(newItemId);
    let result;
    try {
      result = resolveFamilyQuestionInstance({
        question,
        assignmentId,
        storageIndex: original.storageIndex,
        slotKey: recoverySlotKey({
          assignmentId,
          section,
          kind: REPLACEMENT_KIND,
          opportunity,
          questionId: `${original.questionId || `index-${original.storageIndex}`}#${newItemId}`,
        }),
        allocation: resolveGenerationAllocation({ seatInfo, variant: 0 }),
        excludeFingerprints: [...seen],
        // Every version the student was shown, the failed pins included.
        historyIsComplete: true,
      });
    } catch {
      return { error: 'replacement-unavailable', itemId, classification: 'resolution-exception' };
    }
    if (result.error) {
      return { error: 'replacement-unavailable', itemId, classification: classifyFamilyGenerationError({ question, error: result.error }) };
    }
    if (!familyInstanceServerGradable(result.question)) {
      return { error: 'replacement-unavailable', itemId, classification: RECOVERY_GRADING_FAILURE.GRADER_UNAVAILABLE };
    }
    seen.add(result.delivery.fingerprint);
    items.push({
      itemId: newItemId,
      storageIndex: original.storageIndex,
      questionId: original.questionId,
      familyId: result.family.id,
      coverageKey: result.family.recovery?.equivalenceGroup || result.family.id,
      pin: result.delivery,
      replaces: itemId,
      issuedAt: clean(issuedAt) || null,
      issueReason: clean(issueReasonFor(itemId)).slice(0, 80) || null,
    });
  }
  return { error: null, items };
};
