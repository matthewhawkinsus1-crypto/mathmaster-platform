/*
 * QUESTION VALUES ARE SET WHEN A QUESTION IS CREATED — DETERMINISTICALLY, FROM
 * THE WORK IT ASSESSES — AND NOTHING AFTER THAT MOVES THEM BY ACCIDENT.
 *
 * functions/shared/questionValue.mjs is the one allocator. The grade contract
 * it fills is the existing one (`questionWeight`, read by every grade
 * calculation), so these tests also hold the guarantees that keep it safe:
 * explicit values win, a family's versions all count the same, Recovery counts
 * a fresh version at the original's value, legacy assignments are untouched,
 * and no section is weighted twice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  LINEAR_BRIDGE_STAGES,
  LINEAR_CONNECTION_CARD_KINDS,
  MAX_AUTO_QUESTION_VALUE,
  MIN_AUTO_QUESTION_VALUE,
  QUESTION_VALUE_RULE,
  QUESTION_VALUE_SOURCE,
  QUESTION_WORK_SURFACES,
  allocateAssignmentQuestionValues,
  allocateQuestionValue,
  carryQuestionValue,
  describeQuestionWork,
  estimateQuestionValue,
  explicitQuestionValue,
  valueForWorkUnits,
} from '../../functions/shared/questionValue.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { REPRESENTATION_BRIDGE_STAGES } from '../../functions/shared/toolMath/representationBridge/representationBridgeMath.mjs';
import { LINEAR_CARD_KINDS } from '../../functions/shared/toolMath/representationMatch/representationMath.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { auditAssignmentQuestionValues } from '../../src/platform/preflight/questionValuePreflight.js';
import { normalizeQuestionWeight, suggestedQuestionWeight } from '../../src/platform/grading/questionWeights.js';
import { splitGrade, splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { replaceQuestionAtFlatIndex } from '../../src/platform/preflight/preflightQuestionRepair.js';
import { preservePlatformOwnedFields } from '../../src/platform/contract/platformOwnedFields.js';
import { prepareAssignmentWeightReviewPack, assignmentWeightReviewFingerprint } from '../../src/platform/grading/weightReviewPack.js';
import { classifyContentQuestionChange } from '../../functions/shared/assignmentContentUpgradePolicy.mjs';
import { resolveFamilyQuestionInstance, reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { buildRecoveryAssessmentPlan } from '../../functions/shared/sectionRecoveryPlan.mjs';
import { recoveryQuestionWeight } from '../../functions/shared/sectionRecoveryService.mjs';
import { assessSectionRecoveryReadiness } from '../../functions/shared/sectionRecoveryReadiness.mjs';

const require = createRequire(import.meta.url);
const serverWeights = require('../../functions/lib/questionWeights.js');
const fullAssignmentRepair = require('../../functions/lib/fullAssignmentRepair.js');

const align = (code) => [{ framework: 'teks', code, role: 'primary' }];
const FINAL_MR = readFileSync(new URL('../../docs/assignments/algebra1-linear-multiple-representations-final-v5.json', import.meta.url), 'utf8');

const intent = (questions, role = 'classwork') => ({
  schemaVersion: 5,
  assignment: { title: 'Values', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{ id: role, role, title: role, questions }],
});

const choiceQuestion = (extra = {}) => ({
  prompt: 'Which equation has slope 2?',
  studentActions: ['multipleResponses'],
  answerFields: [{ id: 'pick', label: 'Equation', type: 'choice', options: [{ id: 'a', label: 'y = 2x' }, { id: 'b', label: 'y = x' }, { id: 'c', label: 'y = 3x' }, { id: 'd', label: 'y = -2x' }], answer: 'a' }],
  alignments: align('A.3A'),
  ...extra,
});

const LMR_FAMILY = Object.freeze({
  questionId: 'lmr-family',
  type: 'representationBridge',
  mode: 'linearMultipleRepresentations',
  studentActions: ['connectLinearRepresentations'],
  alignments: align('A.2B'),
  prompt: 'You are given y = {{m}}x {{b|signed}}. Build every other representation.',
  source: { kind: 'slopeIntercept', equation: 'y = {{m}}x {{b|signed}}' },
  graphBounds: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
  generator: {
    parameters: { m: { type: 'int', min: -3, max: 3, exclude: [0, 1, -1] }, b: { type: 'int', min: -6, max: 6, exclude: [0] } },
    constraints: ['b % m == 0'],
  },
  questionFamily: { scope: 'assignment' },
});

/* ------------------------------------------------------------------------ */

