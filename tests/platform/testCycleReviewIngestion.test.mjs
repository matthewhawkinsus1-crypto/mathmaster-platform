import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region } from './helpers/sourceContract.mjs';
import { excludedAsSecureWork } from '../../functions/shared/submissionIngestion.mjs';

const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

/*
 * A TEST CYCLE'S REVIEW IS ORDINARY WORK, AND MUST REACH THE SERVER.
 *
 * "I can see them working on it but when I refresh I am getting no data to see
 * where they are." Every server path that records a student's answer refused a
 * Test Cycle assignment whole ("secure-assignment-excluded"), so Review answers
 * were acknowledged on the device and dropped: the teacher's row read 0/12 and
 * Review could never unlock the Test. The cycle's secure stages are not in its
 * runtime questions at all (they are issued through exam sessions), so the only
 * thing that blanket refusal ever caught was the Review.
 *
 * The end-to-end proof, through the real callables, is
 * tests/integration/testCycleReviewProgress.test.mjs (emulator; not in CI's
 * glob). These pin the rule and that each path asks it about the QUESTION.
 */

test('on a Test Cycle only a Review question is ordinary work; a secure assignment is refused whole', () => {
  const review = { activityRole: 'review' };
  assert.equal(excludedAsSecureWork({ testCycle: true, question: review }), false);
  assert.equal(excludedAsSecureWork({ testCycle: true, question: { activityRole: ' Review ' } }), false, 'the stored role, normalised');
  for (const role of ['classwork', 'practice', 'dol', 'warmup', 'test', 'retest', '']) {
    assert.equal(excludedAsSecureWork({ testCycle: true, question: { activityRole: role } }), true, `${role || 'no role'} stays refused`);
  }
  // No stored question backs the index: nothing to call Review.
  assert.equal(excludedAsSecureWork({ testCycle: true, question: null }), true);
  // `secure: true` is refused whatever the question says.
  assert.equal(excludedAsSecureWork({ secure: true, question: review }), true);
  // An ordinary assignment is untouched.
  assert.equal(excludedAsSecureWork({ testCycle: false, question: { activityRole: 'classwork' } }), false);
});

const exclusionCall = /excludedAsSecureWork\(\{\s*testCycle: secureAssignmentMode\(assignment\),[\s\S]*?question,?\s*\}\)/;

test('submission ingestion asks about the stored question, not the whole assignment', () => {
  const ingest = region(functionsIndex, 'async function ingestOneSubmission(', 'async function recordOneQuestionProgress(', 'ingestOneSubmission');
  const questionAt = ingest.indexOf('const question = assignment ? runtimeQuestionsFromAssignment(assignment)?.[envelope.questionIndex]');
  const exclusionAt = ingest.search(exclusionCall);
  assert.ok(questionAt >= 0, 'the question is read from the server\'s own assignment');
  assert.ok(exclusionAt > questionAt, 'and the exclusion is decided after it, about it');
  assert.match(ingest.slice(exclusionAt, exclusionAt + 400), /reason: "secure-assignment-excluded"/);
  // The blanket refusal is gone from this path.
  assert.doesNotMatch(ingest, /if \(assignment && \(secureAssignmentMode\(assignment\) \|\| assignment\.secure === true\)\)/);
});

test('question progress and checkpoint finalization apply the same rule', () => {
  const progress = region(functionsIndex, 'async function recordOneQuestionProgress(', 'exports.ingestStudentSubmissions = onCall(', 'recordOneQuestionProgress');
  assert.match(progress, /secureAssignment: Boolean\(assignment && ingestion\.excludedAsSecureWork\(\{/);
  assert.match(progress, exclusionCall);

  const finalize = region(functionsIndex, 'async function finalizeOneResponseCheckpoint(', 'exports.finalizeStudentResponseCheckpoints = onSchedule(', 'finalizeOneResponseCheckpoint');
  assert.match(finalize, /const \{ excludedAsSecureWork \} = await submissionIngestion\(\);/);
  assert.match(finalize, /isSecureAssignment: excludedAsSecureWork\(\{ testCycle: secureAssignmentMode\(assignment\), question \}\)/);
  assert.doesNotMatch(finalize, /isSecureAssignment: secureAssignmentMode\(assignment\),/);
});
