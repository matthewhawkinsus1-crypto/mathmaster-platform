import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storeSource = readFileSync(new URL('../../src/platform/preflight/incompleteAssignmentDraftStore.js', import.meta.url), 'utf8');
const intakeSource = readFileSync(new URL('../../src/AssignmentIntake.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

test('draft store persists explicit final review instead of leaving finalize helper unused', () => {
  assert.match(storeSource, /finalizeIncompleteAssignmentReview/);
  assert.match(storeSource, /finalizeIncompleteAssignmentDraftReview/);
  assert.match(storeSource, /updateDoc/);
});

test('Incomplete Assignment UI exposes final review only after repair work', () => {
  assert.match(intakeSource, /Complete final review|Mark ready/i);
  assert.match(intakeSource, /finalizeIncompleteAssignmentDraftReview/);
  assert.match(intakeSource, /authoringState/);
});

test('opening a repaired draft in normal Preflight carries source draft metadata through publication', () => {
  assert.match(intakeSource, /incompleteDraftId/);
  assert.match(intakeSource, /teacherReviewContext/);
  assert.match(appSource, /incompleteDraftId/);
  assert.match(appSource, /markIncompleteAssignmentDraftPublished|finalizeIncompleteAssignmentDraftReview/);
});
