/*
 * A SUBMISSION THIS DEVICE COULD NOT QUEUE WAS NOT SUBMITTED (Batch 3, RUN-3).
 *
 * When the durable outbox write failed, App.jsx returned `null` from Submit.
 * QuestionEngine reads `null` as "no server result, use the device's own
 * verdict": a correct answer showed "Correct!", locked the question (Submit
 * gone) and the save line said "Saved on this device only", while the toast
 * asked the student to press Submit again. Nothing had been saved.
 *
 * Now the host returns SUBMISSION_NOT_QUEUED: blocked feedback with no
 * verdict and no attempt, so the question stays open, Submit stays, and the
 * message says it was not submitted. The real engine is driven through it in
 * tests/browser/submitNotQueued.mjs (Chromebook and phone).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SUBMISSION_NOT_QUEUED,
  SUBMISSION_NOT_QUEUED_MESSAGE,
  isSubmissionNotQueued,
} from '../../src/platform/student/submissionNotQueued.js';
import { describeSaveStatus } from '../../src/platform/student/saveStatusModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));

test('the result says "not submitted": no verdict, no attempt, nothing that locks the question', () => {
  assert.equal(SUBMISSION_NOT_QUEUED.blocked, true, 'blocked: the engine shows the message and no outcome');
  assert.equal(SUBMISSION_NOT_QUEUED.isCorrect, false);
  for (const field of ['status', 'expired', 'attemptCount', 'remainingAttempts', 'partialCredit', 'incorrectParts']) {
    assert.equal(field in SUBMISSION_NOT_QUEUED, false, `${field}: a verdict or an attempt would close or count the question`);
  }
  assert.ok(Object.isFrozen(SUBMISSION_NOT_QUEUED));
  assert.match(SUBMISSION_NOT_QUEUED_MESSAGE, /^Not submitted\./);
  assert.match(SUBMISSION_NOT_QUEUED_MESSAGE, /no try was used/);
  assert.match(SUBMISSION_NOT_QUEUED_MESSAGE, /press Submit again/);
  assert.doesNotMatch(SUBMISSION_NOT_QUEUED_MESSAGE, /\bsaved\b(?! your answer)/i, 'never says the answer was saved');
  assert.equal(isSubmissionNotQueued(SUBMISSION_NOT_QUEUED), true);
  assert.equal(isSubmissionNotQueued({ blocked: true, isCorrect: false, message: 'could not check' }), false, 'a server refusal is not this');
  assert.equal(isSubmissionNotQueued(null), false);
  assert.equal(isSubmissionNotQueued({ isCorrect: true, status: 'correct' }), false);
});

test('the engine locks only on a verdict, so this result leaves the question open', () => {
  assert.match(engine, /const isCorrect = record\.status === 'correct' \|\| feedback\?\.status === 'correct';/);
  assert.match(engine, /const isExpired = remainingAttempts <= 0 && \(record\.status === 'expired' \|\| feedback\?\.expired\);/);
  assert.match(engine, /const locked = Boolean\(isCorrect \|\| isExpired \|\| assignmentLocked\);/);
  // Blocked feedback is told in its own alert, and the outcome box stays away.
  assert.match(engine, /\{feedback\?\.blocked && \(\s*<div role="alert"[^>]*>\s*\{feedback\.message\}/);
  // The outcome box never shows blocked feedback. (Batch 1's closed card adds
  // `&& !isExpired` to this line on the integration branch; main has no closed card.)
  assert.match(engine, /\{feedback && !feedback\.blocked && showOutcomeFeedback && !outcomeInTool(?: && !isExpired)? && \(/);
});

test('App.jsx: a failed queue returns "not submitted", never null', () => {
  assert.match(app, /import \{ SUBMISSION_NOT_QUEUED \} from '\.\/platform\/student\/submissionNotQueued\.js';/, 'imported next to its use');
  const submit = region(app, 'const handleGradeSubmit = async (', 'const handleStepGrade = async (');
  const enqueue = submit.indexOf("kind: 'ordinarySubmission'");
  assert.notEqual(enqueue, -1);
  const failure = submit.slice(submit.indexOf('} catch (error) {', enqueue), submit.indexOf('setTracker(updatedTracker);', enqueue));
  assert.match(failure, /setStudentPersistenceStatus\('volatile'\);/);
  assert.match(failure, /return SUBMISSION_NOT_QUEUED;/);
  assert.doesNotMatch(failure, /return null;/);
  // Said once: the engine's alert carries the message. A toast saying it
  // again was a second announcement of the same thing (pass 3, wave 6).
  assert.doesNotMatch(failure, /toast(?:Warning|Error|Info|Success)\(/);
  // Nothing is counted for it: the tracker is only written after the queue.
  assert.ok(submit.indexOf('setTracker(updatedTracker);', enqueue) > submit.indexOf('return SUBMISSION_NOT_QUEUED;'));
});

test('the save line has its own words for an unqueued change, never "saved"', () => {
  const line = region(app, '{!preview && studentSaveLineShown && (', '</p>');
  const volatile = line.match(/studentPersistenceStatus === 'volatile'\s*\?\s*'([^']*)'/)?.[1];
  assert.ok(volatile, 'volatile has a branch of its own');
  assert.match(volatile, /^Not saved/);
  assert.doesNotMatch(volatile, /Saved on this device/);
  assert.deepEqual(describeSaveStatus({ persistenceStatus: 'volatile' }).tone, 'attention', 'and Home says it needs attention');
});

test('QuestionEngine never freezes a verdict for an attempt the device could not queue', () => {
  assert.match(engine, /import \{ isSubmissionNotQueued \} from '\.\/platform\/student\/submissionNotQueued\.js';/);
  // Ordinary Submit: before the graded-for-display copy and a composed
  // question's per-step submission review (its green/red step verdicts).
  const submit = region(engine, 'const performSubmit = async () => {', 'const handleSubmit = async () => {');
  const guard = submit.search(/if \(isSubmissionNotQueued\(result\)\) \{\s*setFeedback\(result\);\s*return;\s*\}/);
  assert.notEqual(guard, -1, 'the ordinary path stops at a not-queued result');
  assert.ok(guard > submit.indexOf('const result = await onGrade('));
  assert.ok(guard < submit.indexOf('const nextFeedback = result ||'));
  assert.ok(guard < submit.indexOf('setGradedForDisplay('));
  assert.ok(guard < submit.indexOf('setWorkflowSubmissionReview('));
  // A registry tool: before its in-tool outcome slot is handed the result.
  const tool = region(engine, 'const handleMissingToolAction = async (', 'const handleModelingLabGrade = async (');
  const owners = [...tool.matchAll(/setToolOutcomeOwner\(/g)].map((match) => match.index);
  const guards = [...tool.matchAll(/if \(isSubmissionNotQueued\(result\)\) \{\s*setFeedback\(result\);\s*return;\s*\}/g)].map((match) => match.index);
  assert.equal(owners.length, 2, 'two tool paths hand a result to the slot');
  assert.equal(guards.length, 2, 'both stop at a not-queued result first');
  guards.forEach((at, index) => assert.ok(at < owners[index], `tool path ${index + 1}: the guard comes first`));
  // Pressing Submit again is not "the same answer again": no try was used.
  const handle = region(engine, 'const handleSubmit = async () => {', '};');
  assert.match(handle, /if \(sameIncorrectResponse && isMultipart && !isSubmissionNotQueued\(feedback\)\) \{\s*setUnchangedConfirmOpen\(true\);/);
});
