/*
 * firebase/auth stand-in: one signed-in synthetic teacher. The claims mirror a
 * real teacher-of-record (not a root administrator), so every server-scoped
 * screen shows exactly what an ordinary teacher would see.
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
let current = new URLSearchParams(window.location.search).get('signedOut') ? null : teacher;
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
const signIn = async () => { current = teacher; observers.forEach((fn) => fn(current)); return { user: teacher }; };
export const signInWithPopup = signIn;
export const signInWithRedirect = signIn;
export const signInWithEmailAndPassword = signIn;
export const signInWithCustomToken = signIn;
export const getRedirectResult = async () => null;
export const sendPasswordResetEmail = async () => {};
export const signOut = async () => { current = null; observers.forEach((fn) => fn(null)); };
