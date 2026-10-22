/*
 * ALGEBRA I · MODULE 2 · TOPIC 2 · LESSON 3 — THE REGULAR AND THE HONORS
 * VERSION, BOTH READY, BOTH WITH WARM-UP AND DOL RECOVERY.
 *
 * "Slopes of Perpendicular Lines and Horizontal & Vertical Lines" is one
 * teacher-import file. The Regular version is that file as it is. The Honors
 * version is what Pre-Flight builds for an Honors class (canonicalCcmrHydration
 * .js): the same lesson, with audited CCMR Practice sourced from MathMaster's
 * bank on the lesson's own TEKS. The no-AI Honors extension recipes have none
 * for this concept (honorsRecipeBacklog.js), so the Honors version rests on the
 * lesson's own depth (DOK 3 reasoning, representations, justification) plus
 * that audited CCMR Practice.
 *
 * What this holds:
 *   - Regular: passes Pre-Flight with no errors or warnings and is fully
 *     Recovery-ready (Warm-Up and DOL).
 *   - Honors: the candidate is READY, valid, meets the Honors contract, is
 *     built on the audited bank, leaves the Warm-Up and DOL untouched, and is
 *     the exact object Create accepts.
 *   - Recovery is stored for each payload separately, and each is fully ready.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  HONORS_CCMR_STATUS,
  buildHonorsCcmrCandidate,
  confirmHonorsCandidateForCreate,
} from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { creationRecoveryContent } from '../../src/platform/recovery/recoveryContentAuthoring.js';
import { assignmentRecoveryContent } from '../../functions/shared/recoveryContent.mjs';
import { planAssignmentRecoveryContent } from '../../functions/shared/recoveryContentPlan.mjs';
import { serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const LESSON = 'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json';
const clone = (value) => JSON.parse(JSON.stringify(value));

/** The lesson as Assignment Review holds it: imported, reviewed, Pre-Flight valid. */
const reviewed = () => {
  const parsed = parseAssignmentBlueprintText(readFileSync(new URL(`../../${LESSON}`, import.meta.url), 'utf8'));
  return buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
};

const honorsCandidate = () => {
  const base = reviewed().assignmentV5;
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
  return { base, candidate: buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null }) };
};

const sectionQuestions = (assignment, role) => assignment.sections.filter((section) => section.role === role).flatMap((section) => section.questions);
const keyOf = (question) => JSON.stringify({ id: question.questionId, prompt: question.prompt, fields: (question.answerFields || []).map((field) => [field.id, field.label, field.answer]) });

const asPayload = (assignmentV5, level) => ({
  ...clone(assignmentV5),
  id: `l3-${level}`,
  title: assignmentV5.assignment.title,
  courseProfile: { course: 'algebra1', courseLevel: level },
  rigorVariant: level,
  assignedClassIds: [`class-${level}`],
});

test('Regular: passes Pre-Flight with no errors or warnings, and its Warm-Up and DOL are fully Recovery-ready', () => {
  const model = reviewed();
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.deepEqual(model.errors, []);
  assert.deepEqual(model.warnings || [], []);
  const generation = model.questionGeneration;
  assert.equal(generation.recoveryReadiness.fullyReady, true);
  assert.equal(generation.recovery.warmup.status, 'ready');
  assert.equal(generation.recovery.dol.status, 'ready');
  assert.equal(generation.warnings.filter((warning) => /Recovery/.test(warning)).length, 0);
});

