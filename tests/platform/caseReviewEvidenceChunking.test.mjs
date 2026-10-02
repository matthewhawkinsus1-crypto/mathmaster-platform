/*
 * THE CASE REVIEW ASKS FOR UP TO 200 ASSIGNMENTS, AND FIRESTORE'S `in` TAKES 30.
 *
 * PR #408 left "callable `in` query chunking for <= 200 assignments" to be
 * verified. It is correct: loadStudentCaseEvidence splits the requested
 * assignment ids into chunks of CASE_EVIDENCE_LIMITS.assignmentChunk and runs
 * one evidence-event query and one receipt query per chunk. A chunk over 30
 * values is refused by Firestore at run time ("'IN' supports up to 30
 * comparison values"), which the emulator-free suite would never see, and a
 * chunker that dropped or repeated an id would silently hide or double a
 * student's work in the review. These tests pin both.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CASE_EVIDENCE_LIMITS,
  chunk,
  validateCaseEvidenceRequest,
} from '../../functions/shared/caseReviewEvidence.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const FIRESTORE_IN_LIMIT = 30;
const ids = (count) => Array.from({ length: count }, (_, index) => `assignment-${String(index).padStart(3, '0')}`);
const DAY = 86400000;
const request = (assignmentIds) => validateCaseEvidenceRequest({
  studentId: 'student-a', fromMs: 0, toMs: 30 * DAY, assignmentIds,
});

test('every chunk fits one Firestore `in` query, and the most a request may ask for is covered once, in order', () => {
  assert.ok(CASE_EVIDENCE_LIMITS.assignmentChunk <= FIRESTORE_IN_LIMIT);
  for (const count of [1, 29, 30, 31, 60, 61, 199, CASE_EVIDENCE_LIMITS.maxAssignments]) {
    const all = ids(count);
    const chunks = chunk(all);
    assert.equal(chunks.length, Math.ceil(count / CASE_EVIDENCE_LIMITS.assignmentChunk), `${count} ids`);
    for (const part of chunks) {
      assert.ok(part.length > 0 && part.length <= FIRESTORE_IN_LIMIT, `${count} ids: a chunk of ${part.length}`);
    }
    assert.deepEqual(chunks.flat(), all, `${count} ids: every id exactly once, in order`);
  }
  assert.deepEqual(chunk([]), []);
});

test('a request is refused above the limit the chunking was sized for, counting each assignment once', () => {
  const max = CASE_EVIDENCE_LIMITS.maxAssignments;
  assert.equal(request(ids(max)).ok, true);
  const over = request(ids(max + 1));
  assert.equal(over.ok, false);
  assert.ok(over.errors.some((error) => error.includes(String(max))));
  // The same assignment listed twice is one assignment.
  const repeated = request([...ids(max), ...ids(max)]);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.request.assignmentIds.length, max);
});

test('the callable runs both `in` queries per chunk, never over the whole request', () => {
  const callable = region(
    executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')),
    'exports.loadStudentCaseEvidence',
    'exports.overrideStudentResponseGrade',
    'loadStudentCaseEvidence',
  );
  const inQueries = [...callable.matchAll(/\.where\(\s*"([^"]+)"\s*,\s*"in"\s*,\s*(\w+)\s*\)/g)];
  assert.deepEqual(inQueries.map(([, field]) => field).sort(), ['assignmentId', 'source.assignmentId']);
  for (const [, field, values] of inQueries) {
    assert.notEqual(values, 'assignmentIds', `${field} must be queried per chunk, not with every id at once`);
  }
  assert.match(callable, /caseEvidence\.chunk\(assignmentIds\)/);
});
