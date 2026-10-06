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
 *   6. A secure item the student cannot actually TAKE: a family whose Rich
 *      Tool has not been certified for Secure Test, Retest or Corrections
 *      mode, or one that renders with a different tool from the one its
 *      blueprint target requires. "Gradable" was never the same question as
 *      "can be answered securely" — a graphing family passed check 3 and then
 *      reached the student as a bare text box.
 *
 * Errors block publication. Warnings do not — they are the things a teacher
 * should look at, not the things that break a test.
 *
 * Pure by construction: the caller supplies what it learned from the bank
 * (`familyIssuability`, from the same `buildTemplateIssuePlan` gate the Path
 * uses), so this module never has to import a generator or reach Firestore.
 */

import { normalizeTestBlueprint, targetFamilyCoverage } from './testCycleBlueprint.mjs';
import {
  SECURE_CYCLE_MODES,
  certifySecureFamily,
  resolveSecureToolId,
  secureItemCaveats,
  secureToolLabel,
} from './secureToolCertification.mjs';
import { declaresTestCycle, defaultTestCyclePolicy, normalizeTestCyclePolicy } from './testCyclePolicy.mjs';
import { resolveRetestQuestionCount } from './testCycleRetest.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const TEST_CYCLE_DIAGNOSTIC = Object.freeze({
  TEST_PHASE_MISSING: 'TEST_CYCLE_TEST_PHASE_MISSING',
  POLICY_MISSING: 'TEST_CYCLE_POLICY_MISSING',
  SECURE_MANIFEST_NOT_FOUND: 'TEST_CYCLE_SECURE_MANIFEST_NOT_FOUND',
  TOOL_NOT_CERTIFIED: 'TEST_CYCLE_TOOL_NOT_CERTIFIED',
  TOOL_REQUIREMENT_MISMATCH: 'TEST_CYCLE_TOOL_REQUIREMENT_MISMATCH',
});

const MODE_WORDS = Object.freeze({
  secureTest: 'Secure Test',
  secureRetest: 'Secure Retest',
  corrections: 'Corrections',
});

/*
 * THE SECURE RENDERING CONTRACT OF EVERY BLUEPRINT TARGET.
 *
 * For each target: the tool it requires (if it names one), the tool every
 * approved family actually renders with, and whether each is certified for
 * every mode the cycle will deliver it in. `familySecure` is what the server
 * learned by certifying sampled INSTANCES (a generator can change the tool
 * between variants); without it the family document is certified as it
 * stands, which is what a pure caller and the tests do.
 */
