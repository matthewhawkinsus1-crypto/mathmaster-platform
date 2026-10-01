/*
 * Grading declaration for the `constraintFunctionBuilder` registry tool.
 *
 * The student constructs a model (family, parameters, continuous or discrete
 * domain) and the verdict is how many of the question's own constraints that
 * model satisfies. The verdict reads only the student's model and the
 * authoritative question's constraints, AUTHORED prompt and family list, so
 * the server recomputes it from nothing the browser holds that it does not —
 * a translated prompt on the device is never the wording that is graded.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/constraintFunctionBuilder.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1 — exactly the builder's own state:
  //   {
  //     model: { family, a, h, k, base, domainMode, domainMin, domainMax, verticalX }
  //                                the constructed model (normalizeBuilderModel shape)
  //     hasEdited: boolean         the student has made at least one choice —
  //                                the builder refuses to submit before that,
  //                                so untouched work is never complete
  //     equation: string           the model as the screen writes it (display
  //                                only; the grader never reads it)
  //   }
  contractVersion: 1,
  // ConstraintFunctionBuilder.jsx has a single view and never reads
  // `question.mode`: every question renders this one screen.
  defaultMode: 'default',
  resolveMode: () => 'default',
  modes: {
    default: SHARED,
  },
});
