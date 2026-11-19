// Module resolve hooks (node:module register) for a node test that imports the
// teacher kit (src/app/teacher/teacherKit.js) itself.
//
// Since the App split the kit also exports a teacher's control factories
// (src/app/teacher/controls), and those import what App.jsx imported, the way
// App.jsx wrote it: src/firebase.js (the production project) and modules named
// without their extension, which the bundler resolves and node refuses. Here
// src/firebase.js and src/firebaseApp.js resolve to empty handles, so importing
// the kit never opens a Firebase project, and a relative import node cannot
// find is tried once more with '.js'. Nothing else is replaced: every kit
// member is the real one.
const stub = `data:text/javascript,${encodeURIComponent('export const db = {}; export const auth = {}; export const functions = {}; export const app = {};')}`;
const FIREBASE_MODULE = /\/src\/firebase(?:App)?(?:\.js)?$/;

export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith('.') && Boolean(context.parentURL);
  if (relative && FIREBASE_MODULE.test(new URL(specifier, context.parentURL).pathname)) return { url: stub, shortCircuit: true };
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (relative && error?.code === 'ERR_MODULE_NOT_FOUND' && !/\.\w+$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
    throw error;
  }
}
