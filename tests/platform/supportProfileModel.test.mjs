// The versioned support profile: immutable revisions, a student-readable
// projection without the privileged fields, and effective dating that cannot
// rewrite the condition past work was done under.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGACY_REVISION_ID, REVISION_STATUS,
  normalizeSupportRevisionInput, buildRevisionDocument, legacyProfileToRevision,
  revisionEffectiveOn, governingRevisionsAt, buildSupportProjection,
  resolveEffectiveSupportPlan, planHasSupport, supportAppliesToRole, supportProfileWarnings,
  sortRevisionTimeline,
} from '../../functions/shared/supportProfileModel.mjs';
import { planWindowOn } from '../../functions/shared/supportDeadline.mjs';

const input = (overrides = {}) => ({
  status: 'active',
  effectiveStart: '2026-08-17',
  effectiveEnd: '2027-08-16',
  sourceLabel: 'IEP — annual review',
  sourceNote: 'Synthetic note',
  inclusionStatus: true,
  accommodations: [
    { id: 'text-to-speech' },
    { id: 'extra-time', params: { dueDateExtension: { mode: 'school-days', value: 1 } }, appliesTo: ['classwork', 'practice'] },
  ],
  modifications: ['reduce-complexity'],
  serviceExpectations: [{ serviceType: 'inclusion-support', minutesPerWeek: 100 }],
  ...overrides,
});

const rev = (id, revision, effectiveStart, overrides = {}) => ({
  id,
  revisionId: id,
  revision,
  status: 'active',
  effectiveStart,
  effectiveEnd: null,
  inclusionStatus: false,
  accommodations: [],
  modifications: [],
  sourceLabel: 'IEP',
  sourceNote: 'teacher-only note',
  serviceExpectations: [{ serviceType: 'inclusion-support', minutesPerWeek: 60 }],
  createdByEmail: 'teacher@example.test',
  ...overrides,
});

test('a valid revision normalizes with its classification intact', () => {
  const { revision, errors } = normalizeSupportRevisionInput(input());
  assert.deepEqual(errors, []);
  assert.deepEqual(revision.accommodations.map((entry) => entry.id), ['text-to-speech', 'extra-time']);
  assert.deepEqual(revision.modifications.map((entry) => entry.id), ['reduce-complexity']);
  assert.deepEqual(revision.accommodations[1].params.dueDateExtension, { mode: 'school-days', value: 1 });
  assert.deepEqual(revision.accommodations[1].appliesTo, ['classwork', 'practice']);
  assert.equal(revision.serviceExpectations[0].minutesPerWeek, 100);
});

test('a modification filed as an accommodation is an error, never silently moved', () => {
  const { revision, errors } = normalizeSupportRevisionInput(input({ accommodations: ['reduce-complexity'], modifications: ['text-to-speech'] }));
  assert.equal(errors.length, 2);
  assert.match(errors[0], /modification/);
  assert.match(errors[1], /accommodation/);
  assert.deepEqual(revision.accommodations, []);
  assert.deepEqual(revision.modifications, []);
});

test('dates, source and links are validated', () => {
  assert.ok(normalizeSupportRevisionInput(input({ effectiveStart: '' })).errors.some((e) => /takes effect/.test(e)));
  assert.ok(normalizeSupportRevisionInput(input({ effectiveEnd: '2026-01-01' })).errors.some((e) => /before the start/.test(e)));
  assert.ok(normalizeSupportRevisionInput(input({ sourceLabel: ' ' })).errors.some((e) => /source document/.test(e)));
  const { errors, revision } = normalizeSupportRevisionInput(input({
    accommodations: [{ id: 'study-sheet', params: { resources: [{ label: 'Bad', url: 'javascript:alert(1)' }, { label: 'Slope notes', url: 'https://docs.example.test/slope' }] } }],
  }));
  assert.ok(errors.some((e) => /https/.test(e)));
  assert.deepEqual(revision.accommodations[0].params.resources, [{ label: 'Slope notes', url: 'https://docs.example.test/slope' }]);
  assert.deepEqual(
    normalizeSupportRevisionInput(input({ accommodations: [{ id: 'extra-time', params: { dueDateExtension: { mode: 'school-days', value: 40 } } }] }))
      .revision.accommodations[0].params.dueDateExtension,
    { mode: 'school-days', value: 5 },
  );
});

