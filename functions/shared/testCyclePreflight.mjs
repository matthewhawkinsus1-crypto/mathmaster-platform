/*
 * PREFLIGHT: THE THINGS A TEST CYCLE MUST NOT BE ABLE TO PUBLISH.
 *
 * Every check here is one that, if it failed at nine in the morning with
 * twenty-five students sitting down, could not be recovered from:
 *
 *   1. A secure Test that cannot issue enough equivalent questions.
 *   2. A Retest with nothing parallel to draw on, so it hands a student the
 *      same item back.
 *   3. A secure item this server cannot privately grade — which would mean
 *      either no grade or a grade the browser decided.
 *   4. Stage leakage: secure Test content authored as ordinary V5 questions,
 *      which ships it to the client and puts it in Review's own assignment.
 *   5. An answer key serialized into the student-visible assignment document.
 *
 * Errors block publication. Warnings do not — they are the things a teacher
 * should look at, not the things that break a test.
 *
 * Pure by construction: the caller supplies what it learned from the bank
 * (`familyIssuability`, from the same `buildTemplateIssuePlan` gate the Path
 * uses), so this module never has to import a generator or reach Firestore.
 */

import { normalizeTestBlueprint, targetFamilyCoverage } from './testCycleBlueprint.mjs';
import { declaresTestCycle, defaultTestCyclePolicy, normalizeTestCyclePolicy } from './testCyclePolicy.mjs';
import { resolveRetestQuestionCount } from './testCycleRetest.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const TEST_CYCLE_DIAGNOSTIC = Object.freeze({
  TEST_PHASE_MISSING: 'TEST_CYCLE_TEST_PHASE_MISSING',
  POLICY_MISSING: 'TEST_CYCLE_POLICY_MISSING',
  SECURE_MANIFEST_NOT_FOUND: 'TEST_CYCLE_SECURE_MANIFEST_NOT_FOUND',
});

const diagnostic = (code, message) => `${code}: ${message}`;

/** Safe, question-free description of whether the secure Test can resolve. */
export const inspectTestCycleContract = (assignment = {}, { secureReferenceResolved = false } = {}) => {
  const declared = declaresTestCycle(assignment);
  const blueprint = normalizeTestBlueprint(assignment?.testBlueprint);
  const secureReference = isObject(assignment?.secureTestReference)
    ? assignment.secureTestReference
    : null;
  const secureReferenceId = clean(secureReference?.blueprintId || secureReference?.manifestId || secureReference?.id);
  const embeddedBlueprintPresent = blueprint.targets.length > 0;
  const secureReferencePresent = Boolean(secureReferenceId);
  return Object.freeze({
    declared,
    policyConfigured: Boolean(normalizeTestCyclePolicy(assignment?.assessmentPolicy)),
    embeddedBlueprintPresent,
    secureReferencePresent,
    secureReferenceResolved: secureReferencePresent && secureReferenceResolved === true,
    testResolvable: embeddedBlueprintPresent || (secureReferencePresent && secureReferenceResolved === true),
    resolution: embeddedBlueprintPresent ? 'testBlueprint' : secureReferencePresent && secureReferenceResolved ? 'secureTestReference' : null,
    secureReferenceId: secureReferenceId || null,
    // This contains status metadata only. It never includes blueprint targets,
    // families, questions, seeds, answers, or grading definitions.
    phases: Object.freeze({
      review: Object.freeze({ configured: list(assignment?.sections).some((s) => clean(s?.role).toLowerCase() === 'review') }),
      test: Object.freeze({ configured: embeddedBlueprintPresent || secureReferencePresent, secure: true }),
      corrections: Object.freeze({ configured: true, policyDriven: true }),
      retest: Object.freeze({ configured: true, policyDriven: true, secure: true }),
    }),
  });
};

/*
 * Keys that carry an answer. If any of these reaches the assignment document a
 * student's browser can read, the test is over before it starts — a student
 * with dev tools open has the key. The scan is by key NAME and recursive,
 * because the leak that matters is always nested three levels down inside
 * something that looked like metadata.
 */
