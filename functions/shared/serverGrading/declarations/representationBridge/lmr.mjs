/*
 * representationBridge — linearMultipleRepresentations mode (see ../representationBridge.mjs). Light.
 *
 * The Multiple Representations board is a pure function of the authoritative
 * question (its GIVEN source, requiredCards, tolerance, context and domain)
 * and the board's own raw work, so the server marks it with the same grader
 * the board runs (../../tools/representationBridge/lmr.mjs).
 *
 * Work shape v1 — exactly the board's answer fields
 * (LinearMultipleRepresentationsBoard.jsx `currentResponse`):
 *
 *   standardFormEquation, slopeInterceptEquation, pointSlopeEquation   strings (MathLive LaTeX)
 *   featureSlope, featureXIntercept, featureYIntercept                  strings
 *   featurePoint1, featurePoint2                                        strings
 *   tableRows                                                           [{ x: string, y: string }]
 *   graph1Points, graph2Points, graph3Points                            [[x, y]] (the board keeps at most 2)
 *   contextIndependent, contextDependent, contextSlopeMeaning,
 *   contextYInterceptMeaning, contextXInterceptMeaning, contextDomain   strings
 *
 * No verdict, no fingerprint of a checked card, no derived fact of the line.
 */
import { SHARED } from '../../toolGraderDefinition.mjs';

export default {
  linearMultipleRepresentations: SHARED,
};