test('Honors: Pre-Flight builds a READY, valid candidate that meets the Honors contract from audited bank items on the lesson\'s TEKS', () => {
  const { base, candidate } = honorsCandidate();
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
  assert.equal(candidate.model.isValid, true, candidate.errors.join('\n'));
  assert.equal(candidate.honorsReport.isHonorsReady, true, candidate.honorsReport.missing.join(', '));
  assert.ok(candidate.honorsReport.checks.higherOrderReasoning && candidate.honorsReport.checks.ccmrEnrichment);
  assert.ok(candidate.honorsReport.depthCount >= 3, 'DOK 3 reasoning plus at least two other depth signals');
  assert.ok(candidate.targetCount >= 1, 'the lesson asks for CCMR Practice');
  assert.equal(candidate.sourcedCount, candidate.targetCount, 'every requested place is filled');
  assert.deepEqual(candidate.skipped, [], 'no audited item had to be skipped');

  candidate.sourced.forEach((item) => {
    assert.ok(item.teksCodes.some((code) => ['A.2F', 'A.2G'].includes(code)), `${item.documentId} is on the lesson's TEKS (got ${item.teksCodes})`);
    const placed = candidate.assignmentV5.sections[item.sectionIndex].questions[item.questionIndex];
    assert.equal(candidate.assignmentV5.sections[item.sectionIndex].role, 'practice', 'sourced into Practice');
    assert.equal(placed.ccmrSource.source, 'auditedBank');
    assert.equal(placed.ccmrSource.documentId, item.documentId);
  });
  // The Regular lesson is the Honors lesson's base: nothing outside the sourced places changed.
  const sourcedIds = new Set(candidate.sourced.map((item) => candidate.assignmentV5.sections[item.sectionIndex].questions[item.questionIndex].questionId));
  const baseIds = base.sections.flatMap((section) => section.questions.map((question) => question.questionId));
  const honorsIds = candidate.assignmentV5.sections.flatMap((section) => section.questions.map((question) => question.questionId));
  assert.equal(honorsIds.length, baseIds.length, 'sourcing replaces practice questions; it adds none');
  assert.equal(honorsIds.filter((id) => !sourcedIds.has(id) && !baseIds.includes(id)).length, 0);
});

test('Honors: the Warm-Up and DOL are the Regular version\'s exactly, so one set of Recovery families serves both', () => {
  const { base, candidate } = honorsCandidate();
  ['warmup', 'dol'].forEach((role) => {
    assert.deepEqual(sectionQuestions(candidate.assignmentV5, role).map(keyOf), sectionQuestions(base, role).map(keyOf), `${role} is untouched in the Honors version`);
  });
});

test('Honors: Pre-Flight says the Honors version can be created, and Create accepts exactly the object it previewed', () => {
  const { base, candidate } = honorsCandidate();
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
  const created = confirmHonorsCandidateForCreate({ honorsCandidate: candidate, reviewedAssignmentV5: base, honorsEnrichmentQuestion: null });
  assert.deepEqual(created.assignmentV5, candidate.assignmentV5);
});

test('Honors: the candidate is fully Recovery-ready too, with no Recovery warning', () => {
  const { candidate } = honorsCandidate();
  const generation = buildAssignmentV5PreflightModel(candidate.assignmentV5).questionGeneration;
  assert.equal(generation.recoveryReadiness.fullyReady, true);
  assert.equal(generation.recovery.warmup.status, 'ready');
  assert.equal(generation.recovery.dol.status, 'ready');
  assert.equal(generation.warnings.filter((warning) => /Recovery/.test(warning)).length, 0);
});

test('creation stores Recovery for the Regular payload and the Honors payload separately, each fully ready from its own six bindings', () => {
  const { base, candidate } = honorsCandidate();
  for (const [level, assignmentV5] of [['standard', base], ['honors', candidate.assignmentV5]]) {
    const payload = asPayload(assignmentV5, level);
    const content = creationRecoveryContent(payload, { at: '2026-10-22T12:00:00Z', actorUid: 'teacher-uid' });
    assert.ok(content, `${level}: Recovery stored at creation`);
    assert.equal(Object.keys(content.bindings).length, 6, `${level}: one binding per Warm-Up and DOL question`);
    assert.deepEqual(Object.keys(content.bindings).sort(), ['l3-dol-1', 'l3-dol-2', 'l3-dol-3', 'l3-wu-1', 'l3-wu-2', 'l3-wu-3']);
    assert.equal(JSON.stringify(content), JSON.stringify(JSON.parse(JSON.stringify(content))), 'plain data Firestore accepts');
    const stored = { ...payload, recoveryContent: content };
    assert.equal(assignmentRecoveryContent(stored).version, 1);
    const plan = planAssignmentRecoveryContent({ assignment: stored, gradeSample: serverRecoveryKeyCheck });
    assert.equal(plan.fullyReady, true, `${level}: both sections ready on the server's full key check`);
    assert.equal(plan.sections.warmup.status, 'ready');
    assert.equal(plan.sections.dol.status, 'ready');
  }
});
