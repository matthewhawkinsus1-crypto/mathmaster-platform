/*
 * Teacher-workflow harness: the REAL MathMaster app, signed in as a synthetic
 * teacher, with every `firebase/*` import replaced by the in-memory fakes in
 * this folder. Nothing can reach a Firebase project.
 *
 *   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs
 *   open http://127.0.0.1:5188/tests/browser/teacherWorkflow/index.html?reset=1
 *
 * `?reset=1` reseeds the fixture relative to the current time;
 * `?weeklyPath=ok` makes the weekly Path callable succeed (it fails by
 * default, like production did during the audit).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^firebase\/app$/, replacement: path.join(here, 'fakeApp.js') },
      { find: /^firebase\/auth$/, replacement: path.join(here, 'fakeAuth.js') },
      { find: /^firebase\/firestore$/, replacement: path.join(here, 'fakeFirestore.js') },
      { find: /^firebase\/functions$/, replacement: path.join(here, 'fakeFunctions.js') },
    ],
  },
  optimizeDeps: { exclude: ['firebase'] },
  server: { host: '127.0.0.1', port: Number(process.env.TEACHER_HARNESS_PORT || 5188), strictPort: true },
});
