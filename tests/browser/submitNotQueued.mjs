// A SUBMISSION THE DEVICE COULD NOT QUEUE IS NOT SUBMITTED (Batch 3, RUN-3).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/submitNotQueued.mjs
//
// A correct answer, and the device's outbox write fails. Before: "Correct!",
// the question locked, Submit gone, and a toast asking for Submit again. Now:
// no verdict, the answer still editable, Submit still there and pressable,
// and the message says it was not submitted. Pressing Submit once the device
// can queue again records the attempt. `?host=null` replays the old host
// (returning null) to show the defect this guards against.
//
// Exit code 1 on any finding.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const findings = [];
let checks = 0;
const step = (text) => { checks += 1; console.log(`  ✓ ${text}`); };
const fail = (text, detail = null) => { findings.push({ text, detail }); console.log(`  ✗ ${text}${detail ? `\n    ${JSON.stringify(detail)}` : ''}`); };
const expect = (condition, text, detail = null) => (condition ? step(text) : fail(text, detail));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());

const open = async (viewport, host) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/tests/browser/submitNotQueued.html?host=${host}`, { timeout: 300000 });
  await page.locator('math-field, input').first().waitFor({ timeout: 120000 });
  return { context, page, errors };
};

const answer = async (page, text) => {
  const field = page.locator('[data-question-stage] math-field, [data-question-stage] input[type="text"]').first();
  await field.click();
  await page.keyboard.type(text);
  await page.waitForTimeout(250);
};
const submitButton = (page) => page.getByRole('button', { name: /^Submit/ }).first();
const text = (page) => page.locator('[data-question-stage]').innerText();

for (const [label, viewport] of [['Chromebook', { width: 1366, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
  console.log(`\n${label}: the outbox write fails on a correct answer`);
  const { context, page, errors } = await open(viewport, 'not-queued');
  await answer(page, '12');
  await submitButton(page).click();
  await page.waitForTimeout(500);
  const body = await text(page);
  expect(!/Correct!|This question is complete/i.test(body), 'no verdict is shown', body.slice(0, 400));
  // The results area ([data-attempt-results]) comes with Batch 1 (RUN-1); without it
  // (main) the engine's own alert is found by its words.
  const scoped = page.locator('[data-attempt-results] [role="alert"]');
  const alert = await scoped.count() ? scoped : page.locator('.mathmaster-question-engine [role="alert"]', { hasText: 'Not submitted' });
  expect(await alert.count() === 1 && /Not submitted/.test(await alert.innerText()), 'the results area says it was not submitted');
  expect(/no try was used/i.test(await alert.innerText().catch(() => '')), 'and that no try was used');
  expect(await submitButton(page).count() === 1 && await submitButton(page).isEnabled(), 'Submit is still there and can be pressed');
  expect(await page.locator('fieldset[disabled]').count() === 0, 'the question is not locked');
  const field = page.locator('[data-question-stage] math-field, [data-question-stage] input[type="text"]').first();
  const editable = await field.evaluate((element) => !element.closest('[inert]') && !element.disabled && element.getAttribute('read-only') === null && !element.readOnly);
  expect(editable, 'the answer is still editable');
  expect(await page.evaluate(() => window.__grades.length) === 1, 'the host was asked once');

  console.log(`${label}: the device can queue again; Submit records it`);
  await page.evaluate(() => { window.__hostFails = false; });
  await submitButton(page).click();
  await page.waitForTimeout(700);
  expect(/Correct/i.test(await text(page)), 'pressing Submit again records the attempt and shows its verdict');
  expect(await page.evaluate(() => window.__grades.length) === 2, 'the second press reached the host');
  expect(errors.length === 0, 'no page errors', errors);
  await context.close();
}

console.log('\nThe defect, replayed: the old host answered the same failure with null');
{
  const { context, page } = await open({ width: 1366, height: 768 }, 'null');
  await answer(page, '12');
  await submitButton(page).click();
  await page.waitForTimeout(500);
  const showedVerdict = /Correct/i.test(await text(page));
  expect(showedVerdict, 'with null the engine still shows its own verdict (why the host must not return null)');
  await context.close();
}

await browser.close();
console.log(`\n${checks} checks, ${findings.length} finding(s)`);
process.exit(findings.length ? 1 : 0);
