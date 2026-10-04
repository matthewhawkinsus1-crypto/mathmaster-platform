// WHAT NAMING STUDENTS COSTS A TEACHER'S BROWSER, MEASURED.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/identityPerfProbe.mjs > probe.json
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188; the same
//    PLAYWRIGHT_MODULE / CHROMIUM_PATH as journeys.mjs; PROBE_LABEL=<text> is
//    copied into the output so a before and an after run can be told apart;
//    HARNESS_QUERY=&rosterSelect=legacy serves the pre-contract roster
//    projection, for a "before" on an older tree.)
//
// The real App.jsx over the in-memory Firebase fakes, signed in as the
// synthetic teacher, on a fresh load (?reset=1). Four phases, the counters
// reset between them:
//
//   home        the fresh load, resting on Home (the lightweight roster)
//   grades      open Grades (full student data) and choose a class
//   homeAgain   back to Home (full data released)
//   edit        three edits to an assignment no screen is showing
//
// Each phase reports what the app asked of the fake backend — open Firestore
// listeners (and how many on `grades` and on `presence/*`), `grades`
// collection subscriptions created, grades/{id} document reads, getDocs
// queries, documents delivered (onSnapshot emissions + getDocs results), and
// callables invoked — plus JS heap after GC and DOM nodes. The listSignInAccess
// payload size is the JSON length of the callable's response.
//
// Prints one JSON document. It runs unchanged against an older harness (an
// older tree): counters that harness does not keep are null, and callable
// counts fall back to window.__mmHarness.calls, so before/after runs compare.

import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1&weeklyPath=ok${process.env.HARNESS_QUERY || ''}`;
const IGNORED_CONSOLE = /Failed to decode downloaded font|OTS parsing error|math fonts could not be loaded|Download the React DevTools|\[vite\]|Failed to load resource/;

const launchOptions = { args: ['--no-sandbox', '--js-flags=--expose-gc'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);
const context = await newSchoolContext(browser, { viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const consoleProblems = [];
page.on('console', (message) => {
  if (message.type() !== 'error' || IGNORED_CONSOLE.test(message.text())) return;
  consoleProblems.push(message.text().split('\n')[0].slice(0, 200));
});
page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${String(error.message || error).split('\n')[0]}`));
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('Runtime.enable');

const settle = (ms) => page.waitForTimeout(ms);
const sidebar = async (name) => {
  await page.locator('nav, aside').getByRole('button', { name: new RegExp(`^${name}(\\s*\\(\\d+\\))?$`) }).first().click();
  await settle(2500);
};
const sum = (entries) => entries.reduce((total, [, count]) => total + count, 0);

// Harness counters, read defensively: an older fakeFirestore keeps only
// openListeners / reads / subscriptions.
const snapshot = async (callsFrom) => {
  const raw = await page.evaluate((from) => ({
    stats: window.__mmHarnessStore?.stats?.() || {},
    calls: (window.__mmHarness?.calls || []).slice(from).map((call) => call.name),
    callCount: (window.__mmHarness?.calls || []).length,
  }), callsFrom);
  const { stats } = raw;
  const reads = Object.entries(stats.reads || {});
  const subscriptions = Object.entries(stats.subscriptions || {});
  const openByPath = stats.openListenersByPath ? Object.entries(stats.openListenersByPath) : null;
  const queries = stats.queries ? Object.entries(stats.queries) : null;
  const delivered = stats.docsDeliveredByPath ? Object.entries(stats.docsDeliveredByPath) : null;
  const callables = stats.callables || raw.calls.reduce((counts, name) => ({ ...counts, [name]: (counts[name] || 0) + 1 }), {});
  return {
    callCount: raw.callCount,
    firestore: {
      openListeners: stats.openListeners ?? null,
      openGradesListeners: openByPath ? sum(openByPath.filter(([path]) => path === 'grades' || path.startsWith('grades/'))) : null,
      openPresenceListeners: openByPath ? sum(openByPath.filter(([path]) => path === 'presence' || path.startsWith('presence/'))) : null,
      gradesCollectionSubscriptions: sum(subscriptions.filter(([path]) => path === 'grades')),
      gradesDocSubscriptions: sum(subscriptions.filter(([path]) => /^grades\/[^/]+$/.test(path))),
      subscriptionsCreated: sum(subscriptions),
      gradesDocReads: sum(reads.filter(([path]) => /^grades\/[^/]+$/.test(path))),
      docReads: sum(reads),
      getDocsQueries: queries ? sum(queries) : null,
      getDocsQueriesByCollection: queries ? Object.fromEntries(queries) : null,
      docsDelivered: stats.docsDelivered ?? null,
      gradesDocsDelivered: delivered ? sum(delivered.filter(([path]) => path === 'grades' || path.startsWith('grades/'))) : null,
      // Listeners created in this phase, per path (one entry per student folded into "presence/*" / "grades/*").
      subscriptionsByPath: subscriptions.reduce((folded, [path, count]) => {
        const key = path.replace(/^(presence|grades)\/[^/]+$/, '$1/*');
        return { ...folded, [key]: (folded[key] || 0) + count };
      }, {}),
    },
    callables,
    callableBytes: stats.callableBytes || null,
  };
};

