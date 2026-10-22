/*
 * RECOVERY V2 — VERSIONED RECOVERY CONTENT, CERTIFICATION, AND READINESS.
 *
 * A static Warm-Up or DOL question gains Recovery from `recoveryContent`, a
 * separately versioned record beside the questions: a binding to a certified
 * Question Family, tied to the exact question it was certified for. These
 * tests pin what makes that safe:
 *
 *   the question itself never changes, and a binding goes stale (stops being
 *     used) the moment the question's mathematics does;
 *   the family slot a Recovery generates from carries none of the original's
 *     mathematics, and the original problem is never dealt back as "fresh";
 *   certification refuses a family that is not the same skill, TEKS, DOK,
 *     difficulty, concept and tool, that has too few fresh versions, or whose
 *     grader accepts a wrong answer;
 *   readiness is never claimed unless BOTH the Warm-Up and the DOL pass (or
 *     use a legitimate exception), for the Standard and the Honors copy alike;
 *   creation stores the bindings, so future lessons start recoverable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import {
  RECOVERY_SOURCE_KIND,
  applyRecoveryBindings,
  assignmentRecoveryContent,
  recoveryBindingsHash,
  recoverySourceQuestion,
  recoverySourceSignature,
  resolveRecoverySource,
} from '../../functions/shared/recoveryContent.mjs';
import {
  RECOVERY_CERTIFICATION_ISSUE,
  RECOVERY_MINIMUM_FRESH_VERSIONS,
  certifyRecoveryBinding,
} from '../../functions/shared/recoveryCertification.mjs';
import { serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { lightRecoveryKeyCheck } from '../../functions/shared/recoveryLightKeyCheck.mjs';
import {
  RECOVERY_PLAN_ROW,
  RECOVERY_SECTION_STATUS,
  flattenAssignmentQuestions,
  liveRecoverySections,
  planAssignmentRecoveryContent,
  recoveryPreparationAvailable,
} from '../../functions/shared/recoveryContentPlan.mjs';
import { ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2 } from '../../functions/shared/recoveryMigrations.mjs';
import { assessSectionRecoveryReadiness } from '../../functions/shared/sectionRecoveryReadiness.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { creationRecoveryContent } from '../../src/platform/recovery/recoveryContentAuthoring.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';

const lessonModel = (file) => compileTeacherImport(readFileSync(new URL(`../../teacher-import-jsons/algebra1-module2-topic2/${file}`, import.meta.url), 'utf8')).model;
const L2 = lessonModel('L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json');
const L3 = lessonModel('L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json');
// A lesson no family can pair. L3 used to be it; Recovery V2 now has families
// for every L3 Warm-Up and DOL question (recoveryPerpendicularFamilies.test.mjs),
// so the same shape is built here with free-text questions no family recognizes.
const UNPAIRABLE = (() => {
  const assignmentV5 = structuredClone(L3.assignmentV5);
  assignmentV5.sections.filter((section) => ['warmup', 'dol'].includes(section.role)).forEach((section) => {
    section.questions = section.questions.map((question) => ({
      ...question,
      type: 'multiAnswer',
      prompt: `Explain, in your own words, how you decided ${question.questionId}.`,
      answerFields: [{ id: 'explanation', type: 'text', answer: 'a reasoned explanation' }],
    }));
  });
  return { ...L3, assignmentV5 };
})();

const liveCopy = (model, overrides = {}) => ({
  ...structuredClone(model.assignmentV5),
  id: 'live-l2',
  title: model.assignmentV5.assignment.title,
  courseProfile: { course: 'algebra1', courseLevel: 'standard' },
  rigorVariant: 'standard',
  assignedClassIds: ['class-standard'],
  ...overrides,
});
const honorsCopy = (model) => {
  // An Honors copy keeps the Warm-Up and DOL and changes its Practice (an
  // extension question here), exactly as publish writes one.
  const copy = liveCopy(model, { id: 'live-l2-honors', rigorVariant: 'honors', courseProfile: { course: 'algebra1', courseLevel: 'honors' }, assignedClassIds: ['class-honors'] });
  const practice = copy.sections.find((section) => section.role === 'practice');
  practice.questions = [...practice.questions, { ...structuredClone(practice.questions[0]), questionId: 'honors-extension-1', prompt: `${practice.questions[0].prompt} (Honors extension)` }];
  return copy;
};
const questionOf = (assignment, questionId) => flattenAssignmentQuestions(assignment).find((question) => question.questionId === questionId);
const certify = ({ assignment = liveCopy(L2), questionId, question = null, questionFamily, gradeSample = serverRecoveryKeyCheck, label = questionId }) => {
  const questions = flattenAssignmentQuestions(assignment);
  const target = question || questions.find((entry) => entry.questionId === questionId);
  return certifyRecoveryBinding({
    assignmentId: assignment.id,
    question: target,
    storageIndex: questions.indexOf(questions.find((entry) => entry.questionId === (target.questionId))),
    section: target.activityRole,
    questionFamily,
    questions,
    label,
    gradeSample,
  });
};
const bindingFor = (questionId) => ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2.bindings[questionId].questionFamily;

/* ---------------------------------------------------------------------------
 * The record: versioned, idempotent, tied to the exact question.
 * ------------------------------------------------------------------------- */

