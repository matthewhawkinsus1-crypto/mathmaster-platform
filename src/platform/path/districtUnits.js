// The unit a skill belongs to, in the words the class uses.
//
// The district calendar says WHEN a curriculum node is taught; the crosswalk
// says WHERE a skill lives instructionally. Joined, they answer the question a
// student browsing their course actually asks — "which unit is this in?" — and
// give the order the units come in.
//
// Two things this deliberately does not do:
//
//   Decide membership by date. A skill belongs to its primary unit all year,
//   before the class arrives and after it has moved on. Timing ("your class is
//   on this now") stays the pacing provider's job and travels on engine rows.
//
//   Rewrite the calendar's names. The Algebra II calendar stores titles exactly
//   as the district supplied them, including review titles that do not match
//   the module names used earlier, and was written NOT to normalise them. The
//   only thing stripped here is window bookkeeping ("(second window)",
//   "(continued)"), which names a block of dates, not a unit.
//
// Topic-level calendar nodes are titled "Topic 1", "Topic 2" — meaningless on
// their own, which is why the engine row's raw window title was never shown to
// a student. A topic's unit is its parent module or unit.

import ALGEBRA1_2026_2027 from '../../curriculum/calendars/algebra1-2026-2027.js';
import ALGEBRA2_HONORS_2026_2027 from '../../curriculum/calendars/algebra2Honors-2026-2027.js';
import { buildSkillCurriculumLinks } from '../curriculum/algebra1CurriculumCrosswalk.js';
import { buildAlgebraIISkillCurriculumLinks } from '../curriculum/algebra2CurriculumCrosswalk.js';
import { describeSkill, teksSkillId } from './skillGraph.js';

const ALGEBRA_I = Object.freeze({
  calendar: ALGEBRA1_2026_2027,
  links: () => buildSkillCurriculumLinks(teksSkillId),
});
const ALGEBRA_II = Object.freeze({
  calendar: ALGEBRA2_HONORS_2026_2027,
  links: () => buildAlgebraIISkillCurriculumLinks(teksSkillId),
});

/**
 * Courses with a real district calendar and a skill crosswalk. The pacing
 * provider (studentPathOptions.js) reads this same table, so the unit a skill
 * is grouped under and the window that times it cannot come from two
 * different calendars.
 */
export const DISTRICT_CALENDAR_COURSES = Object.freeze({
  algebra1: ALGEBRA_I,
  'algebra1-honors': ALGEBRA_I,
  algebra2: ALGEBRA_II,
  'algebra2-honors': ALGEBRA_II,
});

export const districtCalendarFor = (courseId) => DISTRICT_CALENDAR_COURSES[courseId] || null;

export const hasDistrictUnits = (courseId) => Boolean(districtCalendarFor(courseId));

const WINDOW_BOOKKEEPING = /\s*\((?:second window|continued)\)\s*$/i;

/** A unit's name as the calendar gives it, minus window bookkeeping. */
export const districtUnitTitle = (window) => String(window?.title || '').replace(WINDOW_BOOKKEEPING, '').trim();

const isReview = (window) => window?.recommendationMode === 'review' || window?.curriculumType === 'review';
const isAssessment = (window) => window?.curriculumType === 'assessment';
const startKey = (window) => (/^\d{4}-\d{2}-\d{2}/.test(String(window?.start || '')) ? String(window.start).slice(0, 10) : null);
const byStart = (a, b) => String(startKey(a) || '9999').localeCompare(String(startKey(b) || '9999'));
const earliest = (windows) => [...windows].sort(byStart)[0] || null;

/**
 * Units and skill membership for one calendar and its skillId -> curriculumId
 * links. Pure, so the ordering rules can be checked against any calendar.
 */
export const buildDistrictUnitIndex = ({ calendar, links = {} } = {}) => {
  const windows = Array.isArray(calendar?.windows) ? calendar.windows : [];
  const byId = new Map(windows.map((window) => [window.id, window]));
  const byCurriculum = new Map();
  windows.forEach((window) => {
    if (!byCurriculum.has(window.curriculumId)) byCurriculum.set(window.curriculumId, []);
    byCurriculum.get(window.curriculumId).push(window);
  });

  // A skill's home window: where it is first taught, or — for a node the
  // calendar only ever reviews — that review.
  const homeWindow = (curriculumId) => {
    const list = byCurriculum.get(curriculumId) || [];
    const taught = list.filter((window) => !isReview(window) && !isAssessment(window));
    return earliest(taught.length ? taught : list);
  };

  const units = new Map();
  const unitBySkill = new Map();
  Object.entries(links || {}).forEach(([skillId, curriculumId]) => {
    const home = homeWindow(curriculumId);
    if (!home) return;
    const unitWindow = (home.parentId && byId.get(home.parentId)) || home;
    const unitId = unitWindow.curriculumId || unitWindow.id;
    if (!units.has(unitId)) {
      const unitWindows = byCurriculum.get(unitId) || [unitWindow];
      const dated = unitWindows.filter((window) => startKey(window));
      const taught = dated.filter((window) => !isReview(window));
      const named = earliest(taught.length ? taught : dated) || unitWindow;
      units.set(unitId, {
        id: unitId,
        title: districtUnitTitle(named) || districtUnitTitle(unitWindow),
        start: startKey(earliest(dated)),
        // Taught in a dated block. A unit the calendar only reviews (Algebra
        // II Module 2) is real but unscheduled; an embedded one is taught all
        // year and has no block at all.
        scheduled: taught.length > 0,
        embedded: unitWindows.some((window) => window.embedded),
        skillIds: [],
      });
    }
    units.get(unitId).skillIds.push(skillId);
  });

  const rank = (unit) => (unit.scheduled ? 0 : unit.embedded ? 2 : 1);
  const ordered = [...units.values()]
    .sort((a, b) => rank(a) - rank(b) || String(a.start || '9999').localeCompare(String(b.start || '9999')))
    .map((unit, index) => Object.freeze({ ...unit, order: index + 1, skillIds: Object.freeze(unit.skillIds) }));
  ordered.forEach((unit) => unit.skillIds.forEach((skillId) => unitBySkill.set(skillId, unit)));
  return { units: Object.freeze(ordered), unitBySkill };
};

const INDEX_CACHE = new Map();
const indexFor = (courseId) => {
  if (!courseId) return null;
  if (!INDEX_CACHE.has(courseId)) {
    const entry = districtCalendarFor(courseId);
    INDEX_CACHE.set(courseId, entry ? buildDistrictUnitIndex({ calendar: entry.calendar, links: entry.links() }) : null);
  }
  return INDEX_CACHE.get(courseId);
};

/**
 * Every unit of a course, in the order the class meets them: scheduled units
 * by their first day, then units the calendar only reviews, then units taught
 * throughout the year. Empty for a course with no district calendar.
 */
export const getDistrictUnits = (courseId) => indexFor(courseId)?.units || [];

/**
 * The unit a skill belongs to, or null. Without a course, the skill's own
 * course is used — an Algebra I student's grade-8 prerequisite has no Algebra I
 * unit, and saying so is the truthful answer.
 */
export const districtUnitForSkill = (skillId, courseId = null) => {
  if (!skillId) return null;
  const course = courseId || describeSkill(skillId)?.courseId || null;
  return indexFor(course)?.unitBySkill.get(skillId) || null;
};
