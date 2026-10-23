/*
 * THE TWO STAGED ALGEBRA II VIEWS RENDER THE PROBLEM THEY ARE GIVEN.
 *
 * The Polynomial Workshop's synthetic-division view and the Sign & Solution
 * Analyzer's radical-solve view are graded by shared graders (their own
 * suites in tests/tools). This holds the screens: rendered through Vite SSR,
 * each shows the authored problem, a box for every stage it grades, and none
 * of the answers — and an equation the radical view cannot solve by hand
 * shows a notice instead of a broken form.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const text = (markup) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the synthetic-division and radical-solve views render their own problem, a box per stage, and no answers', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: SignSolutionAnalyzer } = await server.ssrLoadModule('/src/tools/signSolutionAnalyzer/SignSolutionAnalyzer.jsx');
    const { default: PolynomialWorkshop } = await server.ssrLoadModule('/src/tools/polynomialWorkshop/PolynomialWorkshop.jsx');

    // (x³ − 7x + 6) ÷ (x + 3): r = −3, a 0 for the missing x², remainder 0.
    const synthetic = renderToStaticMarkup(React.createElement(PolynomialWorkshop, {
      questionData: { type: 'polynomialWorkshop', mode: 'synthetic', dividend: [1, 0, -7, 6], divisor: [1, 3] },
    }));
    assert.match(text(synthetic), /P\(x\) = x³ − 7x \+ 6/);
    assert.match(text(synthetic), /Divisor: x \+ 3/);
    assert.equal((synthetic.match(/aria-label="Coefficient of the /g) || []).length, 4, 'a coefficient box for every power, x² included');
    assert.equal((synthetic.match(/aria-label="Middle row, /g) || []).length, 3);
    assert.equal((synthetic.match(/aria-label="Bottom row, /g) || []).length, 4);
    assert.match(synthetic, /aria-label="Number in the box"/);
    assert.doesNotMatch(synthetic, /value="(-3|−3|1|-7|6)"/, 'no cell arrives filled in');

    // 7·⁶√(5m + 4) − 4 = 10, the lesson's sixth-root example.
    const solve = renderToStaticMarkup(React.createElement(SignSolutionAnalyzer, {
      questionData: { type: 'signSolutionAnalyzer', mode: 'radicalSolve', radicalEquation: { variable: 'm', index: 6, coefficient: 7, radicand: { m: 5, b: 4 }, outside: -4, rhs: { m: 0, b: 10 } } },
    }));
    const shown = text(solve);
    assert.match(shown, /7·⁶√\(5m \+ 4\) − 4 = 10/);
    assert.match(shown, /1\. Isolate the radical ⁶√\(5m \+ 4\) =/);
    assert.match(shown, /2\. Raise both sides to the 6th power 5m \+ 4 =/);
    assert.match(shown, /3\. Solve for m: the candidates m =/);
    assert.match(shown, /5\. Solution of the original equation m =/);
    assert.match(shown, /No real solution/);
    assert.equal((solve.match(/<input /g) || []).length, 5, 'isolate, raise, candidates, solution and the no-solution box; check rows appear with candidates');
    assert.doesNotMatch(shown, /\b(12|64)\b/, 'neither the candidate nor the raised value is on screen');

    // A cube root with x outside it would be a cubic: refused, not half drawn.
    const unsolvable = renderToStaticMarkup(React.createElement(SignSolutionAnalyzer, {
      questionData: { type: 'signSolutionAnalyzer', mode: 'radicalSolve', radicalEquation: { index: 3, radicand: { m: 1, b: 0 }, rhs: { m: 1, b: 0 } } },
    }));
    assert.match(unsolvable, /role="alert"/);
    assert.doesNotMatch(unsolvable, /<input /);
  } finally {
    await server.close();
  }
});
