/*
 * ALGEBRA I HONORS · DISTRICT DOL #4 REVIEW.
 *
 * Algebra I and Algebra I Honors take the same DOL #4 (one SY26-27
 * blueprint), so the Honors review is the regular review's 13 blueprint
 * questions, unchanged, with three Honors questions after them
 * (scripts/content/build-algebra1-dol4-honors.mjs):
 *
 *   14     MathMaster's vetted no-AI Honors extension, in the battery story: a
 *          Multiple Representations board at DOK 3, a different version for
 *          each student, on A.2C with A.3C, A.2A, A.2B and A.3B.
 *   15–16  Two audited CCMR items from MathMaster's bank on the review's
 *          supporting standards: a Digital SAT challenge item on a line moved
 *          sideways as a line moved up or down (A.3E), and one on predicting
 *          from a fitted model whose slope must first be recovered (A.4C).
 *
 * What this holds:
 *   - the committed file is exactly what the builder makes from the regular
 *     review, so the two versions cannot drift apart;
 *   - Pre-Flight: valid with no errors or warnings, and no hint is hidden;
 *   - for an Honors class, Pre-Flight changes nothing. The audited Practice is
 *     already in place, so no blueprint question is swapped for an exam item
 *     (the regular review would lose questions 9 and 10); the version is
 *     READY and Create accepts it;
 *   - the audited items are the bank's mathematics, untouched, with this
 *     review's supports added, and their own numbers for each student. Each
 *     version's key is worked out here from the numbers the student reads,
 *     and every option of the one-try choice finds its reason;
 *   - the extension deals a class of 30 thirty versions of the battery story.
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
  EXTENSION_ANCHOR_TYPE,
  HONORS_CCMR_DOCUMENTS,
  HONORS_EXTENSION_ID,
  HONORS_EXTENSION_RECIPE,
  HONORS_EXTENSION_STORY,
  HONORS_FILE,
  HONORS_TITLE,
  REGULAR_FILE,
  honorsFileText,
} from '../../scripts/content/build-algebra1-dol4-honors.mjs';
import { plainSolutionText } from '../../scripts/content/build-algebra1-dol3-honors.mjs';
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
import {
  HONORS_RECIPE_REGISTRY,
  HONORS_RECIPE_STATUS,
  HONORS_RECIPE_UNAVAILABLE,
  selectHonorsExtensionRecipe,
} from '../../src/platform/rigor/honorsExtensionRecipes.js';
import { getStoredSectionVariantMode } from '../../src/platform/contract/storedAssignmentV5.js';
import { buildQuestionHints, questionAnswerValues } from '../../src/platform/supports/hints/questionHints.js';
import { chosenOptionReasons, optionRationaleProblems } from '../../src/platform/supports/feedback/oneTryChoice.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { backUpStepFor, backUpStepWritten } from '../../src/platform/supports/feedback/backUpStep.js';
import { hasAuthoredCommonError, workedSolutionDepth } from '../../src/platform/preflight/solutionReviewPreflight.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { planSeatAdditions, resolveGenerationAllocation, resolveLearnerSeat } from '../../functions/shared/questionGenerationIdentity.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { isChoiceOnlyQuestion } from '../../functions/shared/attemptPolicy.mjs';
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
const signed = (text) => Number(String(text).replace(/−/g, '-'));

const reviewed = () => buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(TEXT).assignmentV5, {}));
const honorsCandidate = (text = TEXT) => {
  const base = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(text).assignmentV5, {})).assignmentV5;
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
  return { base, candidate: buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null, classSize: CLASS_SIZE }) };
};
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
  const assignment = { ...clone(reviewed().assignmentV5), id, assignedClassIds: ['p2'] };
  const students = Array.from({ length: CLASS_SIZE }, (_, index) => `student-${String(index + 1).padStart(2, '0')}`);
  assignment.generationSeats = { byClassId: { p2: planSeatAdditions({ assignment, classId: 'p2', studentIds: students }) } };
  const sectionMode = getStoredSectionVariantMode(assignment, 'practice');
  const deal = (questionId, studentId) => {
    const questionIndex = assignment.sections[0].questions.findIndex((question) => question.questionId === questionId);
    const slot = assignment.sections[0].questions[questionIndex];
    const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: 'p2' });
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
  assert.equal(TEXT, honorsFileText(REGULAR), 'rebuild it: node scripts/content/build-algebra1-dol4-honors.mjs');
});

test('Pre-Flight: valid with no errors or warnings, and no teacher-written hint is hidden', () => {
  assert.equal(HONORS.model.isValid, true);
  assert.deepEqual(HONORS.model.errors, []);
  assert.deepEqual(HONORS.model.warnings || [], []);
  assert.deepEqual(HONORS.semantic.errors, []);
  assert.deepEqual(HONORS.model.hiddenHints?.warnings || [], []);
  assert.deepEqual(HONORS.model.hintAnswers?.warnings || [], []);
  assert.deepEqual(HONORS.model.attemptFeedback?.warnings || [], []);
  assert.equal(RAW.assignment.title, HONORS_TITLE);
});

test('questions 1–13 are the regular review\'s, unchanged, so the blueprint is the same; the Honors questions follow them', () => {
  assert.equal(RAW.sections.length, 1);
  const [practice] = RAW.sections;
  assert.equal(practice.role, 'practice');
  assert.deepEqual(practice.questions.slice(0, 13), REGULAR.sections[0].questions);
  const { questions: _, ...policy } = practice;
  const { questions: __, ...regularPolicy } = REGULAR.sections[0];
  assert.deepEqual([policy.attemptsAllowed, policy.hintsAllowed, policy.feedbackMode], [regularPolicy.attemptsAllowed, regularPolicy.hintsAllowed, regularPolicy.feedbackMode]);

  assert.equal(HONORS.questions.length, 16, 'every question survives the import');
  const primaries = HONORS.questions.slice(0, 13).map((question) => question.alignments.find((alignment) => alignment.role === 'primary').code);
  assert.deepEqual(primaries, ['A.2A', 'A.2A', 'A.2C', 'A.2C', 'A.2C', 'A.3C', 'A.3C', 'A.5A', 'A.5A', 'A.5A', 'A.3E', 'A.4C', 'A.12C']);
  // Each blueprint question counts one; the extension is a whole board and counts two.
  HONORS.questions.forEach((question) => (
    assert.equal(Number(question.questionWeight), question.questionId === HONORS_EXTENSION_ID ? 2 : 1, question.questionId)
  ));
  // The instructions name the one question with a single try.
  assert.equal(HONORS.questions.filter(isChoiceOnlyQuestion).map((question) => question.questionId).join(), 'dol4-honors-q15');
  assert.match(RAW.assignment.instructions, /except question 15, a multiple-choice question with one try/);
});

test('question 14 is MathMaster\'s vetted DOK 3 extension, built from the review\'s own Multiple Representations boards, in a story the review has not told', () => {
  const extension = HONORS.questions[13];
  const recipe = HONORS_RECIPE_REGISTRY.find((entry) => entry.id === HONORS_EXTENSION_RECIPE);
  assert.ok(recipe, 'the recipe is still registered');
  assert.equal(extension.questionId, HONORS_EXTENSION_ID);
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
  // Question 4 drains a pool, which the recipe's tank story would repeat; no
  // question in the review is about a battery.
  assert.match(REGULAR.sections[0].questions[3].prompt, /drains a pool/);
  assert.doesNotMatch(REGULAR.sections[0].questions.map((question) => question.prompt).join(' '), /battery/i);

  // Why it is built from the boards: given every question, the selector
  // anchors on the first of four concepts tied at two questions, the domain
  // and range read from a graph, which has no vetted extension. The review's
  // boards are questions 4 and 6, and they anchor the recipe.
  const reviewedRegular = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(JSON.stringify(REGULAR)).assignmentV5, {}));
  const fromEverything = selectHonorsExtensionRecipe({ questions: reviewedRegular.questions, assignmentCourseId: 'algebra1' });
  assert.deepEqual([fromEverything.status, fromEverything.code, fromEverything.anchor?.questionId], [HONORS_RECIPE_STATUS.UNAVAILABLE, HONORS_RECIPE_UNAVAILABLE.NO_VETTED_RECIPE, 'dol4-review-q01']);
  const boards = reviewedRegular.questions.filter((question) => question.type === EXTENSION_ANCHOR_TYPE);
  assert.deepEqual(boards.map((question) => question.questionId), ['dol4-review-q04', 'dol4-review-q06']);
  assert.equal(selectHonorsExtensionRecipe({ questions: boards, assignmentCourseId: 'algebra1' }).recipe.id, HONORS_EXTENSION_RECIPE);
});

test('questions 15 and 16 are the bank\'s audited items on the review\'s A.3E and A.4C, untouched, with this review\'s supports', () => {
  const audited = HONORS.questions.slice(14);
  const blueprintTeks = new Set(HONORS.questions.slice(0, 13).flatMap((question) => question.alignments.map((alignment) => alignment.code)));
  assert.equal(audited.length, HONORS_CCMR_DOCUMENTS.length);
  assert.deepEqual(HONORS_CCMR_DOCUMENTS.map((reference) => reference.teks), ['A.3E', 'A.4C']);
  audited.forEach((question, index) => {
    const reference = HONORS_CCMR_DOCUMENTS[index];
    const label = reference.documentId;
    assert.equal(question.questionId, reference.questionId);
    assert.equal(question.ccmrSource.source, 'auditedBank');
    assert.equal(question.ccmrSource.releaseTarget, CCMR_RELEASE_TARGET);
    assert.equal(question.ccmrSource.documentId, reference.documentId);
    assert.equal(question.assessmentContext.framework, reference.framework);
    assert.equal(question.dok, 3, `${label}: a DOK 3 challenge item`);
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
    // Its worked solution is the bank's in plain text, and the usual mistake is
    // named whether or not the bank names one.
    Object.entries(converted.solutionReview || {}).forEach(([key, value]) => {
      assert.deepEqual(written.solutionReview[key], Array.isArray(value) ? value.map(plainSolutionText) : plainSolutionText(value), `${label}: solution ${key}`);
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
  // The one-try choice has a reason for every option, and no wrong option's reason states the answer.
  const choice = audited[0];
  assert.deepEqual(optionRationaleProblems(choice), []);
  const [field] = choice.answerFields;
  field.options.filter((option) => option !== field.answer).forEach((option) => (
    assert.ok(!field.optionRationales[option].includes(field.answer), `the reason for ${option} does not state the answer`)
  ));
});

test('the plain-text worked solutions turn the bank\'s fractions into top/bottom, and refuse markup they cannot rewrite', () => {
  assert.equal(plainSolutionText('$m=\\frac{{{mx0}}}{{{x0}}}={{m0}}$'), 'm={{mx0}}/{{x0}}={{m0}}');
  assert.equal(plainSolutionText('$\\frac{{{y2}}-{{y1|paren}}}{{{x2}}-{{x1}}}$'), '({{y2}}-{{y1|paren}})/({{x2}}-{{x1}})');
  assert.equal(plainSolutionText('$x \\le 5$'), 'x ≤ 5');
  assert.throws(() => plainSolutionText('$\\sqrt{x}$'), /will not rewrite/);
  assert.throws(() => plainSolutionText('$x$ and $y'), /unpaired/);
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

  // The regular review assigned to an Honors class would lose two blueprint
  // questions, 9 and 10, to SAT equation items: why the audited items are in the file.
  const regular = honorsCandidate(JSON.stringify(REGULAR)).candidate;
  assert.deepEqual((regular.sourced || []).map((entry) => entry.replacedQuestionId).sort(), ['dol4-review-q09', 'dol4-review-q10']);
});

test('Pre-Flight says the Honors version can be created, and Create accepts exactly the object it previewed', () => {
  const { base, candidate } = honorsCandidate();
  const readiness = summarizePreflightReadiness({
    blockers: collectReviewBlockers({
      draft: { title: HONORS_TITLE, assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
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

// The A.3E item as the student reads it: f(x) = mx + b and g(x) = f(x − h).
const SHIFT = /^For the linear function \$f\(x\)=(-?\d+)x ([+-]) (\d+)\$, the function \$g\(x\)=f\(x-(\d+)\)\$\. For what value of \$k\$ is \$g\(x\)=f\(x\)\+k\$ for every \$x\$\?$/;
// The A.4C item: the model's intercept, one prediction, and where to predict next.
const MODEL = /^A fitted linear model has the form \$y=mx ([+-]) (\d+)\$\. The model predicts \$y=(-?\d+)\$ when \$x=(\d+)\$\. If \$m\$ is an integer, what value does the model predict when \$x=(\d+)\$\?$/;
const optionValue = (option) => signed(String(option).replace(/\$/g, ''));

test('the audited items give each student their own numbers; every key is worked out from the numbers the student reads, and every option finds its reason', () => {
  const { students, sectionMode, deal } = seatClass('asg-dol4-honors-ccmr');
  assert.equal(sectionMode, 'personalized');
  const shifts = new Set();
  const models = new Set();
  for (const studentId of students) {
    // A.3E: g(x) = m(x − h) + b = f(x) − mh, so k = −mh for every x.
    const { version: shift } = deal('dol4-honors-q15', studentId);
    const match = SHIFT.exec(shift.prompt);
    assert.ok(match, `${studentId}: ${shift.prompt}`);
    const [m, sign, size, h] = [Number(match[1]), match[2], Number(match[3]), Number(match[4])];
    const b = sign === '-' ? -size : size;
    const k = -m * h;
    [-3, 0, 2, 7].forEach((x) => assert.equal(m * (x - h) + b, m * x + b + k, `${studentId}: g(${x}) = f(${x}) + k`));
    const [choice] = shift.answerFields;
    assert.equal(new Set(choice.options.map(optionValue)).size, 4, `${studentId}: four different options`);
    choice.options.forEach((option) => {
      assert.equal(matchesFieldAnswer(option, choice), optionValue(option) === k, `${studentId}: ${option} (k = ${k})`);
      const [reason] = chosenOptionReasons({ question: shift, parts: [{ id: choice.id, response: String(option), isCorrect: null }] });
      assert.ok(reason, `${studentId}: ${option} finds its reason`);
      assert.doesNotMatch(reason.rationale, /\{\{|\}\}/, `${studentId}: the reason carries this version's numbers`);
    });
    shifts.add(shift.prompt);

    // A.4C: the one prediction gives m = (y0 − b)/x0, a whole number; then y = m·x1 + b.
    const { version: model } = deal('dol4-honors-q16', studentId);
    const found = MODEL.exec(model.prompt);
    assert.ok(found, `${studentId}: ${model.prompt}`);
    const [intercept, y0, x0, x1] = [(found[1] === '-' ? -1 : 1) * Number(found[2]), Number(found[3]), Number(found[4]), Number(found[5])];
    const slope = new Fraction(y0 - intercept, x0);
    assert.equal(Number(slope.d), 1, `${studentId}: the slope is a whole number`);
    const predicted = slope.mul(x1).add(intercept).valueOf();
    const [answer] = model.answerFields;
    assert.equal(answer.inputProfile, 'number', `${studentId}: a typed number, not a choice`);
    assert.ok(matchesFieldAnswer(String(predicted), answer), `${studentId}: y = ${predicted} at x = ${x1}`);
    assert.ok(!matchesFieldAnswer(String(slope.mul(x1).valueOf()), answer), `${studentId}: the intercept left out`);
    assert.ok(!matchesFieldAnswer(String(new Fraction(y0, x0).mul(x1).add(intercept).valueOf()), answer) || intercept === 0, `${studentId}: y0 ÷ x0 taken for the slope`);
    models.add(model.prompt);
  }
  assert.ok(shifts.size >= CLASS_SIZE / 2, `the lines vary across the class (${shifts.size})`);
  assert.ok(models.size >= CLASS_SIZE / 2, `the models vary across the class (${models.size})`);
});

/* ---------------------------------------------------------- the extension -- */

