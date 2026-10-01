/*
 * CAN THIS SECTION HONESTLY OFFER AUTOMATIC RECOVERY?
 *
 * Recovery promises a student a FRESH, EQUIVALENT question for every question
 * of the original — same family, same skill, same rigor, same tool, different
 * numbers — graded by the server. That promise can only be kept for a question
 * backed by a question family whose tool the server can mark. A static
 * question cannot be "regenerated"; serving it again would be the same
 * question, and serving something else would not be equivalent.
 *
 * So readiness is decided per question, and:
 *
 *   DOL      every included DOL question must be ready. One static question
 *            makes automatic DOL Recovery unavailable, and Pre-Flight says so
 *            ("DOL Q3 does not reference a generator-backed Question Family")
 *            instead of the platform silently claiming otherwise.
 *   Warm-Up  at least one Warm-Up question must be ready; Recovery draws its
 *            2-3 questions from the ready ones. Static Warm-Up questions are
 *            reported as warnings.
 *
 * Pure: callers pass the section's current-content entries.
 */

import { familySlotKey, isFamilyBackedQuestion, resolveQuestionFamilyDefinition } from './questionFamilyInstance.mjs';
import { buildFamilyQuestion, cachedFamilyInstanceSequence } from './questionFamilyEngine.mjs';
import { familyInstanceServerGradable } from './questionFamilyGrading.mjs';

export const RECOVERY_READINESS_ISSUE = Object.freeze({
  NO_QUESTIONS: 'no-section-questions',
  STATIC_QUESTION: 'static-question',
  FAMILY_UNRESOLVED: 'family-unresolved',
  NOT_RECOVERY_ELIGIBLE: 'family-not-recovery-eligible',
  TOOL_NOT_SERVER_GRADABLE: 'tool-not-server-gradable',
  INSUFFICIENT_VARIANTS: 'insufficient-variants',
});

const SECTION_LABEL = Object.freeze({ warmup: 'Warm-Up', dol: 'DOL' });

const issueMessage = (code, label, detail = '') => {
  switch (code) {
    case RECOVERY_READINESS_ISSUE.STATIC_QUESTION:
      return `${label} does not reference a generator-backed Question Family.`;
    case RECOVERY_READINESS_ISSUE.FAMILY_UNRESOLVED:
      return `${label} references a Question Family that cannot generate questions${detail ? ` (${detail})` : ''}.`;
    case RECOVERY_READINESS_ISSUE.NOT_RECOVERY_ELIGIBLE:
      return `${label} uses a Question Family that is not marked eligible for Recovery.`;
    case RECOVERY_READINESS_ISSUE.TOOL_NOT_SERVER_GRADABLE:
      return `${label} uses a tool (${detail}) whose answers the server cannot mark, so a Recovery grade could not be verified.`;
    case RECOVERY_READINESS_ISSUE.INSUFFICIENT_VARIANTS:
      return `${label} cannot produce a fresh question beyond the one already delivered.`;
    default:
      return `${label} is not ready for Recovery.`;
  }
};

/**
 * Readiness of one question for Recovery.
 */
export const assessRecoverySlot = ({ assignmentId = '', question = null, storageIndex = 0, label = '' } = {}) => {
  const slot = {
    storageIndex,
    questionId: String(question?.questionId || question?.id || ''),
    label,
    ready: false,
    familyId: null,
    familyVersion: null,
    tool: null,
    coverageKey: null,
    issues: [],
  };
  const fail = (code, detail = '') => {
    slot.issues.push({ code, message: issueMessage(code, label, detail) });
    return slot;
  };
  if (!isFamilyBackedQuestion(question)) return fail(RECOVERY_READINESS_ISSUE.STATIC_QUESTION);
  const slotKey = familySlotKey({ assignmentId, question, storageIndex });
  const definition = resolveQuestionFamilyDefinition(question, { slotKey });
  if (definition.error) return fail(RECOVERY_READINESS_ISSUE.FAMILY_UNRESOLVED, definition.error);
  const { family, constraintValues, tool } = definition;
  slot.familyId = family.id;
  slot.familyVersion = family.version;
  slot.tool = tool;
  slot.coverageKey = family.recovery.equivalenceGroup;
  if (!family.recovery.eligible) return fail(RECOVERY_READINESS_ISSUE.NOT_RECOVERY_ELIGIBLE);
  const sequence = cachedFamilyInstanceSequence(family, constraintValues, `${slotKey}|recovery-readiness`);
  const first = sequence.instanceAt(0);
  if (!first || !sequence.instanceAt(1)) return fail(RECOVERY_READINESS_ISSUE.INSUFFICIENT_VARIANTS);
  const sample = buildFamilyQuestion({ family, instance: first, constraintValues, authored: question, tool });
  if (!familyInstanceServerGradable(sample)) return fail(RECOVERY_READINESS_ISSUE.TOOL_NOT_SERVER_GRADABLE, sample.type);
  slot.ready = true;
  return slot;
};

/**
 * Readiness of a whole Warm-Up or DOL section.
 *
 * `entries` are the section's included current-content questions, in order:
 * [{ storageIndex, question }].
 */
export const assessSectionRecoveryReadiness = ({ assignmentId = '', section = 'dol', entries = [] } = {}) => {
  const sectionLabel = SECTION_LABEL[section] || section;
  const list = Array.isArray(entries) ? entries.filter((entry) => entry?.question) : [];
  const slots = list.map((entry, position) => assessRecoverySlot({
    assignmentId,
    question: entry.question,
    storageIndex: entry.storageIndex,
    label: `${sectionLabel} Q${position + 1}`,
  }));
  const readySlots = slots.filter((slot) => slot.ready);
  const issues = slots.flatMap((slot) => slot.issues.map((issue) => ({ ...issue, storageIndex: slot.storageIndex, label: slot.label })));
  const ready = section === 'dol'
    ? slots.length > 0 && readySlots.length === slots.length
    : readySlots.length > 0;
  return {
    section,
    ready,
    slots,
    readySlots,
    // For a DOL, every issue blocks; for a Warm-Up only "nothing is ready" does.
    blockers: section === 'dol' || !readySlots.length ? issues : [],
    warnings: section === 'dol' || !readySlots.length ? [] : issues,
    reason: !slots.length
      ? RECOVERY_READINESS_ISSUE.NO_QUESTIONS
      : ready ? null : issues[0]?.code || RECOVERY_READINESS_ISSUE.STATIC_QUESTION,
  };
};
