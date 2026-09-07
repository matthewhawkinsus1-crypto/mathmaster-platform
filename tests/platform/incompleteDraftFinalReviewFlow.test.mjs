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

/*
 * The three assertions above match names anywhere in the file, and a name can
 * appear at a call site while nothing brings it into scope. That is not
 * hypothetical: this wiring was first written with the call and no import, and
 * every gate stayed green — App.jsx is .jsx so no test can import it, `npm run
 * build` does not resolve the free identifier, and lint here has no no-undef.
 * The teacher would have published an assignment and hit a ReferenceError
 * exactly once, after the Firestore write, on the cleanup step.
 *
 * So the wiring is checked as wiring: what App calls, App must import.
 */
test('App imports the draft-store functions it calls, rather than referencing them free', () => {
  const called = ['markIncompleteAssignmentDraftPublished', 'finalizeIncompleteAssignmentDraftReview']
    .filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(appSource));

  assert.ok(
    called.length > 0,
    'App must call at least one draft-store function to close the incomplete-draft lifecycle on publication',
  );

  const missing = called.filter((name) => {
    const importing = new RegExp(`import[^;]*\\b${name}\\b[^;]*from\\s*['"][^'"]*incompleteAssignmentDraftStore[^'"]*['"]`, 's');
    return !importing.test(appSource);
  });

  assert.deepEqual(
    missing,
    [],
    `App.jsx calls these draft-store functions without importing them, which throws a ReferenceError at runtime and is invisible to lint, build and every test: ${missing.join(', ')}`,
  );
});
