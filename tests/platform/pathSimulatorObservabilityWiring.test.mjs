import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('teacher runtime exposes forced secure Path outcomes', () => {
  const source = read('src/platform/simulation/teacherPathRuntime.js');
  assert.match(source, /forceCurrentQuestionOutcome/);
  assert.match(source, /forcedVerdict/);
});

test('production container registers a simulation controller without changing live students', () => {
  const source = read('src/components/student/MyMathPathProductionContainer.jsx');
  assert.match(source, /onSimulationController/);
  assert.match(source, /forceOutcomeFromSimulator/);
  assert.match(source, /onSimulationEvent/);
});

test('simulator shows event feedback and secure-bank quality information', () => {
  const source = read('src/components/teacher/PathSimulator.jsx');
  assert.match(source, /Simulation event log/);
  assert.match(source, /Current Path question QA/);
  assert.match(source, /buildPathQuestionRevisionBrief/);
});

test('simulated student forwards bank and runtime observability callbacks', () => {
  const source = read('src/components/teacher/SimulatedStudentExperience.jsx');
  assert.match(source, /onPathBankLoaded/);
  assert.match(source, /onSimulationController/);
  assert.match(source, /onSimulationEvent/);
});
