import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import representationMatchGrader from '../../functions/shared/serverGrading/tools/representationMatch.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/representationMatch.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  LINEAR_CARD_KINDS,
  REPRESENTATION_MATCH_MODES,
  buildLinearConnectionCards,
  linearPlacementsFromAssignments,
  representationMatchMode,
  representationMixedSet,
  representationSetsFor,
  representationTargetId,
  scoreLinearConnectionGrouping,
  shuffleLinearConnectionCards,
  tableAuditRows,
} from '../../functions/shared/toolMath/representationMatch/representationMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * REPRESENTATION MATCH IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The tool's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts for every view — and
 * that verdict is the one the tool's old inline Check reached, except for two
 * documented fixes: a blank tableAudit row is unanswered (it used to match a
 * bad row 0), and the linear card sort scales pair agreement by the share of
 * cards placed (a blank board used to earn ~0.53).
 */

const COMPONENT = 'src/tools/representationMatch/RepresentationMatch.jsx';
const code = executableSource(fs.readFileSync(COMPONENT, 'utf8'));

const TYPE = 'representationMatch';
const q = (fields = {}) => ({ type: TYPE, ...fields });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(representationMatchGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces a tool response for the server');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  if (!browser.graded) assert.equal(server.reason, browser.reason, 'ungraded reason');
  return { ...browser, mode: server.mode, serverReason: server.reason };
};
const part = (result, id) => result.parts.find((entry) => entry.id === id);

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

const SETS = [
  { id: 'lin', equation: 'y = 3x - 1', table: '(0,-1), (1,2), (2,5)', context: 'Starts at -1, up 3 a step.', graphSpec: { type: 'linear', a: 3, h: 0, k: -1 } },
  { id: 'quad', equation: 'y = (x-1)^2', table: '(0,1), (1,0), (2,1)', context: 'Lowest at x = 1.', graphSpec: { type: 'quadratic', a: 1, h: 1, k: 0 } },
  { id: 'exp', equation: 'y = 3^x', table: '(0,1), (1,3), (2,9)', context: 'Triples each step.', graphSpec: { type: 'exponential', a: 1, h: 0, k: 0, base: 3 } },
];

const LINE_A = {
  id: 'lineA', slopeIntercept: 'y=-2x+5', pointSlope: 'y-1=-2(x-2)', standard: '2x+y=5', slope: -2, point: [2, 1],
  xIntercept: [2.5, 0], yIntercept: [0, 5], graphSpec: { type: 'linear', a: -2, h: 0, k: 5 },
};
const LINE_B = {
  id: 'lineB', slopeIntercept: 'y=3x-4', standard: '3x-y=4', slope: 3, point: [0, -4], yIntercept: [0, -4],
  graphSpec: { type: 'linear', a: 3, h: 0, k: -4 },
};
const groupQuestion = (fields = {}) => q({ mode: 'linearConnections', sets: [LINE_A, LINE_B], ...fields });
const DECK = buildLinearConnectionCards([LINE_A, LINE_B]);
const slotOf = (card) => (card.setId === 'lineA' ? 0 : 1);
const placements = (assign) => ({ assignments: linearPlacementsFromAssignments(assign) });
const bySet = Object.fromEntries(DECK.map((card) => [card.id, slotOf(card)]));

// One line, four equation cards; the point-slope card is the deliberate error.
const MISMATCH_SET = { id: 'm', slopeIntercept: 'y=-2x+5', factoredLinear: 'y=-2(x-2.5)', pointSlope: 'y-1=-2(x+2)', standard: '2x+y=5' };
const mismatchQuestion = (fields = {}) => q({ mode: 'linearConnections', task: 'findMismatch', sets: [MISMATCH_SET], mismatchSetId: 'm', ...fields });
const CORRECTION = { correctionOptions: [{ id: 'minus', label: 'y-1=-2(x-2)' }, { id: 'plus', label: 'y+1=-2(x+2)' }], correctionAnswerId: 'minus' };

/* ------------------------------------------------------------------ */
/* declaration and mode resolution                                     */
/* ------------------------------------------------------------------ */

test('every view is declared shared-server, contract v1; an unrouted mode is declared non-graded', () => {
  assert.equal(GRADING_MANIFEST.representationMatch, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, 'completeSet');
  ['completeSet', 'findMismatch', 'tableAudit', 'graphMatch', 'linearConnections'].forEach((mode) => {
    assert.equal(declaration.modes[mode].authority, GRADING_AUTHORITY.SHARED_SERVER, mode);
  });
  assert.equal(declaration.modes.unrouted.authority, GRADING_AUTHORITY.NON_GRADED);
  assert.ok(declaration.modes.unrouted.blocker.length >= 40);
  assert.deepEqual([...representationMatchGrader.problems], []);
});

