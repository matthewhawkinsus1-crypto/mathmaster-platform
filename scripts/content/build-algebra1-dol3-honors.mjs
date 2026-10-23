#!/usr/bin/env node
/*
 * THE ALGEBRA I HONORS DOL #3 REVIEW, BUILT FROM THE REGULAR ONE.
 *
 *   node scripts/content/build-algebra1-dol3-honors.mjs
 *
 * Algebra I and Algebra I Honors take the same DOL #3 (one blueprint for
 * both), so the Honors review is the regular review's 13 blueprint questions,
 * unchanged, followed by three Honors questions:
 *
 *   14  MathMaster's vetted no-AI Honors extension for this review's concept
 *       (honors.linear.multipleRepresentations.rateFromReading, the candle
 *       story): one Multiple Representations board, a different version for
 *       each student, at DOK 3, that brings A.2A, A.2B, A.2C, A.3B and A.3C
 *       together. Worth two questions: it is a whole board.
 *   15  Two audited CCMR (TSIA2) items from MathMaster's bank, on the review's
 *   16  own A.4B and A.4C: association against causation in observational
 *       data, and what a sample can and cannot show.
 *
 * Why the CCMR items are written into the file rather than left to Pre-Flight:
 * for an Honors class Pre-Flight replaces about 15% of Practice with audited
 * items on the same TEKS, starting from the end. On the regular review that
 * swaps out question 12 (the function sort) and question 13 (the recursive
 * sequence, for an ACT polynomial-evaluation item that does not practise
 * sequences at all). With the two audited items already in Practice the
 * target is met, and every blueprint question stays as it is. These two are
 * the audited items on the review's TEKS that import with no Pre-Flight
 * warning. Each is the bank's own item, exactly as the bank converts it.
 *
 * The regular file is the source of truth: change it, then run this again.
 * tests/platform/algebra1Dol3HonorsReview.test.mjs fails if the committed
 * Honors file is not exactly what this script builds.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { HONORS_RECIPE_STATUS, buildDeterministicHonorsExtension } from '../../src/platform/rigor/honorsExtensionRecipes.js';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REGULAR_FILE = path.join(ROOT, 'teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json');
export const HONORS_FILE = path.join(ROOT, 'teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review_Honors.json');

export const HONORS_EXTENSION_RECIPE = 'honors.linear.multipleRepresentations.rateFromReading';
// Of the recipe's stories, the one the review has not already told: question
// 1 is a draining phone battery and question 8 a draining tank.
export const HONORS_EXTENSION_STORY = 'candle';
export const HONORS_EXTENSION_ID = 'dol3-honors-q14';
export const HONORS_CCMR_DOCUMENTS = Object.freeze([
  { framework: 'tsia2', documentId: 'mm_tsia2_psr_analysis_8_v21' },
  { framework: 'tsia2', documentId: 'mm_tsia2_psr_analysis_6_v21' },
]);

// The extension's supports. The board's numbers differ for every student, so
// none of these states one; they name the step the candle story turns on: the
// height given is a later reading, not the starting height.
const EXTENSION_SUPPORTS = Object.freeze({
  hints: [
    'The rate is given for several hours. Divide to find how much shorter the candle gets in one hour; that is the slope.',
    'The height in the story was measured some time after the candle was lit. Work backward to the moment it was lit to find the y-intercept.',
    'The candle is gone when its height reaches zero. That time is the x-intercept, and it is where the domain ends.',
  ],
  scaffold: {
    prompt: 'Let’s back up. The height given in the story was measured…',
    options: ['after the candle had already burned for a while', 'at the moment the candle was lit'],
    correct: 'after the candle had already burned for a while',
  },
  solutionReview: {
    reasoning: [
      'Find the rate for one hour: divide the centimeters burned by the number of hours. The candle gets shorter, so the slope is negative.',
      'The height in the story was measured after the candle had burned for a while. Work back to the moment it was lit by adding the centimeters it burned before the reading. That starting height is the y-intercept.',
      'The x-intercept is the time when the height reaches zero and the candle is gone: solve 0 = mx + b for x. The model makes sense from the moment the candle is lit to that time.',
      'With m and b, write y = mx + b, then rewrite it in point-slope form and in standard form, and check that the table and all three graphs show the same line.',
    ],
    commonError: 'Using the height in the story as the starting height; it was measured after the candle had already burned for a while, so the starting height is greater.',
  },
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const without = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

const loadBankDocument = ({ framework, documentId }) => {
  const payload = JSON.parse(readFileSync(path.join(ROOT, 'functions/seeds/pathQuestionBank', bank.FRAMEWORK_FILES[framework]), 'utf8'));
  const documents = Array.isArray(payload?.items) ? payload.items : payload?.documents || [];
  const document = documents.find((entry) => entry?.id === documentId);
  if (!document) throw new Error(`The audited ${framework} bank has no item ${documentId}.`);
  return document;
};

/** The audited item as the bank itself converts it for a Practice place. */
export const honorsCcmrQuestion = (reference) => {
  // The section gives it its role.
  const intent = without(bank.bankDocumentToV5Intent(loadBankDocument(reference), { activityRole: 'practice' }), ['activityRole']);
  return { ...clone(intent), questionWeight: 1 };
};

