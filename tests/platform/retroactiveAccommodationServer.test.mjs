import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FakeFirestore, FakeFieldPath, FAKE_FIELD_VALUE } from './helpers/serverCallableHarness.mjs';
import { canonicalPresentedAssignmentGrade } from '../../src/platform/grading/canonicalGradeProjection.js';
const require = createRequire(import.meta.url);
let service = {}; try { service = require('../../functions/lib/retroactiveAccommodation.js'); } catch { /* initial red */ }
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const assignment = { id: 'synthetic-a', schemaVersion: 5, title: 'Synthetic lesson', classId: 'synthetic-class', dueAt: '2026-09-15', sections: [{ role: 'classwork', questions: Array.from({ length: 20 }, (_, i) => ({ questionId: `q${i}`, type: 'numeric', standard: 'A.5A' })) }] };
const input = { percent: 20, sourceDescriptor: 'Annual review reference', effectiveDate: '2026-08-01', fromDate: '2026-09-01', toDate: '2026-09-30', appliesTo: ['classwork'] };
const teacher = { uid: 'teacher-a', token: { role: 'teacher', email: 'teacher.a@example.test', email_verified: true } };
const setup = () => {
  assert.equal(typeof service.createRetroactiveAccommodationService, 'function');
  const db = new FakeFirestore({ grades: { synthetic: { classId: 'synthetic-class', profile: {}, gradesByAssignment: { 'synthetic-a': { 0: { status: 'correct', totalAttempts: 1 } } } } }, classes: { 'synthetic-class': { teacherOfRecord: teacher.token.email } }, assignments: { 'synthetic-a': assignment } });
  const handle = service.createRetroactiveAccommodationService({ db, FieldPath: FakeFieldPath, FieldValue: FAKE_FIELD_VALUE, HttpsError, now: () => Date.parse('2026-10-29T18:00:00Z'), gradeFor: ({ assignment: a, gradeData, practiceWaived }) => canonicalPresentedAssignmentGrade({ assignment: a, student: gradeData, practicePassRedeemed: Boolean(practiceWaived.length) }) });
  const call = (action, data = {}, auth = teacher) => handle({ auth, data: { action, studentId: 'synthetic', assignmentId: 'synthetic-a', input, ...data } });
  return { db, call };
};
test('preview is read-only and approval preserves original attempts and support history', async () => {
  const { db, call } = setup();
  const before = db.data('grades', 'synthetic');
  const preview = await call('preview');
  assert.equal(db.writes.length, 0);
  assert.equal(preview.rows[0].proposedRequiredCount, 16);
  assert.equal(preview.rows[0].previousGrade, 5);
  assert.equal(preview.rows[0].proposedGrade, 6);
  const approved = await call('approve', { previewToken: preview.rows[0].previewToken, requestId: 'synthetic-request-1', confirmAuthority: true, confirmSelected: true });
  const after = db.data('grades', 'synthetic');
  assert.deepEqual(after.gradesByAssignment, before.gradesByAssignment);
  assert.equal(after.profile.workloadCorrections['synthetic-a'].eventId, approved.eventId);
  assert.equal(after.classroomReleaseSignals, undefined, 'approval never requests Classroom sync');
  const events = db.data('grades/synthetic/accommodationAdjustments', approved.eventId);
  assert.equal(events.kind, 'retroactive-grade-correction');
  assert.equal(events.sourceDescriptor, input.sourceDescriptor);
  assert.equal(events.previousGrade, 5);
  assert.equal(events.appliedGrade, 6);
  assert.equal(events.previousRequiredCount, 20);
  assert.equal(events.proposedRequiredCount, 16);
  assert.equal(events.appliedRequiredCount, 16);
  assert.ok(!db.writes.some((w) => /supportEvidence|supportProfileRevisions/.test(w.ref?.path || '')));
});
test('unapproved, forged-role, wrong teacher and cross-class requests are denied', async () => {
  const { db, call } = setup();
  for (const auth of [null, { uid: 'student', token: { role: 'student', studentId: 'synthetic' } }, { uid: 'parent', token: { role: 'parent', studentId: 'synthetic' } }, { uid: 'other', token: { role: 'teacher', email: 'other@example.test' } }]) await assert.rejects(call('preview', {}, auth), /teacher|Sign in/i);
  const p = await call('preview');
  await assert.rejects(call('approve', { previewToken: p.rows[0].previewToken, requestId: 'synthetic-request-2' }), /confirm/i);
  assert.equal(db.writes.length, 0);
});
test('numeric zero is preserved and missing evidence never becomes a manufactured grade', async () => {
  for (const tracker of [null, { 0: { status: 'expired', totalAttempts: 3, bestPartialCredit: 0 } }]) {
    const { db, call } = setup(); const g = db.data('grades', 'synthetic');
    if (tracker === null) delete g.gradesByAssignment['synthetic-a']; else g.gradesByAssignment['synthetic-a'] = tracker;
    db.docsOf('grades').set('synthetic', g);
    const row = (await call('preview')).rows[0];
    assert.equal(row.previousGrade, tracker === null ? null : 0);
    assert.equal(row.proposedGrade, tracker === null ? null : 0);
    await call('approve', { previewToken: row.previewToken, requestId: 'synthetic-zero-missing', confirmAuthority: true, confirmSelected: true });
    assert.deepEqual(db.data('grades', 'synthetic').gradesByAssignment, g.gradesByAssignment);
  }
});
test('a conflicting historical automatic policy requires independent second approval', async () => {
  const { db, call } = setup(); const g = db.data('grades', 'synthetic');
  g.profile = { supportPlan: { itemReductionHistory: [{ configured: true, status: 'active', revisionId: 'older-policy', effectiveStart: '2026-08-01', percent: 40, appliesTo: ['classwork'] }] } };
  db.docsOf('grades').set('synthetic', g);
  const row = (await call('preview')).rows[0];
  assert.equal(row.policyDiscrepancy, true);
  assert.equal(row.requiresSecondConfirmation, true);
  const data = { previewToken: row.previewToken, requestId: 'synthetic-policy-change', confirmAuthority: true, confirmSelected: true };
  await assert.rejects(call('approve', data), /second/i);
  await call('approve', { ...data, confirmDecrease: true });
});
test('stale previews reject changes to attempts, weights or overrides before writing', async () => {
  for (const field of ['attempts', 'weight', 'override']) {
    const { db, call } = setup(); const p = await call('preview');
    if (field === 'weight') { const a = db.data('assignments', 'synthetic-a'); a.sections[0].questions[0].questionWeight = 2; db.docsOf('assignments').set('synthetic-a', a); }
    else { const g = db.data('grades', 'synthetic'); if (field === 'attempts') g.gradesByAssignment['synthetic-a'][1] = { status: 'correct' }; else g.teacherGradeOverridesByAssignment = { 'synthetic-a': { __assignment: { active: true, score: 0 } } }; db.docsOf('grades').set('synthetic', g); }
    await assert.rejects(call('approve', { previewToken: p.rows[0].previewToken, requestId: 'synthetic-request-3', confirmAuthority: true, confirmSelected: true }), /changed|preview|manual/i);
    assert.equal(db.writes.length, 0);
  }
});
test('retry is idempotent, reversal needs a second decrease confirmation and appends an event', async () => {
  const { db, call } = setup(); const p = await call('preview');
  const payload = { previewToken: p.rows[0].previewToken, requestId: 'synthetic-request-4', confirmAuthority: true, confirmSelected: true };
  const first = await call('approve', payload);
  assert.equal((await call('approve', payload)).eventId, first.eventId);
  const reverse = (await call('previewReversal')).rows[0];
  assert.equal(reverse.requiresSecondConfirmation, true);
  await assert.rejects(call('reverse', { previewToken: reverse.previewToken, requestId: 'synthetic-request-5', confirmAuthority: true, confirmSelected: true }), /second/i);
  const restored = await call('reverse', { previewToken: reverse.previewToken, requestId: 'synthetic-request-5', confirmAuthority: true, confirmSelected: true, confirmDecrease: true });
  assert.notEqual(restored.eventId, first.eventId);
  assert.ok(db.data('grades/synthetic/accommodationAdjustments', first.eventId));
  assert.equal(db.data('grades', 'synthetic').profile.workloadCorrections['synthetic-a'].active, false);
});
test('Classroom sync is explicit, stale guarded and duplicate requests do not enqueue twice', async () => {
  const { db, call } = setup(); const p = await call('preview');
  const applied = await call('approve', { previewToken: p.rows[0].previewToken, requestId: 'synthetic-request-6', confirmAuthority: true, confirmSelected: true });
  assert.equal(await service.correctionSyncAllowed({ db, studentId: 'synthetic', gradeData: db.data('grades', 'synthetic'), assignment }), false);
  const first = await call('requestSync', { eventId: applied.eventId, requestId: 'synthetic-request-7' });
  const second = await call('requestSync', { eventId: applied.eventId, requestId: 'synthetic-request-8' });
  assert.equal(second.duplicate, true);
  assert.equal(first.status, 'requested');
  assert.equal(await service.correctionSyncAllowed({ db, studentId: 'synthetic', gradeData: db.data('grades', 'synthetic'), assignment }), true);
  const g = db.data('grades', 'synthetic'); g.gradesByAssignment['synthetic-a'][1] = { status: 'correct' };
  assert.equal(await service.correctionSyncAllowed({ db, studentId: 'synthetic', gradeData: g, assignment }), false);
});
test('section passback correction projection honors valid question overrides and ignores stale ones', async () => {
  assert.equal(typeof service.projectCorrectionTracker, 'function');
  const tracker = { 0: { status: 'attempted', totalAttempts: 1, variantIndex: 0, lastSubmissionId: 'synthetic-submit', bestPartialCredit: 50 } };
  const valid = { 0: { active: true, score: 25, totalAttempts: 1, variantIndex: 0, submissionId: 'synthetic-submit' } };
  const projected = await service.projectCorrectionTracker(tracker, valid);
  assert.equal(projected[0].bestPartialCredit, 25);
  assert.equal(tracker[0].bestPartialCredit, 50);
  const stale = await service.projectCorrectionTracker(tracker, { 0: { ...valid[0], submissionId: 'older-submit' } });
  assert.equal(stale[0].bestPartialCredit, 50);
});
test('delayed export snapshots cannot bypass a later correction or reversal', async () => {
  const { db, call } = setup(); const originalSnapshot = db.data('grades', 'synthetic');
  const p = (await call('preview')).rows[0];
  const applied = await call('approve', { previewToken: p.previewToken, requestId: 'synthetic-delayed-apply', confirmAuthority: true, confirmSelected: true });
  assert.equal(await service.correctionSyncAllowed({ db, studentId: 'synthetic', gradeData: originalSnapshot, assignment }), false, 'pre-correction event cannot export the old denominator');
  await call('requestSync', { eventId: applied.eventId, requestId: 'synthetic-delayed-sync' });
  const delayed = db.data('grades', 'synthetic');
  const reverse = (await call('previewReversal')).rows[0];
  await call('reverse', { previewToken: reverse.previewToken, requestId: 'synthetic-delayed-reverse', confirmAuthority: true, confirmSelected: true, confirmDecrease: true });
  assert.equal(await service.correctionSyncAllowed({ db, studentId: 'synthetic', gradeData: delayed, assignment }), false, 'an approved old event cannot export after reversal');
});
test('a capped audit view explicitly warns that missing entries do not prove a complete history', async () => {
  const { db, call } = setup();
  for (let i = 0; i < 101; i++) db.docsOf('grades/synthetic/accommodationAdjustments').set(`synthetic-event-${i}`, { assignmentId: assignment.id, at: `2026-10-${String(i % 29 + 1).padStart(2, '0')}` });
  const history = (await call('history')).rows[0];
  assert.equal(history.events.length, 100);
  assert.equal(history.incomplete, true);
});
test('manual-review rows never invent grade estimates from secure or unresolved historical inputs', async () => {
  for (const reason of ['secure', 'revision', 'recovery-held']) {
    const { db, call } = setup();
    if (reason === 'recovery-held') {
      const g = db.data('grades', 'synthetic');
      g.sectionRecoveryByAssignment = { [assignment.id]: { dol: { status: 'held' } } };
      db.docsOf('grades').set('synthetic', g);
    } else {
      const a = db.data('assignments', assignment.id);
      if (reason === 'secure') a.secure = true; else a.contentVersion = 2;
      db.docsOf('assignments').set(assignment.id, a);
    }
    const row = (await call('preview')).rows[0];
    assert.equal(row.status, 'manual-review');
    assert.equal(row.previousGrade, null, reason);
    assert.equal(row.proposedGrade, null, reason);
    assert.equal(db.writes.length, 0);
  }
});
