// One student, one assignment: what the records show — the row the drawer,
// the assignment hub and the support evidence report all render.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSIGNMENT_STATUS, activeEvidence, buildAssignmentEvidenceRow, countEvidenceBySupport,
  evidenceRecordingStartMs, governingProfileForAssignment,
} from '../../src/platform/supportEvidence/evidenceAggregation.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { epochMinuteOf } from '../../functions/shared/supportEvidenceModel.mjs';

const assignment = (overrides = {}) => ({
  id: 'a1',
  title: 'Linear equations — practice set',
  schemaVersion: 5,
  assignedClassIds: ['class-a'],
  dueAt: '2026-10-01',
  sections: [
    { id: 'cw', role: 'classwork', questions: [{ questionId: 'q1', activityRole: 'classwork' }, { questionId: 'q2', activityRole: 'classwork' }] },
    { id: 'dol', role: 'dol', questions: [{ questionId: 'q3', activityRole: 'dol' }] },
  ],
  ...overrides,
});

const revision = (id, number, effectiveStart, overrides = {}) => ({
  id, revisionId: id, revision: number, status: 'active', effectiveStart, effectiveEnd: null,
  sourceLabel: 'IEP — annual review', inclusionStatus: false,
  accommodations: [
    { id: 'text-to-speech', params: {}, appliesTo: [] },
    { id: 'extra-time', params: { dueDateExtension: { mode: 'school-days', value: 1 } }, appliesTo: [] },
    { id: 'check-for-understanding', params: {}, appliesTo: [] },
  ],
  modifications: [],
  createdAtMs: Date.parse(`${effectiveStart}T14:00:00Z`),
  ...overrides,
});

