#!/usr/bin/env node
/*
 * THE ALGEBRA I HONORS DOL #4 MAKEUP, BUILT FROM THE REGULAR ONE.
 *
 *   node scripts/content/build-algebra1-dol4-makeup-honors.mjs
 *
 * Algebra I and Algebra I Honors take the same DOL #4, so the Honors makeup
 * is the regular makeup's 13 questions, unchanged, followed by three Honors
 * questions:
 *
 *   14  MathMaster's vetted no-AI Honors extension for linear relationships
 *       (honors.linear.multipleRepresentations.rateFromReading, the tank
 *       story): one Multiple Representations board, a different version for
 *       each student, at DOK 3. It brings A.2A, A.2B, A.2C, A.3B and A.3C —
 *       five of the DOL's standards — together. Worth two questions.
 *   15  Two audited Digital SAT challenge items from MathMaster's bank, each
 *   16  one step past a DOL question: g(x) = f(x) + k through a given point
 *       (A.3E, after question 5), and the hour at which two rental plans cost
 *       the same (A.5A, after questions 2, 6, 11 and 12).
 *
 * Why the audited items are written into the file rather than left to
 * Pre-Flight: for an Honors class Pre-Flight replaces about 15% of Practice
 * with audited items on the same TEKS, starting from the end. On the regular
 * makeup that swaps out question 11 (an equation to solve) and question 12
 * (the moving van), so an Honors student would not make up those two DOL
 * questions. With two audited items already in Practice the target is met,
 * and all 13 makeup questions stay.
 *
 * Each audited item is the bank's own, as the bank converts it; the supports
 * are added the way the DOL #3 Honors review adds them (its builder's
 * honorsCcmrQuestion): a "Let's back up" step, a "Watch out" line where the
 * bank has none, the worked solution in plain text, and an assignment-local
 * Question Family so each student gets their own numbers.
 *
 * The regular file is the source of truth: change it, then run this again.
 * tests/platform/algebra1Dol4MakeupHonors.test.mjs fails if the committed
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
export const REGULAR_FILE = path.join(ROOT, 'teacher-import-jsons/algebra1-dol4/Algebra1_DOL4_Makeup.json');
export const HONORS_FILE = path.join(ROOT, 'teacher-import-jsons/algebra1-dol4/Algebra1_DOL4_Makeup_Honors.json');

export const HONORS_EXTENSION_RECIPE = 'honors.linear.multipleRepresentations.rateFromReading';
// The DOL #3 Honors review told the candle story; a student who did that
// review meets a different situation here.
export const HONORS_EXTENSION_STORY = 'tank';
export const HONORS_EXTENSION_ID = 'dol4-makeup-honors-q14';
// The recipe is chosen from the questions that teach its concept: the
// makeup's two Multiple Representations boards (questions 9 and 12). Asked
// of the whole makeup, MathMaster anchors on its three equations to solve,
// for which no vetted extension exists.
const EXTENSION_ANCHORS = Object.freeze(['dol4-makeup-q09', 'dol4-makeup-q12']);

export const HONORS_CCMR_DOCUMENTS = Object.freeze([
  {
    framework: 'digitalSAT',
    documentId: 'mm_sat_A_3E_challenge_2_parameter-pass-through-point_v21',
    questionId: 'dol4-makeup-honors-q15',
    teks: 'A.3E',
    scaffold: {
      prompt: 'Let’s back up. If g(x) = f(x) + k, then at the same x-value, g(x) is…',
      options: ['the value of f(x) plus k', 'the value of f(x + k)'],
      correct: 'the value of f(x) plus k',
    },
  },
  {
    framework: 'digitalSAT',
    documentId: 'mm_sat_A_5A_challenge_2_equal_cost_v21',
    questionId: 'dol4-makeup-honors-q16',
    teks: 'A.5A',
    scaffold: {
      prompt: 'Let’s back up. The two companies charge the same total when…',
      options: [
        'the expressions for the two total charges are equal',
        'the two hourly rates are equal',
      ],
      correct: 'the expressions for the two total charges are equal',
    },
    commonError: 'Setting the two hourly rates or the two base fees equal; the totals are equal when base + rate × hours is the same for both companies, so set those two expressions equal and solve for the hours.',
  },
]);

// The extension's supports. Its numbers differ for every student, so none of
// these states one; they name the step the tank story turns on: the amount
// given is a later reading, not the starting amount.
const EXTENSION_SUPPORTS = Object.freeze({
  hints: [
    'The rate is given for several minutes. Divide to find how many liters drain in one minute; that is the slope.',
    'The amount in the story was measured some time after the tank started draining. Work backward to the moment it started to find the y-intercept.',
    'The tank is empty when the amount reaches zero. That time is the x-intercept, and it is where the domain ends.',
  ],
  scaffold: {
    prompt: 'Let’s back up. The amount of water given in the story was measured…',
    options: ['after the tank had already drained for a while', 'at the moment the tank started draining'],
    correct: 'after the tank had already drained for a while',
  },
  solutionReview: {
    reasoning: [
      'Find the rate for one minute: divide the liters drained by the number of minutes. The amount goes down, so the slope is negative.',
      'The amount in the story was measured after the tank had drained for a while. Work back to the moment it started by adding the liters it drained before the reading. That starting amount is the y-intercept.',
      'The x-intercept is the time when the amount reaches zero and the tank is empty: solve 0 = mx + b for x. The model makes sense from the moment the tank starts draining to that time.',
      'With m and b, write y = mx + b, then rewrite it in point-slope form and in standard form, and check that the table and all three graphs show the same line.',
    ],
    commonError: 'Using the amount in the story as the starting amount; it was measured after the tank had already drained for a while, so the starting amount is greater.',
  },
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const without = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

/** The vetted extension, as the recipe builds it for this makeup, in Practice. */
export const honorsExtensionQuestion = (regular) => {
  const reviewed = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(JSON.stringify(regular)).assignmentV5, {}));
  const anchors = reviewed.questions.filter((question) => EXTENSION_ANCHORS.includes(question.questionId));
  if (anchors.length !== EXTENSION_ANCHORS.length) throw new Error(`The makeup no longer has ${EXTENSION_ANCHORS.join(' and ')}.`);
  const built = buildDeterministicHonorsExtension({
    questions: anchors,
    assignmentCourseId: regular.assignment.courseId,
    storyId: HONORS_EXTENSION_STORY,
  });
  if (built.status !== HONORS_RECIPE_STATUS.READY) throw new Error(`No Honors extension for this makeup: ${built.teacherMessage}`);
  if (built.recipe.id !== HONORS_EXTENSION_RECIPE) throw new Error(`The makeup's Honors extension is now ${built.recipe.id}; check it before rebuilding.`);
  const question = without(built.question, ['activityRole', 'honorsEnrichment', 'questionWeight', 'questionWeightBasis']);
  return { questionId: HONORS_EXTENSION_ID, ...clone(question), questionWeight: 2, ...clone(EXTENSION_SUPPORTS) };
};

