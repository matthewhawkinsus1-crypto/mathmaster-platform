// RENDER STABILITY: NOTHING RE-RENDERS WHILE NOBODY IS DOING ANYTHING, AND A
// HOST RE-RENDER NEVER TAKES A STUDENT'S WORK AWAY.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/renderStability.mjs
//
// The real QuestionEngine, mounted the ways its hosts mount it, counted by a
// React Profiler (renderStabilityMain.jsx). Each scene is one of the loops the
// platform audit found:
//
//   serverGradedInlineHost   the Live Challenge round passes inline server
//                            grading and stores every response it is handed;
//                            QuestionEngine re-published on every host render
//   systemWithoutEquations   `[]` fallback rebuilt per render -> report effect
//   multiAnswerWithoutFields `= []` default rebuilt per render -> report effect
//   graphWithoutSpec         `|| {}` fallbacks rebuilt per render -> memo chain
//   composedAlgebraStage     the balance-workspace step of a composed question
//                            was handed a new question object on every render
//                            and reset itself: a host re-render erased the
//                            student's work
//   supportChangeStepAlgebra a support-plan revision saved while the student
//   supportChangeRelation    works generates the question again with new
//                            presentation; on a question opened with no draft
//                            the workspace reset itself: the operation picked,
//                            the number being typed and the step on the board
//                            were gone (TL16). An edited equation still starts
//                            afresh.
//
// A loop shows as hundreds of commits in a window where nothing happened.
// Exits non-zero on any failure.

import { balancedMove, chooseOperation, settle, visibleEquation } from './stepAlgebraDriver.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const IDLE_WINDOW_MS = Number(process.env.IDLE_WINDOW_MS || 1500);
const IDLE_COMMIT_LIMIT = 3;

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const failures = [];

const openScene = async (sceneId) => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/renderStability.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__mmScene === 'function');
  await page.evaluate((id) => window.__mmScene(id), sceneId);
  await page.waitForSelector(`[data-render-scene="${sceneId}"]`);
  await settle(page, 900);
  return { page, consoleErrors };
};

const idleCommits = async (page) => {
  await page.evaluate(() => { window.__mmCommits = 0; window.__mmHostRenders = 0; });
  await page.waitForTimeout(IDLE_WINDOW_MS);
  return page.evaluate(() => ({ commits: window.__mmCommits, hostRenders: window.__mmHostRenders }));
};

const loopErrors = (errors) => errors.filter((text) => /Maximum update depth|Too many re-renders|rendered (more|fewer) hooks/i.test(text));

for (const sceneId of ['serverGradedInlineHost', 'systemWithoutEquations', 'multiAnswerWithoutFields', 'graphWithoutSpec']) {
  const { page, consoleErrors } = await openScene(sceneId);
  const idle = await idleCommits(page);
  // One host re-render (the clock, a snapshot) must cost a bounded number of
  // commits, not start a loop.
  await page.evaluate(() => { window.__mmCommits = 0; window.__mmTick(); });
  await page.waitForTimeout(IDLE_WINDOW_MS);
  const afterTick = await page.evaluate(() => window.__mmCommits);
  const loops = loopErrors(consoleErrors);
  const ok = idle.commits <= IDLE_COMMIT_LIMIT && afterTick <= IDLE_COMMIT_LIMIT + 2 && loops.length === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${sceneId.padEnd(26)} idle commits ${String(idle.commits).padStart(5)}  host renders ${String(idle.hostRenders).padStart(5)}  after one host re-render ${String(afterTick).padStart(5)}${loops.length ? `  ${loops[0].slice(0, 90)}` : ''}`);
  if (!ok) failures.push(`${sceneId}: idle ${idle.commits} commits / ${idle.hostRenders} host renders, ${afterTick} after one tick${loops.length ? `, ${loops[0].slice(0, 160)}` : ''}`);
  await page.close();
}

{
  const sceneId = 'composedAlgebraStage';
  const { page, consoleErrors } = await openScene(sceneId);
  const host = page.locator(`[data-render-scene="${sceneId}"]`);
  const before = await visibleEquation(host);
  await balancedMove(page, host, 'Subtract', '3');
  await settle(page, 600);
  const afterMove = await visibleEquation(host);
  await page.evaluate(() => window.__mmTick());
  await settle(page, 600);
  const afterHostRender = await visibleEquation(host);
  const idle = await idleCommits(page);
  const moved = JSON.stringify(afterMove) !== JSON.stringify(before);
  const kept = JSON.stringify(afterHostRender) === JSON.stringify(afterMove);
  const loops = loopErrors(consoleErrors);
  const ok = moved && kept && idle.commits <= IDLE_COMMIT_LIMIT && loops.length === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${sceneId.padEnd(26)} before ${JSON.stringify(before)} -> after move ${JSON.stringify(afterMove)} -> after host re-render ${JSON.stringify(afterHostRender)}; idle commits ${idle.commits}`);
  if (!moved) failures.push(`${sceneId}: the subtract-3 move did not change the equation (${JSON.stringify(afterMove)})`);
  if (!kept) failures.push(`${sceneId}: a host re-render erased the student's step (${JSON.stringify(afterMove)} -> ${JSON.stringify(afterHostRender)})`);
  if (idle.commits > IDLE_COMMIT_LIMIT) failures.push(`${sceneId}: ${idle.commits} idle commits`);
  if (loops.length) failures.push(`${sceneId}: ${loops[0].slice(0, 160)}`);
  await page.close();
}

