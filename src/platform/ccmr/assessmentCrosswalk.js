// Which assessments a mathematical skill legitimately appears on.
//
// WHAT WAS ALREADY HERE, AND WHAT THE 9A AUDIT FOUND.
// `examDomainRegistry.mapTEKSToExamDomains` already maps TEKS to exam domains,
// and Batch 9 was asked to consume it rather than invent a new mapping. It is
// consumed here. But it cannot be consumed uncritically, because running it
// across the registry produces this:
//
//   grade 6    0 of 52 standards mapped to any framework
//   grade 7    0 of 43
//   grade 8    0 of 45
//   Algebra I  49 of 49 mapped to ALL FOUR frameworks
//   Algebra II 0 of 48
//
// Both halves of that are problems. The zeroes are a coverage gap — the
// function's code pattern only matches `A.n`, so Algebra II and the middle
// grades fall through silently. The 49-of-49 is the opposite failure: a
// twelve-line strand heuristic asserting 196 alignment claims, including that
// the ASVAB tests exponential regression and correlation coefficients. It does
// not.
//
// The brief's rule is unambiguous — "Missing legitimate alignment is
// acceptable. Fake alignment is not" — so this module keeps the heuristic but
// stops treating its output as fact:
//
//   derivation: 'heuristic'  came from the strand pattern. Usable, unverified.
//   derivation: 'authored'   a human wrote it down and can be held to it.
//
// and adds a scope layer, because the cheapest correct fix for an over-broad
// map is not to re-derive it — it is to say where the exam does not go.
//
// NOTHING HERE INVENTS A NEW MAPPING. The exclusions below narrow an existing
// claim; they never manufacture one. Every skill without a heuristic entry
// stays without one, and shows up in the audit as a gap for a human to fill.

import { getTexasStandard, normalizeTeksCode } from '../../texasStandards.js';
import { EXAM_DOMAIN_REGISTRY, EXAM_TYPES, mapTEKSToExamDomains } from '../assessment/examDomainRegistry.js';
import { teksCodeFromSkillId, teksSkillId } from '../path/skillGraph.js';

export const ASSESSMENT_FRAMEWORKS = Object.freeze([
  EXAM_TYPES.DIGITAL_SAT,
  EXAM_TYPES.ACT,
  EXAM_TYPES.TSIA2,
  EXAM_TYPES.ASVAB,
]);

export const ALIGNMENT_TYPE = Object.freeze({
  // The mathematics overlaps content the assessment tests. Enough to offer the
  // pathway; not enough to call an item authentic.
  CROSSWALK: 'crosswalk',
  // Somebody deliberately authored an item in that assessment's style.
  DIRECT: 'direct',
});

export const DERIVATION = Object.freeze({
  HEURISTIC: 'heuristic',
  AUTHORED: 'authored',
});

export const FRAMEWORK_LABELS = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: 'Digital SAT',
  [EXAM_TYPES.ACT]: 'ACT',
  [EXAM_TYPES.TSIA2]: 'TSIA2',
  [EXAM_TYPES.ASVAB]: 'ASVAB',
});

// ---------------------------------------------------------------------------
// Scope corrections — authored, small, and flagged for review.
// ---------------------------------------------------------------------------
//
// NEEDS TEACHER REVIEW. This is the only authored curriculum judgment in Batch
// 9, and it exists because the heuristic claims every Algebra I standard is
// ASVAB content. The ASVAB's two mathematics sections are Arithmetic Reasoning
// (word problems over arithmetic, ratio, percent) and Mathematics Knowledge
// (number properties, basic algebra, geometry). Regression with technology,
// correlation coefficients, exponential modelling, parent-function
// transformations and interval-notation domain and range are not on it.
//
// Listed as exclusions rather than as a rewritten map so the underlying source
// stays the source, and so a teacher who disagrees deletes a line rather than
// reverse-engineering a heuristic.
export const FRAMEWORK_SCOPE_EXCLUSIONS = Object.freeze({
  [EXAM_TYPES.ASVAB]: Object.freeze({
    needsReview: true,
    note: 'ASVAB mathematics is Arithmetic Reasoning and Mathematics Knowledge. These Algebra I standards fall outside both.',
    codes: Object.freeze([
      // Statistics and regression with technology.
      'A.4A', 'A.4B', 'A.4C', 'A.8B', 'A.9E',
      // Exponential functions as a function family.
      'A.9A', 'A.9B', 'A.9C', 'A.9D',
      // Sequences in function form.
      'A.12C', 'A.12D',
      // Parent-function transformation analysis.
      'A.3E', 'A.7C',
      // Domain and range as represented with inequalities/interval notation.
      'A.2A', 'A.6A',
    ]),
  }),
});

