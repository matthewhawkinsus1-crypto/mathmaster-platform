#!/usr/bin/env node
/*
 * THE ALGEBRA I · MODULE 2 · TOPIC 2 · LESSON 3 HONORS FILE, BUILT FROM THE
 * REGULAR ONE (TT18).
 *
 *   node scripts/content/build-algebra1-l3-honors.mjs
 *
 * "Slopes of Perpendicular Lines and Horizontal & Vertical Lines" has always had
 * an Honors version: assign the Regular file to an Honors class and Pre-Flight
 * builds it (canonicalCcmrHydration.js), swapping about 15% of Practice, from the
 * end, for audited CCMR items from MathMaster's bank on the lesson's own TEKS
 * (tests/platform/algebra1L3RegularAndHonors.test.mjs). What a teacher could not
 * do was HOLD that version as a file, to read, share or edit it, because the one
 * Pre-Flight makes is the stored (canonical) form, and that form does not import
 * back: the lesson's matching and sorting questions are stored in a shape the
 * importer does not read. The importer reads the import form, so this writes the
 * same version in it, the way build-algebra1-dol3-honors.mjs does for DOL #3:
 *
 *   Practice 9   the sort of lines as parallel, perpendicular or neither
 *                -> the bank's Digital SAT challenge item on the value that makes
 *                   two lines in standard form perpendicular (A.2F)
 *   Practice 12  "Priya says the perpendicular slope is −4"
 *                -> the bank's Digital SAT item on writing the perpendicular line
 *                   in standard form (A.2F)
 *
 * Those are exactly the two places, and the two items, Pre-Flight chooses for
 * this lesson; the test fails if that ever stops being so. Every other question,
 * the Warm-Up and the DOL are the Regular file's, so one set of Recovery
 * families serves both. With the two audited items already in Practice the
 * 15% target is met, so assigning THIS file to an Honors class changes nothing
 * (and assigning the Regular file to one still works).
 *
 * Each audited item is the bank's own: prompt, answer, generator and provenance
 * are not touched. What is added is support, the way every question in the
 * lesson has it (honorsCcmrQuestion, build-algebra1-dol3-honors.mjs): a "Let's
 * back up" step, a "Watch out" line, the worked solution in plain text, a reason
 * for each option of these one-try choices, and an assignment-local Question
 * Family. Practice stays shared, as in the Regular file and in the Honors class's
 * own build: every student in a class reads the same numbers.
 *
 * The Regular file is the source of truth: change it, then run this again.
 * tests/platform/algebra1L3HonorsFile.test.mjs fails if the committed Honors
 * file is not exactly what this script builds.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { honorsCcmrQuestion } from './build-algebra1-dol3-honors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FOLDER = path.join(ROOT, 'teacher-import-jsons/algebra1-module2-topic2');
export const REGULAR_FILE = path.join(FOLDER, 'L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json');
export const HONORS_FILE = path.join(FOLDER, 'L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines_Honors.json');

export const HONORS_TITLE = 'Algebra I Honors — Slopes of Perpendicular Lines and Horizontal & Vertical Lines';

/*
 * The audited items, each in the Regular Practice question it replaces. Every
 * claim a reason makes is true of every version of the item (the numbers vary;
 * the relationships do not), and none states a number a version could be asked
 * for. The options are keyed by the bank's own text, templates and all.
 */
export const HONORS_CCMR_DOCUMENTS = Object.freeze([
  {
    replaces: 'l3-pr-9',
    framework: 'digitalSAT',
    documentId: 'mm_sat_A_2F_6_perpendicular_standard_parameter_v21',
    questionId: 'l3-honors-pr-9',
    teks: 'A.2F',
    scaffold: {
      prompt: 'Let’s back up. When two lines are perpendicular, the product of their slopes is…',
      options: ['Negative one', 'Positive one'],
      correct: 'Negative one',
    },
    commonError: 'Getting the right size but the wrong sign: with the sign wrong the slopes multiply to 1, not −1, and the lines are not perpendicular.',
    optionRationales: {
      answer: {
        '${{p}}$': 'With this value the two slopes multiply to −1, so the lines are perpendicular.',
        '${{dNoNegative}}$': 'This has the right size but the wrong sign: with it the two slopes multiply to 1, not −1.',
        '${{dWrongCoefficient}}$': 'With this value the second line has slope 1, and 1 times the first slope is not −1.',
        '${{dParallel}}$': 'With this value the second line has slope −1, and the two slopes multiply to a positive number, not −1.',
      },
    },
  },
  {
    replaces: 'l3-pr-12',
    framework: 'digitalSAT',
    documentId: 'mm_sat_A_2F_2_perpendicular_standard_form_v21',
    questionId: 'l3-honors-pr-12',
    teks: 'A.2F',
    scaffold: {
      prompt: 'Let’s back up. To be perpendicular to a line, a line’s slope must be the original slope…',
      options: ['Flipped, with its sign changed', 'Left the same, with a different intercept'],
      correct: 'Flipped, with its sign changed',
    },
    commonError: 'Changing only the sign of the slope, or only flipping it; a perpendicular slope needs both, the negative reciprocal. Keeping the same coefficients gives a parallel line.',
    optionRationales: {
      answer: {
        '${{B}}x-{{A}}y={{D}}$': 'The slope of this line is the negative reciprocal of the given line’s slope, and the constant makes it pass through the point.',
        '${{A}}x+{{B}}y={{Dpar}}$': 'This line keeps the given line’s coefficients, so it has the same slope: it is parallel, not perpendicular.',
        '${{B}}x+{{A}}y={{D}}$': 'This slope is the given slope flipped over but with its sign unchanged, so the two slopes multiply to 1, not −1.',
        '${{A}}x-{{B}}y={{D}}$': 'This slope is the opposite of the given slope but not flipped over, so the two slopes do not multiply to −1.',
      },
    },
  },
]);

const clone = (value) => JSON.parse(JSON.stringify(value));

export const buildAlgebra1L3Honors = (regular = JSON.parse(readFileSync(REGULAR_FILE, 'utf8'))) => {
  const replaced = new Set();
  const sections = regular.sections.map((section) => {
    if (section.role !== 'practice') return clone(section);
    return {
      ...clone(section),
      questions: section.questions.map((question) => {
        const reference = HONORS_CCMR_DOCUMENTS.find((entry) => entry.replaces === question.questionId);
        if (!reference) return clone(question);
        replaced.add(reference.replaces);
        return honorsCcmrQuestion(reference);
      }),
    };
  });
  const missing = HONORS_CCMR_DOCUMENTS.filter((entry) => !replaced.has(entry.replaces));
  if (missing.length) {
    throw new Error(`The Regular lesson no longer has Practice ${missing.map((entry) => entry.replaces).join(', ')}; decide what its Honors version replaces before rebuilding.`);
  }
  return {
    ...clone(regular),
    assignment: { ...clone(regular.assignment), title: HONORS_TITLE },
    sections,
  };
};

export const honorsFileText = (regular) => `${JSON.stringify(buildAlgebra1L3Honors(regular), null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(HONORS_FILE, honorsFileText());
  console.log(`Wrote ${path.relative(ROOT, HONORS_FILE)}`);
}
