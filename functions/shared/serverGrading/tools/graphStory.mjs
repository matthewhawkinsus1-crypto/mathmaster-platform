/*
 * Shared grader for the `graphStory` structured question surface. See
 * ../toolGraderDefinition.mjs for the contract.
 */
import declaration from '../declarations/graphStory.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';

export default bindToolGrader(declaration, 'graphStory', {});
