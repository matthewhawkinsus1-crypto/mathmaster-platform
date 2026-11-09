// THE ASSESSMENTS' NAMES, ON THEIR OWN (PF01).
//
// A student's Home reads one thing from the assessment crosswalk: what to call
// an assessment (a question card's "Digital SAT practice", the weekly plan's
// transfer reason). The crosswalk itself (assessmentCrosswalk.js) resolves a
// skill to the assessments it appears on, and importing the names from there
// carried it in front of every student's Home. assessmentCrosswalk.js
// re-exports this object, so every caller reads the same one; the crosswalk
// loads with My Math Path, the question screen and the teacher's tools.

import { EXAM_TYPES } from '../assessment/examDomainRegistry.js';

export const FRAMEWORK_LABELS = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: 'Digital SAT',
  [EXAM_TYPES.ACT]: 'ACT',
  [EXAM_TYPES.TSIA2]: 'TSIA2',
  [EXAM_TYPES.ASVAB]: 'ASVAB',
});
