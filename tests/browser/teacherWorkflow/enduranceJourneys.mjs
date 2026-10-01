// A SCHOOL DAY, COMPRESSED: THE REAL APP, USED OVER AND OVER, MEASURED.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/enduranceJourneys.mjs
//
//   ROUNDS=8 (default 6) · ONLY=student|teacher · the same PLAYWRIGHT_MODULE /
//   CHROMIUM_PATH / TEACHER_HARNESS_ORIGIN as journeys.mjs.
//
// The real App.jsx over the in-memory Firebase fakes (nothing can reach a
// project). Each round repeats what a period of class does to one device:
//
//   student  open the lesson, answer every question (type, submit, next),
//            open and close the Work View and the calculator, go back to the
//            dashboard — while OTHER assignments in the school are edited, as
//            other teachers' edits, DOL unlocks and seat allocations do all
//            day; then the same again
//   teacher  walk Home → Assignments → Classes → Students → Grades → Action
//            Center → Attendance → Grade Export → Home, then sit on Grades
//            while assignments are edited (no listener may be re-created)
//
// The fake Firestore re-emits EVERY listener on ANY write (real Firestore only
// notifies the queries a write touches), which makes it strict: an effect that
// depends on a collection it does not need shows up here as repeated reads,
// even where production would see one per edit per device.
//
// After every round, at the same resting screen, with garbage collected:
// JS heap, DOM nodes, JS event listeners and open Firestore listeners. A leak
// is growth that keeps going; a fan-out is listeners re-created or documents
// re-read because some OTHER assignment changed. Console errors and React
// warnings fail the run. Exit code 1 on any finding.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const ROUNDS = Math.max(3, Number(process.env.ROUNDS || 6));
const ONLY = process.env.ONLY || '';
const STUDENT_ID = '910002';
const IGNORED_CONSOLE = /Failed to decode downloaded font|OTS parsing error|math fonts could not be loaded|Download the React DevTools|\[vite\]|Failed to load resource/;

const launchOptions = { args: ['--no-sandbox', '--js-flags=--expose-gc'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const finding = (journey, message) => { findings.push(`[${journey}] ${message}`); console.log(`  FINDING ${message}`); };
const settle = (page, ms = 400) => page.waitForTimeout(ms);

const openPage = async (query) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const consoleProblems = [];
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    const text = message.text();
    if (IGNORED_CONSOLE.test(text)) return;
    // React's own warnings, and any error, are findings; ordinary warnings are logged.
    if (message.type() === 'error' || /Warning:|Maximum update depth|Cannot update a component/.test(text)) consoleProblems.push(text.slice(0, 220));
  });
  page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));
  // Name the URL of a failed load; the console line alone does not. The dev
  // server cannot serve MathLive's font files (a harness limitation, not a
  // production one), so those are ignored like their console noise.
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    if (/\/fonts\/|\.woff2?($|\?)|favicon/.test(url)) return;
    consoleProblems.push(`HTTP ${response.status()} ${url.replace(ORIGIN, '')}`);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Runtime.enable');
  await page.goto(`${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1${query}`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  return { context, page, cdp, consoleProblems };
};

const measure = async (page, cdp) => {
  // An attached inspector keeps every object passed to console.* alive; in the
  // dev harness MathLive logs its (unloadable) font errors with elements in
  // scope, which pinned every closed screen. A student's browser has no
  // inspector, so drop what this session collected before measuring.
  await cdp.send('Runtime.discardConsoleEntries').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage');
  await settle(page, 300);
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const metric = (name) => metrics.find((entry) => entry.name === name)?.value ?? null;
  const store = await page.evaluate(() => window.__mmHarnessStore?.stats?.() || {});
  return {
    heapMB: Math.round((metric('JSHeapUsedSize') / 1048576) * 10) / 10,
    nodes: metric('Nodes'),
    jsListeners: metric('JSEventListeners'),
    firestoreListeners: store.openListeners ?? null,
  };
};

// Edits to assignments the device is NOT looking at, the way the school's
// other activity reaches every open tab through the assignments listener.
const editOtherAssignments = async (page, round, times = 3) => {
  for (let index = 0; index < times; index += 1) {
    await page.evaluate(([n, i]) => {
      window.__mmHarnessStore.update('assignments/a-mp1', { title: `Unit 1 — Test Review (edit ${n}.${i})` });
    }, [round, index]);
    await settle(page, 250);
  }
};

