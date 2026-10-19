// Measure My Progress and Practice History at desk and phone width.
//
// HOW TO RUN:
//
//   npx vite --port 5214 --strictPort &
//   AUDIT_ORIGIN=http://localhost:5214 node tests/browser/myMathPathProgress.mjs
//
// WHAT IT CHECKS, at 1366x768 and 390x844:
//
//   1. CONTENT. The growth tiles, the movers, the streak, past weeks with
//      their grades, the honest empty and outage states, Practice History's
//      cap notice and week summary, and the student-facing support names —
//      and that no raw support id ("textToSpeech", "modification:…") renders.
//   2. SIDEWAYS SCROLL, measured on the document (clientWidth is the layout
//      viewport even under mobile emulation; see gradeCenterMobile.mjs).
//   3. TAP TARGETS. Every control at least 44px in both directions.
//   4. WHITE SCREEN. Any thrown error, console error, or blank render.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted at the browser
// level, so this harness cannot reach Firestore or a real student's data.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5214';
const SHOTS = process.env.AUDIT_SCREENSHOTS || null;
const MIN_TAP = 44;
const VIEWPORTS = [
  { name: 'desk', viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

const SCENES = [
  {
    name: 'progress',
    ready: 'Skills that moved most',
    mustContain: [
      'My Progress', 'This week vs 4 weeks ago', 'Skills mastered', 'Average score', 'Skills practised',
      'On the 4 skills you had started by then', 'Skills that moved most', 'Newly mastered',
      'Weekly Path', '2 weeks in a row', '3 of 5 recent weeks hit', 'This week', '1 of 4 done so far',
      'Week of Sep 28', 'Goal hit', 'Week of Sep 14', 'Not finished', '2 of 4 done by the deadline', 'Grade',
      'Go to this week',
    ],
    mustNotContain: ['NaN', 'undefined', 'Path Pass', 'Mastery challenge', 'Week of Aug 31'],
  },
  {
    name: 'progressNewStudent',
    ready: 'starts with your next answer',
    mustContain: ['Your progress starts with your next answer', '0 weeks in a row', 'to start a streak', 'This week', 'Open your Path to set this week'],
    mustNotContain: ['NaN', 'undefined', 'Grade'],
  },
  {
    name: 'progressTeacher',
    ready: 'Skills that moved most',
    mustContain: ['This week vs 4 weeks ago', 'The student sees their past weekly goals and grades here'],
    mustNotContain: ['Go to this week', 'weeks in a row'],
  },
  {
    name: 'progressOutage',
    ready: 'could not be loaded right now',
    mustContain: ['Your progress could not be loaded right now', 'Try again', '2 weeks in a row'],
    mustReach: ['Try again'],
  },
  {
    name: 'practiceHistory',
    ready: 'By week',
    mustContain: [
      'Practice History', 'Showing your 300 most recent answers. Older answers still count toward your mastery.',
      'By week', 'Older answers not shown', 'on your own', 'Tools on screen', 'You used',
      'Read aloud', 'Vocabulary', 'Hint', 'Worked steps', 'Adjusted version',
    ],
    mustNotContain: ['textToSpeech', 'text-to-speech', 'modification', 'workedExample', 'largeText', 'mathScaffold', 'Evidence events', 'None recorded'],
  },
  {
    name: 'shell',
    ready: 'The simulator keeps no weekly mastery snapshots',
    mustContain: ['My Math Path', 'My Progress', 'Weekly Path', 'The simulator keeps no weekly mastery snapshots'],
    mustReach: ['Path', 'Mastery Overview', 'My Progress', 'CCMR', 'Practice History', 'Home'],
  },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const findings = [];
const report = [];
let blockedTotal = 0;

for (const device of VIEWPORTS) {
  // eslint-disable-next-line no-await-in-loop
  const context = await browser.newContext({ viewport: device.viewport, deviceScaleFactor: 2, isMobile: device.isMobile, hasTouch: device.hasTouch });
  const blocked = [];
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
  await page.goto(`${ORIGIN}/tests/browser/myMathPathProgress.html`, { waitUntil: 'domcontentloaded' });
  // eslint-disable-next-line no-await-in-loop
  await page.waitForFunction(() => typeof window.__mmProgressScene === 'function', { timeout: 60000 });

  for (const scene of SCENES) {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    const label = `${device.name}:${scene.name}`;
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((name) => window.__mmProgressScene(name), scene.name);
    try {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForFunction((needle) => {
        const root = document.querySelector('[data-mm-scene]');
        return Boolean(root?.querySelector('[data-mm-crashed]')) || (root?.innerText || '').includes(needle);
      }, scene.ready, { timeout: 60000 });
    } catch {
      // Measured below; a scene that never became ready fails on its content.
    }
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(300);

    // eslint-disable-next-line no-await-in-loop
    const seen = await page.evaluate((minTap) => {
      const root = document.querySelector('[data-mm-scene]');
      const viewportWidth = document.documentElement.clientWidth;
      const controls = [...document.querySelectorAll('button, a[href], input, select')];
      const visible = controls.filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      return {
        crashed: Boolean(root?.querySelector('[data-mm-crashed]')),
        crashText: root?.querySelector('[data-mm-crashed]')?.textContent || '',
        text: (root?.innerText || '').replace(/\s+/g, ' ').trim(),
        elements: root ? root.querySelectorAll('*').length : 0,
        viewportWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        smallTargets: visible
          .map((element) => ({ element, box: element.getBoundingClientRect() }))
          .filter(({ box }) => box.height < minTap || box.width < minTap)
          .map(({ element, box }) => ({ label: (element.innerText || element.value || element.tagName).trim().slice(0, 40), width: Math.round(box.width), height: Math.round(box.height) })),
        overflowing: [...document.querySelectorAll('[data-mm-scene] *')]
          .map((element) => ({ element, box: element.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.right > viewportWidth + 1)
          .map(({ element, box }) => ({ tag: element.tagName.toLowerCase(), right: Math.round(box.right), text: (element.innerText || '').trim().slice(0, 40) }))
          .slice(0, 5),
        controls: visible.map((element) => ({ label: (element.innerText || '').replace(/\s+/g, ' ').trim(), right: Math.round(element.getBoundingClientRect().right) })),
      };
    }, MIN_TAP);

    if (SHOTS) {
      // eslint-disable-next-line no-await-in-loop
      await page.screenshot({ path: `${SHOTS}/${label.replace(':', '-')}.png`, fullPage: true });
    }

    const problems = [];
    if (seen.crashed) problems.push(`threw while rendering: ${seen.crashText.slice(0, 300)}`);
    if (pageErrors.length) problems.push(`uncaught error: ${pageErrors.join(' | ')}`);
    for (const error of consoleErrors) {
      if (/ERR_FAILED|net::|Failed to fetch|FirebaseError|WebChannel|transport errored/i.test(error)) continue;
      problems.push(`console error: ${error.slice(0, 300)}`);
    }
    if (!seen.elements || !seen.text) problems.push('rendered blank');
    if (seen.documentScrollWidth > seen.viewportWidth + 1) {
      problems.push(`page scrolls sideways: document is ${seen.documentScrollWidth}px inside a ${seen.viewportWidth}px screen`);
    }
    for (const wide of seen.overflowing) problems.push(`<${wide.tag}> extends to ${wide.right}px past the ${seen.viewportWidth}px edge: "${wide.text}"`);
    for (const small of seen.smallTargets) problems.push(`tap target below ${MIN_TAP}px: "${small.label}" is ${small.width}x${small.height}`);
    // Case-insensitive: labels uppercased by CSS come back uppercased from
    // innerText. The words are the contract; their case is a style decision.
    const rendered = seen.text.toLowerCase();
    for (const needle of scene.mustContain || []) {
      if (!rendered.includes(needle.toLowerCase())) problems.push(`missing expected text: ${needle}`);
    }
    for (const needle of scene.mustNotContain || []) {
      if (rendered.includes(needle.toLowerCase())) problems.push(`renders forbidden text: ${needle}`);
    }
    for (const needle of scene.mustReach || []) {
      const control = seen.controls.find((entry) => entry.label.includes(needle));
      if (!control) problems.push(`missing control: ${needle}`);
      else if (control.right > seen.viewportWidth + 1) problems.push(`control "${needle}" is off the right edge at ${control.right}px`);
    }

    report.push({ scene: label, elements: seen.elements, scrollWidth: seen.documentScrollWidth, viewportWidth: seen.viewportWidth, problems });
    if (problems.length) findings.push({ scene: label, problems });
  }
  blockedTotal += blocked.length;
  // eslint-disable-next-line no-await-in-loop
  await context.close();
}

await browser.close();

for (const row of report) {
  console.log(`${(row.problems.length ? 'FAIL' : 'ok').padEnd(4)} ${row.scene.padEnd(28)} els=${String(row.elements).padEnd(5)} scrollWidth=${row.scrollWidth}/${row.viewportWidth}`);
  for (const problem of row.problems) console.log(`       -> ${problem}`);
}
console.log(`\nblocked ${blockedTotal} non-local request(s) — no production contact`);
process.exit(findings.length ? 1 : 0);
