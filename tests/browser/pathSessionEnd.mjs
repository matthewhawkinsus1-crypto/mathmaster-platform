// Measure the My Math Path session end screen on a Chromebook and a phone.
//
// HOW TO RUN:
//
//   npx vite --port 5212 --strictPort &
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/browser/pathSessionEnd.mjs
//   SCREENSHOT_DIR=/some/dir node tests/browser/pathSessionEnd.mjs   # also save full-page PNGs
//
// WHAT IT CHECKS, at 1366x768 and 390x844:
//
//   1. THE CONTENT IS THERE. The next weekly session (or the goal-met
//      message), "Skills that moved", and the recap of missed questions with
//      the student's answer, the correct answer and the worked solution.
//   2. NOTHING STALE. No "Free-choice paths are unlocked" — free practice is
//      always open now.
//   3. SIDEWAYS SCROLL. Measured on the document's layout viewport.
//   4. TAP TARGETS. Every control at least 44px.
//   5. THE NEXT STEP WORKS. Pressing "Start session 3 of 4" hands the next
//      weekly slot to the launcher.
//   6. EVERY FORMULA TYPESETS once scrolled into view — the student's typed
//      answers and the worked steps are math, and a blank there is the bug.
//   7. WHITE SCREEN. Any thrown error, console error, or blank render.
//
// NO PRODUCTION CONTACT: the screen runs on a synthetic session runtime, and
// every non-localhost request is aborted at the browser level.

import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5212';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || null;
const MIN_TAP = 44;
const VIEWPORTS = [
  { name: 'chromebook', width: 1366, height: 768, isMobile: false },
  { name: 'phone', width: 390, height: 844, isMobile: true },
];
const STALE = ['Free-choice paths are unlocked', 'unlocked for the rest of the week'];

