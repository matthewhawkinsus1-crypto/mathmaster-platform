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
//   slope-2x-4y-8       A stored stepAlgebra2 slope-intercept record (opened on
//                       the consolidated engine, as students get it), negative
//                       denominator: y = -2 + x/2, never an invented negative.
//   keyboard            Factor tokens and commit reached by keyboard alone.
//   phone               390px: no horizontal page scroll, tokens in view.
//   solve-regression    3x + 6 = 21 still solves to x = 5.
//   owner-case-*        Student push Q, the owner's screenshot: 2x + y = 2
//                       after y = -4x + 12, at 1366×768 and 390×844, by
//                       pointer and by keyboard alone. One Simplify; the group
//                       shown without a 1; Remove parentheses; like terms the
//                       student combines (a wrong one refused); Escape returns
//                       focus; nothing hidden under the action bar.
//   subtracted-group    3x - (-4x + 12): every changed sign is the student's.
//   simplify-undo       Undo walks back one Simplify decision at a time.
//   legacy-drafts       Drafts saved with Simplify arithmetic or Combine like
//                       terms open still open, without losing committed work.
//   divide-negative     -2x = -10 ÷ -2 reads (-10)/(-2), and -2x has no gap
//                       (pass 3, Q-13, Q-31).
//   directions-*        AX32 (slice 4): the directions on the screen name keys,
//                       and each journey then presses exactly those keys with
//                       the mouse never touched: placing an operation and
//                       cancelling by Tab, Shift+Tab, Enter and Space (a term
//                       pair, a factor pair, and on a phone), and Factor, Split
//                       fraction, Cancel factors and Arrange terms, and the
//                       relation workspace's placement and cancellation.
//   directions-places-* student-a11y-3: on a focused side the arrow keys choose
//                       where the operation goes, as a tap does, at 1366 and 390.
//
// Exit code 1 on any finding. Screenshots land in
// tests/browser/artifacts/stepAlgebraStructureTools/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { balancedMove, cancelFactor, chooseOperation, openRewriteTool, openSimplify, simplifySide, typeOperand } from './stepAlgebraDriver.mjs';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

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

// The Rewrite menu (student push Q) lists only the tools this equation's
// structure allows; a tool's entry exists only while the menu is open.
const rewriteOffered = async (page, kind) => {
  const toggle = page.locator('button.algebra-rewrite-toggle').first();
  if (!(await toggle.count())) return 0;
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') { await toggle.click(); await settle(page, 150); }
  return page.locator(`.algebra-structure-toggle--${kind}`).count();
};

const startFactoring = async (page, termLabels) => {
  await openRewriteTool(page, page.locator('body'), 'factor');
  await settle(page);
  for (const label of termLabels) {
    await page.locator(`[data-term-text="${label}"][aria-label$="select as a term to factor"]`).first().click();
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
  await chooseTokens(page, ['Factor 3 of 15 x', 'Factor 5 of 15 x', 'Factor 3 of negative 45', 'Factor 5 of negative 45']);
  await undoButton(page).click();
  await settle(page);
  expect(journey, (await token(page, 'Factor 5 of negative 45').getAttribute('aria-pressed')) === 'false', 'transient Undo did not drop the last chosen prime');
  expect(journey, (await token(page, 'Factor 5 of 15 x').getAttribute('aria-pressed')) === 'true', 'transient Undo dropped more than one decision');
  await chooseTokens(page, ['Factor 5 of negative 45']);
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
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${journey}.png`), fullPage: true });
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
  await chooseTokens(page, ['Factor 3 of 15 x', 'Factor 3 of negative 45']);
  await pullOut(page);
  await setField(page, remainders(page).nth(0), '5x');
  await setField(page, remainders(page).nth(1), '-15');
  await checkFactoring(page);
  expect(journey, compact(await state(page)) === 'y=3\\left(5x-15\\right)', `partial factor not accepted: ${await state(page)}`);
  expect(journey, (await rewriteOffered(page, 'factor')) === 1, 'Factor was not offered again for 5x - 15');
  await openRewriteTool(page, page.locator('body'), 'factor');
  await settle(page);
  await page.locator('[data-term-text="5 x"][aria-label$="select as a term to factor"]').first().click();
  await page.locator('[data-term-text="- 15"][aria-label$="select as a term to factor"]').first().click();
  await page.getByRole('button', { name: 'Factor to primes' }).click();
  await settle(page);
  await chooseTokens(page, ['Factor 5 of 5 x', 'Factor 5 of negative 15']);
  await pullOut(page);
  await setField(page, remainders(page).nth(0), 'x');
  await setField(page, remainders(page).nth(1), '-3');
  await checkFactoring(page);
  expect(journey, compact(await state(page)) === 'y=3\\left(5\\left(x-3\\right)\\right)', `nested factor: ${await state(page)}`);
  // 3 × 5 is a product part of the one Simplify control (student push Q).
  await openSimplify(page, page.locator('body'));
  await page.locator('.mm-simplify-part[data-simplify-part="product"]').first().click();
  await settle(page, 400);
  await setField(page, page.locator('.mm-simplify-box math-field'), '15');
  await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
  await settle(page, 900);
  const final = compact(await state(page));
  expect(journey, final === 'y=15\\left(x-3\\right)', `after 3 × 5: ${final}`);
  expect(journey, (await page.locator('text=✓ Written as y = a(x − c)').count()) === 1, 'factored goal chip not complete');
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${journey}.png`), fullPage: true });
  report.push({ journey, final });
  await page.close();
}

