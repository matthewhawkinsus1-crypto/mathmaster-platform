/*
 * ALGEBRA I HONORS · DISTRICT DOL #4 MAKEUP.
 *
 * Algebra I and Algebra I Honors take the same DOL #4, so the Honors makeup is
 * the regular makeup's 13 questions, unchanged, with three Honors questions
 * after them (scripts/content/build-algebra1-dol4-makeup-honors.mjs):
 *
 *   14     MathMaster's vetted no-AI Honors extension, in the tank story: a
 *          Multiple Representations board at DOK 3, a different version for
 *          each student, on A.2C with A.3B, A.3C, A.2A and A.2B.
 *   15–16  Two audited Digital SAT challenge items, each one step past a DOL
 *          question: g(x) = f(x) + k through a point (A.3E) and the hour two
 *          rental plans cost the same (A.5A).
 *
 * What this holds:
 *   - the committed file is exactly what the builder makes from the regular
 *     makeup, so the two cannot drift apart;
 *   - Pre-Flight: valid with no errors or warnings, and no hint is hidden;
 *   - for an Honors class, Pre-Flight changes nothing: no makeup question is
 *     swapped for an exam item (on the regular file it would swap out
 *     questions 11 and 12), the version is READY and Create accepts it;
 *   - the audited items are the bank's mathematics, untouched, with supports
 *     added, and each student's key is worked out here from their numbers;
 *   - the extension deals a class of 30 thirty versions of the tank story,
 *     each line worked out from the numbers the student reads and marked by
 *     the server; its supports never state an answer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Fraction from 'fraction.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import {
  HONORS_CCMR_DOCUMENTS,
  HONORS_EXTENSION_ID,
  HONORS_EXTENSION_RECIPE,
  HONORS_EXTENSION_STORY,
  HONORS_FILE,
  REGULAR_FILE,
  honorsFileText,
} from '../../scripts/content/build-algebra1-dol4-makeup-honors.mjs';
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
const honorsCandidateFor = (text) => {
  const base = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(text).assignmentV5, {})).assignmentV5;
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
  return { base, candidate: buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null, classSize: CLASS_SIZE }) };
};
const flat = (assignment) => assignment.sections.flatMap((section) => section.questions);
const bankDocument = ({ framework, documentId }) => {
  const payload = JSON.parse(readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${bank.FRAMEWORK_FILES[framework]}`, import.meta.url), 'utf8'));
  return (payload.items || payload.documents).find((document) => document.id === documentId);
};

/** A class of 30 seated the way the teacher app seats one; `deal` is the version a student is given. */
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

test('the committed Honors file is exactly what the builder makes from the regular makeup', () => {
  assert.equal(TEXT, honorsFileText(REGULAR), 'rebuild it: node scripts/content/build-algebra1-dol4-makeup-honors.mjs');
});

test('Pre-Flight: valid with no errors or warnings, and no teacher-written hint is hidden', () => {
  assert.equal(HONORS.model.isValid, true);
  assert.deepEqual(HONORS.model.errors, []);
  assert.deepEqual(HONORS.model.warnings || [], []);
  assert.deepEqual(HONORS.semantic.errors, []);
  assert.deepEqual(HONORS.model.hiddenHints?.warnings || [], []);
  assert.deepEqual(HONORS.model.hintAnswers?.warnings || [], []);
});

test('questions 1–13 are the regular makeup\'s, unchanged, with its tries, hints and feedback', () => {
  assert.equal(RAW.assignment.folder, REGULAR.assignment.folder);
  assert.match(RAW.assignment.title, /Honors/);
  assert.equal(RAW.sections.length, 1);
  const [practice] = RAW.sections;
  assert.equal(practice.role, 'practice');
  assert.deepEqual(practice.questions.slice(0, 13), REGULAR.sections[0].questions);
  const regularPolicy = REGULAR.sections[0];
  assert.deepEqual([practice.attemptsAllowed, practice.hintsAllowed, practice.feedbackMode], [regularPolicy.attemptsAllowed, regularPolicy.hintsAllowed, regularPolicy.feedbackMode]);
  assert.equal(HONORS.questions.length, 16, 'every question survives the import');
  HONORS.questions.forEach((question) => (
    assert.equal(Number(question.questionWeight), question.questionId === HONORS_EXTENSION_ID ? 2 : 1, question.questionId)
  ));
});

