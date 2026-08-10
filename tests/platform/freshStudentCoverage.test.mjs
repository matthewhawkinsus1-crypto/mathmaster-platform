import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MINIMUM_ISSUABLE_FAMILIES, buildCoverageIndex, isSkillLaunchable, summarizeCoverage,
} from '../../functions/shared/pathCoverage.mjs';
import { recordFamilyUse, selectNextFamily } from '../../functions/shared/pathQuestionSelection.mjs';
import { isPathEligible } from '../../functions/shared/pathToolContracts.mjs';
import { getWheelTeksForCourse } from '../../src/platform/mastery/strandConfig.js';

// A fresh student, clicking every standard on the wheel, must never meet
// "No authored question ... aligned to [TEKS]".
//
// The bank starts EMPTY by decision, so this file does two things: it proves
// that an empty bank is honest rather than broken, and it proves that a bank
// seeded to the five-slot target actually carries a full session for every
// standard. Between them, they are the acceptance test the seed package has to
// pass once it is imported.

const SLOTS = [
  { slot: 'foundation', difficultyBand: 2, dok: 1 },
  { slot: 'core', difficultyBand: 3, dok: 2 },
  { slot: 'representation', difficultyBand: 3, dok: 2 },
  { slot: 'application', difficultyBand: 4, dok: 3 },
  { slot: 'challenge', difficultyBand: 5, dok: 3 },
];

/** The five families a standard is supposed to have, as real gradeable items. */
const familiesFor = (code) => SLOTS.map((slot) => ({
  id: `${code}-${slot.slot}`,
  type: 'algebra',
  prompt: `Solve for x. (${code}, ${slot.slot})`,
  equationLatex: '2x + 5 = 13',
  variable: 'x',
  answer: '4',
  alignmentKeys: [`texas:${code}`],
  difficultyBand: slot.difficultyBand,
  dok: slot.dok,
  active: true,
}));

const indexFor = (courseId, bankItems) => buildCoverageIndex({
  courseId,
  wheelTeks: getWheelTeksForCourse(courseId),
  bankItems,
  // Issuability is the real contract check, not a stub.
  plans: Object.fromEntries(bankItems.map((entry) => [entry.id, { issuable: isPathEligible(entry), reason: null }])),
});

/** Play a whole session on one standard, returning the families issued. */
const playSession = (candidates, { preferredBand = 3, questions = 5 } = {}) => {
  let usage = {};
  const issued = [];
  for (let index = 0; index < questions; index += 1) {
    const choice = selectNextFamily(candidates, { preferredBand, usage });
    assert.ok(choice, 'a covered standard must always produce a question');
    issued.push(choice.question.id);
    usage = recordFamilyUse(usage, choice.question.id, index + 1);
  }
  return issued;
};

// --- An empty bank is honest, not broken -------------------------------------------

test('with an empty bank no standard is launchable, and nothing pretends otherwise', () => {
  ['algebra1', 'algebra2'].forEach((courseId) => {
    const index = indexFor(courseId, []);
    assert.ok(index.summary.wheelSkills > 0, `${courseId} has a wheel`);
    assert.equal(index.summary.studentReady, 0);
    assert.equal(index.summary.fullyCovered, false);
    getWheelTeksForCourse(courseId).forEach((code) => {
      assert.equal(isSkillLaunchable(index, code), false, `${code} must not be clickable`);
    });
  });
});

// --- A bank seeded to the target carries every student ------------------------------

test('seeded to five families per standard, every wheel standard is launchable', () => {
  ['algebra1', 'algebra2'].forEach((courseId) => {
    const wheel = getWheelTeksForCourse(courseId);
    const bank = wheel.flatMap(familiesFor);
    const index = indexFor(courseId, bank);

    assert.equal(index.summary.wheelSkills, wheel.length);
    assert.equal(index.summary.studentReady, wheel.length, `${courseId} should be fully ready`);
    assert.equal(index.summary.fullyCovered, true);
    assert.deepEqual(summarizeCoverage(index, { onlyGaps: true }), [], `${courseId} has no gaps`);
  });
});

test('every standard supplies a five-question session with no repeats', () => {
  ['algebra1', 'algebra2'].forEach((courseId) => {
    const wheel = getWheelTeksForCourse(courseId);
    wheel.forEach((code) => {
      const families = familiesFor(code);
      // Whatever readiness band the student arrives at, the session must use
      // five different families — this is the selector bug, checked across the
      // whole course rather than on one fixture.
      [2, 3, 4, 5].forEach((preferredBand) => {
        const issued = playSession(families, { preferredBand });
        assert.equal(
          new Set(issued).size, 5,
          `${code} at band ${preferredBand} repeated within one session: ${issued.join(', ')}`,
        );
      });
    });
  });
});

test('four families is one short, and the coverage index says so before a student finds out', () => {
  const courseId = 'algebra1';
  const wheel = getWheelTeksForCourse(courseId);
  const short = wheel.flatMap((code) => familiesFor(code).slice(0, 4));
  const index = indexFor(courseId, short);

  assert.equal(index.summary.studentReady, 0, 'four families is not a session');
  assert.equal(index.summary.minimal, wheel.length, 'and it is reported as progress, not as nothing');
  assert.equal(isSkillLaunchable(index, wheel[0]), false);
});

// --- The published target ------------------------------------------------------------

test('the platform coverage target agrees with the five-family minimum', async () => {
  const raw = await readFile(new URL('./fixtures/fullPlatformCoverageTarget.json', import.meta.url), 'utf8');
  const target = JSON.parse(raw);

  assert.equal(target.familiesPerContentStandard, MINIMUM_ISSUABLE_FAMILIES);
  assert.equal(target.familySlots.length, MINIMUM_ISSUABLE_FAMILIES);
  assert.deepEqual(target.familySlots.map((slot) => slot.slot), SLOTS.map((slot) => slot.slot));
  assert.deepEqual(target.familySlots.map((slot) => slot.difficultyBand), SLOTS.map((slot) => slot.difficultyBand));

  // The arithmetic in the plan has to be the arithmetic in the file.
  const courses = Object.values(target.courses);
  const contentStandards = courses.reduce((total, course) => total + course.contentStandards, 0);
  const requiredFamilies = courses.reduce((total, course) => total + course.requiredFamilies, 0);
  assert.equal(contentStandards, 237, 'the active content-standard count');
  assert.equal(requiredFamilies, contentStandards * MINIMUM_ISSUABLE_FAMILIES);
  assert.equal(requiredFamilies, 1185);

  courses.forEach((course) => {
    assert.equal(course.totalExpectations - course.processExpectations, course.contentStandards);
    assert.equal(course.standards.length, course.contentStandards);
    course.standards.forEach((standard) => {
      assert.equal(standard.requiredFamilies, MINIMUM_ISSUABLE_FAMILIES);
      assert.equal(standard.slots.length, MINIMUM_ISSUABLE_FAMILIES);
    });
  });
});

test('every Algebra wheel standard appears in the platform target', async () => {
  const raw = await readFile(new URL('./fixtures/fullPlatformCoverageTarget.json', import.meta.url), 'utf8');
  const target = JSON.parse(raw);
  const targeted = new Set(Object.values(target.courses).flatMap((course) => course.standards.map((entry) => entry.code)));

  ['algebra1', 'algebra2'].forEach((courseId) => {
    const missing = getWheelTeksForCourse(courseId).filter((code) => !targeted.has(code));
    assert.deepEqual(missing, [], `${courseId} wheel standards absent from the target: ${missing.join(', ')}`);
  });
});