// The component's own routing, read from its source: `representationMatchMode`
// (questionData.mode || 'completeSet') and one `{mode === '<view>' ...` branch
// per view, with NO fallback view.
const componentRouting = (() => {
  assert.match(code, /const mode = representationMatchMode\(questionData\);/);
  const body = region(code, 'export default function RepresentationMatch', null, 'component');
  const routed = [...new Set([...body.matchAll(/\{mode === '(\w+)'(?: && linearTask === '\w+')? \? </g)].map((match) => match[1]))];
  assert.equal(routed.length, 5, `the render has its five views (${routed.join(', ')})`);
  return routed;
})();
const componentMode = (question) => {
  const mode = representationMatchMode(question);
  return componentRouting.includes(mode) ? mode : null;
};

test('the declaration resolves exactly the view the component renders, and nothing for an unrouted mode', () => {
  assert.equal(representationMatchMode({}), 'completeSet');
  assert.equal(representationMatchMode({ mode: '' }), 'completeSet');
  for (const mode of [undefined, null, '', 'completeSet', 'findMismatch', 'tableAudit', 'graphMatch', 'linearConnections', 'graphmatch', ' tableAudit', 'sort', 7, true]) {
    const question = q({ mode });
    const expected = componentMode(question) ?? 'unrouted';
    assert.equal(resolveToolMode(declaration, question), expected, `mode ${JSON.stringify(mode)}`);
  }
  const unrouted = q({ mode: 'graphmatch' });
  assert.equal(serverResponseGradingSupport(unrouted).supported, false);
  assert.equal(serverResponseGradingSupport(unrouted).reason, 'mode-not-server-gradable:unrouted');
  const result = grade(unrouted, { graphId: 'lin' });
  assert.equal(result.graded, false, 'the screen shows no Check for it, so neither side grades it');
});

/* ------------------------------------------------------------------ */
/* completeSet                                                         */
/* ------------------------------------------------------------------ */

test('completeSet: the three picks for the target are correct; one stray pick costs a third', () => {
  const question = q({ mode: 'completeSet', sets: SETS, targetId: 'quad' });
  const right = grade(question, { equation: 'quad', table: 'quad', context: 'quad' });
  assert.equal(right.mode, 'completeSet');
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);
  assert.equal(right.score, 1);
  assert.deepEqual(right.parts.map((entry) => entry.id), ['equation', 'table', 'context']);

  const stray = grade(question, { equation: 'quad', table: 'lin', context: 'quad' });
  assert.equal(stray.isCorrect, false);
  assert.equal(stray.isComplete, true);
  assert.equal(stray.score, 2 / 3);
  assert.equal(part(stray, 'table').isCorrect, false);

  const allWrong = grade(question, { equation: 'exp', table: 'lin', context: 'exp' });
  assert.equal(allWrong.score, 0);
});

test('completeSet: an unanswered pick is incomplete, and an explicit Check still grades it', () => {
  const question = q({ mode: 'completeSet', sets: SETS, targetId: 'quad' });
  const partial = grade(question, { equation: 'quad', table: '', context: 'quad' });
  assert.equal(partial.graded, true);
  assert.equal(partial.isComplete, false);
  assert.equal(part(partial, 'table').isComplete, false);
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.score, 2 / 3);
  assert.equal(grade(question, { equation: '', table: '', context: '' }).score, 0);
});

test('completeSet: the choice order on screen is irrelevant — picks are set ids', () => {
  const reordered = q({ mode: 'completeSet', sets: [...SETS].reverse(), targetId: 'quad' });
  assert.equal(grade(reordered, { equation: 'quad', table: 'quad', context: 'quad' }).isCorrect, true);
  const twoChoices = q({ mode: 'completeSet', sets: [SETS[1], SETS[2]], targetId: 'quad' });
  assert.equal(grade(twoChoices, { equation: 'quad', table: 'quad', context: 'quad' }).isCorrect, true);
});

test('completeSet: each pick is read the way its control stores it — a button keeps the id, a <select> a string', () => {
  // The equation is a row of buttons (setter(item.id), the id as authored);
  // table and context are <select>s, whose value is always a string. With
  // numeric authored ids the screen compared `"2" === 2` for table and context
  // — never true — and the grader keeps that verdict. A numeric table or
  // context value is something no <select> produces, so it is no choice at all
  // (a tampered response cannot answer what the screen cannot).
  const numeric = q({ sets: SETS.map((set, index) => ({ ...set, id: index + 1 })), targetId: 2 });
  const screen = grade(numeric, { equation: 2, table: '2', context: '2' });
  assert.equal(part(screen, 'equation').isCorrect, true);
  assert.equal(part(screen, 'table').isCorrect, false);
  assert.equal(part(screen, 'table').isComplete, true);
  assert.equal(screen.score, 1 / 3);
  const tampered = grade(numeric, { equation: 2, table: 2, context: 2 });
  assert.equal(tampered.isCorrect, false);
  assert.equal(tampered.score, 1 / 3);
  assert.equal(part(tampered, 'context').isComplete, false);
  // The usual string ids are unaffected.
  assert.equal(grade(q({ sets: SETS, targetId: 'exp' }), { equation: 'exp', table: 'exp', context: 'exp' }).isCorrect, true);
});

