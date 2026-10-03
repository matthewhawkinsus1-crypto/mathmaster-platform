// REDUCED ITEM COUNT — THE CASES AN ADVERSARIAL REVIEW FOUND.
//
// Each test pins one way the reduced-item projection could disagree with
// itself or break its "same TEKS, same rigor" promise, and the fix for it
// (functions/shared/reducedWorkload.mjs and its readers).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  planReducedWorkload,
  resolveItemReductionPolicy,
  studentOmittedIndices,
  workloadItemsFromAssignment,
} from '../../functions/shared/reducedWorkload.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { repairAssignmentForCurrentRuntime } from '../../functions/shared/runtime/assignmentRuntimeRepair.mjs';
import { envelopeResetsRecord } from '../../functions/shared/submissionIngestion.mjs';
import { projectTeacherOverridesForDisplay } from '../../src/platform/grading/canonicalGradeProjection.js';
import { buildAssignmentEvidenceRow, workloadFactFor } from '../../src/platform/supportEvidence/evidenceAggregation.js';
import { launchSupportRecords, notApplicableReason, studentMayRecordSupport } from '../../src/platform/supportEvidence/studentSupportTelemetry.js';
import { studentRequiredQuestions } from '../../src/assignmentLifecycle.js';
import { normalizeStudentProfile, sameStudentProfile } from '../../src/studentSupport.js';
import { region, executableSource } from './helpers/sourceContract.mjs';
import { availabilityEventId, buildStudentEvidenceEvent, PLATFORM_EVALUATED_SUPPORT_IDS } from '../../functions/shared/supportEvidenceModel.mjs';
import { buildSupportEvidenceReport, supportHeadline } from '../../src/platform/supportEvidence/supportEvidenceReport.js';


const require = createRequire(import.meta.url);
const { studentOmittedFor } = require('../../functions/lib/studentWorkloadIndices.js');

const ID = 'reduced-item-count-same-rigor';
const NOW = Date.parse('2026-10-01T15:00:00Z');
const profileAt = (percent) => buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17',
    accommodations: [{ id: ID, params: { itemReduction: { mode: 'percent', value: percent } }, appliesTo: [] }],
    modifications: [],
  }],
  todayKey: '2026-10-01',
});
const q = (id, standard, extra = {}) => ({ questionId: id, type: 'numeric', prompt: 'Solve.', standard, ...extra });

test('a higher percentage omits a superset of a lower one, linked groups included', () => {
  const fixtures = [
    ['A4', [q('a', 'A.5A'), q('b', 'A.5A', { itemGroup: 'G' }), q('c', 'A.5A', { itemGroup: 'G' }), q('d', 'A.5A'), q('e', 'A.5A'), q('f', 'A.5A')]],
    ['A1', Array.from({ length: 7 }, (_, i) => q(`s${i}`, 'A.5A', i < 2 ? { itemGroup: 'H' } : {}))],
    ['A9', Array.from({ length: 12 }, (_, i) => q(`m${i}`, i % 3 ? 'A.5A' : 'A.5B', i >= 4 && i < 7 ? { itemGroup: 'K' } : {}))],
  ];
  fixtures.forEach(([id, questions]) => {
    const items = workloadItemsFromAssignment({ sections: [{ role: 'practice', questions }] });
    let previous = new Set();
    for (let percent = 10; percent <= 50; percent += 1) {
      const removed = new Set(planReducedWorkload({ items, percent, seedKey: id }).removed);
      previous.forEach((index) => assert.ok(removed.has(index), `${id}: ${percent}% hands back item ${index}`));
      previous = removed;
    }
  });
});

test('the plan is a prefix of one fixed order: a linked group that does not fit stops it, never a later unit jumping ahead', () => {
  // Two linked groups of three (A.5A) and two of two (A.5B). Skipping past a
  // group that does not fit would omit a two-part group at 20% and hand it
  // back at 30%.
  const questions = [
    ...['x', 'y'].flatMap((group) => [0, 1, 2].map((i) => q(`${group}${i}`, 'A.5A', { itemGroup: `T${group}` }))),
    ...['u', 'v'].flatMap((group) => [0, 1].map((i) => q(`${group}${i}`, 'A.5B', { itemGroup: `D${group}` }))),
  ];
  const items = workloadItemsFromAssignment({ sections: [{ role: 'practice', questions }] });
  ['A1', 'A2', 'A3', 'B7'].forEach((seedKey) => {
    let previous = new Set();
    for (let percent = 10; percent <= 50; percent += 1) {
      const removed = new Set(planReducedWorkload({ items, percent, seedKey }).removed);
      previous.forEach((index) => assert.ok(removed.has(index), `${seedKey}: ${percent}% hands back item ${index}`));
      previous = removed;
    }
  });
});

