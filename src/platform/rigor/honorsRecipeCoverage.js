/*
 * DETERMINISTIC (NO-AI) HONORS COVERAGE — MACHINE-READABLE, NEVER HAND-WAVED.
 *
 * For every registered Question Family and each course (Algebra I, Algebra
 * II), exactly one verdict:
 *
 *   READY            a vetted recipe in HONORS_RECIPE_REGISTRY is anchored on
 *                    the family and written for the course — COMPUTED from the
 *                    registry, so the report cannot claim a recipe that does
 *                    not exist, or miss one that does
 *   CAPABLE          the family could carry an Honors task today; no recipe yet
 *   BLOCKED          it cannot; `missingCapability` names exactly what would
 *                    unblock it
 *   NOT APPROPRIATE  built-in Honors here would mislead (wrong course's content)
 *
 * plus the classroom concepts that have no registered family at all (each
 * BLOCKED by the missing family; the tool and server grader already exist).
 *
 * The non-READY verdicts are the audit in honorsRecipeBacklog.js. The tests
 * (honorsRecipeCoverage.test.mjs) hold the report to the live product: every
 * READY pair really selects its recipe for a lesson on that family in that
 * course, every other pair really changes nothing, every cited tool and mode
 * is in the grading manifest and marked by the server, and the generated
 * document (scripts/report-honors-coverage.mjs) matches this report.
 *
 * Pure.
 */
import { listPlatformQuestionFamilies } from '../../../functions/shared/questionFamilyRegistry.mjs';
import { HONORS_COURSE_LABELS, HONORS_RECIPE_REGISTRY } from './honorsExtensionRecipes.js';
import {
  HONORS_CONCEPT_BACKLOG,
  HONORS_COVERAGE_STATUS,
  HONORS_FAMILY_AUDIT,
  honorsFamilyAuditFor,
} from './honorsRecipeBacklog.js';

export { HONORS_COVERAGE_STATUS, HONORS_CONCEPT_BACKLOG, HONORS_FAMILY_AUDIT };

export const HONORS_COVERAGE_COURSES = Object.freeze(['algebra1', 'algebra2']);
export const HONORS_COVERAGE_REPORT_VERSION = 1;

const STATUS_ORDER = Object.freeze([
  HONORS_COVERAGE_STATUS.READY,
  HONORS_COVERAGE_STATUS.CAPABLE,
  HONORS_COVERAGE_STATUS.BLOCKED,
  HONORS_COVERAGE_STATUS.NOT_APPROPRIATE,
]);

const recipeSummary = (recipe) => ({
  id: recipe.id,
  version: recipe.version,
  title: recipe.title,
  target: `${recipe.target.familyId} v${recipe.target.familyVersion} · ${recipe.target.toolId}${recipe.target.mode ? ` (${recipe.target.mode})` : ''}`,
  baseline: { dok: recipe.rigor.baseline.dok, difficultyBand: recipe.rigor.baseline.difficultyBand },
  honors: { dok: recipe.rigor.dok, difficultyBand: recipe.rigor.difficultyBand },
  increases: [...recipe.rigor.increases],
  stories: recipe.stories.map((story) => story.id),
  selfGraded: recipe.selfGraded === true,
  delivery: { ...recipe.delivery },
});

/** The verdict for one registered family in one course. */
export const honorsCoverageFor = (family, courseId, { registry = HONORS_RECIPE_REGISTRY } = {}) => {
  const recipes = (Array.isArray(registry) ? registry : [])
    .filter((recipe) => recipe.anchor.familyIds.includes(family.id) && recipe.supportedCourses.includes(courseId));
  const base = {
    familyId: family.id,
    familyTitle: family.title,
    familyDifficulty: { dok: family.difficulty.dok, difficultyBand: family.difficulty.band },
    courseId,
  };
  if (recipes.length) {
    return {
      ...base,
      status: HONORS_COVERAGE_STATUS.READY,
      recipes: recipes.map(recipeSummary),
      reason: `Vetted recipe${recipes.length === 1 ? '' : 's'}: ${recipes.map((recipe) => `${recipe.id} v${recipe.version}`).join(', ')}.`,
      missingCapability: null,
    };
  }
  const audit = honorsFamilyAuditFor(family.id, courseId);
  if (!audit) {
    // Not READY and not audited: a family registered after this audit. It is
    // reported as unaudited (BLOCKED) rather than quietly omitted, and the
    // coverage test fails until someone audits it.
    return {
      ...base,
      status: HONORS_COVERAGE_STATUS.BLOCKED,
      recipes: [],
      reason: 'Not yet audited for built-in Honors.',
      missingCapability: 'An Honors audit of this family.',
      unaudited: true,
    };
  }
  return {
    ...base,
    status: audit.status,
    recipes: [],
    reason: audit.reason,
    missingCapability: audit.missingCapability || null,
    teacherReason: audit.teacherReason || null,
  };
};

const countByStatus = (rows) => Object.fromEntries(STATUS_ORDER.map((status) => [status, rows.filter((row) => row.status === status).length]));

/**
 * The whole report: per course, every registered family's verdict, the
 * concepts without a family, and the counts. Deterministic: families in id
 * order, concepts in backlog order.
 */
export const buildHonorsCoverageReport = ({ registry = HONORS_RECIPE_REGISTRY } = {}) => {
  const families = listPlatformQuestionFamilies();
  const courses = Object.fromEntries(HONORS_COVERAGE_COURSES.map((courseId) => {
    const rows = families.map((family) => honorsCoverageFor(family, courseId, { registry }));
    const concepts = HONORS_CONCEPT_BACKLOG.filter((entry) => entry.courseId === courseId).map((entry) => ({
      concept: entry.concept,
      courseId,
      status: entry.status,
      teks: [...entry.teks],
      note: entry.note || null,
      existingTools: entry.tools.map((tool) => `${tool.surface}${tool.mode ? ` (${tool.mode})` : ''}`),
      missingCapability: entry.missingCapability,
    }));
    return [courseId, {
      courseId,
      label: HONORS_COURSE_LABELS[courseId],
      families: rows,
      concepts,
      familySummary: countByStatus(rows),
    }];
  }));
  return {
    reportVersion: HONORS_COVERAGE_REPORT_VERSION,
    registry: (Array.isArray(registry) ? registry : []).map((recipe) => `${recipe.id}@${recipe.version}`),
    familyCount: families.length,
    courses,
  };
};
