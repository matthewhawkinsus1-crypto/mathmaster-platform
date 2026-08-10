// Thin, framework-free wrapper over Firebase Auth and the sign-in callables.
// Everything React-shaped lives in AuthProvider.jsx; this module only knows how
// to talk to Firebase and how to turn its errors into sentences a fourteen year
// old can act on.
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getRedirectResult,
  sendPasswordResetEmail,
  setPersistence,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';

const REMEMBER_DEVICE_KEY = 'mathmaster.rememberDevice';
const LAST_ROLE_KEY = 'mathmaster.lastRole';
const LAST_STUDENT_ID_KEY = 'mathmaster.lastStudentId';

const callable = (name) => httpsCallable(functions, name);

/**
 * Shared devices are the norm in a classroom, so "remember me" is opt-in.
 * Declining it keeps the session in tab-scoped storage, which disappears when
 * the student closes the browser instead of greeting the next period as them.
 */
export function readRememberDevice() {
  try {
    return window.localStorage.getItem(REMEMBER_DEVICE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeRememberDevice(remember) {
  try {
    window.localStorage.setItem(REMEMBER_DEVICE_KEY, remember ? 'true' : 'false');
  } catch {
    // Private browsing with storage disabled: the session simply will not persist.
  }
}

/** Remembering the last role/ID skips a tap and a retype for returning users. */
export function readLoginHints() {
  try {
    return {
      role: window.localStorage.getItem(LAST_ROLE_KEY) || null,
      studentId: window.localStorage.getItem(LAST_STUDENT_ID_KEY) || '',
    };
  } catch {
    return { role: null, studentId: '' };
  }
}

export function writeLoginHints({ role, studentId }) {
  try {
    if (role) window.localStorage.setItem(LAST_ROLE_KEY, role);
    if (studentId !== undefined) {
      if (studentId) window.localStorage.setItem(LAST_STUDENT_ID_KEY, studentId);
      else window.localStorage.removeItem(LAST_STUDENT_ID_KEY);
    }
  } catch {
    // Non-fatal: hints are a convenience, never a requirement.
  }
}

async function applyPersistence(remember) {
  writeRememberDevice(remember);
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

function googleProvider() {
  const provider = new GoogleAuthProvider();
  // Always show the chooser. On a shared Chromebook the previously signed-in
  // Google account is almost never the one the current student wants.
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/**
 * Popup first, because it keeps the app state alive and works in every desktop
 * and mobile browser we support. Redirect is the fallback for the environments
 * that block popups outright — in-app webviews, locked-down iOS profiles.
 */
export async function signInWithGoogle({ remember = true } = {}) {
  await applyPersistence(remember);
  try {
    const credential = await signInWithPopup(auth, googleProvider());
    return { user: credential.user, viaRedirect: false };
  } catch (error) {
    const code = error?.code;
    if (
      code === 'auth/popup-blocked'
      || code === 'auth/operation-not-supported-in-this-environment'
      || code === 'auth/cancelled-popup-request'
    ) {
      await signInWithRedirect(auth, googleProvider());
      return { user: null, viaRedirect: true };
    }
    throw error;
  }
}

/** Completes a redirect sign-in after the browser comes back to the app. */
export async function consumeRedirectResult() {
  try {
    const credential = await getRedirectResult(auth);
    return credential?.user || null;
  } catch (error) {
    console.error('Google redirect sign-in failed:', error);
    return null;
  }
}

export async function signInWithPassword({ email, password, remember = true }) {
  await applyPersistence(remember);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function sendTeacherPasswordReset(email) {
  await sendPasswordResetEmail(auth, String(email || '').trim());
}

/**
 * Student ID + PIN. The server hands back a custom token so the resulting
 * session is an ordinary Firebase user that security rules can reason about.
 *
 * `classCode` is only sent on first-time setup or after a teacher reset; the
 * server tells us which case we are in via the `needs-setup` reason.
 */
export async function signInWithStudentId({ studentId, passcode, classCode, remember = false }) {
  await applyPersistence(remember);
  const response = await callable('studentSignIn')({
    studentId: studentId.trim(),
    passcode: String(passcode || '').trim(),
    ...(classCode ? { classCode: classCode.trim() } : {}),
  });
  const { token, ...rest } = response.data || {};
  await signInWithCustomToken(auth, token);
  writeLoginHints({ role: 'student', studentId: studentId.trim() });
  return rest;
}

export async function resolveSignedInRole() {
  const response = await callable('resolveSignedInRole')();
  return response.data || {};
}

export async function linkGoogleAccount({ studentId, classCode }) {
  const response = await callable('linkGoogleAccount')({
    studentId: studentId.trim(),
    classCode: classCode.trim(),
  });
  return response.data || {};
}

export const teacherAdmin = {
  listSignInAccess: () => callable('listSignInAccess')().then((result) => result.data || {}),
  listClassJoinCodes: () => callable('listClassJoinCodes')().then((result) => result.data || {}),
  issueClassJoinCode: (classPeriod) =>
    callable('issueClassJoinCode')({ classPeriod }).then((result) => result.data || {}),
  resetStudentPasscode: (studentId) =>
    callable('resetStudentPasscode')({ studentId }).then((result) => result.data || {}),
  unlinkStudentAccount: (studentId) =>
    callable('unlinkStudentAccount')({ studentId }).then((result) => result.data || {}),
  createStudentAccount: ({ studentId, displayName = '', classId = '', classPeriod = 'Unassigned', teacherEmail = '' }) =>
    callable('createStudentAccount')({ studentId, displayName, classId, classPeriod, teacherEmail }).then((result) => result.data || {}),
  assignStudentToTeacher: ({ studentId, teacherEmail = '', classPeriod = 'Unassigned' }) =>
    callable('assignStudentToTeacher')({ studentId, teacherEmail, classPeriod }).then((result) => result.data || {}),
  setTeacherAccess: (email, active) =>
    callable('setTeacherAccess')({ email, active }).then((result) => result.data || {}),

  // Classes, rosters, and the three different things "remove" can mean.
  listClasses: () => callable('listClasses')().then((result) => result.data || {}),
  saveClass: (record) => callable('saveClass')(record).then((result) => result.data || {}),
  setClassStatus: (classId, action) =>
    callable('setClassStatus')({ classId, action }).then((result) => result.data || {}),
  /** `dryRun` plans and reports without writing anything. */
  migrateClassesFromPeriods: (dryRun = false) =>
    callable('migrateClassesFromPeriods')({ dryRun }).then((result) => result.data || {}),
  /** Gives existing evidence/mastery/scratchpads the fields the rules read. */
  backfillRecordAuthorization: (dryRun = false) =>
    callable('backfillRecordAuthorization')({ dryRun }).then((result) => result.data || {}),
  /** Put a student in a class, move them, or take them out (classId: null). */
  setStudentClass: ({ studentId, classId }) =>
    callable('setStudentClass')({ studentId, classId: classId || '' }).then((result) => result.data || {}),
  /** Deactivate or reactivate an account. Never touches grades or evidence. */
  setStudentAccountStatus: ({ studentId, active }) =>
    callable('setStudentAccountStatus')({ studentId, active }).then((result) => result.data || {}),
  permanentlyDeleteStudent: (studentId, confirmation) =>
    callable('permanentlyDeleteStudent')({ studentId, confirmation }).then((result) => result.data || {}),
  listAdminAuditLog: (limit = 40) =>
    callable('listAdminAuditLog')({ limit }).then((result) => result.data || {}),
};

export async function signOutSession() {
  await signOut(auth);
}

/** True when the server is telling us this student has no PIN yet. */
export function isSetupRequired(error) {
  return error?.details?.reason === 'needs-setup';
}

const FRIENDLY_ERRORS = {
  'auth/invalid-email': 'That does not look like a valid email address.',
  'auth/invalid-credential': 'That email and password do not match an account.',
  'auth/wrong-password': 'That email and password do not match an account.',
  'auth/user-not-found': 'That email and password do not match an account.',
  'auth/user-disabled': 'That account has been disabled. Ask your school administrator.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window closed before finishing.',
  'auth/network-request-failed': 'No connection. Check the network and try again.',
  'auth/unauthorized-domain': 'This web address is not authorized for Google sign-in yet.',
  'functions/unauthenticated': 'Sign in again to continue.',
  'functions/permission-denied': 'Those sign-in details are not correct.',
  'functions/resource-exhausted': 'Too many attempts. Wait a few minutes and try again.',
};

/** Turns any auth failure into something worth showing a student or teacher. */
export function describeAuthError(error) {
  if (!error) return 'Something went wrong. Try again.';
  const code = error.code || '';
  // Callable errors carry a server-written message that is already specific
  // ("3 attempts left", "ask your teacher for the current code"). Prefer it.
  if (code.startsWith('functions/') && error.message && !error.message.startsWith('INTERNAL')) {
    return error.message;
  }
  return FRIENDLY_ERRORS[code] || error.message || 'Something went wrong. Try again.';
}
