/*
 * STAMPING THE TEACHER ON A CLASSROOM PUBLICATION THAT RECORDS NONE: THE PLAN.
 *
 * The pure half of scripts/backfill-classroom-link-teachers.mjs: its options,
 * and what it would do with each link, decided from what it read. Nothing
 * here reads or writes a database.
 *
 * A classroomLinks document records the teacher whose Google account made the
 * post (`teacherUid`). Every path that creates or claims one has written it
 * since Classroom V2 (Aug 17, 2026). A link from before then records none.
 * Since #545 such a link is shown, and acted on, only for the root
 * administrator or the teacher of record of every class its assignment is
 * assigned to (functions/lib/classroomLinkOwnership.js), and the lists ("Published
 * assignments", the grade passback monitor) read a teacher's links by
 * `teacherUid`, so they list it for nobody. Stamping the assignment's teacher
 * on it makes it theirs everywhere.
 *
 * WHAT STAMPING ALSO CHANGES. The grade passback triggers send a link's grades
 * through its teacher's own Google connection (teacherIntegrations/{uid}); a
 * link with no teacher, through the original shared connection
 * (teacherIntegrations/default), which the first teacher to upgrade took over
 * (its `migratedToUid`). A link is stamped by default only when its grades
 * keep going through the same connection: the teacher is the one who took the
 * original connection over, or the original connection is gone (so passback
 * for the link could not work as it is). Any other link is reported for
 * review, and stamped only with --include-review.
 */

export const ACTIONS = Object.freeze({ STAMP: 'stamp', REVIEW: 'review', LEAVE: 'leave' });

export const REASONS = Object.freeze({
  // stamp
  TEACHER_HOLDS_ORIGINAL_CONNECTION: 'teacher-holds-original-connection',
  ORIGINAL_CONNECTION_GONE: 'original-connection-gone',
  // review
  PASSBACK_WOULD_MOVE: 'passback-would-move-to-teacher-connection',
  // leave: the link stays the administrator's and its assignment's teacher's, unstamped
  ASSIGNMENT_MISSING: 'assignment-missing',
  ASSIGNMENT_NOT_ASSIGNED: 'assignment-not-assigned',
  CLASS_WITHOUT_TEACHER: 'class-missing-or-without-teacher-of-record',
  SEVERAL_TEACHERS: 'classes-have-different-teachers',
  TEACHER_NEVER_SIGNED_IN: 'teacher-has-no-recorded-account',
});

export const USAGE = `Usage:
  node scripts/backfill-classroom-link-teachers.mjs --project <id> [--execute] [--yes] [--include-review] [--report <path>]

  --project <id>       Firebase project (required; there is no default)
  --execute            write what the report lists as "stamp" (default: a read-only report, nothing is written)
  --include-review     with --execute, also stamp the links listed for review (their passback moves to the teacher's own connection)
  --yes                skip the typed project id; refused unless FIRESTORE_EMULATOR_HOST is set
  --report <path>      where to write the JSON report (default release-reports/)`;

export const parseArgs = (argv = [], env = process.env) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}. See --help.`);
    const name = arg.slice(2);
    if (['execute', 'yes', 'include-review', 'help'].includes(name)) options[name] = true;
    else if (['project', 'report'].includes(name)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value.`);
      options[name] = value;
      index += 1;
    } else throw new Error(`Unknown option --${name}. See --help.`);
  }
  if (options.help) return { help: true };
  if (!options.project) throw new Error('--project <id> is required. Nothing has been read.');
  if (options.yes && !options.execute) throw new Error('--yes only makes sense with --execute.');
  if (options['include-review'] && !options.execute) throw new Error('--include-review only makes sense with --execute.');
  if (options.yes && !env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('refusing --yes: it skips the typed project id, which is allowed only against the Firestore emulator (FIRESTORE_EMULATOR_HOST). Against a real project, type the id.');
  }
  return {
    help: false,
    project: options.project,
    execute: Boolean(options.execute),
    yes: Boolean(options.yes),
    includeReview: Boolean(options['include-review']),
    reportPath: options.report || null,
  };
};

