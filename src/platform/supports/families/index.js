// The question families the platform Hint control and "Try a similar one"
// read, in priority order: the first implemented family whose matches()
// accepts a question owns it. Each module's contract is at its top.
import * as linearEquations from './linearEquations.js';
import * as systems from './systems.js';
import * as linesAndSlope from './linesAndSlope.js';
import * as fractions from './fractions.js';
import * as pointsAndIntervals from './pointsAndIntervals.js';
import * as functionFeatures from './functionFeatures.js';
import * as inverseComposition from './inverseComposition.js';
import * as transformations from './transformations.js';
import * as quadraticsAbsoluteValue from './quadraticsAbsoluteValue.js';
import * as dataAndModels from './dataAndModels.js';

const FAMILIES = [linearEquations, systems, linesAndSlope, fractions, pointsAndIntervals, functionFeatures, inverseComposition, transformations, quadraticsAbsoluteValue, dataAndModels];

export const implementedFamilies = () => FAMILIES.filter((module) => module.implemented === true);

export const familyFor = (question) => {
  if (!question || typeof question !== 'object') return null;
  for (const module of implementedFamilies()) {
    try {
      if (module.matches(question)) return module;
    } catch { /* a family that cannot read the question does not own it */ }
  }
  return null;
};

export const ALL_FAMILY_MODULES = Object.freeze(FAMILIES);
