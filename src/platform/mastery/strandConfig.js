// The mastery wheel's strands, per course.
//
// This file used to describe Algebra I and only Algebra I: the strand list, the
// wheel and the dashboard all assumed it. An Algebra II student was therefore
// shown an Algebra I wheel of standards they are not taking, which is worse
// than showing nothing — it reports mastery of a course they are not enrolled
// in.
//
// Strands are read from the standards themselves rather than listed by hand, so
// a course whose TEKS change does not need this file edited. Only the grouping
// and the colours are opinions.

import {
  ALGEBRA_I_TEKS, ALGEBRA_II_TEKS, ALGEBRA_II_STRANDS, getTexasStandardsForCourse,
} from '../../texasStandards.js';
import { toDisplayCode } from '../../utils/teksUtils.js';

// Process standards describe how a student works, not what they know, so they
// are not wheel segments — a student cannot "master A.1A" in a way a mastery
// estimate can report.
const contentCodesFor = (standards) => standards
  .filter((standard) => standard.classification !== 'process')
  .map((standard) => standard.code);

const sectionOf = (code) => Number(String(code).match(/(\d+)[A-Z]$/)?.[1]);

const codesInSections = (codes, sections) => codes.filter((code) => sections.includes(sectionOf(code)));

const ALGEBRA_I_CONTENT = contentCodesFor(ALGEBRA_I_TEKS);
const ALGEBRA_II_CONTENT = contentCodesFor(ALGEBRA_II_TEKS);

const strand = (id, title, color, codes) => Object.freeze({ id, title, color, codes: Object.freeze(codes) });

const ALGEBRA_I_STRAND_LIST = Object.freeze([
  strand('linear_functions', 'Linear Functions & Representations', '#137333', codesInSections(ALGEBRA_I_CONTENT, [2, 3, 4])),
  strand('equations_inequalities', 'Linear Equations & Systems', '#b06000', codesInSections(ALGEBRA_I_CONTENT, [5])),
  strand('quadratic_functions', 'Quadratic Functions & Equations', '#a142f4', codesInSections(ALGEBRA_I_CONTENT, [6, 7, 8])),
  strand('exponential_functions', 'Exponential Functions', '#c5221f', codesInSections(ALGEBRA_I_CONTENT, [9])),
  strand('number_algebra', 'Number & Algebraic Methods', '#1a73e8', codesInSections(ALGEBRA_I_CONTENT, [10, 11, 12])),
]);

// Algebra II's own strands are already named in the standards, so the wheel
// uses those names rather than a second taxonomy invented here.
const ALGEBRA_II_COLORS = {
  2: '#137333', 3: '#b06000', 4: '#a142f4', 5: '#c5221f', 6: '#0b8043', 7: '#1a73e8', 8: '#8430ce',
};

const ALGEBRA_II_STRAND_LIST = Object.freeze(
  Object.keys(ALGEBRA_II_STRANDS)
    .map(Number)
    .filter((section) => section !== 1)
    .map((section) => strand(
      `algebra2_strand_${section}`,
      ALGEBRA_II_STRANDS[section],
      ALGEBRA_II_COLORS[section] || '#5f6368',
      codesInSections(ALGEBRA_II_CONTENT, [section]),
    ))
    .filter((entry) => entry.codes.length),
);

const MIDDLE_SCHOOL_COLORS = Object.freeze(['#1a73e8', '#137333', '#b06000', '#a142f4', '#c5221f', '#0b8043', '#8430ce']);

const buildMiddleSchoolStrands = (courseId) => {
  const standards = getTexasStandardsForCourse(courseId).filter((standard) => standard.classification !== 'process');
  const courseLabel = standards[0]?.course || courseId;
  const sections = [...new Set(standards.map((standard) => Number(standard.strand)).filter(Number.isFinite))].sort((a, b) => a - b);
  return Object.freeze(sections.map((section, index) => strand(
    `${courseId}_strand_${section}`,
    `${courseLabel} · TEKS ${String(courseId).replace('grade', '')}.${section}`,
    MIDDLE_SCHOOL_COLORS[index % MIDDLE_SCHOOL_COLORS.length],
    standards.filter((standard) => Number(standard.strand) === section).map((standard) => standard.code),
  )).filter((entry) => entry.codes.length));
};

