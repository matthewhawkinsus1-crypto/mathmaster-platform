import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Firebase main entry preserves the mature backend and adds section Classroom functions', () => {
  const packageJson = JSON.parse(read('functions/package.json'));
  assert.equal(packageJson.main, 'platformEntry.js');

  const entry = read('functions/platformEntry.js');
  assert.match(entry, /require\(['"]\.\/entry\.js['"]\)/);
  assert.match(entry, /Object\.assign\(exports, base\)/);
  assert.match(entry, /publishAssignmentToClassrooms/);
  assert.match(entry, /legacyPublishAssignmentToClassrooms\.run/);
  assert.match(entry, /publishAssignmentSectionsHandler/);
  assert.match(entry, /Object\.assign\(exports, classroomSectionFunctions\)/);
  assert.match(read('functions/classroomSectionEntry.js'), /reconcileClassroomSectionGrades/);
});

test('section publisher disables the legacy whole-grade trigger and retains section identity through scheduling and launch', () => {
  const source = read('functions/classroomSectionEntry.js');
  assert.match(source, /gradePassbackEnabled:\s*false/);
  assert.match(source, /sectionGradePassbackEnabled/);
  assert.match(source, /sectionKey/);
  assert.match(source, /sectionLabel/);
  assert.match(source, /questionIndices/);
  assert.match(source, /launchPayloadForPublication/);
  assert.match(source, /publishAt:\s*target\.publishAt/);
  assert.match(source, /resolveClassroomSectionLaunchToken/);
});

test('section grade trigger derives progress per publication instead of reusing one whole-assignment grade', () => {
  const source = read('functions/classroomSectionEntry.js');
  assert.match(source, /syncSectionGradeToClassroom/);
  assert.match(source, /classroomPublicationGrade\(/);
  assert.match(source, /assignmentGradeProgress/);
  assert.doesNotMatch(source, /const\s+grade\s*=\s*calculateAssignmentGrade/);
  assert.match(source, /sectionKey:\s*gradeResult\.sectionKey/);
});

test('historical section repair queues saved trackers without creating or replacing Classroom posts', () => {
  const source = read('functions/classroomSectionEntry.js');
  assert.match(source, /const reconcileClassroomSectionGrades = onCall/);
  assert.match(source, /reason: "section-grade-reconcile"/);
  assert.match(source, /requireSavedTracker: true/);
  assert.match(source, /reconciliationVersion: CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION/);
  const reconciliation = source.slice(
    source.indexOf('const reconcileClassroomSectionGrades = onCall'),
    source.indexOf('async function publishAssignmentSectionsHandler'),
  );
  assert.doesNotMatch(reconciliation, /createCourseWork|publishOneSection|delete\(/);
});
