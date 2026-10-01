/*
 * Shared grader for the `graphComparison` structured question surface. See
 * ../toolGraderDefinition.mjs for the contract.
 */
import declaration from '../declarations/graphComparison.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';

export default bindToolGrader(declaration, 'graphComparison', {});
