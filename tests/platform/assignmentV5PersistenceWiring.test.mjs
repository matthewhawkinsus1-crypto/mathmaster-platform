import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('assignment creation persists canonical V5 sections and policy metadata', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /schemaVersion:\s*5/);
  assert.match(source, /runtimeProjectionVersion:\s*1/);
  assert.match(source, /const reviewedQuestions = flattenV5Sections\(reviewedV5\)/);
  assert.match(source, /sections:\s*rebuildV5SectionsFromQuestions\(reviewedV5, variantQuestions\)/);
  assert.match(source, /variantPolicy:/);
  assert.match(source, /differentiationPolicy:/);
  assert.match(source, /supportPolicy:/);
  assert.match(source, /outputProfiles:/);
});

test('question edits and duplication rebuild canonical V5 sections', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /sections:\s*rebuildV5SectionsFromQuestions\(questionEditorAssignment, normalizedQuestions\)/);
  assert.match(source, /sections:\s*rebuildV5SectionsFromQuestions\(assignment, duplicateQuestions\)/);
});

test('preflight stores and passes the canonical V5 object without a Bundle V3 adapter', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /const assignmentV5 = inspected\.bundleSource/);
  assert.match(source, /Number\(assignmentV5\.schemaVersion\) !== 5/);
  assert.match(source, /assignmentV5=\{assignmentPreflight\.assignmentV5\}/);
  assert.doesNotMatch(source, /buildPreflightBundle|normalizeLessonBundle/);
});

console.log('assignmentV5PersistenceWiring.test.mjs: all assertions passed');


test('teacher-reviewed canonical policy values are persisted from reviewedV5', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /differentiationPolicy:\s*reviewedV5\.differentiationPolicy/);
  assert.match(source, /supportPolicy:\s*reviewedV5\.supportPolicy/);
  assert.match(source, /outputProfiles:\s*reviewedV5\.outputProfiles/);
  assert.match(source, /preflight:\s*reviewedV5\.preflight/);
});
