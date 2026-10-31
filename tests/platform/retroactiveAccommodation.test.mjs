import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveItemReductionPolicy, resolveStudentWorkload } from '../../functions/shared/reducedWorkload.mjs';
import { splitGrade } from '../../src/platform/teacher/gradeEvidence.js';
import { launchSupportRecords } from '../../src/platform/supportEvidence/studentSupportTelemetry.js';
import { workloadFactFor } from '../../src/platform/supportEvidence/evidenceAggregation.js';
import { buildStudentGradeCenter } from '../../src/platform/student/studentGradeCenterModel.js';
import { normalizeStudentProfile, sameStudentProfile } from '../../src/studentSupport.js';
const m = await import('../../functions/shared/retroactiveAccommodation.mjs').catch(() => ({}));
const assignment = { id: 'synthetic-a', schemaVersion: 5, dueAt: '2026-09-15', sections: [{ id: 'cw', role: 'classwork', questions: Array.from({ length: 20 }, (_, i) => ({ questionId: `q${i}`, type: 'numeric', standard: 'A.5A', questionWeight: i === 0 ? 2 : 1 })) }] };
const request = { percent: 20, sourceDescriptor: 'Documented annual review', effectiveDate: '2026-08-01', fromDate: '2026-09-01', toDate: '2026-09-30', appliesTo: ['classwork'] };
const nowValue = Date.parse('2026-10-29T18:00:00Z');
const plan = (extra = {}) => m.previewRetroactiveSelection({ assignment, gradeData: { profile: {} }, request, nowValue, ...extra });
test('explicit historical preview offers 16 of 20 without changing due-date history', () => {
  assert.equal(typeof m.previewRetroactiveSelection, 'function');
  const p = plan();
  assert.equal(p.status, 'eligible');
  assert.equal(p.previousRequiredCount, 20);
  assert.equal(p.proposedRequiredCount, 16);
  assert.equal(p.actualPercentTenths, 200);
  assert.equal(resolveItemReductionPolicy({ assignment, profile: {}, nowValue }).status, 'none');
});
test('answered work, core items and linked groups stay intact', () => {
  const a = structuredClone(assignment);
  a.sections[0].questions[0].coreItem = true;
  a.sections[0].questions[1].itemGroup = 'pair'; a.sections[0].questions[2].itemGroup = 'pair';
  const tracker = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i, { status: 'correct' }]));
  const p = plan({ assignment: a, gradeData: { gradesByAssignment: { [a.id]: tracker } } });
  assert.ok(p.proposedRequiredIndices.includes(0));
  assert.equal(p.omittedIndices.includes(1), p.omittedIndices.includes(2));
  assert.ok(p.proposedRequiredCount >= 19);
});
test('secure, missing historic content, replacement ambiguities and conflicting overrides fail closed', () => {
  assert.equal(plan({ assignment: { ...assignment, secure: true } }).status, 'manual-review');
  assert.equal(plan({ assignment: { ...assignment, schemaVersion: 4 } }).status, 'manual-review');
  assert.equal(plan({ assignment: { ...assignment, contentVersion: 2 } }).status, 'manual-review');
  assert.equal(plan({ assignment: { ...assignment, contentLineage: { version: 2 } } }).status, 'manual-review');
  assert.equal(plan({ gradeData: { teacherGradeOverridesByAssignment: { [assignment.id]: { __assignment: { active: true, score: 0 } } } } }).status, 'manual-review');
});
test('activity scope, Practice Pass, rounding, unique TEKS and one-item exit tickets use canonical selection', () => {
  const scoped = structuredClone(assignment);
  scoped.sections.push({ role: 'dol', questions: [{ questionId: 'one-dol', type: 'numeric', standard: 'A.5B' }] }, { role: 'practice', questions: Array.from({ length: 10 }, (_, i) => ({ questionId: `p${i}`, type: 'numeric', standard: 'A.5A' })) });
  const p = plan({ assignment: scoped });
  assert.equal(p.proposedRequiredCount, 27);
  assert.ok(p.proposedRequiredIndices.includes(20));
  assert.ok(p.variance.includes('limited-to-activities'));
  const waived = plan({ assignment: scoped, practiceWaived: Array.from({ length: 10 }, (_, i) => i + 21) });
  assert.equal(waived.originalCount, 21);
  assert.equal(waived.proposedRequiredCount, 17);
  const unique = structuredClone(assignment); unique.sections[0].questions.forEach((q, i) => { q.standard = `A.${i + 1}A`; });
  assert.equal(plan({ assignment: unique }).proposedRequiredCount, 20);
  const tiny = { ...assignment, sections: [{ role: 'classwork', questions: assignment.sections[0].questions.slice(0, 3) }] };
  assert.equal(plan({ assignment: tiny }).actualPercentTenths, 333);
});
test('approved required set affects the same canonical weighted grade, not attempts', () => {
  const p = plan();
  const tracker = { 0: { status: 'attempted', partialCredit: 25, bestPartialCredit: 50 } };
  const profile = { workloadCorrections: { [assignment.id]: { active: true, eventId: 'synthetic-event', contentKey: m.workloadContentKey(assignment), percent: 20, requiredIndices: p.proposedRequiredIndices, omittedIndices: p.omittedIndices, originalCount: 20, actualPercentTenths: 200, approvedAt: '2026-10-29' } } };
  const copy = structuredClone(tracker);
  const result = resolveStudentWorkload({ assignment, profile, tracker, nowValue });
  assert.equal(result.summary.kind, 'retroactive-grade-correction');
  assert.ok(result.indices.includes(0));
  assert.deepEqual(tracker, copy);
  assert.equal(splitGrade({ assignment, tracker, supportProfile: profile }).total, 16);
  assert.equal(splitGrade({ assignment, tracker, supportProfile: profile }).score, 6);
  const changed = structuredClone(assignment); changed.sections[0].questions[0].questionWeight = 5;
  assert.equal(resolveStudentWorkload({ assignment: changed, profile, tracker }).reviewNeeded, true);
  assert.equal(splitGrade({ assignment: changed, tracker, supportProfile: profile }).score, null);
});
test('policy validates dates, percentage, activities and non-sensitive source descriptor', () => {
  assert.throws(() => plan({ request: { ...request, percent: 9 } }), /10.*50/);
  assert.throws(() => plan({ request: { ...request, fromDate: '2026-02-30' } }), /date/i);
  assert.throws(() => plan({ request: { ...request, appliesTo: ['secret'] } }), /activit/i);
  assert.equal(plan({ request: { ...request, effectiveDate: '2026-10-01' } }).status, 'out-of-range');
});
test('a retroactive correction creates no provided support evidence or derived delivery claim', () => {
  const p = plan();
  const profile = { accommodations: ['reduced-item-count-same-rigor'], workloadCorrections: { [assignment.id]: { active: true, eventId: 'event', contentKey: m.workloadContentKey(assignment), percent: 20, omittedIndices: p.omittedIndices } } };
  const resolved = resolveStudentWorkload({ assignment, profile });
  const launch = launchSupportRecords({ profile, assignment, roles: ['classwork'], questions: assignment.sections[0].questions, workload: { status: resolved.status, workload: resolved.summary } });
  assert.equal(launch.records.some((r) => r.supportId === 'reduced-item-count-same-rigor' && r.eventType === 'provided'), false);
  assert.equal(workloadFactFor({ assignment, student: { profile } }), null);
});
test('Grade Center section weight shares match the approved full-assignment denominator', () => {
  const a = structuredClone(assignment); a.assignedClassIds = ['synthetic-class'];
  a.sections.push({ role: 'practice', questions: Array.from({ length: 10 }, (_, i) => ({ questionId: `p${i}`, type: 'numeric', standard: 'A.5B' })) });
  const p = plan({ assignment: a });
  const profile = { workloadCorrections: { [a.id]: { active: true, eventId: 'synthetic-event', contentKey: m.workloadContentKey(a), percent: 20, omittedIndices: p.omittedIndices } } };
  const result = buildStudentGradeCenter({ classId: 'synthetic-class', studentId: 'synthetic', assignments: [a], supportProfile: profile, tracker: { [a.id]: { 0: { status: 'correct', totalAttempts: 1 } } }, nowValue });
  assert.equal(result.entries[0].sectionShares.classwork.possibleWeight, 17);
  assert.equal(result.entries[0].sectionShares.practice.possibleWeight, 10);
});
test('a normalized manual profile retains server correction and live equality detects its new event', () => {
  const original = { accommodations: ['reduced-item-count-same-rigor'], workloadCorrections: { [assignment.id]: { eventId: 'first', active: true } } };
  const normalized = normalizeStudentProfile(original);
  assert.deepEqual(normalized.workloadCorrections, original.workloadCorrections);
  assert.equal(sameStudentProfile(normalized, normalizeStudentProfile({ ...original, workloadCorrections: { [assignment.id]: { eventId: 'second', active: true } } })), false);
});
