import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreControlledSort, scoreOpenSort, validateSortQuestion } from '../../src/tools/openSortBoard/openSortMath.js';

const items = ['A','B','C','D','E','F'].map((id) => ({ id }));
const schemes = [
  { id: 'family', groups: [
    { itemIds: ['A','B'] }, { itemIds: ['C','D'] }, { itemIds: ['E','F'] },
  ] },
  { id: 'behavior', groups: [
    { itemIds: ['A','E'] }, { itemIds: ['B','F'] }, { itemIds: ['C','D'] },
  ] },
];

test('open sort accepts any authored valid partition regardless of group order or names', () => {
  const response = [
    { name: 'curved turners', itemIds: ['D','C'] },
    { name: 'decreasing', itemIds: ['F','B'] },
    { name: 'increasing', itemIds: ['E','A'] },
  ];
  const result = scoreOpenSort({ items, responseGroups: response, validSchemes: schemes });
  assert.equal(result.isCorrect, true);
  assert.equal(result.matchedSchemeId, 'behavior');
  assert.equal(result.score, 1);
});

test('open sort gives partial credit without treating an incomplete sort as exact', () => {
  const response = [{ itemIds: ['A','B'] }, { itemIds: ['C','D'] }];
  const result = scoreOpenSort({ items, responseGroups: response, validSchemes: schemes });
  assert.equal(result.isCorrect, false);
  assert.ok(result.score > 0 && result.score < 1);
});

test('open sort validator rejects schemes that omit or duplicate cards', () => {
  const errors = validateSortQuestion({
    items,
    validSchemes: [{ groups: [{ itemIds: ['A','B','C'] }, { itemIds: ['C','D','E'] }] }],
  });
  assert.ok(errors.some((message) => message.includes('every item')));
  assert.ok(errors.some((message) => message.includes('more than one group')));
});


test('controlled sort keeps category identity instead of accepting swapped bins', () => {
  const controlledItems = ['A','B','C','D','E','F'].map((id) => ({ id }));
  const validSchemes = [{
    id: 'direction',
    groups: [
      { id: 'positive', itemIds: ['A','D'] },
      { id: 'negative', itemIds: ['B','E'] },
      { id: 'none', itemIds: ['C','F'] },
    ],
  }];

  const correct = scoreControlledSort({
    items: controlledItems,
    responseGroups: [
      { id: 'positive', itemIds: ['D','A'] },
      { id: 'negative', itemIds: ['E','B'] },
      { id: 'none', itemIds: ['F','C'] },
    ],
    validSchemes,
  });
  assert.equal(correct.isCorrect, true);

  const swapped = scoreControlledSort({
    items: controlledItems,
    responseGroups: [
      { id: 'positive', itemIds: ['B','E'] },
      { id: 'negative', itemIds: ['A','D'] },
      { id: 'none', itemIds: ['C','F'] },
    ],
    validSchemes,
  });
  assert.equal(swapped.isCorrect, false, 'positive and negative bins are not interchangeable in controlled mode');
});

test('controlled sort validator requires fixed labeled categories that match scheme ids', () => {
  const valid = validateSortQuestion({
    mode: 'controlled',
    items,
    categories: [
      { id: 'positive', label: 'Positive correlation' },
      { id: 'negative', label: 'Negative correlation' },
      { id: 'none', label: 'No correlation' },
    ],
    validSchemes: [{
      groups: [
        { id: 'positive', itemIds: ['A','B'] },
        { id: 'negative', itemIds: ['C','D'] },
        { id: 'none', itemIds: ['E','F'] },
      ],
    }],
  });
  assert.deepEqual(valid, []);

  const bad = validateSortQuestion({
    mode: 'controlled',
    items,
    categories: [
      { id: 'positive', label: 'Positive correlation' },
      { id: 'negative', label: '' },
    ],
    validSchemes: [{ groups: [{ id: 'positive', itemIds: ['A','B','C'] }, { id: 'other', itemIds: ['D','E','F'] }] }],
  });
  assert.ok(bad.some((message) => /student-visible label/.test(message)));
  assert.ok(bad.some((message) => /same category ids/.test(message)));
});
