// Graphing 2's "what to do next" line keeps the room of its longest wording,
// so the plane under it never moves when a point is placed. Its first wording
// is two lines long (three on a phone) and the next one line: the plane used
// to jump up 18px between a student's first click and their second, so a quick
// second click landed a grid step from where it was aimed.
//
// The gesture itself is checked in a browser (tests/browser/plotInteraction.mjs,
// "the plane stays put"); this pins the pieces it rests on.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const graphing = read('src/tools/graphing2/Graphing2.jsx');

const nextInstruction = new Function(`return ${region(graphing, 'const nextInstruction = (', ');\n', 'the next instruction').replace('const nextInstruction = ', '')});`)();

test('the steady-text class lays its wordings in one cell, the reserved ones hidden', () => {
  const css = read('src/App.css');
  assert.match(css, /\.mathmaster-steady-text \{\s*display: grid;\s*\}/);
  assert.match(css, /\.mathmaster-steady-text > \*,\s*\.mathmaster-steady-text::before,\s*\.mathmaster-steady-text::after \{\s*grid-area: 1 \/ 1;/);
  assert.match(css, /\.mathmaster-steady-text::before \{\s*content: attr\(data-steady-a\);\s*visibility: hidden;\s*\}/);
  assert.match(css, /\.mathmaster-steady-text::after \{\s*content: attr\(data-steady-b\);\s*visibility: hidden;\s*\}/);
});

test('the instruction holds room for its first and its last wording', () => {
  const row = region(graphing, '<Panel title="Construct the line">', '<CoordinatePlane', 'the instruction row');
  assert.match(row, /className="mathmaster-steady-text" data-steady-a=\{nextInstruction\(0, requiredPointCount, hostSubmitLabel\)\} data-steady-b=\{nextInstruction\(requiredPointCount, requiredPointCount, hostSubmitLabel\)\}>\s*<span>\{nextInstruction\(points\.length, requiredPointCount, hostSubmitLabel\)\}<\/span>/);
  // The count beside it turns into a tick, a glyph of another height.
  assert.match(row, /className="mathmaster-steady-text" data-steady-a=\{`\$\{requiredPointCount\}\/\$\{requiredPointCount\}`\} data-steady-b="✓">\s*<span>\{points\.length >= requiredPointCount \? '✓' : `\$\{points\.length\}\/\$\{requiredPointCount\}`\}<\/span>/);
});

test('no wording in between is longer than the two it holds room for', () => {
  // Two reserves cover every state only while the wordings between the first
  // and the last are shorter than one of them.
  for (const required of [1, 2, 3, 4]) {
    for (const finalLabel of [null, 'Record answer']) {
      const room = Math.max(nextInstruction(0, required, finalLabel).length, nextInstruction(required, required, finalLabel).length);
      for (let plotted = 0; plotted <= required; plotted += 1) {
        const wording = nextInstruction(plotted, required, finalLabel);
        assert.ok(wording.length <= room, `"${wording}" (${plotted} of ${required}) is longer than the room held for it`);
      }
    }
  }
  assert.match(nextInstruction(1, 2), /^Now plot point 2 of 2/, 'the instruction read is the real one');
});
