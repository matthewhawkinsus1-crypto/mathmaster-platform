/*
 * Shared grader for the `graphing` structured question surface. See
 * ../toolGraderDefinition.mjs for the contract.
 */
import declaration from '../declarations/graphing.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';

export default bindToolGrader(declaration, 'graphing', {});
