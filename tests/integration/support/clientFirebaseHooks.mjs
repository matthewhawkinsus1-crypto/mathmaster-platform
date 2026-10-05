/*
 * Module resolution hook for the launch certification (see clientFirebase.mjs).
 *
 * The real client service imports `../../firebase.js`, which is the production
 * project's config. When the service is loaded as
 * `liveChallengeService.js?mmClient=<id>`, that one import resolves to the
 * emulator-only clientFirebase.mjs for the same device id instead. Every other
 * import resolves normally, and nothing outside such a URL is affected.
 *
 * In a thread with this hook, the production config never loads at all: any
 * other route to src/firebase.js (the service loaded without `?mmClient=`, or a
 * new client module that imports it) is refused, so a harness mistake fails the
 * suite instead of opening a connection to the production project. Register it
 * through registerClientFirebase.mjs, which also checks what actually loaded.
 */
const CLIENT_FIREBASE = new URL('./clientFirebase.mjs', import.meta.url).href;
const PRODUCTION_CONFIG = /\/src\/firebase\.js(?:[?#].*)?$/;

export async function resolve(specifier, context, nextResolve) {
  const parent = String(context?.parentURL || '');
  const device = /[?&]mmClient=([\w-]+)/.exec(parent)?.[1];
  if (device && specifier === '../../firebase.js' && parent.includes('/src/platform/liveChallenge/')) {
    return { url: `${CLIENT_FIREBASE}?mmClient=${device}`, shortCircuit: true };
  }
  const resolved = await nextResolve(specifier, context);
  if (PRODUCTION_CONFIG.test(String(resolved?.url || ''))) {
    throw new Error(`The production Firebase config (src/firebase.js) must never load in the emulator suites; it was imported from ${parent || 'the entry point'}.`);
  }
  return resolved;
}
