// 13 — one profile per assessment, composed rather than authored.
//
// The brief says not to hardcode assessment behaviour through the UI, and not
// to invent exact test specifications the platform does not already contain.
// Both are satisfied by building each profile from data that is already in the
// repository and was already sourced:
//
//   EXAM_POLICIES        calculator mode, timing, item counts, formula sheet
//   EXAM_DOMAIN_REGISTRY the reporting domains and their weights
//
// The only new fields are presentation and generation *guidance*, and those are
// written as descriptions of the policies above rather than as claims about
// item specifications nobody here has. Where a real specification is needed and
// absent — distractor construction, for instance — the field says so instead of
// guessing.

import { EXAM_BENCHMARKS, EXAM_DOMAIN_REGISTRY, EXAM_TYPES } from '../assessment/examDomainRegistry.js';
import { EXAM_POLICIES } from '../policies/examPolicyResolver.js';
import { ASSESSMENT_FRAMEWORKS, FRAMEWORK_LABELS } from './assessmentCrosswalk.js';

const GUIDANCE = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: Object.freeze({
    blurb: 'Practice this skill in Digital SAT-style problems.',
    generationGuidance: Object.freeze([
      'A graphing calculator is available on every item, so the difficulty must come from the reasoning rather than from the arithmetic.',
      'A formula reference sheet is provided; do not test recall of a formula the sheet supplies.',
      'Roughly 95 seconds per item — favour a single well-posed question over a long multi-part task.',
    ]),
    explanationGuidance: Object.freeze([
      'Name the efficient route as well as the correct one; the constraint students feel here is time.',
    ]),
  }),
  [EXAM_TYPES.ACT]: Object.freeze({
    blurb: 'Practice this skill in ACT-style problems.',
    generationGuidance: Object.freeze([
      'No formula sheet — a formula the student must recall is fair here in a way it is not on the SAT.',
      'Roughly 67 seconds per item. Keep the reading load short.',
      'A graphing calculator is permitted throughout the mathematics section.',
    ]),
    explanationGuidance: Object.freeze([
      'Show the fastest legitimate route; the pacing is the hardest part of this assessment.',
    ]),
  }),
  [EXAM_TYPES.TSIA2]: Object.freeze({
    blurb: 'Practice this skill in college-readiness problems.',
    generationGuidance: Object.freeze([
      'No calculator except the on-screen one offered at item level, so numbers should stay manageable by hand.',
      'Untimed — a longer, more interpretive problem is appropriate here.',
      'This is a placement assessment: favour applied reasoning over procedural speed.',
    ]),
    explanationGuidance: Object.freeze([
      'Explain the reasoning fully. Nothing here is a race, and the student is being placed, not scored against peers.',
    ]),
  }),
  [EXAM_TYPES.ASVAB]: Object.freeze({
    blurb: 'Practice this skill in ASVAB-style problems.',
    generationGuidance: Object.freeze([
      'No calculator at all. Arithmetic must be doable mentally or on paper.',
      'Arithmetic Reasoning items are word problems; Mathematics Knowledge items are direct.',
      'Roughly 110 seconds per item on Arithmetic Reasoning and 124 on Mathematics Knowledge.',
    ]),
    explanationGuidance: Object.freeze([
      'Show the hand computation, not a calculator route.',
    ]),
  }),
});

/**
 * The label a student may see. `directAlignmentRequiredForAuthenticLabel` is
 * the rule behind §15: a course item that merely overlaps SAT mathematics must
 * not be presented as an SAT-style item.
 */
export const buildAssessmentProfile = (framework) => {
  const policy = EXAM_POLICIES[framework];
  if (!policy) return null;
  const domains = EXAM_DOMAIN_REGISTRY[framework] || [];
  const guidance = GUIDANCE[framework] || {};
  const seconds = policy.timeLimitSeconds && policy.totalQuestions
    ? Math.round(policy.timeLimitSeconds / policy.totalQuestions)
    : null;

  return {
    id: framework,
    displayName: FRAMEWORK_LABELS[framework] || policy.title,
    fullTitle: policy.title,
    blurb: guidance.blurb || '',
    domains: domains.map((domain) => ({
      id: domain.id,
      title: domain.title,
      weight: domain.weight,
      ...(domain.crcWeight != null ? { crcWeight: domain.crcWeight } : {}),
      ...(domain.diagnosticWeight != null ? { diagnosticWeight: domain.diagnosticWeight } : {}),
    })),
    calculatorPolicy: policy.calculatorMode,
    calculatorAvailability: policy.calculatorAvailability,
    formulaSheet: policy.formulaSheet,
    totalQuestions: policy.totalQuestions,
    timeLimitSeconds: policy.timeLimitSeconds,
    secondsPerQuestion: seconds,
    pacingMode: policy.timeLimitSeconds ? 'timed' : 'untimed',
    benchmark: EXAM_BENCHMARKS[framework] || null,
    generationGuidance: guidance.generationGuidance || [],
    explanationGuidance: guidance.explanationGuidance || [],
    // Deliberately absent rather than invented: MathMaster has no per-exam item
    // specification, so question generation must not pretend to one.
    itemSpecification: null,
    directAlignmentRequiredForAuthenticLabel: true,
    policyAsOf: policy.policyAsOf,
  };
};

const PROFILE_CACHE = new Map();

export const getAssessmentProfile = (framework) => {
  if (!PROFILE_CACHE.has(framework)) PROFILE_CACHE.set(framework, buildAssessmentProfile(framework));
  return PROFILE_CACHE.get(framework);
};

export const listAssessmentProfiles = () => ASSESSMENT_FRAMEWORKS.map(getAssessmentProfile).filter(Boolean);

/**
 * §15 — what the student may be told about an item's authenticity.
 * A crosswalk-derived item gets honest wording, never a false badge.
 */
export const describeItemAuthenticity = ({ framework, alignmentType }) => {
  const profile = getAssessmentProfile(framework);
  if (!profile) return { studentLabel: 'Practice', teacherLabel: 'Course content', authentic: false };
  if (alignmentType === 'direct') {
    return {
      studentLabel: `${profile.displayName}-Style Practice`,
      teacherLabel: `Assessment: ${profile.displayName} · Alignment: Direct`,
      authentic: true,
    };
  }
  return {
    studentLabel: `Practice for ${profile.displayName}`,
    teacherLabel: `Assessment: ${profile.displayName} · Alignment: Crosswalk-derived practice`,
    authentic: false,
  };
};