test('a question\'s Recovery signature ignores presentation and weighting, and changes with its mathematics', () => {
  const question = questionOf(liveCopy(L2), 'l2-wu-2');
  const signature = recoverySourceSignature(question);
  assert.match(signature, /^rs1:[0-9a-f]{32}$/);
  assert.equal(recoverySourceSignature({ ...question, questionWeight: 4, questionWeightBasis: { source: 'teacher' }, hints: ['look again'], teacherExcluded: false, sectionTitle: 'Renamed' }), signature, 'weights, hints and section names are not the question');
  assert.notEqual(recoverySourceSignature({ ...question, prompt: `${question.prompt} Now with a different function.` }), signature, 'a changed prompt is a changed question');
  const fields = question.answerFields.map((field, index) => (index === 0 ? { ...field, answer: 'changed' } : field));
  assert.notEqual(recoverySourceSignature({ ...question, answerFields: fields }), signature, 'a changed key is a changed question');
});

test('applying bindings is versioned and idempotent: the same bindings twice is one version, a refreshed one is the next', () => {
  const assignment = liveCopy(L2);
  const plan = planAssignmentRecoveryContent({ assignment, gradeSample: serverRecoveryKeyCheck, at: '2026-10-21T12:00:00Z' });
  const first = applyRecoveryBindings({ content: null, bindings: plan.bindingsToApply, at: '2026-10-21T12:00:00Z', actorUid: 'teacher-uid', source: 'upgrade', planHash: 'rup1:test' });
  assert.equal(first.changed, true);
  assert.equal(first.content.version, 1);
  assert.deepEqual(first.added.sort(), Object.keys(ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2.bindings).sort());
  assert.equal(first.content.history.length, 1);
  assert.equal(first.content.history[0].by, 'teacher-uid');
  assert.ok(!JSON.stringify(first.content.history).includes('@'), 'every student reads the assignment: the history names a uid, never an email');
  assert.equal(first.content.history[0].bindingsHash, recoveryBindingsHash(first.content.bindings));

  const again = applyRecoveryBindings({ content: first.content, bindings: plan.bindingsToApply, at: '2026-10-22T12:00:00Z', actorUid: 'teacher-uid' });
  assert.equal(again.changed, false, 'the same bindings are not a new version');
  assert.equal(again.content.version, 1);
  assert.equal(again.content.history.length, 1);

  const refreshed = { 'l2-wu-1': { ...plan.bindingsToApply['l2-wu-1'], sourceSignature: 'rs1:00000000000000000000000000000000' } };
  const next = applyRecoveryBindings({ content: first.content, bindings: refreshed, at: '2026-10-23T12:00:00Z', actorUid: 'teacher-uid' });
  assert.equal(next.changed, true);
  assert.equal(next.content.version, 2);
  assert.deepEqual(next.replaced, ['l2-wu-1']);
  assert.equal(Object.keys(next.content.bindings).length, 6, 'the other bindings are kept');
});

