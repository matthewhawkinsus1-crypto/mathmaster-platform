// "DO NOT CREATE A WALL OF CHARTS."
//
// A wall of charts is what you get for free — every number here is already
// computed somewhere, and putting all of them on one page takes no decisions.
// These tests pin the decisions: what gets said, what gets left out, and the
// distinctions that a chart would silently flatten.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bandDistribution, strugglingStandards, rigorReach, buildClassOverview,
  OVERVIEW_SECTION,
} from '../../src/platform/teacher/classOverview.js';

const established = (band) => ({
  baseline: { established: true, events: 14 },
  instructionalBand: band,
});
const unestablished = { baseline: { established: false, events: 3 } };

const roster = (bands) => bands.map((band, index) => ({
  id: `s${index}`, displayName: `Student ${String(index).padStart(2, '0')}`, band,
}));

const profilesFor = (students) => Object.fromEntries(students.map((student) => [
  student.id, student.band === null ? unestablished : established(student.band),
]));

// --- the distinction a chart flattens ------------------------------------------

test('students without a baseline are counted apart, never folded into "on level"', () => {
  // A class of 30 where 12 are still establishing a baseline is a different
  // class from one where 12 are confirmed on level. A screen that renders both
  // as the same green bar is lying to the teacher.
  const students = roster([null, null, 'on', 'above', 'below']);
  const bands = bandDistribution(students, profilesFor(students));
  assert.equal(bands.unclassified.length, 2);
  assert.equal(bands.on.length, 1);
  assert.ok(!bands.on.some((entry) => entry.studentId === 's0'));
});

test('the headline says so when most of the class cannot be described yet', () => {
  const students = roster([null, null, null, null, 'on']);
  const overview = buildClassOverview({
    className: 'Period 3', students, profilesByStudentId: profilesFor(students),
  });
  assert.match(overview.headline, /Only 1 of 5/);
});

test('a class nobody has worked in yet is described as exactly that', () => {
  const students = roster([null, null, null]);
  const overview = buildClassOverview({
    className: 'Period 3', students, profilesByStudentId: profilesFor(students), openAssignments: 2,
  });
  assert.match(overview.headline, /No student in Period 3 has enough completed work/);
  assert.match(overview.headline, /2 assignments open/);
});

test('"still establishing a baseline" is stated as not being a performance finding', () => {
  // The temptation is to read a grey chip as "fine". It means "unknown".
  const students = roster(['on', 'on', 'on', null, null]);
  const overview = buildClassOverview({ students, profilesByStudentId: profilesFor(students) });
  const finding = overview.findings.find((entry) => entry.headline.includes('establishing a baseline'));
  assert.ok(finding);
  assert.match(finding.detail, /Not a performance finding/);
});

// --- silence -------------------------------------------------------------------

test('a class where everything is fine produces no findings about students', () => {
  const students = roster(['on', 'on', 'above', 'on', 'above']);
  const overview = buildClassOverview({ students, profilesByStudentId: profilesFor(students) });
  assert.deepEqual(
    overview.findings.filter((entry) => entry.section === OVERVIEW_SECTION.BANDS),
    [],
    '"5 students on track" is the absence of an observation, not one',
  );
});

test('a standard two students have touched is not reported as a class problem', () => {
  // Reporting it sends a teacher to reteach something twenty-eight people
  // already know.
  const students = roster(['on', 'on', 'on', 'on', 'on', 'on']);
  const mastery = {
    s0: { teks: { 'A.5C': { score: 20 } } },
    s1: { teks: { 'A.5C': { score: 30 } } },
  };
  assert.deepEqual(strugglingStandards(students, mastery), []);
});

test('a standard most of the class is failing IS reported, worst first', () => {
  const students = roster(['on', 'on', 'on', 'on', 'on', 'on']);
  const mastery = Object.fromEntries(students.map((student, index) => [student.id, {
    teks: {
      'A.5C': { score: index < 5 ? 40 : 90 },
      'A.2A': { score: index < 3 ? 55 : 95 },
      'A.9B': { score: 92 },
    },
  }]));
  const found = strugglingStandards(students, mastery);
  assert.equal(found[0].code, 'A.5C', 'the widest problem first');
  assert.ok(found.some((entry) => entry.code === 'A.2A'));
  assert.ok(!found.some((entry) => entry.code === 'A.9B'), 'a standard the class has is not a finding');
  assert.equal(found[0].atRisk[0].score, 40);
});

// --- the number a teacher has no other way to see ------------------------------

test('adaptation is measured from delivered evidence, not from the assignment setting', () => {
  // An assignment can be set to adaptive and still deliver everyone the same
  // question. Only the evidence knows which happened.
  const reach = rigorReach({
    s0: [
      { questionSnapshot: { adapted: true, assignedDifficultyBand: 3, difficultyBand: 4 } },
      { questionSnapshot: { adapted: false, assignedDifficultyBand: 3, difficultyBand: 3 } },
    ],
    s1: [
      { questionSnapshot: { adapted: true, assignedDifficultyBand: 3, difficultyBand: 2 } },
      { questionSnapshot: { adapted: false, assignedDifficultyBand: 3, difficultyBand: 3 } },
    ],
  });
  assert.equal(reach.delivered, 4);
  assert.equal(reach.adapted, 2);
  assert.equal(reach.raisedFor, 1);
  assert.equal(reach.loweredFor, 1);
});

test('"nothing was adapted" is reported rather than left as an empty space', () => {
  const students = roster(['on', 'on']);
  const overview = buildClassOverview({
    students,
    profilesByStudentId: profilesFor(students),
    evidenceByStudentId: { s0: [{ questionSnapshot: { adapted: false, difficultyBand: 3, assignedDifficultyBand: 3 } }] },
  });
  const rigor = overview.findings.find((entry) => entry.section === OVERVIEW_SECTION.RIGOR);
  assert.match(rigor.headline, /No question delivered to this class has been adapted/);
  // And it does not accuse anyone of anything — both explanations are named.
  assert.match(rigor.detail, /Both are legitimate/);
});

test('with no delivered evidence at all, the rigor line is omitted rather than guessed', () => {
  const students = roster(['on', 'on']);
  const overview = buildClassOverview({ students, profilesByStudentId: profilesFor(students) });
  assert.ok(!overview.findings.some((entry) => entry.section === OVERVIEW_SECTION.RIGOR));
});

// --- progressive disclosure ----------------------------------------------------

test('every finding carries the students behind it, so the names are one click away', () => {
  const students = roster(['below', 'below', 'on', null]);
  const overview = buildClassOverview({ students, profilesByStudentId: profilesFor(students) });
  overview.findings
    .filter((entry) => entry.section === OVERVIEW_SECTION.BANDS)
    .forEach((entry) => {
      assert.ok(entry.students.length > 0, `${entry.headline} names nobody`);
      entry.students.forEach((child) => assert.ok(child.studentName));
    });
});

test('an empty roster says so and stops', () => {
  const overview = buildClassOverview({ className: 'Period 7', students: [] });
  assert.match(overview.headline, /no students yet/);
  assert.deepEqual(overview.findings, []);
});
