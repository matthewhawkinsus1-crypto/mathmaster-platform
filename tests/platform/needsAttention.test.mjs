// THE ALERTS A TEACHER SHOULD GET, AND — MORE IMPORTANTLY — THE ONES THEY SHOULD NOT.
//
// The failure mode of a "needs attention" screen is not missing something. It
// is crying wolf until the teacher stops reading it, at which point the one
// alert that mattered is buried under forty that did not. So most of this file
// is about SILENCE: the cases where the honest answer is to say nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALERT_KIND, URGENCY, THRESHOLDS,
  academicFindingsFor, completionFindingsFor, systemFindings,
  buildNeedsAttentionQueue, filterQueue, summarizeQueue,
} from '../../src/platform/teacher/needsAttention.js';

const profile = (overrides = {}) => ({
  baseline: { established: true, events: 14 },
  instructionalBand: 'on',
  foundationGapDepth: 0,
  dokProfile: {},
  skillsWithEvidence: 5,
  retentionStrength: null,
  engagement: 'onTrack',
  ...overrides,
});

const student = { studentId: 's1', studentName: 'Rivera, Ana', classId: 'c-1' };

// --- silence ------------------------------------------------------------------

test('a single wrong question produces no alert', () => {
  // The rule the whole design rests on. One incorrect answer is a Tuesday.
  const findings = academicFindingsFor({
    ...student,
    profile: profile({
      baseline: { established: false, events: 1 },
      dokProfile: { 2: { attempts: 1, accuracy: 0, confident: false } },
    }),
  });
  assert.deepEqual(findings, []);
});

test('nothing academic is claimed before the profile has established a baseline', () => {
  // Even a profile that LOOKS alarming stays silent while the evidence is thin.
  // "We don't know yet" is not something to interrupt a teacher about.
  const findings = academicFindingsFor({
    ...student,
    profile: profile({ baseline: { established: false, events: 5 }, instructionalBand: 'below', foundationGapDepth: 3 }),
  });
  assert.deepEqual(findings, []);
});

test('a student with no profile at all produces nothing', () => {
  assert.deepEqual(academicFindingsFor({ ...student, profile: null }), []);
});

test('a thin DOK bucket cannot produce a reasoning alert', () => {
  const findings = academicFindingsFor({
    ...student,
    profile: profile({
      dokProfile: {
        1: { attempts: 8, accuracy: 0.9, confident: true },
        // One attempt below the floor. A rumour, not a finding.
        2: { attempts: THRESHOLDS.minAttemptsPerBucket - 1, accuracy: 0, confident: false },
      },
    }),
  });
  assert.ok(!findings.some((finding) => finding.rule === 'reasoningGap'));
});

test('a teacher is not nagged about the weekly path on Monday', () => {
  const early = completionFindingsFor({
    ...student, profile: profile(), weekly: { goal: 4, complete: 0 }, weekFraction: 0.2,
  });
  assert.ok(!early.some((finding) => finding.rule === 'weeklyPathBehind'));
  const late = completionFindingsFor({
    ...student, profile: profile(), weekly: { goal: 4, complete: 0 }, weekFraction: 0.8,
  });
  assert.ok(late.some((finding) => finding.rule === 'weeklyPathBehind'));
});

// --- the findings that ARE worth an interruption -------------------------------

test('a confirmed prerequisite gap outranks a below-level label and replaces it', () => {
  // Both are true; only one is actionable. Emitting both would be two alerts
  // about one situation.
  const findings = academicFindingsFor({ ...student, profile: profile({ foundationGapDepth: 3, instructionalBand: 'below' }) });
  const rules = findings.map((finding) => finding.rule);
  assert.ok(rules.includes('foundationGap'));
  assert.ok(!rules.includes('belowLevel'));
});

test('"can compute, cannot reason" is surfaced as its own finding', () => {
  // The finding difficulty alone cannot see. This student does not need easier
  // numbers, and an alert that only said "struggling" would send the teacher
  // the wrong way.
  const findings = academicFindingsFor({
    ...student,
    profile: profile({
      dokProfile: {
        1: { attempts: 10, accuracy: 0.9, confident: true },
        2: { attempts: 8, accuracy: 0.3, confident: true },
      },
    }),
  });
  const reasoning = findings.find((finding) => finding.rule === 'reasoningGap');
  assert.ok(reasoning);
  assert.match(reasoning.detail, /Easier numbers will not help/);
});

