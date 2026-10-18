/*
 * THE KEYPAD UNDER A "GRAPHING" CALCULATOR SETTING SAYS WHAT IS TRUE (W6-4).
 *
 * The keypad said "Graphs are drawn in the question itself. Use this
 * calculator for the arithmetic." Since W5-7 an assignment set to graphing
 * opens a real graphing calculator, and the keypad shows under that setting
 * only where none is drawn: as the stand-in when the graphing calculator
 * could not load, and on hosts that draw no graphing calculator (a Path
 * session, an assessment item whose test has no graphing tool). In neither
 * case does the question draw the graphs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { keypadGraphingNote } from '../../src/components/calculatorKeys.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const code = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('the line names each case, and appears only under a graphing setting', () => {
  assert.equal(keypadGraphingNote({ mode: 'graphing', graphingUnavailable: true }), 'The graphing calculator could not load, so this calculator stands in. It does the arithmetic but cannot draw graphs.');
  assert.equal(keypadGraphingNote({ mode: 'graphing' }), 'This calculator does the arithmetic. It cannot draw graphs.');
  for (const mode of ['basic', 'scientific', null]) assert.equal(keypadGraphingNote({ mode, graphingUnavailable: true }), null, String(mode));
  for (const note of [keypadGraphingNote({ mode: 'graphing' }), keypadGraphingNote({ mode: 'graphing', graphingUnavailable: true })]) {
    assert.doesNotMatch(note, /drawn in the question/, 'never the old claim');
  }
});

test('the open keypad draws the line it is given', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { CalculatorPanel } = await server.ssrLoadModule('/src/components/CalculatorPanel.jsx');
    const render = (props) => renderToStaticMarkup(React.createElement(CalculatorPanel, { open: true, showLauncher: false, onOpenChange: () => {}, ...props }));
    assert.match(render({ policy: { available: true, mode: 'graphing' } }), /data-calculator-graphing-note=""[^>]*>This calculator does the arithmetic\. It cannot draw graphs\.</);
    assert.match(render({ policy: { available: true, mode: 'graphing' }, graphingUnavailable: true }), /could not load, so this calculator stands in/);
    assert.doesNotMatch(render({ policy: { available: true, mode: 'scientific' }, graphingUnavailable: true }), /data-calculator-graphing-note/);
  } finally {
    await server.close();
  }
});

test('QuestionEngine tells its keypad when it stands in for a graphing calculator that could not load', () => {
  const engine = code('src/QuestionEngine.jsx');
  const keypad = region(engine, 'const keypadCalculator = (', ');', 'the keypad element');
  assert.match(keypad, /graphingUnavailable=\{graphingCalculatorFailed\}/);
  // The same element is the lazy graphing calculator's fallback, and the
  // failure is what sets that flag.
  assert.match(engine, /fallback=\{keypadCalculator\}\s*onUnavailable=\{markGraphingCalculatorFailed\}/);
  assert.match(engine, /const markGraphingCalculatorFailed = useCallback\(\(\) => setGraphingCalculatorFailed\(true\), \[\]\);/);
  assert.match(code('src/components/CalculatorPanel.jsx'), /const graphingNote = keypadGraphingNote\(\{ mode: policy\?\.mode, graphingUnavailable \}\);/);
});