test('a binding is used only while its question is exactly the question it was certified for', () => {
  const base = liveCopy(L2);
  const plan = planAssignmentRecoveryContent({ assignment: base, gradeSample: serverRecoveryKeyCheck });
  const content = applyRecoveryBindings({ content: null, bindings: plan.bindingsToApply, at: 'x' }).content;
  const assignment = { ...base, recoveryContent: content };
  const question = questionOf(assignment, 'l2-dol-2');
  assert.equal(resolveRecoverySource({ assignment, question }).kind, RECOVERY_SOURCE_KIND.BINDING);
  const changed = { ...question, prompt: `${question.prompt} (edited)` };
  assert.equal(resolveRecoverySource({ assignment, question: changed }).kind, RECOVERY_SOURCE_KIND.STALE, 'an edited question no longer uses the old Recovery');
  assert.equal(resolveRecoverySource({ assignment: base, question }).kind, RECOVERY_SOURCE_KIND.NONE);
  const familySlot = { ...question, questionFamily: { id: 'transformations.linearHorizontalShiftAlgebra', version: 1 } };
  assert.equal(resolveRecoverySource({ assignment, question: familySlot }).kind, RECOVERY_SOURCE_KIND.FAMILY);
});

test('the slot a Recovery generates from carries the original\'s identity — and none of its mathematics', () => {
  const assignment = liveCopy(L2);
  const plan = planAssignmentRecoveryContent({ assignment, gradeSample: serverRecoveryKeyCheck });
  const original = questionOf(assignment, 'l2-wu-3');
  const slot = recoverySourceQuestion(original, plan.bindingsToApply['l2-wu-3'], { contentVersion: 1 });
  assert.equal(slot.questionId, 'l2-wu-3');
  assert.equal(slot.activityRole, 'warmup');
  assert.deepEqual(slot.alignments, original.alignments);
  assert.equal(slot.dok, original.dok);
  assert.equal(slot.questionWeight, original.questionWeight, 'a Recovery question weighs what the original weighed');
  assert.equal(slot.questionFamily.id, 'linear.keyCharacteristics');
  ['prompt', 'answerFields', 'line', 'function', 'sourcePoints'].forEach((field) => {
    assert.equal(Object.prototype.hasOwnProperty.call(slot, field), false, `the original's ${field} does not travel into the Recovery slot`);
  });
  // The original problem is never dealt as a fresh version.
  const binding = plan.bindingsToApply['l2-wu-3'];
  const [originalFingerprint] = binding.originalFingerprints;
  for (let index = 0; index < 40; index += 1) {
    const result = resolveFamilyQuestionInstance({
      question: slot,
      assignmentId: assignment.id,
      storageIndex: 0,
      allocation: { seat: index, variant: 0, stride: 1, index, basis: 'preview' },
      excludeFingerprints: binding.originalFingerprints,
      historyIsComplete: true,
    });
    assert.ok(!result.error, result.error);
    assert.notEqual(result.instance.fingerprint, originalFingerprint);
  }
});

/* ---------------------------------------------------------------------------
 * Certification: the same mathematics, or no Recovery.
 * ------------------------------------------------------------------------- */

test('the six reviewed bindings certify on the live questions with the full graders', () => {
  Object.keys(ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2.bindings).forEach((questionId) => {
    const result = certify({ questionId, questionFamily: bindingFor(questionId) });
    assert.equal(result.ok, true, `${questionId}: ${result.issues.map((entry) => entry.message).join(' | ')}`);
    assert.ok(result.certification.freshVersions >= RECOVERY_MINIMUM_FRESH_VERSIONS, `${questionId} has ${result.certification.freshVersions} fresh versions`);
    assert.equal(result.certification.keyChecked, result.certification.sampled, `${questionId}: every sampled version was key-checked on the server`);
    assert.ok(result.binding.originalFingerprints.length === 1);
  });
});