test('the revision document records who and what, with an authorization list of its author', () => {
  const { revision } = normalizeSupportRevisionInput(input());
  const document = buildRevisionDocument({ revision, studentId: 'S910001', classId: 'class-a', revisionNumber: 2, createdByEmail: 'Teacher@Example.test' });
  assert.equal(document.createdByEmail, 'teacher@example.test');
  assert.deepEqual(document.authorizedTeacherEmails, ['teacher@example.test']);
  assert.equal(document.revision, 2);
  assert.equal(document.sourceLabel, 'IEP — annual review');
  assert.equal('createdAt' in document, false, 'the store stamps server time');
});

test('the revision in effect is the latest start on or before the date; re-entry for a start replaces it', () => {
  const revisions = [rev('r1', 1, '2026-08-17'), rev('r2', 2, '2026-10-01'), rev('r3', 3, '2026-08-17')];
  assert.equal(revisionEffectiveOn(revisions, '2026-08-01'), null);
  assert.equal(revisionEffectiveOn(revisions, '2026-09-10').id, 'r3', 'same start, higher revision wins');
  assert.equal(revisionEffectiveOn(revisions, '2026-10-01').id, 'r2');
  assert.equal(revisionEffectiveOn(revisions, '2027-05-01').id, 'r2');
  // The deadline module mirrors this rule (it cannot import it without a cycle).
  ['2026-08-01', '2026-09-10', '2026-10-01', '2027-05-01'].forEach((day) => {
    assert.equal(planWindowOn({ supportPlan: { windows: revisions } }, day)?.id ?? null, revisionEffectiveOn(revisions, day)?.id ?? null, day);
  });
  assert.deepEqual(sortRevisionTimeline(revisions).map((entry) => entry.id), ['r1', 'r3', 'r2']);
});

test('a backdated revision is "documented" for the past but was not "in the platform" yet', () => {
  const recordedR1 = Date.parse('2026-08-17T14:00:00Z');
  const recordedR2 = Date.parse('2026-10-10T14:00:00Z');
  const revisions = [
    rev('r1', 1, '2026-08-17', { createdAtMs: recordedR1 }),
    rev('r2', 2, '2026-10-01', { createdAtMs: recordedR2 }),
  ];
  const workOn = Date.parse('2026-10-05T15:00:00Z'); // after r2's start, before it was entered
  const answer = governingRevisionsAt(revisions, workOn);
  assert.equal(answer.documented.id, 'r2');
  assert.equal(answer.inPlatform.id, 'r1');
  assert.equal(answer.backdated, true);
  assert.equal(governingRevisionsAt(revisions, Date.parse('2026-10-12T15:00:00Z')).backdated, false);
});

test('the projection gives the student today\'s supports and future windows, never the privileged fields', () => {
  const revisions = [
    rev('r1', 1, '2026-08-17', { inclusionStatus: true, accommodations: [{ id: 'text-to-speech', params: {}, appliesTo: [] }], modifications: [{ id: 'reduce-complexity', params: {}, appliesTo: [] }] }),
    rev('r2', 2, '2026-11-02', { accommodations: [{ id: 'calculator', params: {}, appliesTo: [] }] }),
  ];
  const projection = buildSupportProjection({ revisions, todayKey: '2026-09-30', updatedAt: '2026-09-30T12:00:00.000Z' });
  assert.equal(projection.inclusionStatus, true);
  assert.deepEqual(projection.accommodations, ['text-to-speech']);
  assert.deepEqual(projection.modifications, ['reduce-complexity']);
  assert.deepEqual(projection.supportPlan.windows.map((window) => window.revisionId), ['r1', 'r2']);
  const serialized = JSON.stringify(projection);
  ['sourceLabel', 'sourceNote', 'serviceExpectations', 'createdByEmail', 'teacher-only note'].forEach((secret) => {
    assert.ok(!serialized.includes(secret), `${secret} must not reach the student-readable profile`);
  });
  // Every id the student could legitimately record using, incl. inclusion-implied ones.
  ['text-to-speech', 'reduce-complexity', 'calculator', 'declutter-ui'].forEach((id) => assert.ok(projection.supportPlan.entitledIds.includes(id), id));
});

