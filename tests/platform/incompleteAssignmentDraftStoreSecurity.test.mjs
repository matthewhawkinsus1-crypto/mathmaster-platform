import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const rules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');

test('incomplete assignment authoring drafts are teacher-owned and not student-readable', () => {
  const block = rules.match(/match \/assignmentAuthoringDrafts\/\{draftId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.ok(block, 'assignmentAuthoringDrafts rule block is missing');
  assert.match(block, /teacher\(\)/);
  assert.match(block, /authoringReview\.ownerUid/);
  assert.match(block, /request\.auth\.uid/);
  assert.doesNotMatch(block, /signedIn\(\).*allow read/);
});

console.log('incompleteAssignmentDraftStoreSecurity.test.mjs: all assertions passed');