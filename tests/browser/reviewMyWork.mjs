// Review My Work at 1366x768 and 390x844, in a real browser.
//
// HOW TO RUN:
//
//   npx vite --host 127.0.0.1 --port 5214 --strictPort &
//   node tests/browser/reviewMyWork.mjs
//   SHOTS=/some/dir node tests/browser/reviewMyWork.mjs   # also save screenshots
//
// WHAT IT CHECKS: each question shows the student's answer and a worked
// solution (or says plainly that one is unavailable), the teacher's reason
// line, the error state with its retry; no sideways scroll, every control at
// least 44px, no console errors. Every non-localhost request is aborted, so
// this page cannot reach Firestore or any real student's data.

import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5214';
const SHOTS = process.env.SHOTS || null;
const MIN_TAP = 44;
const VIEWPORTS = [
  { name: 'laptop', width: 1366, height: 768, isMobile: false },
  { name: 'phone', width: 390, height: 844, isMobile: true },
];
const SCENES = [
  {
    name: 'ready',
    mustContain: [
      'Your answers and solutions', 'Question 1', 'Warm-Up', 'Your answer', 'Correct', 'Partly correct · 50%',
      'Your teacher changed this grade: Partial credit awarded', 'Slope', 'No answer recorded', 'Not correct',
      'x=4', 'Sum S5', 'The worked solution for your version of this question is not available.', 'Not answered',
    ],
    minSolutions: 4,
  },
  { name: 'error', mustContain: ['Your answers could not be loaded right now. Try again.'], mustReach: ['Try again'], maxSolutions: 0 },
  { name: 'loading', mustContain: ['Loading your answers'], maxSolutions: 0 },
];

let launchOptions = { args: ['--no-sandbox'] };
let browser;
try { browser = await chromium.launch(launchOptions); } catch {
  launchOptions = { ...launchOptions, executablePath: '/opt/pw-browsers/chromium' };
  browser = await chromium.launch(launchOptions);
}

const failures = [];
for (const viewport of VIEWPORTS) {
  // eslint-disable-next-line no-await-in-loop
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.isMobile, deviceScaleFactor: viewport.isMobile ? 2 : 1 });
  // eslint-disable-next-line no-await-in-loop
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1') || url.startsWith('ws://')) return route.continue();
    return route.abort();
  });
  // eslint-disable-next-line no-await-in-loop
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error?.message || error}`));
  // eslint-disable-next-line no-await-in-loop
  await page.goto(`${ORIGIN}/tests/browser/reviewMyWork.html`, { waitUntil: 'domcontentloaded' });
  // eslint-disable-next-line no-await-in-loop
  await page.waitForFunction(() => typeof window.__mmReviewScene === 'function', { timeout: 60000 });

  for (const scene of SCENES) {
    consoleErrors.length = 0;
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((name) => window.__mmReviewScene(name), scene.name);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(1500);
    // eslint-disable-next-line no-await-in-loop
    const seen = await page.evaluate((minTap) => {
      const viewportWidth = document.documentElement.clientWidth;
      const controls = [...document.querySelectorAll('button, a[href], input, select')]
        .map((element) => ({ label: (element.innerText || '').trim(), box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0);
      return {
        viewportWidth,
        scrollWidth: document.documentElement.scrollWidth,
        text: document.body.innerText.replace(/\s+/g, ' '),
        // The tool review panel is labelled "Worked solution" since #462.
        solutions: document.querySelectorAll('[aria-label="Solution review"], [aria-label="Worked solution"]').length,
        small: controls.filter(({ box }) => box.height < minTap || box.width < minTap).map(({ label, box }) => `${label} ${Math.round(box.width)}x${Math.round(box.height)}`),
        controls: controls.map(({ label, box }) => ({ label, right: Math.round(box.right) })),
        overflowing: [...document.querySelectorAll('body *')]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            if (!(box.width > 0 && box.right > viewportWidth + 1)) return false;
            // Content inside its own horizontal scroller (a wide solution table) is not page overflow.
            for (let node = element.parentElement; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              if (/(auto|scroll|hidden)/.test(style.overflowX) && node.getBoundingClientRect().right <= viewportWidth + 1) return false;
            }
            return true;
          })
          .slice(0, 5)
          .map((element) => `${element.tagName.toLowerCase()}:${(element.innerText || '').slice(0, 30)}`),
      };
    }, MIN_TAP);
    const problems = [];
    if (seen.scrollWidth > seen.viewportWidth + 1) problems.push(`page scrolls sideways: ${seen.scrollWidth} > ${seen.viewportWidth}`);
    seen.overflowing.forEach((entry) => problems.push(`past the right edge: ${entry}`));
    seen.small.forEach((entry) => problems.push(`tap target under ${MIN_TAP}px: ${entry}`));
    consoleErrors.forEach((entry) => problems.push(`console: ${entry}`));
    (scene.mustContain || []).forEach((needle) => { if (!seen.text.includes(needle)) problems.push(`missing text: ${needle}`); });
    (scene.mustReach || []).forEach((needle) => {
      const control = seen.controls.find((entry) => entry.label.includes(needle));
      if (!control) problems.push(`missing control: ${needle}`);
    });
    if (scene.minSolutions !== undefined && seen.solutions < scene.minSolutions) problems.push(`only ${seen.solutions} solution reviews rendered`);
    if (scene.maxSolutions !== undefined && seen.solutions > scene.maxSolutions) problems.push(`${seen.solutions} solution reviews shown without server rows`);
    const label = `${viewport.name}/${scene.name}`;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${label}: scrollWidth ${seen.scrollWidth}/${seen.viewportWidth}, solutions ${seen.solutions}, controls ${seen.controls.length}`);
    problems.forEach((problem) => console.log(`       - ${problem}`));
    if (problems.length) failures.push(label);
    if (SHOTS) {
      // eslint-disable-next-line no-await-in-loop
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-${scene.name}.png`), fullPage: true });
    }
  }
  // eslint-disable-next-line no-await-in-loop
  await context.close();
}
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} scene(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll Review My Work scenes passed.');
