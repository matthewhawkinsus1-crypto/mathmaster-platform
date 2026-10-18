// MATRIX LAB FEEDBACK, AS A STUDENT MEETS IT (student pass 3, wave 5: PR-32,
// PR-33 and the matrices walkthrough's P2 cluster).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/matrixLabFeedback.mjs
//
// Drives the Algebra II matrices lesson (the algebra2MatricesLesson harness:
// the teacher import compiled and mounted in the real QuestionEngine) through
// rendered controls only, at 1366×768 and 390×844, and checks:
//
//   P2-10  a bare "−" or an untouched prefill keeps Check off, says why, and
//          spends no try;
//   P2-3   a missing variable written as 1 gets one three-line list, and the
//          outcome box does not repeat it as "Focus on";
//   PR-33  the substitution model of the baskets scores 100%;
//   P2-4   the figure sort names its wrong figures;
//   P2-5   A⁻¹ names its cells, says "rounded too early", marks four cells;
//   P2-9   a no-variable third equation says why;
//   P2-2   "none or many" waits for its reason, and a wrong reason is wrong;
//   P2-1   with the app's scroll padding, the list and the outcome sit above
//          the work bar right after Check;
//   P2-8   the calculator sits beside the product grid on a laptop, below it
//          on a phone; P2-11 no matrix box scrolls vertically;
//   DOL    on the exit tickets: no list, no marked cell, no verdict, and the
//          calculator press is recorded (P2-12).
//
// Exit code 1 on any finding. Screenshots: tests/browser/artifacts/matrixLabFeedback/.

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const here = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = process.env.ARTIFACTS_DIR || path.resolve(here, 'artifacts/matrixLabFeedback');
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_MODULE);
mkdirSync(ARTIFACTS, { recursive: true });

const findings = [];
let journey = '';
const check = (value, message) => {
  console.log(`${value ? 'ok  ' : 'FAIL'} ${journey}: ${message}`);
  if (!value) findings.push(`[${journey}] ${message}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

const session = async (viewport, { appScrollPadding = false, touch = false } = {}) => {
  const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${ORIGIN}/tests/browser/algebra2MatricesLesson.html?run=feedback-${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__matrices), null, { timeout: 60000 });
  if (appScrollPadding) {
    // The app's assignment screen keeps scrolled-to content clear of the work
    // bar (App.css, .mathmaster-assignment-screen); the harness does not
    // mount App, so it opts in the same way.
    await page.evaluate(() => {
      document.getElementById('root').classList.add('mathmaster-assignment-screen');
      document.documentElement.style.setProperty('--mm-action-bar-height', '65px');
    });
  }
  const go = async (id) => {
    await page.evaluate((questionId) => window.__matrices.go(questionId), id);
    await page.waitForSelector(`[data-question-id="${id}"]`);
    await page.waitForTimeout(500);
  };
  const fill = (label, value) => page.getByLabel(label, { exact: true }).fill(String(value));
  const fillSystem = async (rows) => {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = 0; j < 3; j += 1) await fill(`Coefficient matrix A, row ${i + 1}, coefficient of ${'xyz'[j]}`, rows[i][j]);
      await fill(`Constant matrix B, row ${i + 1}`, rows[i][3]);
    }
  };
  const checkButton = () => page.locator('[data-question-id] [data-primary-answer-action="true"]').first();
  const press = async () => { await checkButton().click(); await page.waitForTimeout(1000); };
  const fixList = () => page.evaluate(() => [...document.querySelectorAll('[data-matrix-fix-list] li')].map((li) => li.textContent.trim()));
  const formatMessage = () => page.evaluate(() => document.querySelector('[data-matrix-format-message]')?.textContent || null);
  const record = (id) => page.evaluate((questionId) => window.__matrices.records()[questionId] || null, id);
  const lastGrade = () => page.evaluate(() => window.__matrices.grades().slice(-1)[0] || null);
  const invalidCells = () => page.evaluate(() => document.querySelectorAll('[data-question-id] input[aria-invalid="true"]').length);
  const shot = (name) => page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`) });
  return { page, errors, go, fill, fillSystem, checkButton, press, fixList, formatMessage, record, lastGrade, invalidCells, shot };
};

