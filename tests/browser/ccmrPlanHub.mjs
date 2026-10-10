// The CCMR hub with a saved plan, measured at 1366x768 and 390x844.
//
// HOW TO RUN:
//
//   npx vite --port 5216 --strictPort &
//   AUDIT_ORIGIN=http://localhost:5216 node tests/browser/ccmrPlanHub.mjs
//
// WHAT IT CHECKS:
//
//   1. THE PLAN IS ON SCREEN. Goals, the test date, each test's benchmark and
//      the countdown ("SAT math benchmark: 530 · 23 days to your test").
//   2. TEACHERS CANNOT EDIT. The read-only scenes render no date field and no
//      Save button, and the goal checkboxes are disabled.
//   3. SAVING WORKS. A new date saved from the field moves the countdown; a
//      goal toggled off drops out of the plan.
//   4. SIDEWAYS SCROLL. Measured on the document (clientWidth is the layout
//      viewport; innerWidth lies under mobile emulation).
//   5. TAP TARGETS. Every control at least 44px each way; a checkbox counts
//      as its whole label, which is what a thumb actually hits.
//   6. WHITE SCREEN. Any thrown error, console error or blank render.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted at the browser.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5216';
const MIN_TAP = 44;
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

const SCENES = [
  {
    name: 'student',
    mustContain: ['I\'m preparing for:', 'My test date (optional)', 'SAT math benchmark: 530 · 23 days to your test', 'TSIA2 math benchmark: 950', 'Save date', 'Remove date'],
    mustHave: ['input[type="date"]', 'select[aria-label="Which test is on this date"]'],
  },
  { name: 'studentNoPlan', mustContain: ['I\'m preparing for:', 'Choosing one moves it up your list'], mustNotHave: ['input[type="date"]'] },
  { name: 'studentLoading', mustContain: ['Loading your plan…'], disabledCheckboxes: true },
  {
    name: 'teacher',
    mustContain: ['Teacher read-only view', 'Test date:', 'Sat, Nov 14, 2026 · ACT', 'ACT math benchmark: 22 · 38 days to the test', 'ASVAB: no single math benchmark score'],
    mustNotHave: ['input[type="date"]'],
    mustNotContain: ['Save date', 'Remove date'],
    disabledCheckboxes: true,
  },
  { name: 'teacherNoPlan', mustContain: ['Teacher read-only view'], mustNotHave: ['input[type="date"]'], disabledCheckboxes: true },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const findings = [];
const report = [];
const blocked = [];

const measure = (page) => page.evaluate((minTap) => {
  const root = document.querySelector('[data-mm-scene]');
  const viewportWidth = document.documentElement.clientWidth;
  const visible = (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const controls = [...document.querySelectorAll('button, a[href], input, select, [role="button"]')].filter(visible);
  const smallTargets = controls.map((element) => {
    const target = (element.type === 'checkbox' || element.type === 'radio') && element.closest('label')
      ? element.closest('label')
      : element;
    const box = target.getBoundingClientRect();
    return {
      label: (target.innerText || element.getAttribute('aria-label') || element.value || element.tagName).trim().slice(0, 40),
      height: Math.round(box.height),
      width: Math.round(box.width),
    };
  }).filter((entry) => entry.height < minTap || entry.width < minTap);
  const overflowing = [...document.querySelectorAll('*')]
    .map((element) => ({ element, box: element.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 0 && box.right > viewportWidth + 1)
    .map(({ element, box }) => ({ tag: element.tagName.toLowerCase(), right: Math.round(box.right), text: (element.innerText || '').trim().slice(0, 40) }))
    .slice(0, 5);
  return {
    crashed: Boolean(root?.querySelector('[data-mm-crashed]')),
    text: (root?.innerText || '').replace(/\s+/g, ' ').trim(),
    elements: root ? root.querySelectorAll('*').length : 0,
    viewportWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    controls: controls.length,
    smallTargets,
    overflowing,
    checkboxes: [...document.querySelectorAll('input[type="checkbox"]')].map((box) => ({ disabled: box.disabled || Boolean(box.closest('fieldset[disabled]')) })),
  };
}, MIN_TAP);

const check = (label, seen, scene, extraProblems = []) => {
  const problems = [...extraProblems];
  if (seen.crashed) problems.push('crashed');
  if (seen.elements < 10) problems.push(`blank render (${seen.elements} elements)`);
  if (seen.documentScrollWidth > seen.viewportWidth + 1) problems.push(`horizontal scroll: ${seen.documentScrollWidth} > ${seen.viewportWidth}`);
  if (seen.overflowing.length) problems.push(`overflowing: ${JSON.stringify(seen.overflowing)}`);
  if (seen.smallTargets.length) problems.push(`tap targets under ${MIN_TAP}px: ${JSON.stringify(seen.smallTargets)}`);
  (scene.mustContain || []).forEach((needle) => { if (!seen.text.includes(needle)) problems.push(`missing text: ${needle}`); });
  (scene.mustNotContain || []).forEach((needle) => { if (seen.text.includes(needle)) problems.push(`should not show: ${needle}`); });
  if (scene.disabledCheckboxes && seen.checkboxes.some((box) => !box.disabled)) problems.push('a goal checkbox is editable here');
  report.push({ label, controls: seen.controls, width: seen.viewportWidth, scrollWidth: seen.documentScrollWidth, problems: problems.length });
  if (problems.length) findings.push({ label, problems });
};

for (const device of VIEWPORTS) {
  const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch, deviceScaleFactor: device.isMobile ? 2 : 1 });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith('http://localhost') || url.startsWith('ws://localhost')) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  await page.goto(`${ORIGIN}/tests/browser/ccmrPlanHub.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__mmCcmrScene === 'function', { timeout: 60000 });

  for (const scene of SCENES) {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    await page.evaluate((name) => window.__mmCcmrScene(name), scene.name);
    await page.waitForTimeout(400);
    const extra = [];
    for (const selector of scene.mustHave || []) {
      if (!(await page.$(selector))) extra.push(`missing control: ${selector}`);
    }
    for (const selector of scene.mustNotHave || []) {
      if (await page.$(selector)) extra.push(`should not render: ${selector}`);
    }
    const seen = await measure(page);
    if (consoleErrors.length) extra.push(`console errors: ${consoleErrors.join(' | ').slice(0, 300)}`);
    if (pageErrors.length) extra.push(`page errors: ${pageErrors.join(' | ').slice(0, 300)}`);
    check(`${device.name}/${scene.name}`, seen, scene, extra);
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/tmp'}/ccmr-${device.name}-${scene.name}.png`, fullPage: true });
  }

  // INTERACTION: save a new date, then drop a goal, as a student.
  consoleErrors.length = 0;
  pageErrors.length = 0;
  await page.evaluate(() => { window.__mmCcmrSaves = []; window.__mmCcmrScene('studentNoPlan'); });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__mmCcmrScene('student'));
  await page.waitForTimeout(300);
  await page.fill('input[type="date"]', '2026-11-04');
  await page.getByRole('button', { name: 'Save date' }).click();
  await page.waitForTimeout(250);
  let seen = await measure(page);
  const interactionProblems = [];
  if (!seen.text.includes('SAT math benchmark: 530 · 28 days to your test')) interactionProblems.push('the saved date did not move the countdown to 28 days');
  if (!seen.text.includes('Saved to your account.')) interactionProblems.push('no saved confirmation');
  await page.locator('label', { hasText: 'TSIA2' }).click();
  await page.waitForTimeout(250);
  seen = await measure(page);
  if (seen.text.includes('TSIA2 math benchmark')) interactionProblems.push('a goal toggled off is still listed');
  const saves = await page.evaluate(() => window.__mmCcmrSaves || []);
  if (saves.length !== 2) interactionProblems.push(`expected 2 saves, saw ${saves.length}`);
  if (saves[0]?.testDate !== '2026-11-04' || saves[0]?.testFramework !== 'digitalSAT') interactionProblems.push(`first save was ${JSON.stringify(saves[0])}`);
  if (JSON.stringify((saves[1]?.goals || []).map((goal) => goal.framework)) !== '["digitalSAT"]') interactionProblems.push(`second save was ${JSON.stringify(saves[1])}`);
  // An out-of-range date cannot be saved.
  await page.fill('input[type="date"]', '2026-10-01');
  await page.waitForTimeout(150);
  if (!(await page.getByRole('button', { name: 'Save date' }).isDisabled())) interactionProblems.push('a past date could be saved');
  seen = await measure(page);
  if (!seen.text.includes('Pick a date between today and two years from now.')) interactionProblems.push('no message for an out-of-range date');
  if (consoleErrors.length) interactionProblems.push(`console errors: ${consoleErrors.join(' | ').slice(0, 300)}`);
  if (pageErrors.length) interactionProblems.push(`page errors: ${pageErrors.join(' | ').slice(0, 300)}`);
  check(`${device.name}/student-interaction`, seen, {}, interactionProblems);

  // THE OPENED PATHWAY: the wheel and skill lists below the plan.
  await page.evaluate(() => window.__mmCcmrScene('teacher'));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__mmCcmrScene('student'));
  await page.waitForTimeout(300);
  const card = page.locator('button', { hasText: 'ready' }).first();
  const opened = [];
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(300);
  } else {
    opened.push('no pathway card to open');
  }
  seen = await measure(page);
  if (!/Math/.test(seen.text) || !/Back to course path/.test(seen.text)) opened.push('the pathway detail did not open');
  check(`${device.name}/student-pathway-open`, seen, {}, opened);
  await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/tmp'}/ccmr-${device.name}-pathway.png`, fullPage: true });

  await context.close();
}

await browser.close();
console.log(JSON.stringify({ report, blockedRequests: blocked.length, findings }, null, 2));
if (findings.length) process.exitCode = 1;