test('the rule: √(work units) to the nearest quarter, never below ×1 or above ×8, and deterministic', () => {
  assert.equal(valueForWorkUnits(0.5), 1, 'one choice is one standard question');
  assert.equal(valueForWorkUnits(1), 1);
  assert.equal(valueForWorkUnits(2), 1.5);
  assert.equal(valueForWorkUnits(4), 2);
  assert.equal(valueForWorkUnits(16), 4);
  assert.equal(valueForWorkUnits(1000), MAX_AUTO_QUESTION_VALUE);
  let previous = 0;
  for (let units = 0.5; units <= 100; units += 0.5) {
    const value = valueForWorkUnits(units);
    assert.ok(value >= previous, 'more work never lowers the value');
    assert.ok(value >= MIN_AUTO_QUESTION_VALUE && value <= MAX_AUTO_QUESTION_VALUE);
    assert.equal(Math.round(value * 4), value * 4, 'quarter increments, as the editor uses');
    previous = value;
  }
});

test('a one-click choice is not worth a full Multiple Representations board', () => {
  const published = parseAssignmentBlueprintText(FINAL_MR).questions;
  const board = published.find((question) => question.questionId === 'lmr-cw-1');
  const choice = compileAuthoringIntentV5(intent([choiceQuestion()])).package.sections[0].questions[0];
  assert.equal(choice.questionWeight, 1);
  assert.equal(board.questionWeight, 4.25);
  assert.ok(board.questionWeight >= 4 * choice.questionWeight);
  // Every value comes from structure the grader assesses, explained in words.
  assert.match(estimateQuestionValue(board).summary, /6 constructions/);
});

test('11. the same family and complexity gets the same value, whatever numbers a version draws', () => {
  const [slot] = compileAuthoringIntentV5(intent([LMR_FAMILY])).package.sections[0].questions;
  const values = new Set();
  for (let seat = 0; seat < 12; seat += 1) {
    const version = resolveFamilyQuestionInstance({ question: slot, assignmentId: `asg-${seat % 3}`, allocation: { seat, variant: 0, stride: 12, index: seat, basis: 'seated' } });
    assert.equal(version.error, null);
    values.add(estimateQuestionValue(version.question).value);
    values.add(version.question.questionWeight);
  }
  assert.deepEqual([...values], [slot.questionWeight], 'one value for every version');
  // And the same template in two different assignments is valued the same.
  const elsewhere = compileAuthoringIntentV5({ ...intent([LMR_FAMILY]), assignment: { title: 'Elsewhere', courseId: 'algebra1' } }).package.sections[0].questions[0];
  assert.equal(elsewhere.questionWeight, slot.questionWeight);
});

test('12. an author\'s explicit value is preserved exactly, and recorded as the author\'s', () => {
  const compiled = compileAuthoringIntentV5(intent([choiceQuestion({ questionWeight: 3.5 }), choiceQuestion({ questionWeight: '2' })])).package.sections[0].questions;
  assert.equal(compiled[0].questionWeight, 3.5);
  assert.deepEqual(compiled[0].questionWeightBasis, { source: QUESTION_VALUE_SOURCE.AUTHOR });
  assert.equal(compiled[1].questionWeight, '2', 'not rewritten — read as 2 by every grade calculation');
  assert.equal(normalizeQuestionWeight(compiled[1]), 2);
  assert.equal(serverWeights.normalizeQuestionWeight(compiled[1]), 2);
  // Through the full import + Pre-Flight chain too.
  const parsed = parseAssignmentBlueprintText(JSON.stringify(intent([choiceQuestion({ questionWeight: 6 })])));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  assert.equal(model.assignmentV5.sections[0].questions[0].questionWeight, 6);
});

