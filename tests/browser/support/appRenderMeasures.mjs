// APP'S OWN RENDERS AND ITS RENDER TIME, FOR studentRuntimePerformance.mjs.
//
// App rendered seven to nine times on a Submit or a Next (the save line's
// subject committed by an effect after each change of the status, and updates
// that said what App already showed: the grade document's snapshots, the place
// to resume, the device report, the list of answers needing review), and its
// render spent 43 to 90 ms of each at 4x CPU in memos that nothing inside an
// assignment shows. The driver hands each interaction here:
//
//   counts   appRenders: the commits App drew in (React's PerformedWork on
//            App's fiber, as the driver's DevTools hook counts every component)
//   profile  appTime: the time with App's frame on the stack: in all
//            (`total`), with one of the deferred memos' builders below it
//            (`deferredMemos`: the Grade Center, the Recovery summaries, My
//            Math Path's options, the Practice Pass list, which only screens
//            outside an assignment show) and with the navigator below it
//            (`navigator`: its sections and question lines)
//
// App, and each builder, is told from everything else by the line its
// function starts on in the build's source maps (PERF_DIST): a frame or a
// component is named "… · file:line" (cpuProfileNames.mjs). Without
// PERF_DIST nothing here is counted.
//
// The budgets, which do not depend on the machine: on each device the
// middle of the flow's three Submits renders App at most
// APP_RENDER_BUDGET.submit times and the middle of its three Nexts
// APP_RENDER_BUDGET.next (3 and 4 since, one to spare). The middle one, so
// one window that a timer of the app's own lands in does not count: the
// response checkpoint of the key typed before a Submit, saved 1.2 s after it
// while the driver waits 1.5 s, sometimes lands in the Submit's window under
// load, three App renders of its own. And a Submit or a Next spends none of
// App's render time in the deferred memos' builders (since nothing inside an
// assignment asks for them).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { componentNamer, createProfileReader } from './cpuProfileNames.mjs';

export const APP_RENDER_BUDGET = Object.freeze({ submit: 4, next: 5 });
export const DEFERRED_MEMO_BUDGET_MS = 0;
// The builders App's deferred accessors call, by where each is defined (the
// other exports of their modules are small helpers App's render may call
// anywhere).
export const DEFERRED_BUILDERS = Object.freeze([
  ['src/platform/student/studentGradeCenterModel.js', /^export const buildStudentGradeCenter = /],
  ['src/platform/student/recoverySummaries.js', /^export const buildRecoverySummariesByAssignment = /],
  ['src/platform/path/studentPathOptions.js', /^export const buildStudentPathOptions = /],
  ['src/platform/rewards/practicePassClientEligibility.js', /^export const practicePassEligibleAssignments = /],
]);
const NAVIGATOR = /src\/platform\/student\/assignmentNavigator\.js:\d+$/;

// Every source file's text in a build, as its maps hold it (read once per build).
const sourceTexts = new Map();
const sourcesOf = (dist) => {
  if (sourceTexts.has(dist)) return sourceTexts.get(dist);
  const texts = new Map();
  const assets = dist ? path.join(dist, 'assets') : null;
  if (assets && existsSync(assets)) {
    for (const file of readdirSync(assets).filter((name) => name.endsWith('.js.map'))) {
      const map = JSON.parse(readFileSync(path.join(assets, file), 'utf8'));
      (map.sources || []).forEach((source, index) => {
        // Named as cpuProfileNames.mjs names a frame's file.
        const name = String(source).replace(/^.*?(node_modules\/|src\/|functions\/|tests\/)/, '$1');
        if (!texts.has(name) && map.sourcesContent?.[index] != null) texts.set(name, map.sourcesContent[index]);
      });
    }
  }
  sourceTexts.set(dist, texts);
  return texts;
};

/** The 1-based line of `file` (e.g. 'src/App.jsx') that `pattern` matches, in this build, or null. */
export const definitionLine = (dist, file, pattern) => {
  const text = sourcesOf(dist).get(file);
  if (text == null) return null;
  const line = text.split('\n').findIndex((each) => pattern.test(each));
  return line >= 0 ? line + 1 : null;
};

/** The line of `function App() {` in the build's src/App.jsx, or null. */
export const appComponentLine = (dist) => definitionLine(dist, 'src/App.jsx', /^function App\(\) \{/);

/**
 * The time (ms) of the samples with a frame `isUnder` names on the stack, and
 * of those, per group, the samples with a frame below it that the group's
 * pattern (anything with test(name)) names. `reader` is cpuProfileNames.mjs's.
 */
export const timeUnder = (reader, profile, isUnder, groups = {}) => {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  profile.nodes.forEach((node) => (node.children || []).forEach((child) => parent.set(child, node.id)));
  const names = new Map();
  const nameOf = (id) => {
    if (!names.has(id)) names.set(id, reader.frameName(nodes.get(id).callFrame));
    return names.get(id);
  };
  const totals = { total: 0, ...Object.fromEntries(Object.keys(groups).map((group) => [group, 0])) };
  profile.samples.forEach((leaf, index) => {
    const delta = profile.timeDeltas[index + 1] ?? 0;
    const below = [];
    let id = leaf;
    for (; id != null && !isUnder(nameOf(id)); id = parent.get(id)) below.push(nameOf(id));
    if (id == null) return;
    totals.total += delta;
    Object.entries(groups).forEach(([group, pattern]) => {
      if (below.some((name) => pattern.test(name))) totals[group] += delta;
    });
  });
  return Object.fromEntries(Object.entries(totals).map(([group, micros]) => [group, Math.round(micros / 100) / 10]));
};

const isSubmit = (name) => name.endsWith('-submit');
const isNext = (name) => name.startsWith('next-to-');
const middle = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
};

