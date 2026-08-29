import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI authoring and blueprint preserve Assignment V5 adaptive policy and rigor metadata', () => {
  const contract = read('src/platform/contract/authoringContract.js');
  const blueprint = read('src/assignmentBlueprint.js');
  assert.match(contract, /"variantPolicy"/);
  assert.match(contract, /"mode": "personalized"/);
  assert.match(contract, /sectionModes/);
  assert.match(contract, /difficultyBand/);
  assert.match(contract, /dok is 1–4 cognitive complexity/);
  assert.match(blueprint, /\['adaptive', 'pitched'/);
  assert.match(blueprint, /\['shared', 'personalized', 'variant', 'adaptive'\]/);
});

test('Weekly Path teacher view reads secure completed sessions and shows a weekly grade', () => {
  const app = read('src/App.jsx');
  const store = read('src/platform/path/pathStore.js');
  const controls = read('src/components/teacher/WeeklyPathControls.jsx');
  const functions = read('functions/index.js');

  assert.match(app, /fetchTeacherWeeklyPathCompletions/);
  assert.match(app, /goalsByStudentId=\{teacherWeeklyGoalsByStudent\}/);
  assert.match(app, /completionsByStudentId=\{weeklyPathCompletionsByStudent\}/);
  assert.match(app, /setInterval\(\(\) => loadProgress\(\), 60_000\)/);
  assert.match(store, /httpsCallable\(functions, 'getTeacherWeeklyPathCompletions'\)/);
  assert.match(functions, /exports\.getTeacherWeeklyPathCompletions = onCall/);
  assert.match(functions, /Only the teacher of record for this class can view its Weekly Path progress/);
  assert.match(controls, /80% completion and 20% quality/);
  assert.match(controls, />Weekly grade</);
  assert.match(controls, /Math\.round\(row\.grade\)/);
});

test('teacher class workspace and gradebook prefer authoritative classId boundaries', () => {
  const app = read('src/App.jsx');
  const classesWorkspace = read('src/ClassesWorkspace.jsx');
  assert.match(app, /gradebookFilter[^\n]*classId/);
  assert.match(app, /student\.classId === gradebookFilter\.classId/);
  assert.match(classesWorkspace, /classes = \[\]/);
  // The membership rule used to be written out here in full. It was written out
  // in three places, and the three copies had drifted: one of them matched a
  // student on period even when the student had a real classId, which put a
  // recently-moved child on two rosters at once. There is now ONE rule, in
  // `functions/shared/classModel.mjs`, and its behaviour — including the case
  // where two classes share a period — is pinned by
  // `tests/platform/classContext.test.mjs` rather than by a text match.
  assert.match(classesWorkspace, /studentsInClass\(/);
  assert.match(classesWorkspace, /classId: selectedClass\.classId/);
  assert.match(classesWorkspace, /onViewGradebook\(selectedClass\.classId \|\| selectedPeriod/);
});

test('teacher gradebook displays the centralized Student Learning Profile badge', () => {
  const app = read('src/App.jsx');
  assert.match(app, /import StudentPerformanceBadge/);
  assert.match(app, /profile=\{teacherLearningProfiles\[student\.id\]\}/);
});
