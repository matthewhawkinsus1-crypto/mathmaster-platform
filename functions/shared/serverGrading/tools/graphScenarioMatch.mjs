/*
 * Shared grader for the `graphScenarioMatch` structured question surface (the
 * Visual Match Board, src/GraphScenarioMatch.jsx) — run by the screen for the
 * verdict it reports, and by the server as the authority. See
 * ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from GraphScenarioMatch.jsx: one part per scenario
 * with an id; complete when a graph is matched to it; correct when the matched
 * graph is the key — `question.correctMatches[scenarioId]`, or, when
 * correctMatches is not authored, the scenario's own `graphId`. Strict
 * equality, as before. The work is complete when every scenario is matched.
 *
 * The key is read from the question, never from the graph bank's order or
 * length. Ids are looked up as OWN properties only (the old screen also read
 * inherited ones, so a scenario named `constructor` was "matched" before the
 * student touched it).
 *
 * A PART IS CORRECT ONLY WHEN IT IS COMPLETE. The old screen compared
 * `matches[id] === key`, so an UNMATCHED scenario with no key read
 * `undefined === undefined` — "correct". That never mattered there (Submit
 * needs every scenario matched), but the server grades any work it is sent,
 * and that blank part would have earned credit for an empty board. For every
 * board the screen can submit, the verdict and the credit are unchanged.
 */
import declaration from '../declarations/graphScenarioMatch.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { ownValue, readScenarioMatches } from '../../toolMath/scenario/scenarioWork.mjs';

const matchBoard = (question, work) => {
  const scenarios = Array.isArray(question.scenarios) ? question.scenarios.filter((item) => item?.id) : [];
  const correctMatches = question.correctMatches
    || Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario.graphId]));
  const matches = readScenarioMatches(work);
  const parts = scenarios.map((scenario) => {
    const scenarioId = String(scenario.id);
    const matched = matches.get(scenarioId);
    const isComplete = Boolean(matched);
    return {
      id: `match:${scenario.id}`,
      label: scenario.title || scenario.id,
      isComplete,
      // An unmatched scenario is never correct (see the header).
      isCorrect: isComplete && matched === ownValue(correctMatches, scenarioId),
      response: matched || '',
    };
  });
  return gradedResult({
    isComplete: parts.length > 0 && parts.every((part) => part.isComplete),
    parts,
  });
};

export default bindToolGrader(declaration, 'graphScenarioMatch', {
  matchBoard,
});
