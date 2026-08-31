import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  cellsForRow,
  firestoreSafeStimulus,
  firestoreSafePathRecord,
} = require('../../functions/lib/pathFirestoreShape.js');
const mathPath = require('../../functions/lib/mathPath.js');

const containsDirectNestedArray = (value, parentIsArray = false) => {
  if (Array.isArray(value)) {
    if (parentIsArray) return true;
    return value.some((entry) => containsDirectNestedArray(entry, true));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => containsDirectNestedArray(entry, false));
  }
  return false;
};

test('Path bank table stimuli cross the Firestore boundary without nested arrays', () => {
  const record = firestoreSafePathRecord({
    id: 'table-item',
    stimulus: {
      kind: 'table',
      table: {
        headers: ['x', 'y'],
        rows: [['-2', '11'], ['0', '5'], ['2', '-1']],
      },
    },
  });

  assert.deepEqual(record.stimulus.table.rows, [
    { cells: ['-2', '11'] },
    { cells: ['0', '5'] },
    { cells: ['2', '-1'] },
  ]);
  assert.equal(containsDirectNestedArray(record), false);
});

test('Firestore-safe table rows are idempotent and preserve their cells', () => {
  const stimulus = firestoreSafeStimulus({
    kind: 'table',
    table: { headers: ['a', 'b'], rows: [{ cells: ['1', '2'] }, { cells: ['3', '4'] }] },
  });
  assert.deepEqual(stimulus.table.rows, [{ cells: ['1', '2'] }, { cells: ['3', '4'] }]);
  assert.deepEqual(cellsForRow(stimulus.table.rows[1]), ['3', '4']);
});

test('sanitized Path session questions keep table data Firestore-safe', () => {
  const question = mathPath.buildSanitizedQuestion({
    familyId: 'family',
    questionType: 'response',
    prompt: 'Use the table.',
    responseFields: [],
    stimulus: {
      kind: 'table',
      table: { headers: ['x', 'y'], rows: [['1', '3'], ['2', '5']] },
    },
  }, { questionInstanceId: 'qi-1', attemptsAllowed: 3 });

  assert.deepEqual(question.stimulus.table.rows, [{ cells: ['1', '3'] }, { cells: ['2', '5'] }]);
  assert.equal(containsDirectNestedArray(question), false);
});

test('sanitizer also accepts a table already read back from Firestore', () => {
  const question = mathPath.buildSanitizedQuestion({
    familyId: 'family',
    prompt: 'Use the stored table.',
    responseFields: [],
    stimulus: {
      kind: 'table',
      table: { headers: ['x', 'y'], rows: [{ cells: ['4', '9'] }, { cells: ['5', '11'] }] },
    },
  }, { questionInstanceId: 'qi-2', attemptsAllowed: 3 });

  assert.deepEqual(question.stimulus.table.rows, [{ cells: ['4', '9'] }, { cells: ['5', '11'] }]);
});

test('secure Path sampled curves carry visible points without leaking their hidden equation', () => {
  const question = mathPath.buildSanitizedQuestion({
    familyId: 'quadratic-graph-family',
    prompt: 'Write the quadratic equation from the graph.',
    responseFields: [{ id: 'answer', expected: 'y=(x-1)^2-4' }],
    stimulus: {
      kind: 'graph',
      graph: {
        xMin: -4,
        xMax: 6,
        yMin: -6,
        yMax: 8,
        curves: [{
          label: 'Parabola',
          points: [
            [-2, 5], [-1, 0], [0, -3], [1, -4], [2, -3], [3, 0], [4, 5],
          ],
          expectedEquation: 'y=(x-1)^2-4',
        }],
        hiddenCoefficients: { a: 1, h: 1, k: -4 },
      },
    },
  }, { questionInstanceId: 'qi-curve', attemptsAllowed: 3 });

  assert.deepEqual(question.stimulus.graph.curves, [{
    label: 'Parabola',
    points: [
      { x: -2, y: 5 }, { x: -1, y: 0 }, { x: 0, y: -3 }, { x: 1, y: -4 },
      { x: 2, y: -3 }, { x: 3, y: 0 }, { x: 4, y: 5 },
    ],
  }]);
  const serialized = JSON.stringify(question.stimulus.graph);
  assert.equal(serialized.includes('expectedEquation'), false);
  assert.equal(serialized.includes('hiddenCoefficients'), false);
  assert.equal(containsDirectNestedArray(question.stimulus), false);
});

test('secure Path graph stimuli keep only visible graph information', () => {
  const question = mathPath.buildSanitizedQuestion({
    familyId: 'graph-family',
    prompt: 'Write an equation from the graph.',
    responseFields: [{ id: 'answer', expected: 'y=2x+1' }],
    stimulus: {
      kind: 'graph',
      graph: {
        xMin: -6,
        xMax: 6,
        yMin: -8,
        yMax: 8,
        ariaLabel: 'A line and shaded half-plane',
        points: [{ x: 1, y: 3, label: 'P' }],
        lines: [{
          label: 'Boundary',
          boundaryStyle: 'dashed',
          points: [[0, 1], [2, 5]],
          expectedEquation: 'y=2x+1',
        }],
        shading: [{ lineIndex: 0, side: 'above', correctRelation: '>' }],
        hiddenAnswer: 'must-not-travel',
      },
    },
  }, { questionInstanceId: 'qi-graph', attemptsAllowed: 3 });

  assert.deepEqual(question.stimulus.graph.lines[0], {
    label: 'Boundary',
    boundaryStyle: 'dashed',
    points: [{ x: 0, y: 1 }, { x: 2, y: 5 }],
  });
  assert.deepEqual(question.stimulus.graph.shading, [{ lineIndex: 0, side: 'above' }]);
  assert.deepEqual(question.stimulus.graph.points, [{ x: 1, y: 3, label: 'P' }]);
  const serialized = JSON.stringify(question.stimulus.graph);
  assert.equal(serialized.includes('expectedEquation'), false);
  assert.equal(serialized.includes('correctRelation'), false);
  assert.equal(serialized.includes('must-not-travel'), false);
  assert.equal(containsDirectNestedArray(question.stimulus), false);
});
