// MATCHING OUTSIDE FILES TO A STUDENT WHOSE DISTRICT ID WAS CORRECTED.
//
// After a teacher corrects a district ID (account 111111, district 222222),
// the account number is KNOWN not to be her district number — and in a
// district file it may well be another child's. Two places read rows from
// outside files by student number:
//
//   the case review's gradebook import    (src/platform/caseReview/sisGradebookImport.js)
//   the Classroom roster identity bridge  (src/classroomRosterMatching.js)
//
// Both must find her by 222222 and never by 111111, while a student whose two
// numbers agree (or whose account ID is not a number at all) matches exactly
// as before. Every name and number is invented.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectGradebookLayout,
  extractStudentGradebook,
  parseDelimitedText,
} from '../../src/platform/caseReview/sisGradebookImport.js';
import { applyRosterIdentityRows, buildRosterMatchPlan } from '../../src/classroomRosterMatching.js';

const corrected = { id: '111111', sisStudentId: '222222', firstName: 'Marisol', lastName: 'Testerling', displayName: 'Marisol Testerling' };
const legacy = { id: '444444', firstName: 'Odile', lastName: 'Placeholder', displayName: 'Odile Placeholder' };

const gradebook = (lines) => {
  const { rows } = parseDelimitedText(lines.join('\r\n'));
  return { rows, layout: detectGradebookLayout(rows) };
};

test('case review: a district gradebook row under 222222 is hers; the row under 111111 is never matched to her', () => {
  // The district gradebook holds a DIFFERENT child under 111111.
  const { rows, layout } = gradebook([
    'Student ID,Student Name,Lesson 7 - DOL,Quiz 3',
    '111111,"Another, Child",95,98',
    '222222,"Testerling, Marisol",0,84',
  ]);
  const result = extractStudentGradebook({ rows, layout, student: corrected });
  assert.equal(result.matchedBy, 'sis-id');
  assert.deepEqual(result.items.map((item) => [item.name, item.score]), [['Lesson 7 - DOL', 0], ['Quiz 3', 84]]);
  assert.ok(!JSON.stringify(result).includes('Another, Child'), 'the other child never reaches her case review');

  // A file with ONLY the old number: no match — and the teacher is told why.
  const onlyOld = gradebook(['Student ID,Student Name,Lesson 7 - DOL', '111111,"Another, Child",95']);
  const refused = extractStudentGradebook({ rows: onlyOld.rows, layout: onlyOld.layout, student: corrected });
  assert.equal(refused.matchedBy, null);
  assert.deepEqual(refused.items, []);
  assert.match(refused.notes.join(' '), /MathMaster ID 111111, which is not this student’s district ID \(it was corrected to district ID 222222\)/);
});

test('case review: a MathMaster TEAMS file made before the correction is not read as hers; one made after is', () => {
  const before = gradebook(['111111,75', '444444,88']);
  assert.equal(before.layout.layout, 'mathmaster-teams');
  const oldFile = extractStudentGradebook({ rows: before.rows, layout: before.layout, student: corrected, fileName: 'DOL.csv' });
  assert.equal(oldFile.matchedBy, null);
  assert.match(oldFile.notes.join(' '), /not this student’s district ID/);

  const after = gradebook(['222222,75', '444444,88']);
  const newFile = extractStudentGradebook({ rows: after.rows, layout: after.layout, student: corrected, fileName: 'DOL.csv' });
  assert.equal(newFile.matchedBy, 'sis-id');
  assert.deepEqual(newFile.items.map((item) => item.score), [75]);
});

test('case review: students whose numbers agree, or whose account ID is not a number, match as before', () => {
  const { rows, layout } = gradebook(['Student ID,Student Name,Quiz 3', '444444,"Placeholder, Odile",91', '1500456,"Sample, Ada",77']);
  assert.equal(extractStudentGradebook({ rows, layout, student: legacy }).matchedBy, 'sis-id');
  // An email-style account with a stored district ID matches by the district ID…
  const emailKeyed = { id: 'ada.sample@students.example', sisStudentId: '1500456', displayName: 'Ada Sample' };
  assert.deepEqual(extractStudentGradebook({ rows, layout, student: emailKeyed }).items.map((item) => item.score), [77]);
  // …and an account ID that is not a district number still works as a MathMaster-ID match.
  const local = gradebook(['Student ID,Quiz 3', 'S910201,64']);
  assert.equal(extractStudentGradebook({ rows: local.rows, layout: local.layout, student: { id: 'S910201', sisStudentId: '910201' } }).matchedBy, 'mathmaster-id');
});

test('Classroom identity bridge: a pasted district row for 222222 enriches her; the row for 111111 does not', () => {
  const students = [{ ...corrected, displayName: undefined, firstName: undefined, lastName: undefined }, { id: legacy.id }];
  const enriched = applyRosterIdentityRows(students, [
    { studentId: '111111', name: 'Another Child', email: 'another.child@students.example' },
    { studentId: '222222', name: 'Marisol Testerling', email: 'marisol.testerling@students.example' },
    { studentId: '444444', name: 'Odile Placeholder', email: '' },
  ]);
  const her = enriched.find((student) => student.id === '111111');
  assert.equal(her.displayName, 'Marisol Testerling');
  assert.equal(her.schoolEmail, 'marisol.testerling@students.example');
  assert.equal(her.id, '111111', 'her MathMaster ID does not change');
  assert.equal(enriched.find((student) => student.id === '444444').displayName, 'Odile Placeholder');

  // So the Classroom roster's real Marisol is suggested for her, and the other child is not.
  const plan = buildRosterMatchPlan({
    classroomStudents: [
      { googleUserId: 'g-1', name: 'Marisol Testerling', email: 'marisol.testerling@students.example' },
      { googleUserId: 'g-2', name: 'Another Child', email: 'another.child@students.example' },
    ],
    mathMasterStudents: enriched,
  });
  assert.equal(plan[0].suggestedStudent?.id, '111111');
  assert.notEqual(plan[1].suggestedStudent?.id, '111111');

  // Only the old number pasted: nothing is attached to her.
  const unmatched = applyRosterIdentityRows([corrected], [{ studentId: '111111', name: 'Another Child', email: '' }]);
  assert.equal(unmatched[0].identityBridge, undefined);
});
