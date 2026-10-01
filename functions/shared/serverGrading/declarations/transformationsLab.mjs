/*
 * Grading declaration for the `transformationsLab` registry tool.
 *
 * Every mode is server graded. Each one checks the student's typed parameters,
 * coordinates, descriptions or plotted points against a graph, mapped point,
 * descriptor or defining feature the server recomputes from the question's own
 * family, target / function, graphBounds, parentPoint and sourcePoints —
 * nothing the browser holds that the server does not.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/transformationsLab.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

// The modes TransformationsLab.jsx matches by exact `mode ===` comparison.
export const TRANSFORMATIONS_LAB_MODES = Object.freeze(['match', 'identify', 'pointMap', 'plotTransform', 'describe', 'anchor']);

/*
 * The mode whose Check the lab runs for this question.
 *
 * TransformationsLab.jsx reads `questionData.mode || 'match'`. A missing mode
 * is the match view. Any other mode that is not one of the six (unknown,
 * mis-cased, padded, not a string) renders no mode panel, and the one Check
 * the screen still offers — the Work View primary action, whose dispatch ends
 * in the defining-feature check — grades the anchor boxes. So it resolves to
 * `anchor`, NOT to the manifest's default-mode fallback (match), which would
 * grade a parameter check the student was never offered.
 */
export const resolveTransformationsLabMode = (question) => {
  const mode = question?.mode || 'match';
  return TRANSFORMATIONS_LAB_MODES.includes(mode) ? mode : 'anchor';
};

export default declareTool({
  // Work shape v1 — per mode, exactly the state the lab's inputs hold (text
  // boxes as their raw text, never Number()-coerced):
  //   match, identify  { a, h, k } — plus b only when the lab shows a b box
  //   pointMap         { mappedX, mappedY }
  //   plotTransform    { plottedPoints: [[x, y], ...] }   in plotting order
  //   describe         { reflection, scaleKind, scaleFactor,
  //                      horizontalReflection, horizontalScaleKind, horizontalScaleFactor,
  //                      horizontalDirection, horizontalDistance,
  //                      verticalDirection, verticalDistance }
  //   anchor           { anchorX, anchorY }
  contractVersion: 1,
  defaultMode: 'match',
  resolveMode: resolveTransformationsLabMode,
  modes: Object.fromEntries(TRANSFORMATIONS_LAB_MODES.map((mode) => [mode, SHARED])),
});