test('a malformed explicit value is refused in a teacher\'s words, never silently replaced', () => {
  for (const [bad, phrase] of [[0, /Zero or a negative/], [-2, /Zero or a negative/], ['lots', /has to be a number/], [50, /between 0.25 and 20/], ['{{w}}', /generated numbers/]]) {
    assert.throws(
      () => compileAuthoringIntentV5(intent([choiceQuestion({ questionWeight: bad })])),
      (error) => /Section 1 Question 1 questionWeight .* is not a usable grade value/.test(error.message) && phrase.test(error.message),
      String(bad),
    );
    // The allocator itself leaves it for the validator to report.
    assert.equal(allocateQuestionValue({ type: 'multiAnswer', questionWeight: bad }).questionWeight, bad);
  }
  // Pre-Flight (a stored or salvaged draft) blocks it with a linked diagnostic.
  const draft = { ...intent([]), sections: [{ id: 'cw', role: 'classwork', questions: [{ ...compileAuthoringIntentV5(intent([choiceQuestion()])).package.sections[0].questions[0], questionWeight: 0 }] }] };
  const model = buildAssignmentV5PreflightModel(draft);
  assert.equal(model.isValid, false);
  const diagnostic = model.diagnostics.find((entry) => /questionWeight/.test(entry.message));
  assert.equal(diagnostic.severity, 'blocking');
  assert.ok(diagnostic.fieldPath.includes('questionWeight'));
});

test('13. a question with no value gets the automatic one, with its basis', () => {
  const [question] = compileAuthoringIntentV5(intent([choiceQuestion()])).package.sections[0].questions;
  assert.equal(question.questionWeight, 1);
  assert.deepEqual(question.questionWeightBasis, { source: 'auto', rule: QUESTION_VALUE_RULE, units: 0.5 });
  const parsed = parseAssignmentBlueprintText(FINAL_MR);
  assert.deepEqual(parsed.questions.map((entry) => entry.questionWeight), [2.25, 2.25, 4.25, 4.25, 4.25, 4.25, 4.75, 3.25]);
  assert.ok(parsed.questions.every((entry) => entry.questionWeightBasis.source === 'auto'));
  assert.ok(parsed.repairs.includes('assigned automatic grade values to 8 questions from the work each one assesses'));
});

test('14. recompiling, re-importing and allocating again never move a value', () => {
  const once = compileAuthoringIntentV5(JSON.parse(FINAL_MR)).package;
  const twice = compileAuthoringIntentV5(once).package;
  const values = (pkg) => pkg.sections.flatMap((section) => section.questions.map((question) => [question.questionWeight, question.questionWeightBasis]));
  assert.deepEqual(values(twice), values(once));
  assert.equal(allocateAssignmentQuestionValues(once), once, 'a fully valued assignment comes back as the same object');
  const exported = { ...once, portableContract: { kind: 'mathmasterCanonicalAssignmentV5', version: 1 } };
  assert.deepEqual(values(parseAssignmentBlueprintText(JSON.stringify(exported)).assignmentV5), values(once));
  // An automatic value already stamped is not recomputed, even if a newer rule would differ.
  const stamped = { ...once.sections[1].questions[0], questionWeight: 9, questionWeightBasis: { source: 'auto', rule: 'workload-v0', units: 81 } };
  assert.equal(allocateQuestionValue(stamped), stamped);
});

test('a portable export without values gets them on import; its own values are kept', () => {
  const legacy = compileAuthoringIntentV5(JSON.parse(FINAL_MR)).package;
  legacy.sections.forEach((section) => section.questions.forEach((question) => { delete question.questionWeight; delete question.questionWeightBasis; }));
  legacy.sections[1].questions[0].questionWeight = 7;
  const parsed = parseAssignmentBlueprintText(JSON.stringify({ ...legacy, portableContract: { kind: 'mathmasterCanonicalAssignmentV5', version: 1 } }));
  assert.equal(parsed.questions.find((question) => question.questionId === 'lmr-cw-1').questionWeight, 7);
  assert.equal(parsed.questions.find((question) => question.questionId === 'lmr-cw-2').questionWeight, 4.25);
});

test('15. a generated family version carries its slot\'s value — never one of its own', () => {
  const [slot] = compileAuthoringIntentV5(intent([{ ...LMR_FAMILY, questionWeight: 5 }])).package.sections[0].questions;
  for (let index = 0; index < 8; index += 1) {
    const version = resolveFamilyQuestionInstance({ question: slot, assignmentId: 'asg', allocation: { seat: index, variant: 0, stride: 8, index, basis: 'seated' } });
    assert.equal(version.question.questionWeight, 5);
    assert.deepEqual(version.question.questionWeightBasis, { source: 'author' });
  }
  // A templated value cannot sneak a per-student value in.
  const templated = { ...slot, questionWeight: '{{m}}' };
  const version = resolveFamilyQuestionInstance({ question: templated, assignmentId: 'asg', allocation: { seat: 0, variant: 0, stride: 1, index: 0, basis: 'preview' } });
  assert.equal(version.question.questionWeight, '{{m}}', 'the slot\'s (invalid) value, not a number drawn for this student');
  assert.equal(normalizeQuestionWeight(version.question), normalizeQuestionWeight(templated));
});