const exclusionFor = (framework, code) => {
  const entry = FRAMEWORK_SCOPE_EXCLUSIONS[framework];
  if (!entry) return null;
  return entry.codes.includes(code) ? entry : null;
};

/**
 * Frameworks a single skill is crosswalked to, with the provenance of each
 * claim attached. Never returns an entry it cannot justify.
 */
export const getSkillCrosswalk = (skillIdOrCode) => {
  const code = teksCodeFromSkillId(skillIdOrCode) || normalizeTeksCode(skillIdOrCode);
  const standard = code ? getTexasStandard(code) : null;
  if (!standard) return { skillId: null, code: null, frameworks: {} };

  const mapped = mapTEKSToExamDomains(code);
  const frameworks = {};

  ASSESSMENT_FRAMEWORKS.forEach((framework) => {
    const entry = mapped[framework];
    if (!entry) return;
    const excluded = exclusionFor(framework, code);
    if (excluded) return;
    const domain = (EXAM_DOMAIN_REGISTRY[framework] || []).find((item) => item.id === entry.domainId);
    frameworks[framework] = {
      framework,
      domainId: entry.domainId,
      domainTitle: domain?.title || entry.domainId,
      weight: entry.weight,
      alignmentType: ALIGNMENT_TYPE.CROSSWALK,
      // Said plainly so nothing downstream can mistake this for verified data.
      derivation: DERIVATION.HEURISTIC,
    };
  });

  return { skillId: teksSkillId(code), code, courseId: standard.courseId, frameworks };
};

export const hasCrosswalk = (skillIdOrCode, framework) => (
  Boolean(getSkillCrosswalk(skillIdOrCode).frameworks[framework])
);

/**
 * The frameworks for which somebody has actually authored items in that
 * assessment's style, for this skill. This is what separates "the mathematics
 * overlaps the SAT" from "we have SAT-style questions about it".
 *
 * Read from the question corpus rather than from a registry, because the
 * corpus is the thing that is true.
 */
export const getDirectAlignmentIndex = (assignments = [], { normalizeAlignments, normalizeContext } = {}) => {
  const index = new Map();
  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    (assignment?.questions || []).forEach((question) => {
      const context = normalizeContext ? normalizeContext(question?.assessmentContext) : question?.assessmentContext;
      const framework = context?.framework;
      if (!framework || framework === 'course' || !ASSESSMENT_FRAMEWORKS.includes(framework)) return;

      const alignments = normalizeAlignments ? normalizeAlignments(question) : (question?.alignments || []);
      alignments
        .filter((entry) => (entry.framework === 'teks' || !entry.framework) && entry.code && entry.role !== 'prerequisite')
        .forEach((entry) => {
          const skillId = teksSkillId(entry.code);
          if (!index.has(skillId)) index.set(skillId, new Set());
          index.get(skillId).add(framework);
        });
    });
  });
  return index;
};

/**
 * The eligibility answer for one skill and one framework, combining the
 * crosswalk with whatever direct items exist.
 */
export const resolveAlignment = ({ skillId, framework, directIndex = null }) => {
  const crosswalk = getSkillCrosswalk(skillId).frameworks[framework] || null;
  const isDirectCapable = Boolean(directIndex?.get(skillId)?.has(framework));
  if (!crosswalk && !isDirectCapable) return null;

  // A directly authored item is its own justification: if somebody wrote an SAT
  // item for this skill, the skill is on the SAT regardless of what a strand
  // heuristic thinks.
  return {
    framework,
    domainId: crosswalk?.domainId || null,
    domainTitle: crosswalk?.domainTitle || null,
    weight: crosswalk?.weight ?? null,
    alignmentType: isDirectCapable ? ALIGNMENT_TYPE.DIRECT : ALIGNMENT_TYPE.CROSSWALK,
    derivation: isDirectCapable ? DERIVATION.AUTHORED : (crosswalk?.derivation || DERIVATION.HEURISTIC),
    directCapable: isDirectCapable,
  };
};

export const listFrameworkAlignments = ({ skillId, directIndex = null }) => ASSESSMENT_FRAMEWORKS
  .map((framework) => resolveAlignment({ skillId, framework, directIndex }))
  .filter(Boolean);
