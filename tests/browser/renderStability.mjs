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
//
// A loop shows as hundreds of commits in a window where nothing happened.
// Exits non-zero on any failure.

import { balancedMove, settle, visibleEquation } from './stepAlgebraDriver.mjs';

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

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} render-stability failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nrender stability: every scene settles and keeps its work.');
