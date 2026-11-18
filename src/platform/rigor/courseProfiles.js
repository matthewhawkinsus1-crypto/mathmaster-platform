/*
 * THE CLASS PERIODS' COURSE PROFILES, ON THEIR OWN (PF01).
 *
 * App reads one thing from course rigor: each period's course and level
 * (`settings/courseProfiles`), with the defaults it starts from before that
 * document is read. Importing those from courseRigor.js carried the Honors
 * rigor checks, the strand table and the exam crosswalk they read in front of
 * every student's Home. courseRigor.js re-exports every name here, so every
 * caller reads the same functions; the checks load with the teacher's
 * screens that use them.
 */

export const COURSE_LEVELS = Object.freeze({
  STANDARD: 'standard',
  HONORS: 'honors',
});

export const COURSE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'algebra1', label: 'Algebra I' }),
  Object.freeze({ id: 'algebra2', label: 'Algebra II' }),
]);

export const COURSE_LABELS = Object.freeze(Object.fromEntries(COURSE_OPTIONS.map((course) => [course.id, course.label])));

export const normalizeCourseLevel = (value) => (
  String(value || '').trim().toLowerCase() === COURSE_LEVELS.HONORS
    ? COURSE_LEVELS.HONORS
    : COURSE_LEVELS.STANDARD
);

export const normalizeCourseId = (value) => {
  const token = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['algebra2', 'alg2', 'a2'].includes(token)) return 'algebra2';
  return 'algebra1';
};

export const defaultCourseProfiles = (classPeriods = []) => Object.fromEntries(
  classPeriods.map((period) => [period, {
    classPeriod: period,
    course: 'algebra1',
    courseLabel: 'Algebra I',
    courseLevel: COURSE_LEVELS.STANDARD,
  }]),
);

export const normalizeCourseProfiles = (rawProfiles = {}, classPeriods = []) => {
  const defaults = defaultCourseProfiles(classPeriods);
  return Object.fromEntries(classPeriods.map((period) => {
    const source = rawProfiles?.[period] || {};
    const course = normalizeCourseId(source.course || source.courseId);
    return [period, {
      ...defaults[period],
      ...source,
      classPeriod: period,
      course,
      courseLabel: COURSE_LABELS[course],
      courseLevel: normalizeCourseLevel(source.courseLevel || source.level),
    }];
  }));
};
