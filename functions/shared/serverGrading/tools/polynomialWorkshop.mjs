/*
 * Shared grader for the `polynomialWorkshop` registry tool — run by the browser tool for
 * feedback, by QuestionEngine for the recorded verdict, and by the server as
 * the authority. See ../toolGraderDefinition.mjs for the contract.
 */
import declaration from '../declarations/polynomialWorkshop.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';

export default bindToolGrader(declaration, 'polynomialWorkshop', {});
