// KEYBOARD SWEEP T6 + T8, IN REAL CHROMIUM, AT 1366x768 AND 390x844.
//
//   npx vite --host 127.0.0.1 --port 5505 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5505 node tests/browser/toolKeyboardDataModelingAndSystemsCss.mjs
//
// Mounted through the keyboard-sweep harness (tests/browser/keyboardSweep.html:
// QuestionEngine + SAMPLE_SPECS, exactly as the assignment screen mounts a
// tool), driven by KEYS ONLY on the keyboard route. Exit 1 on any failure.
//
// T6 — Data Modeling Lab (src/tools/dataModeling/DataModelingLab.jsx)
//   * The residual table scroller is a tab stop named "Residual table" (role
//     region), shows the focus ring, and ArrowDown scrolls it.
//   * Scrolling it by keys changes nothing the lab records (state snapshot
//     before == after).
//   * The whole lab is answered by keys (steppers, selects, radio group, a
//     typed prediction) and Checked with Enter twice — a wrong prediction type,
//     then the right one. Each Check must reach the harness's onGrade, and the
//     verdicts must equal the SHARED grader's verdict
//     (functions/shared/serverGrading/tools/dataModelingLab.mjs through
//     gradeToolCheck) on the work those keys produce.
//   * The same answers by POINTER (mouse clicks, selectOption) on a fresh page
//     reach an identical state snapshot and identical verdicts.
//
// T8 — the outline:none rules removed from tool CSS
//   * Native controls that carried one (AlgebraicSystemMode.css: the
//     substitution variable drops, incl. while armed; the elimination + / −
//     rail, incl. once selected) show a visible ring on keyboard Tab.
//   * The two tabIndex={-1} programmatic-focus containers (the embedded Step
//     Algebra host in AlgebraicSystemMode.jsx, the inequality StepHeading in
//     InequalityBuildPanels.jsx) draw NO ring on a mouse click, nor on the
//     programmatic focus that follows a mouse press — and DO show one when the
//     programmatic focus follows a keyboard press (:focus-visible), which is
//     what the `:focus:not(:focus-visible)` guard is for.
//   * The inequality builder is then graded by keys ("Check my work").
//
// Nothing here asserts what a live region says; the lab announces stepper
// values only, never a verdict.

import assert from 'node:assert/strict';
import dataModelingGrader from '../../functions/shared/serverGrading/tools/dataModelingLab.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { correlation, linearRegression } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import { OWN_CHOICES } from '../../functions/shared/toolMath/shared/judgmentChoices.mjs';
import {
  buildCandidateModels,
  chooseBestModel,
  correlationDescriptor,
  predictionKind,
} from '../../functions/shared/toolMath/dataModeling/dataModelingMath.mjs';
import { dataModelingPoints, dataModelingStartingLine } from '../../functions/shared/toolMath/dataModeling/dataModelingPlan.mjs';
import { fitAdjustmentPlan, stepFitControl } from '../../src/platform/graph/graphScaleService.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5505';
const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const failures = [];
let passes = 0;
const check = (ok, message) => {
  if (ok) passes += 1;
  else { failures.push(message); console.log(`  FAIL ${message}`); }
};

const harnessUrl = (tool, spec) => `${ORIGIN}/tests/browser/keyboardSweep.html?tool=${tool}${spec ? `&spec=${encodeURIComponent(JSON.stringify(spec))}` : ''}`;

/* ----------------------------------------------------------------- helpers */

/** What has focus: enough to recognise a control without touching it. */
const focusInfo = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  const cs = getComputedStyle(el);
  const label = el.closest('label');
  return {
    tag: el.tagName,
    className: String(el.className?.baseVal ?? el.className ?? ''),
    role: el.getAttribute('role'),
    name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 90),
    fieldLabel: label ? (label.childNodes[0]?.textContent || '').trim() : null,
    type: el.type || null,
    sentinel: el.dataset?.kbSentinel || null,
    variable: el.dataset?.variable || null,
    inEquation2: Boolean(el.closest('[aria-label^="Equation 2: choose where"]')),
    outlineStyle: cs.outlineStyle,
    outlineWidth: Number.parseFloat(cs.outlineWidth) || 0,
    focusVisible: el.matches(':focus-visible'),
  };
});

