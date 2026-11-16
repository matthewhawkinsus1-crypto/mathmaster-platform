// WHAT A SCHOOL DAY COSTS IN FIRESTORE READS, PHASE BY PHASE — AND THE BUDGETS THAT HOLD IT.
//
//   OUT_DIR=dist-harness/reads npx vite build --config tests/browser/teacherWorkflow/vite.production.config.mjs
//   node scripts/serve-static-spa.mjs dist-harness/reads 5304 &
//   node tests/browser/teacherWorkflow/sessionReadsProbe.mjs
//
//   (PROBE_ORIGIN=<origin> if not http://127.0.0.1:5304; ONLY=student|teacher;
//    OUT=<file.json> also writes the JSON there; PROBE_LABEL=<text> is copied
//    into it; BUDGETS=off reports without checking; SHOT_DIR=<dir> saves a
//    screenshot of a phase that could not be driven; TRACE=1 adds the call site
//    of every read, query and listener, readable on the dev server
//    (vite.config.mjs, port 5188), whose frames are not minified; the same
//    PLAYWRIGHT_MODULE / CHROMIUM_PATH as journeys.mjs.)
//
// It runs by hand, as identityPerfProbe.mjs does: about three minutes.
//
// The real App.jsx over the in-memory Firebase fakes, on the harness BUILT AS
// PRODUCTION IS (vite.production.config.mjs). The dev server renders under
// React's StrictMode development behaviour, which runs every mount effect
// twice, so there a read made once in production is counted twice: the
// budgets below are for the production build, and the probe checks them only
// there (on the dev server it reports, and says why it did not check).
//
// The school is fixture.js's with Algebra II Period 3 at its real size
// (`&fullClass=1`: 30 students, 20 lessons), on the school clock
// (schoolClock.mjs), with server ingestion (`&server=1`) so a Submit is graded
// and lands on the student's record as in production. The simulated class's
// presence heartbeats arrive when the probe says (`&presenceBeat=manual`, one
// beat in each teacher phase), never on a timer, so no count depends on how
// long a phase took.
//
//   student (910101, today's Warm-Up done, yesterday's lesson part-done)
//     signIn          a fresh load, resting on Home
//     openAssignment  today's lesson, from its card on Home
//     answer          Classwork Q1, Q2 and Practice Q1 answered, each Submitted
//                     and followed by Next
//     finish          the last open question (Practice Q2) answered and Submitted
//     results         "Continue to your results": the lesson's result page
//     grades          My Grades ("View All Grades" on the result page)
//     mathPath        My Math Path
//     home            back to Home
//     midAssignment   yesterday's part-done lesson from "Do this next", one
//                     answer Submitted
//     reload          the page reloaded there, and back into the lesson (the
//                     harness page keeps its own address, so a reload lands on
//                     Home and Continue resumes, where production's address
//                     would have restored the question itself)
//
//   teacher
//     home            a fresh load, resting on Home (the class in session live)
//     grades          Grades, Algebra II — Period 3 chosen
//     monitor         the gradebook's "Live view": the live class monitor on
//                     Home, focused on that assignment
//     review          back to Grades, one student's work on the assignment
//                     (Details) and the work behind a question (View Student
//                     Work), closed again
//     homeAgain       back to Home
//
// Each phase reports what the app asked of the fake backend, with Firestore
// reads counted as Firestore bills them (fakeFirestore.js readsBilled: a
// document read is one; a query or a listener's first snapshot one per document
// and at least one; a later snapshot one per document it added or changed; a
// read or a listener on exactly what an open listener holds rides that
// listener's target, as the SDK has it, and costs nothing more):
//
//   reads            every billed read: asked + pushed + transactionReads
//   asked            the reads this device asked for to show something:
//                    document reads, one-shot queries and each listener's
//                    first snapshot
//   pushed           what open listeners' later snapshots brought: other
//                    people's and the server's writes (the class's heartbeats,
//                    the student's own record after a Submit). Live data the
//                    screen is there to show, arriving on the backend's
//                    timing, so it is reported and not budgeted
//   transactionReads what writes read first: the draft save, and a response
//                    checkpoint, which the queued-work machinery takes when
//                    typing and saving fall a certain way. Reported, not
//                    budgeted: on a loaded machine one run in eight took one
//   rereads          documents read again at a version already read in the phase
//   listenersOpened  every onSnapshot call
//   targetsOpened    the listens the server sees (a listener on a target
//                    another open listener holds shares it)
//   open             listeners still open when the phase ended
//   queries          one-shot queries (getDocs)
//   docReads         getDoc reads
//   snapshots, callables
//
// and the same by path, with per-student paths folded (presence/*, grades/*, …).
//
// BUDGETS (production build): in every phase, asked, listenersOpened,
// targetsOpened, queries, docReads and open may not exceed the numbers in
// BUDGETS, and every phase has one. They are this tree's own counts, which
// repeat exactly from run to run; raise one only with the reason in the
// commit. Exit code 1 when a phase breaks one, or cannot be driven.