test('question 14 is MathMaster\'s vetted DOK 3 extension in the tank story; 15 and 16 are the bank\'s audited items on DOL #4 standards, with supports', () => {
  const [extension, ...audited] = HONORS.questions.slice(13);
  const recipe = HONORS_RECIPE_REGISTRY.find((entry) => entry.id === HONORS_EXTENSION_RECIPE);
  assert.ok(recipe, 'the recipe is still registered');
  assert.equal(extension.questionId, HONORS_EXTENSION_ID);
  assert.deepEqual(extension.questionFamily, { id: recipe.target.familyId, version: recipe.target.familyVersion, constraints: recipe.target.constraints });
  assert.deepEqual([extension.type, extension.mode], [recipe.target.toolId, recipe.target.mode]);
  assert.equal(extension.prompt, recipe.question.prompt);
  assert.deepEqual([extension.dok, extension.difficultyBand], [recipe.rigor.dok, recipe.rigor.difficultyBand]);
  const makeup = HONORS.questions.slice(0, 13);
  assert.equal(extension.dok, Math.max(...makeup.map((question) => Number(question.dok))), 'at the makeup\'s deepest DOK');
  assert.ok(extension.difficultyBand > Math.max(...makeup.map((question) => Number(question.difficultyBand))), 'and harder than any makeup question');
  assert.deepEqual(extension.alignments.map((alignment) => alignment.code).sort(), ['A.2A', 'A.2B', 'A.2C', 'A.3B', 'A.3C']);
  const story = recipe.stories.find((entry) => entry.id === HONORS_EXTENSION_STORY);
  assert.equal(extension.source.prompt, story.source.prompt);
  assert.doesNotMatch(REGULAR.sections[0].questions.map((question) => question.prompt).join(' '), /tank/i, 'a situation the makeup does not tell');

  const makeupTeks = new Set(makeup.flatMap((question) => question.alignments.map((alignment) => alignment.code)));
  assert.equal(audited.length, HONORS_CCMR_DOCUMENTS.length);
  audited.forEach((question, index) => {
    const reference = HONORS_CCMR_DOCUMENTS[index];
    const label = reference.documentId;
    assert.equal(question.questionId, reference.questionId);
    assert.equal(question.ccmrSource.source, 'auditedBank');
    assert.equal(question.ccmrSource.releaseTarget, CCMR_RELEASE_TARGET);
    assert.equal(question.ccmrSource.documentId, reference.documentId);
    assert.equal(question.assessmentContext.framework, reference.framework);
    assert.ok(bank.questionTeksCodes(question).includes(reference.teks), `${label} is on ${reference.teks}`);
    assert.ok(makeupTeks.has(reference.teks), 'a TEKS DOL #4 tests');

    const converted = clone(bank.bankDocumentToV5Intent(bankDocument(reference), { activityRole: 'practice' }));
    const written = RAW.sections[0].questions[14 + index];
    Object.keys(converted).filter((key) => !['activityRole', 'questionId', 'solutionReview'].includes(key)).forEach((key) => (
      assert.deepEqual(written[key], converted[key], `${label}: ${key} is the bank's`)
    ));
    Object.entries(converted.solutionReview || {}).forEach(([key, value]) => {
      const plain = (text) => text.replace(/\$/g, '');
      assert.deepEqual(written.solutionReview[key], Array.isArray(value) ? value.map(plain) : plain(value), `${label}: solution ${key}`);
    });
    assert.ok(hasAuthoredCommonError(question), `${label} names the usual mistake`);
    stringsOf(written.solutionReview).forEach((text) => assert.doesNotMatch(text, /[$\\]/, `${label}: plain text`));
    assert.equal(workedSolutionDepth(question), 'steps');
    const step = backUpStepFor(question);
    assert.ok(backUpStepWritten(step) && step.source === 'authored', `${label}: a back-up step written for it`);
    assert.equal(step.options.length, 2);
    assert.ok(step.options.includes(step.correct));
    assert.deepEqual(written.questionFamily, { scope: 'assignment' }, `${label}: its own numbers for each student`);
    assert.equal(written.questionWeight, 1);
  });
});

