import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('review scenarios, recursive rule, and rental durations actually render', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Stimulus } = await server.ssrLoadModule('/src/components/student/PathQuestionStimulus.jsx');
    const assignment = JSON.parse(readFileSync(new URL('../../drafts/district-dol2/assignment.json', import.meta.url), 'utf8'));
    for (const [index, expected] of [[0, /report summarizes observations/], [1, /a₁/], [3, /whole-hour durations/]]) {
      const html = renderToStaticMarkup(React.createElement(Stimulus, { stimulus: assignment.sections[0].questions[index].stimulus }));
      assert.match(html, expected);
    }
    const html = renderToStaticMarkup(React.createElement(Stimulus, { stimulus: assignment.sections[0].questions[5].stimulus }));
    for (const label of ['Relation A', 'Relation B', 'Relation C']) assert.ok(html.includes(label));
  } finally { await server.close(); }
});
