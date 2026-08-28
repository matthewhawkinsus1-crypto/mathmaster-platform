import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  choiceSeed,
  stableShuffleChoices,
  strengthenTwoChoiceSet,
} from '../../src/platform/interaction/choiceOptions.js';

test('finite choices are strengthened and keep a stable shuffled order', () => {
  const strengthened = strengthenTwoChoiceSet(['discrete', 'continuous']);
  assert.equal(strengthened.length, 4);
  assert.ok(strengthened.includes('both discrete and continuous'));
  assert.ok(strengthened.includes('neither discrete nor continuous'));

  const first = stableShuffleChoices(strengthened, choiceSeed('question-1', 'continuity'));
  const second = stableShuffleChoices(strengthened, choiceSeed('question-1', 'continuity'));
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, strengthened, 'runtime should not preserve authored answer order');
});

test('V5 uses the balance solver, faithful graph reading, and complete relation analysis', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Tool fidelity regression',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
    },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [
        {
          standard: 'A.5A',
          prompt: 'Solve the equation 8y + 13 = 29 − 3y.',
          studentActions: ['solveEquation'],
          equation: '8y + 13 = 29 - 3y',
        },
        {
          standard: 'A.6A',
          prompt: 'The graph has closed endpoints at (0, 2) and (4, 2) and a highest point at (2, 6). Write the domain and range in words and using inequalities.',
          studentActions: ['readGraph', 'stateDomain', 'stateRange'],
          function: {
            family: 'quadratic',
            a: -1,
            h: 2,
            k: 6,
            domain: { min: 0, max: 4, minClosed: true, maxClosed: true },
          },
          responses: [
            { id: 'domainWords', label: 'Domain in words', answer: 'all real numbers from 0 through 4', type: 'text' },
            { id: 'domainInequality', label: 'Domain using inequalities', answer: '0 ≤ x ≤ 4' },
            { id: 'rangeWords', label: 'Range in words', answer: 'all real numbers from 2 through 6', type: 'text' },
            { id: 'rangeInequality', label: 'Range using inequalities', answer: '2 ≤ y ≤ 6' },
          ],
        },
        {
          standard: 'A.7A',
          prompt: 'Plot the relation. Then classify its family, behavior, and continuity.',
          studentActions: ['plotRelation', 'classifyFunction', 'analyzeIncreasing', 'analyzeDecreasing', 'classifyContinuity'],
          relation: [
            { x: -2, y: 1 },
            { x: -1, y: -2 },
            { x: 0, y: -3 },
            { x: 1, y: -2 },
            { x: 2, y: 1 },
          ],
          responses: [
            { id: 'family', label: 'Function family', type: 'choice', options: ['linear', 'quadratic', 'exponential'], answer: 'quadratic' },
            { id: 'behavior', label: 'Behavior', type: 'choice', options: ['increasing', 'decreasing', 'both increasing and decreasing'], answer: 'both increasing and decreasing' },
            { id: 'continuity', label: 'Discrete or continuous', type: 'choice', options: ['discrete', 'continuous'], answer: 'discrete' },
          ],
        },
      ],
    }],
  });

  const [solve, graphRead, relation] = compiled.package.sections[0].questions;

  assert.equal(solve.type, 'stepAlgebra');
  assert.equal(solve.equation, '8y + 13 = 29 - 3y');

  assert.equal(graphRead.type, 'multiAnswer');
  assert.equal(graphRead.answerFields.length, 4);
  assert.equal(graphRead.graph.functions[0].type, 'quadratic');
  assert.deepEqual(graphRead.graph.functions[0].domain, {
    min: 0,
    max: 4,
    minClosed: true,
    maxClosed: true,
  });
  assert.equal(graphRead.equationLatex, undefined);

  assert.equal(relation.type, 'relationMapping');
  assert.ok(relation.ask.includes('plot'));
  assert.ok(relation.ask.includes('mapping'));
  assert.equal(relation.ask.includes('isFunction'), false, 'authored response fields own the requested classifications');
  assert.equal(relation.answerFields.length, 3);
  assert.equal(relation.plotEntryMode, 'manual');
});

test('student-facing renderers contain the fidelity safeguards', async () => {
  const [engine, graph, relation] = await Promise.all([
    readFile(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/GraphDisplay.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/tools/relationMapping/RelationMapping.jsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(engine, /import EquationGrader/);
  assert.match(engine, /Retired legacy answer-box solver/);
  assert.match(graph, /restrictedFunctionEndpoints/);
  assert.match(graph, /marker: boundary\.closed \? 'closed' : 'open'/);
  assert.match(relation, /Move the pointer over the grid to see the exact coordinate/);
  assert.match(relation, /allowTypedPlot \?/);
  assert.match(relation, /analysisFields\.map/);
  assert.match(relation, /every input has exactly one output/);
});
