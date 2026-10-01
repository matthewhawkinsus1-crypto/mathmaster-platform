/*
 * PRE-FLIGHT: WILL EVERY STUDENT GET A REAL, GRADABLE, DIFFERENT QUESTION —
 * AND CAN RECOVERY BE GENERATED?
 *
 * Read-only checks over the assignment exactly as it will run:
 *
 *   QUESTION FAMILIES   the family (or assignment-local template) resolves,
 *                       the generator produces instances, the tool asked for
 *                       is one the family can fill, and the ANSWER KEY of a
 *                       sample of instances grades as correct on the server's
 *                       own grading contract — a key that disagrees with its
 *                       question is caught here, before a student meets it.
 *   CAPACITY            how many distinct questions the slot can produce,
 *                       compared with the class it will be given to.
 *   SAME QUESTION       a DOL set to give students different versions whose
 *                       questions cannot vary is named, instead of silently
 *                       showing every student the same exit ticket.
 *   RECOVERY            for the Warm-Up and DOL: can a fresh, server-graded
 *                       Recovery be generated, and if not, which question
 *                       stops it (in the words teachers act on).
 *   LIVE CHALLENGE      a Warm-Up delivered by Live Challenge is reported as
 *                       such — never as a Warm-Up students will be missing.
 *
 * Bounded work: each family's capacity is measured once per run (budgeted),
 * and at most SAMPLE_INSTANCES instances per slot are built and graded.
 * Nothing is cached across runs, so an edited template is always re-checked.
 */

import {
  isFamilyBackedQuestion,
  resolveFamilyQuestionInstance,
  resolveQuestionFamilyDefinition,
  familySlotKey,
} from '../../../functions/shared/questionFamilyInstance.mjs';
import { measureFamilyCapacity } from '../../../functions/shared/questionFamilyEngine.mjs';
import { familyInstanceServerGradable, gradeFamilyInstanceResponse } from '../../../functions/shared/questionFamilyGrading.mjs';
import { describeQuestionVariability, VARIABILITY } from '../../../functions/shared/questionVariability.mjs';
import { assessSectionRecoveryReadiness } from '../../../functions/shared/sectionRecoveryReadiness.mjs';
import { normalizeRecoveryPolicy } from '../../../functions/shared/recoveryPolicy.mjs';
import { resolveWarmupDelivery, warmupIsNotAssignmentDelivered } from '../../../functions/shared/warmupDelivery.mjs';

export const SAMPLE_INSTANCES = 6;
export const CAPACITY_BUDGET = 2048;
// Used when Pre-Flight does not know the roster yet (a draft with no class).
export const REFERENCE_CLASS_SIZE = 32;
// Enough for the original, a full Practice window and the Recovery itself.
export const RECOVERY_MINIMUM_CAPACITY = 12;

const clean = (value) => String(value ?? '').trim();
const SECTION_LABEL = Object.freeze({ warmup: 'Warm-Up', classwork: 'Classwork', practice: 'Practice', dol: 'DOL', quiz: 'Quiz', test: 'Test' });
const sectionLabel = (role) => SECTION_LABEL[role] || 'Section';

const sectionModeFor = (assignment, role) => {
  const mode = clean(assignment?.variantPolicy?.sectionModes?.[role] || assignment?.variantPolicy?.mode).toLowerCase();
  if (mode === 'variant') return 'personalized';
  return ['shared', 'personalized', 'adaptive'].includes(mode) ? mode : 'personalized';
};

/** The response a student who answered with the key would send. */
export const answerKeyResponse = (question = {}) => {
  const type = clean(question?.type);
  if (type === 'stepAlgebra') {
    const variable = clean(question.variable || question.objective?.variable || 'x');
    return Number.isFinite(Number(question.generatedAnswer))
      ? { kind: 'opaque', type, value: `${variable}=${question.generatedAnswer}`, fields: [] }
      : null;
  }
  if (type === 'system' && Array.isArray(question.solution)) {
    return { kind: 'scalar', type, value: `(${question.solution[0]}, ${question.solution[1]})`, fields: [] };
  }
  if (type === 'orderedPair') {
    const pair = question.answer || question.solution;
    return Array.isArray(pair) ? { kind: 'scalar', type, value: `(${pair[0]}, ${pair[1]})`, fields: [] } : null;
  }
  if (type === 'literal' && Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length) {
    return { kind: 'scalar', type, value: String(question.acceptedAnswers[0]), fields: [] };
  }
  if (type === 'multiAnswer' && Array.isArray(question.answerFields) && question.answerFields.length) {
    return {
      kind: 'fields',
      type,
      value: '',
      fields: question.answerFields.map((field) => ({ id: clean(field?.id), value: String(field?.answer ?? field?.expected ?? ''), isComplete: true })),
    };
  }
  return null;
};

/**
 * One family-backed slot: does it resolve, does its key grade, how many
 * distinct questions can it make?
 */
