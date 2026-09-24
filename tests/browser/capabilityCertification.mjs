// INTERACTIVE CAPABILITY CERTIFICATION — PERFORMED IN A REAL BROWSER.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/capabilityCertification.mjs
//
// Every fixture comes from src/platform/certification/interactiveCapabilityManifest.js
// and is compiled from V5 authoring JSON by the production compiler, then
// mounted in the real QuestionEngine (capabilityCertificationMain.jsx). Each
// journey does what a student does — taps the tokens, types the values, picks
// the symbols — and checks the resulting mathematics with the production
// algebra engine, not by reading a label.
//
// A capability passes only when:
//   - the question reaches the engine that owns it (data-algebra-route), and
//   - the student's actions produce the right mathematics on screen.
//
// Journeys (names are the manifest's `browser.journey` ids):
//   distribution               3(2x − 4) = 18: pick up 3, place on each term, commit
//   combine-like-terms         2x + 3x − 4 = 11: select 2x and 3x, type 5x
//   exact-fractions            9x = 20: ÷ 9, cancel — x = 20/9 stays a fraction
//   undo                       4x + 7 = 23: − 7 on both sides, Undo restores 4x + 7 = 23
//   work-persistence           the same move survives a full reload
//   work-view                  Enlarge keeps the task and the equation; closing keeps both
//   inequality-sign-reversal   −2x + 3 > 7 ÷ −2: the kept symbol is refused, the reversed one accepted
//   history-notation           the relation history shows math, not abs(…) / <= / *
//   relation-persistence       the reversed-symbol step survives a full reload
//   draft-recovery             a corrupted relation draft resumes the question instead of crashing it
//   inequality-distribution    −3(x − 4) > 2x + 7: −3 placed on each term, Undo takes it back
//   inequality-like-terms      2x + 3x − 4 ≤ 11: a wrong sum refused, 5x accepted with Enter
//   absolute-value             |2x − 3| = 7: a one-sided split is refused, 7 OR −7 is accepted
//   absolute-value-inequality  |x − 2| < 5: −5 < x − 2 < 5 built by the student
//   xy-intercepts              3x + 4y = 24: y = 0 dropped on y, then the mature engine solves
//   host-parity                a stored stepAlgebra2 intercept record opens the orchestrator raw
//   prompt-tool-match          a stored factor-less sign analyzer shows the prompt's inequality
//
// Writes tests/browser/artifacts/capabilityCertification/results.json and, on a
// failure, a screenshot plus console errors, failed requests, the fixture, the
// route and the step that failed. Exit 1 on any failure.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { balancedMove, cancelFactor, cancellationLabels, combineLikeTerms, distribute, setMathField, settle, simplifySide } from './stepAlgebraDriver.mjs';
import { expressionsEquivalent, latexToExpression } from '../../src/algebraAstEngine.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/capabilityCertification');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const PAGE = `${ORIGIN}/tests/browser/capabilityCertification.html`;
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });

const results = [];
const compact = (latex) => String(latex || '').replace(/[\s~]+/g, '');
const sides = (latex) => {
  const expression = latexToExpression(String(latex || ''));
  const parts = expression.split('=');
  return parts.length === 2 ? parts : null;
};
const equivalentEquation = (latexA, latexB, variable = 'x') => {
  const a = sides(latexA);
  const b = sides(latexB);
  if (!a || !b) return false;
  // Same solution set: left − right agree up to a nonzero multiple is too
  // loose for a single step, so compare each side directly.
  return expressionsEquivalent(a[0], b[0], variable) && expressionsEquivalent(a[1], b[1], variable);
};

class JourneyFailure extends Error {}
const check = (ok, detail) => { if (!ok) throw new JourneyFailure(detail); };

const state = (page) => page.locator('[data-math-state]').first().getAttribute('data-math-state');
const route = (page) => page.locator('[data-algebra-route]').first().getAttribute('data-algebra-route');
const undoButton = (page) => page.locator('.mathmaster-universal-undo:not([data-work-view-action])').first();
// Work View mounts a second copy of some controls; a student can only press
// the one they can see.
const visibleButton = (page, name) => page.locator('button:visible').filter({ hasText: name }).first();
const visibleLabelled = (page, label) => page.locator(`button[aria-label="${label}"]:visible`).first();