test('a linked group covers every TEKS its parts assess: no TEKS leaves the section with it', () => {
  // Three two-part groups in one A.5A cell; only group G also assesses A.5B.
  const groups = [
    [q('g1', 'A.5A', { itemGroup: 'G', dok: 2 }), q('g2', 'A.5B', { itemGroup: 'G', dok: 2 })],
    [q('h1', 'A.5A', { itemGroup: 'H', dok: 2 }), q('h2', 'A.5A', { itemGroup: 'H', dok: 2 })],
    [q('i1', 'A.5A', { itemGroup: 'I', dok: 2 }), q('i2', 'A.5A', { itemGroup: 'I', dok: 2 })],
  ];
  const items = workloadItemsFromAssignment({ sections: [{ role: 'practice', questions: groups.flat() }] });
  for (let seed = 0; seed < 12; seed += 1) {
    for (const percent of [25, 34, 50]) {
      const removed = new Set(planReducedWorkload({ items, percent, seedKey: `A${seed}` }).removed);
      const kept = new Set(items.filter((item) => !removed.has(item.storageIndex)).map((item) => item.question.standard));
      assert.ok(kept.has('A.5B'), `seed A${seed} ${percent}%: A.5B must stay assessed`);
    }
  }
});

test('a single question carries one TEKS; mixed sections keep each TEKS', () => {
  const questions = [
    q('a', 'A.5A', { itemGroup: 'G' }), q('b', 'A.5B', { itemGroup: 'G' }),
    q('c', 'A.5A'), q('d', 'A.5A'), q('e', 'A.5A'), q('f', 'A.5A'),
  ];
  const items = workloadItemsFromAssignment({ sections: [{ role: 'practice', questions }] });
  for (let percent = 10; percent <= 50; percent += 1) {
    const removed = new Set(planReducedWorkload({ items, percent, seedKey: 'A3' }).removed);
    const keptStandards = new Set(items.filter((item) => !removed.has(item.storageIndex)).map((item) => item.question.standard));
    assert.ok(keptStandards.has('A.5B'), `${percent}%: A.5B must stay assessed`);
    assert.ok(keptStandards.has('A.5A'));
  }
});

test('a DOL marked on a question (not a DOL section) is the DOL: a one-question DOL is never omitted', () => {
  const assignment = {
    id: 'A3', schemaVersion: 5,
    sections: [{ id: 'p', role: 'practice', questions: [q('a', 'A.5A'), q('b', 'A.5A'), q('c', 'A.5A', { isDOL: true }), q('d', 'A.5A')] }],
  };
  for (const percent of [25, 50]) {
    assert.ok(!studentOmittedIndices({ assignment, profile: profileAt(percent), nowValue: NOW }).has(2), `${percent}%`);
  }
  // A legacy enabled DOL pointing at one question.
  const legacy = { ...assignment, id: 'A5', dol: { enabled: true, questionIndex: 1 }, sections: [{ id: 'p', role: 'practice', questions: [q('a', 'A.5A'), q('b', 'A.5A'), q('c', 'A.5A'), q('d', 'A.5A')] }] };
  assert.equal(workloadItemsFromAssignment(legacy)[1].role, 'dol');
  assert.ok(!studentOmittedIndices({ assignment: legacy, profile: profileAt(50), nowValue: NOW }).has(1));
});

