// A TEACHER'S CODE THAT CANNOT LOAD — AGAINST THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/teacherCodeRecovery.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188; it runs the
//    same on the harness built as production, vite.production.config.mjs;
//    PLAYWRIGHT_MODULE and CHROMIUM_PATH as journeys.mjs.)
//
// The teacher's workspace takes its authoring code from a module it loads on
// demand (src/app/teacher/teacherAuthoringKit.js, through authoringKitLoader
// .js), and each of its screens is a chunk of its own (app/lazyScreens.js). A
// tab opened before a deploy asks for a chunk the new release no longer has,
// and Hosting's SPA rewrite answers with the HTML page, which the browser
// refuses as a module. Every such failure must reach AppErrorBoundary's
// "MathMaster was just updated", whose button loads the new version: never a
// blank screen, half a list, or the panel for a bug. The browser is given the
// HTML page for the chunk here, as Hosting would:
//
//   C1  the idle prefetch of the authoring code fails: nothing is shown, and
//       Home stays as it was
//   C2  Assignments, which reads the authoring code as it draws: "MathMaster
//       was just updated"; once the new version is there, its button loads a
//       page that draws
//   C3  an action (the device saves data, so the code was never fetched
//       ahead): an assignment's details, More…, Review / edit setup: the same
//       panel
//   C4  a teacher screen's own chunk (Classes): the same panel
//
// The panels the workspace draws closed, and Home's Ask my teacher math, load
// on demand too (src/app/teacher/teacherPanels.js), each fetched while the
// browser is idle once the workspace has drawn:
//
//   C5  an assignment's details: its idle prefetch fails and nothing is shown,
//       Home stays; the details opened from Home: "MathMaster was just updated"
//   C6  Ask my teacher's math, with a student's question waiting: while
//       Period 3 is in session the panel only counts, which needs no math, so
//       its failure shows nothing; once the class ends the list needs it: the
//       same panel; the new version's page draws the question, its prompt's
//       mathematics typeset
//   C7  Find, on a device that saves data: its code is asked for as the
//       workspace draws all the same (it opens on a keystroke), and its
//       failure shows nothing until Find is opened: then the same panel
//
// And code that has not arrived yet, or cannot while the device is offline:
//
//   C8  Find on a device that saves data, with focus in another box: Ctrl+K
//       and a name typed at once go to Find's box, not to the other one
//   C9  a student's details opened while the device is offline, on a device
//       that saves data (nothing fetched ahead): nothing replaces the app, a
//       note says they open once the device is back online, and then they
//       open, with focus on their Close
//   C10 a teacher screen whose code is not here, opened offline:
//       AppErrorBoundary says it could not load and to check the connection,
//       not that MathMaster was updated, and its button reloads only once the
//       device is back online (a reload offline is the browser's own error
//       page)
//
// Offline is the device's as the app reads it (navigator.onLine and the
// online event), with every request failing while it lasts. Chromium's own
// offline mode would also cut the dev server's live-reload socket, whose
// reconnection reloads the page.
//
// Exit code 1 on any finding.

import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
// The module on the dev server (/src/…/teacherAuthoringKit.js?…) or the
// production build (/assets/teacherAuthoringKit-<hash>.js).
const AUTHORING_CODE = /\/teacherAuthoringKit(?:-[\w-]+)?\.js(?:\?|$)/;
const CLASSES_SCREEN = /\/ClassesWorkspace(?:-[\w-]+)?\.(?:jsx|js)(?:\?|$)/;
// A closed panel's chunk, and the prompts' math (MathText's, which brings MathLive).
const ASSIGNMENT_DETAILS = /\/AssignmentHub(?:-[\w-]+)?\.(?:jsx|js)(?:\?|$)/;
const FIND_PALETTE = /\/TeacherQuickSearch(?:-[\w-]+)?\.(?:jsx|js)(?:\?|$)/;
const PROMPT_MATH = /\/MathText(?:-[\w-]+)?\.(?:jsx|js)(?:\?|$)/;
const HOSTING_REWRITE = { status: 200, contentType: 'text/html', body: '<!doctype html><html><head><title>MathMaster</title></head><body><div id="root"></div></body></html>' };

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const passed = [];
const expect = (label, condition, detail) => {
  if (condition) passed.push(label);
  else findings.push(`${label}: ${detail}`);
};

