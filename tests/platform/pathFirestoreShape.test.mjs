import test from 'node:test';
import assert from 'node:assert/strict';

import pathFirestoreShape from '../../functions/lib/pathFirestoreShape.js';

const { firestoreSafePathRecord, cellsForRow } = pathFirestoreShape;

function directNestedArrayPaths(value, path = '$', found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (Array.isArray(entry)) found.push(`${path}[${index}]`);
      directNestedArrayPaths(entry, `${path}[${index}]`, found);
    });
    return found;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => {
      directNestedArrayPaths(entry, `${path}.${key}`, found);
    });
  }
  return found;
}

test('top-level Path table rows are Firestore-safe row maps', () => {
  const stored = firestoreSafePathRecord({
    id: 'table-top-level',
    stimulus: {
      table: {
        headers: ['x', 'y'],
        rows: [[1, 2], [3, 4]],
      },
    },
  });

  assert.deepEqual(stored.stimulus.table.rows, [
    { cells: [1, 2] },
    { cells: [3, 4] },
  ]);
  assert.deepEqual(directNestedArrayPaths(stored), []);
});

test('variant table rows are normalized recursively before Firestore writes', () => {
  const stored = firestoreSafePathRecord({
    id: 'table-in-variant',
    variants: [
      {
        coverageKey: 'table-variant',
        stimulus: {
          kind: 'multipleRepresentation',
          table: {
            headers: ['Input', 'Output'],
            rows: [
              ['{{x0}}', '{{y0}}'],
              ['{{x1}}', '{{y1}}'],
            ],
          },
        },
      },
    ],
  });

  assert.deepEqual(stored.variants[0].stimulus.table.rows, [
    { cells: ['{{x0}}', '{{y0}}'] },
    { cells: ['{{x1}}', '{{y1}}'] },
  ]);
  assert.deepEqual(directNestedArrayPaths(stored), []);
});

test('ordinary arrays inside variant maps remain ordinary arrays', () => {
  const stored = firestoreSafePathRecord({
    id: 'generator-choice',
    variants: [
      {
        generator: {
          parameters: {
            maxT: {
              type: 'choice',
              values: [4, 6, 8],
            },
          },
        },
      },
    ],
  });

  assert.deepEqual(stored.variants[0].generator.parameters.maxT.values, [4, 6, 8]);
});

test('persisted row maps remain readable by the shared row helper', () => {
  assert.deepEqual(cellsForRow({ cells: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(cellsForRow(['a', 'b']), ['a', 'b']);
});
