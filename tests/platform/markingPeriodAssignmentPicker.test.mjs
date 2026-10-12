// MARKING PERIOD FILING MUST BE POSSIBLE FROM THE GRADEBOOK ITSELF.
//
// The old screen only accepted a selection made on the Assignments tab. That
// made "Move selected assignments" look actionable while providing no way to
// select anything on the page. These source contracts protect the replacement:
// a class-scoped picker with search/filter/select-all, followed by one bulk move.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pickerSource = readFileSync('src/components/teacher/MarkingPeriodSettings.jsx', 'utf8');
const appSource = readFileSync('src/App.jsx', 'utf8');

test('the marking-period screen owns a visible assignment selection workflow', () => {
  assert.match(pickerSource, /const \[search, setSearch\] = useState\(''\)/);
  assert.match(pickerSource, /const \[periodFilter, setPeriodFilter\] = useState\('fallback'\)/);
  assert.match(pickerSource, /Select all \{visibleAssignmentIds\.length\} shown/);
  assert.match(pickerSource, /Search assignments…/);
  assert.match(pickerSource, /Needs filing \(\{fallbackCount\}\)/);
});

test('the picker sends the exact locally selected ids into the bulk move', () => {
  const moveRegion = pickerSource.slice(
    pickerSource.indexOf('const moveSelected = async'),
    pickerSource.indexOf('return ('),
  );
  assert.match(moveRegion, /onMoveSelectedAssignments\(target, selectedIds\)/);
  assert.match(moveRegion, /succeeded !== false/);
});

test('Grades scopes the picker to the class already selected in the class bar', () => {
  // Mounted by the teacher's screen, its own module since G2.
  const teacherSource = readFileSync('src/app/teacher/TeacherWorkspace.jsx', 'utf8');
  const start = teacherSource.indexOf('<MarkingPeriodSettings');
  assert.notEqual(start, -1, 'the picker is mounted');
  const end = teacherSource.indexOf('/>', start);
  const wiring = teacherSource.slice(start, end);
  assert.match(wiring, /assignments=\{assignmentsForSelectedClass\}/);
  assert.match(wiring, /classLabel=\{selectedGradebookClass\?\.name \|\| selectedGradebookPeriod\}/);
  assert.doesNotMatch(wiring, /selectedAssignmentIds=\{selectedAssignmentIds\}/);
});

test('the app bulk handler accepts picker ids instead of only the Assignments-tab selection', () => {
  const start = appSource.indexOf('const handleMoveSelectedAssignmentsToGradingPeriod');
  const end = appSource.indexOf('const openStoredAssignmentForPreflight', start);
  const handler = appSource.slice(start, end);
  assert.match(handler, /assignmentIds = selectedAssignmentIds/);
  assert.match(handler, /return applyBulkAssignmentPatch\(\s*assignmentIds,/);
});
