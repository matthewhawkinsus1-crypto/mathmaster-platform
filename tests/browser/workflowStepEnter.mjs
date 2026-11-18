// ENTER IN A STEP OF A COMPOSED QUESTION NEVER SUBMITS THE QUESTION, PRESSES
// NO START OVER OR RESET, AND NEVER PUTS THE CURSOR IN A STEP NOT ON SCREEN
// (#386 R5).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/workflowStepEnter.mjs
//   (PLAYWRIGHT_MODULE / CHROMIUM_PATH when the defaults are not installed.)
//
// The real QuestionEngine and workflow runner (stepAlgebraFirstOperandMain.jsx,
// `?scene=enter`): five steps, shown one at a time, the others mounted and
// hidden — an equation, the balance workspace on the student's own equation, a
// set of values, a point and a written answer. A student with an Enter habit
// fills each step and presses Enter, then goes back to a step of the finished
// question and presses it again. Each Enter: no Submit, no Start over or Reset
// asked for (the harness counts both), no cursor in a step that is not on
// screen, no other step shown. What it does:
//
//   - in a box of an unfinished question, nothing: the caret stays;
//   - in the balance step, the box's own action: Pick up from the operation
//     box, Check my simplification from the simplification box — and once
//     that check commits the step, the cursor is back on the Divide tile the
//     move began from, not on the page (boardFocus.js);
//   - in the written answer, a new line;
//   - once every step is answered, it brings Submit into focus, and only a
//     second Enter, on Submit itself, presses it.
//
// The rule it rests on is pinned in node: tests/platform/workflowStepEnter.test.mjs.
//
// Exit code 1 on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};
const settle = (page, ms) => page.waitForTimeout(ms);
const divide = (page) => page.locator('button[aria-label="Choose Divide by operation"]:visible').first();
const operandBox = (page) => page.locator('.algebra-operation-composer math-field').first();

const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
page.on('pageerror', (error) => failures.push(`page error ${error.message}`));
await page.goto(`${ORIGIN}/tests/browser/stepAlgebraFirstOperand.html?scene=enter&run=${Date.now()}`, { timeout: 180_000 });
await page.locator('.workflow-focus__stage-shell--active math-field').first().waitFor({ timeout: 180_000 });
await settle(page, 1200);

const host = () => page.evaluate(() => ({ grades: window.__grades.length, steps: window.__steps.length, confirms: window.__confirms.length }));
// Where the cursor is: which step's box, the Submit button, or nothing.
const focus = () => page.evaluate(() => {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  let owner = active;
  while (owner?.getRootNode?.()?.host) owner = owner.getRootNode().host;
  const shell = owner?.closest?.('.workflow-focus__stage-shell');
  return {
    tag: String(owner?.tagName || '').toLowerCase(),
    text: String(owner?.textContent || '').trim().slice(0, 40),
    inStep: Boolean(shell),
    inShownStep: Boolean(shell?.classList.contains('workflow-focus__stage-shell--active')),
    submit: Boolean(owner?.closest?.('button') && String(owner.closest('button').textContent || '').trim().startsWith('Submit')),
    pickUpPressed: document.querySelector('.algebra-pickup-button')?.getAttribute('aria-pressed') === 'true',
    label: owner?.getAttribute?.('aria-label') || '',
    rail: owner?.closest?.('.algebra-rail-left') ? 'left' : owner?.closest?.('.algebra-rail-right') ? 'right' : '',
  };
});
const stepHeading = () => page.locator('.workflow-focus__workspace-heading h4').first().innerText();
const shownBox = () => page.locator('.workflow-focus__stage-shell--active math-field, .workflow-focus__stage-shell--active textarea').first();
const next = () => page.getByRole('button', { name: /Next step/ }).click();
const quiet = (ms = 600) => settle(page, ms);
const before = await host();
const enterIn = async (what, expect) => {
  const heading = await stepHeading();
  await page.keyboard.press('Enter');
  await quiet(700);
  const now = await host();
  const where = await focus();
  check(now.grades === before.grades, `${what}: Enter does not submit the question`, JSON.stringify(now));
  check(now.confirms === 0, `${what}: Enter presses no Start over or Reset`, JSON.stringify(now));
  check(!where.inStep || where.inShownStep, `${what}: Enter puts no cursor in a step that is not on screen`, JSON.stringify(where));
  check(await stepHeading() === heading, `${what}: Enter does not move to another step`, await stepHeading());
  expect(where);
  return where;
};

