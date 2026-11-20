// Module resolve hooks (node:module register) for a node test that imports the
// teacher kit (src/app/teacher/teacherKit.js) itself.
//
// Since the App split the kit also exports a teacher's control factories
// (src/app/teacher/controls), and those import what App.jsx imported, the way
// App.jsx wrote it: src/firebase.js (the production project) and modules named
// without their extension, which the bundler resolves and node refuses. Here
// src/firebase.js and src/firebaseApp.js resolve to empty handles, so importing
// the kit never opens a Firebase project, and a relative import node cannot
// find is tried once more with '.js'.
//
// Since slice 7 of the split the kit also exports the dialogs App draws for a
// teacher (controls/teacherDialogViews.jsx). Node cannot read JSX, and a node
// test has nothing to draw with, so a .jsx module loads as its exported NAMES:
// each a function that refuses to be called. What the kit exports is still
// true; what the views draw is held by the source contracts and the browser
// journeys. Nothing else is replaced: every other kit member is the real one.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !url.endsWith('.jsx')) return nextLoad(url, context);
  const names = [...readFileSync(fileURLToPath(url), 'utf8').matchAll(/^export (?:async )?function (\w+)\(/gm)].map(([, name]) => name);
  const source = names.map((name) => `export function ${name}() { throw new Error('${name} draws JSX: a node test reads its source, it does not call it'); }`).join('\n');
  return { format: 'module', source, shortCircuit: true };
}
