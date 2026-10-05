import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { swapModules } from './swapModules.mjs';

// The Test Cycle lifecycle QA harness (testCycleLifecycleQa.mjs): firebase.js
// points at the emulator, and the three assessment service modules post every
// callable to the local bridge that runs the real Cloud Functions code. See
// swapModules.mjs for why the swap compares resolved paths.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const bridge = path.join(here, 'testCycleBridgeServices.js');

export default defineConfig({
  root: repo,
  cacheDir: path.join(repo, 'node_modules/.vite-test-cycle-bridge'),
  plugins: [
    swapModules('mm-test-cycle-bridge-swap', [
      [path.join(repo, 'src/firebase.js'), path.join(here, 'firebaseEmulator.js')],
      [path.join(repo, 'src/services/testCycleService.js'), bridge],
      [path.join(repo, 'src/services/secureExamService.js'), bridge],
      [path.join(repo, 'src/services/assessmentLifecycleService.js'), bridge],
    ]),
    react(),
  ],
});