async function factoredNegative(context) {
  const journey = 'factored-negative';
  const page = await open(context, 2);
  await startFactoring(page, ['-6 x', '+ 12']);
  await chooseTokens(page, ['Factor 2 of negative 6 x', 'Factor 3 of negative 6 x', 'Factor 2 of 12', 'Factor 3 of 12']);
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
  await page.locator('[data-term-text="- 5 x"][aria-label$="select to cancel"]').first().click();
  await settle(page, 1200);
  if (await page.locator('.algebra-optional-simplification').count()) await simplifySide(page, host, 'right', '6 - 5x');
  await settle(page, 700);
  await balancedMove(page, host, 'Divide by', '2');
  if (await page.locator('[aria-label$="mark this factor for cancellation"]').count()) await cancelFactor(page, host);
  await settle(page, 900);
  const unsplit = compact(await state(page));
  expect(journey, unsplit === 'y=\\frac{6-5x}{2}', `before splitting: ${unsplit}`);
  expect(journey, (await rewriteOffered(page, 'split')) === 1, 'Split fraction was not offered for (6 - 5x)/2');
  await openRewriteTool(page, page.locator('body'), 'split');
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
  // 6/2 has no letters: reducing it is Simplify's (student push Q), not
  // Cancel factors'. The student types the value; nothing is filled in.
  expect(journey, (await rewriteOffered(page, 'reduce')) === 0, 'Cancel factors was offered for a numeric fraction');
  await openSimplify(page, host);
  await page.locator('.mm-simplify-part[data-simplify-part="fraction"]').first().click();
  await settle(page, 300);
  await setField(page, page.locator('.mm-simplify-box math-field'), '6/2');
  await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
  await settle(page, 500);
  expect(journey, (await statusTexts(page)).some((text) => /lowest terms/.test(text)), 'an unreduced 6/2 was not refused');
  await setField(page, page.locator('.mm-simplify-box math-field'), '3');
  await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
  await settle(page, 900);
  const reduced = compact(await state(page));
  expect(journey, reduced === 'y=3-\\frac{5x}{2}', `reduced: ${reduced}`);
  expect(journey, !/2\.5/.test(reduced), 'a decimal replaced 5/2');
  await page.locator('button.algebra-simplify-toggle').click();
  await settle(page, 200);
  await openRewriteTool(page, page.locator('body'), 'arrange');
  await settle(page);
  const labels = await page.locator('[aria-label$="select to move"]').evaluateAll((elements) => elements.map((element) => element.dataset.termText));
  await page.locator(`[data-term-text="${labels[0]}"][aria-label$="select to move"]`).last().click();
  await page.locator('[aria-label$="select to swap with the selected term"]').last().click();
  await page.getByRole('button', { name: 'Keep this order' }).click();
  await settle(page, 900);
  const final = compact(await state(page));
  expect(journey, final === 'y=-\\frac{5x}{2}+3', `arranged: ${final}`);
  const steps = (await page.evaluate(() => Object.values(window.__mmStructure.drafts()).find((draft) => draft?.workSteps)?.workSteps || [])).map((step) => step.description);
  expect(journey, steps.join('|') === 'Subtracted 5x from both sides|Divided both sides by 2|Split the numerator across the denominator|Reduced a fraction on the right side|Rearranged the terms on the right side', `steps: ${steps.join('|')}`);
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${journey}.png`), fullPage: true });
  report.push({ journey, unsplit, split, reduced, final, steps });
  await page.close();
}

async function slopeTwoFourEight(context) {
  const journey = 'slope-2x-4y-8';
  const page = await open(context, 3);
  const host = page.locator('body');
  await balancedMoveAtEnd(page, host, 'Subtract', '2x');
  const cancel = page.locator('[data-term-text="- 2 x"][aria-label$="select to cancel"]').first();
  if (await cancel.count()) await cancel.click();
  await settle(page, 1200);
  if (await page.locator('.algebra-optional-simplification').count()) await simplifySide(page, host, 'right', '8 - 2x');
  await settle(page, 700);
  await balancedMove(page, host, 'Divide by', '-4');
  if (await page.locator('[aria-label$="mark this factor for cancellation"]').count()) await cancelFactor(page, host);
  await settle(page, 900);
  await openRewriteTool(page, page.locator('body'), 'split');
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
  // 8/(-4) is a numeric fraction: Simplify reduces it, the student typing -2.
  await openSimplify(page, host);
  await page.locator('.mm-simplify-part[data-simplify-part="fraction"]').first().click();
  await settle(page, 300);
  await setField(page, page.locator('.mm-simplify-box math-field'), '2');
  await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
  await settle(page, 500);
  expect(journey, (await statusTexts(page)).some((text) => /Check the sign/.test(text)), 'a wrong-sign value was not refused');
  await setField(page, page.locator('.mm-simplify-box math-field'), '-2');
  await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
  await settle(page, 900);
  await page.locator('button.algebra-simplify-toggle').click();
  await settle(page, 200);
  // -2x/(-4) has letters: Cancel factors, a mismatched pair refused first.
  for (let guard = 0; guard < 3 && await rewriteOffered(page, 'reduce'); guard += 1) {
    await openRewriteTool(page, page.locator('body'), 'reduce');
    await settle(page);
    // Only the outlined fractions have a factor to cancel.
    await page.locator('.algebra-term-candidate[aria-label$="select to write as prime factors"]').first().click();
    await settle(page);
    if (guard === 0) {
      await page.locator('button[aria-label^="Numerator factor 2"]').first().click();
      await page.locator('button[aria-label^="Denominator factor negative 1"]').first().click();
      await settle(page);
      expect(journey, (await statusTexts(page)).some((text) => /not the same factor/.test(text)), 'a mismatched cancellation was not refused');
      await page.locator('button[aria-label^="Numerator factor 2"]').first().click();
      await settle(page, 150);
    }
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
  // A stored stepAlgebra2 slope-intercept record is consolidated onto the
  // mature Step Algebra engine by the runtime repair (issue #297). The student
  // player always applied it; QuestionEngine now applies it for every host, so
  // this record opens exactly as a student sees it. The factored-form records
  // (Q1, Q2) still open in RewriteLinearForm with its goal chips.
  const route = await page.locator('[data-algebra-route]').first().getAttribute('data-algebra-route');
  if (route === 'stepAlgebra2.rewriteLinearForm') {
    expect(journey, (await page.locator('text=✓ Written as y = mx + b').count()) === 1, 'slope-intercept goal chip not complete');
    await page.getByRole('button', { name: /^(Check equation|Submit — )/ }).first().click();
    await settle(page, 500);
  } else {
    expect(journey, route === 'stepAlgebra', `the stored record reached ${route}, not the consolidated Step Algebra engine`);
    expect(journey, (await page.locator('button.mathmaster-bar-submit:visible', { hasText: /^Submit/ }).count()) >= 1, 'the engine did not report the slope-intercept form as finished');
  }
  const grades = await page.evaluate(() => window.__mmStructure.grades());
  report.push({ journey, route, split, final, gradeCount: grades.length });
  await page.close();
}

async function keyboard(context) {
  const journey = 'keyboard';
  const page = await open(context, 1);
  // Rewrite is a disclosure: Enter opens it, Tab reaches its first entry.
  await page.locator('button.algebra-rewrite-toggle').focus();
  await page.keyboard.press('Enter');
  await settle(page, 200);
  await page.keyboard.press('Tab');
  const entry = await page.evaluate(() => document.activeElement?.className || '');
  expect(journey, /algebra-structure-toggle--factor/.test(entry), `Tab from Rewrite did not reach Factor (${entry})`);
  await page.keyboard.press('Enter');
  await settle(page);
  for (const label of ['15 x', '- 45']) {
    await page.locator(`[data-term-text="${label}"][aria-label$="select as a term to factor"]`).first().focus();
    await page.keyboard.press('Enter');
    await settle(page, 120);
  }
  await page.getByRole('button', { name: 'Factor to primes' }).focus();
  await page.keyboard.press('Enter');
  await settle(page);
  for (const label of ['Factor 3 of 15 x', 'Factor 5 of 15 x', 'Factor 3 of negative 45', 'Factor 5 of negative 45']) {
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
  await tap(page.locator('button.algebra-rewrite-toggle').first());
  await tap(page.locator('.algebra-structure-toggle--factor').first());
  for (const label of ['15 x', '- 45']) await tap(page.locator(`[data-term-text="${label}"][aria-label$="select as a term to factor"]`).first());
  await tap(page.getByRole('button', { name: 'Factor to primes' }).first());
  for (const label of ['Factor 3 of 15 x', 'Factor 5 of 15 x']) await tap(token(page, label).first());
  await tap(token(page, 'Factor 3 of negative 45').first());
  await tap(token(page, 'Factor 5 of negative 45').first());
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(journey, scrollWidth <= innerWidth, `horizontal page scroll at 390px (${scrollWidth} > ${innerWidth})`);
  const outside = await page.locator('button.algebra-structure-token').evaluateAll((elements) => elements.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.right > window.innerWidth + 1 || rect.left < -1;
  }).length);
  expect(journey, outside === 0, `${outside} factor tokens outside the viewport`);
  const small = await page.locator('button.algebra-structure-token').evaluateAll((elements) => elements.filter((element) => element.getBoundingClientRect().height < 40).length);
  expect(journey, small === 0, `${small} factor tokens below the 40px touch height`);
  await screenshotKeepingTouch(page.locator('.algebra-equation-stage'), { path: path.join(ARTIFACTS, `${journey}.png`) });
  report.push({ journey, scrollWidth, innerWidth });
  await context.close();
}

async function solveRegression(context) {
  const journey = 'solve-regression';
  const page = await open(context, 4);
  const host = page.locator('body');
  await balancedMove(page, host, 'Subtract', '6');
  const cancel = page.locator('[aria-label$="select to cancel"]').filter({ hasText: '' });
  const labels = await page.locator('[aria-label$="select to cancel"]').evaluateAll((elements) => elements.map((element) => element.dataset.termText));
  const six = labels.find((label) => /^[-+]?\s*6$/.test(label));
  if (six) await page.locator(`[data-term-text="${six}"][aria-label$="select to cancel"]`).first().click();
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

// --- Student push Q: one Simplify, everywhere ---------------------------------------------

const OLD_CONTROLS = /^(Rewrite \/ Simplify|Simplify arithmetic|Combine like terms)$/;

/** Is the focused control on screen and not under anything (job H's action bar)? */
const focusUnobscured = (page) => page.evaluate(() => {
  const element = document.activeElement;
  if (!element || element === document.body) return { ok: false, label: 'body' };
  const rect = element.getBoundingClientRect();
  const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
  const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + Math.min(rect.height / 2, 12)));
  const hit = document.elementFromPoint(x, y);
  const inView = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  return {
    ok: inView && Boolean(hit) && (hit === element || element.contains(hit) || hit.contains(element) || Boolean(hit.closest?.('math-field') === element)),
    label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 40) || element.tagName,
  };
});

const activeLabel = (page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || '');

const ownerContext = (browserInstance, viewport) => browserInstance.newContext({
  viewport,
  ...(viewport.width < 500 ? { hasTouch: true, isMobile: true } : {}),
});

async function ownerCase(browserInstance, viewport, { keyboardOnly }) {
  const journey = `owner-case-${viewport.width}${keyboardOnly ? '-keyboard' : ''}`;
  const context = await ownerContext(browserInstance, viewport);
  const page = await open(context, 5);
  // 2x + y = 2 after y = -4x + 12: the group the student substituted into,
  // never 1(-4x + 12), and the old three buttons are gone.
  const start = compact(await state(page));
  expect(journey, start === '2x+\\left(-4x+12\\right)=2', `substituted board: ${start}`);
  const buttons = await page.locator('button:visible').allInnerTexts();
  expect(journey, !buttons.some((text) => OLD_CONTROLS.test(text.trim())), `an old control is still shown: ${buttons.filter((text) => OLD_CONTROLS.test(text.trim()))}`);
  expect(journey, (await page.locator('button.algebra-distribute-toggle').count()) === 0, 'Distribute was offered for a factor of 1');
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${journey}-0-board.png`), fullPage: true });

  if (keyboardOnly) {
    await page.locator('button.algebra-simplify-toggle').focus();
    await page.keyboard.press('Enter');
    await settle(page, 400);
    expect(journey, /^parentheses: plus the quantity negative 4 times x plus 12, left side$/.test(await activeLabel(page)), `Simplify did not put focus on the first part (${await activeLabel(page)})`);
    let seen = await focusUnobscured(page);
    expect(journey, seen.ok, `the first part is hidden or off screen (${seen.label})`);
    await page.keyboard.press('Enter');
    await settle(page, 300);
    expect(journey, (await activeLabel(page)) === 'Remove parentheses', `Enter did not open the box on its action (${await activeLabel(page)})`);
    await page.keyboard.press('Escape');
    await settle(page, 300);
    expect(journey, (await page.locator('.mm-simplify-box').count()) === 0, 'Escape did not close the box');
    expect(journey, (await activeLabel(page)).startsWith('parentheses:'), `Escape did not return focus to the part (${await activeLabel(page)})`);
    await page.keyboard.press('Enter');
    await settle(page, 300);
    seen = await focusUnobscured(page);
    expect(journey, seen.ok, `Remove parentheses is hidden or off screen (${seen.label})`);
    await page.keyboard.press('Enter');
    await settle(page, 900);
  } else {
    await page.locator('button.algebra-simplify-toggle').click();
    await settle(page, 400);
    expect(journey, (await page.locator('.algebra-term-candidate').count()) === 1, 'the group was not highlighted on the board');
    await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${journey}-1-simplify.png`), fullPage: true });
    await page.locator('[aria-label$="choose this part to simplify"]').first().click();
    await settle(page, 300);
    expect(journey, (await page.locator('.mm-simplify-box[data-simplify-box="parentheses"] math-field').count()) === 0, 'removing parentheses after a plus asked for typing');
    await page.locator('.mm-simplify-box button', { hasText: 'Remove parentheses' }).click();
    await settle(page, 900);
  }
  const removed = compact(await state(page));
  expect(journey, removed === '2x-4x+12=2', `after Remove parentheses: ${removed}`);

  // Like terms: the student's own combined term, a wrong one refused.
  if (keyboardOnly) {
    expect(journey, /^like terms: 2 times x and negative 4 times x, left side$/.test(await activeLabel(page)), `focus did not move to the next part (${await activeLabel(page)})`);
    await page.keyboard.press('Enter');
    await settle(page, 500);
    await page.keyboard.type('-6x');
    await settle(page, 300);
    await page.keyboard.press('Enter');
    await settle(page, 600);
  } else {
    await page.locator('[aria-label$="choose this part to simplify"]').first().click();
    await settle(page, 300);
    await setField(page, page.locator('.mm-simplify-box math-field'), '-6x');
    await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
    await settle(page, 600);
  }
  expect(journey, compact(await state(page)) === '2x-4x+12=2', 'a wrong combined term changed the equation');
  expect(journey, (await statusTexts(page)).some((text) => /not equal to the part you chose/.test(text)), 'a wrong combined term was not refused');
  if (keyboardOnly) {
    await page.locator('.mm-simplify-box math-field').focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('-2x');
    await settle(page, 300);
    await page.keyboard.press('Enter');
  } else {
    await setField(page, page.locator('.mm-simplify-box math-field'), '-2x');
    await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
  }
  await settle(page, 900);
  const combined = compact(await state(page));
  expect(journey, combined === '-2x+12=2', `after combining: ${combined}`);
  expect(journey, !/(^|[^\d])1x|-1x|\+0/.test(combined), `a banned form is on the board: ${combined}`);
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(journey, scrollWidth <= innerWidth, `horizontal page scroll (${scrollWidth} > ${innerWidth})`);
  const steps = (await page.evaluate(() => Object.values(window.__mmStructure.drafts()).find((draft) => draft?.workSteps)?.workSteps || [])).map((step) => step.kind);
  expect(journey, steps.join('|') === 'inline-term-rewrite|combine-like-terms', `step kinds: ${steps.join('|')}`);
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${journey}-2-after.png`), fullPage: true });
  report.push({ journey, start, removed, combined, steps });
  await context.close();
}