/* ------------------------------------------------------- an Honors class -- */

test('for an Honors class Pre-Flight changes nothing: every makeup question stays, the version is READY, and it meets the Honors contract', () => {
  const { base, candidate } = honorsCandidateFor(TEXT);
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
  assert.equal(candidate.model.isValid, true, candidate.errors.join('\n'));
  assert.deepEqual(candidate.model.warnings || [], []);
  assert.equal(candidate.honorsReport.isHonorsReady, true);
  assert.deepEqual(candidate.honorsReport.missing, []);
  assert.equal(candidate.honorsReport.depthCount, 4, 'DOK 3 reasoning, representations, justification and modeling');
  assert.deepEqual([candidate.targetCount, candidate.sourcedCount], [2, 2]);
  assert.deepEqual(candidate.sourced || [], [], 'nothing was sourced in place of a question');
  assert.deepEqual(flat(candidate.assignmentV5).map(keyOf), flat(base).map(keyOf), 'the Honors class gets exactly this file');
});

test('why the Honors file exists: the regular makeup, assigned to an Honors class, would lose makeup questions to exam items', () => {
  const { base, candidate } = honorsCandidateFor(readFileSync(REGULAR_FILE, 'utf8'));
  const kept = new Set(flat(candidate.assignmentV5).map((question) => question.questionId));
  const lost = flat(base).map((question) => question.questionId).filter((id) => !kept.has(id));
  assert.ok(lost.length > 0, 'Pre-Flight swaps some makeup questions out for an Honors class');
});

