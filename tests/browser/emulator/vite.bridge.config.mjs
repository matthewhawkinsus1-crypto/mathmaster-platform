import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { swapModules } from './swapModules.mjs';

// The bridge harness (graphFeatureRushGame.mjs): firebase.js points at the
// emulator and the Live Challenge service posts every callable to the local
// bridge that runs the real Cloud Functions code. See swapModules.mjs for why
// the swap compares resolved paths rather than import specifiers.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');

export default defineConfig({
  root: repo,
  plugins: [
    swapModules('mm-bridge-swap', [
      [path.join(repo, 'src/firebase.js'), path.join(here, 'firebaseEmulator.js')],
      [path.join(repo, 'src/platform/liveChallenge/liveChallengeService.js'), path.join(here, 'liveChallengeBridgeService.js')],
    ]),
    react(),
  ],
});
