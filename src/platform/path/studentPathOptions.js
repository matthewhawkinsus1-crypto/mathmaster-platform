// One place that turns a student document into path-engine options.
//
// Two surfaces now need this — the Recommended for You panel and My Math Path
// — and if each assembled its own inputs they would eventually disagree about
// what the same student should do next. That divergence is precisely what the
// adaptive brief forbids (§42), so the assembly lives here and both callers
// pass the same result around.

import { getSkillGraph, teksSkillId } from './skillGraph.js';
import { DEFAULT_CLASS_PACING, normalizeClassPacing, sequenceProvider } from './curriculumPacing.js';
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
export const calendarHasStarted = (calendar, nowValue = Date.now()) => {
  // `firstInstructionalDay` is the authored answer; the earliest window start is
  // the fallback for a calendar that omits it. An undated calendar makes no
  // claim about today and is left alone.
  const candidates = [
    calendar?.firstInstructionalDay,
    ...(calendar?.windows || []).map((window) => window?.start),
  ].map((value) => Date.parse(value || '')).filter((value) => Number.isFinite(value));
  if (!candidates.length) return true;
  return nowValue >= Math.min(...candidates);
};

export const resolvePacingProvider = ({ courseId, skills, pacing, nowValue = Date.now() }) => {
  const configured = CALENDAR_COURSES[courseId];

  // A CALENDAR THAT HAS NOT STARTED YET MUST NOT EMPTY THE PATH.
  //
  // Before the first window opens, every skill in the course classifies as
  // FUTURE, every bucket except `future` comes back empty, and My Math Path has
  // literally nothing to offer — a summer-school student, or anyone logging in
  // in June or July, opens a dead Path. That contradicts the rule this module
  // was written to enforce: a missing or not-yet-applicable pacing record must
  // never turn the student's Path off.
  //
  // The fallback is the one the platform already uses for every course without
  // a calendar, and it reports itself as provisional, so the student and the
  // teacher are told the pacing is a placeholder rather than a district plan.
  if (configured && !calendarHasStarted(configured.calendar, nowValue)) {
    return sequenceProvider({ skills, windowCount: pacing?.windowCount });
  }

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


/**
 * My Math Path is autonomous by default. A teacher may override pacing, but a
 * missing settings/classPacing record must never turn the student's Path off.
 *
 * Algebra I/II use their authored district calendars, so the clock supplies
 * the real timing. Courses without a loaded calendar use the provisional
 * sequence and anchor its current window to any OPEN assignment TEKS. With no
 * open assignment yet, window 1 is a safe starting point and prerequisite/
 * mastery evidence immediately adapts from there.
 */
export const deriveAutomaticClassPacing = ({
  courseId = 'algebra1', assignments = [], skills = null, nowValue = Date.now(),
} = {}) => {
  const courseSkills = Array.isArray(skills) ? skills : getSkillGraph(courseId);
  const base = normalizeClassPacing({
    ...DEFAULT_CLASS_PACING,
    pacingFramework: 'automatic',
    pacingVariant: CALENDAR_COURSES[courseId] ? 'district-calendar' : 'assignment-anchored-provisional',
    automatic: true,
  });

  // Calendar-backed courses derive timing from dates inside the provider.
  if (CALENDAR_COURSES[courseId]) return base;

  const provisional = sequenceProvider({ skills: courseSkills, windowCount: base.windowCount });
  const assignedWindows = collectRequiredSkillIds(assignments, nowValue)
    .map((skillId) => Number(provisional.getSkillWindow(skillId)?.window))
    .filter((window) => Number.isFinite(window) && window > 0);

  return normalizeClassPacing({
    ...base,
    currentWindow: assignedWindows.length ? Math.max(...assignedWindows) : base.currentWindow,
  });
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
  // A saved teacher position is an override, not an ignition switch. When it
  // is absent MathMaster derives an automatic position from the real calendar
  // or the open assignment TEKS, so a student with a valid course always has a
  // Path without waiting for teacher setup.

  // The mastery engine iterates assignments directly, so a null list — which a
  // student document has before the first fetch resolves — throws inside it
  // rather than here. Coerce once, at the boundary.
  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const safeStudent = student && typeof student === 'object' ? student : {};

  const skills = getSkillGraph(courseId);
  const effectivePacing = pacing && typeof pacing === 'object'
    ? normalizeClassPacing(pacing)
    : deriveAutomaticClassPacing({ courseId, assignments: safeAssignments, skills, nowValue });
  const pacingProvider = resolvePacingProvider({ courseId, skills, pacing: effectivePacing, nowValue });
  return getStudentPathOptions({
    courseId,
    masteryBySkill: buildMasteryBySkillForStudent({ student: safeStudent, assignments: safeAssignments }),
    pacing: effectivePacing,
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