test('the stored and the runtime-repaired copy of an assignment omit the same items', () => {
  const analyzer = (id) => ({ questionId: id, type: 'signSolutionAnalyzer', prompt: 'Solve −2x + 3 > 7.' });
  const step = (id) => ({ questionId: id, type: 'stepAlgebra', prompt: 'Solve 2x + 1 = 7.', equation: '2x + 1 = 7' });
  const stored = { id: 'A7', schemaVersion: 5, sections: [{ id: 'c', role: 'classwork', questions: [analyzer('s1'), analyzer('s2'), step('t1'), step('t2'), step('t3'), analyzer('s3'), step('t4'), analyzer('s4')] }] };
  const repaired = repairAssignmentForCurrentRuntime(stored).assignment;
  assert.notEqual(repaired.sections[0].questions[0].type, stored.sections[0].questions[0].type, 'the fixture is really repaired');
  for (const percent of [25, 40, 50]) {
    const profile = profileAt(percent);
    assert.deepEqual(
      [...studentOmittedIndices({ assignment: repaired, profile, nowValue: NOW })],
      [...studentOmittedIndices({ assignment: stored, profile, nowValue: NOW })],
      `${percent}%`,
    );
  }
});

test('two revisions recorded with the same start and number: the later-recorded one governs', () => {
  const revisions = [
    { id: 'tabA', revisionId: 'tabA', revision: 2, status: 'active', effectiveStart: '2026-09-01', createdAtMs: 1000, accommodations: [{ id: ID, params: { itemReduction: { mode: 'percent', value: 25 } } }], modifications: [] },
    { id: 'tabB', revisionId: 'tabB', revision: 2, status: 'active', effectiveStart: '2026-09-01', createdAtMs: 2000, accommodations: [{ id: ID, params: { itemReduction: { mode: 'percent', value: 40 } } }], modifications: [] },
  ];
  const profile = buildSupportProjection({ revisions, todayKey: '2026-10-01' });
  const policy = resolveItemReductionPolicy({ profile, assignment: { dueAt: '2026-10-05' }, nowValue: NOW });
  assert.equal(policy.revisionId, 'tabB');
  assert.equal(policy.percent, 40);
});

test('a teacher section zero shown as "attempted" is not answered work: it does not pin an omitted item', () => {
  const assignment = { id: 'A8', schemaVersion: 5, sections: [
    { id: 'c', role: 'classwork', questions: [q('a', 'A.5A'), q('b', 'A.5A'), q('c', 'A.5A'), q('d', 'A.5A')] },
    { id: 'p', role: 'practice', questions: [q('e', 'A.5A'), q('f', 'A.5A'), q('g', 'A.5A'), q('h', 'A.5A')] },
  ] };
  const profile = profileAt(25);
  const plan = [...studentOmittedIndices({ assignment, profile, nowValue: NOW })];
  assert.ok(plan.length > 0);
  const target = plan[plan.length - 1];
  const raw = { [target]: { status: 'unattempted', totalAttempts: 0, timeSpent: 12 } };
  const overrides = { [target]: { active: true, score: 0, persistent: true, source: 'teacher-section-zero' } };
  const projected = projectTeacherOverridesForDisplay({ [assignment.id]: raw }, { [assignment.id]: overrides })[assignment.id];
  assert.equal(projected[target].status, 'attempted', 'the display projection does say attempted');
  assert.deepEqual(
    [...studentOmittedIndices({ assignment, profile, tracker: projected, nowValue: NOW })].sort(),
    [...studentOmittedIndices({ assignment, profile, tracker: raw, nowValue: NOW })].sort(),
  );
  assert.ok(studentOmittedIndices({ assignment, profile, tracker: projected, nowValue: NOW }).has(target));
});

test('an authorized replacement is read as reset by the server projection, as every later read sees it', async () => {
  const assignment = { sections: [{ id: 'c', role: 'classwork', questions: Array.from({ length: 8 }, (_, i) => q(`r${i}`, 'A.5A')) }] };
  const profile = profileAt(25);
  const planned = [...studentOmittedIndices({ assignment: { id: 'A6', ...assignment }, profile, nowValue: NOW })];
  const pinnedIndex = planned[0];
  const canonicalRecord = { status: 'expired', totalAttempts: 3, attemptCount: 3, variantIndex: 0 };
  const gradeData = { profile, gradesByAssignment: { A6: { [pinnedIndex]: canonicalRecord } } };
  const envelope = { kind: 'questionReplacement', questionIndex: pinnedIndex, record: { status: 'unattempted', variantIndex: 1, totalAttempts: 0 } };
  assert.equal(envelopeResetsRecord({ envelope, canonicalRecord }), true);
  assert.equal(envelopeResetsRecord({ envelope: { ...envelope, kind: 'submission' }, canonicalRecord }), false);
  const pinned = await studentOmittedFor({ assignment, gradeData, assignmentId: 'A6' });
  assert.ok(!pinned.has(pinnedIndex), 'before the replacement the answered item is pinned');
  const afterReset = await studentOmittedFor({ assignment, gradeData, assignmentId: 'A6', resetIndex: pinnedIndex });
  const written = { ...gradeData, gradesByAssignment: { A6: { [pinnedIndex]: { status: 'unattempted', variantIndex: 1 } } } };
  assert.deepEqual([...afterReset].sort(), [...await studentOmittedFor({ assignment, gradeData: written, assignmentId: 'A6' })].sort());
});

