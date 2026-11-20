import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { region } from './helpers/sourceContract.mjs';
import { appFactorySource } from './helpers/appScreens.mjs';
import { evaluateClassworkCompletion, getCurrentContentQuestionIndices, resolveDOLQuestionIndices } from '../../src/assignmentLifecycle.js';
import { splitGrade, splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';

const assignment = {
  schemaVersion: 5,
  sections: [
    { id: 'classwork', role: 'classwork', questions: [{ questionId: 'old', teacherExcluded: true }, { questionId: 'c2' }] },
    { id: 'dol', role: 'dol', questions: [{ questionId: 'old-dol', teacherExcluded: true }] },
    { id: 'content-v2-corrections-classwork', role: 'classwork', questions: [{ questionId: 'new', supersedesQuestionId: 'old' }] },
    { id: 'content-v2-corrections-dol', role: 'dol', questions: [{ questionId: 'new-dol', supersedesQuestionId: 'old-dol' }] },
  ],
};

test('lifecycle and grades use current entries at real storage indices', () => {
  assert.deepEqual(getCurrentContentQuestionIndices(assignment), [3, 1, 4]);
  assert.deepEqual(resolveDOLQuestionIndices(assignment), [4]);
  const tracker = { 0: { status: 'correct' }, 1: { status: 'unattempted' }, 3: { status: 'correct' }, 4: { status: 'attempted' } };
  assert.equal(splitGrade({ assignment, tracker }).total, 3);
  assert.deepEqual({
    classwork: splitGradesBySection({ assignment, tracker }).classwork.total,
    dol: splitGradesBySection({ assignment, tracker }).dol.total,
  }, { classwork: 2, dol: 1 });
  assert.equal(evaluateClassworkCompletion({ assignment, assignmentTracker: tracker, activity: { totalTimeSeconds: 1000 } }).completionPercent, 50);
});

test('App navigation, resume, Overview, and Focus View share the projection seam', async () => {
  const source = await readFile('src/App.jsx', 'utf8');
  assert.match(source, /projectCurrentAssignmentContent\(assignment\)/);
  assert.match(source, /entry\.storageIndex/);
  // Since the App split (slice 7) the open assignment's navigator, Overview
  // and Focus View are drawn by createAssignmentWorkspaceView
  // (src/app/student/assignmentWorkspaceView.jsx), which App calls once: the
  // projection is read there, as it still is in App.
  const workspace = appFactorySource('createAssignmentWorkspaceView');
  assert.match(workspace, /projectCurrentAssignmentContent\(assignment\)/);
  assert.match(workspace, /entry\.storageIndex/);
  assert.match(workspace, /entry\.logicalPosition/);
  assert.match(workspace, /entry\.logicalRole/);
  // Since the App split opening an assignment (startAssignment) is
  // createStudentNavigation's: the requested question resolves there.
  const start = region(appFactorySource('createStudentNavigation'), 'const startAssignment = (', 'const openStudentDashboardMode = ', 'startAssignment');
  assert.match(start, /resolveCurrentContentStorageIndex\(assignmentData, requested\)/);
  assert.match(workspace, /currentContent\.logicalSections\.map/);
  assert.match(workspace, /visibleQuestionEntries/);
  assert.match(workspace, /navigationSections/);
});