/** A ring the student can see: an outline that is drawn and has width. */
const hasRing = (info) => Boolean(info) && info.outlineStyle !== 'none' && info.outlineWidth > 0;

/** Press Tab (keys only) until `match(focusInfo)` holds. */
const tabTo = async (page, match, what, { max = 60, back = false } = {}) => {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    const info = await focusInfo(page);
    if (info && match(info)) return info;
    if (info?.sentinel === (back ? 'start' : 'end')) break;
  }
  throw new Error(`Tab never reached ${what}`);
};

const startAtSentinel = async (page) => {
  // Focus the start sentinel the way a student arrives: a click on the page
  // chrome is not used; the harness's first tab stop is the sentinel.
  await page.keyboard.press('Tab');
  const info = await focusInfo(page);
  if (info?.sentinel !== 'start') await page.locator('[data-kb-sentinel="start"]').focus();
};

const grades = (page) => page.evaluate(() => window.__KB_GRADES__.filter((g) => g.kind === 'grade').map((g) => g.isCorrect));

const waitForGrades = async (page, count) => {
  await page.waitForFunction((n) => window.__KB_GRADES__.filter((g) => g.kind === 'grade').length >= n, count, { timeout: 8000 }).catch(() => {});
  return grades(page);
};

const openPage = async (viewport, tool, spec, readySelector) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(harnessUrl(tool, spec), { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator(readySelector).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  return { page, context, errors };
};

/* ------------------------------------------------- Data Modeling Lab (T6) */

// The harness's question: { id, type, prompt, ...SAMPLE_SPECS.dataModelingLab }
// (src/dev/MathToolsLab.jsx). The points are checked against the residual
// table on screen below, so a changed sample spec fails loudly here.
const DM_QUESTION = {
  id: 'kb-dataModelingLab',
  questionId: 'kb-dataModelingLab',
  type: 'dataModelingLab',
  prompt: 'Complete the dataModelingLab activity.',
  mode: 'full',
  points: [[1, 2], [2, 3], [3, 5], [4, 5], [5, 7], [6, 8], [7, 10]],
  causationSupported: false,
  expectedModel: 'linear',
  predictionX: 8,
};

/** The answer, the stepper presses that reach it, and the work those keys leave behind. */
const planDataModeling = () => {
  const points = dataModelingPoints(DM_QUESTION);
  const regression = linearRegression(points);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  // Same arguments DataModelingLab.jsx passes (full mode, no authored overrides).
  const plan = fitAdjustmentPlan({
    targetSlope: regression.m, targetIntercept: regression.b,
    xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys),
  });
  const start = dataModelingStartingLine('full', DM_QUESTION, { regression, stepperPlan: plan });
  const presses = (from, target, control) => {
    let value = from; let count = 0;
    const direction = target >= from ? 1 : -1;
    while (Math.abs(value - target) > control.tolerance / 2 && count < 60) {
      value = stepFitControl(value, direction, control); count += 1;
    }
    return { value, count, direction };
  };
  const slope = presses(start.m, regression.m, plan.slope);
  const intercept = presses(start.b, regression.b, plan.intercept);
  const candidates = buildCandidateModels(points, regression);
  const descriptor = correlationDescriptor(correlation(points));
  const modelId = DM_QUESTION.expectedModel || chooseBestModel(candidates, 'rmse').id;
  const model = candidates.find((c) => c.id === modelId);
  const predictionY = String(Math.round(model.predict(DM_QUESTION.predictionX) * 100) / 100);
  const rightType = predictionKind(points, DM_QUESTION.predictionX);
  const wrongType = rightType === 'interpolation' ? 'extrapolation' : 'interpolation';
  // The work object exactly as the lab builds it (DataModelingLab.jsx `work`).
  const work = (predictionType) => ({
    m: slope.value, b: intercept.value,
    r: '', direction: descriptor.direction, strength: descriptor.strength, causation: 'association',
    modelChoice: modelId, predictionX: DM_QUESTION.predictionX, predictionY, predictionType,
    ...OWN_CHOICES,
  });
  return {
    points, slope, intercept, descriptor, modelId, modelIndex: candidates.findIndex((c) => c.id === modelId),
    modelLabel: model.label, predictionY, rightType, wrongType, work,
    expected: [wrongType, rightType].map((type) => gradeToolCheck(dataModelingGrader, DM_QUESTION, work(type)).isCorrect),
  };
};