test('certification refuses a family that is not the same skill, TEKS, rigor, concept or tool', () => {
  const assignment = liveCopy(L2);
  const issueCodes = (result) => result.issues.map((entry) => entry.code);

  const notRecognized = certify({ questionId: 'l2-wu-1', questionFamily: bindingFor('l2-wu-2') });
  assert.equal(notRecognized.ok, false);
  assert.deepEqual(issueCodes(notRecognized), [RECOVERY_CERTIFICATION_ISSUE.ORIGINAL_NOT_RECOGNIZED], 'a graph is not a key-characteristics board');

  const otherTeks = { ...questionOf(assignment, 'l2-wu-1'), alignments: [{ framework: 'teks', code: 'A.9C', role: 'primary' }], standard: 'A.9C' };
  assert.ok(issueCodes(certify({ question: otherTeks, questionId: 'l2-wu-1', questionFamily: bindingFor('l2-wu-1') })).includes(RECOVERY_CERTIFICATION_ISSUE.STANDARD_MISMATCH));

  const harder = { ...questionOf(assignment, 'l2-wu-1'), dok: 3 };
  assert.ok(issueCodes(certify({ question: harder, questionId: 'l2-wu-1', questionFamily: bindingFor('l2-wu-1') })).includes(RECOVERY_CERTIFICATION_ISSUE.RIGOR_MISMATCH));

  const otherMove = certify({ questionId: 'l2-dol-1', questionFamily: { ...bindingFor('l2-dol-1'), constraints: { transformation: 'verticalShift' } } });
  assert.ok(issueCodes(otherMove).includes(RECOVERY_CERTIFICATION_ISSUE.CONCEPT_MISMATCH), 'a horizontal shift is not recovered with vertical shifts');

  const fractionSlope = certify({ questionId: 'l2-wu-3', questionFamily: { ...bindingFor('l2-wu-3'), constraints: { slope: 'integer', xIntercept: 'fraction' } } });
  assert.ok(issueCodes(fractionSlope).includes(RECOVERY_CERTIFICATION_ISSUE.CONCEPT_MISMATCH), 'a fraction slope is not recovered with whole-number slopes');

  // A question answered in another tool mode is never recovered in this one:
  // the family does not even read it as its own.
  const otherMode = { ...questionOf(assignment, 'l2-wu-1'), mode: 'pointPlot' };
  const otherModeResult = certify({ question: otherMode, questionId: 'l2-wu-1', questionFamily: bindingFor('l2-wu-1') });
  assert.equal(otherModeResult.ok, false);
  assert.ok(issueCodes(otherModeResult).some((code) => [RECOVERY_CERTIFICATION_ISSUE.ORIGINAL_NOT_RECOGNIZED, RECOVERY_CERTIFICATION_ISSUE.TOOL_MISMATCH].includes(code)));

  assert.deepEqual(issueCodes(certify({ questionId: 'l2-wu-1', questionFamily: { id: 'linear.noSuchFamily', version: 1 } })), [RECOVERY_CERTIFICATION_ISSUE.FAMILY_UNKNOWN]);
  assert.deepEqual(issueCodes(certify({ questionId: 'l2-wu-1', questionFamily: { ...bindingFor('l2-wu-1'), constraints: { slope: 'irrational' } } })), [RECOVERY_CERTIFICATION_ISSUE.CONSTRAINT_INVALID]);
});

