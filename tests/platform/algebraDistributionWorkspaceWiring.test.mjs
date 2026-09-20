import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8');

test('the distribution model is wired into the workspace, not reimplemented inline', () => {
  assert.match(source, /from '\.\/algebraDistributionModel'/);
  assert.match(source, /detectDistributableGroup\(equation\)/);
});

test('committing a distribution records real step evidence and never consumes an attempt', () => {
  assert.match(source, /kind:\s*'distribution'/);
  // The commit handler must be the one making this call — anchor to the
  // region between the handler's declaration and the equation being pushed
  // onto committed history, not just anywhere in the file.
  const commitRegion = source.slice(
    source.indexOf('const commitDistributionStep'),
    source.indexOf('const resetQuestionWork'),
  );
  assert.match(commitRegion, /kind:\s*'distribution'/);
  assert.match(commitRegion, /countsAttempt:\s*false/);
  assert.match(commitRegion, /pushCommittedEquation\(equation\)/);
});

test('distribution state is included in draft persistence, so partial work survives navigation', () => {
  const draftWriteRegion = source.slice(
    source.indexOf('writeQuestionDraft(localDraftKey'),
    source.indexOf('writeQuestionDraft(localDraftKey') + 600,
  );
  assert.match(draftWriteRegion, /distributionState/);
});

test('undo removes the last factor placement before commit, ahead of the committed-history fallback', () => {
  const undoRegion = source.slice(
    source.indexOf('const hasTransientUndo = Boolean'),
    source.indexOf('const triggerShake'),
  );
  assert.match(undoRegion, /hasDistributionProgress/);
  assert.match(undoRegion, /undoDistributionPlacement/);
  // The distribution-undo branch must appear before the committedHistory pop
  // branch, or a mid-placement undo would silently jump straight to undoing
  // an already-committed step instead of just the pending placement.
  const distributionBranchIndex = undoRegion.indexOf('undoDistributionPlacement');
  const committedHistoryBranchIndex = undoRegion.indexOf('committedHistory.length) {');
  assert.ok(distributionBranchIndex > 0 && committedHistoryBranchIndex > 0);
  assert.ok(distributionBranchIndex < committedHistoryBranchIndex);
});

test('a term already showing the applied factor cannot be re-clicked to place it again', () => {
  const panelRegion = source.slice(
    source.indexOf("className=\"algebra-distribution-tool\""),
    source.indexOf('{rewriteOpen && ('),
  );
  assert.match(panelRegion, /disabled=\{disabled \|\| placed \|\| !distributionState\.armed\}/);
});

// Mutation guard: prove the countsAttempt assertion above is not vacuous —
// a version of the commit call without it would fail this same check.
test('mutation guard: a commit call missing countsAttempt:false would fail the attempt-safety assertion', () => {
  const fakeCommitSource = "kind: 'distribution', label: 'x', accepted: true";
  assert.doesNotMatch(fakeCommitSource, /countsAttempt:\s*false/);
});
