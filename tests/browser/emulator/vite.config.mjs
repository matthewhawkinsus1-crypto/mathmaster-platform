import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { swapModules } from './swapModules.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');

// Every module that would reach a real Firebase project, swapped for the
// emulator or a stub by RESOLVED path, however it is imported. Why one plugin
// that compares resolved ids — and why it must return its own resolution — is
// in swapModules.mjs.
export default defineConfig({
  root: repo,
  plugins: [
    swapModules('mm-harness-swap', [
      [path.join(repo, 'src/firebase.js'), path.join(here, 'firebaseEmulator.js')],
      [path.join(repo, 'src/platform/liveChallenge/liveChallengeService.js'), path.join(here, 'liveChallengeServiceStub.js')],
      [path.join(repo, 'src/services/testCycleService.js'), path.join(here, 'testCycleServiceStub.js')],
      [path.join(repo, 'src/services/secureExamService.js'), path.join(here, 'secureExamServiceStub.js')],
      [path.join(repo, 'src/platform/rewards/rewardsClient.js'), path.join(here, 'rewardsClientStub.js')],
    ]),
    react(),
  ],
});
