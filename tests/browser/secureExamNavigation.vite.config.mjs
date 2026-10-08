import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { swapModules } from './emulator/swapModules.mjs';

/*
 * The secure-test navigation harness (secureExamNavigation.mjs).
 *
 * Unlike the device harness, the secure-exam service is NOT swapped for a
 * stub: the page runs the real src/services/secureExamService.js in its
 * MOCK_LOCAL sandbox, which plays the navigation contract (issue by position,
 * drafts, flags, module close, pause, finalize and release). Everything that
 * could reach a real Firebase project still is swapped — firebase.js for the
 * emulator module (which never authenticates and has no `functions`), and the
 * other service modules for their stubs — and the driver blocks every
 * non-local request on top of that.
 *
 * Every screen the student sees is the real one, the secure question player
 * included: nothing in src/components is swapped here.
 */
process.env.VITE_MATHMASTER_EXECUTION_MODE = process.env.VITE_MATHMASTER_EXECUTION_MODE || 'mockLocal';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const emulator = path.join(here, 'emulator');

export default defineConfig({
  root: repo,
  cacheDir: path.join(repo, 'node_modules/.vite-secure-exam-navigation'),
  plugins: [
    swapModules('mm-secure-navigation-swap', [
      [path.join(repo, 'src/firebase.js'), path.join(emulator, 'firebaseEmulator.js')],
      [path.join(repo, 'src/platform/liveChallenge/liveChallengeService.js'), path.join(emulator, 'liveChallengeServiceStub.js')],
      [path.join(repo, 'src/services/testCycleService.js'), path.join(emulator, 'testCycleServiceStub.js')],
      [path.join(repo, 'src/platform/rewards/rewardsClient.js'), path.join(emulator, 'rewardsClientStub.js')],
    ]),
    react(),
  ],
});
