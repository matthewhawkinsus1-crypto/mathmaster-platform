// Module resolve hook (node:module register) for a node test of the live My
// Math Path runtime (src/services/pathSessionService.js). In node there is no
// `import.meta.env`, so src/config/executionMode.js resolves to the developer
// sandbox, which never calls a Cloud Function. Here it resolves to
// livePathRuntimeMode.mjs instead: a production build's mode, so the service
// calls its callables — through firestoreClientStub.mjs when
// firestoreClientIsolation.mjs is registered too.
const live = new URL('./livePathRuntimeMode.mjs', import.meta.url).href;
const EXECUTION_MODE_MODULE = /\/src\/config\/executionMode\.js$/;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL && EXECUTION_MODE_MODULE.test(new URL(specifier, context.parentURL).pathname)) {
    return { url: live, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
