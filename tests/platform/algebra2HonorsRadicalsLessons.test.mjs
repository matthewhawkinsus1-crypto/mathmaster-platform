/*
 * ALGEBRA II HONORS — RADICALS AND RATIONAL EXPONENTS, LESSONS 1–3, READY TO
 * ASSIGN AS WRITTEN.
 *
 * teacher-import-jsons/algebra2-honors-radicals/ holds nth Roots, Operations
 * with Radical Expressions and Rational Exponents (TEKS A2.7G), each written
 * by scripts/content/build-algebra2-honors-radicals.mjs from a lesson module.
 * They are Honors lessons with the Honors extension and two audited CCMR
 * items already in Practice, so an Honors class receives exactly the file.
 *
 * What this holds, for each lesson:
 *   - the committed file is exactly what its builder writes;
 *   - Pre-Flight shows a teacher nothing: no error, warning, dropped hint or
 *     worked-solution note, and the Warm-Up and Exit Ticket are Recovery-ready;
 *   - every key, in every generated version (a class of 32), is accepted and
 *     a wrong answer is refused, and every rich tool has a worked solution;
 *   - the accommodations are there: authored "Break it down" steps on every
 *     question the chunker shows as written, and hints, a "Let's back up" step
 *     and a common error everywhere but the Exit Ticket, which has none;
 *   - the Honors contract is met by the file itself (depth 4, CCMR from
 *     audited items equal to the bank's), and the Honors version Pre-Flight
 *     builds is READY with nothing replaced and is what Create accepts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGEBRA2_HONORS_RADICALS_LESSONS, expectedFileText } from '../../scripts/content/build-algebra2-honors-radicals.mjs';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { HONORS_CCMR_STATUS, confirmHonorsCandidateForCreate } from '../../src/platform/assignments/canonicalCcmrHydration.js';
import {
  VERSIONS,
  auditedItemFindings,
  compiled,
  directionFindings,
  dolSupportFindings,
  honorsCandidateOf,
  keyFindings,
  preflightFindings,
  readRepoFile,
  reviewedModel,
  supportFindings,
  toolFindings,
} from './helpers/lessonFileChecks.mjs';

const SECTIONS = ['warmup', 'classwork', 'practice', 'dol'];

for (const entry of ALGEBRA2_HONORS_RADICALS_LESSONS) {
  const name = entry.lesson.assignment.title;
  const text = readRepoFile(entry.file);
  const lesson = JSON.parse(text);

  test(`${name}: the committed file is exactly what its builder writes`, () => {
    assert.equal(text, expectedFileText(entry), `run node scripts/content/build-algebra2-honors-radicals.mjs and commit ${entry.file}`);
  });

  test(`${name}: four sections, an Algebra II lesson on A2.7G, Honors placement left to the class`, () => {
    assert.deepEqual(lesson.sections.map((section) => section.role), SECTIONS);
    assert.equal(lesson.assignment.courseId, 'algebra2');
    assert.equal(/courseLevel|isHonors/.test(text), false, 'Honors placement comes from the destination class, never from the file');
    const primary = new Set(lesson.sections.flatMap((section) => section.questions).map((question) => question.standard));
    assert.ok(primary.has('A2.7G'), [...primary].join(', '));
  });

  test(`${name}: Pre-Flight shows a teacher nothing to fix, and the Warm-Up and Exit Ticket back Recovery`, () => {
    assert.deepEqual(preflightFindings(text), []);
    const generation = reviewedModel(text).questionGeneration;
    assert.equal(generation.recoveryReadiness.fullyReady, true);
    assert.equal(generation.recovery.warmup.status, 'ready');
    assert.equal(generation.recovery.dol.status, 'ready');
  });

  test(`${name}: every key in every version is accepted, and a wrong answer is refused`, () => {
    const { questions } = compiled(text);
    const { problems, versionsChecked } = keyFindings(questions);
    assert.deepEqual(problems, []);
    assert.ok(versionsChecked >= VERSIONS, `${versionsChecked} versions graded`);
  });

  test(`${name}: every rich tool, in every version, has a worked solution`, () => {
    assert.deepEqual(toolFindings(compiled(text).questions), []);
  });

  test(`${name}: accommodations — authored Break it down steps, and supports everywhere but the Exit Ticket`, () => {
    assert.deepEqual(directionFindings(compiled(text).questions), []);
    assert.deepEqual(supportFindings(lesson), []);
    assert.deepEqual(dolSupportFindings(lesson), []);
  });

  test(`${name}: the file meets the Honors contract itself, with audited CCMR items equal to the bank's`, () => {
    const model = reviewedModel(text);
    assert.equal(model.isValid, true, model.errors.join('\n'));
    const report = inspectHonorsRigor(model.questions, { allowNarrowCheckpoint: true, ccmrTargetRequired: true });
    assert.deepEqual(report.missing, []);
    assert.equal(report.depthCount, 4);
    assert.equal(report.fullContractReady, true);
    assert.deepEqual(auditedItemFindings(lesson), []);
    const deep = model.questions.filter((question) => ['classwork', 'practice'].includes(question.sectionId) && Number(question.dok) >= 3);
    assert.ok(deep.length >= 4, `${deep.length} DOK 3+ questions in Classwork and Practice`);
  });

  test(`${name}: the Honors version Pre-Flight builds is READY, replaces nothing, and is what Create accepts`, () => {
    const model = reviewedModel(text);
    const candidate = honorsCandidateOf(model.assignmentV5);
    assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
    assert.equal(candidate.sourced.length, 0, 'the file already holds its CCMR Practice: nothing is swapped in');
    assert.ok(candidate.targetCount >= 1);
    assert.equal(candidate.sourcedCount, candidate.targetCount);
    const readiness = summarizePreflightReadiness({
      blockers: collectReviewBlockers({
        draft: { title: 'Lesson', assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
        honorsSelected: true,
        honorsReport: candidate.honorsReport,
        honorsCcmr: { status: candidate.status, errors: candidate.errors },
      }),
      validationErrors: [],
      bundleIsValid: true,
    });
    assert.equal(readiness.canCreate, true);
    const created = confirmHonorsCandidateForCreate({ honorsCandidate: candidate, reviewedAssignmentV5: model.assignmentV5, honorsEnrichmentQuestion: null });
    assert.deepEqual(created.assignmentV5, candidate.assignmentV5);
  });
}
