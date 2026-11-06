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
// line, the error state with its retry, a refusal in the server's words with
// no retry (NAV-1); no sideways scroll, every control at
// least 44px, no console errors. Every non-localhost request is aborted, so
// this page cannot reach Firestore or any real student's data.
//
// OFFLINE (tests/browser/reviewMyWorkOffline.html): the result page holds Review
// My Work through the panel App mounts (src/app/lazyScreens.js), whose code is
// its own chunk. Offline before that code has arrived, the result page stays
// and only Review My Work's place says it needs a connection, with Try again;
// still offline, Try again says so; back online it loads Review My Work, and
// focus lands on its heading. A request that fails while the device says it is
// online reaches the same place, and Try again there loads the page again.

import path from 'node:path';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

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
  {
    name: 'refused',
    mustContain: ['Your answers and solutions appear here once this assignment has closed for your whole class.'],
    mustNotContain: ['could not be loaded'],
    mustNotReach: ['Try again'],
    maxSolutions: 0,
  },
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
    (scene.mustNotContain || []).forEach((needle) => { if (seen.text.includes(needle)) problems.push(`unexpected text: ${needle}`); });
    (scene.mustNotReach || []).forEach((needle) => {
      if (seen.controls.some((entry) => entry.label.includes(needle))) problems.push(`unexpected control: ${needle}`);
    });
    if (scene.minSolutions !== undefined && seen.solutions < scene.minSolutions) problems.push(`only ${seen.solutions} solution reviews rendered`);
    if (scene.maxSolutions !== undefined && seen.solutions > scene.maxSolutions) problems.push(`${seen.solutions} solution reviews shown without server rows`);
    const label = `${viewport.name}/${scene.name}`;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${label}: scrollWidth ${seen.scrollWidth}/${seen.viewportWidth}, solutions ${seen.solutions}, controls ${seen.controls.length}`);
    problems.forEach((problem) => console.log(`       - ${problem}`));
    if (problems.length) failures.push(label);
    if (SHOTS) {
      // eslint-disable-next-line no-await-in-loop
      await screenshotKeepingTouch(page, { path: path.join(SHOTS, `${viewport.name}-${scene.name}.png`), fullPage: true });
    }
  }
  // eslint-disable-next-line no-await-in-loop
  await context.close();
}

/*
 * OFFLINE: Review My Work's code cannot arrive, and the result page stays.
 */
const PANEL = '[data-student-panel="review-my-work"]';
const offlinePage = async (viewport) => {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.isMobile, deviceScaleFactor: viewport.isMobile ? 2 : 1 });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1') || url.startsWith('ws://')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error?.message || error}`));
  await page.goto(`${ORIGIN}/tests/browser/reviewMyWorkOffline.html`, { waitUntil: 'domcontentloaded' });
  // The result screen's own code is here, as after Home's prefetch; Review My Work's is not.
  await page.waitForFunction(() => window.__mmResultScreenHere === true, { timeout: 60000 });
  return { context, page, consoleErrors };
};
// What the result page shows around Review My Work's place, and in it.
const resultPageSeen = (page) => page.evaluate(({ panel, minTap }) => {
  const viewportWidth = document.documentElement.clientWidth;
  const visible = (element) => Boolean(element) && element.getClientRects().length > 0;
  const place = document.querySelector(panel);
  const label = (element) => (element.innerText || '').replace(/\s+/g, ' ').trim();
  const controls = [...document.querySelectorAll('button, a[href], input, select')].filter(visible);
  return {
    viewportWidth,
    scrollWidth: document.documentElement.scrollWidth,
    heading: label(document.querySelector('h1') || document.body),
    headingVisible: visible(document.querySelector('h1')),
    text: document.body.innerText.replace(/\s+/g, ' '),
    placeText: place ? label(place) : null,
    failedPlace: document.querySelector('[data-screen-code-failed]')?.getAttribute('data-screen-code-failed') || null,
    insideFailed: Boolean(place?.querySelector('[data-screen-code-failed]')),
    panelButtons: place ? [...place.querySelectorAll('button')].filter(visible).map(label) : [],
    pageButtons: controls.filter((element) => !place?.contains(element)).map(label),
    small: controls.map((element) => ({ text: label(element), box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.height < minTap || box.width < minTap).map(({ text, box }) => `${text} ${Math.round(box.width)}x${Math.round(box.height)}`),
    focused: document.activeElement && place?.contains(document.activeElement) ? `${document.activeElement.tagName.toLowerCase()}:${label(document.activeElement)}` : null,
  };
}, { panel: PANEL, minTap: MIN_TAP });
// The page around the place is the result page, whole: its title and its ways on.
const checkResultPageStays = (seen, problems) => {
  if (!seen.headingVisible || seen.heading !== 'Functions & Domain/Range') problems.push(`the result page's title is not on screen (h1: ${seen.heading})`);
  if (!seen.pageButtons.length) problems.push('the result page around Review My Work has no controls left');
  if (seen.text.includes('This screen could not load')) problems.push('the whole result page was replaced');
  if (seen.scrollWidth > seen.viewportWidth + 1) problems.push(`page scrolls sideways: ${seen.scrollWidth} > ${seen.viewportWidth}`);
  seen.small.forEach((entry) => problems.push(`tap target under ${MIN_TAP}px: ${entry}`));
};
const pressTryAgain = (page) => page.locator(PANEL).getByRole('button', { name: 'Try again' }).click();

for (const viewport of VIEWPORTS) {
  const label = `${viewport.name}/offline`;
  const problems = [];
  // eslint-disable-next-line no-await-in-loop
  const { context, page, consoleErrors } = await offlinePage(viewport);
  try {
    // eslint-disable-next-line no-await-in-loop
    await context.setOffline(true);
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate(() => window.__mmResultScene('closedReview'));
    // eslint-disable-next-line no-await-in-loop
    // Wherever it lands: in Review My Work's place, or over the whole result page.
    await page.waitForSelector('[data-screen-code-failed]', { timeout: 15000 });
    // eslint-disable-next-line no-await-in-loop
    let seen = await resultPageSeen(page);
    checkResultPageStays(seen, problems);
    if (!seen.insideFailed || seen.failedPlace !== 'panel') problems.push(`the message is not in Review My Work's place (${seen.failedPlace})`);
    if (!seen.placeText?.includes('Review My Work needs a connection')) problems.push(`Review My Work's place says: ${seen.placeText}`);
    if (!seen.placeText?.includes('Check that this device is connected to the internet, then try again.')) problems.push('no word on what to do');
    if (JSON.stringify(seen.panelButtons) !== '["Try again"]') problems.push(`Review My Work's place offers: ${seen.panelButtons.join(', ')}`);
    if (SHOTS) {
      // eslint-disable-next-line no-await-in-loop
      await screenshotKeepingTouch(page, { path: path.join(SHOTS, `${viewport.name}-offline.png`), fullPage: true });
    }
    // Still offline: Try again stays, and says so.
    // eslint-disable-next-line no-await-in-loop
    await pressTryAgain(page);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(300);
    // eslint-disable-next-line no-await-in-loop
    seen = await resultPageSeen(page);
    if (!seen.placeText?.includes('This device is still offline. Connect it to the internet, then try again.')) problems.push(`still offline, Try again left: ${seen.placeText}`);
    checkResultPageStays(seen, problems);
    // Back online: Try again asks again, Review My Work arrives, and focus is on its heading.
    // eslint-disable-next-line no-await-in-loop
    await context.setOffline(false);
    // eslint-disable-next-line no-await-in-loop
    await pressTryAgain(page);
    // eslint-disable-next-line no-await-in-loop
    await page.locator(PANEL).getByRole('heading', { name: 'Your answers and solutions' }).waitFor({ timeout: 30000 });
    // eslint-disable-next-line no-await-in-loop
    await page.waitForFunction((panel) => document.querySelector(panel)?.innerText.includes('Question 1'), PANEL, { timeout: 15000 }).catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    seen = await resultPageSeen(page);
    checkResultPageStays(seen, problems);
    if (seen.failedPlace) problems.push('the message stayed after Review My Work arrived');
    if (!seen.placeText.includes('Question 1')) problems.push('Review My Work arrived without its rows');
    if (seen.focused !== 'h2:Your answers and solutions') problems.push(`focus after Try again: ${seen.focused || 'not in Review My Work'}`);
  } catch (error) {
    problems.push(`journey stopped: ${error?.message || error}`);
  }
  // React reports the error its boundary caught; nothing else may.
  consoleErrors.filter((entry) => !/This device is offline, so the screen was not requested|The above error occurred in|React will try to recreate this component tree/.test(entry))
    .forEach((entry) => problems.push(`console: ${entry}`));
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${label}: the result page stays offline; Review My Work's place says it needs a connection, Try again brings it`);
  problems.forEach((problem) => console.log(`       - ${problem}`));
  if (problems.length) failures.push(label);
  // eslint-disable-next-line no-await-in-loop
  await context.close();
}

// A request that fails while the device says it is online: the same place, and Try again loads the page again.
{
  const viewport = VIEWPORTS[0];
  const label = `${viewport.name}/failed-request`;
  const problems = [];
  const { context, page, consoleErrors } = await offlinePage(viewport);
  try {
    await page.route(/\/src\/components\/student\/ReviewMyWork\.jsx/, (route) => route.abort());
    await page.evaluate(() => window.__mmResultScene('closedReview'));
    // Wherever it lands: in Review My Work's place, or over the whole result page.
    await page.waitForSelector('[data-screen-code-failed]', { timeout: 15000 });
    const seen = await resultPageSeen(page);
    checkResultPageStays(seen, problems);
    if (!seen.placeText?.includes('Review My Work needs a connection')) problems.push(`Review My Work's place says: ${seen.placeText}`);
    await Promise.all([page.waitForURL(/_mm_reload=/, { timeout: 15000 }), pressTryAgain(page)]);
  } catch (error) {
    problems.push(`journey stopped: ${error?.message || error}`);
  }
  consoleErrors.filter((entry) => !/Failed to fetch dynamically imported module|Failed to load resource|The above error occurred in|React will try to recreate this component tree/.test(entry))
    .forEach((entry) => problems.push(`console: ${entry}`));
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${label}: a failed request reaches Review My Work's place, and Try again loads the page again`);
  problems.forEach((problem) => console.log(`       - ${problem}`));
  if (problems.length) failures.push(label);
  await context.close();
}
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} scene(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll Review My Work scenes passed.');
