import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';

// The stale-tab/offline race: a student has a Practice response open or
// queued locally, redeems a Practice Pass before that response becomes a
// canonical attempt, and the queued response arrives after the waiver already
// exists. `ingestOneSubmission` (functions/index.js) is where every canonical
// attempt is written, and it cannot be unit-tested directly here (Admin SDK
// at module scope -- same constraint as classPointsAuthorizationOrder.test.mjs
// and the redeemPracticePass order tests), so this is a source contract
// proving the check exists, sees only Practice, runs before any canonical
// write, and never touches drafts.

const source = fs.readFileSync('functions/index.js', 'utf8');

const ingestBody = executableSource(region(
  source,
  'async function ingestOneSubmission({ db, studentId, envelope, now }) {',
  'exports.ingestStudentSubmissions = onCall(async (request) => {',
  'ingestOneSubmission',
));

const firstIndexOf = (haystack, needle, label) => {
  const index = haystack.indexOf(needle);
  assert.notEqual(index, -1, `could not find ${label} in the function body`);
  return index;
};

test('ingestOneSubmission checks for a Practice Pass redemption only on a practice-role response', () => {
  assert.match(ingestBody, /question\?\.activityRole === "practice" && classId/);
});

test('the Practice Pass check runs after the ordinary decision already accepted the response, before any canonical write', () => {
  const acceptedGuard = firstIndexOf(ingestBody, 'decision.disposition !== dispositions.SUBMISSION_DISPOSITION.ACCEPTED', 'the ACCEPTED guard');
  const practicePassCheck = firstIndexOf(ingestBody, 'practicePassRedemptionId(', 'the Practice Pass redemption lookup');
  const buildAttempt = firstIndexOf(ingestBody, 'ingestion.buildIngestedAttempt(', 'the canonical attempt builder');

  assert.ok(acceptedGuard < practicePassCheck, 'the redemption check must run after the ordinary ingestion decision, not instead of it');
  assert.ok(practicePassCheck < buildAttempt, 'the redemption check must run before any canonical attempt is built/written');
});

test('a redeemed Practice Pass retires the queued response as PERMANENTLY_INVALID, never as an accepted attempt', () => {
  assert.match(ingestBody, /disposition: dispositions\.SUBMISSION_DISPOSITION\.PERMANENTLY_INVALID,\s*\n\s*reason: "practice-pass-redeemed"/);
});

test('the retired receipt lets the durable outbox stop retrying rather than retry forever', () => {
  // PERMANENTLY_INVALID is a RETIRING disposition (see
  // functions/shared/studentSubmissionDisposition.mjs) precisely so a
  // receipt is written and the queue row can be retired -- never an
  // unprovable outcome that would keep the action retrying indefinitely.
  const practicePassCheck = firstIndexOf(ingestBody, 'practicePassRedemptionId(', 'the Practice Pass redemption lookup');
  const receiptWrite = ingestBody.indexOf('transaction.set(receiptRef,', practicePassCheck);
  assert.ok(receiptWrite > practicePassCheck, 'a receipt must be written for the retired Practice response');
});

test('ingestOneSubmission never deletes or reads studentWorkspaceDrafts because of a Practice Pass', () => {
  assert.doesNotMatch(ingestBody, /studentWorkspaceDrafts/);
});

test('the Practice Pass check never fires for Warm-Up, Classwork, or DOL responses', () => {
  assert.doesNotMatch(ingestBody, /activityRole === "warmup".*practicePassRedemptionId/s);
  assert.doesNotMatch(ingestBody, /activityRole === "classwork".*practicePassRedemptionId/s);
  assert.doesNotMatch(ingestBody, /activityRole === "dol".*practicePassRedemptionId/s);
});