async function subtractedGroup(context) {
  const journey = 'subtracted-group';
  const page = await open(context, 7);
  expect(journey, compact(await state(page)) === '3x-\\left(-4x+12\\right)=4', `board: ${await state(page)}`);
  await page.locator('button.algebra-simplify-toggle').click();
  await settle(page, 300);
  await page.locator('.mm-simplify-part[data-simplify-part="parentheses"]').click();
  await settle(page, 300);
  // Nothing is filled in: no sign is chosen until the student chooses it.
  expect(journey, (await page.locator('.mm-simplify-signs button[aria-pressed="true"]').count()) === 0, 'a sign was chosen for the student');
  await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
  await settle(page, 400);
  expect(journey, (await statusTexts(page)).some((text) => /Choose a sign for every term/.test(text)), 'checking with no signs was not refused');
  await page.locator('.mm-simplify-signs button[aria-label="plus 4 times x"]').click();
  await page.locator('.mm-simplify-signs button[aria-label="plus 12"]').click();
  await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
  await settle(page, 500);
  expect(journey, compact(await state(page)) === '3x-\\left(-4x+12\\right)=4', 'a wrong sign changed the equation');
  expect(journey, (await statusTexts(page)).some((text) => /Not every sign is right yet/.test(text)), 'a wrong sign was not refused');
  await page.locator('.mm-simplify-signs button[aria-label="minus 12"]').click();
  await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
  await settle(page, 900);
  const final = compact(await state(page));
  expect(journey, final === '3x+4x-12=4', `after Remove parentheses: ${final}`);
  report.push({ journey, final });
  await page.close();
}