const fanOutCounts = (stats, studentId) => {
  const reads = Object.entries(stats.reads || {}).filter(([path]) => path.startsWith('studentWorkspaceDrafts/')).reduce((total, [, count]) => total + count, 0);
  const gradeSubscriptions = Object.entries(stats.subscriptions || {}).filter(([path]) => path === `grades/${studentId}`).reduce((total, [, count]) => total + count, 0);
  return { draftReads: reads, gradeSubscriptions };
};

const summarize = (journey, samples) => {
  const rows = samples.map((sample, index) => `    round ${index + 1}: heap ${sample.heapMB} MB · DOM ${sample.nodes} · JS listeners ${sample.jsListeners} · Firestore listeners ${sample.firestoreListeners}`);
  console.log(rows.join('\n'));
  // Round 1 includes lazy chunks arriving; compare the rest against round 2.
  const baseline = samples[1];
  const last = samples.at(-1);
  const heapGrowth = last.heapMB - baseline.heapMB;
  if (heapGrowth > 8) finding(journey, `JS heap grew ${heapGrowth.toFixed(1)} MB from round 2 to round ${samples.length} (${baseline.heapMB} → ${last.heapMB} MB)`);
  if (last.nodes > baseline.nodes * 1.15 + 50) finding(journey, `DOM grew from ${baseline.nodes} to ${last.nodes} nodes at the same screen`);
  if (last.jsListeners > baseline.jsListeners * 1.15 + 40) finding(journey, `JS event listeners grew from ${baseline.jsListeners} to ${last.jsListeners}`);
  if (last.firestoreListeners !== baseline.firestoreListeners) finding(journey, `open Firestore listeners changed at the same screen: ${baseline.firestoreListeners} → ${last.firestoreListeners}`);
  return { heapGrowth, baseline, last };
};

const studentJourney = async () => {
  const journey = 'student';
  console.log(`\nSTUDENT — ${ROUNDS} rounds of the lesson, other assignments edited throughout`);
  const { context, page, cdp, consoleProblems } = await openPage(`&as=student&studentId=${STUDENT_ID}&questions=real`);
  const samples = [];
  let fanOut = { draftReads: 0, gradeSubscriptions: 0 };
  for (let round = 1; round <= ROUNDS; round += 1) {
    await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
    // A locator wait, never page.waitForSelector: that returns an ElementHandle
    // the driver keeps alive, which pins the whole closed screen and reads as
    // a detached-DOM leak that is the test's, not the app's.
    await page.locator('math-field').first().waitFor({ timeout: 15000 });
    await settle(page, 600);

    // Other teachers' edits while this student works.
    await page.evaluate(() => window.__mmHarnessStore.resetStats());
    await editOtherAssignments(page, round);
    const during = fanOutCounts(await page.evaluate(() => window.__mmHarnessStore.stats()), STUDENT_ID);
    fanOut = { draftReads: fanOut.draftReads + during.draftReads, gradeSubscriptions: fanOut.gradeSubscriptions + during.gradeSubscriptions };

    for (let question = 0; question < 6; question += 1) {
      const field = page.locator('math-field').first();
      if (await field.count()) {
        await field.click();
        await page.keyboard.type(question % 2 ? '3/4' : '5');
        await settle(page, 150);
        const submit = page.getByRole('button', { name: /^Submit/ }).first();
        if (await submit.isVisible().catch(() => false) && await submit.isEnabled().catch(() => false)) {
          await submit.click();
          await settle(page, 500);
        }
      }
      if (question === 1) {
        const enlarge = page.getByRole('button', { name: /Enlarge question/ }).first();
        if (await enlarge.isVisible().catch(() => false)) {
          await enlarge.click();
          await settle(page, 500);
          await page.keyboard.press('Escape');
          await settle(page, 300);
        }
        const calculator = page.getByRole('button', { name: /^Calculator$/ }).first();
        if (await calculator.isVisible().catch(() => false)) {
          await calculator.click();
          await settle(page, 300);
          await calculator.click();
          await settle(page, 200);
        }
      }
      const next = page.getByRole('button', { name: /^Next/ }).first();
      if (!(await next.isEnabled().catch(() => false))) break;
      await next.click();
      await settle(page, 400);
    }

    await page.getByRole('button', { name: /Back to Dashboard/ }).first().click();
    await settle(page, 1200);
    await editOtherAssignments(page, round, 1);
    samples.push(await measure(page, cdp));
    console.log(`  round ${round} done`);
  }
  summarize(journey, samples);
  console.log(`  while other assignments were edited during work: ${fanOut.draftReads} workspace-draft reads, ${fanOut.gradeSubscriptions} new grades/${STUDENT_ID} listeners`);
  if (fanOut.draftReads > 0) finding(journey, `editing OTHER assignments re-read this student's workspace draft ${fanOut.draftReads} times`);
  if (fanOut.gradeSubscriptions > 0) finding(journey, `editing OTHER assignments re-created this student's grades listener ${fanOut.gradeSubscriptions} times`);
  if (consoleProblems.length) finding(journey, `console: ${[...new Set(consoleProblems)].slice(0, 5).join(' | ')}`);
  await context.close();
};

