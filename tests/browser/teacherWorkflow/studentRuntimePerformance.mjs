// WHAT A STUDENT'S INTERACTIONS COST, MEASURED ON A PRODUCTION BUILD.
//
//   OUT_DIR=dist-harness/runtime npx vite build --config tests/browser/teacherWorkflow/vite.production.config.mjs
//   node scripts/serve-static-spa.mjs dist-harness/runtime 5303 &
//   PERF_ORIGIN=http://127.0.0.1:5303 PERF_DIST=dist-harness/runtime \
//     node tests/browser/teacherWorkflow/studentRuntimePerformance.mjs
//
//   DEVICES=chromebook,phone (default both) · CPU=4 (CDP throttling rate) ·
//   RUNS=1 · MODES=timing,counts (also profile, trace) · OUT=<file.json> ·
//   PAGE=<the harness page's path> (an older build's harness) · LABEL=<text>,
//   copied into the output so runs can be told apart · the same
//   PLAYWRIGHT_MODULE / CHROMIUM_PATH as journeys.mjs.
//
// The flow docs/handoffs/PERFORMANCE_CERTIFICATION.md certifies, as a student
// (910004, Algebra II Period 3) on today's lesson made of one question of each
// kind (`?questions=runtime`, studentRuntimeLesson.js), with server ingestion
// (`&server=1`): Home at rest, opening the assignment, a basic answer (focus,
// a key, Submit), Next, a choice (pick, Submit), Next, a typed expression
// (focus, four keys, Submit), Next, a Step Algebra question (Work View opened,
// closed, opened again, closed), a hint, Read aloud, and going offline and
// back. Chromebook 1366x768 and phone 390x844 (touch: its keys are the
// number keypad's), each at 4x CPU.
//
// Each interaction's target is found before its window opens and pressed by
// raw input, and readiness is polled with querySelector, so no selector
// engine runs inside a measured window. Per interaction:
//
//   timing   Event Timing duration (durationThreshold 16; null under 16 ms),
//            time until the next screen is there (readyMs), long tasks (over
//            50 ms) and the scripts of long animation frames, and what
//            window.__MATHMASTER_PERFORMANCE__ recorded (react_render_count:
//            QuestionEngine, Universal Work View and ToolShell renders)
//   counts   timing's, plus React commits and component renders through the
//            DevTools hook (production builds report commits to it), named
//            from the build's source maps when PERF_DIST is given
//   profile  a CPU profile of each window, read back to source names
//            (PERF_DIST; ../support/cpuProfileNames.mjs)
//   trace    layouts and style recalculations, and which script forced them:
//            each forced one in order (layout.forced), with its stack, the
//            first of the platform's frames on it, and the writes that made
//            it necessary (TRACE_DIR=<dir> also saves each window's trace,
//            for DevTools' Performance panel). A trace run fails when opening
//            the assignment, a Next or opening Work View forces more layouts,
//            not counting MathLive's own, than FORCED_LAYOUT_BUDGET allows
//
// At the end, App's 30-second clock on the Step Algebra question, fired on
// demand (clock-tick), and again with the page's clock moved past the end of
// the class period (clock-tick-class-ends, whose hint panel then offers a
// question for the teacher instead of a raised hand).
//
// Exit code 1 when the flow cannot be finished, or when a counts run breaks a
// budget that does not depend on the machine: after the first key, a key typed
// into an answer box draws QuestionEngine once and at most 60 components; a
// Submit draws it at most 4 times and 260 components, a Next 5 and 320; a
// clock tick that changes nothing draws it not at all, and the one that ends
// the class draws it again.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { componentNamer, createProfileReader } from '../support/cpuProfileNames.mjs';
import { countWhere, createCallCounter } from '../support/functionCallCounts.mjs';
// App's own renders and its render time, and their budgets.
import { createAppRenderMeasures } from '../support/appRenderMeasures.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.PERF_ORIGIN || 'http://127.0.0.1:5303';
const PAGE = process.env.PAGE || '/tests/browser/teacherWorkflow/index.html';
const DIST = process.env.PERF_DIST || null;
const DEVICES = (process.env.DEVICES || 'chromebook,phone').split(',').map((name) => name.trim()).filter(Boolean);
const MODES = (process.env.MODES || 'timing,counts').split(',').map((name) => name.trim()).filter(Boolean);
const RUNS = Math.max(1, Number(process.env.RUNS || 1));
const CPU = Number(process.env.CPU || 4);
const LABEL = process.env.LABEL || '';
const STUDENT = '910004';
const KEY_BUDGET = { questionEngineRenders: 1, componentRenders: 60 };
// App renders seven to thirteen times on a Submit or a Next. QuestionEngine is
// memoised and App keeps its props the same until what they mean changes, so
// the question is drawn for its own state and its record (2-3 times on a
// Submit, 3-4 with a tool on a Next), not once per App render: 7-11 times and
// 350-494 components before. Room is left for one more draw (a timer of the
// app's own that lands in the window).
const SUBMIT_BUDGET = { questionEngineRenders: 4, componentRenders: 260 };
const NEXT_BUDGET = { questionEngineRenders: 5, componentRenders: 320 };