await shownBox().click();
await page.keyboard.type('5x=35');
await quiet();
await enterIn('step 1 (equation), question unfinished', (where) => check(where.tag === 'math-field' && where.inShownStep, 'step 1: the caret stays in its box', JSON.stringify(where)));

await next();
await divide(page).waitFor({ timeout: 60_000 });
await divide(page).click();
await operandBox(page).waitFor();
await page.keyboard.type('5');
await quiet();
await enterIn('step 2 (the balance\'s operation box)', (where) => check(where.pickUpPressed && where.inShownStep, 'step 2: Enter presses Pick up, the box\'s own card action, and the caret stays', JSON.stringify(where)));
// Place it on both sides and cross out the 5s, as the student would.
await page.locator('[aria-label$="on the left side"]').first().click();
await quiet(300);
await page.locator('[aria-label$="on the right side"]').first().click();
await page.locator('[aria-label="5, mark this factor for cancellation"]').first().click();
const simplification = page.locator('math-field[aria-label="Right side: enter your simplification"]').first();
await simplification.waitFor({ timeout: 30_000 });
await simplification.click();
await page.keyboard.type('7');
await quiet();
const solved = async () => String(await page.locator('[data-math-state]').first().getAttribute('data-math-state')).replace(/[\s~]/g, '');
await enterIn('step 2 (the balance\'s simplification box)', () => {});
for (let tries = 0; tries < 20 && await solved() !== 'x=7'; tries += 1) await quiet(300);
check(await solved() === 'x=7', 'step 2: Enter checks the simplification, the step\'s own check, and the step is solved (x = 7)', await solved());
// The box went with the step. The cursor is on the tile the move began from
// (Divide, in the left rail, where the student chose it), not on the page.
const afterStep = await focus();
check(afterStep.tag === 'button' && afterStep.label === 'Choose Divide by operation' && afterStep.rail === 'left' && afterStep.inShownStep,
  'step 2: once the step is committed, the cursor is back on the Divide tile it began from', JSON.stringify(afterStep));

await next();
await shownBox().click();
await page.keyboard.type('7');
await quiet();
await enterIn('step 3 (a set of values), question unfinished', (where) => check(where.tag === 'math-field' && where.inShownStep, 'step 3: the caret stays in its box', JSON.stringify(where)));

await next();
await shownBox().click();
await page.keyboard.type('(7,35)');
await quiet();
await enterIn('step 4 (a point), question unfinished', (where) => check(where.tag === 'math-field' && where.inShownStep, 'step 4: the caret stays in its box', JSON.stringify(where)));

await next();
await shownBox().click();
await page.keyboard.type('It is the number.');
await enterIn('step 5 (a written answer)', (where) => check(where.tag === 'textarea' && where.inShownStep, 'step 5: Enter is a new line in the written answer', JSON.stringify(where)));
check((await shownBox().inputValue()).endsWith('\n'), 'step 5: the written answer gained its new line');
await quiet(600);
check(/5 of 5 steps answered/.test(await page.locator('.workflow-focus__progress-text').innerText()), 'every step is answered', await page.locator('.workflow-focus__progress-text').innerText());

// Back to a middle step of the finished question.
await page.getByRole('button', { name: /^Step 3:/ }).click();
await quiet();
await shownBox().click();
await page.keyboard.press('End');
const third = await enterIn('step 3 again, every step answered', (where) => check(where.submit, 'Enter brings Submit into focus and presses nothing', JSON.stringify(where)));
if (third.submit) {
  await page.keyboard.press('Enter');
  await quiet(1500);
  check((await host()).grades === before.grades + 1, 'a second Enter, on Submit itself, submits the question once', JSON.stringify(await host()));
}
await context.close();

await browser.close();

if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('\nEnter never submitted the question, pressed a Start over or Reset, or left the step on screen.');
