/*
 * THE DETERMINISTIC-HONORS COVERAGE REPORT TELLS THE TRUTH.
 *
 * A teacher must never be told "built-in Honors" supports a concept it does
 * not. The report (src/platform/rigor/honorsRecipeCoverage.js) gives every
 * registered Question Family exactly one verdict per course, and these tests
 * hold each verdict to the live product rather than to the text:
 *
 *   READY            the live selector really builds that recipe for a lesson
 *                    on that family in that course
 *   anything else    the live selector really changes nothing — and the audit
 *                    says why, and (for BLOCKED) exactly what would unblock it
 *   no-family rows   every tool and mode cited really exists and is marked by
 *                    the server
 *   the documents    docs/honors/ is regenerated from this report, never edited
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HONORS_CONCEPT_BACKLOG,
  HONORS_COVERAGE_COURSES,
  HONORS_COVERAGE_STATUS,
  HONORS_FAMILY_AUDIT,
  buildHonorsCoverageReport,
} from '../../src/platform/rigor/honorsRecipeCoverage.js';
import { HONORS_RECIPE_REGISTRY, HONORS_RECIPE_STATUS, buildDeterministicHonorsExtension } from '../../src/platform/rigor/honorsExtensionRecipes.js';
import { PLATFORM_FAMILY_IDS } from '../../functions/shared/questionFamilyRegistry.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import {
  COVERAGE_JSON_PATH,
  COVERAGE_MARKDOWN_PATH,
  renderHonorsCoverageJson,
  renderHonorsCoverageMarkdown,
} from '../../scripts/lib/honorsCoverageDocument.mjs';
import { anchorLessonFor } from './helpers/honorsRecipeLessons.mjs';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const report = buildHonorsCoverageReport();
const STATUSES = Object.values(HONORS_COVERAGE_STATUS);

test('every registered family has exactly one verdict in each course, Algebra I and Algebra II reported separately', () => {
  assert.deepEqual(Object.keys(report.courses), [...HONORS_COVERAGE_COURSES]);
  assert.deepEqual(HONORS_COVERAGE_COURSES, ['algebra1', 'algebra2']);
  for (const courseId of HONORS_COVERAGE_COURSES) {
    const course = report.courses[courseId];
    assert.deepEqual(course.families.map((row) => row.familyId), [...PLATFORM_FAMILY_IDS], `${courseId}: every registered family, once`);
    course.families.forEach((row) => {
      assert.ok(STATUSES.includes(row.status), `${row.familyId} (${courseId}): ${row.status}`);
      assert.equal(row.unaudited, undefined, `${row.familyId} (${courseId}) has not been audited: add it to honorsRecipeBacklog.js`);
      assert.equal(row.courseId, courseId);
    });
    const total = Object.values(course.familySummary).reduce((sum, count) => sum + count, 0);
    assert.equal(total, PLATFORM_FAMILY_IDS.length, `${courseId}: the summary counts every family`);
  }
});

test('READY is computed from the registry and proven by the live selector; every other verdict changes nothing', () => {
  for (const courseId of HONORS_COVERAGE_COURSES) {
    for (const row of report.courses[courseId].families) {
      const label = `${row.familyId} (${courseId})`;
      const registered = HONORS_RECIPE_REGISTRY.filter((recipe) => recipe.anchor.familyIds.includes(row.familyId) && recipe.supportedCourses.includes(courseId));
      const result = buildDeterministicHonorsExtension({ questions: anchorLessonFor(row.familyId, courseId), assignmentCourseId: courseId });
      if (row.status === HONORS_COVERAGE_STATUS.READY) {
        assert.deepEqual(row.recipes.map((recipe) => recipe.id), registered.map((recipe) => recipe.id), label);
        assert.equal(result.status, HONORS_RECIPE_STATUS.READY, `${label}: READY means a teacher gets the extension (${result.code})`);
        assert.ok(registered.some((recipe) => recipe.id === result.recipe.id), label);
      } else {
        assert.equal(registered.length, 0, `${label}: a registered recipe makes it READY, never ${row.status}`);
        assert.equal(result.status, HONORS_RECIPE_STATUS.UNAVAILABLE, `${label}: ${row.status} means the teacher gets nothing`);
        assert.equal(result.question, null, label);
        assert.ok(String(row.reason).length > 40, `${label}: says why`);
      }
      if (row.status === HONORS_COVERAGE_STATUS.BLOCKED) {
        assert.ok(String(row.missingCapability).length > 40, `${label}: names exactly what would unblock it`);
      }
    }
  }
});

test('the audit is about real families and never contradicts the registry', () => {
  for (const [familyId, byCourse] of Object.entries(HONORS_FAMILY_AUDIT)) {
    assert.ok(PLATFORM_FAMILY_IDS.includes(familyId), `${familyId} is a registered family`);
    for (const [courseId, verdict] of Object.entries(byCourse)) {
      assert.ok(HONORS_COVERAGE_COURSES.includes(courseId), `${familyId}: ${courseId}`);
      assert.notEqual(verdict.status, HONORS_COVERAGE_STATUS.READY, `${familyId} (${courseId}): READY is computed, never declared`);
      const recipe = HONORS_RECIPE_REGISTRY.find((entry) => entry.anchor.familyIds.includes(familyId) && entry.supportedCourses.includes(courseId));
      assert.equal(recipe, undefined, `${familyId} (${courseId}) has recipe ${recipe?.id}: remove the stale ${verdict.status} verdict`);
      assert.ok(verdict.teacherReason, `${familyId} (${courseId}): a sentence for the teacher`);
      if (verdict.status === HONORS_COVERAGE_STATUS.BLOCKED) assert.ok(verdict.missingCapability, `${familyId} (${courseId}): what would unblock it`);
    }
  }
});

test('concepts with no registered family cite tools and modes that exist and are marked by the server', () => {
  assert.ok(HONORS_CONCEPT_BACKLOG.some((entry) => entry.courseId === 'algebra1'));
  assert.ok(HONORS_CONCEPT_BACKLOG.some((entry) => entry.courseId === 'algebra2'));
  for (const entry of HONORS_CONCEPT_BACKLOG) {
    assert.equal(entry.status, HONORS_COVERAGE_STATUS.BLOCKED, entry.concept);
    assert.ok(entry.missingCapability, entry.concept);
    for (const tool of entry.tools) {
      const declaration = GRADING_MANIFEST[tool.surface];
      assert.ok(declaration, `${entry.concept}: ${tool.surface} is a grading surface`);
      if (declaration.kind === 'tool') {
        assert.ok(declaration.modes[tool.mode], `${entry.concept}: ${tool.surface} has mode ${tool.mode}`);
        assert.equal(declaration.modes[tool.mode].authority, GRADING_AUTHORITY.SHARED_SERVER, `${entry.concept}: ${tool.surface}/${tool.mode} is marked by the server`);
      } else {
        assert.equal(declaration.authority, GRADING_AUTHORITY.SHARED_SERVER, `${entry.concept}: ${tool.surface} is marked by the server`);
      }
    }
    // TEKS of the course the concept is listed under (or none, with a note).
    if (entry.teks.length) {
      const pattern = entry.courseId === 'algebra2' ? /^A2\.\d+[A-Z]$/ : /^A\.\d+[A-Z]$/;
      entry.teks.forEach((code) => assert.match(code, pattern, `${entry.concept}: ${code}`));
    } else {
      assert.ok(entry.note, `${entry.concept}: explains why it has no TEKS of this course`);
    }
  }
});

test('the committed report is generated from the live registry and audit, never hand-edited', () => {
  assert.equal(read(COVERAGE_MARKDOWN_PATH), renderHonorsCoverageMarkdown(report), `${COVERAGE_MARKDOWN_PATH} is stale: run node scripts/report-honors-coverage.mjs --write`);
  assert.equal(read(COVERAGE_JSON_PATH), renderHonorsCoverageJson(report), `${COVERAGE_JSON_PATH} is stale: run node scripts/report-honors-coverage.mjs --write`);
  const parsed = JSON.parse(read(COVERAGE_JSON_PATH));
  assert.deepEqual(parsed.registry, HONORS_RECIPE_REGISTRY.map((recipe) => `${recipe.id}@${recipe.version}`));
  // The headline counts a teacher (or a reviewer) reads.
  // Algebra I: the equation special cases (linear.multiStepEquation v2,
  // linear.twoStepEquation v2) and systems.algebraic2x2 made five families
  // CAPABLE; no recipe exists for them yet.
  assert.match(read(COVERAGE_MARKDOWN_PATH), /\| Algebra I \| 12 \| 4 \| 5 \| 2 \| 1 \|/);
  assert.match(read(COVERAGE_MARKDOWN_PATH), /\| Algebra II \| 12 \| 0 \| 0 \| 6 \| 6 \|/);
});