/*
 * One journey: its own page, its own fixture, and everything a developer needs
 * if it fails — no rerun required to see what the student would have seen.
 */
async function journey(name, fixture, run) {
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    // MathLive's optional fonts are not served by the dev harness.
    if (message.type() === 'error' && !/math fonts could not be loaded|Failed to load resource/.test(message.text())) consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (!/fonts|favicon/.test(request.url())) failedRequests.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`);
  });
  const steps = [];
  const step = (label) => steps.push(label);
  const started = Date.now();
  try {
    step('open fixture');
    await page.goto(`${PAGE}?fixture=${fixture}`);
    await page.waitForFunction(() => Boolean(window.__mmCert), null, { timeout: 30000 });
    await page.evaluate(() => window.__mmCert.clearStorage());
    await page.reload();
    await page.waitForSelector('[data-algebra-route]', { timeout: 30000 });
    await settle(page, 900);
    const details = await run(page, step);
    check(!consoleErrors.some((line) => /pageerror/.test(line)), `page errors: ${consoleErrors.join(' | ')}`);
    results.push({ journey: name, fixture, status: 'pass', ms: Date.now() - started, details: details || null });
    console.log(`PASS ${name}`);
  } catch (error) {
    const screenshot = path.join(ARTIFACTS, `${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    const failure = {
      journey: name,
      fixture,
      status: 'fail',
      ms: Date.now() - started,
      failedStep: steps[steps.length - 1] || 'start',
      error: error instanceof JourneyFailure ? error.message : String(error?.stack || error),
      route: await route(page).catch(() => null),
      mathState: await state(page).catch(() => null),
      question: await page.evaluate(() => window.__mmCert?.question?.() || null).catch(() => null),
      consoleErrors,
      failedRequests,
      screenshot: path.relative(repo, screenshot),
    };
    results.push(failure);
    console.log(`FAIL ${name} at "${failure.failedStep}": ${failure.error.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------- STEP ALGEBRA

await journey('distribution', 'distribute', async (page, step) => {
  check(await route(page) === 'stepAlgebra', `route ${await route(page)}`);
  const host = page.locator('body');
  const before = await state(page);
  check(/\(/.test(before), `the fixture starts grouped: ${before}`);
  step('distribute 3 across (2x − 4)');
  await distribute(page, host);
  const after = await state(page);
  check(after !== before, 'distribution changed the equation');
  // The products stay unsimplified on purpose (#336): (3)(2x) + (3)(−4).
  // What must be gone is the grouped sum the factor was distributed over.
  check(!/2x-4/.test(compact(after)), `the grouped (2x − 4) is gone: ${after}`);
  check(equivalentEquation(before, after), `the distributed equation is equivalent: ${before} → ${after}`);
  return { before, after };
});

await journey('combine-like-terms', 'combine-like-terms', async (page, step) => {
  check(await route(page) === 'stepAlgebra', `route ${await route(page)}`);
  const host = page.locator('body');
  const before = await state(page);
  step('select 2x and 3x, enter 5x');
  await combineLikeTerms(page, host, 'left', /x/, '5x');
  const after = await state(page);
  check(equivalentEquation(before, after), `combining preserved the equation: ${before} → ${after}`);
  check(/5x/.test(compact(after)) && !/2x/.test(compact(after)), `2x and 3x became 5x: ${after}`);
  return { before, after };
});

await journey('exact-fractions', 'exact-fraction', async (page, step) => {
  const host = page.locator('body');
  step('divide both sides by 9');
  await balancedMove(page, host, 'Divide by', '9');
  if (await page.locator('[aria-label$="mark this factor for cancellation"]').count()) {
    step('cancel 9 over 9');
    await cancelFactor(page, host);
  }
  await settle(page, 700);
  if (await page.locator('.algebra-optional-simplification').count()) {
    step('keep the right side as 20/9');
    await simplifySide(page, host, 'right', '\\frac{20}{9}');
  }
  const final = compact(await state(page));
  const visible = await page.locator('.mathmaster-question-tool-workspace').innerText();
  check(/^x=\\frac\{20\}\{9\}$/.test(final), `x = 20/9 exactly: ${final}`);
  check(!/2\.22/.test(final) && !/2\.22/.test(visible), 'no decimal approximation is shown');
  return { final };
});

// − 7 on both sides, then the student cancels +7 with −7 and simplifies the
// right side: the committed equation becomes 4x = 16.
const subtractSeven = async (page, step) => {
  const host = page.locator('body');
  step('subtract 7 from both sides');
  await balancedMove(page, host, 'Subtract', '7');
  await settle(page, 600);
  step('cancel +7 with −7');
  const labels = await cancellationLabels(host);
  const plusSeven = labels.find((label) => /^\+\s*7,/.test(label));
  check(Boolean(plusSeven), `a +7 to cancel: ${JSON.stringify(labels)}`);
  await page.locator(`[aria-label="${plusSeven}"]:visible`).first().click();
  await settle(page, 1200);
  if (await page.locator('.algebra-optional-simplification').count()) {
    step('simplify the right side to 16');
    await simplifySide(page, host, 'right', '16');
  }
  await settle(page, 600);
  const now = compact(await state(page));
  check(/^4x=(16|-7\+23|23-7)$/.test(now), `after − 7 the equation is 4x = 16: ${now}`);
};

await journey('undo', 'balanced-solve', async (page, step) => {
  const original = await state(page);
  await subtractSeven(page, step);
  const moved = await state(page);
  check(moved !== original, `the move changed the equation: ${moved}`);
  step('press Undo');
  await undoButton(page).click();
  await settle(page, 700);
  const afterOne = await state(page);
  check(afterOne !== moved, 'one Undo takes back the last step');
  // The move was cancel + simplify on top of the balanced step; Undo walks
  // back one real transformation at a time until the original returns.
  let presses = 1;
  while ((await state(page)) !== original && presses < 4 && await undoButton(page).isEnabled()) {
    await undoButton(page).click();
    await settle(page, 700);
    presses += 1;
  }
  const restored = await state(page);
  check(restored === original, `Undo restored ${original}, got ${restored} after ${presses} presses`);
  step('the move can be made again after Undo');
  await subtractSeven(page, step);
  check(await state(page) === moved, 'the same move is available again');
  return { original, moved, restored, presses };
});

await journey('work-persistence', 'balanced-solve', async (page, step) => {
  await subtractSeven(page, step);
  const moved = await state(page);
  step('reload the page');
  await page.reload();
  await page.waitForSelector('[data-math-state]', { timeout: 30000 });
  await settle(page, 1200);
  const restored = await state(page);
  check(restored === moved, `after a reload the work is ${restored}, expected ${moved}`);
  return { moved, restored };
});

await journey('work-view', 'balanced-solve', async (page, step) => {
  await subtractSeven(page, step);
  const moved = await state(page);
  step('open Work View');
  const opener = page.locator('.mathmaster-work-view-host[data-open="false"] button').filter({ hasText: /enlarge/i }).first();
  await opener.click();
  const shell = page.locator('.mathmaster-work-view-host[data-open="true"]').first();
  await shell.waitFor({ timeout: 10000 });
  await settle(page, 500);
  check(await shell.locator('[data-math-state]').first().getAttribute('data-math-state') === moved, 'Work View shows the same equation');
  check(/4x \+ 7 = 23|4x\s*\+\s*7\s*=\s*23/.test(await shell.innerText()), 'Work View keeps the task visible');
  step('close Work View');
  await page.keyboard.press('Escape');
  await settle(page, 500);
  if (await page.locator('.mathmaster-work-view-host[data-open="true"]').count()) {
    await page.locator('.mathmaster-work-view-host[data-open="true"] button').filter({ hasText: /close|exit/i }).first().click();
    await settle(page, 500);
  }
  check(await state(page) === moved, 'closing Work View keeps the work');
  return { moved };
});

// --------------------------------------------------------- RELATIONS (≤, |x|)

const divideRelationByNegativeTwo = async (page, step) => {
  step('choose Divide by −2');
  await visibleButton(page, /Divide by/).click();
  await setMathField(page, page.locator('math-field[aria-label="divide value"]:visible').first(), '-2');
  step('place the divisor under both sides');
  const placements = page.locator('button[title="Place the divisor beneath this expression"]:visible');
  const count = await placements.count();
  check(count === 2, `two sides to divide, found ${count}`);
  for (let index = 0; index < count; index += 1) {
    await placements.nth(index).click();
    await settle(page, 150);
  }
  await visibleButton(page, 'Commit step').click();
  await settle(page, 600);
};

const symbolPending = (page) => page.locator('button[aria-label="Choose relation symbol"]:visible').count();
const chooseSymbol = async (page, symbol) => {
  const picker = page.locator('button[aria-label="Choose relation symbol"]:visible').first();
  const menu = page.locator('button[aria-label="Choose relation symbol"] + span button:visible');
  if (!(await menu.count())) await picker.click();
  await settle(page, 200);
  const glyph = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' }[symbol];
  await menu.filter({ hasText: new RegExp(`^${glyph}$`) }).first().click();
  await settle(page, 600);
};

await journey('inequality-sign-reversal', 'inequality-reversal', async (page, step) => {
  check(await route(page) === 'relation', `route ${await route(page)}`);
  await divideRelationByNegativeTwo(page, step);
  check(await symbolPending(page) > 0, 'dividing by a negative asks the student for the symbol');
  step('keep > (wrong)');
  await chooseSymbol(page, '>');
  // The kept symbol is refused: the symbol step stays open and nothing is
  // committed with >.
  // While the symbol step is open the workspace still shows the division with
  // the old symbol; the refusal is that the step stays open and says why.
  check(await symbolPending(page) > 0, 'keeping > after dividing by −2 is refused and the symbol step stays open');
  const refusal = (await page.locator('.mathmaster-question-tool-workspace').first().innerText());
  check(/That relation symbol does not keep the relation equivalent/.test(refusal), 'the student is told the kept symbol is not equivalent');
  step('reverse to <');
  await chooseSymbol(page, '<');
  const after = await state(page);
  check(/</.test(after) && !/>/.test(after), `the committed relation uses <: ${after}`);
  check(await symbolPending(page) === 0, 'the pending symbol step is resolved');
  return { after };
});

await journey('history-notation', 'inequality-reversal', async (page, step) => {
  await divideRelationByNegativeTwo(page, step);
  await chooseSymbol(page, '<');
  step('open Work View and its Help panel to read the work history');
  await page.locator('.mathmaster-work-view-host[data-open="false"] button:visible').filter({ hasText: /enlarge/i }).first().click();
  await page.locator('.mathmaster-work-view-host[data-open="true"]').first().waitFor({ timeout: 10000 });
  await visibleButton(page, /^Help$/).click();
  await settle(page, 500);
  const history = page.locator('.solver-work-history li:visible');
  const count = await history.count();
  check(count >= 2, `the history lists the original and the committed relation (${count})`);
  const text = (await history.allInnerTexts()).join(' | ');
  const mathElements = await page.locator('.solver-work-history li:visible').evaluateAll((rows) => rows.filter((row) => row.querySelector('math-span, math-div')).length);
  check(mathElements >= count, `every history row is rendered math (${mathElements}/${count})`);
  check(!/abs\(|<=|>=|\*/.test(text), `no solver syntax in the history: ${text}`);
  return { rows: count };
});

await journey('inequality-distribution', 'inequality-distribute', async (page, step) => {
  check(await route(page) === 'relation', `route ${await route(page)}`);
  const before = await state(page);
  step('open Distribute');
  await visibleButton(page, /^Distribute$/).click();
  await settle(page, 300);
  step('pick up −3 and place it on each term');
  await visibleLabelled(page, 'Pick up the multiplier -3').click();
  await visibleLabelled(page, 'Place the multiplier on x').click();
  await visibleLabelled(page, 'Pick up the multiplier -3').click().catch(() => {});
  await visibleLabelled(page, 'Place the multiplier on - 4').click();
  await settle(page, 200);
  step('commit');
  await visibleButton(page, 'Commit distribution').click();
  await settle(page, 700);
  const after = await state(page);
  check(!/\(x - 4\)/.test(after), `the group is distributed: ${after}`);
  check(/\(-3\)\s*\(x\)/.test(after) && /\(-3\)\s*\(-4\)/.test(after), `−3 reached both terms, unsimplified: ${after}`);
  check(/>/.test(after), 'the inequality symbol is unchanged');
  step('Undo takes the distribution back');
  await undoButton(page).click();
  await settle(page, 700);
  check(await state(page) === before, 'Undo restores the grouped inequality');
  return { before, after };
});

await journey('inequality-like-terms', 'inequality-like-terms', async (page, step) => {
  check(await route(page) === 'relation', `route ${await route(page)}`);
  step('open Combine like terms and choose 2x and 3x');
  await visibleButton(page, /^Combine like terms$/).click();
  await settle(page, 300);
  await visibleLabelled(page, '2 x, select as a term to combine').click();
  await visibleLabelled(page, '3 x, select as a term to combine').click();
  await settle(page, 300);
  const field = page.locator('math-field[aria-label^="Enter the single term these selected terms combine to"]:visible').first();
  const focused = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase());
  check(focused === 'math-field', `the answer box takes focus once two terms are chosen (${focused})`);
  step('a wrong sum is refused');
  await setMathField(page, field, '6x');
  await page.keyboard.press('Enter');
  await settle(page, 600);
  check(/2\s*x\s*\+\s*3\s*x/.test(await state(page)), 'nothing was committed');
  step('5x is accepted with Enter');
  await setMathField(page, field, '5x');
  await field.press('Enter');
  await settle(page, 700);
  const after = await state(page);
  check(/^5\s*x\s*-\s*4\s*<=\s*11$/.test(after), `2x + 3x became 5x: ${after}`);
  return { after };
});

await journey('absolute-value', 'absolute-value-equation', async (page, step) => {
  check(await route(page) === 'relation', `route ${await route(page)}`);
  step('Reverse absolute value → Two branches (OR)');
  await visibleButton(page, 'Reverse absolute value').click();
  await visibleButton(page, 'Two branches (OR)').click();
  await settle(page, 300);
  step('a one-sided split (7 and 7) is refused');
  await setMathField(page, page.locator('math-field[aria-label="Branch A right-side value"]'), '7');
  await setMathField(page, page.locator('math-field[aria-label="Branch B right-side value"]'), '7');
  await visibleButton(page, 'Check split').click();
  await settle(page, 500);
  check(!/OR/.test(await state(page)), 'a split without the negative branch is not committed');
  step('7 OR −7 is accepted');
  await setMathField(page, page.locator('math-field[aria-label="Branch B right-side value"]'), '-7');
  await visibleButton(page, 'Check split').click();
  await settle(page, 700);
  const after = await state(page);
  check(/OR/.test(after), `two branches are created: ${after}`);
  check(/=\s*7/.test(after) && /=\s*-\s*7/.test(after), `branches equal 7 and −7: ${after}`);
  check(!/abs\(/.test(after), 'the absolute value is gone from both branches');
  return { after };
});

await journey('absolute-value-inequality', 'absolute-value-inequality', async (page, step) => {
  check(await route(page) === 'relation', `route ${await route(page)}`);
  step('Reverse absolute value → Three-part compound (AND)');
  await visibleButton(page, 'Reverse absolute value').click();
  await visibleButton(page, 'Three-part compound (AND)').click();
  await settle(page, 300);
  await setMathField(page, page.locator('math-field[aria-label="Left bound of compound inequality"]'), '-5');
  await setMathField(page, page.locator('math-field[aria-label="Right bound of compound inequality"]'), '5');
  step('choose < and <');
  await page.locator('select[aria-label="Left inequality symbol"], [aria-label="Left inequality symbol"]').first().selectOption('<');
  await page.locator('select[aria-label="Right inequality symbol"], [aria-label="Right inequality symbol"]').first().selectOption('<');
  await visibleButton(page, 'Check split').click();
  await settle(page, 700);
  const after = await state(page);
  check(/-\s*5\s*<\s*x\s*-\s*2\s*<\s*5/.test(after), `−5 < x − 2 < 5: ${after}`);
  return { after };
});

await journey('relation-persistence', 'inequality-reversal', async (page, step) => {
  await divideRelationByNegativeTwo(page, step);
  await chooseSymbol(page, '<');
  const committed = await state(page);
  step('reload the page');
  await page.reload();
  await page.waitForSelector('[data-math-state]', { timeout: 30000 });
  await settle(page, 1200);
  const restored = await state(page);
  check(restored === committed, `the relation work survives a reload: ${restored} vs ${committed}`);
  return { committed, restored };
});

await journey('draft-recovery', 'inequality-reversal', async (page, step) => {
  await divideRelationByNegativeTwo(page, step);
  await chooseSymbol(page, '<');
  step('corrupt every saved draft for this question');
  await page.evaluate(() => {
    Object.keys(localStorage).filter((key) => key.includes('capability-certification')).forEach((key) => {
      localStorage.setItem(key, JSON.stringify({ version: 2, savedAt: Date.now(), value: { relationState: { branches: 'broken' }, pendingRelationFlip: 42, candidateChecks: [1] } }));
    });
  });
  step('reload');
  await page.reload();
  await page.waitForSelector('[data-algebra-route]', { timeout: 30000 });
  await settle(page, 1200);
  const text = await page.locator('.mathmaster-question-tool-workspace').first().innerText();
  check(!/could not be displayed/i.test(text), 'a malformed draft must not stop the question from opening');
  const resumed = await state(page);
  check(/-\s*2\s*x\s*\+\s*3\s*>\s*7/.test(resumed), `the question resumes from its own inequality: ${resumed}`);
  return { resumed };
});

// ------------------------------------------------------------------ INTERCEPTS

const dropZeroOnY = async (page, step) => {
  step('decide y = 0 for the x-intercept');
  await visibleButton(page, /^y = 0$/).click();
  await settle(page, 300);
  step('pick up 0 and drop it on y');
  await visibleLabelled(page, 'Pick up zero for substitution').click();
  await visibleLabelled(page, 'y variable substitution target').click();
  await settle(page, 200);
  await visibleButton(page, 'Commit substitution').click();
  await settle(page, 900);
};

await journey('xy-intercepts', 'xy-intercepts', async (page, step) => {
  check(await route(page) === 'linearIntercepts', `route ${await route(page)}`);
  await dropZeroOnY(page, step);
  step('the mature Step Algebra engine opens for the one-variable solve');
  await page.waitForSelector('[data-math-state]', { timeout: 15000 });
  const solving = await state(page);
  const [left, right] = sides(solving) || [];
  check(left && right, `a one-variable equation: ${solving}`);
  check(expressionsEquivalent(`${left} - (${right})`, '3x - 24', 'x'), `3x + 4(0) = 24 reduces to 3x = 24: ${solving}`);
  check(await page.locator('.algebra-pickup-button, button[aria-label^="Choose"]').count() > 0, 'balanced operations are available');
  return { solving };
});

// ------------------------------------------------------------------- HOSTS

await journey('host-parity', 'stored-legacy-intercepts', async (page, step) => {
  step('mount the stored stepAlgebra2 record raw, as Teacher Question Review does');
  check(await route(page) === 'linearIntercepts', `a raw stored record opens the orchestrator, got ${await route(page)}`);
  check(await page.locator('button[aria-label="Pick up zero for substitution"]:visible').count() > 0, 'the zero-substitution stage is shown');
  await dropZeroOnY(page, step);
  await page.waitForSelector('[data-math-state]', { timeout: 15000 });
  return { route: 'linearIntercepts' };
});

await journey('prompt-tool-match', 'stored-factorless-sign-analyzer', async (page, step) => {
  step('mount the stored factor-less sign analyzer raw');
  check(await route(page) === 'relation', `route ${await route(page)}`);
  const shown = await state(page);
  check(/-\s*2\s*x\s*\+\s*3\s*>\s*7/.test(shown), `the prompt's inequality is on screen, not demo factors: ${shown}`);
  check(!/x\s*\+\s*2\)\s*\(x\s*-\s*3/.test(await page.locator('.mathmaster-question-tool-workspace').innerText()), 'no (x + 2)(x − 3) demo factors');
  return { shown };
});

await context.close();
await browser.close();

const failed = results.filter((result) => result.status !== 'pass');
writeFileSync(path.join(ARTIFACTS, 'results.json'), `${JSON.stringify({ origin: ORIGIN, finishedAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(`\nInteractive capability certification: ${results.length - failed.length}/${results.length} journeys passed.`);
if (failed.length) {
  failed.forEach((failure) => console.log(JSON.stringify(failure, null, 2)));
  process.exit(1);
}
