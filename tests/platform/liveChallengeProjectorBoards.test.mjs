// The projector privacy driver reads a board only once it holds the round's
// answers (tests/browser/emulator/liveChallengeBoards.mjs). A read a fixed time
// after the bots answered could land before the answers reached the console
// (everyone level at 0, so the public rule names nobody) or in the results'
// "Tallying the round…", and found no rows: "the table's live board shows 0
// rows (expected the winner only)" on a loaded machine. Here the reader runs
// on a simulated page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardHoldingAnswers } from '../browser/emulator/liveChallengeBoards.mjs';

// The projector as the reader sees it: the "Locked in" count, and each board's
// player keys in order. A board that is not drawn is absent; the results'
// tally is a results screen with neither list.
const projector = ({ lockedIn = null, live = null, after = null } = {}) => {
  const row = (key) => ({ getAttribute: (name) => (name === 'data-mm-standing' ? key : null) });
  const list = (keys) => ({ querySelectorAll: (selector) => (selector === '[data-mm-standing]' ? keys.map(row) : []) });
  const nodes = {
    '[data-mm-locked-in]': lockedIn === null ? null : { getAttribute: (name) => (name === 'data-mm-locked-in' ? String(lockedIn) : null) },
    '[aria-label="Live standings"]': live ? list(live) : null,
    '[aria-label="Standings after this round"]': after ? list(after) : null,
  };
  return { querySelector: (selector) => nodes[selector] || null };
};

test('a live board the answers have not reached is not read', () => {
  // Two of four answers counted: the others are still level at 0 on it.
  assert.equal(boardHoldingAnswers({ answered: 4 }, projector({ lockedIn: 2, live: [] })), null);
  assert.equal(boardHoldingAnswers({ answered: 4 }, projector({ lockedIn: 0, live: [] })), null);
});

test('the live board is read once "Locked in" counts every answer, in its own order', () => {
  assert.deepEqual(boardHoldingAnswers({ answered: 4 }, projector({ lockedIn: 4, live: ['winner'] })), { board: 'live', keys: ['winner'] });
  assert.deepEqual(
    boardHoldingAnswers({ answered: 6 }, projector({ lockedIn: 6, live: ['k3', 'k1', 'k2', 'k5', 'k4'] })),
    { board: 'live', keys: ['k3', 'k1', 'k2', 'k5', 'k4'] },
  );
});

test("the results' tally, before the round's own result arrives, is not read", () => {
  assert.equal(boardHoldingAnswers({ answered: 4 }, projector()), null);
  assert.equal(boardHoldingAnswers({ live: false }, projector()), null);
});

test('the standings after the round are read as soon as they are drawn, an empty list included', () => {
  // A round that closed itself stands for the live board.
  assert.deepEqual(boardHoldingAnswers({ answered: 4 }, projector({ after: ['winner'] })), { board: 'after the round', keys: ['winner'] });
  // A game of three names nobody: an empty list is the board's answer, not a wait.
  assert.deepEqual(boardHoldingAnswers({ live: false }, projector({ after: [] })), { board: 'after the round', keys: [] });
});

test('each board is read only when the driver allows it', () => {
  // live: false waits for the standings after the round, whatever the live board shows.
  assert.equal(boardHoldingAnswers({ answered: 4, live: false }, projector({ lockedIn: 4, live: ['winner'] })), null);
  // afterRound: false reads the live board alone.
  assert.equal(boardHoldingAnswers({ answered: 6, afterRound: false }, projector({ after: ['k1'] })), null);
  assert.deepEqual(boardHoldingAnswers({ answered: 6, afterRound: false }, projector({ lockedIn: 6, live: ['k1'], after: ['k2'] })), { board: 'live', keys: ['k1'] });
});
