/*
 * systemsWorkspace — graphical / matrix / spatial mode group
 * (see ../systemsWorkspace.mjs). Light: declarations only.
 */
import { clientGraded } from '../../toolGraderDefinition.mjs';

const pending = (mode) => clientGraded(`PENDING: shared server grader not yet implemented for systemsWorkspace ${mode} mode.`);

export default {
  linear: pending('linear'),
  inequalities: pending('inequalities'),
  linearQuadratic: pending('linearQuadratic'),
  matrix: pending('matrix'),
  matrix3: pending('matrix3'),
  spatial: pending('spatial'),
};
