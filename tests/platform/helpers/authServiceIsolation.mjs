// Module resolve hooks (node:module register) for a node test of
// src/auth/authService.js: 'firebase/auth', 'firebase/functions' and
// src/firebaseApp.js (the production config) resolve to authServiceFirebaseStub.mjs,
// so importing the service never loads the live Firebase project and every
// callable it makes is answered by the test.
const stub = new URL('./authServiceFirebaseStub.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'firebase/auth' || specifier === 'firebase/functions') return { url: stub, shortCircuit: true };
  const resolved = await nextResolve(specifier, context);
  if (/\/src\/firebase(?:App)?\.js$/.test(resolved.url)) return { url: stub, shortCircuit: true };
  return resolved;
}