test('the evidence record and the report\'s recomputation agree for a student with a Practice Pass', () => {
  const assignment = { id: 'A2', schemaVersion: 5, dueAt: '2026-10-05', sections: [
    { id: 'c', role: 'classwork', questions: Array.from({ length: 8 }, (_, i) => q(`c${i}`, 'A.5A')) },
    { id: 'p', role: 'practice', questions: Array.from({ length: 8 }, (_, i) => q(`p${i}`, 'A.5A')) },
  ] };
  const profile = normalizeStudentProfile(profileAt(25), { nowValue: NOW });
  // What the student's client records at launch: the accommodation over the
  // content (App.jsx `accommodation`), even though their pass excuses Practice.
  const accommodation = studentRequiredQuestions({ assignment, profile, nowValue: NOW });
  const withPass = studentRequiredQuestions({ assignment, profile, hasPracticePass: true, nowValue: NOW });
  assert.ok(withPass.indices.length < accommodation.indices.length);
  const [record] = launchSupportRecords({ profile, assignment, roles: ['classwork'], workload: accommodation, nowValue: NOW }).records
    .filter((entry) => entry.supportId === ID);
  assert.equal(record.eventType, 'provided');
  const fact = workloadFactFor({
    assignment,
    student: { id: 'S', profile, gradesByAssignment: {} },
    events: [{ ...record, occurredAtMs: NOW, source: 'automatic-telemetry', actorType: 'student' }],
    nowValue: NOW,
  });
  assert.equal(fact.verified, true);
});

test('the App plans on the stored document, records the accommodation over the content, and follows a re-saved profile', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const launch = executableSource(region(app, 'const launchedSupportKeyRef = useRef(\'\');', 'const activeDOLState = getDOLState(', 'launch evidence'));
  assert.match(launch, /accommodation = studentRequiredFor\(activeAssignmentData\);/);
  assert.match(launch, /workload: accommodation \}\)/);
  const listener = executableSource(region(app, "doc(db, 'grades', user.id),", 'Object.entries(next).forEach', 'student grades listener'));
  assert.match(listener, /const liveProfile = normalizeStudentProfile\(snapshot\.data\(\)\?\.profile \|\| snapshot\.data\(\)\);/);
  assert.match(listener, /setUser\(\(current\) => \(current && !sameStudentProfile\(current\.profile, liveProfile\) \? \{ \.\.\.current, profile: liveProfile \} : current\)\);/);
  assert.match(app, /\bsameStudentProfile,\n\} from '\.\/studentSupport';/);

  const a = normalizeStudentProfile(profileAt(25), { nowValue: NOW });
  const b = normalizeStudentProfile(JSON.parse(JSON.stringify(profileAt(25))), { nowValue: NOW });
  b.supportPlan.updatedAt = a.supportPlan.updatedAt;
  assert.equal(sameStudentProfile(a, b), true);
  assert.equal(sameStudentProfile(a, normalizeStudentProfile(profileAt(40), { nowValue: NOW })), false);
});

// --- Evidence, report and privacy ---------------------------------------------------------------

const lessonOf = (id, dueAt = '2026-09-28') => ({
  id, title: id, schemaVersion: 5, assignedClassIds: ['class-a'], dueAt,
  sections: [{ id: 'p', role: 'practice', questions: Array.from({ length: 20 }, (_, i) => q(`${id}-${i}`, i % 2 ? 'A.5A' : 'A.5B')) }],
});
const rev = (id, number, start, params, createdAtMs, extra = []) => ({
  id, revisionId: id, revision: number, status: 'active', effectiveStart: start, sourceLabel: 'IEP (synthetic)',
  createdByEmail: 't@example.test', createdAtMs, inclusionStatus: false,
  accommodations: params ? [{ id: ID, params, appliesTo: [] }, ...extra] : extra, modifications: [],
});

