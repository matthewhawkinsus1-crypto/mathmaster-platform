import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('assignment creation persists canonical V5 sections and policy metadata', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /schemaVersion:\s*5/);
  assert.doesNotMatch(source, /runtimeProjectionVersion:\s*1/);
  assert.match(source, /const reviewedQuestions = flattenV5Sections\(reviewedV5\)/);
  assert.match(source, /sections:\s*rebuildV5SectionsFromQuestions\(reviewedV5, variantQuestions\)/);
  assert.doesNotMatch(source, /questions:\s*variantQuestions/);
  assert.match(source, /hydrateAssignmentRuntime\(\{ id: assignmentRef\.id, \.\.\.payload \}\)/);
  assert.match(source, /variantPolicy:/);
  assert.match(source, /differentiationPolicy:/);
  assert.match(source, /supportPolicy:/);
  assert.match(source, /outputProfiles:/);
});

test('question edits and duplication pass through canonical V5 reconstruction', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /storedAssignmentToV5\(questionEditorAssignment/);
  assert.match(source, /canonicalV5PersistencePatch\(model\.assignmentV5\)/);
  assert.match(source, /storedAssignmentToV5\(assignment/);
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


test('Firestore assignment reads hydrate the runtime question projection from canonical sections', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /hydrateAssignmentRuntime\(\{ id: assignmentDoc\.id, \.\.\.assignmentDoc\.data\(\) \}\)/);
  assert.match(source, /hydrateAssignmentRuntime\(\{ id: assignmentSnapshot\.id, \.\.\.assignmentSnapshot\.data\(\) \}\)/);
});

test('duplicate path strips runtime-only question fields before writing', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /questions:\s*_runtimeQuestions/);
  assert.match(source, /runtimeProjectionVersion:\s*_legacyRuntimeProjectionVersion/);
});


test('setup editing derives runtime questions from reviewed V5 sections, never persistence.questions', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.doesNotMatch(source, /\bpersistence\.questions\b/);
  assert.match(source, /const persistedQuestions = flattenV5Sections\(model\.assignmentV5\)/);
});

test('canonical persistence patch contains sections only and no flat questions projection', async () => {
  const { canonicalV5PersistencePatch } = await import('../../src/platform/contract/storedAssignmentV5.js');
  const patch = canonicalV5PersistencePatch({
    assignment: { title: 'Sections only', courseId: 'algebra1' },
    sections: [{ id: 'practice', role: 'practice', title: 'Practice', questions: [{ type: 'multiAnswer', prompt: 'Solve.' }] }],
    variantPolicy: { mode: 'shared', sectionModes: { practice: 'shared' } },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'questions'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'runtimeProjectionVersion'), false);
  assert.equal(Array.isArray(patch.sections), true);
});
