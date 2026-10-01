// Reconciling an imported gradebook snapshot with MathMaster: item by item,
// in both directions, and a contribution breakdown ONLY when the file's own
// categories and weights reproduce the file's own official average.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECONCILIATION_STATUS, analyzeOfficialContribution, matchSisItems, reconcileGradebook,
} from '../../src/platform/caseReview/sisReconciliation.js';

const part = (assignmentId, title, sectionKey, sectionLabel, currentGrade, exportStatus) => ({
  assignmentId, title, sectionKey, sectionLabel, label: sectionKey ? `${title} — ${sectionLabel}` : title, currentGrade, excused: false, exportStatus,
});
const exported = (grade, current = grade) => ({ state: grade === current ? 'exported' : 'changed-since-export', exportedGrade: grade, label: '' });
const notExported = { state: 'not-exported', exportedGrade: null, label: 'Not exported' };

const parts = [
  part('a4', 'Lesson 4', 'classwork', 'Classwork', 80, exported(80)),
  part('a4', 'Lesson 4', 'dol', 'DOL', 50, exported(50)),
  part('a5', 'Lesson 5', 'practice', 'Practice', 75, exported(60, 75)),
  part('a5', 'Lesson 5', 'dol', 'DOL', 90, notExported),
  part('a6', 'Lesson 6', 'classwork', 'Classwork', 70, notExported),
];
const item = (name, score, extra = {}) => ({ name, score, scoreText: score === null ? '' : String(score), scoreKind: score === null ? 'blank' : 'number', category: null, pointsPossible: null, weight: null, excused: false, blank: score === null, ...extra });
const snapshot = {
  items: [
    item('Lesson 4 - Classwork', 80),
    item('Lesson 4 DOL', 40),
    item('Lesson 5 Practice', 60),
    item('Lesson 5 - Exit Ticket', 90),
    item('Quiz 2', 72),
  ],
  categories: [],
  officialAverage: null,
};

test('items match MathMaster parts by title and section words; ambiguous or foreign items stay unmatched', () => {
  const matches = matchSisItems({ items: snapshot.items, parts });
  const byName = Object.fromEntries(matches.map((entry) => [entry.itemName, entry.match]));
  assert.deepEqual([byName['Lesson 4 - Classwork'].assignmentId, byName['Lesson 4 - Classwork'].sectionKey], ['a4', 'classwork']);
  assert.equal(byName['Lesson 4 DOL'].sectionKey, 'dol');
  assert.equal(byName['Lesson 5 - Exit Ticket'].sectionKey, 'dol', 'exit ticket is DOL');
  assert.equal(byName['Quiz 2'], null);
  // A shorter gradebook name still matches a longer MathMaster title — but a
  // name that fits two titles equally is left for the teacher.
  const longTitles = [part('a7', 'Lesson 7 — Systems (synthetic)', 'dol', 'DOL', 60, notExported), part('a8', 'Lesson 8 — Systems (synthetic)', 'dol', 'DOL', 60, notExported)];
  assert.equal(matchSisItems({ items: [item('Lesson 7 DOL', 60)], parts: longTitles })[0].match.assignmentId, 'a7');
  assert.equal(matchSisItems({ items: [item('Systems DOL', 60)], parts: longTitles })[0].match, null);
  // A teacher's choice wins over the automatic one, and can say "no match".
  const confirmed = matchSisItems({ items: snapshot.items, parts, confirmedMatches: { 'Quiz 2': { assignmentId: 'a6', sectionKey: 'classwork' }, 'Lesson 4 DOL': { none: true } } });
  assert.equal(confirmed.find((entry) => entry.itemName === 'Quiz 2').match.method, 'teacher-confirmed');
  assert.equal(confirmed.find((entry) => entry.itemName === 'Lesson 4 DOL').match, null);
});

