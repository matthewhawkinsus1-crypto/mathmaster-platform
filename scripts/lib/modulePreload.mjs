/*
 * PRELOAD ONLY WHAT IS NOT ALREADY THERE (PF01).
 *
 * For each import() in a chunk, Vite writes into that chunk the files the
 * imported chunk needs (its static imports, all the way down), and fetches
 * them side by side when the import() runs: a `<link rel="modulepreload">`
 * for code, a stylesheet link for CSS. The list is written whole. A screen
 * that App loads on demand still names react, Firestore and every other
 * chunk App could not run without: app/lazyScreens.js, which loads about
 * sixty screens, named 178 files a student had already downloaded, App 142
 * and the sign-in entry 15. With the rest, that was about 8 KB gzip of every
 * student's first load (scripts/check-first-load-budget.mjs). Naming them
 * again does nothing: the browser holds those modules before the import()
 * can run.
 *
 * `loadedBeforeChunks(bundle)` says, for each chunk, which files are certainly
 * fetched before any of its code runs:
 *
 *   - its own static imports, all the way down (the browser fetches a
 *     module's whole static graph before it runs any of it);
 *   - and what every chunk that can load it had: a chunk that imports it
 *     statically brings its own static imports in the same fetch, and one
 *     that imports it dynamically has run. An entry has only its own.
 *
 * `preloadOnlyWhatIsMissing()` gives Vite a plugin that keeps the finished
 * bundle and a `build.modulePreload.resolveDependencies` that drops those
 * files from each import()'s list, keeping the rest in order. Vite never
 * passes it a stylesheet (every CSS file stays in the list, and a screen's CSS
 * still arrives before the screen draws), and an HTML page's list (`hostType`
 * 'html') is returned whole. Nothing a page fetches or when changes: only
 * names of modules it already holds leave the lists. Were a file dropped that
 * was not there, the browser would still fetch it as the chunk's own import,
 * a step later; it is never missing.
 *
 * Plain JS: tests/platform/modulePreload.test.mjs drives it with a miniature
 * bundle.
 */

const isChunk = (item) => item?.type === 'chunk';

/** fileName → Set of files fetched before that chunk's code runs (the chunk's own static closure included). */
export const loadedBeforeChunks = (bundle = {}) => {
  const chunks = Object.values(bundle).filter(isChunk);
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const closures = new Map();
  const staticClosure = (fileName) => {
    if (closures.has(fileName)) return closures.get(fileName);
    const seen = new Set();
    const stack = [fileName];
    while (stack.length) {
      const name = stack.pop();
      if (seen.has(name) || !byName.has(name)) continue;
      seen.add(name);
      stack.push(...(byName.get(name).imports || []));
    }
    closures.set(fileName, seen);
    return seen;
  };
  const parents = new Map(chunks.map((chunk) => [chunk.fileName, []]));
  chunks.forEach((chunk) => [...(chunk.imports || []), ...(chunk.dynamicImports || [])]
    .forEach((name) => parents.get(name)?.push(chunk.fileName)));
  // Reached from an entry through imports of either kind. Anything else (an
  // entry, or a chunk nothing here loads) is credited with its own closure only.
  const reached = new Set();
  const queue = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName);
  while (queue.length) {
    const name = queue.shift();
    if (reached.has(name)) continue;
    reached.add(name);
    const chunk = byName.get(name);
    queue.push(...(chunk.imports || []), ...(chunk.dynamicImports || []));
  }
  const counted = (chunk) => reached.has(chunk.fileName) && !chunk.isEntry;
  // Start every counted chunk from everything and narrow until nothing changes:
  // what is loaded before a chunk is what is loaded before EVERY way to it.
  const everything = [...byName.keys()];
  const loaded = new Map(chunks.map((chunk) => [
    chunk.fileName,
    counted(chunk) ? new Set(everything) : new Set(staticClosure(chunk.fileName)),
  ]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const chunk of chunks) {
      if (!counted(chunk)) continue;
      let common = null;
      for (const parent of parents.get(chunk.fileName)) {
        const before = loaded.get(parent);
        const own = staticClosure(parent);
        const through = (name) => before.has(name) || own.has(name);
        common = new Set((common ? [...common] : everything).filter(through));
      }
      const next = new Set([...staticClosure(chunk.fileName), ...(common || [])]);
      if (next.size !== loaded.get(chunk.fileName).size) {
        loaded.set(chunk.fileName, next);
        changed = true;
      }
    }
  }
  return loaded;
};

/** An import()'s preload list without the files its host chunk already has. */
export const withoutLoaded = (deps = [], loaded = null) => (loaded ? deps.filter((dep) => !loaded.has(dep)) : deps);

export const preloadOnlyWhatIsMissing = () => {
  let bundle = null;
  let loadedBefore = null;
  return {
    plugin: {
      name: 'mathmaster:preload-only-what-is-missing',
      apply: 'build',
      buildStart() {
        bundle = null;
        loadedBefore = null;
      },
      // First, so the bundle is kept before Vite writes the lists (its import
      // analysis rewrites them in its own generateBundle, after this one).
      generateBundle: {
        order: 'pre',
        handler(_options, output) {
          bundle = output;
          loadedBefore = null;
        },
      },
    },
    resolveDependencies(_fileName, deps, { hostId, hostType } = {}) {
      if (hostType !== 'js' || !bundle) return deps;
      // Worked out once, on the finished bundle (pure-CSS chunks already removed).
      loadedBefore ||= loadedBeforeChunks(bundle);
      return withoutLoaded(deps, loadedBefore.get(hostId) || null);
    },
  };
};