/** Everything the lab shows as the student's state, read from the page. */
const labState = (page) => page.evaluate(() => {
  const root = document.querySelector('[data-kb-root]');
  const fieldOf = (el) => (el.closest('label')?.childNodes[0]?.textContent || '').trim();
  const scroller = root.querySelector('[role="region"][aria-label="Residual table"]');
  return {
    steppers: [...root.querySelectorAll('[role="group"][aria-label] output')].map((o) => `${o.closest('[role="group"]').getAttribute('aria-label')}=${o.textContent.trim()}`),
    selects: [...root.querySelectorAll('select')].map((s) => `${fieldOf(s)}=${s.value}`),
    radio: [...root.querySelectorAll('input[type="radio"]')].map((r) => r.checked),
    numbers: [...root.querySelectorAll('input[type="number"]')].map((i) => `${fieldOf(i)}=${i.value}`),
    residualRows: scroller ? [...scroller.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent.trim()).join('|')) : null,
  };
});

const selectByKeys = async (page, field, value) => {
  await tabTo(page, (i) => i.tag === 'SELECT' && i.fieldLabel === field, `select "${field}"`);
  const { index, current } = await page.evaluate((v) => {
    const el = document.activeElement;
    return { index: [...el.options].findIndex((o) => o.value === v), current: el.selectedIndex };
  }, value);
  if (index < 0) throw new Error(`select "${field}" has no option ${value}`);
  const key = index >= current ? 'ArrowDown' : 'ArrowUp';
  for (let i = 0; i < Math.abs(index - current); i += 1) await page.keyboard.press(key);
};

