import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';

// awardClassPoints and reverseClassPointAward run on the Admin SDK, so
// firestore.rules cannot protect their response the way it protects a direct
// client read. The ONLY thing standing between an unauthorized caller and a
// transaction/account payload is `authorizeClassPointsActor` being checked
// BEFORE every branch that can return data — including the idempotent-replay
// branch, which is exactly where the bug lived: a caller who knew (or reused)
// a valid studentId + classId + requestId tuple could receive another
// teacher's award/reversal result without ever being authorized for it.
//
// functions/index.js cannot be imported directly in a plain Node test (it
// calls firebase-admin's getFirestore() against a live project at module
// scope, and neither callable accepts an injectable db). So this is a source
// contract, in the same spirit as the rest of tests/platform's source-text
// assertions: it reads the real shipped function bodies and proves the
// authorization check's text position, not merely its presence, precedes the
// idempotency-replay branch. See docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md.

const source = fs.readFileSync('functions/index.js', 'utf8');

const awardBody = executableSource(region(
  source,
  'exports.awardClassPoints = onCall(',
  'exports.reverseClassPointAward = onCall(',
  'awardClassPoints',
));

const reversalBody = executableSource(region(
  source,
  'exports.reverseClassPointAward = onCall(',
  'function trustedResponseInspectionEvidence(',
  'reverseClassPointAward',
));

const firstIndexOf = (haystack, needle, label) => {
  const index = haystack.indexOf(needle);
  assert.notEqual(index, -1, `could not find ${label} in the function body`);
  return index;
};

test('awardClassPoints checks authorization before it can return an idempotent replay', () => {
  const authorizationCall = firstIndexOf(awardBody, 'authorizeClassPointsActor(', 'the authorization call');
  const authorizationThrow = firstIndexOf(awardBody, 'if (!decision.authorized) throw', 'the authorization-failure throw');
  const idempotencyBranch = firstIndexOf(awardBody, 'idempotencySnap.exists', 'the idempotent-replay check');

  assert.ok(
    authorizationCall < idempotencyBranch,
    'authorizeClassPointsActor must be called before the idempotency-replay branch is reached, '
    + 'or a caller who is not this student\'s teacher of record could replay another teacher\'s '
    + 'award by reusing its studentId + classId + requestId.',
  );
  assert.ok(
    authorizationThrow < idempotencyBranch,
    'the authorization decision must be enforced (thrown on) before the idempotency-replay branch, '
    + 'not merely computed earlier and checked later.',
  );
});

test('the ordering comparison above would actually catch the original bug\'s shape', () => {
  // A direct sanity check that the `<` comparison used above discriminates
  // correctly, independent of the real file: PR #253's original
  // implementation checked `idempotencySnap.exists` and returned before ever
  // calling `authorizeClassPointsActor`. Reproduced in miniature here and
  // confirmed to fail the same comparison, so this test is not merely
  // asserting a name is present somewhere in the file.
  const buggyShape = [
    'if (idempotencySnap.exists) { return { replay: true }; }',
    'const decision = authorizeClassPointsActor({ teacherEmail });',
    'if (!decision.authorized) throw new HttpsError(decision.reason, decision.message);',
  ].join('\n');
  const buggyAuthorizationCall = buggyShape.indexOf('authorizeClassPointsActor(');
  const buggyIdempotencyBranch = buggyShape.indexOf('idempotencySnap.exists');
  assert.ok(
    buggyAuthorizationCall > buggyIdempotencyBranch,
    'the reproduced buggy shape should place authorization after the replay check',
  );
});

test('reverseClassPointAward checks authorization before it can return an idempotent replay', () => {
  const authorizationCall = firstIndexOf(reversalBody, 'authorizeClassPointsActor(', 'the authorization call');
  const authorizationThrow = firstIndexOf(reversalBody, 'if (!decision.authorized) throw', 'the authorization-failure throw');
  const idempotencyBranch = firstIndexOf(reversalBody, 'reversalSnap.exists', 'the idempotent-replay check');

  assert.ok(
    authorizationCall < idempotencyBranch,
    'authorizeClassPointsActor must be called before the reversal-replay branch is reached, or a '
    + 'caller who is not this award\'s current authorized teacher could replay another teacher\'s '
    + 'reversal result by reusing its transactionId + requestId.',
  );
  assert.ok(authorizationThrow < idempotencyBranch);
});

