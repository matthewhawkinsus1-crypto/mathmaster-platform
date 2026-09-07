import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

test('library assignment review context uses a dedicated private teacher store', async () => {
  const module = await import('../../src/platform/preflight/assignmentQuestionReviewStore.js');
  assert.equal(module.ASSIGNMENT_QUESTION_REVIEWS_COLLECTION, 'assignmentQuestionReviews');
  assert.equal(typeof module.assignmentQuestionReviewDocId, 'function');
  assert.equal(typeof module.loadAssignmentTeacherReviewContext, 'function');
  assert.equal(typeof module.saveAssignmentTeacherReviewContext, 'function');
  assert.match(module.assignmentQuestionReviewDocId('teacher/uid', 'assignment/id'), /%2F/,
    'review document ids must not turn assignment ids or owner ids into Firestore path segments');
});

test('Firestore rules keep library teacher notes out of student-readable assignment documents', () => {
  assert.match(rules, /match \/assignmentQuestionReviews\/\{reviewId\}/);
  assert.match(rules, /ownerUid/);
  assert.match(rules, /request\.auth\.uid/);
  assert.match(rules, /teacher\(\)/);
});