const auditFamilySlot = ({ assignmentId, question, storageIndex, capacityMemo }) => {
  const slotKey = familySlotKey({ assignmentId, question, storageIndex });
  const definition = resolveQuestionFamilyDefinition(question, { slotKey });
  if (definition.error) {
    return { error: definition.error, detail: (definition.issues || []).join('; ') };
  }
  const { family, constraintValues } = definition;
  const capacityKey = `${family.id}@${family.version}|${JSON.stringify(constraintValues)}|${family.scope === 'assignment' ? slotKey : ''}`;
  if (!capacityMemo.has(capacityKey)) {
    capacityMemo.set(capacityKey, measureFamilyCapacity(family, constraintValues, { budget: CAPACITY_BUDGET }));
  }
  const capacity = capacityMemo.get(capacityKey);
  const keyFailures = [];
  let gradable = true;
  let sampled = 0;
  for (let index = 0; index < SAMPLE_INSTANCES; index += 1) {
    const result = resolveFamilyQuestionInstance({
      question,
      assignmentId,
      storageIndex,
      allocation: { seat: index, variant: 0, stride: 1, index, basis: 'preview' },
    });
    if (result.error) break;
    sampled += 1;
    if (!familyInstanceServerGradable(result.question)) {
      gradable = false;
      break;
    }
    const response = answerKeyResponse(result.question);
    if (!response) continue;
    const grading = gradeFamilyInstanceResponse({ question: result.question, response });
    if (grading.isCorrect !== true) keyFailures.push(result.instance.answer?.display || result.instance.fingerprint);
  }
  return {
    error: sampled ? null : 'family_has_no_valid_instances',
    family,
    capacity,
    toolIssue: definition.toolIssue,
    constraintIssues: definition.constraintIssues || [],
    gradable,
    keyFailures,
    sampled,
  };
};

/**
 * The audit. `questions` are the flattened runtime questions, in order (the
 * flat index is the "Question N" every other Pre-Flight message uses).
 */