const targetSecureRendering = ({ target, families, familyIssuability, modes, calculatorMode }) => {
  const byId = new Map(list(families).map((family) => [clean(family?.id || family?.questionId || family?.familyId), family]));
  const requiredToolId = target.toolId ? resolveSecureToolId({ type: target.toolId }) : null;
  const familyRows = target.familyIds
    .filter((familyId) => byId.has(familyId))
    .map((familyId) => {
      const family = byId.get(familyId);
      const secure = familyIssuability?.[familyId]?.secure || certifySecureFamily(family);
      return {
        familyId,
        toolIds: list(secure.toolIds),
        labels: list(secure.labels),
        modes: secure.modes || {},
        devices: secure.devices || {},
        caveats: secureItemCaveats(family, { blueprintCalculatorMode: calculatorMode }),
      };
    });
  const toolIds = [...new Set(familyRows.flatMap((row) => row.toolIds))];
  return {
    targetId: target.targetId,
    alignmentKey: target.alignmentKey,
    label: target.label,
    dok: target.dok,
    difficultyBand: target.difficultyBand,
    representation: target.representation,
    questionCount: target.questionCount,
    requiredToolId,
    requiredToolLabel: requiredToolId ? secureToolLabel(requiredToolId) : null,
    toolIds,
    toolLabels: toolIds.map((toolId) => (toolId === 'fields' ? 'Response fields' : secureToolLabel(toolId))),
    // Every mode this cycle delivers the target in, and whether every family
    // filling it can be delivered there.
    modes: Object.fromEntries(modes.map((mode) => [mode, familyRows.length > 0 && familyRows.every((row) => row.modes?.[mode]?.compatible === true)])),
    devices: ['chromebook', 'ipad', 'phone'].reduce((all, device) => ({
      ...all,
      [device]: familyRows.length > 0 && familyRows.every((row) => row.devices?.[device] === true),
    }), {}),
    families: familyRows,
  };
};

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
  // 6. The secure rendering contract, per target, for every mode delivered.
  const deliveredModes = resolved.externalAssessment
    // An external-original cycle's one secure session is the retest, and it
    // has no Corrections.
    ? SECURE_CYCLE_MODES.filter((mode) => mode !== 'corrections')
    : [...SECURE_CYCLE_MODES];
  const secureRendering = normalizedBlueprint.targets.map((target) => targetSecureRendering({
    target,
    families,
    familyIssuability,
    modes: deliveredModes,
    calculatorMode: normalizedBlueprint.calculatorMode,
  }));
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

  // 6. Can every secure question be TAKEN with the tool it needs?
  secureRendering.forEach((entry) => {
    entry.families.forEach((row) => {
      // One sentence per family, naming every mode it cannot be delivered in.
      const failing = deliveredModes.filter((mode) => row.modes?.[mode]?.compatible !== true);
      if (failing.length) {
        const reasons = [...new Set(failing.flatMap((mode) => list(row.modes?.[mode]?.reasons)))];
        const modeWords = failing.map((mode) => MODE_WORDS[mode] || mode);
        const modeList = modeWords.length > 1 ? `${modeWords.slice(0, -1).join(', ')} or ${modeWords.at(-1)}` : modeWords[0];
        errors.push(diagnostic(
          TEST_CYCLE_DIAGNOSTIC.TOOL_NOT_CERTIFIED,
          `Target ${entry.alignmentKey || entry.targetId} contains a ${row.labels.join(' / ') || 'Rich Tool'} family (${row.familyId}) that has not been certified for ${modeList} mode${reasons.length ? `: ${reasons.join(' ')}` : '.'}`,
        ));
      }
      if (entry.requiredToolId) {
        const mismatched = row.toolIds.filter((toolId) => toolId !== entry.requiredToolId);
        if (mismatched.length) {
          errors.push(diagnostic(
            TEST_CYCLE_DIAGNOSTIC.TOOL_REQUIREMENT_MISMATCH,
            `Target ${entry.alignmentKey || entry.targetId} requires ${entry.requiredToolLabel}, but family ${row.familyId} renders with ${mismatched.map((toolId) => (toolId === 'fields' ? 'response fields' : secureToolLabel(toolId))).join(' / ')}. Students would not be assessed with the same tool.`,
          ));
        }
      }
      row.caveats.forEach((caveat) => warnings.push(`Target ${entry.alignmentKey || entry.targetId}: ${caveat}`));
    });
    if (!entry.requiredToolId && entry.toolIds.length > 1) {
      warnings.push(
        `Target ${entry.alignmentKey || entry.targetId} draws on families that render with different tools (${entry.toolLabels.join(', ')}), so two students may answer it with different tools. Set the target's tool to make it part of equivalence.`,
      );
    }
  });
  const secureQuestionCount = normalizedBlueprint.totalQuestions;
  const secureRenderingPassed = secureRendering.every((entry) => entry.families.length > 0
    && deliveredModes.every((mode) => entry.modes[mode] === true)
    && (!entry.requiredToolId || entry.families.every((row) => row.toolIds.every((toolId) => toolId === entry.requiredToolId))));

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
      {
        id: 'secureRendering',
        label: secureRenderingPassed
          ? `All ${secureQuestionCount} secure question${secureQuestionCount === 1 ? '' : 's'} can render using their required MathMaster tools`
          : 'Every secure question can render using its required MathMaster tool',
        passed: secureRenderingPassed,
      },
    ],
    coverage,
    secureRendering,
    retestQuestionCount,
    contract,
  };
};
