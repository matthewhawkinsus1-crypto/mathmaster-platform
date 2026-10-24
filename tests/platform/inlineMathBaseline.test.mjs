/*
 * RT14: INLINE MATH SITS ON THE LINE'S BASELINE.
 *
 * MathDisplay pushed inline mathematics 0.16em below the baseline, so the
 * sentence's own full stop after it ("the graph of $g$.") stood level with
 * the middle of the mathematics and read as a multiplication dot. Measured in
 * a browser (Chromium, 22px text): the mathematics' box ran from 17px above
 * the text baseline to 12px below it; on the baseline, 21px above to 9px
 * below, with stacked fractions centred on the math axis as typeset
 * mathematics is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('inline math is aligned to the baseline; block math keeps its own alignment (rendered)', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: MathDisplay } = await server.ssrLoadModule('/src/MathDisplay.jsx');
    const inline = renderToStaticMarkup(React.createElement(MathDisplay, { value: 'g', inline: true }));
    assert.match(inline, /<math-span[^>]*style="[^"]*vertical-align:baseline/);
    assert.doesNotMatch(inline, /vertical-align:-0\.16em/);
    const block = renderToStaticMarkup(React.createElement(MathDisplay, { value: 'x^2' }));
    assert.match(block, /<math-div[^>]*style="[^"]*vertical-align:middle/);
  } finally {
    await server.close();
  }
});
