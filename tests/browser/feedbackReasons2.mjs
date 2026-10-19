// THE WAVE-7 FEEDBACK MESSAGES, ON A PHONE, WHERE THEY MAY BE SHOWN.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/feedbackReasons2.mjs
//
// Student pass 3, wave 7 (handoff STUDENT_PASS3_FEEDBACK_REASONS_2.md). In the
// real QuestionEngine at 390×844, each message is driven the way a student
// meets it, read on screen and photographed (tests/browser/artifacts/
// feedbackReasons2/<case>.png); then the same work on an exit ticket (DOL)
// must show none of the outcome messages, though it is submitted.
//   regression          a short table: "Your table does not have every data point yet…"
//   functionOperations  no part right: "No part is correct yet…", never "Some parts are correct"
//   match               the right card, the wrong correction (the grader's 0.6)
//   dataModeling        direction and strength right, causation wrong
//   bridge              a wrong factored form: stage names, never "Recheck: <id>"
//   composed            a wrong mapping and domain: each red step says why
//   transformations     the finishing step names the Submit button (Rewrite
//                       Linear Form's is rendered in toolDirectionsSplit: a
//                       student's stepAlgebra2 rewrite opens the Step Algebra engine)
// Exits non-zero on any failure.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REGRESSION_FEEDBACK } from '../../src/tools/regressionCalculator/regressionFeedback.js';
import { LINEAR_MISMATCH_FEEDBACK } from '../../src/tools/representationMatch/linearMismatchFeedback.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/feedbackReasons2');
mkdirSync(ARTIFACTS, { recursive: true });

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const run = Date.now();

const open = async (name, role) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${name}/${role}: page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/feedbackReasons2.html?case=${name}&role=${role}&run=${run}-${name}-${role}`, { waitUntil: 'networkidle' });
  await page.locator('.mathmaster-tool-shell, .workflow-stage').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(700);
  return { context, page };
};
// The tool's own final button (not the Work View rail's hidden copy).
const toolSubmit = async (page) => {
  const button = page.locator('.mathmaster-tool-shell button[data-mm-enter-action="submit"], .mathmaster-tool-shell button[data-primary-answer-action="true"], .mathmaster-tool-shell button[data-work-view-check="true"]').first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForTimeout(900);
};
const setMath = (page, index, value) => page.locator('.mathmaster-tool-shell math-field').nth(index).evaluate(async (element, latex) => {
  await customElements.whenDefined('math-field');
  element.setValue(latex);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}, value);
// A text box by its accessible name, set the way React reads a change.
const typeInto = (page, label, value) => page.evaluate(({ name, entry }) => {
  // Where the method is withheld a name loses its method words
  // ("y-intercept b in general form" is "b in general form").
  const inputs = [...document.querySelectorAll('.mathmaster-tool-shell input')];
  const element = inputs.find((input) => input.getAttribute('aria-label') === name)
    || inputs.find((input) => input.getAttribute('aria-label') && name.endsWith(` ${input.getAttribute('aria-label')}`));
  if (!element) throw new Error(`no box named ${name}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, entry);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}, { name: label, entry: value });
// The sentence on screen: visible, and brought into view for the photograph.
const shown = async (page, text) => {
  const element = page.getByText(text, { exact: false }).first();
  if (!(await element.count())) return false;
  await element.scrollIntoViewIfNeeded().catch(() => {});
  return element.isVisible();
};
const bodyText = (page) => page.evaluate(() => document.body.innerText);

