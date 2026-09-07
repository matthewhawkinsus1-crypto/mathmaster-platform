import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/components/teacher/IncompleteAssignmentRepairCenter.jsx', import.meta.url),
  'utf8',
);

const regionBetween = (startNeedle, endNeedle) => {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `could not find ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `could not find ${endNeedle} after ${startNeedle}`);
  return source.slice(start, end);
};

test('question history restore is staged through the existing repair/revalidation path', () => {
  assert.match(
    source,
    /prepareQuestionRevisionRestore/,
    'the Repair Center must use the history contract instead of reconstructing old question JSON itself',
  );

  const handler = regionBetween('const stageHistoryRestore', '\n  const ');
  assert.match(handler, /prepareQuestionRevisionRestore\(/);
  assert.match(handler, /stageSingleQuestionRepairImport\(/, 'history restore must get the same full revalidation as a pasted single-question repair');
  assert.match(handler, /replacementQuestion:\s*restore\.restoredQuestion/);
  assert.match(handler, /setStagedImport\(/, 'restore must be staged for before/after review before it can be committed');
  assert.doesNotMatch(handler, /commitIncompleteAssignmentDraftRepair\(/, 'the history button must not bypass staging and commit directly');
});

test('the focused question shows only its own recorded versions with an explicit restore action', () => {
  const historyRegion = regionBetween('Revision history', 'Outside-AI repair handoff');
  assert.match(historyRegion, /currentDraft\?\.repairHistory|currentDraft\.repairHistory/);
  assert.match(historyRegion, /actualFocusedQuestionId|focusedRow\.questionId/);
  assert.match(historyRegion, /Stage restore|Restore this version/);
  assert.match(historyRegion, /stageHistoryRestore\(/);
  assert.match(historyRegion, /fromRevision|toRevision/, 'the teacher should see which recorded revision the version came from');
});

console.log('assignmentRepairHistoryUi.test.mjs: all assertions passed');