test('completeSet: unauthored fields fall back exactly as the screen does', () => {
  // No sets: the demo relationships; no targetId: the first set.
  const demo = grade(q(), { equation: 'linear', table: 'linear', context: 'linear' });
  assert.equal(demo.mode, 'completeSet');
  assert.equal(demo.isCorrect, true);
  assert.equal(grade(q(), { equation: 'quadratic', table: 'quadratic', context: 'quadratic' }).isCorrect, false);
  assert.equal(representationTargetId(q({ sets: SETS }), SETS), 'lin');
  assert.equal(grade(q({ sets: SETS }), { equation: 'lin', table: 'lin', context: 'lin' }).isCorrect, true);
  assert.equal(grade(q({ sets: [] }), { equation: 'linear', table: 'linear', context: 'linear' }).isCorrect, true, 'an empty sets array also shows the demo');
});

/* ------------------------------------------------------------------ */
/* findMismatch                                                        */
/* ------------------------------------------------------------------ */

test('findMismatch: the one card from another relationship is the answer', () => {
  const question = q({ mode: 'findMismatch', sets: SETS, targetId: 'quad', mixedSet: { equationId: 'quad', tableId: 'quad', contextId: 'exp' } });
  const right = grade(question, { mismatchKind: 'context' });
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);
  assert.equal(right.score, 1);
  const wrong = grade(question, { mismatchKind: 'table' });
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.score, 0);
  const blank = grade(question, { mismatchKind: '' });
  assert.equal(blank.isComplete, false);
  assert.equal(blank.isCorrect, false);
});

test('findMismatch: the unauthored mixedSet is the target\'s equation and context with another set\'s table', () => {
  assert.deepEqual(representationMixedSet(q({ mode: 'findMismatch' })), { equationId: 'linear', tableId: 'quadratic', contextId: 'linear' });
  assert.equal(grade(q({ mode: 'findMismatch' }), { mismatchKind: 'table' }).isCorrect, true);
  assert.equal(grade(q({ mode: 'findMismatch' }), { mismatchKind: 'equation' }).isCorrect, false);
  assert.equal(grade(q({ mode: 'findMismatch', sets: SETS, targetId: 'exp' }), { mismatchKind: 'table' }).isCorrect, true);
});

test('findMismatch: an ambiguous mixedSet has no right answer', () => {
  const ambiguous = q({ mode: 'findMismatch', sets: SETS, targetId: 'quad', mixedSet: { equationId: 'lin', tableId: 'exp', contextId: 'quad' } });
  ['equation', 'table', 'context'].forEach((kind) => assert.equal(grade(ambiguous, { mismatchKind: kind }).isCorrect, false, kind));
});

/* ------------------------------------------------------------------ */
/* tableAudit                                                          */
/* ------------------------------------------------------------------ */

test('tableAudit: the one row off the rule is the answer, by index into the rows shown', () => {
  const question = q({ mode: 'tableAudit', function: { type: 'linear', a: 2, h: 0, k: 1 }, rows: [[0, 1], [1, 3], [2, 6], [3, 7]] });
  const right = grade(question, { rowIndex: 2 });
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);
  assert.equal(part(right, 'row').response, 'Row 3');
  assert.equal(grade(question, { rowIndex: 1 }).isCorrect, false);
  assert.equal(grade(question, { rowIndex: '2' }).isCorrect, true, 'a numeric string reads as the same row, as Number() did');
  // Firestore-safe { cells } rows are the same table.
  const cells = q({ ...question, rows: question.rows.map((row) => ({ cells: row })) });
  assert.deepEqual(tableAuditRows(cells), question.rows);
  assert.equal(grade(cells, { rowIndex: 2 }).isCorrect, true);
});

test('tableAudit: the 0.01 default tolerance and an authored tolerance are honoured', () => {
  const close = q({ mode: 'tableAudit', function: { type: 'linear', a: 2, h: 0, k: 1 }, rows: [[0, 1.004], [1, 3], [2, 6], [3, 7]] });
  assert.equal(grade(close, { rowIndex: 2 }).isCorrect, true, 'a row within 0.01 is not the broken row');
  assert.equal(grade(close, { rowIndex: 0 }).isCorrect, false);
  // A wide tolerance hides the broken row: no single row is off, nothing is right.
  assert.equal(grade(q({ ...close, tolerance: 2 }), { rowIndex: 2 }).isCorrect, false);
});

