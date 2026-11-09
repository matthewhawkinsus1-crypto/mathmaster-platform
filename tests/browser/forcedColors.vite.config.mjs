/*
 * The forced-colours certification's standalone harness server: EXACTLY the
 * stubbed one the accessibility certification uses
 * (tests/browser/emulator/vite.config.mjs: src/firebase.js, the Test Cycle,
 * secure exam, Live Challenge and rewards services swapped for stubs, so the
 * secure exam's screens open), served from its own dependency cache.
 *
 * The theme certification job runs it beside a plain `vite` on 5199 (the Work
 * View harness). Two servers that share node_modules/.vite can each invalidate
 * the other's optimized dependencies and reload its pages mid-test, as the
 * teacher harness's own cache says (teacherWorkflow/vite.config.mjs).
 *
 *   npx vite --config tests/browser/forcedColors.vite.config.mjs --host 127.0.0.1 --port 5198 --strictPort
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import stubbedHarness from './emulator/vite.config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

export default defineConfig({
  ...stubbedHarness,
  cacheDir: path.join(root, 'node_modules/.vite-forced-colors'),
});