test('an assignment governed by an earlier automatic revision is recorded under it, and the student may record it', () => {
  // r1 (Sept) reduces by 25%; r2 (Oct) drops the support. A September
  // assignment opened late in October is still reduced under r1.
  const revisions = [
    rev('r1', 1, '2026-09-01', { itemReduction: { mode: 'percent', value: 25 } }, Date.parse('2026-09-01T12:00:00Z')),
    rev('r2', 2, '2026-10-01', null, Date.parse('2026-10-01T12:00:00Z'), [{ id: 'text-to-speech', params: {}, appliesTo: [] }]),
  ];
  const later = Date.parse('2026-10-02T15:00:00Z');
  const profile = normalizeStudentProfile(buildSupportProjection({ revisions, todayKey: '2026-10-02' }), { nowValue: later });
  const assignment = lessonOf('G1');
  const workload = studentRequiredQuestions({ assignment, profile, nowValue: later });
  assert.equal(workload.status, 'applied');
  const record = launchSupportRecords({ profile, assignment, roles: ['practice'], workload, nowValue: later }).records.find((entry) => entry.supportId === ID);
  assert.equal(record?.eventType, 'provided');
  assert.equal(record.profileRevisionId, 'r1');
  assert.equal(studentMayRecordSupport(profile, ID, { nowValue: later }), true, 'the rules\' entitledIds carry it');
});

test('a "not applicable" record never occupies the id a later "provided" needs', () => {
  const base = { assignmentId: 'B1', profileRevisionId: 'r1', supportId: ID, variant: '5806c0fb' };
  assert.notEqual(availabilityEventId({ ...base, eventType: 'not-applicable' }), availabilityEventId({ ...base, eventType: 'provided' }));
  assert.notEqual(availabilityEventId({ ...base, eventType: 'unavailable' }), availabilityEventId({ ...base, eventType: 'provided' }));
  // Positive records keep the id they always had.
  assert.equal(availabilityEventId({ ...base, eventType: 'available' }), availabilityEventId(base));
});

test('a student\'s client may record a negative fact only for a support the platform evaluates', () => {
  // The reduced item count, and (language supports) the per-question tools.
  assert.deepEqual([...PLATFORM_EVALUATED_SUPPORT_IDS].sort(), [ID, 'chunked-directions', 'glossary-lookup', 'sentence-frames', 'text-to-speech', 'translation'].sort());
  const event = (supportId, eventType) => buildStudentEvidenceEvent({
    studentId: 'S', classId: 'C', assignmentId: 'A', supportId, eventType, assignedTeacherEmail: 't@example.test',
  });
  assert.equal(event(ID, 'not-applicable').errors.length, 0);
  assert.ok(event('repeat-instructions', 'not-applicable').errors.length > 0);
  assert.ok(event('graph-paper', 'unavailable').errors.length > 0);
  // Already-stored student negatives for other supports cannot hide a gap.
  const assignment = lessonOf('M1', '2026-10-05');
  const manual = rev('r1', 1, '2026-08-17', null, Date.parse('2026-08-17T12:00:00Z'), [{ id: 'repeat-instructions', params: {}, appliesTo: [] }]);
  const row = buildAssignmentEvidenceRow({
    assignment,
    student: { id: 'S', classId: 'class-a', profile: buildSupportProjection({ revisions: [manual], todayKey: '2026-10-06' }), gradesByAssignment: { M1: { 0: { status: 'correct', totalAttempts: 1 } } } },
    revisions: [manual],
    evidence: [{ id: 'x', studentId: 'S', assignmentId: 'M1', supportId: 'repeat-instructions', eventType: 'not-applicable', source: 'automatic-telemetry', actorType: 'system', occurredAtMs: NOW }],
    nowValue: NOW,
  });
  assert.ok(row.gaps.some((gap) => gap.code === 'no-staff-record' && gap.supportId === 'repeat-instructions'));
});