import { writeFileSync } from 'node:fs';
import { newSchoolContext } from './schoolClock.mjs';
import { FULL_CLASS } from './fixture.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.PROBE_ORIGIN || 'http://127.0.0.1:5304';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const ONLY = process.env.ONLY || '';
const TRACE = process.env.TRACE === '1';
const CHECK_BUDGETS = process.env.BUDGETS !== 'off';
const SCHOOL = `&fullClass=1&presenceBeat=manual${TRACE ? '&statsTrace=1' : ''}`;
const STUDENT = FULL_CLASS.student;
const TODAY_TITLE = 'Systems of Equations — Lesson 3: Elimination';
const IGNORED_CONSOLE = /Failed to decode downloaded font|OTS parsing error|math fonts could not be loaded|Download the React DevTools|\[vite\]|Failed to load resource/;
// Background syncs the harness does not simulate (fakeFunctions.js): the call
// fails as an undeployed function would and is counted with the callables.
const NOT_SIMULATED = /(callable|no fake for the callable) "(reconcileAssignmentActivityProjection|resolveWeeklyPathGoalSnapshot)"/;

// This tree's counts on the production build, each a ceiling for its phase.
const BUDGETS = Object.freeze({
  student: {
    signIn: { asked: 37, listenersOpened: 15, targetsOpened: 13, queries: 2, docReads: 6, open: 13 },
    openAssignment: { asked: 3, listenersOpened: 1, targetsOpened: 1, queries: 1, docReads: 1, open: 14 },
    answer: { asked: 0, listenersOpened: 0, targetsOpened: 0, queries: 0, docReads: 0, open: 14 },
    finish: { asked: 0, listenersOpened: 0, targetsOpened: 0, queries: 0, docReads: 0, open: 14 },
    results: { asked: 0, listenersOpened: 0, targetsOpened: 0, queries: 0, docReads: 0, open: 14 },
    grades: { asked: 0, listenersOpened: 0, targetsOpened: 0, queries: 0, docReads: 0, open: 13 },
    mathPath: { asked: 4, listenersOpened: 1, targetsOpened: 1, queries: 1, docReads: 4, open: 14 },
    home: { asked: 1, listenersOpened: 0, targetsOpened: 0, queries: 0, docReads: 1, open: 13 },
    midAssignment: { asked: 3, listenersOpened: 1, targetsOpened: 1, queries: 1, docReads: 1, open: 14 },
    reload: { asked: 39, listenersOpened: 16, targetsOpened: 14, queries: 2, docReads: 7, open: 14 },
  },
  teacher: {
    home: { asked: 97, listenersOpened: 65, targetsOpened: 64, queries: 2, docReads: 7, open: 64 },
    grades: { asked: 51, listenersOpened: 2, targetsOpened: 2, queries: 0, docReads: 0, open: 4 },
    monitor: { asked: 62, listenersOpened: 61, targetsOpened: 61, queries: 0, docReads: 0, open: 64 },
    review: { asked: 51, listenersOpened: 1, targetsOpened: 1, queries: 0, docReads: 1, open: 4 },
    homeAgain: { asked: 62, listenersOpened: 61, targetsOpened: 61, queries: 0, docReads: 0, open: 64 },
  },
});

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const problems = [];
const sum = (values) => values.reduce((total, value) => total + value, 0);
// One student's or one document's path stands for all of them.
const fold = (path) => {
  const segments = String(path).split('/');
  return segments.map((segment, index) => (index % 2 === 1 && !['settings', 'platformFlags', 'platformMigrations', 'pathCoverage'].includes(segments[index - 1]) ? '*' : segment)).join('/');
};
const foldCounts = (counts = {}) => Object.entries(counts).reduce((folded, [path, count]) => {
  const key = fold(path);
  return { ...folded, [key]: (folded[key] || 0) + count };
}, {});
const sorted = (counts) => Object.fromEntries(Object.entries(counts).filter(([, count]) => count).sort(([a, x], [b, y]) => y - x || a.localeCompare(b)));

