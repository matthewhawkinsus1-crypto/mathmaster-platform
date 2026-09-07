import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const intakeWrapper = readFileSync(new URL('../../src/AssignmentIntake.jsx', import.meta.url), 'utf8');
const intakeBase = readFileSync(new URL('../../src/AssignmentIntakeBase.jsx', import.meta.url), 'utf8');

test('salvageable V5 assignments open their saved Repair Center immediately', () => {
  assert.match(intakeWrapper, /saveIncompleteAssignmentDraft/);
  assert.match(intakeWrapper, /setRepairDraftId\(saved\.id\)/,
    'after salvage, the saved incomplete draft must be the open Repair Center instead of making the teacher hunt for it');
  assert.match(intakeWrapper, /salvaged:\s*true/);
});

/*
 * Salvage is a THIRD outcome, and the distinction is the whole point.
 *
 * It is not a rejection: the draft is saved and its Repair Center is open, so
 * the hard-rejection panel would tell the teacher their work was thrown away.
 * But it is not `ok` either. The base intake treats `ok` as publishable and
 * answers it with "Review the details and publish from Preflight" — naming a
 * screen that is not open — and takes the branch that never calls setFailure,
 * which is what renders the blocking-error list the teacher repairs from. So
 * `ok: true` buys a correct panel at the cost of a false toast and a lost list.
 *
 * `salvaged` is the seam instead, and it has to be read BEFORE `ok` or the
 * ok-branch wins and nothing above changes.
 */
test('salvaged assignments are their own intake outcome, not a success and not a rejection', () => {
  assert.match(intakeWrapper, /salvaged:\s*true/,
    'the salvage branch must mark its result as salvaged so the base intake can tell it apart');
  assert.doesNotMatch(
    intakeWrapper.slice(intakeWrapper.indexOf('const handleJsonReady'), intakeWrapper.indexOf('const openDraftForReview')),
    /\bok:\s*true\b/,
    'salvage must not claim the import succeeded: the base intake answers ok with a publish-from-Preflight toast and skips the error list',
  );
  assert.match(intakeWrapper, /Repair Center is open below|Repair Center/i);
});

test('the base intake reads salvaged before ok, and keeps the blocking-error list', () => {
  const salvagedAt = intakeBase.indexOf('result?.salvaged');
  const okAt = intakeBase.indexOf('result?.ok');
  assert.notEqual(salvagedAt, -1, 'AssignmentIntakeBase must branch on a salvaged result');
  assert.notEqual(okAt, -1, 'AssignmentIntakeBase must still branch on ok');
  assert.ok(
    salvagedAt < okAt,
    'the salvaged branch must be checked before the ok branch, or a salvaged result that is also ok takes the success path and the teacher is sent to a Preflight that is not open',
  );

  const branch = intakeBase.slice(salvagedAt, okAt);
  // Anchored to the start of a line: a bare /setFailure\(/ also matches
  // `void 0 && setFailure(` and any other form that never runs, which would let
  // the error list be disabled with this contract still green.
  assert.match(branch, /\n\s*setFailure\(\{/,
    'the salvaged branch must actually call setFailure; that panel is what renders the blocking-error list the teacher repairs from');
  assert.match(branch, /result\??\.errors/,
    'the panel must be given the real diagnostics from this import, not a hardcoded or empty list');
  assert.match(branch, /salvaged:\s*true/,
    'the rendered panel must know it is a salvage, or it reads as a rejection');
  assert.doesNotMatch(branch, /toastSuccess/,
    'a salvaged assignment is not publishable, so it must not fire the success toast');
});

test('the salvage panel says the work was kept rather than rejected', () => {
  assert.match(intakeBase, /Saved for repair/,
    'the salvaged panel needs its own heading; reusing "This assignment needs attention" reads as a rejection of work that was actually saved');
  assert.match(intakeBase, /Nothing was discarded/,
    'the panel must say plainly that the assignment was kept');
});

test('hard failures remain available for malformed or unsupported input', () => {
  assert.match(intakeBase, /setFailure\(/);
  assert.match(intakeBase, /MathMaster could not read this assignment/);
});

console.log('pr152AcceptanceIntakeFlow.test.mjs: all assertions passed');