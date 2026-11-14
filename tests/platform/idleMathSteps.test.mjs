// THE CLIENT'S MATHJS PARSER IS BUILT IN IDLE STEPS, NEVER INSIDE A KEY OR A PRESS.
//
// Step Algebra's first render built the client's mathjs parser (about sixty
// functions, 85-130 ms at 4x CPU) because Simplify's parts and the fraction
// tools' checks parsed through it. They no longer do on the first frame, so
// src/platform/math/idleMathSteps.js builds the parser while the student
// reads: one function a step, in idle time only, stopped by the student's
// first key or press. These tests hold the order (each function after what it
// is built from, and exactly what a first parse would build), and the steps'
// manners: idle time only, never with input waiting, and stopped by a key, a
// press or the board leaving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';
import { IDLE_STEP_MS, IDLE_WORK_MS, buildOrder, clientParserSteps, takeStepsWhenIdle } from '../../src/platform/math/idleMathSteps.js';
import { math } from '../../src/platform/math/mathjs.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// A fresh instance whose factories record what they build, in order.
const countedInstance = () => {
  const built = [];
  const factories = Object.fromEntries(Object.entries(all).map(([key, factory]) => {
    const counted = (scope) => {
      built.push(factory.fn);
      return factory(scope);
    };
    return [key, Object.assign(counted, { isFactory: true, fn: factory.fn, dependencies: factory.dependencies, meta: factory.meta })];
  }));
  return { instance: create(factories), built, factories: Object.values(factories) };
};

test('the parser is built after everything it is built from, and from nothing else', () => {
  const order = buildOrder('parse');
  assert.equal(order.at(-1), 'parse');
  assert.equal(new Set(order).size, order.length, 'each function once');
  const byName = new Map(Object.values(all).filter((factory) => !factory.meta?.isTransformFunction).map((factory) => [factory.fn, factory]));
  order.forEach((name, index) => {
    for (const dependency of byName.get(name).dependencies.map((entry) => entry.replace(/^\?/, ''))) {
      if (!byName.has(dependency)) continue;
      assert.ok(order.indexOf(dependency) >= 0 && order.indexOf(dependency) < index, `${name} is built after ${dependency}`);
    }
  });
  // What a first parse builds on a fresh instance is exactly the steps' list.
  const first = countedInstance();
  first.instance.parse('3 x - 5');
  assert.deepEqual([...new Set(first.built)].sort(), [...order].sort());
  // So for any function, one the expression parser also has a transform of
  // (and, diff) included: the order is the function's, as its first use builds it.
  for (const target of ['and', 'diff', 'simplify']) {
    const fresh = countedInstance();
    void fresh.instance[target];
    assert.deepEqual([...new Set(fresh.built)].sort(), [...buildOrder(target)].sort(), target);
  }
});

test('each step builds one function, and the parse after them builds nothing', () => {
  const { instance, built, factories } = countedInstance();
  const order = buildOrder('parse', factories);
  order.forEach((name) => {
    const before = built.length;
    void instance[name];
    assert.equal(built.length - before, 1, `the step for ${name} builds ${name} alone`);
    assert.equal(built.at(-1), name);
  });
  const before = built.length;
  assert.equal(instance.parse('(3 x - 5) / 2').toString(), '(3 x - 5) / 2');
  assert.equal(built.length, before, 'the parser was already built');
  // The client's own steps: one per function, and the parser answers as before.
  const steps = clientParserSteps();
  assert.equal(steps.length, order.length);
  steps.forEach((step) => step());
  assert.equal(math.parse('3x - 5').toString(), '3 x - 5');
});

// A page with an idle callback, a clock, input that may be waiting, and listeners.
const fakePage = ({ idle = true } = {}) => {
  const queue = [];
  const timers = [];
  const listeners = new Map();
  const page = {
    remaining: 50,
    clock: 0,
    performance: { now: () => page.clock },
    // A step that takes `ms`: the clock moves and the idle period shrinks.
    spend(ms) { page.clock += ms; page.remaining -= ms; },
    inputWaiting: false,
    navigator: { scheduling: { isInputPending: () => page.inputWaiting } },
    addEventListener: (type, listener, options) => listeners.set(type, { listener, options }),
    removeEventListener: (type, listener, capture) => {
      if (listeners.get(type)?.listener === listener && capture === true) listeners.delete(type);
    },
    setTimeout: (work) => timers.push(work),
    clearTimeout: () => timers.pop(),
    // Run the next idle period: the browser hands over `remaining` ms.
    idle() {
      const work = queue.shift();
      work?.({ timeRemaining: () => page.remaining, didTimeout: false });
      return Boolean(work);
    },
    timer() {
      const work = timers.shift();
      work?.();
      return Boolean(work);
    },
    act(type) { listeners.get(type)?.listener(); },
    listeners,
    queue,
    timers,
  };
  if (idle) {
    page.requestIdleCallback = (work) => queue.push(work);
    page.cancelIdleCallback = () => queue.pop();
  }
  return page;
};

const recordedSteps = (count, taken, { cost = () => {}, failing = -1 } = {}) => Array.from({ length: count }, (_, index) => () => {
  taken.push(index);
  cost(index);
  if (index === failing) throw new Error('this function cannot be built');
});