/* ------------------------------------------------------------- laptop */
{
  const s = await session({ width: 1366, height: 768 }, { appScrollPadding: true });
  const { page } = s;

  journey = 'CW 7 bare sign (P2-10)';
  await s.go('l3m-cw-7');
  await s.fillSystem([[2, '-', -2, 3], [3, 1, -2, 11], [-2, -1, 1, -8]]);
  check(!(await s.checkButton().isEnabled()), 'Check is off while a cell holds only "-"');
  check(/alone is not a number.*Nothing has been checked yet/.test(await s.formatMessage() || ''), `the format message says why: ${await s.formatMessage()}`);
  await s.fill('Coefficient matrix A, row 1, coefficient of y', '-1');
  check(await s.checkButton().isEnabled(), 'writing −1 turns Check on');
  check((await s.record('l3m-cw-7')) === null, 'no try was spent');
  await s.shot('laptop-cw7-format-message');

  journey = 'CW 8 untouched prefill (P2-10)';
  await s.go('l3m-cw-8');
  check(!(await s.checkButton().isEnabled()), 'Nicky\'s matrix as given cannot be checked');
  check(/as it was given/.test(await s.formatMessage() || ''), 'and the student is told why');

  journey = 'CW 9 missing variable as 1 (P2-3)';
  await s.go('l3m-cw-9');
  await s.fillSystem([[2, -3, 1, 7], [1, 1, 1, -5], [1, 2, 4, -17]]);
  await page.getByRole('radio', { name: 'Exactly one solution' }).click();
  await s.fill('Value of x', '6/7'); await s.fill('Value of y', '-39/14'); await s.fill('Value of z', '-43/14');
  await s.press();
  const cw9 = await s.fixList();
  check(cw9.length === 3, `one list of three lines (${cw9.length})`);
  check(/^Row 1: equation 1 has no z term/.test(cw9[0] || '') && /^Row 2: equation 2 has no x term/.test(cw9[1] || ''), 'each row says why');
  check(/^Your x, y and z are what your A and B give/.test(cw9[2] || ''), 'x, y, z are one carried line');
  const cw9Text = await page.evaluate(() => document.querySelector('[data-question-id]').innerText);
  check(!/Focus on/.test(cw9Text), 'the outcome box does not list the parts again');
  check(/Not quite\./.test(cw9Text), 'the outcome is still said');
  await s.shot('laptop-cw9-one-list');

  journey = 'PR 10 substitution model (PR-33)';
  await s.go('l3m-pr-10');
  await s.fillSystem([[3, 1, 0, 80], [63, 100, 130, 8345], [2, 0, -1, 0]]);
  await page.getByRole('radio', { name: 'Exactly one solution' }).click();
  await s.fill('Value of x', 15); await s.fill('Value of y', 35); await s.fill('Value of z', 30);
  await s.press();
  const pr10 = await s.lastGrade();
  check(pr10?.isCorrect === true && pr10?.partialCreditPercent === 100, `3x + y = 80 with money ×4 is a model: ${JSON.stringify(pr10 && { ok: pr10.isCorrect, pct: pr10.partialCreditPercent })}`);

  journey = 'CW 4 figure sort (P2-4)';
  await s.go('l3m-cw-4');
  const chosen = ['2 × 4', '2 × 4', '2 × 4', 'Not defined', 'Not defined', '4 × 4', '4 × 4', '4 × 4'];
  for (let i = 0; i < chosen.length; i += 1) {
    const group = page.getByRole('radiogroup', { name: `Category for Figure ${i + 1}` });
    await group.getByRole('radio', { name: chosen[i] === 'Not defined' ? 'Not defined' : `Defined — the product is ${chosen[i]}` }).click();
  }
  await page.getByRole('button', { name: /^(Check|Submit)/ }).last().click();
  await page.waitForTimeout(1000);
  const named = await page.evaluate(() => document.querySelector('[data-figure-match-wrong]')?.textContent || '');
  check(named === 'Figures 3 and 8 are not in the right category yet.', `the wrong figures are named: "${named}"`);
  check((await page.locator('[data-figure-wrong]').count()) === 2, 'and their cards are marked');
  await s.shot('laptop-cw4-figures-named');

  journey = 'PR 5 A⁻¹ (P2-5)';
  await s.go('l3m-pr-5');
  check(/decimals to at least 3 places/.test(await page.evaluate(() => document.querySelector('[data-question-id]').innerText)), 'the panel asks for what the grader accepts');
  await s.fillSystem([[2, 0, 2, 2], [5, 3, 0, 4], [0, 3, -4, 4]]);
  const typed = [['-2', '1', '-1'], ['3.3', '-1.3', '1.7'], ['2.5', '-1', '5']];
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) await s.fill(`Inverse matrix, row ${i + 1}, column ${j + 1}`, typed[i][j]);
  await page.getByRole('radio', { name: 'Exactly one solution' }).click();
  await s.fill('Value of x', 2); await s.fill('Value of y', -2); await s.fill('Value of z', 0);
  await s.press();
  const pr5 = await s.fixList();
  check(/row 2, columns 1, 2 and 3 were rounded too early/.test(pr5[0] || ''), `the cells rounded early are named: ${pr5[0]}`);
  check(/row 3, column 3 is not right yet/.test(pr5[0] || ''), 'and the wrong cell');
  check((await s.invalidCells()) === 4, 'four cells are marked');

  journey = 'PR 9 no-variable equation (P2-9)';
  await s.go('l3m-pr-9');
  for (const variable of ['x', 'y', 'z']) await s.fill(`Equation 3 so the system has INFINITELY MANY solutions: coefficient of ${variable}`, 0);
  await s.fill('Equation 3 so the system has INFINITELY MANY solutions: constant', 0);
  for (const [variable, value] of [['x', 10], ['y', -6], ['z', 2]]) await s.fill(`Equation 3 so the system has NO solution: coefficient of ${variable}`, value);
  await s.fill('Equation 3 so the system has NO solution: constant', 5);
  await s.press();
  check(/every coefficient is 0, so it is not an equation in x, y and z/.test((await s.fixList())[0] || ''), '0x + 0y + 0z = 0 says why');

  journey = 'CW 10 singular reason (P2-2)';
  await s.go('l3m-cw-10');
  await s.fillSystem([[1, 2, -1, 1], [2, -2, -1, 2], [3, 6, -3, 3]]);
  await page.getByRole('radio', { name: 'Infinitely many solutions' }).click();
  check(!(await s.checkButton().isEnabled()), '"many" alone cannot be checked');
  await page.getByLabel('The row that is a multiple').selectOption('3');
  await s.fill('The multiple', 2);
  await page.getByLabel('The row it is a multiple of').selectOption('1');
  await page.getByRole('radio', { name: 'follow the same multiple' }).click();
  await s.press();
  check((await s.lastGrade())?.isCorrect === false, 'the wrong multiple is not credited');
  await s.fill('The multiple', 3);
  await s.press();
  check((await s.lastGrade())?.isCorrect === true, 'row 3 = 3 × row 1, constants follow: many');

  journey = 'CW 2 after Check (P2-1)';
  await s.go('l3m-cw-2');
  await s.fill('Dimensions of matrix B: number of rows', 4);
  await s.fill('Dimensions of matrix B: number of columns', 5);
  const notation = page.locator('input[aria-label^="Row number"], input[aria-label^="Column number"]');
  for (let k = 0; k < await notation.count(); k += 1) await notation.nth(k).fill('1');
  await s.press();
  await page.waitForTimeout(500);
  const clear = await page.evaluate(() => {
    const bar = document.querySelector('.mathmaster-desktop-action-bar')?.getBoundingClientRect().top ?? window.innerHeight;
    const lines = [...document.querySelectorAll('[data-matrix-fix-list] li')].map((li) => li.getBoundingClientRect());
    const outcome = document.querySelector('[data-attempt-outcome="shown"]')?.getBoundingClientRect();
    return { bar, lines: lines.map((r) => [r.top, r.bottom]), outcome: outcome ? [outcome.top, outcome.bottom] : null };
  });
  check(clear.lines.length === 4 && clear.lines.every(([top, bottom]) => top >= 0 && bottom <= clear.bar), `every line is on screen above the bar: ${JSON.stringify(clear)}`);
  check(Boolean(clear.outcome) && clear.outcome[1] <= clear.bar, 'and so is the outcome');
  await s.shot('laptop-cw2-list-above-bar');

  journey = 'CW 5 and CW 6 layout (P2-11, P2-8)';
  await s.go('l3m-cw-5');
  await page.waitForTimeout(1000);
  const scrolling = await page.evaluate(() => [...document.querySelectorAll('[data-matrix-scroll]')].filter((box) => box.scrollHeight > box.clientHeight).length);
  check(scrolling === 0, `no matrix box scrolls vertically (${scrolling})`);
  await s.go('l3m-cw-6');
  const beside = await page.evaluate(() => {
    const grid = [...document.querySelectorAll('[data-matrix-grid]')].find((figure) => figure.querySelector('input'))?.getBoundingClientRect();
    const calculator = document.querySelector('[data-matrix-calculator]')?.getBoundingClientRect();
    return grid && calculator ? { gridRight: grid.right, calcLeft: calculator.left, gridTop: grid.top, calcTop: calculator.top, calcBottom: calculator.bottom } : null;
  });
  check(Boolean(beside) && beside.calcLeft >= beside.gridRight - 1 && beside.calcTop < beside.gridTop + 200, `the calculator is beside the grid: ${JSON.stringify(beside)}`);
  await s.shot('laptop-cw6-calculator-beside-grid');

  journey = 'exit tickets (DOL)';
  await s.go('l3m-dol-1');
  await page.getByRole('radio', { name: 'Yes' }).first().click();
  await s.fill('Dimensions of P · Q: number of rows', 2);
  await s.fill('Dimensions of P · Q: number of columns', 2);
  const product = [['2', '7'], ['2', '-5']];
  for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) await s.fill(`Matrix PQ, row ${i + 1}, column ${j + 1}`, product[i][j]);
  await s.press();
  const dol1 = await page.evaluate(() => document.querySelector('[data-question-id]').innerText);
  check((await s.fixList()).length === 0, 'DOL 1: no list of what to fix');
  check((await s.invalidCells()) === 0, 'DOL 1: no cell marked');
  // "Correctness feedback is held…" is the platform saying nothing yet.
  check(!/Not yet|\bCorrect\b(?!ness)|Reconsider|not right yet/.test(dol1), `DOL 1: no verdict (${(dol1.match(/Not yet|\bCorrect\b(?!ness)|Reconsider|not right yet/) || [''])[0]})`);
  check(/held until/.test(dol1), 'DOL 1: the response is recorded and its verdict held');
  await s.go('l3m-dol-2');
  await s.fillSystem([[1, 2, 1, 3], [3, -1, -1, 4], [2, -1, 3, 14]]);
  await page.getByRole('button', { name: /A inverse times B/i }).click();
  await page.getByRole('radio', { name: 'Exactly one solution' }).click();
  await s.fill('Value of x', 2); await s.fill('Value of y', -1); await s.fill('Value of z', 4);
  await s.press();
  check((await s.record('l3m-dol-2'))?.supportUsage?.calculatorUsed === true, 'DOL 2: the [A]⁻¹·[B] press is recorded as calculatorUsed (P2-12)');
  check((await s.fixList()).length === 0, 'DOL 2: no list after a wrong z');
  await s.go('l3m-dol-3');
  await s.fillSystem([[1, -2, 3, 4], [2, 1, -1, 1], [-3, 6, -9, 12]]);
  await page.getByRole('radio', { name: 'Infinitely many solutions' }).click();
  check((await page.locator('[data-singular-reason]').count()) === 1, 'DOL 3 asks for the reason too');
  await page.getByLabel('The row that is a multiple').selectOption('3');
  await s.fill('The multiple', -3);
  await page.getByLabel('The row it is a multiple of').selectOption('1');
  await page.getByRole('radio', { name: 'follow the same multiple' }).click();
  await s.press();
  const dol3 = await page.evaluate(() => document.querySelector('[data-question-id]').innerText);
  check((await s.fixList()).length === 0 && !/Not yet|\bCorrect\b(?!ness)|Why A has no inverse/.test(dol3), `DOL 3: a wrong read says nothing (${(dol3.match(/Not yet|\bCorrect\b(?!ness)|Why A has no inverse/) || [''])[0]})`);
  check(s.errors.length === 0, `no page errors (${s.errors.join(' | ')})`);
  await s.page.close();
}

