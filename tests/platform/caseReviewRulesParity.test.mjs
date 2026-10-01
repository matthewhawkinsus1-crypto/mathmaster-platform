// The saved gradebook snapshot: the shared builder and firestore.rules must
// name exactly the same fields, and the builder keeps one student's rows only.
// (The rules themselves run in the emulator: tests/rules/caseReviewRules.test.mjs.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region } from './helpers/sourceContract.mjs';
import { SIS_SNAPSHOT_LIMITS, buildSisSnapshotDocument, snapshotFromDocument } from '../../functions/shared/sisGradebookSnapshot.mjs';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const validator = region(rules, 'function sisGradebookSnapshotValid(studentId) {', '\n    }\n', 'snapshot validator');
const listIn = (text, call) => {
  const match = text.match(new RegExp(`${call.replace(/[.()]/g, '\\$&')}\\(\\[([\\s\\S]*?)\\]\\)`));
  assert.ok(match, `${call} list present`);
  return match[1].split(',').map((entry) => entry.trim().replace(/^'|'$/g, '')).filter(Boolean).sort();
};

const built = buildSisSnapshotDocument({
  studentId: 'S930001',
  classId: 'class-a',
  layout: 'wide',
  fileName: 'gradebook-synthetic.csv',
  createdByEmail: 'Teacher.A@example.test',
  extracted: { matchedBy: 'sis-id', items: [{ name: 'Quiz 2', score: 72, scoreText: '72', scoreKind: 'number' }], categories: [], officialAverage: null },
});

test('the builder writes exactly the fields the rules allow (plus the server-time field the client adds)', () => {
  assert.deepEqual(built.errors, []);
  assert.deepEqual([...Object.keys(built.payload), 'importedAt'].sort(), listIn(validator, 'd.keys().hasOnly'));
  listIn(validator, 'd.keys().hasAll').forEach((key) => assert.ok(key === 'importedAt' || key in built.payload, key));
  assert.match(validator, /d\.importedAt == request\.time/);
  assert.match(validator, /staffAuthorship\(d, 'importedByEmail'\)/);
  assert.match(validator, new RegExp(`d\\.items\\.size\\(\\) <= ${SIS_SNAPSHOT_LIMITS.items}`));
});

test('the collection is staff-read, created only through the validator, and never updated or deleted', () => {
  const block = region(rules, 'match /sisGradebookSnapshots/{snapshotId} {', '\n      }\n', 'snapshot match');
  assert.match(block, /allow read: if rootAdmin\(\) \|\| teachesPresenceStudent\(studentId\) \|\| authorizedTeacher\(\);/);
  assert.doesNotMatch(block, /ownsStudent/);
  assert.match(block, /allow create: if sisGradebookSnapshotValid\(studentId\);/);
  assert.match(block, /allow update, delete: if false;/);
});

test('the builder refuses an unidentified student row and keeps the author lower-case', () => {
  assert.equal(built.payload.importedByEmail, 'teacher.a@example.test');
  assert.deepEqual(built.payload.authorizedTeacherEmails, ['teacher.a@example.test']);
  const unmatched = buildSisSnapshotDocument({ studentId: 'S1', layout: 'wide', createdByEmail: 't@example.test', extracted: { matchedBy: null, items: [{ name: 'A', score: 1 }] } });
  assert.match(unmatched.errors.join(' '), /not identified/);
  assert.equal(snapshotFromDocument('x', built.payload, 5).saved, true);
});
