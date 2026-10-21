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
 * A STATIC QUESTION WITH RECOVERY CONTENT (Recovery V2, recoveryContent.mjs)
 * is ready the same way: its certified binding names a family, and that
 * family's slot — synthesized from the original's identity, never its wording
 * — is judged by exactly the checks below. The slot carries the synthesized
 * question (`recoveryQuestion`) so the plan, the runner and the server's
 * grading all generate from the same template. A binding certified for an
 * earlier version of the question is stale and never used.
 *
 * Pure: callers pass the section's current-content entries.
 */

import { familySlotKey, isFamilyBackedQuestion, resolveQuestionFamilyDefinition } from './questionFamilyInstance.mjs';
import { buildFamilyQuestion, cachedFamilyInstanceSequence } from './questionFamilyEngine.mjs';
import { familyInstanceServerGradable } from './questionFamilyGrading.mjs';
import {
  RECOVERY_SOURCE_KIND,
  assignmentRecoveryContent,
  primaryStandardCodes,
  resolveRecoverySource,
} from './recoveryContent.mjs';

export const RECOVERY_READINESS_ISSUE = Object.freeze({
  NO_QUESTIONS: 'no-section-questions',
  STATIC_QUESTION: 'static-question',
  FAMILY_UNRESOLVED: 'family-unresolved',
  NOT_RECOVERY_ELIGIBLE: 'family-not-recovery-eligible',
  TOOL_NOT_SERVER_GRADABLE: 'tool-not-server-gradable',
  INSUFFICIENT_VARIANTS: 'insufficient-variants',
  // A Recovery V2 binding certified for an earlier version of the question.
  BINDING_STALE: 'recovery-binding-stale',
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
    case RECOVERY_READINESS_ISSUE.BINDING_STALE:
      return `${label} was changed after its Recovery was prepared, so that Recovery no longer matches it. Prepare Recovery again.`;
    default:
      return `${label} is not ready for Recovery.`;
  }
};

/**
 * Readiness of one question for Recovery.
 */
export const assessRecoverySlot = ({
  assignmentId = '',
  question = null,
  storageIndex = 0,
  label = '',
  // The assignment (or its normalized recoveryContent), for a static
  // question's Recovery V2 binding. Absent: only family slots can be ready.
  assignment = null,
  content = undefined,
} = {}) => {
  const slot = {
    storageIndex,
    questionId: String(question?.questionId || question?.id || ''),
    label,
    ready: false,
    familyId: null,
    familyVersion: null,
    tool: null,
    coverageKey: null,
    // Where its Recovery comes from: its own family, or recoveryContent.
    source: null,
    // The family slot Recovery generates from (the question itself, or the
    // synthesized slot of a bound static question).
    recoveryQuestion: null,
    // The original in the family's terms, never dealt as a Recovery.
    originalFingerprints: [],
    // The original's primary standards: the skill assignment Practice must
    // match to count toward unlocking (assignmentPracticeEvidence.mjs).
    primaryStandards: primaryStandardCodes(question || {}),
    issues: [],
  };
  const fail = (code, detail = '') => {
    slot.issues.push({ code, message: issueMessage(code, label, detail) });
    return slot;
  };
  let generationQuestion = question;
  if (isFamilyBackedQuestion(question)) {
    slot.source = RECOVERY_SOURCE_KIND.FAMILY;
  } else {
    const recoverySource = (assignment || content !== undefined)
      ? resolveRecoverySource({ assignment, question, content })
      : { kind: RECOVERY_SOURCE_KIND.NONE };
    if (recoverySource.kind === RECOVERY_SOURCE_KIND.STALE) return fail(RECOVERY_READINESS_ISSUE.BINDING_STALE);
    if (recoverySource.kind !== RECOVERY_SOURCE_KIND.BINDING) return fail(RECOVERY_READINESS_ISSUE.STATIC_QUESTION);
    slot.source = RECOVERY_SOURCE_KIND.BINDING;
    slot.originalFingerprints = [...recoverySource.originalFingerprints];
    generationQuestion = recoverySource.question;
  }
  slot.recoveryQuestion = generationQuestion;
  const slotKey = familySlotKey({ assignmentId, question: generationQuestion, storageIndex });
  const definition = resolveQuestionFamilyDefinition(generationQuestion, { slotKey });
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
  const sample = buildFamilyQuestion({ family, instance: first, constraintValues, authored: generationQuestion, tool });
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
export const assessSectionRecoveryReadiness = ({ assignmentId = '', section = 'dol', entries = [], assignment = null } = {}) => {
  const sectionLabel = SECTION_LABEL[section] || section;
  const list = Array.isArray(entries) ? entries.filter((entry) => entry?.question) : [];
  // Normalized once for the section, not once per question.
  const content = assignment ? assignmentRecoveryContent(assignment) : undefined;
  const slots = list.map((entry, position) => assessRecoverySlot({
    assignmentId,
    question: entry.question,
    storageIndex: entry.storageIndex,
    label: `${sectionLabel} Q${position + 1}`,
    content,
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