const DEVICE_OPTIONS = {
  chromebook: { viewport: { width: 1366, height: 768 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
};

// ------------------------------------------------------------------ the page
// Runs before the app. `withHook`: a DevTools hook that counts, for every
// commit, the components that rendered in it (React's own PerformedWork flag,
// read the way React DevTools reads it).
const instrument = (withHook) => {
  const perf = { events: [], longtasks: [], loafs: [], commits: 0, renders: 0, byType: new Map() };
  Object.defineProperty(window, '__studentRuntimePerf', { value: perf, configurable: true });
  const describe = (node) => (node && node.nodeType === 1 ? `${node.tagName.toLowerCase()}${node.getAttribute('aria-label') ? ` "${node.getAttribute('aria-label').slice(0, 40)}"` : ''}` : null);
  const observe = (type, options, sink) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(sink)).observe({ type, buffered: true, ...options });
    } catch { /* this browser does not report it */ }
  };
  observe('event', { durationThreshold: 16 }, (entry) => perf.events.push({
    name: entry.name, startTime: entry.startTime, duration: entry.duration, interactionId: entry.interactionId || 0, target: describe(entry.target),
  }));
  observe('longtask', {}, (entry) => perf.longtasks.push({ startTime: entry.startTime, duration: entry.duration }));
  observe('long-animation-frame', {}, (entry) => perf.loafs.push({
    startTime: entry.startTime,
    duration: entry.duration,
    scripts: entry.scripts.map((script) => ({
      duration: script.duration, invoker: script.invoker, sourceURL: script.sourceURL,
      sourceFunctionName: script.sourceFunctionName, forcedStyleAndLayoutDuration: script.forcedStyleAndLayoutDuration,
    })),
  }));
  perf.has = (selector, pattern) => {
    const re = pattern ? new RegExp(pattern) : null;
    return [...document.querySelectorAll(selector)].some((element) => !re || re.test(element.textContent || ''));
  };
  // APP'S 30-SECOND CLOCK, ON DEMAND. App ticks `setInterval(() =>
  // setNow(Date.now()), 30000)`; `tick()` runs that callback now (the one
  // 30-second interval that only reads the time: the activity flush is
  // another), so a tick is measured without a 30-second wait. `advance(ms)`
  // moves this page's clock on (over the school clock), for a tick that
  // finds something changed. Timers keep the browser's own clock.
  const ShiftedDate = Date;
  let advancedMs = 0;
  const nowMs = () => ShiftedDate.now() + advancedMs;
  globalThis.Date = new Proxy(ShiftedDate, {
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [nowMs()], newTarget),
    apply: () => new ShiftedDate(nowMs()).toString(),
    get: (target, key) => (key === 'now' ? nowMs : Reflect.get(target, key)),
  });
  const thirtySecondTimers = [];
  const setInterval = window.setInterval.bind(window);
  window.setInterval = (callback, delay, ...rest) => {
    if (Number(delay) === 30_000 && typeof callback === 'function') thirtySecondTimers.push(callback);
    return setInterval(callback, delay, ...rest);
  };
  const appClocks = () => thirtySecondTimers.filter((callback) => /^\(\)\s*=>\s*[\w$]+\(Date\.now\(\)\)$/.test(Function.prototype.toString.call(callback)));
  perf.advance = (ms) => { advancedMs += ms; };
  perf.tick = () => {
    const clocks = appClocks();
    clocks.forEach((callback) => callback());
    return clocks.length;
  };
  if (!withHook) return;
  const COMPONENTS = new Set([0, 1, 11, 15]); // function, class, forwardRef, simple memo
  const PERFORMED_WORK = 1;
  const walk = (root, previous) => {
    const stack = [root, previous];
    while (stack.length) {
      const prev = stack.pop();
      const next = stack.pop();
      if (COMPONENTS.has(next.tag) && (!prev || (next.flags & PERFORMED_WORK))) {
        const type = next.tag === 11 ? (next.type?.render || next.type) : next.type;
        perf.renders += 1;
        perf.byType.set(type, (perf.byType.get(type) || 0) + 1);
      }
      // A subtree React bailed out of keeps its children: nothing in it rendered.
      if (prev && next.child === prev.child) continue;
      for (let child = next.child; child; child = child.sibling) stack.push(child, prev ? child.alternate : null);
    }
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(renderer) { this.renderers.set(this.renderers.size + 1, renderer); return this.renderers.size; },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      perf.commits += 1;
      walk(root.current, root.current.alternate);
    },
  };
};

// ------------------------------------------------------------------ helpers
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const nameComponent = componentNamer(DIST);
const profileReader = DIST ? createProfileReader(DIST) : null;
const findings = [];
const appMeasures = createAppRenderMeasures(DIST);

