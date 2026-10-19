// A STEP OR A NEW PROBLEM THE DEVICE COULD NOT QUEUE IS NOT TAKEN (pass 3, wave 7).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/stepNotQueued.mjs
//
// The real QuestionEngine and Step Algebra solver (stepNotQueuedMain.jsx). The
// host's durable outbox write fails, as App.jsx answers it:
//
//   step         3x + 6 = 21, "Subtract 6", the 6s cancelled. Before: the
//                solver applied the step as if saved, and a toast sat under
//                Work View. Now: the board keeps 3x + 6 = 21, nothing says
//                the step is complete, one alert says it was not saved, and
//                "Apply the step again" takes it once the device can save.
//   relation     2x + 3 < 11 on the relation solver: the same.
//   replacement  a closed question's "Request New Question": the question
//                and its saved work stay, one alert says no new problem yet;
//                asking again once the device can save gives the new problem.
//   defect       `?host=null` (the old host's answer) applies the step anyway.
//
// At 1366×768 and 390×844. Exit code 1 on any finding.
import { balancedMove, cancellationLabels, mathState, settle, termSelector } from './stepAlgebraDriver.mjs';
import { balanced, relationState } from './relationWorkspaceDriver.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const findings = [];
let checks = 0;
const step = (text) => { checks += 1; console.log(`  ✓ ${text}`); };
const fail = (text, detail = null) => { findings.push({ text, detail }); console.log(`  ✗ ${text}${detail ? `\n    ${JSON.stringify(detail)}` : ''}`); };
const expect = (condition, text, detail = null) => (condition ? step(text) : fail(text, detail));
const compact = (latex) => String(latex || '').replace(/[\s~]+/g, '');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());

