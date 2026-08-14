import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOpenSort, validateSortQuestion } from '../../src/tools/openSortBoard/openSortMath.js';

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
