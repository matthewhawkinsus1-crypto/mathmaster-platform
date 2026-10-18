/*
 * THE ASSIGNMENT'S CALCULATOR SETTING, IN A REAL BROWSER (pass 3, PR-25 and
 * PR-26) — real Chromium, 1366×768 and 390×844, the question mounted through
 * QuestionEngine (assignmentGraphingCalculator.html).
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/assignmentGraphingCalculator.mjs
 *
 * An assignment set to "graphing": the work bar's control is named "Graphing
 * calculator" (what the prompt names), opens a calculator a student can type
 * f(x) into, which graphs it and gives the zeros, minimum and maximum and a
 * trace; Enter there never submits the question; Escape closes it and gives
 * focus back; on a wide screen the question moves clear of the drawer; the
 * submission records calculatorUsed. Over Work View it is on top and Escape
 * closes only it. Without the setting the keypad drawer opens as before, and
 * the graphing code is never downloaded. Inside an assessment context (a
 * secure SAT item) the engine offers no graphing calculator of its own. On an
 * exit ticket the item with no authored calculator takes the assignment's,
 * shows no verdict, and an item authored "basic" keeps basic.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const PANEL = '[data-graphing-calculator]';
const KEYPAD = '.mathmaster-calculator-panel';
const BAR = 'button.mathmaster-work-bar-tool';
const url = (query) => `${origin}/tests/browser/assignmentGraphingCalculator.html?${query}`;

const open = async (viewport, query) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  const requested = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  page.on('request', (request) => requested.push(request.url()));
  await page.goto(url(query), { waitUntil: 'networkidle' });
  await page.locator(BAR).first().waitFor();
  return { page, errors, requested };
};
const graphingCodeRequested = (requested) => requested.some((entry) => /AssignmentGraphingCalculator|GraphingCalculatorPanel/.test(entry));
const activeLabel = (page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || '');

for (const [width, height] of [[1366, 768], [390, 844]]) {
  const at = `${width}x${height}`;
  const { page, errors, requested } = await open({ width, height }, 'calc=graphing');

  // The control a prompt names: "the built-in graphing calculator".
  const opener = page.locator(`${BAR}[aria-label="Graphing calculator"]`);
  assert.equal(await opener.count(), 1, `${at}: the work bar names the graphing calculator`);
  assert.equal(await page.locator(`${BAR}[aria-label="Calculator"]`).count(), 0, `${at}: and offers no second calculator`);
  assert.ok(graphingCodeRequested(requested), `${at}: its code loads for a graphing question`);

  // Open by keyboard: focus in Line 1.
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.locator(PANEL).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Line 1');
  assert.equal(await opener.getAttribute('aria-expanded'), 'true', `${at}: the control knows it is open`);
  assert.equal(await page.locator(PANEL).getAttribute('data-graphing-calculator'), width < 720 ? 'sheet' : 'drawer');

  // Enter f(x): it graphs, and the key points are there.
  await page.keyboard.type('f(x) = x^2 - 4');
  await page.waitForSelector('[data-graphing-board="ready"]');
  await page.waitForFunction(() => /x = 2/.test(document.querySelector('[data-graphing-zeros]')?.textContent || ''), null, { timeout: 10000 }).catch(async (error) => {
    console.error(at, 'line 1 =', await page.getByRole('textbox', { name: 'Line 1', exact: true }).inputValue(), '| key points:', await page.locator('[data-graphing-key-points]').textContent());
    throw error;
  });
  assert.match(await page.locator('[data-graphing-line="1"]').textContent(), /Graphed as the blue solid line/, `${at}: the line says how it is drawn`);
  assert.equal((await page.locator('[data-graphing-zeros]').textContent()).trim(), 'x = −2; x = 2', `${at}: zeros`);
  assert.equal((await page.locator('[data-graphing-minima]').textContent()).trim(), '(0, −4)', `${at}: minimum`);
  assert.equal((await page.locator('[data-graphing-maxima]').textContent()).trim(), 'No turn on screen', `${at}: maximum`);

  // Enter in a line goes to a new line, and never submits the question.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Line 2');
  await page.keyboard.type('y = -(x - 1)^2 + 3');
  await page.locator(`${PANEL} select`).first().selectOption({ label: 'Line 2' });
  await page.waitForFunction(() => /\(1, 3\)/.test(document.querySelector('[data-graphing-maxima]')?.textContent || ''));

  // Trace.
  await page.getByRole('textbox', { name: 'Find y when x =' }).fill('3');
  await page.waitForSelector('[data-graphing-trace="1"]');
  assert.match(await page.locator('[data-graphing-trace="1"]').textContent(), /Line 1: y = 5/, `${at}: trace`);
  await page.getByRole('textbox', { name: 'Line 1', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__mmGraded.length), 0, `${at}: Enter in the calculator submitted nothing`);

  // Beside the question, not on it (a wide screen).
  if (width >= 720) {
    const drawer = await page.locator(PANEL).boundingBox();
    const answer = await page.getByLabel('Positive zero').first().boundingBox();
    assert.ok(answer.x >= drawer.x + drawer.width - 1, `${at}: the answer box is clear of the drawer (${answer.x} vs ${drawer.x + drawer.width})`);
  }

  // Escape closes it; focus back on the control.
  await page.getByRole('textbox', { name: 'Line 1', exact: true }).focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction((s) => !document.querySelector(s), PANEL);
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Graphing calculator', null, { timeout: 5000 })
    .catch(async (error) => {
      console.error(at, 'focus after Escape is on', await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 200)));
      throw error;
    });
  assert.equal(await opener.getAttribute('aria-expanded'), 'false');

  // The lines are kept while the question is open.
  await opener.click();
  await page.locator(PANEL).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Line 1', exact: true }).inputValue(), 'f(x) = x^2 - 4', `${at}: lines kept`);
  await page.getByRole('button', { name: 'Close graphing calculator' }).click();
  await page.waitForFunction((s) => !document.querySelector(s), PANEL);
  assert.equal(await activeLabel(page), 'Graphing calculator', `${at}: Close gives focus back`);

  // The answer, submitted: calculatorUsed is recorded.
  const box = page.getByLabel('Positive zero').first();
  await box.click();
  await page.keyboard.type('2');
  // With the answer complete, Enter in the calculator still submits nothing.
  await opener.click();
  await page.locator(PANEL).waitFor();
  await page.getByRole('textbox', { name: 'Line 1', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__mmGraded.length), 0, `${at}: Enter in the calculator with a complete answer submitted nothing`);
  await page.keyboard.press('Escape');
  await page.waitForFunction((s) => !document.querySelector(s), PANEL);
  await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
  await page.waitForFunction(() => window.__mmGraded.length === 1);
  const graded = await page.evaluate(() => window.__mmGraded[0]);
  assert.equal(graded.supportUsage?.calculatorUsed, true, `${at}: calculatorUsed recorded ${JSON.stringify(graded.supportUsage)}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${at}: no horizontal scroll`);

  await page.screenshot({ path: `tests/browser/artifacts/assignment-graphing-calculator-${width}.png` });
  assert.deepEqual(errors, [], `${at}: no page errors`);
  await page.close();
  console.log(`assignment graphing calculator ${at}: ok`);
}

// A slow connection: the calculator's code arrives after the student pressed
// the control. It opens with focus in Line 1, and Escape still returns focus.
{
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(/AssignmentGraphingCalculator\.jsx/, async (route) => { await held; await route.continue(); });
  await page.goto(url('calc=graphing'), { waitUntil: 'domcontentloaded' });
  const opener = page.locator(`${BAR}[aria-label="Graphing calculator"]`);
  await opener.waitFor();
  await opener.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator(PANEL).count(), 0, 'held: nothing yet');
  release();
  await page.locator(PANEL).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Line 1');
  await page.keyboard.press('Escape');
  await page.waitForFunction((s) => !document.querySelector(s), PANEL);
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Graphing calculator', null, { timeout: 5000 });
  assert.deepEqual(errors, [], 'late chunk: no page errors');
  await page.close();
  console.log('assignment graphing calculator, code arriving late: ok');
}

// A closed question: a calculator open when the answer closed it stays as the
// student left it (as the keypad does), and once closed it does not come back
// on its own — not on Enter on the closed card, not on a re-render.
{
  const { page, errors } = await open({ width: 1366, height: 768 }, 'calc=graphing');
  await page.getByLabel('Positive zero').first().click();
  await page.keyboard.type('2');
  const opener = page.locator(`${BAR}[aria-label="Graphing calculator"]`);
  await opener.click();
  await page.locator(PANEL).waitFor();
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => /^Submit/.test(button.textContent.trim()) && button.getClientRects().length).click());
  await page.waitForFunction(() => window.__mmGraded.length === 1);
  await page.getByRole('button', { name: 'Close graphing calculator' }).click();
  await page.waitForFunction((s) => !document.querySelector(s), PANEL);
  await page.mouse.click(1300, 400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  assert.equal(await page.locator(PANEL).count(), 0, 'closed question: the calculator does not reopen');
  assert.equal(await opener.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(errors, [], 'closed question: no page errors');
  await page.close();
  console.log('closed question: the calculator stays closed, ok');
}

// The calculator's code cannot load: the keypad stands in, and the control is named for it.
{
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.route(/AssignmentGraphingCalculator\.jsx/, (route) => route.abort());
  await page.goto(url('calc=graphing'), { waitUntil: 'networkidle' });
  await page.locator(`${BAR}[aria-label="Calculator"]`).waitFor();
  assert.equal(await page.locator(`${BAR}[aria-label="Graphing calculator"]`).count(), 0, 'failed load: not called a graphing calculator');
  await page.locator(`${BAR}[aria-label="Calculator"]`).click();
  await page.locator(KEYPAD).waitFor();
  assert.deepEqual(errors, [], 'failed load: no page errors');
  await page.close();
  console.log('assignment graphing calculator, code that cannot load: keypad, ok');
}

// Over Work View: on top, and one Escape closes the calculator only.
{
  const { page, errors } = await open({ width: 1366, height: 768 }, 'calc=graphing&tool=graphing2');
  const modals = () => page.locator('[aria-modal="true"]').count();
  const before = await modals();
  await page.locator('button:has-text("Open Work View")').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('[aria-modal="true"]').length > n, before);
  const railOpener = page.locator('[aria-modal="true"] button:visible', { hasText: /Graphing calculator/ }).first();
  await railOpener.focus();
  await page.keyboard.press('Enter');
  await page.locator(PANEL).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Line 1');
  const panelBox = await page.locator(PANEL).boundingBox();
  const onTop = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[data-graphing-calculator]')), { x: panelBox.x + panelBox.width / 2, y: panelBox.y + 120 });
  assert.ok(onTop, 'the graphing calculator is drawn above Work View');
  await page.keyboard.press('Escape');
  await page.waitForFunction((s) => !document.querySelector(s), PANEL);
  assert.ok(await modals() > before, 'Work View stays open after the calculator closes');
  assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-modal="true"]'))), 'focus is back inside Work View');
  assert.deepEqual(errors, [], 'Work View: no page errors');
  await page.close();
  console.log('assignment graphing calculator over Work View: ok');
}

// Without the setting: the keypad drawer, as before, and no graphing code.
for (const query of ['calc=off', 'calc=inherit', 'calc=scientific']) {
  const { page, errors, requested } = await open({ width: 1366, height: 768 }, query);
  const opener = page.locator(`${BAR}[aria-label="Calculator"]`);
  assert.equal(await opener.count(), 1, `${query}: the work bar's Calculator`);
  await opener.click();
  await page.locator(KEYPAD).waitFor();
  const title = await page.locator(KEYPAD).textContent();
  assert.match(title, query === 'calc=scientific' ? /SCIENTIFIC CALCULATOR/ : /BASIC CALCULATOR/, `${query}: the drawer's mode`);
  assert.equal(await page.locator(PANEL).count(), 0);
  assert.equal(graphingCodeRequested(requested), false, `${query}: the graphing calculator was not downloaded`);
  assert.deepEqual(errors, []);
  await page.close();
  console.log(`no graphing setting (${query}): keypad drawer, ok`);
}

// An assessment context brings its own tools: the engine adds no graphing calculator.
{
  const { page, errors, requested } = await open({ width: 1366, height: 768 }, 'calc=graphing&ctx=sat');
  assert.equal(await page.locator(`${BAR}[aria-label="Graphing calculator"]`).count(), 0, 'secure SAT item: no engine graphing calculator');
  assert.equal(await page.locator(`${BAR}[aria-label="Calculator"]`).count(), 1);
  assert.equal(graphingCodeRequested(requested), false);
  assert.deepEqual(errors, []);
  await page.close();
  console.log('assessment context: unchanged, ok');
}

// Exit ticket: an item with no authored calculator takes the assignment's
// graph, trace and table, but lists no zeros, minimum or maximum (the vertex an
// item asks for); nothing about the answer is shown before Submit; an item
// that authored graphing itself keeps the key points; one authored basic keeps basic.
{
  const { page, errors } = await open({ width: 1366, height: 768 }, 'calc=graphing&role=dol');
  await page.locator(`${BAR}[aria-label="Graphing calculator"]`).click();
  await page.locator(PANEL).waitFor();
  await page.keyboard.type('f(x) = x^2 - 4');
  await page.waitForSelector('[data-graphing-line="1"] [data-graphing-status="function"]');
  await page.getByRole('textbox', { name: 'Find y when x =' }).fill('2');
  await page.waitForFunction(() => /Line 1: y = 0/.test(document.querySelector('[data-graphing-trace="1"]')?.textContent || ''));
  assert.equal(await page.locator('[data-graphing-key-points]').count(), 0, 'DOL, graphing from the assignment: no key points listed');
  assert.doesNotMatch(await page.locator(PANEL).innerText(), /Minimum|Maximum|Zeros/, 'DOL: no zeros, minimum or maximum anywhere in the panel');
  await page.keyboard.press('Escape');
  await page.getByLabel('Positive zero').first().click();
  await page.keyboard.type('3');
  const text = await page.locator('body').innerText();
  assert.doesNotMatch(text, /\b(correct|incorrect|not quite|try again)\b/i, 'DOL: no verdict before Submit');
  assert.deepEqual(errors, []);
  await page.close();

  // A closed question of an exit ticket that is still open: App releases that
  // one question's feedback (its record is correct or out of tries). Its
  // calculator still lists nothing — a vertex here would answer the next one.
  for (const [query, listed] of [['calc=graphing&role=dol&released=1', false], ['calc=graphing&role=dol&review=1', true]]) {
    const run = await open({ width: 1366, height: 768 }, query);
    await run.page.locator(`${BAR}[aria-label="Graphing calculator"]`).click();
    await run.page.locator(PANEL).waitFor();
    await run.page.keyboard.type('y = (1/2)abs(x - 4) - 2');
    await run.page.waitForSelector('[data-graphing-line="1"] [data-graphing-status="function"]');
    if (listed) await run.page.waitForFunction(() => /\(4, −2\)/.test(document.querySelector('[data-graphing-minima]')?.textContent || ''));
    else await run.page.waitForTimeout(400);
    assert.equal(await run.page.locator('[data-graphing-key-points]').count(), listed ? 1 : 0, `${query}: key points ${listed ? 'listed once the exit ticket is released' : 'withheld on a closed question of an open exit ticket'}`);
    assert.deepEqual(run.errors, []);
    await run.page.close();
  }

  const authoredGraphing = await open({ width: 1366, height: 768 }, 'calc=off&role=dol&mode=graphing');
  await authoredGraphing.page.locator(`${BAR}[aria-label="Graphing calculator"]`).click();
  await authoredGraphing.page.locator(PANEL).waitFor();
  await authoredGraphing.page.keyboard.type('f(x) = x^2 - 4');
  await authoredGraphing.page.waitForFunction(() => /x = 2/.test(document.querySelector('[data-graphing-zeros]')?.textContent || ''));
  await authoredGraphing.page.close();

  const authored = await open({ width: 1366, height: 768 }, 'calc=graphing&role=dol&mode=basic');
  assert.equal(await authored.page.locator(`${BAR}[aria-label="Calculator"]`).count(), 1, 'DOL item authored basic keeps basic');
  await authored.page.locator(`${BAR}[aria-label="Calculator"]`).click();
  assert.match(await authored.page.locator(KEYPAD).textContent(), /BASIC CALCULATOR/);
  await authored.page.close();
  console.log('exit ticket: assignment setting with the stricter rule, ok');
}

await browser.close();
console.log('assignmentGraphingCalculator: all checks passed');
