/*
 * A SENTENCE THAT NAMES A ROUTE, ON AN ASSESSMENT (the owner, 2026-10-23,
 * B-92 / C1-134, W6 "What an assessment shows" 6): it is shown on an exit
 * ticket, quiz or test only where the grader requires that route, and then it
 * says what will be checked.
 *
 * Three sentences carry the rule. Two were built and proven with their graders
 * in W6-4 review S2 (tests/platform/toolDirectionsSplit.test.mjs):
 *   - the inequality build's slope-intercept sentence: its grader requires the
 *     y-intercept first and a point at the entered slope, so it stays;
 *   - the Representation Bridge's graph line: its stage requires the
 *     x-intercept, so on a DOL it says that, and not how to find the points.
 * The third had no test, and on an assessment still named more than its
 * grader checks: Graphing 2's form-aware anchor note. In factored form it said
 * "…plot the x-intercept yourself, then use the slope for another point", but
 * the grader takes the x-intercept and ANY second point on the line. On an
 * assessment it now says only that (src/tools/graphing2/anchorInstruction.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { anchorInstruction } from '../../src/tools/graphing2/anchorInstruction.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { resolveConstructionPolicy } from '../../functions/shared/toolMath/graphing2/constructionPolicy.mjs';

const FORM_AWARE = { strategy: 'formAware' };
// y = 2(x − 3): x-intercept (3, 0), y-intercept (0, −6).
const FACTORED = { type: 'graphing2', mode: 'factoredLinear', factored: { a: 2, c: 3 }, constructionPolicy: FORM_AWARE };
const graded = (question, points) => gradeToolWork({ toolId: 'graphing2', question, work: { points } });
const note = (question, methodWithheld) => anchorInstruction(question.mode, resolveConstructionPolicy(question), { methodWithheld });

test('Graphing 2, factored form: the grader checks the x-intercept and a second point on the line, nothing about the slope', () => {
  assert.equal(graded(FACTORED, [[3, 0], [4, 2]]).isCorrect, true, 'the x-intercept and a slope step');
  assert.equal(graded(FACTORED, [[3, 0], [0, -6]]).isCorrect, true, 'the x-intercept and the y-intercept: no slope step taken');
  assert.equal(graded(FACTORED, [[3, 0], [10, 14]]).isCorrect, true, 'the x-intercept and a far point on the line');
  assert.equal(graded(FACTORED, [[0, -6], [4, 2]]).isCorrect, false, 'the right line without the x-intercept: the anchor is checked');
  assert.equal(graded(FACTORED, [[3, 0], [4, 3]]).isCorrect, false, 'a second point off the line');
});

test('Graphing 2, factored form: on an assessment the note says what is checked, and not the slope route', () => {
  const practice = note(FACTORED, false);
  const assessment = note(FACTORED, true);
  assert.equal(practice, 'This question requires you to plot the x-intercept yourself, then use the slope for another point.');
  assert.equal(assessment, 'This question requires you to plot the x-intercept yourself, and a second point on your line.');
  assert.match(assessment, /x-intercept/, 'the anchor the grader requires is named');
  assert.match(assessment, /second point on your line/, 'and the second point as the grader takes it');
  assert.doesNotMatch(assessment, /slope/i, 'the route the grader does not check is not');
});

test('Graphing 2: every other anchor note names only what its grader requires, so it reads the same on an assessment', () => {
  const cases = [
    // The y-intercept is required: the right line through two other points is refused.
    [{ type: 'graphing2', mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: FORM_AWARE }, [[0, -1], [1, 1]], [[1, 1], [2, 3]], /y-intercept/],
    // The given point is required.
    [{ type: 'graphing2', mode: 'pointSlope', point: [1, 2], slope: 3, constructionPolicy: FORM_AWARE }, [[1, 2], [2, 5]], [[0, -1], [2, 5]], /given point/],
    // Both intercepts are required.
    [{ type: 'graphing2', mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: FORM_AWARE }, [[2, 0], [0, 4]], [[1, 2], [3, -2]], /intercept/],
  ];
  for (const [question, required, routeAround, names] of cases) {
    assert.equal(graded(question, required).isCorrect, true, `${question.mode}: the required points`);
    assert.equal(graded(question, routeAround).isCorrect, false, `${question.mode}: the right line without them`);
    assert.match(note(question, true), names, `${question.mode}: the assessment note names it`);
    assert.equal(note(question, true), note(question, false), `${question.mode}: nothing more to withhold`);
  }
  // With no form-aware policy the grader takes any two points on the line, and there is no note anywhere.
  for (const mode of ['slopeIntercept', 'factoredLinear', 'pointSlope', 'standardForm']) {
    assert.equal(anchorInstruction(mode, resolveConstructionPolicy({}), { methodWithheld: false }), null, mode);
    assert.equal(anchorInstruction(mode, resolveConstructionPolicy({}), { methodWithheld: true }), null, mode);
  }
  assert.equal(graded({ ...FACTORED, constructionPolicy: undefined }, [[0, -6], [4, 2]]).isCorrect, true, 'no policy: any two points');
});

// Rendered whole (Vite SSR), as tests/platform/toolDirectionsSplit.test.mjs renders a tool.
const withVite = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const hadWindow = 'window' in globalThis;
  const before = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => 'open', setItem() {} } };
  try {
    return await run((path) => server.ssrLoadModule(path));
  } finally {
    if (hadWindow) globalThis.window = before;
    else delete globalThis.window;
    await server.close();
  }
};
const words = (html) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');

test('the Graphing 2 screen shows the route on practice and only what is checked on an exit ticket', async () => {
  await withVite(async (load) => {
    const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
    const Graphing2 = (await load('/src/tools/graphing2/Graphing2.jsx')).default;
    const render = (questionData, runtime) => words(renderToStaticMarkup(React.createElement(ToolRuntimeProvider, runtime, React.createElement(Graphing2, { questionData }))));
    const PRACTICE = { hintsAllowed: true, verdictsWithheld: false };
    const DOL = { hintsAllowed: false, verdictsWithheld: true };

    const practice = render(FACTORED, PRACTICE);
    const dol = render(FACTORED, DOL);
    assert.ok(practice.includes('then use the slope for another point'), 'practice keeps the route');
    assert.ok(dol.includes('This question requires you to plot the x-intercept yourself, and a second point on your line.'), 'the exit ticket says what is checked');
    assert.ok(!dol.includes('use the slope'), 'and not the route');
    // A requirement with nothing more to withhold reads the same on both.
    const slopeIntercept = { type: 'graphing2', mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: FORM_AWARE };
    for (const runtime of [PRACTICE, DOL]) {
      assert.ok(render(slopeIntercept, runtime).includes('This question requires you to plot the y-intercept as one of your points.'));
      assert.ok(!render({ ...FACTORED, constructionPolicy: undefined }, runtime).includes('This question requires'), 'no policy, no note');
    }
  });
});