const GRADE_6_STRAND_LIST = buildMiddleSchoolStrands('grade6');
const GRADE_7_STRAND_LIST = buildMiddleSchoolStrands('grade7');
const GRADE_8_STRAND_LIST = buildMiddleSchoolStrands('grade8');

const STRANDS_BY_COURSE = Object.freeze({
  grade6: GRADE_6_STRAND_LIST,
  grade7: GRADE_7_STRAND_LIST,
  grade8: GRADE_8_STRAND_LIST,
  algebra1: ALGEBRA_I_STRAND_LIST,
  'algebra1-honors': ALGEBRA_I_STRAND_LIST,
  algebra2: ALGEBRA_II_STRAND_LIST,
  'algebra2-honors': ALGEBRA_II_STRAND_LIST,
});

export const DEFAULT_MASTERY_COURSE_ID = 'algebra1';

export const isMasteryCourse = (courseId) => Boolean(STRANDS_BY_COURSE[courseId]);

/**
 * The strands for a course. An unknown course falls back to Algebra I rather
 * than to an empty wheel, because a blank circle tells a student nothing —
 * but `isMasteryCourse` lets a caller check first and say so instead.
 */
export const getMasteryStrands = (courseId = DEFAULT_MASTERY_COURSE_ID) => (
  STRANDS_BY_COURSE[courseId] || ALGEBRA_I_STRAND_LIST
);

export const getWheelTeksForCourse = (courseId = DEFAULT_MASTERY_COURSE_ID) => getMasteryStrands(courseId)
  .flatMap((entry) => entry.codes);

/**
 * Which course a TEKS code belongs to, so a screen holding a code but not a
 * course — a launch link, a saved recommendation — still lands on the right
 * wheel.
 */
export const courseIdForTeks = (teksCode) => {
  const code = toDisplayCode(teksCode);
  if (/^6\./i.test(code)) return 'grade6';
  if (/^7\./i.test(code)) return 'grade7';
  if (/^8\./i.test(code)) return 'grade8';
  if (/^A2\./i.test(code)) return 'algebra2';
  return 'algebra1';
};

export const getStrandForTEKS = (teksCode, courseId = null) => {
  const code = toDisplayCode(teksCode);
  const strands = getMasteryStrands(courseId || courseIdForTeks(code));
  return strands.find((entry) => entry.codes.includes(code)) || strands[strands.length - 1];
};

export const MASTERY_STATUS_COLORS = Object.freeze({
  Mastered: '#1e8e3e',
  Secure: '#34a853',
  Developing: '#fbbc04',
  'Needs Attention': '#ea4335',
  'Not Enough Evidence': '#dadce0',
});

/**
 * The course title a student should see above their wheel — "Algebra II", not
 * "algebra2-honors".
 */
export const masteryCourseLabel = (courseId = DEFAULT_MASTERY_COURSE_ID) => {
  const standards = getTexasStandardsForCourse(courseId.replace(/-honors$/, ''));
  return standards[0]?.course || String(courseId || DEFAULT_MASTERY_COURSE_ID).replace(/-honors$/, '');
};

// --- Compatibility ----------------------------------------------------------
// Existing imports name the Algebra I strands directly. Kept so this change is
// additive, but new code should ask for a course.
export const TEKS_STRANDS = Object.freeze(Object.fromEntries(
  ALGEBRA_I_STRAND_LIST.map((entry) => [entry.id.toUpperCase(), entry]),
));

export const getAllAlgebraOneWheelTeks = () => getWheelTeksForCourse('algebra1');
