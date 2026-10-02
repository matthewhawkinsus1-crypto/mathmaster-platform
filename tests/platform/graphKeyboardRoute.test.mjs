// What the graph workspace (functionInvestigation, functionGraph, graphAnalysis)
// tells a keyboard or screen-reader student, as the source wires it.
//
// Two defects this pins:
//
//  - An analysis field had no name of its own. MathInput names its field
//    `ariaLabel || placeholder || 'Math answer'`, and the workspace passed no
//    ariaLabel, so the domain box was announced as its format example "[2, ∞)",
//    a typed point as "(x, y) or DNE", and a value part as "Math answer".
//  - Selecting an end marker announced "...press Enter, or type an exact
//    coordinate" — but markers are placed after the curve holds the points
//    still, when the typed x / y entry is not rendered.
//
// The behaviour is driven on screen by tests/browser/graphKeyboardRoute.mjs;
// these are the source-level guards CI runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const graph = executableSource(read('src/InteractiveGraphWorkspace.jsx'));
const mathInput = executableSource(read('src/MathInput.jsx'));

const mathInputs = (source) => [...source.matchAll(/<MathInput\b[\s\S]*?\/>/g)].map((match) => match[0]);

test('a math field is called by the name it is given before its placeholder', () => {
  assert.match(mathInput, /<math-field[\s\S]*?aria-label=\{\s*ariaLabel\s*\|\|/,
    'MathInput must name its field by the ariaLabel it is given, falling back to the placeholder only without one');
});

test('every analysis field in the graph workspace is named by its part', () => {
  const parts = region(graph, 'analysisParts.map((part) => {', 'onClick={checkInversePoints}', 'the analysis parts');
  const fields = mathInputs(parts);
  // The typed-point field and the answer field.
  assert.ok(fields.length >= 2, `the analysis parts render their fields (found ${fields.length})`);
  fields.forEach((field) => {
    assert.match(field, /ariaLabel=\{[^}]*\bpart\.label\b/,
      `an analysis field is not named by its part, so it is called by its placeholder:\n${field.slice(0, 200)}`);
  });
  // No field anywhere in the workspace is left to its placeholder.
  mathInputs(graph).forEach((field) => assert.match(field, /\bariaLabel=/, `a math field has no name of its own:\n${field.slice(0, 200)}`));
});

test('an announcement offers the typed coordinate only while the typed entry is on screen', () => {
  // The condition the typed x / y entry is rendered under.
  const entryAt = graph.indexOf('value={typedX}');
  assert.notEqual(entryAt, -1, 'the typed x / y entry exists');
  const guards = [...graph.slice(0, entryAt).matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*&&\s*\(/g)];
  const guard = guards.at(-1)?.[1];
  assert.ok(guard, 'the typed entry is rendered under one named condition');
  const definition = graph.match(new RegExp(`const ${guard}\\s*=\\s*([\\s\\S]*?);`))?.[1] || '';
  // End markers are placed once the curve holds the points still; the entry is
  // gone then, so the condition must say so.
  assert.match(definition, /!\s*pointsLocked\b/, `${guard} must be false once the points are held still (the end-marker stage)`);

  // Every offer of the typed route is conditional on that same condition.
  const lines = graph.split('\n');
  const offers = lines.filter((line) => /type an exact coordinate/.test(line));
  assert.ok(offers.length >= 1, 'the typed route is still offered where it exists');
  offers.forEach((line) => {
    assert.match(line, new RegExp(`\\b${guard}\\s*\\?[^:]*type an exact coordinate`),
      `the typed coordinate is offered without checking it is on screen:\n${line.trim().slice(0, 200)}`);
  });
});
