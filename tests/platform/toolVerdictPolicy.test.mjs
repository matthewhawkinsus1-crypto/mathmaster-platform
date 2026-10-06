/*
 * "THE ACTIVITY WITHHOLDS VERDICTS" AND "THIS TOOL HAS NO ANSWER KEY" ARE TWO
 * DIFFERENT THINGS, AND A TOOL CAN TELL THEM APART.
 *
 * Under server grading a registry tool's `showImmediateFeedback` is false even
 * where the activity shows feedback (Corrections, My Math Path practice): the
 * tool has no key, so its own check would call correct work wrong. Step
 * Algebra does not need a key — it judges a move from the equation it was
 * applied to — and reading that flag as "withhold verdicts" took its move
 * coaching away from every server-graded practice surface. `verdictsWithheld`
 * carries the activity's own policy, and Step Algebra reads that.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the tool context carries the activity\'s verdict policy apart from the answer-key flag', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { ToolRuntimeProvider, useToolRuntimeContext } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
    const seen = (props) => {
      let value = null;
      const Probe = () => { value = useToolRuntimeContext(); return null; };
      const tree = props ? React.createElement(ToolRuntimeProvider, props, React.createElement(Probe)) : React.createElement(Probe);
      renderToStaticMarkup(tree);
      return { showImmediateFeedback: value.showImmediateFeedback, verdictsWithheld: value.verdictsWithheld };
    };
    // Outside any activity (the tools lab): verdicts on.
    assert.deepEqual(seen(null), { showImmediateFeedback: true, verdictsWithheld: false });
    // Corrections: server-graded (no key in the tool), feedback shown.
    assert.deepEqual(seen({ showImmediateFeedback: false, verdictsWithheld: false }), { showImmediateFeedback: false, verdictsWithheld: false });
    // A secure Test: verdicts withheld.
    assert.deepEqual(seen({ showImmediateFeedback: false, verdictsWithheld: true }), { showImmediateFeedback: false, verdictsWithheld: true });
    // Only an explicit true withholds.
    assert.equal(seen({ verdictsWithheld: 'yes' }).verdictsWithheld, false);
  } finally {
    await server.close();
  }
});

test('every QuestionEngine tool provider passes the activity\'s policy, with no answer-key term', () => {
  const engine = read('src/QuestionEngine.jsx');
  const providers = engine.split('<ToolRuntimeProvider').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('>')));
  assert.equal(providers.length, 3, 'the solver, composed-workflow and registry providers');
  providers.forEach((props) => assert.match(props, /verdictsWithheld=\{!showOutcomeFeedback\}/));
});

test('Step Algebra withholds move verdicts on the activity\'s policy, not on the answer-key flag', () => {
  const core = read('src/StepByStepAlgebraCore.jsx');
  assert.match(core, /const verdictsShown = useToolRuntimeContext\(\)\.verdictsWithheld !== true;/);
  assert.doesNotMatch(core, /const verdictsShown = [^;]*showImmediateFeedback/);
});