const dataModelingKeyboard = async (viewport, plan, at) => {
  const { page, context, errors } = await openPage(viewport, 'dataModelingLab', null, 'button:has-text("Check data model")');
  await startAtSentinel(page);
  const snapshots = {};

  // Steppers, by Enter on the + / − buttons.
  const stepper = async (label, { count, direction }) => {
    const name = `${direction > 0 ? 'Increase' : 'Decrease'} ${label}`;
    await tabTo(page, (i) => i.tag === 'BUTTON' && i.name === name, name);
    for (let i = 0; i < count; i += 1) await page.keyboard.press('Enter');
  };
  await stepper('Slope m', plan.slope);
  await stepper('Intercept b', plan.intercept);
  await selectByKeys(page, 'Direction', plan.descriptor.direction);
  await selectByKeys(page, 'Strength', plan.descriptor.strength);
  await selectByKeys(page, 'What can this observational data justify?', 'association');

  // T6: the residual scroller is the next stop, named, ringed, scrollable.
  const region = await tabTo(page, (i) => i.role === 'region' || i.tag === 'INPUT', 'the residual table region', { max: 3 });
  check(region.role === 'region' && region.name === 'Residual table', `${at}: the stop after the association panel is the "Residual table" region (got ${region.tag} role=${region.role} name="${region.name}")`);
  const named = page.getByRole('region', { name: 'Residual table', exact: true });
  check(await named.count() === 1, `${at}: exactly one region named "Residual table" in the accessibility tree`);
  check(await named.evaluate((el) => el === document.activeElement).catch(() => false), `${at}: the named region is what has keyboard focus`);
  check(hasRing(region) && region.focusVisible, `${at}: the focused residual region shows a ring (${region.outlineStyle} ${region.outlineWidth}px, focus-visible=${region.focusVisible})`);
  const before = await labState(page);
  const scroll0 = await named.evaluate((el) => ({ top: el.scrollTop, overflow: el.scrollHeight - el.clientHeight }));
  check(scroll0.overflow > 0, `${at}: the residual table overflows its box (${scroll0.overflow}px), so it needs to scroll`);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const scroll1 = await named.evaluate((el) => el.scrollTop);
  check(scroll1 > scroll0.top, `${at}: ArrowDown on the focused region scrolls it (${scroll0.top} -> ${scroll1})`);
  check((await focusInfo(page))?.role === 'region', `${at}: focus stays on the region while it scrolls`);
  const after = await labState(page);
  assert.ok(before.residualRows?.length, 'residual rows on screen');
  check(JSON.stringify(before) === JSON.stringify(after), `${at}: scrolling the residual table by keys changes no recorded state`);
  // The table on screen is the question this driver grades (x | y columns).
  const shownPoints = before.residualRows.map((row) => row.split('|').slice(0, 2).map(Number));
  check(JSON.stringify(shownPoints) === JSON.stringify(plan.points), `${at}: residual table x/y are the driver's question points ${JSON.stringify(shownPoints)}`);

  // Model family: a radio group — Space checks the first, arrows move.
  await tabTo(page, (i) => i.type === 'radio', 'the model-family radio group');
  await page.keyboard.press('Space');
  for (let i = 0; i < plan.modelIndex; i += 1) await page.keyboard.press('ArrowDown');
  // Prediction y, typed.
  await tabTo(page, (i) => i.type === 'number' && i.fieldLabel === 'Predicted y', 'Predicted y');
  await page.keyboard.type(plan.predictionY);
  await selectByKeys(page, 'This prediction is...', plan.wrongType);
  snapshots.wrong = await labState(page);
  await tabTo(page, (i) => i.tag === 'BUTTON' && i.name === 'Check data model', 'Check data model');
  await page.keyboard.press('Enter');
  const first = await waitForGrades(page, 1);
  // Back to the prediction type, by Shift+Tab, and fix it.
  await tabTo(page, (i) => i.tag === 'SELECT' && i.fieldLabel === 'This prediction is...', 'prediction type (back)', { back: true });
  const { index, current } = await page.evaluate((v) => ({ index: [...document.activeElement.options].findIndex((o) => o.value === v), current: document.activeElement.selectedIndex }), plan.rightType);
  for (let i = 0; i < Math.abs(index - current); i += 1) await page.keyboard.press(index > current ? 'ArrowDown' : 'ArrowUp');
  snapshots.right = await labState(page);
  await tabTo(page, (i) => i.tag === 'BUTTON' && i.name === 'Check data model', 'Check data model (again)');
  await page.keyboard.press('Enter');
  const both = await waitForGrades(page, 2);
  check(first.length === 1, `${at}: the first keyboard Check reached onGrade (${first.length} grade records)`);
  check(both.length === 2, `${at}: the second keyboard Check reached onGrade (${both.length} grade records)`);
  check(JSON.stringify(both) === JSON.stringify(plan.expected), `${at}: keyboard verdicts ${JSON.stringify(both)} equal the shared grader's ${JSON.stringify(plan.expected)} on the work the keys produced`);
  // The keys reached the planned state.
  const radioLabel = await page.evaluate(() => [...document.querySelectorAll('[data-kb-root] input[type="radio"]')].find((r) => r.checked)?.closest('label')?.querySelector('strong')?.textContent);
  check(radioLabel === plan.modelLabel, `${at}: the radio the keys checked is "${plan.modelLabel}" (got "${radioLabel}")`);
  check(snapshots.right.selects.includes(`Direction=${plan.descriptor.direction}`) && snapshots.right.selects.includes(`Strength=${plan.descriptor.strength}`), `${at}: the selects hold what the keys chose ${JSON.stringify(snapshots.right.selects)}`);
  check(snapshots.right.numbers.includes(`Predicted y=${plan.predictionY}`), `${at}: the typed prediction is held (${JSON.stringify(snapshots.right.numbers)})`);
  check(errors.length === 0, `${at}: no page errors on the keyboard route (${errors.join(' | ')})`);
  await context.close();
  return { snapshots, verdicts: both };
};

