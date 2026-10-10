// FEEDBACK THAT TEACHES, DRIVEN THROUGH THE REAL QUESTION ENGINE.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/feedbackTeaches.mjs
//
// At 1366×768 and 390×844, through rendered controls only:
//
//   practice  Hint control → a hint; a miss gets a specific message (a
//             generic check worded without the move that yields the answer,
//             or the server's own classifier on a Question Family instance)
//             and never the answer; the second miss offers a hint;
//             the third closes the question, says "the worked solution is
//             below" and shows it; a correct answer offers "See why it works";
//             "Ask my teacher" reaches the host; every hint reveal is recorded
//             with the attempt.
//   dol       no Hint control, no miss message, no review while the item is
//             open — the submission is still graded.
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/feedbackTeaches.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/feedbackTeaches');
mkdirSync(ARTIFACTS, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const DEVICES = [
  { name: 'desktop', viewport: { width: 1366, height: 768 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

let run = 0;
const open = async (device, query) => {
  run += 1;
  const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile || false, hasTouch: device.hasTouch || false });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => check(false, `${device.name} ${query}: page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/feedbackTeaches.html?${query}&run=${Date.now()}-${run}`, { waitUntil: 'networkidle' });
  await page.locator('[data-feedback-fixture]').waitFor();
  await page.waitForTimeout(700);
  return { page, context };
};

const answer = async (page, value, index = 0) => {
  const field = page.locator('.mathmaster-question-tool-workspace math-field').nth(index);
  await field.waitFor();
  await field.evaluate((element, next) => {
    element.setValue(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(250);
};
const submit = async (page) => {
  await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
  await page.waitForTimeout(500);
};
const outcome = (page) => page.locator('[role="status"]').filter({ hasText: /Not quite|final allowed attempt|Correct!/ }).first();
const reachable = async (page, locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  return Boolean(box) && box.y >= 0 && box.y < viewport.height && box.x >= -1 && box.x + Math.min(box.width, 40) <= viewport.width + 1;
};

const noSidewaysScroll = async (page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: nothing scrolls sideways`, `${overflow}px`);
};

for (const device of DEVICES) {
  /* ------------------------------------------------ practice, a plain key */
  {
    const { page, context } = await open(device, 'q=multi&role=practice');
    const hint = page.locator('[data-hint-control]');
    check(await hint.isVisible(), `${device.name}: the work bar carries a Hint control`);
    await hint.click();
    const panel = page.locator('.mathmaster-hint-panel');
    await panel.locator('button', { hasText: 'Show a hint' }).click();
    const firstHint = panel.locator('li[data-hint-source]').first();
    check((await firstHint.textContent()).includes('change in y divided by the change in x'), `${device.name}: the authored hint comes first`);
    check(await reachable(page, firstHint), `${device.name}: the hint is on screen`);
    const waiting = panel.getByText(/next one opens after your next attempt/);
    check(await waiting.count() === 1, `${device.name}: the next hint waits for another try`, `${await waiting.count()} shown`);

    await answer(page, '-\\frac{3}{4}');
    await submit(page);
    const box = outcome(page);
    const text = await box.textContent();
    check(/Not quite\. You have 2 attempts remaining/.test(text), `${device.name}: the attempt outcome is unchanged`, text);
    const miss = box.locator('[data-miss-feedback]');
    // Attempts left: where to look and how to check, never the move that
    // yields the answer (PR #462 review M6b).
    check(await miss.isVisible() && /compares with the equation/.test(await miss.textContent()), `${device.name}: the miss gets a specific check (sign)`, await miss.textContent().catch(() => ''));
    check(!/3\/4|\\frac|0\.75|sign|negative|opposite/.test(await miss.textContent()), `${device.name}: and never the answer or the move`);
    check(await reachable(page, miss), `${device.name}: the miss message is on screen`);
    const graded = await page.evaluate(() => window.__mmGrades);
    check(graded[0]?.supportUsage?.hintUsed === true && graded[0]?.supportUsage?.isMathematicallyIndependent === false, `${device.name}: the hint is recorded with the attempt`);

    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-miss.png`), fullPage: false });
    await answer(page, '5');
    await submit(page);
    check(await outcome(page).getByText('A hint is ready if you want one.').isVisible(), `${device.name}: the second miss offers a hint`);

    await page.locator('[data-hint-control]').click().catch(() => {});
    await page.waitForTimeout(150);
    await answer(page, '2');
    await submit(page);
    const closed = await outcome(page).textContent();
    check(/final allowed attempt \(3 total\)\. This response is locked\. The worked solution is below\./.test(closed), `${device.name}: closed, pointing at a review that exists`, closed);
    const review = page.locator('[aria-label="Worked solution"][data-worked-solution="present"]');
    check(await review.isVisible(), `${device.name}: the worked solution is shown`);
    check((await review.textContent()).includes('Change in y: 5 − 2 = 3.'), `${device.name}: from the authored solutionReview`);
    check(await reachable(page, review), `${device.name}: the worked solution can be reached`);
    check(!(await page.locator('[data-hint-control]').isVisible().catch(() => false)), `${device.name}: no Hint control on a closed question`);
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-closed.png`), fullPage: true });
    await context.close();
  }

  /* -------------------------------------------- practice, correct, ask teacher */
  {
    const { page, context } = await open(device, 'q=multi&role=practice');
    await page.locator('[data-hint-control]').click();
    await page.locator('.mathmaster-hint-panel button', { hasText: 'Ask my teacher' }).click();
    check((await page.evaluate(() => window.__mmHelp)).at(-1) === true, `${device.name}: "Ask my teacher" reaches the host`);
    check(await page.locator('.mathmaster-hint-panel').getByText(/Your hand is raised on your teacher’s live class screen/).isVisible(), `${device.name}: and says so`);
    await page.locator('.mathmaster-hint-panel button', { hasText: 'Cancel my help request' }).click();
    check((await page.evaluate(() => window.__mmHelp)).at(-1) === false, `${device.name}: and can be cancelled`);
    await answer(page, '\\frac{3}{4}');
    await submit(page);
    check(/Correct!/.test(await outcome(page).textContent()), `${device.name}: correct`);
    const why = page.locator('details[data-correct-review]');
    check(await why.isVisible(), `${device.name}: a correct answer offers "See why it works"`);
    await why.locator('summary').click();
    check(await why.getByText('Why that works').isVisible(), `${device.name}: which explains it`);
    const graded = await page.evaluate(() => window.__mmGrades);
    check(graded[0]?.supportUsage?.isMathematicallyIndependent === true, `${device.name}: asking the teacher is not counted as math help`);
    await context.close();
  }

  /* ------------------------------------- practice, a Question Family instance */
  {
    const { page, context } = await open(device, 'q=family&role=practice');
    // The instance's plain prompt (the page text also holds each formula's
    // spoken form, "5x plus 15 equals 40", run into the visual one).
    await page.waitForFunction(() => Boolean(window.__mmFamilyPrompt));
    const prompt = await page.evaluate(() => window.__mmFamilyPrompt);
    // Read the instance's own equation off the screen: ax + b = c.
    const match = prompt.match(/(−|-)?\s*(\d+)x\s*([+−-])\s*(\d+)\s*=\s*(−|-)?\s*(\d+)/);
    check(Boolean(match), `${device.name}: the family instance renders`, prompt.slice(0, 160));
    if (match) {
      const a = Number(match[2]) * (match[1] ? -1 : 1);
      const b = Number(match[4]) * (match[3] === '+' ? 1 : -1);
      const c = Number(match[6]) * (match[5] ? -1 : 1);
      await answer(page, String((c + b) / a));
      await submit(page);
      const miss = outcome(page).locator('[data-miss-feedback]');
      check((await miss.getAttribute('data-miss-feedback')) === 'classifier' && /moved a term/.test(await miss.textContent()), `${device.name}: the server's classifier names the error (kept the sign of a moved term)`, await miss.textContent().catch(() => ''));
    }
    await context.close();
  }

  /* ------------- the families job A left as stubs (student push J) */
  for (const which of ['vertex', 'absval', 'transform']) {
    const { page, context } = await open(device, `q=${which}&role=practice`);
    await page.waitForFunction(() => Array.isArray(window.__mmAnswers) && window.__mmAnswers.length > 0);
    const answers = (await page.evaluate(() => window.__mmAnswers)).map((value) => value.replace(/\s+/g, '')).filter((value) => value.length > 1 || /\d/.test(value));
    const hint = page.locator('[data-hint-control]');
    check(await hint.isVisible(), `${device.name} ${which}: a Hint control`);
    await hint.click();
    const panel = page.locator('.mathmaster-hint-panel');
    await panel.locator('button', { hasText: 'Show a hint' }).click();
    const family = panel.locator('li[data-hint-source="family"]').first();
    check(await family.count() === 1, `${device.name} ${which}: the first hint comes from the question's family`);
    const hintText = (await family.textContent().catch(() => '')).replace(/\s+/g, '');
    check(hintText.length > 10 && answers.every((value) => !hintText.includes(value)), `${device.name} ${which}: the hint names no answer`, hintText.slice(0, 160));
    check(await reachable(page, family), `${device.name} ${which}: the hint is on screen`);
    await noSidewaysScroll(page, `${device.name} ${which}`);
    await page.screenshot({ path: path.join(ARTIFACTS, `family-${which}-${device.name}.png`), fullPage: true });
    await context.close();
    const dol = await open(device, `q=${which}&role=dol`);
    const dolHint = dol.page.locator('[data-hint-control]');
    check(!(await dolHint.isVisible().catch(() => false)) || (await dolHint.getAttribute('aria-label')) === 'Ask my teacher', `${device.name} ${which} dol: no Hint control`);
    check((await dol.page.locator('.mathmaster-hint-panel li').count()) === 0, `${device.name} ${which} dol: no hint in the document`);
    await dol.context.close();
  }

  /* -------------------------------------------------------------- DOL */
  {
    const { page, context } = await open(device, 'q=multi&role=dol');
    check(!(await page.locator('[data-hint-control]').isVisible().catch(() => false)) || (await page.locator('[data-hint-control]').getAttribute('aria-label')) === 'Ask my teacher', `${device.name} dol: no Hint control`);
    if (await page.locator('[data-hint-control]').isVisible().catch(() => false)) {
      await page.locator('[data-hint-control]').click();
      const panelText = await page.locator('.mathmaster-hint-panel').textContent();
      check(/Ask your teacher/.test(panelText) && !/hint/i.test(panelText), `${device.name} dol: the ask-only panel says nothing about hints`, panelText.slice(0, 160));
      await page.locator('[data-hint-control]').click();
    }
    await answer(page, '-\\frac{3}{4}');
    await submit(page);
    check((await page.locator('[data-miss-feedback]').count()) === 0, `${device.name} dol: no miss message`);
    check((await page.locator('[aria-label="Worked solution"]').count()) === 0, `${device.name} dol: no worked solution`);
    check((await page.locator('.mathmaster-hint-panel li').count()) === 0, `${device.name} dol: no hint`);
    const graded = await page.evaluate(() => window.__mmGrades);
    check(graded.length === 1 && graded[0].isCorrect === false, `${device.name} dol: the submission is still graded`);
    await context.close();
  }

  /* ------------------------------- a secure Test item: no Hint, no Ask */
  {
    const { page, context } = await open(device, 'q=multi&role=test&secure=1');
    check((await page.locator('[data-hint-control]').count()) === 0, `${device.name} secure: no Hint and no "Ask my teacher", even with a host callback`);
    check((await page.locator('.mathmaster-hint-panel, [data-hint-panel]').count()) === 0, `${device.name} secure: no hint panel in the document`);
    await context.close();
  }

  /* ------------------------------------------------ Read aloud + Translate */
  {
    const { page, context } = await open(device, 'q=system&role=practice&support=translate');
    await page.locator('[data-hint-control]').click();
    await page.locator('.mathmaster-hint-panel button', { hasText: 'Show a hint' }).click();
    const actions = page.locator('.mathmaster-hint-panel [data-supported-text-actions]').first();
    check(await actions.getByRole('button', { name: /Translate/ }).isVisible(), `${device.name}: an entitled student can translate a hint`);
    await actions.getByRole('button', { name: /Translate/ }).click();
    await page.waitForTimeout(600);
    const translated = await actions.textContent();
    check(/Show English|not available/.test(translated), `${device.name}: Translate answers (a translation, or says there is none)`, translated.slice(0, 160));
    await context.close();
  }
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
