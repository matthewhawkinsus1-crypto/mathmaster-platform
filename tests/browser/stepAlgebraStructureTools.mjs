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
  await page.locator('[aria-label$="tap to swap with the selected term"]').last().click();
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

const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
for (const journey of [factored15x45, factoredPartial, factoredNegative, slopeFiveTwoSix, slopeTwoFourEight, keyboard, solveRegression, subtractedGroup, undoOneDecision, legacyDrafts, divideNegative]) {
  try {
    await journey(context);
  } catch (error) {
    note(journey.name, `threw: ${error.message.split('\n').slice(0, 3).join(' | ')}`);
  }
}
try {
  await phone(browser);
} catch (error) {
  note('phone', `threw: ${error.message.split('\n')[0]}`);
}
// The owner's case at both required viewports, by pointer and by keyboard alone.
for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  for (const keyboardOnly of [false, true]) {
    try {
      await ownerCase(browser, viewport, { keyboardOnly });
    } catch (error) {
      note(`owner-case-${viewport.width}${keyboardOnly ? '-keyboard' : ''}`, `threw: ${error.message.split('\n').slice(0, 3).join(' | ')}`);
    }
  }
}
await browser.close();

writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify({ findings, report }, null, 2));
console.log(JSON.stringify({ findings, report }, null, 2));
process.exitCode = findings.length ? 1 : 0;
