// COMBINING LIKE TERMS IS STUDENT-DRIVEN — NOW AS A SIMPLIFY PART.
//
// Combine like terms was its own button; student push Q made it one kind of
// part of the one Simplify control. The behaviours this file protects hold,
// re-anchored to where they now live: like terms are found from the math
// tree, the student types the one term they combine to, the platform never
// supplies the coefficient, the terms are reachable by keyboard, the work is
// draft-backed and undone one decision at a time, and a commit is recorded
// as a combine-like-terms step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { commitSimplifyPart, detectSimplifyParts } from '../../src/platform/algebra/simplify/simplifyEngine.js';
import { chooseSimplifyPart, openSimplify, setSimplifyAnswer, undoSimplify } from '../../src/platform/algebra/simplify/simplifyState.js';

const coreSource = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));
const termRowSource = executableSource(componentSource('src/AlgebraTermRow.jsx'));
const engineSource = executableSource(componentSource('src/platform/algebra/simplify/simplifyEngine.js'));
const panelSource = executableSource(componentSource('src/platform/algebra/simplify/SimplifyPanel.jsx'));
const regions = [
  { key: 'left', label: 'left side', expression: '3 * x + 5 + 8 * x', variable: 'x' },
  { key: 'right', label: 'right side', expression: '27', variable: 'x' },
];

test('Step Algebra offers a student-driven combine-like-terms part when like terms are present', () => {
  assert.match(engineSource, /findLikeTermGroups\(region\.expression\)/);
  const [part] = detectSimplifyParts(regions);
  assert.equal(part.kind, 'likeTerms');
  assert.deepEqual(part.termIndices, [0, 2]);
  assert.equal(detectSimplifyParts([{ ...regions[0], expression: '3 * x + 5' }]).length, 0, 'no like terms, no part');
  assert.match(coreSource, /detectSimplifyParts\(simplifyRegions\)/);
});

test('the platform does not generate the combined coefficient for the student', () => {
  const [part] = detectSimplifyParts(regions);
  assert.ok(!`${part.latex} ${part.name}`.includes('11'), 'the sum is never shown');
  assert.equal(commitSimplifyPart(regions, part.id, { answer: '' }).reason, 'empty');
  assert.equal(commitSimplifyPart(regions, part.id, { answer: '3x + 8x' }).reason, 'notSingleTerm');
  assert.equal(commitSimplifyPart(regions, part.id, { answer: '10x' }).reason, 'notEqual');
  assert.equal(commitSimplifyPart(regions, part.id, { answer: '11x' }).ok, true);
  assert.doesNotMatch(coreSource + engineSource + panelSource, /autoCombineLikeTerms|suggestCombinedCoefficient|bestLikeTerm/i);
});

test('students reach the parts by keyboard, and may tap the terms themselves', () => {
  assert.match(panelSource, /role="toolbar"/);
  assert.match(panelSource, /tabIndex=\{index === rovingIndex \? 0 : -1\}/);
  assert.match(coreSource, /interactionLabel="choose this part to simplify"/);
  assert.match(termRowSource, /onKeyDown/);
  assert.match(termRowSource, /aria-pressed/);
});

test('Simplify is draft-backed and participates in universal Undo before committed history', () => {
  const draft = region(coreSource, 'writeQuestionDraft(localDraftKey, {', '});', 'draft write');
  assert.match(draft, /simplifyTool,/);
  const undo = region(coreSource, 'useEffect(() => {\n    onUndoStateChange?.({', '  const triggerShake', 'undo chain');
  const branch = undo.indexOf('} else if (simplifyTool) {');
  assert.ok(branch > 0 && branch < undo.indexOf('} else if (committedHistory.length) {'));
  assert.match(undo.slice(branch, branch + 400), /simplifyHasDecisions\(current\) \? undoSimplify\(current\) : null/);
  // One decision at a time: the typed text, then the part chosen.
  let state = chooseSimplifyPart(openSimplify('k'), 'left:likeTerms:0.2');
  state = setSimplifyAnswer(setSimplifyAnswer(state, '1'), '11x');
  state = undoSimplify(state);
  assert.equal(state.answer, '');
  assert.equal(state.partId, 'left:likeTerms:0.2');
  assert.equal(undoSimplify(state).partId, null);
});

test('a completed like-term combination is recorded as an algebra step and remains undoable', () => {
  const [part] = detectSimplifyParts(regions);
  assert.equal(commitSimplifyPart(regions, part.id, { answer: '11x' }).step.kind, 'combine-like-terms');
  const commit = region(coreSource, 'const commitSimplifyResult = async', '\n  };', 'Simplify commit');
  assert.match(commit, /pushCommittedEquation\(beforeEquation[,)]/);
  assert.ok(commit.indexOf('pushCommittedEquation(beforeEquation') < commit.indexOf('setEquation(nextEquation)'));
  assert.match(commit, /persistStudentRewrite\(beforeEquation, nextEquation, \[result\.region\], \{ kind: result\.step\.kind, label \}\)/);
});

test('the answer field receives focus as soon as a part is chosen', () => {
  assert.match(panelSource, /else if \(partNeedsAnswer\(part\)\) setAnswerFocus\(\(signal\) => signal \+ 1\);/);
  assert.match(panelSource, /focusSignal=\{answerFocus\}/);
});

test('pressing Enter in the answer field checks the combination', () => {
  assert.match(panelSource, /onSubmit=\{commitPart\}/);
});

test('inline expression mode makes terms interactive only after the student opens Simplify', () => {
  const side = region(coreSource, 'const renderSide = (side, cancellationModel = null) => {', 'const inner = terms ?', 'renderSide');
  assert.match(side, /if \(inlineExpressionTools && simplifyTool && !pendingMove && terms\?\.length\)/);
  assert.match(side, /onTermClick=\{\(index\) => chooseSimplifyFromTerm\(side, index\)\}/);
  assert.match(side, /interactiveIndices=\{highlightedTermIndices\(simplifyParts, side\)\}/);
  assert.doesNotMatch(coreSource, /useEffect\([\s\S]{0,250}chooseSimplifyPart\(/);
});

test('choosing a term never changes it; only the student\'s checked work commits', () => {
  const choose = region(coreSource, 'const chooseSimplifyFromTerm = (side, termIndex) => {', '\n  };', 'choose');
  assert.match(choose, /chooseSimplifyPart\(current, next\.id\)/);
  assert.doesNotMatch(choose, /setEquation\(/);
});

test('inline systems mode keeps distribution controls on the equation instead of a second work panel', () => {
  assert.match(coreSource, /renderInlineDistributionSide/);
  assert.match(coreSource, /algebra-inline-factor-token/);
  assert.match(coreSource, /algebra-inline-distribution-target/);
  assert.match(coreSource, /distributionState && !inlineExpressionTools/);
  // Without inline tools the board stays plain; only the panel lists the parts.
  assert.match(coreSource, /boardHighlights=\{inlineExpressionTools\}/);
});
