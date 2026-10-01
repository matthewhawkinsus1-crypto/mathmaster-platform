import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The bridge harness (graphFeatureRushGame.mjs): firebase.js points at the
// emulator and the Live Challenge service posts every callable to the local
// bridge that runs the real Cloud Functions code. See vite.config.mjs for why
// the swap compares resolved paths rather than import specifiers.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');

const swapFile = (targetAbs, replacementAbs) => ({
  name: `mm-bridge-swap:${path.basename(targetAbs)}`,
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer || importer === replacementAbs) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    return resolved && resolved.id === targetAbs ? replacementAbs : null;
  },
});

export default defineConfig({
  root: repo,
  plugins: [
    swapFile(path.join(repo, 'src/firebase.js'), path.join(here, 'firebaseEmulator.js')),
    swapFile(
      path.join(repo, 'src/platform/liveChallenge/liveChallengeService.js'),
      path.join(here, 'liveChallengeBridgeService.js'),
    ),
    react(),
  ],
});
