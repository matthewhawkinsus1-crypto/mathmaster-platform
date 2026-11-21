/*
 * SHAPES THE ALGEBRA I THANKSGIVING PACKET REPEATS.
 *
 * Every question of the packet is written with `item()`, so each one carries
 * the same supports in the same order: a short prompt, three hints, a "Let's
 * back up" step with two choices, a worked solution with its steps and the
 * usual mistake, and (on the first question of a skill) guided notes and the
 * worked example that teaches it. A question that leaves one out does not
 * build: the packet is for students working alone over a break.
 */
import { backUp, guidedNotes, teks } from '../lib/lessonKit.mjs';

export { teks };

export const WINDOW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });

const need = (condition, message) => { if (!condition) throw new Error(message); };

/**
 * One packet question.
 *
 *   id, alignment (teks(...)), actions, dok, band, prompt
 *   hints      three, none of which states the answer
 *   backUp     [prompt, [option, option], correct]
 *   solution   { headline?, reasoning: [...], answerSummary?, commonError }
 *   notes      [[title, instruction], ...] — the first question of a skill only
 *   example    an id in lessonSupports.examples, or { none: 'setup' | 'explain' }
 *   ...shape   the tool's own fields
 */
export const item = ({
  id, alignment, actions, dok, band, prompt, hints, backUp: back, solution, notes = null, example = null, ...shape
}) => {
  need(id && alignment && Array.isArray(actions) && actions.length, `${id}: an id, an alignment and student actions`);
  need(typeof prompt === 'string' && prompt.trim(), `${id}: a prompt`);
  need(Array.isArray(hints) && hints.length === 3, `${id}: three hints`);
  need(Array.isArray(back) && back.length === 3, `${id}: a back-up step`);
  need(Array.isArray(solution?.reasoning) && solution.reasoning.length >= 2 && solution.commonError, `${id}: a worked solution with steps and the usual mistake`);
  need(!notes || (notes.length >= 1 && notes.length <= 2), `${id}: one or two guided notes`);
  return {
    questionId: id,
    ...alignment,
    studentActions: actions,
    dok,
    difficultyBand: band,
    prompt,
    ...shape,
    hints,
    scaffold: backUp(...back),
    ...(notes ? { guidedNotes: guidedNotes(...notes) } : {}),
    solutionReview: {
      ...(solution.headline ? { headline: solution.headline } : {}),
      reasoning: solution.reasoning,
      ...(solution.answerSummary ? { answerSummary: solution.answerSummary } : {}),
      commonError: solution.commonError,
    },
    ...(example ? { example } : {}),
  };
};

/**
 * One authored worked example: a sibling problem (same method, other numbers)
 * as a step card of 3 to 6 small steps, each with its reason. A Step Algebra
 * example whose solution is only balanced moves also carries `moves`, the
 * tool's own actions, for the replay.
 */
export const example = ({ id, skill, tool = null, problem = null, sibling = null, steps, moves = null }) => {
  need(id && skill && (problem || sibling), `${id}: an id, a skill and a sibling problem`);
  need(Array.isArray(steps) && steps.length >= 3 && steps.length <= 6, `${id}: 3 to 6 steps`);
  steps.forEach(([show, why], index) => need(show && why, `${id}: step ${index + 1} needs what is shown and why`));
  return {
    id,
    skill,
    ...(tool ? { tool } : {}),
    source: 'authored',
    ...(sibling ? { sibling } : {}),
    ...(problem ? { problem } : {}),
    steps: steps.map(([show, why]) => ({ show, why })),
    ...(moves ? { moves } : {}),
  };
};

/** One unit: its Classwork section, and the Honors questions added after the regular ones. */
export const unit = ({ number, title, minutes, honorsMinutes, questions, honors }) => ({ number, title, minutes, honorsMinutes, questions, honors });

/* ---------------------------------------------------------- tool shapes */

/** A Systems Workspace inequality graph (the shape Module 3 Lessons 4 and 5 use). */
export const inequalityGraph = ({ source = null, constraints, modeling = null, rewrite = false, testPoint = null, classify = false, vertices = false, graph = WINDOW, directionSteps }) => ({
  mode: 'inequalities',
  ...(modeling
    ? { modeling: { variables: modeling, expectedConstraints: constraints } }
    : { sourceConstraints: source, expectedConstraints: constraints }),
  studentBuild: { rewrite: Boolean(rewrite), boundary: true, lineStyle: true, shading: true },
  ...(testPoint || classify || vertices
    ? { reasoning: { testPoint: Boolean(testPoint), classifyRegion: Boolean(classify), vertices: Boolean(vertices) } }
    : {}),
  ...(testPoint ? { testPoint } : {}),
  ...(classify ? { askClassification: true } : {}),
  ...(vertices ? { askVertices: true } : {}),
  graph,
  directionSteps,
});

/** A Multiple Representations board in Process Mode: facts are established on the board, not typed. */
export const board = ({ source, cards, context = null, bounds = null, xAxisLabel = null, yAxisLabel = null }) => ({
  mode: 'linearMultipleRepresentations',
  interactionMode: 'process',
  feedbackTiming: 'guided',
  ...(xAxisLabel ? { xAxisLabel } : {}),
  ...(yAxisLabel ? { yAxisLabel } : {}),
  source,
  ...(bounds ? { graphBounds: bounds } : {}),
  requiredCards: cards,
  ...(context ? { context } : {}),
});

/** A meaning to choose on the board: the right one first in the data, shown in the order given. */
export const meaning = (value, choices) => {
  need(choices.includes(value), `meaning "${value}" is not one of its choices`);
  return { value, choices };
};
