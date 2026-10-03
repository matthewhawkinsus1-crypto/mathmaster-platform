// WHAT MATHMASTER RECORDS ABOUT A REDUCED ITEM COUNT — AND WHAT IT MUST NOT.
//
// "Provided" is recorded only after the projection actually omitted items,
// with the facts a teacher needs to check it (target, original, assigned,
// actual, why they differ, the content fingerprint and the omitted indices).
// A tiny assignment is "not applicable" with its reason; a projection that
// failed is "unavailable" — an implementation gap, never "provided". A
// recorded-only (legacy) support makes no platform claim at all. Synthetic
// data only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { EVIDENCE_EVENT_TYPE, buildStudentEvidenceEvent, normalizeEvidenceDetails } from '../../functions/shared/supportEvidenceModel.mjs';
import { launchSupportRecords } from '../../src/platform/supportEvidence/studentSupportTelemetry.js';
import { studentRequiredQuestions } from '../../src/assignmentLifecycle.js';
import { buildAssignmentEvidenceRow, workloadFactFor } from '../../src/platform/supportEvidence/evidenceAggregation.js';
import { buildSupportEvidenceReport } from '../../src/platform/supportEvidence/supportEvidenceReport.js';
import { region, executableSource } from './helpers/sourceContract.mjs';

const ID = 'reduced-item-count-same-rigor';
const NOW = Date.parse('2026-10-06T15:00:00Z');
let n = 0;
const q = (standard) => { n += 1; return { questionId: `eq${n}`, type: 'numeric', prompt: 'Solve.', standard, dok: 2 }; };
const lesson = (id, sizes = { classwork: 8, practice: 12 }) => ({
  id,
  title: `Lesson ${id}`,
  schemaVersion: 5,
  assignedClassIds: ['class-a'],
  dueAt: '2026-10-08',
  sections: Object.entries(sizes).map(([role, count]) => ({
    id: role, role, questions: Array.from({ length: count }, (_, i) => q(i % 2 ? 'A.5A' : 'A.5B')),
  })),
});
const revision = (params, extra = []) => ({
  id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null,
  sourceLabel: 'IEP (synthetic)', createdByEmail: 't@example.test', createdAtMs: Date.parse('2026-08-17T14:00:00Z'),
  inclusionStatus: false,
  accommodations: [{ id: ID, params, appliesTo: [] }, ...extra],
  modifications: [],
});
const automatic = revision({ itemReduction: { mode: 'percent', value: 25 } }, [{ id: 'text-to-speech', params: {}, appliesTo: [] }]);
const recordedOnly = revision({});
const profileOf = (rev) => buildSupportProjection({ revisions: [rev], todayKey: '2026-10-06' });

const launch = (assignment, profile, workload) => launchSupportRecords({
  profile, assignment, roles: ['classwork', 'practice'], questions: [], workload, nowValue: NOW,
});
const workloadRecord = (records) => records.find((record) => record.supportId === ID) || null;

// --- Launch records -----------------------------------------------------------------------------