export const SECURE_ANSWER_KEYS = Object.freeze([
  'expected', 'accepted', 'answerKey', 'correctAnswer', 'privateGrading',
  'privateSupport', 'generatorParameters', 'gradingDefinition', 'solutionKey',
  'solution', 'answer',
]);

/** Roles a Test Cycle assignment may author as ordinary V5 content. */
export const TEST_CYCLE_INSTRUCTIONAL_ROLES = Object.freeze(['review', 'corrections', 'practice', 'classwork', 'warmup']);

/** Roles that would mean secure content was authored into the client payload. */
export const TEST_CYCLE_FORBIDDEN_ROLES = Object.freeze(['test', 'retest', 'quiz']);

export const findSecureAnswerKeyLeaks = (value, path = 'testBlueprint', found = []) => {
  if (Array.isArray(value)) {
    value.forEach((child, index) => findSecureAnswerKeyLeaks(child, `${path}[${index}]`, found));
    return found;
  }
  if (!isObject(value)) return found;
  Object.entries(value).forEach(([key, child]) => {
    if (SECURE_ANSWER_KEYS.includes(key)) found.push(`${path}.${key}`);
    findSecureAnswerKeyLeaks(child, `${path}.${key}`, found);
  });
  return found;
};

/**
 * The full preflight for one Test Cycle.
 *
 * `families` are the approved bank families the blueprint may draw on;
 * `familyIssuability` maps familyId -> { issuable, reason } as produced by the
 * server's own issue-plan gate, so "can this be privately graded?" is answered
 * by the grader rather than by inspecting the question.
 */
