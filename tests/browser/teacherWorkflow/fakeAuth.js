/*
 * firebase/auth stand-in: one signed-in synthetic teacher. The claims mirror a
 * real teacher-of-record (not a root administrator), so every server-scoped
 * screen shows exactly what an ordinary teacher would see.
 *
 * `?as=student&studentId=<id>` signs in one of the fixture's synthetic
 * students instead, with the custom-token claims a real student session
 * carries ({ role: 'student', studentId }), so the student side of the
 * support evidence build can be driven against the same in-memory school.
 */
import { TEACHER_EMAIL } from './fixture.js';

const teacher = {
  uid: 'harness-teacher-uid',
  email: TEACHER_EMAIL,
  displayName: 'Sample Teacher',
  photoURL: null,
  getIdTokenResult: async () => ({ claims: { role: 'teacher', email: TEACHER_EMAIL } }),
  getIdToken: async () => 'harness-token',
};
const params = new URLSearchParams(window.location.search);
const studentId = params.get('as') === 'student' ? (params.get('studentId') || '910002') : null;
const student = studentId ? {
  uid: `harness-student-${studentId}`,
  email: null,
  displayName: null,
  photoURL: null,
  getIdTokenResult: async () => ({ claims: { role: 'student', studentId } }),
  getIdToken: async () => 'harness-token',
} : null;
const signedInUser = student || teacher;
let current = params.get('signedOut') ? null : signedInUser;
const observers = new Set();
const auth = { get currentUser() { return current; } };

export const getAuth = () => auth;
export const onAuthStateChanged = (_auth, callback) => {
  observers.add(callback);
  setTimeout(() => callback(current), 0);
  return () => observers.delete(callback);
};
export class GoogleAuthProvider { setCustomParameters() {} addScope() {} }
export const browserLocalPersistence = { type: 'LOCAL' };
export const browserSessionPersistence = { type: 'SESSION' };
export const setPersistence = async () => {};
const signIn = async () => { current = signedInUser; observers.forEach((fn) => fn(current)); return { user: signedInUser }; };
export const signInWithPopup = signIn;
export const signInWithRedirect = signIn;
export const signInWithEmailAndPassword = signIn;
export const signInWithCustomToken = signIn;
export const getRedirectResult = async () => null;
export const sendPasswordResetEmail = async () => {};
export const signOut = async () => { current = null; observers.forEach((fn) => fn(null)); };
