import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  firestoreSafeValue,
  firestoreSafeStimulus,
  firestoreSafePathRecord,
} = require('../../functions/lib/pathFirestoreShape.js');

const containsUndefined = (value) => {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some((entry) => containsUndefined(entry));
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => containsUndefined(entry));
  }
  return false;
};

test('Firestore boundary removes undefined object fields without shifting ordered arrays', () => {
  const safe = firestoreSafeValue({
    topLevelMissing: undefined,
    stimulus: {
      kind: 'graph',
      optionalLabel: undefined,
      graph: { xMin: undefined, xMax: 10 },
      orderedValues: ['first', undefined, 'third'],
      nested: { keep: true, omit: undefined },
    },
  });

  assert.deepEqual(safe, {
    stimulus: {
      kind: 'graph',
      graph: { xMax: 10 },
      orderedValues: ['first', null, 'third'],
      nested: { keep: true },
    },
  });
  assert.equal(containsUndefined(safe), false);
});

test('table normalization still removes undefined values inside stimulus', () => {
  const safe = firestoreSafeStimulus({
    kind: 'table',
    title: undefined,
    table: {
      headers: ['x', 'y'],
      caption: undefined,
      rows: [
        ['1', '2'],
        { cells: ['3', undefined] },
      ],
    },
  });

  assert.equal(Object.hasOwn(safe, 'title'), false);
  assert.equal(Object.hasOwn(safe.table, 'caption'), false);
  assert.deepEqual(safe.table.rows, [
    { cells: ['1', '2'] },
    { cells: ['3', ''] },
  ]);
  assert.equal(containsUndefined(safe), false);
});

test('whole Path records are clean before Firestore writes', () => {
  const safe = firestoreSafePathRecord({
    id: 'undefined-stimulus-item',
    unusedOptionalField: undefined,
    stimulus: {
      kind: 'context',
      title: undefined,
      description: 'A valid scenario.',
      metadata: {
        unit: undefined,
        source: 'authored',
      },
      choices: [
        { label: 'A', note: undefined },
        { label: 'B', note: 'kept' },
      ],
    },
  });

  assert.equal(containsUndefined(safe), false);
  assert.equal(Object.hasOwn(safe, 'unusedOptionalField'), false);
  assert.equal(Object.hasOwn(safe.stimulus, 'title'), false);
  assert.equal(Object.hasOwn(safe.stimulus.metadata, 'unit'), false);
  assert.deepEqual(safe.stimulus.choices, [
    { label: 'A' },
    { label: 'B', note: 'kept' },
  ]);
});