const openSession = async (who, query) => {
  const context = await newSchoolContext(browser, { viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const consoleProblems = [];
  page.on('console', (message) => {
    if (message.type() !== 'error' || IGNORED_CONSOLE.test(message.text()) || NOT_SIMULATED.test(message.text())) return;
    consoleProblems.push(message.text().split('\n')[0].slice(0, 200));
  });
  page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${String(error.message || error).split('\n')[0]}`));
  await page.goto(`${PAGE}?reset=1${query}${SCHOOL}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  return { context, page, consoleProblems, who };
};

// What the fake backend has counted since the last reset, cheaply.
const counters = (page) => page.evaluate(() => {
  const stats = window.__mmHarnessStore?.stats?.() || {};
  delete stats.clientWrites;
  return stats;
});
const movement = async (page) => JSON.stringify(await page.evaluate(() => {
  const stats = window.__mmHarnessStore?.stats?.() || {};
  return [stats.readsBilledTotal, stats.reads, stats.queries, stats.subscriptions, stats.notifications, stats.callables, stats.openListeners];
}));
const budgetedMetrics = ['asked', 'listenersOpened', 'targetsOpened', 'queries', 'docReads', 'open'];

// The app is at rest: nothing it asks of the backend has moved for `quietMs`.
const quiet = async (page, { quietMs = 2500, maxMs = 45_000 } = {}) => {
  const start = Date.now();
  let last = await movement(page);
  let since = Date.now();
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(250);
    const now = await movement(page);
    if (now !== last) { last = now; since = Date.now(); }
    else if (Date.now() - since >= quietMs) return true;
  }
  return false;
};

const summarize = (stats, { stillMoving }) => {
  const billedByPath = foldCounts(stats.readsBilled);
  const rereads = Object.entries(stats.rereadsAtSameVersion || {});
  const extraByPath = rereads.reduce((folded, [key, count]) => {
    const path = fold(key.replace(/@[^@]*$/, ''));
    return { ...folded, [path]: (folded[path] || 0) + count - 1 };
  }, {});
  const opened = foldCounts(stats.subscriptions);
  const open = foldCounts(stats.openListenersByPath);
  const transactionReads = sum(Object.values(stats.transactionReads || {}));
  return {
    reads: stats.readsBilledTotal ?? null,
    asked: (stats.readsBilledTotal ?? 0) - (stats.readsPushedTotal ?? 0) - transactionReads,
    pushed: stats.readsPushedTotal ?? null,
    transactionReads,
    listenersOpened: sum(Object.values(stats.subscriptions || {})),
    targetsOpened: sum(Object.values(stats.targetsOpened || {})),
    queries: sum(Object.values(stats.queries || {})),
    docReads: sum(Object.values(stats.reads || {})) - transactionReads,
    callables: sum(Object.values(stats.callables || {})),
    open: stats.openListeners ?? null,
    rereads: sum(Object.values(extraByPath)),
    snapshots: sum(Object.values(stats.notifications || {})),
    ...(stillMoving ? { stillMoving: true } : {}),
    byPath: {
      reads: sorted(billedByPath),
      pushed: sorted(foldCounts(stats.readsPushed)),
      servedByListener: sorted(foldCounts(stats.readsServedByListener)),
      rereads: sorted(extraByPath),
      docReads: sorted(foldCounts(Object.fromEntries(Object.entries(stats.reads || {}).map(([path, count]) => [path, count - (stats.transactionReads?.[path] || 0)])))),
      transactionReads: sorted(foldCounts(stats.transactionReads)),
      queries: sorted(foldCounts(stats.queries)),
      listenersOpened: sorted(opened),
      targetsOpened: sorted(foldCounts(stats.targetsOpened)),
      open: sorted(open),
      callables: sorted(stats.callables || {}),
    },
    ...(TRACE ? { traces: sorted(stats.traces || {}) } : {}),
  };
};

const runPhases = async (session, steps) => {
  const phases = {};
  for (const [name, action] of steps) {
    // The first phase is the page's load: its counters start with the page.
    if (Object.keys(phases).length) await session.page.evaluate(() => window.__mmHarnessStore.resetStats());
    try {
      await action(session.page);
    } catch (error) {
      if (process.env.SHOT_DIR) {
        await session.page.screenshot({ path: `${process.env.SHOT_DIR}/${session.who}-${name}-failed.png` }).catch(() => {});
        console.error(JSON.stringify(await session.page.locator('a:visible, button:visible').evaluateAll((els) => els.map((e) => `${e.tagName}:${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)}`)).catch(() => [])));
      }
      problems.push(`${session.who} ${name}: could not be driven — ${String(error.message || error).split('\n')[0]}`);
      phases[name] = { failed: String(error.message || error).split('\n')[0] };
      break;
    }
    const settled = await quiet(session.page);
    phases[name] = summarize(await counters(session.page), { stillMoving: !settled });
    if (!settled) problems.push(`${session.who} ${name}: the app was still reading after 45 s`);
    const row = phases[name];
    console.error(`  ${session.who} ${name.padEnd(15)} reads ${String(row.reads).padStart(4)} (asked ${String(row.asked).padStart(3)}, pushed ${String(row.pushed).padStart(3)}, in writes ${row.transactionReads}) · listeners opened ${String(row.listenersOpened).padStart(3)} (targets ${String(row.targetsOpened).padStart(3)}) · open ${String(row.open).padStart(3)} · queries ${row.queries} · doc reads ${row.docReads} · callables ${row.callables}${row.rereads ? ` · re-read ${row.rereads}` : ''}`);
  }
  return phases;
};

/* ------------------------------------------------------------------ student */
const visible = (page, locator) => locator.filter({ visible: true }).first();
const navLink = (page, name) => visible(page, page.getByRole('link', { name: new RegExp(`^${name}$`) }));
const submitButton = (page) => page.locator('button.mathmaster-bar-submit:visible').first();
const typeInto = async (page, field, value) => {
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(value);
};
// This lesson (`?questions=real`): every answer, by question label.
const ANSWERS = {
  'Classwork Q1': ['3/4'],
  'Classwork Q2': ['-2/3', '4'],
  'Practice Q1': ['(3,2)'],
  'Practice Q2': ['(2,3)'],
};
const QUESTION = /[Qq]uestion (\d+) of (\d+)/;
const currentQuestion = async (page) => {
  const heading = await visible(page, page.getByText(/(Warm-Up|Classwork|Practice|DOL|Exit ticket)[^\n]{0,40}[Qq]uestion \d+ of \d+/)).textContent({ timeout: 15_000 }).catch(() => '');
  const section = (heading.match(/Warm-Up|Classwork|Practice/) || [''])[0];
  const number = (heading.match(QUESTION) || [])[1];
  return section && number ? `${section} Q${number}` : heading.trim();
};
const answerBoxes = (page) => page.locator('.mathmaster-question-tool-workspace').locator('math-field:visible, input[type="text"]:visible, input:not([type]):visible');
const answerAndSubmit = async (page) => {
  const label = await currentQuestion(page);
  const values = ANSWERS[label];
  if (!values) throw new Error(`no answer for "${label}"`);
  const fields = answerBoxes(page);
  // The question's own boxes, all of them (a two-part question draws both).
  const end = Date.now() + 20_000;
  while (await fields.count() < values.length && Date.now() < end) await page.waitForTimeout(200);
  const count = await fields.count();
  if (count < values.length) throw new Error(`${label}: ${count} answer boxes for ${values.length} answers`);
  for (let index = 0; index < values.length; index += 1) await typeInto(page, fields.nth(index), values[index]);
  await page.waitForTimeout(300);
  await submitButton(page).click();
  // The outcome is on screen once the question has taken the Submit.
  await page.locator('[data-attempt-results]').first().waitFor({ timeout: 20_000 });
  await quiet(page, { quietMs: 1500 });
  return label;
};
// Next, and the next question on screen (its heading changed).
const next = async (page) => {
  const from = await currentQuestion(page);
  await visible(page, page.getByRole('button', { name: /^Next/ })).click();
  const end = Date.now() + 20_000;
  while (await currentQuestion(page) === from && Date.now() < end) await page.waitForTimeout(200);
  await page.locator('math-field').first().waitFor({ timeout: 20_000 });
};
const toHome = async (page) => {
  await navLink(page, 'Home').click();
  await visible(page, page.getByText(/Welcome, /)).waitFor({ timeout: 30_000 });
};

const studentSession = async () => {
  console.error(`\nstudent ${STUDENT} — a school day`);
  const session = await openSession('student', `&as=student&studentId=${STUDENT}&questions=real&server=1`);
  const { page } = session;
  const phases = await runPhases(session, [
    ['signIn', async () => {
      await visible(page, page.getByText(/Welcome, /)).waitFor({ timeout: 60_000 });
    }],
    ['openAssignment', async () => {
      const card = page.locator('article[data-assignment-card="a-today"]');
      await visible(page, card.getByRole('button', { name: /^(Continue|Start|Resume)/ })).click();
      await page.locator('math-field').first().waitFor({ timeout: 30_000 });
      const at = await currentQuestion(page);
      if (at !== 'Classwork Q1') throw new Error(`today's lesson opened on ${at}`);
    }],
    ['answer', async () => {
      for (const expected of ['Classwork Q1', 'Classwork Q2', 'Practice Q1']) {
        const label = await answerAndSubmit(page);
        if (label !== expected) throw new Error(`expected ${expected}, answered ${label}`);
        await next(page);
      }
    }],
    ['finish', async () => {
      const label = await answerAndSubmit(page);
      if (label !== 'Practice Q2') throw new Error(`expected Practice Q2, answered ${label}`);
    }],
    ['results', async () => {
      await visible(page, page.getByRole('button', { name: /Continue to your results/ })).click();
      await visible(page, page.getByText(TODAY_TITLE)).waitFor({ timeout: 30_000 });
      await page.locator('[data-assignment-result], main').first().waitFor({ timeout: 30_000 });
    }],
    ['grades', async () => {
      // The result page's own way there.
      await visible(page, page.getByRole('button', { name: /^View All Grades$/ })).click();
      await visible(page, page.getByText(/My Grades/)).waitFor({ timeout: 30_000 });
    }],
    ['mathPath', async () => {
      await navLink(page, 'My Math Path').click();
      await visible(page, page.getByRole('button', { name: /^My Progress$/ })).waitFor({ timeout: 60_000 });
    }],
    ['home', async () => { await toHome(page); }],
    ['midAssignment', async () => {
      // "Do this next": pick up where you left off — yesterday's lesson.
      const doThisNext = page.locator('section[aria-labelledby="what-now-heading"]');
      await visible(page, doThisNext.getByRole('button', { name: /^Continue$/ })).click();
      await page.locator('math-field').first().waitFor({ timeout: 30_000 });
      const label = await answerAndSubmit(page);
      if (label !== 'Classwork Q2') throw new Error(`yesterday's lesson resumed on ${label}`);
    }],
    ['reload', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await visible(page, page.getByText(/Welcome, /)).waitFor({ timeout: 60_000 });
      await visible(page, page.getByRole('button', { name: /^(Continue|Resume Question)/ })).click();
      await page.locator('math-field').first().waitFor({ timeout: 30_000 });
    }],
  ]);
  if (session.consoleProblems.length) problems.push(`student console: ${[...new Set(session.consoleProblems)].slice(0, 4).join(' | ')}`);
  await session.context.close();
  return phases;
};

