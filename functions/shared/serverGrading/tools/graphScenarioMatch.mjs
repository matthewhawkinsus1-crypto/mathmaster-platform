/*
 * Shared grader for the `graphScenarioMatch` structured question surface. See
 * ../toolGraderDefinition.mjs for the contract.
 */
import declaration from '../declarations/graphScenarioMatch.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';

export default bindToolGrader(declaration, 'graphScenarioMatch', {});