const measureMemory = async () => {
  // An attached inspector keeps console arguments alive; drop them first.
  await cdp.send('Runtime.discardConsoleEntries').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage');
  await settle(300);
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const metric = (name) => metrics.find((entry) => entry.name === name)?.value ?? null;
  return {
    heapMB: Math.round((metric('JSHeapUsedSize') / 1048576) * 10) / 10,
    domNodes: metric('Nodes'),
    jsEventListeners: metric('JSEventListeners'),
  };
};

const phases = {};
const phase = async (name, action) => {
  const startCalls = (await page.evaluate(() => (window.__mmHarness?.calls || []).length).catch(() => 0));
  if (name !== 'home') await page.evaluate(() => window.__mmHarnessStore?.resetStats?.());
  await action();
  const counters = await snapshot(name === 'home' ? 0 : startCalls);
  delete counters.callCount;
  phases[name] = { ...counters, memory: await measureMemory() };
};

await phase('home', async () => {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByText('IN SESSION NOW').waitFor({ timeout: 60000 });
  await settle(4000);
});
await phase('grades', async () => {
  await sidebar('Grades');
  const chooser = page.locator('section[aria-labelledby="gradebook-choose-class"]');
  if (await chooser.count()) {
    await chooser.getByRole('button').first().click();
    await settle(2500);
  }
});
await phase('homeAgain', async () => {
  await sidebar('Home');
  await settle(1500);
});
await phase('edit', async () => {
  for (let index = 0; index < 3; index += 1) {
    await page.evaluate((n) => window.__mmHarnessStore.update('assignments/a-mp1', { title: `Unit 1 — Test Review (probe edit ${n})` }), index);
    await settle(400);
  }
  await settle(1200);
});

// The roster payload, measured the same way on any harness: call the fake
// listSignInAccess (the module the app itself uses) and take its JSON length.
const roster = await page.evaluate(async () => {
  const functionsModule = await import('/tests/browser/teacherWorkflow/fakeFunctions.js');
  const response = await functionsModule.httpsCallable(null, 'listSignInAccess')({});
  const students = Array.isArray(response?.data?.students) ? response.data.students : [];
  const fields = new Set();
  students.forEach((row) => Object.keys(row || {}).forEach((key) => { if (row[key] !== undefined) fields.add(key); }));
  return {
    bytes: JSON.stringify(response?.data ?? {}).length,
    studentRows: students.length,
    bytesPerStudentRow: students.length ? Math.round(JSON.stringify(students).length / students.length) : null,
    rowFields: [...fields].sort(),
    carriesAttemptHistory: students.some((row) => row && ('gradesByAssignment' in row && row.gradesByAssignment !== undefined)),
  };
}).catch((error) => ({ error: String(error.message || error) }));

await browser.close();

console.log(JSON.stringify({
  label: process.env.PROBE_LABEL || null,
  origin: ORIGIN,
  harnessQuery: process.env.HARNESS_QUERY || '',
  measuredAt: new Date().toISOString(),
  listSignInAccess: roster,
  phases,
  consoleErrors: [...new Set(consoleProblems)].slice(0, 8),
}, null, 2));