// The battery story, as the student reads it.
const BATTERY = /^While a phone streams a video, its battery charge drops at a constant rate of (\d+) percentage points every (\d+) minutes\. (\d+) minutes after the video starts, the battery is at (\d+)%\./;

test('the extension deals a class of 30 thirty versions of the battery story; each line is worked out from the numbers the student reads, and the server marks it', () => {
  const { assignment, students, sectionMode, deal } = seatClass('asg-dol4-honors');
  assert.equal(sectionMode, 'personalized', 'each student gets their own numbers');
  const fingerprints = new Set();
  for (const studentId of students) {
    const { slot, questionIndex, delivered, version } = deal(HONORS_EXTENSION_ID, studentId);
    fingerprints.add(delivered.instance.fingerprint);

    // The line, from the story's own numbers: the charge drops rate/per
    // percentage points a minute, and the reading at readTime minutes is
    // readAmount, so it started at readAmount + (rate/per)·readTime and is
    // empty when that charge has drained away.
    const match = BATTERY.exec(version.source.prompt);
    assert.ok(match, `${studentId}: the battery story (${version.source.prompt})`);
    const [rate, per, readTime, readAmount] = match.slice(1).map(Number);
    const unitRate = new Fraction(rate, per);
    const start = unitRate.mul(readTime).add(readAmount);
    const { canonicalLine } = deriveLinearMultipleRepresentations(version);
    assert.ok(new Fraction(canonicalLine.m).equals(unitRate.neg()), `${studentId}: slope −${rate}/${per}`);
    assert.ok(new Fraction(canonicalLine.b).equals(start), `${studentId}: the battery started at ${start.toFraction()}%`);
    assert.equal(unitRate.d > 1, true, `${studentId}: a genuinely fractional rate`);
    assert.equal(start.equals(readAmount), false, `${studentId}: the reading is not the start`);
    assert.ok(start.compare(100) <= 0, `${studentId}: a battery cannot start above 100%`);

    // The server rebuilds the student's version and marks it as the browser does.
    const right = gradeToolWork({ toolId: version.type, question: version, work: correctLinearBoardResponse(version) });
    assert.equal(right.isCorrect, true, `${studentId}: ${failing(right)}`);
    const forGrading = resolveServerGradingQuestion({ assignment, question: slot, questionIndex, variantIndex: 0, claimedDelivery: delivered.delivery, studentId, classId: 'p2' });
    assert.equal(forGrading.question.familyInstance.fingerprint, delivered.instance.fingerprint, `${studentId}: the server's version is the student's`);
    assert.equal(gradeServerResponse({ question: forGrading.question, response: right.toolResponse }).isCorrect, true, `${studentId}: the server credits a complete board`);
    const wrong = gradeToolWork({ toolId: version.type, question: version, work: oneWrongLinearBoardResponse(version) });
    assert.equal(wrong.isCorrect, false, `${studentId}: one wrong card is not credited`);
  }
  assert.equal(fingerprints.size, CLASS_SIZE, 'every student has their own version');
});

