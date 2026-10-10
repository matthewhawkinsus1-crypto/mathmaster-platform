import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { swapModules } from './emulator/swapModules.mjs';

/*
 * The results harness (secureResults.mjs): released reviews, the Test Cycle
 * card around them, and the teacher's practice-test form.
 *
 * Both callable modules are swapped for this harness's own stubs, whose
 * payloads have the shape the real callables return; firebase.js is the
 * emulator module (no auth, no functions), and the remaining service modules
 * are the shared stubs. The driver also blocks every non-local request. Its
 * own cache directory keeps it from colliding with another harness's Vite.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const emulator = path.join(here, 'emulator');

export default defineConfig({
  root: repo,
  cacheDir: path.join(repo, 'node_modules/.vite-secure-results'),
  plugins: [
    swapModules('mm-secure-results-swap', [
      [path.join(repo, 'src/firebase.js'), path.join(emulator, 'firebaseEmulator.js')],
      [path.join(repo, 'src/services/secureExamService.js'), path.join(here, 'secureResultsSecureExamStub.js')],
      [path.join(repo, 'src/services/testCycleService.js'), path.join(here, 'secureResultsTestCycleStub.js')],
      [path.join(repo, 'src/platform/liveChallenge/liveChallengeService.js'), path.join(emulator, 'liveChallengeServiceStub.js')],
      [path.join(repo, 'src/platform/rewards/rewardsClient.js'), path.join(emulator, 'rewardsClientStub.js')],
    ]),
    react(),
  ],
});
