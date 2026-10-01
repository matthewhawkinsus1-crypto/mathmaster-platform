/*
 * Shared grader for the `graphStory` structured question surface
 * (src/GraphStory.jsx) — run by the screen for the verdict it reports, and by
 * the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * COMPLETION CREDIT, extracted check-for-check from GraphStory.jsx. Every part
 * is correct exactly when it is complete:
 *
 *   scenario      trimmed length >= minimumScenarioCharacters (default 20)
 *   independent   not blank
 *   dependent     not blank
 *   axis-labels   x label, x unit, y label and y unit all not blank
 *   graph-sketch  (sketch mode only) some stroke has >= 3 points
 *   explanation   trimmed length >= minimumExplanationCharacters (default 20)
 *
 * The sketch is read from the bounded strokes the work carries
 * (compactSketchStrokes), which preserve the >= 3 point rule exactly. The
 * scenario and explanation are read whole (freeText), so a minimum above the
 * contract's per-string limit is measured on what the student wrote. Both
 * modes run the same checks; the mode only decides whether the sketch part
 * exists, as the screen does.
 */
import declaration from '../declarations/graphStory.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { graphStoryRequiresSketch, isQualifyingStroke, readGraphStoryText } from '../../toolMath/scenario/graphStoryMath.mjs';

const completionPart = (id, label, isComplete, response) => ({ id, label, isComplete, isCorrect: isComplete, response });

const story = (question, work) => {
  const values = readGraphStoryText(work);
  const strokes = Array.isArray(work.strokes) ? work.strokes : [];
  // GraphStory.jsx: `Number(question.minimum… || 20)` — 0 and blank mean 20.
  const minimumScenario = Number(question.minimumScenarioCharacters || 20);
  const minimumExplanation = Number(question.minimumExplanationCharacters || 20);
  const axisValues = [values.xLabel, values.xUnit, values.yLabel, values.yUnit];
  const parts = [
    completionPart('scenario', 'Scenario', values.scenario.trim().length >= minimumScenario, values.scenario),
    completionPart('independent', 'Independent quantity', Boolean(values.independent.trim()), values.independent),
    completionPart('dependent', 'Dependent quantity', Boolean(values.dependent.trim()), values.dependent),
    completionPart('axis-labels', 'Axis labels and units', axisValues.every((value) => value.trim()), `${values.xLabel} (${values.xUnit}); ${values.yLabel} (${values.yUnit})`),
    ...(graphStoryRequiresSketch(question)
      ? [completionPart('graph-sketch', 'Graph sketch', strokes.some(isQualifyingStroke), `${strokes.length} stroke(s)`)]
      : []),
    completionPart('explanation', 'Explanation of the graph', values.explanation.trim().length >= minimumExplanation, values.explanation),
  ];
  return gradedResult({ parts });
};

export default bindToolGrader(declaration, 'graphStory', {
  sourceGraph: story,
  sketch: story,
});
