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
// Exit code 1 on any finding.

import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
// The module on the dev server (/src/…/teacherAuthoringKit.js?…) or the
// production build (/assets/teacherAuthoringKit-<hash>.js).
const AUTHORING_CODE = /\/teacherAuthoringKit(?:-[\w-]+)?\.js(?:\?|$)/;
const CLASSES_SCREEN = /\/ClassesWorkspace(?:-[\w-]+)?\.(?:jsx|js)(?:\?|$)/;
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
const openTeacher = async ({ saveData = false, fail = [] } = {}) => {
  const context = await newSchoolContext(browser, { viewport: { width: 1366, height: 768 } });
  if (saveData) {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true, addEventListener() {}, removeEventListener() {} }) });
    });
  }
  for (const pattern of fail) await context.route(pattern, (route) => route.fulfill(HOSTING_REWRITE));
  const page = await context.newPage();
  const asked = [];
  page.on('request', (request) => { if (AUTHORING_CODE.test(request.url())) asked.push(request.url()); });
  await page.goto(`${PAGE}?reset=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await homeHeading(page).waitFor({ timeout: 120_000 });
  return { context, page, asked };
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

await browser.close();
passed.forEach((label) => console.log(`ok   ${label}`));
if (findings.length) {
  console.error(`\n${findings.length} finding(s):\n- ${findings.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nteacher code recovery: ${passed.length} checks passed.`);
