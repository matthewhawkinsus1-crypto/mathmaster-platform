/*
 * ALGEBRA I · MODULE 3 — THE HONORS VERSION OF EACH LESSON, READY TO ASSIGN.
 *
 * Each Module 3 lesson has a second teacher-import file for Honors classes
 * ("… Honors (M3 Tn Ln)"): the same lesson, taught from the same slides, with
 * Honors depth — DOK 3 reasoning, parameters, representations connected,
 * models whose solutions must fit the situation — and Warm-Up and DOL Question
 * Family slots at Honors settings. Honors status still comes from the
 * destination class (the files author no courseLevel); what an Honors class
 * gets is what Pre-Flight builds from the file (canonicalCcmrHydration.js):
 * the same lesson with audited CCMR Practice from MathMaster's bank on its own
 * TEKS.
 *
 * What this holds, for each lesson:
 *   - the Honors file is the same lesson (folder, TEKS) at greater depth, and
 *     on its own already meets every Honors depth check except the CCMR one,
 *     so selecting an Honors class shows no depth blocker;
 *   - the Honors version Pre-Flight builds is READY, valid, meets the Honors
 *     contract, is built from audited items on the lesson's TEKS in Practice,
 *     leaves the Warm-Up and DOL untouched, is the exact object Create
 *     accepts, and is fully Recovery-ready.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import {
  HONORS_CCMR_STATUS,
  buildHonorsCcmrCandidate,
  confirmHonorsCandidateForCreate,
} from '../../src/platform/assignments/canonicalCcmrHydration.js';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const DIR = 'teacher-import-jsons/algebra1-module3';
const LESSONS = [
  { key: 'T1 L1', regular: 'T1_L1_Solving_Linear_Equations', teks: ['A.5A'] },
  { key: 'T1 L3', regular: 'T1_L3_Modeling_and_Solving_Linear_Inequalities', teks: ['A.5B'] },
  { key: 'T2 L1', regular: 'T2_L1_Solving_Systems_by_Graphing', teks: ['A.3F', 'A.3G', 'A.5C', 'A.2I', 'A.3C'] },
  { key: 'T2 L2', regular: 'T2_L2_Solving_Systems_by_Substitution', teks: ['A.5C', 'A.2I', 'A.3F'] },
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const read = (name) => readFileSync(new URL(`../../${DIR}/${name}.json`, import.meta.url), 'utf8');
/** The lesson as Assignment Review holds it: imported, reviewed, Pre-Flight valid. */
const reviewed = (name) => buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(read(name)).assignmentV5, {}));
const honorsCandidate = (base) => {
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
  return buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null });
};
const sectionQuestions = (assignment, role) => assignment.sections.filter((section) => section.role === role).flatMap((section) => section.questions);
const keyOf = (question) => JSON.stringify({ id: question.questionId, prompt: question.prompt, family: question.questionFamily || null, fields: (question.answerFields || []).map((field) => [field.id, field.label, field.answer]) });
const primaryTeks = (assignment) => new Set(assignment.sections.flatMap((section) => section.questions)
  .flatMap((question) => (question.alignments || []).filter((entry) => entry.role === 'primary').map((entry) => entry.code)));
const dok3 = (model) => model.questions.filter((question) => Number(question.dok) >= 3).length;

