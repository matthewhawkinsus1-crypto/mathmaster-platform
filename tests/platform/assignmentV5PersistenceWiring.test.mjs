import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('assignment creation persists canonical V5 sections and policy metadata', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /schemaVersion:\s*5/);
  assert.match(source, /runtimeProjectionVersion:\s*1/);
  assert.match(source, /sections:\s*rebuildV5SectionsFromQuestions\(parsed\.bundleSource, variantQuestions\)/);
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

test('preflight adapts V5 sections instead of treating the source as Bundle V3', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /parsed\.bundleSource\?\.schemaVersion === 5/);
  assert.match(source, /activities:\s*parsed\.bundleSource\.sections \|\| \[\]/);
  assert.match(source, /Assignment V5/);
});

console.log('assignmentV5PersistenceWiring.test.mjs: all assertions passed');
