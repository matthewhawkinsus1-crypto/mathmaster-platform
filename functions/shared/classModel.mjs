// What a class IS in MathMaster.
//
// Until now a "class" was one of eight hardcoded strings — `Period 3` — shared
// by the whole instance. That cannot express the thing a school actually has:
// Ms. Smith's Algebra I third period and Mr. Jones's Algebra II third period
// are two classes, with two teachers, two courses and two rosters, and the
// string `Period 3` is the same string for both. Everything downstream
// inherited the ambiguity: course and rigor were stored per period, so the
// Path could not tell those two classes apart, and no surface could say which
// students were whose.
//
// So a class is now an entity, and it is the authoritative source for:
//
//   who teaches it            teacherOfRecord
//   what course it is         course + courseLevel   (My Math Path reads this)
//   which students are in it  the students' classId
//
// COMPATIBILITY IS DELIBERATE. Every class still carries a `period`, and every
// student still carries `classPeriod` derived from their class. Assignment
// targeting, the DOL windows, the gradebook and the analytics all address
// classes by period today, and rewriting those at the same time as introducing
// the entity would be two risky changes wearing one commit. The period is now
// a DERIVED label; `classId` is the truth. Surfaces move over one at a time.
//
// This file is pure and shared: the server enforces it, the browser renders
// from it, the tests run it. There is no second definition of what a class is.

export const COURSES = Object.freeze([
  { id: 'algebra1', label: 'Algebra I' },
  { id: 'algebra2', label: 'Algebra II' },
]);

export const COURSE_LEVELS = Object.freeze([
  { id: 'standard', label: 'Standard' },
  { id: 'honors', label: 'Honors' },
]);

export const CLASS_STATUS = Object.freeze({ ACTIVE: 'active', ARCHIVED: 'archived' });

// An account can be usable or not. This is a different axis from class
// membership on purpose — see `describeRemovalKinds` at the bottom.
export const ACCOUNT_STATUS = Object.freeze({ ACTIVE: 'active', DISABLED: 'disabled' });

export const UNASSIGNED_PERIOD = 'Unassigned';

export const DEFAULT_PERIODS = Object.freeze(
  Array.from({ length: 8 }, (_, index) => `Period ${index + 1}`),
);

const COURSE_IDS = new Set(COURSES.map((course) => course.id));
const LEVEL_IDS = new Set(COURSE_LEVELS.map((level) => level.id));

const text = (value, max = 120) => String(value ?? '').trim().slice(0, max);

export class ClassInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClassInputError';
  }
}

const reject = (message) => { throw new ClassInputError(message); };

export const courseLabel = (courseId) => COURSES.find((course) => course.id === courseId)?.label || 'Algebra I';
export const courseLevelLabel = (levelId) => COURSE_LEVELS.find((level) => level.id === levelId)?.label || 'Standard';

/**
 * Validate and normalize what an administrator typed into a class record.
 *
 * Throws rather than silently defaulting: a class quietly created as Algebra I
 * when the admin chose Algebra II would route every student in it through the
 * wrong course for a year, and nothing downstream would look wrong.
 */
export const normalizeClassInput = (input = {}, { existing = null } = {}) => {
  const name = text(input.name ?? existing?.name, 120);
  if (!name) reject('A class needs a name an administrator will recognize, such as "Algebra I — 3rd Period".');

  const course = text(input.course ?? existing?.course ?? 'algebra1', 40);
  if (!COURSE_IDS.has(course)) reject(`"${course}" is not a MathMaster course. Choose Algebra I or Algebra II.`);

  const courseLevel = text(input.courseLevel ?? existing?.courseLevel ?? 'standard', 40);
  if (!LEVEL_IDS.has(courseLevel)) reject(`"${courseLevel}" is not a course level. Choose Standard or Honors.`);

  // The period is the scheduling label, and the compatibility key the rest of
  // the platform still targets. It is not required to be unique — two teachers
  // genuinely do both teach third period.
  const period = text(input.period ?? existing?.period ?? UNASSIGNED_PERIOD, 60) || UNASSIGNED_PERIOD;

  const status = text(input.status ?? existing?.status ?? CLASS_STATUS.ACTIVE, 20);
  if (status !== CLASS_STATUS.ACTIVE && status !== CLASS_STATUS.ARCHIVED) {
    reject('A class is either active or archived.');
  }

  const teacherOfRecord = input.teacherOfRecord === undefined
    ? (existing?.teacherOfRecord ?? null)
    : (text(input.teacherOfRecord, 160).toLowerCase() || null);

  return { name, course, courseLevel, period, status, teacherOfRecord };
};

/**
 * The eight periods, as eight class documents.
 *
 * Run once. Every existing student carries `classPeriod`, so this is what makes
 * their membership expressible as a `classId` without anyone re-entering a
 * roster. A period that already has a class is left alone.
 */
