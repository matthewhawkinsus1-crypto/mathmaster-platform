// STUDENT PASS 3, BATCH 5 — THE BUTTON THAT SPENDS A TRY, AND HOW A QUESTION
// ENDS, in the real App (in-memory Firebase, synthetic school, `questions=real`).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/submitAndFinishJourneys.mjs
//
// At 1366×768 and 390×844, as student 910002 (Warm-Up done, DOL not open yet):
//
//   final try   Classwork Q1, three misses: Submit says what it costs on every
//               press ("uses 1 of 3 tries" → "uses 1 of 2 tries left" → "last
//               try", amber), the outcome says "tries", the save line speaks of
//               the answer; the third miss closes the question, focus lands on
//               the closed card, one live region says it, the keypad is gone,
//               and Enter goes on to Q2 (RUN-4, RUN-11, polish)
//   skipped     Practice Q2 closed with Q1 skipped and the DOL locked: no
//               dead end — "Go back to Practice Q1 (not answered)" in the bar
//               and a card, and it goes there (RUN-12)
//   finished    the last open question done: "Continue to your results", and
//               it lands on this assignment's results page, Up next below it
//               (RUN-12)
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/submitAndFinish.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../artifacts/submitAndFinish');
mkdirSync(ARTIFACTS, { recursive: true });
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const settle = (page, ms = 400) => page.waitForTimeout(ms);