const homeHeading = (page) => page.locator('main h2').filter({ hasText: /^Good (morning|afternoon|evening)$/ }).first();
const sidebar = (page, name) => page.locator('nav[aria-label="Teacher dashboard navigation"]').getByRole('button', { name: new RegExp(`${name}(\\s*\\(\\d+\\))?$`) }).first();
const panel = (page) => page.locator('[data-recovery-panel]');

// A school Chromebook on this harness; `saveData` as a device that asks to
// save data (no prefetch: each screen's code arrives when it is opened).
// `watch`: the code whose requests `asked` counts (the authoring code unless
// named); `before(page)`: run on the store before the teacher's page opens;
// `ready(page)`: what the page has drawn when the scene starts (Home's heading
// unless named).
const openTeacher = async ({ saveData = false, fail = [], watch = AUTHORING_CODE, query = 'reset=1', before = null, ready = null, network = null } = {}) => {
  const context = await newSchoolContext(browser, { viewport: { width: 1366, height: 768 } });
  if (network) await emulateConnection(context, network);
  if (saveData) {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true, addEventListener() {}, removeEventListener() {} }) });
    });
  }
  for (const pattern of fail) await context.route(pattern, (route) => route.fulfill(HOSTING_REWRITE));
  const page = await context.newPage();
  const asked = [];
  page.on('request', (request) => { if (watch.test(request.url())) asked.push(request.url()); });
  if (before) {
    await page.goto(`${PAGE}?reset=1&questions=real&signedOut=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForFunction(() => Boolean(window.__mmHarnessStore), null, { timeout: 120_000 });
    await before(page);
  }
  await page.goto(`${PAGE}?${query}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await (ready ? ready(page) : homeHeading(page).waitFor({ timeout: 120_000 }));
  return { context, page, asked };
};

// The device's connection as the page sees it: `network.offline(page)` and
// `network.online(page)` flip navigator.onLine and fire the browser's event;
// while offline every request fails as a dropped connection does.
const connection = () => ({ isOffline: false });
const emulateConnection = async (context, network) => {
  await context.addInitScript(() => {
    let offline = false;
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => !offline });
    window.__mmSetOffline = (value) => {
      offline = value;
      window.dispatchEvent(new Event(value ? 'offline' : 'online'));
    };
  });
  await context.route('**/*', (route) => (network.isOffline ? route.abort('internetdisconnected') : route.fallback()));
  network.offline = async (page) => { network.isOffline = true; await page.evaluate(() => window.__mmSetOffline(true)); };
  network.online = async (page) => { network.isOffline = false; await page.evaluate(() => window.__mmSetOffline(false)); };
};

// Waits until `asked` has a request, or 30 s (the idle prefetch runs within 5 s at 1x CPU).
const untilAsked = async (page, asked) => {
  const deadline = Date.now() + 30_000;
  while (!asked.length && Date.now() < deadline) await page.waitForTimeout(250);
  await page.waitForTimeout(1500);
};

const panelSays = async (page, label) => {
  const shown = await panel(page).first().waitFor({ timeout: 60_000 }).then(() => true, () => false);
  expect(`${label}: AppErrorBoundary takes the screen`, shown, 'no recovery panel within 60 s');
  if (!shown) return false;
  const tone = await panel(page).first().getAttribute('data-recovery-panel');
  const text = await panel(page).first().innerText();
  expect(`${label}: AppErrorBoundary says MathMaster was just updated`, tone === 'updated' && /MathMaster was just updated/.test(text), `${tone}: ${text.split('\n')[0]}`);
  expect(`${label}: it offers the new version`, await page.getByRole('button', { name: 'Load the new version' }).isVisible(), 'no "Load the new version" button');
  expect(`${label}: nothing blames the screen or a bug`, !/Something went wrong|set up|could not start/i.test(text), text.split('\n')[0]);
  return true;
};

