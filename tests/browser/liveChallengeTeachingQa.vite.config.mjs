import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// liveChallengeTeachingQa.mjs: firebase.js points at the emulator, and the Live
// Challenge service at liveChallengeTeachingQaService.js (the bridge service
// plus the reads it lacks). The bridge service and this harness's service
// import the REAL service themselves, so for those two importers the real
// module is left alone — otherwise the swap would import itself.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const realService = path.join(repo, 'src/platform/liveChallenge/liveChallengeService.js');
const harnessService = path.join(here, 'liveChallengeTeachingQaService.js');
const bridgeService = path.join(here, 'emulator/liveChallengeBridgeService.js');
const swaps = new Map([
  [path.join(repo, 'src/firebase.js'), path.join(here, 'emulator/firebaseEmulator.js')],
  [realService, harnessService],
]);
const keepReal = new Set([harnessService, bridgeService]);

export default defineConfig({
  root: repo,
  plugins: [
    {
      name: 'mm-teaching-qa-swap',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (!importer) return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (!resolved) return null;
        const replacement = swaps.get(path.resolve(resolved.id));
        if (!replacement || replacement === path.resolve(importer) || (resolved.id === realService && keepReal.has(path.resolve(importer)))) return resolved;
        return { ...resolved, id: replacement };
      },
    },
    react(),
  ],
});
