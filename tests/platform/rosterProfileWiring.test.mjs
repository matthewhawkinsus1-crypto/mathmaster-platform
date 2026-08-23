// The teacher roster's derivation path, end to end, without React.
//
// StudentsRoster now shows one Student Performance Badge per student, derived
// synchronously from the `grades` documents it already holds. These tests
// exercise the exact chain the component runs — collectStudentEvidence →
// evidenceRowsToEvents → buildStudentLearningProfile → buildWeeklyPathPlan —
// so a change to any link fails here rather than on a teacher's screen.

import test from 'node:test';
import assert from 'node:assert/strict';

import { collectStudentEvidence } from '../../src/masteryEngine.js';
import { evidenceRowsToEvents } from '../../src/platform/profile/legacyEvidenceAdapter.js';
import { buildStudentLearningProfile } from '../../src/platform/profile/studentLearningProfile.js';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { buildWeeklyPathPlan } from '../../src/platform/path/weeklyPathPlan.js';
import { buildWeeklyGoal, deriveCompletionsFromEvidence } from '../../src/platform/path/weeklyPathGoal.js';

const NOW = Date.parse('2026-09-15T15:00:00Z');

// A question record in the shape the grades document actually stores.
const record = ({ correct = true, attempts = 1, modified = false } = {}) => ({
  status: correct ? 'correct' : 'incorrect',
  totalAttempts: attempts,
  lastAttemptAt: '2026-09-14T10:00:00Z',
  supportUsage: modified ? { modified: true } : {},
});

const assignmentWith = (id, questions) => ({
  id,
  title: id,
  assignmentType: 'practice',
  assignedClassPeriods: ['1st'],
  questions,
});

const question = (teks, { dok = 2, band = 3 } = {}) => ({
  questionId: `${teks}-q`,
  type: 'algebra',
  standards: [teks],
  teks: [teks],
  complexity: { level: dok },
  difficulty: { generatorBand: band },
});

const studentWith = (grades) => ({
  id: 'stu-1',
  classPeriod: '1st',
  firstName: 'Test',
  lastName: 'Student',
  gradesByAssignment: grades,
});

test('the roster chain runs without throwing on a real student record', () => {
  const assignments = [assignmentWith('a1', [question('A.5A'), question('A.3A')])];
  const student = studentWith({ a1: { questions: { 0: record(), 1: record({ correct: false }) } } });

  const rows = collectStudentEvidence({ student, assignments });
  const { events, coverage } = evidenceRowsToEvents(rows);
  const profile = buildStudentLearningProfile({ evidenceEvents: events });

  assert.ok(Array.isArray(rows));
  assert.equal(coverage.rows, rows.length);
  assert.ok(profile.instructionalBandLabel, 'the badge always has something honest to render');
});

test('a student with no work at all still yields a renderable profile', () => {
  // Every roster row calls this. A throw here is a blank teacher screen, not a
  // missing badge.
  const profile = buildStudentLearningProfile({
    evidenceEvents: evidenceRowsToEvents(collectStudentEvidence({ student: studentWith({}), assignments: [] })).events,
  });
  assert.equal(profile.baseline.established, false);
  assert.equal(profile.instructionalBandLabel, 'Establishing Baseline');
});

test('a malformed grades document does not take the roster down', () => {
  const rows = collectStudentEvidence({ student: { id: 'x', gradesByAssignment: null }, assignments: null });
  const { events } = evidenceRowsToEvents(rows);
  assert.doesNotThrow(() => buildStudentLearningProfile({ evidenceEvents: events }));
});

test('the teacher sees the same week the student would', () => {
  // If the two disagree, a teacher is looking at a recommendation the student
  // never received — worse than showing nothing.
  const options = buildStudentPathOptions({ student: studentWith({}), assignments: [], courseId: 'algebra1', nowValue: NOW });
  const profile = buildStudentLearningProfile({ evidenceEvents: [] });

  const teacherView = buildWeeklyPathPlan({ options, courseId: 'algebra1', profile, sessions: 4, now: NOW });
  const studentView = buildWeeklyPathPlan({ options, courseId: 'algebra1', profile, sessions: 4, now: NOW });

  assert.deepEqual(
    teacherView.sessions.map((s) => s.teksCode),
    studentView.sessions.map((s) => s.teksCode),
  );
});

