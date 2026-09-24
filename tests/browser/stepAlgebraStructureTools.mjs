// FACTORING, FRACTION SPLITTING, REDUCTION AND ARRANGEMENT — ASKED OF A REAL BROWSER.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/stepAlgebraStructureTools.mjs
//
// Drives the real Step Algebra controls through the real QuestionEngine
// (stepAlgebraStructureToolsMain.jsx). Nothing here computes algebra for the
// student: every token tapped, every remainder typed, is what a student does.
//
// Journeys:
//   factored-15x-45     Factor 15x - 45 to 15(x - 3): select terms, primes,
//                       choose 3 and 5 in each, pull out, write x and -3.
//                       A wrong-sign remainder is refused. Transient Undo
//                       drops the last prime; committed Undo restores the
//                       equation and removes the history entry.
//   factored-partial    3 first, then 5 inside the group, then 3 × 5 = 15.
//   factored-negative   -6x + 12 -> -6(x - 2) with "Pull out a negative",
//                       left mid-factoring and restored after navigation and
//                       after a full reload, with no leak into other questions.
//   slope-5x-2y-6       Balanced moves, Split fraction (with an Undo of one
//                       denominator placement), Cancel factors (a mismatched
//                       pair refused), Arrange terms -> y = -5x/2 + 3.
//   slope-2x-4y-8       The stepAlgebra2 tool path, negative denominator:
//                       y = -2 + x/2, never an invented negative.
//   keyboard            Factor tokens and commit reached by keyboard alone.
//   phone               390px: no horizontal page scroll, tokens in view.
//   solve-regression    3x + 6 = 21 still solves to x = 5.
//
// Exit code 1 on any finding. Screenshots land in
// tests/browser/artifacts/stepAlgebraStructureTools/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { balancedMove, cancelFactor, chooseOperation, simplifySide, typeOperand } from './stepAlgebraDriver.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/stepAlgebraStructureTools');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const PAGE = `${ORIGIN}/tests/browser/stepAlgebraStructureTools.html`;
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const report = [];
const note = (journey, detail) => findings.push({ journey, detail });
const expect = (journey, ok, detail) => { if (!ok) note(journey, detail); };
const compact = (latex) => String(latex || '').replace(/[\s~]+/g, '');

