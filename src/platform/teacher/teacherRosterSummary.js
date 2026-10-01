// The teacher's lightweight roster, and how a teacher screen names a student
// it only knows by studentId.
//
// listSignInAccess (functions/index.js) returns one compact row per student,
// built by buildTeacherRosterSummaryRow (functions/shared/studentIdentity.mjs).
// Teacher Home, Classes, Attendance, Classroom and Live hold ONLY these rows —
// TEACHER_FULL_STUDENT_DATA_TABS in App.jsx decides when full grades documents
// are loaded instead — so this normaliser is the second allow-list every name
// passes through on its way to those screens. Its first version (PR #314)
// copied firstName/lastName/displayName and dropped every other field, so a
// Classroom-linked legacy student whose only name was googleName reached Live
// View with no name at all, and the tile showed the numeric id.
//
// The row is therefore RESOLVED here, not copied: resolveStudentIdentity reads
// whatever name fields the entry carries — a row the server already resolved,
// or one from an older server that still sends raw googleName / legacy fields —
// and the client keeps the resolved name. Pure: no Firestore, no React.

import { UNASSIGNED_PERIOD } from '../../../functions/shared/classModel.mjs';
import { normalizeStudentProfile } from '../../studentSupport.js';
import {
  STUDENT_NAME_UNAVAILABLE,
  formatStudentLabel,
  resolveRosterStudentName,
  resolveStudentIdentity,
} from '../studentName.js';

const NAME_SOURCES = new Set(['structured', 'displayName', 'googleName', 'legacyName', 'profileName']);

/**
 * One listSignInAccess row as the teacher client keeps it. The name is the
 * resolved one; firstName/lastName are reported only when they are really
 * stored as parts (a single full name is not guessed into parts here).
 * nameMissing marks a student with no usable name on file, so a screen can say
 * "Name unavailable" and show the id beside it, labelled as an id.
 */
export const normalizeTeacherRosterSummary = (entry = {}) => {
  const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  const id = String(record.studentId || record.id || '').trim();
  const identity = resolveStudentIdentity({ ...record, studentId: id });
  const structuredParts = identity.nameSource === 'structured';
  // A server-resolved row already carries its name in displayName, so the
  // client resolver reads it as 'displayName'. Keep the server's diagnosis of
  // where that name came from (googleName, legacyName...) when it sent one.
  const nameSource = identity.nameSource === 'displayName' && NAME_SOURCES.has(record.nameSource)
    ? record.nameSource
    : identity.nameSource;
  return {
    id,
    studentId: id,
    firstName: structuredParts ? identity.firstName || null : null,
    lastName: structuredParts ? identity.lastName || null : null,
    displayName: identity.displayName || null,
    nameSource,
    nameMissing: !identity.hasName,
    classId: record.classId || null,
    classPeriod: record.classPeriod || UNASSIGNED_PERIOD,
    status: record.status || 'active',
    assignedTeacherEmail: record.assignedTeacherEmail || null,
    linkedEmail: record.linkedEmail || null,
    sisStudentId: record.sisStudentId || null,
    profile: normalizeStudentProfile(record.profile || {}),
  };
};

/**
 * The name to keep on a record a teacher action writes (a support event, an
 * attendance resolution): the roster name, else a stored copy that is really a
 * name, else null. NEVER the id and never the "Name unavailable" label —
 * readers resolve a null name by studentId against the roster at display time,
 * so a name corrected later shows everywhere without rewriting history.
 *
 * Accepts the arguments of resolveRosterStudentName ({ studentId, index |
 * students, historicalName }).
 */
export const rosterStudentNameForStorage = (args = {}) => {
  const name = resolveRosterStudentName({ ...args, lastFirst: false });
  return name === STUDENT_NAME_UNAVAILABLE ? null : name;
};

/**
 * One line naming a student where there is no room for a second line (a toast,
 * an aria-label, a confirmation): the roster name, or
 * "Name unavailable · ID 101410" — the id shown, but labelled as an id.
 */
export const rosterStudentLabel = ({ studentId = null, lastFirst = false, ...args } = {}) => {
  const name = resolveRosterStudentName({ ...args, studentId, lastFirst });
  if (name !== STUDENT_NAME_UNAVAILABLE) return name;
  return formatStudentLabel({ studentId: String(studentId ?? '').trim() });
};

export default normalizeTeacherRosterSummary;
