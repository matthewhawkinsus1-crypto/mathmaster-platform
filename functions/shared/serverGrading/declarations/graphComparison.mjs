/*
 * Grading declaration for the `graphComparison` structured question surface —
 * Compare and Contrast Graphs (src/GraphComparison.jsx), rendered by
 * QuestionEngine (not a registry tool). Its verdict comes from the shared
 * grader over a structured raw response (toolResponseContract).
 *
 * A choice field is matched against its accepted answers; any other field
 * against its required concept groups — all authored on the question.
 *
 * Light by design. The checks are in ../tools/graphComparison.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1: { responses: [{ fieldId, text }] }, sorted by field. `text`
  // is a string, or — past the contract's per-string limit — its chunks
  // (toolMath/scenario/scenarioWork.mjs freeTextWork), so it is graded whole.
  contractVersion: 1,
  // GraphComparison.jsx has exactly one view (each field picks its own
  // select/textarea) and never reads question.mode.
  defaultMode: 'compare',
  resolveMode: () => 'compare',
  modes: {
    compare: SHARED,
  },
});
