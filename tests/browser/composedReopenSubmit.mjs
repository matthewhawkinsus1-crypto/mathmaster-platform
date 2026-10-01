// A FINISHED COMPOSED QUESTION, OPENED AGAIN, CAN BE SUBMITTED.
//
// HOW TO RUN (the draft harness's warm, HMR-free gate server):
//   npm run gates:serve -- draft-persistence --port 5203 &
//   AUDIT_ORIGIN=http://127.0.0.1:5203 node tests/browser/composedReopenSubmit.mjs
//
// QuestionEngine reset its answer state in an effect that also ran on mount,
// and React runs a response module's mount effects before its parent's: the
// first report was wiped. Most modules report again on their next render;
// WorkflowRunner reports only when an answer changes. So a composed question
// whose every step was already answered — restored from the student's draft
// after a reload, or reopened from the question strip — opened with Submit
// off, and stayed off until the student changed an answer they had finished.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5203';
const PAGE = `${ORIGIN}/tests/browser/draftPersistence.html`;
const SCENE = 'composed-workflow';

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const openScene = async () => {
  await page.waitForFunction(() => Boolean(window.__mmDraft), null, { timeout: 120000 });
  const index = await page.evaluate((id) => window.__mmDraft.scenes.findIndex((scene) => scene.id === id), SCENE);
  await page.evaluate((value) => window.__mmDraft.go(value), index);
  await page.waitForSelector(`[data-draft-scene="${SCENE}"] math-field`, { timeout: 60000 });
  await page.waitForTimeout(600);
};
const scene = () => page.locator(`[data-draft-scene="${SCENE}"]`);
const submit = () => scene().getByRole('button', { name: /^Submit( Answer)?$/ }).first();
const submitEnabled = async () => {
  const button = submit();
  if (!(await button.count())) return { found: false, enabled: false };
  return { found: true, enabled: await button.isEnabled() };
};
const typeInto = async (index, text) => {
  const field = scene().locator('math-field').nth(index);
  await field.click();
  await page.keyboard.type(text, { delay: 12 });
  await page.keyboard.press('Tab');
};
const fieldValues = () => scene().locator('math-field').evaluateAll((fields) => fields.map((field) => field.value));

await page.goto(PAGE, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.__mmDraft), null, { timeout: 120000 });
await page.evaluate(() => window.__mmDraft.clearStorage());
await page.reload({ waitUntil: 'load' });
await openScene();

const before = await submitEnabled();
check(before.found && !before.enabled, 'an unanswered composed question cannot be submitted', JSON.stringify(before));

// Answer every step, as a student does.
await typeInto(0, '[-2,5]');
await typeInto(1, '[0,7]');
await scene().getByRole('button', { name: 'Decreasing everywhere', exact: true }).first().click();
await page.waitForTimeout(500);
const answered = await submitEnabled();
check(answered.enabled, 'with every step answered, Submit is on', JSON.stringify(answered));
const values = await fieldValues();

// Reload: the answers come back from the device's draft.
await page.reload({ waitUntil: 'load' });
await openScene();
const restoredValues = await fieldValues();
check(JSON.stringify(restoredValues) === JSON.stringify(values), 'the answers come back after a reload', `${JSON.stringify(values)} → ${JSON.stringify(restoredValues)}`);
const reopened = await submitEnabled();
check(reopened.enabled, 'after a reload, the finished question can be submitted without changing an answer', JSON.stringify(reopened));

// Away to another question and back: the same, through a remount.
await page.evaluate(() => window.__mmDraft.go(0));
await page.waitForTimeout(400);
await openScene();
const returned = await submitEnabled();
check(returned.enabled, 'back from another question, it can still be submitted', JSON.stringify(returned));

check(errors.length === 0, 'no page error', errors.slice(0, 2).join(' | '));
await browser.close();
console.log(failures ? `\n${failures} check(s) failed.` : '\nA finished composed question opened again can be submitted.');
process.exit(failures ? 1 : 0);
