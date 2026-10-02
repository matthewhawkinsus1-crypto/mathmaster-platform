/*
 * Shared grader for the `representationBridge` registry tool. Mode graders
 * live in ./representationBridge/.
 */
import declaration from '../declarations/representationBridge.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import linearGraders from './representationBridge/linear.mjs';
import lmrGraders from './representationBridge/lmr.mjs';

export default bindToolGrader(declaration, 'representationBridge', {
  ...linearGraders,
  ...lmrGraders,
});
