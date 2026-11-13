#!/usr/bin/env node
/*
 * THE ALGEBRA I HONORS DOL #4 REVIEW, BUILT FROM THE REGULAR ONE.
 *
 *   node scripts/content/build-algebra1-dol4-honors.mjs
 *
 * Algebra I and Algebra I Honors take the same DOL #4 (one SY26-27 blueprint
 * for both), so, as for DOL #3 (build-algebra1-dol3-honors.mjs), the Honors
 * review is the regular review's 13 blueprint questions, unchanged, followed
 * by three Honors questions:
 *
 *   14  MathMaster's vetted no-AI Honors extension
 *       (honors.linear.multipleRepresentations.rateFromReading, the battery
 *       story): one Multiple Representations board, a different version for
 *       each student, at DOK 3. It brings together A.2C, A.3C and A.2A, three
 *       of the readiness standards DOL #4 spirals, with A.2B and A.3B. Worth
 *       two questions: it is a whole board.
 *   15  Two audited CCMR items from MathMaster's bank, on the review's two
 *   16  supporting standards that have narrowly aligned items: a Digital SAT
 *       challenge item on why moving a line sideways is the same as moving
 *       it up or down (A.3E), and one that recovers a fitted model's slope
 *       from one prediction to make another (A.4C, which the blueprint
 *       spirals). The bank has no item aligned to A.12C alone.
 *
 * Why the extension is built from the review's Multiple Representations
 * questions: Pre-Flight picks an extension by the concept most of an
 * assignment's questions share. A DOL review has no one concept. In this one,
 * four concepts tie at two questions each, and the first of them, reading a
 * graph's domain and range, has no vetted extension. The vetted linear
 * extensions build on the Multiple Representations board, which questions 4
 * and 6 use, so the extension is built from those two.
 *
 * Why the CCMR items are written into the file: for an Honors class,
 * Pre-Flight replaces about 15% of Practice with audited items on the same
 * TEKS, starting from the end. On the regular review that swaps out question
 * 10 (the phone plans) and question 9 (the equations that may have no
 * solution or every solution) for two SAT equation items. With the two
 * audited items already in Practice the target is met, and every blueprint
 * question stays as it is.
 *
 * Each audited item is the bank's own, as the bank converts it: its prompt,
 * answer, generator and provenance are not touched. What is added is support,
 * the way every question in this review has it (honorsCcmrQuestion,
 * build-algebra1-dol3-honors.mjs): a "Let's back up" step, a "Watch out" line
 * where the bank has none, its worked solution in plain text, a reason for
 * each option of a one-try choice, and an assignment-local Question Family so
 * each student gets their own numbers.
 *
 * The regular file is the source of truth: change it, then run this again.
 * tests/platform/algebra1Dol4HonorsReview.test.mjs fails if the committed
 * Honors file is not exactly what this script builds.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { HONORS_RECIPE_STATUS, buildDeterministicHonorsExtension } from '../../src/platform/rigor/honorsExtensionRecipes.js';
import { honorsCcmrQuestion } from './build-algebra1-dol3-honors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REGULAR_FILE = path.join(ROOT, 'teacher-import-jsons/algebra1-dol4/Algebra1_DOL4_Review.json');
export const HONORS_FILE = path.join(ROOT, 'teacher-import-jsons/algebra1-dol4/Algebra1_DOL4_Review_Honors.json');

export const HONORS_TITLE = 'Algebra I Honors — DOL #4 Review';
export const HONORS_EXTENSION_RECIPE = 'honors.linear.multipleRepresentations.rateFromReading';
// Of the recipe's stories, one this review has not told: question 4 drains a
// pool, which the tank story would repeat, and the Honors DOL #3 review used
// the candle.
export const HONORS_EXTENSION_STORY = 'battery';
export const HONORS_EXTENSION_ID = 'dol4-honors-q14';
// The board the extension extends: the regular review's Multiple
// Representations questions (4 and 6).
export const EXTENSION_ANCHOR_TYPE = 'representationBridge';

/*
 * The audited items. Every claim a reason makes is true of every version of
 * the item (the numbers vary; the relationships do not), and no wrong
 * option's reason states the answer. The options are keyed by the bank's own
 * text, templates and all.
 */
export const HONORS_CCMR_DOCUMENTS = Object.freeze([
  {
    framework: 'digitalSAT',
    documentId: 'mm_sat_A_3E_challenge_3_horizontal-vs-vertical-equivalence_v21',
    questionId: 'dol4-honors-q15',
    teks: 'A.3E',
    scaffold: {
      prompt: 'Let’s back up. To write g(x) = f(x − h) when you know f(x), you…',
      options: ['replace every x in f(x) with x − h', 'subtract h from f(x)'],
      correct: 'replace every x in f(x) with x − h',
    },
    commonError: 'Using the horizontal shift itself as k, or adding the slope times the shift instead of subtracting it; replacing x with x − h in a line subtracts the slope times h from every output.',
    // A choice-only item has one try, so each option gets a reason shown after it (FB05).
    optionRationales: {
      answer: {
        '${{answer}}$': 'Replacing x with x − {{h}} subtracts the slope, {{m}}, times {{h}} from every output of f, and this value of k is exactly that change.',
        '${{dSignError}}$': 'This is the right size with the wrong sign: replacing x with x − {{h}} subtracts the slope times {{h}} from every output. It does not add it.',
        '${{dHorizontalShift}}$': 'This is how far the line moves sideways. Moving a line {{h}} units sideways changes each output by the slope times {{h}}, not by {{h}}.',
        '${{dNewIntercept}}$': 'This is the y-intercept of g, not the change k. The question asks how much every output changes, and that change does not include the y-intercept of f.',
      },
    },
  },
  {
    framework: 'digitalSAT',
    documentId: 'mm_sat_A_4C_ch3_parameter_prediction_v21',
    questionId: 'dol4-honors-q16',
    teks: 'A.4C',
    scaffold: {
      prompt: 'Let’s back up. To find the slope m from the one prediction you are given, start by…',
      options: ['subtracting the y-intercept from the predicted y-value', 'dividing the predicted y-value by its x-value'],
      correct: 'subtracting the y-intercept from the predicted y-value',
    },
  },
]);