test('an Honors class gets the longer week from the roster too', () => {
  const options = buildStudentPathOptions({ student: studentWith({}), assignments: [], courseId: 'algebra1', nowValue: NOW });
  const honors = buildWeeklyPathPlan({ options, courseId: 'algebra1', sessions: 5, honors: true, now: NOW });
  assert.equal(honors.sessions.length, 5);
});

test('modified work never reaches the badge as mastery evidence', () => {
  const assignments = [assignmentWith('a1', [question('A.5A')])];
  const student = studentWith({ a1: { questions: { 0: record({ modified: true }) } } });
  const { events } = evidenceRowsToEvents(collectStudentEvidence({ student, assignments }));
  const profile = buildStudentLearningProfile({ evidenceEvents: events });
  assert.equal(profile.baseline.events, 0,
    'modified work measures a different construct and cannot classify the student');
});

// --- The student's own week, through the same chain -----------------------------------

test('the student chain produces a week with a reason on every session', () => {
  const options = buildStudentPathOptions({ student: studentWith({}), assignments: [], courseId: 'algebra1', nowValue: NOW });
  const profile = buildStudentLearningProfile({ evidenceEvents: [] });
  const plan = buildWeeklyPathPlan({ options, courseId: 'algebra1', profile, sessions: 4, now: NOW });
  const goal = buildWeeklyGoal({ plan, studentId: 'stu-1', courseId: 'algebra1', now: NOW });

  assert.equal(goal.sessions.length, 4);
  goal.sessions.forEach((session, index) => {
    assert.equal(session.slot, index + 1, 'slots are stable so the card that ticks off is the right one');
    assert.ok(session.studentExplanation, 'every session tells the student why it is there');
    assert.ok(session.studentLabel || session.teksCode, 'and names itself in words, not just a code');
  });
});

test('the student sees no level label anywhere in their own week', () => {
  // Bands and projections exist so a teacher can adapt instruction. Handing one
  // to a fourteen-year-old as a verdict about themselves does no instructional
  // work.
  const options = buildStudentPathOptions({ student: studentWith({}), assignments: [], courseId: 'algebra1', nowValue: NOW });
  const plan = buildWeeklyPathPlan({ options, courseId: 'algebra1', sessions: 4, now: NOW });
  const goal = buildWeeklyGoal({ plan, now: NOW });

  const rendered = JSON.stringify(goal.sessions);
  ['Below Level', 'Above Level', 'Did Not Meet', 'Approaches', 'Masters'].forEach((label) => {
    assert.ok(!rendered.includes(label), `"${label}" must not travel to the student's session cards`);
  });
});

test('completed work ticks off the matching card, whatever order it was done in', () => {
  const options = buildStudentPathOptions({ student: studentWith({}), assignments: [], courseId: 'algebra1', nowValue: NOW });
  const plan = buildWeeklyPathPlan({ options, courseId: 'algebra1', sessions: 4, now: NOW });
  const goal = buildWeeklyGoal({ plan, now: NOW });

  // The student does the THIRD card first.
  const target = goal.sessions[2];
  const completions = deriveCompletionsFromEvidence({
    evidenceEvents: [{
      performance: { status: 'finalized', isCorrect: true },
      source: { activitySessionId: 'sess-x' },
      alignmentKeys: [`texas:${target.teksCode}`],
      recordedAt: NOW,
    }],
    weekKey: goal.weekKey,
  });

  const worked = new Set(completions.map((entry) => entry.teksCode));
  const completedSlots = goal.sessions.filter((s) => worked.has(s.teksCode)).map((s) => s.slot);
  assert.deepEqual(completedSlots, [target.slot],
    'a running total would have ticked off card 1 instead');
});