export const auditAssignmentQuestionGeneration = (assignment = {}, questions = [], { classSize = null } = {}) => {
  const list = Array.isArray(questions) ? questions : [];
  const assignmentId = clean(assignment?.id || assignment?.assignment?.id) || 'preflight';
  const knownClassSize = Number.isInteger(Number(classSize)) && Number(classSize) > 0 ? Number(classSize) : null;
  const comparedClassSize = knownClassSize || REFERENCE_CLASS_SIZE;
  const capacityMemo = new Map();
  const errors = [];
  const warnings = [];
  const notes = [];
  const slots = [];
  const positionInSection = {};
  const staticBySection = {};

  list.forEach((question, flatIndex) => {
    const role = clean(question?.activityRole).toLowerCase() || 'classwork';
    positionInSection[role] = (positionInSection[role] || 0) + 1;
    const where = `Question ${flatIndex + 1} (${sectionLabel(role)} Q${positionInSection[role]})`;
    const mode = sectionModeFor(assignment, role);
    const variability = describeQuestionVariability(question);

    if (!isFamilyBackedQuestion(question)) {
      // Only the DOL: it is the independent check whose integrity depends on
      // students not sharing a question. A static Classwork example is
      // ordinary teaching, not a fallback.
      if (mode !== 'shared' && !variability.canVary && role === 'dol') {
        (staticBySection[role] ||= []).push(positionInSection[role]);
      }
      if (variability.mode === VARIABILITY.UNRECOGNIZED_GENERATOR) {
        warnings.push(`${where} has a generator MathMaster does not recognize (${variability.reason}), so every student is shown the same question.`);
      }
      slots.push({ questionIndex: flatIndex, role, label: where, familyBacked: false, variability: variability.mode });
      return;
    }

    const audit = auditFamilySlot({ assignmentId, question, storageIndex: flatIndex, capacityMemo });
    if (audit.error) {
      // Blocking already: semantic validation refuses a family reference that
      // cannot generate (semanticValidation.js), on every path that imports
      // or publishes. Recorded here for the slot summary and Recovery only.
      slots.push({ questionIndex: flatIndex, role, label: where, familyBacked: true, ready: false, error: audit.error });
      return;
    }
    if (audit.toolIssue) {
      warnings.push(`${where} asks for the ${audit.toolIssue.requested} tool, which ${audit.family.id} cannot fill; it will open in ${audit.toolIssue.used} instead.`);
    }
    audit.constraintIssues.forEach((issue) => {
      warnings.push(`${where}: constraint "${issue.constraint}" (${JSON.stringify(issue.requested)}) is not something ${audit.family.id} allows, so its default is used (${issue.code}).`);
    });
    if (!audit.gradable) {
      warnings.push(`${where} uses a tool whose answers the server cannot mark for ${audit.family.id}; its grade will rely on the student's device.`);
    }
    if (audit.keyFailures.length) {
      errors.push(`${where}: the generated answer key does not grade as correct for ${audit.keyFailures.length} of ${audit.sampled} sampled versions (for example ${audit.keyFailures[0]}). Fix the answer in the template or family before students see it.`);
    }
    const capacity = audit.capacity.capacity;
    const approx = audit.capacity.exact ? '' : 'about ';
    if (mode !== 'shared' && capacity < comparedClassSize) {
      warnings.push(`${where} can produce only ${approx}${capacity} distinct question${capacity === 1 ? '' : 's'} — fewer than ${knownClassSize ? `this class of ${knownClassSize}` : `a class of ${REFERENCE_CLASS_SIZE}`}, so some students will share a question. Widen the family's ranges to give everyone their own.`);
    }
    slots.push({
      questionIndex: flatIndex,
      role,
      label: where,
      familyBacked: true,
      ready: audit.keyFailures.length === 0,
      familyId: audit.family.id,
      familyVersion: audit.family.version,
      scope: audit.family.scope,
      mode,
      capacity,
      capacityExact: audit.capacity.exact,
    });
  });

  Object.entries(staticBySection).forEach(([role, positions]) => {
    const total = positionInSection[role] || positions.length;
    const which = positions.length === total && total > 1
      ? `none of its ${total} questions vary`
      : `${positions.length === 1 ? `Q${positions[0]} does` : `Q${positions.join(', Q')} do`} not vary`;
    warnings.push(`${sectionLabel(role)} is set to give students different versions, but ${which}: every student sees the same question there. Give ${positions.length === 1 ? 'it' : 'them'} a Question Family, or choose "Same questions for all students".`);
  });

  // Recovery readiness, Warm-Up and DOL.
  const policy = normalizeRecoveryPolicy(assignment);
  const recovery = {};
  ['warmup', 'dol'].forEach((section) => {
    const entries = list
      .map((question, storageIndex) => ({ question, storageIndex }))
      .filter((entry) => clean(entry.question?.activityRole).toLowerCase() === section);
    if (!entries.length) return;
    const label = `${sectionLabel(section)} Recovery`;
    if (!policy.enabled || !policy[section]?.enabled || policy.automaticOpportunities < 1) {
      recovery[section] = { status: 'off' };
      notes.push(`${label} is turned off for this assignment.`);
      return;
    }
    if (section === 'warmup') {
      const delivery = resolveWarmupDelivery({ assignment, hasAuthoredWarmup: true });
      if (warmupIsNotAssignmentDelivered(delivery)) {
        recovery[section] = { status: 'liveChallenge' };
        notes.push('Warm-Up is delivered by Live Challenge: MathMaster will not generate a Warm-Up Recovery, and students who played are not treated as missing the authored Warm-Up.');
        return;
      }
    }
    const readiness = assessSectionRecoveryReadiness({ assignmentId, section, entries });
    const linked = (issue) => `${issue.message} (Question ${issue.storageIndex + 1})`;
    const anyFamilyBacked = entries.some((entry) => isFamilyBackedQuestion(entry.question));
    if (!anyFamilyBacked) {
      // A section that never opted in (every legacy assignment) is not an
      // authoring mistake; it simply has no automatic Recovery. Say so once.
      recovery[section] = { status: 'notConfigured', readyQuestions: 0, totalQuestions: entries.length };
      notes.push(`${label} is not available: ${entries.length === 1 ? 'this question does' : `none of its ${entries.length} questions`} ${entries.length === 1 ? 'not reference' : 'reference'} a generator-backed Question Family, so students will not be offered an automatic Recovery.`);
      return;
    }
    // Partly family-backed: the teacher meant Recovery to work, and these are
    // the questions stopping it.
    readiness.blockers.forEach((issue) => warnings.push(`Recovery generation unavailable: ${linked(issue)}`));
    readiness.warnings.forEach((issue) => warnings.push(`${label} will skip one question: ${linked(issue)}`));
    const thin = readiness.readySlots.filter((slot) => {
      const known = slots.find((entry) => entry.questionIndex === slot.storageIndex);
      return known?.familyBacked && Number.isFinite(known.capacity) && known.capacity < RECOVERY_MINIMUM_CAPACITY;
    });
    thin.forEach((slot) => {
      warnings.push(`${label}: ${slot.label} can produce very few distinct questions, so a student who practices a lot may run out of fresh ones (Question ${slot.storageIndex + 1}).`);
    });
    recovery[section] = {
      status: readiness.ready ? 'ready' : 'unavailable',
      readyQuestions: readiness.readySlots.length,
      totalQuestions: entries.length,
    };
    if (readiness.ready) {
      notes.push(section === 'dol'
        ? `${label} ready: each of the ${entries.length} DOL question${entries.length === 1 ? '' : 's'} can generate fresh, server-graded versions (unlocks after ${policy.mastery.requiredCorrect} of the last ${policy.mastery.windowSize} Practice questions correct; counts up to ${policy.dol.maxRecordedScore}%).`
        : `${label} ready: ${policy.warmup.questionCount} fresh questions from ${readiness.readySlots.length} Warm-Up question${readiness.readySlots.length === 1 ? '' : 's'} (counts up to ${policy.warmup.maxRecordedScore}%).`);
    }
  });

  const familySlots = slots.filter((slot) => slot.familyBacked && !slot.error);
  if (familySlots.length) {
    notes.unshift(`${familySlots.length} question${familySlots.length === 1 ? ' generates' : 's generate'} a different version for each student from a Question Family${knownClassSize ? ` (checked against a class of ${knownClassSize})` : ''}.`);
  }

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    notes,
    slots,
    recovery,
    classSize: knownClassSize,
  };
};
