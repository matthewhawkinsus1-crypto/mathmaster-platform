/*
 * Shared grader for the `contextInterpretation` structured question surface. See
 * ../toolGraderDefinition.mjs for the contract.
 */
import declaration from '../declarations/contextInterpretation.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';

export default bindToolGrader(declaration, 'contextInterpretation', {});
