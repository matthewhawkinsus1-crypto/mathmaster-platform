// Which assessments a mathematical skill legitimately appears on.
//
// HOW THIS GOT HERE. The 9A audit ran the platform's existing crosswalk across
// the whole registry and found it was not usable as an eligibility source:
//
//   grade 6    0 of 52 standards mapped to any framework
//   grade 7    0 of 43
//   grade 8    0 of 45
//   Algebra I  49 of 49 mapped to ALL FOUR frameworks
//   Algebra II 0 of 48
//
// Both halves came from the same cause — it read the TEKS section number rather
// than the mathematics. The pattern only matched `A.n`, so four courses fell
// through silently; and within Algebra I it never said no, including about the
// ASVAB testing exponential regression, which it does not.
//
// That table has since been replaced by an authored one (teksExamCrosswalk.js),
// written per standard from the standard's own description. This module is the
// eligibility layer over it: it resolves a skill to its frameworks, records
// where each claim came from, and refuses to offer a pathway it cannot justify.
//
//   derivation: 'authored'  a human wrote this row and can be held to it.
//   alignmentType 'crosswalk' vs 'direct' — the mathematics overlaps the exam,
//   versus somebody actually wrote an item in that exam's style.
//
// NOTHING HERE INVENTS A MAPPING. A skill the crosswalk does not cover gets no
// pathway and appears in the audit as a gap for a human to fill.

import { getTexasStandard, normalizeTeksCode } from '../../texasStandards.js';
import { EXAM_DOMAIN_REGISTRY, EXAM_TYPES, mapTEKSToExamDomains } from '../assessment/examDomainRegistry.js';
import { ASVAB_EXCLUDED_TEKS_CODES } from '../assessment/teksExamCrosswalk.js';
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
// Scope exclusions.
// ---------------------------------------------------------------------------
//
// The ASVAB exclusion MECHANISM is approved: a standard with no meaningful
// relationship to Arithmetic Reasoning or Mathematics Knowledge is excluded
// rather than given a fabricated mapping. The specific CODES are still pending
// a teacher's review, so they are surfaced as a list rather than left implicit
// in the table.
//
// The list is derived from the authored crosswalk rather than maintained
// beside it, so the two cannot disagree: removing an ASVAB entry from a row
// adds that code here automatically.
export const FRAMEWORK_SCOPE_EXCLUSIONS = Object.freeze({
  [EXAM_TYPES.ASVAB]: Object.freeze({
    needsReview: true,
    note: 'ASVAB mathematics is Arithmetic Reasoning (applied arithmetic, ratio, percent, averages, rate/time/distance) and Mathematics Knowledge (number properties, basic algebra, factoring, exponents, basic geometry). These standards fall outside both.',
    codes: ASVAB_EXCLUDED_TEKS_CODES,
  }),
});

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
    const domain = (EXAM_DOMAIN_REGISTRY[framework] || []).find((item) => item.id === entry.domainId);
    frameworks[framework] = {
      framework,
      domainId: entry.domainId,
      domainTitle: domain?.title || entry.domainId,
      weight: entry.weight,
      domainIds: entry.domainIds || [entry.domainId],
      // 'full' or 'partial'. A partial crosswalk still opens the pathway — the
      // student can legitimately practise this skill in that format — but it
      // constrains which aspects of the standard an item may use.
      coverage: entry.coverage || 'full',
      allowedAspects: entry.allowedAspects || [],
      excludedAspects: entry.excludedAspects || [],
      alignmentType: ALIGNMENT_TYPE.CROSSWALK,
      // Authored per standard in teksExamCrosswalk.js, not pattern-matched.
      derivation: DERIVATION.AUTHORED,
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
  // item for this skill, the skill is on the SAT whatever the crosswalk says.
  return {
    framework,
    domainId: crosswalk?.domainId || null,
    domainTitle: crosswalk?.domainTitle || null,
    weight: crosswalk?.weight ?? null,
    coverage: crosswalk?.coverage || 'full',
    allowedAspects: crosswalk?.allowedAspects || [],
    excludedAspects: crosswalk?.excludedAspects || [],
    alignmentType: isDirectCapable ? ALIGNMENT_TYPE.DIRECT : ALIGNMENT_TYPE.CROSSWALK,
    derivation: crosswalk?.derivation || DERIVATION.AUTHORED,
    directCapable: isDirectCapable,
  };
};

export const listFrameworkAlignments = ({ skillId, directIndex = null }) => ASSESSMENT_FRAMEWORKS
  .map((framework) => resolveAlignment({ skillId, framework, directIndex }))
  .filter(Boolean);