const text = (value) => String(value ?? '').trim();
const email = (value) => text(value).toLowerCase();

/** The teacher a link records, or '' (the same reading as functions/lib/classroomLinkOwnership.js). */
export const linkTeacherUid = (link) => text(link?.teacherUid);

/** The classes an assignment is assigned to, as the server reads them (assignmentAudience). */
export const assignedClassIds = (assignment) => [...new Set(
  (Array.isArray(assignment?.assignedClassIds) ? assignment.assignedClassIds : []).map(text).filter(Boolean),
)];

/**
 * What to do with one link that records no teacher.
 *
 *   assignment         its assignment's data (`assignedClassIds` is enough), or null when it is gone
 *   classesById        Map classId -> class data (`teacherOfRecord`), or null for a missing class
 *   uidByEmail         Map teacher email -> the uid their account signs in with (teacherDirectory), or null
 *   originalConnection { exists, migratedToUid } of teacherIntegrations/default
 *
 * Returns { action, reason, teacherUid? }.
 */
export function planLinkTeacher({ link, assignment, classesById, uidByEmail, originalConnection }) {
  if (linkTeacherUid(link)) return { action: null, reason: 'already-recorded' };
  if (!assignment) return { action: ACTIONS.LEAVE, reason: REASONS.ASSIGNMENT_MISSING };
  const classIds = assignedClassIds(assignment);
  if (!classIds.length) return { action: ACTIONS.LEAVE, reason: REASONS.ASSIGNMENT_NOT_ASSIGNED };
  const teachers = classIds.map((classId) => email(classesById.get(classId)?.teacherOfRecord));
  if (teachers.some((teacher) => !teacher)) return { action: ACTIONS.LEAVE, reason: REASONS.CLASS_WITHOUT_TEACHER };
  const distinct = [...new Set(teachers)];
  if (distinct.length > 1) return { action: ACTIONS.LEAVE, reason: REASONS.SEVERAL_TEACHERS };
  const teacherUid = text(uidByEmail.get(distinct[0]));
  if (!teacherUid) return { action: ACTIONS.LEAVE, reason: REASONS.TEACHER_NEVER_SIGNED_IN };
  if (!originalConnection?.exists) return { action: ACTIONS.STAMP, reason: REASONS.ORIGINAL_CONNECTION_GONE, teacherUid };
  if (text(originalConnection.migratedToUid) === teacherUid) {
    return { action: ACTIONS.STAMP, reason: REASONS.TEACHER_HOLDS_ORIGINAL_CONNECTION, teacherUid };
  }
  return { action: ACTIONS.REVIEW, reason: REASONS.PASSBACK_WOULD_MOVE, teacherUid };
}

/** Whether a planned link is written: "stamp" always, "review" only with --include-review. */
export const isWritten = (plan, { includeReview = false } = {}) => plan.action === ACTIONS.STAMP
  || (includeReview && plan.action === ACTIONS.REVIEW);

/**
 * Whether a stamp the report planned is still right, inside the transaction
 * that writes it: the link as it is now exists, still records no teacher and
 * the same assignment, and planning it again from what is read now gives the
 * same teacher and an action that is written. So a second run, or a publish
 * or a class change landing meanwhile, never writes twice, never replaces a
 * teacher and never stamps one the report did not name.
 */
export function stillStamp({ current, planned, replanned, includeReview = false }) {
  if (!current || linkTeacherUid(current)) return false;
  if (text(current.assignmentId) !== text(planned?.assignmentId)) return false;
  if (!replanned || !isWritten(replanned, { includeReview })) return false;
  return Boolean(text(replanned.teacherUid)) && text(replanned.teacherUid) === text(planned.teacherUid);
}

/** The fields one stamp writes: the teacher, and when and why it was stamped. */
export const stampFields = ({ teacherUid, reason, now }) => ({
  teacherUid,
  teacherUidBackfilledAt: new Date(now).toISOString(),
  teacherUidBackfillReason: reason,
});
