import path from 'node:path';

/*
 * REPLACE A MODULE HOWEVER IT IS REACHED — WITH ONE RESOLUTION PER IMPORT.
 *
 * A string alias would not work here. Vite matches those against the import
 * SPECIFIER, and every import in this graph is relative ('../../firebase.js'),
 * so an absolute `find` never fires and the harness would silently load the
 * real modules — pointing a browser at production while appearing to pass.
 * So each specifier is resolved first and the absolute path compared.
 *
 * ONE plugin for every pair, and it RETURNS the resolution it made. The
 * harness configs used to have one plugin per swapped module, each resolving
 * with `skipSelf` and then returning null. Returning null sends Vite on to the
 * next plugin, which resolves again — and every nested resolve re-entered the
 * swap plugins it had not yet skipped, so k chained plugins made
 * f(k) = k·f(k−1)+1 resolutions per import: 326 for the five in
 * vite.config.mjs. Scanning the draft-persistence harness took 254,801
 * resolutions and 12.2 s, against 757 and 1.1 s with this plugin; scanning
 * every harness page (Vite's default entries) took 36 s alone and 82–106 s
 * beside a loading page. That scan, not Vite, was the cold start PR #407 gave
 * a 180 s page budget to.
 *
 * `replacement !== importer` is what lets a stub import the real module it is
 * standing in for, instead of resolving to itself forever.
 *
 * tests/platform/harnessModuleSwap.test.mjs drives this through Vite's real
 * plugin container: the swap must fire for a relative specifier, and resolving
 * an import must cost exactly one resolution.
 */
export const swapModules = (name, pairs) => {
  const replacementFor = new Map(pairs.map(([target, replacement]) => [path.resolve(target), path.resolve(replacement)]));
  return {
    name,
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const replacement = replacementFor.get(resolved.id);
      return replacement && replacement !== importer ? replacement : resolved;
    },
  };
};