export const buildAlgebra1Dol4MakeupHonors = (regular = JSON.parse(readFileSync(REGULAR_FILE, 'utf8'))) => {
  const [practice] = regular.sections;
  return {
    schemaVersion: regular.schemaVersion,
    assignment: {
      ...clone(regular.assignment),
      title: 'Algebra I Honors — DOL #4 Makeup',
      instructions: 'This is the makeup for District DOL #4. Questions 1–13 test the same skills as the 13 questions on the DOL, in the same order, with new numbers and new situations. Show your work inside each tool. Question 14 is an Honors extension that brings the linear standards together in one situation, and questions 15 and 16 are SAT challenge questions on transformations and on linear equations. You have 3 tries on each question, and hints are there when you need them.',
    },
    // The makeup's 13 questions are the same for everyone. The extension and
    // the SAT items generate their numbers, so each student gets their own.
    variantPolicy: { mode: 'personalized', sectionModes: { practice: 'personalized' }, avoidRecentTemplates: true, avoidDuplicateParameters: true },
    sections: [{
      ...clone(practice),
      id: 'dol4-makeup-honors-practice',
      title: 'DOL #4 Makeup — Honors',
      recommendedMinutes: 95,
      questions: [
        ...clone(practice.questions),
        honorsExtensionQuestion(regular),
        ...HONORS_CCMR_DOCUMENTS.map(honorsCcmrQuestion),
      ],
    }],
  };
};

export const honorsFileText = (regular) => `${JSON.stringify(buildAlgebra1Dol4MakeupHonors(regular), null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(HONORS_FILE, honorsFileText());
  console.log(`Wrote ${path.relative(ROOT, HONORS_FILE)}`);
}
