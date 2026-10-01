// Student names on every MathMaster screen.
//
// The resolver lives in functions/shared/studentIdentity.mjs so the server's
// roster projection, the server's name copies, the identity backfill and this
// file cannot disagree about what a student's name is. This file adds the
// presentation layer on top of it.
//
// Keep the three kinds of thing apart:
//
//   identifier        studentIdOf(student)         '101410' — internal, stable
//   display name      formatStudentName(student)   'Williams, Jordan'
//   diagnostic label  studentIdLabel(student)      'ID 101410' — secondary text
//
// formatStudentName NEVER returns an id. There is deliberately no
// "fall back to the id" option: that option is how '101410' reached the Live
// View tiles. When no name is on file it returns the explicit
// STUDENT_NAME_UNAVAILABLE label (or '' with fallbackToNeutral:false), and the
// screen shows the id beside it, labelled as an id. formatStudentLabel does
// both on one line for toasts, aria-labels, options and sentences.

import {
  STUDENT_NAME_UNAVAILABLE,
  STUDENT_SELF_NEUTRAL_LABEL,
  acceptStudentName,
  cleanStudentNameText,
  compareStudentIdentities,
  isIdentifierLikeName,
  naturalStudentName,
  resolveStudentIdentity,
  splitStudentDisplayName,
  studentIdLabel,
  studentIdOf,
  studentNamePartsFromIdentity,
} from '../../functions/shared/studentIdentity.mjs';

export {
  STUDENT_NAME_UNAVAILABLE,
  STUDENT_SELF_NEUTRAL_LABEL,
  acceptStudentName,
  isIdentifierLikeName,
  resolveStudentIdentity,
  studentIdLabel,
  studentIdOf,
};

const asStudentRecord = (student) => (
  student && typeof student === 'object' && !Array.isArray(student) ? student : {}
);

export const splitLegacyDisplayName = (displayName = '') => splitStudentDisplayName(displayName);

export const studentNameParts = (student = {}) => (
  studentNamePartsFromIdentity(resolveStudentIdentity(asStudentRecord(student)))
);

/** True when a human name is on file for this student. */
export const hasStudentName = (student = {}) => resolveStudentIdentity(asStudentRecord(student)).hasName;

/**
 * The student's display name: "Last, First" by default, "First Last" with
 * lastFirst:false. When no name is on file: neutralLabel (default
 * STUDENT_NAME_UNAVAILABLE), or '' with fallbackToNeutral:false so a caller can
 * try another human-name source. Never the student's id.
 */
export const formatStudentName = (student = {}, {
  lastFirst = true,
  fallbackToNeutral = true,
  neutralLabel = STUDENT_NAME_UNAVAILABLE,
} = {}) => {
  const identity = resolveStudentIdentity(asStudentRecord(student));
  if (!identity.hasName) return fallbackToNeutral ? neutralLabel : '';
  const { firstName, lastName } = studentNamePartsFromIdentity(identity);
  if (lastFirst && lastName) return firstName ? `${lastName}, ${firstName}` : lastName;
  return naturalStudentName(identity);
};

/**
 * One line that identifies a student when there is no room for a second line:
 * the name, or "Name unavailable · ID 101410" — the id is shown, but labelled
 * as an id, never presented as the name. includeId adds " · ID x" after a real
 * name too (admin screens that act on accounts).
 */
export const formatStudentLabel = (student = {}, { lastFirst = true, includeId = false } = {}) => {
  const record = typeof student === 'string' || typeof student === 'number'
    ? { studentId: String(student) }
    : asStudentRecord(student);
  const name = formatStudentName(record, { lastFirst, fallbackToNeutral: false });
  const idLabel = studentIdLabel(record);
  if (!name) return idLabel ? `${STUDENT_NAME_UNAVAILABLE} · ${idLabel}` : STUDENT_NAME_UNAVAILABLE;
  return includeId && idLabel ? `${name} · ${idLabel}` : name;
};

/**
 * A student's own name for their own screens: the roster name, then a session
 * name that is really a name (a passcode session's displayName is the student
 * id), then the neutral STUDENT_SELF_NEUTRAL_LABEL.
 */
