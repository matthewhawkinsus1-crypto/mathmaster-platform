// Module resolve hook (node:module register) for a test that runs the platform
// as it ran before issue #559's fix: functions/shared/algebra/simplifyCoreOnce.mjs
// resolves to a pass-through, so both mathjs instances (safeMath.mjs and the
// client's) are built with mathjs's own simplifyCore. Everything else loads
// unchanged.
const passThrough = new URL('./mathjsOwnSimplifyCoreModule.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (resolved.url.endsWith('/functions/shared/algebra/simplifyCoreOnce.mjs')) return { url: passThrough, shortCircuit: true };
  return resolved;
}
