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
  { id: 'grade6', label: 'Grade 6' },
  { id: 'grade7', label: 'Grade 7' },
  { id: 'grade8', label: 'Grade 8' },
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
  if (!COURSE_IDS.has(course)) reject(`"${course}" is not a MathMaster course. Choose an active course: Grade 6, Grade 7, Grade 8, Algebra I, or Algebra II.`);

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

/**
 * The membership fields a student record carries, derived from their class.
 *
 * `assignedTeacherEmail` is a denormalized copy of the class's teacher of
 * record, and it is not a convenience: it is what the roster query filters on
 * and what the security rule reads. A rule that followed `classId` into the
 * classes collection would need a get() per document, and Firestore caps
 * document accesses at ten per query — any roster over ten students would stop
 * working. So the authorization answer travels ON the record being queried.
 *
 * Which means every path that can change a student's class, or a class's
 * teacher, must rewrite this in the same operation. See `saveClass` and
 * `setStudentClass`.
 */
export const membershipFieldsFor = (classRecord) => (classRecord ? {
  classId: classRecord.classId,
  // Kept in step with the class so period-addressed surfaces stay correct.
  classPeriod: classRecord.period || UNASSIGNED_PERIOD,
  assignedTeacherEmail: classRecord.teacherOfRecord || null,
} : {
  classId: null,
  classPeriod: UNASSIGNED_PERIOD,
  assignedTeacherEmail: null,
});

/**
 * Plan the period-to-class migration, and say exactly what it found.
 *
 * Pure, so the plan can be inspected and the counts asserted before anything is
 * written. It is also what makes the migration a deployment GATE rather than a
 * button: the scoped security rule must not be deployed while any active
 * student who should be rostered still has no teacher on their record, because
 * that student's teacher would silently lose them.
 *
 * Idempotent by construction: it plans only what is missing or disagrees, so a
 * second run over a migrated database plans nothing.
 */