const DEVICES = [
  { name: 'chromebook', viewport: { width: 1366, height: 768 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

const open = async (device) => {
  const context = await newSchoolContext(browser, { viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${device.name}: page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1&as=student&studentId=910002&questions=real`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await page.locator('math-field').first().waitFor({ timeout: 20000 });
  await settle(page, 800);
  return { context, page };
};

const submitButton = (page) => page.locator('button.mathmaster-bar-submit:visible').first();
const submitName = async (page) => (await submitButton(page).getAttribute('aria-label')) || '';
const typeInto = async (page, field, value) => {
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(value);
  await settle(page, 200);
};
const answerAll = async (page, values) => {
  const fields = page.locator('.mathmaster-question-tool-workspace').locator('math-field:visible, input[type="text"]:visible, input:not([type]):visible');
  const count = await fields.count();
  for (let index = 0; index < count && index < values.length; index += 1) {
    const label = (await fields.nth(index).getAttribute('aria-label')) || '';
    // A wrong answer of the right shape: an ordered pair is a pair.
    const value = /pair/i.test(label) && !/[(,]/.test(values[index]) ? `(${values[index]},${values[index]})` : values[index];
    await typeInto(page, fields.nth(index), value);
  }
  return count;
};
const submit = async (page) => {
  await submitButton(page).click();
  await settle(page, 1200);
};
const goTo = async (page, label) => {
  // The assignment chrome (pass 3): the visible question picker, or on a phone,
  // whose compact navigator has none, "Show progress", the section's tab and
  // its numbered question ("Practice question 2: …"), closed again after.
  const picker = page.locator('select[aria-label="Choose a question"]:visible').filter({ has: page.locator('option', { hasText: label }) });
  if (await picker.count()) {
    await picker.first().selectOption({ label });
  } else {
    const [section, number] = label.split(' Q');
    const toggle = page.locator('.mathmaster-focus-view-button:visible').first();
    await toggle.click();
    const question = page.getByRole('button', { name: new RegExp(`^${section} question ${number}:`) }).first();
    if (!(await question.count())) {
      await page.locator('.mathmaster-section-tab:visible', { hasText: section }).first().click();
      await settle(page, 600);
    }
    await question.click();
    await settle(page, 300);
    if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
  }
  await page.locator('math-field').first().waitFor({ timeout: 15000 });
  await settle(page, 900);
};
const saveLine = (page) => page.locator('[data-save-line]').first().innerText().catch(() => '');
const resultsArea = (page) => page.locator('[data-attempt-results]').first();
const visibleButton = (page, name) => page.getByRole('button', { name }).filter({ visible: true }).first();

for (const device of DEVICES) {
  console.log(`\n${device.name}`);
  const { context, page } = await open(device);

  /* ------------------------------------------------- the final try */
  check(await submitName(page) === 'Submit — uses 1 of 3 tries', `${device.name}: Submit says what the first try costs`, await submitName(page));
  await answerAll(page, ['1/2']);
  await submit(page);
  check(await submitName(page) === 'Submit — uses 1 of 2 tries left', `${device.name}: after a miss, the cost counts what is left`, await submitName(page));
  const outcome = await resultsArea(page).innerText();
  check(/Not quite\. You have 2 tries left\./.test(outcome) && !/attempt|version/i.test(outcome), `${device.name}: the outcome says "tries", not "attempts on this version"`, outcome.slice(0, 160));
  const afterAnswer = await saveLine(page);
  check(/answer/i.test(afterAnswer) && !/Recorded|Syncing/.test(afterAnswer), `${device.name}: the save line speaks of the answer, and never "Recorded" before the server has it`, afterAnswer);
  // One always-mounted announcement region, silent for a routine save.
  const announced = await page.locator('[data-save-line-announcement]').evaluateAll((nodes) => nodes.map((node) => node.textContent));
  check(announced.length === 1 && announced[0] === '', `${device.name}: the save line's live region is mounted and silent for a routine save`, JSON.stringify(announced));
  // A reload: the answer still queued on this device is still an answer
  // (the harness does not deliver it).
  await page.reload({ waitUntil: 'networkidle' });
  await settle(page, 2500);
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await page.locator('math-field').first().waitFor({ timeout: 20000 });
  await settle(page, 1500);
  const afterReload = await saveLine(page);
  check(/Answer saved on this device|Answer recorded/.test(afterReload), `${device.name}: after a reload the queued answer is still called an answer`, afterReload);
  check(await submitName(page) === 'Submit — uses 1 of 2 tries left', `${device.name}: and the try it spent still counts`, await submitName(page));

  await answerAll(page, ['2/3']);
  await submit(page);
  const last = submitButton(page);
  check(await submitName(page) === 'Submit — last try', `${device.name}: the last try is named on the button`, await submitName(page));
  check(/\bis-last-try\b/.test(await last.getAttribute('class') || ''), `${device.name}: and looks different (amber)`);
  const lastColour = await last.evaluate((button) => getComputedStyle(button).backgroundColor);
  check(lastColour !== 'rgb(26, 115, 232)', `${device.name}: not the blue of every other Submit`, lastColour);
  const strip = await page.locator('.mathmaster-question-attempt-strip').first().innerText();
  check(/Last try · 1 of 3 left/.test(strip), `${device.name}: the strip says it is the last try`, strip);
  const visibleCost = (await last.innerText()).replace(/\s+/g, ' ').trim();
  check(visibleCost === 'Submit last try', `${device.name}: the button shows the cost under Submit`, visibleCost);
  await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-last-try.png`) });

  await answerAll(page, ['3/5']);
  await submit(page);
  await settle(page, 600);
  const focus = await page.evaluate(() => ({
    onCard: Boolean(document.activeElement?.closest?.('[data-closed-question-card]')),
    tag: document.activeElement?.tagName,
  }));
  check(focus.onCard, `${device.name}: after the final miss, focus is on the closed card (verdict, then the solution)`, JSON.stringify(focus));
  const regions = await page.evaluate(() => [...document.querySelectorAll('.mathmaster-question-engine [role="status"], .mathmaster-question-engine [aria-live]')]
    .filter((element) => (element.textContent || '').trim()).map((element) => element.textContent.trim().slice(0, 60)));
  check(regions.length === 1 && /closed|last try/i.test(regions[0]), `${device.name}: one live region says the result`, JSON.stringify(regions));
  check(await page.locator('[aria-label="Math tools"]:visible').count() === 0, `${device.name}: the math keypad closed with the question`);
  const nextBar = visibleButton(page, 'Next question →');
  check(await nextBar.count() === 1, `${device.name}: Next is in the action bar`);
  await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-closed.png`) });
  await page.keyboard.press('Enter');
  await settle(page, 1200);
  const heading = await page.locator('body').innerText();
  // The prompt, not "Question 2 of 2": a phone's navigator does not show that line.
  check(/A line passes through \(0, 4\) and \(3, 2\)/.test(heading), `${device.name}: Enter goes on to Classwork Q2`, heading.slice(0, 300));

  /* ------------------------------------------------- the skipped question */
  // Questions are closed by using up their tries: a closed question counts as
  // done (decision 4), and a section that ends on a miss gets its card too.
  const useUpTries = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!(await submitButton(page).count())) break;
      const wrong = String(9 - attempt); // a different wrong answer each time
      await answerAll(page, [wrong, wrong, wrong]);
      await submit(page);
    }
    await settle(page, 600);
  };
  await goTo(page, 'Practice Q2');
  await useUpTries();
  const back = visibleButton(page, 'Go back to Practice Q1 (not answered)');
  check(await back.count() === 1, `${device.name}: a skipped question is the way back, not a dead end`);
  const card = page.locator('.mathmaster-go-back-question:visible');
  check(await card.count() === 1, `${device.name}: and a card says so where Next would be`);
  if (device.isMobile) {
    const shown = (await page.locator('button.mathmaster-bar-continue:visible').first().innerText()).replace(/\s+/g, ' ').trim();
    check(shown === '← Go back', `${device.name}: the phone bar shows its short words, the start of its name`, shown);
  }
  await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-skipped.png`) });
  if (await back.count()) await back.click();
  await settle(page, 1200);
  check(/Solve the system x \+ y = 5/.test(await page.locator('body').innerText()), `${device.name}: it goes back to Practice Q1`);

  /* ------------------------------------------------- finishing */
  await useUpTries();
  check(await page.locator('.mathmaster-section-completion-card:visible').count() === 1, `${device.name}: a section that ends on a miss gets its complete card`);
  // Classwork Q2 is still to do (an earlier section): the way on is there.
  const toClasswork = visibleButton(page, /^Continue to Classwork/);
  check(await toClasswork.count() === 1, `${device.name}: Practice done, Classwork still open: Continue to Classwork`);
  if (await toClasswork.count()) await toClasswork.click();
  await settle(page, 1200);
  await useUpTries();
  const toResults = visibleButton(page, 'Continue to your results →');
  check(await toResults.count() === 1, `${device.name}: the last open question done: Continue to your results`);
  await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-finished.png`) });
  if (await toResults.count()) await toResults.click();
  await settle(page, 2000);
  const results = await page.locator('body').innerText();
  check(!(await page.locator('.mathmaster-question-engine').count()) && /result/i.test(results), `${device.name}: it lands on this assignment's results page`, results.slice(0, 200));
  check(!/Continue to .*Lesson/i.test(results), `${device.name}: not the next lesson`);
  await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-results.png`) });
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED\n${failures.map((failure) => `  - ${failure}`).join('\n')}` : '\nsubmit and finish: all checks passed');
process.exit(failures.length ? 1 : 0);