test('certification refuses too few fresh versions, and a grader that accepts a wrong answer', () => {
  const assignment = liveCopy(L2);
  // A vertical stretch of f(x) = x: a real question of this kind, but its
  // family can write only a handful of versions with whole-number images.
  const stretch = {
    ...questionOf(assignment, 'l2-dol-1'),
    function: { family: 'linear', type: 'linear', a: 2, h: 0, k: 0 },
    prompt: 'The parent function is f(x) = x. Graph g(x) = 2f(x) by plotting the image of each labeled point S1–S3, in order.',
  };
  const thin = certify({ question: stretch, questionId: 'l2-dol-1', questionFamily: { id: 'transformations.linearPlotImages', version: 1, constraints: { transformation: 'verticalScale' } } });
  assert.equal(thin.ok, false);
  assert.ok(thin.issues.some((entry) => entry.code === RECOVERY_CERTIFICATION_ISSUE.TOO_FEW_VERSIONS), thin.issues.map((entry) => entry.message).join(' | '));

  const acceptsAnything = () => ({ checked: true, isCorrect: true, wrongRejected: false });
  const lax = certify({ questionId: 'l2-wu-2', questionFamily: bindingFor('l2-wu-2'), gradeSample: acceptsAnything });
  assert.equal(lax.ok, false);
  assert.ok(lax.issues.some((entry) => entry.code === RECOVERY_CERTIFICATION_ISSUE.ANSWER_KEY_FAILED));

  // The light Pre-Flight check marks what it can and never calls the rest "passed".
  const light = certify({ questionId: 'l2-dol-1', questionFamily: bindingFor('l2-dol-1'), gradeSample: lightRecoveryKeyCheck });
  assert.equal(light.ok, true);
  assert.equal(light.certification.keyChecked, 0, 'a tool question is not key-checked by the light grader — and not reported as checked');
});

/* ---------------------------------------------------------------------------
 * Readiness: both sections, both copies, and the legitimate exceptions.
 * ------------------------------------------------------------------------- */

for (const [name, build] of [['Standard', () => liveCopy(L2)], ['Honors', () => honorsCopy(L2)]]) {
  test(`L2 ${name}: every Warm-Up and DOL question can be paired, and the copy is fully Recovery-ready only once they are stored`, () => {
    const assignment = build();
    const plan = planAssignmentRecoveryContent({ assignment, gradeSample: serverRecoveryKeyCheck });
    assert.deepEqual(plan.rows.map((row) => `${row.questionId}:${row.status}`), [
      'l2-wu-1:add', 'l2-wu-2:add', 'l2-wu-3:add', 'l2-dol-1:add', 'l2-dol-2:add', 'l2-dol-3:add',
    ]);
    assert.deepEqual(plan.rows.map((row) => row.familyId), Object.values(ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2.bindings).map((entry) => entry.questionFamily.id), 'the families read off the questions are the reviewed ones');
    // As students have it now: nothing stored yet, so not ready.
    const now = liveRecoverySections(plan);
    assert.equal(now.warmup.status, RECOVERY_SECTION_STATUS.UNAVAILABLE);
    assert.equal(now.dol.status, RECOVERY_SECTION_STATUS.UNAVAILABLE);
    assert.equal(now.dol.statusAfterApproval, RECOVERY_SECTION_STATUS.READY);
    assert.equal(recoveryPreparationAvailable(assignment), true, 'the card offers Prepare Recovery');
    // Stored: the same questions are now ready, for students and planner alike.
    const stored = { ...assignment, recoveryContent: applyRecoveryBindings({ content: null, bindings: plan.bindingsToApply, at: 'x' }).content };
    const replanned = planAssignmentRecoveryContent({ assignment: stored, gradeSample: serverRecoveryKeyCheck });
    assert.equal(replanned.changed, false);
    assert.ok(replanned.rows.every((row) => row.status === RECOVERY_PLAN_ROW.KEPT));
    assert.equal(replanned.fullyReady, true);
    assert.equal(liveRecoverySections(replanned).dol.status, RECOVERY_SECTION_STATUS.READY);
    assert.equal(recoveryPreparationAvailable(stored), false, 'nothing left to prepare');
    const questions = flattenAssignmentQuestions(stored);
    ['warmup', 'dol'].forEach((section) => {
      const entries = questions.map((question, storageIndex) => ({ question, storageIndex })).filter((entry) => entry.question.activityRole === section);
      const readiness = assessSectionRecoveryReadiness({ assignmentId: stored.id, section, entries, assignment: stored });
      assert.equal(readiness.ready, true, `${name} ${section}: the student-side decision agrees`);
      assert.ok(readiness.readySlots.every((slot) => slot.source === 'binding'));
    });
  });
}

