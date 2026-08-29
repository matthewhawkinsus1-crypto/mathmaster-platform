import {
  ASSESSMENT_FRAMEWORKS,
  FRAMEWORK_LABELS,
  getSkillCrosswalk,
} from './assessmentCrosswalk.js';
import {
  frameworkCoverageKnown,
  frameworkCoverageRecord,
} from '../../../functions/shared/pathCoverage.mjs';

export const ASSESSMENT_COVERAGE_MISMATCH = Object.freeze({
  CROSSWALK_WITHOUT_PUBLISHED_PRACTICE: 'crosswalk_without_published_practice',
  PUBLISHED_WITHOUT_CROSSWALK: 'published_without_crosswalk',
});

export const ASSESSMENT_COVERAGE_GAP = Object.freeze({
  CROSSWALK_ONLY: 'crosswalk_only_no_authored_bank_content',
});

/**
 * A broad curriculum crosswalk is a relevance statement, not a publication
 * obligation. Treat it as a hard mismatch only when the secure bank contains
 * authored content for the same TEKS/framework pair but none of that authored
 * content is publishable. A pure crosswalk-only relationship is kept as an
 * informational gap and never blocks a release by itself.
 */
export const classifyAssessmentCoverage = ({
  mapped = false,
  published = false,
  authoredCount = 0,
} = {}) => {
  const authored = Number(authoredCount || 0) > 0;

  if (published && !mapped) {
    return {
      mismatch: ASSESSMENT_COVERAGE_MISMATCH.PUBLISHED_WITHOUT_CROSSWALK,
      gap: null,
    };
  }

  if (mapped && !published && authored) {
    return {
      mismatch: ASSESSMENT_COVERAGE_MISMATCH.CROSSWALK_WITHOUT_PUBLISHED_PRACTICE,
      gap: null,
    };
  }

  if (mapped && !published && !authored) {
    return {
      mismatch: null,
      gap: ASSESSMENT_COVERAGE_GAP.CROSSWALK_ONLY,
    };
  }

  return { mismatch: null, gap: null };
};

export const buildAssessmentCoverageAudit = (index) => {
  const frameworksKnown = ASSESSMENT_FRAMEWORKS.filter((framework) => (
    frameworkCoverageKnown(index, framework)
  ));

  if (!frameworksKnown.length) {
    return {
      known: false,
      frameworksKnown: [],
      rows: [],
      gaps: [],
      summary: {
        mismatches: 0,
        crosswalkWithoutPublished: 0,
        publishedWithoutCrosswalk: 0,
        crosswalkOnlyGaps: 0,
      },
    };
  }

  const codes = Object.keys(index?.skills || {});
  const rows = [];
  const gaps = [];

  codes.forEach((teksCode) => {
    const crosswalk = getSkillCrosswalk(teksCode);
    frameworksKnown.forEach((framework) => {
      const mapped = Boolean(crosswalk.frameworks?.[framework]);
      const record = frameworkCoverageRecord(index, teksCode, framework);
      const published = record?.published === true;
      const authoredCount = Number(record?.authoredCount || 0);
      const activeCount = Number(record?.activeCount || 0);
      const familyCount = Number(record?.familyCount || 0);
      const issuableCount = Number(record?.issuableCount || 0);
      const classification = classifyAssessmentCoverage({
        mapped,
        published,
        authoredCount,
      });

      const base = {
        teksCode,
        framework,
        frameworkLabel: FRAMEWORK_LABELS[framework] || framework,
        mapped,
        published,
        authoredCount,
        activeCount,
        familyCount,
        issuableCount,
      };

      if (classification.mismatch) {
        rows.push({ ...base, mismatch: classification.mismatch });
      } else if (classification.gap) {
        gaps.push({ ...base, gap: classification.gap });
      }
    });
  });

  const sorter = (a, b) => (
    a.teksCode.localeCompare(b.teksCode, undefined, { numeric: true })
    || a.framework.localeCompare(b.framework)
  );
  rows.sort(sorter);
  gaps.sort(sorter);

  return {
    known: frameworksKnown.length === ASSESSMENT_FRAMEWORKS.length,
    frameworksKnown,
    rows,
    gaps,
    summary: {
      mismatches: rows.length,
      crosswalkWithoutPublished: rows.filter((row) => (
        row.mismatch === ASSESSMENT_COVERAGE_MISMATCH.CROSSWALK_WITHOUT_PUBLISHED_PRACTICE
      )).length,
      publishedWithoutCrosswalk: rows.filter((row) => (
        row.mismatch === ASSESSMENT_COVERAGE_MISMATCH.PUBLISHED_WITHOUT_CROSSWALK
      )).length,
      crosswalkOnlyGaps: gaps.length,
    },
  };
};

export default buildAssessmentCoverageAudit;