// ------------------------------------------------- Step Algebra's first render
// What Next to the Step Algebra question (3x − 5 = 10) asks of mathjs until
// the question is on screen, in a counts run with PERF_DIST: how many times it
// simplifies (each run of mathjs's simplify rebuilds its rules, about 30 ms at
// 4x on a Chromebook), how many expressions MathMaster's code parses through
// either instance (functions/shared/algebra/safeMath.mjs, src/platform/math/
// mathjs.js), and how many of those go through the client's instance, whose
// first parse builds its parser (85-130 ms at 4x). Counted with precise
// coverage (../support/functionCallCounts.mjs), so the numbers do not depend
// on the machine. The board reads whether the equation is solved (2
// simplifies) and whether the left side's opposite terms cancel (1), and the
// shared grader decides the same question (2): five. Before the board was set up
// once, read its equation once and left Simplify's parts and the client's
// parser to idle time, the first render ran 10, parsed 264 expressions and
// 28 of them through the client's instance. What the window does after the
// question is on screen (the idle steps) is reported beside it.
const STEP_ALGEBRA_FIRST_RENDER_BUDGET = { simplify: 5, parse: 100, clientParse: 0 };
const MATHJS_CALLS = {
  simplify: [{ source: /node_modules\/mathjs\/lib\/esm\/function\/algebra\/simplify\.js$/, text: /^function _simplify\(/ }],
  parse: [
    { source: /^functions\/shared\/algebra\/safeMath\.mjs$/, text: /^export const parse = / },
    { source: /^src\/platform\/math\/mathjs\.js$/, text: /^export const parse = / },
  ],
  clientParse: [{ source: /^src\/platform\/math\/mathjs\.js$/, text: /^export const parse = / }],
};
const mathjsCallsIn = (ran) => Object.fromEntries(Object.entries(MATHJS_CALLS)
  .map(([name, functions]) => [name, functions.reduce((sum, where) => sum + countWhere(ran, where), 0)]));
// ------------------------------------------------------------ trace's stacks
// A trace's stack frame, "name · file:line" through the build's source maps
// (its line and column count from 1, a CPU profile's from 0).
const traceFrameName = (frame) => (profileReader
  ? profileReader.frameName({ url: frame.url, lineNumber: Math.max(0, frame.lineNumber - 1), columnNumber: Math.max(0, frame.columnNumber - 1), functionName: frame.functionName })
  : `${frame.functionName || '(anonymous)'} ${String(frame.url || '').split('/').pop()}:${frame.lineNumber}`);
const PLATFORM_FRAME = / · src\//;
const platformFrame = (stack) => stack.find((frame) => PLATFORM_FRAME.test(frame)) || null;
// Each forced layout and style recalculation in a window, in order: its stack,
// the first of the platform's own frames on it (a read of MathLive's or
// React's has the platform code that called it further down, or none), and
// the writes that made it necessary: what first dirtied layout (style, for a
// style recalculation) since the pass before it, each by its platform frame.
const forcedReads = ({ layouts, styles, onThread }) => {
  const passes = [...layouts, ...styles].sort((a, b) => a.ts - b.ts);
  const writes = onThread.filter((event) => /^(InvalidateLayout|ScheduleStyleRecalculation)$/.test(event.name) && event.args?.data?.stackTrace?.length);
  return passes.filter((event) => event.args?.beginData?.stackTrace?.length).map((event) => {
    const stack = event.args.beginData.stackTrace.map(traceFrameName);
    const previous = passes.filter((pass) => pass.name === event.name && pass.ts + (pass.dur || 0) <= event.ts).pop();
    const since = previous ? previous.ts + (previous.dur || 0) : -Infinity;
    const dirtiedBy = writes
      .filter((write) => write.ts >= since && write.ts <= event.ts && write.name === (event.name === 'Layout' ? 'InvalidateLayout' : 'ScheduleStyleRecalculation'))
      .map((write) => {
        const names = write.args.data.stackTrace.map(traceFrameName);
        return platformFrame(names) || names[0];
      });
    return {
      kind: event.name === 'Layout' ? 'layout' : 'style',
      ms: Math.round((event.dur || 0) / 100) / 10,
      platform: platformFrame(stack),
      stack: stack.slice(0, 8),
      after: [...new Set(dirtiedBy)].slice(0, 4),
    };
  });
};
// TRACE_DIR=<dir>: each window's whole trace is written there too, a file
// DevTools' Performance panel opens.
const TRACE_DIR = process.env.TRACE_DIR || null;
if (TRACE_DIR) mkdirSync(TRACE_DIR, { recursive: true });
let traceWindows = 0;

const runFlow = async (browser, device, mode) => {
  const context = await newSchoolContext(browser, DEVICE_OPTIONS[device]);
  await context.addInitScript(instrument, mode === 'counts');
  const page = await context.newPage();
  const problems = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // The harness has no fake for this callable; the app retries it later.
    if (/reconcileAssignmentActivityProjection|Failed to load resource|favicon/.test(text)) return;
    problems.push(text.slice(0, 200));
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (mode === 'profile') {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  }
  const phone = device === 'phone';

  const now = () => page.evaluate(() => performance.now());
  // Two frames, then no long task for `quietMs` (at most `maxMs`).
  const quiet = (quietMs = 400, maxMs = 6000) => page.evaluate(([q, max]) => new Promise((resolve) => {
    const started = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const check = () => {
        const tasks = window.__studentRuntimePerf.longtasks.slice(-5);
        const lastEnd = tasks.length ? Math.max(...tasks.map((task) => task.startTime + task.duration)) : 0;
        const time = performance.now();
        if (time - Math.max(lastEnd, started) >= q || time - started > max) resolve(time);
        else setTimeout(check, 50);
      };
      setTimeout(check, 50);
    }));
  }), [quietMs, maxMs]);
  const until = (selector, pattern = null) => page.waitForFunction(([s, p]) => window.__studentRuntimePerf.has(s, p), [selector, pattern], { polling: 50, timeout: 30_000 });
  const untilGone = (selector) => page.waitForFunction((s) => !window.__studentRuntimePerf.has(s, null), selector, { polling: 50, timeout: 30_000 });
  const telemetry = () => page.evaluate(() => Object.fromEntries(Object.entries(window.__MATHMASTER_PERFORMANCE__?.snapshot?.() || {})
    .map(([name, value]) => [name, { count: value.count, latest: value.latest?.durationMs ?? null }])));
  const dismissToasts = async () => {
    const close = page.getByRole('button', { name: 'Dismiss notification' }).filter({ visible: true });
    const count = await close.count();
    for (let index = 0; index < count; index += 1) await close.first().click({ timeout: 2000 }).catch(() => {});
    if (count) await quiet(200, 2000);
  };
  // Scrolled to and hit-tested before the window opens: a sticky banner can
  // cover what scrolling uncovered, so the centre of the viewport is tried too.
  const pointAt = async (locator) => {
    await locator.waitFor({ state: 'visible', timeout: 30_000 });
    for (const block of [null, 'center', 'end', 'start']) {
      if (block) await locator.evaluate((element, where) => element.scrollIntoView({ block: where }), block);
      else await locator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const box = await locator.boundingBox();
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      if (await locator.evaluate((element, { x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit) && (hit === element || element.contains(hit));
      }, point)) return point;
    }
    throw new Error('the control is covered wherever it is scrolled');
  };
  const pressAt = (point) => (phone ? page.touchscreen.tap(point.x, point.y) : page.mouse.click(point.x, point.y));

  const interactions = [];
  const skipped = (name, why) => interactions.push({ name, skipped: why });
  const measure = async (name, { prepare = null, action, ready = null, quietMs = 400, maxMs = 6000 }) => {
    await dismissToasts();
    const prepared = prepare ? await prepare() : null;
    await quiet(300, 3000);
    const before = await telemetry();
    const hookBefore = mode === 'counts' ? await page.evaluate(() => {
      const perf = window.__studentRuntimePerf;
      perf.mark = new Map(perf.byType);
      return { commits: perf.commits, renders: perf.renders };
    }) : null;
    if (mode === 'profile') await cdp.send('Profiler.start');
    let traceEvents = null;
    if (mode === 'trace') {
      traceEvents = [];
      cdp.removeAllListeners('Tracing.dataCollected');
      cdp.on('Tracing.dataCollected', ({ value }) => traceEvents.push(...value));
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack', transferMode: 'ReportEvents' });
    }
    const t0 = await now();
    await action(prepared);
    let readyAt = null;
    if (ready) {
      await ready();
      readyAt = await now();
    }
    const t1 = await quiet(quietMs, maxMs);
    const record = { name, readyMs: readyAt == null ? null : Math.round(readyAt - t0), windowMs: Math.round(t1 - t0) };
    if (mode === 'profile') {
      const { profile } = await cdp.send('Profiler.stop');
      if (profileReader) record.profile = { ...profileReader.summarize(profile), inclusive: profileReader.inclusive(profile) };
      record.appTime = appMeasures.appTime(profile);
    }
    if (mode === 'trace') {
      const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      await complete;
      const layoutThread = traceEvents.find((event) => event.name === 'Layout');
      const onThread = traceEvents.filter((event) => layoutThread && event.pid === layoutThread.pid && event.tid === layoutThread.tid);
      const onMain = onThread.filter((event) => event.ph === 'X');
      const ms = (list) => Math.round(list.reduce((sum, event) => sum + (event.dur || 0), 0) / 100) / 10;
      const forced = (list) => list.filter((event) => event.args?.beginData?.stackTrace?.length);
      const layouts = onMain.filter((event) => event.name === 'Layout');
      const styles = onMain.filter((event) => event.name === 'UpdateLayoutTree');
      record.layout = {
        layouts: layouts.length, layoutMs: ms(layouts), forcedLayouts: forced(layouts).length, forcedLayoutMs: ms(forced(layouts)),
        styleRecalcs: styles.length, styleMs: ms(styles), forcedStyleRecalcs: forced(styles).length, forcedStyleMs: ms(forced(styles)),
        forcedBy: Object.entries([...forced(layouts), ...forced(styles)].reduce((counts, event) => {
          const key = traceFrameName(event.args.beginData.stackTrace[0]);
          return { ...counts, [key]: (counts[key] || 0) + 1 };
        }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10),
        forced: forcedReads({ layouts, styles, onThread }),
      };
      if (TRACE_DIR) {
        traceWindows += 1;
        writeFileSync(path.join(TRACE_DIR, `${String(traceWindows).padStart(3, '0')}-${device}-${name}.json`), JSON.stringify({ traceEvents }));
      }
    }
    const after = await telemetry();
    const slice = await page.evaluate(([a, b]) => {
      const perf = window.__studentRuntimePerf;
      return {
        events: perf.events.filter((event) => event.startTime >= a - 2 && event.startTime <= b),
        longtasks: perf.longtasks.filter((task) => task.startTime >= a - 2 && task.startTime <= b),
        loafs: perf.loafs.filter((frame) => frame.startTime + frame.duration >= a && frame.startTime <= b),
      };
    }, [t0, t1]);
    const byInteraction = new Map();
    slice.events.filter((event) => event.interactionId).forEach((event) => {
      const entry = byInteraction.get(event.interactionId) || { duration: 0, events: [], target: event.target };
      entry.duration = Math.max(entry.duration, event.duration);
      entry.events.push(event.name);
      byInteraction.set(event.interactionId, entry);
    });
    record.latency = byInteraction.size ? Math.max(...[...byInteraction.values()].map((entry) => entry.duration)) : null;
    record.inputs = [...byInteraction.values()];
    record.longTasks = slice.longtasks.map((task) => Math.round(task.duration));
    record.longTaskMs = record.longTasks.reduce((sum, value) => sum + value, 0);
    record.longFrameScripts = slice.loafs.flatMap((frame) => frame.scripts).filter((script) => script.duration >= 10)
      .map((script) => ({ ms: Math.round(script.duration), forcedLayoutMs: Math.round(script.forcedStyleAndLayoutDuration || 0), invoker: script.invoker, source: `${String(script.sourceURL || '').split('/').pop()} ${script.sourceFunctionName || ''}`.trim() }));
    record.telemetry = Object.fromEntries(Object.entries(after)
      .map(([key, value]) => [key, value.count - (before[key]?.count || 0)])
      .filter(([, added]) => added));
    if (mode === 'counts') {
      const counted = await page.evaluate(() => {
        const perf = window.__studentRuntimePerf;
        const types = [];
        perf.byType.forEach((count, type) => {
          const added = count - (perf.mark.get(type) || 0);
          if (added > 0) types.push({ added, name: type?.displayName || type?.name || '?', source: typeof type === 'function' ? Function.prototype.toString.call(type).slice(0, 160) : '' });
        });
        return { commits: perf.commits, renders: perf.renders, types: types.sort((a, b) => b.added - a.added).slice(0, 25) };
      });
      record.commits = counted.commits - hookBefore.commits;
      record.renders = counted.renders - hookBefore.renders;
      record.components = counted.types.map((type) => [nameComponent(type.source) || type.name, type.added]);
    }
    if (mode === 'counts') record.appRenders = await appMeasures.appRenders(page);
    interactions.push(record);
    const parts = [
      `latency ${record.latency ?? '<16'} ms`,
      record.readyMs != null ? `ready ${record.readyMs} ms` : null,
      `long tasks ${record.longTasks.join('+') || 0}`,
      record.telemetry.react_render_count ? `QuestionEngine/tool renders +${record.telemetry.react_render_count}` : null,
      mode === 'counts' ? `${record.commits} commits, ${record.renders} component renders` : null,
      record.layout ? `${record.layout.forcedLayouts} forced layouts, ${record.layout.forcedStyleRecalcs} forced style recalcs` : null,
    ].filter(Boolean);
    console.log(`  ${device} ${name}: ${parts.join(' · ')}`);
    return record;
  };

  // ------------------------------------------------------------ the flow
  await page.goto(`${ORIGIN}${PAGE}?reset=1&as=student&studentId=${STUDENT}&questions=runtime&server=1`);
  await page.waitForFunction(() => window.__studentRuntimePerf.has('button', 'Start Warm-Up'), null, { polling: 50, timeout: 120_000 });
  const homeAt = await now();
  await quiet(500, 10_000);
  const loadTasks = await page.evaluate((limit) => window.__studentRuntimePerf.longtasks.filter((task) => task.startTime <= limit).map((task) => Math.round(task.duration)), homeAt);
  interactions.push({ name: 'home', readyMs: Math.round(homeAt), longTasks: loadTasks, longTaskMs: loadTasks.reduce((sum, value) => sum + value, 0) });
  console.log(`  ${device} home: Start Warm-Up at ${Math.round(homeAt)} ms · ${loadTasks.length} long tasks, ${loadTasks.reduce((sum, value) => sum + value, 0)} ms`);
  await measure('home-at-rest-5s', { action: () => page.waitForTimeout(5000), quietMs: 50, maxMs: 500 });

  const button = (pattern) => page.getByRole('button', { name: pattern }).filter({ visible: true });
  const answerBox = () => page.locator('.mathmaster-question-engine math-field').filter({ visible: true }).first();
  const press = (locator) => () => pointAt(locator);
  const KEY_NAMES = { '+': 'plus sign' };
  const keypadKey = (key) => page.getByRole('button', { name: `Insert ${KEY_NAMES[key] || key}`, exact: true }).filter({ visible: true }).first();
  // Each key is measured on its own: the window opens once the last key's
  // response checkpoint (QuestionEngine saves a complete answer 1.2 s after
  // it last changed, CHECKPOINT_DEBOUNCE_MS) has been written, so a key is not
  // charged for the save of the one before it.
  const settledKey = (locate = null) => async () => {
    await page.waitForTimeout(1500);
    return locate ? pointAt(locate()) : null;
  };
  const typeKey = async (name, key) => {
    // A phone types with the number keypad, where it has the key.
    if (phone && await keypadKey(key).count()) return measure(name, { prepare: settledKey(() => keypadKey(key)), action: pressAt });
    return measure(name, { prepare: settledKey(), action: () => page.keyboard.press(key) });
  };
  const focused = () => page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD' || Boolean(document.querySelector('.mathmaster-mobile-numeric-keypad')), null, { polling: 50, timeout: 30_000 });
  // The way on from a closed question: the action bar's button, else the
  // navigator's Next (an older build).
  const wayOn = async () => {
    for (const locator of [
      button(/Continue to Classwork/).last(),
      button(/^Next question →/).first(),
      page.getByRole('button', { name: 'Next question', exact: true }).filter({ visible: true }).first(),
      page.locator('button').filter({ hasText: /^Next ›$/ }).filter({ visible: true }).first(),
    ]) {
      if (await locator.count()) return locator;
    }
    throw new Error('no way on from this question');
  };
  const submit = () => button(/^Submit/).first();
  const graded = () => until('.mathmaster-question-engine', 'Correct|complete|Not yet|Try again');

  await measure('open-assignment', {
    prepare: press(button(/Start Warm-Up/).first()), action: pressAt,
    ready: () => until('.mathmaster-question-engine math-field'), quietMs: 600, maxMs: 15_000,
  });
  await measure('basic-focus', { prepare: press(answerBox()), action: pressAt, ready: focused });
  await typeKey('basic-key', '4');
  await measure('basic-submit', { prepare: press(submit()), action: pressAt, ready: graded });
  await measure('next-to-choice', { prepare: async () => pointAt(await wayOn()), action: pressAt, ready: () => until('[role=radio]') });
  await measure('choice-pick', {
    prepare: press(page.getByRole('radio').filter({ hasText: /3x/ }).first()), action: pressAt,
    ready: () => until('[role=radio][aria-checked=true]'),
  });
  await page.waitForTimeout(800);
  if (await submit().count() && await submit().isEnabled()) await measure('choice-submit', { prepare: press(submit()), action: pressAt, ready: graded });
  else skipped('choice-submit', 'this build grades a choice when it is picked');
  await measure('next-to-expression', {
    prepare: async () => pointAt(await wayOn()), action: pressAt,
    ready: () => until('.mathmaster-question-engine', 'Simplify 3\\(x \\+ 2\\)'),
  });
  await measure('expression-focus', { prepare: press(answerBox()), action: pressAt, ready: focused });
  for (const key of ['2', 'x', '+', '6']) await typeKey(`expression-key-${key}`, key);
  const typed = await answerBox().evaluate((element) => element.value).catch(() => null);
  if (typed !== '2x+6') findings.push(`${device} ${mode}: the expression box holds ${JSON.stringify(typed)}, not "2x+6"`);
  await measure('expression-submit', { prepare: press(submit()), action: pressAt, ready: graded });
  // Counted from the press until the question is on screen, then to the end
  // of the window (STEP_ALGEBRA_FIRST_RENDER_BUDGET).
  const stepAlgebraCalls = mode === 'counts' && DIST ? createCallCounter(cdp, DIST) : null;
  let firstRenderCalls = null;
  const toStepAlgebra = await measure('next-to-tool', {
    prepare: async () => {
      const point = await pointAt(await wayOn());
      await stepAlgebraCalls?.start();
      return point;
    },
    action: pressAt,
    ready: async () => {
      await until('.mathmaster-question-engine', 'Target: isolate x');
      if (stepAlgebraCalls) firstRenderCalls = await stepAlgebraCalls.take({ stop: false });
    },
    quietMs: 600,
    maxMs: 15_000,
  });
  if (stepAlgebraCalls) {
    toStepAlgebra.mathjs = mathjsCallsIn(firstRenderCalls);
    toStepAlgebra.mathjsAfter = mathjsCallsIn(await stepAlgebraCalls.take());
    const said = (calls) => `simplify ${calls.simplify}, parse ${calls.parse} (${calls.clientParse} through the client's instance)`;
    console.log(`  ${device} next-to-tool mathjs: on screen ${said(toStepAlgebra.mathjs)}; after it ${said(toStepAlgebra.mathjsAfter)}`);
  }
  // Work View: an older build named its opener "Enlarge …"; where something
  // covers Close (an older phone layout) it is closed with Escape.
  const open = '.mathmaster-work-view-host[data-open="true"]';
  const opener = () => button(/Open Work View|^⤢ Enlarge/).first();
  const close = (name) => measure(name, {
    prepare: () => pointAt(page.locator(`${open} .mathmaster-work-view-header button`).filter({ hasText: /^Close/ }).first()).catch(() => null),
    action: (point) => (point ? pressAt(point) : page.keyboard.press('Escape')),
    ready: () => untilGone(open),
  });
  if (await opener().count()) {
    await measure('workview-open', { prepare: press(opener()), action: pressAt, ready: () => until(open), quietMs: 600, maxMs: 10_000 });
    await close('workview-close');
    await measure('workview-reopen', { prepare: press(opener()), action: pressAt, ready: () => until(open), quietMs: 600, maxMs: 10_000 });
    await close('workview-close-again');
  } else ['workview-open', 'workview-close', 'workview-reopen', 'workview-close-again'].forEach((name) => skipped(name, 'no Work View opener'));
  const hint = () => button(/^(💡 )?Hint$|Show a hint/).first();
  if (await hint().count()) await measure('hint', { prepare: press(hint()), action: pressAt, ready: () => until('.mathmaster-question-engine', 'Which operation is applied to x last') });
  else skipped('hint', 'no hint on this question in this build');
  const readAloud = () => button(/Read aloud/).first();
  if (await readAloud().count()) await measure('read-aloud', { prepare: press(readAloud()), action: pressAt });
  else skipped('read-aloud', 'no Read aloud on this question in this build');
  await measure('offline', { action: () => context.setOffline(true), quietMs: 600 });
  await measure('online', { action: () => context.setOffline(false), quietMs: 600 });
  // App's clock with nothing on the question changed by it: the question is
  // not drawn again. Then the bell: the class period ends (the harness's
  // Period 3 ends 50 minutes after the page opened), and on the next tick the
  // hint panel's "Ask my teacher" turns from a raised hand into a question
  // left for the teacher, so the question is drawn again for it.
  const clockTick = (advanceMs = 0) => async () => {
    const clocks = await page.evaluate((ms) => { window.__studentRuntimePerf.advance(ms); return window.__studentRuntimePerf.tick(); }, advanceMs);
    if (!clocks) throw new Error("App's 30-second clock was not found");
  };
  const handOffered = () => page.getByRole('button', { name: '✋ Ask my teacher', exact: true }).filter({ visible: true }).count();
  await measure('clock-tick', { action: clockTick() });
  if (await handOffered()) {
    await measure('clock-tick-class-ends', {
      action: clockTick(55 * 60_000),
      ready: () => until('.mathmaster-question-engine button', 'Leave a question for my teacher').catch(() => {
        throw new Error('the tick that ends the class did not turn the raised hand into a question for the teacher');
      }),
    });
  } else skipped('clock-tick-class-ends', 'no raised hand on offer in the hint panel');

  await context.close();
  if (problems.length) findings.push(`${device} ${mode}: console errors: ${[...new Set(problems)].slice(0, 3).join(' | ')}`);
  return { device, mode, typed, interactions };
};

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);
const results = { label: LABEL, origin: ORIGIN, page: PAGE, cpu: CPU, browser: browser.version(), at: new Date().toISOString(), runs: [] };
for (let run = 1; run <= RUNS; run += 1) {
  for (const mode of MODES) {
    for (const device of DEVICES) {
      console.log(`${LABEL ? `${LABEL} · ` : ''}run ${run} · ${device} · ${mode} · ${CPU}x CPU`);
      try {
        results.runs.push({ run, ...(await runFlow(browser, device, mode)) });
      } catch (error) {
        findings.push(`${device} ${mode} run ${run}: the flow stopped: ${String(error.message).split('\n')[0]}`);
        results.runs.push({ run, device, mode, error: String(error.message).split('\n')[0] });
      }
    }
  }
}
await browser.close();

