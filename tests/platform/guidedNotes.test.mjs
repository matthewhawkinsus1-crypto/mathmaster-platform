import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthoredGuidedNotes, isMeaningfulGuidedInstruction, resolveGuidedNotes } from '../../src/guidedNotes.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

test('generic interface filler is rejected instead of shown as guided math notes', () => {
  assert.equal(isMeaningfulGuidedInstruction('Read the prompt and identify what must be entered.'), false);
  assert.equal(isMeaningfulGuidedInstruction('Complete the current response field.'), false);
  assert.equal(isMeaningfulGuidedInstruction('Substitute each x-value into the function rule and keep exact decimal outputs.'), true);
});

test('authored guided notes win when they contain meaningful mathematics', () => {
  const question = {
    guidedNotes: { steps: [
      { title: 'Use the rate', instruction: 'Multiply each time input by the unit rate in the equation to determine the corresponding water volume.' },
      { title: 'No filler', instruction: 'Check your answer.' },
    ] },
  };
  const notes = getAuthoredGuidedNotes(question);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'Use the rate');
});

test('workflow questions get stage-specific guidance tied to the same stage ids', () => {
  const question = {
    type: 'functionGraph',
    continuity: 'continuous',
    workflow: [
      { id: 'table', kind: 'tableInput', prompt: 'Complete the table.' },
      { id: 'graph', kind: 'functionGraph', prompt: 'Build the graph.', source: { fromStage: 'table' } },
      { id: 'domain', kind: 'domainInput', notation: 'interval' },
    ],
  };
  const notes = resolveGuidedNotes(question);
  assert.deepEqual(notes.map((entry) => entry.stageId), ['table', 'graph', 'domain']);
  assert.match(notes[0].instruction, /Substitute/i);
  assert.match(notes[1].instruction, /Plot accurate key points/i);
  assert.match(notes[2].instruction, /allowable input/i);
});

test('authored-only mode hides a panel when no authored math guidance exists', () => {
  const question = { type: 'algebra', prompt: 'Solve 2x+5=17.' };
  assert.equal(resolveGuidedNotes(question, { mode: 'authoredOnly' }).length, 0);
  assert.ok(resolveGuidedNotes(question, { mode: 'automatic' }).length > 0);
});

test('off mode always suppresses guided notes', () => {
  const question = { type: 'table', guidedSteps: ['Substitute each input into the function rule.'] };
  assert.equal(resolveGuidedNotes(question, { mode: 'off' }).length, 0);
});

test('V5 compiler preserves authored guidedNotes for the runtime', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Guided Notes Test', courseId: 'algebra1' },
    activities: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A.3C',
        prompt: 'Complete the table for f(x)=2x+1.',
        studentActions: ['completeTable'],
        function: { family: 'linear', m: 2, b: 1 },
        table: { columns: ['x', 'f(x)'], rows: [{ x: 0, 'f(x)': null }, { x: 1, 'f(x)': null }] },
        guidedNotes: { steps: [{ title: 'Substitute', instruction: 'Substitute each x-value into the linear function rule and simplify the matching output.' }] },
      }],
    }],
  });
  assert.equal(compiled.package.activities[0].questions[0].guidedNotes.steps[0].title, 'Substitute');
});
