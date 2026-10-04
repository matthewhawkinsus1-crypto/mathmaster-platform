/*
 * Module resolution hook for the launch certification (see clientFirebase.mjs).
 *
 * The real client service imports `../../firebase.js`, which is the production
 * project's config. When the service is loaded as
 * `liveChallengeService.js?mmClient=<id>`, that one import resolves to the
 * emulator-only clientFirebase.mjs for the same device id instead. Every other
 * import resolves normally, and nothing outside such a URL is affected.
 */
const CLIENT_FIREBASE = new URL('./clientFirebase.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const parent = String(context?.parentURL || '');
  const device = /[?&]mmClient=([\w-]+)/.exec(parent)?.[1];
  if (device && specifier === '../../firebase.js' && parent.includes('/src/platform/liveChallenge/')) {
    return { url: `${CLIENT_FIREBASE}?mmClient=${device}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
