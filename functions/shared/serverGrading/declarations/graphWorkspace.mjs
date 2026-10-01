/*
 * Grading declaration for the interactive graph workspace — the structured
 * question surface behind `functionGraph`, `functionInvestigation` (both
 * src/FunctionGraphBuilder.jsx) and `graphAnalysis` (src/GraphAnalysis.jsx),
 * all rendered by src/InteractiveGraphWorkspace.jsx. QuestionEngine renders it
 * (it is not a registry tool); its verdict comes from ONE shared grader over a
 * structured raw response (toolResponseContract.mjs).
 *
 * Every mode is shared-server-authoritative. The work carries everything the
 * browser's verdict reads: point placements and chosen x-values, whether the
 * student committed those placements ("Check Point Placements"), the freehand
 * strokes in SVG viewBox units with the camera window they were checked under
 * and whether the sketch snapped (committed) on screen, each end marker's
 * symbol and the point it was dropped at, and the analysis selections, typed
 * points, "does not exist" choices and typed answers, with the inverse sketch,
 * its camera and its commit. A commit can only withhold credit, never grant
 * it: the grader recomputes each verdict from the work behind it and never
 * reads a browser verdict (locationCorrect, inversePointsValidated).
 *
 * THE FREEHAND SKETCH IS NOT A BLOCKER. The browser's snap check measures
 * strokes against the curve in the drawing's fixed 760x540 viewBox under the
 * window on screen (the student's zoom). The work carries both — the strokes
 * in viewBox units and that window — so the server re-runs the very same
 * check; a window the zoom buttons cannot produce is judged in the authored
 * window, so a forged one is never more lenient than a real zoom.
 *
 * Light by design: imported into the grading manifest. The mathematics is in
 * ../tools/graphWorkspace.mjs and ../../toolMath/graphWorkspace/.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

/*
 * The view the workspace renders, from the question alone.
 *
 * QuestionEngine mounts GraphAnalysis (mode="analysis": no construction) for
 * `graphAnalysis` and FunctionGraphBuilder (mode="investigate": construct
 * first) for `functionGraph` / `functionInvestigation`; the workflow plot
 * stages mount the workspace in construct mode with an untyped question. Within
 * construction the component's own flags pick the view: `pointOnly` /
 * `plotMode: 'points'` (plot points, no curve or markers), then an enabled
 * `inverseReflection`. Analysis requests add an Analyze stage to any
 * construction mode; they do not change which mode it is.
 */
export const resolveGraphWorkspaceMode = (question = {}) => {
  if (String(question?.type || '') === 'graphAnalysis') return 'analysis';
  if (question?.pointOnly || question?.plotMode === 'points') return 'pointOnly';
  if (question?.inverseReflection?.enabled) return 'inverseReflection';
  return 'construct';
};

export default declareTool({
  // Work shape v1 (normalizeGraphWorkspaceWork in
  // toolMath/graphWorkspace/graphWorkspaceModel.mjs):
  //   construction { placements, chosenXValues, pointsLocked, strokes, sketchView, sketchLocked, markerPlacements }
  //   analysis     { selections, answers, typedPoints, noneSelections, inverseStrokes, inverseSketchView, inverseSketchLocked }
  contractVersion: 1,
  defaultMode: 'construct',
  resolveMode: resolveGraphWorkspaceMode,
  modes: {
    // Points (credited once committed, while the committed set still holds),
    // the freehand curve (once snapped, re-checked from strokes + camera), the
    // end markers (graded by location from the dropped point, and by symbol),
    // and any analysis parts.
    construct: SHARED,
    // Points only, plus any analysis parts.
    pointOnly: SHARED,
    // Construction, then the reflected points, the inverse sketch and the
    // inverse equation.
    inverseReflection: SHARED,
    // A pre-drawn graph; analysis parts only (a lone vertex request when none
    // are authored).
    analysis: SHARED,
  },
});
