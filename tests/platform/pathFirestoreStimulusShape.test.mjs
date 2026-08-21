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
