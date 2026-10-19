import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { swapModules } from './emulator/swapModules.mjs';

// classRewardsQa.mjs: firebase.js points at the Firestore emulator, and both
// reward clients' CALLABLES go to the harness's local server, which runs the
// real transactions (functions/lib/classRewardStore.js,
// functions/shared/rewardActionStore.mjs) against the same emulator. Every
// read is the real module's query. Swapped by resolved path (swapModules.mjs).
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

export default defineConfig({
  root: repo,
  plugins: [
    swapModules('mm-class-rewards-qa-swap', [
      [path.join(repo, 'src/firebase.js'), path.join(here, 'emulator/firebaseEmulator.js')],
      [path.join(repo, 'src/platform/rewards/rewardsClient.js'), path.join(here, 'emulator/rewardsClientStub.js')],
      [path.join(repo, 'src/platform/rewards/classRewardsClient.js'), path.join(here, 'classRewardsQaClientStub.js')],
    ]),
    react(),
  ],
});
