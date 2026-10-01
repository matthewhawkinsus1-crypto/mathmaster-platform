/*
 * Grading declaration for the `graphScenarioMatch` structured question surface
 * — the Visual Match Board (src/GraphScenarioMatch.jsx), rendered by
 * QuestionEngine (not a registry tool). Its verdict comes from the shared
 * grader over a structured raw response (toolResponseContract).
 *
 * Each scenario's chosen graph is compared with the question's correctMatches
 * (or the scenario's own graphId): nothing the server does not hold.
 *
 * Light by design. The checks are in ../tools/graphScenarioMatch.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1: { matches: [{ scenarioId, graphId }] }, sorted by scenario.
  contractVersion: 1,
  // GraphScenarioMatch.jsx has exactly one view and never reads question.mode.
  defaultMode: 'matchBoard',
  resolveMode: () => 'matchBoard',
  modes: {
    matchBoard: SHARED,
  },
});
