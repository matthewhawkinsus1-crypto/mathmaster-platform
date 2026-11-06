/*
 * A BARE `y = …` WRITTEN IN THE KEY'S OWN INPUT LETTER IS THE SAME MODEL
 * (F-Y-WITH-T, student walkthrough 2026-11-06, Algebra II Honors module 1,
 * part 1: L1 Day 2 CW 7, the shower, keyed V(t) = 1.8t).
 *
 * The model step took `y = 1.8x`, `V = 1.8t` and `1.8t`, and refused
 * `y = 1.8t`: a bare `y = …` is read with x as its input, so it read as no
 * model at all. y names the output whatever the input is called, so a rule in
 * the key's own input letter is now read as that rule. A different rule, or
 * another letter, is still refused. The fix is the model step's own comparison
 * (workflowGrading.mjs); answerEquivalence.mjs and answerUtils.mjs are not
 * touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { readComposedQuestion, activeStages } from '../../src/platform/workflow/questionWorkflow.js';
import { buildWorkflowAnswerState } from '../../src/platform/workflow/workflowAnswerState.js';
import { gradeComposedWorkflowCheck } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { composedWorkflowWork } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { gradeStage } from '../../functions/shared/toolMath/workflow/workflowGrading.mjs';

const DAY2 = compileAuthoringIntentV5(JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json', import.meta.url), 'utf8'))).package;
const SHOWER = DAY2.sections.find((section) => section.role === 'classwork').questions[6];

const equationMarks = (question, written) => {
  const responses = { equation: written };
  const check = gradeComposedWorkflowCheck(question, composedWorkflowWork(responses));
  const browser = check.parts.find((part) => part.id === 'equation')?.isCorrect;
  const { workflow, grading } = readComposedQuestion(question);
  const device = buildWorkflowAnswerState({ question, stages: activeStages(workflow, responses), responses, grading }).parts.find((part) => part.id === 'equation')?.isCorrect;
  assert.equal(browser, device, `${written}: the browser's Check and the device agree`);
  return browser;
};

test('L1 Day 2 CW 7: y = 1.8t is the model V(t) = 1.8t, as y = 1.8x, V = 1.8t and 1.8t always were', () => {
  assert.match(SHOWER.prompt, /shower head/);
  assert.equal(readComposedQuestion(SHOWER).grading.equation, 'V(t)=1.8t', 'the key');
  ['y = 1.8t', 'y=1.8t', 'y=1.8\\cdot t', 'y=t\\cdot1.8', 'V(t)=1.8t', 'V = 1.8t', '1.8t', 'y = 1.8x', 'f(t)=1.8t']
    .forEach((written) => assert.equal(equationMarks(SHOWER, written), true, written));
});

test('a different rule or another letter after a bare y is still refused', () => {
  ['y = 1.8t + 1', 'y = 2t', 'y = 1.8n', 'y = 1.8t + x', 't = 1.8y', 'x = 1.8t', 'y = 1.8', 'y = 1.8y']
    .forEach((written) => assert.notEqual(equationMarks(SHOWER, written), true, written));
});

test('only where the step takes an equivalent function rule, and only for the key\'s own input letter', () => {
  const rule = { id: 'equation', kind: 'equationInput', acceptEquivalentFunctionRule: true };
  const solved = { id: 'equation', kind: 'equationInput' };
  const marks = (stage, key, written) => gradeStage({ stage, rule: key, responses: { equation: written }, stages: [stage] }).isCorrect;
  assert.equal(marks(rule, 'C(n)=4n+3', 'y=4n+3'), true);
  assert.equal(marks(rule, 'C(n)=4n+3', 'y=4t+3'), false, 'not the key\'s letter');
  // An equation step that is not a function rule keeps its left side as part of the answer.
  assert.equal(marks(solved, 'C(n)=4n+3', 'y=4n+3'), false);
  // A key in x already took y = …; nothing about it moves.
  assert.equal(marks(rule, 'f(x)=2x+1', 'y=2x+1'), true);
  assert.equal(marks(rule, 'f(x)=2x+1', 'y=2t+1'), false);
});
