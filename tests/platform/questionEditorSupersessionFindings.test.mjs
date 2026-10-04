import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * A replaced question, in the REAL Assignment Question Editor, on a phone, an
 * iPad and a Chromebook.
 *
 * tests/browser/questionEditorSupersession.mjs opens the editor (wrapper and
 * base, as App.jsx mounts it) on a live assignment built from the certified
 * lesson and a real history-safe Honors swap, and records anything a teacher
 * would trip over:
 *
 *   SEES         the retired card is labelled REPLACED and names its
 *                replacement; "Show Question N" brings it into view and focus
 *   REFUSED      Include on it is explained in full where it was pressed and
 *                changes nothing (still excluded, counts unchanged)
 *   RESTORES     after the replacement is excluded, Include works and the save
 *                keeps every id, position and link
 *   CANNOT SAVE  a record holding two active versions is named on both cards
 *                and refused at Save
 *   SIDEWAYS     nothing pushes the page or the dialog sideways
 *   TAP          every control this feature added or changed is ≥ 44px tall
 *
 * Mutation-checked: without the Include guard every device reports REFUSED;
 * without the alert's scroll-into-view the phone reports the explanation
 * running under the footer.
 *
 * Re-record with:  npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
 *                  node tests/browser/questionEditorSupersession.mjs --write
 */
const audit = JSON.parse(readFileSync('tests/platform/fixtures/questionEditorSupersessionFindings.json', 'utf8'));

test('20. a teacher can see, and cannot accidentally undo, a replaced question on a phone, an iPad and a Chromebook', () => {
  const lines = audit.findings.map((finding) => `  [${finding.device}] ${finding.scenario} — ${finding.rule}: ${finding.detail}`);
  assert.deepEqual(audit.findings, [], `browser certification recorded findings:\n${lines.join('\n')}`);
});

test('the certification measured the three classroom devices and every check', () => {
  assert.equal(audit.harness, 'tests/browser/questionEditorSupersession.mjs');
  assert.deepEqual(audit.devices.map((device) => device.device), ['phone-390', 'ipad-820', 'chromebook-1366']);
  assert.deepEqual(audit.devices.map((device) => device.viewport), ['390x844', '820x1180', '1366x768']);
  assert.deepEqual(audit.checks, ['SEES', 'REFUSED', 'RESTORES', 'CANNOT SAVE', 'SIDEWAYS', 'TAP']);
});
