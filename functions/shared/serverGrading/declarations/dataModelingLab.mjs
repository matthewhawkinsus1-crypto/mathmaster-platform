/*
 * Grading declaration for the `dataModelingLab` registry tool.
 *
 * Every mode is server graded. Each one checks typed coefficients, an entered
 * r, chosen labels and a prediction against a regression, correlation, best
 * model family and prediction the server recomputes from the question's own
 * points — nothing the browser holds that the server does not.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. The mode
 * catalog it imports is a constant-only module; the mathematics is in
 * ../tools/dataModelingLab.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';
import {
  DATA_MODELING_MODES,
  DATA_MODELING_UNRECOGNIZED_MODE,
  resolveDataModelingMode,
} from '../../toolMath/dataModeling/dataModelingPlan.mjs';

export default declareTool({
  // Work shape v1 — the lab's raw inputs, never Number()-coerced, under the
  // keys the lab has always sent (My Math Path's grader reads them too):
  //   fit, when the mode grades one:
  //     a line            { m, b }
  //     quadratic modes   { a, b, c }
  //     exponential modes { a, base }
  //     squareRoot mode   { a, h, k }
  //   always: { r (the typed correlation), direction, strength, causation,
  //             modelChoice, predictionX, predictionY, predictionType }
  contractVersion: 1,
  // DataModelingLab.jsx: `questionData.mode || 'full'`. A missing mode is the
  // full lab; an unrecognised one is NOT — it renders its own reduced screen
  // (see dataModelingPlan.mjs), so it resolves to a mode of its own instead of
  // the manifest's default-mode fallback.
  defaultMode: 'full',
  resolveMode: resolveDataModelingMode,
  modes: Object.fromEntries(
    [...DATA_MODELING_MODES, DATA_MODELING_UNRECOGNIZED_MODE].map((mode) => [mode, SHARED]),
  ),
});
