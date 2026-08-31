import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { classifyLiveStudent } from '../../src/livePresence.js';
import { formatStudentName } from '../../src/platform/studentName.js';

test('linked Google Classroom name becomes the shared student display name', () => {
  const student = { id: '884221', googleName: 'Jordan Rivera' };
  assert.equal(
    formatStudentName(student, { lastFirst: false }),
    'Jordan Rivera',
  );
  assert.equal(
    classifyLiveStudent(student).name,
    'Jordan Rivera',
    'Live View must not fall back to the student ID after Classroom supplies a name',
  );
});

test('question layout is selected by viewport size, not touchscreen hardware', () => {
  const mobile = fs.readFileSync('src/components/student/MobileViewportContainer.jsx', 'utf8');
  const css = fs.readFileSync('src/index.css', 'utf8');

  const detectorStart = mobile.indexOf('const viewportSize');
  const detectorEnd = mobile.indexOf('const setReactInputValue', detectorStart);
  const detector = mobile.slice(detectorStart, detectorEnd);

  assert.match(detector, /width <= 768/);
  assert.match(detector, /height <= 500 && width <= 1024/);
  assert.doesNotMatch(detector, /pointer:\s*coarse|matchMedia/);

  const anchorRuleStart = css.indexOf('Compact viewports already have the dedicated QUESTION panel');
  const anchorRuleEnd = css.indexOf('.mathmaster-success-next-question', anchorRuleStart);
  const anchorRule = css.slice(anchorRuleStart, anchorRuleEnd);
  assert.doesNotMatch(anchorRule, /pointer:\s*coarse/);
  assert.match(anchorRule, /max-width:\s*768px/);
});

test('class-scoped assignment list excludes work that is not assigned to that class', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  const start = app.indexOf('const visibleAssignments =');
  const end = app.indexOf('const visibleAssignmentIds', start);
  const block = app.slice(start, end);

  assert.match(block, /!activeClass\.classId \|\| assignmentIsForStudent/);
  assert.match(block, /classId:\s*activeClass\.classId/);
  assert.match(block, /classPeriod:\s*activeClass\.classPeriod/);
});

test('editing Dates & Classes publishes newly added Classroom destinations before syncing due dates', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  const start = app.indexOf('if (shouldAutoPublishClassroomPackage(nextAssignment))');
  const end = app.indexOf('setEditingAssignmentId(null)', start);
  const block = app.slice(start, end);

  const publishAt = block.indexOf('autoPublishAssignmentPackageToClassroom(nextAssignment)');
  const updateAt = block.indexOf('updateAssignmentClassroomPublications({ assignmentId })');
  assert.ok(publishAt >= 0, 'newly assigned classes must be published');
  assert.ok(updateAt > publishAt, 'existing Classroom posts should be due-date synced after missing posts are created');
});


test('adding a new Standard or Honors destination reuses the assignment instead of requiring manual duplication', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  const start = app.indexOf('if (changesDestination)');
  const end = app.indexOf('const hasDOL', start);
  const block = app.slice(start, end);

  assert.match(block, /addedClassIds/);
  assert.match(block, /keptEveryOriginalClass/);
  assert.match(block, /openStoredAssignmentForPreflight\(assignment/);
  assert.match(block, /assignedClassIds:\s*addedClassIds/);
  assert.match(block, /existing class assignment stays unchanged/i);
  assert.doesNotMatch(block, /Duplicate it to the library/);
});
