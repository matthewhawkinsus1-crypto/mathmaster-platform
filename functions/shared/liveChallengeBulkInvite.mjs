/*
 * A BULK ROSTER CHANGE INVITES THE WAY A SINGLE ONE DOES (LC02).
 *
 * A student added to a class while its Live Challenge is on is invited into it
 * (inviteStudentToClassLiveChallenge: the next seat, a code name, an invite the
 * screen follows). setStudentClass, assignStudentToTeacher and
 * createStudentAccount do that for one student. The two roster paths that move
 * many at once — saveClass, which restamps a class's students when its teacher
 * or period changes (and so also repairs a student whose stored teacher had
 * drifted off the class), and migrateClassesFromPeriods, which attaches
 * students to classes — left the students they made eligible out of the game
 * until the next one. They now hand the students they moved to
 * inviteMovedStudents.
 *
 * What it guards:
 *
 *   - THE ROSTER CHANGE NEVER FAILS BECAUSE OF A GAME. The caller wraps this
 *     in a try/catch, and each invite goes through the same safe wrapper a
 *     single change uses (which never throws).
 *   - IT COSTS NOTHING WHEN NO GAME IS ON. Students are grouped by the teacher
 *     they now belong to, and a teacher with no active game is one small read,
 *     however many students moved. Only a teacher with a game is asked about
 *     each of their students, one at a time (each is a transaction that
 *     allocates a seat).
 *   - ONE ANSWER ABOUT A TEACHER'S GAME IS THE ANSWER FOR ALL THEIR STUDENTS.
 *     "No game" and "a game idle past the late-invite window" do not depend on
 *     the student, so the rest of that teacher's students are not asked.
 *   - A TIME BUDGET. A roster change that moves a district's students under a
 *     teacher with a game must not run the callable out of time: past the
 *     budget the remaining students are not invited (they sit out this game,
 *     as they did before this change) and the count is logged.
 *
 * This never takes a student out of a game: the single invite leaves a student
 * who is in another live game where they are (a student moved between two
 * classes that both have a game stays in the first — decided 2026-10-25, LC02).
 *
 * Pure of Firestore: the caller supplies `hasGame(teacherEmail)` and
 * `invite(studentId)`, so the rules are tested without a database.
 */

// A quarter of a callable's default 60 seconds: the roster change itself is
// done by the time this runs, and the response still has to go out.
export const BULK_INVITE_BUDGET_MS = 15_000;

// What inviteStudentToClassLiveChallenge says when it is the TEACHER's game
// that is not on, not the student: the same for every student of that teacher.
export const TEACHER_LEVEL_REFUSALS = Object.freeze(['no_game', 'stale_game']);

const cleanId = (value) => String(value ?? '').trim();
const cleanEmail = (value) => String(value ?? '').trim().toLowerCase();

/**
 * Students grouped by the teacher they now belong to: a Map of teacher email
 * to student ids, in the order first seen, each student once. A student with
 * no id, or a move with no teacher, is dropped: nobody's game can invite them.
 */
export const groupMovedByTeacher = (moved = []) => {
  const groups = new Map();
  (Array.isArray(moved) ? moved : []).forEach((entry) => {
    const studentId = cleanId(entry?.studentId);
    const teacherEmail = cleanEmail(entry?.teacherEmail);
    if (!studentId || !teacherEmail) return;
    if (!groups.has(teacherEmail)) groups.set(teacherEmail, []);
    const members = groups.get(teacherEmail);
    if (!members.includes(studentId)) members.push(studentId);
  });
  return groups;
};

/**
 * The moves a migration plan makes (classModel.planPeriodMigration's
 * `studentUpdates`): each student with the teacher their class gives them.
 */
export const movedFromMigrationUpdates = (updates = []) => (Array.isArray(updates) ? updates : [])
  .map((update) => ({ studentId: update?.studentId, teacherEmail: update?.fields?.assignedTeacherEmail }));

/**
 * The students a class's restamp newly puts under `teacherEmail`: those whose
 * stored teacher was not exactly that (somebody else, or missing, or the same
 * address spelled differently — a game's roster is matched on the exact
 * string, so a restamp that normalizes it makes them eligible). Students
 * already stamped with it were eligible for their class's game, or invited,
 * already. `members` are the class's student documents as they were BEFORE the
 * restamp.
 */
export const movedByClassRestamp = ({ members = [], teacherEmail } = {}) => {
  const to = cleanEmail(teacherEmail);
  if (!to) return [];
  return (Array.isArray(members) ? members : [])
    .filter((member) => String(member?.assignedTeacherEmail ?? '') !== to)
    .map((member) => ({ studentId: member?.studentId, teacherEmail: to }));
};

/**
 * Invite every moved student to their teacher's game, if one is on.
 *
 * @param {object} input
 * @param {Array<{studentId: string, teacherEmail: string}>} input.moved
 * @param {(teacherEmail: string) => Promise<boolean>} input.hasGame  whether the teacher has an active game
 * @param {(studentId: string) => Promise<{invited?: boolean, reason?: string}>} input.invite  the safe single invite
 * @param {() => number} [input.now]
 * @param {number} [input.budgetMs]
 * @returns {Promise<{considered: number, invited: number, notReached: number}>}
 *   `notReached`: students the time ran out before (counted whether or not
 *   their teacher has a game: the budget was spent before anyone looked).
 */
export const inviteMovedStudents = async ({ moved = [], hasGame, invite, now = Date.now, budgetMs = BULK_INVITE_BUDGET_MS } = {}) => {
  const groups = groupMovedByTeacher(moved);
  const summary = { considered: 0, invited: 0, notReached: 0 };
  groups.forEach((studentIds) => { summary.considered += studentIds.length; });
  const startedAt = now();
  const teachers = [...groups.keys()];
  const studentsFrom = (teacherIndex) => teachers.slice(teacherIndex).reduce((sum, email) => sum + groups.get(email).length, 0);
  for (let teacherIndex = 0; teacherIndex < teachers.length; teacherIndex += 1) {
    const studentIds = groups.get(teachers[teacherIndex]);
    if (now() - startedAt >= budgetMs) {
      summary.notReached += studentsFrom(teacherIndex);
      return summary;
    }
    // One small read per teacher: most have no game on.
    // eslint-disable-next-line no-await-in-loop
    if (!(await hasGame(teachers[teacherIndex]))) continue;
    for (let index = 0; index < studentIds.length; index += 1) {
      if (now() - startedAt >= budgetMs) {
        summary.notReached += studentIds.length - index + studentsFrom(teacherIndex + 1);
        return summary;
      }
      // eslint-disable-next-line no-await-in-loop
      const outcome = await invite(studentIds[index]);
      if (outcome?.invited) summary.invited += 1;
      else if (TEACHER_LEVEL_REFUSALS.includes(outcome?.reason)) break;
    }
  }
  return summary;
};
