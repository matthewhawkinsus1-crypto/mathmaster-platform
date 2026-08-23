// GROUPS, NOT LABELS.
//
// Grouping students by need is ordinary teaching. Grouping students by a label
// the software assigned them, which then follows them for a year, is tracking.
// The difference is entirely in the details these tests pin: nothing stored,
// every placement carrying its reason, and — the one the previous
// implementation got wrong — a student without enough evidence NOT being swept
// into the "on track" pile.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GROUP, GROUP_ORDER, buildInstructionalGroups, groupForStudent,
} from '../../src/platform/teacher/instructionalGroups.js';

const profile = (overrides = {}) => ({
  baseline: { established: true, events: 14, requirement: { events: 12 } },
  instructionalBand: 'on',
  foundationGapDepth: 0,
  dokProfile: {},
  skillsWithEvidence: 5,
  retentionStrength: null,
  engagement: 'onTrack',
  ...overrides,
});

const place = (studentProfile) => groupForStudent({
  studentId: 's1', studentName: 'Rivera, Ana', profile: studentProfile,
});

test('a student without enough evidence is NOT reported as on track', () => {
  // The specific defect. The old tier calculator swept every unclassified
  // student into Tier 1, so a brand-new student with four answered questions
  // was shown to the teacher as "on track". They are not on track. They are
  // unknown, which is a different thing to tell a teacher.
  const placement = place(profile({ baseline: { established: false, events: 4, requirement: { events: 12 } } }));
  assert.equal(placement.group, GROUP.BASELINE);
  assert.notEqual(placement.group, GROUP.CORE);
  assert.match(placement.reason, /4 of 12/);
  assert.match(placement.reason, /Not placed/);
});

test('a student with no profile at all is also unplaced, not defaulted', () => {
  assert.equal(groupForStudent({ studentId: 's', studentName: 'x', profile: null }).group, GROUP.BASELINE);
});

test('a confirmed prerequisite gap is intensive, and says how deep', () => {
  const placement = place(profile({ foundationGapDepth: 3, instructionalBand: 'below' }));
  assert.equal(placement.group, GROUP.INTENSIVE);
  assert.match(placement.reason, /3 levels below/);
});

test('a reasoning gap is targeted, and the reason names the reasoning', () => {
  // "Targeted" with no reason would send a teacher to easier numbers, which is
  // exactly the wrong move for this student.
  const placement = place(profile({
    dokProfile: {
      1: { attempts: 10, accuracy: 0.95, confident: true },
      2: { attempts: 8, accuracy: 0.25, confident: true },
    },
  }));
  assert.equal(placement.group, GROUP.TARGETED);
  assert.match(placement.reason, /reasoning/i);
});

test('above level with reasoning evidence is extension, not acceleration', () => {
  const placement = place(profile({ instructionalBand: 'above' }));
  assert.equal(placement.group, GROUP.EXTENSION);
});

test('a student with nothing in the way gets core instruction and says so plainly', () => {
  const placement = place(profile());
  assert.equal(placement.group, GROUP.CORE);
  assert.match(placement.reason, /Nothing specific is in the way/);
});

test('every placement carries a reason — a group without one is a label', () => {
  const cases = [
    profile(),
    profile({ instructionalBand: 'above' }),
    profile({ instructionalBand: 'below' }),
    profile({ foundationGapDepth: 2 }),
    profile({ baseline: { established: false, events: 1, requirement: { events: 12 } } }),
  ];
  cases.forEach((entry) => {
    const placement = place(entry);
    assert.ok(placement.reason && placement.reason.length > 20, `${placement.group} has no usable reason`);
  });
});

test('the groups agree with the needs-attention queue, because they read the same findings', () => {
  // If these two ever diverge, a teacher gets one story on Home and another on
  // Analytics about the same child on the same afternoon.
  const struggling = profile({ retentionStrength: 0.2, retentionScheduleCount: 9 });
  const placement = place(struggling);
  assert.equal(placement.group, GROUP.TARGETED);
  assert.ok(placement.findings.some((finding) => finding.rule === 'retentionSlipping'));
});

test('an empty group is still returned, because "nobody needs this" is information', () => {
  const groups = buildInstructionalGroups({
    students: [{ id: 's1', displayName: 'A' }],
    profilesByStudentId: { s1: profile() },
  });
  assert.equal(groups.length, GROUP_ORDER.length);
  const intensive = groups.find((entry) => entry.group === GROUP.INTENSIVE);
  assert.deepEqual(intensive.students, []);
});

test('nothing is stored on the student — the same student regroups when the evidence changes', () => {
  const before = buildInstructionalGroups({
    students: [{ id: 's1', displayName: 'A' }],
    profilesByStudentId: { s1: profile({ foundationGapDepth: 3 }) },
  });
  const after = buildInstructionalGroups({
    students: [{ id: 's1', displayName: 'A' }],
    profilesByStudentId: { s1: profile() },
  });
  assert.equal(before.find((entry) => entry.group === GROUP.INTENSIVE).students.length, 1);
  assert.equal(after.find((entry) => entry.group === GROUP.INTENSIVE).students.length, 0);
  assert.equal(after.find((entry) => entry.group === GROUP.CORE).students.length, 1);
});

test('intensive is listed first, because it is the group a teacher must not scroll past', () => {
  assert.equal(GROUP_ORDER[0], GROUP.INTENSIVE);
  assert.equal(GROUP_ORDER.at(-1), GROUP.BASELINE);
});
