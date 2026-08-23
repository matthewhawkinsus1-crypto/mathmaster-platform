// Everything the CCMR screens need about one student, assembled once.
//
// CCMRHub, the readiness wheels and the "Practice this skill as…" menu each
// take the same four inputs — evidence, the direct-alignment index, the
// student's own goals and the teacher's framework priorities. Assembling them
// per screen would let two CCMR surfaces disagree about the same student, which
// is the mistake `studentPathOptions.js` exists to prevent on the course side.
//
// Pure apart from the goal store, which is deliberately local: a student's
// "I'm preparing for the ACT" is a preference, not an academic record, and it
// should not need a Firestore rule deploy to work.

import { buildAssessmentEvidence } from './assessmentEvidence.js';
import { getDirectAlignmentIndex, ASSESSMENT_FRAMEWORKS } from './assessmentCrosswalk.js';

const GOAL_STORAGE_PREFIX = 'mathmaster:ccmrGoals:';

const storage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Private browsing and blocked storage both throw on access rather than
    // returning null, and neither is a reason to break the screen.
    return null;
  }
};

export const readCcmrGoals = (studentId) => {
  if (!studentId) return [];
  try {
    const raw = storage()?.getItem(`${GOAL_STORAGE_PREFIX}${studentId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => ASSESSMENT_FRAMEWORKS.includes(id)) : [];
  } catch {
    return [];
  }
};

export const writeCcmrGoals = (studentId, goals) => {
  if (!studentId) return;
  try {
    const clean = (Array.isArray(goals) ? goals : []).filter((id) => ASSESSMENT_FRAMEWORKS.includes(id));
    storage()?.setItem(`${GOAL_STORAGE_PREFIX}${studentId}`, JSON.stringify(clean));
  } catch {
    // A student whose browser refuses storage still gets the session's choice;
    // it simply does not survive a reload.
  }
};

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
