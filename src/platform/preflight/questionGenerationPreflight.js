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
import { describeConstraintIssue } from '../../../functions/shared/questionFamilyContract.mjs';
import { allRegisteredQuestionFamilies } from '../../../functions/shared/questionFamilyRegistry.mjs';
import { placeholdersUsed } from '../../../functions/shared/pathQuestionGeneration.mjs';
import { familyInstanceGradingSupport, familyInstanceServerGradable } from '../../../functions/shared/questionFamilyGrading.mjs';
// The answer-key self-check below only builds keys for ordinary types and a
// Step Algebra instance's final answer, so it uses the two LIGHT graders for
// those: Pre-Flight is on the app's static import path, which must not load
// the composed, workspace or tool graders (and mathjs with them).
import { gradeOrdinaryResponse } from '../../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeStepAlgebraFinalAnswer } from '../../../functions/shared/serverGrading/stepAlgebraFinalAnswer.mjs';
import { serverResponseGradingSupport } from '../../../functions/shared/serverGrading/gradingSupport.mjs';
import { deliveredQuestionForGrading } from '../../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { GRADING_AUTHORITY } from '../../../functions/shared/serverGrading/gradingAuthority.mjs';
import { describeQuestionVariability, VARIABILITY } from '../../../functions/shared/questionVariability.mjs';
import { assessSectionRecoveryReadiness } from '../../../functions/shared/sectionRecoveryReadiness.mjs';
import { normalizeRecoveryPolicy } from '../../../functions/shared/recoveryPolicy.mjs';
import { resolveWarmupDelivery, warmupIsNotAssignmentDelivered } from '../../../functions/shared/warmupDelivery.mjs';
import { MISSING_TOOL_IDS, validateToolQuestion } from '../../tools/toolSchemas.js';
import { validateQuestionSemantics } from '../contract/semanticValidation.js';

export const SAMPLE_INSTANCES = 6;
// An assignment-local template is checked against a class's worth of its
// generated versions, not one preview: a fixed graph window, a hard-coded
// table width or a derived value can be right for most parameter tuples and
// wrong for a few, and the student who draws one of those gets a broken
// question. A platform family is held to its own rules and property tests, so
// it keeps the smaller sample — unless the slot writes its own words around
// the family's numbers ({{tokens}} in a prompt, story or answer choices):
// those words were never property-tested, so they get the template sample.
export const TEMPLATE_VALIDATION_SAMPLE = 32;
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
/** Does the generated answer key grade correct? (Ordinary types and Step Algebra only.) */
const selfCheckAnswerKey = (question, response) => (
  clean(question?.type) === 'stepAlgebra'
    ? gradeStepAlgebraFinalAnswer({ question, responseValue: response.value })
    : gradeOrdinaryResponse({ question, response })
);

