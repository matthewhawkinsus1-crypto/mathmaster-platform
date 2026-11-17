// Module resolve hooks (node:module register) for a node test of a src/
// module that reads Firestore through the web SDK: 'firebase/firestore',
// 'firebase/functions' and src/firebase.js (the production project) resolve to
// firestoreClientStub.mjs, so importing the module never loads a Firebase
// project and every read, write and transaction lands in the stub's memory.
//
// src/ imports src/firebase.js without its extension ('../../firebase'),
// which node's own resolver refuses: it is matched here before that.
const stub = new URL('./firestoreClientStub.mjs', import.meta.url).href;
const FIREBASE_MODULE = /\/src\/firebase(?:\.js)?$/;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'firebase/firestore' || specifier === 'firebase/functions') return { url: stub, shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL && FIREBASE_MODULE.test(new URL(specifier, context.parentURL).pathname)) {
    return { url: stub, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