async function undoOneDecision(context) {
  const journey = 'simplify-undo';
  const page = await open(context, 6);
  await page.locator('button.algebra-simplify-toggle').click();
  await settle(page, 300);
  await page.locator('.mm-simplify-part[data-simplify-part="likeTerms"]').click();
  await settle(page, 300);
  await setField(page, page.locator('.mm-simplify-box math-field'), '-2x');
  await undoButton(page).click();
  await settle(page, 300);
  expect(journey, (await page.locator('.mm-simplify-box math-field').evaluate((element) => element.value)) === '', 'Undo did not clear only the typed answer');
  await undoButton(page).click();
  await settle(page, 300);
  expect(journey, (await page.locator('.mm-simplify-box').count()) === 0 && (await page.locator('.mm-simplify-panel').count()) === 1, 'Undo did not back out only the chosen part');
  await undoButton(page).click();
  await settle(page, 300);
  expect(journey, (await page.locator('.mm-simplify-panel').count()) === 0, 'Undo did not close Simplify last');
  // A committed Simplify step is undone like any other.
  await page.locator('button.algebra-simplify-toggle').click();
  await settle(page, 300);
  await page.locator('.mm-simplify-part[data-simplify-part="unit"]').first().click();
  await settle(page, 300);
  await page.locator('.mm-simplify-box button', { hasText: 'Remove the 1' }).click();
  await settle(page, 900);
  const removed = compact(await state(page));
  // (1)(12) is the plain factor of 1; (1)(-4x) is the student's to write.
  expect(journey, removed === '2x+\\left(1\\right)\\left(-4x\\right)+12=2', `after removing one factor of 1: ${removed}`);
  await page.locator('button.algebra-simplify-toggle').click();
  await settle(page, 200);
  await undoButton(page).click();
  await settle(page, 600);
  expect(journey, compact(await state(page)) === '2x+\\left(1\\right)\\left(-4x\\right)+\\left(1\\right)\\left(12\\right)=2', `committed Undo: ${await state(page)}`);
  report.push({ journey, removed });
  await page.close();
}

