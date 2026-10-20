// LOAD A COMPONENT SO THAT CALLING IT RUNS ITS HOOKS ONCE (reactHookShim.mjs).
//
//   const loader = await startShallowLoader();
//   const Grader = (await loader.ssrLoadModule('/src/OrderedPairGrader.jsx')).default;
//   Grader({ question, onStateChange: (state) => …, … });   // the effect has run
//   await loader.close();
//
// Vite's SSR loader compiles the JSX, with 'react', its JSX runtimes and
// react-dom resolved to the shim, and the MathLive runtime (which needs a
// browser) to an empty module.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = path.join(here, 'reactHookShim.mjs');

export const startShallowLoader = async () => {
  const { createServer } = await import('vite');
  return createServer({
    configFile: false,
    root: path.resolve(here, '../../..'),
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: 'automatic' },
    resolve: {
      alias: [
        { find: /^react(?:\/jsx-(?:dev-)?runtime)?$/, replacement: SHIM },
        { find: /^react-dom(?:\/client)?$/, replacement: SHIM },
        { find: /^.*mathliveRuntime\.js$/, replacement: path.join(here, 'emptyModule.mjs') },
      ],
    },
  });
};
