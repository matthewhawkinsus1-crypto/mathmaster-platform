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
  // Anchored to the like-term handler: it records the PRE-commit equation
  // (a second argument describes the step for the work history).
  const likeTermsCommit = coreSource.slice(coreSource.indexOf('const checkLikeTerms = async'), coreSource.indexOf('const checkInlineRewrite = async'));
  assert.match(likeTermsCommit, /pushCommittedEquation\(beforeEquation[,)]/);
  assert.ok(likeTermsCommit.indexOf('pushCommittedEquation(beforeEquation') < likeTermsCommit.indexOf('setEquation(nextEquation)'));
  assert.match(coreSource, /setEquation\(nextEquation\)/);
});


test('the combined-term field receives focus as soon as a valid like-term pair is selected', () => {
  assert.match(coreSource, /if \(!likeTermsOpen \|\| !currentLikeTermSelection\?\.valid\) return/);
  assert.match(coreSource, /setLikeTermsFocusSignal\(\(signal\) => signal \+ 1\)/);
  assert.match(coreSource, /focusSignal=\{likeTermsFocusSignal\}/);
});

test('pressing Enter in the combined-term field checks the combination', () => {
  assert.match(coreSource, /onSubmit=\{checkLikeTerms\}/);
});


test('inline expression mode makes terms interactive only after the student activates a mode', () => {
  assert.match(coreSource, /inlineExpressionTools && rewriteOpen && !pendingMove/);
  assert.match(coreSource, /selectInlineRewriteTerm\(side, index\)/);
  assert.match(coreSource, /inlineExpressionTools && likeTermsOpen && !pendingMove/);
  assert.match(coreSource, /toggleInlineLikeTerm\(side, index\)/);
  assert.doesNotMatch(coreSource, /useEffect\([\s\S]{0,250}setInlineRewriteSelection\(\{ side: ['"]left['"]/);
});

test('inline rewrite never changes a clicked token until the student supplies an equivalent replacement', () => {
  const start = coreSource.indexOf('const checkInlineRewrite = async');
  const end = coreSource.indexOf('const checkStudentRewrite = async');
  const region = coreSource.slice(start, end);
  assert.match(region, /expressionsEquivalent\(term\.text, replacement, equation\.variable\)/);
  assert.match(region, /replaceSingleAdditiveTerm/);
  assert.match(region, /kind: 'inline-term-rewrite'/);
  assert.match(region, /setEquation\(nextEquation\)/);
  const selectStart = coreSource.indexOf('const selectInlineRewriteTerm');
  const selectEnd = coreSource.indexOf('const openRewriteTool', selectStart);
  const selectRegion = coreSource.slice(selectStart, selectEnd);
  assert.match(selectRegion, /setInlineRewriteSelection\(\{ side, index \}\)/);
  assert.doesNotMatch(selectRegion, /setEquation\(/);
});

test('inline systems mode keeps distribution controls on the equation instead of a second work panel', () => {
  assert.match(coreSource, /renderInlineDistributionSide/);
  assert.match(coreSource, /algebra-inline-factor-token/);
  assert.match(coreSource, /algebra-inline-distribution-target/);
  assert.match(coreSource, /distributionState && !inlineExpressionTools/);
  assert.match(coreSource, /likeTermsOpen && !inlineExpressionTools/);
  assert.match(coreSource, /rewriteOpen && !inlineExpressionTools/);
});
