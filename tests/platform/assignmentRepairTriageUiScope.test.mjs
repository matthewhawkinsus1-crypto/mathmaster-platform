import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/components/teacher/IncompleteAssignmentRepairCenter.jsx', import.meta.url),
  'utf8',
);

/*
 * WHERE A STRING APPEARS DECIDES WHETHER IT MEANS ANYTHING.
 *
 * The Step 6 wiring contract matches these names anywhere in a 700-line file,
 * and both of them are already present for other reasons — which means the
 * behaviour they are supposed to guarantee can be removed with the contract
 * still green. These assertions are scoped to the code that has to do the work.
 */

const regionBetween = (startNeedle, endNeedle) => {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `could not find ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `could not find ${endNeedle} after ${startNeedle}`);
  return source.slice(start, end);
};

/*
 * An override removes a blocker from a live assignment. Written to component
 * state alone it survives until the teacher reloads, and then the blocker is
 * back with no record that anyone decided anything. persistTeacherContext is
 * referenced elsewhere in this file for flag verification, so the unscoped
 * assertion passes even when the override never reaches Firestore.
 */
test('the override handler persists through the review context, not just local state', () => {
  const handler = regionBetween('const overrideFalsePositive', '\n  const ');

  assert.match(handler, /recordTeacherDiagnosticOverride\(/, 'the override must go through the eligibility check');
  assert.match(handler, /persistTeacherContext\(/, 'an override written only to component state is lost on reload');
  assert.match(handler, /overrideReason/, 'the stored reason is the record of who decided and why');
});

/*
 * The whole point of triage is that a teacher can tell the three cases apart.
 * "Platform issue" also appears in the staged-import summary ("Platform issues
 * reported"), so the unscoped assertion stays green even if every finding is
 * labelled with one undifferentiated word.
 */
test('each triage class is named on the finding itself', () => {
  const findingRow = regionBetween('const triaged = triageDiagnostic(finding);', 'Copy platform bug handoff');

  for (const label of ['Platform issue', 'Technical blocker', 'Quality blocker', 'Warning']) {
    assert.match(
      findingRow,
      new RegExp(`'${label}'`),
      `the finding must be labelled "${label}"; a single blocker word is the undifferentiated list Step 6 replaces`,
    );
  }
  assert.match(findingRow, /isDiagnosticOverridden\(/, 'an overridden finding must be shown as overridden');
});

console.log('assignmentRepairTriageUiScope.test.mjs: all assertions passed');
