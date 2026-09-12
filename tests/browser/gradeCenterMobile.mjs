// Measure the Grade Center and the Assignment Result on a 390px phone.
//
// HOW TO RUN:
//
//   npx vite --port 5201 --strictPort &
//   node tests/browser/gradeCenterMobile.mjs
//   node tests/browser/gradeCenterMobile.mjs --write   # refresh the fixture
//
// WHAT IT CHECKS, and why each one is a real student's problem:
//
//   1. SIDEWAYS SCROLL. A grade screen that shoves horizontally on a phone
//      hides the column the grade is in. Measured on the document, not on a
//      component, because one over-wide child is enough to do it.
//   2. TAP TARGETS. Every control at least 44px. "Practice" and "View All
//      Grades" are the only ways off a closed-assignment screen; a 30px button
//      under a thumb is a dead end with a visible exit.
//   3. THE EXITS EXIST AND ARE ON SCREEN. A closed Google Classroom deep link
//      must never leave a student on a page they cannot navigate out of, so
//      View All Grades has to be present, visible, and inside the viewport.
//   4. WHITE SCREEN. Any thrown error, console error, or blank render.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted at the browser
// level, so this harness cannot reach Firestore or a real student's data.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FINDINGS = path.join(repo, 'tests/platform/fixtures/gradeCenterMobileFindings.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5201';
const WRITE = process.argv.includes('--write');
const VIEWPORT = { width: 390, height: 740 };
const MIN_TAP = 44;

const SCENES = [
  { name: 'gradeCenter', mustContain: ['My Grades', 'Current MathMaster grade', 'View Results'], mustReach: ['← Home'] },
  { name: 'gradeCenterClosed', mustContain: ['Past Marking Periods', 'Practice'], mustReach: ['← Home'] },
  { name: 'assignmentResult', mustContain: ['Your grade', 'Warm-Up', 'DOL'], mustReach: ['View All Grades', 'Practice DOL'] },
  { name: 'assignmentResultOpen', mustContain: ['Your grade'], mustReach: ['View All Grades'] },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

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
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

await page.goto(`${ORIGIN}/tests/browser/gradeCenterMobile.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__mmGradeScene === 'function', { timeout: 30000 });

const findings = [];
const report = [];

for (const scene of SCENES) {
  consoleErrors.length = 0;
  pageErrors.length = 0;

  // eslint-disable-next-line no-await-in-loop
  await page.evaluate((name) => window.__mmGradeScene(name), scene.name);
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(350);

  // eslint-disable-next-line no-await-in-loop
  const seen = await page.evaluate((minTap) => {
    const root = document.querySelector('[data-mm-scene]');
    const viewportWidth = window.innerWidth;
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
      .map(({ element, box }) => ({
        tag: element.tagName.toLowerCase(),
        right: Math.round(box.right),
        text: (element.innerText || '').trim().slice(0, 40),
      }))
      .slice(0, 5);

    return {
      crashed: Boolean(root?.querySelector('[data-mm-crashed]')),
      crashText: root?.querySelector('[data-mm-crashed]')?.textContent || '',
      text: (root?.innerText || '').replace(/\s+/g, ' ').trim(),
      elements: root ? root.querySelectorAll('*').length : 0,
      viewportWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      smallTargets,
      overflowing,
      controls: controls.map((element) => ({
        label: (element.innerText || '').replace(/\s+/g, ' ').trim(),
        top: Math.round(element.getBoundingClientRect().top),
        right: Math.round(element.getBoundingClientRect().right),
      })),
    };
  }, MIN_TAP);

  const problems = [];
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
  for (const wide of seen.overflowing) {
    problems.push(`<${wide.tag}> extends to ${wide.right}px, past the ${seen.viewportWidth}px screen edge: "${wide.text}"`);
  }
  for (const small of seen.smallTargets) {
    problems.push(`tap target below ${MIN_TAP}px: "${small.label}" is ${small.width}x${small.height}`);
  }
  // Compared case-insensitively: several of these labels are uppercased by CSS,
  // and innerText reports what is rendered. The words are the contract; their
  // letter case is a style decision.
  const renderedText = seen.text.toLowerCase();
  for (const needle of scene.mustContain || []) {
    if (!renderedText.includes(needle.toLowerCase())) problems.push(`missing expected text: ${needle}`);
  }
  for (const needle of scene.mustReach || []) {
    const control = seen.controls.find((entry) => entry.label.toLowerCase().includes(needle.toLowerCase()));
    if (!control) problems.push(`missing control: ${needle}`);
    else if (control.right > seen.viewportWidth + 1) problems.push(`control "${needle}" is off the right edge at ${control.right}px`);
  }

  report.push({
    scene: scene.name,
    elements: seen.elements,
    documentScrollWidth: seen.documentScrollWidth,
    controls: seen.controls.length,
    problems,
  });
  if (problems.length) findings.push({ scene: scene.name, problems });
}

await browser.close();

for (const row of report) {
  const status = row.problems.length ? 'FAIL' : 'ok';
  console.log(`${status.padEnd(4)} ${row.scene.padEnd(22)} els=${String(row.elements).padEnd(4)} scrollWidth=${row.documentScrollWidth} controls=${row.controls}`);
  for (const problem of row.problems) console.log(`       -> ${problem}`);
}
console.log(`\nblocked ${blocked.length} non-local request(s) — no production contact`);

const payload = { viewport: VIEWPORT, minTapTargetPx: MIN_TAP, findings };
if (WRITE) {
  writeFileSync(FINDINGS, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${FINDINGS}`);
} else {
  let recorded = null;
  try { recorded = JSON.parse(readFileSync(FINDINGS, 'utf8')); } catch { recorded = null; }
  if (JSON.stringify(recorded) !== JSON.stringify(payload)) {
    console.log('\nFindings differ from the recorded fixture. Re-run with --write if this is intended.');
  }
}

process.exit(findings.length ? 1 : 0);
