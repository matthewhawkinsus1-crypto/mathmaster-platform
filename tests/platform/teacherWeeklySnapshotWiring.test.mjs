import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const functionsSource = await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8');
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

test('Gradebook, Home and Weekly Path all refresh the same weekly progress source', () => {
  assert.match(appSource, /\['weeklyPath', 'home', 'grades'\]\.includes\(teacherTab\)/);
  assert.match(appSource, /setWeeklyPathGoalSnapshotsByStudent\(result\?\.goalsByStudentId \|\| \{\}\)/);
});
