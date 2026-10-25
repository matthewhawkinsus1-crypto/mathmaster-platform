// ALGEBRA I · M2 · T2 LESSONS 2 AND 3 — EVERY QUESTION, OPENED AS A STUDENT SEES IT.
//
//   npx vite --host 127.0.0.1 --port 5197 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5197 node tests/browser/algebra1Module2Topic2.mjs [journey ...]
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// The baseline a student walkthrough starts from (docs/qa/ALGEBRA1_M2T2_STUDENT_WALKTHROUGH_BRIEF.md):
// both lessons compiled through the teacher import chain by
// algebra1Module2Topic2Main.jsx and mounted in the real QuestionEngine.
//
//   laptop   1366×768: every question of both lessons opens, renders its task,
//            throws nothing, and does not scroll sideways. One screenshot each.
//   phone    390×844 by touch: the same, for every question.
//
//   attempts 1366×768: the harness keeps a question record (CI10, A2-112), so a
//            try is counted as it is for a signed-in student: a wrong practice
//            answer spends one of three and says how many are left, the third
//            closes the question, and a DOL takes one submission. The only
//            journey that answers anything, and only wrongly.
//
// Apart from that it deliberately does not solve anything: solving is the
// walkthrough's job, done through rendered controls only. Exit code 1 on any finding.
// Screenshots and report.json: tests/browser/artifacts/algebra1Module2Topic2/ (git-ignored).

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5197';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const ARTIFACTS = process.env.ARTIFACTS_DIR || path.join(ROOT, 'tests/browser/artifacts/algebra1Module2Topic2');
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

