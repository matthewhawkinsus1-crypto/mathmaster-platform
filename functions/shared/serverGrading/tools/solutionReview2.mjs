/*
 * `solutionReview2` is non-graded (see ../declarations/solutionReview2.mjs).
 * Bound with no mode graders so the registry still accounts for it.
 */
import declaration from '../declarations/solutionReview2.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';

export default bindToolGrader(declaration, 'solutionReview2', {});
