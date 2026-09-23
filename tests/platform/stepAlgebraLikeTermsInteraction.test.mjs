import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource } from './helpers/sourceContract.mjs';

const coreSource = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));
const termRowSource = executableSource(componentSource('src/AlgebraTermRow.jsx'));

test('Step Algebra offers a student-driven combine-like-terms interaction when like terms are present', () => {
  assert.match(coreSource, /findLikeTermGroups/);
  assert.match(coreSource, /Combine like terms/);
  assert.match(coreSource, /selectedLikeTermIndices/);
  assert.match(coreSource, /checkLikeTerms/);
});

test('the platform does not generate the combined coefficient for the student', () => {
  assert.match(coreSource, /enter the one term they combine to/i);
  assert.match(coreSource, /replacementIsSingleLikeTerm/);
  assert.match(coreSource, /expressionsEquivalent\(selection\.selectedExpression, replacement/);
  assert.doesNotMatch(coreSource, /autoCombineLikeTerms|suggestCombinedCoefficient|bestLikeTerm/i);
});

test('students may select the terms themselves with keyboard-accessible term targets', () => {
  assert.match(coreSource, /interactionLabel="select as a term to combine"/);
  assert.match(termRowSource, /onKeyDown/);
  assert.match(termRowSource, /aria-pressed/);
});

test('like-term interaction is draft-backed and participates in universal Undo before committed history', () => {
  assert.match(coreSource, /likeTermsOpen,/);
  assert.match(coreSource, /likeTermsSide,/);
  assert.match(coreSource, /selectedLikeTermIndices,/);
  assert.match(coreSource, /likeTermsAnswer,/);
  assert.match(coreSource, /hasLikeTermsEntry/);
  assert.match(coreSource, /setSelectedLikeTermIndices\(\(current\) => current\.slice\(0, -1\)\)/);
});

test('a completed like-term combination is recorded as an algebra step and remains undoable', () => {
  assert.match(coreSource, /kind: 'combine-like-terms'/);
  assert.match(coreSource, /pushCommittedEquation\(beforeEquation\)/);
  assert.match(coreSource, /setEquation\(nextEquation\)/);
});
