import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultRepresentationSets,
  buildLinearConnectionCards,
  canonicalLineForSet,
  findLinearMismatch,
  scoreLinearConnectionGrouping,
  scoreLinearMismatchSelection,
  shuffleLinearConnectionCards,
} from '../../src/tools/representationMatch/representationMath.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const LINE_A = {
  id: 'lineA',
  slopeIntercept: 'y=-2x+5',
  pointSlope: 'y-1=-2(x-2)',
  standard: '2x+y=5',
  slope: -2,
  point: [2, 1],
  xIntercept: [2.5, 0],
  yIntercept: [0, 5],
  graphSpec: { type: 'linear', a: -2, h: 0, k: 5 },
};

const LINE_B = {
  id: 'lineB',
  slopeIntercept: 'y=3x-4',
  standard: '3x-y=4',
  slope: 3,
  point: [0, -4],
  yIntercept: [0, -4],
  graphSpec: { type: 'linear', a: 3, h: 0, k: -4 },
};

// 14. Three equivalent forms of the same line group correctly.
test('three equivalent representations of the same line canonicalize to one line', () => {
  const lineA = canonicalLineForSet(LINE_A);
  const cardEquivalents = [LINE_A.slopeIntercept, LINE_A.pointSlope, LINE_A.standard];
  const { mismatchIndexes } = findLinearMismatch(buildLinearConnectionCards([LINE_A], ['slopeIntercept', 'pointSlope', 'standard']));
  assert.equal(mismatchIndexes.length, 0);
  assert.ok(lineA);
  cardEquivalents.forEach((text) => assert.ok(text));
});

// 15. One sign-mismatched point-slope form is detected.
test('a sign-mismatched point-slope form is detected as the mismatch', () => {
  const mismatchedSet = { ...LINE_A, pointSlope: 'y-1=-2(x+2)' }; // should be (x-2)
  const cards = buildLinearConnectionCards([mismatchedSet], ['slopeIntercept', 'pointSlope', 'standard']);
  const { mismatchIndexes, mismatchIds } = findLinearMismatch(cards);
  assert.equal(mismatchIndexes.length, 1);
  assert.equal(mismatchIds[0], `${mismatchedSet.id}:pointSlope`);

  const selection = scoreLinearMismatchSelection(cards, mismatchIds[0]);
  assert.equal(selection.ok, true);
  const wrongSelection = scoreLinearMismatchSelection(cards, `${mismatchedSet.id}:standard`);
  assert.equal(wrongSelection.ok, false);
});

// 16. Graph + slope + intercept cards can belong to the same canonical line.
test('graph, slope, and intercept cards for the same line share one canonical line', () => {
  const cards = buildLinearConnectionCards([LINE_A], ['graph', 'slope', 'point', 'xIntercept', 'yIntercept']);
  assert.equal(cards.length, 5);
  const line = canonicalLineForSet(LINE_A);
  assert.equal(line.vertical, false);
  assert.equal(line.m.n / line.m.d, -2);
  assert.equal(line.b.n / line.b.d, 5);
});

// Grouping scores a full shuffled deck across two lines.
test('linearConnections grouping scores a full card deck across two lines', () => {
  const cards = shuffleLinearConnectionCards(buildLinearConnectionCards([LINE_A, LINE_B]));
  assert.ok(cards.length > 4);

  const correctAssignments = Object.fromEntries(cards.map((card) => [card.id, card.setId === 'lineA' ? 0 : 1]));
  const correctResult = scoreLinearConnectionGrouping(cards, correctAssignments);
  assert.equal(correctResult.isCorrect, true);
  assert.equal(correctResult.score, 1);

  // Swapping every slot label still counts as fully correct: the partition
  // is what matters, not which literal slot number a card lands in.
  const swappedAssignments = Object.fromEntries(cards.map((card) => [card.id, correctAssignments[card.id] === 0 ? 1 : 0]));
  const swappedResult = scoreLinearConnectionGrouping(cards, swappedAssignments);
  assert.equal(swappedResult.isCorrect, true);

  // One card in the wrong group is a partial, not a pass.
  const oneWrong = { ...correctAssignments, [cards[0].id]: correctAssignments[cards[0].id] === 0 ? 1 : 0 };
  const wrongResult = scoreLinearConnectionGrouping(cards, oneWrong);
  assert.equal(wrongResult.isCorrect, false);
  assert.ok(wrongResult.score < 1);
});

