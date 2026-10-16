/*
 * A11Y-5 (pass 3, 04-tools-and-accessibility.md): the Work history speaks the
 * equations.
 *
 * Each history row labelled its equations with the step's description, so a
 * screen-reader student heard "Before: Subtracted 3 from both sides → After:
 * Subtracted 3 from both sides" and never the math; every math fragment of the
 * description was labelled with the whole description too, so it repeated.
 *
 * Rendered through Vite SSR (node cannot import .jsx), then read the way a
 * screen reader reads it: visible text outside aria-hidden, plus the visually
 * hidden spoken copies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const withWorkSteps = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run(await server.ssrLoadModule('/src/AlgebraWorkSteps.jsx'));
  } finally {
    await server.close();
  }
};

// What a screen reader is given: everything except aria-hidden subtrees.
export const spokenText = (markup) => {
  let html = markup;
  // Remove aria-hidden elements (innermost first; tags here do not nest themselves deeply).
  for (let guard = 0; guard < 50; guard += 1) {
    const next = html.replace(/<([a-z-]+)[^>]*aria-hidden="true"[^>]*>(?:(?!<\1[\s>])[\s\S])*?<\/\1>/, '');
    if (next === html) break;
    html = next;
  }
  return html.replace(/<[^>]+>/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
};

// The step shape StepByStepAlgebraCore records (recordWorkStep / balancedStep).
const STEP = Object.freeze({
  kind: 'balanced-operation',
  description: 'Subtracted 3 from both sides',
  parts: ['Subtracted ', { latex: '3' }, ' from both sides'],
  before: { left: '2*x+3', right: '7' },
  after: { left: '2*x', right: '4' },
});

test('each history row says the move, then the equation before and after', async () => {
  await withWorkSteps(async ({ default: AlgebraWorkSteps }) => {
    const markup = renderToStaticMarkup(React.createElement(AlgebraWorkSteps, { steps: [STEP] }));
    const spoken = spokenText(markup);
    assert.match(spoken, /Subtracted 3 from both sides/);
    assert.match(spoken, /Before: 2x plus 3 equals 7/);
    assert.match(spoken, /After: 2x equals 4/);
    assert.ok(spoken.indexOf('Before:') < spoken.indexOf('After:'), 'before is read first');
    // The description is said once, not once per equation or fragment.
    assert.equal(spoken.split('Subtracted').length - 1, 1, spoken);
  });
});

test('a description with math in it speaks that math, once', async () => {
  await withWorkSteps(async ({ WorkStepDescription }) => {
    const markup = renderToStaticMarkup(React.createElement(WorkStepDescription, {
      step: { description: 'Divided both sides by -3/4', parts: ['Divided both sides by ', { latex: '-\\frac{3}{4}' }] },
    }));
    assert.equal(spokenText(markup), 'Divided both sides by negative 3 over 4');
  });
});
