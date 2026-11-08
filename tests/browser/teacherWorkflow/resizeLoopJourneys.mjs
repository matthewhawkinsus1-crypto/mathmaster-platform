// NO RESIZEOBSERVER LOOP ERROR ON A PHONE, IN THE REAL APP: WORK VIEW, 200%
// TEXT, A PHONE TURNED, THE KEYPAD AND THE NAVIGATOR.
//
//   TEACHER_HARNESS_PORT=5383 npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   FONTCONFIG_FILE="$PWD/tests/browser/support/ciFonts.conf" \
//     TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5383 node tests/browser/teacherWorkflow/resizeLoopJourneys.mjs
//
//   (PLAYWRIGHT_MODULE / CHROMIUM_PATH when the defaults are not installed;
//    CYCLES=<n>, 3 by default.)
//
// A ResizeObserver callback that writes what it measures can resize, inside
// the observer's delivery, elements other observers watch; the browser then
// fires "ResizeObserver loop completed with undelivered notifications". Here
// it is not a page error and not a console line, only a window "error" event,
// so this listens there, and names every element the observers were delivered
// in that frame.
//
// The student (910004, synthetic) is on today's lesson as Systems Workspace
// tasks (`?questions=systems`), Period 3 well under way, on a 390×844 touch
// phone. Practice 1 is the construct question: number boxes (the keypad), a
// graph and Work View. Each cycle, in the page: the navigator folds and opens
// (its height, stickyHeightRef), a number box opens the keypad, the text goes
// to 200%, the phone turns and comes back, the navigator again, 100%; then in
// Work View: 200%, turned, a number box, upright, 100%, closed.
//
// Before the identity bar published its height after its observer reported
// it (platform/layout/publishAfterResize.js), Work View at 200% and Work View
// turned raised the error in every cycle: on a phone the assignment screen is
// sized from that height. The run ends with an observer that resizes its own
// target, which must be caught: a listener that hears nothing fails too.
//
// Exit code 1 on any failure.

import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const CYCLES = Number(process.env.CYCLES || 3);
const UPRIGHT = { width: 390, height: 844 };
const SIDEWAYS = { width: 844, height: 390 };
const NUMBER_BOX = 'input[type="number"]:visible, input[data-mathmaster-mobile-keypad="true"]:visible';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};

// Every loop error, with the elements the observers were delivered in its frame.
const LISTEN_FOR_LOOPS = () => {
  window.__mmResizeLoops = [];
  let delivered = [];
  const nextFrame = () => { delivered = []; requestAnimationFrame(nextFrame); };
  requestAnimationFrame(nextFrame);
  const name = (node) => {
    const classes = typeof node?.className === 'string' ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    return `${String(node?.tagName || '?').toLowerCase()}${classes.length ? `.${classes.join('.')}` : ''}`;
  };
  const Native = window.ResizeObserver;
  if (typeof Native === 'function') {
    window.ResizeObserver = class extends Native {
      constructor(callback) {
        super((entries, observer) => {
          delivered.push(...entries.map((entry) => name(entry.target)));
          return callback(entries, observer);
        });
      }
    };
  }
  window.addEventListener('error', (event) => {
    if (/ResizeObserver loop/.test(String(event.message || ''))) window.__mmResizeLoops.push([...new Set(delivered)].join(' + '));
  });
};

const context = await newSchoolContext(browser, { viewport: UPRIGHT, isMobile: true, hasTouch: true });
await context.addInitScript(LISTEN_FOR_LOOPS);
const page = await context.newPage();
page.on('pageerror', (error) => failures.push(`page error ${error.message}`));
const cdp = await context.newCDPSession(page);
const textSize = (scale) => cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 * scale, fixed: Math.round(13 * scale) } });
const settle = (ms = 450) => page.waitForTimeout(ms);
const loopsSoFar = () => page.evaluate(() => (window.__mmResizeLoops || []).splice(0));