// 17. linearConnections requires explicit authored sets.
test('linearConnections validation requires explicit authored sets, not the demo fallback', () => {
  const noSets = validateToolQuestion({ toolId: 'representationMatch', mode: 'linearConnections' });
  assert.equal(noSets.isValid, false);
  assert.ok(noSets.errors.some((message) => message.includes('explicit sets array')));

  const oneSet = validateToolQuestion({ toolId: 'representationMatch', mode: 'linearConnections', sets: [LINE_A] });
  assert.equal(oneSet.isValid, false, 'the group task needs at least two lines');

  const validGroup = validateToolQuestion({ toolId: 'representationMatch', mode: 'linearConnections', sets: [LINE_A, LINE_B] });
  assert.equal(validGroup.isValid, true, JSON.stringify(validGroup.errors));

  const underspecifiedSet = validateToolQuestion({
    toolId: 'representationMatch', mode: 'linearConnections', sets: [{ id: 'onlyContext', context: 'a line' }, LINE_B],
  });
  assert.equal(underspecifiedSet.isValid, false);
  assert.ok(underspecifiedSet.errors.some((message) => message.includes('does not supply enough explicit information')));

  const findMismatchQuestion = validateToolQuestion({
    toolId: 'representationMatch',
    mode: 'linearConnections',
    task: 'findMismatch',
    sets: [{ ...LINE_A, pointSlope: 'y-1=-2(x+2)' }],
    mismatchSetId: 'lineA',
  });
  assert.equal(findMismatchQuestion.isValid, true, JSON.stringify(findMismatchQuestion.errors));

  const noRealMismatch = validateToolQuestion({
    toolId: 'representationMatch',
    mode: 'linearConnections',
    task: 'findMismatch',
    sets: [LINE_A],
    mismatchSetId: 'lineA',
  });
  assert.equal(noRealMismatch.isValid, false);
  assert.ok(noRealMismatch.errors.some((message) => message.includes('deliberate error')));
});

// 18. Existing four modes continue working.
test('existing representationMatch modes are unaffected by linearConnections', () => {
  const sets = buildDefaultRepresentationSets();
  ['completeSet', 'findMismatch', 'tableAudit', 'graphMatch'].forEach((mode) => {
    const question = mode === 'tableAudit'
      ? { toolId: 'representationMatch', mode, function: { type: 'quadratic', a: 1, h: 0, k: 0 }, rows: [[-1, 1], [0, 0], [1, 1]] }
      : mode === 'findMismatch'
        ? { toolId: 'representationMatch', mode, sets, targetId: sets[0].id, mixedSet: { equationId: sets[0].id, tableId: sets[1].id, contextId: sets[0].id } }
        : { toolId: 'representationMatch', mode, sets, targetId: sets[0].id };
    const result = validateToolQuestion(question);
    assert.equal(result.isValid, true, `${mode}: ${JSON.stringify(result.errors)}`);
  });
});

test('factored linear cards canonicalize and participate in grouping', () => {
  const general = canonicalLineForSet({ slopeIntercept: 'y = 5x - 20' });
  const factored = canonicalLineForSet({ factoredLinear: 'y = 5(x - 4)' });
  assert.deepEqual(factored, general);
  const set = { id: 'same', slopeIntercept: 'y=5x-20', factoredLinear: 'y=5(x-4)', graphSpec: { type: 'linear', a: 5, h: 0, k: -20 }, slope: 5, point: [4, 0], xIntercept: [4, 0], yIntercept: [0, -20] };
  assert.equal(validateToolQuestion({ toolId: 'representationMatch', mode: 'linearConnections', sets: [set, { ...LINE_B, id: 'other' }] }).isValid, true);
  assert.ok(buildLinearConnectionCards([set]).some((card) => card.kind === 'factoredLinear'));
});

test('group preflight rejects contradictory scalar and point cards', () => {
  const bad = { id: 'bad', slopeIntercept: 'y=x', slope: -5, point: [0, 0], xIntercept: [4, 0] };
  const result = validateToolQuestion({ toolId: 'representationMatch', mode: 'linearConnections', sets: [bad, LINE_B] });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((message) => message.includes('slope') && message.includes('xIntercept')));
});

test('findMismatch requires three cards, a strict majority, and detects a factored error', () => {
  const two = { id: 'two', slopeIntercept: 'y=x', factoredLinear: 'y=2(x-1)' };
  assert.equal(validateToolQuestion({ toolId: 'representationMatch', mode: 'linearConnections', task: 'findMismatch', mismatchSetId: 'two', sets: [two] }).isValid, false);
  const three = { id: 'three', slopeIntercept: 'y=5x-20', standard: '5x-y=20', factoredLinear: 'y=5(x-3)' };
  const valid = validateToolQuestion({ toolId: 'representationMatch', mode: 'linearConnections', task: 'findMismatch', mismatchSetId: 'three', sets: [three] });
  assert.equal(valid.isValid, true, valid.errors.join('\n'));
  const cards = buildLinearConnectionCards([three], ['slopeIntercept', 'factoredLinear', 'standard']);
  assert.deepEqual(findLinearMismatch(cards).mismatchIds, ['three:factoredLinear']);
});