/** Seed the open question's own draft with fields an older build wrote, then reload. */
const seedLegacyDraft = async (page, fields) => {
  await page.evaluate((extra) => {
    const key = Object.keys(window.localStorage).find((entry) => entry.endsWith(':step-algebra'));
    const stored = JSON.parse(window.localStorage.getItem(key));
    const { equation } = stored.value;
    const equationKey = `${equation.left} = ${equation.right}`;
    const resolved = JSON.parse(JSON.stringify(extra).replaceAll('$EQUATION_KEY', equationKey));
    stored.value = { ...stored.value, ...resolved };
    window.localStorage.setItem(key, JSON.stringify(stored));
  }, fields);
  await page.reload();
  await page.waitForSelector('[data-math-state]', { timeout: 20000 });
  await settle(page, 900);
};

async function legacyDrafts(context) {
  const journey = 'legacy-drafts';
  const page = await open(context, 6);
  const committed = await state(page);
  // A draft saved with "Simplify arithmetic" open: it opens, committed work intact.
  await seedLegacyDraft(page, { structureTool: { kind: 'arithmetic', equationKey: '$EQUATION_KEY', candidateId: 'left:1', answer: '-4', undoStack: [] } });
  expect(journey, (await state(page)) === committed, 'the committed equation changed when the old draft opened');
  expect(journey, (await page.locator('button.algebra-simplify-toggle').getAttribute('aria-expanded')) === 'true', 'the old arithmetic tool did not reopen as Simplify');
  expect(journey, (await page.locator('.algebra-structure-toggle--arithmetic, [class*="arithmetic"]').count()) === 0, 'the old arithmetic tool is still drawn');
  // A draft saved mid Combine like terms: the part is chosen, the answer kept.
  await seedLegacyDraft(page, { structureTool: null, simplifyTool: null, likeTermsOpen: true, likeTermsSide: 'left', selectedLikeTermIndices: [0, 1], likeTermsAnswer: '-2x' });
  expect(journey, (await page.locator('.mm-simplify-box[data-simplify-box="likeTerms"]').count()) === 1, 'the like-terms selection did not reopen in Simplify');
  expect(journey, (await page.locator('.mm-simplify-box math-field').evaluate((element) => element.value)) === '-2x', 'the typed combined term was lost');
  await page.locator('.mm-simplify-box button.algebra-inline-commit').click();
  await settle(page, 900);
  const after = compact(await state(page));
  expect(journey, after === '-2x+\\left(1\\right)\\left(12\\right)=2', `after the migrated combination: ${after}`);
  const draft = await page.evaluate(() => JSON.parse(window.localStorage.getItem(Object.keys(window.localStorage).find((entry) => entry.endsWith(':step-algebra')))).value);
  expect(journey, !('likeTermsOpen' in draft) && draft.simplifyTool?.kind === 'simplify', 'the draft is still written with the old fields');
  report.push({ journey, committed, after });
  await page.close();
}

// Pass 3 Q-13 / Q-31: -2x = -10 divided by -2 draws the right side as the
// student wrote it, (-10)/(-2), not -(10/-2); and -2x is drawn without the
// TeX tie that showed as a gap ("-2 x"). The term's text is unchanged.
async function divideNegative(context) {
  const journey = 'divide-negative';
  const page = await open(context, 8);
  const host = page.locator('body');
  const latexOf = (locator) => locator.evaluate((element) => [...element.querySelectorAll('math-span, math-div')].map((math) => math.getAttribute('value') || math.textContent).join(' '));
  const start = await latexOf(host.locator('.algebra-equation-box').first());
  expect(journey, !/~/.test(start) && /-2\s*x/.test(start), `the starting side: ${start}`);
  await balancedMove(page, host, 'Divide by', '-2');
  await settle(page, 900);
  const right = host.locator('.algebra-equation-box').nth(1).locator('[data-term-text]').first();
  const text = await right.getAttribute('data-term-text');
  const shown = compact(await latexOf(right));
  expect(journey, text === '-10 / -2', `the term's text changed: ${text}`);
  expect(journey, shown.startsWith('\\frac{-10}{-2}'), `the right side is drawn as ${shown}`);
  await page.screenshot({ path: path.join(ARTIFACTS, 'divide-negative.png') });
  report.push({ journey, start, shown });
  await page.close();
}

/* ------------------------- AX32 (slice 4): the directions name keys that work */

// The directions on the screen are read first, then exactly the keys they name are pressed,
// with the mouse never touched. Tab and Shift+Tab walk the page as a keyboard student does.
const focusNow = (page) => page.evaluate(() => {
  const element = document.activeElement;
  if (!element || element === document.body) return { label: '', text: '', term: '', cls: '', pressed: null };
  return {
    label: element.getAttribute('aria-label') || '',
    text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    term: element.getAttribute('data-term-text') || '',
    cls: String(element.className?.baseVal ?? element.className ?? ''),
    pressed: element.getAttribute('aria-pressed'),
    disabled: element.hasAttribute('disabled'),
  };
});
const tabUntil = async (page, test, { back = false, limit = 40 } = {}) => {
  for (let count = 0; count < limit; count += 1) {
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    const now = await focusNow(page);
    if (test(now)) return now;
  }
  return null;
};
// Forward first, then back: where a control sits relative to the one just pressed is not the point.
const reach = async (page, test) => (await tabUntil(page, test)) || tabUntil(page, test, { back: true, limit: 80 });
const sayings = async (page) => (await page.locator('[role="status"], .algebra-placement-progress, .algebra-inline-mode-status, .algebra-inline-mode-feedback').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean);
const said = async (page, pattern) => (await sayings(page)).some((text) => (typeof pattern === 'string' ? text.endsWith(pattern) : pattern.test(text)));
const press = async (page, key, wait = 350) => { await page.keyboard.press(key); await settle(page, wait); };

