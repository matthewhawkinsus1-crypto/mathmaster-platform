/*
 * A question whose equation the step-by-step solver cannot read shows its
 * panel, "written in a form the step-by-step solver cannot read"
 * (UnreadableEquationPanel, which StepByStepAlgebraCore returns when it has
 * no equation). The strategic hint's readings ran before that return and
 * read the missing equation (getSuggestedMove reads its sides), so the
 * student met a crash in place of the panel, with hints on or off. Rendered
 * through Vite SSR: an equation that cannot be read, and none at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Outside the repository: lint scans the tree.
const VITE_CACHE = join(tmpdir(), 'mathmaster-vite-ssr');

const UNREADABLE = [
  { id: 'unreadable-written', prompt: 'Solve for x.', equation: '2x + = 7', objective: { kind: 'solve', variable: 'x' } },
  { id: 'unreadable-missing', prompt: 'Solve for x.', objective: { kind: 'solve', variable: 'x' } },
];

const text = (markup) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

test('a question the solver cannot read shows its panel, never a crash, with hints on or off', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    const { default: StepByStepAlgebraCore } = await server.ssrLoadModule('/src/StepByStepAlgebraCore.jsx');
    const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
    for (const base of UNREADABLE) {
      for (const showHint of [true, false]) {
        for (const teacherView of [false, true]) {
          const question = { ...base, showHint };
          const solver = React.createElement(StepByStepAlgebraCore, { question, onStateChange: () => {}, showPrompt: false });
          const shown = text(renderToStaticMarkup(React.createElement(ToolRuntimeProvider, { teacherView }, solver)));
          const scene = `${base.id}, hints ${showHint ? 'on' : 'off'}, ${teacherView ? 'teacher' : 'student'}`;
          assert.match(shown, /written in a form the step-by-step solver cannot read/, scene);
          assert.doesNotMatch(shown, /Look for a move that cancels a term/, `${scene}: no strategic hint for an equation that is not there`);
        }
      }
    }
  } finally {
    await server.close();
  }
});

test('a readable question still offers the strategic hint where hints are on', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    const { default: StepByStepAlgebraCore } = await server.ssrLoadModule('/src/StepByStepAlgebraCore.jsx');
    const question = { id: 'readable', prompt: 'Solve for x.', equation: '2x + 3 = 7', objective: { kind: 'solve', variable: 'x' } };
    const shown = text(renderToStaticMarkup(React.createElement(StepByStepAlgebraCore, { question, onStateChange: () => {}, showPrompt: false })));
    assert.doesNotMatch(shown, /written in a form the step-by-step solver cannot read/);
  } finally {
    await server.close();
  }
});