test('tableAudit: unauthored function and rows fall back to y = x² with the middle row corrupted', () => {
  assert.deepEqual(tableAuditRows(q({ mode: 'tableAudit' })), [[-2, 4], [-1, 1], [0, 2], [1, 1], [2, 4]]);
  assert.equal(grade(q({ mode: 'tableAudit' }), { rowIndex: 2 }).isCorrect, true);
  assert.equal(grade(q({ mode: 'tableAudit' }), { rowIndex: 0 }).isCorrect, false);
});

test('tableAudit FIX: a blank row choice is unanswered, even when the broken row is row 1', () => {
  // Before: the screen compared Number(badRow) === expected, and Number(null)
  // is 0 — a blank (or tampered '') choice was "correct" whenever the first
  // row was the broken one. The screen disabled Check for a blank choice, so
  // only a tampered or deadline-finalized response could reach it.
  const firstRowBroken = q({ mode: 'tableAudit', function: { type: 'linear', a: 1, h: 0, k: 0 }, rows: [[0, 5], [1, 1], [2, 2]] });
  assert.equal(grade(firstRowBroken, { rowIndex: 0 }).isCorrect, true);
  for (const rowIndex of [null, '', '  ', undefined, true, [0], { 0: 0 }]) {
    const blank = grade(firstRowBroken, { rowIndex });
    assert.equal(blank.isCorrect, false, JSON.stringify(rowIndex));
    assert.equal(blank.isComplete, false, JSON.stringify(rowIndex));
  }
});

