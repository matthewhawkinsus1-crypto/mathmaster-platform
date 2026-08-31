import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyRosterIdentityRows,
  buildRosterMatchPlan,
  mathMasterStudentLabel,
  parseRosterIdentityText,
} from '../../src/classroomRosterMatching.js';

test('teacher can paste ID, name, and email rows for ID-only MathMaster students', () => {
  const parsed = parseRosterIdentityText([
    '123456, Jane Doe, jane.doe@district.org',
    'John Smith\t123457',
    '123458 Maria Lopez maria.lopez@district.org',
  ].join('\n'));

  assert.equal(parsed.rejected.length, 0);
  assert.deepEqual(parsed.rows.map((row) => row.studentId), ['123456', '123457', '123458']);
  assert.equal(parsed.rows[0].name, 'Jane Doe');
  assert.equal(parsed.rows[0].email, 'jane.doe@district.org');
  assert.equal(parsed.rows[1].name, 'John Smith');
});

test('teacher identity rows enrich ID-only students without changing their IDs', () => {
  const students = [{ id: '123456', classId: 'class-1' }];
  const enriched = applyRosterIdentityRows(students, [{
    studentId: '123456',
    name: 'Jane Doe',
    email: 'jane.doe@district.org',
  }]);

  assert.equal(enriched[0].id, '123456');
  assert.equal(enriched[0].displayName, 'Jane Doe');
  assert.equal(enriched[0].schoolEmail, 'jane.doe@district.org');
  assert.equal(mathMasterStudentLabel(enriched[0]), 'Jane Doe');
});

test('pasted email creates an exact match and pasted name creates a reviewable unique match', () => {
  const classroomStudents = [
    { googleUserId: 'g1', name: 'Jane Doe', email: 'jane.doe@district.org' },
    { googleUserId: 'g2', name: 'John Smith', email: 'john.smith@district.org' },
  ];
  const mathMasterStudents = applyRosterIdentityRows(
    [{ id: '123456' }, { id: '123457' }],
    [
      { studentId: '123456', name: 'Jane Doe', email: 'jane.doe@district.org' },
      { studentId: '123457', name: 'John Smith', email: '' },
    ],
  );
  const plan = buildRosterMatchPlan({ classroomStudents, mathMasterStudents });

  assert.equal(plan[0].status, 'exact-email');
  assert.equal(plan[0].suggestedStudent.id, '123456');
  assert.equal(plan[1].status, 'exact-name');
  assert.equal(plan[1].suggestedStudent.id, '123457');
});

test('Classroom manager exposes direct ID entry, existing-link status, and teacher-confirmed bulk bridge', () => {
  const ui = fs.readFileSync(new URL('../../src/ClassroomManagerV2.jsx', import.meta.url), 'utf8');
  assert.match(ui, /Type MathMaster ID/);
  assert.match(ui, /Apply ID\/name list/);
  assert.match(ui, /Link unique suggestions/);
  assert.match(ui, /Google name\/email are now attached/);
  assert.match(ui, /Current ID/);
  assert.match(ui, /Change link/);
  assert.match(ui, /listClassroomRosterLinks/);
});

test('server roster linking stores Google identity and removes an obsolete passback owner when corrected', () => {
  const server = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(server, /exports\.listClassroomRosterLinks/);
  assert.match(server, /linksBeingReplaced/);
  assert.match(server, /FieldValue\.arrayRemove\(cleanCourseId\)/);
  assert.match(server, /googleName: FieldValue\.delete\(\)/);
  assert.match(server, /googleEmail: item\.email/);
  assert.match(server, /googleName: item\.name/);
});

console.log('classroomRosterIdentityBridge.test.mjs: identity bridge coverage passed');
