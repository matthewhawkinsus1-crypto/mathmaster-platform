/*
 * Tools write their mathematics as a teacher would (student pass 3, TOOL-7
 * remainder). Polynomial Workshop printed its coefficient list as it came,
 * "P(x) = 1x^2 -5x +6", and Representation Bridge's "Your line" used the
 * grader's record text (formatLine: "y = 1x + 0", "y = 0.66666667x + 2").
 * Both now write what Graphing writes (lineReadout.js): no 1 or 0 coefficient,
 * no "+ 0", a true minus sign. Display only; the grader's inputs are unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Outside the repository: lint scans the tree.
const VITE_CACHE = join(tmpdir(), 'mathmaster-vite-ssr');
import { polynomialReadoutText } from '../../src/tools/polynomialWorkshop/polynomialReadout.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

test('a polynomial is written without a 1, a 0 term, a caret or a hyphen', () => {
  assert.equal(polynomialReadoutText([1, -5, 6]), 'x² − 5x + 6');
  assert.equal(polynomialReadoutText([-1, 0, 4]), '−x² + 4');
  assert.equal(polynomialReadoutText([2, 0, 0, -1]), '2x³ − 1');
  assert.equal(polynomialReadoutText([1, -3]), 'x − 3');
  assert.equal(polynomialReadoutText([0.5, 1, 0]), '0.5x² + x');
  assert.equal(polynomialReadoutText([-3]), '−3');
  assert.equal(polynomialReadoutText([0, 0]), '0');
  // Not rounded into a 1 (review N7).
  assert.equal(polynomialReadoutText([1.00001, 0]), '1.00001x');
  // Where the screen asks for coefficient lists, a zero term is shown.
  assert.equal(polynomialReadoutText([1, 0, 0, -8], { keepZeros: true }), 'x³ + 0x² + 0x − 8');
  assert.equal(polynomialReadoutText([0, 1, 0, -3], { keepZeros: true }), 'x² + 0x − 3', 'a leading zero is never a term');
  for (const list of [[1, -5, 6], [-1, 0, 4], [1, 0, -12], [3, -1, 0, 2]]) {
    assert.doesNotMatch(polynomialReadoutText(list), /\^|-|\b1x|\+ 0|\s[+−]\S/, JSON.stringify(list));
  }
});

test('Polynomial Workshop shows P(x) in those words', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    const { default: PolynomialWorkshop } = await server.ssrLoadModule('/src/tools/polynomialWorkshop/PolynomialWorkshop.jsx');
    const factorZero = renderToStaticMarkup(React.createElement(PolynomialWorkshop, { questionData: { mode: 'factorZero', coefficients: [1, -5, 6], candidateRoot: 2 } }));
    assert.match(factorZero, /P\(x\) = x² − 5x \+ 6/);
    assert.doesNotMatch(factorZero, /1x\^2|x\^2/);
    const division = renderToStaticMarkup(React.createElement(PolynomialWorkshop, { questionData: { mode: 'division', dividend: [1, 0, -12], divisor: [1, -3] } }));
    // Division asks for coefficient lists, so the zero term shows (N7).
    assert.match(division, /x² \+ 0x − 12/);
    assert.match(division, />x − 3</);
  } finally {
    await server.close();
  }
});

test('Representation Bridge writes "Your line" the way Graphing does', () => {
  const source = executableSource(readFileSync(new URL('../../src/tools/representationBridge/RepresentationBridge.jsx', import.meta.url), 'utf8'));
  const readout = region(source, 'data-line-readout=', '</p>', 'the Your line readout');
  assert.match(readout, /lineReadoutText\(studentGraphLine\)/);
  assert.match(readout, /<MathDisplay value=\{lineReadoutLatex\(studentGraphLine\)\}/);
  assert.doesNotMatch(source, /formatLine/, 'the record text is never shown');
  assert.match(source, /import \{ lineReadoutLatex, lineReadoutText \} from '\.\.\/graphing2\/lineReadout\.js';/);
  assert.match(source, /import MathDisplay from '\.\.\/\.\.\/MathDisplay';/);
});