const settle = (page, ms = 250) => page.waitForTimeout(ms);
const state = (page) => page.locator('[data-math-state]').first().getAttribute('data-math-state');
const statusTexts = async (page) => (await page.locator('[role="status"]').allInnerTexts()).filter((text) => text && !/tries left/.test(text));
const undoButton = (page) => page.locator('.mathmaster-universal-undo:not([data-work-view-action])');
const setField = async (page, field, value) => {
  await field.evaluate((element, next) => { element.setValue(next); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await settle(page, 180);
};

const open = async (context, questionIndex) => {
  const page = await context.newPage();
  page.on('pageerror', (error) => note('page', String(error)));
  await page.goto(`${PAGE}?q=${questionIndex}`);
  await page.waitForFunction(() => Boolean(window.__mmStructure));
  await page.evaluate(() => window.__mmStructure.clearStorage());
  await page.reload();
  await page.waitForSelector('[data-math-state]', { timeout: 20000 });
  await settle(page, 900);
  return page;
};
const go = async (page, questionIndex) => {
  await page.evaluate((index) => window.__mmStructure.go(index), questionIndex);
  await page.waitForSelector('[data-math-state]', { timeout: 20000 });
  await settle(page, 900);
};

/**
 * + or − on both sides, placed at the END of the right side (6 − 5x rather
 * than −5x + 6): the student taps just right of the last right-side term.
 */
const balancedMoveAtEnd = async (page, host, label, operand) => {
  await chooseOperation(page, host, label);
  await typeOperand(page, host, operand);
  await host.locator('button.algebra-pickup-button').click();
  await host.locator('[aria-label$="on the left side"]').first().click();
  await settle(page, 250);
  const rightSide = host.locator('[aria-label$="on the right side"]').first();
  const box = await rightSide.boundingBox();
  const lastTerm = await host.locator('.algebra-equation-box').nth(1).locator('[data-term-index]').last().boundingBox();
  await rightSide.click({ position: { x: Math.min(box.width - 4, lastTerm.x + lastTerm.width + 16 - box.x), y: lastTerm.y + lastTerm.height / 2 - box.y } });
  await settle(page, 500);
};

const startFactoring = async (page, termLabels) => {
  await page.locator('.algebra-structure-toggle--factor').first().click();
  await settle(page);
  for (const label of termLabels) {
    await page.locator(`[aria-label="${label}, select as a term to factor"]`).first().click();
    await settle(page, 120);
  }
  await page.getByRole('button', { name: 'Factor to primes' }).first().click();
  await settle(page);
};
const token = (page, label) => page.locator(`button.algebra-structure-token[aria-label^="${label}"]`);
const chooseTokens = async (page, labels) => {
  for (const label of labels) {
    const candidates = token(page, label);
    const count = await candidates.count();
    let clicked = false;
    for (let index = 0; index < count && !clicked; index += 1) {
      if ((await candidates.nth(index).getAttribute('aria-pressed')) === 'false') {
        await candidates.nth(index).click();
        clicked = true;
      }
    }
    if (!clicked) throw new Error(`no free token ${label}`);
    await settle(page, 120);
  }
};
const pullOut = async (page) => {
  await page.locator('.algebra-structure-controls button.algebra-inline-commit').last().click();
  await settle(page, 450);
};
const remainders = (page) => page.locator('.algebra-structure-quotient math-field');
const checkFactoring = async (page) => {
  await page.getByRole('button', { name: 'Check factoring' }).click();
  await settle(page, 900);
};

/* ------------------------------------------------------------ journeys */

async function factored15x45(context) {
  const journey = 'factored-15x-45';
  const page = await open(context, 1);
  await startFactoring(page, ['15 x', '- 45']);
  await chooseTokens(page, ['Factor 3 of 15 x', 'Factor 5 of 15 x', 'Factor 3 of -45', 'Factor 5 of -45']);
  await undoButton(page).click();
  await settle(page);
  expect(journey, (await token(page, 'Factor 5 of -45').getAttribute('aria-pressed')) === 'false', 'transient Undo did not drop the last chosen prime');
  expect(journey, (await token(page, 'Factor 5 of 15 x').getAttribute('aria-pressed')) === 'true', 'transient Undo dropped more than one decision');
  await chooseTokens(page, ['Factor 5 of -45']);
  await pullOut(page);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || '');
  expect(journey, /What is left of 15x/.test(focused), `first remainder box was not focused (${focused})`);
  await setField(page, remainders(page).nth(0), 'x');
  await setField(page, remainders(page).nth(1), '3');
  await checkFactoring(page);
  expect(journey, compact(await state(page)) === 'y=15x-45', 'a wrong-sign remainder changed the equation');
  expect(journey, (await statusTexts(page)).some((text) => /Check the sign/.test(text)), 'the wrong sign was not named');
  await setField(page, remainders(page).nth(1), '-3');
  await remainders(page).nth(1).focus();
  await page.keyboard.press('Enter');
  await settle(page, 900);
  const committed = compact(await state(page));
  expect(journey, committed === 'y=15\\left(x-3\\right)', `committed ${committed}`);
  expect(journey, !/\\cdot|\*/.test(committed), 'multiplication dot or MathJS * in the committed equation');
  const history = await page.locator('.algebra-work-steps li').count();
  expect(journey, history === 1, `expected one history entry, found ${history}`);
  const historyLatex = await page.locator('.algebra-work-steps math-span').evaluateAll((elements) => elements.map((element) => element.textContent));
  expect(journey, historyLatex.every((latex) => !/\\cdot|\*|\[object/.test(latex)), `history shows machine syntax: ${historyLatex.join(' | ')}`);
  await page.screenshot({ path: path.join(ARTIFACTS, `${journey}.png`), fullPage: true });
  await undoButton(page).click();
  await settle(page, 400);
  expect(journey, compact(await state(page)) === 'y=15x-45', 'committed Undo did not restore the equation');
  expect(journey, (await page.locator('.algebra-work-steps li').count()) === 0, 'committed Undo left its history entry behind');
  report.push({ journey, committed, historyLatex });
  await page.close();
}

async function factoredPartial(context) {
  const journey = 'factored-partial';
  const page = await open(context, 1);
  await startFactoring(page, ['15 x', '- 45']);
  await chooseTokens(page, ['Factor 3 of 15 x', 'Factor 3 of -45']);
  await pullOut(page);
  await setField(page, remainders(page).nth(0), '5x');
  await setField(page, remainders(page).nth(1), '-15');
  await checkFactoring(page);
  expect(journey, compact(await state(page)) === 'y=3\\left(5x-15\\right)', `partial factor not accepted: ${await state(page)}`);
  expect(journey, (await page.locator('.algebra-structure-toggle--factor').count()) === 1, 'Factor was not offered again for 5x - 15');
  await page.locator('.algebra-structure-toggle--factor').click();
  await settle(page);
  await page.locator('[aria-label="5 x, select as a term to factor"]').first().click();
  await page.locator('[aria-label="- 15, select as a term to factor"]').first().click();
  await page.getByRole('button', { name: 'Factor to primes' }).click();
  await settle(page);
  await chooseTokens(page, ['Factor 5 of 5 x', 'Factor 5 of -15']);
  await pullOut(page);
  await setField(page, remainders(page).nth(0), 'x');
  await setField(page, remainders(page).nth(1), '-3');
  await checkFactoring(page);
  expect(journey, compact(await state(page)) === 'y=3\\left(5\\left(x-3\\right)\\right)', `nested factor: ${await state(page)}`);
  await page.locator('.algebra-structure-toggle--arithmetic').click();
  await settle(page, 400);
  await setField(page, page.locator('math-field[aria-label="Enter the product of these numbers"]'), '15');
  await page.locator('.algebra-structure-controls button.algebra-inline-commit').click();
  await settle(page, 900);
  const final = compact(await state(page));
  expect(journey, final === 'y=15\\left(x-3\\right)', `after 3 × 5: ${final}`);
  expect(journey, (await page.locator('text=✓ Written as y = a(x − c)').count()) === 1, 'factored goal chip not complete');
  await page.screenshot({ path: path.join(ARTIFACTS, `${journey}.png`), fullPage: true });
  report.push({ journey, final });
  await page.close();
}

async function factoredNegative(context) {
  const journey = 'factored-negative';
  const page = await open(context, 2);
  await startFactoring(page, ['-6 x', '+ 12']);
  await chooseTokens(page, ['Factor 2 of -6 x', 'Factor 3 of -6 x', 'Factor 2 of 12', 'Factor 3 of 12']);
  await page.getByRole('button', { name: 'Pull out a negative' }).click();
  await settle(page);
  await go(page, 4);
  expect(journey, (await page.locator('.algebra-structure-token').count()) === 0, 'factoring tokens leaked into another question');
  await go(page, 2);
  expect(journey, (await page.locator('button.algebra-structure-token[aria-pressed="true"]').count()) === 4, 'chosen primes were not restored after navigation');
  expect(journey, (await page.locator('button:has-text("Pulling out a negative")').count()) === 1, 'the negative choice was not restored');
  await page.reload();
  await page.waitForSelector('[data-math-state]');
  await settle(page, 900);
  expect(journey, (await page.locator('button.algebra-structure-token[aria-pressed="true"]').count()) === 4, 'chosen primes were not restored after a reload');
  await pullOut(page);
  await setField(page, remainders(page).nth(0), 'x');
  await go(page, 1);
  await go(page, 2);
  expect(journey, (await remainders(page).nth(0).evaluate((element) => element.value)) === 'x', 'a typed remainder was not restored');
  await setField(page, remainders(page).nth(1), '-2');
  await checkFactoring(page);
  const final = compact(await state(page));
  expect(journey, final === 'y=-6\\left(x-2\\right)', `negative factoring: ${final}`);
  report.push({ journey, final });
  await page.close();
}

async function slopeFiveTwoSix(context) {
  const journey = 'slope-5x-2y-6';
  const page = await open(context, 0);
  const host = page.locator('body');
  await balancedMoveAtEnd(page, host, 'Subtract', '5x');
  await page.locator('[aria-label="- 5 x, select to cancel"]').first().click();
  await settle(page, 1200);
  if (await page.locator('.algebra-optional-simplification').count()) await simplifySide(page, host, 'right', '6 - 5x');
  await settle(page, 700);
  await balancedMove(page, host, 'Divide by', '2');
  if (await page.locator('[aria-label$="mark this factor for cancellation"]').count()) await cancelFactor(page, host);
  await settle(page, 900);
  const unsplit = compact(await state(page));
  expect(journey, unsplit === 'y=\\frac{6-5x}{2}', `before splitting: ${unsplit}`);
  expect(journey, (await page.locator('.algebra-structure-toggle--split').count()) === 1, 'Split fraction was not offered for (6 - 5x)/2');
  await page.locator('.algebra-structure-toggle--split').click();
  await settle(page);
  await page.locator('button[aria-label^="Pick up the denominator"]').click();
  await page.locator('button[aria-label^="Place the denominator under"]').first().click();
  await settle(page);
  await undoButton(page).click();
  await settle(page);
  expect(journey, (await page.locator('button[aria-label^="Place the denominator under"]:not([disabled])').count()) === 2, 'Undo did not remove the last denominator placement');
  while (await page.locator('button[aria-label^="Place the denominator under"]:not([disabled])').count()) {
    if (!(await page.locator('button.algebra-inline-factor-token.is-armed').count())) await page.locator('button[aria-label^="Pick up the denominator"]').click();
    await page.locator('button[aria-label^="Place the denominator under"]:not([disabled])').first().click();
    await settle(page, 180);
  }
  const focusedCommit = await page.evaluate(() => document.activeElement?.textContent || '');
  expect(journey, focusedCommit === 'Commit split', `Commit split was not focused (${focusedCommit})`);
  await page.keyboard.press('Enter');
  await settle(page, 900);
  const split = compact(await state(page));
  expect(journey, split === 'y=\\frac{6}{2}-\\frac{5x}{2}', `split: ${split}`);
  await page.locator('.algebra-structure-toggle--reduce').click();
  await settle(page);
  await page.locator('[aria-label$="select to write as prime factors"]').first().click();
  await settle(page);
  await page.locator('button[aria-label="Numerator factor 3"]').click();
  await page.locator('button[aria-label="Denominator factor 2"]').click();
  await settle(page);
  expect(journey, (await statusTexts(page)).some((text) => /not the same factor/.test(text)), 'a mismatched cancellation was not refused');
  await page.locator('button[aria-label^="Numerator factor 2"]').click();
  await page.locator('button[aria-label^="Denominator factor 2"]').click();
  await page.getByRole('button', { name: 'Apply cancellation' }).click();
  await settle(page, 900);
  const reduced = compact(await state(page));
  expect(journey, reduced === 'y=3-\\frac{5x}{2}', `reduced: ${reduced}`);
  expect(journey, !/2\.5/.test(reduced), 'a decimal replaced 5/2');
  await page.locator('.algebra-structure-toggle--arrange').click();
  await settle(page);
  const labels = await page.locator('[aria-label$="select to move"]').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
  await page.locator(`[aria-label="${labels[0]}"]`).last().click();
  await page.locator('[aria-label$="tap to swap with the selected term"]').last().click();
  await page.getByRole('button', { name: 'Keep this order' }).click();
  await settle(page, 900);
  const final = compact(await state(page));
  expect(journey, final === 'y=-\\frac{5x}{2}+3', `arranged: ${final}`);
  const steps = (await page.evaluate(() => Object.values(window.__mmStructure.drafts()).find((draft) => draft?.workSteps)?.workSteps || [])).map((step) => step.description);
  expect(journey, steps.join('|') === 'Subtracted 5x from both sides|Divided both sides by 2|Split the numerator across the denominator|Cancelled common factors on the right side|Rearranged the terms on the right side', `steps: ${steps.join('|')}`);
  await page.screenshot({ path: path.join(ARTIFACTS, `${journey}.png`), fullPage: true });
  report.push({ journey, unsplit, split, reduced, final, steps });
  await page.close();
}

async function slopeTwoFourEight(context) {
  const journey = 'slope-2x-4y-8';
  const page = await open(context, 3);
  const host = page.locator('body');
  await balancedMoveAtEnd(page, host, 'Subtract', '2x');
  const cancel = page.locator('[aria-label="- 2 x, select to cancel"]').first();
  if (await cancel.count()) await cancel.click();
  await settle(page, 1200);
  if (await page.locator('.algebra-optional-simplification').count()) await simplifySide(page, host, 'right', '8 - 2x');
  await settle(page, 700);
  await balancedMove(page, host, 'Divide by', '-4');
  if (await page.locator('[aria-label$="mark this factor for cancellation"]').count()) await cancelFactor(page, host);
  await settle(page, 900);
  await page.locator('.algebra-structure-toggle--split').click();
  await settle(page);
  while (await page.locator('button[aria-label^="Place the denominator under"]:not([disabled])').count()) {
    if (!(await page.locator('button.algebra-inline-factor-token.is-armed').count())) await page.locator('button[aria-label^="Pick up the denominator"]').click();
    await page.locator('button[aria-label^="Place the denominator under"]:not([disabled])').first().click();
    await settle(page, 180);
  }
  await page.getByRole('button', { name: 'Commit split' }).click();
  await settle(page, 900);
  const split = compact(await state(page));
  expect(journey, split === 'y=\\frac{8}{-4}-\\frac{2x}{-4}', `split: ${split}`);
  for (let guard = 0; guard < 3 && await page.locator('.algebra-structure-toggle--reduce').count(); guard += 1) {
    await page.locator('.algebra-structure-toggle--reduce').click();
    await settle(page);
    // Only the outlined fractions have a factor to cancel.
    await page.locator('.algebra-term-candidate[aria-label$="select to write as prime factors"]').first().click();
    await settle(page);
    // Pair every numerator factor with an equal factor below the bar.
    for (;;) {
      const top = await page.locator('button.algebra-structure-token[aria-label^="Numerator factor"]:not([disabled])').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label').replace('Numerator factor ', '')));
      const bottom = await page.locator('button.algebra-structure-token[aria-label^="Denominator factor"]:not([disabled])').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label').replace('Denominator factor ', '')));
      const value = top.find((candidate) => bottom.includes(candidate));
      if (!value) break;
      await page.locator(`button[aria-label="Numerator factor ${value}"]:not([disabled])`).first().click();
      await page.locator(`button[aria-label="Denominator factor ${value}"]:not([disabled])`).first().click();
      await settle(page, 150);
    }
    await page.getByRole('button', { name: 'Apply cancellation' }).click();
    await settle(page, 900);
  }
  const final = compact(await state(page));
  expect(journey, final === 'y=-2+\\frac{x}{2}', `reduced: ${final}`);
  expect(journey, (await page.locator('text=✓ Written as y = mx + b').count()) === 1, 'slope-intercept goal chip not complete');
  await page.getByRole('button', { name: 'Check equation' }).click();
  await settle(page, 500);
  const grades = await page.evaluate(() => window.__mmStructure.grades());
  report.push({ journey, split, final, gradeCount: grades.length });
  await page.close();
}

async function keyboard(context) {
  const journey = 'keyboard';
  const page = await open(context, 1);
  await page.locator('.algebra-structure-toggle--factor').focus();
  await page.keyboard.press('Enter');
  await settle(page);
  for (const label of ['15 x', '- 45']) {
    await page.locator(`[aria-label="${label}, select as a term to factor"]`).first().focus();
    await page.keyboard.press('Enter');
    await settle(page, 120);
  }
  await page.getByRole('button', { name: 'Factor to primes' }).focus();
  await page.keyboard.press('Enter');
  await settle(page);
  for (const label of ['Factor 3 of 15 x', 'Factor 5 of 15 x', 'Factor 3 of -45', 'Factor 5 of -45']) {
    await token(page, label).first().focus();
    await page.keyboard.press(' ');
    await settle(page, 120);
  }
  await page.locator('.algebra-structure-controls button.algebra-inline-commit').last().focus();
  await page.keyboard.press('Enter');
  await settle(page, 500);
  // A human-scale pause between the last keystroke and Enter: MathLive inserts
  // the character on its own tick.
  await page.keyboard.type('x');
  await settle(page, 150);
  await page.keyboard.press('Enter');
  await settle(page, 300);
  await page.keyboard.type('-3');
  await settle(page, 150);
  await page.keyboard.press('Enter');
  await settle(page, 900);
  const final = compact(await state(page));
  expect(journey, final === 'y=15\\left(x-3\\right)', `keyboard-only factoring: ${final}`);
  report.push({ journey, final });
  await page.close();
}

async function phone(browserInstance) {
  const journey = 'phone';
  const context = await browserInstance.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await open(context, 1);
  const tap = async (locator) => { await locator.tap(); await settle(page, 220); };
  await tap(page.locator('.algebra-structure-toggle--factor').first());
  for (const label of ['15 x', '- 45']) await tap(page.locator(`[aria-label="${label}, select as a term to factor"]`).first());
  await tap(page.getByRole('button', { name: 'Factor to primes' }).first());
  for (const label of ['Factor 3 of 15 x', 'Factor 5 of 15 x']) await tap(token(page, label).first());
  await tap(token(page, 'Factor 3 of -45').first());
  await tap(token(page, 'Factor 5 of -45').first());
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(journey, scrollWidth <= innerWidth, `horizontal page scroll at 390px (${scrollWidth} > ${innerWidth})`);
  const outside = await page.locator('button.algebra-structure-token').evaluateAll((elements) => elements.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.right > window.innerWidth + 1 || rect.left < -1;
  }).length);
  expect(journey, outside === 0, `${outside} factor tokens outside the viewport`);
  const small = await page.locator('button.algebra-structure-token').evaluateAll((elements) => elements.filter((element) => element.getBoundingClientRect().height < 40).length);
  expect(journey, small === 0, `${small} factor tokens below the 40px touch height`);
  await page.locator('.algebra-equation-stage').screenshot({ path: path.join(ARTIFACTS, `${journey}.png`) });
  report.push({ journey, scrollWidth, innerWidth });
  await context.close();
}

