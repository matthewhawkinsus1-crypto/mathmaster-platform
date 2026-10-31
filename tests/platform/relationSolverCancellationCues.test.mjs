/*
 * TL34 (finding A2-55): the relation solver inside the Systems Workspace's
 * rewrite step no longer teaches cancelling.
 *
 * The same solver is the absolute-value lessons' workspace, where cancelling
 * matching opposite terms is part of the work: it keeps a "Cancellation hints"
 * toggle, a tooltip on a cancellable term and a sentence about clicking two
 * items. The systems rewrite to y = mx + b only needs + − × ÷ (it starts
 * "Other operations" closed), and its students cancel through Simplify, so
 * there those three were extra reading. Only the teaching goes: the terms are
 * still the buttons that take a click, so cancelling by hand still works.
 *
 * The solver is rendered through Vite the way each host mounts it.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, withBrowser } from './helpers/studentToolRender.mjs';

after(closeEngine);

// 5 and −5 are matching opposite terms, so the first expression has a pair to cancel.
const QUESTION = { type: 'stepAlgebra', equation: '3x + 5 - 5 < 10', prompt: 'Solve.' };
// What EmbeddedInequalityRewrite passes (src/tools/systemsWorkspace/).
const SYSTEMS_REWRITE = { denseWorkspace: true, otherOperationsOpenByDefault: false };

const CUES = {
  // The checkbox's label, not the sentence that tells a student to turn it on.
  toggle: /Cancellation hints<\/label>/,
  sentence: /Cancellation works directly/,
  tooltip: /title="Matching opposite terms can be cancelled directly"/,
};
const cuesIn = (markup) => Object.fromEntries(Object.entries(CUES).map(([name, pattern]) => [name, pattern.test(markup)]));

let solver = null;
const solverMarkup = async ({ props = {}, runtime = {} } = {}) => {
  if (!solver) {
    const { server } = await loadEngine();
    solver = {
      Solver: (await server.ssrLoadModule('/src/MultiRelationAlgebraCore.jsx')).default,
      ToolRuntimeProvider: (await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx')).ToolRuntimeProvider,
    };
  }
  return withBrowser(() => render(React.createElement(
    solver.ToolRuntimeProvider,
    runtime,
    React.createElement(solver.Solver, { question: QUESTION, questionRecord: null, draftKey: 'tl34', ...props }),
  )));
};
const termButtons = (markup) => (markup.match(/data-cancel-index=/g) || []).length;

test('TL34: the absolute-value lessons\' solver keeps all three cancellation cues', async () => {
  const markup = await solverMarkup();
  assert.deepEqual(cuesIn(markup), { toggle: true, sentence: true, tooltip: true });
  assert.equal(termButtons(markup), 3, 'the three terms of 3x + 5 − 5 are the buttons that take a click');
});

test('TL34: the systems rewrite shows none of them, and its terms still take a click', async () => {
  const lessons = await solverMarkup();
  const rewrite = await solverMarkup({ props: SYSTEMS_REWRITE });
  assert.deepEqual(cuesIn(rewrite), { toggle: false, sentence: false, tooltip: false });
  assert.equal(termButtons(rewrite), termButtons(lessons), 'cancelling by hand is not taken away, only taught less');
  // Not an empty page: the rewrite is still the solver, with its tools.
  assert.match(rewrite, /Simplify/);
  assert.match(rewrite, /Start over/);
  assert.match(rewrite, /Place the balanced operation on both sides\./);
});

test('TL34: a host can say it either way; where hints are withheld the toggle goes but the rest is the host\'s choice', async () => {
  assert.deepEqual(cuesIn(await solverMarkup({ props: { ...SYSTEMS_REWRITE, showCancellationCues: true } })), { toggle: true, sentence: true, tooltip: true });
  assert.deepEqual(cuesIn(await solverMarkup({ props: { showCancellationCues: false } })), { toggle: false, sentence: false, tooltip: false });
  // A DOL, quiz or test withholds hints: no toggle (as before this change); the lessons' sentence and tooltip are unchanged.
  assert.deepEqual(cuesIn(await solverMarkup({ runtime: { hintsAllowed: false } })), { toggle: false, sentence: true, tooltip: true });
  assert.deepEqual(cuesIn(await solverMarkup({ props: SYSTEMS_REWRITE, runtime: { hintsAllowed: false } })), { toggle: false, sentence: false, tooltip: false });
});
