import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const helperUrl = pathToFileURL(path.join(root, 'src/classroomGradeSyncUi.js')).href;
const {
  gradeSyncStudentDisplay,
  gradeSyncStatusLabel,
  retryEligibleGradeSyncs,
} = await import(helperUrl);

test('grade passback monitor prefers student name and keeps the ID secondary', () => {
  const display = gradeSyncStudentDisplay(
    { studentId: '12345' },
    [{ id: '12345', firstName: 'Avery', lastName: 'Johnson' }],
  );
  assert.deepEqual(display, { name: 'Avery Johnson', studentId: '12345' });
});

test('unlinked rows explain the roster problem and are excluded from blind bulk retry', () => {
  assert.equal(gradeSyncStatusLabel({ status: 'skipped-unlinked' }), 'Needs roster link');
  assert.equal(gradeSyncStatusLabel({ status: 'failed' }), 'Failed');
  assert.equal(gradeSyncStatusLabel({ status: 'synced' }), 'Synced');

  const rows = [
    { syncId: 'f1', status: 'failed', publicationId: 'p1', assignmentId: 'a1', studentId: 's1' },
    { syncId: 'u1', status: 'skipped-unlinked', publicationId: 'p1', assignmentId: 'a1', studentId: 's2' },
    { syncId: 's1', status: 'synced', publicationId: 'p1', assignmentId: 'a1', studentId: 's3' },
    { syncId: 'f2', status: 'failed', publicationId: '', assignmentId: 'a1', studentId: 's4' },
  ];

  assert.deepEqual(retryEligibleGradeSyncs(rows).map((row) => row.syncId), ['f1']);
});

test('Classroom Manager exposes retry-all, name-first monitoring, and versioned section reconciliation', () => {
  const manager = fs.readFileSync(path.join(root, 'src/ClassroomManagerV2.jsx'), 'utf8');
  assert.match(manager, /Retry all eligible failures/i);
  assert.match(manager, /Needs roster link/i);
  assert.match(manager, /gradeSyncStudentDisplay/);
  assert.match(manager, /Reconcile section grades/);
  assert.match(manager, /reconcileClassroomSectionGrades\(\{\s*assignmentId: selectedAssignment\.id/);
});
