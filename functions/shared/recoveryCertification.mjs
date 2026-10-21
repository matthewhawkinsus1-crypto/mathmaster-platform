/*
 * CERTIFYING A RECOVERY BINDING — IS IT REALLY THE SAME QUESTION, FRESH?
 *
 * A binding (recoveryContent.mjs) pairs a static Warm-Up or DOL question with
 * a platform Question Family that will generate its Recovery versions. Before
 * one is stored — by Pre-Flight when an assignment is created, or by a
 * teacher-approved upgrade of a live assignment — it is certified here, and
 * every check is one the brief names:
 *
 *   FAMILY          a registered platform family, marked eligible for
 *                   Recovery, with exactly the constraints asked for (a
 *                   constraint it cannot honour refuses the binding — it
 *                   never falls back to a default the author did not choose)
 *   SAME QUESTION   the family RECOGNIZES the original: it can say which of
 *                   its own instances is the original's mathematics, and the
 *                   concept it recognizes (a horizontal shift, a fractional
 *                   slope) is the concept the binding asks for. That is also
 *                   how the original is kept out of every Recovery.
 *   SAME TOOL       every version opens in the original's tool and mode
 *   SAME TARGET     the original's primary TEKS are skills the family assesses
 *   SAME RIGOR      the family's DOK and difficulty band under these
 *                   constraints are the original's
 *   FRESH, ENOUGH   after excluding the original and every other static
 *                   problem in the assignment the family recognizes, enough
 *                   distinct versions remain for a full Practice window and
 *                   the Recovery itself
 *   SERVER-GRADED   the server can mark every version's tool, and (where the
 *                   caller supplies a grader) each sampled version's own key
 *                   is marked correct and a wrong answer is not
 *   VALID           (where the caller supplies a validator) each sampled
 *                   version passes the platform's own question validation
 *
 * The grading and validation hooks are injected: Pre-Flight runs on the
 * student app's static import path and uses the light graders, while the
 * server and the tests pass the full shared grading registry
 * (recoveryCertificationGrading.mjs). The families' own property tests mark
 * every version of every family with the full graders.
 *
 * Pure: no Firestore, no clock (`at` is a parameter).
 */

import { describeConstraintIssue, resolveFamilyConstraints } from './questionFamilyContract.mjs';
import { createFamilyInstanceSequence, measureFamilyCapacity } from './questionFamilyEngine.mjs';
import { familySlotKey, resolveFamilyQuestionInstance } from './questionFamilyInstance.mjs';
import { familyInstanceServerGradable } from './questionFamilyGrading.mjs';
import { getPlatformQuestionFamily } from './questionFamilyRegistry.mjs';
import {
  RECOVERY_BINDING_ORIGIN,
  RECOVERY_CERTIFICATION_VERSION,
  primaryStandardCodes,
  recognizedFingerprint,
  recoveryExclusionFingerprints,
  recoverySourceQuestion,
  recoverySourceSignature,
} from './recoveryContent.mjs';

// Enough for the original, a full Practice window and the Recovery itself —
// the same number Pre-Flight warns at (questionGenerationPreflight.js
// RECOVERY_MINIMUM_CAPACITY; a test keeps them equal).
export const RECOVERY_MINIMUM_FRESH_VERSIONS = 12;
export const CERTIFICATION_SAMPLE = 6;
const CERTIFICATION_CAPACITY_BUDGET = 2048;

