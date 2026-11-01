import { roomRunsQuestionSets } from './challengeShellModel.js';

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
  NONE: 'none', // no solution to show: not closed yet, or no shared question and nothing published (a Graph the Line Sprint)
  HELD: 'held', // closed, but a Second Chance replay of it may still come
  LOADING: 'loading',
  READY: 'ready', // published with an authored review
  UNAVAILABLE: 'unavailable', // published, but the question carries no worked solution
});

/*
 * What a screen calls a round's published document. A Graph Feature Rush round
 * has no question to solve; what it publishes is a reading guide to the
 * features in the game (graphFeatureReading.mjs, marked `guide: true`), which
 * is not a worked solution and is not titled as one.
 */
export const SOLUTION_TITLE = 'Worked solution';
export const READING_GUIDE_TITLE = 'How to read the features';
export const solutionTitle = (solution) => (solution?.guide === true ? READING_GUIDE_TITLE : SOLUTION_TITLE);

/*
 * How many steps the projector draws. An authored review can run long and the
 * projector never scrolls, so it takes the first five. A reading guide is
 * written to fit (a line a feature and one on the answers that are not a tap:
 * at most seven), and its last line is the one that says when to choose
 * "Does Not Exist", so it takes all of them.
 */
export const PROJECTOR_SOLUTION_STEPS = 5;
// A guide's every line: one per feature (six since asymptotes) and the
// answers line ("Does Not Exist", "Off screen", open dots), which a cut at six
// would drop from a game that asks for every feature.
export const PROJECTOR_GUIDE_STEPS = 7;
export const projectorStepLimit = (solution) => (solution?.guide === true ? PROJECTOR_GUIDE_STEPS : PROJECTOR_SOLUTION_STEPS);

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
  if (!room || !Number.isInteger(Number(roundIndex)) || Number(roundIndex) < 0) return SOLUTION_STATE.NONE;
  if (!solutionRevealed(room, roundIndex)) {
    // A question-set round is never held for a Second Chance: its line is
    // published at its close (a Graph the Line Classic round the class graphed
    // together) or there is none to publish (each student had their own).
    if (roomRunsQuestionSets(room)) return SOLUTION_STATE.NONE;
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
