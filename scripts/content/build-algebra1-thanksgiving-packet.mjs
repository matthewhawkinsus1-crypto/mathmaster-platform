#!/usr/bin/env node
/*
 * ALGEBRA I · THANKSGIVING BREAK PACKET, REGULAR AND HONORS.
 *
 *   node scripts/content/build-algebra1-thanksgiving-packet.mjs
 *
 * Writes two teacher-import files in teacher-import-jsons/thanksgiving-packet/
 * from the unit modules in scripts/content/algebra1ThanksgivingPacket/:
 *
 *   Algebra1_Thanksgiving_Packet.json          the regular packet
 *   Algebra1_Thanksgiving_Packet_Honors.json   the same questions, then the
 *                                              Honors questions of each unit
 *
 * The packet is a cumulative review of everything taught from the start of the
 * year, for a student working alone over the break. It is one assignment of ten
 * Classwork sections, one for each unit in the order taught. Classwork is the
 * role on purpose: a worked example opens by itself only on Classwork, and is
 * never shown on a DOL, quiz or test (docs/platform/WORKED_EXAMPLES.md).
 *
 * In each unit the questions go from the building block to grade level, and
 * nearly every one is worked in a rich tool. The first question on each skill
 * names the worked example that teaches it (`example`) and carries short
 * guided notes, which Classwork shows today; later questions on the same skill
 * are covered by that example. `assertCovered` refuses to build a packet with
 * a question no example reaches.
 *
 * Edit a unit module, then run this again:
 * tests/platform/thanksgivingPacketAlgebra1.test.mjs fails when a committed
 * file is not exactly what this script writes.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonText, writeLessonFile } from './lib/lessonKit.mjs';
import { PACKET_EXAMPLES } from './algebra1ThanksgivingPacket/examples.mjs';
import { UNITS_1_TO_3 } from './algebra1ThanksgivingPacket/units1to3.mjs';
import { UNITS_4_TO_7 } from './algebra1ThanksgivingPacket/units4to7.mjs';
import { UNITS_8_TO_10 } from './algebra1ThanksgivingPacket/units8to10.mjs';

export const REGULAR_FILE = 'teacher-import-jsons/thanksgiving-packet/Algebra1_Thanksgiving_Packet.json';
export const HONORS_FILE = 'teacher-import-jsons/thanksgiving-packet/Algebra1_Thanksgiving_Packet_Honors.json';

export const PACKET_UNITS = Object.freeze([...UNITS_1_TO_3, ...UNITS_4_TO_7, ...UNITS_8_TO_10]);

const clone = (value) => JSON.parse(JSON.stringify(value));

// The skill an example teaches, as the coverage rule reads it
// (classworkCoverage.js): the first student action with the primary standard.
const skillOf = (question) => `${question.studentActions[0]} ${question.standard}`;

/**
 * Every question is taught before it is asked: it names an example the packet
 * has, or an earlier question on its skill does, or it says why it needs none.
 * A question that opens an example also carries the guided notes Classwork
 * shows today, since the example player is not live yet. Every example is
 * opened by a question.
 */
const assertCovered = (questions, examples, label) => {
  const ids = new Set(examples.map((entry) => entry.id));
  const used = new Set();
  const taught = new Set();
  questions.forEach((question) => {
    const skill = skillOf(question);
    if (typeof question.example === 'string') {
      if (!ids.has(question.example)) throw new Error(`${label} ${question.questionId}: no example "${question.example}".`);
      // An example may be named again by a later question on the same skill:
      // the platform plays it there on request. Without the name the student
      // would be offered the skill's FIRST example, which can be another
      // method (found in the browser check, 2026-11-21).
      // The question an example opens on (its first) carries the guided notes; a later one that names it again need not.
      if (!used.has(question.example) && !question.guidedNotes) throw new Error(`${label} ${question.questionId}: a question that opens an example needs guided notes.`);
      used.add(question.example);
      taught.add(skill);
    } else if (!question.example?.none && !taught.has(skill)) {
      throw new Error(`${label} ${question.questionId}: nothing teaches "${skill}" before it. Name an example or an exemption.`);
    }
  });
  examples.forEach((entry) => { if (!used.has(entry.id)) throw new Error(`${label}: example "${entry.id}" is opened by no question.`); });
};

const section = (unit, questions, minutes) => ({
  id: `unit-${unit.number}`,
  role: 'classwork',
  title: unit.title,
  recommendedMinutes: minutes,
  feedbackMode: 'immediate',
  hintsAllowed: true,
  questions: clone(questions),
});

const INSTRUCTIONS = 'This packet reviews everything from the start of the year. There is one section for each unit, and each section starts with the basics and builds up. Work in the tool on each question: it checks your steps. A worked example opens before each new kind of question; read it first. You can try each question as many times as you need, and hints are there when you need them. The answer is not shown until you get it right. Do a section or two a day.';

const packet = ({ title, instructions, units, examples }) => {
  const lesson = {
    schemaVersion: 5,
    assignment: {
      title,
      courseId: 'algebra1',
      folder: 'Algebra I/Thanksgiving Packet',
      instructionalPurpose: 'review',
      gradingPurpose: 'classwork',
      instructions,
    },
    variantPolicy: { mode: 'shared' },
    gradingPolicy: { attemptPolicy: 'unlimited', scoring: 'platformDefault' },
    lessonSupports: { examples: clone(examples) },
    sections: units,
  };
  assertCovered(lesson.sections.flatMap((entry) => entry.questions), lesson.lessonSupports.examples, title);
  return lesson;
};

export const REGULAR_PACKET = packet({
  title: 'Algebra I — Thanksgiving Break Packet',
  instructions: INSTRUCTIONS,
  units: PACKET_UNITS.map((unit) => section(unit, unit.questions, unit.minutes)),
  examples: PACKET_EXAMPLES.regular,
});

export const HONORS_PACKET = packet({
  title: 'Algebra I Honors — Thanksgiving Break Packet',
  instructions: `${INSTRUCTIONS} The last question or two of each section is an Honors question.`,
  units: PACKET_UNITS.map((unit) => section(unit, [...unit.questions, ...unit.honors], unit.honorsMinutes)),
  examples: [...PACKET_EXAMPLES.regular, ...PACKET_EXAMPLES.honors],
});

export const THANKSGIVING_PACKET_FILES = Object.freeze([
  Object.freeze({ file: REGULAR_FILE, lesson: REGULAR_PACKET }),
  Object.freeze({ file: HONORS_FILE, lesson: HONORS_PACKET }),
]);
export const expectedFileText = (entry) => lessonText(entry.lesson);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  THANKSGIVING_PACKET_FILES.forEach((entry) => {
    const file = writeLessonFile(entry.file, entry.lesson);
    console.log(`wrote ${path.relative(process.cwd(), file)}`);
  });
}
