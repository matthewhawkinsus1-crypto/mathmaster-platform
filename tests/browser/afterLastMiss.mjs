// AFTER THE LAST MISS (student pass 3, Batch 4), DRIVEN THROUGH THE REAL
// QUESTION ENGINE.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/afterLastMiss.mjs
//
// At 1366×768 and 390×844, through rendered controls only:
//
//   classwork  three misses close a real lesson item; the closed card shows
//              "Practise one like this (no score)" under the worked solution;
//              a wrong practice answer gets ✗ and "Not quite", the right one ✓
//              and "That matches"; Enter in a practice box neither submits nor
//              records anything (no new grade); the worked solution and
//              "Another one like this" work; nothing scrolls sideways.
//   warmup / dol / host=0   no practice after the item closes.
//   choice     "This has one try — a hint is available." before the single
//              try; after a wrong pick, the author's reason for that option.
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/afterLastMiss.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/afterLastMiss');
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
  await page.goto(`${ORIGIN}/tests/browser/afterLastMiss.html?${query}&run=${Date.now()}-${run}`, { waitUntil: 'networkidle' });
  await page.locator('[data-after-last-miss]').waitFor();
  await page.waitForTimeout(700);
  return { page, context };
};

const setField = async (locator, value) => {
  await locator.waitFor();
  await locator.evaluate((element, next) => {
    element.setValue(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
};
const workFields = (page) => page.locator('.mathmaster-question-tool-workspace math-field');
const submit = async (page) => {
  await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
  await page.waitForTimeout(500);
};
const missToClose = async (page, attempts) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const count = await workFields(page).count();
    for (let index = 0; index < count; index += 1) {
      // A different wrong answer each time, so no "same response" prompt.
      await setField(workFields(page).nth(index), String(7 + attempt * 11 + index));
    }
    await page.waitForTimeout(250);
    await submit(page);
  }
};
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
  /* -------------------------------- classwork: the practice after the last miss */
  {
    const { page, context } = await open(device, 'q=inverse&role=classwork');
    const practice = await page.evaluate(() => window.__mmPractice);
    check(Boolean(practice?.prompt), `${device.name}: the lesson item has a family sibling`, practice?.answer);
    check(!(await page.locator('[data-practice-like-this]').count()), `${device.name}: nothing while the item is open`);
    await missToClose(page, 3);
    const card = page.locator('[data-closed-question-card]');
    check(await card.isVisible(), `${device.name}: three misses close the item`);
    const section = card.locator('[data-practice-like-this]');
    check(await section.count() === 1, `${device.name}: the closed card offers the practice`);
    const order = await card.evaluate((element) => {
      const solution = element.querySelector('[aria-label="Worked solution"]');
      const offer = element.querySelector('[data-practice-like-this]');
      return Boolean(solution && offer && (solution.compareDocumentPosition(offer) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    check(order, `${device.name}: under the worked solution`);
    const opener = section.getByRole('button', { name: 'Practise one like this (no score)' });
    check(await reachable(page, opener), `${device.name}: the offer can be reached`);
    await opener.click();
    check((await section.textContent()).includes(practice.prompt), `${device.name}: the sibling's prompt`, practice.prompt);
    check((await section.textContent()).includes('No score · not saved'), `${device.name}: says it is not scored or saved`);

    const graded = (await page.evaluate(() => window.__mmGrades.length));
    const box = section.locator('math-field').first();
    await setField(box, '\\frac{x+99}{3}');
    // Enter belongs to the practice: it checks the practice, never the question.
    await box.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const wrong = await section.locator('[data-practice-message]').textContent();
    check(/^Not quite/.test(wrong), `${device.name}: a wrong practice answer is not quite`, wrong);
    check(await section.locator('[data-practice-verdict="incorrect"]').count() === 1, `${device.name}: and marked ✗`);

    const expected = practice.parts.find((part) => part.checkable);
    await setField(box, expected.expected.replace(/−/g, '-'));
    await section.getByRole('button', { name: 'Check my practice answer' }).click();
    await page.waitForTimeout(300);
    const right = await section.locator('[data-practice-message]').textContent();
    check(/That matches|Your checked answers match/.test(right), `${device.name}: the right practice answer matches`, right);
    check(await section.locator('[data-practice-verdict="correct"]').count() >= 1, `${device.name}: and marked ✓`);
    check((await page.evaluate(() => window.__mmGrades.length)) === graded, `${device.name}: no attempt, grade or submission from the practice`, `${graded} → ${await page.evaluate(() => window.__mmGrades.length)}`);
    check((await card.locator('[data-closed-question-card] [role="status"], [role="status"]').first().textContent()).includes('That was your last try'), `${device.name}: the item stays closed and as graded`);

    await section.getByRole('button', { name: 'Show the worked solution' }).click();
    check(await section.locator('[data-practice-solution] li').count() >= 1, `${device.name}: the practice's worked solution`);
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-practice.png`), fullPage: true });
    await noSidewaysScroll(page, `${device.name} practice`);
    await section.getByRole('button', { name: 'Another one like this' }).click();
    await page.waitForTimeout(300);
    const next = await section.textContent();
    check(!next.includes(practice.prompt), `${device.name}: another one is a different problem`);
    await context.close();
  }

  /* --------------------------- no practice on Warm-Up, DOL, or an unvouched host */
  for (const query of ['q=inverse&role=warmup', 'q=inverse&role=dol', 'q=inverse&role=classwork&host=0']) {
    const { page, context } = await open(device, query);
    const attempts = /dol/.test(query) ? 1 : 3;
    await missToClose(page, attempts);
    await page.waitForTimeout(300);
    check(await page.locator('[data-practice-like-this]').count() === 0, `${device.name} ${query}: no practice after the item closes`);
    await context.close();
  }

  /* --------------------------------------------------- choice-only: one try */
  {
    const { page, context } = await open(device, 'q=choice&role=practice');
    const notice = page.locator('[data-one-try-notice]');
    check(await notice.isVisible(), `${device.name}: a one-try item says so before the try`);
    check((await notice.textContent()).startsWith('This has one try — a hint is available.'), `${device.name}: and that a hint is there`, await notice.textContent());
    check(await notice.getByRole('button', { name: 'Show a hint' }).count() === 1, `${device.name}: with the hint one tap away`);
    const fields = await page.evaluate(() => window.__mmAnswers);
    const [first, ...rest] = fields;
    const wrongOption = first.options.find((option) => option !== first.answer);
    const pick = (field, option) => page.getByRole('radiogroup', { name: field.label, exact: true }).getByRole('radio', { name: option, exact: true }).click();
    await pick(first, wrongOption);
    for (const field of rest) await pick(field, field.answer);
    await page.waitForTimeout(250);
    await submit(page);
    check(!(await notice.isVisible().catch(() => false)), `${device.name}: the notice goes once the try is spent`);
    const reasons = page.locator('[data-closed-question-card] [data-choice-reasons]');
    check(await reasons.isVisible(), `${device.name}: the closed card gives the reason for the choice`);
    const reasonText = await reasons.textContent();
    check(reasonText.includes(`Not ${wrongOption}: read the rule inside the bracket the other way round.`), `${device.name}: the author's reason for the option chosen`, reasonText);
    check(await reachable(page, reasons), `${device.name}: the reason can be reached`);
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-choice.png`), fullPage: true });
    await noSidewaysScroll(page, `${device.name} choice`);
    await context.close();
  }
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} FAILED`);
  process.exit(1);
}
console.log('\nAll after-the-last-miss checks passed.');
