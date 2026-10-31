import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { canonicalPresentedAssignmentGrade, canonicalPresentedSectionGrade } from '../../src/platform/grading/canonicalGradeProjection.js';
import { studentRequiredQuestions } from '../../src/assignmentLifecycle.js';
import { buildWorkloadReceipt } from '../../functions/shared/workloadReceipt.mjs';

after(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const { db } = await import('../integration/canonicalPersistenceHarness.mjs');
    await db.terminate();
  }
});

test('real callable transaction: approved grade, canonical export, receipt, reversal and denial agree', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const { db, fns, teacherRequest, studentRequest, runClassroomSync, patchGradeCalls, resetClassroomCalls } = await import('../integration/canonicalPersistenceHarness.mjs');
  const require = createRequire(import.meta.url);
  const { cloudFunctions: sectionFunctions } = require('../../functions/classroomSectionEntry.js');
  const { rosterLinkDocumentId } = require('../../functions/lib/publication.js');
  const prefix = 'synthetic-retro-523';
  const studentId = `${prefix}-student`;
  const assignmentId = `${prefix}-assignment`;
  const teacherEmail = 'correction.teacher@example.test';
  const gradeRef = db.collection('grades').doc(studentId);
  const assignment = { id: assignmentId, schemaVersion: 5, title: 'Synthetic historical classwork', assignedClassIds: [`${prefix}-class`], dueAt: '2026-09-15T18:00:00Z', sections: [{ id: 'classwork', role: 'classwork', questions: Array.from({ length: 20 }, (_, i) => ({ questionId: `synthetic-q${i}`, type: 'numeric', standard: 'A.5A', questionWeight: i === 0 ? 2 : 1 })) }] };
  const original = { classId: `${prefix}-class`, assignedTeacherEmail: teacherEmail, profile: {}, gradesByAssignment: { [assignmentId]: { 0: { status: 'attempted', totalAttempts: 1, bestPartialCredit: 50, partialCredit: 25, lastSubmissionId: 'synthetic-submit' } } }, teacherGradeOverridesByAssignment: { [assignmentId]: { 0: { active: true, score: 25, totalAttempts: 1, variantIndex: 0, submissionId: 'synthetic-submit' } } } };
  await db.collection('classes').doc(`${prefix}-class`).set({ teacherOfRecord: teacherEmail });
  await db.collection('assignments').doc(assignmentId).set(assignment);
  await gradeRef.set(original);
  const input = { percent: 20, sourceDescriptor: 'Synthetic documented review', effectiveDate: '2026-08-01', fromDate: '2026-09-01', toDate: '2026-09-30', appliesTo: ['classwork'] };
  const call = (action, data = {}) => fns.reviewRetroactiveAccommodation.run(teacherRequest({ action, studentId, assignmentId, input, ...data }, teacherEmail));
  await assert.rejects(fns.reviewRetroactiveAccommodation.run(studentRequest(studentId, { action: 'preview', studentId, assignmentId, input })), /teacher/i);
  const preview = (await call('preview')).rows[0];
  assert.equal(preview.proposedRequiredCount, 16);
  assert.equal(preview.previousGrade, canonicalPresentedAssignmentGrade({ student: original, assignment }));
  assert.deepEqual((await gradeRef.get()).data(), original, 'preview writes nothing');
  const approved = await call('approve', { previewToken: preview.previewToken, requestId: 'synthetic-emulator-approve', confirmAuthority: true, confirmSelected: true });
  const corrected = (await gradeRef.get()).data();
  assert.deepEqual(corrected.gradesByAssignment, original.gradesByAssignment);
  assert.equal(approved.grade, canonicalPresentedAssignmentGrade({ student: corrected, assignment }));
  assert.equal(approved.grade, canonicalPresentedSectionGrade({ student: corrected, assignment, sectionKey: 'classwork' }));
  assert.equal(studentRequiredQuestions({ assignment, profile: corrected.profile, tracker: corrected.gradesByAssignment[assignmentId] }).indices.length, 16);
  const receipt = buildWorkloadReceipt({ assignment, profile: corrected.profile, tracker: corrected.gradesByAssignment[assignmentId] });
  assert.equal(receipt.kind, 'retroactive-grade-correction');
  assert.equal(receipt.requiredCount, 16);
  assert.equal((await gradeRef.collection('supportEvidence').get()).size, 0);
  assert.equal(corrected.classroomReleaseSignals, undefined);
  const courseId = `${prefix}-course`;
  await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(courseId, studentId)).set({ courseId, studentId, googleUserId: 'synthetic-google-id' });
  for (const sectionKey of ['whole', 'classwork']) await db.collection('classroomLinks').doc(`${prefix}-${sectionKey}`).set({ assignmentId, courseId, teacherUid: `uid-${teacherEmail}`, status: 'published', courseworkId: `${prefix}-${sectionKey}-work`, maxPoints: 100, publicationKind: sectionKey === 'whole' ? 'assignment' : 'section', sectionKey, gradePassbackEnabled: sectionKey === 'whole', sectionGradePassbackEnabled: sectionKey !== 'whole' });
  const runSections = async (before) => sectionFunctions.syncSectionGradeToClassroom.run({ params: { studentId }, data: { before: { exists: true, data: () => before }, after: await gradeRef.get() } });
  resetClassroomCalls();
  await gradeRef.update({ classroomReleaseSignals: { [assignmentId]: { requestedAt: 'synthetic-unapproved-retry', reason: 'manual-retry' } } });
  await runClassroomSync(studentId, corrected); await runSections(corrected);
  assert.equal(patchGradeCalls().length, 0, 'a generic retry cannot sync a correction without explicit authorization');
  const beforeSync = (await gradeRef.get()).data();
  await call('requestSync', { eventId: approved.eventId, requestId: 'synthetic-emulator-sync' });
  await runClassroomSync(studentId, beforeSync); await runSections(beforeSync);
  assert.equal(patchGradeCalls().length, 2, 'whole and section each sync exactly once');
  assert.ok(patchGradeCalls().every((call) => call.grade === approved.grade), 'both real triggers honor the same per-question override and weights');
  await runClassroomSync(studentId, beforeSync); await runSections(beforeSync);
  assert.equal(patchGradeCalls().length, 2, 'replayed correction export event never posts a second time');
  const reversal = (await call('previewReversal')).rows[0];
  assert.equal(reversal.requiresSecondConfirmation, true);
  await assert.rejects(call('reverse', { previewToken: reversal.previewToken, requestId: 'synthetic-emulator-reverse', confirmAuthority: true, confirmSelected: true }), /second/i);
  await call('reverse', { previewToken: reversal.previewToken, requestId: 'synthetic-emulator-reverse', confirmAuthority: true, confirmSelected: true, confirmDecrease: true });
  const restored = (await gradeRef.get()).data();
  assert.deepEqual(restored.gradesByAssignment, original.gradesByAssignment);
  assert.equal(canonicalPresentedAssignmentGrade({ student: restored, assignment }), preview.previousGrade);
  assert.equal((await gradeRef.collection('accommodationAdjustments').get()).size, 3);
});