test('slipping retention is caught even though current work looks fine', () => {
  const findings = academicFindingsFor({
    ...student,
    profile: profile({ retentionStrength: 0.3, retentionScheduleCount: 8 }),
  });
  assert.ok(findings.some((finding) => finding.rule === 'retentionSlipping'));
});

test('the retention rule fires against a REAL profile, not only a hand-made one', async () => {
  // THE TEST THAT FOUND THE BUG. The rule above passes with a fixture that
  // supplies `retentionScheduleCount` — and the real profile did not expose it,
  // so in production the count was always zero, the threshold never met, and
  // this alert could not fire for anybody. A rule that passes its unit test and
  // cannot fire against real data is worse than no rule: it looks like coverage.
  const { buildStudentLearningProfile } = await import('../../src/platform/profile/studentLearningProfile.js');
  const events = Array.from({ length: 14 }, (unused, index) => ({
    eventKey: `r${index}`,
    occurredAt: 1_770_000_000_000 + (index * 60_000),
    alignmentKeys: [`A.${index % 4}A`],
    questionSnapshot: { dok: 2, difficultyBand: 3, questionInstanceId: `q${index}` },
    performance: { status: 'finalized', isCorrect: true, score: 1 },
    source: { kind: 'path', activityRole: index % 2 ? 'practice' : 'dol' },
  }));
  const retentionSchedules = Object.fromEntries(
    Array.from({ length: 8 }, (unused, index) => [`A.${index}A`, { status: index < 6 ? 'lapsed' : 'retained' }]),
  );

  const real = buildStudentLearningProfile({ courseId: 'algebra1', evidenceEvents: events, retentionSchedules });
  assert.equal(real.retentionScheduleCount, 8, 'the profile must report its denominator');
  assert.ok(real.retentionStrength < 0.5);

  const findings = academicFindingsFor({ studentId: 's9', studentName: 'Real, Student', profile: real });
  assert.ok(findings.some((finding) => finding.rule === 'retentionSlipping'), 'the rule must fire on a real profile');
});

test('a real profile with too few schedules stays silent', () => {
  // Both halves of the threshold, checked the same way.
  const findings = academicFindingsFor({
    ...student,
    profile: profile({ retentionStrength: 0.1, retentionScheduleCount: 2 }),
  });
  assert.ok(!findings.some((finding) => finding.rule === 'retentionSlipping'));
});

// --- completion is never dressed up as failure ---------------------------------

test('a strong student who is behind is flagged for completion, not performance', () => {
  // "Do not make an academically strong student look academically weak merely
  // because they are not completing work."
  const findings = completionFindingsFor({
    ...student,
    profile: profile({ instructionalBand: 'above' }),
    weekly: { goal: 4, complete: 0, overdue: true },
    weekFraction: 0.9,
  });
  const behind = findings.find((finding) => finding.rule === 'weeklyPathBehind');
  assert.equal(behind.kind, ALERT_KIND.COMPLETION);
  assert.match(behind.detail, /completion gap, not a performance one/);
  assert.match(behind.detail, /above the course expectation/);
});

test('an above-level student generates no academic alert at all', () => {
  assert.deepEqual(academicFindingsFor({ ...student, profile: profile({ instructionalBand: 'above' }) }), []);
});

// --- roll-up -------------------------------------------------------------------

const rosterOf = (count, classId = 'c-1') => Array.from({ length: count }, (unused, index) => ({
  id: `s${index}`, displayName: `Student ${String(index).padStart(2, '0')}`, classId,
}));

test('a class-wide pattern becomes one alert, not thirty', () => {
  const students = rosterOf(30);
  const profilesByStudentId = Object.fromEntries(students.map((entry, index) => [
    entry.id,
    // Twelve of thirty below level: 40%, past the roll-up share.
    profile({ instructionalBand: index < 12 ? 'below' : 'on' }),
  ]));
  const queue = buildNeedsAttentionQueue({
    students, profilesByStudentId, classSizes: { 'c-1': 30 }, classCount: 1,
  });
  const belowAlerts = queue.filter((alert) => alert.rule === 'belowLevel');
  assert.equal(belowAlerts.length, 1, 'twelve findings collapsed to one');
  assert.match(belowAlerts[0].headline, /12 of 30 students/);
  assert.equal(belowAlerts[0].studentId, null, 'it is a fact about the class');
  assert.equal(belowAlerts[0].students.length, 12, 'and it still names every one of them');
});

