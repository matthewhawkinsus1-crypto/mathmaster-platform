// ALGEBRA II HONORS · M2 · L2 DIVIDING POLYNOMIALS — EVERY QUESTION, OPENED AS A STUDENT SEES IT.
//
//   npx vite --host 127.0.0.1 --port 5197 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5197 node tests/browser/algebra2DividingPolynomialsLesson.mjs [journey ...]
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// The lesson compiled through the teacher import chain by
// algebra2DividingPolynomialsLessonMain.jsx and mounted in the real QuestionEngine:
//
//   laptop   1366×768: every question of the lesson opens, renders its task,
//            throws nothing, and does not scroll sideways. One screenshot each.
//   phone    390×844 by touch: the same, for every question.
//
//   solve    1366×768: the long-division and synthetic-division views filled
//            in with the work a student who divides correctly types (the key
//            work, polynomialMath.mjs divisionKeyWork), the work drawn as long
//            division on paper, and Submit marks it right; then one wrong
//            product, and only that round's boxes onward are marked.
//
// laptop and phone deliberately solve nothing. Exit code 1 on any finding.
// Screenshots and report.json: tests/browser/artifacts/algebra2DividingPolynomialsLesson/ (git-ignored).

import { mkdirSync, writeFileSync } from 'node:fs';
import { divisionKeyWork } from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5197';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const ARTIFACTS = process.env.ARTIFACTS_DIR || path.join(ROOT, 'tests/browser/artifacts/algebra2DividingPolynomialsLesson');
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
  await page.goto(`${ORIGIN}/tests/browser/algebra2DividingPolynomialsLesson.html?run=${run}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__dividing), null, { timeout: 30000 });
};

const visit = async (page, lesson, viewportName) => {
  const ids = await page.evaluate(() => window.__dividing.ids());
  const preflight = await page.evaluate(() => window.__dividing.preflight());
  check(preflight.isValid && preflight.errors.length === 0, `${lesson}: Pre-Flight in the browser is valid (${preflight.errors.join('; ')})`);
  for (const id of ids) {
    await page.evaluate((questionId) => window.__dividing.go(questionId), id);
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
      // The question itself must fit: a box wider than the screen is cut off
      // even where the page hides its own sideways scroll.
      const question = document.querySelector('[data-question-id]')?.getBoundingClientRect();
      return {
        overflow: Math.max(scroller.scrollWidth - window.innerWidth, question ? Math.ceil(question.right - window.innerWidth) : 0),
        crashed: /something went wrong|could not load this question|error boundary/i.test(text),
        textLength: text.length,
        crampedInputs,
      };
    });
    check(!state.crashed, `${id}: the question rendered without an error card`);
    check(state.overflow <= 1, `${id} @${viewportName}: no sideways scroll (${state.overflow}px)`);
    check(state.crampedInputs.length === 0, `${id} @${viewportName}: every answer box is wide enough to type in (${state.crampedInputs.join(', ')})`);
    const file = path.join(ARTIFACTS, `${lesson}-${viewportName}-${id}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.push({ lesson, viewport: viewportName, id, ...state, screenshot: path.relative(ROOT, file) });
  }
};

const journey = (viewport, viewportName, extra = {}) => async (browser) => {
  const lesson = 'dividing';
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

// MathLive fields are set through the element's own value API, as
// captureToolResponses.mjs does: what a student enters is LaTeX.
const setMathField = async (page, label, value) => {
  const field = page.locator(`math-field[aria-label="${label}"]`);
  await field.evaluate(async (element, val) => {
    await customElements.whenDefined('math-field');
    element.setValue(val);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(80);
};
const submit = async (page) => {
  await page.getByRole('button', { name: /^Submit — / }).first().click();
  await page.waitForTimeout(600);
};
// Math typesets as it scrolls into view: scroll through once before a
// full-page screenshot, as visit() does.
const scrollThrough = async (page) => {
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight - 120);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
};
const lastGrade = (page, id) => page.evaluate((questionId) => window.__dividing.grades().filter((entry) => entry.questionId === questionId).at(-1) || null, id);

const fillLongDivision = async (page, work) => {
  for (let index = 0; index < work.terms.length; index += 1) {
    const name = `Round ${index + 1}`;
    await setMathField(page, `${name}: divide the leading terms`, work.terms[index]);
    await setMathField(page, `${name}: multiply back`, work.products[index]);
    await setMathField(page, `${name}: subtract and bring down`, work.differences[index]);
  }
  await setMathField(page, 'Quotient in simplest form', work.quotient);
  await setMathField(page, 'Remainder in simplest form', work.remainder);
};
const fillSynthetic = async (page, work) => {
  const cells = page.locator('.mm-synthetic input');
  const values = [work.r, ...work.coefficients, ...work.products, ...work.sums];
  check(await cells.count() === values.length, `the synthetic table has ${values.length} boxes`);
  // DOM order: r, the coefficient row, the products row, the bottom row.
  for (let index = 0; index < values.length; index += 1) await cells.nth(index).fill(values[index]);
  await setMathField(page, 'Quotient in simplest form', work.quotient);
  if (work.remainder !== undefined) await page.locator('input[aria-label^="Remainder over the divisor"]').fill(work.remainder);
};

const solve = async (browser) => {
  const lesson = 'dividing';
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await open(page, `solve-${Date.now()}`);
  for (const id of ['dp-cw-5', 'dp-pr-14', 'dp-cw-10', 'dp-pr-4']) {
    await page.evaluate((questionId) => window.__dividing.go(questionId), id);
    await page.waitForSelector(`[data-question-id="${id}"]`, { timeout: 15000 });
    await page.waitForTimeout(500);
    const question = await page.evaluate((questionId) => window.__dividing.question(questionId), id);
    const work = divisionKeyWork(question);
    check(work, `${id}: the key work is built from the compiled question`);
    if (question.mode === 'longDivision') {
      // One wrong product first: that box and what depends on it are marked.
      await fillLongDivision(page, { ...work, products: work.products.map((product, index) => (index === 0 ? `${product}+1` : product)) });
      await submit(page);
      const missed = await lastGrade(page, id);
      check(missed && missed.isCorrect === false, `${id}: a wrong product is not accepted`);
      await scrollThrough(page);
      await page.screenshot({ path: path.join(ARTIFACTS, `${lesson}-solve-${id}-wrong.png`), fullPage: true });
      await fillLongDivision(page, work);
      const rows = await page.locator('.mm-long-division .mm-ld-cell').count();
      check(rows > key(question), `${id}: the typed work is drawn as long division (${rows} terms)`);
    } else {
      await fillSynthetic(page, work);
    }
    await scrollThrough(page);
    await page.screenshot({ path: path.join(ARTIFACTS, `${lesson}-solve-${id}.png`), fullPage: true });
    await submit(page);
    const graded = await lastGrade(page, id);
    check(graded && graded.isCorrect === true, `${id}: the key work is marked right (${JSON.stringify(graded?.parts?.filter?.((part) => !part.isCorrect) || graded)})`);
    report.push({ lesson, viewport: 'solve', id, isCorrect: graded?.isCorrect ?? null });
  }
  check(errors.length === 0, `${lesson} @solve: no page errors (${errors.slice(0, 3).join(' | ')})`);
  await context.close();
};
// More terms on the page than the dividend alone has: the rounds were drawn.
const key = (question) => String(question.dividend).split(/(?<=[^^])[+-]/).length;

const journeys = {
  solve,
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
