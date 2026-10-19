/*
 * OPEN SORT BY KEYBOARD: WHERE FOCUS GOES, AND WHAT EACH BUTTON IS CALLED
 * (A11Y-2, A11Y-7 in docs/qa/student-experience-pass-3/04-tools-and-accessibility.md).
 *
 * The rules live in openSortBoardA11y.js so they can run here; the board itself
 * is proven in a browser by tests/browser/keyboardSweep.mjs (`lostAfterAction`,
 * both the open and the controlled sort) and tests/browser/toolFocusAndUndo.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryButtonName,
  focusAfterPlacement,
  focusAfterRemovingGroup,
  focusAfterReturn,
  placeButtonName,
  placeButtonText,
  placedCardName,
  placementAnnouncement,
  rationaleInputLabel,
  removeGroupName,
} from '../../src/tools/openSortBoard/openSortBoardA11y.js';
import { readFileSync } from 'node:fs';

const cards = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: `Graph ${id.toUpperCase()}` }));

test('after a placement focus goes to the card after it, as the student saw the list', () => {
  assert.deepEqual(focusAfterPlacement({ unplacedBefore: cards, placedId: 'a', groupId: 'g1' }), { kind: 'card', id: 'b' });
  assert.deepEqual(focusAfterPlacement({ unplacedBefore: cards, placedId: 'b', groupId: 'g1' }), { kind: 'card', id: 'c' });
  // The last card in the list: the one before it, not the top of the page.
  assert.deepEqual(focusAfterPlacement({ unplacedBefore: cards, placedId: 'd', groupId: 'g1' }), { kind: 'card', id: 'c' });
});

test('after the last card is placed focus goes to the heading of the group it went into', () => {
  assert.deepEqual(focusAfterPlacement({ unplacedBefore: [cards[2]], placedId: 'c', groupId: 'group-2' }), { kind: 'group', id: 'group-2' });
});

test('taking a card back out follows the card; removing a group lands on its neighbour', () => {
  assert.deepEqual(focusAfterReturn('c'), { kind: 'card', id: 'c' });
  const groups = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }];
  assert.deepEqual(focusAfterRemovingGroup({ groupsBefore: groups, removedId: 'g2' }), { kind: 'group', id: 'g3' });
  assert.deepEqual(focusAfterRemovingGroup({ groupsBefore: groups, removedId: 'g3' }), { kind: 'group', id: 'g2' });
});

test('every repeated button names its card and its group, starting with the words on it', () => {
  const groups = [{ id: 'g1', name: '' }, { id: 'g2', name: 'Linear' }];
  const names = groups.map((group, index) => placeButtonName({ selectedCard: 'Graph C', group, index }));
  assert.deepEqual(names, ['Place Graph C here, in Group 1', 'Place Graph C here, in Group 2 · Linear']);
  assert.equal(new Set(names).size, names.length, 'no two Place buttons share a name');
  // WCAG 2.5.3: the accessible name starts with the visible label.
  names.forEach((name) => assert.ok(name.startsWith(placeButtonText('Graph C'))));
  assert.ok(placeButtonName({ selectedCard: '', group: groups[1], index: 1 }).startsWith(placeButtonText('')));

  const removes = groups.map((group, index) => removeGroupName(group, index));
  assert.deepEqual(removes, ['Remove group 1', 'Remove group 2 · Linear']);
  removes.forEach((name) => assert.ok(name.toLowerCase().startsWith('remove group')));

  assert.equal(placedCardName({ card: 'Graph C', group: groups[1], index: 1 }), 'Graph C: take it out of Group 2 · Linear');
  assert.equal(placedCardName({ card: 'Graph C', group: { name: 'Positive association' }, index: 0, controlled: true }), 'Graph C: take it out of Positive association');
  assert.equal(categoryButtonName({ category: { id: 'pos', label: 'Positive association' }, card: 'Graph C' }), 'Positive association: place Graph C here');
});

test('each placement is announced with what is left', () => {
  assert.equal(placementAnnouncement({ card: 'Graph C', group: { name: 'Linear' }, index: 1, remaining: 2 }), 'Graph C placed in Group 2 · Linear. 2 cards left to place.');
  assert.equal(placementAnnouncement({ card: 'Graph C', group: { name: 'Linear' }, index: 0, remaining: 0, controlled: true }), 'Graph C placed in Linear. Every card is placed.');
});

// Pass 3 (TOOLS_KEYBOARD_UNDO "Not done"): every group's "Why do these belong
// together?" box had the same name. Each now says its group, after the words
// on screen.
test('each group\'s explanation box is named for its group, starting with the words on screen', () => {
  const groups = [{ id: 'g1', name: '' }, { id: 'g2', name: 'Linear' }];
  const names = groups.map((group, index) => rationaleInputLabel(group, index));
  assert.deepEqual(names, ['Why do these belong together? (Group 1)', 'Why do these belong together? (Group 2 · Linear)']);
  assert.equal(new Set(names).size, names.length);
  names.forEach((name) => assert.ok(name.startsWith('Why do these belong together?')));
  const board = readFileSync(new URL('../../src/tools/openSortBoard/OpenSortBoard.jsx', import.meta.url), 'utf8');
  const box = board.slice(board.indexOf('Why do these belong together?'), board.indexOf('characters needed before checking'));
  assert.match(box, /<textarea[\s\S]*?aria-label=\{rationaleInputLabel\(group, groupIndex\)\}/, 'the box takes its group\'s name');
});