export const RECOVERY_CERTIFICATION_ISSUE = Object.freeze({
  FAMILY_UNKNOWN: 'family-unknown',
  FAMILY_NOT_RECOVERY_ELIGIBLE: 'family-not-recovery-eligible',
  CONSTRAINT_INVALID: 'constraint-invalid',
  ORIGINAL_NOT_RECOGNIZED: 'original-not-recognized',
  CONCEPT_MISMATCH: 'concept-mismatch',
  TOOL_MISMATCH: 'tool-mismatch',
  STANDARD_MISMATCH: 'standard-mismatch',
  RIGOR_MISMATCH: 'rigor-mismatch',
  TOO_FEW_VERSIONS: 'too-few-versions',
  GENERATION_FAILED: 'generation-failed',
  NOT_SERVER_GRADABLE: 'not-server-gradable',
  ANSWER_KEY_FAILED: 'answer-key-failed',
  INVALID_VERSION: 'invalid-version',
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/** The rigor a family's slot asks under these constraints. */
export const familyDifficultyFor = (family, constraintValues = {}) => {
  if (typeof family?.difficultyFor === 'function') {
    try {
      const declared = family.difficultyFor(constraintValues);
      if (Number.isInteger(declared?.band) && Number.isInteger(declared?.dok)) return { band: declared.band, dok: declared.dok };
    } catch { /* the family's own difficulty below */ }
  }
  return { band: family?.difficulty?.band ?? null, dok: family?.difficulty?.dok ?? null };
};

const issue = (code, message, fix = null) => ({ code, message, fix });

/**
 * Certify one binding. Returns
 *   { ok: true, binding, certification, issues: [] }
 *   { ok: false, binding: null, certification, issues: [{ code, message, fix }] }
 *
 * `label` names the question the way a teacher reads it ("DOL Q1").
 */
export const certifyRecoveryBinding = ({
  assignmentId = '',
  question = null,
  storageIndex = 0,
  section = 'dol',
  questionFamily = null,
  questions = [],
  label = 'This question',
  gradeSample = null,
  validateVersion = null,
  sampleSize = CERTIFICATION_SAMPLE,
  origin = RECOVERY_BINDING_ORIGIN.UPGRADE,
  migrationId = null,
  at = null,
} = {}) => {
  const issues = [];
  const certification = {
    version: RECOVERY_CERTIFICATION_VERSION,
    familyId: clean(questionFamily?.id) || null,
    familyVersion: Number(questionFamily?.version) || null,
  };
  const refuse = () => ({ ok: false, binding: null, certification, issues });
  const questionId = clean(question?.questionId || question?.id);
  if (!isObject(question) || !questionId) {
    issues.push(issue(RECOVERY_CERTIFICATION_ISSUE.GENERATION_FAILED, `${label} has no stable question id, so a Recovery cannot be tied to it.`));
    return refuse();
  }

  const family = getPlatformQuestionFamily(questionFamily?.id, questionFamily?.version);
  if (!family) {
    issues.push(issue(RECOVERY_CERTIFICATION_ISSUE.FAMILY_UNKNOWN, `${label}: the Recovery family ${clean(questionFamily?.id) || '(none)'} v${questionFamily?.version ?? '?'} is not registered.`));
    return refuse();
  }
  certification.familyTitle = family.title;
  if (!family.recovery.eligible) {
    issues.push(issue(RECOVERY_CERTIFICATION_ISSUE.FAMILY_NOT_RECOVERY_ELIGIBLE, `${label}: ${family.title} is not marked eligible for Recovery.`));
    return refuse();
  }
  const constraints = isObject(questionFamily?.constraints) ? questionFamily.constraints : {};
  const resolved = resolveFamilyConstraints(family, constraints);
  if (resolved.issues.length) {
    issues.push(issue(
      RECOVERY_CERTIFICATION_ISSUE.CONSTRAINT_INVALID,
      `${label}: ${resolved.issues.map((entry) => describeConstraintIssue(entry, family.id)).join('; ')}.`,
    ));
    return refuse();
  }
  const constraintValues = resolved.values;

  // SAME QUESTION: the family reads the original as one of its own instances.
  let recognized = null;
  try {
    recognized = typeof family.recognize === 'function' ? family.recognize(question) : null;
  } catch {
    recognized = null;
  }
  const originalFingerprint = recognized ? recognizedFingerprint(family, question, constraints) : null;
  if (!recognized || !originalFingerprint) {
    issues.push(issue(
      RECOVERY_CERTIFICATION_ISSUE.ORIGINAL_NOT_RECOGNIZED,
      `${label} is not a question ${family.title} can recognize, so MathMaster cannot prove its Recovery is the same mathematics — or keep the original out of it.`,
      'Choose a family that writes this kind of question, or give the question its own Question Family.',
    ));
    return refuse();
  }
  const conceptMismatch = (family.conceptConstraints || []).filter((name) => (
    recognized.constraints && Object.prototype.hasOwnProperty.call(recognized.constraints, name)
    && JSON.stringify(recognized.constraints[name]) !== JSON.stringify(constraintValues[name])
  ));
  if (conceptMismatch.length) {
    issues.push(issue(
      RECOVERY_CERTIFICATION_ISSUE.CONCEPT_MISMATCH,
      `${label} asks ${conceptMismatch.map((name) => `${name} "${recognized.constraints[name]}"`).join(', ')}, but the Recovery would ask ${conceptMismatch.map((name) => `"${constraintValues[name]}"`).join(', ')}.`,
    ));
  }

  // SAME TARGET and SAME RIGOR.
  const standards = primaryStandardCodes(question);
  const assessed = new Set(family.skill.alignments.map((code) => clean(code).toUpperCase()));
  const missing = standards.filter((code) => !assessed.has(code));
  certification.standards = standards;
  if (missing.length) {
    issues.push(issue(
      RECOVERY_CERTIFICATION_ISSUE.STANDARD_MISMATCH,
      `${label} assesses ${missing.join(', ')}, which ${family.title} does not (it assesses ${family.skill.alignments.join(', ')}).`,
    ));
  }
  const rigor = familyDifficultyFor(family, constraintValues);
  certification.rigor = rigor;
  const authoredDok = Number.isInteger(Number(question.dok)) && question.dok !== null ? Number(question.dok) : null;
  const authoredBand = Number.isInteger(Number(question.difficultyBand)) && question.difficultyBand !== null ? Number(question.difficultyBand) : null;
  if ((authoredDok !== null && authoredDok !== rigor.dok) || (authoredBand !== null && authoredBand !== rigor.band)) {
    issues.push(issue(
      RECOVERY_CERTIFICATION_ISSUE.RIGOR_MISMATCH,
      `${label} is DOK ${authoredDok ?? '—'}, difficulty ${authoredBand ?? '—'}; its Recovery would be DOK ${rigor.dok}, difficulty ${rigor.band}.`,
    ));
  }

  // FRESH, ENOUGH: the original and every other recognizable static problem
  // in the assignment are excluded.
  const exclusions = [...new Set([
    originalFingerprint,
    ...recoveryExclusionFingerprints({ questions, families: [family] }),
  ])];
  const capacity = measureFamilyCapacity(family, constraintValues, { budget: CERTIFICATION_CAPACITY_BUDGET });
  // Exactly, when the slot's whole list can be walked: only an excluded
  // fingerprint that IS one of this slot's versions takes a version away (a
  // vertical shift elsewhere in the lesson is not a horizontal-shift
  // version). Otherwise every exclusion is assumed to cost one.
  const walked = capacity.exact
    ? createFamilyInstanceSequence(family, constraintValues, 'recovery-certification').exhaust(CERTIFICATION_CAPACITY_BUDGET)
    : null;
  const excluded = new Set(exclusions);
  const fresh = walked?.complete
    ? walked.instances.filter((instance) => !excluded.has(instance.fingerprint)).length
    : Math.max(0, capacity.capacity - exclusions.length);
  certification.capacity = capacity.capacity;
  certification.capacityExact = capacity.exact === true;
  certification.excludedFromAssignment = walked?.complete
    ? walked.instances.filter((instance) => excluded.has(instance.fingerprint)).length
    : exclusions.length;
  certification.freshVersions = fresh;
  if (fresh < RECOVERY_MINIMUM_FRESH_VERSIONS) {
    issues.push(issue(
      RECOVERY_CERTIFICATION_ISSUE.TOO_FEW_VERSIONS,
      `${label}: only ${fresh} fresh version${fresh === 1 ? '' : 's'} remain after leaving out this assignment's own problems — fewer than the ${RECOVERY_MINIMUM_FRESH_VERSIONS} a Practice window and a Recovery need.`,
    ));
  }

  // SAME TOOL, SERVER-GRADED, VALID: sampled versions, exactly as Recovery
  // would deal them (exclusions applied).
  const binding = {
    questionId,
    section,
    questionFamily: {
      id: family.id,
      version: family.version,
      constraints: JSON.parse(JSON.stringify(constraints)),
      ...(clean(questionFamily?.tool) ? { tool: clean(questionFamily.tool) } : {}),
    },
    sourceSignature: recoverySourceSignature(question),
    originalFingerprints: [originalFingerprint],
  };
  const source = recoverySourceQuestion(question, binding);
  const slotKey = `${familySlotKey({ assignmentId, question: source, storageIndex })}|recovery-certification`;
  let sampled = 0;
  let keyChecked = 0;
  const keyFailures = [];
  const invalid = [];
  let gradable = true;
  let toolMismatch = null;
  for (let index = 0; index < Math.max(1, sampleSize); index += 1) {
    const result = resolveFamilyQuestionInstance({
      question: source,
      assignmentId,
      storageIndex,
      slotKey,
      allocation: { seat: index, variant: 0, stride: 1, index, basis: 'preview' },
      excludeFingerprints: exclusions,
      historyIsComplete: true,
    });
    if (result.error) {
      if (!sampled) {
        issues.push(issue(RECOVERY_CERTIFICATION_ISSUE.GENERATION_FAILED, `${label}: ${family.title} could not generate a Recovery version (${result.error}).`));
      }
      break;
    }
    sampled += 1;
    const built = result.question;
    if (clean(built.type) !== clean(question.type) || (clean(question.mode) && clean(built.mode) !== clean(question.mode))) {
      toolMismatch ||= `${built.type}${built.mode ? `/${built.mode}` : ''}`;
    }
    if (!familyInstanceServerGradable(built)) gradable = false;
    if (typeof gradeSample === 'function') {
      let verdict = null;
      try {
        verdict = gradeSample(built, result.instance);
      } catch {
        verdict = { checked: true, isCorrect: false, wrongRejected: true };
      }
      if (verdict?.checked) {
        keyChecked += 1;
        if (verdict.isCorrect !== true || verdict.wrongRejected === false) keyFailures.push(result.instance.answer?.display || result.instance.fingerprint);
      }
    }
    if (typeof validateVersion === 'function') {
      const problems = list(validateVersion(built));
      if (problems.length) invalid.push(problems[0]);
    }
  }
  certification.sampled = sampled;
  certification.keyChecked = keyChecked;
  certification.tool = { type: clean(question.type) || null, mode: clean(question.mode) || null };
  if (toolMismatch) {
    issues.push(issue(
      RECOVERY_CERTIFICATION_ISSUE.TOOL_MISMATCH,
      `${label} is answered in ${question.type}${question.mode ? `/${question.mode}` : ''}, but its Recovery would open in ${toolMismatch}.`,
    ));
  }
  if (!gradable) {
    issues.push(issue(RECOVERY_CERTIFICATION_ISSUE.NOT_SERVER_GRADABLE, `${label}: the server cannot mark ${family.title}'s versions, so a Recovery grade could not be verified.`));
  }
  if (keyFailures.length) {
    issues.push(issue(
      RECOVERY_CERTIFICATION_ISSUE.ANSWER_KEY_FAILED,
      `${label}: ${keyFailures.length} of ${keyChecked} sampled Recovery versions were not marked correct with their own answer key (for example ${keyFailures[0]}).`,
    ));
  }
  if (invalid.length) {
    issues.push(issue(RECOVERY_CERTIFICATION_ISSUE.INVALID_VERSION, `${label}: a Recovery version would be refused if a student were given it (${invalid[0]}).`));
  }
  if (issues.length) return refuse();
  return {
    ok: true,
    issues: [],
    certification,
    binding: {
      ...binding,
      certification,
      origin,
      migrationId: clean(migrationId) || null,
      certifiedAt: clean(at) || null,
    },
  };
};

/**
 * The family a static question should be recovered by: the first registered
 * family that recognizes it and certifies. Deterministic (the registry's own
 * order), and only ever version 1 of a family unless a caller pins another —
 * the registry's rule that an unpinned reference never moves.
 *
 * Returns { ok, binding, certification, issues, tried }.
 */
export const proposeRecoveryBinding = ({
  families = [],
  question = null,
  ...rest
} = {}) => {
  const tried = [];
  let firstFailure = null;
  for (const family of list(families)) {
    if (typeof family?.recognize !== 'function' || !family.recovery?.eligible) continue;
    let recognized = null;
    try {
      recognized = family.recognize(question);
    } catch {
      recognized = null;
    }
    if (!recognized) continue;
    const result = certifyRecoveryBinding({
      ...rest,
      question,
      questionFamily: {
        id: family.id,
        version: family.version,
        constraints: { ...(recognized.constraints || {}) },
      },
    });
    tried.push({ familyId: family.id, familyVersion: family.version, ok: result.ok, issues: result.issues });
    if (result.ok) return { ...result, tried };
    firstFailure ||= result;
  }
  return firstFailure
    ? { ...firstFailure, tried }
    : { ok: false, binding: null, certification: null, issues: [], tried };
};
