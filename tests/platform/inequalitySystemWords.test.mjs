/*
 * ONE INEQUALITY IS NOT A SYSTEM (F-SW-SYSTEM-WORDS, PR #537 walkthrough).
 *
 * On a one-inequality lesson (Algebra I M3 T2 L4) the Systems Workspace said
 * "Find overlap / Combine regions", "The overlap of the shaded sides is
 * hatched" and "Is the point a solution to the entire system?". With one
 * constraint it now says "Check your region" and "Is the point a solution?";
 * with two or more, exactly what it said before (inequalitySystemWords.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ONE_CONSTRAINT_WORDS, wordsFor } from '../../src/tools/systemsWorkspace/inequalitySystemWords.js';
import { inequalityGraphMarksText } from '../../src/tools/systemsWorkspace/inequalityGraphMarks.js';
import { componentSource, executableSource } from './helpers/sourceContract.mjs';

const SYSTEM_WORDS = /overlap|system|combine|every constraint|each inequality|every inequality|\bregions\b|individual/i;

test('with one constraint the workspace speaks of one inequality; with two or more, as before', () => {
  const one = wordsFor(1);
  assert.equal(one('Find overlap / Combine regions'), 'Check your region');
  assert.equal(one('Combine the regions'), 'Check your region');
  assert.equal(one('Is the point a solution to the entire system?'), 'Is the point a solution?');
  assert.equal(one('The overlap of the shaded sides is hatched.'), 'The shaded side is hatched.');
  for (const count of [2, 3, 6]) {
    for (const sentence of Object.keys(ONE_CONSTRAINT_WORDS)) assert.equal(wordsFor(count)(sentence), sentence, `${count} constraints: "${sentence}"`);
  }
  assert.equal(one('A sentence the table does not know.'), 'A sentence the table does not know.');
  assert.equal(wordsFor(0)('Systems of Inequalities'), 'Systems of Inequalities', 'not a student-build count');
  for (const [sentence, oneWording] of Object.entries(ONE_CONSTRAINT_WORDS)) {
    assert.doesNotMatch(oneWording, SYSTEM_WORDS, `"${oneWording}" (for "${sentence}")`);
  }
});

test('the graph says what is hatched in the same words', () => {
  const entry = { visible: true, style: 'solid', shadePoint: [0, 6] };
  const line = { A: -1, B: 1, C: -1, relation: '>=' };
  const marks = (count) => inequalityGraphMarksText({
    build: Array.from({ length: count }, () => entry),
    effectiveLines: Array.from({ length: count }, () => line),
    buildConfig: { boundary: true, lineStyle: true, shading: true },
    workingConstraints: Array.from({ length: count }, () => line),
    bounds: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
    combined: true,
    studentPolygon: [[0, 1], [0, 10], [-6, 10]],
  });
  assert.equal(marks(1), 'Boundary line 1: solid. One side of boundary line 1 is shaded. The shaded side is hatched.');
  assert.match(marks(2), /The overlap of the shaded sides is hatched\.$/);
});

// ------------------------------------------------------- the screen is held to it
const sources = {
  mode: executableSource(componentSource('src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx')),
  panels: executableSource(componentSource('src/tools/systemsWorkspace/InequalityBuildPanels.jsx')),
  marks: executableSource(componentSource('src/tools/systemsWorkspace/inequalityGraphMarks.js')),
  workspace: executableSource(componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx')),
};

test('every sentence with a one-constraint wording is one the screen says, through that wording', () => {
  const all = Object.values(sources).join('\n');
  for (const sentence of Object.keys(ONE_CONSTRAINT_WORDS)) {
    assert.ok(all.includes(`'${sentence}'`), `"${sentence}" is still said on screen (edit both together)`);
  }
  assert.match(sources.mode, /\n\s*const said = wordsFor\(constraintCount\);/);
  assert.match(sources.mode, /phaseCard\('combine', said\('Combine the regions'\),/);
  assert.match(sources.mode, /onClick=\{combineRegions\} disabled=\{!allConstraintsComplete\}>\{said\('Find overlap \/ Combine regions'\)\}<\/button>/);
  assert.match(sources.mode, /\? said\('Your overlap is hatched on the graph\.'\)/);
  assert.match(sources.panels, /const said = wordsFor\(count\);/);
  assert.match(sources.panels, /legend=\{said\('Is the point a solution to the entire system\?'\)\}/);
  assert.match(sources.panels, /legend=\{said\('Does this point lie exactly on one of the boundary lines\?'\)\}/);
  assert.match(sources.workspace, /mode === 'inequalities' \? said\('Systems of Inequalities'\)/);
});
