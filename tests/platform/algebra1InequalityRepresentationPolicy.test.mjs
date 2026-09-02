import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inequalitySolutionRepresentationStages,
  isAlgebraOneQuestion,
} from '../../src/platform/curriculum/inequalityRepresentationPolicy.js';

test('Algebra I inequalities use a number-line graph without interval notation', () => {
  const question = { standard: 'A.5B' };
  assert.equal(isAlgebraOneQuestion(question), true);
  assert.deepEqual(inequalitySolutionRepresentationStages(question), ['graph']);
});

test('Algebra I is recognized through normalized alignment keys', () => {
  const question = { alignments: [{ key: 'texas:A.5B' }] };
  assert.equal(isAlgebraOneQuestion(question), true);
  assert.deepEqual(inequalitySolutionRepresentationStages(question), ['graph']);
});

test('Algebra I suppresses an old explicit interval request at runtime', () => {
  const question = {
    assessedConstruct: 'A.5B',
    solutionRepresentations: ['graph', 'interval'],
  };
  assert.deepEqual(inequalitySolutionRepresentationStages(question), ['graph']);
});

test('higher-course inequalities preserve graph plus interval notation by default', () => {
  const question = { standard: 'A2.7I' };
  assert.equal(isAlgebraOneQuestion(question), false);
  assert.deepEqual(inequalitySolutionRepresentationStages(question), ['graph', 'interval']);
});

test('an authored higher-course representation list is respected', () => {
  const question = {
    standard: 'A2.7I',
    solutionRepresentations: ['graph'],
  };
  assert.deepEqual(inequalitySolutionRepresentationStages(question), ['graph']);
});

test('representSolution false disables the extra representation step', () => {
  assert.deepEqual(
    inequalitySolutionRepresentationStages({ standard: 'A.5B', representSolution: false }),
    [],
  );
});