// An operation placed, then a pair cancelled: a term pair after ± and a factor pair after ×, ÷.
async function directionsPlacementAndCancel(browserInstance, viewport) {
  const at = `directions-placement-${viewport.width}`;
  const phoneScreen = viewport.width < 500;
  const context = await ownerContext(browserInstance, viewport);
  const ROUTE = 'Shift+Tab back to a side and press Enter';
  for (const scene of [
    {
      question: 4, operation: 'Subtract', operand: '6',
      place: `Click or tap the side where the subtracted term belongs, or ${ROUTE}.`,
      balanced: 'The operation is balanced. Draw directly through the opposite terms in the equation itself, or Tab to one and press Enter.',
      cue: 'Click, tap or slash either opposite term once, or Tab to one and press Enter. MathMaster crosses out the matching term with it.',
      piece: (now) => now.term === '+ 6' && now.label.endsWith('select to cancel'),
    },
    {
      question: 8, operation: 'Divide by', operand: '-2',
      place: `Click or tap beneath the side where the divisor belongs, or ${ROUTE}.`,
      balanced: 'The operation is balanced. Draw directly through the matching factors in the equation itself, or Tab to one and press Enter.',
      cue: 'Click, tap or slash either matching factor once, or Tab to one and press Enter. MathMaster crosses out its partner with it.',
      piece: (now) => now.label.endsWith('mark this factor for cancellation'),
    },
  ]) {
    const journey = `${at}-${scene.operation.split(' ')[0].toLowerCase()}`;
    const page = await open(context, scene.question);
    // Choose the operation and type its value: Tab to the tile, Enter, and the value box takes the focus.
    expect(journey, await tabUntil(page, (now) => now.label === `Choose ${scene.operation} operation`, { limit: 80 }), 'Tab never reached the operation');
    await press(page, 'Enter', 450);
    await page.keyboard.type(scene.operand);
    await settle(page, 450);
    // The Pick up button: on a phone its description names the way to the sides; Enter arms the operation.
    expect(journey, await tabUntil(page, (now) => /^(Pick up|Use|Ready to place) /.test(now.label), { limit: 30 }), 'Tab never reached Pick up');
    if (phoneScreen) {
      const title = await page.locator('button.algebra-pickup-button').getAttribute('title');
      expect(journey, title === `Arm this operation, then click or tap the equation where it belongs, or ${ROUTE}`, `the phone's Pick up description: ${title}`);
    }
    await press(page, 'Enter', 600);
    expect(journey, await said(page, scene.place), `after Pick up, no line says: ${scene.place} (${JSON.stringify(await sayings(page))})`);
    if (phoneScreen) expect(journey, (await page.locator('.algebra-placement-progress').innerText()).trim() === scene.place, 'the phone line under the controls');
    // The sides come before Pick up in the page: the keyboard goes back to them, as the line says.
    const right = await tabUntil(page, (now) => now.label.endsWith('on the right side'), { back: true, limit: 40 });
    expect(journey, right, 'Shift+Tab never reached the right side');
    await press(page, 'Enter', 450);
    const left = await tabUntil(page, (now) => now.label.endsWith('on the left side'), { back: true, limit: 40 });
    expect(journey, left, 'Shift+Tab never reached the left side');
    await press(page, 'Space', 1000);
    expect(journey, await said(page, scene.balanced), `after both sides, no line says: ${scene.balanced} (${JSON.stringify(await sayings(page))})`);
    const cues = (await page.locator('.algebra-cancellation-cue').allInnerTexts()).map((text) => text.trim());
    expect(journey, cues.includes(scene.cue), `the cue under the equation: ${JSON.stringify(cues)}`);
    // The cue's route: Tab to one of the pair and press Enter; its partner is crossed out with it.
    const piece = await reach(page, scene.piece);
    expect(journey, piece, 'Tab never reached a piece of the cancelling pair');
    await press(page, 'Enter', 1000);
    expect(journey, await said(page, /The cancellation is complete\./), `Enter did not cancel the pair (${JSON.stringify(await sayings(page))})`);
    report.push({ journey, cue: cues[0], said: (await sayings(page)).slice(-2) });
    await page.close();
  }
  await context.close();
}

// WHERE ON A SIDE, BY KEYBOARD (student-a11y-3). A tap chooses where on a side the
// operation goes; on a focused side the arrow keys choose among the same places.
// 3x + 6 = 21, subtract 6: keyboard focus on the right side shows where Enter puts
// it (the end), Home moves it in front of 21 and the name says so, and Enter places
// it there; the left side, with no arrow pressed, takes it at its end as before.
// The move the student then sees is -6 + 21 on the right and 3x + 6 - 6 on the left.
async function directionsPlacementPlaces(browserInstance, viewport) {
  const journey = `directions-places-${viewport.width}`;
  const context = await ownerContext(browserInstance, viewport);
  const page = await open(context, 4);
  const cueOn = (side) => page.evaluate((at) => [...document.querySelectorAll('.algebra-equation-box')][at === 'left' ? 0 : 1]
    ?.querySelector('.algebra-term-placement-cue')?.className.replace(/.*algebra-term-placement-cue\s*/, '').trim() || '', side);
  expect(journey, await tabUntil(page, (now) => now.label === 'Choose Subtract operation', { limit: 80 }), 'Tab never reached Subtract');
  await press(page, 'Enter', 450);
  await page.keyboard.type('6');
  await settle(page, 450);
  expect(journey, await tabUntil(page, (now) => /^(Pick up|Use|Ready to place) /.test(now.label), { limit: 30 }), 'Tab never reached Pick up');
  await press(page, 'Enter', 600);
  const right = await tabUntil(page, (now) => now.label.endsWith('on the right side'), { back: true, limit: 40 });
  expect(journey, right?.label === 'Place subtract 6 on the right side', `the right side's name before an arrow: ${right?.label}`);
  // Keyboard focus draws the place Enter would use: after 21, the side's end.
  expect(journey, /\bis-after\b.*\bis-hover\b/.test(await cueOn('right')), `no cue at the end of the right side: "${await cueOn('right')}"`);
  await press(page, 'Home', 300);
  const moved = await focusNow(page);
  expect(journey, moved.label === 'Place subtract 6 before 21 on the right side', `after Home the right side says: ${moved.label}`);
  expect(journey, /\bis-before\b.*\bis-hover\b/.test(await cueOn('right')), `Home did not move the cue in front of 21: "${await cueOn('right')}"`);
  await press(page, 'Enter', 450);
  const left = await tabUntil(page, (now) => now.label.endsWith('on the left side'), { back: true, limit: 40 });
  expect(journey, left?.label === 'Place subtract 6 on the left side', `the left side's name: ${left?.label}`);
  await press(page, 'Enter', 1000);
  const terms = await page.evaluate(() => [...document.querySelectorAll('.algebra-equation-box')]
    .map((box) => [...box.querySelectorAll('[data-term-text]')].map((term) => term.getAttribute('data-term-text').replace(/\s+/g, ''))));
  expect(journey, JSON.stringify(terms[1]) === JSON.stringify(['-6', '+21']), `the right side after the move: ${JSON.stringify(terms[1])}`);
  expect(journey, JSON.stringify(terms[0]) === JSON.stringify(['3x', '+6', '-6']), `the left side after the move: ${JSON.stringify(terms[0])}`);
  report.push({ journey, right: terms[1], left: terms[0] });
  await page.close();
  await context.close();
}

