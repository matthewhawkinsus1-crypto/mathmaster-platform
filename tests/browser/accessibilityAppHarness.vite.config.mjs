/*
 * The accessibility certification's in-memory app harness: EXACTLY the
 * teacher-workflow harness (tests/browser/teacherWorkflow/vite.config.mjs —
 * the real App.jsx, every `firebase/*` import replaced by the in-memory fakes,
 * nothing can reach a Firebase project), except that `firebase/firestore`
 * resolves to accessibilityFakeFirestore.js, the same fake with snapshot
 * `metadata` filled in so a student's Live Challenge screen renders.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs
 *   open http://127.0.0.1:5188/tests/browser/teacherWorkflow/index.html?reset=1&as=student&studentId=910002
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import teacherHarness from './teacherWorkflow/vite.config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const aliases = teacherHarness.resolve.alias.map((entry) => (
  String(entry.find) === String(/^firebase\/firestore$/)
    ? { ...entry, replacement: path.join(here, 'accessibilityFakeFirestore.js') }
    : entry
));
if (!aliases.some((entry) => entry.replacement === path.join(here, 'accessibilityFakeFirestore.js'))) {
  throw new Error('accessibilityAppHarness: the teacher harness no longer aliases firebase/firestore; update this config.');
}

export default defineConfig({
  ...teacherHarness,
  resolve: { ...teacherHarness.resolve, alias: aliases },
  // Its own dependency cache, for the reason the teacher harness has one.
  cacheDir: path.join(root, 'node_modules/.vite-accessibility-harness'),
});
