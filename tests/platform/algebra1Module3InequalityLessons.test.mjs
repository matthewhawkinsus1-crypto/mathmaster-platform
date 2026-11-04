/*
 * ALGEBRA I · MODULE 3 · TOPIC 2 — LESSONS 4 AND 5, REGULAR AND HONORS, READY
 * TO ASSIGN AS WRITTEN.
 *
 * Graphing Inequalities in Two Variables (A.2H, A.3D) and Systems of Linear
 * Inequalities (A.3H), each a regular and an Honors teacher-import file in
 * teacher-import-jsons/algebra1-module3/, written by
 * scripts/content/build-algebra1-m3-inequalities.mjs. Every graph is built in
 * the Systems Workspace, step by step; the Honors files carry the Honors
 * extension and two audited CCMR items in Practice, so an Honors class
 * receives exactly the file.
 *
 * What this holds, for each file:
 *   - the committed file is exactly what its builder writes;
 *   - Pre-Flight shows a teacher nothing, and the Warm-Up and Exit Ticket are
 *     Recovery-ready;
 *   - every typed key, in every version a class of 32 receives, is accepted
 *     and a wrong answer refused; every graph a student builds is graded on
 *     the inequality the student reads (Pre-Flight does not compare them) and
 *     has the tool's own worked solution, in every version;
 *   - the accommodations: authored "Break it down" steps the chunker shows as
 *     written, and hints, a "Let's back up" step and a common error everywhere
 *     but the Exit Ticket;
 * and for each pair, that the Honors file is the same lesson at greater depth
 * that meets the Honors contract by itself, and that the Honors version
 * Pre-Flight builds is READY with nothing replaced and is what Create accepts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGEBRA1_M3_INEQUALITY_LESSONS, ALGEBRA1_M3_INEQUALITY_PAIRS, expectedFileText } from '../../scripts/content/build-algebra1-m3-inequalities.mjs';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { HONORS_CCMR_STATUS, confirmHonorsCandidateForCreate } from '../../src/platform/assignments/canonicalCcmrHydration.js';
import {
  VERSIONS,
  auditedItemFindings,
  backUpFindings,
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
const LESSON_TEKS = { 'Lesson 4': ['A.3D', 'A.2H'], 'Lesson 5': ['A.3H'] };
const lessonOf = (entry) => entry.lesson.assignment.folder.split('/').pop();
const questionsOf = (lesson, role) => lesson.sections.filter((section) => section.role === role).flatMap((section) => section.questions);
const deepCount = (model) => model.questions.filter((question) => ['classwork', 'practice'].includes(question.sectionId) && Number(question.dok) >= 3).length;
const toolShare = (lesson) => {
  const questions = lesson.sections.flatMap((section) => section.questions);
  return questions.filter((question) => !(question.studentActions || []).includes('multipleResponses')).length / questions.length;
};

for (const entry of ALGEBRA1_M3_INEQUALITY_LESSONS) {
  const name = entry.lesson.assignment.title;
  const text = readRepoFile(entry.file);
  const lesson = JSON.parse(text);

  test(`${name}: the committed file is exactly what its builder writes`, () => {
    assert.equal(text, expectedFileText(entry), `run node scripts/content/build-algebra1-m3-inequalities.mjs and commit ${entry.file}`);
  });

  test(`${name}: four sections, an Algebra I lesson on its TEKS, Honors placement left to the class`, () => {
    assert.deepEqual(lesson.sections.map((section) => section.role), SECTIONS);
    assert.equal(lesson.assignment.courseId, 'algebra1');
    assert.equal(/courseLevel|isHonors/.test(text), false, 'Honors placement comes from the destination class, never from the file');
    const primary = new Set(lesson.sections.flatMap((section) => section.questions).map((question) => question.standard));
    LESSON_TEKS[lessonOf(entry)].forEach((code) => assert.ok(primary.has(code), `${code} is taught (${[...primary].join(', ')})`));
  });

  test(`${name}: Pre-Flight shows a teacher nothing to fix, and the Warm-Up and Exit Ticket back Recovery`, () => {
    assert.deepEqual(preflightFindings(text), []);
    const generation = reviewedModel(text).questionGeneration;
    assert.equal(generation.recoveryReadiness.fullyReady, true);
    assert.equal(generation.recovery.warmup.status, 'ready');
    assert.equal(generation.recovery.dol.status, 'ready');
  });

  test(`${name}: every typed key in every version is accepted, and a wrong answer is refused`, () => {
    const { problems, versionsChecked } = keyFindings(compiled(text).questions);
    assert.deepEqual(problems, []);
    assert.ok(versionsChecked >= VERSIONS, `${versionsChecked} versions graded`);
  });

  test(`${name}: every graph is graded on the inequality the student reads, and every tool has a worked solution`, () => {
    assert.deepEqual(toolFindings(compiled(text).questions), []);
    // The lesson's mathematics is done in the tools, not beside them.
    assert.ok(toolShare(lesson) >= 0.4, `${Math.round(toolShare(lesson) * 100)}% of the questions use a rich tool`);
    questionsOf(lesson, 'dol').forEach((question) => assert.ok(question.questionFamily, `${question.questionId} is generated per student`));
  });

  test(`${name}: accommodations — authored Break it down steps, and supports everywhere but the Exit Ticket`, () => {
    assert.deepEqual(directionFindings(compiled(text).questions), []);
    assert.deepEqual(supportFindings(lesson), []);
    assert.deepEqual(backUpFindings(compiled(text).questions), []);
    assert.deepEqual(dolSupportFindings(lesson), []);
  });
}

for (const { regular: regularEntry, honors: honorsEntry } of ALGEBRA1_M3_INEQUALITY_PAIRS) {
  const name = honorsEntry.lesson.assignment.title;
  const regularText = readRepoFile(regularEntry.file);
  const honorsText = readRepoFile(honorsEntry.file);
  const regular = JSON.parse(regularText);
  const honors = JSON.parse(honorsText);

  test(`${name}: the same lesson as the regular file — same folder and Classwork — with more DOK 3 reasoning`, () => {
    assert.equal(honors.assignment.title, regular.assignment.title.replace(/ \(M3 /, ' Honors (M3 '));
    assert.equal(honors.assignment.folder, regular.assignment.folder);
    const prompts = (lesson) => questionsOf(lesson, 'classwork').map((question) => question.prompt);
    assert.deepEqual(prompts(honors), prompts(regular), 'both classes are taught the same lesson from the same slides');
    const honorsDeep = deepCount(reviewedModel(honorsText));
    const regularDeep = deepCount(reviewedModel(regularText));
    assert.ok(honorsDeep > regularDeep && honorsDeep >= 4, `DOK 3+ in Classwork and Practice: Honors ${honorsDeep}, regular ${regularDeep}`);
    assert.equal(questionsOf(regular, 'practice').some((question) => question.ccmrSource), false, 'the regular file authors no CCMR items');
  });

  test(`${name}: the file meets the Honors contract itself, with audited CCMR items equal to the bank's`, () => {
    const model = reviewedModel(honorsText);
    assert.equal(model.isValid, true, model.errors.join('\n'));
    const report = inspectHonorsRigor(model.questions, { allowNarrowCheckpoint: true, ccmrTargetRequired: true });
    assert.deepEqual(report.missing, []);
    assert.equal(report.depthCount, 4);
    assert.equal(report.fullContractReady, true);
    assert.deepEqual(auditedItemFindings(honors), []);
    assert.equal(questionsOf(honors, 'practice').filter((question) => question.ccmrSource).length, 2);
  });

  test(`${name}: the Honors version Pre-Flight builds is READY, replaces nothing, and is what Create accepts`, () => {
    const model = reviewedModel(honorsText);
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

/*
 * PACING, from the PR #537 student walkthrough
 * (docs/qa/2026-11-03-pr537-walkthrough/findings.md, "A1 M3 T2 L4" and "L5").
 * A student builds the plain case in the tool before a word problem asks for
 * the same build. Items moved, but every id kept its number (the recovery and
 * walkthrough tools find items by id), so the order is held here.
 */
