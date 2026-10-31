// ALGEBRA II HONORS · M2 · L1 OPERATIONS ON POLYNOMIALS — EVERY QUESTION, OPENED AS A STUDENT SEES IT.
//
//   npx vite --host 127.0.0.1 --port 5197 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5197 node tests/browser/algebra2PolynomialsLesson.mjs [journey ...]
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// The lesson compiled through the teacher import chain by
// algebra2PolynomialsLessonMain.jsx and mounted in the real QuestionEngine:
//
//   laptop   1366×768: every question of the lesson opens, renders its task,
//            throws nothing, and does not scroll sideways. One screenshot each.
//   phone    390×844 by touch: the same, for every question.
//
// It deliberately does not solve anything. Exit code 1 on any finding.
// Screenshots and report.json: tests/browser/artifacts/algebra2PolynomialsLesson/ (git-ignored).

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5197';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const ARTIFACTS = process.env.ARTIFACTS_DIR || path.join(ROOT, 'tests/browser/artifacts/algebra2PolynomialsLesson');
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;
const { chromium } = await import(PLAYWRIGHT_MODULE);

const LAPTOP = { width: 1366, height: 768 };
const PHONE = { width: 390, height: 844 };

const findings = [];
const report = [];
let journeyName = '';
const check = (value, message) => {
  if (!value) findings.push(`[${journeyName}] ${message}`);
  return Boolean(value);
};

mkdirSync(ARTIFACTS, { recursive: true });

const open = async (page, run) => {
  await page.goto(`${ORIGIN}/tests/browser/algebra2PolynomialsLesson.html?run=${run}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__polynomials), null, { timeout: 30000 });
};

const visit = async (page, lesson, viewportName) => {
  const ids = await page.evaluate(() => window.__polynomials.ids());
  const preflight = await page.evaluate(() => window.__polynomials.preflight());
  check(preflight.isValid && preflight.errors.length === 0, `${lesson}: Pre-Flight in the browser is valid (${preflight.errors.join('; ')})`);
  for (const id of ids) {
    await page.evaluate((questionId) => window.__polynomials.go(questionId), id);
    await page.waitForSelector(`[data-question-id="${id}"]`, { timeout: 15000 });
    // Math below the fold typesets as it scrolls into view, so a full-page
    // screenshot taken from the top shows empty cells and cards. Scroll the
    // page through once, as a student reading it would, before capturing.
    await page.evaluate(async () => {
      const step = Math.max(200, window.innerHeight - 120);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => {
      const scroller = document.scrollingElement || document.documentElement;
      const text = document.body.innerText || '';
      // A tool grid wider than the page must wrap or scroll inside its own
      // box: an input narrower than 40px cannot be typed in on a phone.
      const crampedInputs = [...document.querySelectorAll('math-field, input')]
        .filter((field) => field.offsetParent && field.getBoundingClientRect().width < 40)
        .map((field) => field.getAttribute('aria-label') || field.tagName);
      return {
        overflow: scroller.scrollWidth - window.innerWidth,
        crashed: /something went wrong|could not load this question|error boundary/i.test(text),
        textLength: text.length,
        crampedInputs,
      };
    });
    check(!state.crashed, `${id}: the question rendered without an error card`);
    check(state.overflow <= 1, `${id} @${viewportName}: no sideways scroll (${state.overflow}px)`);
    check(state.crampedInputs.length === 0, `${id} @${viewportName}: every answer box is wide enough to type in (${state.crampedInputs.join(', ')})`);
    const file = path.join(ARTIFACTS, `${lesson}-${viewportName}-${id}.png`);
    await screenshotKeepingTouch(page, { path: file, fullPage: true });
    report.push({ lesson, viewport: viewportName, id, ...state, screenshot: path.relative(ROOT, file) });
  }
};

const journey = (viewport, viewportName, extra = {}) => async (browser) => {
  const lesson = 'polynomials';
  const context = await browser.newContext({ viewport, ...extra });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  // A failed resource is reported by URL. The browser's own /favicon.ico
  // request (the harness page has none) is not the lesson's, so it is the one
  // 404 left out; the console line it raises names no URL and is skipped too.
  page.on('response', (response) => {
    if (response.status() >= 400 && !new URL(response.url()).pathname.endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
  await open(page, `${viewportName}-${Date.now()}`);
  await visit(page, lesson, viewportName);
  check(errors.length === 0, `${lesson} @${viewportName}: no page or console errors (${errors.slice(0, 3).join(' | ')})`);
  await context.close();
};

const journeys = {
  laptop: journey(LAPTOP, 'laptop'),
  phone: journey(PHONE, 'phone', { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }),
};

const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(journeys);
const browser = await chromium.launch(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {});
try {
  for (const name of selected) {
    if (!journeys[name]) { findings.push(`unknown journey ${name}`); continue; }
    journeyName = name;
    await journeys[name](browser);
  }
} finally {
  await browser.close();
}
writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify({ findings, report }, null, 2));
console.log(`${report.length} question views checked; ${findings.length} finding(s).`);
findings.forEach((finding) => console.log(`  FINDING ${finding}`));
process.exit(findings.length ? 1 : 0);