// FORCED LAYOUTS, A TRACE RUN'S BUDGET. A read that needs layout, made after a
// write in the same task, makes the browser lay the page out early, once per
// read. Opening the assignment, each Next and each Work View open may do that
// at most this many times on each device, the counts five runs of each gave
// without varying. MathLive's own are not counted (a layout forced with only
// MathLive's frames on the stack: as a field connects, renders in its own
// frame or runs its timers), since its timers land inside or outside a window
// from run to run (4 or 5 opening an assignment on a Chromebook). What is left
// is the first measurement after React has changed the page (the identity
// bar's, a sticky bar's, the Work View button's, the dialog's first focus
// check), the opening focus reaching a math field, App's animation frames, and
// the browser removing the pressed button. Before the platform's measurements
// were all made ahead of their writes (src/platform/layout/layoutWrites.js)
// and the viewport read once per change (mobileInteractionFoundation.js), ten
// runs of the code before forced, Chromebook / phone: opening 6 / 3-4, Next
// 3-4 / 2-4 (a choice), 5 / 1 (an expression), 6-9 / 4-5 (a tool), Work View
// 4 / 4. A run over budget names the stack that forced each layout. Stacks are
// named from the build's source maps, so the budget needs PERF_DIST.
const FORCED_LAYOUT_BUDGET = {
  'open-assignment': { chromebook: 3, phone: 1 },
  'next-to-choice': { chromebook: 2, phone: 1 },
  'next-to-expression': { chromebook: 4, phone: 0 },
  'next-to-tool': { chromebook: 3, phone: 2 },
  'workview-open': { chromebook: 1, phone: 1 },
  'workview-reopen': { chromebook: 1, phone: 1 },
};
const mathLiveOwn = (read) => !read.platform && /\bmathlive\b/.test(read.stack[0] || '');
if (MODES.includes('trace') && !DIST) console.log('\nThe forced-layout budget is not checked without PERF_DIST (it tells MathLive\'s own layouts by their source).');
for (const { device, mode, run, interactions = [] } of results.runs) {
  if (mode !== 'trace' || !DIST) continue;
  for (const entry of interactions) {
    const budget = FORCED_LAYOUT_BUDGET[entry.name]?.[device];
    if (budget == null || !entry.layout) continue;
    const counted = entry.layout.forced.filter((read) => read.kind === 'layout' && !mathLiveOwn(read));
    if (counted.length > budget) findings.push(`${device} run ${run}: ${entry.name} forced ${counted.length} layouts, not counting MathLive's own (budget ${budget}): ${counted.map((read) => read.platform || read.stack[0]).join(' | ')}`);
  }
}