/* ------------------------------------------------------------------ teacher */
const sidebar = async (page, name) => {
  await page.locator('nav, aside').getByRole('button', { name: new RegExp(`${name}(\\s*\\(\\d+\\))?$`) }).first().click();
};
// The simulated class's heartbeats, once, while the teacher looks at the screen.
const beat = async (page) => {
  await page.evaluate(() => window.__mmHarnessStore.beatPresence());
};

const teacherSession = async () => {
  console.error('\nteacher — Home, Grades, the live monitor, a student\'s work');
  const session = await openSession('teacher', '&weeklyPath=ok');
  const { page } = session;
  const phases = await runPhases(session, [
    ['home', async () => {
      await page.getByText('IN SESSION NOW').waitFor({ timeout: 60_000 });
      await quiet(page);
      await beat(page);
    }],
    ['grades', async () => {
      await sidebar(page, 'Grades');
      const chooser = page.locator('section[aria-labelledby="gradebook-choose-class"]');
      await chooser.waitFor({ timeout: 30_000 });
      await chooser.getByRole('button', { name: /Algebra II — Period 3/ }).first().click();
      await page.locator('select[aria-label="Gradebook assignment"]').waitFor({ timeout: 30_000 });
      await page.locator('table tbody tr').nth(29).waitFor({ timeout: 30_000 });
    }],
    ['monitor', async () => {
      await page.locator('section[aria-label="Assignment and class summary"]').getByRole('button', { name: 'Live view' }).click();
      await page.locator('#home-live-class').waitFor({ timeout: 30_000 });
      await quiet(page);
      await beat(page);
    }],
    ['review', async () => {
      await sidebar(page, 'Grades');
      await page.locator('table tbody tr').nth(29).waitFor({ timeout: 30_000 });
      const row = page.locator('table tbody tr').filter({ hasText: `ID ${STUDENT}` }).first();
      await row.getByRole('button', { name: 'Details' }).click();
      await visible(page, page.getByRole('button', { name: 'View Student Work' })).click();
      const dialog = page.getByRole('dialog').last();
      await dialog.waitFor({ timeout: 30_000 });
      await quiet(page, { quietMs: 1500 });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Back to class list' }).first().click();
    }],
    ['homeAgain', async () => {
      await sidebar(page, 'Home');
      await page.getByText('IN SESSION NOW').waitFor({ timeout: 30_000 });
      await quiet(page);
      await beat(page);
    }],
  ]);
  if (session.consoleProblems.length) problems.push(`teacher console: ${[...new Set(session.consoleProblems)].slice(0, 4).join(' | ')}`);
  await session.context.close();
  return phases;
};

