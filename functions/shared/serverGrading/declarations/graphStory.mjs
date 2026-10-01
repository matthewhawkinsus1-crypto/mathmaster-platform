/*
 * Grading declaration for the `graphStory` structured question surface
 * (src/GraphStory.jsx), rendered by QuestionEngine (not a registry tool). Its
 * verdict comes from the shared grader over a structured raw response
 * (toolResponseContract).
 *
 * A graph story is completion credit: every required part present. The server
 * reproduces it from the texts and a bounded sketch that preserves the sketch
 * rule exactly (see ../../toolMath/scenario/graphStoryMath.mjs).
 *
 * Light by design. The checks are in ../tools/graphStory.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1: { scenario, independent, dependent, xLabel, xUnit, yLabel,
  //                  yUnit, explanation, strokes: [[[x, y], ...], ...] }
  contractVersion: 1,
  /*
   * GraphStory.jsx renders the sketch plane — and requires a sketch — when
   * `requireSketch === true` or the question supplies no `graph` object:
   *
   *   sketch       write a scenario AND sketch its graph (a source graph may
   *                also be shown)
   *   sourceGraph  read the supplied graph and tell its story; no sketch
   *
   * Same expression as graphStoryRequiresSketch, kept inline because this file
   * must stay free of grading code.
   */
  defaultMode: 'sketch',
  resolveMode: (question = {}) => (
    question?.requireSketch === true || !(question?.graph && typeof question.graph === 'object') ? 'sketch' : 'sourceGraph'
  ),
  modes: {
    sourceGraph: SHARED,
    sketch: SHARED,
  },
});
