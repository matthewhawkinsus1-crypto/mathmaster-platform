/*
 * Grading declaration for the `inverseCompositionLab` registry tool.
 *
 * Every view is the student's typed values, restriction choice or derivation
 * equation, checked against values the server recomputes from the question's
 * own f, g and x — nothing the browser holds that the server does not.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/inverseCompositionLab.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

// The views InverseCompositionLab.jsx distinguishes by exact `mode` match.
const LAB_VIEWS = Object.freeze(['composition', 'inverse', 'restriction']);
const DERIVATION_EPSILON = 1e-9;

/*
 * The derivation view can only open on a linear f with a finite, nonzero
 * slope and finite shifts: createLinearInverseDerivation refuses anything else
 * (and the screen cannot render it), and toolSchemas.js rejects such a question
 * at authoring time. This mirrors that guard so Pre-Flight and ingestion know
 * up front that no verdict exists; the grader itself still refuses it.
 */
const derivationSupported = (question = {}) => {
  const f = question?.f || { type: 'linear', a: 2, h: 0, k: 3 };
  if (f.type !== 'linear') return false;
  const a = Number(f.a ?? 1);
  const h = Number(f.h ?? 0);
  const k = Number(f.k ?? 0);
  return [a, h, k].every(Number.isFinite) && Math.abs(a) > DERIVATION_EPSILON;
};

export default declareTool({
  // Work shape v1 — exactly the lab's own state:
  //   full / composition / inverse / restriction
  //     { x, fogAnswer, gofAnswer, inverseAnswer, restrictionChoice }
  //       x                 the input the lab used (ignored when the question
  //                         gives x and does not allow changing it)
  //       *Answer           the boxes, as typed (a blank stays blank)
  //       restrictionChoice 'none' | 'left' | 'right' | 'required'
  //   deriveInverse
  //     { equation: { left: {x, y, c}, right: {x, y, c} }, relation, steps }
  //       equation          the derivation's current equation (coefficients
  //                         of x, y and the constant on each side)
  //       relation, steps   the equation as the screen writes it and the
  //                         number of steps taken (display only)
  contractVersion: 1,
  // InverseCompositionLabRouter.jsx sends exactly `mode === 'deriveInverse'`
  // to InverseDerivationLab. InverseCompositionLab.jsx reads
  // `questionData.mode || 'full'` and compares it with `===`: composition,
  // inverse and restriction each mark their own parts, and ANY other value —
  // missing, unknown, padded, mis-cased, not a string — is marked as the full
  // lab. The manifest's generic fallback would trim ' deriveInverse ' into the
  // derivation view while the screen shows the lab; this reproduces the screen.
  defaultMode: 'full',
  resolveMode: (question) => {
    const mode = question?.mode;
    if (mode === 'deriveInverse') return 'deriveInverse';
    return LAB_VIEWS.includes(mode) ? mode : 'full';
  },
  supports: (question, mode) => (mode === 'deriveInverse' && !derivationSupported(question)
    ? { supported: false, reason: 'unsupported-question:derive-inverse-needs-nonconstant-linear-f' }
    : { supported: true }),
  modes: {
    full: SHARED,
    composition: SHARED,
    inverse: SHARED,
    restriction: SHARED,
    deriveInverse: SHARED,
  },
});