test('every reconciliation case the brief names is reported, in both directions', () => {
  const result = reconcileGradebook({ snapshot, parts });
  const status = (name) => result.rows.find((row) => row.itemName === name).status;
  assert.equal(status('Lesson 4 - Classwork'), RECONCILIATION_STATUS.MATCH);
  assert.equal(status('Lesson 4 DOL'), RECONCILIATION_STATUS.OFFICIAL_DIFFERS_FROM_EXPORT);
  assert.equal(status('Lesson 5 Practice'), RECONCILIATION_STATUS.CHANGED_SINCE_EXPORT);
  assert.equal(status('Lesson 5 - Exit Ticket'), RECONCILIATION_STATUS.NOT_EXPORTED_SAME);
  assert.equal(status('Quiz 2'), RECONCILIATION_STATUS.UNMATCHED_SIS_ITEM);
  // MathMaster work the gradebook does not show.
  assert.deepEqual(result.missingFromSis.map((entry) => [entry.assignmentId, entry.sectionKey]), [['a6', 'classwork']]);
  const dol = result.rows.find((row) => row.itemName === 'Lesson 4 DOL');
  assert.deepEqual([dol.officialScore, dol.exportedScore, dol.mathMasterScore], [40, 50, 50]);
  assert.match(dol.statusLabel, /gradebook/i);
  assert.doesNotMatch(dol.statusLabel, /error|wrong|mistake|teacher (failed|forgot)/i);
  assert.equal(result.counts.unmatchedSisItems, 1);
  assert.equal(result.counts.missingFromSis, 1);
});

test('the import is read-only: reconciling never changes a part or a snapshot', () => {
  const before = JSON.stringify({ snapshot, parts });
  reconcileGradebook({ snapshot, parts });
  assert.equal(JSON.stringify({ snapshot, parts }), before);
});

test('no weights in the file: the official average is not reconstructed, and the report says so', () => {
  const analysis = analyzeOfficialContribution({ ...snapshot, officialAverage: 66.5, items: snapshot.items.map((entry) => ({ ...entry, category: 'Daily' })) });
  assert.equal(analysis.sufficient, false);
  assert.equal(analysis.status, 'missing-weights');
  assert.match(analysis.explanation, /does not (contain|include)/i);
  assert.match(analysis.explanation, /will not guess/i);
  assert.equal(analysis.items.length, 0, 'no contributions are invented');
});

test('no official average in the file: nothing to check a method against, so no breakdown', () => {
  const analysis = analyzeOfficialContribution({
    items: [item('A', 80, { category: 'Daily', weight: 40 }), item('B', 60, { category: 'Major', weight: 60 })],
    categories: [{ name: 'Daily', weight: 40 }, { name: 'Major', weight: 60 }],
    officialAverage: null,
  });
  assert.equal(analysis.sufficient, false);
  assert.equal(analysis.status, 'no-official-average');
});

test('categories and weights that reproduce the official average give a contribution breakdown', () => {
  const items = [
    item('Lesson 4 Classwork', 85, { category: 'Daily', weight: 40 }),
    item('Lesson 4 DOL', 40, { category: 'Daily', weight: 40 }),
    item('Lab notebook', null, { category: 'Daily', weight: 40, excused: true, scoreKind: 'excused' }),
    item('Quiz 2', 72, { category: 'Major', weight: 60 }),
  ];
  // Daily mean = 62.5; Major = 72; 0.4 × 62.5 + 0.6 × 72 = 68.2
  const analysis = analyzeOfficialContribution({ items, categories: [{ name: 'Daily', weight: 40 }, { name: 'Major', weight: 60 }], officialAverage: 68.2 });
  assert.equal(analysis.sufficient, true);
  assert.equal(analysis.status, 'reconstructed');
  assert.equal(analysis.method, 'category-mean-of-item-percents');
  assert.equal(analysis.reconstructedAverage, 68.2);
  const daily = analysis.categories.find((entry) => entry.name === 'Daily');
  assert.equal(daily.average, 62.5);
  assert.equal(daily.contributionPoints, 25);
  // Items ranked by how many cycle-average points each sits below full credit:
  // Quiz 2 is 0.6 × (100 − 72) = 16.8; the DOL is 0.4 × (100 − 40) × ½ = 12.
  assert.deepEqual(analysis.rankedByImpact.map((entry) => [entry.name, entry.pointsBelowFull]), [
    ['Quiz 2', 16.8], ['Lesson 4 DOL', 12], ['Lesson 4 Classwork', 3],
  ]);
  assert.ok(!analysis.items.some((entry) => entry.name === 'Lab notebook'), 'an excused item carries no weight');
});

test('when the file\'s numbers do not reproduce its own average, MathMaster says so and stops', () => {
  const items = [item('A', 85, { category: 'Daily', weight: 40 }), item('B', 72, { category: 'Major', weight: 60 })];
  const analysis = analyzeOfficialContribution({ items, categories: [{ name: 'Daily', weight: 40 }, { name: 'Major', weight: 60 }], officialAverage: 90 });
  assert.equal(analysis.sufficient, false);
  assert.equal(analysis.status, 'not-reproduced');
  assert.match(analysis.explanation, /77\.2/);
  assert.match(analysis.explanation, /90/);
  assert.match(analysis.explanation, /will not guess/i);
});
