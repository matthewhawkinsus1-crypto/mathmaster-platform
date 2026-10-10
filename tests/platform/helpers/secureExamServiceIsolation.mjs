// Module resolve hooks (node:module register) for a node test of
// src/services/secureExamService.js: 'firebase/functions' and src/firebase.js
// resolve to secureExamFirebaseStub.mjs, so importing the service never loads
// the live Firebase project and no callable can be reached.
const stub = new URL('./secureExamFirebaseStub.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'firebase/functions') return { url: stub, shortCircuit: true };
  const resolved = await nextResolve(specifier, context);
  if (resolved.url.endsWith('/src/firebase.js')) return { url: stub, shortCircuit: true };
  return resolved;
}