const loops = [];
const steps = { keypad: 0, workView: 0 };
// One step, then the loop errors it raised.
const step = async (label, action) => {
  await action();
  await settle();
  (await loopsSoFar()).forEach((targets) => loops.push(`${label} [${targets}]`));
};

const search = new URLSearchParams({ reset: '1', as: 'student', studentId: '910004', questions: 'systems', p3StartMin: '40' });
await page.goto(`${ORIGIN}/tests/browser/teacherWorkflow/index.html?${search}`, { timeout: 180000 });
await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
await settle(800);
await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
await page.locator('.mathmaster-question-stage').first().waitFor({ timeout: 60000 });
await settle(1500);

const navigator = page.locator('.mathmaster-focus-view-button');
const foldAndOpen = async () => {
  await navigator.click();
  await settle(300);
  await navigator.click();
};
// Practice 1, through the navigator a student uses.
if (/show progress/i.test(await navigator.innerText())) await navigator.click();
await settle(400);
await page.locator('.mathmaster-section-tab', { hasText: 'Practice' }).first().click();
await settle(500);
await page.locator('.mathmaster-question-number', { hasText: /^1$/ }).first().click();
await settle(1500);
check(/constructing/i.test(await page.evaluate(() => document.querySelector('.mathmaster-question-stage')?.innerText || '')), 'Practice 1 is the construct question');
(await loopsSoFar()).forEach((targets) => loops.push(`opening [${targets}]`));

try {
  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    const tag = `cycle ${cycle}`;
    await step(`${tag}: the navigator folds and opens`, foldAndOpen);
    await step(`${tag}: a number box opens the keypad`, async () => {
      await page.locator(`.mathmaster-question-stage ${NUMBER_BOX}`).first().tap();
      await settle(300);
      if (await page.evaluate(() => document.documentElement.dataset.mobileKeypadOpen === 'true')) steps.keypad += 1;
    });
    await step(`${tag}: 200% text, keypad open`, () => textSize(2));
    await step(`${tag}: the phone turns`, () => page.setViewportSize(SIDEWAYS));
    await step(`${tag}: and comes back`, () => page.setViewportSize(UPRIGHT));
    await step(`${tag}: the navigator at 200%`, foldAndOpen);
    await step(`${tag}: 100% text`, () => textSize(1));
    await step(`${tag}: Work View opens`, async () => {
      await page.locator('.mathmaster-work-view-opener:visible').first().click();
      await settle(700);
      if (await page.locator('.mathmaster-work-view-actions').count()) steps.workView += 1;
    });
    await step(`${tag}: Work View at 200%`, () => textSize(2));
    await step(`${tag}: Work View turned`, () => page.setViewportSize(SIDEWAYS));
    await step(`${tag}: a number box in Work View`, async () => {
      const box = page.locator(`[role="dialog"] ${NUMBER_BOX}`).first();
      if (await box.count()) await box.tap();
    });
    await step(`${tag}: Work View upright`, () => page.setViewportSize(UPRIGHT));
    await step(`${tag}: Work View at 100%`, () => textSize(1));
    await step(`${tag}: Work View closes`, () => page.getByRole('button', { name: /^Close/ }).first().click());
  }
} catch (error) {
  check(false, 'the cycles ran', error?.stack || String(error));
}

check(steps.keypad === CYCLES, 'every cycle opened the number keypad', `${steps.keypad} of ${CYCLES}`);
check(steps.workView === CYCLES, 'every cycle opened Work View', `${steps.workView} of ${CYCLES}`);
check(loops.length === 0, 'no ResizeObserver loop error', loops.slice(0, 6).join(' | '));

// The listener hears a loop when there is one.
await page.evaluate(() => {
  const box = document.createElement('div');
  box.style.height = '10px';
  document.body.appendChild(box);
  let height = 10;
  new ResizeObserver(() => { height += 1; if (height < 20) box.style.height = `${height}px`; }).observe(box);
});
await settle(800);
check((await loopsSoFar()).length > 0, 'control: an observer that resizes its own target is caught');

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nno ResizeObserver loop on a phone: all checks passed');
process.exit(failures.length ? 1 : 0);
