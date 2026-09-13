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
import { normalizeTestCyclePolicy } from './testCyclePolicy.mjs';
import { resolveRetestQuestionCount } from './testCycleRetest.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

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
} = {}) => {
  const errors = [];
  const warnings = [];
  const resolved = normalizeTestCyclePolicy(policy || assignment?.assessmentPolicy);

  if (!resolved) {
    return { mode: null, errors: ['This assignment is not a Test Cycle (assessmentPolicy.mode must be "testCycle").'], warnings, checks: [] };
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
      { id: 'retestParallelCoverage', label: 'Retest has parallel coverage for every target', passed: coverage.every((entry) => entry.sufficientForRetest) },
      { id: 'privateGrading', label: 'Every declared family can be privately graded on the server', passed: declaredFamilyIds.every((familyId) => issuability[familyId]?.issuable === true) },
      { id: 'stageIsolation', label: 'No secure stage is authored as client-visible content', passed: !sections.some((section) => TEST_CYCLE_FORBIDDEN_ROLES.includes(clean(section?.role).toLowerCase())) },
      { id: 'noSerializedAnswerKeys', label: 'No secure answer key is serialized to student clients', passed: leaks.length === 0 },
    ],
    coverage,
    retestQuestionCount,
  };
};
