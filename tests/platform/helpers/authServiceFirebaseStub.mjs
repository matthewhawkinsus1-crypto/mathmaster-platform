// Stands in for 'firebase/auth', 'firebase/functions' and src/firebaseApp.js
// when a node test imports src/auth/authService.js (authServiceIsolation.mjs
// redirects them here). The real firebaseApp.js initializes the live project; a
// test must never load it.
//
// Every callable the service makes is recorded in globalThis.__authServiceCalls
// as { name, data } and answered by globalThis.__authServiceAnswer(name, data),
// which the test sets; with none set, a call is refused.
export const auth = { stub: 'auth' };
export const functions = { stub: 'functions' };

export const httpsCallable = (_functions, name) => async (data) => {
  (globalThis.__authServiceCalls ||= []).push({ name, data });
  const answer = globalThis.__authServiceAnswer;
  if (typeof answer !== 'function') throw new Error(`A node test reached the callable ${name} with no answer set.`);
  return { data: await answer(name, data) };
};

const refused = (name) => async () => { throw new Error(`${name} is not available in a node test of authService.js.`); };
export class GoogleAuthProvider { setCustomParameters() {} }
export const browserLocalPersistence = { type: 'LOCAL' };
export const browserSessionPersistence = { type: 'SESSION' };
export const getRedirectResult = async () => null;
export const sendPasswordResetEmail = refused('sendPasswordResetEmail');
export const setPersistence = async () => {};
export const signInWithCustomToken = refused('signInWithCustomToken');
export const signInWithEmailAndPassword = refused('signInWithEmailAndPassword');
export const signInWithPopup = refused('signInWithPopup');
export const signInWithRedirect = refused('signInWithRedirect');
export const signOut = async () => {};