export const createAppRenderMeasures = (dist) => {
  const appLine = appComponentLine(dist);
  const isApp = (name) => appLine != null && String(name || '').endsWith(` · src/App.jsx:${appLine}`);
  const builderFrames = DEFERRED_BUILDERS
    .map(([file, pattern]) => [file, definitionLine(dist, file, pattern)])
    .filter(([, line]) => line != null)
    .map(([file, line]) => ` · ${file}:${line}`);
  const deferredMemos = { test: (name) => builderFrames.some((suffix) => String(name || '').endsWith(suffix)) };
  const reader = dist ? createProfileReader(dist) : null;
  const nameComponent = componentNamer(dist);
  const componentNames = new Map();
  const componentName = (source) => {
    if (!componentNames.has(source)) componentNames.set(source, nameComponent(source));
    return componentNames.get(source);
  };
  return {
    appLine,
    /** App's renders in the window just measured (counts mode: the driver's DevTools hook). */
    async appRenders(page) {
      if (appLine == null) return null;
      const types = await page.evaluate(() => {
        const perf = window.__studentRuntimePerf;
        const added = [];
        perf.byType.forEach((count, type) => {
          const more = count - (perf.mark.get(type) || 0);
          if (more > 0 && typeof type === 'function') added.push({ more, source: Function.prototype.toString.call(type).slice(0, 160) });
        });
        return added;
      });
      return types.filter((type) => isApp(componentName(type.source))).reduce((sum, type) => sum + type.more, 0);
    },
    /** App's render time in a window's CPU profile (profile mode). */
    appTime(profile) {
      if (!reader || appLine == null) return null;
      return timeUnder(reader, profile, isApp, { deferredMemos, navigator: NAVIGATOR });
    },
    /** The budgets, as findings, and App's numbers per interaction, printed and returned for OUT. */
    check(runs, findings, { log = console.log } = {}) {
      if (appLine == null) {
        log('\n(App\'s renders and its render time are not counted without PERF_DIST: App cannot be told from the other components)');
        return null;
      }
      if (builderFrames.length < DEFERRED_BUILDERS.length) log(`(${DEFERRED_BUILDERS.length - builderFrames.length} of the deferred memos' builders are not in this build's maps)`);
      const rows = [];
      for (const { device, mode, interactions = [] } of runs) {
        if (mode === 'counts') {
          for (const [kind, matches, budget] of [['Submit', isSubmit, APP_RENDER_BUDGET.submit], ['Next', isNext, APP_RENDER_BUDGET.next]]) {
            const counted = interactions.filter((entry) => !entry.skipped && matches(entry.name) && Number.isFinite(entry.appRenders));
            if (!counted.length) continue;
            const typical = middle(counted.map((entry) => entry.appRenders));
            if (typical > budget) findings.push(`${device}: the middle ${kind} rendered App ${typical} times (${counted.map((entry) => `${entry.name} ${entry.appRenders}`).join(', ')}; budget ${budget})`);
          }
        }
        for (const entry of interactions) {
          if (entry.skipped) continue;
          if (mode === 'counts' && Number.isFinite(entry.appRenders)) rows.push({ device, interaction: entry.name, appRenders: entry.appRenders });
          if (mode === 'profile' && entry.appTime) {
            rows.push({ device, interaction: entry.name, ...entry.appTime });
            if ((isSubmit(entry.name) || isNext(entry.name)) && entry.appTime.deferredMemos > DEFERRED_MEMO_BUDGET_MS) {
              findings.push(`${device}: ${entry.name} spent ${entry.appTime.deferredMemos} ms of App's render in the memos no screen inside an assignment shows (budget ${DEFERRED_MEMO_BUDGET_MS} ms)`);
            }
          }
        }
      }
      const shown = rows.filter((row) => isSubmit(row.interaction) || isNext(row.interaction) || /^(open-assignment|clock-tick)/.test(row.interaction));
      if (shown.length) {
        log('\nApp (counts: its renders; profile: its render ms, of which in the deferred memos and in the navigator)');
        shown.forEach((row) => log(`  ${row.device.padEnd(10)} ${row.interaction.padEnd(22)} ${row.appRenders != null ? `${row.appRenders} renders` : `${row.total} ms, ${row.deferredMemos} in deferred memos, ${row.navigator} in the navigator`}`));
      }
      return { appLine, budget: { renders: APP_RENDER_BUDGET, deferredMemoMs: DEFERRED_MEMO_BUDGET_MS }, rows };
    },
  };
};
