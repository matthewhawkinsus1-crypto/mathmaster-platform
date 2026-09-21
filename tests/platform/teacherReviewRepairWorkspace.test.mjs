import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseUnifiedRepairUpload } from '../../src/platform/preflight/libraryAssignmentRepairWorkspace.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const panel = read('src/components/teacher/TeacherQuestionReviewPanel.jsx');
const auth = read('src/auth/authService.js');

const batch = (overrides = {}) => JSON.stringify({
  repairPacketVersion: 1,
  assignmentId: 'assignment-1',
  baseRevision: 4,
  replacements: [{
    questionId: 'q1',
    question: { questionId: 'q1', type: 'multipleChoice', prompt: 'Corrected', choices: ['1', '2'], answer: '2' },
  }],
  platformIssues: [],
  unclearIssues: [],
  ...overrides,
});

test('unified repair parser rejects wrong assignment, stale revision, and nonflagged question ids', () => {
  const options = { assignmentId: 'assignment-1', baseRevision: 4, allowedQuestionIds: ['q1'] };
  assert.throws(() => parseUnifiedRepairUpload(batch({ assignmentId: 'other' }), options), /not "assignment-1"|for assignment/i);
  assert.throws(() => parseUnifiedRepairUpload(batch({ baseRevision: 3 }), options), /revision 3|revision 4/i);
  assert.throws(() => parseUnifiedRepairUpload(batch({ replacements: [{ questionId: 'q2', question: { questionId: 'q2', prompt: 'No' } }] }), options), /not part of this repair request/i);
});

test('paste and upload enter the same parser and stager, without the queued handoff', () => {
  const stageStart = panel.indexOf('const stageRepairText = async');
  const stageEnd = panel.indexOf('const uploadRepairFromTeacherReview', stageStart);
  const stage = panel.slice(stageStart, stageEnd);
  assert.match(stage, /parseUnifiedRepairUpload\(rawText/);
  assert.match(stage, /stageBatchQuestionRepairImport\(\{/);
  assert.match(panel, /onClick=\{\(\) => stageRepairText\(repairJson\)\}/);
  assert.match(panel, /await stageRepairText\(rawText\)/);
  assert.doesNotMatch(panel, /queuePendingRepairUpload/);
});

test('a staged candidate immediately uses the canonical sandboxed student renderer', () => {
  const sandboxStart = panel.indexOf('export function TeacherRepairCandidateSandbox');
  const sandboxEnd = panel.indexOf('export default function TeacherQuestionReviewPanel', sandboxStart);
  const sandbox = panel.slice(sandboxStart, sandboxEnd);
  assert.match(sandbox, /<QuestionEngine/);
  assert.match(sandbox, /draftKey=\{null\}/);
  assert.match(sandbox, /onResponseCheckpoint=\{null\}/);
  assert.match(sandbox, /onSpotlightFrame=\{null\}/);
  assert.match(sandbox, /onSaveScratchpad=\{async \(\) => null\}/);
  assert.match(panel, /proposedQuestion && activeOriginalQuestion[\s\S]*<TeacherRepairCandidateSandbox question=\{proposedQuestion\}/);
});

test('batch repairs cannot be applied until every replacement has been opened in Teacher Review', () => {
  assert.match(panel, /Reviewed \{reviewedRepairQuestionIdSet\.size\} of \{replacements\.length\}/);
  assert.match(panel, /onClick=\{\(\) => activateRepairQuestion\(id\)\}/);
  assert.match(panel, /const allReplacementsReviewed = replacements\.length > 0/);
  assert.match(panel, /!allReplacementsReviewed/);
  assert.match(panel, /Open each proposed correction above before applying this batch/);
});

test('Preflight gates Apply and report-only findings never become replacements', () => {
  assert.match(panel, /if \(staged\.responseKind === 'reportOnly'\)[\s\S]*no question was rewritten/i);
  assert.match(panel, /if \(!staged\.canCommit\)[\s\S]*Preflight blocker/);
  assert.match(panel, /disabled=\{busy \|\| !stagedRepair\.canCommit \|\| !serverPreview\?\.planHash \|\| !replacements\.length \|\| !allReplacementsReviewed\}/);
});

test('platform and unclear reports are persisted even when the same AI response also contains replacements', () => {
  assert.match(panel, /const hasReportedIssues =/);
  assert.match(panel, /platformIssues: mergeIssueReports\(context\.platformIssues, staged\.platformIssues\)/);
  assert.match(panel, /unclearIssues: mergeIssueReports\(context\.unclearIssues, staged\.unclearIssues\)/);
  assert.match(panel, /saveAssignmentTeacherReviewContext\(assignmentId, stagedContext\)/);
});

test('server classification precedes Apply and fundamental changes are retire-and-replace, not blocked', () => {
  assert.match(panel, /previewTeacherQuestionRepair\(\{ assignmentId, baseRevision, replacements: nextReplacements \}\)/);
  assert.match(panel, /change\.commitBehavior === 'retireAndReplace'/);
  assert.match(panel, /preserve the historical question and student work, retire that flawed version/);
  assert.doesNotMatch(panel, /blocked the live rewrite/i);
});

test('Apply commits the previewed plan, refreshes, clears staging, and does not resolve flags', () => {
  const start = panel.indexOf('const applyCorrectedQuestion = async');
  const end = panel.indexOf('if (!assignmentId', start);
  const apply = panel.slice(start, end);
  assert.match(apply, /commitTeacherQuestionRepair\(\{[\s\S]*assignmentId,[\s\S]*baseRevision,[\s\S]*expectedPlanHash: serverPreview\.planHash,[\s\S]*replacements/);
  assert.match(apply, /const refreshedRecord = await reloadAssignment\(\)/);
  assert.match(apply, /setRepairJson\(''\)[\s\S]*setStagedRepair\(null\)[\s\S]*setServerPreview\(null\)/);
  assert.doesNotMatch(apply, /resolveTeacherReviewFlag/);
});

test('fundamental live repairs keep the saved replacement visible for teacher verification', () => {
  assert.match(panel, /replacementQuestionIds/);
  assert.match(panel, /setSavedReplacementPreviews\(savedReplacements\)/);
  assert.match(panel, /Saved corrected replacement · verify before resolving the flag/);
  assert.match(panel, /Historical <code>\{entry\.sourceQuestionId\}<\/code> → corrected <code>\{entry\.replacementQuestionId\}<\/code>/);
});

test('successful Apply marks teacher flags potentially addressed but never resolves them automatically', () => {
  const start = panel.indexOf('const applyCorrectedQuestion = async');
  const end = panel.indexOf('if (!assignmentId', start);
  const apply = panel.slice(start, end);
  assert.match(apply, /markTeacherFlagPotentiallyAddressed/);
  assert.match(apply, /pendingTeacherFlagIds/);
  assert.match(apply, /assignmentRevision: result\?\.assignmentRevision/);
  assert.doesNotMatch(apply, /resolveTeacherReviewFlag/);
});

test('teacher admin exposes the two server callable contracts', () => {
  assert.match(auth, /previewTeacherQuestionRepair: \(payload\) =>[\s\S]*callable\('previewTeacherQuestionRepair'\)\(payload\)/);
  assert.match(auth, /commitTeacherQuestionRepair: \(payload\) =>[\s\S]*callable\('commitTeacherQuestionRepair'\)\(payload\)/);
});