const dataModelingPointer = async (viewport, plan, at) => {
  const { page, context, errors } = await openPage(viewport, 'dataModelingLab', null, 'button:has-text("Check data model")');
  const snapshots = {};
  const press = async (label, { count, direction }) => {
    const button = page.getByRole('button', { name: `${direction > 0 ? 'Increase' : 'Decrease'} ${label}`, exact: true });
    for (let i = 0; i < count; i += 1) await button.click();
  };
  await press('Slope m', plan.slope);
  await press('Intercept b', plan.intercept);
  const select = (field) => page.locator('[data-kb-root] label', { hasText: field }).locator('select');
  await select('Direction').selectOption(plan.descriptor.direction);
  await select('Strength').selectOption(plan.descriptor.strength);
  await select('What can this observational data justify?').selectOption('association');
  // A wheel over the residual table: the pointer counterpart of the arrow keys.
  const region = page.getByRole('region', { name: 'Residual table', exact: true });
  await region.hover();
  await page.mouse.wheel(0, 60);
  await page.locator('[data-kb-root] input[type="radio"]').nth(plan.modelIndex).click();
  const predicted = page.locator('[data-kb-root] label', { hasText: 'Predicted y' }).locator('input');
  await predicted.click();
  await page.keyboard.type(plan.predictionY);
  await select('This prediction is...').selectOption(plan.wrongType);
  snapshots.wrong = await labState(page);
  await page.getByRole('button', { name: 'Check data model', exact: true }).click();
  await waitForGrades(page, 1);
  await select('This prediction is...').selectOption(plan.rightType);
  snapshots.right = await labState(page);
  await page.getByRole('button', { name: 'Check data model', exact: true }).click();
  const verdicts = await waitForGrades(page, 2);
  check(errors.length === 0, `${at}: no page errors on the pointer route (${errors.join(' | ')})`);
  await context.close();
  return { snapshots, verdicts };
};

/* -------------------------------------------- Systems Workspace CSS (T8) */

const ALGEBRAIC = { mode: undefined, prompt: 'Solve the system algebraically.', studentActions: ['solveSystem'], equations: ['2x + y = 7', 'x - y = -1'], variables: ['x', 'y'], requireVerification: true };
// One equation already isolated, so "Use this expression" makes the token and
// the variable drops appear without a Step Algebra solve first.
const ALGEBRAIC_ISOLATED = { ...ALGEBRAIC, equations: ['y = 2x + 1', '3x + y = 11'] };
const INEQUALITY = { mode: 'inequalities', prompt: 'Graph the system y ≥ x + 1 and y < −0.5x + 6. Then classify the solution region.', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }], studentBuild: { boundary: true, lineStyle: true, shading: true }, reasoning: { classifyRegion: true }, graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 } };

const containerFocus = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { focused: document.activeElement === el, outlineStyle: cs.outlineStyle, outlineWidth: Number.parseFloat(cs.outlineWidth) || 0, focusVisible: el.matches(':focus-visible') };
}, selector);

/** A mouse press on a non-control spot inside `selector` (padding, text). */
const clickInside = async (page, selector) => {
  const point = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.scrollIntoView({ block: 'center' });
    const box = el.getBoundingClientRect();
    const interactive = 'button, a, input, select, textarea, math-field, [role="button"], [tabindex]:not([tabindex="-1"])';
    for (let fy = 0.02; fy < 1; fy += 0.04) {
      for (let fx = 0.98; fx > 0; fx -= 0.04) {
        const x = box.left + box.width * fx; const y = box.top + box.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && el.contains(hit) && !hit.closest(interactive)) return { x, y };
      }
    }
    return null;
  }, selector);
  if (!point) throw new Error(`no plain spot to click inside ${selector}`);
  await page.mouse.click(point.x, point.y);
};

