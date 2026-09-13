// Device certification for the Test Cycle student surfaces — issue #224, J.
//
// HOW TO RUN:
//
//   npx vite --config tests/browser/emulator/vite.config.mjs --port 5202 --strictPort &
//   node tests/browser/testCycleDevice.mjs
//
// WHAT IT CHECKS, and why each one is a student's problem:
//
//   1. SIDEWAYS SCROLL. A card that shoves horizontally on a phone hides the
//      action that starts the test. Measured on the document, because one
//      over-wide child is enough to do it.
//   2. THE STAGE ACTION IS REACHABLE. The single control this whole feature
//      funnels through — Start Review / Start Test / Start Corrections / Start
//      Retest — must be present, visible, and inside the viewport without
//      scrolling past the fold on a Chromebook.
//   3. TAP TARGETS. Every enabled control at least 44px on its smaller side.
//   4. THE GRADE BREAKDOWN IS LEGIBLE. When a retest was capped, the reason has
//      to be on screen next to the number, not clipped out of it.
//   5. WHITE SCREEN. Any thrown error, console error, or empty render.
//
// NO PRODUCTION CONTACT: the harness aborts every non-localhost request, and the
// services are swapped for stubs by tests/browser/emulator/vite.config.mjs.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const origin = process.env.AUDIT_ORIGIN || 'http://localhost:5202';
const MIN_TAP = 44;

const DEVICES = [
  { id: 'chromebook', width: 1366, height: 768, mobile: false },
  { id: 'phone-390', width: 390, height: 844, mobile: true },
];

// Every stage a student can be funnelled through, and the control that has to
// be reachable at each one.
const STAGES = [
  { id: 'review', action: /Start Review/i },
  { id: 'test', action: /Start Test/i },
  { id: 'awaitingRelease', action: /Submitted/i, disabledAction: true },
  { id: 'corrections', action: /Start Corrections/i },
  { id: 'retest', action: /Start Retest/i },
  { id: 'complete', action: /Review Retest/i },
];

const browser = await chromium.launch();
const findings = [];
let blockedRequests = 0;

const measure = async (page, stage) => page.evaluate((expected) => {
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const controls = [...document.querySelectorAll('button, a[href], input, select')].filter(visible);
  const card = document.querySelector('[data-test-cycle-stage]');
  const actionButton = [...document.querySelectorAll('button')]
    .filter(visible)
    .find((button) => new RegExp(expected, 'i').test(button.textContent || ''));
  const actionRect = actionButton ? actionButton.getBoundingClientRect() : null;
  return {
    stage: card ? card.getAttribute('data-test-cycle-stage') : null,
    elements: document.querySelectorAll('*').length,
    scrollWidth: document.documentElement.scrollWidth,
    /*
     * THE LAYOUT VIEWPORT IS clientWidth, NOT window.innerWidth.
     *
     * Under Chromium's mobile emulation `window.innerWidth` EXPANDS to the
     * width of overflowing content — a 390px phone rendering a 951px card
     * reports innerWidth 951. Comparing scrollWidth against it therefore
     * compares a number with itself, and the sideways-scroll check can never
     * fire: exactly the defect it exists to catch is the one that hides it.
     *
     * `document.documentElement.clientWidth` stays the layout viewport (390),
     * which is what a student's screen actually is.
     */
    innerWidth: document.documentElement.clientWidth,
    innerHeight: document.documentElement.clientHeight,
    bodyText: (document.body.innerText || '').slice(0, 4000),
    action: actionRect ? {
      text: actionButton.textContent.trim(),
      disabled: actionButton.disabled,
      top: actionRect.top, bottom: actionRect.bottom,
      left: actionRect.left, right: actionRect.right,
      width: actionRect.width, height: actionRect.height,
    } : null,
    smallControls: controls
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: (element.textContent || element.value || element.tagName).trim().slice(0, 40), width: rect.width, height: rect.height };
      })
      .filter((entry) => Math.min(entry.width, entry.height) < 44),
  };
}, stage.action.source);

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    isMobile: device.mobile,
    hasTouch: device.mobile,
    deviceScaleFactor: device.mobile ? 3 : 1,
  });
  // Nothing leaves localhost. A device harness that could reach production
  // would be a harness that could read a real student's data.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blockedRequests += 1;
    return route.abort();
  });

  for (const stage of STAGES) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));

    await page.goto(`${origin}/tests/browser/testCycleDevice.html?stage=${stage.id}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-test-cycle-stage]', { timeout: 8000 });
    const result = await measure(page, stage);

    const problems = [];
    if (result.stage !== stage.id) problems.push(`rendered stage ${result.stage}, expected ${stage.id}`);
    if (result.elements < 20) problems.push(`white screen (${result.elements} elements)`);
    if (result.scrollWidth > result.innerWidth) problems.push(`scrolls sideways (${result.scrollWidth} > ${result.innerWidth})`);
    if (!result.action) problems.push(`the ${stage.id} action control is missing`);
    if (result.action) {
      if (result.action.right > result.innerWidth + 1 || result.action.left < -1) problems.push('the action control is off screen horizontally');
      if (result.action.bottom > result.innerHeight + 1) problems.push('the action control is below the fold');
      if (Math.min(result.action.width, result.action.height) < MIN_TAP) problems.push(`the action control is ${Math.round(result.action.height)}px tall`);
      if (Boolean(result.action.disabled) !== Boolean(stage.disabledAction)) {
        problems.push(`action disabled=${result.action.disabled}, expected ${Boolean(stage.disabledAction)}`);
      }
    }
    if (result.smallControls.length) {
      problems.push(`${result.smallControls.length} control(s) under ${MIN_TAP}px: ${result.smallControls.map((entry) => entry.text).join(', ')}`);
    }
    if (consoleErrors.length) problems.push(`console: ${consoleErrors[0]}`);

    // The capped-retest explanation is the one number a student will query.
    if (stage.id === 'complete') {
      for (const expected of ['Original Test', '52%', '84% raw', 'capped at 70%', 'Recorded grade', '70%']) {
        if (!result.bodyText.includes(expected)) problems.push(`the completed card does not show "${expected}"`);
      }
    }
    if (stage.id === 'test' && !/one attempt per question/i.test(result.bodyText)) {
      problems.push('the secure Test card does not state the one-attempt rule');
    }

    findings.push({ device: device.id, stage: stage.id, problems, result });
    await page.close();
  }
  await context.close();
}

await browser.close();

const failures = findings.filter((entry) => entry.problems.length);
for (const entry of findings) {
  const status = entry.problems.length ? 'FAIL' : 'ok  ';
  const action = entry.result.action ? `${Math.round(entry.result.action.width)}x${Math.round(entry.result.action.height)}` : '—';
  console.log(
    `${status} ${entry.device.padEnd(11)} ${entry.stage.padEnd(16)} els=${String(entry.result.elements).padEnd(4)} `
    + `scrollWidth=${entry.result.scrollWidth} action=${action}`,
  );
  for (const problem of entry.problems) console.log(`       -> ${problem}`);
}
console.log(`\nblocked ${blockedRequests} non-local request(s) — no production contact`);

if (failures.length) {
  console.error(`\n${failures.length} of ${findings.length} device/stage combinations failed.`);
  process.exit(1);
}
console.log(`\nAll ${findings.length} device/stage combinations meet the standard at ${DEVICES.map((d) => `${d.id} ${d.width}x${d.height}`).join(' / ')}.`);