// A SUPPORT-PLAN REVISION IS NOT A NEW QUESTION (TL16). The student picks an
// operation and types its number with the keyboard, as in class; the teacher
// saves a revision (large text) meanwhile. The number, and then a step placed
// on the board, must survive it. An edited equation is a different problem,
// and the board starts afresh on it.
const fieldValue = (page, selector) => page.evaluate((css) => document.querySelector(css)?.value ?? null, selector);
const check = (ok, sceneId, label, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${sceneId.padEnd(26)} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${sceneId}: ${label}${detail ? ` (${detail})` : ''}`);
};
{
  const sceneId = 'supportChangeStepAlgebra';
  const operand = '.algebra-operation-composer math-field';
  const { page, consoleErrors } = await openScene(sceneId);
  const host = page.locator(`[data-render-scene="${sceneId}"]`);
  const before = await visibleEquation(host);
  await chooseOperation(page, host, 'Add');
  await page.keyboard.type('7', { delay: 30 });
  await settle(page, 300);
  const typed = await fieldValue(page, operand);
  await page.evaluate(() => window.__mmSupport(['large-text']));
  await settle(page, 600);
  const kept = await fieldValue(page, operand);
  check(typed === '7' && kept === '7', sceneId, 'the number being typed survives a support-plan revision', `${JSON.stringify(typed)} -> ${JSON.stringify(kept)}`);
  // Placed on the board (picked again first, should the revision have lost it).
  if (kept !== '7') {
    await chooseOperation(page, host, 'Add');
    await page.keyboard.type('7', { delay: 30 });
    await settle(page, 300);
  }
  await host.locator('button.algebra-pickup-button').click();
  await host.locator('[aria-label$="on the left side"]').first().click();
  await settle(page, 250);
  await host.locator('[aria-label$="on the right side"]').first().click();
  await settle(page, 500);
  const afterMove = await visibleEquation(host);
  await page.evaluate(() => window.__mmSupport([]));
  await settle(page, 600);
  const afterRevision = await visibleEquation(host);
  const moved = JSON.stringify(afterMove) !== JSON.stringify(before);
  check(moved && JSON.stringify(afterRevision) === JSON.stringify(afterMove), sceneId, 'so does the step on the board', `${JSON.stringify(before)} -> ${JSON.stringify(afterMove)} -> ${JSON.stringify(afterRevision)}`);
  await page.evaluate(() => window.__mmEditEquation('5x - 2 = 13'));
  await settle(page, 600);
  const afterEdit = await visibleEquation(host);
  check(/5 x/.test(afterEdit[0] || '') && !/7/.test(afterEdit.join(' ')), sceneId, 'an edited equation is a new problem: the board starts afresh', JSON.stringify(afterEdit));
  const loops = loopErrors(consoleErrors);
  check(!loops.length, sceneId, 'no render loop', loops[0]?.slice(0, 160));
  await page.close();
}
{
  const sceneId = 'supportChangeRelation';
  const operand = '[data-render-scene] math-field[aria-label="subtract value"]';
  const { page, consoleErrors } = await openScene(sceneId);
  const host = page.locator(`[data-render-scene="${sceneId}"]`);
  await host.getByRole('button', { name: /Subtract/ }).first().click();
  await settle(page, 150);
  await page.keyboard.type('3', { delay: 30 });
  await settle(page, 300);
  const typed = await fieldValue(page, operand);
  await page.evaluate(() => window.__mmSupport(['large-text']));
  await settle(page, 600);
  const kept = await fieldValue(page, operand);
  check(typed === '3' && kept === '3', sceneId, 'the number being typed survives a support-plan revision', `${JSON.stringify(typed)} -> ${JSON.stringify(kept)}`);
  const loops = loopErrors(consoleErrors);
  check(!loops.length, sceneId, 'no render loop', loops[0]?.slice(0, 160));
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} render-stability failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nrender stability: every scene settles and keeps its work.');