async function solveRegression(context) {
  const journey = 'solve-regression';
  const page = await open(context, 4);
  const host = page.locator('body');
  await balancedMove(page, host, 'Subtract', '6');
  const cancel = page.locator('[aria-label$="select to cancel"]').filter({ hasText: '' });
  const labels = await page.locator('[aria-label$="select to cancel"]').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
  const six = labels.find((label) => /^[-+]?\s*6,/.test(label));
  if (six) await page.locator(`[aria-label="${six}"]`).first().click();
  await settle(page, 1200);
  if (await page.locator('.algebra-optional-simplification').count()) await simplifySide(page, host, 'right', '15');
  await settle(page, 700);
  await balancedMove(page, host, 'Divide by', '3');
  if (await page.locator('[aria-label$="mark this factor for cancellation"]').count()) await cancelFactor(page, host);
  await settle(page, 900);
  if (await page.locator('.algebra-optional-simplification').count()) await simplifySide(page, host, 'right', '5');
  await settle(page, 900);
  const final = compact(await state(page));
  expect(journey, /^x=(5|\\frac\{15\}\{3\})$/.test(final), `plain solve: ${final}`);
  report.push({ journey, final, unused: Boolean(cancel) });
  await page.close();
}

const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
for (const journey of [factored15x45, factoredPartial, factoredNegative, slopeFiveTwoSix, slopeTwoFourEight, keyboard, solveRegression]) {
  try {
    await journey(context);
  } catch (error) {
    note(journey.name, `threw: ${error.message.split('\n')[0]}`);
  }
}
try {
  await phone(browser);
} catch (error) {
  note('phone', `threw: ${error.message.split('\n')[0]}`);
}
await browser.close();

writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify({ findings, report }, null, 2));
console.log(JSON.stringify({ findings, report }, null, 2));
process.exitCode = findings.length ? 1 : 0;
