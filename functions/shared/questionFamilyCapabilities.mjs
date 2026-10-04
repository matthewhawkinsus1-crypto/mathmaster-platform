/*
 * WHAT EACH REGISTERED QUESTION FAMILY CAN DO — COMPUTED, NOT CLAIMED.
 *
 * One record per registered family VERSION: the constraints an author may set
 * (and which of them are concepts no student support may change), what an
 * unpinned reference means, the solution cases and number forms the family
 * describes itself as making, the tool and mode a student answers in, whether
 * the server marks that tool, whether the family is ready for Recovery, how
 * many distinct questions it makes — for each concept setting it offers — and
 * what reduced complexity changes.
 *
 * Read by the generated capability report
 * (scripts/report-question-family-capabilities.mjs →
 * docs/question-families/), which the platform tests hold to this module.
 *
 * Everything here is computed from the family itself — its knobs, an instance
 * built through the engine, the grading manifest, the Recovery readiness check
 * and the engine's capacity measurement — except `declared`, which is the
 * family's own `capabilities` description (it never changes generation).
 * Capacity is measured on the engine's fixed seed with the same budget
 * Pre-Flight uses, so the report says what Pre-Flight will tell a teacher.
 *
 * Pure and deterministic.
 */

import { resolveFamilyConstraints } from './questionFamilyContract.mjs';
import { measureFamilyCapacity } from './questionFamilyEngine.mjs';
import { familyInstanceGradingSupport } from './questionFamilyGrading.mjs';
import { resolveFamilyPreviewInstance } from './questionFamilyInstance.mjs';
import { allRegisteredQuestionFamilies, defaultFamilyVersion } from './questionFamilyRegistry.mjs';
import { assessRecoverySlot } from './sectionRecoveryReadiness.mjs';

export const QUESTION_FAMILY_CAPABILITY_REPORT_VERSION = 1;

/** Pre-Flight's capacity budget (questionGenerationPreflight.CAPACITY_BUDGET); a test keeps them equal. */
export const CAPABILITY_CAPACITY_BUDGET = 2048;

/** The class a teacher has in mind: Pre-Flight's reference class. */
export const CAPABILITY_REFERENCE_CLASS = 30;

const json = (value) => JSON.parse(JSON.stringify(value));

const knobRecord = (name, knob, conceptConstraints) => {
  const base = { name, label: knob.label || name, kind: knob.kind, default: json(knob.default), concept: conceptConstraints.includes(name) };
  if (knob.kind === 'range') return { ...base, limits: [...knob.limits] };
  if (knob.kind === 'choice') return { ...base, values: json(knob.values) };
  if (knob.kind === 'boolean') return { ...base, values: [true, false] };
  return base;
};

/**
 * The settings capacity is measured under: the defaults, then each concept
 * choice's other values one at a time (solutionCase "none", distribute: true,
 * solutionForm "fraction", …). A family without concept knobs has one.
 */
export const capabilityProfiles = (family) => {
  const profiles = [{ label: 'default', constraints: {} }];
  (family.conceptConstraints || []).forEach((name) => {
    const knob = family.constraints?.[name];
    const values = knob?.kind === 'choice' ? knob.values : knob?.kind === 'boolean' ? [true, false] : [];
    values
      .filter((value) => JSON.stringify(value) !== JSON.stringify(knob.default))
      .forEach((value) => profiles.push({ label: `${name}: ${JSON.stringify(value)}`, constraints: { [name]: value } }));
  });
  return profiles;
};

const measured = (family, overrides) => {
  const { values } = resolveFamilyConstraints(family, overrides);
  const result = measureFamilyCapacity(family, values, { budget: CAPABILITY_CAPACITY_BUDGET });
  return {
    capacity: result.capacity,
    exact: result.exact === true,
    ...(Array.isArray(result.strata)
      ? { strata: result.strata.map((entry) => ({ stratum: json(entry.stratum), capacity: entry.capacity, exact: entry.exact === true })) }
      : {}),
  };
};