test('a lesson MathMaster cannot pair says exactly why, and is never called ready', () => {
  const assignment = liveCopy(UNPAIRABLE, { id: 'live-unpairable', title: L3.assignmentV5.assignment.title });
  const plan = planAssignmentRecoveryContent({ assignment, gradeSample: serverRecoveryKeyCheck });
  assert.equal(plan.changed, false);
  assert.equal(plan.fullyReady, false);
  const unavailable = plan.rows.filter((row) => row.status === RECOVERY_PLAN_ROW.UNAVAILABLE);
  assert.ok(unavailable.length > 0);
  unavailable.forEach((row) => {
    assert.ok(row.issues.length > 0 && row.issues[0].message.includes(row.label), `${row.label} names itself and the reason`);
  });
  assert.equal(recoveryPreparationAvailable(assignment), false, 'no card badge for what cannot be prepared');
});

test('fully Recovery-ready needs BOTH sections: a ready Warm-Up never makes up for a DOL that cannot recover', () => {
  const assignment = liveCopy(L2);
  const dol = assignment.sections.find((section) => section.role === 'dol');
  dol.questions = [...dol.questions, { questionId: 'l2-dol-static', type: 'multiAnswer', prompt: 'Explain what a transformation is.', answerFields: [{ id: 'a', type: 'text', answer: 'a change' }], dok: 2, difficultyBand: 2, alignments: [{ framework: 'teks', code: 'A.3E', role: 'primary' }] }];
  const plan = planAssignmentRecoveryContent({ assignment, gradeSample: serverRecoveryKeyCheck });
  assert.equal(plan.sections.warmup.status, RECOVERY_SECTION_STATUS.READY);
  assert.equal(plan.sections.dol.status, RECOVERY_SECTION_STATUS.UNAVAILABLE, 'a DOL Recovery needs every DOL question');
  assert.equal(plan.fullyReady, false);
  // On a live copy the same rule holds after approval: the three pairable DOL
  // questions do not make a DOL Recovery while the fourth cannot be recovered.
  const live = liveRecoverySections(plan);
  assert.equal(live.dol.statusAfterApproval, RECOVERY_SECTION_STATUS.UNAVAILABLE);
  assert.equal(live.warmup.statusAfterApproval, RECOVERY_SECTION_STATUS.READY, 'a Warm-Up Recovery draws from its ready questions');
  assert.equal(live.dol.canPrepare, true, 'the three that can be prepared are still offered');
  // Pre-Flight says the same, and offers the repair on that one question.
  const preflight = buildAssignmentV5PreflightModel(assignment).questionGeneration;
  assert.equal(preflight.recoveryReadiness.fullyReady, false);
  assert.equal(preflight.recovery.dol.status, 'unavailable');
  assert.ok(preflight.recovery.dol.rows.some((row) => row.questionId === 'l2-dol-static' && row.status === 'unavailable'));
  assert.equal(preflight.recovery.warmup.status, 'ready');
});

