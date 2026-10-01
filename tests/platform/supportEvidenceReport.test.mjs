// The Student Support Evidence Report: summary first, real assignments only,
// every fact with its provenance, and no claim the records cannot support.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSupportEvidenceReport, exportStatusFor, selectReportAssignments, supportReportCsv, supportReportFileName,
} from '../../src/platform/supportEvidence/supportEvidenceReport.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { epochMinuteOf } from '../../functions/shared/supportEvidenceModel.mjs';

const settings = { periods: [{ id: 'mp1', label: '1st Marking Period', order: 1 }, { id: 'mp2', label: '2nd Marking Period', order: 2 }], currentPeriodId: 'mp2' };
const lesson = (id, overrides = {}) => ({
  id,
  title: `Lesson ${id}`,
  schemaVersion: 5,
  assignedClassIds: ['class-a'],
  dueAt: '2026-10-01',
  gradingPeriod: { id: 'mp2', label: '2nd Marking Period', order: 2 },
  sections: [
    { id: 'cw', role: 'classwork', questions: [{ questionId: `${id}-1`, activityRole: 'classwork' }, { questionId: `${id}-2`, activityRole: 'classwork' }] },
    { id: 'dol', role: 'dol', questions: [{ questionId: `${id}-3`, activityRole: 'dol' }] },
  ],
  ...overrides,
});
const assignments = [
  lesson('a1'),
  lesson('a2', { dueAt: '2026-10-08' }),
  { ...lesson('a3'), title: 'Lesson a1', assignedClassIds: [] }, // library copy, same title as a1
  lesson('a4', { assignedClassIds: ['class-b'], dueAt: '2026-09-25' }), // the student's work from a previous class
  lesson('a5', { dueAt: '2026-09-01', gradingPeriod: { id: 'mp1', label: '1st Marking Period', order: 1 } }),
];
const rev = (id, number, effectiveStart, recorded, overrides = {}) => ({
  id, revisionId: id, revision: number, status: 'active', effectiveStart, effectiveEnd: null,
  sourceLabel: `IEP (synthetic) r${number}`, createdByEmail: 't@example.test', createdAtMs: Date.parse(recorded),
  inclusionStatus: false,
  accommodations: [
    { id: 'text-to-speech', params: {}, appliesTo: [] },
    { id: 'check-for-understanding', params: {}, appliesTo: [] },
    { id: 'on-task-prompt', params: {}, appliesTo: [] },
  ],
  modifications: [],
  serviceExpectations: [{ serviceType: 'inclusion-support', minutesPerWeek: 100 }],
  ...overrides,
});
const R1 = rev('r1', 1, '2026-08-17', '2026-08-17T14:00:00Z');
const R2 = rev('r2', 2, '2026-09-20', '2026-09-25T14:00:00Z', {
  accommodations: [...R1.accommodations, { id: 'extra-time', params: { dueDateExtension: { mode: 'school-days', value: 1 } }, appliesTo: [] }],
  modifications: [{ id: 'reduce-complexity', params: {}, appliesTo: [] }],
});
const student = {
  id: 'S910001',
  classId: 'class-a',
  displayName: 'Avery Sample',
  profile: buildSupportProjection({ revisions: [R1, R2], todayKey: '2026-10-05' }),
  gradesByAssignment: {
    a1: { 0: { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-10-02T15:00:00Z' }, 1: { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-10-02T15:05:00Z' }, 2: { status: 'expired', partialCredit: 0, totalAttempts: 1 } },
    a4: { 0: { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-09-24T15:00:00Z' }, 1: { status: 'correct', totalAttempts: 1 }, 2: { status: 'correct', totalAttempts: 1 } },
    a5: { 0: { status: 'correct', totalAttempts: 1 } },
  },
  assignmentActivity: { a4: { totalTimeSeconds: 0 } },
};
const ev = (overrides) => ({ id: `e${Math.random().toString(36).slice(2)}`, studentId: 'S910001', classId: 'class-a', classification: 'accommodation', actorType: 'student', source: 'automatic-telemetry', ...overrides });
const evidence = [
  ev({ assignmentId: 'a1', supportId: 'text-to-speech', eventType: 'available', occurredAtMs: Date.parse('2026-10-01T14:00:00Z') }),
  ev({ assignmentId: 'a1', supportId: 'text-to-speech', eventType: 'used', questionIndex: 1, occurredAtMs: Date.parse('2026-10-01T14:05:00Z') }),
  ev({ assignmentId: 'a1', supportId: 'reduce-complexity', classification: 'modification', eventType: 'provided', actorType: 'system', occurredAtMs: Date.parse('2026-10-01T14:00:00Z') }),
  ev({ id: 'staff-1', assignmentId: 'a1', supportId: 'check-for-understanding', eventType: 'teacher-documented', actorType: 'teacher', actorEmail: 't@example.test', source: 'teacher-click', note: 'Asked for the next step.', occurredAtMs: Date.parse('2026-10-01T14:10:00Z') }),
  ev({ id: 'click-x', supportId: 'on-task-prompt', eventType: 'teacher-documented', actorType: 'teacher', actorEmail: 't@example.test', source: 'teacher-click', occurredAtMs: Date.parse('2026-10-01T14:11:00Z') }),
  ev({ id: 'fix-x', supportId: 'on-task-prompt', eventType: 'teacher-documented', actorType: 'teacher', actorEmail: 't@example.test', source: 'teacher-click', voidsEventId: 'click-x', note: 'Entered in error', occurredAtMs: Date.parse('2026-10-01T14:12:00Z') }),
];
const minute = epochMinuteOf(Date.parse('2026-10-01T14:00:00Z'));
const engagement = [{ assignmentId: 'a1', minutes: Array.from({ length: 18 }, (_, index) => minute + index) }];
const serviceLog = [
  { id: 's1', dateKey: '2026-09-28', minutes: 45, serviceType: 'inclusion-support', providerRole: 'inclusion-teacher', createdByEmail: 't@example.test' },
  { id: 's2', dateKey: '2026-10-01', minutes: 40, serviceType: 'inclusion-support', providerRole: 'inclusion-teacher', createdByEmail: 't@example.test' },
  { id: 's3', dateKey: '2026-06-01', minutes: 90, serviceType: 'inclusion-support', providerRole: 'inclusion-teacher', createdByEmail: 't@example.test' },
];
const snapshots = [{
  classId: 'class-a', assignmentId: 'a1', sectionKey: 'classwork', createdAt: '2026-10-03T12:00:00Z', uploadConfirmedAt: null,
  rows: [{ studentId: 'S910001', sisStudentId: '910001', grade: 50 }], withheld: [],
}];
const NOW = Date.parse('2026-10-12T15:00:00Z');
const report = (overrides = {}) => buildSupportEvidenceReport({
  student, studentName: 'Avery Sample', classRecord: { classId: 'class-a', name: 'Algebra I — Period 1' },
  assignments, gradingPeriodSettings: settings, selection: { gradingPeriodId: 'mp2', gradingPeriodLabel: '2nd Marking Period' },
  revisions: [R1, R2], evidence, serviceLog, engagement, exportSnapshots: snapshots, nowValue: NOW, generatedByEmail: 't@example.test',
  ...overrides,
});

test('only the student\'s real assignment instances appear; library copies are left out and counted', () => {
  const { included, libraryCopiesExcluded } = selectReportAssignments({ assignments, student, gradingPeriodSettings: settings, selection: { gradingPeriodId: 'mp2' } });
  assert.deepEqual(included.map((entry) => entry.assignment.id), ['a4', 'a1', 'a2']);
  assert.equal(included.find((entry) => entry.assignment.id === 'a4').assignedToClass, false, 'work under a previous class is kept');
  assert.equal(libraryCopiesExcluded, 1);
  const built = report();
  assert.ok(!built.assignments.some((row) => row.assignmentId === 'a3'));
  assert.ok(built.limitations.some((line) => /library cop/.test(line)));
  // Grading period and explicit selection narrow it.
  assert.deepEqual(report({ selection: { gradingPeriodId: 'mp1' } }).assignments.map((row) => row.assignmentId), ['a5']);
  assert.deepEqual(report({ selection: { gradingPeriodId: 'all', assignmentIds: ['a2'] } }).assignments.map((row) => row.assignmentId), ['a2']);
});

test('the summary keeps Standard and Modified apart and counts every status', () => {
  const { summary } = report();
  assert.equal(summary.assignmentsAssigned, 3);
  assert.equal(summary.completed, 2);
  assert.equal(summary.missing, 1);
  assert.equal(summary.modifiedCount, 1);
  assert.equal(summary.standardCount, 2);
  assert.deepEqual(summary.performance.modified, { average: 67, count: 1 });
  assert.deepEqual(summary.performance.standard, { average: 100, count: 1 });
  assert.match(summary.performance.note, /never averaged together/);
});

test('support counts separate configured, available, used and staff-documented — a withdrawn click counts nowhere', () => {
  const { summary } = report();
  const tts = summary.supports.find((support) => support.supportId === 'text-to-speech');
  assert.deepEqual([tts.configured, tts.assignmentsAvailable, tts.uses, tts.staffRecords], [true, 1, 1, 0]);
  const check = summary.supports.find((support) => support.supportId === 'check-for-understanding');
  assert.deepEqual([check.configured, check.staffRecords], [true, 1]);
  const prompt = summary.supports.find((support) => support.supportId === 'on-task-prompt');
  assert.equal(prompt.staffRecords, 0, 'the mis-click and its correction drop out');
  assert.equal(summary.staffRecords, 1);
  assert.ok(summary.gaps.some((gap) => /No MathMaster staff record in this period of: .*On-task.*outside MathMaster is not recorded here/.test(gap)));
});

test('the profile section shows the revision in effect and flags a backdated one', () => {
  const { profile } = report();
  assert.equal(profile.status, 'versioned');
  assert.equal(profile.current.revision, 2);
  assert.ok(profile.current.modifications.some((entry) => entry.id === 'reduce-complexity' && entry.classification === 'modification'));
  assert.ok(profile.current.accommodations.some((entry) => entry.id === 'extra-time' && /next school day/.test(entry.detail)));
  assert.ok(profile.warnings.some((warning) => warning.code === 'backdated' && /entered on 2026-09-25/.test(warning.message)));
  const legacy = report({ revisions: [], student: { ...student, profile: { accommodations: ['text-to-speech'] } } });
  assert.equal(legacy.profile.status, 'unversioned');
  assert.ok(legacy.profile.warnings.some((warning) => warning.code === 'unversioned'));
});

test('assignment rows carry dates, condition, engagement and grade impact with export status', () => {
  const rows = report().assignments;
  const a1 = rows.find((row) => row.assignmentId === 'a1');
  assert.equal(a1.condition.value, 'modified');
  assert.equal(a1.engagement.activeMinutes, 18);
  assert.equal(a1.individualizedDue.supportId, 'extra-time');
  const classwork = a1.gradeImpact.items.find((item) => item.key === 'classwork');
  assert.equal(classwork.grade, 100);
  assert.equal(classwork.exportStatus.state, 'changed-since-export');
  assert.match(classwork.exportStatus.label, /sent 50, now 100/);
  assert.equal(a1.gradeImpact.items.find((item) => item.key === 'dol').exportStatus.state, 'not-exported');
  assert.match(a1.gradeImpact.weightNote, /not in MathMaster/);
  const a4 = rows.find((row) => row.assignmentId === 'a4');
  assert.equal(a4.engagement.activeMinutes, null, 'work with no timing is Not recorded, never 0 min');
  assert.equal(report({ exportSnapshots: null }).assignments[0].gradeImpact.items[0].exportStatus.state, 'unavailable');
});

test('service minutes are what staff recorded in the period, next to the expectation, with no verdict', () => {
  const { service, summary } = report();
  assert.equal(service.totalMinutes, 85, 'the June entry is outside the period');
  assert.equal(summary.serviceMinutesRecorded, 85);
  assert.equal(service.expectations[0].minutesPerWeek, 100);
  assert.match(service.disclaimer, /does not determine whether services met/);
  assert.doesNotMatch(JSON.stringify(service), /compliant|non-compliant|violation|out of compliance/i);
});

test('the timeline is chronological and marks withdrawn records', () => {
  const { timeline } = report();
  const times = timeline.map((entry) => entry.atMs);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(timeline.some((entry) => entry.kind === 'profile' && /revision 2/.test(entry.label)));
  assert.ok(timeline.some((entry) => entry.kind === 'service'));
  assert.ok(timeline.some((entry) => entry.withdrawn && /withdrawn/.test(entry.label)));
});

test('absence of a record is never reported as "not provided"; the legend and limitations say so', () => {
  const built = report();
  // The report body never uses the phrase at all; only the limitations explain
  // that absence of a record is not proof of it.
  assert.doesNotMatch(JSON.stringify({ summary: built.summary, assignments: built.assignments, timeline: built.timeline, service: built.service }), /not provided/i);
  assert.ok(built.legend.some((entry) => entry.term === 'Not recorded'));
  assert.ok(built.limitations.some((line) => /not proof that a support was not provided/.test(line)));
  assert.ok(built.limitations.some((line) => /Support recording for this student begins/.test(line)));
});

test('the CSV has one row per assignment, neutralises formulas and never prints 0 min for missing time', () => {
  const built = report();
  const csv = supportReportCsv(built);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 1 + built.assignments.length);
  assert.match(lines[0], /^Assignment,Assignment ID,Class due,Individualized due/);
  assert.ok(lines.some((line) => /,Not recorded,/.test(line)));
  const hostile = supportReportCsv({ assignments: [{ ...built.assignments[0], title: '=HYPERLINK("http://x")' }] });
  assert.match(hostile, /^.*\r\n"'=HYPERLINK\(""http:\/\/x""\)"/);
  assert.equal(supportReportFileName(built, 'csv'), 'MathMaster-support-evidence_S910001_2026-09-11_to_2026-10-12.csv', 'a current period runs to today');
  assert.equal(report({ selection: { gradingPeriodId: 'mp1' } }).meta.toDateKey, '2026-09-01', 'a past period ends with its last cutoff');
});

test('export status reads the same history Grade Export does', () => {
  assert.equal(exportStatusFor({ classId: 'class-a', assignmentId: 'a1', sectionKey: 'classwork', studentId: 'S910001', currentGrade: 50, snapshots }).state, 'exported');
  assert.equal(exportStatusFor({ classId: 'class-a', assignmentId: 'a1', sectionKey: 'classwork', studentId: 'OTHER', currentGrade: 90, snapshots }).state, 'not-in-file');
  assert.equal(exportStatusFor({
    classId: 'class-a', assignmentId: 'a1', sectionKey: 'classwork', studentId: 'S2', currentGrade: 90,
    snapshots: [{ ...snapshots[0], rows: [], withheld: [{ studentId: 'S2' }] }],
  }).state, 'held-back');
});
