// Evidence records: who may record what, service minutes that are never
// inferred, and an active-time ledger that a refresh, a second tab or an idle
// tab cannot inflate.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVIDENCE_EVENT_TYPE, EVIDENCE_SOURCE, ACTOR_TYPE, STUDENT_EVIDENCE_EVENT_TYPES, STAFF_EVIDENCE_EVENT_TYPES,
  EVIDENCE_LEGEND, REPORT_LIMITATIONS, ENGAGEMENT_IDLE_CUTOFF_MS,
  buildStaffEvidenceEvent, buildStudentEvidenceEvent, availabilityEventId,
  buildServiceLogEntry, summarizeServiceMinutes, weekStartOf,
  isEngagedNow, summarizeEngagementMinutes, epochMinuteOf, engagementDocId, utcDayOf,
} from '../../functions/shared/supportEvidenceModel.mjs';

test('a one-click staff action records a documented, classified, attributable fact', () => {
  const { payload, errors } = buildStaffEvidenceEvent({
    studentId: 'S910001', classId: 'class-a', assignmentId: 'A1', supportId: 'check-for-understanding',
    actorEmail: 'Teacher@Example.test', profileRevisionId: 'r1',
  });
  assert.deepEqual(errors, []);
  assert.equal(payload.eventType, EVIDENCE_EVENT_TYPE.TEACHER_DOCUMENTED);
  assert.equal(payload.source, EVIDENCE_SOURCE.TEACHER_CLICK);
  assert.equal(payload.classification, 'accommodation');
  assert.equal(payload.actorEmail, 'teacher@example.test');
  assert.deepEqual(payload.authorizedTeacherEmails, ['teacher@example.test']);
  assert.equal(payload.note, '', 'a note is never required');
  assert.equal('occurredAt' in payload, false, 'server time is stamped by the store');
});

test('a provider entry needs the provider role; staff cannot record a student "use"', () => {
  assert.ok(buildStaffEvidenceEvent({ studentId: 'S1', supportId: 'inclusion-support', actorEmail: 't@x.test', actorType: 'provider' }).errors.length);
  const provider = buildStaffEvidenceEvent({ studentId: 'S1', supportId: 'inclusion-support', actorEmail: 't@x.test', actorType: 'provider', providerRole: 'inclusion-teacher', eventType: 'provider-documented' });
  assert.deepEqual(provider.errors, []);
  assert.equal(provider.payload.source, EVIDENCE_SOURCE.PROVIDER_ENTRY);
  assert.equal(provider.payload.classification, 'service');
  assert.ok(buildStaffEvidenceEvent({ studentId: 'S1', supportId: 'text-to-speech', actorEmail: 't@x.test', eventType: 'used' }).errors.length);
  assert.ok(!STAFF_EVIDENCE_EVENT_TYPES.includes('used'));
});

test('a student record is platform telemetry only: no note, no staff type, authorized to their teacher', () => {
  const used = buildStudentEvidenceEvent({ studentId: 'S1', assignmentId: 'A1', supportId: 'text-to-speech', eventType: 'used', assignedTeacherEmail: 'T@x.test', activityRole: 'Classwork', questionIndex: 3 });
  assert.deepEqual(used.errors, []);
  assert.equal(used.payload.actorType, ACTOR_TYPE.STUDENT);
  assert.equal(used.payload.source, EVIDENCE_SOURCE.AUTOMATIC_TELEMETRY);
  assert.equal(used.payload.activityRole, 'classwork');
  assert.equal(used.payload.questionIndex, 3);
  assert.deepEqual(used.payload.authorizedTeacherEmails, ['T@x.test'], 'verbatim roster value: the rules compare it exactly');
  const available = buildStudentEvidenceEvent({ studentId: 'S1', supportId: 'declutter-ui', eventType: 'available', assignedTeacherEmail: 't@x.test' });
  assert.equal(available.payload.actorType, ACTOR_TYPE.SYSTEM);
  assert.ok(buildStudentEvidenceEvent({ studentId: 'S1', supportId: 'text-to-speech', eventType: 'teacher-documented', assignedTeacherEmail: 't@x.test' }).errors.length);
  assert.ok(!STUDENT_EVIDENCE_EVENT_TYPES.includes('teacher-documented'));
  assert.ok(buildStudentEvidenceEvent({ studentId: 'S1', supportId: 'text-to-speech', eventType: 'used' }).errors.length, 'no teacher of record, no record');
});

test('the availability record id is deterministic, so relaunches and second tabs cannot duplicate it', () => {
  const a = availabilityEventId({ assignmentId: 'A1', profileRevisionId: 'r1', supportId: 'text-to-speech' });
  assert.equal(a, availabilityEventId({ assignmentId: 'A1', profileRevisionId: 'r1', supportId: 'text-to-speech' }));
  assert.notEqual(a, availabilityEventId({ assignmentId: 'A1', profileRevisionId: 'r2', supportId: 'text-to-speech' }));
  assert.match(availabilityEventId({ assignmentId: 'A/1 x', profileRevisionId: null, supportId: 'calc' }), /^[A-Za-z0-9_.-]+$/);
});