const isBuild = (question) => (question.studentActions || []).includes('solveInequalitySystem');

for (const entry of ALGEBRA1_M3_INEQUALITY_LESSONS) {
  const name = entry.lesson.assignment.title;
  const lesson = JSON.parse(readRepoFile(entry.file));
  const P = lesson.sections[0].questions[0].questionId.replace(/-wu-1$/, '');
  const classwork = questionsOf(lesson, 'classwork');
  const ids = classwork.map((question) => question.questionId);
  const at = (number) => ids.indexOf(`${P}-cw-${number}`);

  test(`${name}: Classwork keeps every question id it had`, () => {
    const expected = Array.from({ length: ids.length }, (_, index) => `${P}-cw-${index + 1}`);
    assert.deepEqual([...ids].sort(), expected.sort());
  });

  if (lessonOf(entry) === 'Lesson 4') {
    test(`${name}: the first graph is a bare inequality, right after CW 1 and before Kai's goal is modeled`, () => {
      const first = classwork.find(isBuild);
      assert.equal(first.modeling, undefined, `${first.questionId} is a word problem`);
      assert.equal(first.sourceConstraints.length, 1);
      assert.ok(ids.indexOf(first.questionId) < ids.indexOf(classwork.find((question) => question.modeling).questionId));
      // The walkthrough's fix: Activity 4.2's y > 4x − 6 (CW 6) moves to just after CW 1.
      assert.deepEqual([at(1), at(6), at(2)], [0, 1, 2]);
    });
  }

  if (lessonOf(entry) === 'Lesson 5') {
    test(`${name}: the first system built is the plain case, and Noah's word problem comes after Activity 5.2's system`, () => {
      // Two boundaries the student reads with y alone and whole-number slopes,
      // crossing, so the half-planes overlap: the case Practice 1 and Exit
      // Ticket 1 test. It used to appear first at item 14 of 16.
      const first = classwork.find(isBuild);
      assert.equal(ids.indexOf(first.questionId), 0, 'Classwork opens with it');
      assert.equal(first.modeling, undefined, `${first.questionId} is a word problem`);
      assert.equal(first.studentBuild.rewrite, false, `${first.questionId} asks for a rewrite`);
      assert.equal(first.expectedConstraints.length, 2);
      first.expectedConstraints.forEach((constraint) => assert.ok(Number.isInteger(constraint.m) && Number.isInteger(constraint.b), JSON.stringify(constraint)));
      assert.notEqual(first.expectedConstraints[0].m, first.expectedConstraints[1].m, 'the boundaries cross');
      // Noah's items (Getting Started, Activity 5.1, his graph and its analysis)
      // stay together and in order, after x + y > 1 and −x + y ≤ 3 (CW 5).
      assert.deepEqual([1, 2, 3, 4].map(at), [0, 1, 2, 3].map((offset) => at(1) + offset));
      assert.ok(at(1) > at(5), `Noah starts at item ${at(1) + 1}, CW 5 is item ${at(5) + 1}`);
    });

    test(`${name}: the first hint on Noah's graph asks for the intercepts and gives none of them`, () => {
      // It used to list all four, which is the whole boundary step (F-HINT-GIVES-STEP).
      const [hint] = classwork[at(3)].hints;
      assert.match(hint, /intercept|cross/i);
      assert.doesNotMatch(hint, /\(\s*-?\d|[1-9]/, hint);
    });
  }
}