// The extension's supports. The board's numbers differ for every student, so
// none of these states one; they name the step the battery story turns on:
// the charge given is a later reading, not the starting charge.
const EXTENSION_SUPPORTS = Object.freeze({
  hints: [
    'The rate is given for several minutes. Divide to find how many percentage points the charge drops in one minute; that is the slope.',
    'The charge in the story was read some time after the video started. Work backward to the moment the video started to find the y-intercept.',
    'The battery is empty when its charge reaches zero. That time is the x-intercept, and it is where the domain ends.',
  ],
  scaffold: {
    prompt: 'Let’s back up. The battery charge given in the story was read…',
    options: ['after the video had already been playing for a while', 'at the moment the video started'],
    correct: 'after the video had already been playing for a while',
  },
  attemptFeedback: [
    'Check the rate first: the story gives it for several minutes, so divide to get the change in one minute, and remember that the charge goes down.',
    'Check the starting charge: the reading in the story came after the video had been playing, so work backward from it before you find when the battery is empty.',
  ],
  solutionReview: {
    reasoning: [
      'Find the rate for one minute: divide the percentage points lost by the number of minutes. The charge goes down, so the slope is negative.',
      'The charge in the story was read after the video had been playing for a while. Work back to the moment the video started by adding the percentage points the battery lost before the reading. That starting charge is the y-intercept.',
      'The x-intercept is the time when the charge reaches zero and the battery is empty: solve 0 = mx + b for x. The model makes sense from the moment the video starts to that time.',
      'With m and b, write y = mx + b, then rewrite it in point-slope form and in standard form, and check that the table and all three graphs show the same line.',
    ],
    commonError: 'Using the charge in the story as the starting charge; it was read after the video had already been playing for a while, so the starting charge is greater.',
  },
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const without = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

/** The vetted extension, as the recipe builds it from the review's own boards, in Practice. */
export const honorsExtensionQuestion = (regular) => {
  const reviewed = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(JSON.stringify(regular)).assignmentV5, {}));
  const boards = reviewed.questions.filter((question) => question.type === EXTENSION_ANCHOR_TYPE);
  if (!boards.length) throw new Error('The regular review has no Multiple Representations question left to extend; choose the extension again.');
  const built = buildDeterministicHonorsExtension({
    questions: boards,
    assignmentCourseId: regular.assignment.courseId,
    storyId: HONORS_EXTENSION_STORY,
  });
  if (built.status !== HONORS_RECIPE_STATUS.READY) throw new Error(`No Honors extension for this review: ${built.teacherMessage}`);
  if (built.recipe.id !== HONORS_EXTENSION_RECIPE) throw new Error(`The review's Honors extension is now ${built.recipe.id}; check it before rebuilding.`);
  // The section places it; the compiler keeps no provenance record; the value is set below.
  const question = without(built.question, ['activityRole', 'honorsEnrichment', 'questionWeight', 'questionWeightBasis']);
  return { questionId: HONORS_EXTENSION_ID, ...clone(question), questionWeight: 2, ...clone(EXTENSION_SUPPORTS) };
};

export const buildAlgebra1Dol4Honors = (regular = JSON.parse(readFileSync(REGULAR_FILE, 'utf8'))) => {
  const [practice] = regular.sections;
  return {
    schemaVersion: regular.schemaVersion,
    assignment: {
      ...clone(regular.assignment),
      title: HONORS_TITLE,
      instructions: 'Review for District DOL #4, which you will take in Eduphoria. Questions 1–13 follow the DOL #4 blueprint, one for each question on the test, and every one uses an interactive tool, so show your work inside the tool. Question 14 is an Honors extension that brings the linear standards together in one situation, and questions 15 and 16 are college-readiness (SAT) questions on transformations of linear functions and on predicting from a fitted model. You have 3 tries on each question except question 15, a multiple-choice question with one try, and hints are there when you need them. Questions 8 and 9 give you your own equations, and a new one when you ask for it.',
    },
    // The extension and the audited items generate their numbers, as questions
    // 8 and 9 do, so each student gets their own.
    variantPolicy: { mode: 'personalized', sectionModes: { practice: 'personalized' }, avoidRecentTemplates: true, avoidDuplicateParameters: true },
    sections: [{
      ...clone(practice),
      id: 'dol4-honors-review-practice',
      title: 'DOL #4 Review — Honors Practice',
      recommendedMinutes: 125,
      questions: [
        ...clone(practice.questions),
        honorsExtensionQuestion(regular),
        ...HONORS_CCMR_DOCUMENTS.map(honorsCcmrQuestion),
      ],
    }],
  };
};

export const honorsFileText = (regular) => `${JSON.stringify(buildAlgebra1Dol4Honors(regular), null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(HONORS_FILE, honorsFileText());
  console.log(`Wrote ${path.relative(ROOT, HONORS_FILE)}`);
}
