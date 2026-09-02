import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('multipart draft setters persist during the state transition, not only in a later effect', async () => {
  const [undo, local] = await Promise.all([
    read('src/useUndoHistory.js'),
    read('src/useLocalDraftState.js'),
  ]);
  assert.match(undo, /setValueState\(\(current\)[\s\S]*writeQuestionDraft\(persistenceKey, saved\)/);
  assert.match(local, /setPersistedValue[\s\S]*writeQuestionDraft\(storageKey, saved\)/);
});

test('composed workflow questions restore both responses and active stage', async () => {
  const workflow = await read('src/platform/workflow/WorkflowRunner.jsx');
  assert.match(workflow, /workflow-responses/);
  assert.match(workflow, /workflow-stage/);
  assert.match(workflow, /useLocalDraftState/);
});

test('student assignment chrome has a focus view while preserving current-question orientation', async () => {
  const [app, viewport] = await Promise.all([
    read('src/App.jsx'),
    read('src/components/student/MobileViewportContainer.jsx'),
  ]);
  assert.match(app, /assignmentNavigationCollapsed/);
  assert.match(app, /Focus view/);
  assert.match(app, /Question \{currentSectionQuestionNumber\} of \{currentSectionQuestionCount\}/);
  assert.match(viewport, /Task hidden for more workspace/);
  assert.match(viewport, /Show task/);
});

test('student home reads the caller-only weekly goal snapshot before declaring all clear', async () => {
  const [app, store, functions] = await Promise.all([
    read('src/App.jsx'),
    read('src/platform/path/pathStore.js'),
    read('functions/index.js'),
  ]);
  assert.match(app, /fetchStudentWeeklyPathGoalSnapshot/);
  assert.match(store, /getStudentWeeklyPathGoalSnapshot/);
  assert.match(functions, /exports\.getStudentWeeklyPathGoalSnapshot/);
  assert.match(functions, /const \{ studentId \} = requireStudent\(request\)/);
});
