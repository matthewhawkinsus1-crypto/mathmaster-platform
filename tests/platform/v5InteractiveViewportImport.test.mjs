import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { validateQuestionsSemantics } from '../../src/platform/contract/semanticValidation.js';

test('V5 self-rendering tools may use graph as a viewport without a static drawing', () => {
  const intent = {
    schemaVersion: 5,
    assignment: { title: 'Viewport regression', courseId: 'algebra1', assignmentType: 'notesClasswork' },
    sections: [{
      role: 'classwork',
      questions: [
        {
          prompt: 'Set up the axes for the situation and classify the relationship as discrete or continuous.',
          studentActions: ['identifyQuantities', 'classifyContinuity', 'configureAxes'],
          scenario: 'Whole notebooks cost $3 each.',
          quantities: [
            { id: 'notebooks', label: 'Notebooks sold', unit: 'notebooks' },
            { id: 'money', label: 'Money collected', unit: 'dollars' },
          ],
          correctIndependentId: 'notebooks',
          correctDependentId: 'money',
          relationshipType: 'discrete',
          axisRequirements: { requireScale: true, applyToGraph: true },
          graph: { xMin: 0, xMax: 10, yMin: 0, yMax: 30 },
        },
        {
          prompt: 'Create a decreasing continuous exponential.',
          studentActions: ['buildFunctionFromConstraints'],
          allowedFamilies: ['linear', 'quadratic', 'exponential'],
          constraints: [
            { kind: 'family', value: 'exponential' },
            { kind: 'continuity', value: 'continuous' },
            { kind: 'behavior', value: 'decreasing' },
          ],
          graph: { xMin: -5, xMax: 5, yMin: -10, yMax: 15 },
        },
      ],
    }],
  };

  const compiled = compileAuthoringIntentV5(intent).package;
  const questions = compiled.sections.flatMap((section) => section.questions || []);
  const result = validateQuestionsSemantics(questions);
  assert.deepEqual(result.errors, []);
});

test('V5 point interpretation preserves target, quantities, units, and choices', () => {
  const intent = {
    schemaVersion: 5,
    assignment: { title: 'Context regression', courseId: 'algebra1', assignmentType: 'notesClasswork' },
    sections: [{
      role: 'classwork',
      questions: [{
        prompt: 'Interpret the starting point in context.',
        scenario: 'Wristbands cost $4 each.',
        studentActions: ['interpretPointInContext'],
        target: { kind: 'startingPoint', coordinates: [0, 0], label: '(0, 0)' },
        responseMode: 'builder',
        quantities: {
          x: { id: 'wristbands', label: 'Wristbands sold', unit: 'wristbands' },
          y: { id: 'money', label: 'Money collected', unit: 'dollars' },
        },
        quantityChoices: [
          { id: 'wristbands', label: 'Wristbands sold', unit: 'wristbands' },
          { id: 'money', label: 'Money collected', unit: 'dollars' },
        ],
        graph: { functions: [{ type: 'line', m: 4, b: 0 }], xMin: 0, xMax: 8, yMin: 0, yMax: 32 },
      }],
    }],
  };

  const compiled = compileAuthoringIntentV5(intent).package.sections[0].questions[0];
  assert.deepEqual(compiled.target?.coordinates, [0, 0]);
  assert.equal(compiled.quantities?.x?.unit, 'wristbands');
  assert.equal(compiled.quantities?.y?.unit, 'dollars');
  assert.equal(Array.isArray(compiled.quantityChoices), true);
});