test('report: "X of Y eligible" only where MathMaster records every opened assignment, over the same rows', () => {
  const r1 = rev('r1', 1, '2026-08-17', { itemReduction: { mode: 'percent', value: 25 } }, Date.parse('2026-08-17T12:00:00Z'), [
    { id: 'no-countdown', params: {}, appliesTo: [] },
  ]);
  const profile = buildSupportProjection({ revisions: [r1], todayKey: '2026-10-06' });
  const a = lessonOf('E1', '2026-10-01');
  const b = lessonOf('E2', '2026-10-02');
  const student = { id: 'S1', classId: 'class-a', profile, gradesByAssignment: { E1: { 0: { status: 'correct', totalAttempts: 1 } }, E2: { 0: { status: 'correct', totalAttempts: 1 } } } };
  const event = (assignmentId, supportId, eventType) => ({
    id: `${assignmentId}-${supportId}-${eventType}`, studentId: 'S1', assignmentId, supportId, eventType,
    source: 'automatic-telemetry', actorType: 'system', occurredAtMs: Date.parse('2026-10-01T14:00:00Z'),
  });
  const report = buildSupportEvidenceReport({
    student, assignments: [a, b], revisions: [r1],
    // Provided on E1; E2 had nothing to reduce. A countdown hidden once.
    evidence: [event('E1', ID, 'provided'), event('E2', ID, 'not-applicable'), event('E1', 'no-countdown', 'provided'), event('Z9', 'no-countdown', 'provided')],
    selection: { fromDateKey: '2026-09-01', toDateKey: '2026-10-10' }, nowValue: NOW,
  });
  const reduced = report.summary.supports.find((support) => support.supportId === ID);
  assert.equal(reduced.assignmentsNotApplicable, 1);
  assert.equal(reduced.assignmentsEligible, 1, 'the not-applicable assignment is not in the denominator');
  assert.equal(supportHeadline(reduced), 'Provided in 1 of 1 eligible');
  const countdown = report.summary.supports.find((support) => support.supportId === 'no-countdown');
  assert.equal(countdown.denominatorKnown, false);
  assert.ok(countdown.assignmentsDelivered <= countdown.assignmentsEligible);
  assert.equal(supportHeadline(countdown), 'Provided in 1 assignment where it applied');
  assert.equal(supportHeadline({ supportId: 'extra-attempts', automation: 'automatic', measurable: ['provided'], recordedInAssignments: false }), 'Not recorded in assignments (My Math Path)');
});

test('work finished before the automatic revision was saved is said to predate it, not reported as unrecorded', () => {
  const r1 = rev('r1', 1, '2026-10-05', { itemReduction: { mode: 'percent', value: 25 } }, Date.parse('2026-10-05T12:00:00Z'));
  const assignment = lessonOf('P1', '2026-10-10');
  const tracker = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i, { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-10-03T15:00:00Z' }]));
  const row = buildAssignmentEvidenceRow({
    assignment,
    student: { id: 'S', classId: 'class-a', profile: buildSupportProjection({ revisions: [r1], todayKey: '2026-10-06' }), gradesByAssignment: { P1: tracker } },
    revisions: [r1], evidence: [], nowValue: NOW,
  });
  assert.ok(row.gaps.some((gap) => gap.code === 'automatic-predates-revision'));
  assert.ok(!row.gaps.some((gap) => gap.code === 'automatic-not-recorded'));
});

test('a not-applicable record names the decisive cause, not rounding', () => {
  assert.equal(notApplicableReason(['rounding', 'practice-pass']), 'practice-pass');
  assert.equal(notApplicableReason(['limited-to-activities', 'too-few-items']), 'too-few-items');
  assert.equal(notApplicableReason([]), 'nothing-to-reduce');
});

test('the projected room view never shows who has fewer items', () => {
  const monitor = executableSource(readFileSync(new URL('../../src/components/teacher/LiveClassMonitor.jsx', import.meta.url), 'utf8'));
  assert.match(monitor, /<ProgressStrip questionStates=\{live\.questionStates\} questionIndex=\{live\.questionIndex\} conceal=\{roomMode\} \/>/);
  assert.match(monitor, /\.replaceAll\(QUESTION_STATE_CHARS\.NOT_REQUIRED, QUESTION_STATE_CHARS\.UNTOUCHED\)/);
  assert.match(monitor, /\{!roomMode && row\.counts\.notRequired > 0 && ' · fewer items'\}/);
  assert.match(monitor, /\{row\.counts\.answered\} of \{roomMode\s*\? \(live\.questionCount \|\| row\.counts\.answered\)/);
});