const R1 = revision('r1', 1, '2026-08-17');
const student = (overrides = {}) => ({
  id: 'S910001',
  classId: 'class-a',
  profile: buildSupportProjection({ revisions: [R1], todayKey: '2026-09-30' }),
  gradesByAssignment: {
    a1: {
      0: { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-10-02T15:00:00.000Z' },
      1: { status: 'correct', totalAttempts: 2, lastAttemptAt: '2026-10-02T15:05:00.000Z' },
      2: { status: 'expired', partialCredit: 0, totalAttempts: 1, lastAttemptAt: '2026-10-01T15:40:00.000Z' },
    },
  },
  ...overrides,
});

const event = (overrides) => ({
  id: `e-${Math.random().toString(36).slice(2)}`,
  studentId: 'S910001', classId: 'class-a', assignmentId: 'a1', classification: 'accommodation',
  source: 'automatic-telemetry', actorType: 'student', occurredAtMs: Date.parse('2026-10-01T15:10:00Z'),
  ...overrides,
});

const NOW = Date.parse('2026-10-05T15:00:00Z');

test('the row uses the gradebook\'s own standing and scores', () => {
  const row = buildAssignmentEvidenceRow({ assignment: assignment(), student: student(), revisions: [R1], nowValue: NOW });
  assert.equal(row.status, ASSIGNMENT_STATUS.COMPLETED);
  assert.equal(row.score, 67, 'two of three questions correct');
  assert.deepEqual(row.sections.map((section) => [section.key, section.score]), [['classwork', 100], ['dol', 0]]);
  assert.equal(row.attempts.total, 4);
});

test('the individualized due date is derived from the revision in effect, and work before it is on time', () => {
  const row = buildAssignmentEvidenceRow({ assignment: assignment(), student: student(), revisions: [R1], nowValue: NOW });
  assert.equal(row.individualizedDue.supportId, 'extra-time');
  assert.equal(row.individualizedDue.revisionId, 'r1');
  assert.equal(row.individualizedDue.provenance, 'derived');
  assert.equal(new Date(row.effectiveDueAtMs).toISOString(), '2026-10-03T04:59:59.999Z', 'end of Friday, school time');
  assert.equal(row.completedLate, false, 'finished on Friday, inside the individualized due date');
  const noExtra = buildAssignmentEvidenceRow({ assignment: assignment(), student: student({ profile: {} }), revisions: [], nowValue: NOW });
  assert.equal(noExtra.individualizedDue, null);
  assert.equal(noExtra.completedLate, true, 'the same work without the accommodation is late');
});

test('not started past the final cutoff is Missing; partial work past it is Closed · incomplete', () => {
  const missing = buildAssignmentEvidenceRow({ assignment: assignment(), student: student({ gradesByAssignment: {} }), revisions: [R1], nowValue: NOW });
  assert.equal(missing.status, ASSIGNMENT_STATUS.MISSING);
  const partial = buildAssignmentEvidenceRow({
    assignment: assignment(),
    student: student({ gradesByAssignment: { a1: { 0: { status: 'correct', totalAttempts: 1 } } } }),
    revisions: [R1], nowValue: NOW,
  });
  assert.equal(partial.status, ASSIGNMENT_STATUS.CLOSED_INCOMPLETE);
  const open = buildAssignmentEvidenceRow({ assignment: assignment(), student: student({ gradesByAssignment: {} }), revisions: [R1], nowValue: Date.parse('2026-10-01T12:00:00Z') });
  assert.equal(open.status, ASSIGNMENT_STATUS.NOT_STARTED);
  const excused = buildAssignmentEvidenceRow({ assignment: assignment({ studentOverrides: { S910001: { excused: true } } }), student: student(), revisions: [R1], nowValue: NOW });
  assert.equal(excused.status, ASSIGNMENT_STATUS.EXCUSED);
});

test('configured, available and used stay separate; an adult support with no record is a gap, not a "no"', () => {
  const evidence = [
    event({ supportId: 'text-to-speech', eventType: 'available' }),
    event({ supportId: 'text-to-speech', eventType: 'used' }),
    event({ supportId: 'text-to-speech', eventType: 'used', questionIndex: 1 }),
    event({ supportId: 'extra-time', eventType: 'provided' }),
  ];
  const row = buildAssignmentEvidenceRow({ assignment: assignment(), student: student(), revisions: [R1], evidence, nowValue: NOW });
  const tts = row.supports.find((support) => support.supportId === 'text-to-speech');
  assert.deepEqual([tts.configured, tts.available, tts.used], [true, 1, 2]);
  const check = row.supports.find((support) => support.supportId === 'check-for-understanding');
  assert.deepEqual([check.configured, check.documented], [true, 0]);
  const gap = row.gaps.find((entry) => entry.supportId === 'check-for-understanding');
  assert.match(gap.message, /^No staff record of/);
  assert.doesNotMatch(JSON.stringify(row.gaps), /not provided/i);
  // A staff record closes the gap.
  const documented = buildAssignmentEvidenceRow({
    assignment: assignment(), student: student(), revisions: [R1], nowValue: NOW,
    evidence: [...evidence, event({ supportId: 'check-for-understanding', eventType: 'teacher-documented', actorType: 'teacher', source: 'teacher-click' })],
  });
  assert.equal(documented.supports.find((support) => support.supportId === 'check-for-understanding').documented, 1);
  assert.ok(!documented.gaps.some((entry) => entry.supportId === 'check-for-understanding'));
});

test('a staff correction removes its own author\'s mis-click from every count — and nobody else\'s', () => {
  const staff = { supportId: 'on-task-prompt', eventType: 'teacher-documented', actorType: 'teacher', source: 'teacher-click', actorEmail: 'teacher.a@example.test' };
  const click = event({ ...staff, id: 'click-1' });
  const correction = event({ ...staff, id: 'void-1', voidsEventId: 'click-1' });
  assert.deepEqual(activeEvidence([click, correction]), []);
  assert.equal(countEvidenceBySupport([click]).get('on-task-prompt').documented, 1);
  assert.equal(countEvidenceBySupport([click, correction]).get('on-task-prompt'), undefined);
  // A later teacher cannot erase an earlier teacher's record; the attempt
  // itself never counts either.
  const foreign = event({ ...staff, id: 'void-2', voidsEventId: 'click-1', actorEmail: 'teacher.b@example.test' });
  assert.deepEqual(activeEvidence([click, foreign]).map((entry) => entry.id), ['click-1']);
  assert.equal(countEvidenceBySupport([click, foreign]).get('on-task-prompt').documented, 1);
});

test('"used" counts once per support, question and minute, however many writes arrive', () => {
  const at = Date.parse('2026-10-01T15:00:10Z');
  const use = (extra) => event({ supportId: 'text-to-speech', eventType: 'used', questionIndex: 1, occurredAtMs: at, ...extra });
  const flood = Array.from({ length: 50 }, (_, index) => use({ id: `flood-${index}`, occurredAtMs: at + index * 100 }));
  assert.equal(countEvidenceBySupport(flood).get('text-to-speech').used, 1, 'fifty writes in one minute on one question are one use');
  assert.equal(countEvidenceBySupport([...flood, use({ id: 'q2', questionIndex: 2 }), use({ id: 'later', occurredAtMs: at + 120000 })]).get('text-to-speech').used, 3);
});

test('Standard vs Modified comes from what was applied, and says when a configured one changed nothing', () => {
  const R2 = revision('r2', 2, '2026-08-17', { modifications: [{ id: 'reduce-complexity', params: {}, appliesTo: [] }] });
  const standard = buildAssignmentEvidenceRow({ assignment: assignment(), student: student(), revisions: [R2], nowValue: NOW });
  assert.equal(standard.condition.value, 'standard');
  assert.match(standard.condition.note, /configured .* but no record shows it changed an item/);
  const modified = buildAssignmentEvidenceRow({
    assignment: assignment(), student: student(), revisions: [R2], nowValue: NOW,
    evidence: [event({ supportId: 'reduce-complexity', classification: 'modification', eventType: 'provided', actorType: 'system' })],
  });
  assert.equal(modified.condition.value, 'modified');
  assert.deepEqual(modified.condition.modifications, ['reduce-complexity']);
  // Legacy browser-reported MOD stays Modified, with the caveat about the old rule.
  const legacy = buildAssignmentEvidenceRow({
    assignment: assignment(), student: student({ supportUsageByAssignment: { a1: { modified: true, modifications: ['reduce-complexity'] } } }), revisions: [R2], nowValue: NOW,
  });
  assert.equal(legacy.condition.value, 'modified');
  assert.match(legacy.condition.note, /earlier rule/);
});

test('engagement: server minutes first, then legacy browser seconds, then "not recorded" — never 0 min', () => {
  const minute = epochMinuteOf(Date.parse('2026-10-01T15:00:00Z'));
  const ledger = [{ assignmentId: 'a1', minutes: [minute, minute + 1, minute + 2] }];
  const recorded = buildAssignmentEvidenceRow({ assignment: assignment(), student: student(), revisions: [R1], engagement: ledger, nowValue: NOW });
  assert.deepEqual([recorded.engagement.activeMinutes, recorded.engagement.source, recorded.engagement.provenance], [3, 'ledger', 'recorded']);
  const legacy = buildAssignmentEvidenceRow({ assignment: assignment(), student: student({ assignmentActivity: { a1: { totalTimeSeconds: 600 } } }), revisions: [R1], nowValue: NOW });
  assert.deepEqual([legacy.engagement.activeMinutes, legacy.engagement.source], [10, 'legacy-browser']);
  const none = buildAssignmentEvidenceRow({ assignment: assignment(), student: student({ assignmentActivity: { a1: { totalTimeSeconds: 0 } } }), revisions: [R1], nowValue: NOW });
  assert.equal(none.engagement.activeMinutes, null, 'scored work with no timing is Not recorded, not 0 min');
  assert.equal(none.engagement.provenance, 'not-recorded');
  assert.ok(none.gaps.some((gap) => gap.code === 'engagement-not-recorded'));
});

test('the governing profile is the one in effect on the class due date; a backdated revision is flagged', () => {
  const later = revision('r2', 2, '2026-10-01', { createdAtMs: Date.parse('2026-10-20T14:00:00Z'), accommodations: [] });
  const governing = governingProfileForAssignment({ assignment: assignment(), revisions: [R1, later] });
  assert.equal(governing.revision.id, 'r2');
  assert.equal(governing.backdated, true);
  const row = buildAssignmentEvidenceRow({ assignment: assignment(), student: student(), revisions: [R1, later], nowValue: Date.parse('2026-10-21T15:00:00Z') });
  assert.ok(row.gaps.some((gap) => gap.code === 'backdated-profile'));
  // Without the privileged history (a live screen) the projection is used, labelled configured.
  const live = governingProfileForAssignment({ assignment: assignment(), revisions: [], profile: student().profile });
  assert.deepEqual([live.source, live.provenance], ['projection', 'configured']);
});

test('recording start is the first thing recorded, so older work is described as predating it', () => {
  const start = evidenceRecordingStartMs({ revisions: [R1], evidence: [event({ occurredAtMs: Date.parse('2026-09-01T12:00:00Z') })] });
  assert.equal(start, R1.createdAtMs);
  assert.equal(evidenceRecordingStartMs({}), null);
  const old = buildAssignmentEvidenceRow({ assignment: assignment({ dueAt: '2026-08-01' }), student: student(), revisions: [R1], recordingStartMs: start, nowValue: NOW });
  assert.equal(old.beforeRecording, true);
});
