/*
 * Grading declaration for the `representationBridge` registry tool.
 *
 * Two modes with different boards, declared in two files owned separately:
 *
 *   representationBridge/linear.mjs     — the linear Representation Bridge
 *   representationBridge/lmr.mjs        — `linearMultipleRepresentations`
 *
 * RepresentationBridge.jsx renders the Multiple Representations board only
 * for `mode: "linearMultipleRepresentations"`; every other value renders the
 * linear bridge.
 *
 * Light by design. The mathematics is in ../tools/representationBridge*.
 */
import { declareTool } from '../toolGraderDefinition.mjs';
import linearModes from './representationBridge/linear.mjs';
import lmrModes from './representationBridge/lmr.mjs';

export default declareTool({
  contractVersion: 1,
  defaultMode: 'linear',
  resolveMode: (question) => (question?.mode === 'linearMultipleRepresentations' ? 'linearMultipleRepresentations' : 'linear'),
  modes: {
    ...linearModes,
    ...lmrModes,
  },
});