test('reverseClassPointAward only targets a live, un-reversed teacher award', () => {
  const reversibilityCheck = firstIndexOf(reversalBody, 'isReversibleAward(originalData)', 'the reversibility check');
  const idempotencyBranch = firstIndexOf(reversalBody, 'reversalSnap.exists', 'the idempotent-replay check');
  // Order relative to the replay branch is not itself load-bearing, but the
  // check must exist in the function body at all -- a future transaction
  // shape (rewardRedemption, liveChallengeAchievement) must never silently
  // pass through this teacher-award-only reversal path.
  assert.ok(reversibilityCheck >= 0);
  assert.ok(idempotencyBranch >= 0);
});

test('both callables derive authorization from the shared helper, not a re-implemented check', () => {
  // A second, parallel authorization notion (e.g. reading
  // gradeData.assignedTeacherEmail directly instead of going through
  // authorizeClassPointsActor) is exactly what let award and reversal drift
  // apart in the first place.
  assert.doesNotMatch(awardBody, /assignedTeacherEmail\s*!==\s*teacherEmail/);
  assert.doesNotMatch(reversalBody, /assignedTeacherEmail\s*!==\s*teacherEmail/);
});

// --- redeemPracticePass: the class/roster must be consistent before a spend -
//
// This callable has no teacher actor to authorize -- the caller is always the
// spending student -- so it reuses `authorizeClassPointsActor` for a
// different purpose: verifying the class/roster are internally consistent
// (exists, not archived, the student's own grade record still names this
// class, the class has a teacherOfRecord, and the roster's
// assignedTeacherEmail agrees with it) before any point is spent. A replay of
// an ALREADY-completed redemption is exempt -- it returns the original
// receipt from before, never a fresh spend -- so the consistency check only
// has to run, and only has to be enforced, for a genuinely new redemption.

const redeemBody = executableSource(region(
  source,
  'exports.redeemPracticePass = onCall(',
  'function trustedResponseInspectionEvidence(',
  'redeemPracticePass',
));

test('redeemPracticePass verifies class/roster consistency before spending, not merely after', () => {
  const idempotencyBranch = firstIndexOf(redeemBody, 'redemptionSnap.exists', 'the idempotent-replay check');
  const consistencyCall = firstIndexOf(redeemBody, 'authorizeClassPointsActor(', 'the class/roster consistency check');
  const consistencyThrow = firstIndexOf(redeemBody, 'if (!consistency.authorized) throw', 'the consistency-failure throw');
  const eligibilityCall = firstIndexOf(redeemBody, 'evaluatePracticePassEligibility(', 'the eligibility decision');
  const firstWrite = firstIndexOf(redeemBody, 'transaction.set(', 'the first transactional write');

  assert.ok(
    idempotencyBranch < consistencyCall,
    'an idempotent replay of an already-completed redemption must return before the consistency '
    + 'check runs -- it is re-verifying a spend that already happened, not authorizing a new one.',
  );
  assert.ok(
    consistencyCall < eligibilityCall,
    'class/roster consistency must be verified before the eligibility decision, so an inconsistent '
    + 'roster can never reach a spend through an otherwise-eligible assignment.',
  );
  assert.ok(consistencyThrow < eligibilityCall, 'the consistency decision must be enforced (thrown on), not merely computed.');
  assert.ok(consistencyCall < firstWrite, 'consistency must be verified before any transactional write.');
});

test('redeemPracticePass reuses the shared authorization helper rather than a hand-rolled roster check', () => {
  assert.match(redeemBody, /points\.authorizeClassPointsActor\(/);
  assert.doesNotMatch(redeemBody, /assignedTeacherEmail\s*!==\s*teacherEmail/);
});

test('redeemPracticePass never builds ledger authorization from an empty teacherOfRecord', () => {
  // classPointsAuthorizationContext is only reached after the consistency
  // check above has already required classRecord.teacherOfRecord to be
  // non-empty and to agree with the roster -- so a redemption can never write
  // an account/transaction with empty originTeacherEmail/authorizedTeacherEmails.
  const consistencyCall = firstIndexOf(redeemBody, 'authorizeClassPointsActor(', 'the class/roster consistency check');
  const authorizationContextCall = firstIndexOf(redeemBody, 'classPointsAuthorizationContext(', 'the authorization-context builder');
  assert.ok(consistencyCall < authorizationContextCall);
});
