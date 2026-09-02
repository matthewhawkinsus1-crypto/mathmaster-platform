import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNC_STATUS, coursesToUpdate, describePublicationSync, summarizeAssignmentSync,
} from '../../src/classroomSyncState.js';

const DUE = '2026-09-14T20:30:00.000Z';
const MOVED = '2026-09-18T20:30:00.000Z';

const assignment = { id: 'a1', title: 'Functions Classwork', dueAt: DUE };

const published = (overrides = {}) => ({
  assignmentId: 'a1',
  courseId: 'c1',
  courseName: 'Algebra II — 1st',
  status: 'published',
  courseworkId: 'cw1',
  syncedDueAt: DUE,
  ...overrides,
});

// --- Acceptance 1 to 4 ------------------------------------------------------

test('a freshly published post is in sync', () => {
  const state = describePublicationSync(assignment, published());
  assert.equal(state.status, SYNC_STATUS.IN_SYNC);
  assert.equal(state.needsUpdate, false);
});

test('Acceptance 3 and 4 — moving the due date makes the post stale without touching Google', () => {
  // The only thing that changed is the MathMaster assignment. Nothing was sent.
  const moved = { ...assignment, dueAt: MOVED };
  const state = describePublicationSync(moved, published());
  assert.equal(state.status, SYNC_STATUS.DUE_DATE_CHANGED);
  assert.equal(state.needsUpdate, true);
  assert.equal(state.label, 'Published · due date changed');
});

test('Acceptance 4 — the summary counts the posts that need updating', () => {
  const moved = { ...assignment, dueAt: MOVED };
  const sync = summarizeAssignmentSync(moved, [
    published({ courseId: 'c1', courseName: 'Period 1' }),
    published({ courseId: 'c2', courseName: 'Period 2' }),
  ]);
  assert.equal(sync.publishedCount, 2);
  assert.equal(sync.staleCount, 2);
  assert.equal(sync.message, '2 Classroom posts need updating.');
  assert.deepEqual(sync.staleCourseIds, ['c1', 'c2']);
});

test('the singular reads correctly too', () => {
  const moved = { ...assignment, dueAt: MOVED };
  const sync = summarizeAssignmentSync(moved, [published()]);
  assert.equal(sync.message, '1 Classroom post needs updating.');
});

// --- Acceptance 6: partial failure ------------------------------------------

test('Acceptance 6 — one updated course leaves only the other stale', () => {
  const moved = { ...assignment, dueAt: MOVED };
  const publications = [
    // c1 succeeded: its syncedDueAt now matches.
    published({ courseId: 'c1', syncedDueAt: MOVED }),
    // c2 failed: it still carries the old value.
    published({ courseId: 'c2', syncedDueAt: DUE, syncError: 'Google says no' }),
  ];
  const sync = summarizeAssignmentSync(moved, publications);
  assert.equal(sync.staleCount, 1);
  assert.deepEqual(sync.staleCourseIds, ['c2'], 'a retry must not re-patch the course that worked');
  assert.deepEqual(coursesToUpdate(moved, publications), ['c2']);
});

// --- Acceptance 7: the state returns after another edit ---------------------

test('Acceptance 7 — changing the date again makes it stale again', () => {
  const publications = [published({ syncedDueAt: MOVED })];
  const settled = { ...assignment, dueAt: MOVED };
  assert.equal(summarizeAssignmentSync(settled, publications).needsUpdate, false);

  const movedAgain = { ...assignment, dueAt: '2026-09-25T20:30:00.000Z' };
  assert.equal(summarizeAssignmentSync(movedAgain, publications).needsUpdate, true);
});

// --- Shapes and edge cases --------------------------------------------------

test('a record that predates syncedDueAt falls back to what it stored', () => {
  // Older publications recorded the sent value under `dueAt`. Same meaning.
  const legacy = { assignmentId: 'a1', courseId: 'c1', status: 'published', courseworkId: 'cw1', dueAt: DUE };
  assert.equal(describePublicationSync(assignment, legacy).needsUpdate, false);
  assert.equal(describePublicationSync({ ...assignment, dueAt: MOVED }, legacy).needsUpdate, true);
});

test('Firestore timestamp shapes are read, not stringified', () => {
  const seconds = Math.floor(new Date(DUE).getTime() / 1000);
  assert.equal(describePublicationSync(assignment, published({ syncedDueAt: { seconds } })).needsUpdate, false);
  assert.equal(describePublicationSync(assignment, published({ syncedDueAt: { _seconds: seconds } })).needsUpdate, false);
});

test('a failed publish is not a stale publish', () => {
  const state = describePublicationSync(assignment, { ...published(), status: 'failed', error: 'boom' });
  assert.equal(state.status, SYNC_STATUS.FAILED);
  assert.equal(state.needsUpdate, false, 'a failed publish needs publishing, not updating');
  assert.equal(state.error, 'boom');
  assert.equal(
    summarizeAssignmentSync(assignment, [{ ...published(), status: 'failed', error: 'boom' }]).message,
    '1 Classroom post needs attention.',
  );
});

test('a missing Classroom post is never reported as up to date', () => {
  const missing = { ...published(), status: 'missing' };
  const state = describePublicationSync(assignment, missing);
  assert.equal(state.status, SYNC_STATUS.MISSING);
  assert.equal(state.label, 'Classroom post missing');
  assert.equal(state.needsUpdate, false);
  assert.equal(summarizeAssignmentSync(assignment, [missing]).message, '1 Classroom post needs attention.');
});

test('a publication still in flight is not stale', () => {
  const state = describePublicationSync(assignment, { ...published(), status: 'publishing' });
  assert.equal(state.status, SYNC_STATUS.PUBLISHING);
  assert.equal(state.needsUpdate, false);
});

test('Acceptance 8 — an assignment with no due date is never reported as stale', () => {
  // A library item has no due date. There is nothing to send, so nothing is
  // behind — the publish guard is what stops it, not this.
  const dateless = { id: 'a1', title: 'Library item', dueAt: null };
  assert.equal(describePublicationSync(dateless, published({ syncedDueAt: null })).needsUpdate, false);
});

test('publications belonging to other assignments are ignored', () => {
  const sync = summarizeAssignmentSync({ ...assignment, dueAt: MOVED }, [
    published({ courseId: 'c1' }),
    published({ assignmentId: 'other', courseId: 'c9' }),
  ]);
  assert.equal(sync.courses.length, 1);
  assert.equal(sync.staleCount, 1);
});

test('an unpublished assignment says so rather than claiming sync', () => {
  const sync = summarizeAssignmentSync(assignment, []);
  assert.equal(sync.publishedCount, 0);
  assert.equal(sync.needsUpdate, false);
  assert.equal(sync.message, 'Not published to Google Classroom.');
});
