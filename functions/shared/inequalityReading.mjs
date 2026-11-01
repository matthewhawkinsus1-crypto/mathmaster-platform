/*
 * HOW TO GRAPH AN INEQUALITY: what an Inequality Graphing Rush round
 * publishes once it has ended (LC07).
 *
 * Graph Feature Rush's reasoning (graphFeatureReading.mjs), for this game:
 * every student's inequalities are their own, so a round has no worked
 * solution to show without handing one student's answer to the class. What
 * the room shares is the KINDS of inequality in the game, so a round's
 * results carry a short guide to graphing them — open or closed, which way,
 * the sign flip, "and"/"or", absolute value, "No solution" — written from the
 * game's settings alone. It names no inequality of anyone's.
 *
 * It is short for the same reason: the projector shows it from the back of a
 * room. One line a skill, one line of slips.
 *
 * Pure: shared by Cloud Functions and tests.
 */

import { INEQUALITY_ITEM } from './inequalityRush.mjs';
import { roundSolutionRecord } from './liveChallengeSolutionReveal.mjs';

export const INEQUALITY_READING = Object.freeze({
  dots: 'Open or closed: < and > leave the number out (open dot); ≤ and ≥ keep it (closed dot).',
  direction: 'Which way: test a number. If it makes the inequality true, shade its side.',
  reversed: 'Number first? Read it from x: 3 > x says x < 3.',
  flip: 'Solving: multiplying or dividing both sides by a negative flips the sign.',
  compound: '"And": both are true — between. "Or": either is true — outside.',
  absolute: '|x − a| < b: within b of a (between). |x − a| > b: farther than b (outside).',
  noSolution: 'Nothing makes it true? Choose No Solution. Everything does? Shade the whole line with both arrows.',
});

// What the screens title the guide (challengeSolutionModel.solutionTitle).
export const INEQUALITY_GUIDE_TITLE = 'How to graph inequalities';

const SLIPS = 'Common slips: dividing by a negative without flipping, and an open dot where ≤ or ≥ needs a closed one.';

/** The kinds in a game, as the guide reads them. */
const kindsIn = (itemTypes) => new Set((Array.isArray(itemTypes) ? itemTypes : []).map(String));

/**
 * The guide for a game's settings: the same for every student and every
 * round. Null with nothing to guide.
 */
export const inequalityReadingGuide = ({ itemTypes = [], difficulty = 'easy' } = {}) => {
  const kinds = kindsIn(itemTypes);
  if (!kinds.size) return null;
  const aboveEasy = difficulty !== 'easy';
  const reasoning = [INEQUALITY_READING.dots, INEQUALITY_READING.direction];
  if (kinds.has(INEQUALITY_ITEM.REVERSED)) reasoning.push(INEQUALITY_READING.reversed);
  // Easy keeps every coefficient positive: no flip to explain.
  if (aboveEasy && (kinds.has(INEQUALITY_ITEM.ONE_STEP) || kinds.has(INEQUALITY_ITEM.TWO_STEP))) reasoning.push(INEQUALITY_READING.flip);
  if (kinds.has(INEQUALITY_ITEM.COMPOUND_AND) || kinds.has(INEQUALITY_ITEM.COMPOUND_OR)) reasoning.push(INEQUALITY_READING.compound);
  if (kinds.has(INEQUALITY_ITEM.ABSOLUTE)) reasoning.push(INEQUALITY_READING.absolute);
  // "No solution" and "all real numbers" come from Standard, in these kinds.
  const edgeKinds = [INEQUALITY_ITEM.COMPOUND_AND, INEQUALITY_ITEM.COMPOUND_OR, INEQUALITY_ITEM.ABSOLUTE];
  if (aboveEasy && edgeKinds.some((kind) => kinds.has(kind))) reasoning.push(INEQUALITY_READING.noSolution);
  return Object.freeze({
    prompt: null,
    solutionReview: Object.freeze({
      headline: null,
      reasoning: Object.freeze(reasoning),
      commonError: SLIPS,
      connection: null,
      answerSummary: null,
    }),
  });
};

/**
 * What the planner stores privately when a round opens: the guide as a
 * worked-solution record, marked `guide` so the screens title it as one.
 */
export const inequalityRoundSolutionRecord = ({ itemTypes = [], difficulty = 'easy' } = {}) => {
  const guide = inequalityReadingGuide({ itemTypes, difficulty });
  if (!guide) return null;
  return Object.freeze({
    ...roundSolutionRecord({ question: { prompt: guide.prompt }, solutionReview: guide.solutionReview, displayStandard: null }),
    guide: true,
    guideTitle: INEQUALITY_GUIDE_TITLE,
  });
};
