/*
 * ALGEBRA I HONORS · DISTRICT DOL #3 REVIEW.
 *
 * Algebra I and Algebra I Honors take the same DOL #3 (one SY26-27
 * blueprint), so the Honors review is the regular review's 13 blueprint
 * questions, unchanged, with three Honors questions after them
 * (scripts/content/build-algebra1-dol3-honors.mjs):
 *
 *   14     MathMaster's vetted no-AI Honors extension, in the candle story: a
 *          Multiple Representations board at DOK 3, a different version for
 *          each student, on A.2C with A.3B, A.3C, A.2A and A.2B.
 *   15–16  Two audited CCMR items from MathMaster's bank on the review's
 *          supporting standards: TSIA2 on association against causation
 *          (A.4B), and a Digital SAT challenge item on functions (A.12A).
 *
 * What this holds:
 *   - the committed file is exactly what the builder makes from the regular
 *     review, so the two versions cannot drift apart;
 *   - Pre-Flight: valid with no errors or warnings, and no hint is hidden;
 *   - for an Honors class, Pre-Flight changes nothing. The audited Practice is
 *     already in place, so no blueprint question is swapped for an exam item;
 *     the version is READY and Create accepts it;
 *   - the audited items are the bank's mathematics, untouched, with this
 *     review's supports added (a back-up step, a "Watch out" line, a worked
 *     solution in plain text) and their own numbers for each student;
 *   - the extension deals a class of 30 thirty versions of the candle story.
 *     Each line is worked out here from the numbers the student reads, and
 *     the server marks every version;
 *   - the extension's supports never state an answer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Fraction from 'fraction.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import {
  HONORS_CCMR_DOCUMENTS,
  HONORS_EXTENSION_RECIPE,
  HONORS_EXTENSION_STORY,
  HONORS_FILE,
  REGULAR_FILE,
  honorsFileText,
} from '../../scripts/content/build-algebra1-dol3-honors.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  CCMR_RELEASE_TARGET,
  HONORS_CCMR_STATUS,
  buildHonorsCcmrCandidate,
  confirmHonorsCandidateForCreate,
} from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { HONORS_RECIPE_REGISTRY } from '../../src/platform/rigor/honorsExtensionRecipes.js';
import { getStoredSectionVariantMode } from '../../src/platform/contract/storedAssignmentV5.js';
import { buildQuestionHints, questionAnswerValues } from '../../src/platform/supports/hints/questionHints.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { backUpStepFor, backUpStepWritten } from '../../src/platform/supports/feedback/backUpStep.js';
import { hasAuthoredCommonError, workedSolutionDepth } from '../../src/platform/preflight/solutionReviewPreflight.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { planSeatAdditions, resolveGenerationAllocation, resolveLearnerSeat } from '../../functions/shared/questionGenerationIdentity.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { deriveLinearMultipleRepresentations } from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { correctLinearBoardResponse, oneWrongLinearBoardResponse } from './helpers/linearMultipleRepresentationsResponses.mjs';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const REGULAR = JSON.parse(readFileSync(REGULAR_FILE, 'utf8'));
const TEXT = readFileSync(HONORS_FILE, 'utf8');
const RAW = JSON.parse(TEXT);
const HONORS = compileTeacherImport(TEXT);
const CLASS_SIZE = 30;
const clone = (value) => JSON.parse(JSON.stringify(value));
const keyOf = (question) => JSON.stringify({ id: question.questionId, prompt: question.prompt, type: question.type });
const failing = (result) => JSON.stringify((result.parts || []).filter((part) => !part.isCorrect).map((part) => part.id || part.label));

const reviewed = () => buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(TEXT).assignmentV5, {}));
const honorsCandidate = () => {
  const base = reviewed().assignmentV5;
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
  return { base, candidate: buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null, classSize: CLASS_SIZE }) };
};
const extensionOf = (questions) => questions.find((question) => question.questionId === 'dol3-honors-q14');
const bankDocument = ({ framework, documentId }) => {
  const payload = JSON.parse(readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${bank.FRAMEWORK_FILES[framework]}`, import.meta.url), 'utf8'));
  return (payload.items || payload.documents).find((document) => document.id === documentId);
};

/**
 * A class of 30 seated the way the teacher app seats one, on the reviewed
 * Honors file. `deal(questionId, studentId)` is the version that student is
 * given, under the section's own variant policy.
 */