for (const lesson of LESSONS) {
  const regular = reviewed(lesson.regular);
  const honors = reviewed(`${lesson.regular}_Honors`);
  const candidate = honorsCandidate(honors.assignmentV5);

  test(`${lesson.key} Honors: the same lesson, named for Honors, with more DOK 3 reasoning than the Regular file`, () => {
    const raw = JSON.parse(read(`${lesson.regular}_Honors`));
    const plain = JSON.parse(read(lesson.regular));
    assert.equal(raw.assignment.title, plain.assignment.title.replace(/ \(M3 /, ' Honors (M3 '));
    assert.equal(raw.assignment.folder, plain.assignment.folder);
    assert.equal(raw.assignment.courseId, 'algebra1');
    assert.equal(/courseLevel|isHonors/.test(JSON.stringify(raw)), false, 'Honors placement comes from the destination class, never from the file');
    const regularTeks = primaryTeks(regular.assignmentV5);
    const honorsTeks = primaryTeks(honors.assignmentV5);
    lesson.teks.slice(0, 1).forEach((code) => {
      assert.ok(regularTeks.has(code) && honorsTeks.has(code), `${code} is taught in both`);
    });
    [...honorsTeks].forEach((code) => assert.ok(regularTeks.has(code) || /^(A\.|[78]\.)/.test(code), `${code} is Algebra I (or its prerequisite)`));
    assert.ok(dok3(honors) > dok3(regular), `DOK 3 items: Honors ${dok3(honors)}, Regular ${dok3(regular)}`);
    assert.ok(dok3(honors) >= 4);
  });

  test(`${lesson.key} Honors: the file alone meets every Honors depth check but the CCMR one, so an Honors class shows no depth blocker`, () => {
    assert.equal(honors.isValid, true, honors.errors.join('\n'));
    const report = inspectHonorsRigor(honors.questions, { allowNarrowCheckpoint: true });
    const { ccmrEnrichment, ...depth } = report.checks;
    assert.equal(ccmrEnrichment, false, 'the file authors no CCMR claim: the Honors build sources it');
    assert.deepEqual(Object.entries(depth).filter(([, present]) => !present).map(([key]) => key), []);
    const blockers = collectReviewBlockers({
      draft: { title: 'Lesson', assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
      honorsSelected: true,
      honorsReport: report,
    });
    assert.deepEqual(blockers.filter((blocker) => /Honors class is selected/.test(blocker.message)), []);
  });

  test(`${lesson.key} Honors: Pre-Flight builds a READY candidate that meets the Honors contract from audited Practice on the lesson's TEKS`, () => {
    assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
    assert.equal(candidate.model.isValid, true, candidate.errors.join('\n'));
    assert.equal(candidate.honorsReport.isHonorsReady, true, candidate.honorsReport.missing.join(', '));
    assert.ok(candidate.honorsReport.checks.higherOrderReasoning && candidate.honorsReport.checks.ccmrEnrichment);
    assert.equal(candidate.honorsReport.depthCount, 4);
    assert.ok(candidate.targetCount >= 1, 'the lesson asks for CCMR Practice');
    assert.equal(candidate.sourcedCount, candidate.targetCount, 'every requested place is filled');
    assert.deepEqual(candidate.skipped.filter((entry) => !entry.depthOnly), [], 'no audited item failed in place');
    candidate.sourced.forEach((item) => {
      assert.ok(item.teksCodes.some((code) => lesson.teks.includes(code)), `${item.documentId} is on the lesson's TEKS (got ${item.teksCodes})`);
      const section = candidate.assignmentV5.sections[item.sectionIndex];
      assert.equal(section.role, 'practice', 'sourced into Practice');
      assert.equal(section.questions[item.questionIndex].ccmrSource.source, 'auditedBank');
    });
    const sourcedIds = new Set(candidate.sourced.map((item) => candidate.assignmentV5.sections[item.sectionIndex].questions[item.questionIndex].questionId));
    const baseIds = honors.assignmentV5.sections.flatMap((section) => section.questions.map((question) => question.questionId));
    const candidateIds = candidate.assignmentV5.sections.flatMap((section) => section.questions.map((question) => question.questionId));
    assert.equal(candidateIds.length, baseIds.length, 'sourcing replaces Practice questions; it adds none');
    assert.equal(candidateIds.filter((id) => !sourcedIds.has(id) && !baseIds.includes(id)).length, 0);
  });

  test(`${lesson.key} Honors: the Warm-Up and DOL are the file's own, and the candidate is fully Recovery-ready`, () => {
    ['warmup', 'dol'].forEach((role) => {
      assert.deepEqual(sectionQuestions(candidate.assignmentV5, role).map(keyOf), sectionQuestions(honors.assignmentV5, role).map(keyOf), `${role} is untouched`);
      sectionQuestions(candidate.assignmentV5, role).forEach((question) => assert.ok(question.questionFamily?.id, `${question.questionId} is a Question Family slot`));
    });
    const generation = buildAssignmentV5PreflightModel(candidate.assignmentV5).questionGeneration;
    assert.equal(generation.recoveryReadiness.fullyReady, true);
    assert.equal(generation.recovery.warmup.status, 'ready');
    assert.equal(generation.recovery.dol.status, 'ready');
    assert.equal(generation.warnings.filter((warning) => /Recovery/.test(warning)).length, 0);
  });

  test(`${lesson.key} Honors: Pre-Flight says the Honors version can be created, and Create accepts exactly the object it previewed`, () => {
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
    const created = confirmHonorsCandidateForCreate({ honorsCandidate: candidate, reviewedAssignmentV5: honors.assignmentV5, honorsEnrichmentQuestion: null });
    assert.deepEqual(created.assignmentV5, candidate.assignmentV5);
    assert.equal(created.honorsReport.isHonorsReady, true);
  });
}
