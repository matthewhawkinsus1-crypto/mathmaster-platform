import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInstructionalScopeV5 } from '../../src/platform/curriculum/instructionalScope.js';

const base = (lessons, questions) => ({
  schemaVersion: 5,
  assignment: { courseId: 'algebra1', title: 'Scope test' },
  lessonMetadata: { provider: 'Bluebonnet', course: 'Algebra I', module: 1, topic: 1, lessons },
  sections: [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions }],
});

const twoGraphs = [
  { id: 'a', function: { family: 'linear', m: 1, b: 0 } },
  { id: 'b', function: { family: 'quadratic', a: 1, h: 0, k: 0 } },
];

test('Algebra I blocks formal increasing/decreasing interval notation', () => {
  const result = validateInstructionalScopeV5(base([3,4], [{
    prompt: 'State where the function increases and decreases.',
    studentActions: ['analyzeIncreasing','analyzeDecreasing'],
    notation: 'interval',
    function: { family: 'quadratic', a: 1, h: 0, k: 0 },
  }]));
  assert.ok(result.errors.some((e) => e.includes('Algebra I instructional ceiling')));
});

test('Lessons 3-4 allow recognizing an absolute extremum characteristic from displayed graphs', () => {
  const result = validateInstructionalScopeV5(base([3,4], [{
    prompt: 'Which graph has an absolute maximum?',
    studentActions: ['compareGraphs'],
    candidateGraphs: twoGraphs,
  }]));
  assert.equal(result.errors.length, 0);
});

test('Lessons 3-4 block exact extrema analysis', () => {
  const result = validateInstructionalScopeV5(base([3,4], [{
    prompt: 'Find the maximum value.',
    studentActions: ['findMaximum'],
    function: { family: 'quadratic', a: -1, h: 0, k: 4 },
  }]));
  assert.ok(result.errors.some((e) => e.includes('current lesson depth')));
});

test('Lessons 3-4 block constructing a function from an extremum', () => {
  const result = validateInstructionalScopeV5(base([3,4], [{
    prompt: 'Create a quadratic with an absolute maximum.',
    studentActions: ['buildFunctionFromConstraints'],
    constraints: [{ kind: 'family', value: 'quadratic' }, { kind: 'extremum', value: 'maximum' }],
  }]));
  assert.ok(result.errors.some((e) => e.includes('constructing a function from a maximum/minimum')));
});

test('Lessons 1-2 block absolute-extremum vocabulary as an assessed target', () => {
  const result = validateInstructionalScopeV5(base([1,2], [{
    prompt: 'Which graph has an absolute minimum?',
    studentActions: ['compareGraphs'],
    candidateGraphs: twoGraphs,
  }]));
  assert.ok(result.errors.some((e) => e.includes('current lesson depth')));
});

test('Lessons 1-2 reject graphical-behavior classification with no displayed graph', () => {
  const result = validateInstructionalScopeV5(base([1,2], [{
    prompt: 'Classify the behavior of f(x)=-4x+7.',
    assessedConstruct: 'graphicalBehavior',
    studentActions: ['multipleResponses'],
    responses: [
      { id: 'behavior', label: 'Behavior', answer: 'decreasing', options: ['increasing','decreasing','constant'] },
      { id: 'shape', label: 'Graph shape', answer: 'straight line', options: ['straight line','smooth curve','isolated points'] },
    ],
  }]));
  assert.ok(result.errors.some((e) => e.includes('representation fidelity')));
});

test('Lessons 1-2 allow graphical-behavior classification when a function is supplied for display', () => {
  const result = validateInstructionalScopeV5(base([1,2], [{
    prompt: 'Use the displayed graph to classify its behavior and shape.',
    assessedConstruct: 'graphicalBehavior',
    studentActions: ['multipleResponses'],
    function: { family: 'linear', m: -4, b: 7 },
    responses: [
      { id: 'behavior', label: 'Behavior', answer: 'decreasing', options: ['increasing','decreasing','constant'] },
      { id: 'shape', label: 'Graph shape', answer: 'straight line', options: ['straight line','smooth curve','isolated points'] },
    ],
  }]));
  assert.equal(result.errors.length, 0);
});

test('compareGraphs requires an actual displayed graph choice', () => {
  const result = validateInstructionalScopeV5(base([3,4], [{
    prompt: 'Compare the two graphs.',
    studentActions: ['compareGraphs'],
  }]));
  assert.ok(result.errors.some((e) => e.includes('at least one displayed graph choice')));
});