const seatClass = (id) => {
  const assignment = { ...clone(reviewed().assignmentV5), id, assignedClassIds: ['p4'] };
  const students = Array.from({ length: CLASS_SIZE }, (_, index) => `student-${String(index + 1).padStart(2, '0')}`);
  assignment.generationSeats = { byClassId: { p4: planSeatAdditions({ assignment, classId: 'p4', studentIds: students }) } };
  const sectionMode = getStoredSectionVariantMode(assignment, 'practice');
  const deal = (questionId, studentId) => {
    const questionIndex = assignment.sections[0].questions.findIndex((question) => question.questionId === questionId);
    const slot = assignment.sections[0].questions[questionIndex];
    const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: 'p4' });
    const delivered = resolveFamilyQuestionInstance({
      question: slot,
      assignmentId: assignment.id,
      storageIndex: questionIndex,
      allocation: resolveGenerationAllocation({ sectionMode, seatInfo, variant: 0 }),
    });
    assert.equal(delivered.error, null, `${questionId} · ${studentId}`);
    assert.equal(JSON.stringify(delivered.question).includes('{{'), false, `${questionId} · ${studentId}: no unfilled token reaches the student`);
    return { slot, questionIndex, delivered, version: delivered.question };
  };
  return { assignment, students, sectionMode, deal };
};
const stringsOf = (value) => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(stringsOf) : value && typeof value === 'object' ? Object.values(value).flatMap(stringsOf) : []);

/* ------------------------------------------------------------ the file -- */

test('the committed Honors file is exactly what the builder makes from the regular review', () => {
  assert.equal(TEXT, honorsFileText(REGULAR), 'rebuild it: node scripts/content/build-algebra1-dol3-honors.mjs');
});

test('Pre-Flight: valid with no errors or warnings, and no teacher-written hint is hidden', () => {
  assert.equal(HONORS.model.isValid, true);
  assert.deepEqual(HONORS.model.errors, []);
  assert.deepEqual(HONORS.model.warnings || [], []);
  assert.deepEqual(HONORS.semantic.errors, []);
  assert.deepEqual(HONORS.model.hiddenHints?.warnings || [], []);
  assert.deepEqual(HONORS.model.hintAnswers?.warnings || [], []);
});

test('questions 1–13 are the regular review\'s, unchanged, so the blueprint is the same: two of each readiness standard, one of each supporting standard', () => {
  assert.equal(RAW.sections.length, 1);
  const [practice] = RAW.sections;
  assert.equal(practice.role, 'practice');
  assert.deepEqual(practice.questions.slice(0, 13), REGULAR.sections[0].questions);
  const { questions: _, ...policy } = practice;
  const { questions: __, ...regularPolicy } = REGULAR.sections[0];
  assert.deepEqual([policy.attemptsAllowed, policy.hintsAllowed, policy.feedbackMode], [regularPolicy.attemptsAllowed, regularPolicy.hintsAllowed, regularPolicy.feedbackMode]);

  assert.equal(HONORS.questions.length, 16, 'every question survives the import');
  const BLUEPRINT = { 'A.2A': 2, 'A.2C': 2, 'A.3B': 2, 'A.3C': 2, 'A.2B': 1, 'A.4B': 1, 'A.4C': 1, 'A.12A': 1, 'A.12C': 1 };
  const counts = {};
  HONORS.questions.slice(0, 13).forEach((question) => {
    const [primary] = question.alignments.filter((alignment) => alignment.role === 'primary');
    counts[primary.code] = (counts[primary.code] || 0) + 1;
  });
  assert.deepEqual(counts, BLUEPRINT);
  // Each blueprint question counts one; the extension is a whole board and counts two.
  HONORS.questions.forEach((question) => (
    assert.equal(Number(question.questionWeight), question.questionId === 'dol3-honors-q14' ? 2 : 1, question.questionId)
  ));
});

