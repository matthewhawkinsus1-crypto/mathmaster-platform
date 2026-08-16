import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

test('simulator injects coverage from its bank snapshot', () => {
  const source = read('src/components/teacher/SimulatedStudentExperience.jsx');
  assert.match(source, /buildSimulatorCoverageIndex/);
  assert.match(source, /coverageOverride=\{simulatorCoverage\}/);
});

test('student Path accepts an injected coverage source', () => {
  const source = read('src/components/student/MyMathPathApp.jsx');
  assert.match(source, /coverageOverride\s*=\s*null/);
});

test('server mutations rebuild coverage', () => {
  const source = read('functions/index.js');
  assert.match(source, /async function rebuildStoredPathCoverage/);
  assert.match(source, /Repairing stale Path coverage/);
});