test('16. a Recovery version is a fresh question at the original\'s value', () => {
  const assignment = { id: 'asg-recovery', schemaVersion: 5, sections: [{ id: 'dol', role: 'dol', questions: compileAuthoringIntentV5(intent([LMR_FAMILY], 'dol')).package.sections[0].questions }] };
  const questions = getStoredAssignmentQuestions(assignment);
  const readiness = assessSectionRecoveryReadiness({ assignmentId: assignment.id, section: 'dol', entries: questions.map((question, storageIndex) => ({ question, storageIndex })) });
  assert.equal(readiness.ready, true, JSON.stringify(readiness.blockers));
  const original = resolveFamilyQuestionInstance({ question: questions[0], assignmentId: assignment.id, storageIndex: 0, allocation: { seat: 0, variant: 0, stride: 4, index: 0, basis: 'seated' } });
  const plan = buildRecoveryAssessmentPlan({ assignmentId: assignment.id, section: 'dol', readySlots: readiness.readySlots, questionsByIndex: { 0: questions[0] }, seenFingerprints: [original.delivery.fingerprint] });
  assert.equal(plan.error, null);
  const [item] = plan.items;
  assert.notEqual(item.pin.fingerprint, original.delivery.fingerprint, 'a different question …');
  const fresh = reproduceFamilyQuestionFromPin({ question: questions[0], assignmentId: assignment.id, storageIndex: 0, pin: item.pin });
  assert.equal(fresh.question.questionWeight, original.question.questionWeight, '… worth exactly the same');
  assert.equal(recoveryQuestionWeight(questions[0]), normalizeQuestionWeight(questions[0]), 'Recovery scores with the slot\'s value');
  assert.equal(estimateQuestionValue(fresh.question).value, estimateQuestionValue(original.question).value);
});

test('17. grade normalization is unchanged for a legacy assignment with no values', () => {
  const legacy = {
    id: 'legacy',
    schemaVersion: 5,
    sections: [
      { id: 'cw', role: 'classwork', questions: [{ questionId: 'a', type: 'multiAnswer' }, { questionId: 'b', type: 'stepAlgebra' }] },
      { id: 'dol', role: 'dol', questions: [{ questionId: 'c', type: 'representationBridge', mode: 'linearMultipleRepresentations' }] },
    ],
  };
  const tracker = { 0: { status: 'correct' }, 1: { status: 'attempted', bestPartialCredit: 50 }, 2: { status: 'unattempted' } };
  assert.equal(splitGrade({ tracker, assignment: legacy }).score, 50, '(1 + 0.5 + 0) / 3 — every question still counts ×1');
  // Pre-Flight reads it without writing a single value.
  const model = buildAssignmentV5PreflightModel({ ...intent([]), sections: legacy.sections });
  assert.ok(model.assignmentV5.sections.flatMap((section) => section.questions).every((question) => question.questionWeight === undefined));
  assert.ok(model.questionValues.notes.some((note) => /created before grade values were set automatically/.test(note)));
  assert.equal(model.questionValues.warnings.some((warning) => /could not measure/.test(warning)), false);
});

test('18. a non-family assignment imports, previews and grades exactly as before, apart from its new values', () => {
  const parsed = parseAssignmentBlueprintText(FINAL_MR);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  assert.deepEqual(model.errors, []);
  const stripped = (questions) => questions.map(({ questionWeight: _w, questionWeightBasis: _b, ...rest }) => rest);
  const before = JSON.parse(FINAL_MR);
  // Recompiling the same file yields the same questions, values aside.
  assert.deepEqual(stripped(parseAssignmentBlueprintText(JSON.stringify(before)).questions), stripped(parsed.questions));
});