const CASES = [
  {
    name: 'regression',
    act: async (page) => { await toolSubmit(page); },
    expect: [REGRESSION_FEEDBACK.tableIncomplete],
    never: [/correlation value has not been produced|Regression setup is incomplete/],
  },
  {
    name: 'functionOperations',
    act: async (page) => { await setMath(page, 0, 'x'); await setMath(page, 1, 'x'); await page.waitForTimeout(200); await toolSubmit(page); },
    expect: ['No part is correct yet. Review each operation panel.'],
    never: [/Some parts are correct/],
  },
  {
    name: 'match',
    act: async (page) => {
      await page.getByRole('button', { name: /^Point-slope equation/ }).first().click();
      await page.locator('.mathmaster-tool-shell select').first().selectOption('plus');
      await toolSubmit(page);
    },
    expect: [LINEAR_MISMATCH_FEEDBACK.correctionWrong],
    never: [/actually consistent with the others/],
  },
  {
    name: 'dataModeling',
    act: async (page) => {
      const selects = page.locator('.mathmaster-tool-shell select');
      await selects.nth(0).selectOption('positive');
      await selects.nth(1).selectOption('strong');
      await selects.nth(2).selectOption('causation');
      await toolSubmit(page);
    },
    expect: ['Still to fix: the causation choice (your direction and strength are right). Everything else is right.'],
  },
  {
    name: 'bridge',
    act: async (page) => {
      await typeInto(page, 'Slope m in general form', '5');
      await typeInto(page, 'y-intercept b in general form', '-20');
      await typeInto(page, 'Equation in general/slope-intercept form', 'y = 5x - 20');
      await typeInto(page, 'Coefficient a in factored form', '5');
      await typeInto(page, 'Zero c in factored form', '3');
      await typeInto(page, 'Equation in factored linear form', 'y = 5(x - 3)');
      await toolSubmit(page);
    },
    expect: ['Equations, y = a(x − c): recheck a, c and the equation you wrote.'],
    never: [/Recheck: [a-zA-Z]+\./],
  },
  {
    name: 'composed',
    act: async (page) => {
      for (const [x, y] of [[1, 2], [2, 6], [3, 4]]) {
        await page.getByRole('button', { name: `Domain value ${x}` }).first().click();
        await page.getByRole('button', { name: `Range value ${y}` }).first().click();
      }
      await page.getByRole('button', { name: 'Check', exact: true }).first().click();
      await page.waitForTimeout(300);
      await page.locator('.workflow-stage math-field').first().click();
      await page.keyboard.type('1,2');
      await page.waitForTimeout(300);
      await page.locator('button.mathmaster-bar-submit').first().click();
      await page.waitForTimeout(1200);
    },
    expect: ['That is not the set of values in this relation — list each one once.', 'The arrows do not match the relation — check which value each one is joined to.'],
    selector: '[data-stage-reason]',
  },
  {
    name: 'transformations',
    // On a DOL the steps are method, so there is no fold to open.
    act: async (page) => {
      const fold = page.getByRole('button', { name: /How to do this/ });
      if (await fold.count()) { await fold.first().click(); await page.waitForTimeout(300); }
    },
    expect: ['When the two graphs overlap, press Submit.'],
    never: [/Press Check/],
    steps: true,
    methodOnly: true,
  },
];

for (const item of CASES) {
  // Practice: the message is on screen.
  {
    const { context, page } = await open(item.name, 'practice');
    await item.act(page);
    for (const text of item.expect) {
      // A step is drawn through MathText, which may split it into spans.
      const ok = item.selector
        ? (await page.locator(item.selector).allTextContents()).map((entry) => entry.trim()).includes(text)
        : item.steps ? (await bodyText(page)).includes(text) : await shown(page, text);
      check(ok, `practice ${item.name}: "${text}" is on screen`);
    }
    const text = await bodyText(page);
    for (const pattern of item.never || []) check(!pattern.test(text), `practice ${item.name}: never ${pattern}`, (text.match(pattern) || [''])[0]);
    await page.getByText(item.expect[0], { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(ARTIFACTS, `${item.name}.png`) });
    await context.close();
  }
  // An exit ticket: no outcome message, though the work is submitted.
  {
    const { context, page } = await open(item.name, 'dol');
    await item.act(page);
    const text = await bodyText(page);
    if (item.steps) {
      // The finishing step is how to work the button, so the DOL keeps it —
      // in the DOL's own word for that button.
      if (item.methodOnly) check(!text.includes(item.expect[0]), `dol ${item.name}: the method steps are withheld`);
      else check(text.includes(item.expect[0]), `dol ${item.name}: the control step names the Submit button`);
    } else {
      for (const expected of item.expect) check(!text.includes(expected), `dol ${item.name}: "${expected}" is withheld`);
      check(await page.locator('[data-stage-reason]').count() === 0, `dol ${item.name}: no step reason`);
      const grades = await page.evaluate(() => window.__mmGrades.length);
      check(grades === 1, `dol ${item.name}: the work was submitted`, `${grades} submission(s)`);
    }
    await context.close();
  }
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} feedback-reasons failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nEach wave-7 message says what the grader found, on a phone, and only where outcome feedback is shown.');
