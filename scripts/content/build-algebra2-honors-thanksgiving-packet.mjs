#!/usr/bin/env node
/*
 * ALGEBRA II HONORS — THANKSGIVING BREAK PACKET.
 *
 *   node scripts/content/build-algebra2-honors-thanksgiving-packet.mjs
 *
 * Writes teacher-import-jsons/thanksgiving-packet/
 * Algebra2_Honors_Thanksgiving_Packet.json from the unit modules in
 * scripts/content/algebra2HonorsThanksgivingPacket/: a cumulative review of
 * everything taught from August to Thanksgiving, for students to work alone
 * over the break.
 *
 * One assignment, one Classwork section per unit, in the order the units were
 * taught. Each unit runs from its building block to grade level, on the tool
 * that does its mathematics. Classwork is the role because a worked example
 * opens by itself only on Classwork (docs/platform/WORKED_EXAMPLES.md): the
 * first question on each skill names an authored example of
 * `lessonSupports.examples`, a sibling problem with different numbers.
 *
 * The last section is a short Practice section of audited Digital SAT items
 * from MathMaster's bank, on standards the packet reviews. An Honors class is
 * owed audited CCMR items in Practice (about 15% of it); with these in the
 * file the Honors version is the file itself and nothing is replaced, as in
 * the Algebra II Honors DOL #2 review. Honors comes from the class, never
 * from the file.
 *
 * Edit a unit module, then run this again:
 * tests/platform/thanksgivingPacketAlgebra2Honors.test.mjs fails when the
 * committed file is not exactly what this script writes.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditedCcmrQuestion, backUp, lessonText, writeLessonFile } from './lib/lessonKit.mjs';
import { UNITS_1_TO_4 } from './algebra2HonorsThanksgivingPacket/units1to4.mjs';
import { UNITS_5_TO_8 } from './algebra2HonorsThanksgivingPacket/units5to8.mjs';
import { UNITS_9_TO_11 } from './algebra2HonorsThanksgivingPacket/units9to11.mjs';

export const PACKET_FILE = 'teacher-import-jsons/thanksgiving-packet/Algebra2_Honors_Thanksgiving_Packet.json';

const UNITS = [...UNITS_1_TO_4, ...UNITS_5_TO_8, ...UNITS_9_TO_11];

/*
 * The audited Digital SAT items, one for each of six units. Each is the
 * bank's own item, placed as the bank converts it; the packet adds a
 * "Let's back up" step and, for the one choice item, a reason for each option.
 * None is used by an earlier Algebra II Honors lesson or review.
 */
export const PACKET_SAT_ITEMS = Object.freeze([
  {
    documentId: 'mm_sat_A2_2A_cubic-interval-maximum_v21',
    scaffold: backUp('As x gets larger, the value of x³…', ['gets larger', 'gets smaller'], 'gets larger'),
  },
  {
    documentId: 'mm_sat_A2_6E_greater_solution_basic_v21',
    scaffold: backUp('An equation |A| = d, with d positive, splits into…', ['A = d or A = −d', 'A = d only'], 'A = d or A = −d'),
  },
  {
    documentId: 'mm_sat_A2_6F_integer_count_strict_v21',
    scaffold: backUp('|A| < d means that A is…', ['between −d and d', 'less than −d or greater than d'], 'between −d and d'),
  },
  {
    documentId: 'mm_sat_A2_7B_cubic_coefficient_parameter_v21',
    scaffold: backUp('When you add two polynomials, you add the coefficients of…', ['like terms', 'all the terms together'], 'like terms'),
  },
  {
    documentId: 'mm_sat_A2_7C_cubic_by_linear_exact_v21',
    scaffold: backUp('A factor that is in both the numerator and the denominator…', ['cancels, because it divides to 1', 'is added to the other factor'], 'cancels, because it divides to 1'),
    // A choice item has one try, so each option gets a reason shown after it,
    // in the bank's own option order.
    optionRationales: {
      answer: [
        'The factor x + {{p}} is in the numerator and in the denominator, so it cancels and the other factor is left as it was.',
        'This puts {{p}}, the number from the cancelled factor, into the factor that is left. Cancelling does not change the other factor.',
        'This is only part of the factor that is left. All of x² + {{q}}x + {{r}} stays after x + {{p}} cancels.',
        'The constant changed from {{r}} to {{r1}}. Cancelling a factor does not change the numbers in the other factor.',
      ],
    },
  },
  {
    documentId: 'mm_sat_A2_6B_4_translated-outside_v21',
    scaffold: backUp('What undoes a cube root?', ['Cubing both sides', 'Squaring both sides'], 'Cubing both sides'),
  },
]);

const satSection = () => ({
  id: 'sat-check',
  role: 'practice',
  title: 'College-readiness check — SAT questions',
  feedbackMode: 'immediate',
  hintsAllowed: true,
  questions: PACKET_SAT_ITEMS.map((entry, index) => auditedCcmrQuestion({ ...entry, questionId: `tgp-sat-${index + 1}` })),
});

export const buildThanksgivingPacket = () => {
  const examples = UNITS.flatMap((entry) => entry.examples);
  const ids = examples.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error('Two worked examples share an id.');
  return {
    schemaVersion: 5,
    assignment: {
      title: 'Algebra II Honors — Thanksgiving Break Packet',
      courseId: 'algebra2',
      folder: 'Algebra II Honors/Thanksgiving Packet',
      instructionalPurpose: 'review',
      gradingPurpose: 'classwork',
      instructions: 'This packet reviews everything from the start of the year, one unit at a time. Each unit starts with the basics and builds up. When a question starts something new, read its notes and worked example first. You can try each question as many times as you need, and hints are there when you need them. The answer is not shown until you get it right.',
      teacherNotes: 'A cumulative review for students to work alone over Thanksgiving break: 11 units in the order they were taught, 72 questions, each unit running from its building block to grade level. Nearly every question is worked in a tool; units 9 and 10 (radical expressions and rational exponents) have no dedicated tool, so they use answer boxes that take one small step at a time, and sorts. The first question on each skill opens an authored worked example (a sibling problem with different numbers) and carries short guided notes. The last section is six audited Digital SAT questions on standards the packet reviews, so an Honors class meets its CCMR share with the file as it is.',
    },
    // Classwork is the same for everyone, so a student can ask a classmate or
    // a teacher about "Unit 4, question 3". The SAT questions generate their
    // numbers from the bank's own families, so each student gets their own.
    variantPolicy: {
      mode: 'personalized',
      sectionModes: { classwork: 'shared', practice: 'personalized' },
      avoidRecentTemplates: true,
      avoidDuplicateParameters: true,
    },
    gradingPolicy: { attemptPolicy: 'unlimited', scoring: 'platformDefault' },
    lessonSupports: {
      // The one pattern of the packet that is a formula to look up, not a
      // method to follow: pinned beside the factoring unit.
      referenceCards: [{ id: 'cubes', skill: 'factor.sumDifferenceOfCubes', sections: ['unit-8'] }],
      examples,
    },
    sections: [...UNITS.map((entry) => entry.section), satSection()],
  };
};

export const packetText = () => lessonText(buildThanksgivingPacket());

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = writeLessonFile(PACKET_FILE, buildThanksgivingPacket());
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
