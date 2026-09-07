import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/components/teacher/IncompleteAssignmentRepairCenter.jsx', import.meta.url), 'utf8');

test('Repair Center exposes Step 6 triage instead of one undifferentiated blocker list', () => {
  assert.match(source, /buildAssignmentRepairTriage/);
  assert.match(source, /triageDiagnostic/);
  assert.match(source, /isDiagnosticOverridden/);
  assert.match(source, /Technical blocker/);
  assert.match(source, /Quality blocker/);
  assert.match(source, /Warning/);
  assert.match(source, /Platform issue/);
  assert.match(source, /technicalBlockers/);
  assert.match(source, /qualityBlockers/);
  assert.match(source, /platformIssues/);
});

test('quality false-positive override is teacher-owned, reasoned, and persisted without rewriting a question', () => {
  assert.match(source, /recordTeacherDiagnosticOverride/);
  assert.match(source, /Override false positive/);
  assert.match(source, /overrideReason/);
  assert.match(source, /teacherOverrideEligible/);
  assert.match(source, /persistTeacherContext\(/);
  assert.match(source, /isDiagnosticOverridden\(/);
  assert.match(source, /Override saved/);
});

test('Repair All Safe Technical Issues persists the deterministic repair as a new revision', () => {
  assert.match(source, /repairAllSafeTechnicalIssues/);
  assert.match(source, /Repair All Safe Technical Issues/);
  assert.match(source, /commitIncompleteAssignmentDraftRepair\(/);
  assert.match(source, /committedRevision:\s*revision\s*\+\s*1/);
  assert.match(source, /remainingUnsafePaths/);
  assert.match(source, /mathematics is unchanged/i);
});

test('platform issues produce a compact tool-bug handoff and are never rewritten as question repairs', () => {
  assert.match(source, /buildPlatformBugReproductionFixture/);
  assert.match(source, /Copy platform bug handoff/);
  assert.match(source, /Do not rewrite the question/);
  assert.match(source, /suspectedComponent/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /stagedImport\.platformIssues/);
});

console.log('assignmentRepairTriageUiWiring.test.mjs: all assertions passed');