const open = async (viewport, scene, host = 'not-queued') => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/tests/browser/stepNotQueued.html?scene=${scene}&host=${host}`, { timeout: 300000 });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator(scene === 'replacement' ? 'button:has-text("Request New Question")' : '[data-math-state], [data-relation-state], .mathmaster-question-engine').first().waitFor({ timeout: 120000 });
  await settle(page, 900);
  return { context, page, errors };
};

const calls = (page) => page.evaluate(() => window.__calls.filter((call) => call.kind !== 'replacement').length);
const notSavedAlerts = (page) => page.locator('[role="alert"]', { hasText: 'Step not saved' });
const applyAgain = (page) => page.getByRole('button', { name: 'Apply the step again' });
const completeWords = /Balanced step complete|Cancellation complete|Move applied|step complete/i;

// 3x + 6 = 21: Subtract 6, then cancel the 6s (the solver commits on the last one).
const subtractSix = async (page) => {
  const host = page.locator('body');
  await balancedMove(page, host, 'Subtract', '6');
  const six = (await cancellationLabels(host)).find((label) => /^[-+]?\s*6$/.test(label));
  if (six) await page.locator(termSelector(six, 'select to cancel')).first().click();
  await settle(page, 1400);
  if (await page.locator('button.algebra-keep-written').filter({ hasText: 'Keep as written' }).count()) {
    await page.locator('button.algebra-keep-written').filter({ hasText: 'Keep as written' }).click();
    await settle(page, 1200);
  }
};

for (const [label, viewport] of [['Chromebook', { width: 1366, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
  console.log(`\n${label}: a Step Algebra step the device cannot save`);
  {
    const { context, page, errors } = await open(viewport, 'step');
    const before = compact(await mathState(page.locator('body')));
    await subtractSix(page);
    const after = compact(await mathState(page.locator('body')));
    expect((await calls(page)) >= 1, 'the step reached the host', await page.evaluate(() => window.__calls));
    expect(after === before, 'the board keeps the equation the step was taken on (not applied)', { before, after });
    expect(await notSavedAlerts(page).count() === 1, 'one alert says the step was not saved');
    expect(/no try was used/.test(await notSavedAlerts(page).innerText().catch(() => '')), 'and that no try was used');
    expect(await page.locator('[role="alert"]').filter({ hasText: /not saved|not queued/i }).count() === 1, 'it is said once');
    expect(!completeWords.test(await page.locator('[data-question-stage]').innerText()), 'nothing says the step is complete');
    expect(await applyAgain(page).count() === 1 && await applyAgain(page).isEnabled(), '"Apply the step again" is offered');
    const box = await applyAgain(page).boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= viewport.width, 'and it fits the screen', box);
    const failedCalls = await calls(page);

    console.log(`${label}: the device can save again; the same step is taken`);
    await page.evaluate(() => { window.__hostFails = false; });
    await applyAgain(page).click();
    await settle(page, 1600);
    const retried = compact(await mathState(page.locator('body')));
    expect(retried !== before && /21-6|15|3x=/.test(retried), 'the step is applied from where it was', { before, retried });
    expect((await calls(page)) === failedCalls + 1, 'the retry reached the host once');
    expect(await notSavedAlerts(page).count() === 0 && await applyAgain(page).count() === 0, 'the alert and the button are gone');
    expect(errors.length === 0, 'no page errors', errors);
    await context.close();
  }

  console.log(`\n${label}: a relation step the device cannot save`);
  {
    const { context, page, errors } = await open(viewport, 'relation');
    const before = compact(await relationState(page));
    await balanced(page, 'subtract', '3');
    const after = compact(await relationState(page));
    expect((await calls(page)) === 1, 'the relation step reached the host once', await page.evaluate(() => window.__calls));
    expect(after === before, 'the relation is not changed', { before, after });
    expect(await notSavedAlerts(page).count() === 1, 'one alert says the step was not saved');
    expect(!/Balanced operation (applied|committed)/i.test(await page.locator('[data-question-stage]').innerText()), 'nothing says the step was applied');
    const commit = page.locator('button:visible', { hasText: 'Commit step' }).first();
    expect(await commit.count() === 1 && await commit.isEnabled(), 'the staged step is still there, with Commit step');

    console.log(`${label}: the device can save again; Commit step takes it`);
    await page.evaluate(() => { window.__hostFails = false; });
    await commit.click();
    await settle(page, 1000);
    const retried = compact(await relationState(page));
    expect(retried !== before && (await calls(page)) === 2, 'the same step is applied, saved once more', { before, retried });
    expect(await notSavedAlerts(page).count() === 0, 'the alert is gone');
    expect(errors.length === 0, 'no page errors', errors);
    await context.close();
  }

  console.log(`\n${label}: a new problem the device cannot save`);
  {
    const { context, page, errors } = await open(viewport, 'replacement');
    const keysBefore = await page.evaluate(() => window.__draftKeys());
    await page.getByRole('button', { name: 'Request New Question' }).click();
    await settle(page, 900);
    const alert = page.locator('[role="alert"]', { hasText: 'No new problem yet' });
    expect(await alert.count() === 1, 'one alert says there is no new problem yet');
    expect(/no try was used/.test(await alert.innerText().catch(() => '')), 'and that no try was used');
    expect(await page.locator('[data-question-stage]').getAttribute('data-variant') === '0', 'the question is the same one');
    const keysAfter = await page.evaluate(() => window.__draftKeys());
    expect(keysBefore.length > 0 && keysAfter.length === keysBefore.length, 'its saved work is kept', { keysBefore, keysAfter });
    const button = page.getByRole('button', { name: 'Request New Question' });
    expect(await button.count() === 1 && await button.isEnabled(), 'Request New Question can be pressed again');

    console.log(`${label}: the device can save again; the new problem comes`);
    await page.evaluate(() => { window.__hostFails = false; });
    await button.click();
    await settle(page, 1200);
    expect(await page.locator('[data-question-stage]').getAttribute('data-variant') === '1', 'the new problem opens');
    expect(await page.evaluate(() => window.__draftKeys().length) === 0, 'and only now is the old work cleared');
    expect(await page.locator('[role="alert"]', { hasText: 'No new problem yet' }).count() === 0, 'the alert is gone');
    expect(errors.length === 0, 'no page errors', errors);
    await context.close();
  }
}

console.log('\nThe defect, replayed: the old host answered the same failure with null');
{
  const { context, page } = await open({ width: 1366, height: 768 }, 'step', 'null');
  const before = compact(await mathState(page.locator('body')));
  await subtractSix(page);
  const after = compact(await mathState(page.locator('body')));
  expect(after !== before, 'with null the solver applies a step nothing saved (why the host must not return null)', { before, after });
  await context.close();
}
{
  const { context, page } = await open({ width: 1366, height: 768 }, 'replacement', 'null');
  const keysBefore = await page.evaluate(() => window.__draftKeys());
  await page.getByRole('button', { name: 'Request New Question' }).click();
  await settle(page, 900);
  const silent = await page.locator('[role="alert"]', { hasText: 'No new problem yet' }).count() === 0;
  expect(silent && keysBefore.length > 0, 'with nothing said the question looks unchanged, and nothing tells the student why');
  await context.close();
}

await browser.close();
console.log(`\n${checks} checks, ${findings.length} finding(s)`);
process.exit(findings.length ? 1 : 0);