// The deterministic budgets. A key after the first (Undo is possible from
// then on) draws QuestionEngine once: the smallest over the three such keys,
// so a timer that happens to render inside one window does not count. Each
// Submit and each Next within SUBMIT_BUDGET / NEXT_BUDGET. App's clock: a
// tick that changes nothing draws no question, and the tick that ends the
// class draws it again.
for (const { device, mode, interactions = [] } of results.runs) {
  if (mode !== 'counts') continue;
  const keys = interactions.filter((entry) => /^expression-key-[^2]/.test(entry.name));
  if (!keys.length) continue;
  const engine = Math.min(...keys.map((entry) => entry.telemetry?.react_render_count || 0));
  const components = Math.min(...keys.map((entry) => entry.renders));
  if (engine > KEY_BUDGET.questionEngineRenders) findings.push(`${device}: a key drew QuestionEngine ${engine} times (budget ${KEY_BUDGET.questionEngineRenders})`);
  if (components > KEY_BUDGET.componentRenders) findings.push(`${device}: a key rendered ${components} components (budget ${KEY_BUDGET.componentRenders})`);
  for (const entry of interactions) {
    const budget = /-submit$/.test(entry.name) ? SUBMIT_BUDGET : /^next-to-/.test(entry.name) ? NEXT_BUDGET : null;
    if (!budget || entry.skipped || !Number.isFinite(entry.renders)) continue;
    const drawn = entry.telemetry?.react_render_count || 0;
    if (drawn > budget.questionEngineRenders) findings.push(`${device}: ${entry.name} drew QuestionEngine ${drawn} times (budget ${budget.questionEngineRenders})`);
    if (entry.renders > budget.componentRenders) findings.push(`${device}: ${entry.name} rendered ${entry.renders} components (budget ${budget.componentRenders})`);
  }
  const tick = interactions.find((entry) => entry.name === 'clock-tick');
  if (tick && !tick.skipped && (tick.telemetry?.react_render_count || 0) > 0) findings.push(`${device}: a clock tick that changes nothing drew the question ${tick.telemetry.react_render_count} times (budget 0)`);
  const bell = interactions.find((entry) => entry.name === 'clock-tick-class-ends');
  if (bell && !bell.skipped && !(bell.telemetry?.react_render_count > 0)) findings.push(`${device}: the tick that ends the class did not draw the question again`);
}

