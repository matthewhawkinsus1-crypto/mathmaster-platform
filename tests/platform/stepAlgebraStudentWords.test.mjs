/*
 * Step Algebra shows the teacher's support policy only to a teacher
 * (student pass 3, Q-12). A student read "Support 3 · Standard" and "Nothing
 * is simplified for the student. Hints are available on request." under their
 * work: the level is the teacher's setting, in the teacher's words. The
 * student keeps the sentence that is about them (decision D1: a longer route
 * never uses a try). A teacher's lesson or test preview keeps both, so the
 * teacher still sees which level the question runs at. Rendered through Vite
 * SSR, with and without the runtime's teacher flag.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const QUESTION = {
  id: 'q12-step',
  prompt: 'Solve for x.',
  equation: '2x + 3 = 7',
  workspaceDifficulty: 'standard',
  objective: { kind: 'solve', variable: 'x' },
};

const render = async (server, { teacherView }) => {
  const { default: StepByStepAlgebraCore } = await server.ssrLoadModule('/src/StepByStepAlgebraCore.jsx');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const solver = React.createElement(StepByStepAlgebraCore, { question: QUESTION, onStateChange: () => {}, showPrompt: false });
  return renderToStaticMarkup(teacherView === undefined
    ? solver
    : React.createElement(ToolRuntimeProvider, { teacherView }, solver));
};

const text = (markup) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

test('a student sees no support level or policy sentence, only the sentence about them', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: '/tmp/claude-0/vitecache/ssr' });
  try {
    for (const teacherView of [undefined, false]) {
      const shown = text(await render(server, { teacherView }));
      assert.match(shown, /A longer route is still correct algebra and never uses a try\./, `student footnote (${teacherView})`);
      assert.doesNotMatch(shown, /Support \d ·/, `no support badge (${teacherView})`);
      assert.doesNotMatch(shown, /Nothing is simplified for the student|Hints are available on request/, `no policy sentence (${teacherView})`);
    }
    const teacher = text(await render(server, { teacherView: true }));
    assert.match(teacher, /Support 3 · Standard/);
    assert.match(teacher, /Nothing is simplified for the student\. Hints are available on request\. A longer route is still correct algebra/);
  } finally {
    await server.close();
  }
});

test('only a teacher preview scope turns the teacher flag on, on every tool runtime QuestionEngine opens', () => {
  const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  const flag = engine.match(/const teacherPolicyView = ([^;]+);/);
  assert.ok(flag, 'QuestionEngine derives the flag');
  const scopes = [...flag[1].matchAll(/executionScope === '([A-Za-z]+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(scopes, ['teacherPreview', 'teacherRepairPreview']);
  assert.doesNotMatch(flag[1], /\|\|\s*(true|[a-z]+\b(?!\s*===))/i, 'nothing else turns it on');
  const providers = engine.match(/<ToolRuntimeProvider\b[^>]*>/g) || [];
  assert.ok(providers.length >= 3);
  providers.forEach((provider, index) => assert.match(provider, /teacherView=\{teacherPolicyView\}/, `provider ${index + 1}`));
});
