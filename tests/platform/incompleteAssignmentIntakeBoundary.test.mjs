import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const intake = fs.readFileSync(path.join(repoRoot, 'src', 'AssignmentIntake.jsx'), 'utf8');

test('Assignment Intake wraps the existing creator and salvages only parseable failed V5 results', () => {
  assert.match(intake, /AssignmentIntakeBase/);
  assert.match(intake, /canSalvageV5IntakeResult/);
  assert.match(intake, /saveIncompleteAssignmentDraft/);
  assert.match(intake, /Incomplete Assignments/);
  assert.match(intake, /onJsonReady/);
});

/*
 * SALVAGING A BROKEN IMPORT IS NOT THE SAME AS READING IT SUCCESSFULLY.
 *
 * App's handleAssignmentJsonReady still returns before openAssignmentPreflight()
 * when a result is not ok (task 2A changes that). So while the wrapper saves a
 * draft, no Assignment Review is on screen. If the wrapper then reports ok, the
 * creator fires "Assignment read - Review the details and publish from
 * Preflight" for a Preflight that was never opened, and skips setFailure(), so
 * the teacher loses the list of blocking questions they need in order to repair
 * anything. Two toasts, one of them instructing work that cannot be done.
 *
 * The saved draft is additive; the import still failed. This asserts that the
 * salvage branch says so.
 */
test('salvaging a draft does not report the failed import as successful', () => {
  const start = intake.indexOf('const handleJsonReady');
  assert.notEqual(start, -1, 'handleJsonReady not found in AssignmentIntake.jsx');
  const end = intake.indexOf('const openDraftForReview', start);
  assert.notEqual(end, -1, 'handleJsonReady is unterminated');
  const salvage = intake.slice(start, end);

  assert.match(salvage, /saveIncompleteAssignmentDraft\(/, 'the salvage branch must still save the draft');
  assert.match(salvage, /incompleteDraftId: saved\.id/, 'the saved draft id must reach the caller');
  assert.doesNotMatch(
    salvage,
    /\bok: true\b/,
    'salvage must not report a failed import as successful: Preflight is not open, and claiming success hides the blocking-error list the teacher repairs from',
  );
});

console.log('incompleteAssignmentIntakeBoundary.test.mjs: all assertions passed');