export const preflightTestCycle = ({
  assignment = null,
  policy = null,
  blueprint = null,
  families = [],
  familyIssuability = {},
  secureReferenceResolved = false,
} = {}) => {
  const errors = [];
  const warnings = [];
  const contract = inspectTestCycleContract(assignment || {}, { secureReferenceResolved });
  const resolved = normalizeTestCyclePolicy(policy || assignment?.assessmentPolicy)
    || (contract.declared ? defaultTestCyclePolicy() : null);

  if (!resolved) {
    return { mode: null, errors: ['This assignment is not a Test Cycle (assessmentPolicy.mode must be "testCycle").'], warnings, checks: [] };
  }

  if (!contract.policyConfigured) {
    errors.push(diagnostic(
      TEST_CYCLE_DIAGNOSTIC.POLICY_MISSING,
      'This V5 assignment declares a Test Cycle but is missing assessmentPolicy.mode "testCycle".',
    ));
  }
  if (contract.secureReferencePresent && !contract.secureReferenceResolved && !contract.embeddedBlueprintPresent) {
    errors.push(diagnostic(
      TEST_CYCLE_DIAGNOSTIC.SECURE_MANIFEST_NOT_FOUND,
      `Secure Test reference "${contract.secureReferenceId}" exists but the server could not resolve it to a valid Test blueprint.`,
    ));
  } else if (!contract.testResolvable) {
    errors.push(diagnostic(
      TEST_CYCLE_DIAGNOSTIC.TEST_PHASE_MISSING,
      'This assignment is configured as a Test Cycle but no Test phase or secure Test reference can be resolved. Add/provision the Test before publishing.',
    ));
  }

  const normalizedBlueprint = normalizeTestBlueprint(blueprint || assignment?.testBlueprint);
  if (!normalizedBlueprint.targets.length) {
    errors.push('A Test Cycle needs an approved test blueprint with at least one target.');
  }
  if (normalizedBlueprint.totalQuestions < 1) {
    errors.push('The test blueprint issues no questions.');
  }

  // 1 + 2. Family coverage for the secure Test, and parallel coverage for the
  // Retest generated from it.
  const coverage = targetFamilyCoverage(normalizedBlueprint, families);
  coverage.forEach((entry) => {
    if (!entry.availableFamilies) {
      errors.push(`Target ${entry.targetId} (${entry.alignmentKey || 'unaligned'}) names no approved, validated generator family.`);
      return;
    }
    if (!entry.sufficientForTest) {
      errors.push(
        `Target ${entry.targetId} needs ${entry.questionCount} distinct approved families to issue an equivalent secure Test, but only ${entry.availableFamilies} are available.`,
      );
    }
    if (!entry.sufficientForRetest) {
      errors.push(
        `Target ${entry.targetId} has no parallel coverage for a Retest: ${entry.availableFamilies} approved famil${entry.availableFamilies === 1 ? 'y' : 'ies'} for ${entry.questionCount} Test question(s), and none can generate a fresh variant.`,
      );
    }
  });

  // 3. Private grading, answered by the server's own issue gate.
  const issuability = isObject(familyIssuability) ? familyIssuability : {};
  const declaredFamilyIds = [...new Set(normalizedBlueprint.targets.flatMap((target) => target.familyIds))];
  declaredFamilyIds.forEach((familyId) => {
    const verdict = issuability[familyId];
    if (verdict === undefined) {
      warnings.push(`Family ${familyId} was not checked against the secure grading gate before publication.`);
      return;
    }
    if (verdict?.issuable !== true) {
      errors.push(`Family ${familyId} cannot be privately graded on the server (${verdict?.reason || 'no_gradable_definition'}) and must not be issued in a secure Test.`);
    }
  });

  // 4. Stage leakage.
  const sections = list(assignment?.sections);
  sections.forEach((section, index) => {
    const role = clean(section?.role).toLowerCase();
    if (TEST_CYCLE_FORBIDDEN_ROLES.includes(role)) {
      errors.push(
        `Section ${index + 1} has role "${role}". A Test Cycle's Test and Retest run in the secure exam runtime from the blueprint; authoring them as ordinary questions would ship them to the student's browser.`,
      );
    } else if (role && !TEST_CYCLE_INSTRUCTIONAL_ROLES.includes(role)) {
      warnings.push(`Section ${index + 1} has role "${role}", which is not an instructional Test Cycle stage.`);
    }
  });
  if (resolved.review.required && !sections.some((section) => clean(section?.role).toLowerCase() === 'review')) {
    errors.push('Review is required by this policy but the assignment has no review section.');
  }

  // 5. Answer keys in the client-visible blueprint.
  const leaks = findSecureAnswerKeyLeaks(blueprint || assignment?.testBlueprint);
  leaks.forEach((leakPath) => {
    errors.push(`Secure answer material would be serialized to student clients at ${leakPath}.`);
  });

  const retestQuestionCount = resolveRetestQuestionCount({
    originalTotal: normalizedBlueprint.totalQuestions,
    policy: resolved,
  });
  if (retestQuestionCount > normalizedBlueprint.totalQuestions && !resolved.retest.allowLongerThanTest) {
    errors.push('The retest would be longer than the Test without the teacher explicitly allowing it.');
  }
  if (!normalizedBlueprint.targets.some((target) => target.anchor)) {
    warnings.push('No blueprint target is marked as an anchor, so a retest cannot include anchor coverage from the rest of the test.');
  }

  return {
    mode: resolved.mode,
    errors,
    warnings,
    blocked: errors.length > 0,
    checks: [
      { id: 'secureTestCoverage', label: 'Secure Test can issue equivalent questions for every target', passed: coverage.every((entry) => entry.sufficientForTest) },
      { id: 'testPhaseResolvable', label: 'Test: configured or secure reference resolved', passed: contract.testResolvable },
      { id: 'reviewConfigured', label: 'Review: configured', passed: contract.phases.review.configured },
      { id: 'correctionsConfigured', label: 'Corrections: policy-driven', passed: contract.phases.corrections.configured },
      { id: 'retestConfigured', label: 'Retest: policy-driven secure phase', passed: contract.phases.retest.configured },
      { id: 'retestParallelCoverage', label: 'Retest has parallel coverage for every target', passed: coverage.every((entry) => entry.sufficientForRetest) },
      { id: 'privateGrading', label: 'Every declared family can be privately graded on the server', passed: declaredFamilyIds.every((familyId) => issuability[familyId]?.issuable === true) },
      { id: 'stageIsolation', label: 'No secure stage is authored as client-visible content', passed: !sections.some((section) => TEST_CYCLE_FORBIDDEN_ROLES.includes(clean(section?.role).toLowerCase())) },
      { id: 'noSerializedAnswerKeys', label: 'No secure answer key is serialized to student clients', passed: leaks.length === 0 },
    ],
    coverage,
    retestQuestionCount,
    contract,
  };
};