const SOLVER = '.mathmaster-systems-embedded-step-algebra';
const HEADING = '.mm-ineq-step-heading[data-step-heading="current"]';

const algebraicContainer = async (viewport, at) => {
  // Keyboard: Substitution -> Isolate x in Equation 1 by Enter. The solver
  // opens and takes focus programmatically; after a key press that focus is
  // :focus-visible and must show (the old `:focus { outline: none }` hid it).
  {
    const { page, context } = await openPage(viewport, 'systemsWorkspace', ALGEBRAIC, 'button:has-text("Substitution")');
    await startAtSentinel(page);
    await tabTo(page, (i) => i.name === 'Substitution', 'Substitution');
    await page.keyboard.press('Enter');
    await tabTo(page, (i) => i.name === 'Isolate x in Equation 1', 'Isolate x in Equation 1');
    await page.keyboard.press('Enter');
    await page.locator(SOLVER).waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    const keyed = await containerFocus(page, SOLVER);
    check(keyed?.focused, `${at}: keyboard Isolate moves focus to the embedded solver`);
    check(keyed?.focusVisible && keyed.outlineStyle !== 'none' && keyed.outlineWidth > 0, `${at}: after a KEY press the solver's programmatic focus shows a ring (${JSON.stringify(keyed)})`);
    // Mouse press elsewhere, then on the container itself: no ring.
    await clickInside(page, '.mathmaster-question-stage .mathmaster-algebraic-system-workflow, .mathmaster-question-stage');
    await clickInside(page, SOLVER);
    const clicked = await containerFocus(page, SOLVER);
    check(clicked?.focused, `${at}: a mouse press inside the solver focuses its tabIndex=-1 host`);
    check(clicked && clicked.outlineStyle === 'none' && !clicked.focusVisible, `${at}: a mouse press on the solver host draws no ring (${JSON.stringify(clicked)})`);
    await context.close();
  }
  // Pointer: the same two presses by mouse. The programmatic focus that
  // follows must not draw a ring.
  {
    const { page, context } = await openPage(viewport, 'systemsWorkspace', ALGEBRAIC, 'button:has-text("Substitution")');
    await page.getByRole('button', { name: 'Substitution', exact: true }).click();
    await page.getByRole('button', { name: 'Isolate x in Equation 1', exact: true }).click();
    await page.locator(SOLVER).waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    const pointed = await containerFocus(page, SOLVER);
    check(pointed?.focused, `${at}: mouse Isolate moves focus to the embedded solver`);
    check(pointed && pointed.outlineStyle === 'none' && !pointed.focusVisible, `${at}: after a MOUSE press the solver's programmatic focus draws no ring (${JSON.stringify(pointed)})`);
    await context.close();
  }
};

