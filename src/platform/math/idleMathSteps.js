/*
 * THE CLIENT'S MATHJS PARSER, BUILT WHILE THE STUDENT READS.
 *
 * The client's mathjs instance (mathjs.js) builds each function the first time
 * it is used, and its parser is the costly one: about sixty functions (the
 * expression nodes, units, the number types and the arithmetic they rest on)
 * built in one go, 85 to 130 ms at 4x CPU, inside whatever parses through it
 * first. On Step Algebra that was the question's first render. The board no
 * longer parses through it to draw a side (Simplify's parts wait until
 * Simplify opens, and a term with no slash is no fraction), so it would be
 * the student's first Simplify, Rewrite tool or division instead.
 *
 * So it is built ahead of them, in the page's idle time, one function a step:
 * each step builds a single function whose own dependencies are built
 * already, a few milliseconds at 4x and never a long task. A step is taken
 * only while the browser reports idle time left and no input waiting, and the
 * student's first key or press stops the steps, so they never run inside an
 * interaction: what that interaction needs it builds itself, as before. A
 * function built early is the function its first use would have built.
 */
import { factories, math } from './mathjs.js';

// The resolver hands these to a factory itself; they are not functions to build.
const PROVIDED = new Set(['math', 'mathWithTransform', 'classes']);

/** The functions `target` is built from, each after its own dependencies, `target` last. */
export const buildOrder = (target, factoryList = Object.values(factories)) => {
  const byName = new Map();
  factoryList.forEach((factory) => {
    if (factory?.isFactory && !factory.meta?.isTransformFunction && !byName.has(factory.fn)) byName.set(factory.fn, factory);
  });
  const order = [];
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const factory = byName.get(name);
    if (!factory) return;
    (factory.dependencies || []).map((dependency) => dependency.replace(/^\?/, '')).filter((dependency) => !PROVIDED.has(dependency)).forEach(visit);
    order.push(name);
  };
  visit(target);
  return order;
};

// One step: the function named, built unless it is built already.
function buildFunction(name) {
  void math[name];
}

let parserSteps = null;
/** One step per function the client's parser is built from (each a no-op once it is built). */
export const clientParserSteps = () => {
  if (!parserSteps) parserSteps = Object.freeze(buildOrder('parse').map((name) => buildFunction.bind(null, name)));
  return parserSteps;
};

// A step is begun only with this much of the idle period left, and none
// after this much work in one idle period: the longest of the parser's steps
// (about 25 ms at 4x) then still ends well inside 50 ms, so no idle period is
// a long task.
export const IDLE_STEP_MS = 8;
export const IDLE_WORK_MS = 5;
// A step that needs a whole idle period (a board's Simplify parts, 20 to 45
// ms at 4x) is the only step of one, begun with at least this much of it
// left, the most a browser hands over at once being 50 ms.
export const IDLE_WHOLE_PERIOD_MS = 40;
const STUDENT_ACTIONS = ['pointerdown', 'keydown', 'touchstart'];

/** `step`, to be the only step of an idle period with IDLE_WHOLE_PERIOD_MS or more left. */
export const wholeIdlePeriod = (step) => Object.assign(() => step(), { wholeIdlePeriod: true });

/**
 * Take `steps` one at a time in the page's idle time, until they are done, the
 * student presses a key or a pointer, or the returned function is called.
 * Where the browser has no idle callback, one step per 50 ms timer.
 */
export const takeStepsWhenIdle = (steps, scope = globalThis) => {
  const queue = (steps || []).filter((step) => typeof step === 'function');
  if (!queue.length || typeof scope?.addEventListener !== 'function') return () => {};
  const idle = typeof scope.requestIdleCallback === 'function';
  let next = 0;
  let pending = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (pending !== null && idle) scope.cancelIdleCallback?.(pending);
    else if (pending !== null) scope.clearTimeout(pending);
    pending = null;
    STUDENT_ACTIONS.forEach((type) => scope.removeEventListener(type, stop, true));
  };
  const inputWaiting = () => scope.navigator?.scheduling?.isInputPending?.() === true;
  const now = () => scope.performance?.now?.() ?? Date.now();
  const room = (deadline, began, taken, step) => {
    if (!idle) return taken === 0;
    if (step.wholeIdlePeriod) return taken === 0 && deadline.timeRemaining() >= IDLE_WHOLE_PERIOD_MS;
    return deadline.timeRemaining() >= IDLE_STEP_MS && now() - began < IDLE_WORK_MS;
  };
  const take = (deadline) => {
    pending = null;
    if (stopped) return;
    const began = now();
    let taken = 0;
    while (next < queue.length && !inputWaiting() && room(deadline, began, taken, queue[next])) {
      const step = queue[next];
      next += 1;
      taken += 1;
      try {
        step();
      } catch {
        // Its first real use meets the same error, as it always did.
      }
      // It had the idle period to itself.
      if (step.wholeIdlePeriod) break;
    }
    if (next >= queue.length) stop();
    else pending = idle ? scope.requestIdleCallback(take) : scope.setTimeout(take, 50);
  };
  STUDENT_ACTIONS.forEach((type) => scope.addEventListener(type, stop, { capture: true, passive: true }));
  pending = idle ? scope.requestIdleCallback(take) : scope.setTimeout(take, 50);
  return stop;
};
