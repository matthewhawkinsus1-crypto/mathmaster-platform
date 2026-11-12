/*
 * HOW TO READ A SYSTEM FROM ITS GRAPH: what a Systems of Equations Rush round
 * publishes once it has ended (LC07).
 *
 * Graph Feature Rush's reasoning (graphFeatureReading.mjs), for this game:
 * every student's systems are their own, so a round has no worked solution to
 * show without handing one student's answer to the class. What the room
 * shares is what the game asks and the kinds of system it draws, so a round's
 * results carry a short guide to reading them — the intercepts, the solution
 * of the system, horizontal and vertical lines, and the three special answers
 * — written from the game's settings alone. It names no system of anyone's.
 *
 * It is short for the same reason: the projector shows it from the back of a
 * room. One line a skill — seven at most, the projector's limit — and one of
 * slips.
 *
 * Pure: shared by Cloud Functions and tests.
 */

import { SYSTEM_KIND, SYSTEM_QUESTION } from './systemsRush.mjs';
import { roundSolutionRecord } from './liveChallengeSolutionReveal.mjs';

export const SYSTEMS_READING = Object.freeze({
  intercepts: 'Intercepts: where each line crosses an axis — the y-axis where x = 0, the x-axis where y = 0.',
  yIntercept: 'y-intercepts: where each line crosses the y-axis, where x = 0.',
  xIntercept: 'x-intercepts: where each line crosses the x-axis, where y = 0.',
  solution: 'The solution of the system: where the two lines intersect — the one point on both lines.',
  levelUpright: 'A horizontal line (y = 3) never crosses the x-axis; a vertical one (x = −2) never crosses the y-axis.',
  levelUprightNone: 'y = 3 never crosses the x-axis; x = −2 never crosses the y-axis. Neither line crosses? Does Not Exist.',
  cannotDetermine: 'Can\'t Be Determined: they cross between grid lines — the point exists, but the graph can\'t show it.',
  cannotDeterminePastEdge: 'Can\'t Be Determined: they cross between grid lines or off the graph — it exists but can\'t be read.',
  parallel: 'No Solution: parallel lines never meet, so no point is on both.',
  sameLine: 'Infinitely Many: the same line twice — every point on it is on both lines.',
});

// What the screens title the guide (challengeSolutionModel.solutionTitle).
export const SYSTEMS_GUIDE_TITLE = 'How to read a system';

const SLIPS = Object.freeze({
  between: 'Common slips: a crossing near a grid point read as on it, and two lines on top of each other read as one.',
  sameLine: 'Common slip: two lines on top of each other are still two lines — look for both.',
  shared: 'Common slip: two lines can share an intercept — it is one point, tapped once.',
  basic: 'Common slip: mixing up the axes — x-intercepts sit on the x-axis, y-intercepts on the y-axis.',
});

const setOf = (values) => new Set((Array.isArray(values) ? values : []).map(String));

/**
 * The guide for a game's settings: the same for every student and every
 * round. Null with nothing to guide.
 */
export const systemsReadingGuide = ({ questions = [], kinds = [], difficulty = 'easy' } = {}) => {
  const asked = setOf(questions);
  const drawn = setOf(kinds);
  if (!asked.size || !drawn.size) return null;
  const aboveEasy = difficulty !== 'easy';
  const intercepts = asked.has(SYSTEM_QUESTION.Y_INTERCEPT) || asked.has(SYSTEM_QUESTION.X_INTERCEPT);
  const reasoning = [];
  // Both intercepts in one line, so the guide stays within the projector's seven.
  if (asked.has(SYSTEM_QUESTION.Y_INTERCEPT) && asked.has(SYSTEM_QUESTION.X_INTERCEPT)) reasoning.push(SYSTEMS_READING.intercepts);
  else if (asked.has(SYSTEM_QUESTION.Y_INTERCEPT)) reasoning.push(SYSTEMS_READING.yIntercept);
  else if (asked.has(SYSTEM_QUESTION.X_INTERCEPT)) reasoning.push(SYSTEMS_READING.xIntercept);
  if (asked.has(SYSTEM_QUESTION.SOLUTION)) reasoning.push(SYSTEMS_READING.solution);
  // From Standard two horizontal (or two vertical) lines can miss an axis together.
  if (drawn.has(SYSTEM_KIND.LEVEL_UPRIGHT)) reasoning.push(intercepts && aboveEasy ? SYSTEMS_READING.levelUprightNone : SYSTEMS_READING.levelUpright);
  // The special answers are buttons on a solution question.
  if (asked.has(SYSTEM_QUESTION.SOLUTION)) {
    const pastEdge = difficulty === 'challenge' || difficulty === 'mixed';
    if (drawn.has(SYSTEM_KIND.CANNOT_DETERMINE)) reasoning.push(pastEdge ? SYSTEMS_READING.cannotDeterminePastEdge : SYSTEMS_READING.cannotDetermine);
    if (drawn.has(SYSTEM_KIND.PARALLEL)) reasoning.push(SYSTEMS_READING.parallel);
    if (drawn.has(SYSTEM_KIND.SAME_LINE)) reasoning.push(SYSTEMS_READING.sameLine);
  }
  let commonError = SLIPS.basic;
  if (asked.has(SYSTEM_QUESTION.SOLUTION) && drawn.has(SYSTEM_KIND.CANNOT_DETERMINE) && drawn.has(SYSTEM_KIND.SAME_LINE)) commonError = SLIPS.between;
  else if (asked.has(SYSTEM_QUESTION.SOLUTION) && drawn.has(SYSTEM_KIND.SAME_LINE)) commonError = SLIPS.sameLine;
  else if (intercepts && aboveEasy) commonError = SLIPS.shared;
  return Object.freeze({
    prompt: null,
    solutionReview: Object.freeze({
      headline: null,
      reasoning: Object.freeze(reasoning),
      commonError,
      connection: null,
      answerSummary: null,
    }),
  });
};

/**
 * What the planner stores privately when a round opens: the guide as a
 * worked-solution record, marked `guide` so the screens title it as one.
 */
export const systemsRoundSolutionRecord = ({ questions = [], kinds = [], difficulty = 'easy' } = {}) => {
  const guide = systemsReadingGuide({ questions, kinds, difficulty });
  if (!guide) return null;
  return Object.freeze({
    ...roundSolutionRecord({ question: { prompt: guide.prompt }, solutionReview: guide.solutionReview, displayStandard: null }),
    guide: true,
    guideTitle: SYSTEMS_GUIDE_TITLE,
  });
};
