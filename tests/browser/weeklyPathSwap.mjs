// "Swap a skill" on the weekly panel, at desktop and phone width.
//
// HOW TO RUN:
//
//   npx vite --port 5211 --strictPort &
//   node tests/browser/weeklyPathSwap.mjs
//
// WHAT IT CHECKS:
//
//   1. THE SWAP WORKS END TO END. Open "Want something else?", pick an option,
//      press Start: the launch the screen would send is checked with the
//      server's own authorizeWeeklySlotLaunch and must be authorized — at the
//      slot's assessment context, DOK and band, as a swap of the slot's TEKS.
//      Putting the recommendation back must launch the recommendation.
//   2. HONESTY. A week frozen before swaps existed shows no swap control and
//      no sentence promising one. An opened swapped slot shows the swap and
//      Resume, with no swap control; a finished one says what was chosen.
//   3. LAYOUT. No sideways scroll, every control at least 44px, nothing past
//      the right edge, at 1366x768 and 390x844 — including with an options
//      list open.
//   4. NO WHITE SCREEN, NO CONSOLE ERRORS.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5211';
const MIN_TAP = 44;
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, options: {} },
  { name: 'phone', viewport: { width: 390, height: 844 }, options: { deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];
const TOGGLE = 'Want something else?';
const RECOMMENDED_LABEL = 'Solve linear equations with variables on both sides';

const SCENES = [
  {
    name: 'swappable',
    mustContain: ['Your Weekly Math Path', 'swap it on a card that offers other options', `${TOGGLE} 2 other options for this slot`, `${TOGGLE} 1 other option for this slot`, 'Recommended for you'],
    toggles: 3,
  },
  {
    name: 'legacyWeek',
    mustContain: ['Your Weekly Math Path', 'Do them in any order.', 'Start session 1 of 4'],
    mustNotContain: ['swap', TOGGLE],
    toggles: 0,
  },
  {
    name: 'resumeSwapped',
    mustContain: ['Resume session 1 · 2 of 5 answered', 'Solve linear inequalities', `You chose this instead of ${RECOMMENDED_LABEL}`],
    toggles: 2,
  },
  {
    name: 'doneSwapped',
    mustContain: ['Completed ✓', 'Solve linear inequalities', `You chose this instead of ${RECOMMENDED_LABEL}`, '1 of 4 done'],
    toggles: 2,
  },
  { name: 'compactSwappable', mustContain: ['Your weekly target', 'swap a skill where a card offers other options'], toggles: 0 },
  { name: 'compactLegacy', mustContain: ['Your weekly target', 'Do them in any order.'], mustNotContain: ['swap'], toggles: 0 },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const blocked = [];
const report = [];
let failures = 0;

const measure = (page) => page.evaluate(({ minTap, toggle }) => {
  const root = document.querySelector('[data-mm-scene]');
  // clientWidth is the layout viewport; innerWidth grows with overflow under
  // mobile emulation and would hide sideways scroll.
  const viewportWidth = document.documentElement.clientWidth;
  const controls = [...document.querySelectorAll('button, a[href], input, select')]
    .map((element) => ({ element, box: element.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 0 && box.height > 0);
  return {
    crashed: Boolean(root?.querySelector('[data-mm-crashed]')),
    crashText: root?.querySelector('[data-mm-crashed]')?.textContent || '',
    text: (root?.innerText || '').replace(/\s+/g, ' ').trim(),
    viewportWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    toggles: controls.filter(({ element }) => (element.innerText || '').trim().startsWith(toggle)).length,
    smallTargets: controls
      .filter(({ box }) => box.height < minTap || box.width < minTap)
      .map(({ element, box }) => `"${(element.innerText || element.tagName).trim().slice(0, 40)}" ${Math.round(box.width)}x${Math.round(box.height)}`),
    overflowing: [...document.querySelectorAll('[data-mm-scene] *')]
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.right > viewportWidth + 1)
      .slice(0, 5)
      .map(({ element, box }) => `<${element.tagName.toLowerCase()}> to ${Math.round(box.right)}px: "${(element.innerText || '').trim().slice(0, 40)}"`),
    launch: document.querySelector('[data-mm-launch]')?.textContent || null,
  };
}, { minTap: MIN_TAP, toggle: TOGGLE });

const layoutProblems = (seen, errors) => {
  const problems = [];
  if (seen.crashed) problems.push(`threw while rendering: ${seen.crashText}`);
  if (!seen.text) problems.push('rendered blank');
  if (seen.documentScrollWidth > seen.viewportWidth + 1) problems.push(`page scrolls sideways: ${seen.documentScrollWidth}px in a ${seen.viewportWidth}px screen`);
  seen.overflowing.forEach((entry) => problems.push(`past the right edge: ${entry}`));
  seen.smallTargets.forEach((entry) => problems.push(`tap target below ${MIN_TAP}px: ${entry}`));
  errors.forEach((error) => problems.push(`console/page error: ${error}`));
  return problems;
};

// Click the first button whose text matches, optionally inside the card that
// contains `within`.
const click = (page, needle, within = null) => page.evaluate(({ text, scope }) => {
  const containers = scope
    ? [...document.querySelectorAll('li')].filter((item) => (item.innerText || '').includes(scope))
    : [document];
  for (const container of containers) {
    const target = [...container.querySelectorAll('button')].find((button) => (button.innerText || '').includes(text));
    if (target) { target.click(); return true; }
  }
  return false;
}, { text: needle, scope: within });

for (const { name: viewportName, viewport, options } of VIEWPORTS) {
  const context = await browser.newContext({ viewport, ...options });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith('http://localhost') || url.startsWith('ws://localhost')) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/weeklyPathSwap.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__mmSwapScene === 'function', { timeout: 30000 });

  const record = (label, problems) => {
    report.push({ viewport: viewportName, label, problems });
    if (problems.length) failures += 1;
  };

  // Static scenes.
  for (const scene of SCENES) {
    errors.length = 0;
    await page.evaluate((sceneName) => window.__mmSwapScene(sceneName), scene.name);
    await page.waitForTimeout(250);
    const seen = await measure(page);
    const problems = layoutProblems(seen, errors);
    const text = seen.text.toLowerCase();
    (scene.mustContain || []).forEach((needle) => { if (!text.includes(needle.toLowerCase())) problems.push(`missing text: ${needle}`); });
    (scene.mustNotContain || []).forEach((needle) => { if (text.includes(needle.toLowerCase())) problems.push(`must not say: ${needle}`); });
    if (seen.toggles !== scene.toggles) problems.push(`expected ${scene.toggles} swap control(s), found ${seen.toggles}`);
    record(scene.name, problems);
  }

  // Flow A: swap a course slot, launch it, then put the recommendation back.
  {
    errors.length = 0;
    const problems = [];
    await page.evaluate(() => window.__mmSwapScene('legacyWeek'));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__mmSwapScene('swappable'));
    await page.waitForTimeout(250);
    if (!await click(page, TOGGLE, 'Weekly session 1 of 4')) problems.push('no swap control on session 1');
    await page.waitForTimeout(150);
    const open = await measure(page);
    problems.push(...layoutProblems(open, errors).map((problem) => `(options open) ${problem}`));
    if (!open.text.includes('RECOMMENDED')) problems.push('the open list does not mark the recommendation');
    if (!await click(page, 'Solve linear inequalities', 'Weekly session 1 of 4')) problems.push('could not pick "Solve linear inequalities"');
    await page.waitForTimeout(150);
    const chosen = await measure(page);
    if (!chosen.text.includes(`You chose this instead of ${RECOMMENDED_LABEL}`)) problems.push('the card does not say what was chosen');
    if (!await click(page, 'Start session 1 of 4')) problems.push('no Start button for session 1');
    await page.waitForTimeout(150);
    const launched = await measure(page);
    const expectedSwap = 'Launch authorized: A.5B instead of A.5A · course · DOK 2, band 3';
    if (launched.launch !== expectedSwap) problems.push(`swap launch: expected "${expectedSwap}", got "${launched.launch}"`);

    if (!await click(page, TOGGLE, 'Weekly session 1 of 4')) problems.push('no swap control to switch back');
    await page.waitForTimeout(150);
    if (!await click(page, RECOMMENDED_LABEL, 'Weekly session 1 of 4')) problems.push('could not pick the recommendation again');
    await page.waitForTimeout(150);
    if (!await click(page, 'Start session 1 of 4')) problems.push('no Start button after switching back');
    await page.waitForTimeout(150);
    const back = await measure(page);
    const expectedBack = 'Launch authorized: A.5A · course · DOK 2, band 3';
    if (back.launch !== expectedBack) problems.push(`recommendation launch: expected "${expectedBack}", got "${back.launch}"`);
    problems.push(...layoutProblems(back, errors));
    record('flow: swap a course slot and back', problems);
  }

  // Flow B: swap the SAT transfer slot; it must stay SAT practice at its rigor.
  {
    errors.length = 0;
    const problems = [];
    await page.evaluate(() => window.__mmSwapScene('legacyWeek'));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__mmSwapScene('swappable'));
    await page.waitForTimeout(250);
    if (!await click(page, TOGGLE, 'Weekly session 3 of 4')) problems.push('no swap control on the SAT slot');
    await page.waitForTimeout(150);
    const open = await measure(page);
    if (open.text.includes('Graph linear functions')) problems.push('offered course practice in place of SAT practice');
    if (!await click(page, 'Write linear equations in different forms', 'Weekly session 3 of 4')) problems.push('could not pick the SAT alternative');
    await page.waitForTimeout(150);
    if (!await click(page, 'Start session 3 of 4', 'Weekly session 3 of 4')) problems.push('no Start button for session 3');
    await page.waitForTimeout(150);
    const launched = await measure(page);
    const expected = 'Launch authorized: A.2B instead of A.2C · digitalSAT · DOK 3, band 4';
    if (launched.launch !== expected) problems.push(`SAT swap launch: expected "${expected}", got "${launched.launch}"`);
    problems.push(...layoutProblems(launched, errors));
    record('flow: swap the SAT slot', problems);
  }

  await context.close();
}

await browser.close();

for (const row of report) {
  console.log(`${row.problems.length ? 'FAIL' : 'ok  '} ${row.viewport.padEnd(8)} ${row.label}`);
  row.problems.forEach((problem) => console.log(`       -> ${problem}`));
}
console.log(`\nblocked ${blocked.length} non-local request(s) — no production contact`);
process.exit(failures ? 1 : 0);