test('question 14 is MathMaster\'s vetted DOK 3 extension in a story the review has not told; 15 and 16 are the bank\'s audited items on the review\'s A.4B and A.12A, with this review\'s supports', () => {
  const [extension, ...audited] = HONORS.questions.slice(13);
  const recipe = HONORS_RECIPE_REGISTRY.find((entry) => entry.id === HONORS_EXTENSION_RECIPE);
  assert.ok(recipe, 'the recipe is still registered');
  assert.equal(extension.questionId, 'dol3-honors-q14');
  assert.deepEqual(extension.questionFamily, { id: recipe.target.familyId, version: recipe.target.familyVersion, constraints: recipe.target.constraints });
  assert.deepEqual([extension.type, extension.mode], [recipe.target.toolId, recipe.target.mode]);
  assert.equal(extension.prompt, recipe.question.prompt);
  assert.deepEqual([extension.dok, extension.difficultyBand], [recipe.rigor.dok, recipe.rigor.difficultyBand]);
  const blueprint = HONORS.questions.slice(0, 13);
  assert.equal(extension.dok, Math.max(...blueprint.map((question) => Number(question.dok))), 'at the review\'s deepest DOK');
  assert.ok(extension.difficultyBand > Math.max(...blueprint.map((question) => Number(question.difficultyBand))), 'and harder than any blueprint question');
  assert.deepEqual(extension.alignments.map((alignment) => alignment.code).sort(), ['A.2A', 'A.2B', 'A.2C', 'A.3B', 'A.3C']);
  const story = recipe.stories.find((entry) => entry.id === HONORS_EXTENSION_STORY);
  assert.equal(extension.source.prompt, story.source.prompt);
  // Question 1 is a phone battery and question 8 a draining tank: the
  // recipe's other two stories.
  assert.match(REGULAR.sections[0].questions[0].prompt, /battery/);
  assert.match(REGULAR.sections[0].questions[7].prompt, /tank/);
  assert.doesNotMatch(REGULAR.sections[0].questions.map((question) => question.prompt).join(' '), /candle burns down/);

  const blueprintTeks = new Set(HONORS.questions.slice(0, 13).flatMap((question) => question.alignments.map((alignment) => alignment.code)));
  assert.equal(audited.length, HONORS_CCMR_DOCUMENTS.length);
  audited.forEach((question, index) => {
    const reference = HONORS_CCMR_DOCUMENTS[index];
    const label = reference.documentId;
    assert.equal(question.questionId, reference.questionId);
    assert.equal(question.ccmrSource.source, 'auditedBank');
    assert.equal(question.ccmrSource.releaseTarget, CCMR_RELEASE_TARGET);
    assert.equal(question.ccmrSource.documentId, reference.documentId);
    assert.equal(question.assessmentContext.framework, reference.framework);
    const teks = bank.questionTeksCodes(question);
    assert.ok(teks.includes(reference.teks), `${label} is on ${reference.teks}`);
    assert.ok(blueprintTeks.has(reference.teks), 'a TEKS the review teaches');

    // The bank's mathematics, untouched: prompt, answer, generator, alignments, provenance.
    // A choice field also carries this review's reason for each option
    // (FB05), a support like the back-up step; the rest of it is the bank's.
    const converted = JSON.parse(JSON.stringify(bank.bankDocumentToV5Intent(bankDocument(reference), { activityRole: 'practice' })));
    const written = RAW.sections[0].questions[14 + index];
    const bankPart = (key, value) => (key === 'answerFields' ? value.map(({ optionRationales: _reasons, ...field }) => field) : value);
    Object.keys(converted).filter((key) => !['activityRole', 'questionId', 'solutionReview'].includes(key)).forEach((key) => (
      assert.deepEqual(bankPart(key, written[key]), converted[key], `${label}: ${key} is the bank's`)
    ));
    // Its worked solution is the bank's, with the $…$ markup unwrapped, and the
    // usual mistake named whether or not the bank names one.
    Object.entries(converted.solutionReview || {}).forEach(([key, value]) => {
      const plain = (text) => text.replace(/\$/g, '');
      assert.deepEqual(written.solutionReview[key], Array.isArray(value) ? value.map(plain) : plain(value), `${label}: solution ${key}`);
    });
    assert.ok(hasAuthoredCommonError(question), `${label} names the usual mistake`);
    stringsOf(written.solutionReview).forEach((text) => assert.doesNotMatch(text, /[$\\]/, `${label}: plain text`));
    assert.equal(workedSolutionDepth(question), 'steps');
    // Added for this review, as for every question in it.
    const step = backUpStepFor(question);
    assert.ok(backUpStepWritten(step) && step.source === 'authored', `${label}: a back-up step written for it`);
    assert.equal(step.options.length, 2);
    assert.ok(step.options.includes(step.correct));
    assert.deepEqual(written.questionFamily, { scope: 'assignment' }, `${label}: its own numbers for each student`);
    assert.equal(written.questionWeight, 1);
  });
});

