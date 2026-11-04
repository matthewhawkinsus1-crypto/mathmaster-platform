/*
 * MODELING / APPLICATION CAN BE DECLARED, NOT ONLY WORDED.
 *
 * Algebra II Honors — Dividing Polynomials was blocked for an Honors class
 * although its Practice has a box-volume problem, a physics problem and two
 * more real-world problems: the Honors check found modeling / application
 * only by searching the wording for "model", "real-world", "scenario" or
 * "application", and the textbook's headings ("APPLY MATH", "PHYSICS") use
 * none of them. An author can now declare the work with the V5 `taskType`
 * the bank audit already reads (courseRigor.js, declaresModelingTask).
 *
 * The label only adds credit. A question's `taskType` names its main task,
 * and 59 audited CCMR items are error analysis, transfer or procedural work
 * about real-world models; their wording still counts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { declaresModelingTask, inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { TASK_TYPES, taskTypeOf } from '../../functions/shared/pathQuestionQuality.mjs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { buildHonorsCcmrCandidate, HONORS_CCMR_STATUS } from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { collectReviewBlockers } from '../../src/components/teacher/preflightSteps.js';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const LESSON = path.resolve(here, '../../teacher-import-jsons/algebra2-honors-module2/L2_Dividing_Polynomials.json');
const clone = (value) => JSON.parse(JSON.stringify(value));

const modeling = (question) => inspectHonorsRigor([question], { ccmrTargetRequired: false }).checks.modelingApplication;
// A real-world problem whose wording uses none of the words the check searches for.
const BOX = {
  activityRole: 'practice',
  standard: 'A2.7C',
  dok: 3,
  prompt: 'APPLY MATH (Exercise 32). A box is designed so its volume is $6x^3 + 31x^2 + 53x + 30$ and its height is always $x + 2$. Find the width and the length.',
};

test('a question declared modeling or application work counts for modeling / application, whatever its wording', () => {
  assert.equal(modeling(BOX), false, 'the wording alone does not say so');
  assert.equal(modeling({ ...BOX, taskType: 'modeling' }), true);
  assert.equal(modeling({ ...BOX, taskType: 'application' }), true);
});

test('another task type is not modeling credit on its own', () => {
  for (const taskType of TASK_TYPES.filter((value) => !['modeling', 'application'].includes(value))) {
    assert.equal(modeling({ ...BOX, taskType }), false, taskType);
  }
});

test('a label never takes away the credit the wording gives: an error-analysis item about real-world models is still applied', () => {
  // The shape of mm_A_3G_v2_error-read-intersection in the audited bank.
  const audited = {
    activityRole: 'practice',
    standard: 'A.3G',
    dok: 3,
    taskType: 'errorAnalysis',
    prompt: 'Two real-world models are graphed in the workspace. A student reads their intersection as the answer. Find the error.',
  };
  assert.equal(modeling(audited), true);
  assert.equal(modeling({ ...audited, taskType: 'procedural' }), true);
});

test('the Honors check reads taskType exactly as the bank audit does, so the two cannot disagree about a label', () => {
  assert.ok(TASK_TYPES.includes('modeling') && TASK_TYPES.includes('application'), 'both values are in the audited vocabulary');
  for (const taskType of [...TASK_TYPES, ' modeling ', 'Modeling', 'modelling', 'applications', '', null, 42]) {
    const question = { taskType };
    assert.equal(declaresModelingTask(question), ['modeling', 'application'].includes(taskTypeOf(question)), JSON.stringify(taskType));
  }
});

/* ---------------------------- the lesson that was blocked, end to end */

const lessonWithBox = (edit) => {
  const raw = JSON.parse(fs.readFileSync(LESSON, 'utf8'));
  const box = raw.sections.flatMap((section) => section.questions).find((question) => question.questionId === 'dp-pr-8');
  assert.ok(box, 'Exercise 32 is in the lesson');
  // Back to the textbook's heading, as the lesson was first written.
  box.prompt = box.prompt.replace(/^MODELING \(Exercise 32\)\./, 'APPLY MATH (Exercise 32).');
  assert.match(box.prompt, /^APPLY MATH \(Exercise 32\)\./);
  edit(box);
  return JSON.stringify(raw);
};

/** What Review shows for an Honors class: the Honors version, and its blockers. */
const honorsReview = (text) => {
  const { model } = compileTeacherImport(text);
  assert.equal(model.isValid, true, model.errors.join('\n'));
  const base = model.assignmentV5;
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null });
  const blockers = collectReviewBlockers({
    draft: { title: 'Lesson', assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
    honorsSelected: true,
    honorsReport: candidate.honorsReport,
    honorsCcmr: { status: candidate.status, errors: candidate.errors },
  });
  return { model, candidate, blockers };
};

test('Dividing Polynomials under the textbook heading is blocked one area short, and says so', () => {
  const { blockers } = honorsReview(lessonWithBox(() => {}));
  assert.equal(blockers.length, 1, blockers.map((entry) => entry.message).join('\n'));
  assert.match(blockers[0].message, /has 2 \(higher-order reasoning, explanation \/ justification\)\. Add one of: multiple representations or modeling \/ application\.$/);
});

test('Dividing Polynomials keeps the textbook heading and is ready for an Honors class once Exercise 32 declares taskType "modeling"', () => {
  const { model, candidate, blockers } = honorsReview(lessonWithBox((box) => { box.taskType = 'modeling'; }));
  // The label travels through import to the question the check reads.
  assert.equal(model.questions.find((question) => question.questionId === 'dp-pr-8').taskType, 'modeling');
  assert.deepEqual(model.warnings || [], []);
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
  assert.equal(candidate.honorsReport.checks.modelingApplication, true);
  assert.equal(candidate.honorsReport.depthCount, 3);
  assert.equal(candidate.honorsReport.isHonorsReady, true, candidate.honorsReport.missing.join(', '));
  assert.deepEqual(blockers, []);
});
