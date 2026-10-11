// A CLOSED DOL NEVER TELLS THE STUDENT IT "WILL BE SUBMITTED WHEN TIME ENDS"
// (QA round 2, R2-m4).
//
//   npx vite --host 127.0.0.1 --port 5562 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5562 node tests/browser/dolCloseCopy.mjs
//   AUDIT_ORIGIN=... node tests/browser/dolCloseCopy.mjs --legacy   # must FAIL:
//                                     drives the pre-fix copy to show the proof can fail
//
// dolCloseCopyMain.jsx mounts the real QuestionEngine as App.jsx does for a DOL
// question, with assignmentLocked / assignmentLockedMessage and the lines under
// the engine taken from describeDolClose. At 1366x768 and 390x844, for each of
// open+timed, closed by the timer, closed by the teacher (with and without a
// receipt) and closed with no completed response, it reads the RENDERED text:
//
//   - the "will be submitted automatically when time ends" promise appears
//     only while the DOL is open, and never together with a closed message;
//   - a teacher close says the teacher closed it and never says "timer";
//   - a timer close says time is up;
//   - the student learns whether the latest completed response was recorded;
//   - no answer, solution or feedback text renders (assessment safety), and
//     nothing is graded by loading the page.
//
// Exits non-zero on any failure.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5562';
const LEGACY = process.argv.includes('--legacy');
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/dolCloseCopy');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const PROMISE = /will be submitted automatically when time ends/i;
const CLOSED = /no new submission is allowed|closed this DOL|time is up|timer has ended|time ended/i;
const LEAKS = /DOLCOPY-LEAK|slope is 3\/4/;

const CASES = [
  { id: 'open-timed', status: 'active', teacher: false, outcome: null },
  { id: 'closed-by-timer', status: 'ended', teacher: false, outcome: 'auto-submitted' },
  { id: 'closed-by-teacher', status: 'ended', teacher: true, outcome: 'auto-submitted' },
  { id: 'closed-by-teacher-no-receipt-yet', status: 'ended', teacher: true, outcome: null },
  { id: 'closed-no-completed-response', status: 'ended', teacher: true, outcome: 'incomplete-at-close' },
];
const VIEWPORTS = [{ width: 1366, height: 768 }, { width: 390, height: 844 }];
const run = Date.now();

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport });
    for (const kase of CASES) {
      const label = `${viewport.width}x${viewport.height} ${kase.id}`;
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      const query = new URLSearchParams({ status: kase.status, run: `${run}-${kase.id}` });
      if (kase.teacher) query.set('teacher', '1');
      if (kase.outcome) query.set('outcome', kase.outcome);
      if (LEGACY) query.set('copy', 'legacy');
      await page.goto(`${ORIGIN}/tests/browser/dolCloseCopy.html?${query}`);
      await page.waitForSelector('[data-dol-copy-ready="1"]', { timeout: 30000 });
      await page.waitForFunction(() => document.body.innerText.includes('Find its slope'), null, { timeout: 30000 });
      await page.waitForTimeout(250);
      const text = await page.evaluate(() => document.body.innerText);
      const promiseVisible = await page.getByText(PROMISE).first().isVisible().catch(() => false);
      const closedLike = CLOSED.test(text);

      check(errors.length === 0, `${label}: no page errors`, errors.join(' | '));
      check(!(PROMISE.test(text) && closedLike), `${label}: the "when time ends" promise never appears with a closed message`);
      if (kase.status === 'active') {
        check(promiseVisible, `${label}: an open timed DOL shows the automatic-submission promise`);
        check(!closedLike, `${label}: an open DOL says nothing about being closed`);
      } else {
        check(!PROMISE.test(text), `${label}: a closed DOL never promises a submission "when time ends"`);
        check(/no new submission is allowed/i.test(text), `${label}: the lock says no new submission is allowed`);
        if (kase.teacher) {
          check(/your teacher closed this DOL/i.test(text), `${label}: says the teacher closed it`);
          check(!/timer|time is up|time ended/i.test(text), `${label}: never says "timer" or "time is up" for a teacher close`);
        } else {
          check(/time is up/i.test(text), `${label}: says time is up`);
        }
        const recorded = kase.outcome === 'auto-submitted'
          ? /latest completed response was submitted/i
          : kase.outcome === 'incomplete-at-close'
            ? /no completed response was available to submit/i
            : /checking whether your latest completed response was recorded/i;
        check(recorded.test(text), `${label}: tells the student what happened to the latest completed response`);
      }
      check(!LEAKS.test(text), `${label}: no answer, solution or feedback text renders`);
      const graded = await page.evaluate(() => window.__mmGraded.length);
      check(graded === 0, `${label}: loading the page grades nothing`, `graded=${graded}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(overflow <= 1, `${label}: no horizontal page scroll`, `overflow=${overflow}px`);
      mkdirSync(ARTIFACTS, { recursive: true });
      await page.screenshot({ path: path.join(ARTIFACTS, `${viewport.width}-${kase.id}${LEGACY ? '-legacy' : ''}.png`), fullPage: true });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
