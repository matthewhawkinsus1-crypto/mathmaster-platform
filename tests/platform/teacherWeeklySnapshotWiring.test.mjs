import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { functionsBackendSource } from './helpers/functionsBackendSource.mjs';
import { positionalHookSeam, positionalHookSource } from './helpers/appScreens.mjs';

const functionsSource = functionsBackendSource();
const appSource = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const pathStoreSource = await readFile(new URL('../../src/platform/path/pathStore.js', import.meta.url), 'utf8');

test('weekly commitment is server-owned and directly denied by Firestore rules', async () => {
  const rules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(functionsSource, /WEEKLY_PATH_GOAL_SNAPSHOTS\s*=\s*["']weeklyPathGoalSnapshots["']/);
  assert.match(functionsSource, /exports\.resolveWeeklyPathGoalSnapshot\s*=\s*onCall/);
  assert.match(rules, /match \/weeklyPathGoalSnapshots\/\{docId\} \{ allow read, write: if false; \}/);
});

test('teacher completion callable returns the frozen goal snapshots with completion rows', () => {
  assert.match(functionsSource, /goalsByStudentId/);
  assert.match(functionsSource, /weeklySlotKey/);
  assert.match(pathStoreSource, /goalsByStudentId/);
});

test('Gradebook, Home and Weekly Path all refresh the same weekly progress source', async () => {
  // One follower for the three screens, from the teacher kit
  // (app/teacher/weeklyPathProgress.js), which sets the frozen goals from the
  // same answer as the completions; App hands it its state.
  const follower = await readFile(new URL('../../src/app/teacher/weeklyPathProgress.js', import.meta.url), 'utf8');
  assert.match(follower, /if \(!\['weeklyPath', 'home', 'grades'\]\.includes\(teacherTab\)\) return undefined;/);
  assert.match(follower, /apply: \(result\) => \{\s*set\.completions\(result\?\.byStudentId \|\| \{\}\);\s*set\.goals\(result\?\.goalsByStudentId \|\| \{\}\);/);
  // Since the App split, useTeacherLearningPaths owns the effect that follows
  // the progress; App calls it once and hands it the two setters of its state
  // (positionalHookSource holds App's arguments to the hook's parameters).
  const learningPaths = positionalHookSource('useTeacherLearningPaths');
  for (const setter of ['setWeeklyPathCompletionsByStudent', 'setWeeklyPathGoalSnapshotsByStudent']) {
    assert.ok(positionalHookSeam('useTeacherLearningPaths').parameters.includes(setter), `App hands useTeacherLearningPaths ${setter}`);
    assert.match(appSource, new RegExp(`, ${setter}\\] = useState\\(`), `${setter} sets App's state`);
  }
  assert.match(learningPaths, /return teacherKit\.followWeeklyPathProgress\(weeklyPathProgress, \{[\s\S]*?completions: setWeeklyPathCompletionsByStudent,\s*goals: setWeeklyPathGoalSnapshotsByStudent,/);
});