/* ------------------------------------------------------------------ run */
const devBuild = await (async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${PAGE}?signedOut=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const dev = await page.evaluate(() => Boolean(document.querySelector('script[type="module"][src="/src/main.jsx"]')));
  await context.close();
  return dev;
})();

const sessions = {};
if (!ONLY || ONLY === 'student') sessions.student = await studentSession();
if (!ONLY || ONLY === 'teacher') sessions.teacher = await teacherSession();
await browser.close();

const TOTALLED = ['reads', 'asked', 'pushed', 'transactionReads', 'rereads', 'listenersOpened', 'targetsOpened', 'queries', 'docReads', 'callables'];
const overBudget = [];
const budgetsChecked = CHECK_BUDGETS && !devBuild;
if (budgetsChecked) {
  Object.entries(sessions).forEach(([who, phases]) => {
    Object.entries(phases).forEach(([phase, row]) => {
      const budget = BUDGETS[who]?.[phase];
      if (row.failed) return;
      if (!budget) { overBudget.push(`${who} ${phase}: no budget`); return; }
      budgetedMetrics.forEach((metric) => {
        if (budget[metric] !== undefined && row[metric] > budget[metric]) overBudget.push(`${who} ${phase}: ${metric} ${row[metric]} > budget ${budget[metric]}`);
      });
    });
  });
}
const totals = Object.fromEntries(Object.entries(sessions).map(([who, phases]) => [who, Object.fromEntries(TOTALLED.map((metric) => [metric, sum(Object.values(phases).map((row) => row[metric] || 0))]))]));

const report = {
  label: process.env.PROBE_LABEL || null,
  origin: ORIGIN,
  build: devBuild ? 'development (StrictMode runs mount effects twice: budgets not checked)' : 'production',
  measuredAt: new Date().toISOString(),
  school: { classStudents: 30, classLessons: 20, student: STUDENT },
  totals,
  sessions,
  budgets: budgetsChecked ? { checked: true, over: overBudget } : { checked: false },
  problems,
};
const json = JSON.stringify(report, null, 2);
console.log(json);
if (process.env.OUT) writeFileSync(process.env.OUT, `${json}\n`);

Object.entries(totals).forEach(([who, row]) => console.error(`${who} session: ${row.reads} reads (${row.asked} asked, ${row.pushed} pushed, ${row.transactionReads} in writes), ${row.listenersOpened} listeners opened (${row.targetsOpened} targets), ${row.queries} queries, ${row.docReads} document reads, ${row.callables} callables`));
if (devBuild) console.error('Development build: StrictMode runs every mount effect twice, so these counts are not production\'s; budgets were not checked.');
if (problems.length) console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
if (overBudget.length) console.error(`\nOver budget:\n- ${overBudget.join('\n- ')}`);
if (problems.length || overBudget.length) process.exit(1);
