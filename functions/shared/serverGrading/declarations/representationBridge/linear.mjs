/*
 * representationBridge — linear bridge mode (see ../representationBridge.mjs). Light.
 *
 * Every verdict in this mode is recomputed from the authoritative question
 * (its table, required stages, required comparisons, graph tolerance and
 * meaning context) plus the student's own entries — nothing the browser holds
 * that the server does not. The grader is
 * ../../tools/representationBridge/linear.mjs.
 *
 * Work shape v1 — exactly the bridge's inputs (RepresentationBridge.jsx):
 *
 *   tableEvidence       [{ i, j, dx, dy, rate }]   recorded intervals; i/j are
 *                                                  row indexes into source.rows
 *   studentSlope        string                     "m (your slope)"
 *   rateConclusion      '' | 'constant' | 'not constant'
 *   generalForm         { m, b, equation }
 *   factoredForm        { a, c, equation }
 *   graphConstruction   { points: [[x, y], [x, y]] }
 *   meaningAssignments  { rate | yIntercept | zero: { unit, contextMeaning, mathRole } }
 *
 * Stage checks, the selected rows, the staging Δx/Δy/rate boxes and the
 * active highlight only gate buttons or emphasis; none is part of the work.
 */
import { SHARED } from '../../toolGraderDefinition.mjs';

export default {
  linear: SHARED,
};
