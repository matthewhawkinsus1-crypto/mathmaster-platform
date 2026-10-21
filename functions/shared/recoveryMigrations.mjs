/*
 * PREPARED RECOVERY V2 MIGRATIONS — NAMED, REVIEWED, APPLIED ONLY WITH APPROVAL.
 *
 * A prepared migration names one lesson that students are already working
 * on, how to find its live copies, and exactly which certified family will
 * recover each of its Warm-Up and DOL questions. It changes nothing by
 * itself. It is applied through the same recovery upgrade as any other
 * (recoveryContentUpgrade.mjs): previewed as a dry-run report, approved by
 * the teacher of record (or run by an operator with that approval recorded),
 * certified again against the LIVE questions inside the commit's transaction,
 * and written as one versioned `recoveryContent` field plus one audit event.
 *
 * WHY PIN THE BINDINGS. The planner would find the same families on its own
 * (each recognizes its question), but a lesson students are mid-way through
 * deserves a reviewed choice: these constraints keep each Recovery on the
 * original's exact skill and rigor — a horizontal shift stays a horizontal
 * shift, an integer slope with a fractional x-intercept stays exactly that.
 * Each is still certified like any binding; a pinned binding that no longer
 * certifies is refused, never forced.
 *
 * FINDING THE LIVE COPIES. By title and course, then verified against the
 * stored record: Standard and Honors copies are separate assignment documents
 * (one per destination, `rigorVariant`), each assigned to its own classes,
 * and each is planned and upgraded on its own.
 *
 * Pure data and pure functions.
 */

const clean = (value) => String(value ?? '').trim();

/** Titles compared the way a teacher reads them: dashes and spacing ignored. */
export const normalizedLessonTitle = (value) => clean(value)
  .replace(/[‐-―−]/g, '-')
  .replace(/\s+/g, ' ')
  .toLowerCase();

export const ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2 = Object.freeze({
  id: 'recovery-v2-algebra1-m2t2-l2',
  title: 'Recovery V2 · Algebra I — Vertical and Horizontal Transformations of Linear Functions',
  lessonFile: 'teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json',
  match: Object.freeze({
    titles: Object.freeze(['Algebra I — Vertical and Horizontal Transformations of Linear Functions']),
    courseIds: Object.freeze(['algebra1']),
  }),
  // The questions this migration was reviewed for. Each is certified against
  // the live copy at commit; a live question that differs from the lesson
  // file is still certified on its own merits, and the report says it differs.
  questions: Object.freeze({
    'l2-wu-1': Object.freeze({ section: 'warmup', describes: 'Graph g(x) = 3x − 8 (graphing tool)' }),
    'l2-wu-2': Object.freeze({ section: 'warmup', describes: 'Key characteristics of g(x) = 3x − 8' }),
    'l2-wu-3': Object.freeze({ section: 'warmup', describes: 'Key characteristics of h(x) = −(2/3)x + 5' }),
    'l2-dol-1': Object.freeze({ section: 'dol', describes: 'Plot the images of S1–S3 for g(x) = f(x + 2) (Transformations Lab)' }),
    'l2-dol-2': Object.freeze({ section: 'dol', describes: 'j(x) = 3x + 1, r(x) = j(x − 2): direction, simplified form, equivalent vertical shift' }),
    'l2-dol-3': Object.freeze({ section: 'dol', describes: 'Essential question: horizontal vs. vertical transformations of f(x) = x' }),
  }),
  bindings: Object.freeze({
    'l2-wu-1': Object.freeze({ questionFamily: Object.freeze({ id: 'linear.graphFromSlopeIntercept', version: 1, constraints: Object.freeze({ slope: 'integer' }) }) }),
    'l2-wu-2': Object.freeze({ questionFamily: Object.freeze({ id: 'linear.keyCharacteristics', version: 1, constraints: Object.freeze({ slope: 'integer', xIntercept: 'fraction' }) }) }),
    'l2-wu-3': Object.freeze({ questionFamily: Object.freeze({ id: 'linear.keyCharacteristics', version: 1, constraints: Object.freeze({ slope: 'fraction', xIntercept: 'fraction' }) }) }),
    'l2-dol-1': Object.freeze({ questionFamily: Object.freeze({ id: 'transformations.linearPlotImages', version: 1, constraints: Object.freeze({ transformation: 'horizontalShift' }) }) }),
    'l2-dol-2': Object.freeze({ questionFamily: Object.freeze({ id: 'transformations.linearHorizontalShiftAlgebra', version: 1, constraints: Object.freeze({}) }) }),
    'l2-dol-3': Object.freeze({ questionFamily: Object.freeze({ id: 'transformations.linearCompareEffects', version: 1, constraints: Object.freeze({}) }) }),
  }),
});

export const PREPARED_RECOVERY_MIGRATIONS = Object.freeze({
  [ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2.id]: ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2,
});

export const preparedRecoveryMigration = (id) => PREPARED_RECOVERY_MIGRATIONS[clean(id)] || null;

const assignmentCourse = (assignment = {}) => clean(
  assignment?.courseId
  || assignment?.courseProfile?.course
  || assignment?.assignment?.courseId,
).toLowerCase();

/**
 * Is this stored assignment one of the migration's live copies?
 * { matches, reasons: [why not], variant: 'standard'|'honors'|null }
 */
export const matchPreparedRecoveryMigration = (migration, assignment = {}) => {
  const reasons = [];
  const title = normalizedLessonTitle(assignment?.title || assignment?.assignment?.title);
  if (!migration?.match?.titles?.some((candidate) => normalizedLessonTitle(candidate) === title)) reasons.push('title-differs');
  const course = assignmentCourse(assignment);
  if (course && !migration?.match?.courseIds?.includes(course)) reasons.push('course-differs');
  const questionIds = new Set((Array.isArray(assignment?.sections) ? assignment.sections : [])
    .flatMap((section) => (Array.isArray(section?.questions) ? section.questions : []))
    .map((question) => clean(question?.questionId)));
  const missing = Object.keys(migration?.questions || {}).filter((questionId) => !questionIds.has(questionId));
  if (missing.length) reasons.push(`questions-missing:${missing.join(',')}`);
  const variant = clean(assignment?.rigorVariant || assignment?.courseProfile?.courseLevel).toLowerCase() || null;
  return { matches: reasons.length === 0, reasons, variant };
};

/** The prepared migration a stored assignment is a live copy of, if any. */
export const preparedMigrationFor = (assignment) => Object.values(PREPARED_RECOVERY_MIGRATIONS)
  .find((migration) => matchPreparedRecoveryMigration(migration, assignment).matches) || null;
