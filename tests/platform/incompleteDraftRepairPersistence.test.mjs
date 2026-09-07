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

test('the draft store passes a commit through instead of falling back to plain revalidation', () => {
  const store = readFileSync(new URL('../../src/platform/preflight/incompleteAssignmentDraftStore.js', import.meta.url), 'utf8');
  const start = store.indexOf('export const updateIncompleteAssignmentDraft');
  assert.notEqual(start, -1, 'updateIncompleteAssignmentDraft not found');
  const body = store.slice(start, store.indexOf('\n};', start));

  assert.match(body, /applyIncompleteDraftRepairCommit\(/, 'a commit must be persisted through applyIncompleteDraftRepairCommit');
  assert.match(body, /committedRevision/, 'the committed revision must reach the stored document');
  assert.match(body, /teacherReviewContext/, 'the teacher review context must reach the stored document');
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
  // The commit has to reach the store, or a repair is shown and then lost.
  assert.match(intake, /updateIncompleteAssignmentDraft\(/);
  assert.match(intake, /committedRevision/);
});

console.log('incompleteDraftRepairPersistence.test.mjs: all assertions passed');