test('tableAudit: a table without exactly one broken row has no right answer', () => {
  // The screen's rule: the audit has an answer only when exactly one row is
  // off the rule. Two broken rows (or none) leave every row wrong — picking
  // the first broken row must not count.
  const twoBroken = q({ mode: 'tableAudit', function: { type: 'linear', a: 2, h: 0, k: 1 }, rows: [[0, 1], [1, 4], [2, 6], [3, 7]] });
  [0, 1, 2, 3].forEach((rowIndex) => {
    const result = grade(twoBroken, { rowIndex });
    assert.equal(result.isCorrect, false, `two broken rows, row ${rowIndex}`);
    assert.equal(result.isComplete, true, 'a chosen row is still an answer');
    assert.equal(result.score, 0);
  });
  const noneBroken = q({ mode: 'tableAudit', function: { type: 'linear', a: 2, h: 0, k: 1 }, rows: [[0, 1], [1, 3], [2, 5], [3, 7]] });
  [0, 1, 2, 3].forEach((rowIndex) => assert.equal(grade(noneBroken, { rowIndex }).isCorrect, false, `no broken row, row ${rowIndex}`));
  // The same table with only row 1 broken has one answer.
  const oneBroken = q({ ...twoBroken, rows: [[0, 1], [1, 4], [2, 5], [3, 7]] });
  assert.equal(grade(oneBroken, { rowIndex: 1 }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* graphMatch                                                          */
/* ------------------------------------------------------------------ */

test('graphMatch: the target\'s graph is the answer, whatever its position', () => {
  const question = q({ mode: 'graphMatch', sets: SETS, targetId: 'exp' });
  const right = grade(question, { graphId: 'exp' });
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);
  assert.equal(grade(question, { graphId: 'lin' }).isCorrect, false);
  assert.equal(grade(q({ ...question, sets: [...SETS].reverse() }), { graphId: 'exp' }).isCorrect, true);
  const blank = grade(question, { graphId: '' });
  assert.equal(blank.isComplete, false);
  assert.equal(blank.isCorrect, false);
  // Unauthored: demo sets, target = first set.
  assert.equal(grade(q({ mode: 'graphMatch' }), { graphId: 'linear' }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* linearConnections — group                                           */
/* ------------------------------------------------------------------ */

test('linear group: every card with its own line is correct, under either slot labelling', () => {
  assert.equal(DECK.length, 14);
  const right = grade(groupQuestion(), placements(bySet));
  assert.equal(right.mode, 'linearConnections');
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);
  assert.equal(right.score, 1);
  assert.equal(part(right, 'pairings').response, '91 of 91');
  const swapped = Object.fromEntries(DECK.map((card) => [card.id, 1 - slotOf(card)]));
  assert.equal(grade(groupQuestion(), placements(swapped)).isCorrect, true, 'the partition counts, not the slot names');
  // The screen's seeded shuffle changes nothing: placements are by card id.
  const shuffled = shuffleLinearConnectionCards(DECK);
  assert.notDeepEqual(shuffled.map((card) => card.id), DECK.map((card) => card.id));
  assert.equal(grade(groupQuestion(), placements(Object.fromEntries(shuffled.map((card) => [card.id, slotOf(card)])))).isCorrect, true);
});

test('linear group: a misplaced card is partial credit by card-pair agreement', () => {
  const card = DECK.find((entry) => entry.id === 'lineA:slope');
  const oneWrong = grade(groupQuestion(), placements({ ...bySet, [card.id]: 1 }));
  assert.equal(oneWrong.isCorrect, false);
  assert.equal(oneWrong.isComplete, true);
  // 7 pairs with its own line now split, 6 with the other line now joined.
  assert.equal(oneWrong.score, 78 / 91);
  assert.equal(part(oneWrong, 'pairings').response, '78 of 91');
  const oneGroup = grade(groupQuestion(), placements(Object.fromEntries(DECK.map((entry) => [entry.id, 0]))));
  assert.equal(oneGroup.score, 43 / 91, 'everything in one group: only the same-line pairs agree (unchanged)');
});

test('linear group FIX: an untouched or half-sorted board is scaled by the cards placed', () => {
  // Before: an unplaced card is "apart" from everything, so a blank board
  // agreed on every cross-line pair: 48/91 ≈ 0.53 partial credit for nothing.
  const blank = grade(groupQuestion(), placements({}));
  assert.equal(blank.graded, true, 'Check groups is never disabled: a blank Check is a real attempt');
  assert.equal(blank.isComplete, false);
  assert.equal(blank.isCorrect, false);
  assert.equal(blank.score, 0);
  assert.equal(part(blank, 'pairings').response, '48 of 91', 'the on-screen pair tally is unchanged');
  const legacy = scoreLinearConnectionGrouping(DECK, {});
  assert.equal(legacy.pairScore, 48 / 91);

  // Four lineA and three lineB cards placed correctly, the rest unplaced:
  // same-line pairs agree only when both are placed (6 + 3), all 48 cross-line
  // pairs agree → 57/91, scaled by 7/14.
  const placedA = DECK.filter((entry) => entry.setId === 'lineA').slice(0, 4);
  const placedB = DECK.filter((entry) => entry.setId === 'lineB').slice(0, 3);
  const half = grade(groupQuestion(), placements(Object.fromEntries([...placedA, ...placedB].map((entry) => [entry.id, slotOf(entry)]))));
  assert.equal(half.isComplete, false);
  assert.equal(half.score, (57 / 91) * (7 / 14));
});

test('linear group: authored card kinds build the same deck as the screen; no sets is an empty board', () => {
  const kinds = ['slopeIntercept', 'graph', 'slope'];
  const deck = buildLinearConnectionCards([LINE_A, LINE_B], kinds);
  assert.equal(deck.length, 6);
  const right = grade(groupQuestion({ cardKinds: kinds }), placements(Object.fromEntries(deck.map((card) => [card.id, slotOf(card)]))));
  assert.equal(right.isCorrect, true);
  assert.equal(part(right, 'pairings').response, '15 of 15');
  // Placements for cards not in the deck are ignored.
  assert.equal(grade(groupQuestion({ cardKinds: kinds }), placements({ ...Object.fromEntries(deck.map((card) => [card.id, slotOf(card)])), 'lineA:standard': 1 })).isCorrect, true);
  // linearConnections never falls back to the demo sets.
  assert.deepEqual(representationSetsFor(q({ mode: 'linearConnections' })), []);
  const empty = grade(q({ mode: 'linearConnections' }), placements({}));
  assert.equal(empty.graded, true);
  assert.equal(empty.isCorrect, false);
  assert.equal(empty.score, 0);
  assert.deepEqual(LINEAR_CARD_KINDS.length, 11);
});

test('linear group: a slot the screen does not offer is no placement', () => {
  const outOfRange = { ...bySet, 'lineA:slope': 2 };
  const result = grade(groupQuestion(), placements(outOfRange));
  assert.equal(result.isComplete, false, 'slot 2 does not exist for two lines');
  assert.equal(result.isCorrect, false);
  for (const slot of ['0', -1, 0.5, null, true]) {
    const tampered = { assignments: [...placements(bySet).assignments.filter((entry) => entry.cardId !== 'lineB:slope'), { cardId: 'lineB:slope', slot }] };
    assert.equal(grade(groupQuestion(), tampered).isCorrect, false, JSON.stringify(slot));
  }
  // The pre-contract object shape is not this contract's work.
  assert.equal(grade(groupQuestion(), { assignments: bySet }).score, 0);
});

/* ------------------------------------------------------------------ */
/* linearConnections — findMismatch                                    */
/* ------------------------------------------------------------------ */

test('linear findMismatch: the card off the majority line is the answer', () => {
  const right = grade(mismatchQuestion(), { selectedId: 'm:pointSlope', correctionChoice: '' });
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);
  assert.equal(right.score, 1);
  assert.deepEqual(right.parts.map((entry) => entry.id), ['mismatch']);
  const wrong = grade(mismatchQuestion(), { selectedId: 'm:standard', correctionChoice: '' });
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.score, 0);
  const blank = grade(mismatchQuestion(), { selectedId: '', correctionChoice: '' });
  assert.equal(blank.isComplete, false);
  assert.equal(blank.score, 0);
});

test('linear findMismatch: with a correction asked, the right card alone earns 0.6', () => {
  const question = mismatchQuestion(CORRECTION);
  const full = grade(question, { selectedId: 'm:pointSlope', correctionChoice: 'minus' });
  assert.equal(full.isCorrect, true);
  assert.equal(full.score, 1);
  assert.deepEqual(full.parts.map((entry) => entry.id), ['mismatch', 'correction']);
  const wrongFix = grade(question, { selectedId: 'm:pointSlope', correctionChoice: 'plus' });
  assert.equal(wrongFix.isCorrect, false);
  assert.equal(wrongFix.score, 0.6);
  const noFix = grade(question, { selectedId: 'm:pointSlope', correctionChoice: '' });
  assert.equal(noFix.isComplete, false);
  assert.equal(noFix.score, 0.6);
  const rightFixWrongCard = grade(question, { selectedId: 'm:standard', correctionChoice: 'minus' });
  assert.equal(rightFixWrongCard.score, 0, 'a right correction for the wrong card earns nothing');
  // The correction is a <select>: only a string is a choice. With a numeric
  // authored answer id the screen's `"7" === 7` never matched, and a numeric
  // value (which no <select> produces) does not match either.
  const numericKey = mismatchQuestion({ correctionOptions: [{ id: 7, label: 'a' }, { id: 8, label: 'b' }], correctionAnswerId: 7 });
  assert.equal(grade(numericKey, { selectedId: 'm:pointSlope', correctionChoice: '7' }).score, 0.6);
  const tampered = grade(numericKey, { selectedId: 'm:pointSlope', correctionChoice: 7 });
  assert.equal(tampered.isCorrect, false);
  assert.equal(tampered.score, 0.6);
  assert.equal(part(tampered, 'correction').isComplete, false);
});

test('linear findMismatch: an unknown mismatchSetId has no cards and no right answer', () => {
  assert.equal(grade(mismatchQuestion({ mismatchSetId: 'nope' }), { selectedId: 'm:pointSlope', correctionChoice: '' }).isCorrect, false);
});

test('linear findMismatch: only the four equation cards are compared, however rich the authored set', () => {
  // The screen shows only the slope-intercept, factored, point-slope and
  // standard cards of the mismatch set. A set that also authors a slope, a
  // point, intercepts, a graph, a context and a table (as group sets do) is
  // the same task: those cards are neither shown nor compared.
  const rich = {
    ...MISMATCH_SET, slope: -2, point: [2, 1], xIntercept: [2.5, 0], yIntercept: [0, 5],
    graphSpec: { type: 'linear', a: -2, h: 0, k: 5 }, context: 'A tank holds 5 litres and drains 2 litres a minute.',
    table: [{ x: 0, y: 5 }, { x: 1, y: 3 }],
  };
  const question = mismatchQuestion({ sets: [rich] });
  const right = grade(question, { selectedId: 'm:pointSlope', correctionChoice: '' });
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);
  for (const selectedId of ['m:slope', 'm:graph', 'm:table', 'm:standard']) {
    assert.equal(grade(question, { selectedId, correctionChoice: '' }).isCorrect, false, selectedId);
  }
});

/* ------------------------------------------------------------------ */
/* discrimination                                                      */
/* ------------------------------------------------------------------ */

test('discrimination: correct work fails against a question whose key was altered', () => {
  assert.equal(grade(q({ sets: SETS, targetId: 'quad' }), { equation: 'quad', table: 'quad', context: 'quad' }).isCorrect, true);
  assert.equal(grade(q({ sets: SETS, targetId: 'exp' }), { equation: 'quad', table: 'quad', context: 'quad' }).isCorrect, false);
  const mixed = { equationId: 'quad', tableId: 'quad', contextId: 'exp' };
  assert.equal(grade(q({ mode: 'findMismatch', sets: SETS, targetId: 'quad', mixedSet: mixed }), { mismatchKind: 'context' }).isCorrect, true);
  assert.equal(grade(q({ mode: 'findMismatch', sets: SETS, targetId: 'quad', mixedSet: { ...mixed, contextId: 'quad', tableId: 'lin' } }), { mismatchKind: 'context' }).isCorrect, false);
  const table = { mode: 'tableAudit', function: { type: 'linear', a: 2, h: 0, k: 1 }, rows: [[0, 1], [1, 3], [2, 6], [3, 7]] };
  assert.equal(grade(q(table), { rowIndex: 2 }).isCorrect, true);
  assert.equal(grade(q({ ...table, function: { type: 'linear', a: 2, h: 0, k: 2 }, rows: [[0, 2], [1, 4], [2, 6], [3, 9]] }), { rowIndex: 2 }).isCorrect, false);
  assert.equal(grade(q({ mode: 'graphMatch', sets: SETS, targetId: 'lin' }), { graphId: 'exp' }).isCorrect, false);
  // A card's id names its line (`lineA:slope`), so the grouping key is the deck
  // itself: give each line the other's id (their card kinds differ) and the
  // board that sorted the original deck no longer sorts this one.
  const swappedKey = [{ ...LINE_A, id: 'lineB' }, { ...LINE_B, id: 'lineA' }];
  assert.equal(grade(groupQuestion(), placements(bySet)).isCorrect, true);
  assert.equal(grade(groupQuestion({ sets: swappedKey }), placements(bySet)).isCorrect, false);
  assert.equal(grade(mismatchQuestion({ sets: [{ ...MISMATCH_SET, pointSlope: 'y-1=-2(x-2)', standard: '2x+y=7' }] }), { selectedId: 'm:pointSlope', correctionChoice: '' }).isCorrect, false);
  assert.equal(grade(mismatchQuestion({ ...CORRECTION, correctionAnswerId: 'plus' }), { selectedId: 'm:pointSlope', correctionChoice: 'minus' }).isCorrect, false);
});

/* ------------------------------------------------------------------ */
/* malformed, tampered and oversize work                                */
/* ------------------------------------------------------------------ */

test('tampered verdict and key fields are dropped and change nothing', () => {
  const question = q({ sets: SETS, targetId: 'quad' });
  const tampered = { equation: 'lin', table: 'lin', context: 'lin', isCorrect: true, score: 1, expected: 'quad', answerKey: 'quad', checks: [true, true, true] };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['answerKey', 'checks', 'expected', 'isCorrect', 'score']);
  const result = grade(question, tampered);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
  const mismatch = grade(mismatchQuestion(), { selectedId: 'm:standard', correctionChoice: '', correct: true, verdict: 'correct' });
  assert.equal(mismatch.isCorrect, false);
});

test('malformed work is graded as the empty values it stands for, never crashes', () => {
  const question = q({ sets: SETS, targetId: 'quad' });
  for (const work of [{}, { equation: { id: 'quad' }, table: ['quad'], context: true }, { equation: null, table: 7, context: NaN }]) {
    const result = grade(question, work);
    assert.equal(result.graded, true, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.isComplete, false);
  }
  assert.equal(grade(q({ mode: 'findMismatch' }), { mismatchKind: ['table'] }).isCorrect, false);
  assert.equal(grade(q({ mode: 'graphMatch', sets: SETS, targetId: 'lin' }), { graphId: { id: 'lin' } }).isCorrect, false);
  for (const assignments of ['lineA:slope=0', 42, [null, 'x', ['lineA:slope', 0], { cardId: 9, slot: 0 }]]) {
    const result = grade(groupQuestion(), { assignments });
    assert.equal(result.graded, true, JSON.stringify(assignments));
    assert.equal(result.score, 0);
  }
  assert.equal(grade(mismatchQuestion(), { selectedId: ['m:pointSlope'], correctionChoice: {} }).isCorrect, false);
});

test('non-object work is not gradable', () => {
  for (const work of [null, undefined, 'quad', 3, ['quad', 'quad', 'quad']]) {
    const result = grade(q({ sets: SETS, targetId: 'quad' }), work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
});

test('oversize work is refused, and realistic maximal work fits the response limits', () => {
  // Six lines, every card kind, long set ids: 66 placements.
  const sets = Array.from({ length: 6 }, (_, index) => ({
    id: `relationship-with-a-long-authored-id-${index + 1}`,
    slopeIntercept: `y=${index + 1}x+${index}`, factoredLinear: `y=${index + 1}(x+${index}/${index + 1})`, pointSlope: `y-${index}=${index + 1}(x-0)`,
    standard: `${index + 1}x-y=${-index}`, slope: index + 1, point: [0, index], xIntercept: [-index / (index + 1), 0], yIntercept: [0, index],
    graphSpec: { type: 'linear', a: index + 1, h: 0, k: index }, context: `Plan ${index + 1} starts at ${index} and grows by ${index + 1}.`,
    table: [{ x: 0, y: index }, { x: 1, y: 2 * index + 1 }],
  }));
  const deck = buildLinearConnectionCards(sets);
  assert.equal(deck.length, 66);
  const maximal = placements(Object.fromEntries(deck.map((card) => [card.id, sets.findIndex((set) => set.id === card.setId)])));
  const bounded = boundToolWork(maximal);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson(maximal).length < TOOL_RESPONSE_LIMITS.maxJsonLength);
  assert.equal(grade(q({ mode: 'linearConnections', sets }), maximal).isCorrect, true);

  const oversize = { assignments: Array.from({ length: 290 }, (_, index) => ({ cardId: `${'z'.repeat(90)}:${index}`, slot: 0 })) };
  assert.ok(canonicalToolWorkJson(oversize).length > TOOL_RESPONSE_LIMITS.maxJsonLength);
  const refused = grade(groupQuestion(), oversize);
  assert.equal(refused.graded, false);
  assert.equal(refused.reason, 'oversize-response');
  assert.equal(refused.serverReason, 'oversize-response');
});

test('realistic work for every view carries no key and loses nothing at the boundary', () => {
  for (const work of [
    { equation: 'quad', table: '', context: 'lin' },
    { mismatchKind: 'table' },
    { rowIndex: 3 },
    { rowIndex: null },
    { graphId: 'exp' },
    placements(bySet),
    { selectedId: 'm:pointSlope', correctionChoice: 'minus' },
  ]) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, [], JSON.stringify(work));
    assert.equal(bounded.truncated, false);
    assert.deepEqual(bounded.work, work);
  }
});

/* ------------------------------------------------------------------ */
/* the screen is wired to the shared grader                            */
/* ------------------------------------------------------------------ */

test('every Check computes its verdict only through the shared grader and submits the reported work', () => {
  assert.match(code, /import representationMatchGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/representationMatch\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  const check = region(code, 'const check = () => {', '\n  };', 'Check handler');
  assert.match(check, /const result = gradeToolCheck\(representationMatchGrader, questionData, work\);/);
  assert.match(check, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,/);
  assert.match(check, /parts: result\.parts/);
  assert.doesNotMatch(check, /targetId|sourceIds|mixed|expectedId|expected|correctPairs/, 'no key or verdict detail in the metadata');
  // Six Check buttons (four views + two linear tasks), all the shared Check.
  const render = region(code, 'return <ToolShell', null, 'render');
  assert.equal([...render.matchAll(/onClick=\{check\}/g)].length, 6);
  assert.doesNotMatch(render, /onClick=\{check[A-Z]\w*\}/);
  assert.doesNotMatch(code, /scoreRepresentationMatch|scoreLinearConnectionGrouping|scoreLinearMismatchSelection|mismatchedRepresentationKinds|findTableMismatchIndexes/, 'the old inline scoring is gone');
  // The submitted work is the live-reported work, per view, with no key in it.
  const work = region(code, 'const work = ', 'useReportToolWork(work', 'work');
  assert.doesNotMatch(work, /targetId|mixed|tableRows|expected/);
  assert.match(code, /useReportToolWork\(work, \{ enabled: work !== null \}\);/);
  // The linear feedback tally comes from the grader's own part.
  assert.match(render, /find\(\(part\) => part\.id === 'pairings'\)\?\.response/);
});

test('each view reports and submits exactly the state its own controls hold', () => {
  // Node cannot render the screen, so the component's work expression is
  // evaluated as written, over its own state names: each view must hand over
  // its own inputs unchanged (a blank row stays blank, the table pick is the
  // table pick) and an unrouted view nothing at all.
  const body = region(code, 'export default function RepresentationMatch', null, 'component');
  const expression = region(body, 'const work = ', 'useReportToolWork(work', 'work')
    .replace(/^const work = /, '')
    .replace(/;\s*$/, '');
  const STATE = {
    equation: 'quad', table: 'lin', context: 'exp', mismatchKind: 'context', badRow: 0, graphId: 'exp',
    mismatchSelection: 'm:pointSlope', correctionChoice: 'minus',
    // Inserted out of card-id order: the work lists placements by card id, so
    // the same board is always the same bytes.
    linearAssignments: { 'lineB:slope': 1, 'lineA:graph': 0, 'lineA:point': null },
  };
  const workFor = (mode, linearTask = 'group', overrides = {}) => {
    const scope = { REPRESENTATION_MATCH_MODES, linearPlacementsFromAssignments, ...STATE, mode, linearTask, ...overrides };
    return new Function(...Object.keys(scope), `return (${expression});`)(...Object.values(scope));
  };
  assert.deepEqual(workFor('completeSet'), { equation: 'quad', table: 'lin', context: 'exp' });
  assert.deepEqual(workFor('findMismatch'), { mismatchKind: 'context' });
  assert.deepEqual(workFor('tableAudit'), { rowIndex: 0 });
  assert.deepEqual(workFor('tableAudit', 'group', { badRow: null }), { rowIndex: null }, 'a blank row stays blank');
  assert.deepEqual(workFor('graphMatch'), { graphId: 'exp' });
  assert.deepEqual(workFor('linearConnections', 'findMismatch'), { selectedId: 'm:pointSlope', correctionChoice: 'minus' });
  assert.deepEqual(workFor('linearConnections', 'group'), { assignments: [{ cardId: 'lineA:graph', slot: 0 }, { cardId: 'lineB:slope', slot: 1 }] });
  assert.equal(workFor('graphmatch'), null, 'an unrouted mode has no work');
  // Each of those names is the screen's own persisted student state.
  const persisted = new Set([...body.matchAll(/const \[(\w+), set\w+\] = usePersistentToolState\(/g)].map((match) => match[1]));
  Object.keys(STATE).forEach((name) => assert.ok(persisted.has(name), `${name} is persisted student state`));
});