test('the legitimate exceptions are never "not ready": Recovery turned off, a Live Challenge Warm-Up, a secure assessment', () => {
  const off = planAssignmentRecoveryContent({ assignment: liveCopy(L2, { gradingPolicy: { ...L2.assignmentV5.gradingPolicy, recovery: { enabled: false } } }), gradeSample: lightRecoveryKeyCheck });
  assert.equal(off.sections.warmup.status, RECOVERY_SECTION_STATUS.OFF);
  assert.equal(off.sections.dol.status, RECOVERY_SECTION_STATUS.OFF);
  assert.equal(off.fullyReady, true);

  const challenge = planAssignmentRecoveryContent({ assignment: liveCopy(L2, { warmup: { liveChallenge: { enabled: true } } }), gradeSample: lightRecoveryKeyCheck });
  assert.equal(challenge.sections.warmup.status, RECOVERY_SECTION_STATUS.LIVE_CHALLENGE);
  assert.equal(challenge.sections.dol.status, RECOVERY_SECTION_STATUS.READY);

  const secure = planAssignmentRecoveryContent({ assignment: liveCopy(L2, { secure: true }), gradeSample: lightRecoveryKeyCheck });
  assert.equal(secure.sections.warmup.status, RECOVERY_SECTION_STATUS.SECURE);
  assert.equal(secure.sections.dol.status, RECOVERY_SECTION_STATUS.SECURE);
  assert.deepEqual(secure.bindingsToApply, {}, 'nothing is prepared for a secure assessment');
  assert.equal(recoveryPreparationAvailable(liveCopy(L2, { secure: true })), false);
});

/* ---------------------------------------------------------------------------
 * Future lessons: creation stores the Recovery Pre-Flight showed.
 * ------------------------------------------------------------------------- */

test('creation stores Recovery for the Standard and the Honors payload separately, from each one\'s own questions', () => {
  [liveCopy(L2), honorsCopy(L2)].forEach((payload) => {
    const content = creationRecoveryContent(payload, { at: '2026-10-21T12:00:00Z', actorUid: 'teacher-uid' });
    assert.ok(content, `${payload.id}: Recovery stored at creation`);
    assert.equal(content.version, 1);
    assert.deepEqual(Object.keys(content.bindings).sort(), Object.keys(ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2.bindings).sort());
    assert.equal(JSON.stringify(content), JSON.stringify(JSON.parse(JSON.stringify(content))), 'plain data Firestore accepts');
    const stored = { ...payload, recoveryContent: content };
    assert.equal(assignmentRecoveryContent(stored).version, 1);
    assert.equal(planAssignmentRecoveryContent({ assignment: stored, gradeSample: lightRecoveryKeyCheck }).fullyReady, true);
  });
  assert.equal(creationRecoveryContent(liveCopy(UNPAIRABLE, { id: 'new-unpairable' })), null, 'nothing to store for a lesson no family can pair');
});

test('Pre-Flight reports the L2 lesson fully Recovery-ready without a single warning, and a lesson no family can pair as notes with reasons', () => {
  const l2 = buildAssignmentV5PreflightModel(L2.assignmentV5).questionGeneration;
  assert.equal(l2.recoveryReadiness.fullyReady, true);
  assert.equal(l2.recovery.warmup.status, 'ready');
  assert.equal(l2.recovery.dol.status, 'ready');
  assert.equal(l2.warnings.filter((warning) => /Recovery/.test(warning)).length, 0);
  assert.ok(l2.notes.some((note) => /paired automatically with a certified Recovery family; the questions themselves are unchanged/.test(note)));
  const l3 = buildAssignmentV5PreflightModel(UNPAIRABLE.assignmentV5).questionGeneration;
  assert.equal(l3.recoveryReadiness.fullyReady, false);
  assert.equal(l3.warnings.filter((warning) => /Recovery/.test(warning)).length, 0, 'a legacy lesson is not turned into one that needs review');
  assert.ok(l3.notes.some((note) => /Recovery is not available/.test(note)));
  // And L3 itself, now paired: fully ready without a warning.
  const real = buildAssignmentV5PreflightModel(L3.assignmentV5).questionGeneration;
  assert.equal(real.recoveryReadiness.fullyReady, true);
  assert.equal(real.warnings.filter((warning) => /Recovery/.test(warning)).length, 0);
});
