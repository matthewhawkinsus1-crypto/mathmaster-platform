// Stands in for both 'firebase/functions' and src/firebase.js when a node test
// imports src/services/secureExamService.js (secureExamServiceIsolation.mjs
// redirects them here). The real src/firebase.js initializes the live project;
// a test must never load it. Any callable reached is counted and refused, so a
// sandbox test that leaks to a Cloud Function fails instead of calling one.
globalThis.__secureExamFirebaseStubLoaded = true;

export const functions = null;

export const httpsCallable = (_functions, name) => () => {
  globalThis.__secureExamCallableCalls = (globalThis.__secureExamCallableCalls || 0) + 1;
  return Promise.reject(new Error(`A sandbox test reached the Cloud Function ${name}.`));
};
