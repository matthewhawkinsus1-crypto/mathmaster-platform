// The Path map's Mastered section and the weekly panel, on a laptop and a phone.
//
// HOW TO RUN:
//
//   npx vite --port 5217 --strictPort &
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/browser/smallPathFixes.mjs
//
// WHAT IT CHECKS, at 1366x768 and 390x844:
//
//   1. CONTENT. Nine mastered skills: six cards and "Show all 9 mastered
//      skills"; pressing it shows all nine and "Show fewer". A week the
//      planner filled with three of four asks for "0 of 3", and its note names
//      Friday, the day it is due. A snapshot frozen before the fix (four asked,
//      three cards, all done) reads complete, 3 of 3.
//   2. NO SIDEWAYS SCROLL, measured on the document's layout viewport.
//   3. TAP TARGETS. Every control at least 44px in both directions.
//   4. NO CONSOLE ERRORS, no thrown errors, no blank render.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted at the browser
// level, so this harness cannot reach Firestore or a real student's data.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5217';
const MIN_TAP = 44;
const VIEWPORTS = [
  { name: 'laptop', viewport: { width: 1366, height: 768 }, isMobile: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true },
];

const SCENES = [
  {
    name: 'masteredMap',
    mustContain: ['9 of 11 skills mastered', 'Show all 9 mastered skills'],
    mustNotContain: ['Show fewer'],
    masteredCards: 6,
    toggleExpanded: 'false',
  },
  {
    name: 'masteredMap',
    as: 'masteredMapExpanded',
    clickText: 'Show all 9 mastered skills',
    mustContain: ['Show fewer mastered skills'],
    mustNotContain: ['Show all 9'],
    masteredCards: 9,
    toggleExpanded: 'true',
  },
  {
    name: 'weeklyShort',
    mustContain: ['0 of 3 weekly sessions done', 'This goes to your teacher when the week closes on Friday night.', 'Finish 3 more sessions'],
    mustNotContain: ['of 4', 'Sunday night'],
  },
  {
    name: 'weeklyPreFixDone',
    mustContain: ['Weekly target complete', 'You completed all 3 of 3', 'Every session is done'],
    mustNotContain: ['of 4'],
  },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const blocked = [];
const report = [];

for (const device of VIEWPORTS) {
  // eslint-disable-next-line no-await-in-loop
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.isMobile ? 2 : 1,
    isMobile: device.isMobile,
    hasTouch: device.isMobile,
  });
  // eslint-disable-next-line no-await-in-loop
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith('http://localhost') || url.startsWith('ws://localhost')) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  // eslint-disable-next-line no-await-in-loop
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  // eslint-disable-next-line no-await-in-loop
  await page.goto(`${ORIGIN}/tests/browser/smallPathFixes.html`, { waitUntil: 'domcontentloaded' });
  // eslint-disable-next-line no-await-in-loop
  await page.waitForFunction(() => typeof window.__mmSmallScene === 'function', { timeout: 30000 });

  for (const scene of SCENES) {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    // A fresh mount per scene, so a toggle pressed in one scene cannot leak
    // into the next.
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate(() => window.__mmSmallScene('__none__'));
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((name) => window.__mmSmallScene(name), scene.name);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(300);

    const problems = [];
    if (scene.clickText) {
      // eslint-disable-next-line no-await-in-loop
      const clicked = await page.evaluate((needle) => {
        const target = [...document.querySelectorAll('button')].find((element) => (element.innerText || '').includes(needle));
        if (!target) return false;
        target.click();
        return true;
      }, scene.clickText);
      if (!clicked) problems.push(`could not find a control matching "${scene.clickText}"`);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(250);
    }

    // eslint-disable-next-line no-await-in-loop
    const seen = await page.evaluate((minTap) => {
      const root = document.querySelector('[data-mm-scene]');
      // The layout viewport. Under mobile emulation window.innerWidth grows to
      // the content's width, so it cannot detect sideways scroll.
      const viewportWidth = document.documentElement.clientWidth;
      const controls = [...document.querySelectorAll('button, a[href], input, select')];
      const smallTargets = controls
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0 && (box.height < minTap || box.width < minTap))
        .map(({ element, box }) => ({
          label: (element.innerText || element.value || element.tagName).trim().slice(0, 40),
          height: Math.round(box.height),
          width: Math.round(box.width),
        }));
      const overflowing = [...document.querySelectorAll('*')]
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.right > viewportWidth + 1)
        .map(({ element, box }) => ({ tag: element.tagName.toLowerCase(), right: Math.round(box.right), text: (element.innerText || '').trim().slice(0, 40) }))
        .slice(0, 5);
      // The Mastered section: the <section> whose heading reads "Mastered".
      const heading = [...document.querySelectorAll('section h3')].find((element) => element.textContent.trim() === 'Mastered');
      const masteredSection = heading?.closest('section') || null;
      const cardRow = masteredSection ? [...masteredSection.children].find((child) => child.tagName === 'DIV') : null;
      const toggle = masteredSection ? [...masteredSection.querySelectorAll('button')].find((button) => /mastered skills/.test(button.textContent)) : null;
      return {
        crashed: Boolean(root?.querySelector('[data-mm-crashed]')),
        crashText: root?.querySelector('[data-mm-crashed]')?.textContent || '',
        text: (root?.textContent || '').replace(/\s+/g, ' ').trim(),
        elements: root ? root.querySelectorAll('*').length : 0,
        viewportWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        smallTargets,
        overflowing,
        masteredCards: cardRow ? cardRow.children.length : null,
        toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
        toggleBox: toggle ? { width: Math.round(toggle.getBoundingClientRect().width), height: Math.round(toggle.getBoundingClientRect().height) } : null,
      };
    }, MIN_TAP);

    if (seen.crashed) problems.push(`threw while rendering: ${seen.crashText}`);
    if (pageErrors.length) problems.push(`uncaught error: ${pageErrors.join(' | ')}`);
    for (const error of consoleErrors) {
      if (/ERR_FAILED|net::|Failed to fetch|FirebaseError|WebChannel|transport errored/i.test(error)) continue;
      problems.push(`console error: ${error}`);
    }
    if (seen.elements === 0 || !seen.text) problems.push('rendered blank');
    if (seen.documentScrollWidth > seen.viewportWidth + 1) {
      problems.push(`page scrolls sideways: document is ${seen.documentScrollWidth}px inside a ${seen.viewportWidth}px screen`);
    }
    for (const wide of seen.overflowing) problems.push(`<${wide.tag}> extends to ${wide.right}px past ${seen.viewportWidth}px: "${wide.text}"`);
    for (const small of seen.smallTargets) problems.push(`tap target below ${MIN_TAP}px: "${small.label}" is ${small.width}x${small.height}`);
    for (const needle of scene.mustContain || []) {
      if (!seen.text.includes(needle)) problems.push(`missing expected text: ${needle}`);
    }
    for (const needle of scene.mustNotContain || []) {
      if (seen.text.includes(needle)) problems.push(`unexpected text: ${needle}`);
    }
    if (scene.masteredCards !== undefined && seen.masteredCards !== scene.masteredCards) {
      problems.push(`Mastered section shows ${seen.masteredCards} cards, expected ${scene.masteredCards}`);
    }
    if (scene.toggleExpanded !== undefined && seen.toggleExpanded !== scene.toggleExpanded) {
      problems.push(`Mastered toggle aria-expanded is ${seen.toggleExpanded}, expected ${scene.toggleExpanded}`);
    }

    report.push({
      device: device.name,
      scene: scene.as || scene.name,
      elements: seen.elements,
      documentScrollWidth: seen.documentScrollWidth,
      viewportWidth: seen.viewportWidth,
      masteredCards: seen.masteredCards,
      toggleBox: seen.toggleBox,
      problems,
    });
  }
  // eslint-disable-next-line no-await-in-loop
  await context.close();
}

await browser.close();

let failed = 0;
for (const row of report) {
  const status = row.problems.length ? 'FAIL' : 'ok';
  if (row.problems.length) failed += 1;
  console.log(`${status.padEnd(4)} ${row.device.padEnd(6)} ${row.scene.padEnd(20)} els=${String(row.elements).padEnd(4)} scrollWidth=${row.documentScrollWidth}/${row.viewportWidth}${row.masteredCards !== null ? ` masteredCards=${row.masteredCards}` : ''}${row.toggleBox ? ` toggle=${row.toggleBox.width}x${row.toggleBox.height}` : ''}`);
  for (const problem of row.problems) console.log(`       -> ${problem}`);
}
console.log(`\nblocked ${blocked.length} non-local request(s) — no production contact`);
process.exit(failed ? 1 : 0);
