// 9A — the CCMR coverage audit.
//
// The brief's instruction is to build this first and not to expose student UI
// until eligibility is trustworthy. That ordering is right, and this module is
// what makes "trustworthy" a measurable claim instead of an opinion: for every
// skill in grades 6-8, Algebra I and Algebra II it reports, per framework,
// whether the alignment is absent, heuristic, or authored, and whether any
// direct item exists.
//
// It is deliberately blunt about gaps. A framework with no alignment for a
// skill is reported as `none` and stays that way — the audit's job is to make
// the hole visible so a human can fill it, never to fill it.

import { ALL_TEXAS_MATH_STANDARDS } from '../../texasStandards.js';
import { getSkillGraph, teksSkillId } from '../path/skillGraph.js';
import {
  ASSESSMENT_FRAMEWORKS, DERIVATION, FRAMEWORK_LABELS,
  FRAMEWORK_SCOPE_EXCLUSIONS, getSkillCrosswalk, resolveAlignment,
} from './assessmentCrosswalk.js';
import { asvabExclusionReason } from '../assessment/teksExamCrosswalk.js';

export const AUDITED_COURSE_IDS = Object.freeze(['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2']);

export const COVERAGE = Object.freeze({
  NONE: 'none',
  CROSSWALK: 'crosswalk',
  // The standard is broader than the slice this assessment can reach, so only
  // some of it is in scope. Still a real pathway, reported separately so the
  // headline number is not inflated by half-claims.
  PARTIAL: 'partial',
  DIRECT_CAPABLE: 'direct-capable',
});

const coverageFor = (alignment) => {
  if (!alignment) return COVERAGE.NONE;
  if (alignment.directCapable) return COVERAGE.DIRECT_CAPABLE;
  return alignment.coverage === 'partial' ? COVERAGE.PARTIAL : COVERAGE.CROSSWALK;
};

/**
 * One row per skill, one column per framework.
 */
export const auditSkillCoverage = ({ courseId, directIndex = null } = {}) => {
  // getSkillGraph excludes process standards, which is correct here too: a
  // process standard is not a thing a student practises in SAT format.
  const skills = getSkillGraph(courseId);
  return skills.map((skill) => {
    const crosswalk = getSkillCrosswalk(skill.skillId);
    const frameworks = {};
    ASSESSMENT_FRAMEWORKS.forEach((framework) => {
      const alignment = resolveAlignment({ skillId: skill.skillId, framework, directIndex });
      frameworks[framework] = {
        coverage: coverageFor(alignment),
        derivation: alignment?.derivation || null,
        domainTitle: alignment?.domainTitle || null,
        allowedAspects: alignment?.allowedAspects || [],
        excludedAspects: alignment?.excludedAspects || [],
        exclusionReason: alignment ? null : asvabExclusionReason(crosswalk.code),
        // An exclusion is a deliberate "this is out of scope", which reads very
        // differently from "nobody has mapped it yet".
        excludedByScope: !crosswalk.frameworks[framework]
          && Boolean(FRAMEWORK_SCOPE_EXCLUSIONS[framework]?.codes.includes(crosswalk.code)),
      };
    });
    return {
      skillId: skill.skillId,
      code: skill.skillId.replace('teks:', ''),
      title: skill.title,
      courseId,
      frameworks,
      // A skill nothing covers is not a failure — it is simply not a CCMR skill
      // yet, and the hub must not pretend otherwise.
      anyCoverage: ASSESSMENT_FRAMEWORKS.some((framework) => frameworks[framework].coverage !== COVERAGE.NONE),
    };
  });
};

