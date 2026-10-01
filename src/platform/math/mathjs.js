/*
 * THE ONE MATHJS INSTANCE THE CLIENT USES, BUILT A FUNCTION AT A TIME.
 *
 * `import { parse } from 'mathjs'` evaluates mathjs's prebuilt default
 * instance, which constructs every one of its several hundred functions the
 * moment the module loads. App.jsx reaches mathjs through nine imports, so
 * every sign-in paid for all of them before the sign-in screen appeared:
 * about 0.7 s of main thread on a 4x-throttled CPU, a third of the time to
 * that screen, for functions most sessions never call.
 *
 * `create(all)` is mathjs's own constructor for the same instance: the same
 * factories and the same default configuration, with each function built the
 * first time it is used. Only the functions a session uses are ever built.
 * The prebuilt instance is never imported, so the build leaves it out
 * (mathjs declares no side effects).
 *
 * Every client module imports mathjs from here, never from 'mathjs'.
 * tests/platform/mathjsInstance.test.mjs checks that, and that this instance
 * answers exactly as mathjs's default one does.
 */
import { all, create } from 'mathjs';

export const math = create(all);

// The functions the client calls, forwarded so that importing this module
// builds none of them. Node classes are used as `math.OperatorNode`.
export const parse = (...args) => math.parse(...args);
export const evaluate = (...args) => math.evaluate(...args);
export const simplify = (...args) => math.simplify(...args);
export const compile = (...args) => math.compile(...args);
export const derivative = (...args) => math.derivative(...args);
export const fraction = (...args) => math.fraction(...args);
