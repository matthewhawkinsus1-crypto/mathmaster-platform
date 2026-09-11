import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { region } from './helpers/sourceContract.mjs';

const read = (file) => fs.readFileSync(file, 'utf8');
const sequences = read('src/tools/sequenceExplorer/SequenceExplorer.jsx');
const systems = read('src/tools/systemsWorkspace/SystemsWorkspace.jsx');
const legacySystem = read('src/SystemGrader.jsx');
const workViewCss = read('src/components/common/WorkViewShell.css');

test('every sequence mode owns one complete Work View rather than a graph-only shell', () => {
  for (const name of ['AnalyzeSequence', 'FullSequenceBridge', 'RuleBridge', 'MissingTerm', 'PartialSum', 'CompareSequences']) {
    const body = region(sequences, `function ${name}`, name === 'CompareSequences' ? undefined : '\nfunction ', { label: name });
    assert.match(body, /<EnlargeableFigure/);
    assert.match(body, /undo:\s*undoHistory\.capability/);
  }
  assert.match(region(sequences, 'function FullSequenceBridge', '\nfunction RuleBridge'), /tableData:[\s\S]*pointEditing:[\s\S]*equationInput:/);
  assert.doesNotMatch(region(sequences, 'function FullSequenceBridge', '\nfunction RuleBridge'), />Undo last point</);
});

test('every systems workspace mode carries equations, controls and Universal Undo', () => {
  for (const [name, end] of [['LinearMode', 'InequalityMode'], ['InequalityMode', 'LinearQuadraticMode'], ['LinearQuadraticMode', 'MatrixMode'], ['MatrixMode', 'MODE_TASKS']]) {
    const body = region(systems, `function ${name}`, `\nfunction ${end}`.replace('function MODE_TASKS', 'const MODE_TASKS'), { label: name });
    assert.match(body, /<EnlargeableFigure/);
    assert.match(body, /undo:\s*undoHistory\.capability/);
    assert.match(body, /equationInput:/);
    assert.match(body, /primaryActions:/);
  }
  assert.match(legacySystem, /<EnlargeableFigure label="System of equations workspace"/);
  assert.match(legacySystem, /<GraphDisplay[^>]*enlargeable=\{false\}/);
});

test('Stage 3B graph planes opt out of nested Work Views', () => {
  assert.equal((sequences.match(/<CoordinatePlane/g) || []).length, (sequences.match(/enlargeable=\{false\}/g) || []).length);
  assert.equal((systems.match(/<CoordinatePlane/g) || []).length, (systems.match(/enlargeable=\{false\}/g) || []).length);
});

test('mobile equation editing keeps the reusable mathematical context sticky', () => {
  const keyboardRule = region(workViewCss, 'KEEP THE MATHEMATICAL REFERENCE', 'NORMAL ASSIGNMENT CHROME');
  assert.match(keyboardRule, /data-keyboard="open"/);
  assert.match(keyboardRule, /:has\(input:focus, textarea:focus, select:focus\)/);
  assert.match(keyboardRule, /\.mathmaster-tool-panel:first-child/);
  assert.match(keyboardRule, /position:\s*sticky !important/);
});