// Step Algebra's first render, in mathjs calls (counts runs with PERF_DIST).
for (const { device, mode, interactions = [] } of results.runs) {
  const entry = mode === 'counts' ? interactions.find((interaction) => interaction.name === 'next-to-tool') : null;
  if (!entry?.mathjs) continue;
  for (const [name, limit] of Object.entries(STEP_ALGEBRA_FIRST_RENDER_BUDGET)) {
    if (entry.mathjs[name] > limit) findings.push(`${device}: Next to Step Algebra ran mathjs ${name} ${entry.mathjs[name]} times (budget ${limit})`);
  }
}
if (MODES.includes('counts') && !DIST) console.log('Step Algebra\'s mathjs budget needs PERF_DIST (source maps); not counted.');

// Medians over the runs, per device, interaction and measure.
const table = [];
for (const device of DEVICES) {
  const runs = results.runs.filter((entry) => entry.device === device && entry.interactions);
  const names = [...new Set(runs.flatMap((entry) => entry.interactions.map((interaction) => interaction.name)))];
  for (const name of names) {
    const of = (mode, pick) => runs.filter((entry) => entry.mode === mode).map((entry) => entry.interactions.find((interaction) => interaction.name === name)).filter((entry) => entry && !entry.skipped).map(pick);
    table.push({
      device, interaction: name,
      latencyMs: median(of('timing', (entry) => entry.latency)),
      readyMs: median(of('timing', (entry) => entry.readyMs)),
      longTaskMs: median(of('timing', (entry) => entry.longTaskMs)),
      engineRenders: median(of('counts', (entry) => entry.telemetry?.react_render_count || 0)),
      componentRenders: median(of('counts', (entry) => entry.renders)),
    });
  }
}
results.medians = table;
console.log('\nmedians (timing: latency, ready, long-task ms; counts: QuestionEngine/tool renders, component renders)');
table.forEach((row) => console.log(`  ${row.device.padEnd(10)} ${row.interaction.padEnd(22)} ${String(row.latencyMs ?? '-').padStart(6)} ${String(row.readyMs ?? '-').padStart(6)} ${String(row.longTaskMs ?? '-').padStart(6)} ${String(row.engineRenders ?? '-').padStart(4)} ${String(row.componentRenders ?? '-').padStart(5)}`));
results.app = appMeasures.check(results.runs, findings);
if (process.env.OUT) writeFileSync(process.env.OUT, `${JSON.stringify(results, null, 1)}\n`);

if (findings.length) {
  console.error(`\n${findings.length} finding(s):\n- ${findings.join('\n- ')}`);
  process.exit(1);
}
console.log('\nThe student flow ran to the end within its budgets.');