test('service minutes come from the times when given, and must agree with an entered total', () => {
  const ok = buildServiceLogEntry({ studentId: 'S1', dateKey: '2026-09-28', startTime: '10:05', endTime: '10:50', serviceType: 'inclusion-support', providerRole: 'inclusion-teacher', createdByEmail: 't@x.test' });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.payload.minutes, 45);
  assert.equal(ok.payload.startMinute, 605);
  assert.ok(buildServiceLogEntry({ studentId: 'S1', dateKey: '2026-09-28', startTime: '10:05', endTime: '10:50', minutes: 60, serviceType: 'inclusion-support', providerRole: 'inclusion-teacher', createdByEmail: 't@x.test' }).errors.length);
  assert.ok(buildServiceLogEntry({ studentId: 'S1', dateKey: '2026-09-28', minutes: 0, serviceType: 'inclusion-support', providerRole: 'inclusion-teacher', createdByEmail: 't@x.test' }).errors.length);
  assert.ok(buildServiceLogEntry({ studentId: 'S1', dateKey: '2026-09-28', minutes: 20, serviceType: 'text-to-speech', providerRole: 'inclusion-teacher', createdByEmail: 't@x.test' }).errors.length, 'only services are logged as minutes');
  const voidEntry = buildServiceLogEntry({ studentId: 'S1', dateKey: '2026-09-28', minutes: 0, voidsEntryId: 'e1', serviceType: 'inclusion-support', providerRole: 'inclusion-teacher', createdByEmail: 't@x.test' });
  assert.deepEqual(voidEntry.errors, []);
  assert.equal(voidEntry.payload.minutes, 0);
});

test('service summaries count only recorded minutes, exclude voided entries, and never judge compliance', () => {
  const entries = [
    { id: 'e1', dateKey: '2026-09-28', minutes: 45, serviceType: 'inclusion-support' },
    { id: 'e2', dateKey: '2026-09-30', minutes: 30, serviceType: 'inclusion-support' },
    { id: 'e3', dateKey: '2026-10-01', minutes: 20, serviceType: 'inclusion-support' },
    { id: 'e4', dateKey: '2026-10-01', minutes: 0, serviceType: 'inclusion-support', voidsEntryId: 'e3' },
    { id: 'e5', dateKey: '2026-10-06', minutes: 50, serviceType: 'co-teaching' },
    { id: 'e6', dateKey: '2026-11-20', minutes: 50, serviceType: 'inclusion-support' },
  ];
  const summary = summarizeServiceMinutes(entries, {
    fromDateKey: '2026-09-28', toDateKey: '2026-10-31',
    expectations: [{ serviceType: 'inclusion-support', minutesPerWeek: 100 }],
  });
  assert.equal(summary.totalMinutes, 125);
  assert.equal(summary.voidedCount, 1);
  assert.deepEqual(summary.weeks.map((week) => [week.weekStart, week.minutes]), [['2026-09-28', 75], ['2026-10-05', 50]]);
  assert.deepEqual(summary.expectations[0].weeks.map((week) => [week.weekStart, week.recordedMinutes, week.configuredMinutes]), [
    ['2026-09-28', 75, 100],
    ['2026-10-05', 0, 100],
  ]);
  assert.equal(JSON.stringify(summary).includes('compliant'), false);
  assert.equal(weekStartOf('2026-10-04'), '2026-09-28'); // Sunday belongs to the week that began Monday
});

test('engaged means visible, open for credit, and interacted within the idle cutoff', () => {
  const now = 1_000_000_000;
  assert.ok(isEngagedNow({ nowMs: now, lastInteractionMs: now - 5000, pageVisible: true, creditEligible: true }));
  assert.ok(!isEngagedNow({ nowMs: now, lastInteractionMs: now - ENGAGEMENT_IDLE_CUTOFF_MS - 1, pageVisible: true, creditEligible: true }), 'idle');
  assert.ok(!isEngagedNow({ nowMs: now, lastInteractionMs: now - 5000, pageVisible: false, creditEligible: true }), 'hidden tab');
  assert.ok(!isEngagedNow({ nowMs: now, lastInteractionMs: now - 5000, pageVisible: true, creditEligible: false }), 'practice-only after the final deadline');
  assert.ok(!isEngagedNow({ nowMs: now, lastInteractionMs: null, pageVisible: true, creditEligible: true }), 'no interaction yet');
});

test('the ledger unions minutes: two tabs, a refresh and a replay each count once; late minutes are split', () => {
  const base = epochMinuteOf(Date.parse('2026-10-01T15:00:00Z'));
  const tabA = { minutes: [base, base + 1, base + 2] };
  const tabB = { minutes: [base + 1, base + 2, base + 3] }; // second tab, overlapping minutes
  const nextDay = { minutes: [base + 1440, base + 1441] };
  const summary = summarizeEngagementMinutes([tabA, tabB, tabA, nextDay], {
    dueAtMs: (base + 2) * 60000 + 59999,
    finalAtMs: (base + 1440) * 60000 + 59999,
  });
  assert.equal(summary.activeMinutes, 6);
  assert.equal(summary.onTimeMinutes, 3);
  assert.equal(summary.lateMinutes, 2);
  assert.equal(summary.afterFinalMinutes, 1);
  assert.equal(summary.activeDays, 2);
  assert.ok(summary.elapsedMinutes >= summary.activeMinutes, 'elapsed window is never less than active time');
  assert.equal(summarizeEngagementMinutes([]).activeMinutes, 0);
  assert.equal(engagementDocId('A1', utcDayOf(Date.parse('2026-10-01T15:00:00Z'))), `A1__${Math.floor(Date.parse('2026-10-01T15:00:00Z') / 86400000)}`);
});

test('the legend defines every term the report uses, and the limitations say what absence means', () => {
  const terms = EVIDENCE_LEGEND.map((entry) => entry.term);
  ['Configured', 'Available', 'Provided', 'Used', 'Teacher documented', 'Provider documented', 'Derived', 'Not recorded'].forEach((term) => assert.ok(terms.includes(term), term));
  assert.match(EVIDENCE_LEGEND.find((entry) => entry.term === 'Not recorded').meaning, /not evidence that the support was not provided/);
  assert.ok(REPORT_LIMITATIONS.some((line) => /not proof that a support was not provided/.test(line)));
  assert.ok(REPORT_LIMITATIONS.some((line) => /does not determine legal compliance/.test(line)));
});
