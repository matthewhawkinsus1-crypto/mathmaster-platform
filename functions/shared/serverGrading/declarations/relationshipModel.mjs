/*
 * Grading declaration for the STANDALONE `relationshipModel` structured
 * question surface — Quantities and Their Relationship
 * (src/RelationshipModel.jsx), rendered by QuestionEngine (not a registry
 * tool). Its verdict comes from the shared grader over a structured raw
 * response (toolResponseContract).
 *
 * A relationshipModel with a `recipe` or `workflow` is a composed workflow:
 * QuestionEngine and resolveGradingSurfaceId both route it to the
 * composedWorkflow surface before this declaration is consulted.
 *
 * The sections (quantities, continuity, axes, scale, origin) are not separate
 * screens — one view renders whichever the question requires — so this is one
 * mode, and the grader derives the sections with the same helper the screen
 * uses (../../toolMath/scenario/relationshipModelMath.mjs).
 *
 * Light by design. The checks are in ../tools/relationshipModel.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1: { independentId, dependentId, relationshipType, xLabel,
  //   xUnit, yLabel, yUnit, xStep, yStep, originMeaning,
  //   pointMeaning: { xQuantityId, xValue, xUnit, yQuantityId, yValue, yUnit, openText } }
  // originMeaning and openText are strings, or their chunks when longer than
  // the contract's per-string limit (scenarioWork.mjs freeTextWork).
  contractVersion: 1,
  // RelationshipModel.jsx has exactly one view and never reads question.mode.
  defaultMode: 'standalone',
  resolveMode: () => 'standalone',
  modes: {
    standalone: SHARED,
  },
});