const open = async (page, lesson, run) => {
  await page.goto(`${ORIGIN}/tests/browser/algebra1Module2Topic2.html?lesson=${lesson}&run=${run}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__m2t2), null, { timeout: 30000 });
};

const visit = async (page, lesson, viewportName) => {
  const ids = await page.evaluate(() => window.__m2t2.ids());
  const preflight = await page.evaluate(() => window.__m2t2.preflight());
  check(preflight.isValid && preflight.errors.length === 0, `${lesson}: Pre-Flight in the browser is valid (${preflight.errors.join('; ')})`);
  for (const id of ids) {
    await page.evaluate((questionId) => window.__m2t2.go(questionId), id);
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
      return {
        overflow: scroller.scrollWidth - window.innerWidth,
        crashed: /something went wrong|could not load this question|error boundary/i.test(text),
        textLength: text.length,
      };
    });
    check(!state.crashed, `${id}: the question rendered without an error card`);
    check(state.overflow <= 1, `${id} @${viewportName}: no sideways scroll (${state.overflow}px)`);
    const file = path.join(ARTIFACTS, `${lesson}-${viewportName}-${id}.png`);
    await screenshotKeepingTouch(page, { path: file, fullPage: true });
    report.push({ lesson, viewport: viewportName, id, ...state, screenshot: path.relative(ROOT, file) });
  }
};

const journey = (viewport, viewportName, extra = {}) => async (browser) => {
  for (const lesson of ['l2', 'l3']) {
    const context = await browser.newContext({ viewport, ...extra });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error?.message || error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await open(page, lesson, `${viewportName}-${Date.now()}`);
    await visit(page, lesson, viewportName);
    check(errors.length === 0, `${lesson} @${viewportName}: no page or console errors (${errors.slice(0, 3).join(' | ')})`);
    await context.close();
  }
};

// Wrong answers for a question's typed fields, through the rendered controls.
// Each round answers differently: sending the same values again asks the
// student to confirm that nothing changed (unchangedConfirmWorkView.mjs), which
// is another journey's business.
const answerWrongly = async (page, id, round = 1) => {
  const fields = page.locator(`[data-question-id="${id}"] math-field`);
  const count = await fields.count();
  for (let index = 0; index < count; index += 1) {
    await fields.nth(index).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(index === count - 1 ? `y=${round}` : `${round}`, { delay: 25 });
    await page.keyboard.press('Tab');
  }
  return count;
};
const submitLabel = (page) => page.getByRole('button', { name: /^Submit/ }).first().getAttribute('aria-label', { timeout: 5000 }).catch(() => null);
const recordOf = (page, id) => page.evaluate((questionId) => window.__m2t2.records()[questionId] || null, id);
const submitAndWait = async (page, id, tries) => {
  await page.getByRole('button', { name: /^Submit/ }).first().click();
  await page.waitForFunction(({ questionId, count }) => (window.__m2t2.records()[questionId]?.attemptCount || 0) >= count, { questionId: id, count: tries }, { timeout: 15000 });
  await page.waitForTimeout(500);
};

const attempts = async (browser) => {
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await open(page, 'l3', `attempts-${Date.now()}`);
  const go = async (id) => {
    await page.evaluate((questionId) => window.__m2t2.go(questionId), id);
    await page.waitForSelector(`[data-question-id="${id}"] math-field`, { timeout: 15000 });
    await page.waitForTimeout(800);
  };
  // A practice question has three tries: each wrong answer is counted and the
  // button says what is left; the third closes the question.
  await go('l3-pr-1');
  check(await recordOf(page, 'l3-pr-1') === null, 'l3-pr-1: no record before an answer');
  const labels = ['Submit — uses 1 of 3 tries', 'Submit — uses 1 of 2 tries left', 'Submit — last try'];
  for (const [index, label] of labels.entries()) {
    await answerWrongly(page, 'l3-pr-1', index + 1);
    check(await submitLabel(page) === label, `l3-pr-1: before try ${index + 1} the button says "${label}" (it says "${await submitLabel(page)}")`);
    await submitAndWait(page, 'l3-pr-1', index + 1);
    const record = await recordOf(page, 'l3-pr-1');
    check(record?.attemptCount === index + 1 && record?.totalAttempts === index + 1, `l3-pr-1: after try ${index + 1} the record counts ${index + 1} (${JSON.stringify({ attemptCount: record?.attemptCount, totalAttempts: record?.totalAttempts })})`);
    // The line the student reads after a miss counts the same tries down. (The
    // engine writes it from the record, and takes the handler's answer when it
    // gets one; a handler that answers nothing reads the same, so what is pinned
    // here is the record.)
    if (index === 1) {
      const said = await page.locator('[data-question-id="l3-pr-1"]').innerText();
      check(/Not quite\. You have 1 try left/.test(said), 'l3-pr-1: after the second miss the student is told one try is left');
    }
  }
  check((await recordOf(page, 'l3-pr-1'))?.status === 'expired', 'l3-pr-1: the third wrong answer closes the question');
  const closedText = await page.locator('[data-question-id="l3-pr-1"]').innerText();
  check(/This question is closed/.test(closedText) && /That was your last try \(3 in all\)/.test(closedText), 'l3-pr-1: the question says it is closed and that the last try is spent');
  check(await page.getByRole('button', { name: /^Submit/ }).count() === 0, 'l3-pr-1: a closed question offers no Submit');
  // A DOL takes one submission.
  await go('l3-dol-1');
  check(await submitLabel(page) === 'Submit — your only try', `l3-dol-1: the button says "Submit — your only try" (it says "${await submitLabel(page)}")`);
  await answerWrongly(page, 'l3-dol-1');
  await submitAndWait(page, 'l3-dol-1', 1);
  const dol = await recordOf(page, 'l3-dol-1');
  check(dol?.attemptCount === 1 && dol?.status === 'expired', `l3-dol-1: the one submission is the record's only try (${JSON.stringify({ attemptCount: dol?.attemptCount, status: dol?.status })})`);
  check(await page.getByRole('button', { name: /^Submit/ }).count() === 0, 'l3-dol-1: a DOL cannot be submitted again');
  // The server keeps the record across a reload, and so does this page.
  await open(page, 'l3', await page.evaluate(() => new URLSearchParams(window.location.search).get('run')));
  check((await recordOf(page, 'l3-dol-1'))?.attemptCount === 1 && (await recordOf(page, 'l3-pr-1'))?.attemptCount === 3, 'the records survive a reload');
  check(errors.length === 0, `attempts: no page errors (${errors.slice(0, 3).join(' | ')})`);
  await context.close();
};

const journeys = {
  laptop: journey(LAPTOP, 'laptop'),
  phone: journey(PHONE, 'phone', { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }),
  attempts,
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
