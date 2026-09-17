import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';

// src/App.jsx is .jsx: nothing here can import and unit-test its component
// body directly (see classPointsAuthorizationOrder.test.mjs for the same
// constraint on functions/index.js). These are source contracts proving the
// STUDENT runtime asks about a Practice Pass at every required-navigation
// site the review named, and that Teacher Preview / live teaching never do.

const source = fs.readFileSync('src/App.jsx', 'utf8');

const startAssignmentBody = executableSource(region(
  source,
  'const startAssignment = (assignmentId, requestedQuestionIndex = 0, options = {}) => {',
  'const startTeacherPreview = (assignmentId) => {',
  'startAssignment',
));

const teacherPreviewEntryBody = executableSource(region(
  source,
  'const startTeacherPreview = (assignmentId) => {',
  'const resumeLiveTeaching = () => {',
  'startTeacherPreview + teachAssignmentLive',
));

const workspaceHeadBody = executableSource(region(
  source,
  'const renderAssignmentWorkspace = (preview = false) => {',
  'const currentRecord = normalizeQuestionRecord(workingTracker?.[currentQuestionIndex]);',
  'renderAssignmentWorkspace (head)',
));

test('startAssignment refuses to reopen an explicitly-requested waived Practice section', () => {
  assert.match(startAssignmentBody, /hasPracticePassFor\(assignmentId\)/);
  assert.match(startAssignmentBody, /scopedSectionKey === 'practice' && hasPracticePass/);
  assert.match(startAssignmentBody, /Practice is already excused with your Practice Pass/);
});

test('startAssignment removes Practice from required navigation for a real redeemed student', () => {
  assert.match(startAssignmentBody, /currentContent\.entries\.filter\(\(entry\) => entry\.logicalRole !== 'practice'\)/);
  // The resolved start index must be re-checked against the (possibly
  // Practice-filtered) included set, not accepted from the full projection
  // unconditionally -- otherwise a resumed index could still land on a
  // waived Practice question.
  assert.match(startAssignmentBody, /!includedQuestionIndices\.includes\(safeQuestionIndex\)/);
});

test('startAssignment never applies the Practice Pass filter to a Test Cycle stage or post-deadline voluntary Practice Mode', () => {
  const cycleStageFilterIndex = startAssignmentBody.indexOf("cycleStage\n      ? currentContent.entries.filter((entry) => entry.logicalRole === cycleStage)");
  assert.ok(cycleStageFilterIndex >= 0, 'expected the cycleStage branch to remain the first branch of the stageEntries ternary');
  assert.match(startAssignmentBody, /!lifecycle\.isPracticeOnly\s*&&\s*hasPracticePassFor\(assignmentId\)/);
});

test('Teacher Preview and live teaching entry points never read a student Practice Pass redemption', () => {
  assert.doesNotMatch(teacherPreviewEntryBody, /hasPracticePassFor/);
  assert.doesNotMatch(teacherPreviewEntryBody, /studentAssignmentIndicesWithPracticePass/);
  // Both still use the full current-content projection, unfiltered.
  assert.match(teacherPreviewEntryBody, /getCurrentContentQuestionIndices\(assignmentData\)/);
});

test('renderAssignmentWorkspace derives hasPracticePass only for a real student, never for preview, never in post-deadline voluntary Practice Mode', () => {
  assert.match(workspaceHeadBody, /const hasPracticePass = !preview && !lifecycle\.isPracticeOnly && hasPracticePassFor\(assignment\.id\)/);
});

test('renderAssignmentWorkspace filters Practice out of the workspace question set when a pass is held', () => {
  assert.match(workspaceHeadBody, /hasPracticePass\s*\n\s*\? currentContent\.entries\.filter\(\(entry\) => entry\.logicalRole !== 'practice'\)/);
});

test('the practice-progress readout is passed the same hasPracticePass flag the workspace derived', () => {
  assert.match(source, /calculatePracticeProgress\(workingTracker, assignment, \{ hasPracticePass \}\)/);
});

test('live presence and the active-question correction effect read the practice-pass-aware index helper, not the raw current-content one', () => {
  const presenceRegion = executableSource(region(
    source,
    "// Live class monitoring. Presence stays ephemeral: one tiny document per",
    'const payload = {',
    'live presence effect',
  ));
  assert.match(presenceRegion, /studentAssignmentIndicesWithPracticePass\(\{\s*\n\s*assignment: activeAssignmentData,\s*\n\s*hasPracticePass: !isPracticeMode && hasPracticePassFor\(activeAssignmentId\),/);

  const correctionRegion = executableSource(region(
    source,
    'useEffect(() => {\n    if (!activeQuestions.length) return;',
    '// A question change should feel like changing pages',
    'active-question correction effect',
  ));
  assert.match(correctionRegion, /hasPracticePass: !isTeacherPreview\s*\n\s*&& !isPracticeMode\s*\n\s*&& hasPracticePassFor\(activeAssignmentId\)/);
  assert.match(correctionRegion, /studentClassPoints\.redemptionsByAssignment/);
});