export const planPeriodMigration = ({
  students = [],
  classes = [],
  courseProfiles = {},
  periods = DEFAULT_PERIODS,
} = {}) => {
  const classesToCreate = buildMigrationClasses({ periods, courseProfiles, existingClasses: classes });
  const allClasses = [...classes, ...classesToCreate];
  const byId = new Map(allClasses.map((entry) => [entry.classId, entry]));
  const byPeriod = new Map(allClasses.map((entry) => [entry.period, entry]));

  const studentUpdates = [];
  const unresolved = [];
  const conflicts = [];

  students.forEach((student) => {
    const target = student.classId ? byId.get(student.classId) : byPeriod.get(student.classPeriod);

    // A classId pointing at a class that does not exist is a conflict, not a
    // placement: guessing a replacement from the period could put a student in
    // the wrong course.
    if (student.classId && !target) {
      conflicts.push({ studentId: student.id, reason: 'class_missing', classId: student.classId });
      unresolved.push({ studentId: student.id, reason: 'class_missing' });
      return;
    }

    if (!target) {
      unresolved.push({ studentId: student.id, reason: student.classPeriod && student.classPeriod !== UNASSIGNED_PERIOD ? 'no_class_for_period' : 'no_class_and_no_period' });
      return;
    }

    const wanted = membershipFieldsFor(target);
    const drifted = wanted.classId !== (student.classId || null)
      || wanted.classPeriod !== (student.classPeriod || UNASSIGNED_PERIOD)
      || (wanted.assignedTeacherEmail || null) !== (student.assignedTeacherEmail || null);

    // A record already pointing at a class but disagreeing about its teacher or
    // period is exactly the stale-authorization case this migration exists to
    // catch, so it is reported as well as repaired.
    if (student.classId && drifted) {
      conflicts.push({
        studentId: student.id,
        reason: 'stale_denormalized_fields',
        was: { classPeriod: student.classPeriod || null, assignedTeacherEmail: student.assignedTeacherEmail || null },
        now: { classPeriod: wanted.classPeriod, assignedTeacherEmail: wanted.assignedTeacherEmail },
      });
    }

    if (drifted) studentUpdates.push({ studentId: student.id, fields: wanted });

    // The class exists and the student is in it, but nobody teaches it — so
    // no teacher can see them, and the scoped rule would hide them.
    if (!wanted.assignedTeacherEmail) {
      unresolved.push({ studentId: student.id, reason: 'class_has_no_teacher_of_record', classId: target.classId });
    }
  });

  const activeStudents = students.filter((student) => student.status !== ACCOUNT_STATUS.DISABLED);
  const stillMissingTeacher = activeStudents.filter((student) => {
    const planned = studentUpdates.find((update) => update.studentId === student.id);
    const after = planned ? planned.fields.assignedTeacherEmail : (student.assignedTeacherEmail || null);
    return !after;
  }).map((student) => student.id);

  return {
    classesToCreate,
    studentUpdates,
    report: {
      studentsScanned: students.length,
      activeStudentsScanned: activeStudents.length,
      classesCreated: classesToCreate.length,
      studentsAssigned: studentUpdates.length,
      unresolvedStudents: unresolved,
      conflicts,
      // The gate. Named for what it means rather than as a bare number.
      activeStudentsMissingTeacherAfterMigration: stillMissingTeacher,
      readyForScopedRule: stillMissingTeacher.length === 0,
    },
  };
};

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
 * Who is in one class.
 *
 * ONE membership rule, because there were three copies of it and they were not
 * quite the same. `classId` is the rule. The period comparison beneath it is a
 * compatibility path for a student record written before the class migration and
 * never backfilled — such a student has no classId at all, so period is the only
 * thing left that can place them, and they land in exactly one roster because
 * only the selected class's period is compared.
 *
 * A student who HAS a classId is never matched on period. That is deliberate: if
 * a student was moved to another class but their period label is stale, the
 * class they are actually in wins. The alternative puts one child on two rosters.
 *
 * AND THE PERIOD FALLBACK STOPS WHERE THE PERIOD STOPS BEING AN ANSWER. If two
 * active classes share a period label, an unmigrated student in that period
 * cannot be placed by it — the label names two different rooms. Such a student
 * appears in NEITHER roster rather than in both, because one child on two
 * rosters is counted twice, graded twice and reported twice, and no screen can
 * tell which one is real. They remain visible in the all-classes view, and
 * `unplaceableStudents` names them so a screen can ask an administrator to give
 * them a class instead of leaving them quietly missing.
 *
 * Passing neither a classId nor a period returns everyone — "all classes" is a
 * real view, not an empty one. Passing a period alone filters on it, which is
 * what a school that has not created class records yet still needs.
 */
export const studentsInClass = ({ students = [], classes = [], classId = null, classPeriod = null } = {}) => {
  const roster = Array.isArray(students) ? students : [];
  if (!classId) {
    return classPeriod ? roster.filter((student) => student?.classPeriod === classPeriod) : roster;
  }
  const active = (Array.isArray(classes) ? classes : []).filter((entry) => entry?.status !== 'archived');
  const record = active.find((entry) => entry?.classId === classId) || null;
  const period = record?.period || classPeriod || null;
  const periodIsAmbiguous = Boolean(period)
    && active.filter((entry) => entry?.period === period).length > 1;
  return roster.filter((student) => (
    student?.classId
      ? student.classId === classId
      : Boolean(period) && !periodIsAmbiguous && student?.classPeriod === period
  ));
};

/**
 * Students no roster can claim: no classId, and a period served by more than one
 * active class.
 *
 * This is the migration gap made visible. Without it those students simply stop
 * appearing anywhere a teacher looks, which reads as "they left" rather than
 * "nobody has told the system which class they are in".
 */
export const unplaceableStudents = ({ students = [], classes = [] } = {}) => {
  const active = (Array.isArray(classes) ? classes : []).filter((entry) => entry?.status !== 'archived');
  const ambiguous = new Set();
  const seen = new Set();
  active.forEach((entry) => {
    const period = entry?.period;
    if (!period) return;
    if (seen.has(period)) ambiguous.add(period);
    seen.add(period);
  });
  return (Array.isArray(students) ? students : []).filter((student) => (
    !student?.classId && ambiguous.has(student?.classPeriod)
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
