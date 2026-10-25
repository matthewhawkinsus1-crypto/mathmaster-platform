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
import { CALCULATOR_MODES, getCalculatorButtonsForMode, getCalculatorDrawerLabel, getCalculatorModeLabel } from '../../src/platform/policies/calculatorPolicy.js';
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

// TL23 (owner decision): the drawer is titled by what it is — the keys it
// shows — not by the setting that opened it. A graphing setting's drawer has
// the scientific keys, so it is titled SCIENTIFIC, and says under the title
// that it cannot draw graphs.
test('TL23: the drawer is titled by the keys it shows', async () => {
  const keysOf = (mode) => getCalculatorButtonsForMode(mode).join(' ');
  assert.equal(keysOf(CALCULATOR_MODES.GRAPHING), keysOf(CALCULATOR_MODES.SCIENTIFIC), 'a graphing setting shows the scientific keys');
  for (const mode of [CALCULATOR_MODES.BASIC, CALCULATOR_MODES.SQUARE_ROOT, CALCULATOR_MODES.SCIENTIFIC]) {
    assert.equal(getCalculatorDrawerLabel(mode), getCalculatorModeLabel(mode), `${mode}: titled by its own keys`);
  }
  assert.equal(getCalculatorDrawerLabel(CALCULATOR_MODES.GRAPHING), getCalculatorDrawerLabel(CALCULATOR_MODES.SCIENTIFIC), 'same keys, same title');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { CalculatorPanel } = await server.ssrLoadModule('/src/components/CalculatorPanel.jsx');
    const title = (mode) => renderToStaticMarkup(React.createElement(CalculatorPanel, { open: true, showLauncher: false, onOpenChange: () => {}, policy: { available: true, mode } }))
      .match(/<\/button>([A-Z ]+) CALCULATOR<\/span>/)?.[1];
    assert.equal(title('graphing'), 'SCIENTIFIC');
    assert.equal(title('scientific'), 'SCIENTIFIC');
    assert.equal(title('basic'), 'BASIC');
    assert.equal(title('squareRoot'), 'SQUARE ROOT');
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