export const resolveStudentDisplayName = ({ rosterStudent = {}, sessionDisplayName = '', studentId = '' } = {}) => {
  const roster = { ...asStudentRecord(rosterStudent) };
  if (studentId && !studentIdOf(roster)) roster.studentId = String(studentId);
  const rosterName = formatStudentName(roster, { lastFirst: false, fallbackToNeutral: false });
  if (rosterName) return rosterName;
  return acceptStudentName(sessionDisplayName, roster) || STUDENT_SELF_NEUTRAL_LABEL;
};

/**
 * THE TEACHER IDENTITY INDEX: studentId -> lightweight roster record.
 *
 * Built from the roster projection a teacher already holds (no Firestore read,
 * no listener), and holding references to those records, not copies. Screens
 * that name a student from a stored studentId look it up in O(1) instead of
 * scanning the roster once per card.
 */
export const buildStudentIdentityIndex = (students = []) => {
  const index = new Map();
  (Array.isArray(students) ? students : []).forEach((student) => {
    const id = studentIdOf(student);
    if (id && !index.has(id)) index.set(id, student);
  });
  return index;
};

// One index per roster array, rebuilt only when React hands us a new array.
const identityIndexCache = new WeakMap();

/** The identity index for a roster array (cached) or a Map passed through. */
export const studentIdentityIndexFor = (students) => {
  if (students instanceof Map) return students;
  if (!Array.isArray(students)) return new Map();
  const cached = identityIndexCache.get(students);
  if (cached && cached.length === students.length) return cached.index;
  const index = buildStudentIdentityIndex(students);
  identityIndexCache.set(students, { index, length: students.length });
  return index;
};

/**
 * Name a student from a stored studentId (an event, a session, a test record):
 * the current roster name first — so a corrected name shows everywhere without
 * rewriting any record — then a stored copy that is really a name, then
 * STUDENT_NAME_UNAVAILABLE. `index` (a Map) skips the roster scan entirely.
 */
export const resolveRosterStudentName = ({
  studentId = null,
  students = [],
  index = null,
  historicalName = '',
  lastFirst = false,
} = {}) => {
  const id = String(studentId ?? '').trim();
  const lookup = index instanceof Map ? index : studentIdentityIndexFor(students);
  const rosterStudent = id ? lookup.get(id) : null;
  if (rosterStudent) {
    const rosterName = formatStudentName(rosterStudent, { lastFirst, fallbackToNeutral: false });
    if (rosterName) return rosterName;
  }
  const historical = acceptStudentName(historicalName, { ...asStudentRecord(rosterStudent), studentId: id });
  if (historical) {
    return formatStudentName({ displayName: historical }, { lastFirst, fallbackToNeutral: false })
      || STUDENT_NAME_UNAVAILABLE;
  }
  return STUDENT_NAME_UNAVAILABLE;
};

/** Named students by last, first, id; students with no name on file after them. */
export const compareStudentsByName = (a = {}, b = {}) => (
  compareStudentIdentities(asStudentRecord(a), asStudentRecord(b))
);

/**
 * Everything a teacher may type to find a student: first, last, full and
 * "Last, First" names, the student id, the SIS id, class period and emails.
 */
export const studentSearchText = (student = {}) => {
  const record = asStudentRecord(student);
  const identity = resolveStudentIdentity(record);
  const { firstName, lastName } = studentNamePartsFromIdentity(identity);
  const profile = asStudentRecord(record.profile);
  return [
    record.studentId,
    record.id,
    record.sisStudentId,
    firstName,
    lastName,
    identity.displayName,
    firstName && lastName ? `${lastName}, ${firstName}` : '',
    record.displayName,
    record.googleName,
    record.name,
    record.studentName,
    profile.displayName,
    profile.name,
    profile.googleName,
    record.classPeriod,
    record.assignedTeacherEmail,
    record.linkedEmail,
  ]
    .map((value) => cleanStudentNameText(typeof value === 'number' ? String(value) : value, 200))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};