test('Pre-Flight says the Honors version can be created, and Create accepts exactly the object it previewed', () => {
  const { base, candidate } = honorsCandidateFor(TEXT);
  const readiness = summarizePreflightReadiness({
    blockers: collectReviewBlockers({
      draft: { title: RAW.assignment.title, assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
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

const SHIFT = /^The line \$y=g\(x\)\$, where \$g\(x\)=f\(x\)\+k\$ and \$f\(x\)=(-?\d+)x ([+-]) ?(\d+)\$, passes through \$\((-?\d+),(-?\d+)\)\$\. What is the value of \$k\$\?$/;
const RENTAL = /^Company A charges (\d+) dollars plus (\d+) dollars per hour to rent a machine\. Company B charges (\d+) dollars plus (\d+) dollars per hour for the same type of machine\. For how many hours is the total charge from each company the same\?$/;

test('the audited items give each student their own numbers, and each key is worked out here from the student\'s prompt', () => {
  const { students, sectionMode, deal } = seatClass('asg-dol4-makeup-honors-ccmr');
  assert.equal(sectionMode, 'personalized');
  const shifts = new Set();
  const rentals = new Set();
  for (const studentId of students) {
    const { version: shift } = deal('dol4-makeup-honors-q15', studentId);
    const s = SHIFT.exec(shift.prompt);
    assert.ok(s, `${studentId}: ${shift.prompt}`);
    const [m, sign, bAbs, x, y] = [Number(s[1]), s[2], Number(s[3]), Number(s[4]), Number(s[5])];
    const k = y - (m * x + (sign === '-' ? -bAbs : bAbs));
    const [shiftField] = shift.answerFields;
    assert.ok(matchesFieldAnswer(String(k), shiftField), `${studentId}: k = ${k}`);
    assert.ok(!matchesFieldAnswer(String(y - (sign === '-' ? -bAbs : bAbs)), shiftField) || m * x === 0, `${studentId}: subtracting only the constant is wrong`);
    shifts.add(shift.prompt);

    const { version: rental } = deal('dol4-makeup-honors-q16', studentId);
    const r = RENTAL.exec(rental.prompt);
    assert.ok(r, `${studentId}: ${rental.prompt}`);
    const [baseA, rateA, baseB, rateB] = r.slice(1).map(Number);
    const hours = new Fraction(baseB - baseA, rateA - rateB);
    assert.equal(Number(hours.d), 1, `${studentId}: a whole number of hours`);
    const [rentalField] = rental.answerFields;
    assert.ok(matchesFieldAnswer(String(hours.valueOf()), rentalField), `${studentId}: ${hours.valueOf()} hours`);
    assert.ok(!matchesFieldAnswer(String(hours.valueOf() + 1), rentalField), `${studentId}: an hour off is wrong`);
    rentals.add(rental.prompt);
  }
  assert.ok(shifts.size >= CLASS_SIZE / 2, `the shifts vary across the class (${shifts.size})`);
  assert.ok(rentals.size >= CLASS_SIZE / 2, `the rental plans vary across the class (${rentals.size})`);
});

/* ---------------------------------------------------------- the extension -- */

const TANK = /^A water tank drains at a constant rate of (\d+) liters every (\d+) minutes\. (\d+) minutes after it starts draining, the tank holds (\d+) liters\./;

test('the extension deals a class of 30 thirty versions of the tank story; each line is worked out from the numbers the student reads, and the server marks it', () => {
  const { assignment, students, sectionMode, deal } = seatClass('asg-dol4-makeup-honors');
  assert.equal(sectionMode, 'personalized', 'each student gets their own numbers');
  const fingerprints = new Set();
  for (const studentId of students) {
    const { slot, questionIndex, delivered, version } = deal(HONORS_EXTENSION_ID, studentId);
    fingerprints.add(delivered.instance.fingerprint);
    const match = TANK.exec(version.source.prompt);
    assert.ok(match, `${studentId}: the tank story (${version.source.prompt})`);
    const [rate, per, readTime, readAmount] = match.slice(1).map(Number);
    const unitRate = new Fraction(rate, per);
    const start = unitRate.mul(readTime).add(readAmount);
    const { canonicalLine } = deriveLinearMultipleRepresentations(version);
    assert.ok(new Fraction(canonicalLine.m).equals(unitRate.neg()), `${studentId}: slope −${rate}/${per}`);
    assert.ok(new Fraction(canonicalLine.b).equals(start), `${studentId}: the tank started with ${start.toFraction()} liters`);
    assert.equal(start.equals(readAmount), false, `${studentId}: the reading is not the start`);

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

test('the extension\'s three hints, back-up step and worked solution never state an answer, on any version', () => {
  const extension = HONORS.questions.find((question) => question.questionId === HONORS_EXTENSION_ID);
  const step = backUpStepFor(extension);
  assert.ok(backUpStepWritten(step), `a written back-up step (${step.source})`);
  assert.equal(step.options.length, 2);
  assert.ok(step.options.includes(step.correct));
  assert.equal(workedSolutionDepth(extension), 'steps');
  assert.ok(hasAuthoredCommonError(extension));

  const { students, deal } = seatClass('asg-dol4-makeup-honors-supports');
  for (const studentId of students) {
    const { version } = deal(HONORS_EXTENSION_ID, studentId);
    const shown = buildQuestionHints(version).map((hint) => hint.text);
    assert.deepEqual(shown.slice(0, 3), extension.hints, `${studentId}: all three hints are shown, first`);
    const answers = questionAnswerValues(version);
    assert.ok(answers.length > 0, `${studentId}: the version has answers to guard`);
    const supports = [...shown, step.prompt, ...step.options, ...version.solutionReview.reasoning, version.solutionReview.commonError];
    supports.forEach((text) => assert.equal(hintRevealsAnswer(text, answers), false, `${studentId}: "${text}" states an answer`));
    // The one digit is the 0 of the equation the student solves for the x-intercept.
    assert.doesNotMatch([...extension.hints, step.prompt, ...step.options, ...version.solutionReview.reasoning, version.solutionReview.commonError].join(' ').replace(/0 = mx \+ b/g, ''), /\d/, studentId);
  }
});
