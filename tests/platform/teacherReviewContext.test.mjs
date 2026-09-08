import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addTeacherReviewFlag,
  markTeacherFlagPotentiallyAddressed,
  resolveTeacherReviewFlag,
  reviewContextForQuestion,
  teacherRepairConstraintsForQuestion,
} from '../../src/platform/preflight/teacherReviewContext.js';
import {
  buildIncompleteAssignmentDraftRecord,
  markIncompleteDraftForReview,
} from '../../src/platform/preflight/incompleteAssignmentDraft.js';

const question = {
  questionId: 'q-cw-1',
  type: 'algebra',
  prompt: 'Solve x + 2 = 5.',
  answer: '3',
  activityRole: 'classwork',
  alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
};

const assignment = {
  schemaVersion: 5,
  assignment: {
    title: 'Teacher Review Context',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  sections: [
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [question] },
  ],
};

const salvageableIntake = {
  ok: false,
  errors: ['Question 1 needs repair.'],
  warnings: [],
  parsed: {
    sourceSchemaVersion: 5,
    assignmentV5: assignment,
    questions: [question],
  },
  sourceSchemaVersion: 5,
};

test('teacher can persist a question-specific review flag against the immutable question id', () => {
  const context = addTeacherReviewFlag(null, {
    scope: 'question',
    targetId: 'q-cw-1',
    category: 'rendering',
    severity: 'needsEditing',
    note: 'The graph gives away the intercepts before the student answers.',
  }, {
    flagId: 'flag-1',
    nowIso: '2026-09-07T14:00:00.000Z',
    assignmentRevision: 12,
  });

  assert.equal(context.flags.length, 1);
  assert.deepEqual(context.flags[0], {
    id: 'flag-1',
    scope: 'question',
    targetId: 'q-cw-1',
    category: 'rendering',
    severity: 'needsEditing',
    note: 'The graph gives away the intercepts before the student answers.',
    // Present from the first save rather than appearing once a teacher attaches
    // evidence, so every reader sees one flag shape. The image itself lives in
    // its own document; only the reference belongs here.
    screenshotId: null,
    status: 'open',
    assignmentRevision: 12,
    potentiallyAddressedByRevision: null,
    createdAt: '2026-09-07T14:00:00.000Z',
    updatedAt: '2026-09-07T14:00:00.000Z',
  });
});

test('question review context inherits assignment and section notes without pulling flags from other questions', () => {
  let context = null;
  context = addTeacherReviewFlag(context, {
    scope: 'assignment',
    category: 'standardsRigor',
    severity: 'suggestion',
    note: 'Keep the lesson focused on Algebra I representations.',
  }, { flagId: 'a', nowIso: '2026-09-07T14:01:00.000Z' });
  context = addTeacherReviewFlag(context, {
    scope: 'section',
    targetId: 'cw',
    category: 'difficulty',
    severity: 'needsEditing',
    note: 'Classwork should be more guided than Practice.',
  }, { flagId: 's', nowIso: '2026-09-07T14:02:00.000Z' });
  context = addTeacherReviewFlag(context, {
    scope: 'question',
    targetId: 'q-cw-1',
    category: 'directions',
    severity: 'blocking',
    note: 'Do not change this to multiple choice.',
  }, { flagId: 'q1', nowIso: '2026-09-07T14:03:00.000Z' });
  context = addTeacherReviewFlag(context, {
    scope: 'question',
    targetId: 'q-other',
    category: 'content',
    severity: 'needsEditing',
    note: 'This belongs to another question.',
  }, { flagId: 'q2', nowIso: '2026-09-07T14:04:00.000Z' });

  const relevant = reviewContextForQuestion(context, { sectionId: 'cw', questionId: 'q-cw-1' });
  assert.deepEqual(relevant.map((flag) => flag.id), ['a', 's', 'q1']);

  const constraints = teacherRepairConstraintsForQuestion(context, { sectionId: 'cw', questionId: 'q-cw-1' });
  assert.deepEqual(constraints.map((entry) => entry.note), [
    'Keep the lesson focused on Algebra I representations.',
    'Classwork should be more guided than Practice.',
    'Do not change this to multiple choice.',
  ]);
});

test('AI repair never silently closes a teacher flag', () => {
  const context = addTeacherReviewFlag(null, {
    scope: 'question',
    targetId: 'q-cw-1',
    category: 'grading',
    severity: 'blocking',
    note: 'Correct work is being marked wrong.',
  }, { flagId: 'flag-1', nowIso: '2026-09-07T14:00:00.000Z' });

  const afterImport = markTeacherFlagPotentiallyAddressed(context, 'flag-1', {
    assignmentRevision: 13,
    nowIso: '2026-09-07T14:10:00.000Z',
  });
  assert.equal(afterImport.flags[0].status, 'open');
  assert.equal(afterImport.flags[0].potentiallyAddressedByRevision, 13);

  const verified = resolveTeacherReviewFlag(afterImport, 'flag-1', {
    status: 'fixed',
    nowIso: '2026-09-07T14:12:00.000Z',
  });
  assert.equal(verified.flags[0].status, 'fixed');
});

test('incomplete draft records persist teacher review context across validation updates', () => {
  const record = buildIncompleteAssignmentDraftRecord({
    intakeResult: salvageableIntake,
    rawText: JSON.stringify(assignment),
    sourceName: 'teacher-review.json',
    ownerUid: 'teacher-1',
    nowIso: '2026-09-07T14:00:00.000Z',
  });

  const withFlag = {
    ...record,
    teacherReviewContext: addTeacherReviewFlag(record.teacherReviewContext, {
      scope: 'question',
      targetId: 'q-cw-1',
      category: 'studentInteraction',
      severity: 'needsEditing',
      note: 'Students need to manipulate the graph rather than only read it.',
    }, { flagId: 'flag-1', nowIso: '2026-09-07T14:05:00.000Z' }),
  };

  const reviewed = markIncompleteDraftForReview(withFlag, assignment, {
    nowIso: '2026-09-07T14:10:00.000Z',
  });

  assert.equal(reviewed.teacherReviewContext.flags.length, 1);
  assert.equal(reviewed.teacherReviewContext.flags[0].targetId, 'q-cw-1');
  assert.equal(reviewed.teacherReviewContext.flags[0].status, 'open');
});

console.log('teacherReviewContext.test.mjs: all assertions passed');
