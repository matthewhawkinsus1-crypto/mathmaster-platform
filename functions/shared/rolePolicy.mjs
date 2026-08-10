// Who is allowed to do what, as a pure function of the verified token.
//
// These predicates are the ones the callables enforce. They live here, apart
// from the Functions runtime, so the negative cases can be tested directly:
// it is not enough to prove an administrator can create a student, it has to be
// proven that a teacher cannot, that a student cannot, and that neither can get
// there by asserting a claim the browser made up.
//
// EVERY CLAIM READ HERE IS SERVER-VERIFIED. `request.auth.token` is decoded
// from a Firebase ID token whose signature the SDK checked; nothing a client
// puts in a request body reaches these functions. That is the whole reason the
// role lives in a custom claim rather than in a Firestore document the client
// could race, or a field in the payload.

export const ROLE = Object.freeze({ STUDENT: 'student', TEACHER: 'teacher' });

/** Signed in at all. */
export const isAuthenticated = (auth) => Boolean(auth && auth.uid);

export const isTeacher = (auth) => isAuthenticated(auth) && auth.token?.role === ROLE.TEACHER;

export const isStudent = (auth) => (
  isAuthenticated(auth)
  && auth.token?.role === ROLE.STUDENT
  && typeof auth.token?.studentId === 'string'
  && auth.token.studentId.length > 0
);

/**
 * The root administrator.
 *
 * Four things must agree, and the last one is the important one: the caller's
 * verified email must be the configured root administrator. Without it, anyone
 * who ever obtained an `admin: true` claim — a stale token, a mistaken grant,
 * a bug in a future callable — would keep administrative power. With it, the
 * claims are a necessary condition and the identity is the sufficient one.
 */
export const isRootAdmin = (auth, { rootAdminEmail }) => (
  isTeacher(auth)
  && auth.token?.admin === true
  && auth.token?.rootAdmin === true
  && normalizeEmail(auth.token?.email) === normalizeEmail(rootAdminEmail)
);

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

/** A student may only ever act on their own record. */
export const ownsStudentRecord = (auth, studentId) => (
  isStudent(auth) && auth.token.studentId === String(studentId || '')
);

/**
 * Whether a teacher may see a particular student.
 *
 * The root administrator sees the school. Any other teacher sees the students
 * in the classes they are teacher of record for — and a student with no class
 * belongs to no teacher, so nobody but an administrator sees them.
 */
export const canReadStudent = (auth, { student, classes = [], rootAdminEmail }) => {
  if (isRootAdmin(auth, { rootAdminEmail })) return true;
  if (ownsStudentRecord(auth, student?.studentId ?? student?.id)) return true;
  if (!isTeacher(auth)) return false;
  const classRecord = classes.find((entry) => entry.classId === student?.classId);
  if (!classRecord) return false;
  return normalizeEmail(classRecord.teacherOfRecord) === normalizeEmail(auth.token?.email);
};

// The operations that change who exists and who belongs where. Every one of
// these is root-administrator-only; there is no teacher-level shortcut.
export const ADMIN_ONLY_OPERATIONS = Object.freeze([
  'createStudentAccount',
  'setStudentClass',
  'setStudentAccountStatus',
  'permanentlyDeleteStudent',
  'assignStudentToTeacher',
  'setTeacherAccess',
  'saveClass',
  'setClassStatus',
  'migrateClassesFromPeriods',
  'listAdminAuditLog',
]);

export const requiresRootAdmin = (operation) => ADMIN_ONLY_OPERATIONS.includes(operation);

/**
 * The single decision every administrative callable makes before doing
 * anything.
 *
 * Returns a reason rather than a boolean so the caller can map it onto the
 * right error code, and so a test can assert WHY something was refused.
 */
export const authorizeRootAdmin = (auth, { rootAdminEmail }) => {
  if (!isAuthenticated(auth)) return { allowed: false, reason: 'unauthenticated' };
  if (!isRootAdmin(auth, { rootAdminEmail })) return { allowed: false, reason: 'not_root_admin' };
  return { allowed: true, reason: null };
};

/**
 * The same decision, for a named operation.
 *
 * The name is checked against the allowlist first, so an operation nobody
 * declared administrative is refused rather than quietly permitted — a new
 * callable has to be added to `ADMIN_ONLY_OPERATIONS` deliberately.
 */
export const authorizeAdminOperation = (auth, { operation, rootAdminEmail }) => {
  if (!requiresRootAdmin(operation)) return { allowed: false, reason: 'unknown_operation' };
  return authorizeRootAdmin(auth, { rootAdminEmail });
};
