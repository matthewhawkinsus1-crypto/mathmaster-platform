import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { applyIncompleteDraftRepairCommit } from '../../src/platform/preflight/incompleteAssignmentDraft.js';

/*
 * THE REPAIR, THE REVISION AND THE TEACHER'S NOTES ARE ONE SAVE.
 *
 * A commit produces three things that only make sense together: the repaired
 * assignment, the revision it was committed at, and the review context saying
 * which flags that revision might have addressed. Persist the questions and
 * drop the revision, and the NEXT repair is prepared against a number that no
 * longer describes the draft — which is the number the stale-repair guard
 * checks, so it would wave through a repair built on superseded content. Drop
 * the review context instead and the teacher loses the record of what still
 * needs verifying.
 *
 * The Repair Center contract covers the pure function. This covers the seam
 * underneath it: the store that actually writes the draft has to pass the
 * commit through rather than falling back to plain revalidation.
 */

const assignmentV5 = {
  schemaVersion: 5,
  assignment: { assignmentId: 'a-1', title: 'Persist fixture', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{
    id: 'cw',
    role: 'classwork',
    title: 'Classwork',
    questions: [{
      questionId: 'q-cw-1',
      type: 'algebra',
      prompt: 'Solve x + 2 = 5.',
      answer: '3',
      activityRole: 'classwork',
      alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
    }],
  }],
};

const draft = () => ({
  id: 'draft-1',
  schemaVersion: 5,
  title: 'Persist fixture',
  assignmentRevision: 12,
  teacherReviewContext: { flags: [{ id: 'flag-1', scope: 'question', targetId: 'q-cw-1', severity: 'needsEditing', note: 'Shorten.', status: 'open' }] },
  authoringReview: { state: 'incomplete', ownerUid: 'teacher-1' },
  authoringDraft: { canonicalJson: JSON.stringify(assignmentV5), sourceSchemaVersion: 5 },
});

test('a committed repair keeps the revision and the review context with the assignment', () => {
  const repaired = structuredClone(assignmentV5);
  repaired.sections[0].questions[0].prompt = 'Solve x + 2 = 5. Show one step.';
  const nextContext = { flags: [{ ...draft().teacherReviewContext.flags[0], potentiallyAddressedByRevision: 13 }] };

  const next = applyIncompleteDraftRepairCommit(draft(), {
    assignmentV5: repaired,
    teacherReviewContext: nextContext,
    committedRevision: 13,
  });

  assert.equal(next.assignmentRevision, 13);
  assert.deepEqual(next.teacherReviewContext, nextContext);
  assert.equal(JSON.parse(next.authoringDraft.canonicalJson).sections[0].questions[0].prompt, 'Solve x + 2 = 5. Show one step.');
  // Revalidation still runs, so a repaired draft reports its real state.
  assert.ok(next.authoringReview, 'the draft must be revalidated as part of the commit');
  assert.equal(next.authoringReview.ownerUid, 'teacher-1', 'ownership must survive a repair, or the rules stop matching the document');
});

test('the draft store persists a committed repair through the commit helper', () => {
  const store = readFileSync(new URL('../../src/platform/preflight/incompleteAssignmentDraftStore.js', import.meta.url), 'utf8');
  const start = store.indexOf('export const commitIncompleteAssignmentDraftRepair');
  assert.notEqual(start, -1, 'commitIncompleteAssignmentDraftRepair not found: a committed repair has no way to reach Firestore');
  const body = store.slice(start, store.indexOf('\n};', start));

  // Going through the helper is what keeps the assignment, the revision and the
  // review context in one write. Rebuilding the patch by hand here is how they
  // drift apart.
  assert.match(body, /applyIncompleteDraftRepairCommit\(/, 'a commit must be persisted through applyIncompleteDraftRepairCommit');
  assert.match(body, /updateDoc\(/, 'the commit must actually be written');
});

/*
 * Verifying a flag is not a question edit.
 *
 * A teacher pressing "Verify fixed" is recording a human judgement about work
 * that already happened. If the only way to persist that were the repair-commit
 * path, verifying would either rewrite a question that nobody changed or bump
 * the revision for no reason — and a revision bump invalidates any repair
 * packet a teacher is holding.
 */
test('teacher review state can be saved without rewriting a question', () => {
  const store = readFileSync(new URL('../../src/platform/preflight/incompleteAssignmentDraftStore.js', import.meta.url), 'utf8');
  const start = store.indexOf('export const saveIncompleteAssignmentTeacherReviewContext');
  assert.notEqual(start, -1, 'saveIncompleteAssignmentTeacherReviewContext not found');
  const body = store.slice(start, store.indexOf('\n};', start));

  assert.match(body, /teacherReviewContext/);
  assert.match(body, /updateDoc\(/);
  assert.doesNotMatch(
    body,
    /assignmentRevision|canonicalJson/,
    'saving a verification must not bump the revision or rewrite the assignment',
  );
});

/*
 * IMPORTED IS NOT RENDERED.
 *
 * The Repair Center contract asserts that "IncompleteAssignmentRepairCenter"
 * appears in AssignmentIntake.jsx — which the import line alone satisfies. The
 * component could be imported and never placed on screen, and every assertion
 * would still pass while no teacher could reach it. Assert the element, and the
 * button that reveals it.
 */
test('the Repair Center is actually rendered by the intake, not merely imported', () => {
  const intake = readFileSync(new URL('../../src/AssignmentIntake.jsx', import.meta.url), 'utf8');

  assert.match(
    intake,
    /<IncompleteAssignmentRepairCenter[\s>]/,
    'AssignmentIntake.jsx must render <IncompleteAssignmentRepairCenter />; importing it is not enough',
  );
  assert.match(intake, /Open Repair Center/, 'a teacher needs a control that opens it');
  // The component saves through the store itself, so the intake must hand it
  // the draft and refresh once it reports a save; otherwise a committed repair
  // is written and the list still shows the old state.
  assert.match(intake, /draft=\{draft\}/);
  assert.match(intake, /onSaved=/);
});

/*
 * A SAVED REPAIR MUST ADVANCE THE REVISION.
 *
 * The revision is the whole staleness mechanism: a repair packet records the
 * revision it was built from, and the parser refuses a reply whose baseRevision
 * no longer matches the draft. That only works while every committed repair
 * moves the number forward.
 *
 * Save a repair at the revision it started from and the content changes while
 * the number does not. A packet a teacher generated BEFORE that repair still
 * claims the current revision, so the staleness check waves it through and it
 * overwrites the repair that just landed — silently, and looking like success.
 * Going backwards is worse for the same reason.
 */
test('committing a repair at or below the current revision is refused', () => {
  const repaired = structuredClone(assignmentV5);
  repaired.sections[0].questions[0].prompt = 'Solve x + 2 = 5. Show one step.';

  const commit = (committedRevision) => applyIncompleteDraftRepairCommit(draft(), {
    assignmentV5: repaired,
    teacherReviewContext: draft().teacherReviewContext,
    committedRevision,
  });

  assert.equal(commit(13).assignmentRevision, 13, 'advancing the revision is the normal case');
  assert.throws(() => commit(12), /revision/i, 'saving at the same revision changes content without changing the number');
  assert.throws(() => commit(11), /revision/i, 'saving backwards is the same failure in the other direction');
  assert.throws(() => commit(null), /revision/i, 'a commit with no revision cannot be checked for staleness later');
});

console.log('incompleteDraftRepairPersistence.test.mjs: all assertions passed');
