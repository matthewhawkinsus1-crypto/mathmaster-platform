import { resolveStudentCourseContext } from '../../../functions/shared/classModel.mjs';
import { sameStudentProfile } from '../../studentSupport.js';
import { followRosterTeacher } from '../supports/askTeacher.js';

/*
 * WHAT A STUDENT'S SCREENS READ ABOUT THEIR CLASS, FOLLOWED WHILE THEY STAY SIGNED IN.
 *
 * Sign-in reads the student's roster row (grades/{studentId}: classId, classPeriod, assignedTeacherEmail) and the record
 * of the class it names, and the session keeps what they give (App.jsx, hydrateSession, through studentClassFields
 * below): the class, its name, its period, its teacher of record, the teacher the row names, and the course and level the
 * class sets. Every student screen reads its class from those: the class's lessons (the class query,
 * studentAssignmentScope.js), the period's bell times, Warm-Up and DOL windows, the class's pacing, weekly goals and
 * Class Points, the Path's course and the lessons' Honors rigor, the class's name on Grades, and the class and teacher a
 * question for the teacher or support evidence is sent to, which firestore.rules checks against the row.
 *
 * A student moved to another class has their row restamped while they may be working (functions/index.js
 * setStudentClass; functions/shared/classModel.mjs membershipFieldsFor), as a class handed to another teacher does.
 * App.jsx passes each snapshot of the row here. A handover, the same class with another teacher, moves only the teacher
 * (askTeacher.js followRosterTeacher). A move takes the new class whole, as a fresh load reads it: its record, its
 * period, its teacher, its course and level, all at once, so a question is never addressed to one class's teacher in
 * another. Before, a moved student kept the class they left until they reloaded: its lessons and its bell times, and
 * questions and support evidence the rules refused, since the row no longer names that class (teacher features walk,
 * item 10, and the November build's section 6).
 *
 * The same user comes back when nothing changes, so React keeps its render.
 */

/** The roster row's membership, the three fields a move or a handover restamps. */
export const rosterMembershipOf = (rosterRow) => ({
  classId: rosterRow?.classId || null,
  classPeriod: rosterRow?.classPeriod || null,
  assignedTeacherEmail: rosterRow?.assignedTeacherEmail || null,
});

export const sameRosterMembership = (a, b) => Boolean(a && b)
  && a.classId === b.classId && a.classPeriod === b.classPeriod && a.assignedTeacherEmail === b.assignedTeacherEmail;

/**
 * What a session holds about the student's class: the class the row names and its record's name, period and teacher of
 * record (or, for a student no class has, the period's course setting), and the teacher the row names, verbatim, since
 * support evidence must name exactly that teacher (firestore.rules). `course` and `courseLevel` go in the profile.
 */
export const studentClassFields = ({ rosterRow, classesById = {}, courseProfiles = {} } = {}) => {
  const context = resolveStudentCourseContext({ student: rosterRow, classesById, courseProfiles });
  return {
    classId: rosterRow?.classId || null,
    className: context.className,
    classPeriod: context.classPeriod,
    teacherOfRecord: context.teacherOfRecord,
    assignedTeacherEmail: rosterRow?.assignedTeacherEmail || null,
    course: context.courseId,
    courseLevel: context.courseLevel,
  };
};

/** The session's user once the roster row says `rosterRow`: the same user unless the class or its teacher moved. */
export const followRosterClass = (user, rosterRow, { classesById = {}, courseProfiles = {} } = {}) => {
  if (!user || !rosterRow) return user;
  if ((rosterRow.classId || null) === (user.classId || null)) return followRosterTeacher(user, rosterRow);
  const { course, courseLevel, ...fields } = studentClassFields({ rosterRow, classesById, courseProfiles });
  return { ...user, ...fields, profile: { ...user.profile, course, courseLevel } };
};

/*
 * A support revision while the student works replaces the session's supports (App.jsx, the grade document's listener),
 * and keeps the course and level the class sets: they are not supports, and the revised profile carries neither. Before,
 * the revision took them with it, and the Path and the lessons' rigor fell back to Algebra I standard until a reload.
 */
export const followSupportProfile = (user, liveProfile) => (user && !sameStudentProfile(user.profile, liveProfile)
  ? { ...user, profile: { ...liveProfile, course: user.profile?.course, courseLevel: user.profile?.courseLevel } }
  : user);