const SCENES = [
  {
    name: 'weeklyNext',
    mustContain: [
      'Current learning complete', 'Skills that moved', 'Solving linear equations', '62%', '71%', 'Developing', 'Secure',
      '2 of 4 weekly sessions done', 'Next up', 'Interpreting rate of change',
      'Review what you missed', 'Question 1', 'Question 3', 'Question 4', 'Your answer', 'Correct answer',
      'Hot weather can influence both variables', 'How this one works', 'Partly right', 'Kayak rental',
    ],
    mustNotContain: [...STALE, 'Question 2 '],
    mustReach: ['Start session 3 of 4', 'Back to My Math Path'],
    click: { text: 'Start session 3 of 4', expect: 'Started: Interpreting rate of change' },
  },
  {
    name: 'weeklyGoalDone',
    mustContain: ['Weekly target reached!', 'You completed all 4 of 4 weekly Path sessions.', 'Anything else you practise this week is extra.', 'Review what you missed'],
    mustNotContain: [...STALE, 'Start session'],
    mustReach: ['Back to My Math Path'],
  },
  {
    name: 'practiceAllCorrect',
    mustContain: ['Level 2 complete', 'Level 2 round done', 'You got every question in this session right', 'No skill levels changed'],
    mustNotContain: [...STALE, 'Review what you missed', 'Start session'],
    mustReach: ['Back to My Math Path'],
  },
  {
    name: 'recapError',
    mustContain: ['Your review of this session could not load'],
    mustNotContain: STALE,
    mustReach: ['Try loading the review again', 'Back to My Math Path'],
  },
  { name: 'skillsPending', mustContain: ['Skills that moved', 'Updating your skills…'] },
  { name: 'skillsDelayed', mustContain: ['Skills that moved', 'still on their way'] },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const findings = [];
const report = [];
let blockedTotal = 0;

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.isMobile ? 2 : 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  const blocked = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith('http://localhost') || url.startsWith('ws://localhost')) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  // Which local file failed, since the console only says "Failed to load resource".
  page.on('response', (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

  await page.goto(`${ORIGIN}/tests/browser/pathSessionEnd.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__mmPathEndScene === 'function', { timeout: 60000 });

  for (const scene of SCENES) {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    failedResponses.length = 0;
    const label = `${viewport.name}/${scene.name}`;
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((name) => window.__mmPathEndScene(name), scene.name);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(900);
    // MathLive typesets a <math-span> only when its IntersectionObserver sees
    // it on screen, as a student scrolling would. Walk the page so every
    // formula gets its look, then return to the top.
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate(async () => {
      const step = Math.max(200, window.innerHeight - 120);
      for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      window.scrollTo(0, 0);
    });
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(500);

    // eslint-disable-next-line no-await-in-loop
    const seen = await page.evaluate((minTap) => {
      const root = document.querySelector('[data-mm-scene]');
      // The layout viewport, not innerWidth (see gradeCenterMobile.mjs).
      const viewportWidth = document.documentElement.clientWidth;
      const controls = [...document.querySelectorAll('button, a[href], input, select')];
      const smallTargets = controls
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0 && (box.height < minTap || box.width < minTap))
        .map(({ element, box }) => ({ label: (element.innerText || element.tagName).trim().slice(0, 50), height: Math.round(box.height), width: Math.round(box.width) }));
      const overflowing = [...document.querySelectorAll('*')]
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.right > viewportWidth + 1)
        .map(({ element, box }) => ({ tag: element.tagName.toLowerCase(), right: Math.round(box.right), text: (element.innerText || '').trim().slice(0, 40) }))
        .slice(0, 5);
      // A formula that never typeset has no width: a blank where the
      // student's answer or a solution step should be.
      const blankMath = [...document.querySelectorAll('math-span, math-div')]
        .filter((element) => element.getBoundingClientRect().width === 0)
        .map((element) => (element.textContent || '').trim().slice(0, 40));
      return {
        blankMath,
        crashed: Boolean(root?.querySelector('[data-mm-crashed]')),
        crashText: root?.querySelector('[data-mm-crashed]')?.textContent || '',
        text: (root?.innerText || '').replace(/\s+/g, ' ').trim(),
        elements: root ? root.querySelectorAll('*').length : 0,
        viewportWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        smallTargets,
        overflowing,
        controls: controls.map((element) => ({
          label: (element.innerText || '').replace(/\s+/g, ' ').trim(),
          right: Math.round(element.getBoundingClientRect().right),
          height: Math.round(element.getBoundingClientRect().height),
        })),
      };
    }, MIN_TAP);

    const problems = [];
    if (seen.crashed) problems.push(`threw while rendering: ${seen.crashText}`);
    if (pageErrors.length) problems.push(`uncaught error: ${pageErrors.join(' | ')}`);
    for (const error of consoleErrors) {
      if (/ERR_FAILED|net::|Failed to fetch|FirebaseError|WebChannel|transport errored/i.test(error)) continue;
      // Reported below with its URL by the response listener.
      if (/^Failed to load resource: the server responded with a status of \d+/.test(error)) continue;
      problems.push(`console error: ${error}`);
    }
    for (const failed of failedResponses) {
      // A git worktree whose node_modules is a symlink into another checkout:
      // Vite's dev server refuses files outside its root, so MathLive's font
      // files 403 and math draws in fallback fonts. Never seen in a normal
      // checkout or in CI; everything else that fails is a finding.
      if (/^403 \S+\/@fs\/\S+\/node_modules\//.test(failed)) continue;
      problems.push(`request failed: ${failed}`);
    }
    if (seen.elements === 0 || !seen.text) problems.push('rendered blank');
    if (seen.documentScrollWidth > seen.viewportWidth + 1) {
      problems.push(`page scrolls sideways: document is ${seen.documentScrollWidth}px inside a ${seen.viewportWidth}px screen`);
    }
    for (const wide of seen.overflowing) problems.push(`<${wide.tag}> extends to ${wide.right}px, past the ${seen.viewportWidth}px edge: "${wide.text}"`);
    for (const small of seen.smallTargets) problems.push(`tap target below ${MIN_TAP}px: "${small.label}" is ${small.width}x${small.height}`);
    for (const blank of seen.blankMath) problems.push(`math never typeset: "${blank}"`);
    const rendered = seen.text.toLowerCase();
    for (const needle of scene.mustContain || []) if (!rendered.includes(needle.toLowerCase())) problems.push(`missing expected text: ${needle}`);
    for (const needle of scene.mustNotContain || []) if (`${rendered} `.includes(needle.toLowerCase())) problems.push(`stale or unexpected text present: ${needle}`);
    for (const needle of scene.mustReach || []) {
      const control = seen.controls.find((entry) => entry.label.toLowerCase().includes(needle.toLowerCase()));
      if (!control) problems.push(`missing control: ${needle}`);
      else if (control.right > seen.viewportWidth + 1) problems.push(`control "${needle}" is off the right edge at ${control.right}px`);
    }

    if (SCREENSHOT_DIR) {
      // eslint-disable-next-line no-await-in-loop
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `pathSessionEnd-${viewport.name}-${scene.name}.png`), fullPage: true });
    }

    if (scene.click) {
      // eslint-disable-next-line no-await-in-loop
      const clicked = await page.evaluate((needle) => {
        const target = [...document.querySelectorAll('button')].find((element) => (element.innerText || '').includes(needle));
        if (!target) return false;
        target.click();
        return true;
      }, scene.click.text);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(250);
      // eslint-disable-next-line no-await-in-loop
      const after = await page.evaluate(() => document.querySelector('[data-mm-started]')?.textContent || '');
      if (!clicked) problems.push(`could not press "${scene.click.text}"`);
      else if (!after.includes(scene.click.expect)) problems.push(`pressing "${scene.click.text}" did not launch the next session (saw "${after}")`);
    }

    report.push({ scene: label, elements: seen.elements, scrollWidth: seen.documentScrollWidth, viewportWidth: seen.viewportWidth, controls: seen.controls.length, problems });
    if (problems.length) findings.push({ scene: label, problems });
  }
  blockedTotal += blocked.length;
  // eslint-disable-next-line no-await-in-loop
  await context.close();
}

await browser.close();

for (const row of report) {
  console.log(`${(row.problems.length ? 'FAIL' : 'ok').padEnd(4)} ${row.scene.padEnd(30)} els=${String(row.elements).padEnd(4)} scrollWidth=${row.scrollWidth}/${row.viewportWidth} controls=${row.controls}`);
  for (const problem of row.problems) console.log(`       -> ${problem}`);
}
console.log(`\nblocked ${blockedTotal} non-local request(s) — no production contact`);
process.exit(findings.length ? 1 : 0);