test('19. explicit values survive every repair path: content changes, the value does not', () => {
  const original = { questionId: 'q1', type: 'multiAnswer', prompt: 'Old', questionWeight: 3, questionWeightBasis: { source: 'teacher' } };
  const reply = { questionId: 'q1', type: 'multiAnswer', prompt: 'New', answerFields: [{ id: 'a', answer: '2' }] };
  assert.equal(carryQuestionValue(original, reply).questionWeight, 3);
  assert.equal(carryQuestionValue(original, { ...reply, questionWeight: 20 }).questionWeight, 3, 'a reply cannot re-weight');
  assert.equal(preservePlatformOwnedFields(original, reply).questionWeight, 3, 'the repair importer');
  assert.deepEqual(preservePlatformOwnedFields(original, reply).questionWeightBasis, { source: 'teacher' });
  const preflight = replaceQuestionAtFlatIndex({ sections: [{ id: 'cw', role: 'classwork', questions: [original] }] }, 0, reply);
  assert.equal(preflight.sections[0].questions[0].questionWeight, 3, 'the Pre-Flight question repair');
  const audit = fullAssignmentRepair.prepareCommit({
    assignment: { id: 'a1', assignmentRevision: 1, sections: [{ id: 'cw', role: 'classwork', questions: [original] }] },
    request: { repairPacketVersion: 2, repairScope: 'fullAssignmentAudit', assignmentId: 'a1', baseRevision: 1, auditResults: [{ questionId: 'q1', classification: 'assignmentIssue' }], replacements: [{ questionId: 'q1', question: reply }], selectedQuestionIds: ['q1'] },
  });
  assert.equal(audit.assignment.sections[0].questions[0].questionWeight, 3, 'the full-audit content release');
  assert.equal(audit.assignment.sections[0].questions[0].prompt, 'New');
  // Provenance alone is never a "fundamental" change to a question with student work.
  assert.equal(classifyContentQuestionChange(original, { ...original, questionWeightBasis: { source: 'author' } }).classification, 'unchanged');
  assert.equal(classifyContentQuestionChange(original, { ...original, questionWeight: 4 }).classification, 'fundamental', 'the value itself is still compared');
  // An approved weight review records the teacher, and leaves other values' records alone.
  const questions = [
    { ...original, questionWeightBasis: { source: 'author' } },
    { questionId: 'q2', type: 'multiAnswer', questionWeight: 2, questionWeightBasis: { source: 'auto', rule: QUESTION_VALUE_RULE, units: 4 } },
  ];
  const assignment = { id: 'a1' };
  const pack = { kind: 'mathmasterWeightReviewPack', version: 1, assignmentId: 'a1', assignmentFingerprint: assignmentWeightReviewFingerprint({ assignment, questions }), weights: [{ questionId: 'q1', weight: 4, reason: 'more work' }, { questionId: 'q2', weight: 2, reason: 'fine' }] };
  const reviewed = prepareAssignmentWeightReviewPack({ pack, assignment, questions });
  assert.deepEqual(reviewed.questions[0].questionWeightBasis, { source: 'teacher' });
  assert.equal(reviewed.questions[1].questionWeightBasis.source, 'auto');
});

test('20. no double weighting: no section multiplier, and section grades stay within their section', () => {
  const board = parseAssignmentBlueprintText(FINAL_MR).questions.find((question) => question.questionId === 'lmr-cw-1');
  const { questionWeight: _w, questionWeightBasis: _b, ...unvalued } = board;
  for (const role of ['warmup', 'classwork', 'practice', 'dol', 'quiz']) {
    assert.equal(estimateQuestionValue({ ...unvalued, activityRole: role }).value, 4.25, `${role}: the same work is worth the same — Grade Transfer already gives each section its own column`);
  }
  // A question's internal part weights split its own credit; they never change its value.
  const parts = [{ id: 'a', answer: '1' }, { id: 'b', answer: '2' }];
  assert.equal(
    estimateQuestionValue({ type: 'multiAnswer', answerFields: parts.map((part) => ({ ...part, scoreWeight: 9 })) }).value,
    estimateQuestionValue({ type: 'multiAnswer', answerFields: parts }).value,
  );
  // Each section's grade is computed within the section: re-valuing the
  // Classwork never moves the DOL grade a Grade Transfer column reports.
  const assignment = { id: 'x', schemaVersion: 5, sections: [
    { id: 'cw', role: 'classwork', questions: [{ type: 'multiAnswer', questionWeight: 4 }, { type: 'multiAnswer', questionWeight: 1 }] },
    { id: 'dol', role: 'dol', questions: [{ type: 'multiAnswer', questionWeight: 3 }, { type: 'multiAnswer', questionWeight: 1 }] },
  ] };
  const tracker = { 0: { status: 'correct' }, 1: { status: 'unattempted' }, 2: { status: 'unattempted' }, 3: { status: 'correct' } };
  const dolBefore = splitGradesBySection({ tracker, assignment }).dol.score;
  assignment.sections[0].questions[0].questionWeight = 1;
  assert.equal(splitGradesBySection({ tracker, assignment }).dol.score, dolBefore);
  assert.equal(dolBefore, 25, 'within the DOL: 1 of 4 value units');
});