test('the extension\'s three hints, back-up step, advice and worked solution never state an answer, on any version', () => {
  const extension = HONORS.questions.find((question) => question.questionId === HONORS_EXTENSION_ID);
  const written = RAW.sections[0].questions[13];
  const step = backUpStepFor(extension);
  assert.ok(backUpStepWritten(step), `a written back-up step (${step.source})`);
  assert.equal(step.options.length, 2);
  assert.ok(step.options.includes(step.correct));
  assert.equal(workedSolutionDepth(extension), 'steps');
  assert.ok(hasAuthoredCommonError(extension));
  assert.equal(written.attemptFeedback.length, 2);

  const { students, deal } = seatClass('asg-dol4-honors-supports');
  for (const studentId of students) {
    const { version } = deal(HONORS_EXTENSION_ID, studentId);
    // The three written for the battery come first; the board's own family
    // hints follow them.
    const shown = buildQuestionHints(version).map((hint) => hint.text);
    assert.deepEqual(shown.slice(0, 3), extension.hints, `${studentId}: all three hints are shown, first`);
    const answers = questionAnswerValues(version);
    assert.ok(answers.length > 0, `${studentId}: the version has answers to guard`);
    shown.forEach((text) => assert.equal(hintRevealsAnswer(text, answers), false, `${studentId}: hint "${text}" states an answer`));
    const supports = [...extension.hints, step.prompt, ...step.options, ...written.attemptFeedback, ...version.solutionReview.reasoning, version.solutionReview.commonError];
    supports.forEach((text) => assert.equal(hintRevealsAnswer(text, answers), false, `${studentId}: "${text}" states an answer`));
    // No number a version could make an answer: the one digit is the 0 of the
    // equation the student solves for the x-intercept.
    assert.doesNotMatch(supports.join(' ').replace(/0 = mx \+ b/g, ''), /\d/, studentId);
  }
});