const teacherJourney = async () => {
  const journey = 'teacher';
  console.log(`\nTEACHER — ${ROUNDS} rounds through the workspace, assignments edited throughout`);
  // weeklyPath=ok: the harness fails that callable by default, as production
  // did during the teacher audit; this journey is about the client.
  const { context, page, cdp, consoleProblems } = await openPage('&weeklyPath=ok');
  const tabs = ['Assignments', 'Classes', 'Students', 'Grades', 'Action Center', 'Attendance History', 'Grade Export', 'Home'];
  const samples = [];
  let gradeListenerChurn = 0;
  // The lightweight roster (listSignInAccess) names every student on Home and
  // Live; an unrelated assignment edit must not refetch it, nor re-query the
  // grades collection. (Counters an older harness does not keep read as 0.)
  let rosterRefetches = 0;
  let gradesQueries = 0;
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const tab of tabs) {
      // A tab may carry a count badge ("Action Center (3)").
      await page.locator('nav, aside').getByRole('button', { name: new RegExp(`${tab}(\\s*\\(\\d+\\))?$`) }).first().click();
      await settle(page, 700);
    }
    // Edited while the Grades tab holds the live grades listener — the screen a
    // teacher leaves open during class — then back Home for the sample.
    await page.locator('nav, aside').getByRole('button', { name: /^Grades(\s*\(\d+\))?$/ }).first().click();
    await settle(page, 700);
    await page.evaluate(() => window.__mmHarnessStore.resetStats());
    await editOtherAssignments(page, round);
    await settle(page, 400);
    const stats = await page.evaluate(() => window.__mmHarnessStore.stats());
    gradeListenerChurn += Object.entries(stats.subscriptions || {}).filter(([path]) => path === 'grades').reduce((total, [, count]) => total + count, 0);
    rosterRefetches += stats.callables?.listSignInAccess || 0;
    gradesQueries += stats.queries?.grades || 0;
    await page.locator('nav, aside').getByRole('button', { name: /^Home(\s*\(\d+\))?$/ }).first().click();
    await settle(page, 600);
    samples.push(await measure(page, cdp));
    console.log(`  round ${round} done`);
  }
  summarize(journey, samples);
  // Every write to any assignment used to tear the live grades listener down,
  // flip the gradebook to loading and re-read every student's grades.
  console.log(`  grades-collection listeners re-created by other assignments' edits: ${gradeListenerChurn}`);
  if (gradeListenerChurn > 0) finding(journey, `other assignments' edits re-created the teacher's grades listener ${gradeListenerChurn} times`);
  console.log(`  roster refetches (listSignInAccess) and grades queries caused by other assignments' edits: ${rosterRefetches}, ${gradesQueries}`);
  if (rosterRefetches > 0) finding(journey, `other assignments' edits refetched the teacher roster ${rosterRefetches} times`);
  if (gradesQueries > 0) finding(journey, `other assignments' edits re-queried the grades collection ${gradesQueries} times`);
  if (consoleProblems.length) finding(journey, `console: ${[...new Set(consoleProblems)].slice(0, 5).join(' | ')}`);
  await context.close();
};

if (!ONLY || ONLY === 'student') await studentJourney();
if (!ONLY || ONLY === 'teacher') await teacherJourney();
await browser.close();

if (findings.length) {
  console.error(`\n${findings.length} endurance finding(s):\n- ${findings.join('\n- ')}`);
  process.exit(1);
}
console.log('\nEndurance: no growth that keeps going, no fan-out, a clean console.');
