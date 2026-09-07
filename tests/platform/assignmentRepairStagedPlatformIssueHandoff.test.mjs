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

test('outside-AI platform reports have a handoff action in the staged platform-issue section itself', () => {
  const stagedPlatformRegion = regionBetween(
    'list(stagedImport.platformIssues).length > 0',
    'Apply staged repair',
  );

  assert.match(
    stagedPlatformRegion,
    /stagedImport\.platformIssues\.map\(/,
    'each reported platform issue needs its own action; joining them into summary text leaves the teacher at a dead end',
  );
  assert.match(stagedPlatformRegion, /Copy platform bug handoff/);
  assert.match(stagedPlatformRegion, /copyPlatformBugHandoff\(/);
  assert.match(stagedPlatformRegion, /issue\.questionId/);
  assert.match(stagedPlatformRegion, /issue\.suspectedComponent/);
});

console.log('assignmentRepairStagedPlatformIssueHandoff.test.mjs: all assertions passed');
