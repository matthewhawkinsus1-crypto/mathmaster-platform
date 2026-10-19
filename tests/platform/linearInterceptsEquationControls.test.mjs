/*
 * The Linear Intercepts equation box names the equation in words (pass 3,
 * A11Y-3) without hiding its controls. A first version gave it role="img",
 * which hides every descendant from assistive technology: the x and y
 * substitution targets — the step's only controls — disappeared, and a
 * screen-reader student could not place the zero. Rendered through Vite SSR.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Every element whose role hides its descendants (img, presentation's
// children-presentational roles) must not contain a focusable control.
export const controlsHiddenByRole = (markup) => {
  const hidden = [];
  const pattern = /<([a-z]+)\b[^>]*\brole="(img|presentation|none|math|separator|progressbar|meter)"[^>]*>/g;
  let match;
  while ((match = pattern.exec(markup))) {
    const [open, tag] = match;
    let depth = 1;
    let index = match.index + open.length;
    const tagPattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    tagPattern.lastIndex = index;
    let inner;
    while (depth > 0 && (inner = tagPattern.exec(markup))) {
      depth += inner[1] ? -1 : 1;
      index = inner.index;
    }
    const body = markup.slice(match.index + open.length, index);
    if (/<(button|input|select|textarea|a\s[^>]*href)\b|tabindex="0"/.test(body)) hidden.push(open);
  }
  return hidden;
};

test('the equation box is a named group and its substitution targets stay reachable', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { InteractiveStandardEquation } = await server.ssrLoadModule('/src/tools/stepAlgebra2/linearInterceptsConceptualUi.jsx');
    const markup = renderToStaticMarkup(React.createElement(InteractiveStandardEquation, {
      standard: { A: 2, B: 3, C: 6 }, placedVariable: null, zeroArmed: true, disabled: false, onPlace: () => {},
    }));
    assert.match(markup, /role="group" aria-label="Equation 2x plus 3y equals 6"/);
    assert.match(markup, /aria-label="x variable substitution target"/);
    assert.match(markup, /aria-label="y variable substitution target"/);
    assert.deepEqual(controlsHiddenByRole(markup), [], 'no control sits inside a role that hides its descendants');
  } finally {
    await server.close();
  }
});

test('the check sees a control hidden by role="img" (it can fail)', () => {
  assert.equal(controlsHiddenByRole('<div role="img" aria-label="Equation"><span>2</span><button>x</button></div>').length, 1);
  assert.equal(controlsHiddenByRole('<div role="img" aria-label="Graph"><svg></svg></div>').length, 0);
  assert.equal(controlsHiddenByRole('<div role="group" aria-label="Equation"><button>x</button></div>').length, 0);
});