// Each Rewrite tool: its status line, then the keys it names.
async function directionsStructureTools(context) {
  const journey = 'directions-structure-tools';
  const openTool = async (page, kind) => {
    expect(journey, await tabUntil(page, (now) => /algebra-rewrite-toggle/.test(now.cls), { limit: 80 }), 'Tab never reached Rewrite');
    await press(page, 'Enter', 250);
    expect(journey, await tabUntil(page, (now) => new RegExp(`algebra-structure-toggle--${kind}`).test(now.cls), { limit: 6 }), `Tab never reached ${kind} in the Rewrite menu`);
    await press(page, 'Enter', 400);
  };
  const statusIs = async (page, text, what) => {
    const lines = await page.locator('.algebra-inline-mode-status, .algebra-inline-mode-feedback').allInnerTexts();
    expect(journey, lines.map((line) => line.trim()).includes(text), `${what}: ${JSON.stringify(lines)}`);
  };

  // Factor: the terms, then the factors they share, then Pull out.
  let page = await open(context, 1);
  await openTool(page, 'factor');
  await statusIs(page, 'Select the terms you are factoring (click or tap, or Tab to each and press Enter)', 'the Factor status line');
  for (const [label, key] of [['15 x', 'Enter'], ['- 45', 'Space']]) {
    expect(journey, await reach(page, (now) => now.term === label && /select as a term to factor/.test(now.label)), `Tab never reached the term ${label}`);
    await press(page, key, 200);
  }
  expect(journey, await reach(page, (now) => now.text === 'Factor to primes'), 'Tab never reached Factor to primes');
  await press(page, 'Enter', 450);
  await statusIs(page, 'Select the factors every selected term shares (click or tap, or Tab to each and press Enter)', 'the Factor token line');
  for (const label of ['Factor 3 of 15 x', 'Factor 5 of 15 x', 'Factor 3 of negative 45', 'Factor 5 of negative 45']) {
    expect(journey, await reach(page, (now) => now.label.startsWith(label) && now.pressed === 'false'), `Tab never reached ${label}`);
    await press(page, 'Enter', 150);
  }
  expect(journey, (await page.locator('.algebra-structure-chip').first().getAttribute('title')) === 'Drag out front, or Tab to Pull out and press Enter', 'the drag chip\'s description');
  expect(journey, await reach(page, (now) => now.text.startsWith('Pull out') && /algebra-inline-commit/.test(now.cls)), 'Tab never reached Pull out');
  await press(page, 'Enter', 500);
  expect(journey, (await activeLabel(page)).startsWith('What is left of 15x'), `Pull out did not hand focus to the first remainder (${await activeLabel(page)})`);
  await page.close();

  // Split fraction: choose one of two fractions, pick up the denominator, place it under each term.
  page = await open(context, 9);
  await openTool(page, 'split');
  await statusIs(page, 'Select the fraction to split (click or tap, or Tab to it and press Enter)', 'the Split status line');
  expect(journey, await reach(page, (now) => now.label.endsWith('select to split')), 'Tab never reached a fraction to split');
  await press(page, 'Enter', 400);
  for (let guard = 0; guard < 4 && (await page.locator('button[aria-label^="Place the denominator under"]:not([disabled])').count()); guard += 1) {
    if (!(await page.locator('button.algebra-inline-factor-token.is-armed').count())) {
      expect(journey, await reach(page, (now) => now.label.startsWith('Pick up the denominator')), 'Tab never reached Pick up the denominator');
      await press(page, 'Enter', 200);
    }
    expect(journey, await reach(page, (now) => now.label.startsWith('Place the denominator under') && !now.disabled), 'Tab never reached a numerator term');
    await press(page, guard % 2 ? 'Enter' : 'Space', 300);
  }
  expect(journey, (await activeLabel(page)) === 'Commit split', `Commit split was not focused (${await activeLabel(page)})`);
  await press(page, 'Enter', 900);
  expect(journey, compact(await state(page)) === 'y=\\frac{6}{2}-\\frac{5x}{2}+\\frac{4-x}{3}', `the split: ${compact(await state(page))}`);
  await page.close();

  // Cancel factors: choose the fraction, hold a factor, then the equal one across the bar.
  page = await open(context, 10);
  await openTool(page, 'reduce');
  await statusIs(page, 'Select a highlighted fraction to write it as primes (click or tap, or Tab to it and press Enter)', 'the Cancel factors status line');
  expect(journey, await reach(page, (now) => now.label.endsWith('select to write as prime factors') && /6 x/.test(now.term)), 'Tab never reached the fraction');
  await press(page, 'Enter', 400);
  await statusIs(page, 'Select a factor, then an equal factor across the bar (click or tap, or Tab to each and press Enter)', 'the pairing line');
  expect(journey, await reach(page, (now) => now.label.startsWith('Numerator factor 2')), 'Tab never reached the numerator 2');
  await press(page, 'Enter', 200);
  expect(journey, await reach(page, (now) => now.label.startsWith('Denominator factor 2') && !now.label.includes('cancelled')), 'Tab never reached a denominator 2');
  await press(page, 'Space', 300);
  expect(journey, await said(page, '1 pair cancelled'), 'the pair was not cancelled');
  expect(journey, await reach(page, (now) => now.text === 'Apply cancellation'), 'Tab never reached Apply cancellation');
  await press(page, 'Enter', 800);
  expect(journey, compact(await state(page)) === 'y=\\frac{3x}{2}+3', `the cancellation: ${compact(await state(page))}`);
  await page.close();

  // Arrange terms: two terms swapped, each by the keys; the labels name what a press does.
  page = await open(context, 11);
  await openTool(page, 'arrange');
  await statusIs(page, 'Select two terms to swap them (click or tap, or Tab to each and press Enter)', 'the Arrange status line');
  expect(journey, await reach(page, (now) => now.term === '3' && now.label.endsWith('select to move')), 'Tab never reached the first term');
  await press(page, 'Enter', 300);
  await statusIs(page, 'Select another term to swap (click or tap, or Tab to it and press Enter)', 'the swap line');
  const labels = await page.locator('[data-term-text][role="button"]').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
  expect(journey, labels.length === 2 && labels.every((label) => label.endsWith(', select to swap with the selected term')), `the terms' labels: ${JSON.stringify(labels)}`);
  expect(journey, await reach(page, (now) => now.term === '- 5 x'), 'Tab never reached the other term');
  await press(page, 'Space', 300);
  expect(journey, await reach(page, (now) => now.text === 'Keep this order'), 'Tab never reached Keep this order');
  await press(page, 'Enter', 800);
  expect(journey, compact(await state(page)) === 'y=-5x+3', `the arrangement: ${compact(await state(page))}`);
  await page.close();
  report.push({ journey });
}