test('a handful of students stays a handful of alerts', () => {
  // Three of thirty is not a pattern in the instruction. Rolling it up would
  // hide which three.
  const students = rosterOf(30);
  const profilesByStudentId = Object.fromEntries(students.map((entry, index) => [
    entry.id, profile({ instructionalBand: index < 3 ? 'below' : 'on' }),
  ]));
  const queue = buildNeedsAttentionQueue({
    students, profilesByStudentId, classSizes: { 'c-1': 30 }, classCount: 1,
  });
  assert.equal(queue.filter((alert) => alert.rule === 'belowLevel').length, 3);
  assert.ok(queue.every((alert) => alert.rule !== 'belowLevel' || alert.studentId));
});

// --- ranking, filtering, system ------------------------------------------------

test('the most urgent thing is first, and a truncated read is the most urgent thing', () => {
  const queue = buildNeedsAttentionQueue({
    students: rosterOf(4),
    profilesByStudentId: Object.fromEntries(rosterOf(4).map((entry) => [entry.id, profile({ instructionalBand: 'below' })])),
    classSizes: { 'c-1': 4 },
    classCount: 1,
    weeklyProgressTruncated: true,
  });
  assert.equal(queue[0].rule, 'weeklyProgressTruncated');
  assert.equal(queue[0].urgency, URGENCY.NOW);
  assert.match(queue[0].detail, /Do not publish weekly grades/);
});

test('students on no roster are reported as a system problem, not a student problem', () => {
  const findings = systemFindings({
    unplaceable: [{ id: 's9', displayName: 'Okafor, Chidi' }], classCount: 2,
  });
  const alert = findings.find((finding) => finding.rule === 'unplaceableStudents');
  assert.equal(alert.kind, ALERT_KIND.SYSTEM);
  assert.match(alert.detail, /Okafor, Chidi/);
});

test('filters are ANDed, and an unset filter filters nothing', () => {
  const students = rosterOf(6);
  const profilesByStudentId = Object.fromEntries(students.map((entry, index) => [
    entry.id, profile({ instructionalBand: index === 0 ? 'below' : 'on', engagement: index === 1 ? 'needsFollowUp' : 'onTrack' }),
  ]));
  const queue = buildNeedsAttentionQueue({ students, profilesByStudentId, classSizes: { 'c-1': 6 }, classCount: 1 });

  assert.equal(filterQueue(queue, {}).length, queue.length);
  assert.ok(filterQueue(queue, { kind: ALERT_KIND.ACADEMIC }).every((alert) => alert.kind === ALERT_KIND.ACADEMIC));
  assert.ok(filterQueue(queue, { studentId: 's0' }).every((alert) => alert.studentId === 's0'));
  assert.equal(filterQueue(queue, { kind: ALERT_KIND.ACADEMIC, studentId: 's1' }).length, 0, 's1 is a completion case, not an academic one');
  assert.equal(filterQueue(queue, { classId: 'nope' }).length, 0);
});

test('a filter by student finds them inside a rolled-up class alert too', () => {
  const students = rosterOf(10);
  const profilesByStudentId = Object.fromEntries(students.map((entry) => [entry.id, profile({ instructionalBand: 'below' })]));
  const queue = buildNeedsAttentionQueue({ students, profilesByStudentId, classSizes: { 'c-1': 10 }, classCount: 1 });
  assert.equal(queue.filter((alert) => alert.rule === 'belowLevel').length, 1, 'rolled up');
  assert.equal(filterQueue(queue, { studentId: 's4' }).length, 1, 'and still findable by name');
});

test('the summary counts what the chips claim', () => {
  const students = rosterOf(5);
  const profilesByStudentId = Object.fromEntries(students.map((entry, index) => [
    entry.id, profile({ instructionalBand: index === 0 ? 'below' : 'on' }),
  ]));
  const queue = buildNeedsAttentionQueue({ students, profilesByStudentId, classSizes: { 'c-1': 5 }, classCount: 1 });
  const summary = summarizeQueue(queue);
  assert.equal(summary.total, queue.length);
  assert.equal(
    Object.values(summary.byKind).reduce((sum, value) => sum + value, 0),
    queue.length,
  );
});

test('a quiet class produces an empty queue rather than filler', () => {
  const students = rosterOf(20);
  const profilesByStudentId = Object.fromEntries(students.map((entry) => [entry.id, profile()]));
  const queue = buildNeedsAttentionQueue({ students, profilesByStudentId, classSizes: { 'c-1': 20 }, classCount: 1 });
  assert.deepEqual(queue, []);
});