test('real callable uses canonical Challenge credit without attempts and preserves a fully waived missing grade', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const { db, fns, teacherRequest } = await import('../integration/canonicalPersistenceHarness.mjs');
  const { practicePassRedemptionId } = await import('../../functions/shared/classPointRewards.mjs');
  const teacherEmail = 'edge.teacher@example.test';
  const classId = 'synthetic-retro-edge-class';
  await db.collection('classes').doc(classId).set({ teacherOfRecord: teacherEmail });
  for (const scenario of ['challenge', 'waived']) {
    const studentId = `synthetic-retro-${scenario}-student`;
    const assignmentId = `synthetic-retro-${scenario}-assignment`;
    const questions = (count, start) => Array.from({ length: count }, (_, index) => ({ questionId: `synthetic-${scenario}-q${start + index}`, type: 'numeric', standard: 'A.5A' }));
    const assignment = { id: assignmentId, schemaVersion: 5, title: 'Synthetic grade edge case', assignedClassIds: [classId], dueAt: '2026-09-15T18:00:00Z', sections: scenario === 'challenge'
      ? [{ role: 'warmup', questions: questions(10, 0) }, { role: 'classwork', questions: questions(20, 10) }]
      : [{ role: 'practice', questions: questions(20, 0) }] };
    const original = { classId, profile: {}, ...(scenario === 'challenge'
      ? { warmupChallengeByAssignment: { [assignmentId]: { roundsAvailable: 10, correct: 10 } } }
      : { gradesByAssignment: { [assignmentId]: { 0: { status: 'correct', totalAttempts: 1 } } } }) };
    await db.collection('assignments').doc(assignmentId).set(assignment);
    const gradeRef = db.collection('grades').doc(studentId);
    await gradeRef.set(original);
    const hasPass = scenario === 'waived';
    if (hasPass) await db.collection('classPointRewardRedemptions').doc(practicePassRedemptionId({ studentId, classId, assignmentId })).set({ status: 'redeemed' });
    const call = (action, extra = {}) => fns.reviewRetroactiveAccommodation.run(teacherRequest({ action, studentId, assignmentId,
      input: { percent: 20, sourceDescriptor: 'Synthetic edge review', effectiveDate: '2026-08-01', fromDate: '2026-09-01', toDate: '2026-09-30', appliesTo: [hasPass ? 'practice' : 'classwork'] }, ...extra }, teacherEmail));
    const preview = (await call('preview')).rows[0];
    assert.equal(preview.previousGrade, canonicalPresentedAssignmentGrade({ student: original, assignment, practicePassRedeemed: hasPass }), `${scenario}: previous canonical grade`);
    const approved = await call('approve', { previewToken: preview.previewToken, requestId: `synthetic-edge-${scenario}`, confirmAuthority: true, confirmSelected: true });
    const corrected = (await gradeRef.get()).data();
    assert.equal(approved.grade, canonicalPresentedAssignmentGrade({ student: corrected, assignment, practicePassRedeemed: hasPass }), `${scenario}: corrected canonical grade`);
    if (hasPass) assert.equal(approved.grade, null);
    else {
      assert.equal(preview.previousGrade, 33);
      assert.equal(approved.grade, 38);
      const reversal = (await call('previewReversal')).rows[0];
      assert.equal(reversal.requiresSecondConfirmation, true);
      await assert.rejects(call('reverse', { previewToken: reversal.previewToken, requestId: 'synthetic-edge-decrease', confirmAuthority: true, confirmSelected: true }), /second/i);
    }
    assert.deepEqual(corrected.gradesByAssignment, original.gradesByAssignment, 'no attempts manufactured');
  }
});
