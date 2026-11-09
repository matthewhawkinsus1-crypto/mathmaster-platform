// LOAD A COMPONENT THAT KEEPS ITS HOOKS FROM RENDER TO RENDER (rerenderingHookShim.mjs).
//
//   const loader = await startRerenderingLoader();
//   const Grader = (await loader.ssrLoadModule('/src/MultiAnswerGrader.jsx')).default;
//   const { mount } = await loader.ssrLoadModule(RERENDERING_SHIM);
//   const view = mount(Grader, { question, onStateChange, … });
//   findElement(view.output, …).props.onChange('2');   // renders again, effects run
//   await loader.close();
//
// As shallowComponent.mjs: Vite's SSR loader compiles the JSX, with 'react',
// its JSX runtimes and react-dom resolved to the shim, and the MathLive runtime
// (which needs a browser) to an empty module. `mount` must come from the same
// loader, so the component and the test share one shim.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RERENDERING_SHIM = path.join(here, 'rerenderingHookShim.mjs');

export const startRerenderingLoader = async () => {
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
        { find: /^react(?:\/jsx-(?:dev-)?runtime)?$/, replacement: RERENDERING_SHIM },
        { find: /^react-dom(?:\/client)?$/, replacement: RERENDERING_SHIM },
        { find: /^.*mathliveRuntime\.js$/, replacement: path.join(here, 'emptyModule.mjs') },
      ],
    },
  });
};

/** The first element in a rendered tree (plain { type, props } objects) that `match` accepts. */
export const findElement = (node, match) => {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return null;
  }
  if ('props' in node && match(node)) return node;
  return findElement(node.props?.children, match);
};
