/*
 * DOES THE SERVER GRADE WHAT FOUR REGISTRY TOOLS REALLY SEND? (CI02, C2-58)
 *
 * Polynomial Workshop, Representation Bridge, Representation Match and Matrix
 * Lab are not Path tools, so the Path capture (toolResponseContracts.test.mjs)
 * never reached them. The responses below were not written by hand: each is
 * the structured tool response a real Chromium browser recorded with the
 * attempt, after a student who knew the answer completed the real tool in
 * QuestionEngine (tests/browser/captureRegistryToolResponses.mjs, against
 * tests/platform/fixtures/registryToolQuestions.mjs). The Path Tool Browser
 * Contract workflow recaptures them and fails if the committed fixture drifts.
 *
 * Here the server's grader reads each one: right work is right on the server,
 * as it was in the browser, and the same work with one answer changed is not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { REGISTRY_TOOL_QUESTIONS } from './fixtures/registryToolQuestions.mjs';

const CAPTURED = JSON.parse(await readFile(new URL('./fixtures/capturedRegistryToolResponses.json', import.meta.url), 'utf8'));
const TOOLS = ['matrixLab', 'polynomialWorkshop', 'representationBridge', 'representationMatch'];
const grade = (toolId, response) => gradeServerResponse({ question: REGISTRY_TOOL_QUESTIONS[toolId], response: JSON.parse(JSON.stringify(response)) });

/** The captured work with one answer changed, the way a student could get it wrong. */
const WRONG = {
  polynomialWorkshop: (work) => ({ ...work, q: '3' }),
  representationBridge: (work) => ({ ...work, factoredForm: { ...work.factoredForm, c: '-4', equation: 'y = 5(x + 4)' } }),
  representationMatch: (work) => ({ ...work, correctionChoice: 'plus' }),
  matrixLab: (work) => ({ ...work, B: ['7', '-5', '17'] }),
};
const withWork = (response, change) => ({ ...response, value: JSON.stringify(change(JSON.parse(response.value))) });

test('each of the four tools has a capture, from the question this file grades it against', () => {
  assert.deepEqual(Object.keys(CAPTURED).sort(), TOOLS);
  for (const toolId of TOOLS) {
    const { toolResponse, browserIsCorrect } = CAPTURED[toolId];
    assert.equal(toolResponse.kind, 'tool', toolId);
    assert.equal(toolResponse.toolId, toolId);
    assert.equal(toolResponse.type, REGISTRY_TOOL_QUESTIONS[toolId].type);
    assert.equal(toolResponse.mode, REGISTRY_TOOL_QUESTIONS[toolId].mode, `${toolId}: the mode the question asked for`);
    assert.equal(browserIsCorrect, true, `${toolId}: the browser marked the student's work right`);
  }
});

test('the server grades each real browser response right, in full, as the browser did', () => {
  for (const toolId of TOOLS) {
    const result = grade(toolId, CAPTURED[toolId].toolResponse);
    assert.notEqual(result.rejected, true, `${toolId}: the server understands the wire format`);
    assert.equal(result.isCorrect, true, `${toolId}: right work is right on the server: ${JSON.stringify(result.parts)}`);
    assert.equal(result.score, 1, `${toolId}: full credit`);
  }
});

test('the same work with one answer changed is wrong on the server', () => {
  for (const toolId of TOOLS) {
    const result = grade(toolId, withWork(CAPTURED[toolId].toolResponse, WRONG[toolId]));
    assert.equal(result.isCorrect, false, toolId);
  }
});