export const answerKeyResponse = (question = {}) => {
  const type = clean(question?.type);
  if (type === 'stepAlgebra') {
    const variable = clean(question.variable || question.objective?.variable || 'x');
    if (Number.isFinite(Number(question.generatedAnswer))) {
      return { kind: 'opaque', type, value: `${variable}=${question.generatedAnswer}`, fields: [] };
    }
    // A Question Family instance with an exact key (linear.multiStepEquation
    // v2 and later): a fraction, or a special outcome, written as the
    // workspace writes a finished solve.
    const key = question.solutionKey;
    if (key?.outcome === 'value' && clean(key.value)) return { kind: 'opaque', type, value: `${variable}=${clean(key.value)}`, fields: [] };
    if (key?.outcome === 'noSolution') return { kind: 'opaque', type, value: 'No solution', fields: [] };
    if (key?.outcome === 'allReals') return { kind: 'opaque', type, value: 'All real numbers', fields: [] };
    return null;
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
  const invalidVersions = [];
  let gradable = true;
  let gradingSupport = null;
  let sampled = 0;
  let validated = 0;
  const validationSample = family.scope === 'assignment' || slotWritesFamilyTokens(question)
    ? Math.max(SAMPLE_INSTANCES, TEMPLATE_VALIDATION_SAMPLE)
    : SAMPLE_INSTANCES;
  for (let index = 0; index < validationSample; index += 1) {
    const result = resolveFamilyQuestionInstance({
      question,
      assignmentId,
      storageIndex,
      allocation: { seat: index, variant: 0, stride: 1, index, basis: 'preview' },
    });
    if (result.error) break;
    validated += 1;
    // Every sampled version is judged exactly as a static question would be:
    // the rich tool's own schema, then the platform's semantic validation.
    const problems = generatedVersionProblems(result.question);
    if (problems.length) invalidVersions.push({ parameters: result.instance.params, problem: problems[0].text, fix: problems[0].fix });
    if (index >= SAMPLE_INSTANCES || !gradable) continue;
    sampled += 1;
    if (!familyInstanceServerGradable(result.question)) {
      gradable = false;
      // The shared grading registry's own reason — and, for a tool mode that
      // stays on the device, its documented blocker — so the warning says
      // exactly why rather than just "cannot".
      gradingSupport = familyInstanceGradingSupport(result.question);
      continue;
    }
    const response = answerKeyResponse(result.question);
    if (!response) continue;
    const grading = selfCheckAnswerKey(result.question, response);
    if (grading.isCorrect !== true) keyFailures.push(result.instance.answer?.display || result.instance.fingerprint);
  }
  return {
    error: validated ? null : 'family_has_no_valid_instances',
    family,
    capacity,
    toolIssue: definition.toolIssue,
    constraintIssues: definition.constraintIssues || [],
    gradable,
    gradingSupport,
    keyFailures,
    sampled,
    validated,
    invalidVersions,
  };
};

/**
 * Why a generated version could not be given to a student, or [] when it can:
 * a registry tool's own schema first, then semantic validation of the built
 * question (which is no longer a template, so it is judged directly).
 */
const generatedVersionProblems = (built) => {
  // A {{token}} the family never filled would reach the student exactly as
  // written: a misspelled name in an authored prompt, story or choice.
  const unfilled = [...placeholdersUsed(built)];
  if (unfilled.length) {
    return [{
      text: `This version would show ${unfilled.map((name) => `{{${name}}}`).join(', ')} to the student as written, because the family fills no value by ${unfilled.length === 1 ? 'that name' : 'those names'}`,
      fix: 'Correct the name, or use one of the values the family fills.',
    }];
  }
  const type = clean(built?.toolId || built?.type);
  const problems = [];
  if (MISSING_TOOL_IDS.includes(type)) {
    problems.push(...(validateToolQuestion({ ...built, toolId: type }).errors || []));
  }
  if (!problems.length) {
    problems.push(...(validateQuestionSemantics(built, { label: 'This version' }).errors || []));
  }
  return problems.map((text) => ({ text, fix: null }));
};

/** Does the slot write its own {{tokens}} around a family's numbers (outside a local template's generator)? */
const slotWritesFamilyTokens = (question = {}) => {
  const { generator: _generator, ...authored } = question || {};
  return placeholdersUsed(authored).size > 0;
};

/** The oldest registered version of this platform family, newer than it, that declares `constraint`; null if none. */
const newerVersionDeclaring = (family, constraint) => {
  if (family?.scope !== 'platform') return null;
  const versions = allRegisteredQuestionFamilies()
    .filter((candidate) => candidate.id === family.id
      && candidate.version > family.version
      && Object.prototype.hasOwnProperty.call(candidate.constraints || {}, constraint))
    .map((candidate) => candidate.version)
    .sort((left, right) => left - right);
  return versions.length ? versions[0] : null;
};

const describeParameters = (parameters = {}) => Object.entries(parameters)
  .map(([name, value]) => `${name} = ${value}`)
  .join(', ');

/*
 * WHO WILL MARK THIS STATIC QUESTION?
 *
 * Read from the shared grading registry (serverGrading/gradingManifest.mjs),
 * never from a list of tool names here, against the question the student will
 * actually be shown (the runtime repair QuestionEngine applies). A question
 * the server can mark — or that a dedicated server subsystem grades — needs no
 * comment. One whose grade will rely on the student's device is named, with
 * the registry's documented reason, so a teacher is never surprised by it.
 */
const GENERATED_IN_BROWSER = new Set(['generated-question', 'variant-selection', 'adaptive-band-profile']);
const firstSentence = (value) => {
  const text = clean(value);
  const match = /^(.+?[.;])(\s|$)/.exec(text);
  return (match ? match[1] : text).replace(/[.;]$/, '');
};

export const staticQuestionGradingAuthority = (question = {}) => {
  let support;
  try {
    support = serverResponseGradingSupport(deliveredQuestionForGrading(question));
  } catch {
    return { gradedOn: 'unknown', reason: 'grading-support-unavailable', surfaceId: null };
  }
  const base = { surfaceId: support.surfaceId || null, mode: support.mode || null, reason: support.reason || null };
  if (support.supported) return { ...base, gradedOn: 'server', authority: support.authority };
  if (support.authority === GRADING_AUTHORITY.SPECIALIZED_SUBSYSTEM) return { ...base, gradedOn: 'server', authority: support.authority };
  if (GENERATED_IN_BROWSER.has(support.reason)) {
    return {
      ...base,
      gradedOn: 'device',
      authority: GRADING_AUTHORITY.CLIENT_GRADED,
      why: 'it is generated in the student\'s browser from a seed the server does not re-run; a Question Family would let the server mark it',
    };
  }
  if (support.authority === GRADING_AUTHORITY.CLIENT_GRADED) {
    return { ...base, gradedOn: 'device', authority: support.authority, why: firstSentence(support.blocker) || support.reason };
  }
  // Secure, teacher-excluded, non-graded, or missing its answer key: other
  // checks speak for those.
  return { ...base, gradedOn: 'other', authority: support.authority || null };
};

const DEVICE_GRADED_LISTED = 6;

/**
 * The audit. `questions` are the flattened runtime questions, in order (the
 * flat index is the "Question N" every other Pre-Flight message uses).
 */
export const auditAssignmentQuestionGeneration = (assignment = {}, questions = [], { classSize = null, deliveredOnly = false } = {}) => {
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
  const deviceGraded = [];

  list.forEach((question, flatIndex) => {
    const role = clean(question?.activityRole).toLowerCase() || 'classwork';
    positionInSection[role] = (positionInSection[role] || 0) + 1;
    // Counted above so later labels keep their stored positions; an excluded
    // question generates nothing for anyone, so there is no slot to audit.
    if (deliveredOnly && question?.teacherExcluded === true) return;
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
      const grading = staticQuestionGradingAuthority(question);
      if (grading.gradedOn === 'device') deviceGraded.push({ flatIndex, why: grading.why });
      slots.push({
        questionIndex: flatIndex,
        role,
        label: where,
        familyBacked: false,
        variability: variability.mode,
        gradedOn: grading.gradedOn,
        gradingSurface: grading.surfaceId,
        gradingReason: grading.reason,
      });
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
      // A constraint only a NEWER version of this family understands (e.g.
      // `solutionCase` on a slot that is unpinned, so version 1) is not a
      // typo: the author asked for mathematics this version cannot make, and
      // every student would silently get the old version's questions. That
      // blocks; anything else keeps its long-standing warning.
      const newer = issue.code === 'constraint_unknown' ? newerVersionDeclaring(audit.family, issue.constraint) : null;
      if (newer !== null) {
        errors.push(`${where}: "${issue.constraint}" is a constraint of ${audit.family.id} version ${newer}, but this question uses version ${audit.family.version}, which ignores it — every student would get version ${audit.family.version}'s questions instead of the ones asked for. Set "version": ${newer} in its questionFamily.`);
        return;
      }
      warnings.push(`${where}: constraint "${issue.constraint}" (${JSON.stringify(issue.requested)}) is not something ${audit.family.id} allows, so its default is used (${issue.code}). ${describeConstraintIssue(issue, audit.family.id)}.`);
    });
    if (!audit.gradable) {
      const why = audit.gradingSupport?.blocker || audit.gradingSupport?.reason || '';
      warnings.push(`${where} uses a tool whose answers the server cannot mark for ${audit.family.id}${why ? ` (${why})` : ''}; its grade will rely on the student's device.`);
    }
    if (audit.keyFailures.length) {
      errors.push(`${where}: the generated answer key does not grade as correct for ${audit.keyFailures.length} of ${audit.sampled} sampled versions (for example ${audit.keyFailures[0]}). Fix the answer in the template or family before students see it.`);
    }
    if (audit.invalidVersions.length) {
      const [first] = audit.invalidVersions;
      const which = describeParameters(first.parameters);
      errors.push(`${where}: ${audit.invalidVersions.length} of ${audit.validated} generated versions would be refused if a student were given them (for example the version with ${which || 'its first parameters'}: ${first.problem}). ${first.fix || "Narrow the template's parameter ranges or constraints so every version is valid."}`);
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
      ready: audit.keyFailures.length === 0 && audit.invalidVersions.length === 0,
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
      .filter((entry) => !(deliveredOnly && entry.question?.teacherExcluded === true))
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
        notes.push('Warm-Up is delivered by Live Challenge: each student\'s result (rounds correct out of the rounds they could play) is their Warm-Up grade, and MathMaster will not generate a Warm-Up Recovery.');
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
        ? `${label} ready: each of the ${entries.length} DOL question${entries.length === 1 ? '' : 's'} can generate fresh, server-graded versions (unlocks after ${policy.mastery.requiredCorrect} of the last ${policy.mastery.windowSize} Practice questions correct; counts up to ${policy.dol.maxRecordedScore}%; open until the final submission date).`
        : `${label} ready: ${policy.warmup.questionCount} fresh questions from ${readiness.readySlots.length} Warm-Up question${readiness.readySlots.length === 1 ? '' : 's'} (counts up to ${policy.warmup.maxRecordedScore}%; open until the final submission date).`);
    }
  });

  if (deviceGraded.length) {
    const listed = deviceGraded.slice(0, DEVICE_GRADED_LISTED)
      .map((entry) => `Question ${entry.flatIndex + 1} (${entry.why})`)
      .join('; ');
    const more = deviceGraded.length > DEVICE_GRADED_LISTED ? `; and ${deviceGraded.length - DEVICE_GRADED_LISTED} more` : '';
    notes.push(`${deviceGraded.length} question${deviceGraded.length === 1 ? ' is' : 's are'} graded on the student's device; the server records that result within its attempt limits but cannot re-mark it: ${listed}${more}.`);
  }

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
