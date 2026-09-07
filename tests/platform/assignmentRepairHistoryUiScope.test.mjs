import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/components/teacher/IncompleteAssignmentRepairCenter.jsx', import.meta.url),
  'utf8',
);

/*
 * THE HISTORY LIST MUST ACTUALLY BE FILTERED, NOT MERELY MENTION THE FILTER.
 *
 * The history UI contract checks that `actualFocusedQuestionId` appears
 * somewhere in the Revision history region. It appears twice — once selecting
 * the entries, once picking the recorded version out of an entry — so deleting
 * the `.filter(...)` leaves the assertion satisfied.
 *
 * What that produces is a list, under "Question 3", of every repair ever made
 * to the assignment. Entries that never touched this question have no recorded
 * version of it, so they render as "Recorded version" with a Stage restore
 * button that refuses when pressed. The teacher is shown history that is not
 * theirs and offered an action that cannot work.
 */

test('the Revision history list selects entries by the focused question', () => {
  const start = source.indexOf('Revision history');
  assert.notEqual(start, -1, 'Revision history region not found');
  const region = source.slice(start, source.indexOf('Outside-AI repair handoff', start));

  const filterStart = region.indexOf('.filter(');
  assert.notEqual(filterStart, -1, 'the history list must filter its entries');
  const filterExpression = region.slice(filterStart, region.indexOf('\n', filterStart) + 200);

  assert.match(
    filterExpression,
    /questionId/,
    'the filter must compare a recorded questionId, or every repair in the assignment is listed under this question',
  );
  assert.match(
    filterExpression,
    /actualFocusedQuestionId|focusedRow\.questionId/,
    'the filter must compare against the focused question specifically',
  );
});

console.log('assignmentRepairHistoryUiScope.test.mjs: all assertions passed');
