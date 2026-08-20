// One place that turns a student document into path-engine options.
//
// Two surfaces now need this — the Recommended for You panel and My Math Path
// — and if each assembled its own inputs they would eventually disagree about
// what the same student should do next. That divergence is precisely what the
// adaptive brief forbids (§42), so the assembly lives here and both callers
// pass the same result around.

import { getSkillGraph, teksSkillId } from './skillGraph.js';
import { sequenceProvider } from './curriculumPacing.js';
import { calendarPacingProvider, toEngineTiming } from './curriculumCalendar.js';
import { buildSkillCurriculumLinks } from '../curriculum/algebra1CurriculumCrosswalk.js';
import ALGEBRA1_2026_2027 from '../../curriculum/calendars/algebra1-2026-2027.js';
import { buildAlgebraIISkillCurriculumLinks } from '../curriculum/algebra2CurriculumCrosswalk.js';
import ALGEBRA2_HONORS_2026_2027 from '../../curriculum/calendars/algebra2Honors-2026-2027.js';
import { getStudentPathOptions } from './recommendationEngine.js';
import { buildMasteryBySkillForStudent, collectAssignmentSkillIds } from './masteryAdapter.js';

// Courses with a real district calendar and a skill crosswalk. Anything not
// listed falls back to the provisional even spread, and says so.
const CALENDAR_COURSES = {
  algebra1: { calendar: ALGEBRA1_2026_2027, links: () => buildSkillCurriculumLinks(teksSkillId) },
  'algebra1-honors': { calendar: ALGEBRA1_2026_2027, links: () => buildSkillCurriculumLinks(teksSkillId) },
  algebra2: { calendar: ALGEBRA2_HONORS_2026_2027, links: () => buildAlgebraIISkillCurriculumLinks(teksSkillId) },
  'algebra2-honors': { calendar: ALGEBRA2_HONORS_2026_2027, links: () => buildAlgebraIISkillCurriculumLinks(teksSkillId) },
};

/**
 * The pacing provider for a course: the real calendar where one exists, the
 * provisional spread otherwise. Returned through one function so the student
 * panel, My Math Path, the pacing screen and the simulator cannot end up on
 * different providers.
 */
export const resolvePacingProvider = ({ courseId, skills, pacing, nowValue = Date.now() }) => {
  const configured = CALENDAR_COURSES[courseId];
  if (configured) {
    const provider = calendarPacingProvider({
      calendar: configured.calendar,
      skillCurriculumLinks: configured.links(),
      nowValue,
    });
    // The engine speaks in review/current/ahead/future; the calendar speaks in
    // review/current/upcoming/future. Translate at the boundary rather than
    // teaching the engine a second vocabulary.
    return {
      ...provider,
      getSkillWindow: (skillId) => {
        const state = provider.getSkillTiming(skillId);
        if (state.unmapped) return null;
        return {
          engineTiming: toEngineTiming(state.timing),
          calendarTiming: state.timing,
          recommendationMode: state.recommendationMode,
          instructionalDaysUntilStart: state.instructionalDaysUntilStart ?? 0,
          calendarDaysUntilStart: state.calendarDaysUntilStart ?? 0,
          reinforcementStatus: state.reinforcementStatus || null,
          calendarDaysUntilReinforcement: state.calendarDaysUntilReinforcement ?? 0,
          unscheduled: Boolean(state.unscheduled),
          embedded: Boolean(state.embedded),
          window: state.window,
        };
      },
    };
  }
  return sequenceProvider({ skills, windowCount: pacing?.windowCount });
};

/**
 * The skills a student's OPEN assigned work covers.
 *
 * Only assignments that are actually open count: a closed unit is history, and
 * marking its skills "required" would tell a student to go back and redo work
 * their teacher has already collected. An assignment with no dates is treated
 * as open, which is how an unscheduled practice set behaves everywhere else.
 */
export const collectRequiredSkillIds = (assignments = [], nowValue = Date.now()) => {
  const open = (Array.isArray(assignments) ? assignments : []).filter((assignment) => {
    if (assignment?.simulated) return false;
    const closesAt = Number(assignment?.closesAt || assignment?.dueAt || 0);
    const opensAt = Number(assignment?.opensAt || assignment?.availableAt || 0);
    if (opensAt && nowValue < opensAt) return false;
    if (closesAt && nowValue > closesAt) return false;
    return true;
  });
  return collectAssignmentSkillIds(open);
};

export const buildStudentPathOptions = ({
  student,
  assignments = [],
  courseId = 'algebra1',
  pacing = null,
  teacherOverrides = [],
  // Skills the teacher has made non-optional. A caller may name them
  // explicitly; when it does not, they are derived below from the assignments
  // that are actually open, because "your teacher assigned this" is a fact the
  // assignment list already knows.
  requiredSkillIds = null,
  nowValue = Date.now(),
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
  const pacingProvider = resolvePacingProvider({ courseId, skills, pacing, nowValue });
  return getStudentPathOptions({
    courseId,
    masteryBySkill: buildMasteryBySkillForStudent({ student: safeStudent, assignments: safeAssignments }),
    pacing,
    pacingProvider,
    teacherOverrides,
    // Teacher-assigned work is the classroom contract, and the Path is
    // supposed to say so rather than merely nudge its score. Every caller in
    // the app omitted `requiredSkillIds`, so the REQUIRED state — and the
    // "finish your assigned work first" rule that depends on it — could never
    // fire for a real student.
    requiredSkillIds: Array.isArray(requiredSkillIds)
      ? requiredSkillIds
      : collectRequiredSkillIds(safeAssignments, nowValue),
    assignmentSkillIds: collectAssignmentSkillIds(safeAssignments),
  });
};
