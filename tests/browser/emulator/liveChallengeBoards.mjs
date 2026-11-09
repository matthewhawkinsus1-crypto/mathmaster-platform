/*
 * WHAT A PROJECTED LIVE CHALLENGE BOARD SHOWS, ONCE IT HOLDS THE ROUND'S ANSWERS.
 *
 * The host console ranks the players' public rows as its listener brings them,
 * and the projector (LiveChallengeArenaProjector.jsx) draws them on two boards:
 *
 *   live          during the round ("Live standings"), beside "Locked in N / M":
 *                 data-mm-locked-in is how many answers the console has counted
 *   after round   on the results ("Standings after this round"), drawn from the
 *                 round's own result once it arrives; until then the panel says
 *                 "Tallying the round…" and holds no list
 *
 * A driver that reads a board a fixed time after its bots answered can land
 * before the answers reach the console, when everyone is level at 0 and the
 * public rule names nobody tied with the last, or in the tally: either way it
 * reads a board with no rows, which says nothing about the rule. And once
 * everyone has answered, the console closes the round 1.2 s later, so the live
 * board may already have become the standings after the round.
 *
 * `boardHoldingAnswers` names a board only once it holds the answers: the live
 * board when "Locked in" has counted `answered`, the standings after the round
 * as soon as they are drawn (they are the closed round's). Until then it
 * returns null, so a driver polls it in the page (page.waitForFunction) and gets
 * the rows from the same instant. It reads the page and nothing else, so
 * tests/platform/liveChallengeProjectorBoards.test.mjs runs it on a simulated one.
 */

/**
 * `answered` is how many answers the round has had; `live` and `afterRound`
 * say which boards may answer. Returns { board, keys } (keys: the player keys
 * on the board, in order) or null. `root` is the page's document.
 */
export const boardHoldingAnswers = ({ answered = 0, live = true, afterRound = true } = {}, root = document) => {
  const keysOf = (board) => [...board.querySelectorAll('[data-mm-standing]')].map((row) => row.getAttribute('data-mm-standing'));
  const after = afterRound ? root.querySelector('[aria-label="Standings after this round"]') : null;
  if (after) return { board: 'after the round', keys: keysOf(after) };
  if (!live) return null;
  const lockedIn = Number(root.querySelector('[data-mm-locked-in]')?.getAttribute('data-mm-locked-in'));
  const board = lockedIn >= answered ? root.querySelector('[aria-label="Live standings"]') : null;
  return board ? { board: 'live', keys: keysOf(board) } : null;
};
