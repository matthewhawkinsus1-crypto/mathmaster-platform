// Everything the CCMR screens need about one student, assembled once.
//
// CCMRHub, the readiness wheels and the "Practice this skill as…" menu each
// take the same four inputs — evidence, the direct-alignment index, the
// student's own goals and the teacher's framework priorities. Assembling them
// per screen would let two CCMR surfaces disagree about the same student, which
// is the mistake `studentPathOptions.js` exists to prevent on the course side.
//
// Pure. The student's goals arrive as data: they are the framework ids of the
// student's saved CCMR plan (studentCcmrPlans, read by ccmrPlanStore.js). They
// used to be kept in each browser's localStorage, which tied a goal to a
// laptop and showed a teacher their OWN browser's copy instead of the
// student's plan.

import { buildAssessmentEvidence } from './assessmentEvidence.js';
import { getDirectAlignmentIndex, ASSESSMENT_FRAMEWORKS } from './assessmentCrosswalk.js';

/**
 * The assessment context for one student.
 *
 * `student` and `assignments` are exactly what the course path is built from,
 * so a skill's CCMR standing and its course standing are read from one set of
 * facts.
 */
export const buildStudentAssessmentContext = ({
  student = null,
  assignments = [],
  goals = [],
  teacherPriorities = [],
  evidenceEvents = [],
} = {}) => {
  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  return {
    assessmentEvidence: buildAssessmentEvidence({ student: student || {}, assignments: safeAssignments, evidenceEvents }),
    // Direct alignment — a question authored AS an SAT item — is kept separate
    // from crosswalk overlap on purpose, and this index is what tells them
    // apart at runtime.
    directIndex: getDirectAlignmentIndex(safeAssignments),
    goals: Array.isArray(goals) ? goals.filter((id) => ASSESSMENT_FRAMEWORKS.includes(id)) : [],
    teacherPriorities: Array.isArray(teacherPriorities)
      ? teacherPriorities.filter((id) => ASSESSMENT_FRAMEWORKS.includes(id))
      : [],
  };
};