/* ------------------------------------------------------- an Honors class -- */

test('for an Honors class Pre-Flight changes nothing: no blueprint question is swapped, the version is READY, and it meets the Honors contract', () => {
  const { base, candidate } = honorsCandidate();
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
  assert.equal(candidate.model.isValid, true, candidate.errors.join('\n'));
  assert.deepEqual(candidate.model.warnings || [], []);
  assert.equal(candidate.honorsReport.isHonorsReady, true);
  assert.deepEqual(candidate.honorsReport.missing, []);
  assert.equal(candidate.honorsReport.depthCount, 4, 'DOK 3 reasoning, representations, justification and modeling');
  // 16 Practice questions: round(16 × 0.15) = 2, met by the two audited items already there.
  assert.equal(candidate.targetCount, 2);
  assert.equal(candidate.sourcedCount, 2);
  assert.deepEqual(candidate.sourced || [], [], 'nothing was sourced in place of a question');
  const flat = (assignment) => assignment.sections.flatMap((section) => section.questions);
  assert.deepEqual(flat(candidate.assignmentV5).map(keyOf), flat(base).map(keyOf), 'the Honors class gets exactly this file');
});

test('Pre-Flight says the Honors version can be created, and Create accepts exactly the object it previewed', () => {
  const { base, candidate } = honorsCandidate();
  const readiness = summarizePreflightReadiness({
    blockers: collectReviewBlockers({
      draft: { title: 'Algebra I Honors — DOL #3 Review', assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
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

/* ------------------------------------------------------ the audited items -- */

// The A.12A item as the student reads it: three pairs, the first and third
// sharing an input.
const RELATION = /^The relation contains \$\((-?\d+),(-?\d+)\)\$, \$\((-?\d+),(-?\d+)\)\$, and \$\((-?\d+),k\)\$\. What value of \$k\$ makes the relation a function\?$/;

test('the audited items give each student their own numbers, and every A.12A version\'s key is the output its repeated input already has', () => {
  const { students, sectionMode, deal } = seatClass('asg-dol3-honors-ccmr');
  assert.equal(sectionMode, 'personalized');
  const relations = new Set();
  const samples = new Set();
  for (const studentId of students) {
    const { version: relation } = deal('dol3-honors-q16', studentId);
    const match = RELATION.exec(relation.prompt);
    assert.ok(match, `${studentId}: ${relation.prompt}`);
    const [x, y, u, , repeated] = match.slice(1).map(Number);
    assert.equal(repeated, x, `${studentId}: the third pair repeats the first pair's input`);
    assert.notEqual(u, x, `${studentId}: the second pair has its own input`);
    const [field] = relation.answerFields;
    assert.equal(field.inputProfile, 'number', `${studentId}: a number box, never a set box`);
    assert.ok(matchesFieldAnswer(String(y), field), `${studentId}: k = ${y}, the output ${x} already has`);
    assert.ok(!matchesFieldAnswer(String(y + 1), field), `${studentId}: any other k gives ${x} two outputs`);
    relations.add(relation.prompt);

    const { version: claim } = deal('dol3-honors-q15', studentId);
    const [choice] = claim.answerFields;
    assert.ok(matchesFieldAnswer(choice.options.find((option) => /association, but they do not establish/.test(option)), choice), studentId);
    assert.ok(!matchesFieldAnswer(choice.options.find((option) => /prove that higher X causes/.test(option)), choice), studentId);
    samples.add(claim.prompt);
  }
  assert.ok(relations.size >= CLASS_SIZE / 2, `the relations vary across the class (${relations.size})`);
  assert.ok(samples.size > 1, `the observational studies vary across the class (${samples.size})`);
});

/* ---------------------------------------------------------- the extension -- */

// The candle story, as the student reads it.
const CANDLE = /^A candle burns down at a constant rate of (\d+) centimeters every (\d+) hours\. (\d+) hours after it is lit, the candle is (\d+) centimeters tall\./;

test('the extension deals a class of 30 thirty versions of the candle story; each line is worked out from the numbers the student reads, and the server marks it', () => {
  const { assignment, students, sectionMode, deal } = seatClass('asg-dol3-honors');
  assert.equal(sectionMode, 'personalized', 'each student gets their own numbers');
  const fingerprints = new Set();
  for (const studentId of students) {
    const { slot, questionIndex, delivered, version } = deal('dol3-honors-q14', studentId);
    fingerprints.add(delivered.instance.fingerprint);

    // The line, from the story's own numbers: the candle loses rate/per
    // centimeters an hour, and the reading at readTime hours is readAmount,
    // so it started at readAmount + (rate/per)·readTime and is gone when that
    // height has burned away.
    const match = CANDLE.exec(version.source.prompt);
    assert.ok(match, `${studentId}: the candle story (${version.source.prompt})`);
    const [rate, per, readTime, readAmount] = match.slice(1).map(Number);
    const unitRate = new Fraction(rate, per);
    const start = unitRate.mul(readTime).add(readAmount);
    const { canonicalLine } = deriveLinearMultipleRepresentations(version);
    assert.ok(new Fraction(canonicalLine.m).equals(unitRate.neg()), `${studentId}: slope −${rate}/${per}`);
    assert.ok(new Fraction(canonicalLine.b).equals(start), `${studentId}: the candle started ${start.toFraction()} cm tall`);
    assert.equal(unitRate.d > 1, true, `${studentId}: a genuinely fractional rate`);
    assert.equal(start.equals(readAmount), false, `${studentId}: the reading is not the start`);

    // The server rebuilds the student's version and marks it as the browser does.
    const right = gradeToolWork({ toolId: version.type, question: version, work: correctLinearBoardResponse(version) });
    assert.equal(right.isCorrect, true, `${studentId}: ${failing(right)}`);
    const forGrading = resolveServerGradingQuestion({ assignment, question: slot, questionIndex, variantIndex: 0, claimedDelivery: delivered.delivery, studentId, classId: 'p4' });
    assert.equal(forGrading.question.familyInstance.fingerprint, delivered.instance.fingerprint, `${studentId}: the server's version is the student's`);
    assert.equal(gradeServerResponse({ question: forGrading.question, response: right.toolResponse }).isCorrect, true, `${studentId}: the server credits a complete board`);
    const wrong = gradeToolWork({ toolId: version.type, question: version, work: oneWrongLinearBoardResponse(version) });
    assert.equal(wrong.isCorrect, false, `${studentId}: one wrong card is not credited`);
  }
  assert.equal(fingerprints.size, CLASS_SIZE, 'every student has their own version');
});

test('the extension\'s three hints, back-up step and worked solution never state an answer, on any version', () => {
  const extension = extensionOf(HONORS.questions);
  const step = backUpStepFor(extension);
  assert.ok(backUpStepWritten(step), `a written back-up step (${step.source})`);
  assert.equal(step.options.length, 2);
  assert.ok(step.options.includes(step.correct));
  assert.equal(workedSolutionDepth(extension), 'steps');
  assert.ok(hasAuthoredCommonError(extension));

  const { students, deal } = seatClass('asg-dol3-honors-supports');
  for (const studentId of students) {
    const { version } = deal('dol3-honors-q14', studentId);
    // The three written for the candle come first; the board's own family
    // hints follow them.
    const shown = buildQuestionHints(version).map((hint) => hint.text);
    assert.deepEqual(shown.slice(0, 3), extension.hints, `${studentId}: all three hints are shown, first`);
    const answers = questionAnswerValues(version);
    assert.ok(answers.length > 0, `${studentId}: the version has answers to guard`);
    shown.forEach((text) => assert.equal(hintRevealsAnswer(text, answers), false, `${studentId}: hint "${text}" states an answer`));
    const supports = [...extension.hints, step.prompt, ...step.options, ...version.solutionReview.reasoning, version.solutionReview.commonError];
    supports.forEach((text) => assert.equal(hintRevealsAnswer(text, answers), false, `${studentId}: "${text}" states an answer`));
    // No number a version could make an answer: the one digit is the 0 of the
    // equation the student solves for the x-intercept.
    assert.doesNotMatch(supports.join(' ').replace(/0 = mx \+ b/g, ''), /\d/, studentId);
  }
});
