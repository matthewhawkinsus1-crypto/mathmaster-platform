// Retention checks on the real student screens, at 1366x768 and 390x844.
//
// HOW TO RUN:
//
//   npx vite --port 5213 --strictPort &
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/browser/pathRetention.mjs
//
// WHAT IT CHECKS, scene by scene (tests/browser/pathRetentionMain.jsx):
//
//   1. THE CHECK IS ON SCREEN. The Path map's "Quick retention check" section
//      lists the scheduler's due checks (it used to be empty for everyone), the
//      weekly Retention card says it is two questions, the Overview banner and
//      focus card name the check, and a finished check says what it showed.
//   2. EVERY DOOR LAUNCHES THE CHECK. Each scene's button records its launch;
//      a retention button must launch a two-question retentionProbe (weekly ones
//      keeping their slot), and an ordinary weekly card must stay practice.
//   3. NO SIDEWAYS SCROLL, measured on the document's layout viewport
//      (clientWidth — under mobile emulation innerWidth grows with overflow).
//   4. TAP TARGETS at least 44px, and no console errors or crashes.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted, and the
// session screen runs on a stub runtime, never the secure callables.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5213';
const MIN_TAP = 44;
const VIEWPORTS = [
  { label: 'desktop 1366x768', viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { label: 'phone 390x844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

const CHECK = { sessionKind: 'retentionProbe', requiredQuestions: 2 };
const SCENES = (facts) => [
  {
    name: 'pathMap',
    mustContain: ['Quick retention check', 'Verify now · 2 questions', 'Some recent answers on this one were off', 'You learned this a while ago'],
    click: { text: 'Verify now · 2 questions', index: 0 },
    expectLaunch: { ...CHECK, teksCode: facts.pending[0].teksCode },
  },
  {
    name: 'weeklyRetention',
    mustContain: ['Retention check', 'Start session 2 of 3 · 2 questions', 'A quick check that this one has stuck.'],
    click: { text: 'Start session 2 of 3 · 2 questions', index: 0 },
    expectLaunch: { ...CHECK, weeklySlot: 2, weeklyPurpose: 'retention', teksCode: facts.codes[0] },
  },
  {
    name: 'weeklyRetention',
    as: 'weeklyCurrentLearning',
    mustContain: ['Start session 1 of 3'],
    click: { text: 'Start session 1 of 3', index: 0 },
    expectLaunch: { sessionKind: 'practice', weeklySlot: 1, weeklyPurpose: 'currentLearning' },
    expectAbsent: ['requiredQuestions'],
  },
  {
    name: 'weeklyRetentionResume',
    mustContain: ['Resume session 2 · 1 of 2 answered', '1 of 3 done'],
    click: { text: 'Resume session 2', index: 0 },
    expectLaunch: { ...CHECK, weeklySlot: 2 },
  },
  {
    name: 'weeklyRetentionDone',
    mustContain: ['Completed ✓', '1 of 3 done', 'This session counted toward your weekly target.'],
  },
  {
    name: 'overview',
    mustContain: ['Retention concern', 'Priority verification focus', 'Verify now · 2 questions', 'Some recent answers on this one were off'],
    click: { text: 'Verify now · 2 questions', index: 'last' },
    expectLaunch: { ...CHECK, teksCode: facts.pending[0].teksCode },
  },
  {
    name: 'overview',
    as: 'overviewBanner',
    click: { text: 'Verify now · 2 questions', index: 0 },
    expectLaunch: { ...CHECK, teksCode: facts.pending[0].teksCode },
  },
  { name: 'checkPassed', mustContain: ['Retention check complete', 'Still with you', 'Back to My Math Path'] },
  { name: 'checkMissed', mustContain: ['Retention check complete', 'Worth a refresh', 'Back to My Math Path'] },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const blocked = [];
const report = [];
let failures = 0;

for (const device of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch, deviceScaleFactor: device.deviceScaleFactor,
  });
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

  await page.goto(`${ORIGIN}/tests/browser/pathRetention.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__mmRetentionScene === 'function' && window.__mmRetentionFacts, { timeout: 60000 });
  const facts = await page.evaluate(() => window.__mmRetentionFacts);

  for (const scene of SCENES(facts)) {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    const label = scene.as || scene.name;
    const problems = [];

    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((name) => window.__mmRetentionScene(name), scene.name);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(500);

    // eslint-disable-next-line no-await-in-loop
    const seen = await page.evaluate((minTap) => {
      const root = document.querySelector('[data-mm-scene]');
      const viewportWidth = document.documentElement.clientWidth;
      const controls = [...document.querySelectorAll('button, a[href], input, select')];
      const smallTargets = controls
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0 && (box.height < minTap || box.width < minTap))
        .map(({ element, box }) => ({ label: (element.innerText || element.value || element.tagName).trim().slice(0, 50), height: Math.round(box.height), width: Math.round(box.width) }));
      const overflowing = [...document.querySelectorAll('*')]
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.right > viewportWidth + 1)
        .map(({ element, box }) => ({ tag: element.tagName.toLowerCase(), right: Math.round(box.right), text: (element.innerText || '').trim().slice(0, 40) }))
        .slice(0, 5);
      // A heading whose line box is shorter than its letters draws wrapped
      // lines on top of each other. Nothing above measures that.
      const crampedHeadings = [...(root?.querySelectorAll('h1, h2, h3') || [])]
        .map((element) => ({ element, style: getComputedStyle(element) }))
        .filter(({ style }) => style.lineHeight !== 'normal' && parseFloat(style.lineHeight) < parseFloat(style.fontSize))
        .map(({ element, style }) => ({ text: (element.innerText || '').trim().slice(0, 40), lineHeight: style.lineHeight, fontSize: style.fontSize }));
      return {
        crampedHeadings,
        crashed: Boolean(root?.querySelector('[data-mm-crashed]')),
        crashText: root?.querySelector('[data-mm-crashed]')?.textContent || '',
        text: (root?.innerText || '').replace(/\s+/g, ' ').trim(),
        viewportWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        smallTargets,
        overflowing,
        controls: controls.length,
      };
    }, MIN_TAP);

    if (seen.crashed) problems.push(`threw while rendering: ${seen.crashText}`);
    if (!seen.text) problems.push('rendered blank');
    if (seen.documentScrollWidth > seen.viewportWidth + 1) problems.push(`page scrolls sideways: ${seen.documentScrollWidth}px in a ${seen.viewportWidth}px screen`);
    for (const wide of seen.overflowing) problems.push(`<${wide.tag}> extends to ${wide.right}px past the ${seen.viewportWidth}px edge: "${wide.text}"`);
    for (const small of seen.smallTargets) problems.push(`tap target below ${MIN_TAP}px: "${small.label}" is ${small.width}x${small.height}`);
    for (const cramped of seen.crampedHeadings) problems.push(`heading lines overlap: "${cramped.text}" has line-height ${cramped.lineHeight} for ${cramped.fontSize} text`);
    for (const needle of scene.mustContain || []) {
      if (!seen.text.toLowerCase().includes(needle.toLowerCase())) problems.push(`missing expected text: ${needle}`);
    }

    if (scene.click) {
      const buttons = page.getByRole('button', { name: scene.click.text });
      // eslint-disable-next-line no-await-in-loop
      const count = await buttons.count();
      if (!count) {
        problems.push(`no button named "${scene.click.text}"`);
      } else {
        const target = scene.click.index === 'last' ? buttons.last() : buttons.nth(scene.click.index || 0);
        // eslint-disable-next-line no-await-in-loop
        await target.scrollIntoViewIfNeeded();
        // eslint-disable-next-line no-await-in-loop
        await target.click();
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(150);
        // eslint-disable-next-line no-await-in-loop
        const launch = await page.evaluate(() => window.__mmLastLaunch);
        if (!launch) problems.push(`"${scene.click.text}" launched nothing`);
        for (const [key, value] of Object.entries(scene.expectLaunch || {})) {
          if (launch?.[key] !== value) problems.push(`"${scene.click.text}" launched ${key}=${JSON.stringify(launch?.[key])}, expected ${JSON.stringify(value)}`);
        }
        for (const key of scene.expectAbsent || []) {
          if (launch && key in launch) problems.push(`"${scene.click.text}" launch should not set ${key} (got ${JSON.stringify(launch[key])})`);
        }
      }
    }

    if (pageErrors.length) problems.push(`uncaught error: ${pageErrors.join(' | ')}`);
    for (const error of consoleErrors) {
      if (/ERR_FAILED|net::|Failed to fetch|FirebaseError|WebChannel|transport errored/i.test(error)) continue;
      problems.push(`console error: ${error}`);
    }

    failures += problems.length ? 1 : 0;
    report.push({ device: device.label, scene: label, controls: seen.controls, scrollWidth: seen.documentScrollWidth, viewportWidth: seen.viewportWidth, problems });
  }
  // eslint-disable-next-line no-await-in-loop
  await context.close();
}

await browser.close();

for (const row of report) {
  console.log(`${row.problems.length ? 'FAIL' : 'ok  '} ${row.device.padEnd(17)} ${row.scene.padEnd(22)} controls=${String(row.controls).padEnd(3)} scrollWidth=${row.scrollWidth}/${row.viewportWidth}`);
  for (const problem of row.problems) console.log(`       -> ${problem}`);
}
console.log(`\nblocked ${blocked.length} non-local request(s) — no production contact`);
process.exit(failures ? 1 : 0);
