/*
 * Grading declaration for the `contextInterpretation` structured question
 * surface — Interpret a Point in Context (src/ContextInterpretation.jsx with
 * src/PointMeaningBuilder.jsx), rendered by QuestionEngine (not a registry
 * tool). Its verdict comes from the shared grader over a structured raw
 * response (toolResponseContract).
 *
 * Every check reads the question's own target coordinates, quantities,
 * accepted names/units or required concepts.
 *
 * Light by design. The checks are in ../tools/contextInterpretation.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

const RESPONSE_MODES = ['builder', 'guided', 'open'];

export default declareTool({
  // Work shape v1 (every mode): the seven PointMeaningBuilder entries
  //   { xQuantityId, xValue, xUnit, yQuantityId, yValue, yUnit, openText }
  contractVersion: 1,
  /*
   * PointMeaningBuilder renders by `responseMode` exactly as
   * normalizeInterpretationConfig reads it: 'builder' | 'guided' | 'open',
   * anything else (missing, misspelled, padded) is 'builder'. No trimming —
   * ' open' renders the builder, so it grades as the builder.
   *
   *   builder  choose each quantity, type each value and unit
   *   guided   type each value and unit (quantities are given)
   *   open     write the interpretation as text
   */
  defaultMode: 'builder',
  resolveMode: (question = {}) => (RESPONSE_MODES.includes(question?.responseMode) ? question.responseMode : 'builder'),
  modes: {
    builder: SHARED,
    guided: SHARED,
    open: SHARED,
  },
});
