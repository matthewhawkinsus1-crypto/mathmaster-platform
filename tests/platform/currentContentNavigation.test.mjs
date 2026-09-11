import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  assert.match(source, /entry\.logicalPosition/);
  assert.match(source, /entry\.logicalRole/);
  assert.match(source, /resolveCurrentContentStorageIndex\(assignmentData, requested\)/);
  assert.match(source, /currentContent\.logicalSections\.map/);
  assert.match(source, /visibleQuestionEntries/);
  assert.match(source, /navigationSections/);
});