export const buildMigrationClasses = ({
  periods = DEFAULT_PERIODS,
  courseProfiles = {},
  existingClasses = [],
} = {}) => {
  const taken = new Set(existingClasses.map((entry) => entry.period));
  return periods
    .filter((period) => !taken.has(period))
    .map((period) => {
      const profile = courseProfiles?.[period] || {};
      const course = COURSE_IDS.has(profile.course) ? profile.course : 'algebra1';
      const courseLevel = LEVEL_IDS.has(profile.courseLevel) ? profile.courseLevel : 'standard';
      return {
        // Stable and readable, so an admin reading a document id still knows
        // what they are looking at.
        classId: periodClassId(period),
        name: `${courseLabel(course)} — ${period}`,
        course,
        courseLevel,
        period,
        teacherOfRecord: null,
        status: CLASS_STATUS.ACTIVE,
        migratedFromPeriod: true,
      };
    });
};

export const periodClassId = (period) => {
  const slug = text(period, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // "Period 3" already says period; `period-period-3` helps nobody.
  return slug.startsWith('period-') || slug === 'period' ? slug : `period-${slug}`;
};

/**
 * The course context a student's My Math Path should run in.
 *
 * The class is authoritative. `settings/courseProfiles` is consulted only for a
 * student who has no class yet, and is on its way out — keyed by period, it
 * cannot answer the question at all once two classes share a period.
 */
export const resolveStudentCourseContext = ({ student = null, classesById = {}, courseProfiles = {} } = {}) => {
  const classRecord = student?.classId ? classesById[student.classId] : null;
  if (classRecord) {
    return {
      courseId: classRecord.course || 'algebra1',
      courseLevel: classRecord.courseLevel || 'standard',
      classId: classRecord.classId,
      className: classRecord.name,
      classPeriod: classRecord.period,
      teacherOfRecord: classRecord.teacherOfRecord || null,
      source: 'class',
    };
  }
  const profile = courseProfiles?.[student?.classPeriod] || {};
  return {
    courseId: COURSE_IDS.has(profile.course) ? profile.course : 'algebra1',
    courseLevel: LEVEL_IDS.has(profile.courseLevel) ? profile.courseLevel : 'standard',
    classId: null,
    className: null,
    classPeriod: student?.classPeriod || UNASSIGNED_PERIOD,
    teacherOfRecord: null,
    // Says plainly that this came from the legacy period lookup, so a screen
    // can tell an admin the student needs a real class.
    source: student?.classPeriod && student.classPeriod !== UNASSIGNED_PERIOD ? 'periodFallback' : 'unassigned',
  };
};

/** The membership fields a student record carries, derived from their class. */
export const membershipFieldsFor = (classRecord) => (classRecord ? {
  classId: classRecord.classId,
  // Kept in step with the class so period-addressed surfaces stay correct.
  classPeriod: classRecord.period || UNASSIGNED_PERIOD,
} : {
  classId: null,
  classPeriod: UNASSIGNED_PERIOD,
});

/**
 * Which students a teacher may see.
 *
 * A teacher's roster is the students in the classes they are teacher of record
 * for. This is the rule the server enforces; no screen may widen it.
 */
export const classIdsForTeacher = (classes = [], teacherEmail) => {
  const email = String(teacherEmail || '').trim().toLowerCase();
  if (!email) return [];
  return classes
    .filter((entry) => String(entry?.teacherOfRecord || '').toLowerCase() === email)
    .map((entry) => entry.classId);
};

export const studentsForTeacher = ({ students = [], classes = [], teacherEmail, includeUnassigned = false }) => {
  const allowed = new Set(classIdsForTeacher(classes, teacherEmail));
  return students.filter((student) => (
    (student?.classId && allowed.has(student.classId))
    || (includeUnassigned && !student?.classId)
  ));
};

/**
 * The three things an administrator might mean by "get rid of this student",
 * and what each one actually costs.
 *
 * They are separated because they are not degrees of the same action. Removing
 * a student from a class is a routine schedule change. Deleting the account
 * destroys instructional history that a district may be required to keep.
 * One button cannot mean all three.
 */
export const REMOVAL_KINDS = Object.freeze({
  REMOVE_FROM_CLASS: 'removeFromClass',
  DISABLE_ACCOUNT: 'disableAccount',
  PERMANENT_DELETE: 'permanentDelete',
});

export const describeRemovalKinds = () => ([
  {
    id: REMOVAL_KINDS.REMOVE_FROM_CLASS,
    label: 'Remove from class',
    summary: 'Ends this class membership. The account stays, and so does every grade and every piece of evidence.',
    reversible: true,
    destroysHistory: false,
    requiresTypedConfirmation: false,
  },
  {
    id: REMOVAL_KINDS.DISABLE_ACCOUNT,
    label: 'Deactivate account',
    summary: 'The student can no longer sign in. Records stay intact and an administrator can reactivate the account later.',
    reversible: true,
    destroysHistory: false,
    requiresTypedConfirmation: false,
  },
  {
    id: REMOVAL_KINDS.PERMANENT_DELETE,
    label: 'Delete permanently',
    summary: 'Erases the account and its complete history — grades, evidence, path sessions and exam records. This cannot be undone.',
    reversible: false,
    destroysHistory: true,
    requiresTypedConfirmation: true,
  },
]);