test('provided only when the projection omitted items, with the checkable facts', () => {
  const assignment = lesson('A1');
  const profile = profileOf(automatic);
  const workload = studentRequiredQuestions({ assignment, profile, nowValue: NOW });
  assert.equal(workload.status, 'applied');
  const record = workloadRecord(launch(assignment, profile, workload).records);
  assert.equal(record.eventType, EVIDENCE_EVENT_TYPE.PROVIDED);
  assert.equal(record.details.targetPercent, 25);
  assert.equal(record.details.originalCount, 20);
  assert.equal(record.details.assignedCount, 15);
  assert.equal(record.details.actualPercentTenths, 250);
  assert.equal(record.details.omittedIndices.length, 5);
  assert.ok(record.details.contentFingerprint);
  assert.equal(record.variant, record.details.contentFingerprint, 'a revised assignment is a new record');
  assert.equal(record.profileRevisionId, 'r1', 'the revision that governs THIS assignment');
  // And the stored payload keeps exactly those bounded facts.
  const { payload, errors } = buildStudentEvidenceEvent({
    studentId: 'S1', supportId: ID, eventType: record.eventType, assignedTeacherEmail: 't@example.test', details: record.details,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(payload.details, normalizeEvidenceDetails(record.details));
});

test('a one-question DOL is "not applicable" with its reason — never "provided"', () => {
  const assignment = lesson('A2', { dol: 1 });
  const profile = profileOf(automatic);
  const workload = studentRequiredQuestions({ assignment, profile, nowValue: NOW });
  const record = workloadRecord(launch(assignment, profile, workload).records);
  assert.equal(record.eventType, EVIDENCE_EVENT_TYPE.NOT_APPLICABLE);
  assert.equal(record.details.reason, 'too-few-items');
  assert.equal(record.details.assignedCount, 1);
});

test('a projection that could not be resolved is "unavailable" — an implementation gap, never "provided"', () => {
  const assignment = lesson('A3');
  const record = workloadRecord(launch(assignment, profileOf(automatic), { failed: true }).records);
  assert.equal(record.eventType, EVIDENCE_EVENT_TYPE.UNAVAILABLE);
  assert.equal(record.details.reason, 'projection-not-resolved');
});

test('a recorded-only (legacy) support makes no platform claim', () => {
  const assignment = lesson('A4');
  const profile = profileOf(recordedOnly);
  const workload = studentRequiredQuestions({ assignment, profile, nowValue: NOW });
  assert.equal(workload.indices.length, 20);
  assert.equal(workloadRecord(launch(assignment, profile, workload).records), null);
  // Nor a flat pre-versioning profile.
  assert.equal(workloadRecord(launch(assignment, { accommodations: [ID] }, workload).records), null);
});

test('details are bounded: no question text, no answers, nothing unlisted', () => {
  const details = normalizeEvidenceDetails({
    targetPercent: 25, originalCount: 20, assignedCount: 15, prompt: 'Solve 2x = 4', answer: '2',
    omittedIndices: Array.from({ length: 500 }, (_, i) => i), variance: ['rounding', 'rounding', 'x'.repeat(80)],
  });
  assert.deepEqual(Object.keys(details).sort(), ['assignedCount', 'omittedIndices', 'originalCount', 'targetPercent', 'variance']);
  // A compact "0,1,2,…" string of at most 200 indices (the rules check each).
  assert.equal(details.omittedIndices.split(',').length, 200);
  assert.match(details.omittedIndices, /^[0-9]{1,3}(,[0-9]{1,3}){0,199}$/);
  // Only known variance codes, once each.
  assert.deepEqual(details.variance, ['rounding']);
  assert.equal(normalizeEvidenceDetails({}), null);
});

// --- What the teacher sees ------------------------------------------------------------------------

const studentWith = (assignment, profile, answered) => ({
  id: 'S1', classId: 'class-a', profile,
  gradesByAssignment: { [assignment.id]: Object.fromEntries(answered.map((index) => [index, { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-10-05T15:00:00Z' }])) },
});
const providedEvent = (assignment, details, extra = {}) => ({
  id: `ev-${assignment.id}`, studentId: 'S1', assignmentId: assignment.id, supportId: ID, classification: 'accommodation',
  eventType: 'provided', source: 'automatic-telemetry', actorType: 'system', details, occurredAtMs: Date.parse('2026-10-05T14:00:00Z'), ...extra,
});

test('the assignment row shows the recorded projection and verifies it against today\'s', () => {
  const assignment = lesson('B1');
  const profile = profileOf(automatic);
  const workload = studentRequiredQuestions({ assignment, profile, nowValue: NOW });
  const record = workloadRecord(launch(assignment, profile, workload).records);
  const student = studentWith(assignment, profile, workload.indices.slice(0, 3));
  const row = buildAssignmentEvidenceRow({
    assignment, student, revisions: [automatic], evidence: [providedEvent(assignment, record.details)], nowValue: NOW,
  });
  assert.equal(row.workload.recorded.assignedCount, 15);
  assert.equal(row.workload.verified, true);
  assert.equal(row.progress.total, 15, 'progress is over the student\'s own items');
  const support = row.supports.find((entry) => entry.supportId === ID);
  assert.equal(support.automation, 'automatic');
  assert.ok(!row.gaps.some((gap) => gap.supportId === ID), 'provided: no gap, and no "no staff record" either');
});

test('worked under automatic reduction with no record → a "not recorded" gap; recorded-only → the staff gap', () => {
  const assignment = lesson('B2');
  const auto = profileOf(automatic);
  const autoRow = buildAssignmentEvidenceRow({
    assignment, student: studentWith(assignment, auto, [0, 1]), revisions: [automatic], evidence: [], recordingStartMs: Date.parse('2026-09-01T00:00:00Z'), nowValue: NOW,
  });
  assert.ok(autoRow.gaps.some((gap) => gap.code === 'automatic-not-recorded' && gap.supportId === ID));
  assert.ok(!autoRow.gaps.some((gap) => gap.code === 'no-staff-record' && gap.supportId === ID));

  const manual = profileOf(recordedOnly);
  const manualRow = buildAssignmentEvidenceRow({
    assignment, student: studentWith(assignment, manual, [0, 1]), revisions: [recordedOnly], evidence: [], nowValue: NOW,
  });
  assert.ok(manualRow.gaps.some((gap) => gap.code === 'no-staff-record' && gap.supportId === ID));
  assert.equal(manualRow.workload, null);
});

test('an "unavailable" record is shown as an implementation gap with its reason', () => {
  const assignment = lesson('B3');
  const profile = profileOf(automatic);
  const row = buildAssignmentEvidenceRow({
    assignment, student: studentWith(assignment, profile, [0]), revisions: [automatic],
    evidence: [providedEvent(assignment, { reason: 'projection-not-resolved' }, { eventType: 'unavailable' })], nowValue: NOW,
  });
  assert.ok(row.gaps.some((gap) => gap.code === 'support-unavailable' && /the reduced item set could not be worked out/.test(gap.message)));
  assert.equal(workloadFactFor({ assignment, student: studentWith(assignment, profile, []), events: [] }).status, 'applied');
});

test('report headline: available/provided out of ELIGIBLE work; unused on-demand support is not a gap', () => {
  const a = lesson('C1');
  const b = lesson('C2');
  const profile = profileOf(automatic);
  const student = { ...studentWith(a, profile, [0, 1]), gradesByAssignment: {
    C1: { 0: { status: 'correct', totalAttempts: 1 } },
    C2: { 0: { status: 'correct', totalAttempts: 1 } },
  } };
  const tts = (assignment) => ({
    id: `tts-${assignment.id}`, studentId: 'S1', assignmentId: assignment.id, supportId: 'text-to-speech', classification: 'accommodation',
    eventType: 'available', source: 'automatic-telemetry', actorType: 'system', occurredAtMs: Date.parse('2026-10-05T14:00:00Z'),
  });
  const workloadA = studentRequiredQuestions({ assignment: a, profile, nowValue: NOW });
  const recA = workloadRecord(launch(a, profile, workloadA).records);
  const report = buildSupportEvidenceReport({
    student, assignments: [a, b], revisions: [automatic],
    evidence: [tts(a), tts(b), providedEvent(a, recA.details)],
    selection: { fromDateKey: '2026-09-01', toDateKey: '2026-10-10' }, nowValue: NOW,
  });
  const readAloud = report.summary.supports.find((support) => support.supportId === 'text-to-speech');
  assert.equal(readAloud.assignmentsEligible, 2);
  assert.equal(readAloud.assignmentsAvailable, 2);
  assert.equal(readAloud.assignmentsUsed, 0);
  assert.ok(readAloud.tracksUse);
  assert.ok(!report.assignments.some((row) => row.gaps.some((gap) => gap.supportId === 'text-to-speech')), 'not using it is the student\'s choice');
  const reduced = report.summary.supports.find((support) => support.supportId === ID);
  assert.equal(reduced.automation, 'automatic');
  assert.equal(reduced.assignmentsProvided, 1);
  assert.equal(reduced.assignmentsEligible, 2);
  assert.equal(reduced.tracksUse, false, 'no "used" for an automatic support, so no usage gap');
});

// --- Wiring -----------------------------------------------------------------------------------------

test('App records the workload with its details, its content variant and the governing revision', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const recorder = executableSource(region(app, 'const recordStudentSupportEvidence = (', '\n  };', 'student recorder'));
  assert.match(recorder, /supportId, eventType, questionIndex = null, activityRole = null, details = null, variant = null, profileRevisionId = null,/);
  assert.match(recorder, /variant,\s*\n\s*event: \{/);
  assert.match(recorder, /details,\s*\n\s*\},/);
  const store = readFileSync(new URL('../../src/platform/supportEvidence/supportEvidenceStore.js', import.meta.url), 'utf8');
  assert.match(store, /availabilityEventId\(\{\s*assignmentId: payload\.assignmentId, profileRevisionId: payload\.profileRevisionId, supportId: payload\.supportId, variant,/);
  assert.match(app, /import \{ describeWorkloadSummary \} from '\.\.\/functions\/shared\/reducedWorkload\.mjs';/);
  const lifecycleImport = app.match(/import \{([^}]*)\} from '\.\/assignmentLifecycle';/);
  assert.match(lifecycleImport[1], /\bstudentRequiredQuestions,/);
});