/* --------------------------------------------------------------- phone */
{
  const s = await session({ width: 390, height: 844 }, { touch: true });
  const { page } = s;
  journey = 'phone PR 6 (P2-7)';
  await s.go('l3m-pr-6');
  const cells = page.locator('[data-question-id] input[aria-label]');
  for (let k = 0; k < await cells.count(); k += 1) { await cells.nth(k).tap(); await cells.nth(k).fill('1'); }
  await page.getByRole('radio', { name: 'Exactly one solution' }).tap();
  for (const variable of ['x', 'y', 'z']) { await page.getByLabel(`Value of ${variable}`, { exact: true }).tap(); await s.fill(`Value of ${variable}`, 1); }
  // Bring Check into view the way a browser does, then nothing may cover it.
  const reach = await page.evaluate(() => {
    const button = document.querySelector('[data-question-id] [data-primary-answer-action]');
    button.scrollIntoView({ block: 'nearest' });
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { own: Boolean(hit?.closest('[data-primary-answer-action]')), hit: (hit?.textContent || '').slice(0, 20), top: box.top, bottom: box.bottom };
  });
  check(reach.own, `after the last value, Check is not under the work bar: ${JSON.stringify(reach)}`);
  journey = 'phone CW 6 (P2-8)';
  await s.go('l3m-cw-6');
  const stacked = await page.evaluate(() => {
    const grid = [...document.querySelectorAll('[data-matrix-grid]')].find((figure) => figure.querySelector('input'))?.getBoundingClientRect();
    const calculator = document.querySelector('[data-matrix-calculator]')?.getBoundingClientRect();
    const scroller = document.scrollingElement;
    return { below: Boolean(grid && calculator && calculator.top >= grid.bottom - 1), sideways: scroller.scrollWidth > scroller.clientWidth + 1 };
  });
  check(stacked.below, 'on a phone the calculator stacks below the grid');
  check(!stacked.sideways, 'no sideways scroll');
  journey = 'phone CW 7 (P2-10)';
  await s.go('l3m-cw-7');
  await s.fillSystem([[2, '+', -2, 3], [3, 1, -2, 11], [-2, -1, 1, -8]]);
  check(!(await s.checkButton().isEnabled()) && /write 1/.test(await s.formatMessage() || ''), 'a bare "+" is caught on a phone too');
  await s.shot('phone-cw7-format-message');
  check(s.errors.length === 0, `no page errors (${s.errors.join(' | ')})`);
  await s.page.close();
}

await browser.close();
console.log(findings.length ? `\n${findings.length} finding(s):\n${findings.join('\n')}` : '\nMatrix Lab feedback: every check passed.');
process.exit(findings.length ? 1 : 0);