/** The vetted extension, as the recipe builds it for this review, in Practice. */
export const honorsExtensionQuestion = (regular) => {
  const reviewed = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(JSON.stringify(regular)).assignmentV5, {}));
  const built = buildDeterministicHonorsExtension({
    questions: reviewed.questions,
    assignmentCourseId: regular.assignment.courseId,
    storyId: HONORS_EXTENSION_STORY,
  });
  if (built.status !== HONORS_RECIPE_STATUS.READY) throw new Error(`No Honors extension for this review: ${built.teacherMessage}`);
  if (built.recipe.id !== HONORS_EXTENSION_RECIPE) throw new Error(`The review's Honors extension is now ${built.recipe.id}; check it before rebuilding.`);
  // The section places it; the compiler keeps no provenance record; the value is set below.
  const question = without(built.question, ['activityRole', 'honorsEnrichment', 'questionWeight', 'questionWeightBasis']);
  return { questionId: HONORS_EXTENSION_ID, ...clone(question), questionWeight: 2, ...clone(EXTENSION_SUPPORTS) };
};

export const buildAlgebra1Dol3Honors = (regular = JSON.parse(readFileSync(REGULAR_FILE, 'utf8'))) => {
  const [practice] = regular.sections;
  return {
    schemaVersion: regular.schemaVersion,
    assignment: {
      ...clone(regular.assignment),
      title: 'Algebra I Honors — DOL #3 Review',
      instructions: 'Review for District DOL #3, which you will take in Eduphoria. Questions 1–13 follow the DOL #3 blueprint, one for each question on the test, and every one uses an interactive tool, so show your work inside the tool. Question 14 is an Honors extension that brings the linear standards together in one situation, and questions 15 and 16 are college-readiness (TSIA2) questions about association, causation and what data can show. You have 3 tries on each question, and hints are there when you need them.',
    },
    // The regular review's questions are the same for everyone. The extension
    // and the TSIA2 items generate their numbers, so each student gets their
    // own, as in any independent Practice.
    variantPolicy: { mode: 'personalized', sectionModes: { practice: 'personalized' }, avoidRecentTemplates: true, avoidDuplicateParameters: true },
    sections: [{
      ...clone(practice),
      id: 'dol3-honors-review-practice',
      title: 'DOL #3 Review — Honors Practice',
      recommendedMinutes: 110,
      questions: [
        ...clone(practice.questions),
        honorsExtensionQuestion(regular),
        ...HONORS_CCMR_DOCUMENTS.map(honorsCcmrQuestion),
      ],
    }],
  };
};

export const honorsFileText = (regular) => `${JSON.stringify(buildAlgebra1Dol3Honors(regular), null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(HONORS_FILE, honorsFileText());
  console.log(`Wrote ${path.relative(ROOT, HONORS_FILE)}`);
}