const algebraicNativeControls = async (viewport, at) => {
  // Substitution variable drops (AlgebraicSystemMode.css :170-175).
  {
    const { page, context, errors } = await openPage(viewport, 'systemsWorkspace', ALGEBRAIC_ISOLATED, 'button:has-text("Substitution")');
    await startAtSentinel(page);
    await tabTo(page, (i) => i.name === 'Substitution', 'Substitution');
    await page.keyboard.press('Enter');
    await tabTo(page, (i) => i.name === 'Isolate y in Equation 1', 'Isolate y in Equation 1');
    await page.keyboard.press('Enter');
    await tabTo(page, (i) => i.name === 'Use this expression', 'Use this expression');
    await page.keyboard.press('Enter');
    const drop = await tabTo(page, (i) => i.className.includes('mathmaster-systems-variable-drop'), 'a variable drop');
    check(hasRing(drop) && drop.focusVisible && drop.outlineWidth >= 2, `${at}: Tab onto a substitution variable drop shows the ring (${drop.outlineStyle} ${drop.outlineWidth}px)`);
    // Arm the token by keys, then Tab onto the drops again: armed drops keep the ring.
    await tabTo(page, (i) => i.className.includes('mathmaster-systems-substitution-token'), 'the substitution token', { back: true });
    await page.keyboard.press('Enter');
    const armed = await tabTo(page, (i) => i.className.includes('mathmaster-systems-variable-drop'), 'a variable drop (armed)');
    check(armed.className.includes('is-armed') && hasRing(armed) && armed.outlineWidth >= 2, `${at}: an ARMED variable drop shows the ring on Tab (${armed.className}; ${armed.outlineStyle} ${armed.outlineWidth}px)`);
    // The keys complete the substitution: the token is y's expression (from
    // Equation 1), so it goes on y in Equation 2.
    await tabTo(page, (i) => i.inEquation2 && i.variable === 'y', 'y in Equation 2', { max: 12 });
    await page.keyboard.press('Enter');
    await page.locator(SOLVER).waitFor({ timeout: 15000 }).catch(() => {});
    const solving = await page.evaluate((sel) => document.querySelector(sel)?.querySelector('.algebra-embedded-heading')?.textContent || '', SOLVER);
    check(/solve for x/i.test(solving), `${at}: the keyboard drop recorded the substitution and opened the one-variable solve ("${solving}")`);
    check(errors.length === 0, `${at}: no page errors on the substitution route (${errors.join(' | ')})`);
    await context.close();
  }
  // Elimination + / − rail (AlgebraicSystemMode.css :478-483).
  {
    const { page, context } = await openPage(viewport, 'systemsWorkspace', ALGEBRAIC, 'button:has-text("Elimination")');
    await startAtSentinel(page);
    await tabTo(page, (i) => i.name === 'Elimination', 'Elimination');
    await page.keyboard.press('Enter');
    await tabTo(page, (i) => i.name === 'Eliminate y', 'Eliminate y');
    await page.keyboard.press('Enter');
    const add = await tabTo(page, (i) => i.name === 'Add Equation 2 to Equation 1', 'the + rail button');
    check(hasRing(add) && add.focusVisible && add.outlineWidth >= 2, `${at}: Tab onto the elimination + button shows the ring (${add.outlineStyle} ${add.outlineWidth}px)`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const pressed = await page.getByRole('button', { name: 'Add Equation 2 to Equation 1', exact: true }).getAttribute('aria-pressed').catch(() => null);
    const after = await focusInfo(page);
    if (after?.name === 'Add Equation 2 to Equation 1') {
      check(pressed === 'true' && hasRing(after), `${at}: the SELECTED + button keeps its ring (${after.outlineStyle} ${after.outlineWidth}px, aria-pressed=${pressed})`);
    } else {
      // The rail moved on once chosen; the next stop is still ringed.
      check(hasRing(after) || after?.tag === 'BODY', `${at}: after choosing +, focus is on a ringed control (${JSON.stringify(after)})`);
    }
    await context.close();
  }
};

const inequality = async (viewport, at) => {
  const plotByKeys = async (page) => {
    // y = x + 1 through (0, 1) and (1, 2): the crosshair starts at the origin.
    await tabTo(page, (i) => i.tag === 'svg' && /Student-constructed graph/.test(i.name), 'the inequality graph');
    for (const key of ['ArrowUp', 'Enter', 'ArrowRight', 'ArrowUp', 'Enter']) await page.keyboard.press(key);
    await page.waitForTimeout(300);
  };
  // Keyboard: Check boundary by Enter -> the next step's heading takes focus
  // and, after a key press, shows a ring.
  {
    const { page, context, errors } = await openPage(viewport, 'systemsWorkspace', INEQUALITY, 'svg[aria-label^="Student-constructed graph"]');
    await startAtSentinel(page);
    await plotByKeys(page);
    await tabTo(page, (i) => i.name === 'Check boundary', 'Check boundary');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const keyed = await containerFocus(page, HEADING);
    const headingText = await page.locator(HEADING).first().textContent().catch(() => '');
    check(/Step 2 of 3/.test(headingText), `${at}: the keyboard-plotted boundary passed its Check and opened step 2 ("${headingText}")`);
    check(keyed?.focused, `${at}: the step heading takes focus after a keyboard Check`);
    check(keyed?.focusVisible && keyed.outlineStyle !== 'none' && keyed.outlineWidth > 0, `${at}: after a KEY press the heading's programmatic focus shows a ring (${JSON.stringify(keyed)})`);
    // A mouse press on the heading: no ring.
    await clickInside(page, '.mathmaster-question-stage');
    await page.locator(HEADING).first().click();
    const clicked = await containerFocus(page, HEADING);
    check(clicked?.focused && clicked.outlineStyle === 'none' && !clicked.focusVisible, `${at}: a mouse press on the step heading draws no ring (${JSON.stringify(clicked)})`);
    // Graded by keys: "Check my work".
    await startAtSentinel(page);
    await tabTo(page, (i) => i.name === 'Check my work', 'Check my work');
    await page.keyboard.press('Enter');
    const graded = await waitForGrades(page, 1);
    check(graded.length >= 1, `${at}: "Check my work" by Enter reached onGrade (${graded.length} grade records)`);
    check(errors.length === 0, `${at}: no page errors on the inequality route (${errors.join(' | ')})`);
    await context.close();
  }
  // Pointer: the same boundary, Check boundary by mouse -> heading focus, no ring.
  {
    const { page, context } = await openPage(viewport, 'systemsWorkspace', INEQUALITY, 'svg[aria-label^="Student-constructed graph"]');
    await startAtSentinel(page);
    await plotByKeys(page);
    await page.getByRole('button', { name: 'Check boundary', exact: true }).click();
    await page.waitForTimeout(500);
    const pointed = await containerFocus(page, HEADING);
    check(pointed?.focused, `${at}: the step heading takes focus after a mouse Check`);
    check(pointed && pointed.outlineStyle === 'none' && !pointed.focusVisible, `${at}: after a MOUSE press the heading's programmatic focus draws no ring (${JSON.stringify(pointed)})`);
    await context.close();
  }
};

/* --------------------------------------------------------------------- run */

const plan = planDataModeling();
// The plan must be able to tell a wrong Check from a right one, or the
// verdict comparison below proves nothing.
assert.deepEqual(plan.expected, [false, true], `shared grader on the planned work: ${JSON.stringify(plan.expected)}`);

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const at = `${viewport.width}x${viewport.height}`;
  console.log(`\n== ${at}`);
  const steps = [
    ['dataModelingLab', async () => {
      const keys = await dataModelingKeyboard(viewport, plan, at);
      const pointer = await dataModelingPointer(viewport, plan, at);
      check(JSON.stringify(keys.snapshots.wrong) === JSON.stringify(pointer.snapshots.wrong), `${at}: keyboard and pointer reach the same state before the first Check\n keys    ${JSON.stringify(keys.snapshots.wrong)}\n pointer ${JSON.stringify(pointer.snapshots.wrong)}`);
      check(JSON.stringify(keys.snapshots.right) === JSON.stringify(pointer.snapshots.right), `${at}: keyboard and pointer reach the same state before the second Check`);
      check(JSON.stringify(keys.verdicts) === JSON.stringify(pointer.verdicts), `${at}: keyboard verdicts ${JSON.stringify(keys.verdicts)} == pointer verdicts ${JSON.stringify(pointer.verdicts)}`);
    }],
    ['systemsWorkspace:algebraic (container)', () => algebraicContainer(viewport, at)],
    ['systemsWorkspace:algebraic (native controls)', () => algebraicNativeControls(viewport, at)],
    ['systemsWorkspace:inequalities-build', () => inequality(viewport, at)],
  ];
  for (const [name, run] of steps) {
    const before = failures.length;
    try { await run(); } catch (error) { check(false, `${at} ${name}: ${String(error?.message || error).split('\n')[0]}`); }
    console.log(`${failures.length === before ? 'ok  ' : 'FAIL'} ${name}`);
  }
}

await browser.close();
console.log(`\n${passes} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => ` - ${f}`).join('\n'));
  process.exit(1);
}
