// Who may read a record about a student, answerable from the record itself.
//
// THE CONSTRAINT. Firestore Security Rules can join, but barely: a rule that
// calls get() to look up a student's class is capped at ten document accesses
// per request, so any roster or evidence query bigger than ten documents stops
// working. Authorization therefore has to be readable from the document being
// queried. That is not a shortcut around the rules — it is the only shape that
// scales, and it is why these fields exist.
//
// THE POLICY, which is two different questions wearing one name.
//
//   WHAT HAPPENED is history, and history does not change when a timetable
//   does. An evidence event records the class and the teacher it occurred
//   under, in `originClassId` and `originTeacherEmail`, and those fields are
//   written once and never rewritten. A student who moves in March did not
//   retroactively do their February work in a different class.
//
//   WHO MAY READ IT is a current instructional relationship, and that DOES
//   change. `authorizedTeacherEmails` carries the teacher who was there when
//   the record was made — they taught the student, and their own gradebook
//   should not empty out behind them — plus the student's current teacher, who
//   needs the history to teach the child in front of them.
//
// So a reassignment rewrites the access list and never the record. Both halves
// of "preserve an honest historical record" and "the new teacher can actually
// teach" are satisfied, without either one lying about the other.
//
// The cost is that moving a student rewrites the access list on their existing
// records. That is bounded — one student's history, batched — and it happens
// on a rare administrative action, which is the right place to pay for a read
// path that has to be fast and correct every day.

/** Fields every teacher-readable child record carries. */
export const AUTHORIZATION_FIELDS = Object.freeze([
  'studentId',
  'classId',
  'authorizedTeacherEmails',
  'originClassId',
  'originTeacherEmail',
]);

const email = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  return text || null;
};

const uniqueEmails = (values) => [...new Set(values.map(email).filter(Boolean))].sort();

/**
 * The authorization context for a NEW record.
 *
 * `classRecord` is the student's class at the moment the record is created, so
 * origin and current are the same thing here — they only diverge later, when
 * the student moves.
 */
export const buildAuthorizationContext = ({ studentId, classRecord = null, student = null }) => {
  const classId = classRecord?.classId ?? student?.classId ?? null;
  const teacher = email(classRecord?.teacherOfRecord ?? student?.assignedTeacherEmail);
  return {
    studentId: String(studentId || ''),
    classId,
    // Frozen at creation. Nothing below ever rewrites these two.
    originClassId: classId,
    originTeacherEmail: teacher,
    authorizedTeacherEmails: uniqueEmails([teacher]),
  };
};

/**
 * The authorization context after a student changes class.
 *
 * Returns only the fields that change, so a caller can merge it without
 * touching the record's history — and returns null when nothing would change,
 * so a no-op reassignment writes nothing.
 */
export const reauthorizeContext = (existing = {}, { classRecord = null } = {}) => {
  const nextClassId = classRecord?.classId ?? null;
  const nextTeacher = email(classRecord?.teacherOfRecord);

  // The origin teacher keeps their access. They taught this student when the
  // work happened; removing them would empty out a gradebook they are still
  // accountable for.
  const keep = email(existing.originTeacherEmail);
  const authorizedTeacherEmails = uniqueEmails([keep, nextTeacher]);

  const unchanged = (existing.classId ?? null) === nextClassId
    && sameList(existing.authorizedTeacherEmails, authorizedTeacherEmails);
  if (unchanged) return null;

  return { classId: nextClassId, authorizedTeacherEmails };
};

const sameList = (left, right) => {
  const a = uniqueEmails(Array.isArray(left) ? left : []);
  const b = uniqueEmails(Array.isArray(right) ? right : []);
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

/**
 * Whether this record is missing the fields the security rule reads.
 *
 * Used by the backfill to find records written before this existed, and by a
 * test that refuses to let a new write path forget them.
 */
export const needsAuthorizationBackfill = (record = {}) => (
  !Array.isArray(record.authorizedTeacherEmails)
  || record.authorizedTeacherEmails.length === 0
  || record.originTeacherEmail === undefined
);

/**
 * Can this teacher read the record, from the record alone?
 *
 * The exact predicate firestore.rules implements. Kept here so it can be tested
 * as a function and asserted to agree with the rule in the emulator.
 */
export const teacherMayRead = (record = {}, teacherEmail) => {
  const caller = email(teacherEmail);
  if (!caller) return false;
  return (Array.isArray(record.authorizedTeacherEmails) ? record.authorizedTeacherEmails : [])
    .map(email)
    .includes(caller);
};

/**
 * Plan the backfill for one student's child records.
 *
 * Pure, so the counts can be asserted before anything is written, and so the
 * "run it twice" property is a test rather than a hope.
 */
export const planAuthorizationBackfill = ({ records = [], studentId, classRecord = null, student = null }) => {
  const fresh = buildAuthorizationContext({ studentId, classRecord, student });
  const updates = [];
  const skipped = [];

  records.forEach((record) => {
    if (!needsAuthorizationBackfill(record)) { skipped.push(record.id); return; }
    updates.push({
      id: record.id,
      fields: {
        studentId: fresh.studentId,
        classId: fresh.classId,
        // A record written before origin existed has no honest origin to
        // recover, so the student's class at backfill time is the best
        // available answer — and it is recorded as such rather than guessed at
        // per-record from data that is not there.
        originClassId: record.originClassId ?? fresh.originClassId,
        originTeacherEmail: record.originTeacherEmail ?? fresh.originTeacherEmail,
        authorizedTeacherEmails: uniqueEmails([
          record.originTeacherEmail ?? fresh.originTeacherEmail,
          fresh.originTeacherEmail,
        ]),
        authorizationBackfilledAt: true,
      },
    });
  });

  return { updates, skipped, report: { scanned: records.length, toUpdate: updates.length, alreadyAuthorized: skipped.length } };
};