test('a future revision switches on by date with no scheduler; an inactive one switches supports off', () => {
  const revisions = [
    rev('r1', 1, '2026-08-17', { accommodations: [{ id: 'text-to-speech', params: {}, appliesTo: [] }] }),
    rev('r2', 2, '2026-11-02', { status: REVISION_STATUS.INACTIVE }),
  ];
  const profile = buildSupportProjection({ revisions, todayKey: '2026-09-30' });
  const before = resolveEffectiveSupportPlan(profile, { dateKey: '2026-10-30' });
  assert.equal(before.source, 'plan');
  assert.ok(planHasSupport(before, 'text-to-speech'));
  assert.equal(before.nextWindow.effectiveStart, '2026-11-02');
  const after = resolveEffectiveSupportPlan(profile, { dateKey: '2026-11-02' });
  assert.equal(after.active, false);
  assert.deepEqual(after.accommodations, []);
});

test('an expired profile keeps applying and is flagged', () => {
  const profile = buildSupportProjection({
    revisions: [rev('r1', 1, '2025-08-18', { effectiveEnd: '2026-08-14', accommodations: [{ id: 'text-to-speech', params: {}, appliesTo: [] }] })],
    todayKey: '2026-09-30',
  });
  const plan = resolveEffectiveSupportPlan(profile, { dateKey: '2026-09-30' });
  assert.equal(plan.expired, true);
  assert.ok(planHasSupport(plan, 'text-to-speech'));
  assert.ok(supportProfileWarnings(profile, { nowValue: Date.parse('2026-09-30T15:00:00Z') }).some((w) => w.code === 'expired'));
});

test('a pre-versioning flat profile still applies, and says it has no history', () => {
  const legacy = { inclusionStatus: false, accommodations: ['text-to-speech', 'extra-time'], modifications: [], translationLanguage: null };
  const plan = resolveEffectiveSupportPlan(legacy, { dateKey: '2026-09-30' });
  assert.equal(plan.source, 'legacy');
  assert.equal(plan.revisionId, LEGACY_REVISION_ID);
  assert.ok(planHasSupport(plan, 'text-to-speech'));
  const codes = supportProfileWarnings(legacy).map((w) => w.code);
  assert.ok(codes.includes('unversioned'));
  assert.ok(codes.includes('extra-time-unset'), 'legacy extra time moves no deadline, and the teacher is told');
  assert.equal(resolveEffectiveSupportPlan({}, {}).source, 'none');
  // A structured (SIS) accommodations object is not the flat shape.
  assert.equal(legacyProfileToRevision({ accommodations: { textToSpeech: true } }), null);
});

test('applicability by activity role: empty means everywhere; inclusion implies its supports', () => {
  const plan = resolveEffectiveSupportPlan(buildSupportProjection({
    revisions: [rev('r1', 1, '2026-08-17', { inclusionStatus: true, accommodations: [{ id: 'calculator', params: {}, appliesTo: ['classwork'] }, { id: 'text-to-speech', params: {}, appliesTo: [] }] })],
    todayKey: '2026-09-30',
  }), { dateKey: '2026-09-30' });
  assert.ok(supportAppliesToRole(plan, 'calculator', 'classwork'));
  assert.ok(!supportAppliesToRole(plan, 'calculator', 'dol'));
  assert.ok(supportAppliesToRole(plan, 'text-to-speech', 'dol'));
  assert.ok(supportAppliesToRole(plan, 'declutter-ui', 'dol'));
  assert.ok(!supportAppliesToRole(plan, 'reduce-complexity', 'classwork'));
});
