import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyContentQuestionChange } from '../../functions/shared/assignmentContentUpgradePolicy.mjs';

test('wider regression tolerances with clarified prompt are a grading expansion', () => {
  const before = {
    questionId: 'q', type: 'dataModelingLab', mode: 'lineFit',
    prompt: 'Use technology to determine the least-squares model.',
    points: [{x:15,y:37},{x:25,y:55},{x:45,y:97},{x:60,y:85},{x:100,y:100}],
  };
  const after = {
    ...before,
    prompt: 'Create a reasonable visual linear model; close models are accepted.',
    slopeTolerance: 0.2,
    interceptTolerance: 7,
  };
  const result = classifyContentQuestionChange(before, after);
  assert.equal(result.classification, 'gradingExpansion');
  assert.equal(result.safe, true);
});

test('narrower effective tolerance is fundamental and unsafe', () => {
  const before = { questionId: 'q', type: 'dataModelingLab', mode: 'lineFit', points: [{x:0,y:0},{x:10,y:100}] };
  const after = { ...before, slopeTolerance: 0.5 };
  const result = classifyContentQuestionChange(before, after);
  assert.equal(result.classification, 'fundamental');
  assert.equal(result.safe, false);
});

test('prompt-only clarification is allowed when scored structure is stable', () => {
  const before = { questionId: 'q', type: 'relationshipModel', prompt: 'Identify x, y, and association.', correctIndependentId: 'x', correctDependentId: 'y' };
  const after = { ...before, prompt: 'Identify the independent and dependent quantities.' };
  assert.equal(classifyContentQuestionChange(before, after).classification, 'clarificationOnly');
});

test('safe response-control repair delegates to existing policy', () => {
  const before = { questionId: 'q', type: 'multiAnswer', answerFields: [{id:'kind',answer:'interpolation',inputProfile:'text'}] };
  const after = { questionId: 'q', type: 'multiAnswer', answerFields: [{id:'kind',answer:'interpolation',inputProfile:'choice',type:'choice',options:['interpolation','extrapolation']}] };
  assert.equal(classifyContentQuestionChange(before, after).classification, 'safeResponseControl');
});

test('answer-field count change is fundamental', () => {
  const before = { questionId: 'q', type: 'multiAnswer', answerFields: [{ id: 'a', answer: '1' }] };
  const after = { ...before, answerFields: [...before.answerFields, { id: 'b', answer: '2' }] };
  assert.equal(classifyContentQuestionChange(before, after).classification, 'fundamental');
});
