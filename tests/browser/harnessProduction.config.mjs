/*
 * BUILD A BROWSER HARNESS THE WAY PRODUCTION IS BUILT.
 *
 * The harness pages under tests/browser run on the Vite dev server: React's
 * development build, unminified modules, no chunking. That is right for
 * behaviour gates and wrong for timing — PQ-039 measured 90–1800 ms per
 * keystroke in development and could not tell the platform's cost from the
 * development build's. This builds any harness page with the production
 * pipeline, so timings and bundle shapes match what a student downloads.
 *
 *   HARNESS=tests/browser/studentUxPlatform.html \
 *     npx vite build --config tests/browser/harnessProduction.config.mjs
 *   node scripts/serve-static-spa.mjs dist-harness 5303   # then point a driver at it
 *
 * HARNESS takes a comma-separated list; OUT_DIR defaults to dist-harness/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pages = String(process.env.HARNESS || 'tests/browser/studentUxPlatform.html')
  .split(',').map((page) => page.trim()).filter(Boolean);

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: path.resolve(root, process.env.OUT_DIR || 'dist-harness'),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [path.basename(page, '.html'), path.resolve(root, page)])),
    },
  },
});