test('a step is taken only in idle time with time left and no input waiting, a little at a time', () => {
  const page = fakePage();
  const taken = [];
  // Each step takes 2 ms: an idle period does IDLE_WORK_MS of them, then waits for the next.
  takeStepsWhenIdle(recordedSteps(8, taken, { cost: () => page.spend(2) }), page);
  assert.deepEqual(taken, [], 'nothing runs before the browser is idle');
  page.idle();
  assert.deepEqual(taken, [0, 1, 2], `no step begins after ${IDLE_WORK_MS} ms of work in one idle period`);
  page.remaining = IDLE_STEP_MS - 1;
  page.idle();
  assert.deepEqual(taken, [0, 1, 2], `none with less than ${IDLE_STEP_MS} ms of the idle period left`);
  page.remaining = 50;
  page.inputWaiting = true;
  page.idle();
  assert.deepEqual(taken, [0, 1, 2], 'none while input is waiting');
  page.inputWaiting = false;
  page.remaining = 50;
  page.idle();
  page.remaining = 50;
  page.idle();
  assert.deepEqual(taken, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(page.queue.length, 0, 'done: nothing more is asked of the browser');
  assert.equal(page.listeners.size, 0, 'and it no longer listens for the student');
});

test('a long step is the only step of its idle period', () => {
  const page = fakePage();
  const taken = [];
  takeStepsWhenIdle(recordedSteps(3, taken, { cost: (index) => page.spend(index === 0 ? 25 : 1) }), page);
  page.idle();
  assert.deepEqual(taken, [0]);
  page.remaining = 50;
  page.idle();
  assert.deepEqual(taken, [0, 1, 2]);
});

for (const action of ['pointerdown', 'keydown', 'touchstart']) {
  test(`the student's first ${action} stops the steps for good`, () => {
    const page = fakePage();
    const taken = [];
    takeStepsWhenIdle(recordedSteps(6, taken, { cost: () => page.spend(2) }), page);
    assert.equal(page.listeners.get(action)?.options?.capture, true, 'heard before anything on the page handles it');
    page.idle();
    assert.deepEqual(taken, [0, 1, 2]);
    page.act(action);
    assert.equal(page.queue.length, 0, 'the next idle period is no longer asked for');
    page.remaining = 50;
    while (page.idle());
    assert.deepEqual(taken, [0, 1, 2]);
    assert.equal(page.listeners.size, 0);
  });
}

test('leaving stops the steps, and a step that fails does not stop the others', () => {
  const page = fakePage();
  const taken = [];
  const stop = takeStepsWhenIdle(recordedSteps(5, taken, { failing: 1 }), page);
  page.idle();
  assert.deepEqual(taken, [0, 1, 2, 3, 4], 'a failing step is left to its first use');
  const again = [];
  const stopAgain = takeStepsWhenIdle(recordedSteps(3, again), page);
  stopAgain();
  while (page.idle());
  assert.deepEqual(again, [], 'stopped before the first idle period');
  assert.equal(typeof stop, 'function');
  assert.equal(page.listeners.size, 0);
});

test('without an idle callback, one step a timer', () => {
  const page = fakePage({ idle: false });
  const taken = [];
  takeStepsWhenIdle(recordedSteps(3, taken), page);
  page.timer();
  assert.deepEqual(taken, [0]);
  page.inputWaiting = true;
  page.timer();
  assert.deepEqual(taken, [0], 'none while input is waiting');
  page.inputWaiting = false;
  page.timer();
  page.timer();
  assert.deepEqual(taken, [0, 1, 2]);
  assert.equal(page.timers.length, 0);
});

// Both Step Algebra workspaces: the equation board, and the relation workspace
// that radical, absolute-value and inequality questions open.
for (const file of ['src/StepByStepAlgebraCore.jsx', 'src/MultiRelationAlgebraCore.jsx']) {
  test(`${file} reads Simplify's parts only while Simplify is open, and builds the parser in idle steps`, () => {
    const core = executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
    assert.match(core, /const simplifyOpen = Boolean\(simplifyTool\);/);
    assert.doesNotMatch(core, /\bdetectSimplifyParts\(/, 'parts worked out without the kept reading');
    const parts = region(core, 'const simplifyParts = useMemo(() => {', '}, [simplifyRegions, simplifyOpen]);', 'Simplify\'s parts');
    assert.match(parts, /if \(!simplifyOpen\) return NO_SIMPLIFY_PARTS;/);
    assert.match(parts, /simplifyPartsFor\(simplifyRegions\)/);
    // After the render, in an effect whose cleanup stops the steps.
    const steps = region(core, 'useEffect(() => takeStepsWhenIdle([', '), [simplifyRegions]);', 'the idle steps');
    assert.match(steps, /\.\.\.clientParserSteps\(\),\s*\(\) => simplifyPartsFor\(simplifyRegions\),\s*\]$/);
  });
}

test('the fraction tools read a term with no slash as no fraction, without parsing it', () => {
  // The fraction tools read a term without a slash as no fraction, unparsed.
  for (const file of ['src/algebraFractionSplitModel.js', 'src/algebraFractionReductionModel.js']) {
    const source = executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
    assert.match(source, /const text = String\(termMagnitudeText\);\s*if \(!text\.includes\('\/'\)\) return null;\s*const node = unwrap\(parse\(text\)\);/, file);
  }
});