// The relation workspace (an inequality): its directions, then placement and cancellation by keys.
async function directionsRelation(context) {
  const journey = 'directions-relation';
  const page = await open(context, 12);
  const cue = (await page.locator('div', { hasText: /^Cancellation works directly/ }).last().innerText()).replace(/\s+/g, ' ').trim();
  expect(journey, /Select two items \(click or tap, or Tab to each and press Enter\), or press and drag from one item into its matching partner\./.test(cue), `the cancellation line: ${cue}`);
  expect(journey, await tabUntil(page, (now) => /Subtract/.test(now.text) && !now.cls, { limit: 80 }), 'Tab never reached Subtract');
  await press(page, 'Enter', 450);
  await page.keyboard.type('6');
  await settle(page, 450);
  const titles = await page.locator('button[title^="Select this term to choose Before, Under, or After"]').evaluateAll((elements) => elements.map((element) => element.title));
  expect(journey, titles.length === 3 && titles.every((title) => title === 'Select this term to choose Before, Under, or After (click or tap, or press Enter)'), `the terms' descriptions: ${JSON.stringify(titles)}`);
  // Enter on a term opens Before, Under and After (buttons); Enter or Space chooses one. Both sides, then the step.
  for (const [term, key] of [['+ 6', 'Enter'], ['21', 'Space']]) {
    expect(journey, await reach(page, (now) => now.text.startsWith(term)), `Tab never reached the term ${term}`);
    await press(page, 'Enter', 300);
    expect(journey, await reach(page, (now) => now.text === 'After'), 'Tab never reached After');
    await press(page, key, 300);
  }
  expect(journey, await reach(page, (now) => now.text === 'Commit step'), 'Tab never reached Commit step');
  await press(page, 'Enter', 1000);
  // Cancelling: Enter on one of the pair, then on the other.
  expect(journey, await reach(page, (now) => now.text.startsWith('+ 6')), 'Tab never reached + 6 after the step');
  await press(page, 'Enter', 300);
  expect(journey, await reach(page, (now) => now.text.startsWith('- 6')), 'Tab never reached − 6');
  await press(page, 'Space', 1200);
  expect(journey, await said(page, /^Cancellation complete\./), `the pair was not cancelled (${JSON.stringify(await sayings(page))})`);
  report.push({ journey, cue });
  await page.close();
}

// ONLY=directions (or a journey's name, comma-separated) runs just those journeys.
const only = (process.env.ONLY || '').split(',').map((name) => name.trim()).filter(Boolean);
const wants = (name) => !only.length || only.some((entry) => name.startsWith(entry));

const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
for (const journey of [factored15x45, factoredPartial, factoredNegative, slopeFiveTwoSix, slopeTwoFourEight, keyboard, solveRegression, subtractedGroup, undoOneDecision, legacyDrafts, divideNegative, directionsStructureTools, directionsRelation]) {
  if (!wants(journey.name)) continue;
  try {
    await journey(context);
  } catch (error) {
    note(journey.name, `threw: ${error.message.split('\n').slice(0, 3).join(' | ')}`);
  }
}
if (wants('phone')) {
  try {
    await phone(browser);
  } catch (error) {
    note('phone', `threw: ${error.message.split('\n')[0]}`);
  }
}
// The owner's case at both required viewports, by pointer and by keyboard alone.
for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  for (const keyboardOnly of [false, true]) {
    if (!wants('owner-case')) continue;
    try {
      await ownerCase(browser, viewport, { keyboardOnly });
    } catch (error) {
      note(`owner-case-${viewport.width}${keyboardOnly ? '-keyboard' : ''}`, `threw: ${error.message.split('\n').slice(0, 3).join(' | ')}`);
    }
  }
}
// AX32 (slice 4): placing an operation and cancelling by keys, on a computer and on a phone.
for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  if (!wants('directions')) continue;
  try {
    await directionsPlacementAndCancel(browser, viewport);
  } catch (error) {
    note(`directions-placement-${viewport.width}`, `threw: ${error.message.split('\n').slice(0, 3).join(' | ')}`);
  }
  try {
    await directionsPlacementPlaces(browser, viewport);
  } catch (error) {
    note(`directions-places-${viewport.width}`, `threw: ${error.message.split('\n').slice(0, 3).join(' | ')}`);
  }
}
await browser.close();

writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify({ findings, report }, null, 2));
console.log(JSON.stringify({ findings, report }, null, 2));
process.exitCode = findings.length ? 1 : 0;
