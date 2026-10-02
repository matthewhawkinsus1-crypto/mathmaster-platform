/*
 * Grading declaration for the `systemsWorkspace` registry tool.
 *
 * The workspace is several tools in one, so its modes are declared in two
 * groups owned separately:
 *
 *   systemsWorkspace/algebraic.mjs  — `algebraic` (2x2 / 3x3 substitution and
 *                                      elimination, special-case outcomes)
 *   systemsWorkspace/graphical.mjs  — `linear`, `inequalities`,
 *                                      `linearQuadratic`, `matrix`, `matrix3`,
 *                                      `spatial`
 *
 * The mode is the one the WORKSPACE renders, resolved by the same
 * resolveSystemsWorkspaceMode the component uses (old V5 content defaulted to
 * "linear" is still routed to the algebraic workspace).
 *
 * Light by design. The mathematics is in ../tools/systemsWorkspace*.
 */
import { declareTool } from '../toolGraderDefinition.mjs';
import { resolveSystemsWorkspaceMode } from '../../toolMath/systemsWorkspace/systemsWorkspaceMode.mjs';
import algebraicModes from './systemsWorkspace/algebraic.mjs';
import graphicalModes, { graphicalModeSupport } from './systemsWorkspace/graphical.mjs';

export default declareTool({
  contractVersion: 1,
  defaultMode: 'linear',
  resolveMode: (question) => resolveSystemsWorkspaceMode(question),
  // A spatial model with no answer fields is an exploration with no Check:
  // readiness and Pre-Flight must not call it server-graded.
  supports: (question, mode) => graphicalModeSupport(question, mode),
  modes: {
    ...graphicalModes,
    ...algebraicModes,
  },
});
