import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { prepareContentRelease } = require('../../functions/lib/assignmentContentVersion.js');

test('creating first successor makes Content V2 while schema remains V5', () => {
  const sourceAssignment = {
    id: 'live-v1',
    schemaVersion: 5,
    title: 'Regression',
    assignmentRevision: 7,
    sections: [{ id: 's1', role: 'classwork', questions: [{ questionId: 'q1', prompt: 'old' }] }],
    assignedClassIds: ['class-1'],
    assignedClassPeriods: ['2'],
    dueAt: '2026-09-10T20:00:00.000Z',
    dueDate: '2026-09-10T20:00:00.000Z',
    lateDueAt: '2026-09-17T20:00:00.000Z',
    releaseAt: '2026-09-09T20:00:00.000Z',
    feedbackReleased: true,
    feedbackReleasedAt: '2026-09-10T20:01:00.000Z',
  };
  const reviewedAssignment = {
    ...sourceAssignment,
    sections: [{ id: 's1', role: 'classwork', questions: [{ questionId: 'q1', prompt: 'corrected' }] }],
    assignmentRevision: 8,
  };
  const prepared = prepareContentRelease({
    sourceAssignment,
    reviewedAssignment,
    familyId: 'fam-1',
    nextVersion: 2,
    actorUid: 'admin-1',
    auditId: 'audit-1',
  });

  assert.equal(prepared.release.schemaVersion, 5);
  assert.equal(prepared.release.assignmentRevision, 1);
  assert.equal(prepared.release.contentLineage.version, 2);
  assert.equal(prepared.release.contentLineage.familyId, 'fam-1');
  assert.deepEqual(prepared.release.assignedClassIds, []);
  assert.deepEqual(prepared.release.assignedClassPeriods, []);
  assert.equal(prepared.release.dueAt, null);
  assert.equal(prepared.release.lateDueAt, null);
  assert.equal(prepared.release.releaseAt, null);
  assert.equal(prepared.release.assignmentKey, null);
  assert.equal(prepared.release.feedbackReleased, false);
  assert.equal(prepared.release.feedbackReleasedAt, null);
  assert.equal(prepared.release.sections[0].questions[0].questionId, 'q1');
  assert.equal(prepared.release.sections[0].questions[0].prompt, 'corrected');
  assert.equal('id' in prepared.release, false);
});
