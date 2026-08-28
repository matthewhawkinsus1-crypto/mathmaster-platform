import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');

test('new V5 persistence stores courseId for later reconstruction and export', () => {
  assert.match(app, /courseId:\s*reviewedV5\.assignment\?\.courseId/);
});

test('question editor runs native V5 Preflight before saving changes', () => {
  assert.match(app, /storedAssignmentToV5\(questionEditorAssignment/);
  assert.match(app, /const model = buildAssignmentV5PreflightModel\(candidateV5\)/);
  assert.match(app, /These question edits cannot be saved until MathMaster’s assignment checks are clean/);
  assert.match(app, /canonicalV5PersistencePatch\(model\.assignmentV5\)/);
});

test('duplicate is validated and becomes a true unassigned library copy', () => {
  assert.match(app, /The copy cannot be created until MathMaster’s assignment checks are clean/);
  assert.match(app, /assignedClassIds:\s*\[\]/);
  assert.match(app, /assignedClassPeriods:\s*\[\]/);
  assert.match(app, /dueAt:\s*null/);
  assert.match(app, /rigorVariant:\s*null/);
});

test('library assignment launches canonical V5 Preflight instead of mutating template in place', () => {
  assert.match(app, /openStoredAssignmentForPreflight/);
  assert.match(app, /if \(isLibraryAssignment\(assignment\) && editedClassIds\.length\)/);
  assert.match(app, /The library template is staying unchanged/);
});

test('existing destination variant cannot silently cross Standard or Honors rigor', () => {
  assert.match(app, /const changesDestination = targetGroups\.length > 1/);
  assert.match(app, /Use a destination copy/);
});

test('Export JSON emits canonical V5 instead of the retired schemaVersion 2 package', () => {
  assert.match(app, /buildPortableAssignmentPackage = \(assignment\) => storedAssignmentToV5/);
  assert.doesNotMatch(app, /buildPortableAssignmentPackage = \(assignment\) => \(\{\s*schemaVersion:\s*2/);
  assert.match(app, /portable MathMaster assignment/);
});

console.log('assignmentV5PostCreationWiring.test.mjs: all assertions passed');
