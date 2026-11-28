// Module resolve hook (node:module register) for a test that runs the platform
// with mathjs's own simplify: functions/shared/algebra/simplifyFirstMatch.mjs
// resolves to a pass-through, so both mathjs instances (safeMath.mjs and the
// client's) are built with mathjs's own simplify, which makes every match of a
// rule. Everything else, simplifyCoreOnce.mjs included, loads unchanged.
const passThrough = new URL('./mathjsOwnSimplifyModule.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (resolved.url.endsWith('/functions/shared/algebra/simplifyFirstMatch.mjs')) return { url: passThrough, shortCircuit: true };
  return resolved;
}
