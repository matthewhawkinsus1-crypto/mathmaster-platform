// One place that turns a student document into path-engine options.
//
// Two surfaces now need this — the Recommended for You panel and My Math Path
// — and if each assembled its own inputs they would eventually disagree about
// what the same student should do next. That divergence is precisely what the
// adaptive brief forbids (§42), so the assembly lives here and both callers
// pass the same result around.

import { getSkillGraph } from './skillGraph.js';
import { sequenceProvider } from './curriculumPacing.js';
import { getStudentPathOptions } from './recommendationEngine.js';
import { buildMasteryBySkillForStudent, collectAssignmentSkillIds } from './masteryAdapter.js';

export const buildStudentPathOptions = ({
  student,
  assignments = [],
  courseId = 'algebra1',
  pacing = null,
  teacherOverrides = [],
  requiredSkillIds = [],
} = {}) => {
  // No pacing means the teacher has not said where the class is, and the
  // engine's timing dimension would be guessing. Callers treat null as
  // "show nothing" rather than falling back to a placeholder calendar.
  if (!pacing) return null;

  // The mastery engine iterates assignments directly, so a null list — which a
  // student document has before the first fetch resolves — throws inside it
  // rather than here. Coerce once, at the boundary.
  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const safeStudent = student && typeof student === 'object' ? student : {};

  const skills = getSkillGraph(courseId);
  return getStudentPathOptions({
    courseId,
    masteryBySkill: buildMasteryBySkillForStudent({ student: safeStudent, assignments: safeAssignments }),
    pacing,
    pacingProvider: sequenceProvider({ skills, windowCount: pacing.windowCount }),
    teacherOverrides,
    requiredSkillIds,
    assignmentSkillIds: collectAssignmentSkillIds(safeAssignments),
  });
};
