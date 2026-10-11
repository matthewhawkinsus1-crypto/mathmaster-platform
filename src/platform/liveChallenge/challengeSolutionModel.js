/*
 * WHAT A SCREEN SAYS ABOUT A ROUND'S WORKED SOLUTION.
 *
 * The server decides when a solution is public (functions/shared/
 * liveChallengeSolutionReveal.mjs) and lists the round in the room's
 * `revealedSolutionRounds`. A screen never decides it: it reads that list, and
 * reads the solution document only for a round in it. So no screen — student,
 * console or projector — can show a solution while the round can still be
 * answered, or before a Second Chance replay of it has closed.
 */

export const SOLUTION_STATE = Object.freeze({
  NONE: 'none', // no shared question (a Graph Feature Rush round), or not closed yet
  HELD: 'held', // closed, but a Second Chance replay of it may still come
  LOADING: 'loading',
  READY: 'ready', // published with an authored review
  UNAVAILABLE: 'unavailable', // published, but the question carries no worked solution
});

const rushRoom = (room) => room?.challengeMode === 'graphFeatureRush';

/** Whether the server has published this round's solution. */
export const solutionRevealed = (room = {}, roundIndex) => (
  Array.isArray(room?.revealedSolutionRounds)
  && room.revealedSolutionRounds.map(Number).includes(Number(roundIndex))
);

/**
 * The state of one round's solution on a screen.
 *
 * @param {object} input
 * @param {object} input.room        the authoritative room
 * @param {number} input.roundIndex  the round in question
 * @param {object|null|undefined} input.solution  the document once read (undefined: not read yet)
 * @param {boolean} [input.roundClosed]  whether this round has closed (results or later)
 */
export const roundSolutionState = ({ room = {}, roundIndex, solution, roundClosed = true } = {}) => {
  if (!room || rushRoom(room) || !Number.isInteger(Number(roundIndex)) || Number(roundIndex) < 0) return SOLUTION_STATE.NONE;
  if (!solutionRevealed(room, roundIndex)) {
    if (!roundClosed || !Array.isArray(room?.revealedSolutionRounds)) return SOLUTION_STATE.NONE;
    return SOLUTION_STATE.HELD;
  }
  if (solution === undefined) return SOLUTION_STATE.LOADING;
  return solution?.available === true && solution?.solutionReview ? SOLUTION_STATE.READY : SOLUTION_STATE.UNAVAILABLE;
};

/** The words a screen shows for a state that has no solution to draw. */
export const solutionStateMessage = (state) => {
  switch (state) {
    case SOLUTION_STATE.HELD:
      return 'The worked solution is shown after the Second Chance rounds — this question may come back.';
    case SOLUTION_STATE.LOADING:
      return 'Loading the worked solution…';
    case SOLUTION_STATE.UNAVAILABLE:
      return 'This question has no worked solution yet. Ask your teacher to go through it.';
    default:
      return '';
  }
};

/*
 * What to call a solution's closing line. Authored reviews put either the
 * answer there ("x = 4") or a generic check ("Check that the selected answer
 * is consistent with the stated geometry"). Labelling the second "Answer:"
 * tells a class the check is the answer (release-candidate QA m9), so an
 * instruction to check or verify is labelled as one.
 */
const CHECK_INSTRUCTION = /^\s*(check|verify|confirm|make sure|be sure)\b/i;
export const answerSummaryLabel = (summary) => (CHECK_INSTRUCTION.test(String(summary || '')) ? 'Check' : 'Answer');