/** A slot that references this exact version with its defaults, as an author would write it. */
const referenceSlot = (family, constraints = {}) => ({
  questionId: `capability-${family.id}-v${family.version}`,
  type: family.defaultTool,
  prompt: '',
  questionFamily: { id: family.id, version: family.version, constraints },
});

/** The tool a student answers in, with its mode, and whether the server marks it — from a built instance. */
const toolRecords = (family) => Object.keys(family.tools).sort().map((tool) => {
  const slot = { ...referenceSlot(family), type: tool, questionFamily: { ...referenceSlot(family).questionFamily, tool } };
  const preview = resolveFamilyPreviewInstance(slot);
  if (preview.error || !preview.question) {
    return { tool, default: tool === family.defaultTool, mode: null, serverGraded: false, authority: null, reason: preview.error || 'no-instance' };
  }
  const support = familyInstanceGradingSupport(preview.question);
  return {
    tool,
    default: tool === family.defaultTool,
    // The mode the shared grader marks (Step Algebra "equation", Systems
    // Workspace "algebraic"), else the tool's own mode.
    mode: support.mode || preview.question.mode || null,
    serverGraded: support.supported === true,
    authority: support.authority || null,
    reason: support.supported === true ? null : support.reason || null,
  };
});

/** Ready for automatic Recovery with its default constraints: the same check Pre-Flight runs. */
const recoveryRecord = (family) => {
  const slot = assessRecoverySlot({
    assignmentId: 'capability-report',
    question: referenceSlot(family),
    storageIndex: 0,
    label: `${family.id} v${family.version}`,
  });
  return {
    eligible: family.recovery.eligible === true,
    ready: slot.ready === true,
    issues: slot.issues.map((issue) => issue.code),
  };
};

const reducedComplexityRecords = (family) => Object.entries(family.supportConstraints || {}).map(([support, overrides]) => ({
  support,
  narrows: json(overrides),
  keeps: [...(family.conceptConstraints || [])],
  capacity: measured(family, overrides).capacity,
}));

/** Everything the report says about one registered family version. */
export const describeQuestionFamilyCapability = (family) => {
  const conceptConstraints = [...(family.conceptConstraints || [])];
  const declared = json(family.capabilities || {});
  const profiles = capabilityProfiles(family).map((profile) => ({ ...profile, ...measured(family, profile.constraints) }));
  const defaultCapacity = profiles[0];
  return {
    id: family.id,
    version: family.version,
    title: family.title,
    alignments: [...(family.skill?.alignments || [])],
    unpinnedReferenceMeansThisVersion: defaultFamilyVersion(family.id) === family.version,
    constraintPolicy: family.constraintPolicy,
    constraints: Object.entries(family.constraints || {}).map(([name, knob]) => knobRecord(name, knob, conceptConstraints)),
    conceptConstraints,
    solutionCases: declared.solutionCases || null,
    solutionForms: declared.solutionForms || null,
    coefficientForms: declared.coefficientForms || null,
    tools: toolRecords(family),
    recovery: recoveryRecord(family),
    capacity: profiles,
    classOf30: defaultCapacity.capacity >= CAPABILITY_REFERENCE_CLASS ? 'every student unique' : 'students will share questions',
    reducedComplexity: reducedComplexityRecords(family),
    declared,
  };
};

/** Every registered family version, in id then version order. */
export const buildQuestionFamilyCapabilityReport = () => ({
  reportVersion: QUESTION_FAMILY_CAPABILITY_REPORT_VERSION,
  capacityBudget: CAPABILITY_CAPACITY_BUDGET,
  referenceClass: CAPABILITY_REFERENCE_CLASS,
  families: allRegisteredQuestionFamilies()
    .slice()
    .sort((left, right) => (left.id === right.id ? left.version - right.version : left.id.localeCompare(right.id)))
    .map(describeQuestionFamilyCapability),
});
