import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');

// A string alias would not work here. Vite matches those against the import
// SPECIFIER, and every import in this graph is relative ('../../firebase.js'),
// so an absolute `find` never fires and the harness would silently load the
// real modules — pointing a browser at production while appearing to pass.
//
// This resolves each specifier first and compares absolute paths, so it catches
// the module however it was reached. The `importer === replacement` guard is
// what lets the stub import the real service it is standing in for, instead of
// resolving to itself forever.
const swapFile = (targetAbs, replacementAbs) => ({
  name: `mm-harness-swap:${path.basename(targetAbs)}`,
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
      path.join(here, 'liveChallengeServiceStub.js'),
    ),
    react(),
  ],
});
