/*
 * THE TEACHER-WORKFLOW HARNESS, BUILT THE WAY PRODUCTION IS BUILT.
 *
 * vite.config.mjs serves the real App.jsx over the in-memory Firebase fakes
 * on the dev server: React's development build, one request per module. That
 * is right for behaviour and wrong for timing (PQ-039 measured typing 3-20x
 * slower there than a production build). This builds the same page, with the
 * same fakes and module swaps, through `vite build`: React's production
 * build, minified chunks, the chunk graph a student downloads.
 *
 *   OUT_DIR=<dir> npx vite build --config tests/browser/teacherWorkflow/vite.production.config.mjs
 *   node scripts/serve-static-spa.mjs <dir> <port>
 *   open http://127.0.0.1:<port>/tests/browser/teacherWorkflow/index.html?reset=1&as=student
 *
 * Source maps are written beside the chunks but not linked from them
 * ('hidden'), so the JavaScript is the code a student runs and a CPU profile
 * can still be read back to source names (studentRuntimePerformance.mjs).
 * OUT_DIR defaults to dist-harness/ (git-ignored).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import harness from './vite.config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

export default defineConfig({
  ...harness,
  // Production mode even when a caller's shell sets NODE_ENV for its tools.
  mode: 'production',
  resolve: { ...harness.resolve, dedupe: ['mathjs'] },
  build: {
    outDir: path.resolve(root, process.env.OUT_DIR || 'dist-harness'),
    emptyOutDir: true,
    sourcemap: 'hidden',
    rollupOptions: { input: { harness: path.join(here, 'index.html') } },
  },
});
