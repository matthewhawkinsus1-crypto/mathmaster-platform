/*
 * The accessibility certification's in-memory app harness: EXACTLY the
 * teacher-workflow harness (tests/browser/teacherWorkflow/vite.config.mjs —
 * the real App.jsx, every `firebase/*` import replaced by the in-memory fakes,
 * nothing can reach a Firebase project), served from its own dependency cache.
 *
 * It once swapped `firebase/firestore` for a second fake
 * (accessibilityFakeFirestore.js) whose only addition was the snapshot
 * `metadata` Live Challenge's screen reads. The shared fake carries that now
 * (teacherWorkflow/fakeFirestore.js), so this is the teacher harness under
 * another name: the workflows that start it, and the drivers that find it by
 * port, keep working as they were (CI15, A1-68).
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

export default defineConfig({
  ...teacherHarness,
  // Its own dependency cache, for the reason the teacher harness has one.
  cacheDir: path.join(root, 'node_modules/.vite-accessibility-harness'),
});