export const summarizeCourseCoverage = ({ courseId, directIndex = null } = {}) => {
  const rows = auditSkillCoverage({ courseId, directIndex });
  const byFramework = {};
  ASSESSMENT_FRAMEWORKS.forEach((framework) => {
    const counts = { none: 0, crosswalk: 0, partial: 0, directCapable: 0, excludedByScope: 0 };
    rows.forEach((row) => {
      const cell = row.frameworks[framework];
      if (cell.coverage === COVERAGE.DIRECT_CAPABLE) counts.directCapable += 1;
      else if (cell.coverage === COVERAGE.PARTIAL) counts.partial += 1;
      else if (cell.coverage === COVERAGE.CROSSWALK) counts.crosswalk += 1;
      else counts.none += 1;
      if (cell.excludedByScope) counts.excludedByScope += 1;
    });
    byFramework[framework] = counts;
  });

  return {
    courseId,
    skillCount: rows.length,
    coveredSkillCount: rows.filter((row) => row.anyCoverage).length,
    byFramework,
    rows,
  };
};

/**
 * The whole audit, plus the findings a human needs to act on. Findings are
 * derived, not written down, so they cannot drift out of date when the
 * underlying data changes.
 */
export const runCcmrCoverageAudit = ({ directIndex = null } = {}) => {
  const courses = AUDITED_COURSE_IDS.map((courseId) => summarizeCourseCoverage({ courseId, directIndex }));
  const findings = [];

  courses.forEach((course) => {
    if (course.skillCount && course.coveredSkillCount === 0) {
      findings.push({
        severity: 'gap',
        code: 'course_has_no_alignment',
        courseId: course.courseId,
        message: `${course.courseId}: none of its ${course.skillCount} skills are crosswalked to any assessment, so no CCMR pathway can open for them.`,
      });
    }
  });

  // A framework that claims every single skill in a course is claiming very
  // little: it means the map is not discriminating, which is how fake
  // alignment gets in.
  courses.forEach((course) => {
    ASSESSMENT_FRAMEWORKS.forEach((framework) => {
      const counts = course.byFramework[framework];
      const claimed = counts.crosswalk + counts.partial + counts.directCapable;
      if (course.skillCount >= 10 && claimed === course.skillCount) {
        findings.push({
          severity: 'review',
          code: 'framework_claims_every_skill',
          courseId: course.courseId,
          framework,
          message: `${FRAMEWORK_LABELS[framework]} is claimed for all ${course.skillCount} ${course.courseId} skills. A map that never says no should be checked against the assessment's published scope.`,
        });
      }
    });
  });

  const directCapableTotal = courses.reduce((total, course) => (
    total + ASSESSMENT_FRAMEWORKS.reduce((sum, framework) => sum + course.byFramework[framework].directCapable, 0)
  ), 0);
  if (directCapableTotal === 0) {
    findings.push({
      severity: 'gap',
      code: 'no_direct_items',
      message: 'No question anywhere declares an assessmentContext framework, so every CCMR pathway is crosswalk-derived. Assessment-context proficiency cannot be measured until assessment-style items exist.',
    });
  }

  Object.entries(FRAMEWORK_SCOPE_EXCLUSIONS).forEach(([framework, entry]) => {
    if (entry.needsReview) {
      findings.push({
        severity: 'review',
        code: 'authored_scope_exclusion',
        framework,
        message: `${FRAMEWORK_LABELS[framework]} scope exclusions (${entry.codes.length} standards) were authored during the audit and need a teacher's sign-off. ${entry.note}`,
      });
    }
  });

  const totals = { skills: 0, covered: 0 };
  courses.forEach((course) => { totals.skills += course.skillCount; totals.covered += course.coveredSkillCount; });

  return {
    generatedAt: new Date().toISOString(),
    courses,
    findings,
    totals,
    // "Trustworthy enough to show students" is a decision, so it is stated
    // rather than implied: any course with zero coverage means the hub will be
    // empty for those students, and that must be visible before launch.
    readyForStudentUi: findings.every((entry) => entry.code !== 'course_has_no_alignment'),
  };
};

/**
 * The process standards deliberately left out of the audit, so their absence
 * from the report is never mistaken for a coverage gap.
 */
export const listExcludedProcessStandards = (courseId) => ALL_TEXAS_MATH_STANDARDS
  .filter((standard) => standard.courseId === courseId && standard.classification === 'process')
  .map((standard) => ({ code: standard.code, skillId: teksSkillId(standard.code), reason: 'process standard' }));

export { DERIVATION };