test('the editor suggestion, the compiler and the weight review read ONE rule', () => {
  const board = parseAssignmentBlueprintText(FINAL_MR).questions.find((question) => question.questionId === 'lmr-pr-2');
  assert.equal(suggestedQuestionWeight(board), estimateQuestionValue(board).value);
  assert.equal(suggestedQuestionWeight(board), board.questionWeight);
});

test('coverage: every grading surface has a workload profile, or is not graded', () => {
  const missing = Object.keys(GRADING_MANIFEST).filter((surfaceId) => {
    if (QUESTION_WORK_SURFACES.includes(surfaceId)) return false;
    const declaration = GRADING_MANIFEST[surfaceId];
    const graded = declaration.kind === 'tool'
      ? Object.values(declaration.modes).some((mode) => mode.authority !== 'non-graded-read-only')
      : declaration.authority !== 'non-graded-read-only';
    return graded;
  });
  assert.deepEqual(missing, [], 'add a profile to SURFACE_WORK in functions/shared/questionValue.mjs');
  // The light mirrors of heavy-module constants stay equal to them.
  assert.deepEqual([...LINEAR_BRIDGE_STAGES], [...REPRESENTATION_BRIDGE_STAGES]);
  assert.deepEqual([...LINEAR_CONNECTION_CARD_KINDS], [...LINEAR_CARD_KINDS]);
});

test('an unmeasurable question counts ×1 with source "default", and Pre-Flight says so', () => {
  const question = allocateQuestionValue({ questionId: 'mystery', type: 'notARealType', prompt: '?' });
  assert.equal(question.questionWeight, 1);
  assert.equal(question.questionWeightBasis.source, QUESTION_VALUE_SOURCE.DEFAULT);
  assert.equal(describeQuestionWork({ type: 'notARealType' }).measured, false);
  const audit = auditAssignmentQuestionValues({}, [{ ...question, activityRole: 'practice' }]);
  assert.ok(audit.warnings.some((warning) => /Question 1 \(Practice Q1\): MathMaster could not measure/.test(warning)));
});

test('Pre-Flight flags accidental weighting in a teacher\'s words, without blocking a sound choice', () => {
  const auto = (question) => ({ ...allocateQuestionValue(question), activityRole: 'classwork' });
  const choice = { type: 'multiAnswer', answerFields: [{ id: 'a', type: 'choice', options: [{ id: '1' }, { id: '2' }], answer: '1' }] };
  const typo = { ...choice, questionWeight: 20, questionWeightBasis: { source: 'author' }, activityRole: 'classwork' };
  const audit = auditAssignmentQuestionValues({}, [auto(choice), auto(choice), auto(choice), typo]);
  assert.deepEqual(audit.errors, []);
  assert.ok(audit.warnings.some((warning) => /Question 4 \(Classwork Q4\) counts ×20, which is 87% of the whole assignment grade/.test(warning)), audit.warnings.join('\n'));
  assert.ok(audit.warnings.some((warning) => /Question 4 .* counts ×20, but the work it assesses \(1 choice\) is about ×1/.test(warning)));
  // A deliberate ×2 on a single choice is a judgement, not a typo: no warning.
  const judged = auditAssignmentQuestionValues({}, [auto(choice), { ...choice, questionWeight: 2, questionWeightBasis: { source: 'teacher' }, activityRole: 'classwork' }]);
  assert.deepEqual(judged.warnings, []);
  // Points on a 10-point scale beside automatic ×1 values.
  const points = (value) => ({ ...choice, questionWeight: value, questionWeightBasis: { source: 'author' }, activityRole: 'classwork' });
  const mixed = auditAssignmentQuestionValues({}, [points(10), points(10), auto(choice), auto(choice)]);
  assert.ok(mixed.warnings.some((warning) => /look like points on a larger scale/.test(warning)));
});