// Each scene on a context of its own; one that cannot be driven is a finding,
// and the next still runs.
const scene = async (label, run) => {
  try {
    await run();
  } catch (error) {
    findings.push(`${label}: could not be driven — ${String(error.message || error).split('\n')[0]}`);
  }
};

// C1, C2: the authoring code's chunk is gone.
await scene('C1/C2', async () => {
  const { context, page, asked } = await openTeacher({ fail: [AUTHORING_CODE] });
  // The workspace fetches it once the browser is idle (at the latest 5 s, at 1x CPU).
  const deadline = Date.now() + 30_000;
  while (!asked.length && Date.now() < deadline) await page.waitForTimeout(250);
  await page.waitForTimeout(1500);
  expect('C1 the idle prefetch asks for the authoring code once Home has drawn', asked.length > 0, 'no request for it within 30 s');
  expect('C1 its failure shows nothing', (await panel(page).count()) === 0, await panel(page).first().innerText().catch(() => ''));
  expect('C1 and Home stays', await homeHeading(page).isVisible(), 'Home\'s heading is gone');
  await sidebar(page, 'Assignments').click();
  if (!await panelSays(page, 'C2 Assignments')) { await context.close(); return; }
  // The new version is there now: the button loads it, and the page draws.
  await context.unroute(AUTHORING_CODE);
  await Promise.all([
    page.waitForURL(/_mm_reload=/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Load the new version' }).click(),
  ]);
  await homeHeading(page).waitFor({ timeout: 120_000 });
  await sidebar(page, 'Assignments').click();
  await page.getByRole('heading', { name: /^Assignments/ }).first().waitFor({ timeout: 120_000 });
  expect('C2 after the new version loads, Assignments draws', (await panel(page).count()) === 0, 'the panel is still there');
  await context.close();
});

// C3: an action needs the code first.
await scene('C3', async () => {
  const { context, page, asked } = await openTeacher({ saveData: true, fail: [AUTHORING_CODE] });
  await page.waitForTimeout(6500);
  expect('C3 a device saving data does not fetch the authoring code ahead', asked.length === 0, `${asked.length} request(s)`);
  await sidebar(page, 'Classes').click();
  await page.getByRole('button', { name: /Algebra II — Period 3/ }).first().click();
  await page.locator('[data-lesson-group="today"]').first().getByRole('button', { name: 'Details' }).click();
  const hub = page.locator('[data-assignment-hub]');
  await hub.waitFor({ timeout: 60_000 });
  await hub.locator('details.tw-more > summary').click();
  await hub.getByRole('button', { name: 'Review / edit setup' }).click();
  await panelSays(page, 'C3 Review / edit setup');
  expect('C3 the action asked for the authoring code', asked.length > 0, 'no request');
  await context.close();
});

// C4: a teacher screen's own chunk.
await scene('C4', async () => {
  const { context, page } = await openTeacher({ fail: [CLASSES_SCREEN] });
  await sidebar(page, 'Classes').click();
  await panelSays(page, 'C4 Classes');
  await context.close();
});

// C5: an assignment's details, a panel drawn closed on every screen.
await scene('C5', async () => {
  const { context, page, asked } = await openTeacher({ fail: [ASSIGNMENT_DETAILS], watch: ASSIGNMENT_DETAILS });
  await untilAsked(page, asked);
  expect('C5 the idle prefetch asks for an assignment\'s details once Home has drawn', asked.length > 0, 'no request for it within 30 s');
  expect('C5 its failure shows nothing', (await panel(page).count()) === 0, await panel(page).first().innerText().catch(() => ''));
  expect('C5 and Home stays', await homeHeading(page).isVisible(), 'Home\'s heading is gone');
  await page.locator('section[aria-labelledby="home-class-now"]').getByRole('button', { name: 'Details' }).first().click();
  await panelSays(page, 'C5 an assignment\'s details');
  await context.close();
});

// C6: Ask my teacher's math. A Period 5 student's question about "Write 6/8
// in lowest terms." waits; Period 3 is in session, so Home only counts it.
const P5_QUESTION = {
  schemaVersion: 1, studentId: '910020', classId: 'c-alg1-p5', teacherEmail: 'teacher@harness.example', assignmentId: 'a-p5',
  assignmentTitle: 'Linear Equations — Lesson 5', questionIndex: 1, questionLabel: 'Classwork · Question 1',
  text: 'How do I make the fraction smaller?', status: 'open',
};
const endPeriodThree = (page) => page.evaluate(() => {
  const store = window.__mmHarnessStore;
  const schedule = JSON.parse(JSON.stringify(store.get('settings/classSchedule')));
  Object.values(schedule.modifiedSchedules).forEach((day) => { day.periods['Period 3'] = { enabled: true, start: '05:00', end: '05:30' }; });
  store.set('settings/classSchedule', schedule);
});
await scene('C6', async () => {
  const { context, page, asked } = await openTeacher({
    fail: [PROMPT_MATH],
    watch: PROMPT_MATH,
    query: '',
    before: (seed) => seed.evaluate((question) => {
      const now = Date.now();
      window.__mmHarnessStore.set('askTeacherQuestions/910020__a-p5__1', { ...question, createdAt: now - 60_000, updatedAt: now - 60_000 });
    }, P5_QUESTION),
    // The count, or the recovery panel if the failure took the screen.
    ready: (page) => page.locator('[data-student-questions][data-withheld], [data-recovery-panel]').first().waitFor({ timeout: 120_000 }),
  });
  const counted = page.locator('[data-student-questions][data-withheld]');
  const shown = await counted.waitFor({ timeout: 60_000 }).then(() => true, () => false);
  expect('C6 in class, Home counts the waiting question', shown && /Questions from students\s*1/.test(await counted.innerText().catch(() => '')), 'no count');
  await untilAsked(page, asked);
  expect('C6 the prompts\' math is asked for as soon as a question waits', asked.length > 0, 'no request for it within 30 s');
  await page.waitForTimeout(3000);
  expect('C6 while only the count needs drawing, its failure shows nothing', (await panel(page).count()) === 0, await panel(page).first().innerText().catch(() => ''));
  expect('C6 and Home stays', await homeHeading(page).isVisible(), 'Home\'s heading is gone');
  // The class ends (the bell schedule is live): the list would draw its prompt.
  await endPeriodThree(page);
  if (!await panelSays(page, 'C6 the class ends, the list needs the math')) { await context.close(); return; }
  await context.unroute(PROMPT_MATH);
  await Promise.all([
    page.waitForURL(/_mm_reload=/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Load the new version' }).click(),
  ]);
  await homeHeading(page).waitFor({ timeout: 120_000 });
  const questions = page.locator('details[data-student-questions]');
  await questions.waitFor({ timeout: 60_000 });
  await questions.locator(':scope > summary').click();
  const prompt = questions.locator('[data-student-question] details');
  await prompt.locator('summary').click();
  const typeset = await page.waitForFunction(() => {
    const element = document.querySelector('[data-student-questions] [data-student-question] details math-span, [data-student-questions] [data-student-question] details math-div');
    return Boolean(element?.shadowRoot?.querySelector('[part="render"]')?.innerHTML);
  }, null, { timeout: 60_000 }).then(() => true, () => false);
  expect('C6 after the new version loads, the question draws, its prompt\'s mathematics typeset', typeset && (await panel(page).count()) === 0, typeset ? 'the panel is still there' : 'the prompt\'s math was not typeset within 60 s');
  await context.close();
});

// C7: Find on a device that saves data, its code gone.
await scene('C7', async () => {
  const { context, page, asked } = await openTeacher({ saveData: true, fail: [FIND_PALETTE], watch: FIND_PALETTE });
  await untilAsked(page, asked);
  expect('C7 a device saving data asks for Find\'s code as the workspace draws', asked.length > 0, 'no request before Find was opened');
  expect('C7 its failure shows nothing', (await panel(page).count()) === 0 && await homeHeading(page).isVisible(), await panel(page).first().innerText().catch(() => 'Home\'s heading is gone'));
  await page.getByRole('button', { name: /^Find…/ }).first().click();
  await panelSays(page, 'C7 Find');
  await context.close();
});

// C8: Find opened by its keystroke on a device that saves data, while
// another box has focus.
await scene('C8', async () => {
  const { context, page, asked } = await openTeacher({ saveData: true, watch: FIND_PALETTE });
  await sidebar(page, 'Students').click();
  const search = page.getByPlaceholder('Search student or class');
  await search.waitFor({ timeout: 120_000 });
  expect('C8 Find\'s code is asked for as the workspace draws, on a device that saves data too', asked.length > 0, 'not asked for before Find was opened');
  await search.click();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Garza');
  const box = page.locator('[aria-label="Find a student, class, assignment or standard"] input[type="search"]');
  await box.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(400);
  const typed = await box.inputValue();
  const other = await search.inputValue();
  expect('C8 what is typed after Ctrl+K goes to Find\'s box', typed === 'Garza', `Find's box: "${typed}"`);
  expect('C8 and not to the box that had focus', other === '', `the student search box: "${other}"`);
  await context.close();
});

// C9: a student's details, opened offline before their code is here.
await scene('C9', async () => {
  const network = connection();
  const { context, page } = await openTeacher({ saveData: true, network });
  await page.waitForTimeout(1500);
  await network.offline(page);
  await page.locator('[data-live-tile] button').first().click();
  const note = page.locator('[data-panel-offline]');
  const noted = await note.first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
  expect('C9 opened offline, a note says the student\'s details open once the device is back online', noted && /offline/i.test(await note.first().innerText()), noted ? await note.first().innerText() : 'no note');
  await page.waitForTimeout(2000);
  expect('C9 nothing replaces the app', (await panel(page).count()) === 0 && await homeHeading(page).isVisible(), await panel(page).first().innerText().catch(() => 'Home\'s heading is gone'));
  await network.online(page);
  const drawer = page.locator('[data-student-profile-drawer]');
  const opened = await drawer.waitFor({ timeout: 60_000 }).then(() => true, () => false);
  expect('C9 back online, the details open', opened, 'no drawer within 60 s');
  if (opened) {
    await page.waitForTimeout(600);
    expect('C9 and the note is gone', (await note.count()) === 0, 'the note is still there');
    const focus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '');
    expect('C9 with focus on their Close', /Close student profile/.test(focus), `focus on "${focus}"`);
  }
  await context.close();
});

// C10: a teacher screen whose code is not here, opened offline.
await scene('C10', async () => {
  const network = connection();
  const { context, page } = await openTeacher({ network });
  await page.waitForTimeout(1500);
  await network.offline(page);
  await sidebar(page, 'Classes').click();
  const shown = await panel(page).first().waitFor({ timeout: 60_000 }).then(() => true, () => false);
  expect('C10 AppErrorBoundary takes the screen', shown, 'no recovery panel within 60 s');
  if (!shown) { await context.close(); return; }
  const text = await panel(page).first().innerText();
  expect('C10 it says the screen could not load and to check the connection', /could not load/i.test(text) && /connected to the internet/i.test(text), text.split('\n').slice(0, 3).join(' / '));
  expect('C10 it does not say MathMaster was updated', !/was just updated/i.test(text), text.split('\n')[0]);
  const before = page.url();
  await page.getByRole('button', { name: /Try again|Load the new version/ }).first().click();
  await page.waitForTimeout(2500);
  expect('C10 its button does not reload while the device is offline', page.url() === before && (await panel(page).count()) === 1, `now at ${page.url()}`);
  await network.online(page);
  await Promise.all([
    page.waitForURL(/_mm_reload=/, { timeout: 60_000 }),
    page.getByRole('button', { name: /Try again|Load the new version/ }).first().click(),
  ]);
  await homeHeading(page).waitFor({ timeout: 120_000 });
  await sidebar(page, 'Classes').click();
  await page.getByRole('button', { name: /Algebra II — Period 3/ }).first().waitFor({ timeout: 120_000 });
  expect('C10 back online, its button loads a page whose screen draws', (await panel(page).count()) === 0, 'the panel is still there');
  await context.close();
});

await browser.close();
passed.forEach((label) => console.log(`ok   ${label}`));
if (findings.length) {
  console.error(`\n${findings.length} finding(s):\n- ${findings.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nteacher code recovery: ${passed.length} checks passed.`);