test('Pre-Flight: a DOL in which nothing can earn credit is blocked; other sections are warned', () => {
  const review = { type: 'solutionReview2', toolId: 'solutionReview2', questionWeight: 1, questionWeightBasis: { source: 'auto' } };
  const dol = auditAssignmentQuestionValues({}, [{ ...review, activityRole: 'dol' }]);
  assert.ok(dol.errors.some((error) => /DOL has no question MathMaster can grade/.test(error)));
  const practice = auditAssignmentQuestionValues({}, [{ ...review, activityRole: 'practice' }]);
  assert.deepEqual(practice.errors, []);
  assert.ok(practice.warnings.some((warning) => /Practice has no question MathMaster can grade/.test(warning)));
});

test('Pre-Flight: a family whose versions do not all need the same work is named; a templated value is blocked', () => {
  const varying = {
    ...LMR_FAMILY,
    requiredCards: '{{cards}}',
    generator: { ...LMR_FAMILY.generator, parameters: { ...LMR_FAMILY.generator.parameters, cards: { type: 'choice', values: [['slope'], ['slope', 'xIntercept', 'yIntercept', 'graphs']] } } },
  };
  const [slot] = compileAuthoringIntentV5(intent([varying])).package.sections[0].questions;
  const audit = auditAssignmentQuestionValues({}, [{ ...slot, activityRole: 'classwork' }]);
  assert.ok(audit.warnings.some((warning) => /generated versions do not all require the same amount of work/.test(warning)), audit.warnings.join('\n'));

  const [valued] = compileAuthoringIntentV5(intent([LMR_FAMILY])).package.sections[0].questions;
  const templated = auditAssignmentQuestionValues({}, [{ ...valued, questionWeight: '{{m}}', activityRole: 'classwork' }]);
  assert.ok(templated.errors.some((error) => /generated versions do not carry the question's grade value/.test(error)));
  assert.equal(explicitQuestionValue({ questionWeight: '{{m}}' }).problem, 'templated');
});

test('the Multiple Representations values, section by section, are reported in Pre-Flight', () => {
  const parsed = parseAssignmentBlueprintText(FINAL_MR);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  assert.deepEqual(model.questionValues.errors, []);
  assert.deepEqual(model.questionValues.warnings, []);
  assert.deepEqual(model.questionValues.sections.map(({ role, total }) => [role, total]), [['warmup', 4.5], ['classwork', 12.75], ['practice', 9], ['dol', 3.25]]);
  assert.ok(model.questionValues.notes.some((note) => /Warm-Up ×4.5 \(15.3%\) · Classwork ×12.75 \(43.2%\) · Practice ×9 \(30.5%\) · DOL ×3.25 \(11%\)/.test(note)));
});

test('wiring: the Pre-Flight modal lists every value from the model, and the editor says who set each value', async () => {
  const { componentSource, region } = await import('./helpers/sourceContract.mjs');
  const modal = componentSource('src/components/teacher/LessonPreflightModal.jsx');
  const panel = region(modal, 'data-question-value-panel="true"', 'data-tool-contract-panel="true"', 'question value panel');
  assert.match(panel, /preflightModel\.questionValues\.notes\.map/);
  assert.match(panel, /preflightModel\.questionValues\.warnings\.map/);
  assert.match(panel, /preflightModel\.questionValues\.rows\.map\(\(row\)/);
  assert.match(panel, /row\.sentence/);

  const { assignmentQuestionEditorSource } = await import('./helpers/splitComponentSource.mjs');
  const editor = assignmentQuestionEditorSource();
  const setter = region(editor, 'const setQuestionWeight = (index, value', 'const toggleExcluded', 'value setter');
  assert.match(setter, /teacherQuestionValue\(question, nextWeight\)/, 'a typed value is recorded as the teacher\'s');
  assert.match(editor, /title=\{describeQuestionValue\(question\)\.sentence\}/, 'the GRADE badge explains the value');
  const accept = region(editor, 'const acceptRepairReplacement = async (replacement) => {', 'const historicalQuestion', 'repair acceptance');
  assert.match(accept, /carryQuestionValue\(existing, replacement\)/, 'an AI repair keeps the value');
  assert.match(editor, /from '\.\.\/functions\/shared\/questionValue\.mjs'/, 'and every helper is imported');
});
